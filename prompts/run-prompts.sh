#!/bin/bash
# Claude プロンプト自動実行 & サイクル管理スクリプト
# サイクル: セッション開始(10分切り捨て) + 5時間 + 2分バッファ

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_DIR="$SCRIPT_DIR/logs"
LAST_RUN_FILE="$SCRIPT_DIR/.last_run"
HISTORY_FILE="$SCRIPT_DIR/.claude_history"
NIGHT_HISTORY_FILE="$SCRIPT_DIR/.night_history"
UNIT_NAME="claude-cycle"
HOOK_PREFIX="claude-cycle-hook"
HOOKS_FILE="$SCRIPT_DIR/.ct-hooks"  # 1行 = "±N|command"

mkdir -p "$LOG_DIR"
export PATH="/home/yuzuki/.npm-global/bin:/home/sera/.config/nvm/versions/node/v20.20.2/bin:$PATH"

# ── 履歴の記録 ──────────────────────────────────────────────
log_history() {
  local status="$1"
  local message="$2"
  echo "$(date '+%Y-%m-%d %H:%M:%S') | $status | $message" >> "$HISTORY_FILE"
  tail -n 200 "$HISTORY_FILE" > "${HISTORY_FILE}.tmp" && mv "${HISTORY_FILE}.tmp" "$HISTORY_FILE"
}

log_night() {
  local message="$1"
  echo "$(date '+%Y-%m-%d %H:%M:%S') | $message" >> "$NIGHT_HISTORY_FILE"
  tail -n 100 "$NIGHT_HISTORY_FILE" > "${NIGHT_HISTORY_FILE}.tmp" && mv "${NIGHT_HISTORY_FILE}.tmp" "$NIGHT_HISTORY_FILE"
}

# ── ヘルプ表示 ──────────────────────────────────────────────
show_help() {
  cat << 'EOF'
usage: ct [command] [-d DIR] [-lnh]

commands:
  (none)          show status
  run             run now and reschedule
  set HH:MM       reschedule next run to HH:MM
  cancel          cancel scheduled run and all hooks
  log             show run history
  log -n          show night-prompts history
  log -f          show last run's full log file
  log -d DATE     show log for DATE (YYYYMMDD, e.g. 20260427)
  add [-t ±N] CMD add hook command (±N min from ping, default: 0)
  ls              list hook commands
  rm N            remove hook at index N

flags:
  -d DIR          with "run": execute only DIR (*.txt files)
  -l              last run time (bare)
  -n              next scheduled time (bare)
  -h              this help
EOF
}

# ── 時刻取得関数 ──────────────────────────────────────────
get_next_time() {
  local next_info=$(systemctl --user list-timers "${UNIT_NAME}.timer" --all --no-legend)
  if [ -n "$next_info" ]; then
    echo "$next_info" | awk '{print $2, $3}'
  else
    echo ""
  fi
}

# ── ステータス表示 ──────────────────────────────────────────
_hook_time_at() {
  # タイマーユニットが存在すればその時刻、なければメイン時刻+offsetを計算して返す
  local unit_prefix="$1" idx="$2" offset="$3" raw_next="$4"
  local at
  at=$(systemctl --user list-timers "${unit_prefix}-${idx}.timer" --all --no-legend 2>/dev/null \
       | awk 'NR==1{print $2, substr($3,1,5)}')
  if [ -z "$at" ] && [ -n "$raw_next" ]; then
    at=$(python3 - "$raw_next" "$offset" 2>/dev/null << 'PYEOF'
import sys
from datetime import datetime, timedelta
try:
    t = datetime.strptime(sys.argv[1], "%Y-%m-%d %H:%M:%S")
    t = t + timedelta(minutes=int(sys.argv[2]))
    print(t.strftime('%Y-%m-%d %H:%M'))
except: pass
PYEOF
)
  fi
  echo "${at:---}"
}

