#!/bin/bash
# Fargate タスクを今すぐ手動実行 (テスト用)
#
# 使い方:
#   ./scripts/fargate-run-now.sh

set -eo pipefail

AWS=/home/yuzuki/local/bin/aws
REGION=ap-northeast-1
ACCOUNT_ID=$("$AWS" sts get-caller-identity --query Account --output text --region "$REGION")
PROJECT="mugenknock"
CLUSTER="${PROJECT}-batch"
TASK_FAMILY="${PROJECT}-night-batch"

SUBNET_ID=$("$AWS" ec2 describe-subnets \
    --filters "Name=tag:Name,Values=${PROJECT}-fargate-subnet" \
    --query "Subnets[0].SubnetId" --output text --region "$REGION")
SG_ID=$("$AWS" ec2 describe-security-groups \
    --filters "Name=group-name,Values=${PROJECT}-fargate-sg" \
    --query "SecurityGroups[0].GroupId" --output text --region "$REGION")

echo "ECSタスク起動中..."
TASK_ARN=$("$AWS" ecs run-task \
    --cluster "$CLUSTER" \
    --task-definition "$TASK_FAMILY" \
    --capacity-provider-strategy "capacityProvider=FARGATE_SPOT,weight=1" "capacityProvider=FARGATE,weight=0,base=1" \
    --network-configuration "awsvpcConfiguration={subnets=[${SUBNET_ID}],securityGroups=[${SG_ID}],assignPublicIp=ENABLED}" \
    --region "$REGION" \
    --query "tasks[0].taskArn" --output text)

echo "  起動: $TASK_ARN"
echo ""
echo "ログ確認:"
echo "  AWS Console → ECS → ${CLUSTER} → タスク → ログ"
echo "  または CloudWatch Logs → /ecs/${PROJECT}-night-batch"
echo ""
echo "タスク状態:"
echo "  $("$AWS" ecs describe-tasks --cluster "$CLUSTER" --tasks "$TASK_ARN" \
    --region "$REGION" --query "tasks[0].lastStatus" --output text)"
