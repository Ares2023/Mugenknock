#!/usr/bin/env python3
import json, math, os, random, re, sys
from pathlib import Path

D = Path(os.environ.get("OUT", Path(__file__).resolve().parent.parent / "discovery")); CACHE = D / "cache"
meta = json.load(open(D / "items_meta.json"))
QS = json.load(open(D / "items_q.json"))
if os.environ.get("EXCL_DOMAIN_FILL"):
    # domain 未設定の補完(None→int)だけが理由の正例は、本番のプールにはもう存在しない欠陥種。
    # Jev には domain が見えず、決定的特徴(domain_missing)には自明なので、評価を歪める。
    _before = len(meta)
    meta = [m for m in meta if not (m["label"] == 1 and "domain" in m["kinds"] and QS[m["qid"]].get("domain") is None)]
    print(f"[domain補完の正例を除外: {_before} → {len(meta)}件]")
ids = [m["qid"] for m in meta]
y = [m["label"] for m in meta]
kinds = {m["qid"]: m["kinds"] for m in meta}


def load(name):
    p = CACHE / f"{name}.json"
    return json.load(open(p)) if p.exists() else {}


C = {n: load(n) for n in ["base", "base_r", "sep_hint", "sep_fact", "fs_hint", "c3", "abbr", "over", "ce"]}


def col(cfg, key, default=None):
    return [C[cfg].get(i, {}).get(key, default) for i in ids]


def auc(labels, s):
    pos = [v for v, l in zip(s, labels) if l == 1]
    neg = [v for v, l in zip(s, labels) if l == 0]
    if not pos or not neg: return 0.5
    # ランク和（同順位は平均）で O(n log n)
    order = sorted(range(len(s)), key=lambda i: s[i])
    ranks = [0.0] * len(s); i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and s[order[j + 1]] == s[order[i]]: j += 1
        r = (i + j) / 2 + 1
        for k in range(i, j + 1): ranks[order[k]] = r
        i = j + 1
    rp = sum(r for r, l in zip(ranks, labels) if l == 1)
    n1, n0 = len(pos), len(neg)
    return (rp - n1 * (n1 + 1) / 2) / (n1 * n0)


def boot_diff(s_a, s_b, B=1500, seed=1):
    """AUC(a) - AUC(b) のペア・ブートストラップ 95%CI と、a>b の割合。"""
    rnd = random.Random(seed); n = len(y); ds = []
    for _ in range(B):
        idx = [rnd.randrange(n) for _ in range(n)]
        ly = [y[i] for i in idx]
        if 0 not in ly or 1 not in ly: continue
        ds.append(auc(ly, [s_a[i] for i in idx]) - auc(ly, [s_b[i] for i in idx]))
    ds.sort()
    return ds[int(len(ds) * .025)], ds[int(len(ds) * .975)], sum(d > 0 for d in ds) / len(ds)


def boot_ci(s, B=1000, seed=2):
    rnd = random.Random(seed); n = len(y); v = []
    for _ in range(B):
        idx = [rnd.randrange(n) for _ in range(n)]
        ly = [y[i] for i in idx]
        if 0 in ly and 1 in ly: v.append(auc(ly, [s[i] for i in idx]))
    v.sort(); return v[int(len(v) * .025)], v[int(len(v) * .975)]


# ── 決定的な特徴量 ────────────────────────────────────────────────
PAREN = re.compile(r'[（(]([^）)]{2,})[）)]')
WELL = set("S3 VPC EC2 IAM RDS SQS SNS KMS EBS ELB ALB NLB EKS ECS ECR API AWS CLI SDK DNS CDN TLS SSL HTTP HTTPS JSON YAML SQL CPU GPU RAM OS VM ID URL URI AZ MFA VPN SSO ACL NAT IGW EFS DMS SCT EMR WAF CDK SAM IPv4 IPv6 TCP UDP IP ARN CLF SAA DVA SOA SAP DOP AIF MLA AIP ANS SCS DEA GSI LSI TTL".split()) - {"TTL"}
ACR = re.compile(r'\b[A-Z][A-Z0-9\-]{2,7}\b')


