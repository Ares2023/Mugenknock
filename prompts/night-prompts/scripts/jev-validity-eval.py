#!/usr/bin/env python3
"""
Jev が妥当性チェックのどこまで使えるかを実測する評価ツール。

`jev-triage.py` が採用している質問と閾値の根拠を再現・再検証するためのもの。
Jev のモデル更新や検証プロンプトの改訂で有効性が変わり得るので、疑わしくなったら
これを回して数字を取り直す。

── 2026-09-30 の測定結果（ベースライン） ────────────────────────────────
質問ごとの AUC（現行ルール下のラベル。domain 補完の正例は除外。質問ごとに別コール・
必要な state だけを渡して測定）:

  hint_leak      0.82   選択肢への略語展開・定義説明の混入   → 採用（探索188件＋未見186件のプール）
  factual_error  0.64   解説の事実誤り                       → 不採用（hint_leak に足しても改善しない）
  ce_misaligned  0.55   選択肢別解説のズレ                   → 不採用
  answer_wrong   0.47   正解の当否                           → 不採用（ランダム同等。n=45 の旧測定）
  any_issue      0.43   「何か問題があるか」                  → 不採用（ランダム以下。n=45 の旧測定）
  domain_wrong   ―     下記の落とし穴を参照                  → 不採用

  triage は hint_leak 単独（選択肢のみ・1質問）。未見データで 0.833、費用 $0.0003/問。
  n=45 の AUC は 95%CI が ±0.1 あり、差を語れない。比較は必ず CI つきで見ること。

落とし穴（同じ轍を踏まないための記録）:
  1. 曖昧な単一質問（any_issue）は AUC 0.43 でランダム以下。質問は必ず
     「何をどう見るか」まで具体的に書き、criteria で true/false の意味を示す。
  2. domain 補完の正例が評価を歪める。domain 修正の大半は `None → int`（未設定の補完）で、
     本番のプールにはもう存在しない欠陥種。Jev には domain が見えず不当に低く出る一方、
     決定的特徴には自明で不当に高く出る（domain_wrong は当初 AUC 1.000 のラベルリーク）。
     既定で除外する（--include-domain-fill で戻せる）。
  3. 質問を1コールに詰める・不要な state を渡すと希釈される（hint_leak: 選択肢のみ 0.819 /
     2質問・全 state 0.776、差 +0.043 [+0.011, +0.075]）。本ツールは質問ごとに別コール・
     必要な state のみで測る。（初期に見た「6質問詰め込みで 0.57」は n=20 の値で誤差が大きく、過大だった）
  4. 質問ごとの AUC を「全 positive」に対して測ると別種の欠陥で希釈されて低く出る。
     欠陥カテゴリ別（その質問が担当する欠陥のみ）でも測ること。
  5. negative は現行ルール確定後（CUTOFF 以降）に ok 判定されたものに限る。
     選択肢括弧ルールは 2026-08-20（コミット e5b3630）に入ったため、それ以前の
     「ok」は現行ルールでは要修正でありラベルノイズになる。
  6. 事後に多数の候補を見て選ぶと、選択バイアスで偽の改善が見える（abbr は探索 0.68 →
     未見 0.54）。改良案は事前に1つに固定し、未見データで現行と比較する。

使い方:
  python3 jev-validity-eval.py --dump /tmp/questions_full.json          # 全質問を評価
  python3 jev-validity-eval.py --mode hint -n 45                       # 単一観点を深掘り
  python3 jev-validity-eval.py --compare-regex                         # 正規表現との対決
  python3 jev-validity-eval.py --dry-run                               # 投入内容の確認のみ

問題ダンプは1回取っておいて使い回す（毎回スキャンすると遅い・RCU も食う）:
  /home/yuzuki/local/bin/aws dynamodb scan --table-name Questions \
    --output json > /tmp/questions_full.json
"""

import argparse, json, os, random, re, sys, time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

DEFAULT_DUMP = "/tmp/questions_full.json"
DOMAINS_JSON = os.environ.get(
    "EXAM_DOMAINS_JSON_PATH",
    str(Path(__file__).resolve().parents[3] / "src" / "data" / "examDomains.json"))
