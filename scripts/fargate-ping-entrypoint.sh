#!/bin/bash
# Fargate ピン専用エントリーポイント
# 5時間ごとのClaudeセッション確認(ping)だけを実行する。夜間バッチ本体・フックは
# ローカル側で実行する(このコンテナはピンとアラートのみ)。
#   - OAuth資格情報をS3から復元 → run-prompts.sh をPING_ONLYで実行 → 履歴/資格情報を書戻し
#   - at() 一時変更後はメインスケジュールをcronへ自動リセット

set -uo pipefail

export FARGATE_MODE=1     # 自己スケジュール(旧systemd)を抑止
export PING_ONLY=1        # 夜間バッチをスキップしpingのみ
export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"
export TZ=Asia/Tokyo

S3_BUCKET="${FARGATE_STATE_BUCKET:?FARGATE_STATE_BUCKET 環境変数が未設定です}"
PROMPTS_DIR="/app/prompts"

log() { printf '[%s] %s\n' "$(date '+%H:%M:%S')" "$*"; }

# メール設定(ping失敗アラート用)
if [ -n "${SMTP_USER:-}" ] && [ -n "${SMTP_PASS:-}" ]; then
    cat > ~/.mugenknock_mail.conf << EOF
SMTP_USER=${SMTP_USER}
SMTP_PASS=${SMTP_PASS}
SMTP_TO=${SMTP_TO:-mugenknock@gmail.com}
EOF
fi

# OAuth資格情報をS3から復元(サブスク認証・S3が単一の正)
log "Claude OAuth資格情報を復元中..."
mkdir -p ~/.claude
aws s3 cp "s3://${S3_BUCKET}/claude-auth/.credentials.json" ~/.claude/.credentials.json --quiet 2>/dev/null \
    && log "  .credentials.json 復元OK" || log "  ⚠️ .credentials.json が見つかりません"
aws s3 cp "s3://${S3_BUCKET}/claude-auth/.claude.json" ~/.claude.json --quiet 2>/dev/null || true
unset ANTHROPIC_API_KEY

# 履歴(.claude_history/.last_run)をS3から取得(追記のため)
for f in .last_run .last_run_date .claude_history .night_history; do
    aws s3 cp "s3://${S3_BUCKET}/meta/${f}" "${PROMPTS_DIR}/${f}" --quiet 2>/dev/null || true
done

log "ピン実行 (PING_ONLY)..."
bash /app/prompts/run-prompts.sh --run
EXIT_CODE=$?
log "ピン完了 (exit ${EXIT_CODE})"

# 資格情報(更新後トークン)と履歴を書き戻し
[ -f ~/.claude/.credentials.json ] && \
    aws s3 cp ~/.claude/.credentials.json "s3://${S3_BUCKET}/claude-auth/.credentials.json" --quiet 2>/dev/null || true
[ -f ~/.claude.json ] && \
    aws s3 cp ~/.claude.json "s3://${S3_BUCKET}/claude-auth/.claude.json" --quiet 2>/dev/null || true
for f in .last_run .last_run_date .claude_history .night_history; do
    [ -f "${PROMPTS_DIR}/${f}" ] && \
        aws s3 cp "${PROMPTS_DIR}/${f}" "s3://${S3_BUCKET}/meta/${f}" --quiet 2>/dev/null || true
done
# run-logs も保存(ct log -d 用)
aws s3 sync "${PROMPTS_DIR}/logs/" "s3://${S3_BUCKET}/run-logs/" --quiet 2>&1 || true

# ── ドリフト: 次回ピンを now+5h に再スケジュール ──
# Claudeの5時間利用ウィンドウに合わせ、ピン完了ごとに次回を「今から5時間後」に置く。
# これにより毎回5時間間隔で、実行時刻は毎日少しずつずれていく(要件どおり)。
# State=DISABLED(ct cancel)のときは再スケジュールしない(停止を尊重)。
SCHEDULE_NAME="${FARGATE_PROJECT:-mugenknock}-ping"
REGION="${AWS_DEFAULT_REGION:-ap-northeast-1}"
STATE=$(aws scheduler get-schedule --name "$SCHEDULE_NAME" --region "$REGION" \
    --query "State" --output text 2>/dev/null || echo "")
if [ "$STATE" = "ENABLED" ]; then
    # セッション開始時刻(=今)の分を一桁切り捨て(10分単位に切り下げ)して +5時間。
    # Claudeのトークン枠が「開始時刻の分を切り捨て + 5時間」でリセットされる仕様に合わせる
    # (例: 15:23開始→15:20判定→20:20回復)。実行の所要時間(秒)の累積ズレも同時に解消。
    NEXT=$(python3 -c "from datetime import datetime,timedelta; n=datetime.now(); b=n.replace(minute=(n.minute//10)*10, second=0, microsecond=0); print((b+timedelta(hours=5)).strftime('%Y-%m-%dT%H:%M:%S'))")
    TARGET_JSON=$(aws scheduler get-schedule --name "$SCHEDULE_NAME" --region "$REGION" \
        --output json 2>/dev/null | python3 -c "import sys,json; print(json.dumps(json.load(sys.stdin)['Target']))")
    aws scheduler update-schedule --name "$SCHEDULE_NAME" \
        --schedule-expression "at(${NEXT})" --schedule-expression-timezone "Asia/Tokyo" \
        --flexible-time-window '{"Mode":"OFF"}' --state ENABLED --target "$TARGET_JSON" \
        --region "$REGION" > /dev/null 2>&1 \
    && log "次回ピン: at(${NEXT}) (now+5h ドリフト)" || log "⚠️ 次回ピン再スケジュール失敗"
else
    log "スケジュールがENABLEDでない(${STATE:-不明})ため再スケジュールしない"
fi

log "完了"
exit $EXIT_CODE
