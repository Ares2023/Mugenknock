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

# ログ書き戻し用ディレクトリを用意 (イメージに同梱されないため)
mkdir -p "$NIGHT_LOG_DIR"

# 1. メール設定をファイルに書き出し (env → ~/.mugenknock_mail.conf)
if [ -n "${SMTP_USER:-}" ] && [ -n "${SMTP_PASS:-}" ]; then
    cat > ~/.mugenknock_mail.conf << EOF
SMTP_USER=${SMTP_USER}
SMTP_PASS=${SMTP_PASS}
SMTP_TO=${SMTP_TO:-mugenknock@gmail.com}
EOF
    log "mail config written"
fi

# 1b. Claude OAuth 資格情報をS3から復元 (サブスク認証: APIキーは使わない)
log "Claude OAuth資格情報を復元中..."
mkdir -p ~/.claude
CRED_OK=0
aws s3 cp "s3://${S3_BUCKET}/claude-auth/.credentials.json" ~/.claude/.credentials.json --quiet 2>/dev/null \
    && log "  .credentials.json 復元OK" && CRED_OK=1 \
    || log "  ⚠️ .credentials.json が見つかりません"
aws s3 cp "s3://${S3_BUCKET}/claude-auth/.claude.json" ~/.claude.json --quiet 2>/dev/null || true
unset ANTHROPIC_API_KEY

# 1c. 認証情報プリチェック: 無効なら通知してスキップ
_check_claude_creds() {
    [ "$CRED_OK" -eq 0 ] && return 1
    python3 -c "
import json, sys
try:
    d = json.load(open('$HOME/.claude/.credentials.json'))
    o = d.get('claudeAiOauth', {})
    ok = bool(o.get('refreshToken') or o.get('accessToken'))
    sys.exit(0 if ok else 1)
except:
    sys.exit(1)
" 2>/dev/null
}

_send_auth_alert() {
    local reason="$1"
    [ -z "${SMTP_USER:-}" ] || [ -z "${SMTP_PASS:-}" ] && return 0
    python3 -c "
import smtplib, ssl
from email.mime.text import MIMEText
msg = MIMEText('''$reason

対処方法:
  1. ローカルで claude /login を実行
  2. ./scripts/fargate-upload-auth.sh を実行
  3. または次の自動同期(Stopフック)まで待つ

Fargate実行: \$(date '+%Y-%m-%d %H:%M JST')
''', 'plain', 'utf-8')
msg['Subject'] = '[mugenknock] Fargate: Claude認証エラー - 再ログインが必要です'
msg['From'] = '${SMTP_USER}'
msg['To'] = '${SMTP_TO:-mugenknock@gmail.com}'
ctx = ssl.create_default_context()
with smtplib.SMTP('smtp.gmail.com', 587) as s:
    s.starttls(context=ctx)
    s.login('${SMTP_USER}', '${SMTP_PASS}')
    s.sendmail('${SMTP_USER}', '${SMTP_TO:-mugenknock@gmail.com}', msg.as_string())
print('auth_alert_sent')
" 2>/dev/null && log "  認証エラー通知メールを送信しました" || log "  ⚠️ 通知メール送信失敗"
}

if ! _check_claude_creds; then
    MSG="S3にClaude OAuth認証情報が存在しないか無効です。夜間バッチをスキップします。"
    [ "$CRED_OK" -eq 0 ] && MSG="S3にClaude OAuth認証情報が見つかりません (claude-auth/.credentials.json)。夜間バッチをスキップします。"
    log "❌ $MSG"
    _send_auth_alert "$MSG"
    exit 2
fi
log "  認証情報OK (refreshToken確認済み)"

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

# 4. 状態をS3へ書き戻し (更新後のOAuthトークンも書き戻す)
log "S3へ状態を書き戻し中..."
[ -f ~/.claude/.credentials.json ] && \
    aws s3 cp ~/.claude/.credentials.json "s3://${S3_BUCKET}/claude-auth/.credentials.json" --quiet 2>/dev/null || true
[ -f ~/.claude.json ] && \
    aws s3 cp ~/.claude.json "s3://${S3_BUCKET}/claude-auth/.claude.json" --quiet 2>/dev/null || true
aws s3 sync "${STATE_DIR}/"        "s3://${S3_BUCKET}/state/"        --quiet 2>&1 || true
aws s3 sync "${INST_DIR}/"         "s3://${S3_BUCKET}/instructions/"  --quiet 2>&1 || true
aws s3 sync "${NIGHT_LOG_DIR}/"    "s3://${S3_BUCKET}/night-logs/"    --quiet 2>&1 || true
aws s3 sync "${PROMPTS_DIR}/logs/" "s3://${S3_BUCKET}/run-logs/"      --quiet 2>&1 || true
for f in .last_run .last_run_date .claude_history .night_history; do
    [ -f "${PROMPTS_DIR}/${f}" ] && \
        aws s3 cp "${PROMPTS_DIR}/${f}" "s3://${S3_BUCKET}/meta/${f}" --quiet 2>/dev/null || true
done

# 5. at() 一時変更後は通常のcronスケジュールに自動リセット (メイン+フック)
_PROJECT="${FARGATE_PROJECT:-mugenknock}"
SCHEDULE_NAME="${_PROJECT}-night-batch"
HOOK_SCHEDULE_NAME="${_PROJECT}-night-hook"
REGION="${AWS_DEFAULT_REGION:-ap-northeast-1}"
DEFAULT_SCHEDULE_EXPR="cron(2 0,5,10,15,20 * * ? *)"
HOOK_SCHEDULE_EXPR="cron(32 23,4,9,14,19 * * ? *)"

CURRENT_EXPR=$(aws scheduler get-schedule \
    --name "$SCHEDULE_NAME" --region "$REGION" \
    --query "ScheduleExpression" --output text 2>/dev/null || echo "")
if [[ "$CURRENT_EXPR" == at\(* ]]; then
    log "at() 一時変更を検出 → cronスケジュールにリセット中..."
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
    && log "メインスケジュール: ${DEFAULT_SCHEDULE_EXPR} に戻しました" \
    || log "⚠️ メインスケジュールリセット失敗"

    # フックも at() または COMPLETED になっているので同時にリセット
    HOOK_SCHED_JSON=$(aws scheduler get-schedule \
        --name "$HOOK_SCHEDULE_NAME" --region "$REGION" \
        --output json 2>/dev/null || echo "")
    if [ -n "$HOOK_SCHED_JSON" ]; then
        HOOK_TARGET_JSON=$(echo "$HOOK_SCHED_JSON" \
            | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps(d['Target']))")
        aws scheduler update-schedule \
            --name "$HOOK_SCHEDULE_NAME" \
            --schedule-expression "$HOOK_SCHEDULE_EXPR" \
            --schedule-expression-timezone "Asia/Tokyo" \
            --flexible-time-window '{"Mode":"OFF"}' \
            --state ENABLED \
            --target "$HOOK_TARGET_JSON" \
            --region "$REGION" > /dev/null 2>&1 \
        && log "フックスケジュール: ${HOOK_SCHEDULE_EXPR} に戻しました" \
        || log "⚠️ フックスケジュールリセット失敗"
    fi
fi

log "完了"
exit $EXIT_CODE
