#!/usr/bin/env python3
"""
Jev 精度改善の実験: データセットを作り、各構成のスコアをキャッシュ付きで集める。
再実行してもキャッシュ済みの (構成, questionId) は呼ばない（課金を増やさない）。
"""
import json, os, random, re, sys, time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

DUMP = os.environ.get("QUESTIONS_DUMP", "/tmp/questions_full.json")   # DynamoDB scan の JSON（35MB のため保存していない）
OUT = Path(os.environ.get("OUT", Path(__file__).resolve().parent.parent / "discovery")); OUT.mkdir(parents=True, exist_ok=True)
CACHE_DIR = OUT / "cache"; CACHE_DIR.mkdir(parents=True, exist_ok=True)
OFFSET = int(os.environ.get("OFFSET", 0))
ENDPOINT = "https://jevtypesafeai.com/api/v1/decide"
CUTOFF = "2026-08-20"
N = int(os.environ.get("N", 100))
SEED = 101


def deser(v):
    if "S" in v: return v["S"]
    if "N" in v: return int(v["N"]) if "." not in v["N"] else float(v["N"])
    if "BOOL" in v: return v["BOOL"]
    if "NULL" in v: return None
    if "L" in v: return [deser(i) for i in v["L"]]
    if "M" in v: return {k: deser(x) for k, x in v["M"].items()}
    return None


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


def api_key():
    d = json.loads((Path.home() / ".claude" / ".credentials.json").read_text())
    return d["pluginSecrets"]["jev-skills@jev-skills"]["typesafe_api_key"]


def build_dataset():
    raw = json.load(open(DUMP))
    qs = [{k: deser(v) for k, v in it.items()} for it in raw["Items"]]
    # 幽霊行（questionText 無し）と非公開を除外
    qs = [q for q in qs if q.get("questionText") and not q.get("isHidden")]
    pos, neg = [], []
    for q in qs:
        if (q.get("validityCheckedAt") or "") < CUTOFF:
            continue
        lg = log_of(q)
        ch = (lg or {}).get("changes") or {}
        if lg and (lg.get("checkedAt") or "") >= CUTOFF and ch:
            pos.append((q, lg))
        elif not lg or (lg.get("checkedAt") or "") < CUTOFF:
            neg.append(q)
    rnd = random.Random(SEED)
    rnd.shuffle(pos); rnd.shuffle(neg)
    eval_pos, eval_neg = pos[OFFSET:OFFSET + N], neg[OFFSET:OFFSET + N]
    items = [dict(qid=q["questionId"], q=restore(q, lg), label=1,
                  kinds=sorted((lg.get("changes") or {}).keys()),
                  reason=(lg.get("reason") or "")[:100]) for q, lg in eval_pos]
    items += [dict(qid=q["questionId"], q=q, label=0, kinds=[], reason="") for q in eval_neg]
    holdout_pos = pos[OFFSET + N:]   # few-shot 例の取得元（評価に使わない）
    return items, holdout_pos


# ── few-shot 例を「評価に使わない positive」の実際の修正前後から作る ─────────
def build_fewshot(holdout_pos, k_def=4, k_ok=3):
    paren = re.compile(r'[（(][^）)]{2,}[）)]')
    defects, oks = [], []
    for q, lg in holdout_pos:
        ch = (lg.get("changes") or {}).get("choices")
        if not ch: continue
        b, a = ch.get("before"), ch.get("after")
        if not (isinstance(b, list) and isinstance(a, list) and len(a) == len(b)):
            continue
        for x, y in zip(b, a):
            x, y = str(x), str(y)
            if x != y and paren.search(x) and not paren.search(y) and len(x) < 90:
                defects.append(x)
            if x == y and paren.search(x) and len(x) < 90:
                oks.append(x)              # Claude が修正時にあえて残した括弧
    rnd = random.Random(7)
    rnd.shuffle(defects); rnd.shuffle(oks)
    return defects[:k_def], oks[:k_ok]


def st_full(q):
    return {
        "certification": q.get("examType", ""),
        "question_text": q.get("questionText", "") or "",
        "choices": [str(c) for c in (q.get("choices") or [])],
        "marked_correct_answers": [str(c) for c in (q.get("correctAnswers") or [])],
        "explanation": q.get("explanation", "") or "",
        "per_choice_explanations": [str(c) for c in (q.get("choiceExplanations") or [])],
    }


def st_choices(q):
    return {"choices": [str(c) for c in (q.get("choices") or [])]}


def st_expl(q):
    return {"explanation": q.get("explanation", "") or "",
            "per_choice_explanations": [str(c) for c in (q.get("choiceExplanations") or [])]}