show_status() {
  local last raw_next next_time left=""
  last=$(cat "$LAST_RUN_FILE" 2>/dev/null || echo "never")
  raw_next=$(systemctl --user list-timers "${UNIT_NAME}.timer" --all --no-legend 2>/dev/null \
             | awk 'NR==1{print $2, $3}')
  next_time="$raw_next"
  if [ -n "$next_time" ]; then
    left=$(python3 - "$next_time" << 'PYEOF'
import sys
from datetime import datetime
try:
    nxt = datetime.strptime(sys.argv[1], "%Y-%m-%d %H:%M:%S")
    diff = nxt - datetime.now()
    s = int(diff.total_seconds())
    if s < 0:   print("overdue")
    elif s < 3600: print(f"{s//60}m")
    else:
        h, m = divmod(s//60, 60)
        print(f"{h}h{m:02d}m")
except: pass
PYEOF
)
    [ -n "$left" ] && next_time="$next_time  ($left)"
  else
    next_time="none"
  fi
  printf "last  %s\nnext  %s\n" "$last" "$next_time"
  if [ -f "$HOOKS_FILE" ] && [ -s "$HOOKS_FILE" ]; then
    local idx=0
    while IFS='|' read -r offset cmd; do
      [ -z "$cmd" ] && { idx=$(( idx + 1 )); continue; }
      local sign=""; [ "$offset" -gt 0 ] && sign="+"
      local hook_at
      hook_at=$(_hook_time_at "$HOOK_PREFIX" "$idx" "$offset" "$raw_next")
      printf "hook  [%d] %-16s (%s%dmin)  %s\n" "$idx" "$hook_at" "$sign" "$offset" "$cmd"
      idx=$(( idx + 1 ))
    done < "$HOOKS_FILE"
  fi
}

# ── フックタイマーを全停止 ───────────────────────────────────
stop_hook_timers() {
  local n=0
  [ -f "$HOOKS_FILE" ] && n=$(grep -c . "$HOOKS_FILE" 2>/dev/null || echo 0)
  for (( i=0; i<=n+1; i++ )); do
    systemctl --user stop "${HOOK_PREFIX}-${i}.timer" 2>/dev/null || true
  done
}

# ── 次の実行時刻を予約する ───────────────────────────────────
schedule_next() {
  local mode="${1:-cycle}"
  local arg="${2:-}"
  local target_time=""
  local desc="Claude Cycle Trigger"

  if [ "$mode" = "reset" ] && [ -n "$arg" ]; then
    target_time=$(python3 - "$arg" << 'PYEOF'
import sys
from datetime import datetime, timedelta
reset_str = sys.argv[1].strip()
now = datetime.now()
try:
    t = datetime.strptime(reset_str, "%I:%M%p").time()
    target = datetime.combine(now.date(), t)
    if target <= now:
        target += timedelta(days=1)
    target += timedelta(minutes=2)
    print(target.strftime('%Y-%m-%d %H:%M:00'))
except Exception:
    print("")
PYEOF
)
    [ -n "$target_time" ] && desc="Claude Reset Retry ($arg)" || mode="retry"
  fi

  if [ "$mode" = "cycle" ] && [ -n "$arg" ]; then
    target_time=$(python3 - "$arg" << 'PYEOF'
import sys
from datetime import datetime, timedelta
arg_time = sys.argv[1].strip()
now = datetime.now()
try:
    t = datetime.strptime(arg_time, "%H:%M").time()
    target = datetime.combine(now.date(), t)
    if target <= now:
        target += timedelta(days=1)
    print(target.strftime('%Y-%m-%d %H:%M:00'))
except Exception:
    print("")
PYEOF
)
    [ -n "$target_time" ] && desc="Claude Manual Set ($arg)" || { echo "❌ 形式不正 (HH:MM)"; return 1; }
  fi

  if [ "$mode" = "retry" ]; then
    target_time=$(python3 << 'PYEOF'
from datetime import datetime, timedelta
jst_offset = timedelta(hours=9)
now_jst = datetime.utcnow() + jst_offset
candidates = []
for h in [3, 9, 15, 21]:
    t = now_jst.replace(hour=h, minute=32, second=0, microsecond=0)
    if t <= now_jst:
        t += timedelta(days=1)
    candidates.append(t)
nxt_jst = min(candidates)
nxt_utc = nxt_jst - jst_offset
print(nxt_utc.strftime('%Y-%m-%d %H:%M:00'))
PYEOF
)
    desc="Claude Retry (Next Reset Slot)"
  elif [ -z "$target_time" ]; then
    target_time=$(python3 << 'PYEOF'
from datetime import datetime, timedelta
now = datetime.now()
base_time = now.replace(minute=(now.minute // 10) * 10, second=0, microsecond=0)
next_run = base_time + timedelta(hours=5, minutes=2)
print(next_run.strftime('%Y-%m-%d %H:%M:00'))
PYEOF
)
  fi

  systemctl --user stop "${UNIT_NAME}.timer" 2>/dev/null || true
  # 現サービスのcgroupを脱出してから新タイマーを登録（sleep+disownはcgroup終了時にkillされるため）
  systemd-run --user --on-active=6 \
    -- bash -c "systemd-run --user --unit='${UNIT_NAME}' --on-calendar='${target_time}' \
      --description='${desc}' '${SCRIPT_DIR}/run-prompts.sh' --run"
  schedule_hooks "$target_time"
}

# ── フックコマンドをスケジュール ─────────────────────────────
schedule_hooks() {
  local main_time="$1"
  [ ! -f "$HOOKS_FILE" ] || [ ! -s "$HOOKS_FILE" ] && return 0

  stop_hook_timers

  local idx=0
  while IFS='|' read -r offset cmd; do
    [ -z "$cmd" ] && { idx=$(( idx + 1 )); continue; }

    local hook_time
    hook_time=$(python3 - "$main_time" "$offset" << 'PYEOF'
import sys
from datetime import datetime, timedelta
target = datetime.strptime(sys.argv[1], "%Y-%m-%d %H:%M:%S")
offset = int(sys.argv[2])
t = target + timedelta(minutes=offset)
now = datetime.now()
print("" if t <= now else t.strftime('%Y-%m-%d %H:%M:00'))
PYEOF
    )

    if [ -z "$hook_time" ]; then
      echo "⚠️ hook[$idx]: 過去の時刻のためスキップ (offset: ${offset}分)"
      idx=$(( idx + 1 ))
      continue
    fi

    local sign=""; [ "$offset" -gt 0 ] && sign="+"
    local hook_script="$SCRIPT_DIR/.hook-exec-${idx}.sh"
    cat > "$hook_script" << EOF
#!/bin/bash
_HOOKLOG="${LOG_DIR}/run_\$(date '+%Y%m%d').log"
{
echo ""
echo "--- hook[${idx}] 開始: \$(date '+%Y-%m-%d %H:%M:%S') (${sign}${offset}min) | ${cmd} ---"
${cmd}
echo "--- hook[${idx}] 完了: \$(date '+%Y-%m-%d %H:%M:%S') ---"
} >> "\$_HOOKLOG" 2>&1
EOF
    chmod +x "$hook_script"

    local unit="${HOOK_PREFIX}-${idx}"
    systemd-run --user --on-active=$(( 8 + idx )) \
      -- bash -c "systemd-run --user --unit='${unit}' --on-calendar='${hook_time}' \
        --description='Claude Hook ${idx}' bash '${hook_script}'"

    echo "hook[$idx] 予約: $hook_time (${sign}${offset}分) | $cmd"
    idx=$(( idx + 1 ))
  done < "$HOOKS_FILE"
}

# ── 実行メインロジック ──────────────────────────────────────
run_main() {
  local target_dir="${1:-}"
  local _run_start=$(date +%s)
  DATE_STR=$(date '+%Y-%m-%d %H:%M:%S')
  echo "$DATE_STR" > "$LAST_RUN_FILE"
  LOG_FILE="$LOG_DIR/run_$(date '+%Y%m%d').log"

  local is_rate_limited=0
  local extracted_reset_time=""
  local night_processed=""

  # 詳細サマリー用カウンター (process_dir が _proc_ok/_proc_fail を上書きする)
  local _ping_result="(skip)"
  local _proc_ok=0 _proc_fail=0
  local _sh_ok=0    _sh_fail=0
  local _tmpsh_ok=0 _tmpsh_fail=0
  local _txt_ok=0   _txt_fail=0
  local _tmptxt_ok=0 _tmptxt_fail=0
  local _tmp_ok=0   _tmp_fail=0
  local _dir_ok=0   _dir_fail=0

  {
    echo ""
    echo "=========================================="
    echo "実行開始: $DATE_STR"
    [ -n "$target_dir" ] && echo "対象ディレクトリ: $target_dir"
    echo "=========================================="
    cd "$PROJECT_DIR"

    exec_claude() {
      local file="$1"
      local _t0=$(date +%s)
      echo "▶ [claude] $(basename "$file")"
      local output
      output=$(claude --dangerously-skip-permissions -p "$(cat "$file")" 2>&1)
      local ec=$?
      printf "  → %ds\n" "$(( $(date +%s) - _t0 ))"
      echo "$output"
      if [ $ec -ne 0 ] || echo "$output" | grep -qiE "rate.?limit|too many requests|overload|quota exceeded|hit your limit"; then
        local reset_match
        reset_match=$(echo "$output" | grep -ioE "resets [0-9]{1,2}:[0-9]{2}[ap]m" | grep -ioE "[0-9]{1,2}:[0-9]{2}[ap]m" | head -n 1)
        [ -n "$reset_match" ] && extracted_reset_time="$reset_match"
        return 1
      fi
      return 0
    }

    process_dir() {
      local dir="$1"
      local delete_on_success="${2:-0}"
      local prefix="${3:-}"
      _proc_ok=0; _proc_fail=0
      for f in "$dir"/*.txt; do
        [ -e "$f" ] || continue
        if exec_claude "$f"; then
          _proc_ok=$(( _proc_ok + 1 ))
          [ -n "$prefix" ] && night_processed+="$prefix$(basename "$f") (OK), "
          [ "$delete_on_success" -eq 1 ] && rm "$f"
        else
          _proc_fail=$(( _proc_fail + 1 ))
          [ -n "$prefix" ] && night_processed+="$prefix$(basename "$f") (LIMIT), "
          is_rate_limited=1
          return 1
        fi
      done
      return 0
    }

    if [ -n "$target_dir" ]; then
      if [ -d "$target_dir" ]; then
        process_dir "$target_dir" 0
        _dir_ok=$_proc_ok; _dir_fail=$_proc_fail
      else
        echo "❌ ディレクトリ不在: $target_dir"
      fi
    else
      # ── ping: Claudeセッションを開始させるための軽い呼び出し ──
      echo "▶ [ping] Claudeセッション確認..."
      local _pt0=$(date +%s)
      local _ping_out _ping_ec
      _ping_out=$(claude --dangerously-skip-permissions -p "." 2>&1)
      _ping_ec=$?
      local _ping_s=$(( $(date +%s) - _pt0 ))
      printf "  → %ds\n" "$_ping_s"
      echo "$_ping_out"
      if [ $_ping_ec -ne 0 ] || echo "$_ping_out" | grep -qiE "rate.?limit|too many requests|overload|quota exceeded|hit your limit|usage limit"; then
        local _reset
        _reset=$(echo "$_ping_out" | grep -ioE "resets [0-9]{1,2}:[0-9]{2}[ap]m" | grep -ioE "[0-9]{1,2}:[0-9]{2}[ap]m" | head -n 1)
        [ -n "$_reset" ] && extracted_reset_time="$_reset"
        is_rate_limited=1
        _ping_result="LIMIT(${extracted_reset_time:-?})"
        echo "⚠️ レート制限 (reset: ${extracted_reset_time:-不明})"
      else
        _ping_result="OK(${_ping_s}s)"
        echo "✓ ping OK"
      fi

      if [ $is_rate_limited -eq 0 ]; then
        TODAY=$(date +%Y-%m-%d)
        HOUR=$(date +%-H)
        if [ "$TODAY" != "$(cat "$SCRIPT_DIR/.last_run_date" 2>/dev/null)" ] && [ "$HOUR" -lt 12 ]; then
          echo "🌙 夜間初回実行を開始します ($(date '+%H:%M'))"

          # 1. シェルスクリプト
          for s in "$SCRIPT_DIR/night-prompts/scripts"/*.sh; do
            [ -e "$s" ] || continue
            local _st0=$(date +%s)
            echo "▶ [night-script] $(basename "$s")"
            if bash "$s"; then
              _sh_ok=$(( _sh_ok + 1 ))
              night_processed+="[sh]$(basename "$s") (OK), "
            else
              _sh_fail=$(( _sh_fail + 1 ))
              night_processed+="[sh]$(basename "$s") (FAIL), "
            fi
            printf "  → %ds\n" "$(( $(date +%s) - _st0 ))"
          done

          # 1.5 使い捨てスクリプト
          for s in "$SCRIPT_DIR/night-prompts/tmp-scripts"/*.sh; do
            [ -e "$s" ] || continue
            local _st0=$(date +%s)
            echo "▶ [night-tmp-script] $(basename "$s")"
            if bash "$s"; then
              _tmpsh_ok=$(( _tmpsh_ok + 1 ))
              night_processed+="[tmp-sh]$(basename "$s") (OK), "
              rm "$s"
            else
              _tmpsh_fail=$(( _tmpsh_fail + 1 ))
              night_processed+="[tmp-sh]$(basename "$s") (FAIL), "
            fi
            printf "  → %ds\n" "$(( $(date +%s) - _st0 ))"
          done

          # 2. Claudeプロンプト
          if process_dir "$SCRIPT_DIR/night-prompts/texts" 0 "[txt]"; then
            _txt_ok=$_proc_ok; _txt_fail=$_proc_fail
            process_dir "$SCRIPT_DIR/night-prompts/tmp-texts" 1 "[tmp-txt]" || true
            _tmptxt_ok=$_proc_ok; _tmptxt_fail=$_proc_fail
            if [ $is_rate_limited -eq 0 ]; then
              echo "$TODAY" > "$SCRIPT_DIR/.last_run_date"
            fi
          else
            _txt_ok=$_proc_ok; _txt_fail=$_proc_fail
          fi

          [ -n "$night_processed" ] && log_night "${night_processed%, }"
        fi
      fi

      if [ $is_rate_limited -eq 0 ]; then
        process_dir "$SCRIPT_DIR/tmp-prompts" 1
        _tmp_ok=$_proc_ok; _tmp_fail=$_proc_fail
      fi
    fi

    echo "=========================================="
    echo "終了: $(date '+%Y-%m-%d %H:%M:%S')"
    echo "=========================================="
  } >> "$LOG_FILE" 2>&1

  # ── 経過時間 ──
  local _elapsed=$(( $(date +%s) - _run_start ))
  local _es
  if   [ $_elapsed -ge 3600 ]; then _es="$(( _elapsed/3600 ))h$(( (_elapsed%3600)/60 ))m$(( _elapsed%60 ))s"
  elif [ $_elapsed -ge 60   ]; then _es="$(( _elapsed/60 ))m$(( _elapsed%60 ))s"
  else                               _es="${_elapsed}s"
  fi

  # ── サマリー構築 ──
  local _detail
  if [ -n "$target_dir" ]; then
    _detail="dir=$(basename "$target_dir") ok=${_dir_ok} ng=${_dir_fail}"
  else
    _detail="ping=${_ping_result}"
    local _night_parts=""
    [ $(( _sh_ok    + _sh_fail    )) -gt 0 ] && _night_parts+=" sh=${_sh_ok}/$(( _sh_ok + _sh_fail ))"
    [ $(( _tmpsh_ok + _tmpsh_fail )) -gt 0 ] && _night_parts+=" tmp-sh=${_tmpsh_ok}/$(( _tmpsh_ok + _tmpsh_fail ))"
    [ $(( _txt_ok   + _txt_fail   )) -gt 0 ] && _night_parts+=" txt=${_txt_ok}/$(( _txt_ok + _txt_fail ))"
    [ $(( _tmptxt_ok + _tmptxt_fail )) -gt 0 ] && _night_parts+=" tmp-txt=${_tmptxt_ok}/$(( _tmptxt_ok + _tmptxt_fail ))"
    [ -n "$_night_parts" ] && _detail+=" night:[${_night_parts# }]"
    [ $(( _tmp_ok   + _tmp_fail   )) -gt 0 ] && _detail+=" tmp=${_tmp_ok}/$(( _tmp_ok + _tmp_fail ))"
  fi

  if [ $is_rate_limited -eq 1 ]; then
    log_history "LIMIT  " "${_es} | reset:${extracted_reset_time:-不明} | ${_detail}"
    schedule_next "$([ -n "$extracted_reset_time" ] && echo "reset" || echo "retry")" "$extracted_reset_time"
  else
    log_history "SUCCESS" "${_es} | ${_detail}"
    schedule_next "cycle"
  fi
  find "$LOG_DIR" -name "run_*.log" -mtime +30 -delete
}

# ── 引数処理 ────────────────────────────────────────────────
CMD="status"
TARGET_DIR=""
SET_TIME=""
HOOK_OFFSET=0
HOOK_CMD=""
HOOK_RM_IDX=""
LOG_DATE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    run)
      CMD="run"; shift
      while [[ $# -gt 0 ]]; do
        case "$1" in
          -d) TARGET_DIR="${2:?ct: -d requires DIR}"; shift 2 ;;
          *)  break ;;
        esac
      done
      ;;
    set)
      CMD="set"
      SET_TIME="${2:?ct: set requires HH:MM}"
      shift 2
      ;;
    add)
      CMD="hook-add"; shift
      while [[ $# -gt 0 ]]; do
        case "$1" in
          -t) HOOK_OFFSET="${2:?-t requires ±N}"; shift 2 ;;
          *)  break ;;
        esac
      done
      HOOK_CMD="$*"
      shift $#
      [ -z "$HOOK_CMD" ] && { echo "ct: add requires CMD" >&2; exit 1; }
      ;;
    ls)      CMD="hook-ls";  shift ;;
    rm)
      CMD="hook-rm"
      HOOK_RM_IDX="${2:?ct: rm requires INDEX}"
      shift 2
      ;;
    cancel)  CMD="cancel";  shift ;;
    log)
      CMD="log"; shift
      case "${1:-}" in
        -n) CMD="log-night"; shift ;;
        -f) CMD="log-full";  shift ;;
        -d) CMD="log-date"; LOG_DATE="${2:?-d requires YYYYMMDD}"; shift 2 ;;
      esac
      ;;
    -l)       CMD="last";   shift ;;
    -n)       CMD="next";   shift ;;
    -h|--help) CMD="help";  shift ;;
    --run)    CMD="_run";   shift ;;  # systemd internal
    *)        printf "ct: unknown: %s\n" "$1" >&2; exit 1 ;;
  esac
done

case "$CMD" in
  status)    show_status ;;
  run)       run_main "$TARGET_DIR"; show_status ;;
  set)       schedule_next "cycle" "$SET_TIME" && printf "scheduled  %s\n" "$SET_TIME" ;;
  cancel)
    systemctl --user stop "${UNIT_NAME}.timer" 2>/dev/null || true
    stop_hook_timers
    echo "cancelled"
    ;;
  hook-add)
    printf '%s|%s\n' "$HOOK_OFFSET" "$HOOK_CMD" >> "$HOOKS_FILE"
    _sign=""; [ "$HOOK_OFFSET" -gt 0 ] && _sign="+"
    echo "hook 追加: ${_sign}${HOOK_OFFSET}分  $HOOK_CMD"
    ;;
  hook-ls)
    if [ ! -f "$HOOKS_FILE" ] || [ ! -s "$HOOKS_FILE" ]; then
      echo "フック未登録"
    else
      _raw_next=$(systemctl --user list-timers "${UNIT_NAME}.timer" --all --no-legend 2>/dev/null \
                  | awk 'NR==1{print $2, $3}')
      _idx=0
      while IFS='|' read -r offset cmd; do
        [ -z "$cmd" ] && { _idx=$(( _idx + 1 )); continue; }
        _sign=""; [ "$offset" -gt 0 ] && _sign="+"
        _hook_at=$(_hook_time_at "$HOOK_PREFIX" "$_idx" "$offset" "$_raw_next")
        printf "[%d] %-16s (%s%dmin)  %s\n" "$_idx" "$_hook_at" "$_sign" "$offset" "$cmd"
        _idx=$(( _idx + 1 ))
      done < "$HOOKS_FILE"
    fi
    ;;
  hook-rm)
    if [ ! -f "$HOOKS_FILE" ]; then
      echo "フック未登録" >&2; exit 1
    fi
    python3 - "$HOOKS_FILE" "$HOOK_RM_IDX" << 'PYEOF'
import sys
path, idx = sys.argv[1], int(sys.argv[2])
lines = open(path).readlines()
if idx < 0 or idx >= len(lines):
    print(f"インデックス範囲外: {idx}", file=sys.stderr); sys.exit(1)
removed = lines.pop(idx).strip()
open(path, 'w').writelines(lines)
print(f"hook[{idx}] 削除: {removed}")
PYEOF
    ;;
  log)
    if [ -f "$HISTORY_FILE" ]; then
      printf "%-19s  %-7s  %s\n" "datetime" "status" "elapsed | detail"
      printf '%s\n' "--------------------  -------  ----------------------------------------"
      tail -n 30 "$HISTORY_FILE"
    else
      echo "no history"
    fi
    ;;
  log-night) [ -f "$NIGHT_HISTORY_FILE" ] && tail -n 30 "$NIGHT_HISTORY_FILE" || echo "no night history" ;;
  log-full)
    last_log=$(ls -t "$LOG_DIR"/run_*.log 2>/dev/null | head -1)
    [ -n "$last_log" ] && { echo "=== $last_log ==="; cat "$last_log"; } || echo "no log file"
    ;;
  log-date)
    _logf="$LOG_DIR/run_${LOG_DATE}.log"
    if [ -f "$_logf" ]; then
      echo "=== $_logf ==="
      cat "$_logf"
    else
      echo "ログが見つかりません: run_${LOG_DATE}.log"
      echo "利用可能な日付:"
      ls "$LOG_DIR"/run_*.log 2>/dev/null | xargs -I{} basename {} .log | sed 's/run_//' | sort
    fi
    ;;
  last)      cat "$LAST_RUN_FILE" 2>/dev/null || echo "never" ;;
  next)      get_next_time || echo "none" ;;
  help)      show_help ;;
  _run)      run_main "$TARGET_DIR" ;;  # called by systemd
esac
