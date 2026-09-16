#!/bin/bash
# ~/.config/mugenknock/usage.log (log-usage.sh が5hピンごとに追記するJSONL) を解析し、
# 「週間制限(Current week)が5時間セッション何回分に相当するか」を推定表示する。
#
# 方法:
#   - week_reset を「時単位に丸めて」週を識別(/usage の 02:59↔03:00 ゆらぎで週が割れるのを防ぐ)。
#   - 各ピンの week_pct の前回差分(>0)を「その5hサイクルでの週間消費%」とみなす。
#   - ただし週% が天井付近(飽和)のサイクルは差分が頭打ちで過小になるのでレート推定から除外。
#   - 未飽和サイクルの平均消費% から 100/avg = 週に収まる5hサイクル数を推定。
#   - 直近週の現在 week% と残%から、残り何サイクル分かも出す。
SAT_THRESHOLD="${SAT_THRESHOLD:-95}"   # week% がこれ以上のサイクルは飽和とみなしレート推定から除外
set -uo pipefail
export TZ=Asia/Tokyo
LOG="${USAGE_LOG:-$HOME/.config/mugenknock/usage.log}"
[ -f "$LOG" ] || { echo "ログがまだありません: $LOG"; exit 0; }

LOG="$LOG" SAT_THRESHOLD="$SAT_THRESHOLD" python3 - <<'PY'
import os, json
from collections import defaultdict
from datetime import datetime, timedelta

SAT = float(os.environ.get('SAT_THRESHOLD', '95'))

rows = []
with open(os.environ['LOG']) as f:
    for line in f:
        line = line.strip()
        if not line:
            continue
        try:
            rows.append(json.loads(line))
        except Exception:
            pass

rows = [r for r in rows if 'week_pct' in r]
if not rows:
    print("week_pct を含むレコードがまだありません。")
    raise SystemExit(0)

rows.sort(key=lambda r: r.get('ts', ''))

def week_key(r):
    # week_reset を時単位に丸めて週を識別(02:59↔03:00 のゆらぎ吸収)。無ければ '?'。
    wr = r.get('week_reset')
    if not wr:
        return '?'
    try:
        dt = datetime.strptime(wr, '%Y-%m-%dT%H:%M:%S')
        dt = (dt + timedelta(minutes=30)).replace(minute=0, second=0, microsecond=0)
        return dt.strftime('%Y-%m-%d %H:%M')
    except Exception:
        return wr

weeks = defaultdict(list)
for r in rows:
    weeks[week_key(r)].append(r)

print(f"== 使用量ログ解析 ({len(rows)} ピン / {len(weeks)} 週) ==\n")

good_deltas = []    # レート推定に使う未飽和サイクルの差分
for wk in sorted(weeks):
    grp = weeks[wk]
    deltas, sat_skipped = [], 0
    prev = None
    for r in grp:
        cur = r['week_pct']
        if prev is not None:
            d = cur - prev
            if d > 0:                     # 週跨ぎ/丸め誤差の負値は除外
                if cur >= SAT:            # 天井付近=飽和 → レート推定から除外
                    sat_skipped += 1
                else:
                    deltas.append(d)
        prev = cur
    first, last = grp[0]['week_pct'], grp[-1]['week_pct']
    line = f"週(reset {wk}): {len(grp):>2}ピン  week% {first:>3}→{last:<3}"
    if deltas:
        avg = sum(deltas) / len(deltas)
        line += f"  未飽和1サイクル平均 {avg:.1f}%  → 週あたり約 {100/avg:.0f} サイクル"
        good_deltas += deltas
    if sat_skipped:
        line += f"  (飽和{sat_skipped}件を除外)"
    print(line)

print()
CYCLES_PER_WEEK = 168 / 5   # =33.6。週に存在する5h枠の理論上限
if good_deltas:
    avg = sum(good_deltas) / len(good_deltas)
    mx = max(good_deltas); mn = min(good_deltas)
    projected = CYCLES_PER_WEEK * avg   # このペースを1週間続けた場合の週末到達%
    print(f"[推定] 現在ペースの 5hサイクルあたり週間消費: 平均 {avg:.1f}% (最小 {mn}% / 最大 {mx}%, n={len(good_deltas)}, 飽和除外)")
    print(f"       → このペースを1週間(≈33.6サイクル)続けると週末 約 {projected:.0f}% 到達")
    if projected < 100:
        print(f"         = 週間上限に当たらず余裕あり(ct on で使用量を増やせる)")
    else:
        print(f"         = 週間上限に到達する見込み(ct off で絞る方向)")
else:
    print("[推定] 未飽和サイクルの差分がまだありません(データ待ち)。")

# 直近の現状
last = rows[-1]
wp = last['week_pct']
print()
print(f"[現在] week {wp}% 使用 (reset {last.get('week_reset','?')}, ts {last.get('ts','?')})")
if good_deltas:
    rem = 100 - wp
    print(f"       残り {rem}% → あと約 {rem/avg:.1f} サイクル分の余力")
PY
