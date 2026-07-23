#!/bin/bash
# ローカルにdockerが無い/使えない環境向け: AWS CodeBuild でイメージをビルドしECRへプッシュする。
# ソースをzipしてS3へ上げ、CodeBuildプロジェクト(初回は自動作成)でビルドする。
#
# 使い方:
#   ./scripts/fargate-codebuild.sh
#
# fargate-build-push.sh (ローカルdocker版) の代替。タスク定義は :latest 参照のため
# ビルド後の更新は不要 (Fargateは起動毎に最新イメージをpullする)。

set -euo pipefail

AWS=/home/yuzuki/local/bin/aws
REGION=ap-northeast-1
ACCOUNT_ID=$("$AWS" sts get-caller-identity --query Account --output text --region "$REGION")
PROJECT="mugenknock"
ECR_REPO="${PROJECT}-night-batch"
REGISTRY="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"
IMAGE="${REGISTRY}/${ECR_REPO}"
S3_BUCKET="${PROJECT}-fargate-state-${ACCOUNT_ID}"
CB_PROJECT="${PROJECT}-image-build"
CB_ROLE="${PROJECT}-codebuild-role"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SRC_KEY="codebuild/source.zip"

log() { printf '\033[34m[codebuild]\033[0m %s\n' "$*"; }
ok()  { printf '\033[32m  ✓\033[0m %s\n' "$*"; }

TAG=$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || date '+%Y%m%d%H%M')

# ── 1. ソースをzipしてS3へ (git archive: 追跡ファイルのみ=重量物は自動除外) ──
log "1. ソースをzip中 (git archive HEAD)..."
ZIP=$(mktemp --suffix=.zip)
git -C "$REPO_ROOT" archive --format=zip -o "$ZIP" HEAD
ZSIZE=$(du -h "$ZIP" | awk '{print $1}')
"$AWS" s3 cp "$ZIP" "s3://${S3_BUCKET}/${SRC_KEY}" --region "$REGION" --quiet
rm -f "$ZIP"
ok "ソースアップロード: s3://${S3_BUCKET}/${SRC_KEY} (${ZSIZE})"

# ── 2. CodeBuildサービスロール (冪等) ───────────────────────
log "2. CodeBuildロール..."
CB_ROLE_ARN=$("$AWS" iam get-role --role-name "$CB_ROLE" --query "Role.Arn" --output text 2>/dev/null || echo "")
if [ -z "$CB_ROLE_ARN" ]; then
    CB_ROLE_ARN=$("$AWS" iam create-role --role-name "$CB_ROLE" \
        --assume-role-policy-document \
        '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"codebuild.amazonaws.com"},"Action":"sts:AssumeRole"}]}' \
        --query "Role.Arn" --output text)
    ok "ロール作成: $CB_ROLE_ARN"
    sleep 8
else
    ok "既存ロール: $CB_ROLE_ARN"
fi
"$AWS" iam put-role-policy --role-name "$CB_ROLE" --policy-name "build-push" \
    --policy-document "$(cat << POLICY
{
  "Version":"2012-10-17",
  "Statement":[
    {"Effect":"Allow","Action":["logs:CreateLogGroup","logs:CreateLogStream","logs:PutLogEvents"],"Resource":"*"},
    {"Effect":"Allow","Action":["ecr:GetAuthorizationToken"],"Resource":"*"},
    {"Effect":"Allow","Action":[
        "ecr:BatchCheckLayerAvailability","ecr:InitiateLayerUpload","ecr:UploadLayerPart",
        "ecr:CompleteLayerUpload","ecr:PutImage","ecr:BatchGetImage"],
     "Resource":"arn:aws:ecr:${REGION}:${ACCOUNT_ID}:repository/${ECR_REPO}"},
    {"Effect":"Allow","Action":["s3:GetObject"],"Resource":"arn:aws:s3:::${S3_BUCKET}/${SRC_KEY}"}
  ]
}
POLICY
)"
ok "ポリシー更新"

