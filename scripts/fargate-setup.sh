#!/bin/bash
# ECS Fargate + EventBridge 夜間バッチ環境 一回限りのセットアップスクリプト
#
# 使い方:
#   ./scripts/fargate-setup.sh
#
# 完了後:
#   1. AWS Console → Secrets Manager → mugenknock/fargate/env でAPIキー等を設定
#   2. ./scripts/fargate-build-push.sh でイメージをビルド・プッシュ

set -eo pipefail

AWS=/home/yuzuki/local/bin/aws
REGION=ap-northeast-1
ACCOUNT_ID=$("$AWS" sts get-caller-identity --query Account --output text --region "$REGION")
PROJECT="mugenknock"
CLUSTER="${PROJECT}-batch"
TASK_FAMILY="${PROJECT}-night-batch"
ECR_REPO="${PROJECT}-night-batch"
S3_BUCKET="${PROJECT}-fargate-state-${ACCOUNT_ID}"
LOG_GROUP="/ecs/${PROJECT}-night-batch"
SCHEDULE_NAME="${PROJECT}-night-batch"
EXEC_ROLE="${PROJECT}-fargate-execution"
TASK_ROLE="${PROJECT}-fargate-task"
SCHED_ROLE="${PROJECT}-eventbridge-fargate"
SECRET_NAME="${PROJECT}/fargate/env"

log() { printf '\033[34m[setup]\033[0m %s\n' "$*"; }
ok()  { printf '\033[32m  ✓\033[0m %s\n' "$*"; }

echo "================================================"
echo "  mugenknock Fargate 夜間バッチ セットアップ"
echo "  アカウント: ${ACCOUNT_ID}  リージョン: ${REGION}"
echo "================================================"
echo ""

# ── 1. S3バケット ──────────────────────────────────────────────
log "1. S3バケット..."
if "$AWS" s3api head-bucket --bucket "$S3_BUCKET" --region "$REGION" 2>/dev/null; then
    ok "既存: $S3_BUCKET"
else
    "$AWS" s3api create-bucket \
        --bucket "$S3_BUCKET" \
        --region "$REGION" \
        --create-bucket-configuration LocationConstraint="$REGION" > /dev/null
    "$AWS" s3api put-bucket-versioning \
        --bucket "$S3_BUCKET" \
        --versioning-configuration Status=Enabled
    "$AWS" s3api put-public-access-block \
        --bucket "$S3_BUCKET" \
        --public-access-block-configuration "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
    ok "作成: $S3_BUCKET (バージョニング有効)"
fi

# ── 2. ECRリポジトリ ──────────────────────────────────────────
log "2. ECRリポジトリ..."
if "$AWS" ecr describe-repositories --repository-names "$ECR_REPO" --region "$REGION" 2>/dev/null | grep -q "repositoryName"; then
    ok "既存: $ECR_REPO"
else
    "$AWS" ecr create-repository \
        --repository-name "$ECR_REPO" \
        --region "$REGION" \
        --image-scanning-configuration scanOnPush=true > /dev/null
    ok "作成: $ECR_REPO"
fi
ECR_URI="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/${ECR_REPO}"

# ── 3. CloudWatch Logs ────────────────────────────────────────
log "3. CloudWatch Logs..."
"$AWS" logs create-log-group --log-group-name "$LOG_GROUP" --region "$REGION" 2>/dev/null \
    && ok "作成: $LOG_GROUP" || ok "既存: $LOG_GROUP"
"$AWS" logs put-retention-policy \
    --log-group-name "$LOG_GROUP" --retention-in-days 30 --region "$REGION"

# ── 4. ネットワーク (Fargate専用VPC) ──────────────────────────
log "4. ネットワーク (Fargate専用VPC)..."

_tag_filter() { echo "Name=tag:Name,Values=${PROJECT}-fargate-${1}"; }

VPC_ID=$("$AWS" ec2 describe-vpcs \
    --filters "$(_tag_filter vpc)" \
    --query "Vpcs[0].VpcId" --output text --region "$REGION" 2>/dev/null || echo "None")
