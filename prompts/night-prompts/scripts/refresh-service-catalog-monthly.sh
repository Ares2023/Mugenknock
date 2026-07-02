#!/bin/bash
# 夜間自動実行用ラッパー（night-scripts.list は引数を渡せないため用意）。
# refresh-service-catalog.sh を --max-age-days 30 で呼び、30日以内に確認済みの
# サービスはスキップする。毎晩起動しても実質「サービスごとに月1回」だけ
# 公式情報(WebFetch)で提供状態・docUrl を確認・最新化する。
# -n でコスト上限を絞り、未確認分は複数晩に分けて消化する。
exec "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/refresh-service-catalog.sh" --max-age-days 30 -n 24 "$@"
