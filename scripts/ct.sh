#!/bin/bash
# ct — mugenknock スケジュール管理コマンド
#
# 構成: EventBridgeスケジュール(=トークンリセット基準時刻の唯一の正)で Fargate が
#       ピンのみ実行。夜間バッチ/フックはローカルsystemdで実行し、時刻はEventBridgeに
#       同期する(sync-local-schedule.sh)。ct set/resume/cancel は両方を同時に更新する。
#
# usage: ct [command]
#   (なし)        状況表示 (常時稼働のピン + フック状態 + ローカルタイマー)
#   on / off     フックスクリプトの有効/無効を切替 (ピンは常時稼働のまま)
#   set HH:MM    次回ピン時刻を HH:MM に変更 (EventBridge + ローカル同期。以降5h毎)
#   resume       5時間ドリフト再開 (次回ピン=now+5h。以降Fargateが+5hずつ)
#   cancel       ピンも含めた完全停止 (通常は使わない。ピン常時稼働の例外操作)
#   sync         EventBridgeに合わせてローカルタイマーを再同期
#   skip         次回のローカルフック(妥当性確認 hook/hook2)を今回だけスキップ
#   run          今すぐピンを手動実行 (Fargate)
#   log [-f|-n|-d DATE]   履歴/ログ表示
#   -l           最終実行時刻のみ  /  -n 次回予定のみ  /  -h ヘルプ

set -uo pipefail

AWS=/home/yuzuki/local/bin/aws
REGION=ap-northeast-1
PROJECT="mugenknock"
SCHEDULE_NAME="${PROJECT}-ping"
CLUSTER="${PROJECT}-batch"
TASK_FAMILY="${PROJECT}-ping"
LOG_GROUP="/ecs/${PROJECT}-night-batch"
SYNC_SCRIPT="/home/yuzuki/aws-quiz-app/scripts/sync-local-schedule.sh"
SELF="/home/yuzuki/aws-quiz-app/scripts/ct.sh"
UNIT_DIR="$HOME/.config/systemd/user"

# 分離モデル(2026-09〜):
#   ・Fargateピンは「常時稼働」。EventBridgeスケジュールは常にENABLEDに保つ
#     (ct cancel を明示実行したときだけ DISABLED=完全停止)。
#   ・ct on/off が切り替えるのは「フックスクリプト」だけ:
#       hook(-30分) / hook2(-15分) / postpingの夜間バッチ。
#     状態はローカルフラグファイル HOOKS_FLAG の有無で表す。
#   ・postping(+10分)自体はフック無効でも常時アーム(ピン連鎖のローカルwatchdog兼再アーム)。
# フック有効のまま放置を防ぐため土曜03:00に ct off(フックのみ) へ自動リセットする。
HOOKS_FLAG="$HOME/.config/mugenknock/hooks_enabled"
_hooks_on() { [ -f "$HOOKS_FLAG" ]; }
MODE_RESET_ONCALENDAR="Sat *-*-* 03:00:00"

# ── ヘルパー ──────────────────────────────────────────────────
_ACCOUNT_ID=""
_account_id() {
  [ -n "$_ACCOUNT_ID" ] && { echo "$_ACCOUNT_ID"; return; }
  _ACCOUNT_ID=$("$AWS" sts get-caller-identity --query Account --output text --region "$REGION" 2>/dev/null)
  echo "$_ACCOUNT_ID"
}
_s3_bucket() { echo "${PROJECT}-fargate-state-$(_account_id)"; }

_get_schedule() {
  "$AWS" scheduler get-schedule --name "$SCHEDULE_NAME" --region "$REGION" --output json 2>/dev/null
}
_get_target_json() {
  _get_schedule | python3 -c \
    "import sys,json; d=json.load(sys.stdin); print(json.dumps(d['Target']))" 2>/dev/null
}
_s3_get() { "$AWS" s3 cp "s3://$(_s3_bucket)/$1" /dev/stdout --quiet 2>/dev/null || true; }

# ローカルタイマーをEventBridgeに同期
_sync_local() {
  if [ -x "$SYNC_SCRIPT" ]; then
    bash "$SYNC_SCRIPT" 2>&1 | sed 's/^/  /'
  else
    echo "  ⚠️ sync-local-schedule.sh が見つかりません: $SYNC_SCRIPT"
  fi
}

