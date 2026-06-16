#!/bin/bash
# Playwright E2E / カナリアテスト 実行スクリプト
#
# 使い方:
#   ./e2e/run.sh                      → 検証環境(develop)でカナリアテスト（認証不要）
#   ./e2e/run.sh canary               → 同上（明示指定）
#   ./e2e/run.sh canary prod          → 本番環境でカナリアテスト
#   ./e2e/run.sh staging              → 検証環境でフルテスト（認証あり）
#   ./e2e/run.sh local                → ローカル開発サーバー (localhost:3000)
#   ./e2e/run.sh noauth               → 認証不要テストのみ
#   ./e2e/run.sh visual               → スクリーンショット比較
#   ./e2e/run.sh ui                   → Playwright UI モード
#
# URL を直接指定:
#   PLAYWRIGHT_BASE_URL=https://xxx.pages.dev ./e2e/run.sh canary

set -e

MODE=${1:-canary}
TARGET=${2:-staging}  # canary の第2引数: staging / prod

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

STAGING_URL="https://mugenknock.pages.dev"
PROD_URL="https://mugenknock.com"

case "$MODE" in
  canary)
    if [ "$TARGET" = "prod" ]; then
      export PLAYWRIGHT_BASE_URL="${PLAYWRIGHT_BASE_URL:-$PROD_URL}"
      echo "🐦 カナリアテスト — 本番環境 (${PLAYWRIGHT_BASE_URL})"
    else
      export PLAYWRIGHT_BASE_URL="${PLAYWRIGHT_BASE_URL:-$STAGING_URL}"
      echo "🐦 カナリアテスト — 検証環境 (${PLAYWRIGHT_BASE_URL})"
    fi
    echo ""
    npx playwright test e2e/tests/canary.noauth.spec.ts --project=no-auth
    ;;

  local)
    export PLAYWRIGHT_BASE_URL="http://localhost:3000"
    echo "🖥  ローカル開発サーバー (${PLAYWRIGHT_BASE_URL}) でテスト実行"
    echo "   → 別ターミナルで 'npm run dev' を起動しておいてください"
    npx playwright test --project=no-auth
    ;;

  noauth)
    export PLAYWRIGHT_BASE_URL="${PLAYWRIGHT_BASE_URL:-$STAGING_URL}"
    echo "🔓 認証不要テスト — ${PLAYWRIGHT_BASE_URL}"
    npx playwright test --project=no-auth
    ;;

  visual)
    export PLAYWRIGHT_BASE_URL="${PLAYWRIGHT_BASE_URL:-$STAGING_URL}"
    echo "📸 スクリーンショット比較 — ${PLAYWRIGHT_BASE_URL}"
    npx playwright test e2e/tests/visual.spec.ts --project=chromium
    ;;

  ui)
    export PLAYWRIGHT_BASE_URL="${PLAYWRIGHT_BASE_URL:-$STAGING_URL}"
    echo "🎭 Playwright UI モード — ${PLAYWRIGHT_BASE_URL}"
    npx playwright test --ui
    ;;

  staging|*)
    export PLAYWRIGHT_BASE_URL="${PLAYWRIGHT_BASE_URL:-$STAGING_URL}"
    echo "🚀 検証環境 (${PLAYWRIGHT_BASE_URL}) でフルテスト"
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
echo "   表示: npm run e2e:report"
