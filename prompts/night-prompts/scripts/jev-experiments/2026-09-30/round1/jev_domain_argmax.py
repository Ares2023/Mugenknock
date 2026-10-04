#!/usr/bin/env python3
"""
Jev にドメイン分類そのものを任せられるか検証する。

noul は 0-1 の確率しか返せないので、ドメインごとに 1 つの noul 質問を並べ、
argmax を取ることで多クラス分類を composite する。

正解ラベル:
  positive（domain を fix された問題）→ changes.domain.after が正しいドメイン
  negative（ok 判定）               → 現在の domain が正しいドメイン
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
N_PER_GROUP = int(sys.argv[1]) if len(sys.argv) > 1 else 40

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


def build_state(q):
    """ドメイン判定に必要な情報のみ。ドメイン候補はここには出さない（質問側に入れる）。"""
    p = [f"Certification: {q.get('examType','?')}",
         f"\nExam question:\n{q.get('questionText','')}"]
    ch = q.get("choices") or []
    if ch:
        p.append("\nChoices:")
        for i, c in enumerate(ch):
            p.append(f"  {'ABCDEFG'[i] if i < 7 else i}. {c}")
    co = q.get("correctAnswers") or []
    if co:
        p.append("\nCorrect answer(s): " + " | ".join(str(x) for x in co))
    return "\n".join(p)


def build_questions(exam):
    """ドメインごとに1つの noul 質問。criteria で true/false の意味を明示する。"""
    doms = EXAM_DOMAINS.get(exam, [])
    qs = {}
    listing = "; ".join(f"[{i}] {d}" for i, d in enumerate(doms))
    for i, d in enumerate(doms):
        qs[f"d{i}"] = {
            "type": "noul",
            "instructions": (
                f"This {exam} exam question must be filed under exactly ONE of the "
                f"certification's official domains. The full list is: {listing}. "
                f"Is the single best-fitting domain for this question [{i}] \"{d}\"? "
                f"Judge by what the question is primarily testing, not by which AWS "
                f"services happen to be mentioned."
            ),
            "criteria": {
                "true": f"The question's primary subject matter belongs under [{i}] {d}.",
                "false": f"The question belongs under a different domain than [{i}] {d}.",
            },
        }
    return qs, doms


def call_jev(key, state, questions):
    payload = {"state": state, "model": MODEL, "questions": questions}
    req = urllib.request.Request(ENDPOINT, data=json.dumps(payload).encode(),
                                 headers={"Authorization": f"Bearer {key}",
                                          "Content-Type": "application/json"}, method="POST")
    for a in range(3):
        try:
            with urllib.request.urlopen(req, timeout=90) as r:
                d = json.loads(r.read())
            return {k: v["noul"] for k, v in d["answers"].items()}, d.get("usage", {})
        except Exception as e:
            if a == 2:
                return None, {"error": str(e)[:100]}
            time.sleep(2 * (a + 1))


def main():
    random.seed(11)
    data = json.load(open(DUMP))
    qs = [{k: deser(v) for k, v in it.items()} for it in data["Items"]]
    qs = [q for q in qs if not q.get("isHidden")]

    pos, neg = [], []
    for q in qs:
        if (q.get("validityCheckedAt") or "") < CUTOFF:
            continue
        lg = log_of(q)
        ch = (lg or {}).get("changes") or {}
        if lg and (lg.get("checkedAt") or "") >= CUTOFF and "domain" in ch:
            a = ch["domain"].get("after"); b = ch["domain"].get("before")
            if isinstance(a, int) and isinstance(b, int):
                pos.append((q, b, a))
        elif not lg or (lg.get("checkedAt") or "") < CUTOFF:
            d = q.get("domain")
            if isinstance(d, int):
                neg.append((q, d, d))

    items = []
    for q, before, after in pos:   # 真の誤分類（int→int）は少ないので全件使う
        items.append(dict(q=q, stored=before, truth=after, group="fixed"))
    nn = min(N_PER_GROUP, len(neg))
    for q, before, after in random.sample(neg, nn):
        items.append(dict(q=q, stored=before, truth=after, group="ok"))
    print(f"母集団: 真の誤分類(int→int) {len(pos)}件(全件) / ok判定 {nn}件")

    key = api_key()

    def work(it):
        exam = it["q"].get("examType", "")
        questions, doms = build_questions(exam)
        if not doms:
            return None
        probs, usage = call_jev(key, build_state(it["q"]), questions)
        if probs is None:
            return None
        ranked = sorted(((probs.get(f"d{i}", 0.0), i) for i in range(len(doms))), reverse=True)
        return dict(it, doms=doms, probs=probs, pred=ranked[0][1],
                    pred_p=ranked[0][0], second=ranked[1][1] if len(ranked) > 1 else None,
                    second_p=ranked[1][0] if len(ranked) > 1 else 0.0, usage=usage)

    t0 = time.time()
    out = []
    with ThreadPoolExecutor(max_workers=6) as ex:
        for r in ex.map(work, items):
            if r: out.append(r)
    print(f"完了 {len(out)}/{len(items)}件 / {time.time()-t0:.0f}秒")
    cost = sum(r["usage"].get("cost_usd", 0) for r in out)
    print(f"コスト ${cost:.4f} (1問 ${cost/max(1,len(out)):.5f})  残高 ${out[-1]['usage'].get('credits_remaining_usd',0):.4f}")

    # ── 分類精度 ──
    for grp in ("fixed", "ok", None):
        sub = [r for r in out if grp is None or r["group"] == grp]
        if not sub: continue
        acc = sum(r["pred"] == r["truth"] for r in sub) / len(sub)
        top2 = sum(r["truth"] in (r["pred"], r["second"]) for r in sub) / len(sub)
        label = {"fixed": "domain修正済み（正解=修正後）", "ok": "ok判定（正解=現在値）", None: "全体"}[grp]
        print(f"\n[{label}] n={len(sub)}")
        print(f"  argmax 一致率(top-1): {acc*100:.1f}%")
        print(f"  top-2 一致率:        {top2*100:.1f}%")
        if grp == "fixed":
            same_as_stored = sum(r["pred"] == r["stored"] for r in sub) / len(sub)
            print(f"  （誤った保存値を再現してしまった率: {same_as_stored*100:.1f}%）")

    # ── 「保存値と予測が違う」を誤り検出とみなした場合のゲート性能 ──
    print("\n--- argmax≠保存値 を『ドメイン誤り』検出とした場合 ---")
    tp = sum(1 for r in out if r["group"] == "fixed" and r["pred"] != r["stored"])
    fn = sum(1 for r in out if r["group"] == "fixed" and r["pred"] == r["stored"])
    fp = sum(1 for r in out if r["group"] == "ok" and r["pred"] != r["stored"])
    tn = sum(1 for r in out if r["group"] == "ok" and r["pred"] == r["stored"])
    P = tp / (tp + fp) if tp + fp else 0
    R = tp / (tp + fn) if tp + fn else 0
    print(f"  P={P:.3f}  R={R:.3f}  F1={2*P*R/(P+R) if P+R else 0:.3f}  TP={tp} FP={fp} FN={fn} TN={tn}")

    # 確信度で絞った場合
    print("\n--- 確信度フィルタ: argmax確率がこの値以上のときだけ採用 ---")
    print(f"{'閾値':>6}{'採用率':>8}{'採用分の正解率':>14}")
    for t in [0.0, 0.5, 0.6, 0.7, 0.8, 0.9]:
        sel = [r for r in out if r["pred_p"] >= t]
        if not sel: continue
        acc = sum(r["pred"] == r["truth"] for r in sel) / len(sel)
        print(f"{t:>6.2f}{len(sel)/len(out)*100:>7.1f}%{acc*100:>13.1f}%")

    # 誤分類サンプル
    print("\n--- 誤分類サンプル（最大8件）---")
    shown = 0
    for r in out:
        if r["pred"] != r["truth"] and shown < 8:
            shown += 1
            print(f"  [{r['q']['questionId']}] {r['q'].get('examType')} group={r['group']}")
            truth_p = r["probs"].get(f"d{r['truth']}", 0.0)
            print(f"     正解: {r['truth']}. {r['doms'][r['truth']]}  (p={truth_p:.3f})")
            print(f"     予測: {r['pred']}. {r['doms'][r['pred']]}  (p={r['pred_p']:.3f})")

    Path("/tmp/jev_domain_argmax.json").write_text(json.dumps(
        [{k: v for k, v in r.items() if k != "q"} | {"qid": r["q"]["questionId"]} for r in out],
        ensure_ascii=False, indent=2))
    print("\n詳細: /tmp/jev_domain_argmax.json")


main()
