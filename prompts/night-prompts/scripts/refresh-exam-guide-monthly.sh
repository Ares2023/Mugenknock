#!/bin/bash
# 夜間自動実行用ラッパー（night-scripts.list は引数を渡せないため用意）。
# refresh-exam-guide.sh を --max-age-days 30 で呼び、30日以内に更新済みの資格は
# スキップする。毎晩起動しても実質「資格ごとに月1回」だけ公式ガイドを取得・最新化する。
# 生成・検証の WebFetch を撤去したため、現行性はこの定期更新で担保する。
#
# --max-per-run 2: 重いWebFetchが1晩に集中しないよう、1晩あたり最大2資格まで（古い順）に
# 制限して複数日へローテーション分散する。12資格でも2件/晩なら1ヶ月に十分巡回できる
# （30日で最大60件の更新枠 ≫ 必要12件）。
exec "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/refresh-exam-guide.sh" --max-age-days 30 --max-per-run 2 "$@"
