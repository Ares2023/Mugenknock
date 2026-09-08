#!/bin/bash
# claude "/usage" のトークン回復時刻を読み、EventBridgeの次回ピンをその時刻(+バッファ)へ
# 微調整する。ピン10分後に走る local-postping から毎サイクル呼ばれる想定。
#
# 設計(堅牢性): Fargateピン側は完了ごとに now+5h を必ず設定する(バックボーン=連鎖の担保)。
# 本スクリプトはその上に「実際の回復時刻」を best-effort で上書きするだけ。取得失敗・
# 通信不良・PC停止時は何もせず、バックボーンの now+5h がそのまま生きる(=途切れない)。
#
# スキップ条件(いずれも「触らない」= now+5h を尊重):
#   - スケジュールが DISABLED (ct cancel)
#   - /usage 取得失敗
#   - 回復時刻+バッファが過去/直近(now+1分以内) … 誤検出防止
set -uo pipefail
export TZ=Asia/Tokyo

AWS="${AWS:-/home/yuzuki/local/bin/aws}"
REGION="${AWS_REGION:-ap-northeast-1}"
PROJECT="${FARGATE_PROJECT:-mugenknock}"
SCHEDULE_NAME="${PROJECT}-ping"
BUFFER_MIN="${PING_BUFFER_MIN:-2}"
REPO="${REPO:-/home/yuzuki/aws-quiz-app}"
ACCT=$("$AWS" sts get-caller-identity --query Account --output text --region "$REGION" 2>/dev/null || echo "")
S3="${PROJECT}-fargate-state-${ACCT}"

log() { printf '[%s] %s\n' "$(date '+%H:%M:%S')" "$*"; }

STATE=$("$AWS" scheduler get-schedule --name "$SCHEDULE_NAME" --region "$REGION" \
  --query "State" --output text 2>/dev/null || echo "")
if [ "$STATE" = "DISABLED" ]; then
  log "スケジュール停止中(DISABLED) → /usage調整はスキップ"; exit 0
fi

RESET_ISO=$(bash "$REPO/scripts/get-usage-reset.sh" 2>/dev/null || true)
if [ -z "$RESET_ISO" ]; then
  log "⚠️ /usage の回復時刻を取得できず → now+5h(バックボーン)のまま"; exit 0
fi

# 回復時刻 + バッファ。過去/直近なら誤検出とみなしスキップ。
NEXT=$(BUFFER_MIN="$BUFFER_MIN" python3 - "$RESET_ISO" << 'PY'
import os, sys
from datetime import datetime, timedelta
n = datetime.now()
dt = datetime.strptime(sys.argv[1], '%Y-%m-%dT%H:%M:%S') + timedelta(minutes=int(os.environ['BUFFER_MIN']))
print(dt.strftime('%Y-%m-%dT%H:%M:%S') if dt > n + timedelta(minutes=1) else "")
PY
)
if [ -z "$NEXT" ]; then
  log "⚠️ /usage回復時刻(${RESET_ISO/T/ })が過去/直近 → now+5h のまま"; exit 0
fi

# 既に同じ時刻なら何もしない(冪等・無駄な更新回避)
CUR=$("$AWS" scheduler get-schedule --name "$SCHEDULE_NAME" --region "$REGION" \
  --query "ScheduleExpression" --output text 2>/dev/null || echo "")
if [ "$CUR" = "at(${NEXT})" ]; then
  log "次回ピンは既に at(${NEXT}) (/usage一致) → 変更なし"; exit 0
fi

TARGET_JSON=$("$AWS" scheduler get-schedule --name "$SCHEDULE_NAME" --region "$REGION" \
  --output json 2>/dev/null | python3 -c "import sys,json; print(json.dumps(json.load(sys.stdin)['Target']))")
if "$AWS" scheduler update-schedule --name "$SCHEDULE_NAME" \
    --schedule-expression "at(${NEXT})" --schedule-expression-timezone "Asia/Tokyo" \
    --flexible-time-window '{"Mode":"OFF"}' --state ENABLED --target "$TARGET_JSON" \
    --region "$REGION" > /dev/null 2>&1; then
  log "✓ 次回ピンを /usage回復時刻に微調整: at(${NEXT}) (回復${RESET_ISO/T/ }+${BUFFER_MIN}分)"
  printf '%s' "$NEXT" | "$AWS" s3 cp - "s3://${S3}/meta/.next_reset" --region "$REGION" --quiet 2>/dev/null || true
else
  log "⚠️ 次回ピン微調整の更新に失敗 → now+5h のまま"
fi
