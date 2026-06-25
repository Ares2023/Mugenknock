#!/bin/bash
# 夜間自動実行用ラッパー（night-scripts.list は引数を渡せないため用意）。
# 問題生成を常に難易度強化モード（--hard）で実行する。
# 夜間生成は以降この難問レベルで行う方針。手動で通常難易度にしたい場合は
# 01-generate-questions.sh を直接 --hard なしで実行すること。
exec "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/01-generate-questions.sh" --hard "$@"
