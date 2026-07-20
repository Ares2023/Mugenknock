#!/bin/bash
# Fargate コンテナエントリーポイント
# S3から状態同期 → run-prompts.sh 実行 → S3へ状態書き戻し

set -uo pipefail

export FARGATE_MODE=1
export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"
export TZ=Asia/Tokyo

S3_BUCKET="${FARGATE_STATE_BUCKET:?FARGATE_STATE_BUCKET 環境変数が未設定です}"
SCRIPTS_DIR="/app/prompts/night-prompts/scripts"
STATE_DIR="$SCRIPTS_DIR/state"
INST_DIR="$SCRIPTS_DIR/instructions"
NIGHT_LOG_DIR="$SCRIPTS_DIR/logs"
PROMPTS_DIR="/app/prompts"

log() { printf '[%s] %s\n' "$(date '+%H:%M:%S')" "$*"; }

# 1. メール設定をファイルに書き出し (env → ~/.mugenknock_mail.conf)
if [ -n "${SMTP_USER:-}" ] && [ -n "${SMTP_PASS:-}" ]; then
    cat > ~/.mugenknock_mail.conf << EOF
SMTP_USER=${SMTP_USER}
SMTP_PASS=${SMTP_PASS}
SMTP_TO=${SMTP_TO:-mugenknock@gmail.com}
EOF
    log "mail config written"
fi

# 2. S3から状態を同期 (前回実行の続きから)
log "S3から状態を同期中 (s3://${S3_BUCKET})..."
aws s3 sync "s3://${S3_BUCKET}/state/"        "${STATE_DIR}/"     --quiet 2>&1 || true
aws s3 sync "s3://${S3_BUCKET}/instructions/" "${INST_DIR}/"      --quiet 2>&1 || true
aws s3 sync "s3://${S3_BUCKET}/night-logs/"   "${NIGHT_LOG_DIR}/" --quiet 2>&1 || true
for f in .last_run .last_run_date .claude_history .night_history; do
    aws s3 cp "s3://${S3_BUCKET}/meta/${f}" "${PROMPTS_DIR}/${f}" --quiet 2>/dev/null || true
done
log "S3同期完了"

# 3. 夜間バッチ実行
log "夜間バッチ開始..."
bash /app/prompts/run-prompts.sh --run
EXIT_CODE=$?
log "夜間バッチ完了 (exit ${EXIT_CODE})"

# 4. 状態をS3へ書き戻し
log "S3へ状態を書き戻し中..."
aws s3 sync "${STATE_DIR}/"        "s3://${S3_BUCKET}/state/"        --quiet 2>&1 || true
aws s3 sync "${INST_DIR}/"         "s3://${S3_BUCKET}/instructions/"  --quiet 2>&1 || true
aws s3 sync "${NIGHT_LOG_DIR}/"    "s3://${S3_BUCKET}/night-logs/"    --quiet 2>&1 || true
aws s3 sync "${PROMPTS_DIR}/logs/" "s3://${S3_BUCKET}/run-logs/"      --quiet 2>&1 || true
for f in .last_run .last_run_date .claude_history .night_history; do
    [ -f "${PROMPTS_DIR}/${f}" ] && \
        aws s3 cp "${PROMPTS_DIR}/${f}" "s3://${S3_BUCKET}/meta/${f}" --quiet 2>/dev/null || true
done

# 5. at() 一時変更後は通常のcronスケジュールに自動リセット
SCHEDULE_NAME="${FARGATE_PROJECT:-mugenknock}-night-batch"
REGION="${AWS_DEFAULT_REGION:-ap-northeast-1}"
DEFAULT_SCHEDULE_EXPR="cron(2 0,5,10,15,20 * * ? *)"
CURRENT_EXPR=$(aws scheduler get-schedule \
    --name "$SCHEDULE_NAME" --region "$REGION" \
    --query "ScheduleExpression" --output text 2>/dev/null || echo "")
if [[ "$CURRENT_EXPR" == at\(* ]]; then
    log "at() 一時変更を検出 → ${DEFAULT_SCHEDULE_EXPR} にリセット中..."
    TARGET_JSON=$(aws scheduler get-schedule \
        --name "$SCHEDULE_NAME" --region "$REGION" \
        --output json 2>/dev/null \
        | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps(d['Target']))")
    aws scheduler update-schedule \
        --name "$SCHEDULE_NAME" \
        --schedule-expression "$DEFAULT_SCHEDULE_EXPR" \
        --schedule-expression-timezone "Asia/Tokyo" \
        --flexible-time-window '{"Mode":"OFF"}' \
        --state ENABLED \
        --target "$TARGET_JSON" \
        --region "$REGION" > /dev/null 2>&1 \
    && log "スケジュール: ${DEFAULT_SCHEDULE_EXPR} に戻しました" \
    || log "⚠️ スケジュールリセット失敗 (IAM権限を確認してください)"
fi

log "完了"
exit $EXIT_CODE
