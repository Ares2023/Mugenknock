#!/bin/bash
# 日めくりAWSサービス生成スクリプト（手動実行用）
# 既存サービスと重複しない新サービスをClaudeで生成し DynamoDB に直接登録する
# 登録後、アイコンが不足していれば AWS 公式アイコンキットから自動取得する
#
# Usage:
#   ./generate-daily-services.sh           # 5件生成（デフォルト）
#   ./generate-daily-services.sh -n 10     # 10件生成
#   ./generate-daily-services.sh -h        # ヘルプ
#
# 環境変数:
#   AWS_ICON_KIT_URL   アイコンキット ZIP の URL（更新されたら差し替える）
#   AWS_ICON_KIT_CACHE アイコンキット ZIP のキャッシュパス（デフォルト: /tmp/aws-icon-kit-cache.zip）

set -uo pipefail

export PATH="/home/yuzuki/.npm-global/bin:/home/yuzuki/local/bin:/home/sera/.config/nvm/versions/node/v20.20.2/bin:$PATH"
unset ANTHROPIC_API_KEY

_find_claude() {
  local _w=/home/yuzuki/local/bin/claude
  [ -x "$_w" ] && { echo "$_w"; return; }
  local _p=/home/yuzuki/.npm-global/lib/node_modules/@anthropic-ai/claude-code/bin/claude.exe
  [ -x "$_p" ] && { echo "$_p"; return; }
  local _cv; _cv=$(command -v claude 2>/dev/null)
  [ -n "$_cv" ] && [ -x "$_cv" ] && echo "$_cv"
}
CLAUDE_CMD=$(_find_claude)
if [ -z "${CLAUDE_CMD:-}" ] || [ ! -x "${CLAUDE_CMD:-}" ]; then
  echo "❌ claude コマンドが見つかりません" >&2; exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ICON_DIR="$(dirname "$(dirname "$(dirname "$SCRIPT_DIR")")")/public/icons/aws"

COUNT=5

AWS_ICON_KIT_URL="${AWS_ICON_KIT_URL:-https://d1.awsstatic.com/onedam/marketing-channels/website/aws/en_US/architecture/approved/architecture-icons/Icon-package_04302026.4705b90f5aa45b019271a2699e9ce9b97b941ee1.zip}"
AWS_ICON_KIT_CACHE="${AWS_ICON_KIT_CACHE:-/tmp/aws-icon-kit-cache.zip}"

show_help() {
  cat << 'EOF'
usage: generate-daily-services.sh [-n N] [-h]

  -n N    生成件数（デフォルト: 5）
  -h      このヘルプを表示

挙動:
  DailyServices テーブルの既存サービスを取得し、重複しない新サービスを Claude で生成
  生成したサービスを DynamoDB に直接登録（order は既存最大値+1 から連番）
  アイコンが不足していれば AWS 公式アイコンキット ZIP から自動取得
  それでも不足していれば一覧表示

環境変数:
  AWS_ICON_KIT_URL   アイコンキット ZIP の URL（古くなったら差し替える）
  AWS_ICON_KIT_CACHE ローカルキャッシュパス（デフォルト: /tmp/aws-icon-kit-cache.zip）
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -n) COUNT="${2:?-n requires N}"; shift 2 ;;
    -h|--help) show_help; exit 0 ;;
    *) echo "不明なオプション: $1" >&2; show_help >&2; exit 1 ;;
  esac
done

echo "=========================================="
echo "日めくりAWSサービス生成"
echo "生成件数: ${COUNT}件"
echo "=========================================="

# ── 1. 既存サービスを取得 ──────────────────────────────────────
echo ""
echo "--- 既存サービスを取得中 ---"
EXISTING_JSON=$(aws dynamodb scan --table-name DailyServices --output json 2>/dev/null)
if [ $? -ne 0 ] || [ -z "$EXISTING_JSON" ]; then
  echo "❌ DynamoDB スキャン失敗" >&2; exit 1
fi