if [ "$VPC_ID" = "None" ] || [ -z "$VPC_ID" ]; then
    VPC_ID=$("$AWS" ec2 create-vpc \
        --cidr-block "10.10.0.0/16" --region "$REGION" \
        --query "Vpc.VpcId" --output text)
    "$AWS" ec2 create-tags --resources "$VPC_ID" \
        --tags "Key=Name,Value=${PROJECT}-fargate-vpc" --region "$REGION"
    "$AWS" ec2 modify-vpc-attribute \
        --vpc-id "$VPC_ID" --enable-dns-hostnames "{\"Value\":true}" --region "$REGION"
    ok "VPC作成: $VPC_ID (10.10.0.0/16)"
else
    ok "既存VPC: $VPC_ID"
fi

SUBNET_ID=$("$AWS" ec2 describe-subnets \
    --filters "Name=vpc-id,Values=${VPC_ID}" "$(_tag_filter subnet)" \
    --query "Subnets[0].SubnetId" --output text --region "$REGION" 2>/dev/null || echo "None")
if [ "$SUBNET_ID" = "None" ] || [ -z "$SUBNET_ID" ]; then
    SUBNET_ID=$("$AWS" ec2 create-subnet \
        --vpc-id "$VPC_ID" --cidr-block "10.10.1.0/24" \
        --availability-zone "${REGION}a" --region "$REGION" \
        --query "Subnet.SubnetId" --output text)
    "$AWS" ec2 create-tags --resources "$SUBNET_ID" \
        --tags "Key=Name,Value=${PROJECT}-fargate-subnet" --region "$REGION"
    ok "サブネット作成: $SUBNET_ID (10.10.1.0/24, ${REGION}a, public)"
else
    ok "既存サブネット: $SUBNET_ID"
fi

IGW_ID=$("$AWS" ec2 describe-internet-gateways \
    --filters "Name=attachment.vpc-id,Values=${VPC_ID}" \
    --query "InternetGateways[0].InternetGatewayId" --output text --region "$REGION" 2>/dev/null || echo "None")
if [ "$IGW_ID" = "None" ] || [ -z "$IGW_ID" ]; then
    IGW_ID=$("$AWS" ec2 create-internet-gateway --region "$REGION" \
        --query "InternetGateway.InternetGatewayId" --output text)
    "$AWS" ec2 attach-internet-gateway \
        --internet-gateway-id "$IGW_ID" --vpc-id "$VPC_ID" --region "$REGION"
    ok "IGW作成・アタッチ: $IGW_ID"
else
    ok "既存IGW: $IGW_ID"
fi

RTB_ID=$("$AWS" ec2 describe-route-tables \
    --filters "Name=vpc-id,Values=${VPC_ID}" "$(_tag_filter rtb)" \
    --query "RouteTables[0].RouteTableId" --output text --region "$REGION" 2>/dev/null || echo "None")
if [ "$RTB_ID" = "None" ] || [ -z "$RTB_ID" ]; then
    RTB_ID=$("$AWS" ec2 create-route-table \
        --vpc-id "$VPC_ID" --region "$REGION" \
        --query "RouteTable.RouteTableId" --output text)
    "$AWS" ec2 create-tags --resources "$RTB_ID" \
        --tags "Key=Name,Value=${PROJECT}-fargate-rtb" --region "$REGION"
    "$AWS" ec2 create-route \
        --route-table-id "$RTB_ID" \
        --destination-cidr-block "0.0.0.0/0" \
        --gateway-id "$IGW_ID" --region "$REGION" > /dev/null
    "$AWS" ec2 associate-route-table \
        --route-table-id "$RTB_ID" \
        --subnet-id "$SUBNET_ID" --region "$REGION" > /dev/null
    ok "ルートテーブル作成・関連付け: $RTB_ID"
else
    ok "既存ルートテーブル: $RTB_ID"
fi

