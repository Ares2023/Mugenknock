#!/bin/bash
# ローカルフック実行(systemd timerから呼ばれる)
# 各ピンサイクルの30分前に妥当性チェック(02-check-validity)を走らせ、トークンリセット
# 直前に残量を消化する。資格情報・状態はS3と同期する。
set -uo pipefail
export TZ=Asia/Tokyo
export PATH="/usr/local/bin:/usr/bin:/bin:$HOME/local/bin:$PATH"

REPO=/home/yuzuki/aws-quiz-app
AWS=/home/yuzuki/local/bin/aws
ACCT=$("$AWS" sts get-caller-identity --query Account --output text 2>/dev/null)
S3="mugenknock-fargate-state-${ACCT}"
SC="$REPO/prompts/night-prompts/scripts"

log() { printf '[%s] %s\n' "$(date '+%H:%M:%S')" "$*"; }

mkdir -p ~/.claude "$SC/state" "$SC/instructions" "$SC/logs"

# pull
"$AWS" s3 cp "s3://$S3/claude-auth/.credentials.json" ~/.claude/.credentials.json --quiet 2>/dev/null || true
"$AWS" s3 cp "s3://$S3/claude-auth/.claude.json"       ~/.claude.json               --quiet 2>/dev/null || true
"$AWS" s3 sync "s3://$S3/state/"        "$SC/state/"        --quiet 2>/dev/null || true
"$AWS" s3 sync "s3://$S3/instructions/" "$SC/instructions/" --quiet 2>/dev/null || true

# deadline = 30分後(= 次のピンサイクル時刻)
DEADLINE=$(date -d '+30 min' +%H:%M 2>/dev/null || date -v+30M +%H:%M)
log "妥当性チェック実行 (deadline=$DEADLINE)..."
cd "$REPO"
FARGATE_MODE=1 bash prompts/night-prompts/scripts/02-check-validity.sh -n 100 -D "$DEADLINE"
EC=$?
log "完了 (exit $EC)"

# push
[ -f ~/.claude/.credentials.json ] && "$AWS" s3 cp ~/.claude/.credentials.json "s3://$S3/claude-auth/.credentials.json" --quiet 2>/dev/null || true
[ -f ~/.claude.json ] && "$AWS" s3 cp ~/.claude.json "s3://$S3/claude-auth/.claude.json" --quiet 2>/dev/null || true
"$AWS" s3 sync "$SC/state/"        "s3://$S3/state/"        --quiet 2>/dev/null || true
"$AWS" s3 sync "$SC/instructions/" "s3://$S3/instructions/" --quiet 2>/dev/null || true
"$AWS" s3 sync "$SC/logs/"         "s3://$S3/night-logs/"   --quiet 2>/dev/null || true
exit $EC