_EXISTING_TMP=$(mktemp /tmp/existing_svc_XXXX.json)
echo "$EXISTING_JSON" > "$_EXISTING_TMP"
EXISTING_INFO=$(python3 - "$_EXISTING_TMP" << 'PYEOF'
import json, sys

with open(sys.argv[1]) as f:
    data = json.load(f)

def d(v):
    if 'S' in v: return v['S']
    if 'N' in v: return v['N']
    if 'BOOL' in v: return v['BOOL']
    if 'L' in v: return [d(i) for i in v['L']]
    if 'M' in v: return {k: d(vv) for k, vv in v['M'].items()}
    return str(v)

items = [{k: d(v) for k, v in item.items()} for item in data.get('Items', [])]
items.sort(key=lambda x: int(x.get('order', 0)))

max_order = max((int(s.get('order', 0)) for s in items), default=0)

names = [s.get('name', '') for s in items]

print('__MAX_ORDER__' + str(max_order))
print('__COUNT__' + str(len(items)))
print('__NAMES__' + json.dumps(names, ensure_ascii=False))

for s in items:
    print(f"  [{s.get('order'):>3}] {s.get('name')} ({s.get('category')})")
PYEOF
)
rm -f "$_EXISTING_TMP"

MAX_ORDER=$(echo "$EXISTING_INFO" | grep '^__MAX_ORDER__' | sed 's/^__MAX_ORDER__//')
EXISTING_COUNT=$(echo "$EXISTING_INFO" | grep '^__COUNT__' | sed 's/^__COUNT__//')
EXISTING_NAMES=$(echo "$EXISTING_INFO" | grep '^__NAMES__' | sed 's/^__NAMES__//')
echo "$EXISTING_INFO" | grep -v '^__'
echo ""
echo "現在 ${EXISTING_COUNT}件 登録済み / 最大 order=${MAX_ORDER}"

# ── 2. 利用可能なアイコンファイル一覧を取得 ─────────────────────
ICON_FILES=$(find "$ICON_DIR" -name "*.png" 2>/dev/null | xargs -I{} basename {} .png | sort | tr '\n' ',' | sed 's/,$//')

# ── 3. Claude にサービスを生成させる ──────────────────────────
echo ""
echo "--- Claude でサービスを生成中 ---"

NEXT_ORDER=$(( MAX_ORDER + 1 ))

_NAMES_TMP=$(mktemp /tmp/daily_svc_names_XXXX.json)
printf '%s' "$EXISTING_NAMES" > "$_NAMES_TMP"

_ICONS_TMP=$(mktemp /tmp/daily_svc_icons_XXXX.txt)
printf '%s' "$ICON_FILES" > "$_ICONS_TMP"

PROMPT_FILE=$(mktemp /tmp/daily_svc_prompt_XXXX.txt)
COUNT_VAL="$COUNT" NEXT_ORDER_VAL="$NEXT_ORDER" \
python3 - "$_NAMES_TMP" "$_ICONS_TMP" > "$PROMPT_FILE" << 'PYEOF'
import json, sys, os

with open(sys.argv[1]) as f:
    existing_names = json.load(f)

with open(sys.argv[2]) as f:
    icon_files = [x.strip() for x in f.read().split(',') if x.strip()]

count = int(os.environ['COUNT_VAL'])
start_order = int(os.environ['NEXT_ORDER_VAL'])

existing_list = '\n'.join(f'  - {n}' for n in existing_names)
icon_list = ', '.join(icon_files)

