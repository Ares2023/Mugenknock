#!/bin/bash
# S3のClaude OAuth資格情報を「expiresAtが新しい方を残す」方針でローカルへ取り込む。
#
# 目的: 再ログイン直後などフレッシュなローカル資格情報を、古いS3コピーで“無条件上書き”して
# ローカルのClaude Codeセッションを切ってしまうのを防ぐ。1つのOAuthログインを対話利用と
# 自動ピン/夜間で共有しているため、常に新しい方(=有効期限が後)を採用する。
#
# 使い方: bash pull-claude-creds.sh <S3バケット名>
set -uo pipefail

AWS="${AWS:-/home/yuzuki/local/bin/aws}"
S3="${1:?usage: pull-claude-creds.sh <s3-bucket>}"
LOCAL_CRED="$HOME/.claude/.credentials.json"
mkdir -p "$HOME/.claude"

# .claude.json（設定・期限概念なし）は従来どおり取得（無害）
"$AWS" s3 cp "s3://$S3/claude-auth/.claude.json" "$HOME/.claude.json" --quiet 2>/dev/null || true

TMP=$(mktemp /tmp/s3cred_XXXX.json)
if ! "$AWS" s3 cp "s3://$S3/claude-auth/.credentials.json" "$TMP" --quiet 2>/dev/null; then
  echo "  creds同期: S3に資格情報なし → ローカル維持"
  rm -f "$TMP"; exit 0
fi

DECISION=$(LOCAL_CRED="$LOCAL_CRED" S3F="$TMP" python3 - <<'PY'
import json, os
def expires(p):
    try:
        d = json.load(open(p)).get('claudeAiOauth', {})
        v = d.get('expiresAt')
        return int(v) if v else 0
    except Exception:
        return -1  # 読めない/存在しない
local = expires(os.environ['LOCAL_CRED'])
s3    = expires(os.environ['S3F'])
# S3が厳密に新しい時だけ採用。同等・ローカルの方が新しい・S3不正ならローカル維持。
print('S3' if (s3 > local and s3 > 0) else 'LOCAL')
PY
)

if [ "$DECISION" = "S3" ]; then
  cp "$TMP" "$LOCAL_CRED"
  echo "  creds同期: S3が新しい → 採用"
else
  echo "  creds同期: ローカルが新しい/同等 → 維持（S3で上書きしない）"
fi
rm -f "$TMP"