ENDPOINT = os.environ.get("JEV_ENDPOINT", "https://jevtypesafeai.com/api/v1/decide")
MODEL = os.environ.get("JEV_MODEL", "jev-latest")

# 選択肢括弧ルールが入った日（コミット e5b3630）。これ以降のラベルだけを使う。
CUTOFF = "2026-08-20"

# 2026-09-30 実測のベースライン。回帰に気づけるよう並べて表示する。
BASELINE_AUC = {
    "hint_leak": 0.819, "factual_error": 0.644, "ce_misaligned": 0.547,
    "domain_wrong": None, "answer_wrong": 0.473, "any_issue": 0.425,
}

# 質問ごとに必要な state のキー。全部渡すと希釈されて精度が落ちる（jev-triage.py と同じ方針）。
STATE_KEYS = {
    "hint_leak": ["choices"],
    "factual_error": ["question_text", "choices", "marked_correct_answers", "explanation", "per_choice_explanations"],
    "ce_misaligned": ["question_text", "choices", "per_choice_explanations"],
    "answer_wrong": ["question_text", "choices", "marked_correct_answers"],
    "domain_wrong": ["certification", "question_text", "choices", "valid_domains", "assigned_domain"],
}


def state_for(qk, state):
    keys = STATE_KEYS.get(qk)
    return state if keys is None else {k: state[k] for k in keys if k in state}

# ── 質問定義（構造化 instructions + criteria = Jev 公式実装の作法） ──────
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
    "factual_error": {
        "type": "noul",
        "instructions": {
            "role": "You are auditing an AWS certification practice question for factual accuracy.",
            "question": (
                "Do `question_text`, `explanation` or `per_choice_explanations` state something "
                "factually untrue about AWS services?"
            ),
            "examples_of_true": (
                "Attributing a capability to a service that does not have it; naming the wrong "
                "service for a described capability; wrong quota, limit, SLA or retention value; "
                "describing a current service as deprecated or a removed feature as available; "
                "confusing two services (e.g. attributing EventBridge behaviour to CloudWatch)."
            ),
        },
        "criteria": {
            "true": "At least one concrete statement about AWS behaviour is factually incorrect.",
            "false": "All statements about AWS behaviour are accurate.",
        },
    },
    "ce_misaligned": {
        "type": "noul",
        "instructions": {
            "role": "You are auditing the per-choice explanations of an AWS certification question.",
            "question": (
                "Is any entry of `per_choice_explanations` wrong for the `choices` entry at the "
                "same index? They are paired by position."
            ),
            "examples_of_true": (
                "An explanation describing a different choice than the one at its index "
                "(swapped or shifted order); two choices sharing an identical generic "
                "explanation instead of choice-specific reasoning; leftover placeholder text; "
                "an unfinished sentence fragment; a count mismatch with `choices`."
            ),
        },
        "criteria": {
            "true": "At least one explanation does not correspond to the choice at its index.",
            "false": "Every explanation correctly explains the choice at its index.",
        },
    },
    "answer_wrong": {
        "type": "noul",
        "instructions": {
            "role": "You are auditing an AWS certification practice question for correctness.",
            "question": (
                "Given `question_text` and `choices`, is `marked_correct_answers` the wrong "
                "answer? Work out the correct answer yourself from real AWS service behaviour "
                "first, then compare it to `marked_correct_answers`."
            ),
            "scope": "Judge only whether the marked answer is right or wrong. Ignore wording and style.",
        },
        "criteria": {
            "true": "The marked correct answer is wrong, or another choice is clearly more correct.",
            "false": "The marked correct answer is the best of the available choices.",
        },
    },
    "domain_wrong": {
        "type": "noul",
        "instructions": {
            "role": "You are auditing the domain classification of an AWS certification question.",
            "question": (
                "Is `assigned_domain` the wrong bucket for this question? Compare against "
                "`valid_domains` and judge by what the question primarily tests."
            ),
        },
        "criteria": {
            "true": "The question's subject matter belongs under a different entry of `valid_domains`.",
            "false": "`assigned_domain` is the best fit among `valid_domains`.",
        },
    },
    # 対照用。曖昧な質問が機能しないことを毎回確認できるよう残す。
    "any_issue": {
        "type": "noul",
        "instructions": {
            "question": (
                "Does this AWS certification exam question have any validity issue that a human "
                "reviewer would flag as needing a fix or deletion?"
            ),
        },
    },
}