print(f"""あなたはAWS認定試験学習サイトの「日めくりAWSサービス」コンテンツ担当者です。
毎日1つのAWSサービスを紹介するカレンダー形式のコンテンツを作成しています。

【既に登録済みのサービス（これらとの重複は絶対に避けること）】
{existing_list}

【生成する件数】{count}件

【利用可能なアイコンファイル】（これ以外のファイルは存在しない）
{icon_list}

【各サービスに必要な情報】
- name: AWSサービスの正式名称（例: "Amazon S3", "AWS Lambda"）
- shortName: 短縮名（例: "S3", "Lambda", "CloudTrail"）
- category: カテゴリ（下記から選択）
  コンピューティング / ストレージ / データベース / ネットワーキング / メッセージング /
  コンテナ / セキュリティ / モニタリング / アプリケーション統合 / DevOps /
  データ分析 / 機械学習 / 生成AI / マネジメント / 移行
- description: サービスの説明（日本語、80〜120字）
  「何ができるか」「どんな場面で使うか」を簡潔に。試験受験者が理解しやすい表現で。
- trivia: 豆知識・試験のポイント（日本語、80〜120字）
  名前の由来・覚え方・他サービスとの違い・試験頻出ポイントなど興味が持てる内容で。
- icon: 上記【利用可能なアイコンファイル】の中から最も近いものを選んでファイル名を指定
  形式: "/icons/aws/{{ファイル名}}.png"
  完全一致するものがない場合は "" （空文字）にすること
- docUrl: 日本語公式ドキュメントURL（形式: "https://aws.amazon.com/jp/{{service-slug}}/"）
- order: {start_order} から連番で付番

【選定基準】
- 現行のAWSサービスのみ（廃止・非推奨は除外）
- AWS認定試験（CLF〜SAP・DVA・SOA・DOP・AIF・MLA・GAI）の出題範囲内のサービスを優先
- まだ登録されていないメジャー〜準メジャーなサービスを選ぶ
- 同じカテゴリに偏らず、バランスよく選ぶ

【出力形式】
以下の JSON のみで出力してください。説明文・前置き・コードブロックは不要です。

{{"services":[
  {{
    "name": "...",
    "shortName": "...",
    "category": "...",
    "description": "...",
    "trivia": "...",
    "icon": "/icons/aws/....png",
    "docUrl": "https://aws.amazon.com/jp/.../",
    "order": {start_order}
  }},
  ...
]}}
""")
PYEOF
rm -f "$_NAMES_TMP" "$_ICONS_TMP"

_STDOUT_F=$(mktemp /tmp/claude_out_XXXX)
_STDERR_F=$(mktemp /tmp/claude_err_XXXX)
"$CLAUDE_CMD" -p < "$PROMPT_FILE" > "$_STDOUT_F" 2> "$_STDERR_F"
AI_EXIT=$?
RESULT=$(cat "$_STDOUT_F")
_STDERR_OUT=$(cat "$_STDERR_F")
rm -f "$_STDOUT_F" "$_STDERR_F" "$PROMPT_FILE"

if [ $AI_EXIT -ne 0 ]; then
  echo "❌ Claude 実行エラー (exit=$AI_EXIT)"
  echo "stderr: $(echo "$_STDERR_OUT" | head -5)"
  exit 1
fi

if echo "$_STDERR_OUT" | grep -qiE "rate.?limit|too many requests|overload|quota exceeded"; then
  echo "⚠️  レート制限を検出"
  echo "stderr: $(echo "$_STDERR_OUT" | head -3)"
  exit 1
fi

