import os; os.environ["EXCL_DOMAIN_FILL"]="1"; from pathlib import Path
os.environ.setdefault("OUT", str(Path(__file__).resolve().parent.parent / "holdout"))
import io, contextlib
buf = io.StringIO()
with contextlib.redirect_stdout(buf):
    import analyze as A
print(buf.getvalue().strip())
y=A.y; col=A.col; F=A.F; auc=A.auc
base=[max(a,b) for a,b in zip(col("base","hint",0),col("base","fact",0))]
sh=col("sep_hint","hint"); ab=col("abbr","abbr"); pf=[f["paren_frac"] for f in F]
mean=lambda *cs:[sum(v)/len(v) for v in zip(*cs)]
cand=mean(sh,ab,pf)
print(f"未見データ: positive {sum(y)} / negative {len(y)-sum(y)}\n")
rows=[("現行 max(hint,fact) [2問1コール]",base,None),
      ("【事前固定】mean(sep_hint, abbr, 括弧率)",cand,base),
      ("  部品: sep_hint 単独",sh,base),("  部品: abbr 単独",ab,base),("  部品: 正規表現 括弧率 単独",pf,base)]
print(f"{'':<40}{'AUC':>6}  {'95%CI':<15} {'vs現行(95%CI)':<24}{'P':>5} | 効率 連続/帯0.1/帯0.25")
for n_,s,ref in rows:
    a=auc(y,s); lo,hi=A.boot_ci(s); d=p=""
    if ref is not None:
        dl,dh,pw=A.boot_diff(s,ref); d=f"{a-auc(y,ref):+.3f} [{dl:+.3f},{dh:+.3f}]"; p=f"{pw:.2f}"
    print(f"{n_:<40}{a:>6.3f}  [{lo:.3f},{hi:.3f}]  {d:<24}{p:>5} | {A.efficiency(s):.2f} / {A.efficiency(s,0.1):.2f} / {A.efficiency(s,0.25):.2f}")
print("\n欠陥種別ごとの AUC（その欠陥を持つ positive vs 全 negative）:")
negs=[i for i in range(len(y)) if y[i]==0]
for k in ["choices","choiceExplanations","explanation"]:
    pi=[i for i in range(len(y)) if y[i]==1 and k in A.kinds[A.ids[i]]]
    ll=[1]*len(pi)+[0]*len(negs)
    f=lambda s:auc(ll,[s[i] for i in pi]+[s[i] for i in negs])
    print(f"  {k:<20} n={len(pi):<3} 現行 {f(base):.3f} → 固定候補 {f(cand):.3f}")
