#!/bin/bash
# Cloudflare Pages デプロイ状況確認スクリプト
#
# 使い方:
#   ./prompts/night-prompts/manual/cf-deploy-status.sh          # 直近5件を表示
#   ./prompts/night-prompts/manual/cf-deploy-status.sh prod     # 本番（master）のみ
#   ./prompts/night-prompts/manual/cf-deploy-status.sh staging  # 検証（develop）のみ
#   ./prompts/night-prompts/manual/cf-deploy-status.sh wait     # 最新ビルドが完了するまで待機して結果表示

CF_TOKEN="${CLOUDFLARE_API_TOKEN:-$(grep 'CLOUDFLARE_API_TOKEN' ~/.bashrc | head -1 | sed 's/.*="\(.*\)"/\1/')}"
CF_ACCOUNT="${CLOUDFLARE_ACCOUNT_ID:-$(grep 'CLOUDFLARE_ACCOUNT_ID' ~/.bashrc | head -1 | sed 's/.*="\(.*\)"/\1/')}"
PROJECT="mugenknock"
FILTER="${1:-}"

if [ -z "$CF_TOKEN" ] || [ -z "$CF_ACCOUNT" ]; then
  echo "❌ CLOUDFLARE_API_TOKEN または CLOUDFLARE_ACCOUNT_ID が未設定です"
  exit 1
fi

API="https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/pages/projects/${PROJECT}/deployments"

fetch_deployments() {
  curl -s "$API" -H "Authorization: Bearer ${CF_TOKEN}"
}

print_deployments() {
  local resp="$1"
  local filter="$2"
  echo "$resp" | python3 -c "
import json, sys
from datetime import datetime, timezone

data = json.load(sys.stdin)
filter_env = '$filter'

if not data.get('success'):
    print('❌ APIエラー:', data.get('errors'))
    sys.exit(1)

STATUS_ICON = {'success':'✅','failure':'❌','canceled':'⚠️','active':'🔄','idle':'💤','queued':'⏳'}

print('📋 Cloudflare Pages — $PROJECT デプロイ状況')
print('=' * 60)

shown = 0
for d in data.get('result', []):
    env  = d.get('environment', '')
    meta = d.get('deployment_trigger', {}).get('metadata', {})
    branch = meta.get('branch', '')

    if filter_env == 'prod'    and env != 'production': continue
    if filter_env == 'staging' and env != 'preview':    continue
    if filter_env == 'wait':
        pass  # wait モードでは全件確認

    status = d.get('latest_stage', {}).get('status', '')
    icon   = STATUS_ICON.get(status, '❓')
    env_label = '本番' if env == 'production' else '検証'

    try:
        dt = datetime.fromisoformat(d.get('created_on','').replace('Z','+00:00'))
        time_str = dt.strftime('%m/%d %H:%M')
    except:
        time_str = d.get('created_on','')[:16]

    commit  = meta.get('commit_hash','')[:7]
    msg     = meta.get('commit_message','')
    msg     = (msg[:52] + '...') if len(msg) > 52 else msg
    url     = d.get('url','')

    print(f'{icon} [{env_label}] {time_str}  branch:{branch}  #{commit}')
    print(f'   {url}')
    if msg: print(f'   {msg}')
    print()

    shown += 1
    if shown >= 5 and filter_env not in ('prod', 'staging', 'wait'): break

if shown == 0:
    print('該当するデプロイがありません')
"
}

get_latest_status() {
  local resp="$1"
  echo "$resp" | python3 -c "
import json, sys
data = json.load(sys.stdin)
result = data.get('result', [])
if result:
    d = result[0]
    status = d.get('latest_stage', {}).get('status', '')
    print(status)
"
}

# ── wait モード: 最新ビルドが完了するまでポーリング ──
if [ "$FILTER" = "wait" ]; then
  echo "⏳ 最新ビルドの完了を待機中..."
  MAX=30   # 最大5分（10秒×30回）
  COUNT=0
  while [ $COUNT -lt $MAX ]; do
    RESP=$(fetch_deployments)
    STATUS=$(get_latest_status "$RESP")
    case "$STATUS" in
      success|failure|canceled)
        echo ""
        print_deployments "$RESP" ""
        if [ "$STATUS" = "success" ]; then
          echo "✅ ビルド成功"
          exit 0
        else
          echo "❌ ビルド失敗（status: $STATUS）"
          exit 1
        fi
        ;;
      active|queued)
        printf "."
        sleep 10
        COUNT=$((COUNT + 1))
        ;;
      *)
        echo ""
        echo "⚠️  不明なステータス: $STATUS"
        print_deployments "$RESP" ""
        exit 1
        ;;
    esac
  done
  echo ""
  echo "⏰ タイムアウト（5分経過）"
  print_deployments "$(fetch_deployments)" ""
  exit 1
fi

# ── 通常表示 ──
print_deployments "$(fetch_deployments)" "$FILTER"