# ── 3. buildspec (インライン) ───────────────────────────────
BUILDSPEC=$(cat << 'SPEC'
version: 0.2
phases:
  pre_build:
    commands:
      - echo "ECRログイン..."
      - aws ecr get-login-password --region "$AWS_DEFAULT_REGION" | docker login --username AWS --password-stdin "$REGISTRY"
  build:
    commands:
      - echo "イメージビルド ${IMAGE}:${TAG}..."
      - docker build -f Dockerfile.fargate -t "${IMAGE}:${TAG}" -t "${IMAGE}:latest" .
  post_build:
    commands:
      - echo "ECRプッシュ..."
      - docker push "${IMAGE}:${TAG}"
      - docker push "${IMAGE}:latest"
      - echo "done ${IMAGE}:${TAG}"
SPEC
)
export BUILDSPEC

# ── 4. CodeBuildプロジェクト (冪等) ─────────────────────────
log "4. CodeBuildプロジェクト..."
ENV_JSON=$(python3 - << PYEOF
import json
print(json.dumps({
  "type":"LINUX_CONTAINER",
  "image":"aws/codebuild/amazonlinux2-x86_64-standard:5.0",
  "computeType":"BUILD_GENERAL1_SMALL",
  "privilegedMode": True,
  "environmentVariables":[
    {"name":"AWS_DEFAULT_REGION","value":"${REGION}"},
    {"name":"REGISTRY","value":"${REGISTRY}"},
    {"name":"IMAGE","value":"${IMAGE}"},
    {"name":"TAG","value":"${TAG}"}
  ]
}))
PYEOF
)
SRC_JSON=$(python3 - << PYEOF
import json, os
print(json.dumps({
  "type":"S3",
  "location":"${S3_BUCKET}/${SRC_KEY}",
  "buildspec": os.environ["BUILDSPEC"]
}))
PYEOF
)

if "$AWS" codebuild batch-get-projects --names "$CB_PROJECT" --region "$REGION" \
     --query "projects[0].name" --output text 2>/dev/null | grep -q "$CB_PROJECT"; then
    "$AWS" codebuild update-project --name "$CB_PROJECT" \
        --source "$SRC_JSON" --environment "$ENV_JSON" \
        --service-role "$CB_ROLE_ARN" --region "$REGION" > /dev/null
    ok "プロジェクト更新: $CB_PROJECT"
else
    "$AWS" codebuild create-project --name "$CB_PROJECT" \
        --source "$SRC_JSON" \
        --artifacts '{"type":"NO_ARTIFACTS"}' \
        --environment "$ENV_JSON" \
        --service-role "$CB_ROLE_ARN" --region "$REGION" > /dev/null
    ok "プロジェクト作成: $CB_PROJECT"
fi

# ── 5. ビルド開始・完了待ち ─────────────────────────────────
log "5. ビルド開始..."
BUILD_ID=$("$AWS" codebuild start-build --project-name "$CB_PROJECT" \
    --region "$REGION" --query "build.id" --output text)
ok "ビルドID: $BUILD_ID"
echo "  完了待ち (数分)..."
while true; do
    STATUS=$("$AWS" codebuild batch-get-builds --ids "$BUILD_ID" --region "$REGION" \
        --query "builds[0].buildStatus" --output text 2>/dev/null)
    case "$STATUS" in
        SUCCEEDED) ok "ビルド成功"; break ;;
        FAILED|FAULT|STOPPED|TIMED_OUT)
            echo "  ❌ ビルド失敗: $STATUS"
            echo "  ログ: aws codebuild batch-get-builds --ids $BUILD_ID"
            "$AWS" codebuild batch-get-builds --ids "$BUILD_ID" --region "$REGION" \
                --query "builds[0].phases[?phaseStatus=='FAILED'].[phaseType,contexts[0].message]" \
                --output text 2>/dev/null
            exit 1 ;;
        *) sleep 8 ;;
    esac
done

echo ""
echo "================================================"
echo "イメージビルド完了 (CodeBuild)"
printf "  %-12s %s\n" "イメージ:" "${IMAGE}:${TAG}"
printf "  %-12s %s\n" "latest:"   "${IMAGE}:latest"
echo ""
echo "タスク定義は :latest 参照のため、次回スケジュール実行から反映されます"
echo "即時テスト: ./scripts/fargate-run-now.sh  →  ct log -f"
echo "================================================"