MODE_KINDS = {"hint": "choices", "ce": "choiceExplanations",
              "domain": "domain", "factual": "explanation"}


def deser(v):
    if "S" in v: return v["S"]
    if "N" in v: return int(v["N"]) if "." not in v["N"] else float(v["N"])
    if "BOOL" in v: return v["BOOL"]
    if "NULL" in v: return None
    if "L" in v: return [deser(i) for i in v["L"]]
    if "M" in v: return {k: deser(x) for k, x in v["M"].items()}
    return None


def api_key():
    p = Path.home() / ".claude" / ".credentials.json"
    if p.exists():
        try:
            d = json.loads(p.read_text())
            k = (d.get("pluginSecrets", {}).get("jev-skills@jev-skills", {}) or {}).get("typesafe_api_key", "")
            if k:
                return k
        except Exception:
            pass
    k = os.environ.get("TYPESAFE_API_KEY", "") or os.environ.get("JEV_API_KEY", "")
    if k:
        return k
    sys.exit("❌ TypeSafe API キーが見つかりません（~/.claude/.credentials.json か TYPESAFE_API_KEY）")


def edit_log(q):
    l = q.get("validityEditLog")
    if not l: return None
    try: return json.loads(l) if isinstance(l, str) else l
    except Exception: return None


def restore_before(q, lg):
    """changes.*.before で修正前（＝欠陥がある状態）に戻す。"""
    o = dict(q)
    for f, d in (lg.get("changes") or {}).items():
        if isinstance(d, dict) and "before" in d:
            o[f] = d["before"]
    return o


def load_domains():
    try:
        return {k: [d["ja"] for d in v] for k, v in json.load(open(DOMAINS_JSON)).items()}
    except Exception as e:
        sys.stderr.write(f"⚠️  examDomains.json を読めません（domain_wrong は無意味になります）: {e}\n")
        return {}


EXAM_DOMAINS = load_domains()


def build_state(q):
    doms = EXAM_DOMAINS.get(q.get("examType", ""), [])
    d = q.get("domain")
    assigned = doms[d] if isinstance(d, int) and 0 <= d < len(doms) else "(not set)"
    return {
        "certification": q.get("examType", ""),
        "question_text": q.get("questionText", "") or "",
        "choices": [str(c) for c in (q.get("choices") or [])],
        "marked_correct_answers": [str(c) for c in (q.get("correctAnswers") or [])],
        "is_multiple_flag": bool(q.get("isMultiple")),
        "explanation": q.get("explanation", "") or "",
        "per_choice_explanations": [str(c) for c in (q.get("choiceExplanations") or [])],
        "valid_domains": doms,
        "assigned_domain": assigned,
    }


def call_jev(key, state, questions, timeout=60):
    payload = {"state": state, "model": MODEL, "questions": questions}
    req = urllib.request.Request(
        ENDPOINT, data=json.dumps(payload).encode(),
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        method="POST")
    for a in range(3):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                d = json.loads(r.read())
            return {k: d["answers"][k]["noul"] for k in questions}, d.get("usage", {}), None
        except Exception as e:
            if a == 2:
                return None, None, str(e)[:120]
            time.sleep(2 * (a + 1))


def auc(labels, scores):
    pos = [s for s, l in zip(scores, labels) if l == 1]
    neg = [s for s, l in zip(scores, labels) if l == 0]
    if not pos or not neg: return 0.5
    w = t = 0
    for p in pos:
        for n in neg:
            if p > n: w += 1
            elif p == n: t += 1
    return (w + 0.5 * t) / (len(pos) * len(neg))


