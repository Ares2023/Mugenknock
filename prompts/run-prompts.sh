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
HOOKS_FILE="$SCRIPT_DIR/.ct-hooks"        # 1行 = "±N|command"
SKIP_HOOKS_FILE="$SCRIPT_DIR/.ct-skip-once" # 存在すれば次回フックをスキップ

mkdir -p "$LOG_DIR"
export PATH="/home/yuzuki/local/bin:/home/yuzuki/.npm-global/bin:/home/sera/.config/nvm/versions/node/v20.20.2/bin:$PATH"

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
  night           run nightly tasks now (bypass time check; resumes if interrupted)
  set HH:MM       reschedule next run to HH:MM
  cancel          cancel scheduled run and all hooks
  tonight         show projected night-run times for tonight
  log             show run history
  log -n          show night-prompts history
  log -f          show last run's full log file
  log -d DATE     show log for DATE (YYYYMMDD, e.g. 20260427)
  add [-t ±N] CMD add hook command (±N min from ping, default: 0)
                  CMD 内の {NEXT} はメイン ping の HH:MM に展開される
  ls              list hook commands
  rm N            remove hook at index N
  mv N M          move hook at index N to index M
  skip            skip hooks on next run (run again to cancel)
  repair          claude バイナリの修復（バイナリ消失時に npm reinstall）

