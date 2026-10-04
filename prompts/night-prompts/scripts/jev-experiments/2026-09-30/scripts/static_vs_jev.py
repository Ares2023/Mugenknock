#!/usr/bin/env python3
"""
Jev(hint_leak) は静的解析で代替できるか。保存済みスコアだけで動く（Jev を呼ばない・費用ゼロ）。

  ① 全体: Jev を正規表現ベースの静的スコアと比べる（探索・未見のプール）
  ② 核心: 「括弧がある問題」だけで、ヒント漏れ(positive)と正当な括弧(negative)を切り分けられるか。
          括弧の有無では判別できない領域なので、ここで Jev が勝たなければ存在意義は薄い。
  ③ 静的ルールにも探索→未見の手順を踏ませる（探索で学習した重みを未見に適用）
  ④ 本番の順序(帯幅0.25)での効率と、1バッチあたりの欠陥検出数の差
"""
import contextlib, importlib, io, os, random, re, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
ROOT = HERE.parent
os.environ["EXCL_DOMAIN_FILL"] = "1"


def load(name):
    os.environ["OUT"] = str(ROOT / name)
    import analyze
    with contextlib.redirect_stdout(io.StringIO()):
        return importlib.reload(analyze)


PAREN = re.compile(r'[（(]([^）)]{2,})[）)]')


def inners(q):
    return [[m.group(1) for m in PAREN.finditer(str(c))] for c in (q.get("choices") or [])]


def s_frac(q):            # 括弧を持つ選択肢の割合
    x = inners(q); return sum(1 for i in x if i) / max(1, len(x))


def s_nonquant(q):        # 数字を含まない括弧（数量・参照記号を除く）を持つ選択肢の割合
    x = inners(q)
    return sum(1 for i in x if any(not re.search(r'\d', s) for s in i)) / max(1, len(x))


def s_expansion(q):       # 略語展開(英字のみ)か、日本語の定義らしい長い括弧を持つ選択肢の割合
    x = inners(q)
    def leak(s):
        return bool(re.fullmatch(r'[A-Za-z0-9 \-/&.]+', s) and len(s) >= 3 and not re.search(r'\d', s)) \
            or bool(re.search(r'[぀-ヿ一-鿿]', s) and len(s) >= 6 and not re.search(r'\d', s))
    return sum(1 for i in x if any(leak(s) for s in i)) / max(1, len(x))


STATIC = {"括弧率": s_frac, "数字なし括弧率": s_nonquant, "略語展開/定義らしさ": s_expansion}


def boot(ds_pairs, B=3000, seed=9):
    """ds_pairs: [(labels, score_a, score_b), ...]（データセットごと）。AUC(a)-AUC(b) の95%CI。"""
    rnd = random.Random(seed); out = []
    for _ in range(B):
        d = 0.0; w = 0
        for ly, a, b in ds_pairs:
            n = len(ly); idx = [rnd.randrange(n) for _ in range(n)]
            yy = [ly[i] for i in idx]
            if 0 in yy and 1 in yy:
                d += (AUC(yy, [a[i] for i in idx]) - AUC(yy, [b[i] for i in idx])) * n; w += n
        if w: out.append(d / w)
    out.sort(); return out[int(len(out) * .025)], out[int(len(out) * .975)], sum(v > 0 for v in out) / len(out)


AUC = load("discovery").auc
# load() は同じモジュールを reload する（グローバルの y などが差し替わる）ので、
# データセットごとに必要な値をここで取り出して固定する。モジュールの関数のうち
# グローバルを見るもの（efficiency）は使わず、下で明示的にラベルを渡す版を使う。
snap = {}
for name, nm in (("探索", "discovery"), ("未見", "holdout")):
    m = load(nm)
    snap[name] = dict(y=list(m.y), ids=list(m.ids), kinds=dict(m.kinds), QS=m.QS,
                      sh=list(m.col("sep_hint", "hint")), F=[dict(f) for f in m.F],
                      base=[max(a, b) for a, b in zip(m.col("base", "hint", 0), m.col("base", "fact", 0))],
                      fit_lr=m.fit_lr, standardize=m.standardize)
    snap[name]["stat"] = {k: [fn(m.QS[i]) for i in m.ids] for k, fn in STATIC.items()}


def efficiency(y_, s, band, prev=0.38, mult=3, B=30, trials=5000, seed=5):
    """プール B*mult から上位 B を選んだときの、ランダム比の欠陥検出倍率（同バンド内はランダム）。"""
    rnd = random.Random(seed)
    P = [i for i in range(len(y_)) if y_[i] == 1]; N = [i for i in range(len(y_)) if y_[i] == 0]
    g = []
    for _ in range(trials):
        pool = [rnd.choice(P) if rnd.random() < prev else rnd.choice(N) for _ in range(B * mult)]
        nd = sum(y_[i] for i in pool)
        if nd == 0: continue
        pool.sort(key=lambda i: (-int(s[i] / band + 1e-9), rnd.random()))
        g.append(sum(y_[i] for i in pool[:B]) / (nd * B / (B * mult)))
    return sum(g) / len(g)


def ci_line(label, y_, a, b):
    lo, hi, p = boot([(y_, a, b)]); return f"{AUC(y_, a) - AUC(y_, b):+.3f} [{lo:+.3f},{hi:+.3f}] P={p:.2f}"


