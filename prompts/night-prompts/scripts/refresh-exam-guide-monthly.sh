#!/bin/bash
# 夜間自動実行用ラッパー（night-scripts.list は引数を渡せないため用意）。
# refresh-exam-guide.sh を --max-age-days 30 で呼び、30日以内に更新済みの資格は
# スキップする。毎晩起動しても実質「資格ごとに月1回」だけ公式ガイドを取得・最新化する。
# 生成・検証の WebFetch を撤去したため、現行性はこの定期更新で担保する。
exec "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/refresh-exam-guide.sh" --max-age-days 30 "$@"
