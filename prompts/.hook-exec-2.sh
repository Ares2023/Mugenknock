#!/bin/bash
_HOOKLOG="/home/yuzuki/aws-quiz-app/prompts/logs/run_$(date '+%Y%m%d').log"
{
echo ""
echo "--- hook[2] 開始: $(date '+%Y-%m-%d %H:%M:%S') (+5min) | ~/aws-quiz-app/prompts/night-prompts/manual/06-fix-format.sh -n 100 ---"
~/aws-quiz-app/prompts/night-prompts/manual/06-fix-format.sh -n 100
echo "--- hook[2] 完了: $(date '+%Y-%m-%d %H:%M:%S') ---"
} >> "$_HOOKLOG" 2>&1
