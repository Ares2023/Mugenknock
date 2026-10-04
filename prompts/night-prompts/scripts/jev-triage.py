#!/usr/bin/env python3
"""
Jev で問題を「欠陥がありそうな順」にスコアリングする（02-check-validity.sh のトリアージ）。

役割はゲートではなく優先順位付け。02 のスループットはトークン律速で全問は回せないため、
限られた Claude 枠を欠陥密度の高い問題に集中させる。スコアが低い問題も選定プールに残り
続けるので、取り逃しても後日のバッチで処理される（＝recall 不足が品質リスクにならない）。

呼び出し側（02-check-validity.sh）が未確認問題を常に先に処理するため、このスクリプトに
渡ってくるのは「確認済みで再チェック待ち」の問題だけ。並べ替えの最終キーは呼び出し側が
決める（スコアのバンド降順 → 同一バンド内は確認日の古い順）。

実測コスト: 1問あたり $0.0003 前後（1質問・選択肢のみ）。

注意: **Jev のスコアは非決定的**で、同一入力3回で最大 0.13 のばらつきを実測している。
優先順位付けが目的なので実害はないが、閾値で合否を決める用途には使えない。
（ただし複数回呼んで平均しても精度は上がらない。実測 ΔAUC -0.005。ボトルネックはノイズではない）

入出力:
  stdin  : 問題の JSON 配列（DynamoDB からデシリアライズ済み）
  stdout : {"questionId": {"score": 0-1, "hint_leak": 0-1}, ...}
           score は並べ替えに使う。hint_leak は Claude のプロンプトへ渡す。

**失敗しても必ず exit 0 で `{}` または部分結果を返す。** 呼び出し側は空なら元の順序
（validityCheckedAt の古い順）を維持する。検証ゲートを Jev の可用性に依存させない。

使い方:
  echo "$QUESTIONS_JSON" | python3 jev-triage.py
  echo "$QUESTIONS_JSON" | python3 jev-triage.py --workers 8 --timeout 120

採用している質問は hint_leak（選択肢への略語展開・定義説明の混入）の1つだけ。
2026-09-30 の改良で「hint_leak + factual_error を1コールで全 state」から、
「hint_leak のみ・選択肢だけを state に渡す」へ変更した。根拠（domain補完の正例を除外、
探索 188件 と、事前に候補を固定して測った未見 186件をプール。positive 174 / negative 200）:

  現行 max(hint,fact)・全state   AUC 0.776
  hint_leak のみ・選択肢のみ     AUC 0.819   差 +0.043 [95%CI +0.011, +0.075]  P=0.995
  費用 $0.00076/問 → $0.00028/問（63%減）

  探索・未見の両方で同じ +0.042 が出ており再現している。
  差の正体は「質問を分離して state を絞ると希釈されない」こと。factual_error を外しても
  失うものはない（同 state 内の hint 成分のみで 0.777 ≒ 合成 0.776）。

意図的に採用しなかったもの（実測で効かない、または再現しなかった）:
  factual_error   AUC 0.64   弱く、hint_leak に足しても改善しない（max で 0.795 < 0.803）
  answer_wrong    AUC 0.47   正解の当否は Jev には判定できない
  any_issue       AUC 0.43   「何か問題があるか」という曖昧な質問は機能しない
  domain_wrong    domain 未設定の検出でしかない。真の誤分類には一致率85%・誤検出 P=0.286
  abbr_unexpanded 探索 0.68 → 未見 0.54。事後選択で見えた偽の改善で再現しなかった
  few-shot 例 / choice タイプ / 複数回平均 / 決定的特徴との学習合成:
                  いずれも単独コールの hint_leak を有意に上回らなかった
"""

import argparse, json, os, sys, time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ENDPOINT = os.environ.get("JEV_ENDPOINT", "https://jevtypesafeai.com/api/v1/decide")
# CLAUDE.md の「モデルは明示指定する」方針に合わせ、暗黙の既定に依存しない。
MODEL = os.environ.get("JEV_MODEL", "jev-latest")

QUESTIONS = {
    "hint_leak": {
        "type": "noul",
        "instructions": {
            "role": "You are auditing the answer choices of an AWS certification practice question.",
            "question": (
                "Does any entry of `choices` contain a parenthetical that leaks a hint — an "
                "abbreviation expansion or a phrase defining what the term means?"
            ),
            "not_a_defect": (
                "A concrete technical quantity such as '(12 shards)' or '(12 hours/day)'; a "
                "reference marker such as '(requirement 1)'; part of an official product name; "
                "a well-known abbreviation such as S3, VPC or EC2."
            ),
        },
        "criteria": {
            "true": "At least one choice carries an explanatory or abbreviation-expanding parenthetical.",
            "false": "Every choice is the bare term or action, with no explanatory parenthetical.",
        },
    },
}


