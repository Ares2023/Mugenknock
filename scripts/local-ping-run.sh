#!/bin/bash
# ローカルピン実行(mugenknock-localping.timer から発火)。旧Fargateピンのローカル版。
#   1. claudeセッションを軽く叩いて起こす(既存の run-prompts.sh --run を PING_ONLY で再利用)
#   2. /usage のトークン回復時刻から次回ピン時刻を決め、ローカル時計に書く
#   3. sync-local-schedule.sh で localping 自身と衛星(hook/hook2/postping)を再アーム
# Fargate/EventBridge には一切依存しない(ローカル自己完結・PCが動いている間だけ回る)。
set -uo pipefail
export TZ=Asia/Tokyo
export PATH="/usr/local/bin:/usr/bin:/bin:$HOME/local/bin:$PATH"

REPO=/home/yuzuki/aws-quiz-app
CFG="$HOME/.config/mugenknock"
CLOCK="$CFG/next_ping"
DISABLED_FLAG="$CFG/ping_disabled"
BUFFER_MIN="${PING_BUFFER_MIN:-2}"

log() { printf '[%s] %s\n' "$(date '+%H:%M:%S')" "$*"; }
mkdir -p "$CFG"

# ct cancel 中は何もしない(停止を尊重)
[ -f "$DISABLED_FLAG" ] && { log "停止中(ct cancel) → ピンしない"; exit 0; }

# ── 1. ピン実行 ──
# FARGATE_MODE=1: 旧systemd自己スケジュールを抑止 / PING_ONLY=1: 夜間バッチをskip
# (夜間バッチは postping 側が夜間サイクルで実行する)。ローカルの ~/.claude 資格情報を直接使う。
log "ローカルピン実行..."
FARGATE_MODE=1 PING_ONLY=1 bash "$REPO/prompts/run-prompts.sh" --run
EC=$?
log "ピン完了 (exit $EC)"

# ── 2. 次回ピン時刻 = /usage回復時刻+バッファ、失敗時 now+5h ──
RESET=$(bash "$REPO/scripts/get-usage-reset.sh" 2>/dev/null || true)
NEXT=$(BUFFER_MIN="$BUFFER_MIN" RESET="$RESET" python3 -c "
import os
from datetime import datetime, timedelta
n = datetime.now()
r = os.environ.get('RESET', '').strip()
dt = None
if r:
    dt = datetime.strptime(r, '%Y-%m-%dT%H:%M:%S') + timedelta(minutes=int(os.environ['BUFFER_MIN']))
    if dt <= n + timedelta(minutes=1):
        dt = None
if dt is None:
    b = n.replace(minute=(n.minute // 10) * 10, second=0, microsecond=0)
    dt = b + timedelta(hours=5)
print(dt.strftime('%Y-%m-%dT%H:%M:%S'))
")
printf '%s' "$NEXT" > "$CLOCK"
if [ -n "$RESET" ]; then
  log "次回ピン: ${NEXT/T/ } (/usage回復 ${RESET/T/ } +${BUFFER_MIN}分)"
else
  log "次回ピン: ${NEXT/T/ } (now+5h フォールバック・/usage取得失敗)"
fi

# ── 3. localping/衛星タイマーを再アーム ──
bash "$REPO/scripts/sync-local-schedule.sh" || true
exit $EC