# ── 4. JSON 抽出 ───────────────────────────────────────────────
SERVICES_JSON=$(echo "$RESULT" | python3 -c "
import sys, json, re
text = sys.stdin.read()
cb = re.search(r'\`\`\`(?:json)?\s*(\{)', text, re.DOTALL)
if cb:
    text = text[cb.start(1):]
    text = re.sub(r'\s*\`\`\`.*$', '', text, flags=re.DOTALL)
start = text.find('{')
if start == -1: print('{}'); exit(0)
try:
    obj, _ = json.JSONDecoder().raw_decode(text, start)
    print(json.dumps(obj) if 'services' in obj else '{}')
except: print('{}')
")

SVC_COUNT=$(echo "$SERVICES_JSON" | python3 -c "
import sys, json
print(len(json.loads(sys.stdin.read()).get('services', [])))
" 2>/dev/null || echo 0)

if [ "$SVC_COUNT" -eq 0 ]; then
  echo "❌ JSON 抽出失敗"
  echo "$RESULT" | head -c 400
  exit 1
fi

echo "✓ ${SVC_COUNT}件 生成完了"

# ── 5. DynamoDB に登録 ────────────────────────────────────────
echo ""
echo "--- DynamoDB に登録中 ---"

IMPORT_RESULT=$(python3 - "$SERVICES_JSON" "$ICON_DIR" << 'PYEOF'
import json, sys, subprocess, os, re
from datetime import datetime, timezone

data = json.loads(sys.argv[1])
icon_dir = sys.argv[2]
services = data.get('services', [])

now = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3] + 'Z'

slug_re = re.compile(r'[^a-z0-9]+')

missing_icons = []
imported = []

for svc in services:
    name       = svc.get('name', '')
    short_name = svc.get('shortName', '')
    category   = svc.get('category', '')
    description= svc.get('description', '')
    trivia     = svc.get('trivia', '')
    icon       = svc.get('icon', '')
    doc_url    = svc.get('docUrl', '')
    order      = svc.get('order', 0)

    # serviceId: svc-{shortname-kebab}-{order}
    slug = slug_re.sub('-', short_name.lower()).strip('-')
    service_id = f'svc-{slug}-{order}'

    # アイコンファイルの存在確認
    if icon:
        icon_file = os.path.join(icon_dir, os.path.basename(icon))
        if not os.path.exists(icon_file):
            missing_icons.append({'name': name, 'icon': icon})
    else:
        missing_icons.append({'name': name, 'icon': '(未指定)'})

    item = {
        'serviceId':   {'S': service_id},
        'name':        {'S': name},
        'shortName':   {'S': short_name},
        'category':    {'S': category},
        'description': {'S': description},
        'trivia':      {'S': trivia},
        'icon':        {'S': icon},
        'docUrl':      {'S': doc_url},
        'order':       {'S': str(order)},
        'isActive':    {'BOOL': True},
        'createdAt':   {'S': now},
    }

    result = subprocess.run([
        'aws', 'dynamodb', 'put-item',
        '--table-name', 'DailyServices',
        '--item', json.dumps(item),
    ], capture_output=True, text=True)

    if result.returncode == 0:
        print(f'  ✓ [{order:>3}] {name} ({category})')
        imported.append(name)
    else:
        print(f'  ❌ [{order:>3}] {name}: {result.stderr.strip()[:100]}')

print(f'__IMPORTED__{len(imported)}')
print('__MISSING_ICONS__' + json.dumps(missing_icons, ensure_ascii=False))
PYEOF
)

IMPORTED_COUNT=$(echo "$IMPORT_RESULT" | grep '^__IMPORTED__' | sed 's/^__IMPORTED__//')
MISSING_ICONS=$(echo "$IMPORT_RESULT" | grep '^__MISSING_ICONS__' | sed 's/^__MISSING_ICONS__//')
echo "$IMPORT_RESULT" | grep -v '^__'

echo ""
echo "登録完了: ${IMPORTED_COUNT}件"

# ── 6. アイコン未追加の警告 ──────────────────────────────────
MISSING_COUNT=$(echo "$MISSING_ICONS" | python3 -c "import json,sys; print(len(json.loads(sys.stdin.read())))" 2>/dev/null || echo 0)
if [ "$MISSING_COUNT" -gt 0 ]; then
  echo ""
  echo "⚠️  アイコンファイルが未追加のサービス（${MISSING_COUNT}件）:"
  echo "$MISSING_ICONS" | python3 -c "
import json, sys
items = json.loads(sys.stdin.read())
for item in items:
    print(f\"  - {item['name']}: {item['icon']}\")
print()
print('  アイコンは public/icons/aws/ に PNG を配置してください。')
print('  AWS アイコン取得先: https://aws.amazon.com/jp/architecture/icons/')
"
fi

echo ""
echo "=========================================="
echo "完了: $(date)"
echo "=========================================="
