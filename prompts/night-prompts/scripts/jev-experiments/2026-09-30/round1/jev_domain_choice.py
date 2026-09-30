#!/usr/bin/env python3
"""
ドメイン分類を Jev の choice タイプで測り直す。

前回は noul しか無いと誤認して「ドメインごとに noul を並べて argmax」という
回避策を取ったが、API には choice タイプが存在し confidence も返る。
正しい道具で測れば結論が変わるか確認する。

正解ラベル:
  ok判定済み（validityCheckedAt あり・現行ルール下で修正なし）→ 現在の domain が正解
  domain を int→int で修正された問題 → 修正後の domain が正解
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
N = int(sys.argv[1]) if len(sys.argv) > 1 else 70

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
    return {
        "certification": q.get("examType", ""),
        "question_text": q.get("questionText", "") or "",
        "choices": [str(c) for c in (q.get("choices") or [])],
        "correct_answers": [str(c) for c in (q.get("correctAnswers") or [])],
    }


def call_jev(key, q):
    doms = EXAM_DOMAINS.get(q.get("examType", ""), [])
    if not doms:
        return None, None
    payload = {
        "state": build_state(q),
        "model": MODEL,
        "questions": {
            "domain": {
                "type": "choice",
                "instructions": (
                    "This exam question must be filed under exactly one official domain of "
                    "the certification. Pick the domain it primarily tests. Judge by the "
                    "skill being assessed, not by which AWS services happen to appear."
                ),
                # criteria のキーをドメイン index にして、返り値から直接 index を得る
                "criteria": {str(i): d for i, d in enumerate(doms)},
            }
        },
    }
    req = urllib.request.Request(ENDPOINT, data=json.dumps(payload).encode(),
                                 headers={"Authorization": f"Bearer {key}",
                                          "Content-Type": "application/json"}, method="POST")
    for a in range(3):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                d = json.loads(r.read())
            ans = d["answers"]["domain"]
            return dict(pred=int(ans["choice"]), confidence=ans.get("confidence", 0.0),
                        probs=ans.get("probabilities", {}), n_domains=len(doms)), d.get("usage", {})
        except Exception as e:
            if a == 2:
                sys.stderr.write(f"  ⚠️ {q.get('questionId')}: {str(e)[:100]}\n")
                return None, None
            time.sleep(2 * (a + 1))


def main():
    random.seed(11)
    data = json.load(open(DUMP))
    qs = [{k: deser(v) for k, v in it.items()} for it in data["Items"]]
    qs = [q for q in qs if not q.get("isHidden")]

    fixed, ok = [], []
    for q in qs:
        if (q.get("validityCheckedAt") or "") < CUTOFF:
            continue
        lg = log_of(q)
        ch = (lg or {}).get("changes") or {}
        if lg and (lg.get("checkedAt") or "") >= CUTOFF and "domain" in ch:
            b, a = ch["domain"].get("before"), ch["domain"].get("after")
            if isinstance(a, int) and isinstance(b, int):
                fixed.append((q, b, a))
        elif not lg or (lg.get("checkedAt") or "") < CUTOFF:
            d = q.get("domain")
            if isinstance(d, int):
                ok.append((q, d, d))

    nn = min(N, len(ok))
    items = [dict(q=q, stored=b, truth=a, group="fixed") for q, b, a in fixed]
    items += [dict(q=q, stored=b, truth=a, group="ok") for q, b, a in random.sample(ok, nn)]
    print(f"母集団: 真の誤分類(int→int) {len(fixed)}件(全件) / ok判定 {nn}件")

    key = api_key()
    t0 = time.time()
    out, usages = [], []
    with ThreadPoolExecutor(max_workers=6) as ex:
        for it, res, usage in ex.map(lambda i: (i, *call_jev(key, i["q"])), items):
            if res:
                out.append(dict(it, **res))
                if usage: usages.append(usage)
    cost = sum(u.get("cost_usd", 0) for u in usages)
    print(f"完了 {len(out)}/{len(items)}件 / {time.time()-t0:.0f}秒 / ${cost:.4f}"
          f"（1問 ${cost/max(1,len(out)):.5f}）残高 ${usages[-1].get('credits_remaining_usd',0):.4f}\n")

    for grp, label in (("ok", "ok判定（正解=現在値）"), ("fixed", "誤分類修正済み（正解=修正後）"), (None, "全体")):
        sub = [r for r in out if grp is None or r["group"] == grp]
        if not sub: continue
        acc = sum(r["pred"] == r["truth"] for r in sub) / len(sub)
        print(f"[{label}] n={len(sub)}  一致率 {acc*100:.1f}%")

    oks = [r for r in out if r["group"] == "ok"]
    fx = [r for r in out if r["group"] == "fixed"]
    print("\n--- 前回の noul+argmax との比較（ok判定の一致率）---")
    print(f"  noul を並べて argmax : 85.1%")
    print(f"  choice タイプ        : {sum(r['pred']==r['truth'] for r in oks)/max(1,len(oks))*100:.1f}%")

    # 「予測≠保存値」を誤り検出とみなした場合
    tp = sum(1 for r in fx if r["pred"] != r["stored"])
    fn = sum(1 for r in fx if r["pred"] == r["stored"])
    fp = sum(1 for r in oks if r["pred"] != r["stored"])
    tn = sum(1 for r in oks if r["pred"] == r["stored"])
    P = tp / (tp + fp) if tp + fp else 0
    R = tp / (tp + fn) if tp + fn else 0
    print(f"\n--- 予測≠保存値 を『ドメイン誤り』検出とみなした場合 ---")
    print(f"  P={P:.3f} R={R:.3f} TP={tp} FP={fp} FN={fn} TN={tn}  （前回 noul: P=0.286）")

    print("\n--- confidence で絞ると誤検出は減るか ---")
    print(f"{'閾値':>6}{'採用率':>8}{'採用分の一致率':>14}{'誤検出(FP)':>11}")
    for t in (0.0, 0.5, 0.6, 0.7, 0.8, 0.9):
        sel = [r for r in out if r["confidence"] >= t]
        if not sel: continue
        acc = sum(r["pred"] == r["truth"] for r in sel) / len(sel)
        fpn = sum(1 for r in sel if r["group"] == "ok" and r["pred"] != r["stored"])
        print(f"{t:>6.2f}{len(sel)/len(out)*100:>7.1f}%{acc*100:>13.1f}%{fpn:>11}")

    print("\n--- 不一致サンプル（最大6件）---")
    shown = 0
    for r in out:
        if r["pred"] != r["truth"] and shown < 6:
            shown += 1
            doms = EXAM_DOMAINS[r["q"]["examType"]]
            print(f"  [{r['q']['questionId']}] {r['q']['examType']} group={r['group']} conf={r['confidence']:.2f}")
            print(f"     正解: {r['truth']}. {doms[r['truth']]}")
            print(f"     予測: {r['pred']}. {doms[r['pred']]}")

    Path("/tmp/jev_domain_choice.json").write_text(json.dumps(
        [{k: v for k, v in r.items() if k != "q"} | {"qid": r["q"]["questionId"],
         "exam": r["q"]["examType"]} for r in out], ensure_ascii=False, indent=2))


main()
