#!/bin/bash
# レポート専用エントリーポイント
# 99-send-report.sh だけを実行して夜間レポートメールを送る（検証・手動送信用）。
# 夜間パイプライン本体（生成/監査等）は走らせないためトークン消費が小さい。

set -uo pipefail

export FARGATE_MODE=1
export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"
export TZ=Asia/Tokyo

S3_BUCKET="${FARGATE_STATE_BUCKET:?FARGATE_STATE_BUCKET 環境変数が未設定です}"
SCRIPTS_DIR="/app/prompts/night-prompts/scripts"
STATE_DIR="$SCRIPTS_DIR/state"
NIGHT_LOG_DIR="$SCRIPTS_DIR/logs"
PROMPTS_DIR="/app/prompts"

log() { printf '[%s] %s\n' "$(date '+%H:%M:%S')" "$*"; }

mkdir -p "$NIGHT_LOG_DIR" "$STATE_DIR" "$PROMPTS_DIR/logs"

# メール設定
if [ -n "${SMTP_USER:-}" ] && [ -n "${SMTP_PASS:-}" ]; then
    cat > ~/.mugenknock_mail.conf << EOF
SMTP_USER=${SMTP_USER}
SMTP_PASS=${SMTP_PASS}
SMTP_TO=${SMTP_TO:-mugenknock@gmail.com}
EOF
    log "mail config written"
fi

# Claude OAuth 資格情報を復元（資格チェックは月曜のみだが念のため）
log "Claude OAuth資格情報を復元中..."
mkdir -p ~/.claude
aws s3 cp "s3://${S3_BUCKET}/claude-auth/.credentials.json" ~/.claude/.credentials.json --quiet 2>/dev/null \
    && log "  .credentials.json 復元OK" || log "  ⚠️ .credentials.json が見つかりません"
aws s3 cp "s3://${S3_BUCKET}/claude-auth/.claude.json" ~/.claude.json --quiet 2>/dev/null || true
unset ANTHROPIC_API_KEY

# レポートが参照する状態・ログをS3から同期
log "S3から状態/ログを同期中..."
aws s3 sync "s3://${S3_BUCKET}/state/"      "${STATE_DIR}/"       --quiet 2>&1 || true
aws s3 sync "s3://${S3_BUCKET}/night-logs/" "${NIGHT_LOG_DIR}/"   --quiet 2>&1 || true
aws s3 sync "s3://${S3_BUCKET}/run-logs/"   "${PROMPTS_DIR}/logs/" --quiet 2>&1 || true

log "レポート送信 (99-send-report.sh)..."
bash "${SCRIPTS_DIR}/99-send-report.sh"
EXIT_CODE=$?

# ログを書き戻し
log "S3へログを書き戻し中..."
aws s3 sync "${NIGHT_LOG_DIR}/" "s3://${S3_BUCKET}/night-logs/" --quiet 2>&1 || true

log "完了 (exit ${EXIT_CODE})"
exit $EXIT_CODE
