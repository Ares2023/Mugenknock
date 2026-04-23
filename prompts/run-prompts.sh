#!/bin/bash
# 毎晩 1:00 に実行される Claude プロンプト自動実行スクリプト
# bat-prompts/ : 毎回実行（削除しない）
# tmp-prompts/ : 一度だけ実行して削除

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_DIR="$SCRIPT_DIR/logs"
mkdir -p "$LOG_DIR"

DATE=$(date '+%Y%m%d_%H%M%S')
LOG_FILE="$LOG_DIR/run_${DATE}.log"

export PATH="/home/sera/.config/nvm/versions/node/v20.20.2/bin:$PATH"

if [ -f "${HOME}/.bashrc" ]; then
  set +u
  source "${HOME}/.bashrc" 2>/dev/null || true
  set -u
fi

# ── レート制限を検出したら次のリセット時刻にリスケジュール ──
reschedule_on_ratelimit() {
  local output="$1"
  local exit_code="$2"
  if [ "$exit_code" -ne 0 ] || echo "$output" | grep -qiE "rate.?limit|too many requests|overload|529|quota exceeded|usage limit"; then
    local next_reset
    next_reset=$(python3 << 'PYEOF'
from datetime import datetime, timezone, timedelta
jst = timezone(timedelta(hours=9))
now = datetime.now(jst)
candidates = []
for h in [3, 9, 15, 21]:
    t = now.replace(hour=h, minute=30, second=0, microsecond=0)
    if t <= now:
        t += timedelta(days=1)
    candidates.append(t)
print(min(candidates).strftime('%H:%M'))
PYEOF
)
    echo "⚠️  レート制限を検出 → ${next_reset} JST に再スケジュール"
    systemd-run --user \
      --on-calendar="*-*-* ${next_reset}:00" \
      --unit="claude-prompts-retry.service" \
      "$SCRIPT_DIR/run-prompts.sh" \
      && echo "✓ スケジュール完了: ${next_reset} JST" \
      || echo "✗ systemd-run 失敗"
    return 1  # レート制限フラグ
  fi
  return 0
}

{
  echo "=========================================="
  echo "実行日時: $(date '+%Y-%m-%d %H:%M:%S')"
  echo "=========================================="

  cd "$PROJECT_DIR"

  # ── bat-prompts: 毎回実行 ──────────────────
  BAT_COUNT=0
  for f in "$SCRIPT_DIR/bat-prompts"/*.txt; do
    [ -e "$f" ] || continue
    BAT_COUNT=$((BAT_COUNT + 1))
    echo ""
    echo "▶ [bat] $(basename "$f")"
    echo "------------------------------------------"
    OUTPUT=$(claude --dangerously-skip-permissions -p "$(cat "$f")" 2>&1)
    EXIT_CODE=$?
    echo "$OUTPUT"
    echo ""
    if reschedule_on_ratelimit "$OUTPUT" "$EXIT_CODE"; then
      echo "✓ 完了: $(basename "$f")"
    else
      echo "⚠️  レート制限により中断。残りファイルは次回実行時に処理されます。"
      break
    fi
  done
  [ "$BAT_COUNT" -eq 0 ] && echo "[bat-prompts] 実行するファイルなし"

  # ── tmp-prompts: 一度だけ実行して削除 ──────
  TMP_COUNT=0
  for f in "$SCRIPT_DIR/tmp-prompts"/*.txt; do
    [ -e "$f" ] || continue
    TMP_COUNT=$((TMP_COUNT + 1))
    echo ""
    echo "▶ [tmp] $(basename "$f")"
    echo "------------------------------------------"
    OUTPUT=$(claude --dangerously-skip-permissions -p "$(cat "$f")" 2>&1)
    EXIT_CODE=$?
    echo "$OUTPUT"
    echo ""
    if reschedule_on_ratelimit "$OUTPUT" "$EXIT_CODE"; then
      rm "$f"
      echo "✓ 完了・削除: $(basename "$f")"
    else
      echo "⚠️  レート制限により中断。残りファイルは次回実行時に処理されます。"
      break
    fi
  done
  [ "$TMP_COUNT" -eq 0 ] && echo "[tmp-prompts] 実行するファイルなし"

  echo ""
  echo "=========================================="
  echo "終了: $(date '+%Y-%m-%d %H:%M:%S')"
  echo "=========================================="

} >> "$LOG_FILE" 2>&1

find "$LOG_DIR" -name "run_*.log" -mtime +30 -delete