def st_ce(q):
    return {"question_text": (q.get("questionText", "") or "")[:600],
            "choices": [str(c) for c in (q.get("choices") or [])],
            "per_choice_explanations": [str(c) for c in (q.get("choiceExplanations") or [])]}


HINT_Q = {
    "type": "noul",
    "instructions": {
        "role": "You are auditing the answer choices of an AWS certification practice question.",
        "question": ("Does any entry of `choices` contain a parenthetical that leaks a hint — an "
                     "abbreviation expansion or a phrase defining what the term means?"),
        "not_a_defect": ("A concrete technical quantity such as '(12 shards)' or '(12 hours/day)'; a "
                         "reference marker such as '(requirement 1)'; part of an official product name; "
                         "a well-known abbreviation such as S3, VPC or EC2."),
    },
    "criteria": {
        "true": "At least one choice carries an explanatory or abbreviation-expanding parenthetical.",
        "false": "Every choice is the bare term or action, with no explanatory parenthetical.",
    },
}
FACT_Q = {
    "type": "noul",
    "instructions": {
        "role": "You are auditing an AWS certification practice question for factual accuracy.",
        "question": ("Do `question_text`, `explanation` or `per_choice_explanations` state something "
                     "factually untrue about AWS services?"),
        "examples_of_true": ("Attributing a capability to a service that does not have it; naming the wrong "
                             "service for a described capability; wrong quota, limit, SLA or retention value; "
                             "describing a current service as deprecated or a removed feature as available; "
                             "confusing two services (e.g. attributing EventBridge behaviour to CloudWatch)."),
    },
    "criteria": {
        "true": "At least one concrete statement about AWS behaviour is factually incorrect.",
        "false": "All statements about AWS behaviour are accurate.",
    },
}
ABBR_Q = {
    "type": "noul",
    "instructions": {
        "role": "You are auditing the explanations of an AWS/IT certification practice question.",
        "question": ("Do `explanation` or `per_choice_explanations` use an important technical "
                     "abbreviation without spelling out its full English name at first use?"),
        "examples_of_true": "BLEU, ROC-AUC, RMSE, MAE, SHAP, SMOTE, RBAC, MVCC, CIDR, OWASP used bare.",
        "not_a_defect": "Widely known AWS abbreviations such as S3, VPC, EC2, IAM, RDS, SQS, SNS, KMS.",
    },
    "criteria": {
        "true": "At least one important abbreviation appears without its full English spelling.",
        "false": "Every important abbreviation is spelled out at first use, or none is used.",
    },
}
OVER_Q = {
    "type": "noul",
    "instructions": {
        "role": "You are auditing the answer choices of a certification practice question.",
        "question": ("Is any entry of `choices` a term or short answer followed by an added "
                     "definition or explanatory clause, so that it reads as 'term + explanation' "
                     "rather than only the term/answer?"),
    },
    "criteria": {
        "true": "At least one choice adds a definition/explanation on top of the bare term or answer.",
        "false": "All choices are only the term or answer itself.",
    },
}
CE_Q = {
    "type": "noul",
    "instructions": {
        "role": "You are auditing the per-choice explanations of an AWS certification question.",
        "question": ("Is any entry of `per_choice_explanations` wrong for the `choices` entry at the "
                     "same index? They are paired by position."),
        "examples_of_true": ("An explanation describing a different choice than the one at its index "
                             "(swapped or shifted order); two choices sharing an identical generic "
                             "explanation; leftover placeholder text; an unfinished sentence fragment; "
                             "a count mismatch with `choices`."),
    },
    "criteria": {
        "true": "At least one explanation does not correspond to the choice at its index.",
        "false": "Every explanation correctly explains the choice at its index.",
    },
}
C3_Q = {
    "type": "choice",
    "instructions": {
        "role": "You are auditing the answer choices of an AWS certification practice question.",
        "question": ("Look at every parenthetical in `choices` and decide which single description "
                     "fits the set of choices best."),
    },
    "criteria": {
        "clean": "No choice contains a parenthetical, or every choice is just the bare term/answer.",
        "legit": ("Parentheticals exist but are all legitimate: a concrete technical quantity "
                  "(e.g. '(12 shards)'), a reference marker (e.g. '(requirement 1)'), or part of an "
                  "official product name."),
        "leak": ("At least one parenthetical expands an abbreviation or defines/explains the term, "
                 "which hands the reader a hint."),
    },
}


