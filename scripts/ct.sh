#!/bin/bash
# ct — mugenknock スケジュール管理コマンド (ローカル自己完結版)
#
# 構成(2026-09〜 ローカル移行): Fargate/EventBridgeは使わない。ローカル時計
#   ~/.config/mugenknock/next_ping を唯一の正とし、systemd userタイマーで
#   5時間サイクル(ピン+hook/hook2/postping)を回す。PCが動いている間だけ稼働。
#
#   ・ピン(localping)は常時稼働。完全停止は ct cancel(ping_disabled フラグ)。
#   ・ct on/off はフックスクリプト(hook/hook2/夜間バッチ)だけを切替(hooks_enabled フラグ)。
#
# usage: ct [command]
#   (なし)        状況表示
#   on / off     フック(hook/hook2/夜間バッチ)の有効/無効 (ピンは常時)
#   set HH:MM    次回ピン時刻を HH:MM に変更 (以降は/usage回復時刻で自動追従)
#   resume       ピン再開 (次回=now+5h。ct cancel からの復帰)
#   cancel       完全停止 (ピンもフックも止める)
#   sync         時計に合わせてローカルタイマーを再同期
#   skip         次回のフック(hook/hook2)を今回だけスキップ
#   run          今すぐローカルピンを実行
#   log [-f|-n|-d DATE]   履歴/ログ表示
#   -l 最終実行  -n 次回予定  -h ヘルプ

set -uo pipefail

REPO=/home/yuzuki/aws-quiz-app
PROJECT=mugenknock
UNIT_DIR="$HOME/.config/systemd/user"
CFG="$HOME/.config/mugenknock"
CLOCK="$CFG/next_ping"
DISABLED_FLAG="$CFG/ping_disabled"
HOOKS_FLAG="$CFG/hooks_enabled"
SYNC="$REPO/scripts/sync-local-schedule.sh"
SELF="$REPO/scripts/ct.sh"
MODE_RESET_ONCALENDAR="Sat *-*-* 03:00:00"

mkdir -p "$CFG"
# フック設定の共有ライブラリ(hooks.conf の読み書き)
MK_REPO="$REPO"
source "$REPO/scripts/mk-hooks-lib.sh"
_hooks_on()  { [ -f "$HOOKS_FLAG" ]; }
_disabled()  { [ -f "$DISABLED_FLAG" ]; }
_get_next()  { cat "$CLOCK" 2>/dev/null | tr -d '\n'; }
_sync()      { bash "$SYNC" 2>&1 | sed 's/^/  /'; }

# now+5h(分を10分切り捨て)の ISO を返す
_now_plus5() {
  python3 -c "from datetime import datetime,timedelta; n=datetime.now(); b=n.replace(minute=(n.minute//10)*10,second=0,microsecond=0); print((b+timedelta(hours=5)).strftime('%Y-%m-%dT%H:%M:%S'))"
}