print("=" * 88); print("① 全体（domain補完除外）: Jev hint_leak(選択肢のみ) vs 静的スコア"); print("=" * 88)
print(f"{'':<24}" + "".join(f"{n:>30}" for n in snap))
for label, getter in [("Jev sep_hint", lambda s: s["sh"])] + [(f"静的: {k}", (lambda k: lambda s: s["stat"][k])(k)) for k in STATIC]:
    print(f"{label:<24}" + "".join(f"{AUC(s['y'], getter(s)):>30.3f}" for s in snap.values()))
print("\n  Jev − 静的（差と95%CI・データセットごと）")
for k in STATIC:
    print(f"  vs {k:<18}" + "".join(f"  {n}: {ci_line(n, s['y'], s['sh'], s['stat'][k])}" for n, s in snap.items()))
lo, hi, p = boot([(s["y"], s["sh"], s["stat"]["数字なし括弧率"]) for s in snap.values()])
print(f"  プール: Jev − 数字なし括弧率  {lo:+.3f}〜{hi:+.3f} (95%CI)  P(Jev>静的)={p:.3f}")

print("\n" + "=" * 88); print("② 核心: 括弧がある問題だけで「ヒント漏れ」と「正当な括弧」を切り分けられるか"); print("=" * 88)
print("  positive = 選択肢を修正された問題 / negative = Claude が ok と判定した問題。どちらも括弧を持つものだけ")
sub = {}
for n, s in snap.items():
    idx = [i for i in range(len(s["y"]))
           if any(inners(s["QS"][s["ids"][i]]))
           and (s["y"][i] == 0 or "choices" in s["kinds"][s["ids"][i]])]
    sub[n] = dict(y=[s["y"][i] for i in idx], sh=[s["sh"][i] for i in idx],
                  stat={k: [s["stat"][k][i] for i in idx] for k in STATIC})
    print(f"  {n}: positive {sum(sub[n]['y'])} / negative(正当な括弧) {len(idx)-sum(sub[n]['y'])}")
print(f"\n  {'':<24}" + "".join(f"{n:>12}" for n in sub))
print(f"  {'Jev sep_hint':<24}" + "".join(f"{AUC(v['y'], v['sh']):>12.3f}" for v in sub.values()))
for k in STATIC:
    print(f"  {'静的: '+k:<24}" + "".join(f"{AUC(v['y'], v['stat'][k]):>12.3f}" for v in sub.values()))
lo, hi, p = boot([(v["y"], v["sh"], v["stat"]["数字なし括弧率"]) for v in sub.values()])
print(f"\n  プール: Jev − 数字なし括弧率 = {lo:+.3f}〜{hi:+.3f}  P(Jev>静的)={p:.3f}")
lo, hi, p = boot([(v["y"], v["sh"], v["stat"]["略語展開/定義らしさ"]) for v in sub.values()])
print(f"  プール: Jev − 略語展開/定義らしさ = {lo:+.3f}〜{hi:+.3f}  P(Jev>静的)={p:.3f}")

print("\n" + "=" * 88); print("③ 静的ルールにも同じ手順: 探索で重みを学習 → 未見に適用（ロジスティック回帰・括弧6特徴）"); print("=" * 88)
PF = ["paren_n", "paren_frac", "paren_maxlen", "paren_ascii_abbr", "paren_jp_def", "paren_quantity"]
a, b = snap["探索"], snap["未見"]
Xa = [[f[k] for k in PF] for f in a["F"]]; Xb = [[f[k] for k in PF] for f in b["F"]]
Xa_s, Xb_s = a["standardize"](Xa, Xb)
w, bias = a["fit_lr"](Xa_s, a["y"], lam=5.0)
import math
lr_b = [1 / (1 + math.exp(-(bias + sum(wj * xj for wj, xj in zip(w, xi))))) for xi in Xb_s]
print(f"  未見 AUC:  学習した静的LR {AUC(b['y'], lr_b):.3f} / 数字なし括弧率 {AUC(b['y'], b['stat']['数字なし括弧率']):.3f}"
      f" / Jev {AUC(b['y'], b['sh']):.3f} / 現行Jev {AUC(b['y'], b['base']):.3f}")
print(f"  Jev − 学習した静的LR: {ci_line('', b['y'], b['sh'], lr_b)}")
mix = [(x + y_) / 2 for x, y_ in zip(b["sh"], b["stat"]["数字なし括弧率"])]
print(f"  Jev と静的の平均（事前に固定）: {AUC(b['y'], mix):.3f}   vs Jev単独 {ci_line('', b['y'], mix, b['sh'])}")

print("\n" + "=" * 88); print("④ 本番の順序(帯幅0.25)での効率 と 1バッチ(プール90→30)あたりの欠陥検出数"); print("=" * 88)
print(f"  {'':<22}" + "".join(f"{n+' 効率':>11}{n+' 欠陥/バッチ':>16}" for n in snap) + "   (ランダム=11.4)")
for label, getter in [("現行Jev(2問・全state)", lambda s: s["base"]), ("Jev sep_hint(採用)", lambda s: s["sh"]),
                      ("静的: 数字なし括弧率", lambda s: s["stat"]["数字なし括弧率"]), ("静的: 括弧率", lambda s: s["stat"]["括弧率"])]:
    row = f"  {label:<22}"
    for s in snap.values():
        e = efficiency(s["y"], getter(s), 0.25)
        row += f"{e:>11.2f}{e * 30 * 0.38:>16.1f}"
    print(row)
