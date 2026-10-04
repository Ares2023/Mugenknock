#!/usr/bin/env python3
"""
追試: カテゴリ別に n を増やし、state を絞って Jev の上限を測る。

  mode=domain : ドメイン誤り専用。state はドメイン判定に必要な情報のみ。
  mode=ce     : choiceExplanations のズレ専用。state は choices と対応解説のみ。
  mode=hint   : 選択肢の括弧ヒント漏れ専用。state は選択肢のみ。
"""
import argparse, json, os, random, re, sys, time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

DUMP = "/tmp/questions_full.json"
DOMAINS_JSON = "/home/yuzuki/aws-quiz-app/src/data/examDomains.json"
ENDPOINT = "https://jevtypesafeai.com/api/v1/decide"
MODEL = "jev-latest"
CUTOFF = "2026-08-20"

ap = argparse.ArgumentParser()
ap.add_argument("--mode", required=True, choices=["domain", "ce", "hint"])
ap.add_argument("-n", "--samples", type=int, default=40)
ap.add_argument("--workers", type=int, default=6)
ap.add_argument("--seed", type=int, default=7)
ap.add_argument("--output", default="")
args = ap.parse_args()
random.seed(args.seed)

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


# ── モードごとの質問と state ────────────────────────────────────────────
Q_DOMAIN = {"domain_wrong": (
    "Is the assigned domain wrong for this question? The question is labelled with one "
    "domain from the certification's official domain list. Decide whether the question's "
    "actual subject matter belongs under a DIFFERENT domain in that list than the one "
    "assigned. Answer yes only if the assigned domain is genuinely the wrong bucket."
)}
Q_CE = {"ce_misaligned": (
    "Each choice below is paired with the explanation that is currently attached to it. "
    "Is any pairing wrong? Answer yes if an explanation describes a different choice than "
    "the one it is paired with (swapped/shifted order), or if two choices share an "
    "identical generic explanation instead of choice-specific reasoning, or if an "
    "explanation contains placeholder text or an unfinished sentence fragment."
)}
Q_HINT = {"hint_leak": (
    "Do any of these answer choices contain a parenthetical that leaks a hint — an "
    "abbreviation expansion or a definition/explanatory phrase telling the reader what the "
    "term means? Choices must be the bare term or action only. "
    "NOT defects: a parenthetical giving a concrete technical quantity (e.g. '(12 shards)', "
    "'(12 hours/day)'), a reference marker (e.g. '(requirement 1)'), part of an official "
    "product name, or a well-known abbreviation such as S3/VPC/EC2."
)}


def state_domain(q):
    exam = q.get("examType", "?")
    doms = EXAM_DOMAINS.get(exam, [])
    p = [f"Certification: {exam}", "Official domain list:"]
    for i, d in enumerate(doms):
        p.append(f"  {i}. {d}")
    d = q.get("domain")
    name = doms[d] if isinstance(d, int) and 0 <= d < len(doms) else "(unset/out of range)"
    p.append(f"\nASSIGNED DOMAIN: {d}. {name}")
    p.append(f"\nQuestion:\n{q.get('questionText','')}")
    ch = q.get("choices") or []
    if ch:
        p.append("\nChoices:")
        for i, c in enumerate(ch):
            p.append(f"  {'ABCDEFG'[i] if i < 7 else i}. {c}")
    co = q.get("correctAnswers") or []
    if co:
        p.append("\nCorrect answer(s): " + " | ".join(str(x) for x in co))
    return "\n".join(p)


def state_ce(q):
    ch = q.get("choices") or []
    ce = q.get("choiceExplanations") or []
    p = [f"Question (context only):\n{q.get('questionText','')[:700]}"]
    co = set(str(x).strip() for x in (q.get("correctAnswers") or []))
    p.append("\nChoice / attached explanation pairs:")
    if not ce:
        p.append("  (no per-choice explanations at all)")
    for i, c in enumerate(ch):
        mark = " [CORRECT]" if str(c).strip() in co else ""
        e = ce[i] if i < len(ce) else "(MISSING)"
        p.append(f"\n  [{i}]{mark} choice: {c}")
        p.append(f"       explanation: {e}")
    if len(ce) != len(ch):
        p.append(f"\nNote: {len(ch)} choices but {len(ce)} explanations.")
    return "\n".join(p)


