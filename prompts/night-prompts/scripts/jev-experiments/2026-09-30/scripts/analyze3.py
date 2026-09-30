import os; os.environ["EXCL_DOMAIN_FILL"]="1"
import io, contextlib
with contextlib.redirect_stdout(io.StringIO()):
    import analyze as A
y=A.y; col=A.col; F=A.F; auc=A.auc
base=[max(a,b) for a,b in zip(col("base","hint",0),col("base","fact",0))]
sh=col("sep_hint","hint"); sf=col("sep_fact","fact"); ab=col("abbr","abbr"); c3=col("c3","leak"); ov=col("over","over")
pf=[f["paren_frac"] for f in F]; pn=[min(f["paren_n"],4)/4 for f in F]
mean=lambda *cs:[sum(v)/len(v) for v in zip(*cs)]
mx=lambda *cs:[max(v) for v in zip(*cs)]
rk=lambda s:[sorted(s).index(v)/len(s) for v in s]   # 順位化（尺度差を吸収）
cands={
 "現行 max(base hint,fact)":base,
 "sep_hint 単独(選択肢のみ・1問)":sh,
 "max(sep_hint, sep_fact)":mx(sh,sf),
 "max(sep_hint, abbr)":mx(sh,ab),
 "mean(sep_hint, abbr)":mean(sh,ab),
 "mean(sep_hint, abbr, c3 leak)":mean(sh,ab,c3),
 "mean(sep_hint, abbr, 括弧率)":mean(sh,ab,pf),
 "順位平均(sep_hint, abbr)":mean(rk(sh),rk(ab)),
 "順位平均(sep_hint, abbr, 括弧率)":mean(rk(sh),rk(ab),rk(pf)),
 "順位平均(sep_hint, abbr, over)":mean(rk(sh),rk(ab),rk(ov)),
 "regex 括弧率 単独(無料)":pf,
}
print(f"n = pos {sum(y)} / neg {len(y)-sum(y)}（domain補完の正例を除外済み）\n")
print(f"{'':<34}{'AUC':>6}  {'vs現行(95%CI)':<24}{'P':>5} | 効率 連続/帯0.1/帯0.25")
for n_,s in cands.items():
    a=auc(y,s); d=""; p=""
    if n_!=list(cands)[0]:
        lo,hi,pw=A.boot_diff(s,base); d=f"{a-auc(y,base):+.3f} [{lo:+.3f},{hi:+.3f}]"; p=f"{pw:.2f}"
    print(f"{n_:<34}{a:>6.3f}  {d:<24}{p:>5} | {A.efficiency(s):.2f} / {A.efficiency(s,0.1):.2f} / {A.efficiency(s,0.25):.2f}")
print("\n相関(スピアマン風): sep_hint×regex括弧率 =", round(auc([1 if v>0.5 else 0 for v in rk(sh)], pf),3), "(参考: 括弧率でsep_hint上位半分を当てるAUC)")