SG_ID=$("$AWS" ec2 describe-security-groups \
    --filters "Name=vpc-id,Values=${VPC_ID}" "Name=group-name,Values=${PROJECT}-fargate-sg" \
    --query "SecurityGroups[0].GroupId" --output text --region "$REGION" 2>/dev/null || echo "None")
if [ "$SG_ID" = "None" ] || [ -z "$SG_ID" ]; then
    SG_ID=$("$AWS" ec2 create-security-group \
        --group-name "${PROJECT}-fargate-sg" \
        --description "Fargate batch outbound only" \
        --vpc-id "$VPC_ID" --region "$REGION" \
        --query "GroupId" --output text)
    # デフォルトのインバウンドルール削除 (アウトバウンドのみ)
    "$AWS" ec2 revoke-security-group-ingress --group-id "$SG_ID" \
        --ip-permissions '[{"IpProtocol":"-1","IpRanges":[{"CidrIp":"0.0.0.0/0"}]}]' \
        --region "$REGION" 2>/dev/null || true
    ok "セキュリティグループ作成: $SG_ID (アウトバウンドのみ)"
else
    ok "既存SG: $SG_ID"
fi

# ── 5. IAMロール ──────────────────────────────────────────────
log "5. IAMロール..."

EXEC_ROLE_ARN=$("$AWS" iam get-role --role-name "$EXEC_ROLE" \
    --query "Role.Arn" --output text 2>/dev/null || echo "")
if [ -z "$EXEC_ROLE_ARN" ]; then
    EXEC_ROLE_ARN=$("$AWS" iam create-role --role-name "$EXEC_ROLE" \
        --assume-role-policy-document \
        '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ecs-tasks.amazonaws.com"},"Action":"sts:AssumeRole"}]}' \
        --query "Role.Arn" --output text)
    "$AWS" iam attach-role-policy --role-name "$EXEC_ROLE" \
        --policy-arn "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
    "$AWS" iam put-role-policy --role-name "$EXEC_ROLE" \
        --policy-name "secrets-read" \
        --policy-document "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Action\":[\"secretsmanager:GetSecretValue\"],\"Resource\":\"arn:aws:secretsmanager:${REGION}:${ACCOUNT_ID}:secret:${PROJECT}/fargate/*\"}]}"
    ok "実行ロール作成: $EXEC_ROLE_ARN"
else
    ok "既存実行ロール: $EXEC_ROLE_ARN"
fi

TASK_ROLE_ARN=$("$AWS" iam get-role --role-name "$TASK_ROLE" \
    --query "Role.Arn" --output text 2>/dev/null || echo "")
if [ -z "$TASK_ROLE_ARN" ]; then
    TASK_ROLE_ARN=$("$AWS" iam create-role --role-name "$TASK_ROLE" \
        --assume-role-policy-document \
        '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ecs-tasks.amazonaws.com"},"Action":"sts:AssumeRole"}]}' \
        --query "Role.Arn" --output text)
    "$AWS" iam put-role-policy --role-name "$TASK_ROLE" \
        --policy-name "task-permissions" \
        --policy-document "$(cat << POLICY
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem","dynamodb:PutItem","dynamodb:UpdateItem","dynamodb:DeleteItem",
        "dynamodb:Query","dynamodb:Scan","dynamodb:BatchWriteItem","dynamodb:BatchGetItem"
      ],
      "Resource": "arn:aws:dynamodb:${REGION}:${ACCOUNT_ID}:table/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject","s3:PutObject","s3:DeleteObject","s3:ListBucket","s3:CopyObject"
      ],
      "Resource": [
        "arn:aws:s3:::${S3_BUCKET}",
        "arn:aws:s3:::${S3_BUCKET}/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "cognito-idp:ListUsers","cognito-idp:AdminGetUser","cognito-idp:AdminListGroupsForUser"
      ],
      "Resource": "arn:aws:cognito-idp:${REGION}:${ACCOUNT_ID}:userpool/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "scheduler:GetSchedule","scheduler:UpdateSchedule"
      ],
      "Resource": "arn:aws:scheduler:${REGION}:${ACCOUNT_ID}:schedule/default/${PROJECT}-night-*"
    },
    {
      "Effect": "Allow",
      "Action": ["iam:PassRole"],
      "Resource": "arn:aws:iam::${ACCOUNT_ID}:role/${PROJECT}-eventbridge-fargate"
    }
  ]
}
POLICY
)"
    ok "タスクロール作成: $TASK_ROLE_ARN"
