#!/bin/bash
# ct — mugenknock Fargate 夜間バッチ 管理コマンド
#
# usage: ct [command]
#   (なし)        スケジュール状況を表示
#   set HH:MM    次回実行を HH:MM に変更 (JST, 今日 or 明日)
#   resume       定期スケジュール (5時間ごと) に戻す
#   cancel       スケジュールを一時停止
#   run          今すぐ手動実行 (Fargate タスク起動)
#   log          実行履歴を表示
#   log -f       最新実行ログ (CloudWatch)
#   log -n       夜間スクリプト処理履歴
#   log -d DATE  指定日ログ (YYYYMMDD)
#   -l           最終実行時刻のみ出力
#   -n           次回予定時刻のみ出力
#   -h           このヘルプ

set -uo pipefail

AWS=/home/yuzuki/local/bin/aws
REGION=ap-northeast-1
PROJECT="mugenknock"
SCHEDULE_NAME="${PROJECT}-night-batch"
HOOK_SCHEDULE_NAME="${PROJECT}-night-hook"
CLUSTER="${PROJECT}-batch"
TASK_FAMILY="${PROJECT}-night-batch"
LOG_GROUP="/ecs/${PROJECT}-night-batch"
MAIN_CRON="cron(2 0,5,10,15,20 * * ? *)"
HOOK_CRON="cron(32 23,4,9,14,19 * * ? *)"

# ── ヘルパー ──────────────────────────────────────────────────
_ACCOUNT_ID=""
_account_id() {
  [ -n "$_ACCOUNT_ID" ] && { echo "$_ACCOUNT_ID"; return; }
  _ACCOUNT_ID=$("$AWS" sts get-caller-identity \
    --query Account --output text --region "$REGION" 2>/dev/null)
  echo "$_ACCOUNT_ID"
}
_s3_bucket() { echo "${PROJECT}-fargate-state-$(_account_id)"; }

_get_schedule() {
  "$AWS" scheduler get-schedule \
    --name "$SCHEDULE_NAME" --region "$REGION" --output json 2>/dev/null
}

_get_hook_schedule() {
  "$AWS" scheduler get-schedule \
    --name "$HOOK_SCHEDULE_NAME" --region "$REGION" --output json 2>/dev/null
}

_get_target_json() {
  _get_schedule | python3 -c \
    "import sys,json; d=json.load(sys.stdin); print(json.dumps(d['Target']))" 2>/dev/null
}

_get_hook_target_json() {
  _get_hook_schedule | python3 -c \
    "import sys,json; d=json.load(sys.stdin); print(json.dumps(d['Target']))" 2>/dev/null
}

_s3_get() {
  local key="$1"
  "$AWS" s3 cp "s3://$(_s3_bucket)/${key}" /dev/stdout --quiet 2>/dev/null || true
}

