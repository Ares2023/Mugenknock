#!/bin/bash
# Lambda デプロイスクリプト
# 現在のブランチに応じて dev/prod Lambda へデプロイ
#
# 使い方:
#   ./scripts/deploy-lambda.sh          # ブランチ自動判定
#   ./scripts/deploy-lambda.sh dev      # 強制的に dev へ
#   ./scripts/deploy-lambda.sh prod     # 強制的に prod へ

set -e

AWS=/home/yuzuki/local/bin/aws
REGION=ap-northeast-1
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LAMBDA_SRC="$REPO_ROOT/lambda/src"
ZIP=/tmp/lambda-deploy.zip

# ターゲット判定
if [ -n "$1" ]; then
  TARGET="$1"
else
  BRANCH=$(cd "$REPO_ROOT" && git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "develop")
  if [ "$BRANCH" = "master" ] || [ "$BRANCH" = "main" ]; then
    TARGET="prod"
  else
    TARGET="dev"
  fi
fi

FUNCTION_NAME="awsquizHandler-${TARGET}"
echo "→ Branch: $(git rev-parse --abbrev-ref HEAD 2>/dev/null) → Deploying to: $FUNCTION_NAME"

# ZIP 作成
cd "$LAMBDA_SRC"
python3 -c "
import zipfile, os
with zipfile.ZipFile('$ZIP', 'w', zipfile.ZIP_DEFLATED) as z:
    for root, dirs, files in os.walk('.'):
        dirs[:] = [d for d in dirs if d != 'node_modules']
        for f in files:
            z.write(os.path.join(root, f))
    for root, dirs, files in os.walk('node_modules'):
        for f in files:
            z.write(os.path.join(root, f))
print('ZIP created')
"
cd - > /dev/null

# デプロイ
$AWS lambda update-function-code \
  --function-name "$FUNCTION_NAME" \
  --zip-file "fileb://$ZIP" \
  --region $REGION \
  --query 'FunctionName' --output text

echo "✓ Deployed to $FUNCTION_NAME"