def feats(q):
    ch = [str(c) for c in (q.get("choices") or [])]
    co = [str(c) for c in (q.get("correctAnswers") or [])]
    ce = [str(c) for c in (q.get("choiceExplanations") or [])]
    ex = q.get("explanation") or ""
    inn = [[m.group(1) for m in PAREN.finditer(c)] for c in ch]
    n_p = sum(1 for x in inn if x)
    allin = [s for x in inn for s in x]
    f = {}
    f["paren_n"] = n_p
    f["paren_frac"] = n_p / max(1, len(ch))
    f["paren_maxlen"] = min(40, max([len(s) for s in allin], default=0)) / 40
    f["paren_ascii_abbr"] = sum(1 for s in allin if re.fullmatch(r'[A-Za-z0-9 \-/&.]+', s) and len(s) >= 3)
    f["paren_jp_def"] = sum(1 for s in allin if re.search(r'[぀-ヿ一-鿿]', s) and len(s) >= 6)
    f["paren_quantity"] = sum(1 for s in allin if re.search(r'\d', s))
    if len(co) == 1 and len(ch) > 1:
        oth = [len(c) for c in ch if c != co[0]]
        f["len_ratio"] = max(.3, min(3.0, len(co[0]) / max(1, sum(oth) / len(oth))))
    else:
        f["len_ratio"] = 1.0
    f["ce_mismatch"] = 1.0 if len(ce) != len(ch) else 0.0
    f["ce_dupe"] = 1.0 if len({c[:25] for c in ce}) < len(ce) else 0.0
    text = ex + " " + " ".join(ce)
    unexp = 0
    for a in set(ACR.findall(text)):
        if a in WELL: continue
        if re.search(r'\(' + re.escape(a) + r'\)|' + re.escape(a) + r'\s*[（(]', text): continue
        unexp += 1
    f["acr_unexp"] = min(unexp, 6)
    d = q.get("domain")
    f["domain_missing"] = 0.0 if isinstance(d, int) else 1.0
    f["log_q"] = math.log1p(len(q.get("questionText") or "")) / 8
    f["log_e"] = math.log1p(len(ex)) / 8
    return f


F = [feats(QS[i]) for i in ids]
FNAMES = list(F[0].keys())

# ── ロジスティック回帰（純Python・L2）と交差検証 ────────────────────
def fit_lr(X, t, lam=1.0, iters=400, lr=0.3):
    n, m = len(X), len(X[0]); w = [0.0] * m; b = 0.0
    for _ in range(iters):
        gw = [0.0] * m; gb = 0.0
        for xi, ti in zip(X, t):
            z = b + sum(wj * xj for wj, xj in zip(w, xi))
            p = 1 / (1 + math.exp(-max(-30, min(30, z))))
            e = p - ti
            gb += e
            for j in range(m): gw[j] += e * xi[j]
        for j in range(m): w[j] -= lr * (gw[j] / n + lam * w[j] / n)
        b -= lr * gb / n
    return w, b


def standardize(X_tr, X_te):
    m = len(X_tr[0]); mu = [sum(r[j] for r in X_tr) / len(X_tr) for j in range(m)]
    sd = [math.sqrt(sum((r[j] - mu[j]) ** 2 for r in X_tr) / len(X_tr)) or 1.0 for j in range(m)]
    f = lambda X: [[(r[j] - mu[j]) / sd[j] for j in range(m)] for r in X]
    return f(X_tr), f(X_te)