# ── ステータス表示 ────────────────────────────────────────────
show_status() {
  local sched; sched=$(_get_schedule)
  if [ -z "$sched" ]; then
    echo "❌ スケジュール未設定 (fargate-setup.sh を実行してください)"
    return 1
  fi

  local state expr last next_str
  state=$(echo "$sched" | python3 -c \
    "import sys,json; d=json.load(sys.stdin); print(d.get('State','UNKNOWN'))" 2>/dev/null)
  expr=$(echo "$sched"  | python3 -c \
    "import sys,json; d=json.load(sys.stdin); print(d.get('ScheduleExpression',''))" 2>/dev/null)
  last=$(_s3_get "meta/.last_run" | tr -d '\n')
  [ -z "$last" ] && last="never"

  next_str=$(python3 - "$expr" "$last" "$state" << 'PYEOF'
import sys
from datetime import datetime, timedelta, timezone

expr, last_str, state = sys.argv[1], sys.argv[2], sys.argv[3]
JST = timezone(timedelta(hours=9))
now = datetime.now(JST).replace(tzinfo=None)

def fmt_diff(dt):
    diff = dt - now
    s = int(diff.total_seconds())
    if s < 0:      return f"{dt.strftime('%m/%d %H:%M')} (overdue)"
    elif s < 3600: return f"{dt.strftime('%H:%M')} ({s//60}m後)"
    else:
        h, m = divmod(s//60, 60)
        return f"{dt.strftime('%m/%d %H:%M')} ({h}h{m:02d}m後)"

if state == "DISABLED":
    print("停止中 (ct resume で再開)")
elif expr.startswith("at("):
    try:
        at = datetime.strptime(expr[3:-1], "%Y-%m-%dT%H:%M:%S")
        print(fmt_diff(at) + "  ← 一時変更")
    except:
        print(expr)
elif expr.startswith("rate("):
    if last_str.strip() == "never":
        print(f"{expr}  (最終実行なし)")
    else:
        try:
            last = datetime.strptime(last_str.strip(), "%Y-%m-%d %H:%M:%S")
            base = last.replace(minute=(last.minute//10)*10, second=0, microsecond=0)
            nxt  = base + timedelta(hours=5)
            print(fmt_diff(nxt))
        except:
            print(f"{expr}  (最終実行 {last_str})")
else:
    print(expr)
PYEOF
)

  printf "last  %s\nnext  %s\n" "$last" "$next_str"

  # フックスケジュール状況
  local hook_sched; hook_sched=$(_get_hook_schedule)
  if [ -n "$hook_sched" ]; then
    local hook_state hook_expr
    hook_state=$(echo "$hook_sched" | python3 -c \
      "import sys,json; d=json.load(sys.stdin); print(d.get('State','UNKNOWN'))" 2>/dev/null)
    hook_expr=$(echo "$hook_sched"  | python3 -c \
      "import sys,json; d=json.load(sys.stdin); print(d.get('ScheduleExpression',''))" 2>/dev/null)
    if [ "$hook_state" = "DISABLED" ]; then
      printf "hook  停止中\n"
    elif [[ "$hook_expr" == at\(* ]]; then
      printf "hook  %s  ← 一時変更\n" "$(echo "$hook_expr" | sed 's/at(//;s/)//')"
    else
      printf "hook  %s\n" "$hook_expr"
    fi
  fi

  [ "$state" = "DISABLED" ] && return 0

  # ローカルのsystemdタイマーが残っていれば警告
  if systemctl --user list-timers "claude-cycle.timer" --all --no-legend 2>/dev/null | grep -q "claude-cycle"; then
    echo ""
    echo "⚠️  ローカルのsystemdタイマーが残っています"
    echo "   停止: systemctl --user stop claude-cycle.timer"
    echo "         systemctl --user disable claude-cycle.timer"
  fi
}

# ── ct set HH:MM ──────────────────────────────────────────────
set_schedule() {
  local hhmm="$1"
  # メイン時刻とフック時刻(30分前)を計算
  read -r target_iso hook_iso < <(python3 - "$hhmm" << 'PYEOF'
import sys
from datetime import datetime, timedelta, timezone
JST = timezone(timedelta(hours=9))
now = datetime.now(JST).replace(tzinfo=None)
try:
    t = datetime.strptime(sys.argv[1].strip(), "%H:%M").time()
    target = datetime.combine(now.date(), t)
    if target <= now:
        target += timedelta(days=1)
    hook = target - timedelta(minutes=30)
    print(target.strftime("%Y-%m-%dT%H:%M:%S"), hook.strftime("%Y-%m-%dT%H:%M:%S"))
except Exception as e:
    import sys as _s; print(f"ERROR:{e}", file=_s.stderr); sys.exit(1)
PYEOF
) || { echo "❌ 形式不正 (例: ct set 03:30)"; return 1; }

  local target_json; target_json=$(_get_target_json)
  "$AWS" scheduler update-schedule \
    --name "$SCHEDULE_NAME" \
    --schedule-expression "at(${target_iso})" \
    --schedule-expression-timezone "Asia/Tokyo" \
    --flexible-time-window '{"Mode":"OFF"}' \
    --state ENABLED \
    --target "$target_json" \
    --region "$REGION" > /dev/null

  # フックも同期 (30分前)
  local hook_target_json; hook_target_json=$(_get_hook_target_json)
  if [ -n "$hook_target_json" ]; then
    "$AWS" scheduler update-schedule \
      --name "$HOOK_SCHEDULE_NAME" \
      --schedule-expression "at(${hook_iso})" \
      --schedule-expression-timezone "Asia/Tokyo" \
      --flexible-time-window '{"Mode":"OFF"}' \
      --state ENABLED \
      --target "$hook_target_json" \
      --region "$REGION" > /dev/null
    printf "hook       %s JST (30分前)\n" "$(echo "$hook_iso" | tr 'T' ' ')"
  fi

  printf "scheduled  %s JST\n" "$(echo "$target_iso" | tr 'T' ' ')"
}

# ── ct resume ────────────────────────────────────────────────
resume_schedule() {
  local target_json; target_json=$(_get_target_json)
  "$AWS" scheduler update-schedule \
    --name "$SCHEDULE_NAME" \
    --schedule-expression "$MAIN_CRON" \
    --schedule-expression-timezone "Asia/Tokyo" \
    --flexible-time-window '{"Mode":"OFF"}' \
    --state ENABLED \
    --target "$target_json" \
    --region "$REGION" > /dev/null
  echo "再開: $MAIN_CRON"

  local hook_target_json; hook_target_json=$(_get_hook_target_json)
  if [ -n "$hook_target_json" ]; then
    "$AWS" scheduler update-schedule \
      --name "$HOOK_SCHEDULE_NAME" \
      --schedule-expression "$HOOK_CRON" \
      --schedule-expression-timezone "Asia/Tokyo" \
      --flexible-time-window '{"Mode":"OFF"}' \
      --state ENABLED \
      --target "$hook_target_json" \
      --region "$REGION" > /dev/null
    echo "フック再開: $HOOK_CRON"
  fi
}

# ── ct cancel ────────────────────────────────────────────────
cancel_schedule() {
  local target_json; target_json=$(_get_target_json)
  "$AWS" scheduler update-schedule \
    --name "$SCHEDULE_NAME" \
    --schedule-expression "$MAIN_CRON" \
    --schedule-expression-timezone "Asia/Tokyo" \
    --flexible-time-window '{"Mode":"OFF"}' \
    --state DISABLED \
    --target "$target_json" \
    --region "$REGION" > /dev/null
  echo "停止しました  (ct resume で再開)"

  local hook_target_json; hook_target_json=$(_get_hook_target_json)
  if [ -n "$hook_target_json" ]; then
    "$AWS" scheduler update-schedule \
      --name "$HOOK_SCHEDULE_NAME" \
      --schedule-expression "$HOOK_CRON" \
      --schedule-expression-timezone "Asia/Tokyo" \
      --flexible-time-window '{"Mode":"OFF"}' \
      --state DISABLED \
      --target "$hook_target_json" \
      --region "$REGION" > /dev/null
  fi
}

# ── ct run ───────────────────────────────────────────────────
run_now() {
  local subnet_id sg_id
  subnet_id=$("$AWS" ec2 describe-subnets \
    --filters "Name=tag:Name,Values=${PROJECT}-fargate-subnet" \
    --query "Subnets[0].SubnetId" --output text --region "$REGION" 2>/dev/null)
  sg_id=$("$AWS" ec2 describe-security-groups \
    --filters "Name=group-name,Values=${PROJECT}-fargate-sg" \
    --query "SecurityGroups[0].GroupId" --output text --region "$REGION" 2>/dev/null)

  if [ -z "$subnet_id" ] || [ "$subnet_id" = "None" ]; then
    echo "❌ Fargateサブネットが見つかりません (fargate-setup.sh を実行してください)"
    return 1
  fi

  local task_arn
  task_arn=$("$AWS" ecs run-task \
    --cluster "$CLUSTER" \
    --task-definition "$TASK_FAMILY" \
    --launch-type FARGATE \
    --network-configuration \
      "awsvpcConfiguration={subnets=[${subnet_id}],securityGroups=[${sg_id}],assignPublicIp=ENABLED}" \
    --region "$REGION" \
    --query "tasks[0].taskArn" --output text 2>/dev/null)

  if [ -z "$task_arn" ] || [ "$task_arn" = "None" ]; then
    echo "❌ タスク起動失敗 (ECSクラスタ・タスク定義を確認してください)"
    return 1
  fi

  echo "✓ タスク起動: $(echo "$task_arn" | awk -F/ '{print $NF}')"
  echo ""
  echo "ログ確認:"
  echo "  ct log -f"
  echo "  または CloudWatch → ${LOG_GROUP}"
}

# ── ct log ───────────────────────────────────────────────────
show_log() {
  local mode="${1:-history}"
  local date_arg="${2:-}"

  case "$mode" in
    history)
      local tmp; tmp=$(mktemp)
      _s3_get "meta/.claude_history" > "$tmp"
      if [ -s "$tmp" ]; then
        printf "%-19s  %-9s  %s\n" "datetime" "status" "elapsed | detail"
        printf '%s\n' "--------------------  ---------  ----------------------------------------"
        tail -n 30 "$tmp"
      else
        echo "履歴なし (S3に.claude_historyが見つかりません)"
      fi
      rm -f "$tmp"
      ;;

    night)
      local tmp; tmp=$(mktemp)
      _s3_get "meta/.night_history" > "$tmp"
      [ -s "$tmp" ] && tail -n 30 "$tmp" || echo "夜間スクリプト履歴なし"
      rm -f "$tmp"
      ;;

    full)
      local latest_stream
      latest_stream=$("$AWS" logs describe-log-streams \
        --log-group-name "$LOG_GROUP" \
        --order-by LastEventTime --descending --limit 1 \
        --query "logStreams[0].logStreamName" --output text \
        --region "$REGION" 2>/dev/null)
      if [ -z "$latest_stream" ] || [ "$latest_stream" = "None" ]; then
        echo "CloudWatchログが見つかりません (${LOG_GROUP})"
        return 1
      fi
      echo "=== ${LOG_GROUP}/${latest_stream} ==="
      "$AWS" logs get-log-events \
        --log-group-name "$LOG_GROUP" \
        --log-stream-name "$latest_stream" \
        --start-from-head \
        --query "events[*].message" --output json \
        --region "$REGION" 2>/dev/null \
        | python3 -c "import sys,json; [print(m.rstrip()) for m in json.load(sys.stdin)]"
      ;;

    date)
      local tmp; tmp=$(mktemp)
      _s3_get "run-logs/run_${date_arg}.log" > "$tmp"
      if [ -s "$tmp" ]; then
        echo "=== run_${date_arg}.log ==="
        cat "$tmp"
      else
        echo "ログが見つかりません: run_${date_arg}.log"
        echo "利用可能な日付:"
        "$AWS" s3 ls "s3://$(_s3_bucket)/run-logs/" --region "$REGION" 2>/dev/null \
          | awk '{print $4}' | grep "^run_" | sed 's/run_//;s/\.log//' | sort
      fi
      rm -f "$tmp"
      ;;
  esac
}