# ── ステータス表示 ────────────────────────────────────────────
show_status() {
  local sched; sched=$(_get_schedule)
  if [ -z "$sched" ]; then
    echo "❌ ピンスケジュール($SCHEDULE_NAME)未設定 (fargate-setup.sh を実行してください)"
    return 1
  fi
  local state expr last next_str
  state=$(echo "$sched" | python3 -c "import sys,json; print(json.load(sys.stdin).get('State','?'))" 2>/dev/null)
  expr=$(echo "$sched"  | python3 -c "import sys,json; print(json.load(sys.stdin).get('ScheduleExpression',''))" 2>/dev/null)
  last=$(_s3_get "meta/.last_run" | tr -d '\n'); [ -z "$last" ] && last="never"

  next_str=$(python3 - "$expr" "$state" << 'PYEOF'
import sys
from datetime import datetime, timedelta, timezone
expr, state = sys.argv[1], sys.argv[2]
JST = timezone(timedelta(hours=9)); now = datetime.now(JST).replace(tzinfo=None)
def fmt(dt):
    s = int((dt-now).total_seconds())
    if s < 0:      return f"{dt.strftime('%m/%d %H:%M')} (overdue)"
    elif s < 3600: return f"{dt.strftime('%H:%M')} ({s//60}m後)"
    h,m = divmod(s//60,60); return f"{dt.strftime('%m/%d %H:%M')} ({h}h{m:02d}m後)"
if state == "DISABLED":
    print("停止中 (ct resume で再開)")
elif expr.startswith("at("):
    try: print(fmt(datetime.strptime(expr[3:-1], "%Y-%m-%dT%H:%M:%S")) + "  ← 一時変更")
    except: print(expr)
else:
    print(expr)
PYEOF
)
  local ping_label
  if [ "$state" = "DISABLED" ]; then ping_label="停止 (ct resume で再開)"; else ping_label="on (常時稼働)"; fi

  echo "── Fargate ピン (EventBridge) ── ※常時稼働"
  printf "  mode  %s\n  state %s\n  last  %s\n  next  %s\n" "$ping_label" "$state" "$last" "$next_str"

  echo "── フックスクリプト (ct on/off で切替) ──"
  if _hooks_on; then
    echo "  hooks on (有効)"
    local reset_next
    reset_next=$(systemctl --user list-timers "${PROJECT}-mode-reset.timer" --all --no-legend 2>/dev/null \
      | awk '{print $1" "$2" "$3}')
    [ -n "$reset_next" ] && printf "  reset %s に自動 off(フックのみ)\n" "$reset_next"
  else
    echo "  hooks off (無効 — ct on で有効化)"
  fi

  echo "── ローカル systemd タイマー ──"
  systemctl --user list-timers 'mugenknock-hook.timer' 'mugenknock-hook2.timer' 'mugenknock-postping.timer' 'mugenknock-canary.timer' \
    --all --no-legend 2>/dev/null \
    | awk '{printf "  %-24s next %s %s\n", $NF, $1, $2}' \
    || echo "  (タイマー未設定 — ct sync で作成)"
}

# ── ct set HH:MM ──────────────────────────────────────────────
set_schedule() {
  local hhmm="$1" target_iso
  target_iso=$(python3 - "$hhmm" << 'PYEOF'
import sys
from datetime import datetime, timedelta, timezone
JST = timezone(timedelta(hours=9)); now = datetime.now(JST).replace(tzinfo=None)
try:
    t = datetime.strptime(sys.argv[1].strip(), "%H:%M").time()
    target = datetime.combine(now.date(), t)
    if target <= now: target += timedelta(days=1)
    print(target.strftime("%Y-%m-%dT%H:%M:%S"))
except Exception as e:
    import sys as _s; print(f"ERROR:{e}", file=_s.stderr); sys.exit(1)
PYEOF
) || { echo "❌ 形式不正 (例: ct set 03:30)"; return 1; }

  local target_json; target_json=$(_get_target_json)
  "$AWS" scheduler update-schedule --name "$SCHEDULE_NAME" \
    --schedule-expression "at(${target_iso})" --schedule-expression-timezone "Asia/Tokyo" \
    --flexible-time-window '{"Mode":"OFF"}' --state ENABLED --target "$target_json" \
    --region "$REGION" > /dev/null
  printf "✓ Fargateピン: %s JST\n" "$(echo "$target_iso" | tr 'T' ' ')"
  echo "ローカルタイマーを同期中..."
  _sync_local
}

# ── ct resume ────────────────────────────────────────────────
# ドリフト再開: 次回ピンを now+5h に置く(以降Fargateがピンごとに+5hずつずらす)
resume_schedule() {
  # 分を一桁切り捨て(10分単位)して +5時間（Claudeのリセット則に合わせる。例:15:23→15:20→20:20）
  local next_iso; next_iso=$(python3 -c "from datetime import datetime,timedelta; n=datetime.now(); b=n.replace(minute=(n.minute//10)*10, second=0, microsecond=0); print((b+timedelta(hours=5)).strftime('%Y-%m-%dT%H:%M:%S'))")
  local target_json; target_json=$(_get_target_json)
  "$AWS" scheduler update-schedule --name "$SCHEDULE_NAME" \
    --schedule-expression "at(${next_iso})" --schedule-expression-timezone "Asia/Tokyo" \
    --flexible-time-window '{"Mode":"OFF"}' --state ENABLED --target "$target_json" \
    --region "$REGION" > /dev/null
  echo "✓ 再開(ドリフト): 次回ピン ${next_iso/T/ } (以降5時間ごと)"
  echo "ローカルタイマーを同期中..."
  _sync_local
}

# ── ct cancel ────────────────────────────────────────────────
cancel_schedule() {
  local target_json; target_json=$(_get_target_json)
  local cur_expr; cur_expr=$(_get_schedule | python3 -c "import sys,json; print(json.load(sys.stdin).get('ScheduleExpression','cron(2 0,5,10,15,20 * * ? *)'))" 2>/dev/null)
  "$AWS" scheduler update-schedule --name "$SCHEDULE_NAME" \
    --schedule-expression "$cur_expr" --schedule-expression-timezone "Asia/Tokyo" \
    --flexible-time-window '{"Mode":"OFF"}' --state DISABLED --target "$target_json" \
    --region "$REGION" > /dev/null
  echo "✓ 停止 (ct resume で再開)"
  echo "ローカルタイマーを停止中..."
  _sync_local
}

# ── 週次リセットタイマー ──────────────────────────────────────
# 使い切りモードのまま放置されるのを防ぐ。土曜03:00に ct off を実行する。
# Persistent=true: PC/WSLが停止していて土曜03:00を逃した場合も次回起動時に走らせ、
# 「気づかないまま使い切りモードが続く」状態を残さない。
_install_mode_reset_timer() {
  mkdir -p "$UNIT_DIR"
  cat > "$UNIT_DIR/${PROJECT}-mode-reset.service" << EOF
[Unit]
Description=mugenknock weekly reset to saving mode (ct off)

[Service]
Type=oneshot
ExecStart=/bin/bash -lc '${SELF} off'
EOF
  cat > "$UNIT_DIR/${PROJECT}-mode-reset.timer" << EOF
[Unit]
Description=mugenknock weekly mode reset timer (${MODE_RESET_ONCALENDAR})

[Timer]
OnCalendar=${MODE_RESET_ONCALENDAR}
Persistent=true

[Install]
WantedBy=timers.target
EOF
  systemctl --user daemon-reload 2>/dev/null || true
  systemctl --user enable --now "${PROJECT}-mode-reset.timer" >/dev/null 2>&1 || true
  loginctl enable-linger "$USER" 2>/dev/null || true
}

# ── ピン常時稼働の保証(停止していたら now+5h で復帰) ──────────
_ensure_ping_enabled() {
  local st; st=$(_get_schedule | python3 -c "import sys,json; print(json.load(sys.stdin).get('State','?'))" 2>/dev/null)
  [ "$st" = "ENABLED" ] && return 0
  local next_iso tj
  next_iso=$(python3 -c "from datetime import datetime,timedelta; n=datetime.now(); b=n.replace(minute=(n.minute//10)*10, second=0, microsecond=0); print((b+timedelta(hours=5)).strftime('%Y-%m-%dT%H:%M:%S'))")
  tj=$(_get_target_json)
  "$AWS" scheduler update-schedule --name "$SCHEDULE_NAME" \
    --schedule-expression "at(${next_iso})" --schedule-expression-timezone "Asia/Tokyo" \
    --flexible-time-window '{"Mode":"OFF"}' --state ENABLED --target "$tj" \
    --region "$REGION" > /dev/null
  echo "  ピンを常時稼働へ復帰 (次回 ${next_iso/T/ } JST)"
}

# ── ct on (フック有効) ────────────────────────────────────────
mode_on() {
  echo "▶ フック ON — ピン前後のフックスクリプト(hook/hook2/夜間バッチ)を有効化します"
  mkdir -p "$(dirname "$HOOKS_FLAG")"; touch "$HOOKS_FLAG"
  _ensure_ping_enabled           # ピンは常時稼働(停止していたら復帰)
  _install_mode_reset_timer
  echo "ローカルタイマーを同期中(フック有効で再アーム)..."
  _sync_local
  local next_reset
  next_reset=$(systemctl --user list-timers "${PROJECT}-mode-reset.timer" --all --no-legend 2>/dev/null \
    | awk '{print $1" "$2" "$3}')
  echo "  自動リセット: ${next_reset:-土曜 03:00} に ct off(フックのみ) へ戻します"
}

# ── ct off (フック無効) ───────────────────────────────────────
mode_off() {
  echo "⏸ フック OFF — フックスクリプト(hook/hook2/夜間バッチ)を停止します。ピンは常時稼働のまま。"
  rm -f "$HOOKS_FLAG"
  echo "ローカルタイマーを同期中(hook/hook2 停止・postping は維持)..."
  _sync_local
}

# ── ct run (ピン即時実行) ─────────────────────────────────────
run_now() {
  local subnet_id sg_id
  subnet_id=$("$AWS" ec2 describe-subnets --filters "Name=tag:Name,Values=${PROJECT}-fargate-subnet" \
    --query "Subnets[0].SubnetId" --output text --region "$REGION" 2>/dev/null)
  sg_id=$("$AWS" ec2 describe-security-groups --filters "Name=group-name,Values=${PROJECT}-fargate-sg" \
    --query "SecurityGroups[0].GroupId" --output text --region "$REGION" 2>/dev/null)
  if [ -z "$subnet_id" ] || [ "$subnet_id" = "None" ]; then
    echo "❌ Fargateサブネットが見つかりません"; return 1
  fi
  local task_arn
  task_arn=$("$AWS" ecs run-task --cluster "$CLUSTER" --task-definition "$TASK_FAMILY" --launch-type FARGATE \
    --network-configuration "awsvpcConfiguration={subnets=[${subnet_id}],securityGroups=[${sg_id}],assignPublicIp=ENABLED}" \
    --region "$REGION" --query "tasks[0].taskArn" --output text 2>/dev/null)
  if [ -z "$task_arn" ] || [ "$task_arn" = "None" ]; then echo "❌ タスク起動失敗"; return 1; fi
  echo "✓ ピンタスク起動: $(echo "$task_arn" | awk -F/ '{print $NF}')"
  echo "  ログ: ct log -f"
}

# ── ct skip (次回サイクルのローカルフックを今回だけスキップ) ───────
# hook(-30分)/hook2(-15分) の妥当性確認 one-shot タイマーを停止するだけ。
# postping(+10分)が sync-local-schedule.sh で次サイクルを再アームするので自動復帰する。
skip_hooks() {
  local stopped=0
  for t in mugenknock-hook.timer mugenknock-hook2.timer; do
    if systemctl --user is-active --quiet "$t" 2>/dev/null || systemctl --user list-timers "$t" --all --no-legend 2>/dev/null | grep -q "$t"; then
      systemctl --user stop "$t" 2>/dev/null && stopped=$(( stopped + 1 ))
    fi
  done
  if [ "$stopped" -gt 0 ]; then
    echo "✓ 次回のローカルフック(妥当性確認 hook/hook2)をスキップします (${stopped}件停止)"
  else
    echo "✓ 次回のローカルフックをスキップします (対象タイマーは既に停止/未アーム)"
  fi
  echo "  次サイクルは postping(+10分)の再同期で自動復帰します。すぐ元に戻すには ct sync。"
}

# ── ct log ───────────────────────────────────────────────────
show_log() {
  local mode="${1:-history}" date_arg="${2:-}"
  case "$mode" in
    history)
      local tmp; tmp=$(mktemp); _s3_get "meta/.claude_history" > "$tmp"
      if [ -s "$tmp" ]; then
        printf "%-19s  %-9s  %s\n" "datetime" "status" "elapsed | detail"
        printf '%s\n' "--------------------  ---------  ----------------------------------------"
        tail -n 30 "$tmp"
      else echo "履歴なし"; fi
      rm -f "$tmp" ;;
    night)
      local tmp; tmp=$(mktemp); _s3_get "meta/.night_history" > "$tmp"
      [ -s "$tmp" ] && tail -n 30 "$tmp" || echo "夜間スクリプト履歴なし"; rm -f "$tmp" ;;
    full)
      local ls; ls=$("$AWS" logs describe-log-streams --log-group-name "$LOG_GROUP" \
        --order-by LastEventTime --descending --limit 1 --query "logStreams[0].logStreamName" \
        --output text --region "$REGION" 2>/dev/null)
      [ -z "$ls" ] || [ "$ls" = "None" ] && { echo "CloudWatchログなし"; return 1; }
      echo "=== ${LOG_GROUP}/${ls} ==="
      "$AWS" logs get-log-events --log-group-name "$LOG_GROUP" --log-stream-name "$ls" --start-from-head \
        --query "events[*].message" --output json --region "$REGION" 2>/dev/null \
        | python3 -c "import sys,json; [print(m.rstrip()) for m in json.load(sys.stdin)]" ;;
    date)
      local tmp; tmp=$(mktemp); _s3_get "run-logs/run_${date_arg}.log" > "$tmp"
      if [ -s "$tmp" ]; then echo "=== run_${date_arg}.log ==="; cat "$tmp"
      else echo "ログなし: run_${date_arg}.log"; fi; rm -f "$tmp" ;;
  esac
}