flags:
  -d HH:MM        with "run": stop processing 3 min before HH:MM (deadline)
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
    echo "$next_info" | awk 'NR==1{ if ($2 ~ /^[0-9]{4}-/) print $2, $3; else print "" }'
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
             | awk 'NR==1{ if ($2 ~ /^[0-9]{4}-/) print $2, $3; else print "" }')
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
    # タイマー未設定: サービス実行中なら推定次回時刻を表示
    if systemctl --user is-active "${UNIT_NAME}.service" --quiet 2>/dev/null; then
      local projected
      projected=$(python3 - "$last" << 'PYEOF'
import sys
from datetime import datetime, timedelta
last_str = (sys.argv[1] if len(sys.argv) > 1 else "").strip()
try:
    last = datetime.strptime(last_str, "%Y-%m-%d %H:%M:%S")
    base = last.replace(minute=(last.minute // 10) * 10, second=0, microsecond=0)
    print((base + timedelta(hours=5)).strftime('%Y-%m-%d %H:%M:00'))
except: pass
PYEOF
)
      if [ -n "$projected" ]; then
        next_time="(実行中) → ${projected} 予定"
      else
        next_time="(実行中) → スケジュール待ち"
      fi
    else
      next_time="none"
    fi
  fi
  printf "last  %s\nnext  %s\n" "$last" "$next_time"
  [ -f "$SKIP_HOOKS_FILE" ] && echo "skip  ON  (次回フックをスキップ)"
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

# ── 今夜の夜間実行予定時刻を表示 ────────────────────────────────
show_tonight() {
  local raw_next last_run
  raw_next=$(systemctl --user list-timers "${UNIT_NAME}.timer" --all --no-legend 2>/dev/null \
             | awk 'NR==1{ if ($2 ~ /^[0-9]{4}-/) print $2, $3; else print "" }')
  last_run=$(cat "$LAST_RUN_FILE" 2>/dev/null || echo "")

  python3 - "$raw_next" "$last_run" << 'PYEOF'
import sys
from datetime import datetime, timedelta, timezone

JST = timezone(timedelta(hours=9))
now = datetime.now(JST).replace(tzinfo=None)

raw_next = (sys.argv[1] if len(sys.argv) > 1 else "").strip()
last_run  = (sys.argv[2] if len(sys.argv) > 2 else "").strip()

# 起点: スケジュール済み時刻 > 最終実行+5h02m > now+5min の優先順
def parse_dt(s):
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M"):
        try: return datetime.strptime(s, fmt)
        except: pass
    return None

def next_cycle(t):
    base = t.replace(minute=(t.minute // 10) * 10, second=0, microsecond=0)
    return base + timedelta(hours=5)

cur = parse_dt(raw_next)
if cur is None:
    if last_run:
        t = parse_dt(last_run)
        cur = next_cycle(t) if t else None
if cur is None:
    cur = now.replace(second=0, microsecond=0) + timedelta(minutes=5)

# 夜間ウィンドウ: 0:00-6:59 (夜間初回実行と同じ条件)
NIGHT_START, NIGHT_END = 0, 7

results = []
seen = set()
probe = cur
for _ in range(40):  # 最大8日分
    if probe > now and NIGHT_START <= probe.hour < NIGHT_END:
        key = probe.date()
        if key not in seen:
            seen.add(key)
            results.append(probe)
        if len(results) >= 3:
            break
    probe = next_cycle(probe)

if not results:
    print("夜間実行の予定時刻を計算できませんでした")
    sys.exit(0)

today = now.date()
tomorrow = today + timedelta(days=1)
for r in results:
    d = r.date()
    if d == today:
        label = f"今夜      ({r.strftime('%m/%d')})"
    elif d == tomorrow:
        label = f"明朝      ({r.strftime('%m/%d')})"
    else:
        label = f"{r.strftime('%m/%d')}    "
    print(f"  {label}  {r.strftime('%H:%M')}")
PYEOF
}

# ── フックタイマーを全停止 ───────────────────────────────────
stop_hook_timers() {
  # ファイル行数より多くなっていても残骸を確実に消す上限を設ける
  local n=0
  [ -f "$HOOKS_FILE" ] && n=$(wc -l < "$HOOKS_FILE" 2>/dev/null || echo 0)
  local limit=$(( n > 20 ? n + 2 : 22 ))
  for (( i=0; i<limit; i++ )); do
    systemctl --user stop         "${HOOK_PREFIX}-${i}.timer"       2>/dev/null || true
    systemctl --user stop         "${HOOK_PREFIX}-${i}.service"     2>/dev/null || true
    systemctl --user reset-failed "${HOOK_PREFIX}-${i}.service"     2>/dev/null || true
    systemctl --user stop         "${HOOK_PREFIX}-reg-${i}.timer"   2>/dev/null || true
    systemctl --user stop         "${HOOK_PREFIX}-reg-${i}.service" 2>/dev/null || true
    systemctl --user reset-failed "${HOOK_PREFIX}-reg-${i}.service" 2>/dev/null || true
  done
}

# ── 永続ユニットファイルでタイマーを登録 ────────────────────────
# daemon-reload はサービス実行中に呼ぶと transient unit を壊すため、
# systemd-run --on-active=6 で 6秒後（サービス終了後）に実行する。
_setup_cycle_timer() {
  local target_time="$1"
  local desc="${2:-Claude Cycle Trigger}"
  local _ud="${HOME}/.config/systemd/user"
  local _svc="${_ud}/${UNIT_NAME}.service"
  local _tmr="${_ud}/${UNIT_NAME}.timer"
  local _tmr_tmp="${_ud}/${UNIT_NAME}.timer.tmp"
  mkdir -p "$_ud"

  # サービスユニット (初回 or ExecStopPost 未設定なら更新)
  if [ ! -f "$_svc" ] || ! grep -q 'ExecStopPost' "$_svc" 2>/dev/null; then
    cat > "$_svc" << EOF
[Unit]
Description=Claude Cycle

[Service]
Type=oneshot
ExecStart=${SCRIPT_DIR}/run-prompts.sh --run
ExecStopPost=/bin/bash -c 'sleep 15 && ${SCRIPT_DIR}/run-prompts.sh --recover'
StandardOutput=journal
StandardError=journal
EOF
  fi

  # タイマー内容を一時ファイルに書いておく
  cat > "$_tmr_tmp" << EOF
[Unit]
Description=${desc}

[Timer]
OnCalendar=${target_time}
Unit=${UNIT_NAME}.service
AccuracySec=1s

[Install]
WantedBy=timers.target
EOF

  # 6秒後に適用 (サービス終了後に daemon-reload することで transient unit 破壊を回避)
  systemd-run --user --collect --on-active=6 \
    -- bash -c "mv '${_tmr_tmp}' '${_tmr}'; \
                systemctl --user daemon-reload; \
                systemctl --user stop '${UNIT_NAME}.timer' 2>/dev/null || true; \
                if ! systemctl --user start '${UNIT_NAME}.timer' 2>/dev/null; then \
                  sleep 3 && systemctl --user daemon-reload && systemctl --user start '${UNIT_NAME}.timer'; \
                fi \
                || echo \"\$(date '+%Y-%m-%d %H:%M:%S') ❌ タイマー登録失敗: ${target_time}\" \
                   >> '${LOG_DIR}/schedule_errors.log'"
}

# ── 次の実行時刻を予約する ───────────────────────────────────
schedule_next() {
  local mode="${1:-cycle}"
  local arg="${2:-}"
  local start_epoch="${3:-}"   # run開始時刻(epoch秒) — cycle自動スケジュール用
  local target_time=""
  local desc="Claude Cycle Trigger"

  if [ "$mode" = "reset" ] && [ -n "$arg" ]; then
    target_time=$(python3 - "$arg" << 'PYEOF'
import sys
from datetime import datetime, timedelta, timezone
JST = timezone(timedelta(hours=9))
reset_str = sys.argv[1].strip()
now = datetime.now(JST).replace(tzinfo=None)
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
from datetime import datetime, timedelta, timezone
JST = timezone(timedelta(hours=9))
arg_time = sys.argv[1].strip()
now = datetime.now(JST).replace(tzinfo=None)
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
from datetime import datetime, timedelta, timezone
JST = timezone(timedelta(hours=9))
now = datetime.now(JST).replace(tzinfo=None)
candidates = []
for h in [3, 9, 15, 21]:
    t = now.replace(hour=h, minute=32, second=0, microsecond=0)
    if t <= now:
        t += timedelta(days=1)
    candidates.append(t)
print(min(candidates).strftime('%Y-%m-%d %H:%M:00'))
PYEOF
)
    desc="Claude Retry (Next Reset Slot)"
  elif [ -z "$target_time" ]; then
    # run開始時刻(epoch)を起点にする。なければ現在時刻
    target_time=$(python3 - "${start_epoch}" << 'PYEOF'
import sys
from datetime import datetime, timedelta, timezone
JST = timezone(timedelta(hours=9))
epoch_str = sys.argv[1].strip() if len(sys.argv) > 1 else ""
try:
    if epoch_str:
        base = datetime.fromtimestamp(int(epoch_str), JST).replace(tzinfo=None)
    else:
        base = datetime.now(JST).replace(tzinfo=None)
    base_time = base.replace(minute=(base.minute // 10) * 10, second=0, microsecond=0)
    next_run = base_time + timedelta(hours=5)
    print(next_run.strftime('%Y-%m-%d %H:%M:00'))
except Exception:
    now = datetime.now(JST).replace(tzinfo=None)
    print((now.replace(second=0, microsecond=0) + timedelta(minutes=2)).strftime('%Y-%m-%d %H:%M:00'))
PYEOF
)
  fi

  _setup_cycle_timer "$target_time" "$desc"
  schedule_hooks "$target_time" "service"
}

# ── フックコマンドをスケジュール ─────────────────────────────
# $2 = "service" : systemd サービス内から呼ぶ場合 (cgroup 脱出が必要)
# $2 = ""        : インタラクティブ端末から呼ぶ場合 (直接登録)
schedule_hooks() {
  local main_time="$1"
  local context="${2:-}"
  [ ! -f "$HOOKS_FILE" ] || [ ! -s "$HOOKS_FILE" ] && return 0

  if [ -f "$SKIP_HOOKS_FILE" ]; then
    rm -f "$SKIP_HOOKS_FILE"
    echo "⏭ フックスキップ (skip フラグ消費)"
    return 0
  fi

  stop_hook_timers

  local idx=0
  while IFS='|' read -r offset cmd; do
    [ -z "$cmd" ] && { idx=$(( idx + 1 )); continue; }

    local next_hhmm
    next_hhmm=$(echo "$main_time" | grep -oE '[0-9]{2}:[0-9]{2}' | head -1)
    local resolved_cmd="${cmd/\{NEXT\}/$next_hhmm}"

    local hook_time
    hook_time=$(python3 - "$main_time" "$offset" << 'PYEOF'
import sys
from datetime import datetime, timedelta, timezone
JST = timezone(timedelta(hours=9))
# "YYYY-MM-DD HH:MM:SS" または "YYYY-MM-DD HH:MM:00" を両方受け付ける
raw = sys.argv[1].strip()
for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M:00", "%Y-%m-%d %H:%M"):
    try:
        target = datetime.strptime(raw, fmt); break
    except: pass
else:
    raise ValueError(f"parse error: {raw}")
offset = int(sys.argv[2])
t = target + timedelta(minutes=offset)
now = datetime.now(JST).replace(tzinfo=None)
print("" if t <= now else t.strftime('%Y-%m-%d %H:%M:00'))
PYEOF
    )

    if [ -z "$hook_time" ]; then
      local _sign=""; [ "$offset" -gt 0 ] && _sign="+"
      echo "ℹ️  hook[$idx] スキップ: メイン ${main_time} の ${_sign}${offset}min は過去のため (次回サイクルで自動登録)"
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
echo "--- hook[${idx}] 開始: \$(date '+%Y-%m-%d %H:%M:%S') (${sign}${offset}min) | ${resolved_cmd} ---"
${resolved_cmd}
echo "--- hook[${idx}] 完了: \$(date '+%Y-%m-%d %H:%M:%S') ---"
} >> "\$_HOOKLOG" 2>&1
EOF
    chmod +x "$hook_script"

    local unit="${HOOK_PREFIX}-${idx}"
    if [ "$context" = "service" ]; then
      # サービス内: cgroup 脱出のため外側トランジェントタイマー経由で登録
      # 外側に名前をつけることで stop_hook_timers が止められる
      systemctl --user stop         "${HOOK_PREFIX}-reg-${idx}.timer"   2>/dev/null || true
      systemctl --user stop         "${HOOK_PREFIX}-reg-${idx}.service" 2>/dev/null || true
      systemctl --user reset-failed "${HOOK_PREFIX}-reg-${idx}.service" 2>/dev/null || true
      systemd-run --user --collect --unit="${HOOK_PREFIX}-reg-${idx}" --on-active=$(( 8 + idx )) \
        -- bash -c "systemctl --user stop         '${unit}.timer'   2>/dev/null || true; \
                    systemctl --user stop         '${unit}.service' 2>/dev/null || true; \
                    systemctl --user reset-failed '${unit}.service' 2>/dev/null || true; \
                    systemd-run --user --collect --unit='${unit}' --on-calendar='${hook_time}' \
                      --description='Claude Hook ${idx}' bash '${hook_script}'"
    else
      # インタラクティブ: cgroup 問題なし、直接登録で即反映
      systemd-run --user --collect --unit="${unit}" --on-calendar="${hook_time}" \
        --description="Claude Hook ${idx}" bash "${hook_script}"
    fi

    echo "hook[$idx] 予約: $hook_time (${sign}${offset}分) | $cmd"
    idx=$(( idx + 1 ))
  done < "$HOOKS_FILE"
}

# ── 実行メインロジック ──────────────────────────────────────
run_main() {
  local target_dir="${1:-}"
  local force_night="${2:-0}"
  local _run_start=$(date +%s)
  DATE_STR=$(date '+%Y-%m-%d %H:%M:%S')
  [ "$force_night" -ne 1 ] && echo "$DATE_STR" > "$LAST_RUN_FILE"
  LOG_FILE="$LOG_DIR/run_$(date '+%Y%m%d').log"

  local is_rate_limited=0
  local is_deadline=0
  local deadline_epoch=0
  local extracted_reset_time=""
  local night_processed=""

  # ── 締切エポック秒を計算 (設定時刻の3分前) ──
  if [ -n "$DEADLINE_TIME" ]; then
    deadline_epoch=$(python3 - "$DEADLINE_TIME" << 'PYEOF'
import sys, time
from datetime import datetime, timedelta
now = datetime.now()
try:
    t = datetime.strptime(sys.argv[1].strip(), "%H:%M")
    cutoff = datetime.combine(now.date(), t.time()) - timedelta(minutes=3)
    if cutoff <= now:
        cutoff += timedelta(days=1)
    print(int(cutoff.timestamp()))
except:
    print(0)
PYEOF
    )
  fi

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
    if [ -n "$DEADLINE_TIME" ] && [ "$deadline_epoch" -gt 0 ]; then
      local _cutoff_hm
      _cutoff_hm=$(python3 -c "import time; print(time.strftime('%H:%M', time.localtime(${deadline_epoch})))")
      echo "⏰ 締切: ${DEADLINE_TIME} → 処理中断ライン: ${_cutoff_hm}"
    fi
    echo "=========================================="
    cd "$PROJECT_DIR"

    exec_ai() {
      local file="$1"
      # 締切チェック (設定時刻の3分前で中断)
      if [ "$deadline_epoch" -gt 0 ] && [ "$(date +%s)" -ge "$deadline_epoch" ]; then
        echo "⏰ 締切3分前のため処理を中断します ($(date '+%H:%M'))"
        is_deadline=1
        return 1
      fi
      local _t0=$(date +%s)
      echo "▶ [ai-router] $(basename "$file")"
      local _cb
      _cb=$(
        { _w=/home/yuzuki/local/bin/claude; [ -x "$_w" ] && echo "$_w"; } ||
        { _p=/home/yuzuki/.npm-global/lib/node_modules/@anthropic-ai/claude-code/bin/claude.exe; [ -x "$_p" ] && echo "$_p"; } ||
        { _cv=$(command -v claude 2>/dev/null); [ -n "$_cv" ] && [ -x "$_cv" ] && echo "$_cv"; }
      ) || true
      if [ -z "${_cb:-}" ]; then echo "❌ claude コマンドが見つかりません" >&2; return 1; fi
      local output
      output=$("$_cb" -p < "$file" 2>&1)
      local ec=$?
      printf "  → %ds\n" "$(( $(date +%s) - _t0 ))"
      echo "$output"
      if [ $ec -ne 0 ] || echo "$output" | grep -qiE "rate.?limit|too many requests|overload|quota exceeded|hit your limit|resource_exhausted"; then
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
        if exec_ai "$f"; then
          _proc_ok=$(( _proc_ok + 1 ))
          [ -n "$prefix" ] && night_processed+="$prefix$(basename "$f") (OK), "
          [ "$delete_on_success" -eq 1 ] && rm "$f"
        else
          _proc_fail=$(( _proc_fail + 1 ))
          if [ "${is_deadline:-0}" -eq 1 ]; then
            [ -n "$prefix" ] && night_processed+="$prefix$(basename "$f") (DEADLINE), "
            return 1
          fi
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
      # 締切チェック (ping前)
      if [ "$deadline_epoch" -gt 0 ] && [ "$(date +%s)" -ge "$deadline_epoch" ]; then
        echo "⏰ 締切3分前のため処理を中断します ($(date '+%H:%M'))"
        is_deadline=1
      fi

      # ── ping: Claudeセッションを開始させるための軽い呼び出し ──
      if [ "${is_deadline:-0}" -eq 0 ]; then
        echo "▶ [ping] Claudeセッション確認..."
        local _pt0=$(date +%s)
        local _ping_out _ping_ec
        _ping_out=$(/home/yuzuki/local/bin/claude --dangerously-skip-permissions -p "." 2>&1)
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
      fi

      if [ $is_rate_limited -eq 0 ] && [ "${is_deadline:-0}" -eq 0 ]; then
        TODAY=$(date +%Y-%m-%d)
        HOUR=$(date +%-H)
        if [ "$force_night" -eq 1 ] || { [ "$TODAY" != "$(cat "$SCRIPT_DIR/.last_run_date" 2>/dev/null)" ] && [ "$HOUR" -lt 7 ]; }; then
          if [ "$force_night" -eq 1 ]; then
            echo "🌙 夜間タスク手動実行 ($(date '+%H:%M'))$([ "$TODAY" = "$(cat "$SCRIPT_DIR/.last_run_date" 2>/dev/null)" ] && echo " ※本日完了済みのため再実行")"
          else
            echo "🌙 夜間初回実行を開始します ($(date '+%H:%M'))"
          fi

          # 1. シェルスクリプト
          for s in "$SCRIPT_DIR/night-prompts/scripts"/*.sh; do
            [ -e "$s" ] || continue
            if [ "$deadline_epoch" -gt 0 ] && [ "$(date +%s)" -ge "$deadline_epoch" ]; then
              echo "⏰ 締切3分前 — 夜間スクリプト中断 ($(date '+%H:%M'))"; is_deadline=1; break
            fi
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
            if [ "${is_deadline:-0}" -eq 1 ] || { [ "$deadline_epoch" -gt 0 ] && [ "$(date +%s)" -ge "$deadline_epoch" ]; }; then
              echo "⏰ 締切3分前 — 夜間tmpスクリプト中断 ($(date '+%H:%M'))"; is_deadline=1; break
            fi
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
          if [ "${is_deadline:-0}" -eq 0 ] && process_dir "$SCRIPT_DIR/night-prompts/texts" 0 "[txt]"; then
            _txt_ok=$_proc_ok; _txt_fail=$_proc_fail
            if [ "${is_deadline:-0}" -eq 0 ]; then
              process_dir "$SCRIPT_DIR/night-prompts/tmp-texts" 1 "[tmp-txt]" || true
              _tmptxt_ok=$_proc_ok; _tmptxt_fail=$_proc_fail
            fi
            if [ $is_rate_limited -eq 0 ] && [ "${is_deadline:-0}" -eq 0 ]; then
              echo "$TODAY" > "$SCRIPT_DIR/.last_run_date"
            fi
          else
            _txt_ok=$_proc_ok; _txt_fail=$_proc_fail
          fi

          [ -n "$night_processed" ] && log_night "${night_processed%, }"
        fi
      fi

      if [ $is_rate_limited -eq 0 ] && [ "${is_deadline:-0}" -eq 0 ]; then
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

  if [ "$force_night" -eq 1 ]; then
    # ct night: スケジュールには一切手を加えない
    if [ "${is_deadline:-0}" -eq 1 ]; then
      log_history "NIGHT-DL" "${_es} | deadline:${DEADLINE_TIME} | ${_detail}" || true
    elif [ $is_rate_limited -eq 1 ]; then
      log_history "NIGHT-LMT" "${_es} | reset:${extracted_reset_time:-不明} | ${_detail}" || true
    else
      log_history "NIGHT-OK" "${_es} | ${_detail}" || true
    fi
  elif [ "${is_deadline:-0}" -eq 1 ]; then
    log_history "DEADLINE" "${_es} | deadline:${DEADLINE_TIME} | ${_detail}" || true
    schedule_next "cycle" "" "$_run_start"
  elif [ $is_rate_limited -eq 1 ]; then
    log_history "LIMIT  " "${_es} | reset:${extracted_reset_time:-不明} | ${_detail}" || true
    if [ -n "$extracted_reset_time" ]; then
      schedule_next "reset" "$extracted_reset_time"
    else
      schedule_next "cycle" "" "$_run_start"
    fi
  else
    log_history "SUCCESS" "${_es} | ${_detail}" || true
    schedule_next "cycle" "" "$_run_start"
  fi
  find "$LOG_DIR" -name "run_*.log" -mtime +30 -delete
}

# ── リブート後の自動復旧 ─────────────────────────────────────
recover_schedule() {
  if systemctl --user list-timers "${UNIT_NAME}.timer" --all --no-legend 2>/dev/null | grep -q "${UNIT_NAME}"; then
    echo "claude-cycle.timer 稼働中 — スキップ"
    return 0
  fi

  local last_run target_time
  last_run=$(cat "$LAST_RUN_FILE" 2>/dev/null || echo "")

  target_time=$(python3 - "$last_run" << 'PYEOF'
import sys
from datetime import datetime, timedelta
last_str = sys.argv[1].strip() if len(sys.argv) > 1 else ""
now = datetime.now()
try:
    if last_str:
        last = datetime.strptime(last_str, "%Y-%m-%d %H:%M:%S")
        base = last.replace(minute=(last.minute // 10) * 10, second=0, microsecond=0)
        nxt = base + timedelta(hours=5)
        if nxt <= now:
            nxt = now.replace(second=0, microsecond=0) + timedelta(minutes=2)
    else:
        nxt = now.replace(second=0, microsecond=0) + timedelta(minutes=2)
    print(nxt.strftime('%Y-%m-%d %H:%M:00'))
except Exception:
    nxt = now.replace(second=0, microsecond=0) + timedelta(minutes=2)
    print(nxt.strftime('%Y-%m-%d %H:%M:00'))
PYEOF
)

  echo "🔄 リブート後復旧: $target_time にスケジュール"
  _setup_cycle_timer "$target_time" "Claude Cycle (recovered)"
  schedule_hooks "$target_time"
}

# ── 引数処理 ────────────────────────────────────────────────
CMD="status"
TARGET_DIR=""
DEADLINE_TIME=""
SET_TIME=""
HOOK_OFFSET=0
HOOK_CMD=""
HOOK_RM_IDX=""
HOOK_MV_FROM=""
HOOK_MV_TO=""
LOG_DATE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    run)
      CMD="run"; shift
      while [[ $# -gt 0 ]]; do
        case "$1" in
          -d)
            _d_arg="${2:?ct: -d requires HH:MM or DIR}"
            if [[ "$_d_arg" =~ ^[0-9]{1,2}:[0-9]{2}$ ]]; then
              DEADLINE_TIME="$_d_arg"
            else
              TARGET_DIR="$_d_arg"
            fi
            shift 2 ;;
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
    skip)    CMD="skip";    shift ;;
    rm)
      CMD="hook-rm"
      HOOK_RM_IDX="${2:?ct: rm requires INDEX}"
      shift 2
      ;;
    mv)
      CMD="hook-mv"
      HOOK_MV_FROM="${2:?ct: mv requires FROM INDEX}"
      HOOK_MV_TO="${3:?ct: mv requires TO INDEX}"
      shift 3
      ;;
    cancel)  CMD="cancel";  shift ;;
    night)   CMD="night";   shift ;;
    tonight) CMD="tonight"; shift ;;
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
    repair)   CMD="repair";  shift ;;
    -h|--help) CMD="help";  shift ;;
    --run)     CMD="_run";     shift ;;  # systemd internal
    --recover) CMD="recover";  shift ;;  # systemd startup recovery
    *)        printf "ct: unknown: %s\n" "$1" >&2; exit 1 ;;
  esac
done

case "$CMD" in
  status)    show_status ;;
  run)       run_main "$TARGET_DIR"; show_status ;;
  night)     run_main "" 1; show_status ;;
  set)
    _set_dt=$(python3 - "$SET_TIME" << 'PYEOF'
import sys
from datetime import datetime, timedelta, timezone
JST = timezone(timedelta(hours=9))
now = datetime.now(JST).replace(tzinfo=None)
try:
    t = datetime.strptime(sys.argv[1].strip(), "%H:%M").time()
    target = datetime.combine(now.date(), t)
    if target <= now:
        target += timedelta(days=1)
    print(target.strftime('%Y-%m-%d %H:%M JST'))
except Exception:
    print("")
PYEOF
)
    if [ -z "$_set_dt" ]; then echo "❌ 形式不正 (HH:MM)"; exit 1; fi
    schedule_next "cycle" "$SET_TIME" && printf "scheduled  %s\n" "$_set_dt"
    ;;
  cancel)
    systemctl --user stop "${UNIT_NAME}.timer" 2>/dev/null || true
    stop_hook_timers
    echo "cancelled"
    ;;
  hook-add)
    printf '%s|%s\n' "$HOOK_OFFSET" "$HOOK_CMD" >> "$HOOKS_FILE"
    _sign=""; [ "$HOOK_OFFSET" -gt 0 ] && _sign="+"
    echo "hook 追加: ${_sign}${HOOK_OFFSET}分  $HOOK_CMD"
    _raw_next=$(systemctl --user list-timers "${UNIT_NAME}.timer" --all --no-legend 2>/dev/null \
                | awk 'NR==1{ if ($2 ~ /^[0-9]{4}-/) print $2, $3; else print "" }')
    if [ -n "$_raw_next" ]; then
      schedule_hooks "$_raw_next"
    else
      echo "(メインタイマー未設定 — 次回 ct run/set で登録されます)"
    fi
    ;;
  hook-ls)
    if [ ! -f "$HOOKS_FILE" ] || [ ! -s "$HOOKS_FILE" ]; then
      echo "フック未登録"
    else
      _raw_next=$(systemctl --user list-timers "${UNIT_NAME}.timer" --all --no-legend 2>/dev/null \
                  | awk 'NR==1{ if ($2 ~ /^[0-9]{4}-/) print $2, $3; else print "" }')
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
  skip)
    if [ -f "$SKIP_HOOKS_FILE" ]; then
      rm -f "$SKIP_HOOKS_FILE"
      echo "スキップをキャンセルしました"
    else
      touch "$SKIP_HOOKS_FILE"
      echo "次回のフック実行をスキップします"
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
    # 全タイマーを停止し、残りフックを新インデックスで再登録
    stop_hook_timers
    _raw_next=$(systemctl --user list-timers "${UNIT_NAME}.timer" --all --no-legend 2>/dev/null \
                | awk 'NR==1{ if ($2 ~ /^[0-9]{4}-/) print $2, $3; else print "" }')
    [ -n "$_raw_next" ] && schedule_hooks "$_raw_next"
    ;;
  hook-mv)
    if [ ! -f "$HOOKS_FILE" ]; then
      echo "フック未登録" >&2; exit 1
    fi
    python3 - "$HOOKS_FILE" "$HOOK_MV_FROM" "$HOOK_MV_TO" << 'PYEOF'
import sys
path, src, dst = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
lines = open(path).readlines()
n = len(lines)
if src < 0 or src >= n:
    print(f"インデックス範囲外: {src}", file=sys.stderr); sys.exit(1)
if dst < 0 or dst >= n:
    print(f"インデックス範囲外: {dst}", file=sys.stderr); sys.exit(1)
if src == dst:
    print("同じインデックスです"); sys.exit(0)
item = lines.pop(src)
lines.insert(dst, item)
open(path, 'w').writelines(lines)
print(f"hook[{src}] → [{dst}] 移動完了: {item.strip()}")
PYEOF
    # 全タイマーを停止し、新インデックスで再登録
    stop_hook_timers
    _raw_next=$(systemctl --user list-timers "${UNIT_NAME}.timer" --all --no-legend 2>/dev/null \
                | awk 'NR==1{ if ($2 ~ /^[0-9]{4}-/) print $2, $3; else print "" }')
    [ -n "$_raw_next" ] && schedule_hooks "$_raw_next"
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
  tonight)   show_tonight ;;
  last)      cat "$LAST_RUN_FILE" 2>/dev/null || echo "never" ;;
  next)      get_next_time || echo "none" ;;
  help)      show_help ;;
  repair)
    _CLAUDE_EXE="/home/yuzuki/.npm-global/lib/node_modules/@anthropic-ai/claude-code/bin/claude.exe"
    _NPM_BIN=$(command -v npm 2>/dev/null || echo "/usr/bin/npm")
    _NODE_BIN="/home/sera/.config/nvm/versions/node/v20.20.2/bin"
    if [ -x "$_CLAUDE_EXE" ]; then
      echo "✓ claude バイナリは正常です"
      echo "  パス: $_CLAUDE_EXE"
      _ver=$("$_CLAUDE_EXE" --version 2>&1 | head -1) && echo "  バージョン: $_ver" || true
    else
      echo "⚠️  claude バイナリが見つかりません。修復を開始します..."
      # npm 更新失敗による残骸をクリア
      find /home/yuzuki/.npm-global/lib/node_modules/@anthropic-ai \
        -maxdepth 1 -name ".claude-code-*" -exec rm -rf {} + 2>/dev/null || true
      export PATH="/home/yuzuki/.npm-global/bin:${_NODE_BIN}:$PATH"
      if "$_NPM_BIN" install -g @anthropic-ai/claude-code; then
        if [ -x "$_CLAUDE_EXE" ]; then
          echo "✓ 修復完了"
          _ver=$("$_CLAUDE_EXE" --version 2>&1 | head -1) && echo "  バージョン: $_ver" || true
        else
          echo "❌ インストール後もバイナリが見つかりません" >&2; exit 1
        fi
      else
        echo "❌ npm install 失敗。手動で npm install -g @anthropic-ai/claude-code を実行してください。" >&2; exit 1
      fi
    fi
    ;;
  _run)      run_main "$TARGET_DIR" ;;  # called by systemd
  recover)   recover_schedule ;;       # called by systemd on boot
esac
