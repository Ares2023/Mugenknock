#!/bin/bash
# Cloudflare Pages デプロイ状況確認スクリプト
#
# 使い方:
#   ./prompts/night-prompts/manual/cf-deploy-status.sh          # 直近5件
#   ./prompts/night-prompts/manual/cf-deploy-status.sh prod     # 本番（master）のみ
#   ./prompts/night-prompts/manual/cf-deploy-status.sh staging  # 検証（develop）のみ

# .bashrc から認証情報を取得（非インタラクティブシェル対応）
CF_TOKEN="${CLOUDFLARE_API_TOKEN:-$(grep 'CLOUDFLARE_API_TOKEN' ~/.bashrc | head -1 | sed 's/.*="\(.*\)"/\1/')}"
CF_ACCOUNT="${CLOUDFLARE_ACCOUNT_ID:-$(grep 'CLOUDFLARE_ACCOUNT_ID' ~/.bashrc | head -1 | sed 's/.*="\(.*\)"/\1/')}"
PROJECT="mugenknock"
FILTER="${1:-}"

if [ -z "$CF_TOKEN" ] || [ -z "$CF_ACCOUNT" ]; then
  echo "❌ CLOUDFLARE_API_TOKEN または CLOUDFLARE_ACCOUNT_ID が未設定です"
  echo "   ~/.bashrc に設定してください"
  exit 1
fi

RESP=$(curl -s "https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/pages/projects/${PROJECT}/deployments" \
  -H "Authorization: Bearer ${CF_TOKEN}")

echo "$RESP" | python3 -c "
import json, sys
from datetime import datetime, timezone

data = json.load(sys.stdin)
filter_env = '$FILTER'

if not data.get('success'):
    print('❌ APIエラー:', data.get('errors'))
    sys.exit(1)

STATUS_ICON = {'success':'✅','failure':'❌','canceled':'⚠️','active':'🔄','idle':'💤'}

print('📋 Cloudflare Pages — $PROJECT デプロイ状況')
print('=' * 60)

shown = 0
for d in data.get('result', []):
    env  = d.get('environment', '')
    meta = d.get('deployment_trigger', {}).get('metadata', {})
    branch = meta.get('branch', '')

    if filter_env == 'prod'    and env != 'production': continue
    if filter_env == 'staging' and env != 'preview':    continue

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
    if shown >= 5 and not filter_env: break

if shown == 0:
    print('該当するデプロイがありません')
"