else
    ok "既存タスクロール: $TASK_ROLE_ARN"
fi

# ── 6. Secrets Manager ────────────────────────────────────────
log "6. Secrets Manager..."
if "$AWS" secretsmanager describe-secret --secret-id "$SECRET_NAME" --region "$REGION" 2>/dev/null | grep -q "ARN"; then
    ok "既存: $SECRET_NAME"
else
    "$AWS" secretsmanager create-secret \
        --name "$SECRET_NAME" \
        --description "mugenknock Fargate夜間バッチ 環境変数" \
        --region "$REGION" \
        --secret-string '{"ANTHROPIC_API_KEY":"","SMTP_USER":"","SMTP_PASS":""}'
    ok "作成: $SECRET_NAME"
fi
SECRET_ARN=$("$AWS" secretsmanager describe-secret --secret-id "$SECRET_NAME" \
    --region "$REGION" --query "ARN" --output text)

# ── 7. ECSクラスター ──────────────────────────────────────────
log "7. ECSクラスター..."
if "$AWS" ecs describe-clusters --clusters "$CLUSTER" --region "$REGION" \
    --query "clusters[?status=='ACTIVE'].clusterName" --output text 2>/dev/null | grep -q "$CLUSTER"; then
    ok "既存: $CLUSTER"
else
    "$AWS" ecs create-cluster --cluster-name "$CLUSTER" --region "$REGION" > /dev/null
    ok "作成: $CLUSTER"
fi

# ── 8. タスク定義 ─────────────────────────────────────────────
log "8. タスク定義 (${TASK_FAMILY})..."
TASK_DEF_JSON=$(python3 - << PYEOF
import json
td = {
  "family": "${TASK_FAMILY}",
  "requiresCompatibilities": ["FARGATE"],
  "networkMode": "awsvpc",
  "cpu": "1024",
  "memory": "2048",
  "executionRoleArn": "${EXEC_ROLE_ARN}",
  "taskRoleArn": "${TASK_ROLE_ARN}",
  "containerDefinitions": [{
    "name": "${TASK_FAMILY}",
    "image": "${ECR_URI}:latest",
    "essential": True,
    "environment": [
      {"name": "FARGATE_MODE",         "value": "1"},
      {"name": "FARGATE_STATE_BUCKET", "value": "${S3_BUCKET}"},
      {"name": "TZ",                   "value": "Asia/Tokyo"}
    ],
    "secrets": [
      {"name": "SMTP_USER",         "valueFrom": "${SECRET_ARN}:SMTP_USER::"},
      {"name": "SMTP_PASS",         "valueFrom": "${SECRET_ARN}:SMTP_PASS::"}
    ],
    "logConfiguration": {
      "logDriver": "awslogs",
      "options": {
        "awslogs-group":         "${LOG_GROUP}",
        "awslogs-region":        "${REGION}",
        "awslogs-stream-prefix": "ecs"
      }
    }
  }]
}
print(json.dumps(td))
PYEOF
)
"$AWS" ecs register-task-definition \
    --cli-input-json "$TASK_DEF_JSON" \
    --region "$REGION" > /dev/null
ok "タスク定義登録: $TASK_FAMILY"

HOOK_FAMILY="${PROJECT}-night-hook"
HOOK_SCHEDULE_NAME="${PROJECT}-night-hook"
ALERT_TOPIC_NAME="${PROJECT}-batch-alerts"
# スケジュール式 (JST)
MAIN_SCHEDULE="cron(2 0,5,10,15,20 * * ? *)"   # 0:02, 5:02, 10:02, 15:02, 20:02
HOOK_SCHEDULE="cron(32 23,4,9,14,19 * * ? *)"   # 30分前

