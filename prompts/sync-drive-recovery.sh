#!/bin/bash
# Google Drive の claude_next_recovery.txt を次回実行時刻で更新する
# 引数$1: 次回時刻 (YYYY-MM-DD HH:MM:SS)。省略時は run-prompts.sh -n から取得

export PATH="/home/yuzuki/local/bin:$PATH"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RCLONE=~/local/bin/rclone

NEXT="${1:-}"
if [ -z "$NEXT" ]; then
  NEXT=$(bash "$SCRIPT_DIR/run-prompts.sh" -n 2>/dev/null)
fi

if [ -z "$NEXT" ]; then
  echo "$(date '+%Y-%m-%d %H:%M:%S') skip: next time unavailable"
  exit 0
fi

if [ ! -x "$RCLONE" ]; then
  echo "$(date '+%Y-%m-%d %H:%M:%S') skip: rclone not found at $RCLONE"
  exit 1
fi

echo "$(date '+%Y-%m-%d %H:%M:%S') updating Drive: next_recovery=${NEXT}"
printf 'next_recovery=%s\n' "$NEXT" | "$RCLONE" rcat gdrive:claude_next_recovery.txt 2>&1
EC=$?
if [ $EC -eq 0 ]; then
  echo "$(date '+%Y-%m-%d %H:%M:%S') done"
else
  echo "$(date '+%Y-%m-%d %H:%M:%S') ERROR: rclone exited $EC"
  exit $EC
fi
