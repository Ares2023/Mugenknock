#!/bin/bash
# EventBridgeのピンスケジュール(=トークンリセット基準時刻の唯一の正)を読み、
# ローカルsystemd userタイマー(夜間バッチ/フック)をその時刻に同期生成する。
#   - フック: 各ピンサイクルの30分前(トークン消化)
#   - 夜間バッチ: 5時前(<05:00)のサイクル時刻(生成/検証/監査/レポート/日めくり)
# ct set/resume/cancel 後や日次で呼ばれ、EventBridge変更にローカルを追従させる。
set -euo pipefail

AWS=/home/yuzuki/local/bin/aws
REGION=ap-northeast-1
PROJECT=mugenknock
SCHEDULE_NAME="${PROJECT}-ping"
REPO=/home/yuzuki/aws-quiz-app
UNIT_DIR="$HOME/.config/systemd/user"

EXPR=$("$AWS" scheduler get-schedule --name "$SCHEDULE_NAME" --region "$REGION" \
  --query "ScheduleExpression" --output text 2>/dev/null || echo "")
STATE=$("$AWS" scheduler get-schedule --name "$SCHEDULE_NAME" --region "$REGION" \
  --query "State" --output text 2>/dev/null || echo "")
if [ -z "$EXPR" ]; then
  echo "❌ EventBridgeスケジュール($SCHEDULE_NAME)が取得できません"; exit 1
fi

# スケジュール式 → フック/夜間のOnCalendar行を算出
CAL=$(python3 - "$EXPR" << 'PYEOF'
import sys, re
from datetime import datetime, timedelta
expr = sys.argv[1].strip()
mains = []  # (hour, minute, date_or_None)
m = re.match(r'cron\((\d+)\s+([\d,]+)\s', expr)
a = re.match(r'at\((\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})\)', expr)
if m:
    minute = int(m.group(1))
    for h in m.group(2).split(','):
        mains.append((int(h), minute, None))
elif a:
    mains.append((int(a.group(2)), int(a.group(3)), a.group(1)))
else:
    # rate() 等は非対応。既定cronにフォールバック。
    for h in (0,5,10,15,20):
        mains.append((h, 2, None))

hook_lines, night_lines = [], []
for (h, mi, d) in mains:
    base = datetime(2000,1,1,h,mi)
    hook = base - timedelta(minutes=30)
    if d:  # at(): 絶対日時
        maind = datetime.strptime(d, '%Y-%m-%d').replace(hour=h, minute=mi)
        hookd = maind - timedelta(minutes=30)
        hook_lines.append(hookd.strftime('%Y-%m-%d %H:%M:00'))
        if h < 5:
            night_lines.append(maind.strftime('%Y-%m-%d %H:%M:00'))
    else:  # cron: 毎日
        hook_lines.append('*-*-* %02d:%02d:00' % (hook.hour, hook.minute))
        if h < 5:
            night_lines.append('*-*-* %02d:%02d:00' % (h, mi))

print("HOOK")
for l in hook_lines: print(l)
print("NIGHT")
for l in night_lines: print(l)
PYEOF
)

HOOK_CALS=$(echo "$CAL" | sed -n '/^HOOK$/,/^NIGHT$/p' | grep -vE '^HOOK$|^NIGHT$')
NIGHT_CALS=$(echo "$CAL" | sed -n '/^NIGHT$/,$p' | grep -vE '^NIGHT$')

mkdir -p "$UNIT_DIR"

_write_timer() {
  local name="$1" desc="$2" exec="$3" cals="$4"
  cat > "$UNIT_DIR/${name}.service" << EOF
[Unit]
Description=${desc}

[Service]
Type=oneshot
WorkingDirectory=${REPO}
ExecStart=/bin/bash -lc '${exec}'
EOF
  {
    echo "[Unit]"
    echo "Description=${desc} timer (synced from EventBridge ${SCHEDULE_NAME})"
    echo ""
    echo "[Timer]"
    while IFS= read -r c; do [ -n "$c" ] && echo "OnCalendar=${c}"; done <<< "$cals"
    echo "Persistent=true"
    echo ""
    echo "[Install]"
    echo "WantedBy=timers.target"
  } > "$UNIT_DIR/${name}.timer"
}

_write_timer "mugenknock-hook"  "mugenknock local validity hook" \
  "${REPO}/scripts/local-hook-run.sh"  "$HOOK_CALS"
_write_timer "mugenknock-night" "mugenknock local night batch" \
  "${REPO}/scripts/local-night-run.sh" "$NIGHT_CALS"

systemctl --user daemon-reload
if [ "$STATE" = "DISABLED" ]; then
  systemctl --user disable --now mugenknock-hook.timer mugenknock-night.timer 2>/dev/null || true
  echo "スケジュール停止中(DISABLED) → ローカルタイマーも停止"
else
  systemctl --user enable --now mugenknock-hook.timer mugenknock-night.timer
fi
loginctl enable-linger "$USER" 2>/dev/null || true

echo "✓ ローカルタイマーを EventBridge(${EXPR}) に同期"
echo "  hook :"; echo "$HOOK_CALS"  | sed 's/^/    /'
echo "  night:"; echo "$NIGHT_CALS" | sed 's/^/    /'
systemctl --user list-timers 'mugenknock-*' --all --no-legend 2>/dev/null | grep -E 'hook|night' || true