# ── 8b. フック用タスク定義 (同じイメージ, entryPoint だけ差し替え) ──
log "8b. フック用タスク定義 (${HOOK_FAMILY})..."
HOOK_TASK_DEF_JSON=$(python3 - << PYEOF
import json
td = {
  "family": "${HOOK_FAMILY}",
  "requiresCompatibilities": ["FARGATE"],
  "networkMode": "awsvpc",
  "cpu": "512",
  "memory": "1024",
  "executionRoleArn": "${EXEC_ROLE_ARN}",
  "taskRoleArn": "${TASK_ROLE_ARN}",
  "containerDefinitions": [{
    "name": "${HOOK_FAMILY}",
    "image": "${ECR_URI}:latest",
    "essential": True,
    "entryPoint": ["/app/scripts/fargate-hook-entrypoint.sh"],
    "environment": [
      {"name": "FARGATE_MODE",         "value": "1"},
      {"name": "FARGATE_STATE_BUCKET", "value": "${S3_BUCKET}"},
      {"name": "TZ",                   "value": "Asia/Tokyo"}
    ],
    "secrets": [
      {"name": "SMTP_USER",         "valueFrom": "${SECRET_ARN}:SMTP_USER::"},
      {"name": "SMTP_PASS",         "valueFrom": "${SECRET_ARN}:SMTP_PASS::"}
    ],
    "logConfiguration": {
      "logDriver": "awslogs",
      "options": {
        "awslogs-group":         "${LOG_GROUP}",
        "awslogs-region":        "${REGION}",
        "awslogs-stream-prefix": "hook"
      }
    }
  }]
}
print(json.dumps(td))
PYEOF
)
"$AWS" ecs register-task-definition \
    --cli-input-json "$HOOK_TASK_DEF_JSON" \
    --region "$REGION" > /dev/null
ok "フック用タスク定義登録: $HOOK_FAMILY"

# ── 8c. レポート用タスク定義 (99-send-report のみ実行・手動/検証用) ──
REPORT_FAMILY="${PROJECT}-night-report"
log "8c. レポート用タスク定義 (${REPORT_FAMILY})..."
REPORT_TASK_DEF_JSON=$(python3 - << PYEOF
import json
td = {
  "family": "${REPORT_FAMILY}",
  "requiresCompatibilities": ["FARGATE"],
  "networkMode": "awsvpc",
  "cpu": "512",
  "memory": "1024",
  "executionRoleArn": "${EXEC_ROLE_ARN}",
  "taskRoleArn": "${TASK_ROLE_ARN}",
  "containerDefinitions": [{
    "name": "${REPORT_FAMILY}",
    "image": "${ECR_URI}:latest",
    "essential": True,
    "entryPoint": ["/app/scripts/fargate-report-entrypoint.sh"],
    "environment": [
      {"name": "FARGATE_MODE",         "value": "1"},
      {"name": "FARGATE_STATE_BUCKET", "value": "${S3_BUCKET}"},
      {"name": "TZ",                   "value": "Asia/Tokyo"}
    ],
    "secrets": [
      {"name": "SMTP_USER",         "valueFrom": "${SECRET_ARN}:SMTP_USER::"},
      {"name": "SMTP_PASS",         "valueFrom": "${SECRET_ARN}:SMTP_PASS::"}
    ],
    "logConfiguration": {
      "logDriver": "awslogs",
      "options": {
        "awslogs-group":         "${LOG_GROUP}",
        "awslogs-region":        "${REGION}",
        "awslogs-stream-prefix": "report"
      }
    }
  }]
}
print(json.dumps(td))
PYEOF
)
"$AWS" ecs register-task-definition \
    --cli-input-json "$REPORT_TASK_DEF_JSON" \
    --region "$REGION" > /dev/null
