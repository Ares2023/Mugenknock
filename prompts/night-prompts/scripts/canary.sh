#!/bin/bash
# カナリアテスト実行スクリプト
#
# 使い方:
#   ./prompts/night-prompts/manual/canary.sh         → 検証環境 (mugenknock.pages.dev)
#   ./prompts/night-prompts/manual/canary.sh prod    → 本番環境 (mugenknock.com)
#   PLAYWRIGHT_BASE_URL=https://xxx.pages.dev ./prompts/night-prompts/manual/canary.sh
#
# 実行後、結果を S3 (mugenknock-error-logs/canary-logs/) に自動アップロード

set -euo pipefail

AWS=/home/yuzuki/local/bin/aws
# manual/ → night-prompts/ → prompts/ → プロジェクトルート（3階層上）
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
REGION=ap-northeast-1
S3_BUCKET=mugenknock-error-logs
S3_PREFIX=canary-logs

TARGET=${1:-staging}

if [ "$TARGET" = "prod" ]; then
  export PLAYWRIGHT_BASE_URL="${PLAYWRIGHT_BASE_URL:-https://mugenknock.com}"
  ENV_LABEL="prod"
else
  export PLAYWRIGHT_BASE_URL="${PLAYWRIGHT_BASE_URL:-https://mugenknock.pages.dev}"
  ENV_LABEL="staging"
fi

# タイムスタンプ（JST）
TIMESTAMP=$(TZ=Asia/Tokyo date '+%Y%m%d-%H%M%S')
LOG_DIR="$ROOT/e2e/canary-results"
LOG_FILE="$LOG_DIR/${TIMESTAMP}-${ENV_LABEL}.log"
SUMMARY_FILE="$LOG_DIR/${TIMESTAMP}-${ENV_LABEL}-summary.json"
mkdir -p "$LOG_DIR"

echo "=================================================="
echo " カナリアテスト開始"
echo " 環境: $ENV_LABEL ($PLAYWRIGHT_BASE_URL)"
echo " 時刻: $TIMESTAMP (JST)"
echo "=================================================="
echo ""

# テスト実行（結果をファイルとターミナル両方に出力）
EXIT_CODE=0
cd "$ROOT"
npx playwright test e2e/tests/canary.noauth.spec.ts --project=no-auth \
  --reporter=list 2>&1 | tee "$LOG_FILE" || EXIT_CODE=$?

# サマリーJSON作成（grep -c はマルチバイト文字で誤動作するので awk を使用）
PASSED=$(awk '/✓/{c++} END{print c+0}' "$LOG_FILE")
FAILED=$(awk '/✘/{c++} END{print c+0}' "$LOG_FILE")
WARNINGS=$(awk '/⚠️/{c++} END{print c+0}' "$LOG_FILE")

cat > "$SUMMARY_FILE" <<EOF
{
  "timestamp": "$TIMESTAMP",
  "env": "$ENV_LABEL",
  "url": "$PLAYWRIGHT_BASE_URL",
  "exit_code": $EXIT_CODE,
  "passed": $PASSED,
  "failed": $FAILED,
  "warnings": $WARNINGS,
  "result": "$([ $EXIT_CODE -eq 0 ] && echo 'PASS' || echo 'FAIL')"
}
EOF

echo ""
echo "=================================================="
echo " 結果: $([ $EXIT_CODE -eq 0 ] && echo '✅ PASS' || echo '❌ FAIL')"
echo " passed=$PASSED  failed=$FAILED  warnings=$WARNINGS"
echo "=================================================="

# S3 アップロード
echo ""
echo "📤 S3 にアップロード中..."
S3_PATH="s3://${S3_BUCKET}/${S3_PREFIX}/${ENV_LABEL}/${TIMESTAMP}"

$AWS s3 cp "$LOG_FILE"     "${S3_PATH}.log"     --region "$REGION" --quiet
$AWS s3 cp "$SUMMARY_FILE" "${S3_PATH}.json"    --region "$REGION" --quiet

echo "✓ アップロード完了"
echo "  ログ:    ${S3_PATH}.log"
echo "  サマリー: ${S3_PATH}.json"

# ローカルの古いログを30件より多い場合に削除（直近30件を保持）
cd "$LOG_DIR"
ls -t *.log 2>/dev/null | tail -n +31 | xargs rm -f 2>/dev/null || true
ls -t *.json 2>/dev/null | tail -n +31 | xargs rm -f 2>/dev/null || true

exit $EXIT_CODE
