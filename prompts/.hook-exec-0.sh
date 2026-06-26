#!/bin/bash
_HOOKLOG="/home/yuzuki/aws-quiz-app/prompts/logs/run_$(date '+%Y%m%d').log"
{
echo ""
echo "--- hook[0] 開始: $(date '+%Y-%m-%d %H:%M:%S') (-30min) | ~/aws-quiz-app/prompts/night-prompts/scripts/02-check-validity.sh -n 100 -D 20:10 ---"
~/aws-quiz-app/prompts/night-prompts/scripts/02-check-validity.sh -n 100 -D 20:10
echo "--- hook[0] 完了: $(date '+%Y-%m-%d %H:%M:%S') ---"
} >> "$_HOOKLOG" 2>&1