def metrics(labels, probs, thr):
    tp = fp = tn = fn = 0
    for l, p in zip(labels, probs):
        pr = 1 if p >= thr else 0
        if pr and l: tp += 1
        elif pr and not l: fp += 1
        elif not pr and not l: tn += 1
        else: fn += 1
    P = tp / (tp + fp) if tp + fp else 0.0
    R = tp / (tp + fn) if tp + fn else 0.0
    F = 2 * P * R / (P + R) if P + R else 0.0
    return dict(threshold=thr, tp=tp, fp=fp, tn=tn, fn=fn, precision=P, recall=R, f1=F)


def boot_ci(labels, probs, B=800, seed=2):
    """AUC の 95% ブートストラップ信頼区間。n が小さいと ±0.1 になり、差を語れない。"""
    rnd = random.Random(seed); n = len(labels); v = []
    for _ in range(B):
        idx = [rnd.randrange(n) for _ in range(n)]
        ly = [labels[i] for i in idx]
        if 0 in ly and 1 in ly:
            v.append(auc(ly, [probs[i] for i in idx]))
    v.sort()
    return (v[int(len(v) * .025)], v[int(len(v) * .975)]) if v else (0.0, 1.0)


def naive_regex(q):
    """比較用: 選択肢に括弧補足があるか。検出はできるが修正はできない点に注意。"""
    return any(re.search(r'[（(][^）)]{2,}[）)]', str(c)) for c in (q.get("choices") or []))


