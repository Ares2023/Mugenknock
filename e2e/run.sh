#!/bin/bash
# Playwright デバッグシステム 実行スクリプト
# 使い方:
#   ./e2e/run.sh               → staging(develop) 環境でフルテスト
#   ./e2e/run.sh local         → ローカル開発サーバー (localhost:3000)
#   ./e2e/run.sh noauth        → 認証不要テストのみ
#   ./e2e/run.sh visual        → スクリーンショット比較
#   ./e2e/run.sh ui            → Playwright UI モード（インタラクティブ）

set -e

MODE=${1:-staging}
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

case "$MODE" in
  local)
    export PLAYWRIGHT_BASE_URL="http://localhost:3000"
    echo "🖥  ローカル開発サーバー (${PLAYWRIGHT_BASE_URL}) でテスト実行"
    echo "   → 別ターミナルで 'npm start' を起動しておいてください"
    npx playwright test --project=no-auth --project=chromium --project=mobile-chrome
    ;;
  noauth)
    # 認証なしで実行できるテストのみ（ログイン不要）
    export PLAYWRIGHT_BASE_URL="${PLAYWRIGHT_BASE_URL:-https://develop.mugenknock.com}"
    echo "🔓 認証不要テスト — ${PLAYWRIGHT_BASE_URL}"
    npx playwright test --project=no-auth
    ;;
  visual)
    export PLAYWRIGHT_BASE_URL="${PLAYWRIGHT_BASE_URL:-https://develop.mugenknock.com}"
    echo "📸 スクリーンショット比較 — ${PLAYWRIGHT_BASE_URL}"
    npx playwright test e2e/tests/visual.spec.ts --project=chromium
    ;;
  ui)
    export PLAYWRIGHT_BASE_URL="${PLAYWRIGHT_BASE_URL:-https://develop.mugenknock.com}"
    echo "🎭 Playwright UI モード"
    npx playwright test --ui
    ;;
  staging|*)
    export PLAYWRIGHT_BASE_URL="${PLAYWRIGHT_BASE_URL:-https://develop.mugenknock.com}"
    echo "🚀 ステージング環境 (${PLAYWRIGHT_BASE_URL}) でフルテスト"
    echo ""
    echo "💡 認証テストを含めるには事前に環境変数を設定:"
    echo "   export PLAYWRIGHT_EMAIL=your@email.com"
    echo "   export PLAYWRIGHT_PASSWORD=yourpassword"
    echo ""
    if [ -z "$PLAYWRIGHT_EMAIL" ]; then
      echo "⚠️  PLAYWRIGHT_EMAIL 未設定 — 認証不要テストのみ実行"
      npx playwright test --project=no-auth
    else
      npx playwright test
    fi
    ;;
esac

echo ""
echo "📊 レポート: e2e/reports/index.html"
echo "   表示: npx playwright show-report e2e/reports"
