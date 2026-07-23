#!/bin/bash
# ClaudeサブスクリプションのOAuth資格情報をS3へアップロードする。
# Fargateコンテナはこれを起動時に復元して認証する（APIキーは使わない）。
#
# 使い方:
#   ./scripts/fargate-upload-auth.sh          # 通常実行（出力あり）
#   ./scripts/fargate-upload-auth.sh --quiet  # Stopフックから呼ぶ際（出力なし・失敗しない）

QUIET=0
[ "${1:-}" = "--quiet" ] && QUIET=1

_log() { [ "$QUIET" -eq 0 ] && echo "$*" || true; }
_err() { [ "$QUIET" -eq 0 ] && echo "$*" >&2 || true; }

set -uo pipefail

AWS=/home/yuzuki/local/bin/aws
REGION=ap-northeast-1
PROJECT="mugenknock"

ACCOUNT_ID=$("$AWS" sts get-caller-identity --query Account --output text --region "$REGION" 2>/dev/null) || {
    _err "⚠️  AWS認証情報が取得できません（オフライン？）。スキップします。"
    exit 0
}
S3_BUCKET="${PROJECT}-fargate-state-${ACCOUNT_ID}"

CRED="$HOME/.claude/.credentials.json"
CONF="$HOME/.claude.json"

if [ ! -f "$CRED" ]; then
    _err "❌ $CRED が見つかりません。ローカルで 'claude' にログイン済みか確認してください。"
    [ "$QUIET" -eq 1 ] && exit 0 || exit 1
fi

# OAuthであることを軽く検証
if ! python3 -c "import json,sys; d=json.load(open('$CRED')); sys.exit(0 if 'claudeAiOauth' in d else 1)" 2>/dev/null; then
    _log "⚠️  $CRED に claudeAiOauth が見当たりません（APIキー認証かも）。それでも続行します。"
fi

_log "OAuth資格情報をアップロード中 → s3://${S3_BUCKET}/claude-auth/"
"$AWS" s3 cp "$CRED" "s3://${S3_BUCKET}/claude-auth/.credentials.json" --region "$REGION" ${QUIET:+--quiet}
[ -f "$CONF" ] && "$AWS" s3 cp "$CONF" "s3://${S3_BUCKET}/claude-auth/.claude.json" --region "$REGION" ${QUIET:+--quiet}

_log "✓ 完了。Fargateはこの資格情報でサブスク認証します。"
_log "  期限切れが心配な場合は、ローカルで再ログイン後に再度このスクリプトを実行してください。"
