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
RAN_NIGHT=0
if [ "${RUN_NIGHT:-0}" = "1" ]; then
  TODAY=$(date +%Y-%m-%d)
  LRD=$("$AWS" s3 cp "s3://$S3/meta/.last_run_date" - --quiet 2>/dev/null | tr -d '\n' || echo "")
  if [ "$LRD" != "$TODAY" ]; then
    log "夜間サイクル → 夜間バッチ実行"
    bash "$REPO/scripts/local-night-run.sh"
    RAN_NIGHT=1
  else
    log "夜間バッチは本日実行済み($LRD) → スキップ"
  fi
else
  log "夜間サイクルでない → 再同期のみ"
fi

# 3. 夜間バッチ後の再アーム(連鎖切れ防止)
# 手順1の再アームは「次回ピン+10分」に仕込むが、夜間バッチは1時間以上かかるため
# その時刻が自分自身の実行中に来ることがある。systemd の oneshot は実行中のユニットを
# 二重起動しないためその発火は捨てられ、以降 Trigger:n/a のまま連鎖が止まる。
# （2026-07-30 09:23 の実行で発生。09:40 armed → バッチが 10:29 まで走り発火を消失）
# バッチ完了後に必ず再同期し、未来の時刻で armed な状態にしておく。
if [ "$RAN_NIGHT" = "1" ]; then
  log "夜間バッチ後の再同期(連鎖切れ防止)..."
  bash "$REPO/scripts/sync-local-schedule.sh" || true
fi
