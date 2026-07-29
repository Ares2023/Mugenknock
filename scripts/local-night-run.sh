#!/bin/bash
# ローカル夜間バッチ実行(systemd timerから呼ばれる)
# Fargateはピンのみ。夜間バッチ本体(生成/検証/監査/レポート/日めくり)はローカルで実行する。
# 資格情報・状態はS3を単一の正として pull→実行→push で同期する。
set -uo pipefail
export TZ=Asia/Tokyo
export PATH="/usr/local/bin:/usr/bin:/bin:$HOME/local/bin:$PATH"

REPO=/home/yuzuki/aws-quiz-app
AWS=/home/yuzuki/local/bin/aws
ACCT=$("$AWS" sts get-caller-identity --query Account --output text 2>/dev/null)
S3="mugenknock-fargate-state-${ACCT}"
SC="$REPO/prompts/night-prompts/scripts"

log() { printf '[%s] %s\n' "$(date '+%H:%M:%S')" "$*"; }

mkdir -p ~/.claude "$SC/state" "$SC/instructions" "$SC/logs" "$REPO/prompts/logs"

# ── pull: 資格情報・状態をS3から ──
# creds はスマート同期（expiresAtが新しい方を残す＝フレッシュなローカルを古いS3で潰さない）
log "S3から資格情報・状態を取得..."
AWS="$AWS" bash "$REPO/scripts/pull-claude-creds.sh" "$S3" || true
"$AWS" s3 sync "s3://$S3/state/"        "$SC/state/"        --quiet 2>/dev/null || true
"$AWS" s3 sync "s3://$S3/instructions/" "$SC/instructions/" --quiet 2>/dev/null || true
for f in .last_run .claude_history .night_history; do
  "$AWS" s3 cp "s3://$S3/meta/$f" "$REPO/prompts/$f" --quiet 2>/dev/null || true
done
# .last_run_date は二重実行防止の要。S3で盲目上書きせずローカル/S3の新しい方を残す
# (他プロセスが直前にローカルへ書いた"本日"がS3の古い値で消されるのを防ぐ)
_S3_LRD=$("$AWS" s3 cp "s3://$S3/meta/.last_run_date" - --quiet 2>/dev/null | tr -d '\n')
_LOCAL_LRD=$(cat "$REPO/prompts/.last_run_date" 2>/dev/null || echo "")
if [ -n "$_S3_LRD" ] && { [ -z "$_LOCAL_LRD" ] || [ "$_S3_LRD" \> "$_LOCAL_LRD" ]; }; then
  echo "$_S3_LRD" > "$REPO/prompts/.last_run_date"
fi

# ── 実行: ping抑止・夜間強制・自己スケジュール抑止 ──
log "夜間バッチ実行 (SKIP_PING/FORCE_NIGHT)..."
cd "$REPO"
FARGATE_MODE=1 SKIP_PING=1 FORCE_NIGHT=1 bash prompts/run-prompts.sh --run
EC=$?
log "夜間バッチ完了 (exit $EC)"

# ── push: 更新後の資格情報・状態をS3へ ──
[ -f ~/.claude/.credentials.json ] && "$AWS" s3 cp ~/.claude/.credentials.json "s3://$S3/claude-auth/.credentials.json" --quiet 2>/dev/null || true
[ -f ~/.claude.json ] && "$AWS" s3 cp ~/.claude.json "s3://$S3/claude-auth/.claude.json" --quiet 2>/dev/null || true
"$AWS" s3 sync "$SC/state/"        "s3://$S3/state/"        --quiet 2>/dev/null || true
"$AWS" s3 sync "$SC/instructions/" "s3://$S3/instructions/" --quiet 2>/dev/null || true
"$AWS" s3 sync "$SC/logs/"         "s3://$S3/night-logs/"   --quiet 2>/dev/null || true
"$AWS" s3 sync "$REPO/prompts/logs/" "s3://$S3/run-logs/"   --quiet 2>/dev/null || true
for f in .last_run .last_run_date .claude_history .night_history; do
  [ -f "$REPO/prompts/$f" ] && "$AWS" s3 cp "$REPO/prompts/$f" "s3://$S3/meta/$f" --quiet 2>/dev/null || true
done
exit $EC