ok "レポート用タスク定義登録: $REPORT_FAMILY"

# ── 9. EventBridgeスケジューラー用ロール ─────────────────────
log "9. EventBridgeスケジューラー..."
SCHED_ROLE_ARN=$("$AWS" iam get-role --role-name "$SCHED_ROLE" \
    --query "Role.Arn" --output text 2>/dev/null || echo "")
if [ -z "$SCHED_ROLE_ARN" ]; then
    SCHED_ROLE_ARN=$("$AWS" iam create-role --role-name "$SCHED_ROLE" \
        --assume-role-policy-document \
        '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"scheduler.amazonaws.com"},"Action":"sts:AssumeRole"}]}' \
        --query "Role.Arn" --output text)
    ok "EventBridgeロール作成: $SCHED_ROLE_ARN"
    echo "  IAM伝播待ち (10秒)..."
    sleep 10
else
    ok "既存EventBridgeロール: $SCHED_ROLE_ARN"
fi
# ポリシーを常に最新化 (冪等)
"$AWS" iam put-role-policy --role-name "$SCHED_ROLE" \
    --policy-name "run-ecs-task" \
    --policy-document "$(cat << POLICY
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["ecs:RunTask"],
      "Resource": [
        "arn:aws:ecs:${REGION}:${ACCOUNT_ID}:task-definition/${TASK_FAMILY}*",
        "arn:aws:ecs:${REGION}:${ACCOUNT_ID}:task-definition/${HOOK_FAMILY}*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": ["iam:PassRole"],
      "Resource": ["${EXEC_ROLE_ARN}","${TASK_ROLE_ARN}"]
    }
  ]
}
POLICY
)"

TASK_DEF_ARN=$("$AWS" ecs describe-task-definition \
    --task-definition "$TASK_FAMILY" --region "$REGION" \
    --query "taskDefinition.taskDefinitionArn" --output text)
HOOK_TASK_DEF_ARN=$("$AWS" ecs describe-task-definition \
    --task-definition "$HOOK_FAMILY" --region "$REGION" \
    --query "taskDefinition.taskDefinitionArn" --output text)

_make_ecs_target() {
    local task_def_arn="$1"
    python3 - "$task_def_arn" << PYEOF
import json, sys
target = {
  "Arn": "arn:aws:ecs:${REGION}:${ACCOUNT_ID}:cluster/${CLUSTER}",
  "RoleArn": "${SCHED_ROLE_ARN}",
  "EcsParameters": {
    "TaskDefinitionArn": sys.argv[1],
    "LaunchType": "FARGATE",
    "NetworkConfiguration": {
      "awsvpcConfiguration": {
        "Subnets": ["${SUBNET_ID}"],
        "SecurityGroups": ["${SG_ID}"],
        "AssignPublicIp": "ENABLED"
      }
    },
    "PlatformVersion": "LATEST",
    "TaskCount": 1
  }
}
print(json.dumps(target))
PYEOF
}

# メインスケジュール
MAIN_TARGET=$(_make_ecs_target "$TASK_DEF_ARN")
if "$AWS" scheduler get-schedule --name "$SCHEDULE_NAME" --region "$REGION" 2>/dev/null | grep -q "ScheduleExpression"; then
    "$AWS" scheduler update-schedule \
        --name "$SCHEDULE_NAME" \
        --schedule-expression "$MAIN_SCHEDULE" \
        --schedule-expression-timezone "Asia/Tokyo" \
        --flexible-time-window '{"Mode":"OFF"}' \
        --target "$MAIN_TARGET" \
        --region "$REGION" > /dev/null
    ok "メインスケジュール更新: $SCHEDULE_NAME ($MAIN_SCHEDULE)"
