#!/bin/bash
# 夜間自動実行用ラッパー（night-scripts.list は引数を渡せないため用意）。
# 監査を改善モード(-i)で実行し、監査結果を元に生成・検証プロンプトを継続改良する。
# 手動で監査だけ（改良なし）行いたい場合は audit-questions.sh を直接実行すること。
exec "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/audit-questions.sh" -i -n 30 "$@"
