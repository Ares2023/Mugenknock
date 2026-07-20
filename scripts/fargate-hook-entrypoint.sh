#!/bin/bash
# フック用エントリーポイント
# メイン実行の30分前に起動し、02-check-validity.sh を実行してトークンを消化する
# デッドラインは起動から30分後（= メイン実行開始時刻）を動的計算

set -uo pipefail

export FARGATE_MODE=1
export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"
export TZ=Asia/Tokyo

S3_BUCKET="${FARGATE_STATE_BUCKET:?FARGATE_STATE_BUCKET 環境変数が未設定です}"
SCRIPTS_DIR="/app/prompts/night-prompts/scripts"
STATE_DIR="$SCRIPTS_DIR/state"
INST_DIR="$SCRIPTS_DIR/instructions"
NIGHT_LOG_DIR="$SCRIPTS_DIR/logs"

log() { printf '[%s] %s\n' "$(date '+%H:%M:%S')" "$*"; }

# メール設定
if [ -n "${SMTP_USER:-}" ] && [ -n "${SMTP_PASS:-}" ]; then
    cat > ~/.mugenknock_mail.conf << EOF
SMTP_USER=${SMTP_USER}
SMTP_PASS=${SMTP_PASS}
SMTP_TO=${SMTP_TO:-mugenknock@gmail.com}
EOF
fi

# S3から状態を同期 (validityチェックは state/ と instructions/ が必要)
log "S3から状態を同期中..."
aws s3 sync "s3://${S3_BUCKET}/state/"        "${STATE_DIR}/"  --quiet 2>&1 || true
aws s3 sync "s3://${S3_BUCKET}/instructions/" "${INST_DIR}/"   --quiet 2>&1 || true

# デッドラインを動的に計算: 起動から30分後 = メイン実行開始時刻
DEADLINE=$(python3 -c "
from datetime import datetime, timedelta, timezone
JST = timezone(timedelta(hours=9))
t = datetime.now(JST) + timedelta(minutes=30)
print(t.strftime('%H:%M'))
")
log "妥当性確認開始 (n=100, deadline=${DEADLINE})"

bash /app/prompts/night-prompts/scripts/02-check-validity.sh -n 100 -D "$DEADLINE"
EXIT_CODE=$?

# 状態を書き戻し
log "S3へ状態を書き戻し中..."
aws s3 sync "${STATE_DIR}/"     "s3://${S3_BUCKET}/state/"      --quiet 2>&1 || true
aws s3 sync "${NIGHT_LOG_DIR}/" "s3://${S3_BUCKET}/night-logs/"  --quiet 2>&1 || true

log "完了 (exit ${EXIT_CODE})"
exit $EXIT_CODE