else
    "$AWS" scheduler create-schedule \
        --name "$SCHEDULE_NAME" \
        --schedule-expression "$MAIN_SCHEDULE" \
        --schedule-expression-timezone "Asia/Tokyo" \
        --flexible-time-window '{"Mode":"OFF"}' \
        --target "$MAIN_TARGET" \
        --region "$REGION" > /dev/null
    ok "メインスケジュール作成: $SCHEDULE_NAME ($MAIN_SCHEDULE)"
fi

# フックスケジュール (30分前)
HOOK_TARGET=$(_make_ecs_target "$HOOK_TASK_DEF_ARN")
if "$AWS" scheduler get-schedule --name "$HOOK_SCHEDULE_NAME" --region "$REGION" 2>/dev/null | grep -q "ScheduleExpression"; then
    "$AWS" scheduler update-schedule \
        --name "$HOOK_SCHEDULE_NAME" \
        --schedule-expression "$HOOK_SCHEDULE" \
        --schedule-expression-timezone "Asia/Tokyo" \
        --flexible-time-window '{"Mode":"OFF"}' \
        --target "$HOOK_TARGET" \
        --region "$REGION" > /dev/null
    ok "フックスケジュール更新: $HOOK_SCHEDULE_NAME ($HOOK_SCHEDULE)"
else
    "$AWS" scheduler create-schedule \
        --name "$HOOK_SCHEDULE_NAME" \
        --schedule-expression "$HOOK_SCHEDULE" \
        --schedule-expression-timezone "Asia/Tokyo" \
        --flexible-time-window '{"Mode":"OFF"}' \
        --target "$HOOK_TARGET" \
        --region "$REGION" > /dev/null
    ok "フックスケジュール作成: $HOOK_SCHEDULE_NAME ($HOOK_SCHEDULE)"
fi

# ── 10. 失敗通知 (SNS + EventBridge) ────────────────────────
log "10. 失敗通知..."

# SNSトピック
ALERT_TOPIC_ARN=$("$AWS" sns list-topics --region "$REGION" \
    --query "Topics[?ends_with(TopicArn,':${ALERT_TOPIC_NAME}')].TopicArn" \
    --output text 2>/dev/null | head -1)
if [ -z "$ALERT_TOPIC_ARN" ] || [ "$ALERT_TOPIC_ARN" = "None" ]; then
    ALERT_TOPIC_ARN=$("$AWS" sns create-topic \
        --name "$ALERT_TOPIC_NAME" \
        --region "$REGION" \
        --query "TopicArn" --output text)
    ok "SNSトピック作成: $ALERT_TOPIC_ARN"
else
    ok "既存SNSトピック: $ALERT_TOPIC_ARN"
fi

# メール購読
ALERT_EMAIL="mugenknock@gmail.com"
EXISTING_SUB=$("$AWS" sns list-subscriptions-by-topic \
    --topic-arn "$ALERT_TOPIC_ARN" --region "$REGION" \
    --query "Subscriptions[?Endpoint=='${ALERT_EMAIL}'].SubscriptionArn" \
    --output text 2>/dev/null | head -1)
if [ -z "$EXISTING_SUB" ] || [ "$EXISTING_SUB" = "None" ]; then
    "$AWS" sns subscribe \
        --topic-arn "$ALERT_TOPIC_ARN" \
        --protocol email \
        --notification-endpoint "$ALERT_EMAIL" \
        --region "$REGION" > /dev/null
    ok "メール購読登録: $ALERT_EMAIL (確認メールが届きます→承認してください)"
else
    ok "既存メール購読: $ALERT_EMAIL"
fi

# EventBridgeルール: ECSタスクが失敗で停止したとき
EB_RULE_NAME="${PROJECT}-batch-failure"
"$AWS" events put-rule \
    --name "$EB_RULE_NAME" \
    --event-pattern "$(python3 - << PYEOF
import json
pattern = {
  "source": ["aws.ecs"],
  "detail-type": ["ECS Task State Change"],
  "detail": {
    "clusterArn": ["arn:aws:ecs:${REGION}:${ACCOUNT_ID}:cluster/${CLUSTER}"],
    "lastStatus": ["STOPPED"],
    "stopCode": ["TaskFailed","EssentialContainerExited","ServiceSchedulerInitializationError","SystemInitializationError"]
  }
}
print(json.dumps(pattern))
PYEOF
)" \
    --state ENABLED \
    --region "$REGION" > /dev/null

