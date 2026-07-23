#!/bin/bash
# イメージビルド → ECRプッシュ → タスク定義更新
# コードを変更したら毎回実行する
#
# 使い方:
#   ./scripts/fargate-build-push.sh

set -eo pipefail

AWS=/home/yuzuki/local/bin/aws
REGION=ap-northeast-1
ACCOUNT_ID=$("$AWS" sts get-caller-identity --query Account --output text --region "$REGION")
ECR_REPO="mugenknock-night-batch"
TASK_FAMILY="mugenknock-night-batch"
HOOK_FAMILY="mugenknock-night-hook"
ECR_URI="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/${ECR_REPO}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

log() { printf '\033[34m[deploy]\033[0m %s\n' "$*"; }
ok()  { printf '\033[32m  ✓\033[0m %s\n' "$*"; }

# ECRログイン
log "ECRログイン..."
"$AWS" ecr get-login-password --region "$REGION" | \
    docker login --username AWS --password-stdin \
    "${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"
ok "ECRログイン完了"

# イメージビルド
TAG=$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || date '+%Y%m%d%H%M')
log "イメージビルド (tag: ${TAG})..."
docker build \
    -f "$REPO_ROOT/Dockerfile.fargate" \
    --platform linux/amd64 \
    -t "${ECR_REPO}:${TAG}" \
    -t "${ECR_REPO}:latest" \
    "$REPO_ROOT"
ok "ビルド完了: ${ECR_REPO}:${TAG}"

# ECRプッシュ
log "ECRプッシュ..."
docker tag "${ECR_REPO}:${TAG}"    "${ECR_URI}:${TAG}"
docker tag "${ECR_REPO}:latest"    "${ECR_URI}:latest"
docker push "${ECR_URI}:${TAG}"
docker push "${ECR_URI}:latest"
ok "プッシュ完了: ${ECR_URI}:${TAG}"

# タスク定義を新リビジョンで更新
log "タスク定義更新..."
CURRENT_DEF=$("$AWS" ecs describe-task-definition \
    --task-definition "$TASK_FAMILY" \
    --region "$REGION" \
    --query "taskDefinition" \
    --output json)

UPDATED_DEF=$(CURRENT_DEF="$CURRENT_DEF" NEW_IMAGE="${ECR_URI}:${TAG}" python3 << 'PYEOF'
import json, os
td = json.loads(os.environ['CURRENT_DEF'])
# 再登録時に不要なフィールドを除去
for k in ['taskDefinitionArn','revision','status','requiresAttributes',
          'compatibilities','registeredAt','registeredBy']:
    td.pop(k, None)
td['containerDefinitions'][0]['image'] = os.environ['NEW_IMAGE']
print(json.dumps(td))
PYEOF
)
echo "$UPDATED_DEF" | "$AWS" ecs register-task-definition \
    --region "$REGION" \
    --cli-input-json file:///dev/stdin > /dev/null

NEW_REV=$("$AWS" ecs describe-task-definition \
    --task-definition "$TASK_FAMILY" --region "$REGION" \
    --query "taskDefinition.revision" --output text)

# フック用タスク定義も同じイメージで更新
log "フック用タスク定義更新 ($HOOK_FAMILY)..."
HOOK_CURRENT_DEF=$("$AWS" ecs describe-task-definition \
    --task-definition "$HOOK_FAMILY" \
    --region "$REGION" \
    --query "taskDefinition" \
    --output json)

HOOK_UPDATED_DEF=$(CURRENT_DEF="$HOOK_CURRENT_DEF" NEW_IMAGE="${ECR_URI}:${TAG}" python3 << 'PYEOF'
import json, os
td = json.loads(os.environ['CURRENT_DEF'])
for k in ['taskDefinitionArn','revision','status','requiresAttributes',
          'compatibilities','registeredAt','registeredBy']:
    td.pop(k, None)
td['containerDefinitions'][0]['image'] = os.environ['NEW_IMAGE']
print(json.dumps(td))
PYEOF
)
echo "$HOOK_UPDATED_DEF" | "$AWS" ecs register-task-definition \
    --region "$REGION" \
    --cli-input-json file:///dev/stdin > /dev/null

HOOK_NEW_REV=$("$AWS" ecs describe-task-definition \
    --task-definition "$HOOK_FAMILY" --region "$REGION" \
    --query "taskDefinition.revision" --output text)

echo ""
echo "================================================"
echo "デプロイ完了"
printf "  %-16s %s\n" "イメージ:"       "${ECR_URI}:${TAG}"
printf "  %-16s %s\n" "メインタスク:"   "${TASK_FAMILY}:${NEW_REV}"
printf "  %-16s %s\n" "フックタスク:"   "${HOOK_FAMILY}:${HOOK_NEW_REV}"
echo ""
echo "次回スケジュール実行から新イメージが使われます"
echo "手動テスト実行:"
echo "  ./scripts/fargate-run-now.sh"
echo "================================================"