# ── 週次リセットタイマー: 土曜03:00に ct off(フックのみ) ──
_install_mode_reset_timer() {
  mkdir -p "$UNIT_DIR"
  cat > "$UNIT_DIR/${PROJECT}-mode-reset.service" << EOF
[Unit]
Description=mugenknock weekly reset to hooks-off (ct off)

[Service]
Type=oneshot
ExecStart=/bin/bash -lc '${SELF} off'
EOF
  cat > "$UNIT_DIR/${PROJECT}-mode-reset.timer" << EOF
[Unit]
Description=mugenknock weekly hooks-off timer (${MODE_RESET_ONCALENDAR})

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

# ── 状況表示 ──
show_status() {
  local next_str last
  next_str=$(systemctl --user list-timers 'mugenknock-localping.timer' --all --no-legend 2>/dev/null | awk '{print $1" "$2" ("$5" "$6")"}')
  [ -z "$next_str" ] && next_str="$(_get_next | tr 'T' ' ')"
  last=$(tail -n1 "$REPO/prompts/.claude_history" 2>/dev/null | awk -F'|' '{print $1}' | sed 's/[[:space:]]*$//')
  [ -z "$last" ] && last="never"

  echo "── ローカルピン (systemd) ──"
  if _disabled; then
    printf "  ping  停止 (ct resume で再開)\n"
  else
    printf "  ping  on (常時稼働・ローカル)\n"
    printf "  next  %s\n" "${next_str:-未アーム (ct sync)}"
  fi
  printf "  last  %s\n" "$last"
  printf "  clock %s\n" "$(_get_next | tr 'T' ' ')"

  echo "── フックスクリプト (ct on/off で切替 / ct hooks で編集) ──"
  if _hooks_on; then
    echo "  hooks on (有効)"
    local n=0
    while IFS="$(printf '\t')" read -r _m _s _l; do
      [ -n "$_m" ] || continue
      n=$((n+1))
      printf "    %d. ピン%s分前  %s\n" "$n" "$_m" "${_l:-$_s}"
    done < <(hooks_list)
    [ "$n" -eq 0 ] && echo "    (hooks.conf に有効な行なし)"
    local reset_next
    reset_next=$(systemctl --user list-timers "${PROJECT}-mode-reset.timer" --all --no-legend 2>/dev/null | awk '{print $1" "$2" "$3}')
    [ -n "$reset_next" ] && printf "  reset %s に自動 off(フックのみ)\n" "$reset_next"
  else
    echo "  hooks off (無効 — ct on で有効化)"
  fi

  echo "── ローカル systemd タイマー ──"
  systemctl --user list-timers \
    'mugenknock-localping.timer' 'mugenknock-hook-*.timer' \
    'mugenknock-postping.timer' 'mugenknock-canary.timer' 'mugenknock-nightly-noai.timer' \
    --all --no-legend 2>/dev/null \
    | awk '{printf "  %-28s next %s %s\n", $NF, $1, $2}' \
    || echo "  (タイマー未設定 — ct sync で作成)"
}

# ── ct set HH:MM ──
set_schedule() {
  local hhmm="$1" iso
  iso=$(python3 - "$hhmm" << 'PYEOF'
import sys
from datetime import datetime, timedelta
try:
    t = datetime.strptime(sys.argv[1].strip(), "%H:%M").time()
    now = datetime.now()
    target = datetime.combine(now.date(), t)
    if target <= now: target += timedelta(days=1)
    print(target.strftime("%Y-%m-%dT%H:%M:%S"))
except Exception as e:
    import sys as _s; print(f"ERROR:{e}", file=_s.stderr); sys.exit(1)
PYEOF
) || { echo "❌ 形式不正 (例: ct set 03:30)"; return 1; }
  rm -f "$DISABLED_FLAG"
  printf '%s' "$iso" > "$CLOCK"
  printf "✓ 次回ピン: %s JST (以降は/usage回復時刻で追従)\n" "${iso/T/ }"
  echo "ローカルタイマーを同期中..."; _sync
}

# ── ct resume ──
resume_schedule() {
  rm -f "$DISABLED_FLAG"
  local iso; iso=$(_now_plus5)
  printf '%s' "$iso" > "$CLOCK"
  echo "✓ 再開: 次回ピン ${iso/T/ } (以降5時間ごと・/usageで追従)"
  echo "ローカルタイマーを同期中..."; _sync
}

# ── ct cancel (完全停止) ──
cancel_schedule() {
  touch "$DISABLED_FLAG"
  echo "✓ 完全停止 (ct resume で再開)"
  echo "ローカルタイマーを停止中..."; _sync
}

# ── ピン稼働を保証(停止中なら復帰) ──
_ensure_ping_enabled() {
  if _disabled; then
    rm -f "$DISABLED_FLAG"
    [ -n "$(_get_next)" ] || _now_plus5 > "$CLOCK"
    echo "  ピンを再開(停止解除)"
  else
    [ -n "$(_get_next)" ] || { _now_plus5 > "$CLOCK"; echo "  時計を初期化(now+5h)"; }
  fi
}

# ── ct on (フック有効) ──
mode_on() {
  echo "▶ フック ON — ピン前後のフックスクリプト(hook/hook2/夜間バッチ)を有効化します"
  touch "$HOOKS_FLAG"
  _ensure_ping_enabled
  _install_mode_reset_timer
  echo "ローカルタイマーを同期中(フック有効で再アーム)..."; _sync
  local next_reset
  next_reset=$(systemctl --user list-timers "${PROJECT}-mode-reset.timer" --all --no-legend 2>/dev/null | awk '{print $1" "$2" "$3}')
  echo "  自動リセット: ${next_reset:-土曜 03:00} に ct off(フックのみ) へ戻します"
}

# ── ct off (フック無効) ──
mode_off() {
  echo "⏸ フック OFF — フックスクリプト(hook/hook2/夜間バッチ)を停止します。ピンは常時稼働のまま。"
  rm -f "$HOOKS_FLAG"
  echo "ローカルタイマーを同期中(hook/hook2 停止・postping は維持)..."; _sync
}

# ── ct run (今すぐローカルピン実行) ──
run_now() {
  echo "▶ ローカルピンを実行します..."
  bash "$REPO/scripts/local-ping-run.sh"
}

# ── ct skip (次回のフックを今回だけスキップ) ──
skip_hooks() {
  local stopped=0 u b
  for u in "$UNIT_DIR"/mugenknock-hook-*.timer; do
    [ -e "$u" ] || continue
    b=$(basename "$u")
    systemctl --user stop "$b" 2>/dev/null && stopped=$(( stopped + 1 ))
  done
  if [ "$stopped" -gt 0 ]; then
    echo "✓ 次回のフックをスキップします (${stopped}件停止)"
  else
    echo "✓ 次回のフックをスキップします (対象タイマーは既に停止/未アーム)"
  fi
  echo "  次サイクルは postping(+10分)の再同期で自動復帰します。すぐ戻すには ct sync。"
}

# ── ct hooks [list|add|rm] (フックの設定) ──
hooks_cmd() {
  local sub="${1:-list}"; shift || true
  case "$sub" in
    list|"")
      echo "── フック設定 (~/.config/mugenknock/hooks.conf) ──"
      echo "  実行はピンの指定分前。ct on のとき有効。"
      local n=0 clk; clk=$(_get_next)
      printf "  %-3s %-6s %-28s %s\n" "#" "分前" "スクリプト" "ラベル / 次回発火"
      while IFS="$(printf '\t')" read -r m s l; do
        [ -n "$m" ] || continue
        n=$((n+1))
        local when=""
        if [ -n "$clk" ]; then
          when=$(python3 -c "from datetime import datetime,timedelta; print((datetime.strptime('$clk','%Y-%m-%dT%H:%M:%S')-timedelta(minutes=$m)).strftime('%H:%M'))" 2>/dev/null)
        fi
        printf "  %-3s %-6s %-28s %s\n" "$n" "$m" "$s" "${l:-}${when:+  (次回 $when)}"
      done < <(hooks_list)
      [ "$n" -eq 0 ] && echo "  (有効な行なし)"
      echo "  操作: ct hooks add <分前> <スクリプト> [ラベル...] / ct hooks rm <#>"
      ;;
    add)
      local minb="${1:-}" script="${2:-}"; shift 2 2>/dev/null || true
      local label="$*"
      if ! [[ "$minb" =~ ^[0-9]+$ ]] || [ -z "$script" ]; then
        echo "❌ 使い方: ct hooks add <分前(正整数)> <スクリプト> [ラベル...]"; return 1
      fi
      local abs; abs=$(hooks_resolve "$script")
      [ -f "$abs" ] || echo "⚠️ 警告: スクリプトが見つかりません: $abs (登録は続行)"
      hooks_seed_defaults
      printf '%s|%s|%s\n' "$minb" "$script" "$label" >> "$HOOKS_CONF"
      echo "✓ 追加: ピン${minb}分前  ${label:-$script}"
      echo "同期中..."; _sync
      ;;
    rm|del|remove)
      local target="${1:-}"
      if ! [[ "$target" =~ ^[0-9]+$ ]]; then echo "❌ 使い方: ct hooks rm <#>  (# は ct hooks list の番号)"; return 1; fi
      # 先に全行を配列へ読み切る(同一ファイルの読みながら書き=競合を避ける)
      local _lines; mapfile -t _lines < <(hooks_list)
      local total=${#_lines[@]}
      if [ "$target" -lt 1 ] || [ "$target" -gt "$total" ]; then
        echo "❌ #${target} は存在しません (ct hooks list で確認)"; return 1
      fi
      local removed; removed=$(printf '%s' "${_lines[$((target-1))]}" | cut -f3)
      local i=0
      { for ln in "${_lines[@]}"; do
          i=$((i+1))
          [ "$i" -eq "$target" ] && continue
          printf '%s\n' "$ln"
        done; } | hooks_rewrite
      echo "✓ 削除: #${target} ${removed}"
      echo "同期中..."; _sync
      ;;
    edit)
      hooks_seed_defaults; "${EDITOR:-vi}" "$HOOKS_CONF"; echo "同期中..."; _sync ;;
    *)
      echo "ct hooks: 不明なサブコマンド: $sub (list|add|rm|edit)"; return 1 ;;
  esac
}

