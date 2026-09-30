#!/usr/bin/env python3
"""
Jev を「妥当性確認」役として使えるか評価する（分業設計の検証）。

既存 jev-validity-eval.py からの変更点:
  1. 単一の曖昧な質問ではなく、02-check-validity.sh の確認観点に対応した
     複数の具体的 noul 質問を 1 コールに束ねる（Jev は questions を複数取れる）。
  2. ラベルを現行ルール（2026-08-20 の選択肢括弧ルール追加）以降に限定し
     ラベルノイズを除去する。
  3. positive の「どの種類の欠陥か」を changes のフィールドから導出し、
     質問ごとの検出力を個別に測る（＝どのチェックをJevに任せられるか判る）。

使い方:
  python3 jev_eval2.py -n 60
  python3 jev_eval2.py -n 60 --output /tmp/jev_eval2_result.json
"""

import argparse, json, os, random, re, sys, time
import urllib.request
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

DUMP = os.environ.get("QUESTIONS_DUMP", "/tmp/questions_full.json")
DOMAINS_JSON = "/home/yuzuki/aws-quiz-app/src/data/examDomains.json"
ENDPOINT = "https://jevtypesafeai.com/api/v1/decide"
MODEL = "jev-latest"
CUTOFF = "2026-08-20"   # 選択肢括弧ルールが入ったコミット e5b3630 の日付

# ── Jev に投げる質問群（02 の確認観点に対応） ───────────────────────────
QUESTIONS = {
    "hint_leak": (
        "Do any of the ANSWER CHOICES contain a parenthetical gloss that leaks a hint — "
        "an abbreviation expansion (e.g. '(Time to Live)', '(DLQ)') or a definition/"
        "explanatory phrase describing what the term means? "
        "Choices should contain the bare term only; any explanatory parenthetical in a "
        "choice is a defect. Well-known AWS abbreviations like S3, VPC, EC2 are exempt, "
        "and a parenthetical that is part of an official product name is not a defect."
    ),
    "answer_wrong": (
        "Is the stated correct answer actually wrong? That is, based on real AWS service "
        "behaviour, is the marked correct answer factually incorrect, or is some other "
        "choice clearly more correct than the marked one?"
    ),
    "factual_error": (
        "Does the question text, explanation, or per-choice explanation contain a factual "
        "error about AWS service specifications — wrong service name for the described "
        "capability, a capability the service does not have, wrong limits/SLA/retention "
        "numbers, or a service treated as deprecated when it is current (or vice versa)?"
    ),
    "ce_misaligned": (
        "Are the per-choice explanations misaligned with the choices? That is, is any "
        "per-choice explanation describing a DIFFERENT choice than the one it is paired "
        "with (swapped or shifted ordering), or does any per-choice explanation contain "
        "leftover placeholder text or an unfinished sentence fragment?"
    ),
    "domain_wrong": (
        "Is the assigned exam domain wrong for this question? Judge whether the question's "
        "actual subject matter belongs to the domain it is labelled with, given the list of "
        "valid domains for this certification shown in the input."
    ),
    "any_issue": (
        "Does this AWS certification exam question have any validity issue that a human "
        "reviewer would flag as needing a fix or deletion?"
    ),
}

parser = argparse.ArgumentParser()
parser.add_argument("-n", "--samples", type=int, default=60)
parser.add_argument("-e", "--exam", default="")
parser.add_argument("--seed", type=int, default=42)
parser.add_argument("--output", default="")
parser.add_argument("--workers", type=int, default=6)
parser.add_argument("--dry-run", action="store_true")
args = parser.parse_args()
random.seed(args.seed)


def get_api_key() -> str:
    p = Path.home() / ".claude" / ".credentials.json"
    if p.exists():
        d = json.loads(p.read_text())
        k = (d.get("pluginSecrets", {}).get("jev-skills@jev-skills", {}) or {}).get("typesafe_api_key", "")
        if k:
            return k
    k = os.environ.get("TYPESAFE_API_KEY", "")
    if k:
        return k
    sys.exit("APIキーが見つかりません")


