#!/bin/bash
# ローカル時計(~/.config/mugenknock/next_ping)を読み、systemd userタイマーを
# その「次回ピン時刻」に同期する。EventBridge/Fargateには依存しない(ローカル自己完結)。
#
# 構成(5時間サイクルをローカルで再現):
#   - mugenknock-localping : 次回ピン時刻ちょうど(ピン実行→次回時刻を再計算して自己再アーム)
#   - mugenknock-hook      : 次回ピンの30分前(妥当性確認・トークン消化)   ※フック有効時のみ
#   - mugenknock-hook2     : 次回ピンの15分前(問題生成・hookと並走)        ※フック有効時のみ
#   - mugenknock-postping  : 次回ピンの10分後(再同期+夜間サイクルなら夜間バッチ) ※常時
# すべて one-shot 絶対時刻タイマー。Persistent=true でPC停止中に逃した発火は次回起動時に走る。
#
# watchdog: 時計が無い/過去なら now+5h に張り直す(連鎖切れ・PC復帰直後の自己修復)。
set -uo pipefail

REPO=/home/yuzuki/aws-quiz-app
UNIT_DIR="$HOME/.config/systemd/user"
CFG="$HOME/.config/mugenknock"
CLOCK="$CFG/next_ping"
DISABLED_FLAG="$CFG/ping_disabled"   # ct cancel で作成(完全停止)
HOOKS_FLAG="$CFG/hooks_enabled"      # ct on/off が管理(フックのみ切替)
_hooks_on() { [ -f "$HOOKS_FLAG" ]; }

mkdir -p "$UNIT_DIR" "$CFG"

# ── ct cancel(完全停止): 全タイマー停止して終了 ──
if [ -f "$DISABLED_FLAG" ]; then
  systemctl --user disable --now \
    mugenknock-localping.timer mugenknock-hook.timer mugenknock-hook2.timer mugenknock-postping.timer 2>/dev/null || true
  echo "完全停止中(ct cancel) → 全ローカルタイマー停止"
  exit 0
fi

# ── 次回ピン時刻を時計から読む。無い/過去なら now+5h に張り直す(watchdog) ──
CLOCK_VAL=$(cat "$CLOCK" 2>/dev/null | tr -d '\n' || echo "")
LAST_RUN_DATE=$(cat "$REPO/prompts/.last_run_date" 2>/dev/null | tr -d '\n' || echo "")

