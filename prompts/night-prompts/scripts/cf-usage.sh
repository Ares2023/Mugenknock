#!/bin/bash
# Cloudflare Pages 無料枠使用状況チェック
#
# 使い方:
#   ./prompts/night-prompts/manual/cf-usage.sh

CF_TOKEN="${CLOUDFLARE_API_TOKEN:-$(grep 'CLOUDFLARE_API_TOKEN' ~/.bashrc | head -1 | sed 's/.*="\(.*\)"/\1/')}"
CF_ACCOUNT="${CLOUDFLARE_ACCOUNT_ID:-$(grep 'CLOUDFLARE_ACCOUNT_ID' ~/.bashrc | head -1 | sed 's/.*="\(.*\)"/\1/')}"
PROJECT="mugenknock"
FREE_LIMIT=500

if [ -z "$CF_TOKEN" ] || [ -z "$CF_ACCOUNT" ]; then
  echo "❌ CLOUDFLARE_API_TOKEN または CLOUDFLARE_ACCOUNT_ID が未設定です"
  exit 1
fi

API="https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/pages/projects/${PROJECT}/deployments"

RESULT=$(curl -s "${API}" -H "Authorization: Bearer ${CF_TOKEN}")

python3 - "$RESULT" "$FREE_LIMIT" << 'PYEOF'
import json, sys
from datetime import datetime, timezone

data = json.loads(sys.argv[1])
limit = int(sys.argv[2])

if not data.get('success'):
    print("❌ API エラー:", data.get('errors'))
    sys.exit(1)

items = data['result']
now = datetime.now(timezone.utc)
ym = now.strftime('%Y-%m')

this_month = [i for i in items if i.get('created_on', '')[:7] == ym]
count = len(this_month)
pct = count / limit * 100

# 使用率に応じたアイコン
icon = '✅' if pct < 50 else ('⚠️ ' if pct < 80 else '🚨')

print()
print('📊 Cloudflare Pages — 無料枠使用状況')
print('=' * 44)
print(f'  対象月      : {ym}')
print(f'  ビルド数    : {count} / {limit}  {icon}')

# プログレスバー（20マス）
filled = int(count / limit * 20)
bar = '█' * filled + '░' * (20 - filled)
print(f'  [{bar}] {pct:.1f}%')

if count > 0:
    dates = sorted(i['created_on'][:10] for i in this_month)
    days_used = len(set(dates))
    days_in_month = 30
    avg = count / max(days_used, 1)
    projected = int(avg * days_in_month)
    print(f'  稼働日数    : {days_used} 日')
    print(f'  平均/日     : {avg:.1f} ビルド')
    print(f'  月末予測    : {projected} ビルド / {limit}')
    remaining = limit - count
    print(f'  残り枠      : {remaining} ビルド')

print()
PYEOF