def make_fs_q(defects, oks):
    q = json.loads(json.dumps(HINT_Q))
    q["instructions"]["labeled_examples"] = {
        "leaking_choices_are_defects": defects,
        "legitimate_parentheticals_are_not_defects": oks,
    }
    return q


def post(key, state, questions):
    payload = {"state": state, "model": "jev-latest", "questions": questions}
    req = urllib.request.Request(ENDPOINT, data=json.dumps(payload).encode(),
                                 headers={"Authorization": f"Bearer {key}",
                                          "Content-Type": "application/json"}, method="POST")
    for a in range(3):
        try:
            with urllib.request.urlopen(req, timeout=90) as r:
                d = json.loads(r.read())
            return d["answers"], d.get("usage", {})
        except Exception as e:
            if a == 2:
                return None, {"error": str(e)[:100]}
            time.sleep(2 * (a + 1))


def run_config(name, items, state_fn, questions, key, extract):
    """questions: {score_name: qdef}。extract(answers)->{score_name: float}"""
    path = CACHE_DIR / f"{name}.json"
    cache = json.load(open(path)) if path.exists() else {}
    todo = [it for it in items if it["qid"] not in cache]
    if not todo:
        print(f"  [{name}] キャッシュ済み ({len(cache)}件)"); return
    print(f"  [{name}] {len(todo)}件を呼び出し...", flush=True)
    cost = 0.0

    def work(it):
        ans, usage = post(key, state_fn(it["q"]), questions)
        return it["qid"], ans, usage

    with ThreadPoolExecutor(max_workers=6) as ex:
        for qid, ans, usage in ex.map(work, todo):
            if ans is None:
                continue
            cache[qid] = extract(ans)
            cost += usage.get("cost_usd", 0)
    json.dump(cache, open(path, "w"))
    print(f"  [{name}] 完了 {len(cache)}件 ・ ${cost:.4f}", flush=True)


def noul(ans, k): return float(ans[k]["noul"])


def main():
    items, holdout = build_dataset()
    json.dump([{k: v for k, v in it.items() if k != "q"} for it in items],
              open(str(OUT / "items_meta.json"), "w"), ensure_ascii=False)
    json.dump({it["qid"]: it["q"] for it in items}, open(str(OUT / "items_q.json"), "w"),
              ensure_ascii=False)
    defects, oks = build_fewshot(holdout)
    json.dump({"defects": defects, "oks": oks}, open(str(OUT / "fewshot_used.json"), "w"),
              ensure_ascii=False, indent=1)
    print(f"データセット: positive {sum(i['label'] for i in items)} / negative "
          f"{sum(1-i['label'] for i in items)}   few-shot: 欠陥例{len(defects)} 正当例{len(oks)}")
    key = api_key()
    only = set(sys.argv[1:])

    def want(n): return not only or n in only

    if want("base"):
        run_config("base", items, st_full, {"hint_leak": HINT_Q, "factual_error": FACT_Q}, key,
                   lambda a: {"hint": noul(a, "hint_leak"), "fact": noul(a, "factual_error")})
    if want("base_r"):
        run_config("base_r", items, st_full, {"hint_leak": HINT_Q, "factual_error": FACT_Q}, key,
                   lambda a: {"hint": noul(a, "hint_leak"), "fact": noul(a, "factual_error")})
    if want("sep_hint"):
        run_config("sep_hint", items, st_choices, {"hint_leak": HINT_Q}, key,
                   lambda a: {"hint": noul(a, "hint_leak")})
    if want("sep_fact"):
        run_config("sep_fact", items, st_full, {"factual_error": FACT_Q}, key,
                   lambda a: {"fact": noul(a, "factual_error")})
    if want("fs_hint"):
        run_config("fs_hint", items, st_choices, {"hint_leak": make_fs_q(defects, oks)}, key,
                   lambda a: {"hint": noul(a, "hint_leak")})
    if want("c3"):
        def ex_c3(a):
            p = a["c3"].get("probabilities", {})
            return {"leak": float(p.get("leak", 0)), "legit": float(p.get("legit", 0)),
                    "clean": float(p.get("clean", 0))}
        run_config("c3", items, st_choices, {"c3": C3_Q}, key, ex_c3)
    if want("abbr"):
        run_config("abbr", items, st_expl, {"abbr": ABBR_Q}, key, lambda a: {"abbr": noul(a, "abbr")})
    if want("over"):
        run_config("over", items, st_choices, {"over": OVER_Q}, key, lambda a: {"over": noul(a, "over")})
    if want("ce"):
        run_config("ce", items, st_ce, {"ce": CE_Q}, key, lambda a: {"ce": noul(a, "ce")})


if __name__ == "__main__":
    main()