def cv_scores(X, reps=8, k=5, lam=5.0, seed=3):
    """repeat×k-fold の OOF 予測を平均して返す。"""
    n = len(X); acc = [0.0] * n; cnt = [0] * n
    for r in range(reps):
        rnd = random.Random(seed + r)
        pos = [i for i in range(n) if y[i] == 1]; neg = [i for i in range(n) if y[i] == 0]
        rnd.shuffle(pos); rnd.shuffle(neg)
        folds = [[] for _ in range(k)]
        for j, i in enumerate(pos): folds[j % k].append(i)
        for j, i in enumerate(neg): folds[j % k].append(i)
        for f in range(k):
            te = set(folds[f]); tr = [i for i in range(n) if i not in te]
            Xtr, Xte = standardize([X[i] for i in tr], [X[i] for i in sorted(te)])
            w, b = fit_lr(Xtr, [y[i] for i in tr], lam=lam)
            for i, xi in zip(sorted(te), Xte):
                z = b + sum(wj * xj for wj, xj in zip(w, xi))
                acc[i] += 1 / (1 + math.exp(-max(-30, min(30, z)))); cnt[i] += 1
    return [a / c for a, c in zip(acc, cnt)]


# ── 本番の順序（バンド化）での効率シミュレーション ─────────────────
def efficiency(s, band=None, prev=0.38, mult=3, B=10, trials=6000, seed=5):
    rnd = random.Random(seed)
    P = [i for i in range(len(y)) if y[i] == 1]; Nn = [i for i in range(len(y)) if y[i] == 0]
    g = []
    for _ in range(trials):
        pool = [rnd.choice(P) if rnd.random() < prev else rnd.choice(Nn) for _ in range(B * mult)]
        nd = sum(y[i] for i in pool)
        if nd == 0: continue
        key = (lambda i: -(int(s[i] / band + 1e-9))) if band else (lambda i: -s[i])
        pool.sort(key=lambda i: (key(i), rnd.random()))   # 同バンド内は日付順≒ランダム
        g.append(sum(y[i] for i in pool[:B]) / (nd * B / (B * mult)))
    return sum(g) / len(g)


def fmt_ci(lo, hi): return f"[{lo:.3f},{hi:.3f}]"


