#!/bin/bash
# Claude Code Stopフックから呼ばれる認証情報自動同期スクリプト。
# ~/.claude/.credentials.json が前回アップロード時より新しい場合のみS3へ同期する。
#
# Stopフックのstdinにはセッション情報JSONが流れるが無視する。

CRED="$HOME/.claude/.credentials.json"
STAMP="$HOME/.claude/.fargate-upload-stamp"
LOG="$HOME/.claude/fargate-sync-auth.log"

# 認証情報ファイルがなければ何もしない
[ -f "$CRED" ] || exit 0

CRED_MTIME=$(stat -c %Y "$CRED" 2>/dev/null || echo 0)
LAST_UPLOAD=$(cat "$STAMP" 2>/dev/null || echo 0)

# 更新されていなければスキップ
[ "$CRED_MTIME" -le "$LAST_UPLOAD" ] && exit 0

# 更新されていたらアップロード
{
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] credentials.json が更新されました。S3へ同期中..."
    if bash /home/yuzuki/aws-quiz-app/scripts/fargate-upload-auth.sh --quiet; then
        echo "$CRED_MTIME" > "$STAMP"
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] 同期完了"
    else
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] 同期失敗（次回Stopフック時に再試行）"
    fi
} >> "$LOG" 2>&1

exit 0
