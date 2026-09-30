#!/usr/bin/env python3
"""jev-triage.py を実物のまま labeled サンプルに通して AUC を測る。"""
import json, random, subprocess, sys

DUMP = "/tmp/questions_full.json"
TRIAGE = "/home/yuzuki/aws-quiz-app/prompts/night-prompts/scripts/jev-triage.py"
CUT = "2026-08-20"
N = int(sys.argv[1]) if len(sys.argv) > 1 else 45


def deser(v):
    if "S" in v: return v["S"]
    if "N" in v: return int(v["N"]) if "." not in v["N"] else float(v["N"])
    if "BOOL" in v: return v["BOOL"]
    if "NULL" in v: return None
    if "L" in v: return [deser(i) for i in v["L"]]
    if "M" in v: return {k: deser(x) for k, x in v["M"].items()}
    return None


def lg_of(q):
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


def auc(labels, scores):
    pos = [s for s, l in zip(scores, labels) if l == 1]
    neg = [s for s, l in zip(scores, labels) if l == 0]
    w = t = 0
    for p in pos:
        for n in neg:
            if p > n: w += 1
            elif p == n: t += 1
    return (w + 0.5 * t) / (len(pos) * len(neg))


data = json.load(open(DUMP))
qs = [{k: deser(v) for k, v in it.items()} for it in data["Items"]]
qs = [q for q in qs if not q.get("isHidden")]
pos, neg = [], []
for q in qs:
    if (q.get("validityCheckedAt") or "") < CUT: continue
    lg = lg_of(q); ch = (lg or {}).get("changes") or {}
    if lg and (lg.get("checkedAt") or "") >= CUT and ch: pos.append((q, lg))
    elif not lg or (lg.get("checkedAt") or "") < CUT: neg.append(q)

random.seed(5)
n = min(N, len(pos), len(neg))
items = [(restore(q, lg), 1) for q, lg in random.sample(pos, n)]
items += [(q, 0) for q in random.sample(neg, n)]
random.shuffle(items)
print(f"jev-triage.py を実物のまま評価: positive {n}件 / negative {n}件")

pr = subprocess.run([sys.executable, TRIAGE], input=json.dumps([q for q, _ in items]),
                    capture_output=True, text=True, timeout=600)
sys.stderr.write(pr.stderr)
scores = json.loads(pr.stdout)
labels, sc = [], []
for q, l in items:
    if q["questionId"] in scores:
        labels.append(l); sc.append(scores[q["questionId"]])
A = auc(labels, sc)
mp = sum(s for s, l in zip(sc, labels) if l) / max(1, sum(labels))
mn = sum(s for s, l in zip(sc, labels) if not l) / max(1, len(labels) - sum(labels))
print(f"\n★ triage スコアの AUC = {A:.3f}（シミュレーション前提 0.763）")
print(f"   pos平均={mp:.3f}  neg平均={mn:.3f}  分離={mp-mn:+.3f}")

# プール方式の実効果を実データで直接測る
print("\n--- プール方式の実効果（このサンプルで直接測定）---")
BATCH = 10
for mult in (2, 3, 4):
    pool_n = BATCH * mult
    if pool_n > len(labels): continue
    gains = []
    for _ in range(4000):
        idx = random.sample(range(len(labels)), pool_n)
        nd = sum(labels[i] for i in idx)
        if nd == 0: continue
        top = sorted(idx, key=lambda i: -sc[i])[:BATCH]
        gains.append((sum(labels[i] for i in top), nd * BATCH / pool_n))
    a = sum(x for x, _ in gains) / len(gains)
    b = sum(y for _, y in gains) / len(gains)
    print(f"  倍率{mult}: Jev順 {a:.2f}問 / 古い順 {b:.2f}問 → 効率 {a/b:.2f}倍")