def sample_population(qs, kind=None, include_domain_fill=False):
    """kind 指定時はその欠陥を持つものだけを positive にする。
    既定では domain 未設定の補完(None→int)を含む正例を除外する（落とし穴2）。"""
    pos, neg = [], []
    for q in qs:
        if (q.get("validityCheckedAt") or "") < CUTOFF:
            continue
        lg = edit_log(q)
        ch = (lg or {}).get("changes") or {}
        if lg and (lg.get("checkedAt") or "") >= CUTOFF and ch:
            fill = isinstance(ch.get("domain"), dict) and ch["domain"].get("before") is None
            if fill and not include_domain_fill and kind != "domain":
                continue
            if kind is None or kind in ch:
                pos.append((q, lg))
        elif not lg or (lg.get("checkedAt") or "") < CUTOFF:
            neg.append(q)
    return pos, neg


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dump", default=DEFAULT_DUMP, help=f"DynamoDB scan の JSON (default: {DEFAULT_DUMP})")
    ap.add_argument("-n", "--samples", type=int, default=45, help="positive/negative 各サンプル数")
    ap.add_argument("-e", "--exam", default="", help="examType で絞り込み")
    ap.add_argument("--mode", choices=sorted(MODE_KINDS), default="",
                    help="特定の欠陥種だけを positive にして深掘りする")
    ap.add_argument("--questions", default="", help="評価する質問をカンマ区切りで限定")
    ap.add_argument("--compare-regex", action="store_true", help="正規表現との性能比較も出す")
    ap.add_argument("--workers", type=int, default=6)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--include-domain-fill", action="store_true",
                    help="domain 未設定の補完を含む正例も使う（既定は除外。落とし穴2）")
    ap.add_argument("--dry-run", action="store_true", help="Jev を呼ばず投入内容だけ確認")
    ap.add_argument("--output", default="", help="詳細結果の JSON 出力先")
    args = ap.parse_args()
    random.seed(args.seed)

    if not os.path.exists(args.dump):
        sys.exit(f"❌ 問題ダンプがありません: {args.dump}\n"
                 f"   /home/yuzuki/local/bin/aws dynamodb scan --table-name Questions "
                 f"--output json > {args.dump}")

    data = json.load(open(args.dump))
    qs = [{k: deser(v) for k, v in it.items()} for it in data.get("Items", [])]
    qs = [q for q in qs if not q.get("isHidden")]
    if args.exam:
        qs = [q for q in qs if q.get("examType") == args.exam.upper()]

    active = ({k: QUESTIONS[k] for k in args.questions.split(",") if k in QUESTIONS}
              if args.questions else dict(QUESTIONS))
    if not active:
        sys.exit("❌ 有効な質問が選択されていません")

    kind = MODE_KINDS.get(args.mode) if args.mode else None
    pos, neg = sample_population(qs, kind, args.include_domain_fill)
    n = min(args.samples, len(pos), len(neg))
    print(f"母集団: positive{f'({kind})' if kind else ''} {len(pos)}件 / negative {len(neg)}件 → 各{n}件")
    if n == 0:
        sys.exit("❌ サンプルが不足しています")
    if kind == "domain":
        leak = sum(1 for _, lg in pos if (lg["changes"]["domain"].get("before") is None))
        print(f"  ⚠️  うち {leak}/{len(pos)} 件は domain 未設定の補完（ラベルリーク源）。"
              f"真の誤分類は {len(pos)-leak} 件のみ")

    items = [dict(q=restore_before(q, lg), label=1, qid=q["questionId"],
                  kinds=sorted((lg.get("changes") or {}).keys()),
                  reason=(lg.get("reason") or "")[:110])
             for q, lg in random.sample(pos, n)]
    items += [dict(q=q, label=0, qid=q["questionId"], kinds=[], reason="")
              for q in random.sample(neg, n)]

    if args.dry_run:
        print(f"\n（--dry-run: Jev は呼びません。質問={','.join(active)}）")
        for it in items[:2]:
            print("=" * 60)
            print(f"{it['qid']} label={it['label']} kinds={it['kinds']}\n理由: {it['reason']}")
            print(json.dumps(build_state(it["q"]), ensure_ascii=False, indent=2)[:1200])
        return

    key = api_key()
    print(f"Jev 呼び出し（{len(items)}件×{len(active)}質問・質問ごとに別コール・並列{args.workers}）\n")
    t0 = time.time()
    results, usages, errors = [], [], []

    def work(it):
        # 質問ごとに別コール・必要な state のみ（本番の jev-triage.py と同じ条件で測る）
        state = build_state(it["q"]); probs, costs, rem = {}, 0.0, None
        for qk, qdef in active.items():
            pr, us, err = call_jev(key, state_for(qk, state), {qk: qdef})
            if pr is None:
                return it, None, None, err
            probs.update(pr); costs += us.get("cost_usd", 0); rem = us.get("credits_remaining_usd", rem)
        return it, probs, {"cost_usd": costs, "credits_remaining_usd": rem}, None

    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        for it, probs, usage, err in ex.map(work, items):
            if probs is None:
                errors.append(f"{it['qid']}: {err}")
                continue
            usages.append(usage)
            results.append(dict(qid=it["qid"], label=it["label"], kinds=it["kinds"],
                                reason=it["reason"], probs=probs))
    print(f"完了 {len(results)}件 / エラー{len(errors)}件 / {time.time()-t0:.0f}秒")
    if errors:
        print(f"  ⚠️  {errors[0]}")
    if not results:
        sys.exit("❌ 結果が 0 件です")
    cost = sum(u.get("cost_usd", 0) for u in usages)
    rem = usages[-1].get("credits_remaining_usd")
    print(f"コスト ${cost:.4f}（1問 ${cost/len(results):.5f}）"
          + (f"  残高 ${rem:.4f}" if rem is not None else ""))

    labels = [r["label"] for r in results]

    print("\n" + "=" * 86)
    print(f"{'質問':<16}{'AUC':>7}{'95%CI':>16}{'基準値':>8}{'差':>8}{'pos平均':>9}{'neg平均':>9}{'最良F1':>8}")
    print("-" * 86)
    THR = [i / 20 for i in range(1, 20)]
    per_q = {}
    for qk in active:
        probs = [r["probs"][qk] for r in results]
        A = auc(labels, probs)
        mp = sum(p for p, l in zip(probs, labels) if l) / max(1, sum(labels))
        mn = sum(p for p, l in zip(probs, labels) if not l) / max(1, len(labels) - sum(labels))
        best = max((metrics(labels, probs, t) for t in THR), key=lambda m: m["f1"])
        per_q[qk] = dict(auc=A, mean_pos=mp, mean_neg=mn, best=best)
        base = BASELINE_AUC.get(qk)
        bs = f"{base:.3f}" if base is not None else "  ―  "
        ds = f"{A-base:+.3f}" if base is not None else "  ―  "
        lo, hi = boot_ci(labels, probs)
        print(f"{qk:<16}{A:>7.3f}{f'[{lo:.2f},{hi:.2f}]':>16}{bs:>8}{ds:>8}{mp:>9.3f}{mn:>9.3f}"
              f"{best['f1']:>8.3f}")
    print("=" * 86)
    print("※ 基準値は 2026-09-30 の測定。大きく下回ったら質問文か Jev モデルの変化を疑う")

    # triage が使う指標は hint_leak 単独（factual_error を足しても改善しなかった）
    if "hint_leak" in active:
        hl = [r["probs"]["hint_leak"] for r in results]
        lo, hi = boot_ci(labels, hl)
        print(f"\n★ triage の指標 hint_leak: AUC={auc(labels, hl):.3f} [{lo:.3f},{hi:.3f}]（基準 0.819）")
        print(f"{'閾値':>6}{'P':>8}{'R':>8}{'F1':>8}{'送信率':>9}")
        for t in (0.3, 0.4, 0.5, 0.6, 0.7):
            m = metrics(labels, hl, t)
            print(f"{t:>6.2f}{m['precision']:>8.3f}{m['recall']:>8.3f}{m['f1']:>8.3f}"
                  f"{(m['tp']+m['fp'])/len(results)*100:>8.1f}%")

    # 欠陥カテゴリ別（希釈を除いた本当の検出力）
    k2q = {"choices": "hint_leak", "choiceExplanations": "ce_misaligned",
           "domain": "domain_wrong", "explanation": "factual_error"}
    negs = [r for r in results if r["label"] == 0]
    rows = {k: v for k, v in k2q.items() if v in active}
    if rows and negs:
        print("\n--- 欠陥カテゴリ別 AUC（その欠陥を持つ positive のみ vs 全 negative）---")
        for knd, qk in rows.items():
            sub = [r for r in results if r["label"] == 1 and knd in r["kinds"]]
            if not sub: continue
            l = [1] * len(sub) + [0] * len(negs)
            s = [r["probs"][qk] for r in sub] + [r["probs"][qk] for r in negs]
            print(f"  {knd:<20} n={len(sub):<4} {qk:<16} AUC={auc(l, s):.3f}")

    if args.compare_regex:
        print("\n--- 正規表現との比較（同一サンプル）---")
        print(f"{'手法':<30}{'P':>8}{'R':>8}{'F1':>8}{'コスト':>10}")
        byid = {it["qid"]: it["q"] for it in items}
        rp = [1 if naive_regex(byid[r["qid"]]) else 0 for r in results]
        m = metrics(labels, rp, 1)
        print(f"{'正規表現（選択肢に括弧）':<30}{m['precision']:>8.3f}{m['recall']:>8.3f}"
              f"{m['f1']:>8.3f}{'0':>10}")
        if "hint_leak" in active:
            for t in (0.3, 0.5):
                m = metrics(labels, [r["probs"]["hint_leak"] for r in results], t)
                print(f"{f'Jev hint_leak (閾値{t})':<30}{m['precision']:>8.3f}{m['recall']:>8.3f}"
                      f"{m['f1']:>8.3f}{'$0.0003/問':>10}")
        print("※ 正規表現は検出はできるが修正はできない。実際の before→after を突き合わせると")
        print("   機械的な括弧除去の選択肢単位一致率は 72.6% で、機械適用すると半数超を壊す")
        print("   （'(12 shards)' 等は保持すべき / 定義文だけ削って括弧を残す例がある）")

    if args.output:
        Path(args.output).write_text(json.dumps(
            dict(n_per_group=n, exam=args.exam or "all", mode=args.mode or "all",
                 cost_usd=round(cost, 5), per_question=per_q, details=results),
            ensure_ascii=False, indent=2))
        print(f"\n詳細: {args.output}")


if __name__ == "__main__":
    main()
