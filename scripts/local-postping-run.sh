#!/bin/bash
# 各Fargateピンの約10分後にローカルで発火する。
#   1. sync-local-schedule.sh を再実行し、次サイクルの hook/postping を再アーム(自己追従)
#   2. 夜間サイクル(RUN_NIGHT=1)なら夜間バッチを実行(当日未実行のときのみ・二重実行防止)
# RUN_NIGHT は sync-local-schedule がこのタイマーを仕込む際に埋め込む。
set -uo pipefail
export TZ=Asia/Tokyo
export PATH="/usr/local/bin:/usr/bin:/bin:$HOME/local/bin:$PATH"

REPO=/home/yuzuki/aws-quiz-app
AWS=/home/yuzuki/local/bin/aws
ACCT=$("$AWS" sts get-caller-identity --query Account --output text 2>/dev/null || echo "")
S3="mugenknock-fargate-state-${ACCT}"

log() { printf '[%s] %s\n' "$(date '+%H:%M:%S')" "$*"; }

# 1. 次サイクルへ再同期(EventBridgeの新しい次回ピンを読み直す)
log "再同期(sync-local-schedule)..."
bash "$REPO/scripts/sync-local-schedule.sh" || true

# 2. 夜間バッチ(夜間サイクルかつ当日未実行のみ)
if [ "${RUN_NIGHT:-0}" = "1" ]; then
  TODAY=$(date +%Y-%m-%d)
  LRD=$("$AWS" s3 cp "s3://$S3/meta/.last_run_date" - --quiet 2>/dev/null | tr -d '\n' || echo "")
  if [ "$LRD" != "$TODAY" ]; then
    log "夜間サイクル → 夜間バッチ実行"
    bash "$REPO/scripts/local-night-run.sh"
  else
    log "夜間バッチは本日実行済み($LRD) → スキップ"
  fi
else
  log "夜間サイクルでない → 再同期のみ"
fi