# ── 引数処理 ─────────────────────────────────────────────────
CMD="status"; LOG_DATE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    set)    CMD="set"; SET_TIME="${2:?ct: set には HH:MM が必要です}"; shift 2 ;;
    on)     CMD="on";     shift ;;
    off)    CMD="off";    shift ;;
    resume) CMD="resume"; shift ;;
    cancel) CMD="cancel"; shift ;;
    sync)   CMD="sync";   shift ;;
    skip)   CMD="skip";   shift ;;
    run)    CMD="run";    shift ;;
    log)
      CMD="log"; shift
      case "${1:-}" in
        -f) CMD="log-full";  shift ;;
        -n) CMD="log-night"; shift ;;
        -d) CMD="log-date"; LOG_DATE="${2:?-d には YYYYMMDD が必要です}"; shift 2 ;;
      esac ;;
    -l) _s3_get "meta/.last_run" | tr -d '\n'; echo; exit 0 ;;
    -n)
      expr=$(_get_schedule | python3 -c "import sys,json; print(json.load(sys.stdin).get('ScheduleExpression',''))" 2>/dev/null)
      [[ "$expr" == at\(* ]] && echo "$expr" | sed 's/at(//;s/)//' || echo "$expr"; exit 0 ;;
    -h|--help) cat << 'EOF'
