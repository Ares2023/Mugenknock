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

# deadline = 次のピンサイクル(=トークン回復)の数分前で止める。
# フックはピンの30分前に発動するため +30分 = 回復時刻ちょうど。ここから MARGIN_MIN 分手前に置く。
# -D は「判定時に走行中のチャンクは完走」する仕様なので、そのはみ出し(1チャンク≒数分)も
# 回復前に収まるよう余裕を確保し、トークン回復後に妥当性チェックが継続しないようにする。
MARGIN_MIN=5
DRAIN_MIN=$((30 - MARGIN_MIN))
DEADLINE=$(date -d "+${DRAIN_MIN} min" +%H:%M 2>/dev/null || date -v+${DRAIN_MIN}M +%H:%M)
log "妥当性チェック実行 (deadline=$DEADLINE / 回復の${MARGIN_MIN}分前で停止)..."
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