def state_hint(q):
    ch = q.get("choices") or []
    p = ["Answer choices from an AWS certification exam question:"]
    for i, c in enumerate(ch):
        p.append(f"  {'ABCDEFG'[i] if i < 7 else i}. {c}")
    return "\n".join(p)


MODES = {
    "domain": (Q_DOMAIN, state_domain, "domain"),
    "ce":     (Q_CE, state_ce, "choiceExplanations"),
    "hint":   (Q_HINT, state_hint, "choices"),
}
QUESTIONS, state_fn, KIND = MODES[args.mode]


def call_jev(key, text):
    payload = {"state": text, "model": MODEL,
               "questions": {k: {"type": "noul", "instructions": v} for k, v in QUESTIONS.items()}}
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
                return None, {"error": str(e)[:100]}
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
    P = tp / (tp + fp) if tp + fp else 0
    R = tp / (tp + fn) if tp + fn else 0
    F = 2 * P * R / (P + R) if P + R else 0
    return dict(threshold=thr, tp=tp, fp=fp, tn=tn, fn=fn, precision=P, recall=R, f1=F)


def main():
    data = json.load(open(DUMP))
    qs = [{k: deser(v) for k, v in it.items()} for it in data["Items"]]
    qs = [q for q in qs if not q.get("isHidden")]

    pos, neg = [], []
    for q in qs:
        if (q.get("validityCheckedAt") or "") < CUTOFF:
            continue
        lg = log_of(q)
        if lg and (lg.get("checkedAt") or "") >= CUTOFF and (lg.get("changes") or {}):
            if KIND in (lg.get("changes") or {}):
                pos.append((q, lg))
        elif not lg or (lg.get("checkedAt") or "") < CUTOFF:
            neg.append(q)

    n = min(args.samples, len(pos), len(neg))
    print(f"[mode={args.mode}] 母集団 positive({KIND}変更) {len(pos)}件 / negative {len(neg)}件 → 各{n}件")
    items = [dict(q=restore(q, lg), label=1, qid=q["questionId"], reason=(lg.get("reason") or "")[:110])
             for q, lg in random.sample(pos, n)]
    items += [dict(q=q, label=0, qid=q["questionId"], reason="") for q in random.sample(neg, n)]

    key = api_key()
    t0 = time.time()
    out, usages, err = [], [], 0
    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        for it, probs, usage in ex.map(lambda i: (i, *call_jev(key, state_fn(i["q"]))), items):
            if probs is None:
                err += 1; continue
            usages.append(usage)
            out.append(dict(qid=it["qid"], label=it["label"], reason=it["reason"], probs=probs))
    print(f"完了 {len(out)}件 / エラー{err}件 / {time.time()-t0:.0f}秒")
    cost = sum(u.get("cost_usd", 0) for u in usages)
    print(f"コスト ${cost:.4f} (1件 ${cost/max(1,len(out)):.5f})  "
          f"in={sum(u.get('input_tokens',0) for u in usages):,}  "
          f"残高 ${usages[-1].get('credits_remaining_usd',0):.4f}")

    labels = [r["label"] for r in out]
    for qk in QUESTIONS:
        probs = [r["probs"][qk] for r in out]
        mp = sum(p for p, l in zip(probs, labels) if l) / max(1, sum(labels))
        mn = sum(p for p, l in zip(probs, labels) if not l) / max(1, len(labels) - sum(labels))
        A = auc(labels, probs)
        print(f"\n★ {qk}: AUC={A:.3f}  pos平均={mp:.3f} neg平均={mn:.3f} 分離={mp-mn:+.3f}")
        print(f"{'閾値':>6}{'P':>8}{'R':>8}{'F1':>8}{'TP':>5}{'FP':>5}{'FN':>5}{'TN':>5}{'送信率':>9}")
        rows = []
        for t in [0.15, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]:
            m = metrics(labels, probs, t)
            rows.append(m)
            print(f"{t:>6.2f}{m['precision']:>8.3f}{m['recall']:>8.3f}{m['f1']:>8.3f}"
                  f"{m['tp']:>5}{m['fp']:>5}{m['fn']:>5}{m['tn']:>5}"
                  f"{(m['tp']+m['fp'])/len(out)*100:>8.1f}%")
    if args.output:
        Path(args.output).write_text(json.dumps(
            dict(mode=args.mode, n=n, cost=cost, details=out), ensure_ascii=False, indent=2))
        print(f"\n詳細: {args.output}")


main()
