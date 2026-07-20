#!/bin/bash
# ClaudeサブスクリプションのOAuth資格情報をS3へアップロードする。
# Fargateコンテナはこれを起動時に復元して認証する（APIキーは使わない）。
#
# 使い方:
#   ./scripts/fargate-upload-auth.sh
#
# 実行後は run-prompts の実行毎に更新後トークンがS3へ書き戻され、
# 有効期限が自動で延伸される（refreshTokenが有効な限り）。

set -euo pipefail

AWS=/home/yuzuki/local/bin/aws
REGION=ap-northeast-1
PROJECT="mugenknock"
ACCOUNT_ID=$("$AWS" sts get-caller-identity --query Account --output text --region "$REGION")
S3_BUCKET="${PROJECT}-fargate-state-${ACCOUNT_ID}"

CRED="$HOME/.claude/.credentials.json"
CONF="$HOME/.claude.json"

if [ ! -f "$CRED" ]; then
    echo "❌ $CRED が見つかりません。ローカルで 'claude' にログイン済みか確認してください。"
    exit 1
fi

# OAuthであることを軽く検証
if ! python3 -c "import json,sys; d=json.load(open('$CRED')); sys.exit(0 if 'claudeAiOauth' in d else 1)" 2>/dev/null; then
    echo "⚠️  $CRED に claudeAiOauth が見当たりません（APIキー認証かも）。それでも続行します。"
fi

echo "OAuth資格情報をアップロード中 → s3://${S3_BUCKET}/claude-auth/"
"$AWS" s3 cp "$CRED" "s3://${S3_BUCKET}/claude-auth/.credentials.json" --region "$REGION"
[ -f "$CONF" ] && "$AWS" s3 cp "$CONF" "s3://${S3_BUCKET}/claude-auth/.claude.json" --region "$REGION"

echo "✓ 完了。Fargateはこの資格情報でサブスク認証します。"
echo "  期限切れが心配な場合は、ローカルで再ログイン後に再度このスクリプトを実行してください。"