def deser(v):
    if "S" in v: return v["S"]
    if "N" in v: return int(v["N"]) if "." not in v["N"] else float(v["N"])
    if "BOOL" in v: return v["BOOL"]
    if "NULL" in v: return None
    if "L" in v: return [deser(i) for i in v["L"]]
    if "M" in v: return {k: deser(x) for k, x in v["M"].items()}
    return None


EXAM_DOMAINS = {k: [d["ja"] for d in v] for k, v in json.load(open(DOMAINS_JSON)).items()}


def load_questions():
    data = json.load(open(DUMP))
    qs = [{k: deser(v) for k, v in it.items()} for it in data["Items"]]
    return [q for q in qs if not q.get("isHidden")]


def edit_log(q):
    l = q.get("validityEditLog")
    if not l:
        return None
    try:
        return json.loads(l) if isinstance(l, str) else l
    except Exception:
        return None


def restore_before(q, lg):
    """changes.*.before で修正前（=欠陥あり）の状態へ戻す。"""
    out = dict(q)
    for field, diff in (lg.get("changes") or {}).items():
        if isinstance(diff, dict) and "before" in diff:
            out[field] = diff["before"]
    return out


def question_to_text(q):
    exam = q.get("examType", "?")
    doms = EXAM_DOMAINS.get(exam, [])
    parts = [f"Certification: {exam}"]
    if doms:
        parts.append("Valid domains for this certification:")
        for i, d in enumerate(doms):
            parts.append(f"  {i}. {d}")
    parts.append(f"\nQuestion:\n{q.get('questionText','')}")
    choices = q.get("choices") or []
    labels = "ABCDEFG"
    if choices:
        parts.append("\nChoices:")
        for i, c in enumerate(choices):
            parts.append(f"  {labels[i] if i < len(labels) else i}. {c}")
    correct = q.get("correctAnswers") or []
    if correct:
        parts.append("\nMarked correct answer(s):")
        for c in correct:
            parts.append(f"  - {c}")
    parts.append(f"isMultiple flag: {bool(q.get('isMultiple'))}")
    exp = q.get("explanation") or ""
    if exp:
        parts.append(f"\nExplanation:\n{exp}")
    ce = q.get("choiceExplanations") or []
    if ce:
        parts.append("\nPer-choice explanations (paired by index with the choices above):")
        for i, e in enumerate(ce):
            ch = choices[i] if i < len(choices) else "(no matching choice)"
            parts.append(f"  [{i}] choice: {ch}")
            parts.append(f"      explanation: {e}")
    else:
        parts.append("\nPer-choice explanations: NONE (missing)")
    d = q.get("domain")
    if isinstance(d, int):
        name = doms[d] if 0 <= d < len(doms) else "(out of range)"
        parts.append(f"\nAssigned domain: {d}. {name}")
    else:
        parts.append(f"\nAssigned domain: (not set)  tags={q.get('tags')}")
    return "\n".join(parts)


def call_jev(api_key, text):
    payload = {"state": text, "model": MODEL,
               "questions": {k: {"type": "noul", "instructions": v} for k, v in QUESTIONS.items()}}
    req = urllib.request.Request(
        ENDPOINT, data=json.dumps(payload).encode(),
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        method="POST")
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=90) as r:
                d = json.loads(r.read())
            probs = {k: d.get("answers", {}).get(k, {}).get("noul") for k in QUESTIONS}
            return probs, d.get("usage", {})
        except Exception as e:
            if attempt == 2:
                return None, {"error": str(e)[:120]}
            time.sleep(2 * (attempt + 1))
    return None, {}


# ── 欠陥カテゴリの導出（changes のフィールド → 期待される検出質問） ─────
def defect_kinds(lg):
    ch = set((lg.get("changes") or {}).keys())
    kinds = set()
    if "choices" in ch:
        kinds.add("choices")
    if "choiceExplanations" in ch:
        kinds.add("choiceExplanations")
    if "domain" in ch:
        kinds.add("domain")
    if "explanation" in ch:
        kinds.add("explanation")
    return kinds


