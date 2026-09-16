#!/bin/bash
# 夜間自動実行用ラッパー（night-scripts.list は引数を渡せないため用意）。
# 監査を改善モード(-i)で実行し、監査結果を元に生成・検証プロンプトを継続改良する。
# 手動で監査だけ（改良なし）行いたい場合は audit-questions.sh を直接実行すること。
#
# トークン節約 (2026-07-22): サンプル数30→15・チャンクサイズ5→8 に変更。
# opus呼び出し回数が 6回/晩 → 2回/晩 に減り、夜間バッチのトークン消費を大幅に削減する。

# 週次バーンスルー判定 (2026-09-07): 水曜早朝の本監査実行時点で週間トークン使用率
# (cusage --raw の2列目)が50%以下なら、週の後半に余力があるとみなし ct on
# （使い切りモード）へ切り替える。土曜03:00の自動リセット(ct.sh の mode-reset)と
# 組み合わせ、余った枠を消化する。ct on は既にON中でも安全に呼べる(resume_schedule)。
if [ "$(date +%u)" = "3" ]; then
  WEEK_PCT=$(/home/yuzuki/bin/cusage --raw 2>/dev/null | awk '{print $2}')
  if [[ "$WEEK_PCT" =~ ^[0-9]+$ ]] && [ "$WEEK_PCT" -le 50 ]; then
    echo "[週次判定] 週間トークン使用率 ${WEEK_PCT}% ≦ 50% → ct on（使い切りモード）に切り替え"
    /home/yuzuki/aws-quiz-app/scripts/ct.sh on || true
  else
    echo "[週次判定] 週間トークン使用率取得失敗、または50%超のため ct on 判定をスキップ (取得値: '${WEEK_PCT}')"
  fi
fi

exec "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/audit-questions.sh" -i -n 15 -c 8 "$@"