def log(msg):
    sys.stderr.write(f"{msg}\n")
    sys.stderr.flush()


def get_api_key():
    p = Path.home() / ".claude" / ".credentials.json"
    if p.exists():
        try:
            d = json.loads(p.read_text())
            k = (d.get("pluginSecrets", {}).get("jev-skills@jev-skills", {}) or {}).get("typesafe_api_key", "")
            if k:
                return k
        except Exception:
            pass
    return os.environ.get("TYPESAFE_API_KEY", "") or os.environ.get("JEV_API_KEY", "")


def build_state(q):
    """質問が見る情報だけを渡す。問題文・解説まで渡すと hint_leak が希釈され AUC が下がる
    （選択肢のみ 0.819 / 全 state 0.777）。名前付きキーの構造体にするのは Jev 公式実装の作法。"""
    return {"choices": [str(c) for c in (q.get("choices") or [])]}


def call_jev(api_key, state, timeout):
    payload = {"state": state, "model": MODEL, "questions": QUESTIONS}
    req = urllib.request.Request(
        ENDPOINT, data=json.dumps(payload).encode(),
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        method="POST")
    last = ""
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                d = json.loads(r.read())
            answers = d.get("answers", {})
            probs = {}
            for k in QUESTIONS:
                v = (answers.get(k) or {}).get("noul")
                if v is None:
                    return None, None, f"{k} の回答が欠落"
                probs[k] = float(v)
            return probs, d.get("usage", {}), None
        except Exception as e:
            last = str(e)[:150]
            if attempt < 2:
                time.sleep(2 * (attempt + 1))
    return None, None, last


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--workers", type=int, default=int(os.environ.get("JEV_TRIAGE_WORKERS", 6)))
    # 正常時は1問3〜4秒で返る。あくまで任意の最適化なので、障害時に夜間の
    # 実行枠を食い潰さないよう短く切る（切れても古い順で検証は続行する）。
    ap.add_argument("--timeout", type=int, default=int(os.environ.get("JEV_TRIAGE_TIMEOUT", 30)),
                    help="1リクエストのタイムアウト秒 (default: 30)")
    ap.add_argument("--budget", type=int, default=int(os.environ.get("JEV_TRIAGE_BUDGET", 120)),
                    help="全体の打ち切り秒。超えたら得られた分だけ返す (default: 120)")
    args = ap.parse_args()

    # 入力が壊れていても落ちない（落ちると検証自体が止まるため）
    try:
        raw = sys.stdin.read()
        questions = json.loads(raw) if raw.strip() else []
    except Exception as e:
        log(f"⚠️  Jevトリアージ: 入力パース失敗（元の順序を維持）: {e}")
        print("{}")
        return

    questions = [q for q in questions if isinstance(q, dict) and q.get("questionId")]
    if not questions:
        print("{}")
        return

    api_key = get_api_key()
    if not api_key:
        log("⚠️  Jevトリアージ: APIキー未設定のためスキップ（元の順序を維持）")
        print("{}")
        return

    t0 = time.time()
    scores, usages, errors = {}, [], []

    def work(q):
        if time.time() - t0 > args.budget:
            return q["questionId"], None, None, "予算超過"
        probs, usage, err = call_jev(api_key, build_state(q), args.timeout)
        return q["questionId"], probs, usage, err

    try:
        with ThreadPoolExecutor(max_workers=max(1, args.workers)) as ex:
            for qid, probs, usage, err in ex.map(work, questions):
                if probs is None:
                    errors.append(f"{qid}: {err}")
                    continue
                scores[qid] = {"score": probs["hint_leak"],
                               "hint_leak": round(probs["hint_leak"], 3)}
                if usage:
                    usages.append(usage)
    except Exception as e:
        log(f"⚠️  Jevトリアージ: 実行中に例外（得られた分のみ使用）: {e}")

    elapsed = time.time() - t0
    cost = sum(u.get("cost_usd", 0) for u in usages)
    rem = usages[-1].get("credits_remaining_usd") if usages else None
    msg = (f"Jevトリアージ: {len(scores)}/{len(questions)}問をスコア化 "
           f"({elapsed:.0f}秒・${cost:.4f}")
    if rem is not None:
        msg += f"・残高${rem:.2f}"
    log(msg + ")")
    if errors:
        log(f"  ⚠️  {len(errors)}件失敗: {errors[0]}" + (f" ほか{len(errors)-1}件" if len(errors) > 1 else ""))
    if rem is not None and rem < 1.0:
        log(f"  ⚠️  Jev残高が少なくなっています（${rem:.2f}）")

    print(json.dumps(scores))


if __name__ == "__main__":
    main()
