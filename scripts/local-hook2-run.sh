#!/bin/bash
# ローカルフック2実行(systemd timerから呼ばれる)
# 各ピンサイクルの15分前に妥当性チェックを走らせ、hook(30分前)と並走してトークンを消化する。
# claimed.json で重複処理は防がれるため hook と同時実行可能。
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
AWS="$AWS" bash "$REPO/scripts/pull-claude-creds.sh" "$S3" || true
"$AWS" s3 sync "s3://$S3/state/"        "$SC/state/"        --quiet 2>/dev/null || true
"$AWS" s3 sync "s3://$S3/instructions/" "$SC/instructions/" --quiet 2>/dev/null || true

# deadline = 次のピン(=トークン回復)の3分前で停止
# hook2はピンの15分前に発動するため +15分 = 回復時刻。ここから MARGIN_MIN 分手前に置く。
MARGIN_MIN=3
DRAIN_MIN=$((15 - MARGIN_MIN))
DEADLINE=$(date -d "+${DRAIN_MIN} min" +%H:%M 2>/dev/null || date -v+${DRAIN_MIN}M +%H:%M)
log "妥当性チェック実行(hook2) (deadline=$DEADLINE / 回復の${MARGIN_MIN}分前で停止)..."
cd "$REPO"
FARGATE_MODE=1 bash prompts/night-prompts/scripts/02-check-validity.sh -n 100 -D "$DEADLINE"
EC=$?
log "完了 (exit $EC)"

# push
[ -f ~/.claude/.credentials.json ] && \
    "$AWS" s3 cp ~/.claude/.credentials.json "s3://$S3/claude-auth/.credentials.json" --quiet 2>/dev/null || true
[ -f ~/.claude.json ] && \
    "$AWS" s3 cp ~/.claude.json "s3://$S3/claude-auth/.claude.json" --quiet 2>/dev/null || true
"$AWS" s3 sync "$SC/state/"        "s3://$S3/state/"        --quiet 2>/dev/null || true
"$AWS" s3 sync "$SC/instructions/" "s3://$S3/instructions/" --quiet 2>/dev/null || true
"$AWS" s3 sync "$SC/logs/"         "s3://$S3/night-logs/"   --quiet 2>/dev/null || true
exit $EC