# ── 引数処理 ─────────────────────────────────────────────────
CMD="status"
LOG_DATE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    set)
      CMD="set"
      SET_TIME="${2:?ct: set には HH:MM が必要です}"
      shift 2
      ;;
    resume)  CMD="resume";  shift ;;
    cancel)  CMD="cancel";  shift ;;
    run)     CMD="run";     shift ;;
    log)
      CMD="log"; shift
      case "${1:-}" in
        -f) CMD="log-full";  shift ;;
        -n) CMD="log-night"; shift ;;
        -d) CMD="log-date"; LOG_DATE="${2:?-d には YYYYMMDD が必要です}"; shift 2 ;;
      esac
      ;;
    -l)
      _s3_get "meta/.last_run" | tr -d '\n'; echo
      exit 0
      ;;
    -n)
      sched=$(_get_schedule)
      expr=$(echo "$sched" | python3 -c \
        "import sys,json; d=json.load(sys.stdin); print(d.get('ScheduleExpression',''))" 2>/dev/null)
      if [[ "$expr" == at\(* ]]; then
        echo "$expr" | sed 's/at(//;s/)//'
      else
        echo "$expr"
      fi
      exit 0
      ;;
    -h|--help) cat << 'EOF'
usage: ct [command]
  (なし)        状況表示
  set HH:MM    次回実行時刻を変更 (JST)
  resume       5時間ごとに戻す
  cancel       一時停止
  run          今すぐ手動実行
  log          実行履歴
  log -f       最新ログ (CloudWatch)
  log -n       夜間スクリプト履歴
  log -d DATE  日付指定ログ (YYYYMMDD)
  -l           最終実行時刻のみ
  -n           次回予定時刻のみ
  -h           ヘルプ
EOF
      exit 0
      ;;
    *) echo "ct: 不明なコマンド: $1" >&2; exit 1 ;;
  esac
done

case "$CMD" in
  status)    show_status ;;
  set)       set_schedule "$SET_TIME" ;;
  resume)    resume_schedule ;;
  cancel)    cancel_schedule ;;
  run)       run_now ;;
  log)       show_log "history" ;;
  log-full)  show_log "full" ;;
  log-night) show_log "night" ;;
  log-date)  show_log "date" "$LOG_DATE" ;;
esac
