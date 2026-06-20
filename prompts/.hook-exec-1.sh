#!/bin/bash
_HOOKLOG="/home/yuzuki/aws-quiz-app/prompts/logs/run_$(date '+%Y%m%d').log"
{
echo ""
echo "--- hook[1] 開始: $(date '+%Y-%m-%d %H:%M:%S') (-20min) | ~/aws-quiz-app/prompts/night-prompts/scripts/01-generate-questions.sh -n 5 -D 13:00 ---"
~/aws-quiz-app/prompts/night-prompts/scripts/01-generate-questions.sh -n 5 -D 13:00
echo "--- hook[1] 完了: $(date '+%Y-%m-%d %H:%M:%S') ---"
} >> "$_HOOKLOG" 2>&1
