#!/bin/bash
# instructions/ をローカル(git)から S3 へ push して同期する。
#
# 背景: 夜間ランナー(local-hook-run.sh 等)は起動時に S3→ローカルへ pull するため、
#   git だけに入れた instructions/ の手編集は次回 pull で S3 の内容に巻き戻る。
#   手で instructions を編集・コミットしたら、本スクリプトで S3 にも反映すること。
#
# ※ 監査(audit-questions.sh -i)は S3 側の instructions を自動改良する。乖離が疑わしい時は
#   先に「S3→ローカルへ pull して差分を git に取り込みコミット」してから push すること
#   （git を最新の最良状態にしてから S3 へ上書きする）。
#
# usage: bash scripts/push-instructions-to-s3.sh [--dryrun]
set -uo pipefail
AWS="${AWS:-/home/yuzuki/local/bin/aws}"
REGION=ap-northeast-1
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INSTR="$REPO/prompts/night-prompts/scripts/instructions"

ACCT=$("$AWS" sts get-caller-identity --query Account --output text --region "$REGION" 2>/dev/null)
[ -z "$ACCT" ] && { echo "❌ AWS 認証情報を取得できません"; exit 1; }
S3="mugenknock-fargate-state-${ACCT}"

DRY=""; [ "${1:-}" = "--dryrun" ] && DRY="--dryrun"

echo "instructions/ → s3://$S3/instructions/ を同期${DRY:+ (dryrun)}"
"$AWS" s3 sync "$INSTR/" "s3://$S3/instructions/" --exclude "*.bak" $DRY --region "$REGION"
echo "✓ 完了${DRY:+ (dryrun。実際に反映するには --dryrun なしで再実行)}"
