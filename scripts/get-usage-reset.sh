#!/bin/bash
# claude の "/usage" を実行し、現在セッション(5時間枠)のトークン回復時刻を
# Asia/Tokyo の ISO8601 (YYYY-MM-DDTHH:MM:SS) で標準出力する。
#
#   /usage 出力例:
#     Current session: 85% used · resets Sep 8, 11pm (Asia/Tokyo)
#     Current week (all models): 36% used · resets Sep 12, 3am (Asia/Tokyo)
#   → "Current session" 行の resets 時刻 (Sep 8, 11pm) を返す。
#
# print モードでは制限行の取得が非同期で稀に欠落するため数回リトライする。
# 全リトライで取得/解析に失敗したら何も出力せず exit 1（呼び出し側で now+5h フォールバック）。
set -uo pipefail
export TZ=Asia/Tokyo

CLAUDE_BIN=$( { [ -x /usr/local/bin/claude ] && echo /usr/local/bin/claude; } || command -v claude 2>/dev/null || echo claude )
ATTEMPTS="${USAGE_ATTEMPTS:-3}"

_parse() {  # $1 = "Sep 8, 11pm" 等 → ISO を出力 / 失敗で exit 1
  python3 - "$1" << 'PY'
import sys, re
from datetime import datetime, timedelta
s = sys.argv[1].strip()
now = datetime.now()
m = re.match(r'(?:([A-Za-z]{3,})\s+(\d{1,2}),\s*)?(\d{1,2})(?::(\d{2}))?\s*([ap])m', s, re.I)
if not m:
    sys.exit(1)
mon, day, hh, mm, ap = m.groups()
hh = int(hh); mm = int(mm or 0); ap = ap.lower()
if ap == 'p' and hh != 12: hh += 12
if ap == 'a' and hh == 12: hh = 0
if mon:
    months = {mo: i for i, mo in enumerate(
        ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'], 1)}
    mn = months.get(mon[:3].lower())
    if not mn:
        sys.exit(1)
    dt = datetime(now.year, mn, int(day), hh, mm)
    if (dt - now).days < -60:          # 年跨ぎ補正 (12月に翌1月reset)
        dt = dt.replace(year=now.year + 1)
else:
    dt = now.replace(hour=hh, minute=mm, second=0, microsecond=0)
    if dt <= now:
        dt = dt + timedelta(days=1)
print(dt.strftime('%Y-%m-%dT%H:%M:%S'))
PY
}

# コンテナ(非対話・設定なし)では ping と同様に権限プロンプト回避が必要。
# ローカル検証時は CLAUDE_USAGE_FLAGS="" で上書きできる。
USAGE_FLAGS="${CLAUDE_USAGE_FLAGS:---dangerously-skip-permissions}"

for _ in $(seq 1 "$ATTEMPTS"); do
  OUT=$(timeout "${USAGE_TIMEOUT:-45}" "$CLAUDE_BIN" $USAGE_FLAGS -p "/usage" 2>/dev/null) || continue
  RESET=$(printf '%s\n' "$OUT" \
    | sed -E 's/\x1b\[[0-9;]*[A-Za-z]//g' \
    | grep -iE "current session" | head -n1 \
    | sed -nE 's/.*[Rr]esets[[:space:]]+([^(]*)\(.*/\1/p' \
    | sed -E 's/[[:space:]]+$//')
  [ -n "$RESET" ] || continue
  ISO=$(_parse "$RESET") || continue
  [ -n "$ISO" ] && { printf '%s\n' "$ISO"; exit 0; }
done
exit 1
