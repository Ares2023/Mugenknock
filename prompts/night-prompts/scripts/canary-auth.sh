#!/bin/bash
# 認証カナリアテスト実行スクリプト（ログイン後の主要フローのスモーク）
#
# 使い方:
#   ./canary-auth.sh         → 検証環境 (mugenknock.pages.dev)
#   ./canary-auth.sh prod    → 本番環境 (mugenknock.com)
#
# 認証情報は ~/.mugenknock_canary.conf（gitignore）から読む:
#   PLAYWRIGHT_EMAIL=test-canary@example.com
#   PLAYWRIGHT_PASSWORD=********
# 未設定なら SKIP（夜間を失敗させない）。テスト用Cognitoアカウントを1つ用意して設定すること。

set -uo pipefail

AWS=/home/yuzuki/local/bin/aws
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"   # scripts → night-prompts → prompts → ROOT
REGION=ap-northeast-1
S3_BUCKET=mugenknock-error-logs
S3_PREFIX=canary-logs
CONF="${HOME}/.mugenknock_canary.conf"

TARGET=${1:-staging}
if [ "$TARGET" = "prod" ]; then
  export PLAYWRIGHT_BASE_URL="${PLAYWRIGHT_BASE_URL:-https://mugenknock.com}"
  ENV_LABEL="prod-auth"
else
  export PLAYWRIGHT_BASE_URL="${PLAYWRIGHT_BASE_URL:-https://mugenknock.pages.dev}"
  ENV_LABEL="staging-auth"
fi

# 認証情報の読み込み（無ければスキップ）
if [ -f "$CONF" ]; then
  # shellcheck disable=SC1090
  set -a; . "$CONF"; set +a
fi
if [ -z "${PLAYWRIGHT_EMAIL:-}" ] || [ -z "${PLAYWRIGHT_PASSWORD:-}" ]; then
  echo "=================================================="
  echo " 認証カナリア: SKIP"
  echo " 認証情報未設定（$CONF に PLAYWRIGHT_EMAIL / PLAYWRIGHT_PASSWORD を設定してください）"
  echo "=================================================="
  echo "RESULT=SKIP passed=0 failed=0"
  exit 0
fi
export PLAYWRIGHT_EMAIL PLAYWRIGHT_PASSWORD

TIMESTAMP=$(TZ=Asia/Tokyo date '+%Y%m%d-%H%M%S')
LOG_DIR="$ROOT/e2e/canary-results"
LOG_FILE="$LOG_DIR/${TIMESTAMP}-${ENV_LABEL}.log"
mkdir -p "$LOG_DIR"

echo "=================================================="
echo " 認証カナリアテスト開始"
echo " 環境: $ENV_LABEL ($PLAYWRIGHT_BASE_URL)"
echo " 時刻: $TIMESTAMP (JST)"
echo "=================================================="

EXIT_CODE=0
cd "$ROOT"
# 注意: テストファイルを指定すると setup プロジェクト(別ファイル)はフィルタで除外され
# 依存ログインが走らない。そのため setup を明示実行して storageState を先に作る。
echo "--- ログイン(setup) ---" | tee "$LOG_FILE"
npx playwright test --project=setup --reporter=line 2>&1 | tee -a "$LOG_FILE" || true
if [ ! -s e2e/.auth/user.json ] || ! grep -q '"cookies"' e2e/.auth/user.json 2>/dev/null; then
  echo "❌ ログイン失敗: storageState(e2e/.auth/user.json)が生成されませんでした（認証情報を確認）" | tee -a "$LOG_FILE"
fi
# 認証状態が空（cookies空＝ログイン未完了）かどうかも警告
if grep -q '"cookies": *\[\]' e2e/.auth/user.json 2>/dev/null && grep -q '"origins": *\[\]' e2e/.auth/user.json 2>/dev/null; then
  echo "⚠️  storageStateが空（ゲスト状態）。ログインに失敗している可能性があります" | tee -a "$LOG_FILE"
fi
echo "--- 認証カナリア本体 ---" | tee -a "$LOG_FILE"
npx playwright test e2e/tests/canary.auth.spec.ts --project=chromium \
  --reporter=list 2>&1 | tee -a "$LOG_FILE" || EXIT_CODE=$?

PASSED=$(awk '/✓|passed/{c++} END{print c+0}' "$LOG_FILE")
FAILED=$(awk '/✘|failed/{c++} END{print c+0}' "$LOG_FILE")

echo ""
echo "=================================================="
echo " 結果: $([ $EXIT_CODE -eq 0 ] && echo '✅ PASS' || echo '❌ FAIL')"
echo " passed=$PASSED  failed=$FAILED"
echo "=================================================="
echo "RESULT=$([ $EXIT_CODE -eq 0 ] && echo PASS || echo FAIL) passed=$PASSED failed=$FAILED"

# S3 アップロード（任意・失敗は無視）
$AWS s3 cp "$LOG_FILE" "s3://${S3_BUCKET}/${S3_PREFIX}/${ENV_LABEL}/${TIMESTAMP}.log" --region "$REGION" --quiet 2>/dev/null || true

# ローカル古いログ整理（直近30件保持）
cd "$LOG_DIR" && ls -t *.log 2>/dev/null | tail -n +31 | xargs rm -f 2>/dev/null || true

exit $EXIT_CODE