usage: ct [command]
  (なし)        状況表示 (常時稼働のピン + フック状態 + ローカルタイマー)
  on           フック有効 (hook/hook2/夜間バッチを実行。ピンは常時稼働のまま)
               ※ 土曜03:00に自動で off(フックのみ) へ戻る
  off          フック無効 (hook/hook2/夜間バッチを停止。ピンは常時稼働のまま)
  set HH:MM    ピン時刻を変更 (EventBridge + ローカル同期)
  resume       5時間ドリフト再開 (次回ピン=now+5h)
  cancel       ピンも含めた完全停止 (例外操作。通常は使わない)
  sync         ローカルタイマーをEventBridgeに再同期
  skip         次回のローカルフック(妥当性確認 hook/hook2)を今回だけスキップ
  run          ピン即時実行 (Fargate)
  log [-f|-n|-d DATE]   履歴/ログ
  -l 最終実行  -n 次回予定  -h ヘルプ
EOF
      exit 0 ;;
    *) echo "ct: 不明なコマンド: $1" >&2; exit 1 ;;
  esac
done

case "$CMD" in
  status)    show_status ;;
  set)       set_schedule "$SET_TIME" ;;
  on)        mode_on ;;
  off)       mode_off ;;
  resume)    resume_schedule ;;
  cancel)    cancel_schedule ;;
  sync)      _sync_local ;;
  skip)      skip_hooks ;;
  run)       run_now ;;
  log)       show_log "history" ;;
  log-full)  show_log "full" ;;
  log-night) show_log "night" ;;
  log-date)  show_log "date" "$LOG_DATE" ;;
esac
