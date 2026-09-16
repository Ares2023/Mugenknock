#!/bin/bash
# claude "/usage" を1回だけ実行し、
#   (1) 使用量スナップショットを JSONL で ~/.config/mugenknock/usage.log に追記
#   (2) 現在セッション(5時間枠)のトークン回復時刻を ISO8601(JST) で標準出力
# する。= get-usage-reset.sh の上位互換(ログ副作用つき)。local-ping-run.sh から呼ぶ。
#
# 意図: 週間制限(Current week)が5時間セッション何回分に相当するかを、
#       5時間ピンごとの week% の推移から測定するためのデータ取り。
#       これを基に ct on を起動する時期を動的に決める(別系統)。
#
# /usage 出力例:
#   Current session: 8% used · resets Sep 11, 12:09am (Asia/Tokyo)
#   Current week (all models): 90% used · resets Sep 12, 2:59am (Asia/Tokyo)
#   Last 24h · 500 requests · 34 sessions
#   Last 7d · 1669 requests · 160 sessions
#
# print モードでは制限行が稀に欠落するため数回リトライ。
# 全リトライで session 行が取れなければ何も出力せず exit 1(呼び出し側で now+5h フォールバック)。
set -uo pipefail
export TZ=Asia/Tokyo

CFG="$HOME/.config/mugenknock"
LOG="${USAGE_LOG:-$CFG/usage.log}"
mkdir -p "$CFG"

CLAUDE_BIN=$( { [ -x /usr/local/bin/claude ] && echo /usr/local/bin/claude; } || command -v claude 2>/dev/null || echo claude )
ATTEMPTS="${USAGE_ATTEMPTS:-3}"
# コンテナ(非対話)では権限プロンプト回避が必要。ローカル検証時は CLAUDE_USAGE_FLAGS="" で上書き。
USAGE_FLAGS="${CLAUDE_USAGE_FLAGS:---dangerously-skip-permissions}"

for _ in $(seq 1 "$ATTEMPTS"); do
  OUT=$(timeout "${USAGE_TIMEOUT:-45}" "$CLAUDE_BIN" $USAGE_FLAGS -p "/usage" 2>/dev/null) || continue
  CLEAN=$(printf '%s\n' "$OUT" | sed -E 's/\x1b\[[0-9;]*[A-Za-z]//g')
  printf '%s\n' "$CLEAN" | grep -qiE "current session" || continue

  ISO=$(LOG="$LOG" CLEAN="$CLEAN" python3 - <<'PY'
import sys, os, re, json
from datetime import datetime, timedelta
text = os.environ.get('CLEAN', '')
now = datetime.now()

def parse_reset(s):
    s = (s or '').strip()
    m = re.match(r'(?:([A-Za-z]{3,})\s+(\d{1,2}),\s*)?(\d{1,2})(?::(\d{2}))?\s*([ap])m', s, re.I)
    if not m:
        return None
    mon, day, hh, mm, ap = m.groups()
    hh = int(hh); mm = int(mm or 0); ap = ap.lower()
    if ap == 'p' and hh != 12: hh += 12
    if ap == 'a' and hh == 12: hh = 0
    if mon:
        months = {mo: i for i, mo in enumerate(
            ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'], 1)}
        mn = months.get(mon[:3].lower())
        if not mn:
            return None
        dt = datetime(now.year, mn, int(day), hh, mm)
        if (dt - now).days < -60:          # 年跨ぎ補正
            dt = dt.replace(year=now.year + 1)
    else:
        dt = now.replace(hour=hh, minute=mm, second=0, microsecond=0)
        if dt <= now:
            dt = dt + timedelta(days=1)
    return dt.strftime('%Y-%m-%dT%H:%M:%S')

rec = {'ts': now.strftime('%Y-%m-%dT%H:%M:%S')}

session_reset = None
m = re.search(r'current session:\s*(\d+)%\s*used.*?resets\s*([^(]*)\(', text, re.I)
if m:
    rec['session_pct'] = int(m.group(1))
    session_reset = parse_reset(m.group(2))
    rec['session_reset'] = session_reset

m = re.search(r'current week\s*\(all models\):\s*(\d+)%\s*used.*?resets\s*([^(]*)\(', text, re.I)
if m:
    rec['week_pct'] = int(m.group(1))
    rec['week_reset'] = parse_reset(m.group(2))

# Opus 専用週枠(将来出る場合)も拾う
m = re.search(r'current week\s*\(opus\):\s*(\d+)%\s*used.*?resets\s*([^(]*)\(', text, re.I)
if m:
    rec['week_opus_pct'] = int(m.group(1))
    rec['week_opus_reset'] = parse_reset(m.group(2))

m = re.search(r'last\s*24h.*?(\d+)\s*requests.*?(\d+)\s*sessions', text, re.I)
if m:
    rec['d1_requests'] = int(m.group(1)); rec['d1_sessions'] = int(m.group(2))
m = re.search(r'last\s*7d.*?(\d+)\s*requests.*?(\d+)\s*sessions', text, re.I)
if m:
    rec['d7_requests'] = int(m.group(1)); rec['d7_sessions'] = int(m.group(2))

if 'session_pct' not in rec:
    sys.exit(1)

with open(os.environ['LOG'], 'a') as f:
    f.write(json.dumps(rec, ensure_ascii=False) + '\n')

print(session_reset or '')
PY
) || continue

  # session 行のログは取れた。reset が解析できていれば ISO を返して成功終了。
  [ -n "$ISO" ] && { printf '%s\n' "$ISO"; exit 0; }
  # ログは残ったが reset 未解析 → 呼び出し側フォールバックに任せる
  exit 1
done
exit 1