# ── ct log ──
show_log() {
  local mode="${1:-history}" date_arg="${2:-}"
  case "$mode" in
    history)
      if [ -s "$REPO/prompts/.claude_history" ]; then
        printf "%-19s  %-9s  %s\n" "datetime" "status" "elapsed | detail"
        printf '%s\n' "--------------------  ---------  ----------------------------------------"
        tail -n 30 "$REPO/prompts/.claude_history"
      else echo "履歴なし"; fi ;;
    night)
      [ -s "$REPO/prompts/.night_history" ] && tail -n 30 "$REPO/prompts/.night_history" || echo "夜間スクリプト履歴なし" ;;
    full)
      echo "=== journalctl --user -u mugenknock-localping.service (直近) ==="
      journalctl --user -u mugenknock-localping.service -n 80 --no-pager 2>/dev/null || echo "journalなし" ;;
    date)
      local f="$REPO/prompts/logs/run_${date_arg}.log"
      if [ -s "$f" ]; then echo "=== run_${date_arg}.log ==="; cat "$f"
      else echo "ログなし: run_${date_arg}.log"; fi ;;
  esac
}

# ── 引数処理 ──
CMD="status"; LOG_DATE=""; SET_TIME=""; HOOKS_ARGS=()
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
    hooks)  CMD="hooks";  shift; HOOKS_ARGS=("$@"); break ;;
    log)
      CMD="log"; shift
      case "${1:-}" in
        -f) CMD="log-full";  shift ;;
        -n) CMD="log-night"; shift ;;
        -d) CMD="log-date"; LOG_DATE="${2:?-d には YYYYMMDD が必要です}"; shift 2 ;;
      esac ;;
    -l) _get_next >/dev/null; tail -n1 "$REPO/prompts/.claude_history" 2>/dev/null | awk -F'|' '{print $1}'; exit 0 ;;
    -n) _get_next | tr 'T' ' '; echo; exit 0 ;;
    -h|--help) cat << 'EOF'
usage: ct [command]  (ローカル自己完結版・Fargate不使用)
  (なし)        状況表示
  on           フック有効 (hook/hook2/夜間バッチを実行。ピンは常時稼働)
               ※ 土曜03:00に自動で off(フックのみ) へ戻る
  off          フック無効 (フック/夜間バッチを停止。ピンは常時稼働)
  hooks        フック設定 (list|add <分前> <script> [label]|rm <#>|edit)
  set HH:MM    次回ピン時刻を変更 (以降は/usage回復時刻で追従)
  resume       ピン再開 (次回=now+5h)
  cancel       完全停止 (ピンもフックも止める)
  sync         ローカルタイマーを時計に再同期
  skip         次回のフック(hook/hook2)を今回だけスキップ
  run          今すぐローカルピンを実行
  log [-f|-n|-d DATE]   履歴/ログ (-f=journal -n=夜間 -d=日付)
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
  sync)      _sync ;;
  skip)      skip_hooks ;;
  run)       run_now ;;
  hooks)     hooks_cmd "${HOOKS_ARGS[@]}" ;;
  log)       show_log "history" ;;
  log-full)  show_log "full" ;;
  log-night) show_log "night" ;;
  log-date)  show_log "date" "$LOG_DATE" ;;
esac