read -r NEXT_DT RUN_NIGHT STALE < <(CLOCK_VAL="$CLOCK_VAL" LAST_RUN_DATE="$LAST_RUN_DATE" python3 << 'PYEOF'
import os, re
from datetime import datetime, timedelta
now = datetime.now()
clock = os.environ.get('CLOCK_VAL', '').strip()
last_run_date = os.environ.get('LAST_RUN_DATE', '').strip()
def next5(base):
    return base.replace(minute=(base.minute // 10) * 10, second=0, microsecond=0) + timedelta(hours=5)
dt = None
if re.match(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$', clock):
    dt = datetime.strptime(clock, '%Y-%m-%dT%H:%M:%S')
stale = 0
if dt is None or dt <= now + timedelta(minutes=1):
    dt = next5(now); stale = 1
run_night = 1 if (dt.hour < 5 and last_run_date != dt.strftime('%Y-%m-%d')) else 0
print(dt.strftime('%Y-%m-%dT%H:%M:%S'), run_night, stale)
PYEOF
)

# watchdog発火時は時計を書き直す
if [ "$STALE" = "1" ]; then
  printf '%s' "$NEXT_DT" > "$CLOCK"
  echo "⚠️ 時計が無い/過去 → now+5h に張り直し: ${NEXT_DT/T/ }"
fi

# 各タイマーの絶対時刻
PING_CAL=$(python3 -c "from datetime import datetime; print(datetime.strptime('$NEXT_DT','%Y-%m-%dT%H:%M:%S').strftime('%Y-%m-%d %H:%M:%S'))")
HOOK_CAL=$(python3 -c "from datetime import datetime,timedelta; print((datetime.strptime('$NEXT_DT','%Y-%m-%dT%H:%M:%S')-timedelta(minutes=30)).strftime('%Y-%m-%d %H:%M:00'))")
HOOK2_CAL=$(python3 -c "from datetime import datetime,timedelta; print((datetime.strptime('$NEXT_DT','%Y-%m-%dT%H:%M:%S')-timedelta(minutes=15)).strftime('%Y-%m-%d %H:%M:00'))")
POST_CAL=$(python3 -c "from datetime import datetime,timedelta; print((datetime.strptime('$NEXT_DT','%Y-%m-%dT%H:%M:%S')+timedelta(minutes=10)).strftime('%Y-%m-%d %H:%M:00'))")

# ── localping タイマー(one-shot): 次回ピン時刻に local-ping-run を発火 ──
cat > "$UNIT_DIR/mugenknock-localping.service" << EOF
[Unit]
Description=mugenknock local ping (self-rescheduling 5h cycle)
After=network-online.target

[Service]
Type=oneshot
WorkingDirectory=${REPO}
ExecStart=/bin/bash -lc '${REPO}/scripts/local-ping-run.sh'
EOF
cat > "$UNIT_DIR/mugenknock-localping.timer" << EOF
[Unit]
Description=mugenknock local ping timer

[Timer]
OnCalendar=${PING_CAL}
Persistent=true

[Install]
WantedBy=timers.target
EOF

# ── hook タイマー(one-shot): ピン30分前 ──
cat > "$UNIT_DIR/mugenknock-hook.service" << EOF
[Unit]
Description=mugenknock local validity hook (before ping)

[Service]
Type=oneshot
WorkingDirectory=${REPO}
ExecStart=/bin/bash -lc '${REPO}/scripts/local-hook-run.sh'
EOF
cat > "$UNIT_DIR/mugenknock-hook.timer" << EOF
[Unit]
Description=mugenknock hook timer (local clock -30min)

[Timer]
OnCalendar=${HOOK_CAL}
Persistent=true

[Install]
WantedBy=timers.target
EOF

# ── hook2 タイマー(one-shot): ピン15分前 ──
cat > "$UNIT_DIR/mugenknock-hook2.service" << EOF
[Unit]
Description=mugenknock local generate hook (before ping)

[Service]
Type=oneshot
WorkingDirectory=${REPO}
ExecStart=/bin/bash -lc '${REPO}/scripts/local-hook2-run.sh'
EOF
cat > "$UNIT_DIR/mugenknock-hook2.timer" << EOF
[Unit]
Description=mugenknock hook2 timer (local clock -15min)

[Timer]
OnCalendar=${HOOK2_CAL}
Persistent=true

[Install]
WantedBy=timers.target
EOF

# 夜間バッチはフック有効時のみ。フック無効なら夜間サイクルでも走らせない。
if _hooks_on; then EFF_RUN_NIGHT="$RUN_NIGHT"; else EFF_RUN_NIGHT=0; fi

# ── postping タイマー(one-shot): ピン10分後。再同期 +(夜間サイクル かつ フック有効なら)夜間バッチ ──
# ※ postping はフック無効でも常時アーム(連鎖のwatchdog兼再アーム)。
cat > "$UNIT_DIR/mugenknock-postping.service" << EOF
[Unit]
Description=mugenknock post-ping resync (+ night batch on night cycle)

[Service]
Type=oneshot
WorkingDirectory=${REPO}
Environment=RUN_NIGHT=${EFF_RUN_NIGHT}
ExecStart=/bin/bash -lc '${REPO}/scripts/local-postping-run.sh'
EOF
cat > "$UNIT_DIR/mugenknock-postping.timer" << EOF
[Unit]
Description=mugenknock post-ping timer (local clock +10min)

[Timer]
OnCalendar=${POST_CAL}
Persistent=true

[Install]
WantedBy=timers.target
EOF

systemctl --user daemon-reload

# localping と postping は常時アーム。one-shot絶対時刻は restart で新OnCalendarを反映。
for t in mugenknock-localping.timer mugenknock-postping.timer; do
  systemctl --user enable "$t" >/dev/null 2>&1 || true
  systemctl --user restart "$t" 2>/dev/null || systemctl --user start "$t" 2>/dev/null || true
done

# hook / hook2 はフック有効時のみアーム。無効なら停止。
if _hooks_on; then
  systemctl --user enable mugenknock-hook.timer mugenknock-hook2.timer >/dev/null 2>&1 || true
  systemctl --user restart mugenknock-hook.timer mugenknock-hook2.timer 2>/dev/null || \
    systemctl --user start mugenknock-hook.timer mugenknock-hook2.timer 2>/dev/null || true
  HOOK_STATE="有効 (arm: hook=${HOOK_CAL} / hook2=${HOOK2_CAL})"
else
  systemctl --user disable --now mugenknock-hook.timer mugenknock-hook2.timer 2>/dev/null || true
  HOOK_STATE="無効 (ct on で有効化) — hook/hook2 は停止"
fi
loginctl enable-linger "$USER" 2>/dev/null || true

echo "✓ ローカルタイマーを同期 (時計=${CLOCK})"
echo "  次回ピン : ${NEXT_DT/T/ }  (localping)"
echo "  postping : ${POST_CAL}  (RUN_NIGHT=${EFF_RUN_NIGHT}) ※常時"
echo "  フック   : ${HOOK_STATE}"