# EventBridgeルールのSNS送信権限
"$AWS" sns set-topic-attributes \
    --topic-arn "$ALERT_TOPIC_ARN" \
    --attribute-name Policy \
    --attribute-value "$(python3 - << PYEOF
import json
policy = {
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {"Service": "events.amazonaws.com"},
    "Action": "SNS:Publish",
    "Resource": "${ALERT_TOPIC_ARN}",
    "Condition": {
      "ArnLike": {"aws:SourceArn": "arn:aws:events:${REGION}:${ACCOUNT_ID}:rule/${EB_RULE_NAME}"}
    }
  }]
}
print(json.dumps(policy))
PYEOF
)" --region "$REGION"

# EventBridgeルール → SNSターゲット
# InputTemplate は「二重引用符で囲んだJSON文字列」でなければならない (改行は \n)
EB_TARGETS_FILE=$(mktemp)
ALERT_TOPIC_ARN="$ALERT_TOPIC_ARN" PROJECT="$PROJECT" python3 - "$EB_TARGETS_FILE" << 'PYEOF'
import json, os, sys
tmpl = ('"[mugenknock] Fargateタスク失敗\\n\\n'
        '時刻: <time>\\n'
        'タスク: <taskArn>\\n'
        '停止コード: <stopCode>\\n'
        '理由: <stopReason>\\n\\n'
        'CloudWatch Logs \\u2192 /ecs/%s-night-batch"' % os.environ['PROJECT'])
targets = [{
  "Id": "sns-alert",
  "Arn": os.environ['ALERT_TOPIC_ARN'],
  "InputTransformer": {
    "InputPathsMap": {
      "taskArn":    "$.detail.taskArn",
      "stopCode":   "$.detail.stopCode",
      "stopReason": "$.detail.stoppedReason",
      "time":       "$.time"
    },
    "InputTemplate": tmpl
  }
}]
with open(sys.argv[1], "w") as f:
    json.dump(targets, f)
PYEOF
"$AWS" events put-targets \
    --rule "$EB_RULE_NAME" \
    --targets "file://${EB_TARGETS_FILE}" \
    --region "$REGION" > /dev/null
rm -f "$EB_TARGETS_FILE"
ok "失敗通知ルール作成: $EB_RULE_NAME → $ALERT_EMAIL"

# ── 完了 ──────────────────────────────────────────────────────
echo ""
echo "================================================"
echo "セットアップ完了"
echo "================================================"
printf "  %-20s %s\n" "ECR:"           "${ECR_URI}"
printf "  %-20s %s\n" "S3 (state):"    "s3://${S3_BUCKET}"
printf "  %-20s %s\n" "ECS Cluster:"   "${CLUSTER}"
printf "  %-20s %s\n" "CloudWatch:"    "${LOG_GROUP}"
printf "  %-20s %s\n" "メインcron:"    "${MAIN_SCHEDULE}"
printf "  %-20s %s\n" "フックcron:"    "${HOOK_SCHEDULE} (30分前)"
printf "  %-20s %s\n" "失敗通知:"      "${ALERT_EMAIL}"
echo ""
echo "次のステップ:"
echo "  1. 認証: Claudeサブスクリプションの OAuth 資格情報をS3へアップロード"
echo "     (APIキーは使わない。~/.claude/.credentials.json を claude-auth/ へ)"
echo "       ./scripts/fargate-upload-auth.sh"
echo "     ※ SMTPはSecretsに設定済み"
echo ""
echo "  2. SNS確認メールを承認 (mugenknock@gmail.com 宛に届きます)"
echo ""
echo "  3. 初回イメージビルド・プッシュ (dockerが必要):"
echo "     ./scripts/fargate-build-push.sh"
echo "================================================"
