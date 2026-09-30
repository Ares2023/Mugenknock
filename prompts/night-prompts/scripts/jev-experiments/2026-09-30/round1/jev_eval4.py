#!/usr/bin/env python3
"""
最終追試: Jev 公式実装の作法に合わせて意味的チェックを再評価する。

これまでとの違い（src/jev/questions.ts の fullQuestion に倣う）:
  1. state を平文ブロブではなく「名前付きキーの構造体」で渡す
  2. instructions を散文ではなく構造化オブジェクトにし、question から
     state のキーを `backtick` で参照する
  3. criteria {true, false} を明示する

対象は最も重要かつ従来スコアが低かった意味的チェック:
  answer_wrong  (従来 AUC 0.446 = ランダム以下)
  factual_error (従来 AUC 0.729)
"""
import json, random, sys, time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

DUMP = "/tmp/questions_full.json"
DOMAINS_JSON = "/home/yuzuki/aws-quiz-app/src/data/examDomains.json"
ENDPOINT = "https://jevtypesafeai.com/api/v1/decide"
MODEL = "jev-latest"
CUTOFF = "2026-08-20"
N = int(sys.argv[1]) if len(sys.argv) > 1 else 45

EXAM_DOMAINS = {k: [d["ja"] for d in v] for k, v in json.load(open(DOMAINS_JSON)).items()}


def deser(v):
    if "S" in v: return v["S"]
    if "N" in v: return int(v["N"]) if "." not in v["N"] else float(v["N"])
    if "BOOL" in v: return v["BOOL"]
    if "NULL" in v: return None
    if "L" in v: return [deser(i) for i in v["L"]]
    if "M" in v: return {k: deser(x) for k, x in v["M"].items()}
    return None


def api_key():
    d = json.loads((Path.home() / ".claude" / ".credentials.json").read_text())
    return d["pluginSecrets"]["jev-skills@jev-skills"]["typesafe_api_key"]


def log_of(q):
    l = q.get("validityEditLog")
    if not l: return None
    try: return json.loads(l) if isinstance(l, str) else l
    except Exception: return None


def restore(q, lg):
    o = dict(q)
    for f, d in (lg.get("changes") or {}).items():
        if isinstance(d, dict) and "before" in d:
            o[f] = d["before"]
    return o


# ── 構造化 state（公式作法: 名前付きキー） ──────────────────────────────
def build_state(q):
    choices = [str(c) for c in (q.get("choices") or [])]
    correct = [str(c) for c in (q.get("correctAnswers") or [])]
    ce = [str(c) for c in (q.get("choiceExplanations") or [])]
    return {
        "certification": q.get("examType", ""),
        "question_text": q.get("questionText", ""),
        "choices": choices,
        "marked_correct_answers": correct,
        "explanation": q.get("explanation", ""),
        "per_choice_explanations": ce,
    }