def metrics(labels, probs, thr):
    tp = fp = tn = fn = 0
    for l, p in zip(labels, probs):
        pred = 1 if p >= thr else 0
        if pred and l: tp += 1
        elif pred and not l: fp += 1
        elif not pred and not l: tn += 1
        else: fn += 1
    prec = tp / (tp + fp) if tp + fp else 0.0
    rec = tp / (tp + fn) if tp + fn else 0.0
    f1 = 2 * prec * rec / (prec + rec) if prec + rec else 0.0
    return dict(threshold=thr, tp=tp, fp=fp, tn=tn, fn=fn, precision=prec, recall=rec, f1=f1)


def main():
    qs = load_questions()
    if args.exam:
        qs = [q for q in qs if q.get("examType") == args.exam.upper()]

    pos, neg = [], []
    for q in qs:
        if (q.get("validityCheckedAt") or "") < CUTOFF:
            continue
        lg = edit_log(q)
        if lg and (lg.get("checkedAt") or "") >= CUTOFF and (lg.get("changes") or {}):
            pos.append((q, lg))
        elif not lg or (lg.get("checkedAt") or "") < CUTOFF:
            neg.append(q)

    n = min(args.samples, len(pos), len(neg))
    print(f"母集団: positive {len(pos)}件 / negative {len(neg)}件 → 各 {n}件を抽出")
    pos_s = random.sample(pos, n)
    neg_s = random.sample(neg, n)

    items = []
    for q, lg in pos_s:
        items.append(dict(q=restore_before(q, lg), label=1, kinds=defect_kinds(lg),
                          qid=q["questionId"], exam=q.get("examType"),
                          reason=(lg.get("reason") or "")[:120]))
    for q in neg_s:
        items.append(dict(q=q, label=0, kinds=set(), qid=q["questionId"],
                          exam=q.get("examType"), reason=""))

    if args.dry_run:
        print("\n--- positive 3件のプロンプト先頭 ---")
        for it in items[:2]:
            print("=" * 50)
            print(f"{it['qid']} kinds={it['kinds']} reason={it['reason']}")
            print(question_to_text(it["q"])[:900])
        return

    api_key = get_api_key()
    print(f"Jev 呼び出し開始（{len(items)}件・{len(QUESTIONS)}質問/コール・並列{args.workers}）\n")

    def work(it):
        probs, usage = call_jev(api_key, question_to_text(it["q"]))
        return it, probs, usage

    results, usages, errors = [], [], 0
    t0 = time.time()
    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        for i, (it, probs, usage) in enumerate(ex.map(work, items), 1):
            if probs is None or any(v is None for v in probs.values()):
                errors += 1
                print(f"  [{i}/{len(items)}] ❌ {it['qid']} {usage.get('error','')}")
                continue
            usages.append(usage)
            results.append(dict(qid=it["qid"], exam=it["exam"], label=it["label"],
                                kinds=sorted(it["kinds"]), reason=it["reason"], probs=probs))
            if i % 20 == 0:
                print(f"  [{i}/{len(items)}] ... {time.time()-t0:.0f}秒経過")

    print(f"\n完了: {len(results)}件成功 / {errors}件エラー / {time.time()-t0:.0f}秒")
    if not results:
        return

    cost = sum(u.get("cost_usd", 0) for u in usages)
    itok = sum(u.get("input_tokens", 0) for u in usages)
    otok = sum(u.get("output_tokens", 0) for u in usages)
    rem = usages[-1].get("credits_remaining_usd")
    print(f"トークン: in={itok:,} out={otok:,}  コスト=${cost:.4f} "
          f"(1問あたり ${cost/len(results):.5f})  残高=${rem:.4f}")

    # ── 質問ごとの分離度と最良F1 ──
    print("\n" + "=" * 78)
    print(f"{'質問':<16}{'pos平均':>8}{'neg平均':>8}{'分離':>8}{'最良F1':>8}{'閾値':>7}{'P':>7}{'R':>7}")
    print("-" * 78)
    THR = [i / 20 for i in range(1, 20)]
    per_q = {}
    for qk in QUESTIONS:
        labels = [r["label"] for r in results]
        probs = [r["probs"][qk] for r in results]
        mp = sum(p for p, l in zip(probs, labels) if l) / max(1, sum(labels))
        mn = sum(p for p, l in zip(probs, labels) if not l) / max(1, len(labels) - sum(labels))
        best = max((metrics(labels, probs, t) for t in THR), key=lambda m: m["f1"])
        per_q[qk] = dict(mean_pos=mp, mean_neg=mn, sep=mp - mn, best=best)
        print(f"{qk:<16}{mp:>8.3f}{mn:>8.3f}{mp-mn:>+8.3f}"
              f"{best['f1']:>8.3f}{best['threshold']:>7.2f}{best['precision']:>7.3f}{best['recall']:>7.3f}")
    print("=" * 78)

    # ── max-any（どれか1つでも閾値超え）＝ゲート運用の想定 ──
    print("\n--- ゲート運用想定: 専門質問のOR（hint_leak/answer_wrong/factual_error/ce_misaligned/domain_wrong の最大値）---")
    spec = [k for k in QUESTIONS if k != "any_issue"]
    labels = [r["label"] for r in results]
    mx = [max(r["probs"][k] for k in spec) for r in results]
    print(f"{'閾値':>6}{'P':>8}{'R':>8}{'F1':>8}{'TP':>5}{'FP':>5}{'FN':>5}{'TN':>5}{'Claudeへ送る率':>14}")
    or_rows = []
    for t in [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]:
        m = metrics(labels, mx, t)
        sent = (m["tp"] + m["fp"]) / len(results)
        or_rows.append(dict(m, sent_ratio=sent))
        print(f"{t:>6.2f}{m['precision']:>8.3f}{m['recall']:>8.3f}{m['f1']:>8.3f}"
              f"{m['tp']:>5}{m['fp']:>5}{m['fn']:>5}{m['tn']:>5}{sent*100:>13.1f}%")

    # ── 欠陥カテゴリ別の検出力（対応する質問が反応したか） ──
    print("\n--- 欠陥カテゴリ別: 対応質問の pos平均確率（その欠陥を持つ問題のみ）---")
    kind_to_q = {"choices": "hint_leak", "choiceExplanations": "ce_misaligned",
                 "domain": "domain_wrong", "explanation": "factual_error"}
    print(f"{'欠陥カテゴリ':<20}{'件数':>6}{'対応質問':<16}{'その質問の平均':>14}{'neg平均':>9}{'any_issue平均':>14}")
    kind_rows = {}
    for kind, qk in kind_to_q.items():
        sub = [r for r in results if r["label"] == 1 and kind in r["kinds"]]
        if not sub:
            continue
        m = sum(r["probs"][qk] for r in sub) / len(sub)
        ma = sum(r["probs"]["any_issue"] for r in sub) / len(sub)
        negm = per_q[qk]["mean_neg"]
        kind_rows[kind] = dict(n=len(sub), q=qk, mean=m, neg=negm, any_mean=ma)
        print(f"{kind:<20}{len(sub):>6}{qk:<16}{m:>14.3f}{negm:>9.3f}{ma:>14.3f}")

    out = dict(n_pos=n, n_neg=n, n_results=len(results), errors=errors,
               cost_usd=round(cost, 5), input_tokens=itok, output_tokens=otok,
               credits_remaining=rem, per_question=per_q, or_gate=or_rows,
               per_defect_kind=kind_rows, details=results)
    if args.output:
        Path(args.output).write_text(json.dumps(out, ensure_ascii=False, indent=2, default=str))
        print(f"\n詳細: {args.output}")


if __name__ == "__main__":
    main()