def main():
    base = [max(a, b) for a, b in zip(col("base", "hint", 0), col("base", "fact", 0))]
    print(f"n = positive {sum(y)} / negative {len(y)-sum(y)}\n")

    print("═" * 78); print("① 単独スコアの AUC（95%CI）"); print("═" * 78)
    singles = {
        "base hint (現行/同コール)": col("base", "hint"), "base fact": col("base", "fact"),
        "sep hint (単独コール)": col("sep_hint", "hint"), "sep fact (単独コール)": col("sep_fact", "fact"),
        "fewshot hint": col("fs_hint", "hint"), "choice3 p(leak)": col("c3", "leak"),
        "abbr_unexpanded": col("abbr", "abbr"), "over_explained": col("over", "over"),
        "ce_misaligned": col("ce", "ce"),
    }
    for n_, s in singles.items():
        if any(v is None for v in s): print(f"  {n_:<28} (未収集)"); continue
        lo, hi = boot_ci(s)
        print(f"  {n_:<28} AUC {auc(y, s):.3f}  {fmt_ci(lo, hi)}")
    print("\n  決定的な特徴量（Jev不使用・費用0）:")
    for fn in FNAMES:
        s = [f[fn] for f in F]
        a = auc(y, s)
        if max(s) > min(s): print(f"    {fn:<20} AUC {a:.3f}")

    print("\n" + "═" * 78); print("② 欠陥種別ごとの AUC（その欠陥を持つ positive vs 全 negative）"); print("═" * 78)
    negs = [i for i in range(len(y)) if y[i] == 0]
    print(f"  {'':<24}" + "".join(f"{k:>16}" for k in ["choices", "choiceExplanations", "explanation"]))
    for n_, s in list(singles.items()) + [("regex paren_n", [f["paren_n"] for f in F])]:
        if any(v is None for v in s): continue
        row = f"  {n_:<24}"
        for k in ["choices", "choiceExplanations", "explanation"]:
            pi = [i for i in range(len(y)) if y[i] == 1 and k in kinds[ids[i]]]
            ll = [1] * len(pi) + [0] * len(negs)
            row += f"{auc(ll, [s[i] for i in pi] + [s[i] for i in negs]):>16.3f}"
        print(row)
    print("  （件数: " + ", ".join(f"{k}={sum(1 for i in range(len(y)) if y[i]==1 and k in kinds[ids[i]])}"
                                  for k in ["choices", "choiceExplanations", "explanation"]) + "）")

    print("\n" + "═" * 78); print("③ 合成スコアの比較（現行 = max(base hint, base fact) との差）"); print("═" * 78)
    cand = {}
    cand["現行 max(hint,fact)"] = base
    if C["base_r"]:
        br = [max(a, b) for a, b in zip(col("base_r", "hint", 0), col("base_r", "fact", 0))]
        cand["現行×2回平均(ノイズ低減)"] = [(a + b) / 2 for a, b in zip(base, br)]
        cand["現行 再実行(再現性の目安)"] = br
    if C["sep_hint"] and C["sep_fact"]:
        cand["別コール max"] = [max(a, b) for a, b in zip(col("sep_hint", "hint", 0), col("sep_fact", "fact", 0))]
    if C["fs_hint"] and C["sep_fact"]:
        cand["fewshot hint + sep fact max"] = [max(a, b) for a, b in zip(col("fs_hint", "hint", 0), col("sep_fact", "fact", 0))]
    if C["c3"]:
        cand["c3 leak + base fact max"] = [max(a, b) for a, b in zip(col("c3", "leak", 0), col("base", "fact", 0))]
        cand["c3 leak 単独"] = col("c3", "leak", 0)
    if C["ce"] and C["sep_hint"]:
        cand["hint,fact,ce 3者max"] = [max(a, b, c) for a, b, c in zip(col("base", "hint", 0), col("base", "fact", 0), col("ce", "ce", 0))]
    if C["abbr"]:
        cand["hint,fact,abbr 3者max"] = [max(a, b, c) for a, b, c in zip(col("base", "hint", 0), col("base", "fact", 0), col("abbr", "abbr", 0))]
    cand["regex paren_n 単独"] = [f["paren_n"] + 0.01 * f["paren_maxlen"] for f in F]
    for n_, s in cand.items():
        lo, hi = boot_ci(s); r = f"  {n_:<30} AUC {auc(y, s):.3f} {fmt_ci(lo, hi)}"
        if n_ != "現行 max(hint,fact)":
            dl, dh, pw = boot_diff(s, base)
            r += f"   差 {auc(y, s)-auc(y, base):+.3f} {fmt_ci(dl, dh)} P(改善)={pw:.2f}"
        print(r)

    print("\n" + "═" * 78); print("④ Jevスコア + 決定的特徴量 → 交差検証つきロジスティック回帰"); print("═" * 78)
    def build(cols, use_f):
        rows = []
        for i in range(len(y)):
            r = [c[i] for c in cols]
            if use_f: r += [F[i][k] for k in FNAMES]
            rows.append(r)
        return rows

    jev_cols = {"現行のみ": [base]}
    if C["sep_hint"] and C["sep_fact"] and C["c3"] and C["ce"] and C["abbr"] and C["over"]:
        jev_cols["全Jevスコア"] = [col("base", "hint"), col("base", "fact"), col("sep_hint", "hint"), col("sep_fact", "fact"),
                                  col("c3", "leak"), col("c3", "legit"), col("ce", "ce"), col("abbr", "abbr"), col("over", "over")]
    results = {}
    for nm, cols in jev_cols.items():
        for use_f in (False, True):
            X = build(cols, use_f); s = cv_scores(X)
            label = f"{nm}{' + 決定的特徴' if use_f else ''}"
            results[label] = s
            lo, hi = boot_ci(s); dl, dh, pw = boot_diff(s, base)
            print(f"  {label:<26} CV-AUC {auc(y, s):.3f} {fmt_ci(lo, hi)}   差 {auc(y, s)-auc(y, base):+.3f} {fmt_ci(dl, dh)} P(改善)={pw:.2f}")
    s = cv_scores([[f[k] for k in FNAMES] for f in F]); results["決定的特徴のみ"] = s
    lo, hi = boot_ci(s); dl, dh, pw = boot_diff(s, base)
    print(f"  {'決定的特徴のみ(Jev不使用)':<26} CV-AUC {auc(y, s):.3f} {fmt_ci(lo, hi)}   差 {auc(y, s)-auc(y, base):+.3f} {fmt_ci(dl, dh)} P(改善)={pw:.2f}")

    print("\n" + "═" * 78); print("⑤ 本番の順序でどれだけ効率が出るか（プール30・上位10・有病率38%）"); print("═" * 78)
    print(f"  {'':<30}{'連続値':>8}{'帯幅0.1':>9}{'帯幅0.25':>10}")
    allc = dict(cand); allc.update({f"[CV] {k}": v for k, v in results.items()})
    for n_, s in allc.items():
        if "再実行" in n_: continue
        print(f"  {n_:<30}{efficiency(s):>8.2f}{efficiency(s, 0.1):>9.2f}{efficiency(s, 0.25):>10.2f}")
    print("  （1.00 = ランダムと同じ。現行の帯幅0.25が本番設定）")

    print("\n" + "═" * 78); print("⑥ アブレーション（どの部品が効いているか）— CV-AUC"); print("═" * 78)
    PF = ["paren_n", "paren_frac", "paren_maxlen", "paren_ascii_abbr", "paren_jp_def", "paren_quantity"]
    def cv_of(cols, fnames):
        X = [[c[i] for c in cols] + [F[i][k] for k in fnames] for i in range(len(y))]
        return cv_scores(X)
    sh, sf = col("sep_hint", "hint"), col("sep_fact", "fact")
    ab, ov, ce_ = col("abbr", "abbr"), col("over", "over"), col("ce", "ce")
    c3l, c3g = col("c3", "leak"), col("c3", "legit")
    abl = [
        ("括弧特徴のみ(6個)", [], PF),
        ("全決定的特徴(domain除く)", [], [k for k in FNAMES if k != "domain_missing"]),
        ("Jev sep_hint のみ", [sh], []),
        ("Jev sep_hint + 括弧特徴", [sh], PF),
        ("Jev sep_hint + abbr + 括弧特徴", [sh, ab], PF),
        ("Jev sep_hint + sep_fact + abbr + 括弧特徴", [sh, sf, ab], PF),
        ("Jev c3(leak,legit) + abbr + 括弧特徴", [c3l, c3g, ab], PF),
        ("Jev全部 + 全決定的特徴(domain除く)", [col("base","hint"), col("base","fact"), sh, sf, c3l, c3g, ce_, ab, ov], [k for k in FNAMES if k != "domain_missing"]),
        ("Jev sep_hint + abbr + 全決定的特徴(domain除く)", [sh, ab], [k for k in FNAMES if k != "domain_missing"]),
    ]
    ref = None
    for nm, cols, fn in abl:
        sc = cv_of(cols, fn); a = auc(y, sc); lo, hi = boot_ci(sc)
        if nm == "全決定的特徴(domain除く)": ref = sc
        extra = ""
        if ref is not None and nm.startswith("Jev") and fn:
            dl, dh, pw = boot_diff(sc, ref); extra = f"  vs決定的のみ {a-auc(y, ref):+.3f} {fmt_ci(dl, dh)} P={pw:.2f}"
        print(f"  {nm:<44} {a:.3f} {fmt_ci(lo, hi)}{extra}")

    print("\n  標準化後の重み（Jev sep_hint + abbr + 括弧特徴 のモデル）:")
    cols, fn = [sh, ab], PF
    X = [[c[i] for c in cols] + [F[i][k] for k in fn] for i in range(len(y))]
    Xs, _ = standardize(X, X); w, b = fit_lr(Xs, y, lam=5.0)
    for nm_, wv in sorted(zip(["Jev sep_hint", "Jev abbr"] + fn, w), key=lambda t: -abs(t[1])):
        print(f"    {nm_:<20} {wv:+.2f}")

    json.dump({k: v for k, v in allc.items()}, open(D / "scores_all.json", "w"))


if __name__ == "__main__":
    main()