# ── 構造化 instructions + criteria（公式作法） ──────────────────────────
QUESTIONS = {
    # 正解そのものが誤っているか
    "answer_wrong": {
        "type": "noul",
        "instructions": {
            "role": "You are auditing an AWS certification practice question for correctness.",
            "question": (
                "Given `question_text` and `choices`, is `marked_correct_answers` the wrong "
                "answer? Work out the correct answer yourself from real AWS service "
                "behaviour first, then compare it to `marked_correct_answers`."
            ),
            "scope": "Judge only whether the marked answer is right or wrong. Ignore wording, formatting and style.",
        },
        "criteria": {
            "true": "The marked correct answer is wrong, or another choice is clearly more correct than the marked one.",
            "false": "The marked correct answer is the best of the available choices.",
        },
    },
    # 事実誤り（解説を含む）
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
    # 対照: 従来と同じ hint_leak を構造化作法で（作法の効果を測る基準線）
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


def call_jev(key, state):
    payload = {"state": state, "model": MODEL, "questions": QUESTIONS}
    req = urllib.request.Request(ENDPOINT, data=json.dumps(payload).encode(),
                                 headers={"Authorization": f"Bearer {key}",
                                          "Content-Type": "application/json"}, method="POST")
    for a in range(3):
        try:
            with urllib.request.urlopen(req, timeout=90) as r:
                d = json.loads(r.read())
            return {k: d["answers"][k]["noul"] for k in QUESTIONS}, d.get("usage", {})
        except Exception as e:
            if a == 2:
                return None, {"error": str(e)[:120]}
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


def main():
    random.seed(23)
    data = json.load(open(DUMP))
    qs = [{k: deser(v) for k, v in it.items()} for it in data["Items"]]
    qs = [q for q in qs if not q.get("isHidden")]

    # positive を「意味的欠陥」に限定する:
    #   explanation か choices が直された かつ ドメイン補完だけではないもの
    pos, neg = [], []
    for q in qs:
        if (q.get("validityCheckedAt") or "") < CUTOFF:
            continue
        lg = log_of(q)
        ch = (lg or {}).get("changes") or {}
        if lg and (lg.get("checkedAt") or "") >= CUTOFF and ch:
            if "explanation" in ch or "correctAnswers" in ch:
                pos.append((q, lg))
        elif not lg or (lg.get("checkedAt") or "") < CUTOFF:
            neg.append(q)

    n = min(N, len(pos), len(neg))
    print(f"母集団: 意味的欠陥(explanation/correctAnswers変更) {len(pos)}件 / ok {len(neg)}件 → 各{n}件")
    items = [dict(q=restore(q, lg), label=1, qid=q["questionId"],
                  reason=(lg.get("reason") or "")[:110]) for q, lg in random.sample(pos, n)]
    items += [dict(q=q, label=0, qid=q["questionId"], reason="") for q in random.sample(neg, n)]

    key = api_key()
    t0 = time.time()
    out, usages, err = [], [], 0
    with ThreadPoolExecutor(max_workers=6) as ex:
        for it, probs, usage in ex.map(lambda i: (i, *call_jev(key, build_state(i["q"]))), items):
            if probs is None:
                err += 1
                continue
            usages.append(usage)
            out.append(dict(qid=it["qid"], label=it["label"], reason=it["reason"], probs=probs))
    print(f"完了 {len(out)}件 / エラー{err}件 / {time.time()-t0:.0f}秒")
    cost = sum(u.get("cost_usd", 0) for u in usages)
    print(f"コスト ${cost:.4f}  残高 ${usages[-1].get('credits_remaining_usd', 0):.4f}\n")

    labels = [r["label"] for r in out]
    BASE = {"answer_wrong": 0.446, "factual_error": 0.729, "hint_leak": 0.886}
    print("=" * 72)
    print(f"{'質問':<16}{'AUC(構造化)':>12}{'旧AUC':>9}{'変化':>9}{'pos平均':>9}{'neg平均':>9}")
    print("-" * 72)
    for qk in QUESTIONS:
        probs = [r["probs"][qk] for r in out]
        A = auc(labels, probs)
        mp = sum(p for p, l in zip(probs, labels) if l) / max(1, sum(labels))
        mn = sum(p for p, l in zip(probs, labels) if not l) / max(1, len(labels) - sum(labels))
        b = BASE[qk]
        print(f"{qk:<16}{A:>12.3f}{b:>9.3f}{A-b:>+9.3f}{mp:>9.3f}{mn:>9.3f}")
    print("=" * 72)
    print("※ hint_leak は作法の効果を測る基準線（同じ項目を構造化して比較）")
    print("※ 旧AUCは前回の全positive混在での測定値。母集団が異なるため厳密比較ではなく傾向の目安")

    Path("/tmp/jev_eval4.json").write_text(json.dumps(
        dict(n=n, cost=cost, details=out), ensure_ascii=False, indent=2))


main()
