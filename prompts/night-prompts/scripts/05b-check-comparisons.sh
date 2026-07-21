#!/bin/bash
# AWSサービス比較ページの正確性・品質チェック（手動実行想定）
# 05-check-daily-services.sh と同型。未チェック優先→古い順で回転。
#   action=ok     → contentCheckedAt のみ更新
#   action=fix    → intro / examPoints のみ上書き（比較表・useCasesの構造は触らない）＋contentCheckedAt
#   action=delete → 事実として致命的に誤り/古い → DBから削除（次回 04b で再生成される）
#
# Usage: ./05b-check-comparisons.sh [-n N]   （デフォルト -n 10）

set -uo pipefail
export PATH="/home/yuzuki/local/bin:$PATH"
unset ANTHROPIC_API_KEY
AWS=/home/yuzuki/local/bin/aws
TABLE=Comparisons

_find_claude() {
  [ -x /usr/local/bin/claude ] && { echo /usr/local/bin/claude; return; }
  local _cv; _cv=$(command -v claude 2>/dev/null)
  [ -n "$_cv" ] && [ -x "$_cv" ] && { echo "$_cv"; return; }
}
CLAUDE_CMD=$(_find_claude)
[ -x "${CLAUDE_CMD:-}" ] || { echo "❌ claude コマンドが見つかりません" >&2; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NIGHT_PROMPTS_DIR="$(dirname "$SCRIPT_DIR")"
RATE_LIMIT_FILE="$NIGHT_PROMPTS_DIR/.claude_rate_limit_reset"

BATCH_SIZE=10
while [[ $# -gt 0 ]]; do
  case "$1" in
    -n) BATCH_SIZE="${2:?-n requires N}"; shift 2 ;;
    -h|--help) echo "usage: 05b-check-comparisons.sh [-n N]"; exit 0 ;;
    *) echo "不明なオプション: $1" >&2; exit 1 ;;
  esac
done

# レート制限ロック確認
if [ -f "$RATE_LIMIT_FILE" ]; then
  _rst=$(cat "$RATE_LIMIT_FILE" 2>/dev/null)
  _rep=$(python3 -c "from datetime import datetime
try: print(int(datetime.fromisoformat('$_rst').timestamp()))
except: print(0)" 2>/dev/null || echo 0)
  if [ -n "$_rst" ] && [ "$(date +%s)" -lt "${_rep:-0}" ]; then
    echo "⏸  Claude レート制限中（スキップ）"; exit 2
  fi
fi

echo "=========================================="
echo "比較ページ 正確性チェック（最大 ${BATCH_SIZE}件）"
echo "=========================================="

DUMP=$(mktemp /tmp/cmp_check_XXXX.json)
$AWS dynamodb scan --table-name "$TABLE" --output json 2>/dev/null > "$DUMP" || { echo "❌ scan失敗"; exit 1; }

# 未チェック優先・古い順で対象を選定
TARGETS=$(BATCH_SIZE=$BATCH_SIZE DUMP="$DUMP" python3 << 'PYEOF'
import json, os
from datetime import datetime, timezone
data = json.load(open(os.environ['DUMP']))
def deser(v):
    if 'S' in v: return v['S']
    if 'N' in v: return int(v['N']) if v['N'].isdigit() else float(v['N'])
    if 'BOOL' in v: return v['BOOL']
    if 'L' in v: return [deser(x) for x in v['L']]
    if 'M' in v: return {k: deser(x) for k, x in v['M'].items()}
    return None
items = [{k: deser(v) for k, v in it.items()} for it in data.get('Items', [])]
EPOCH = datetime(1970,1,1,tzinfo=timezone.utc)
def key(s):
    c = s.get('contentCheckedAt')
    try: return datetime.fromisoformat(c.replace('Z','+00:00')) if c else EPOCH
    except: return EPOCH
items.sort(key=key)
print(json.dumps(items[:int(os.environ['BATCH_SIZE'])], ensure_ascii=False))
PYEOF
)
rm -f "$DUMP"
N=$(echo "$TARGETS" | python3 -c "import json,sys;print(len(json.load(sys.stdin)))" 2>/dev/null || echo 0)
echo "チェック対象: ${N}件"
[ "$N" -eq 0 ] && { echo "対象なし"; exit 0; }

OK=0; FIX=0; DEL=0
for i in $(seq 0 $((N-1))); do
  ITEM=$(echo "$TARGETS" | python3 -c "import json,sys;print(json.dumps(json.load(sys.stdin)[$i],ensure_ascii=False))")
  SLUG=$(echo "$ITEM" | python3 -c "import json,sys;print(json.load(sys.stdin)['slug'])")
  echo ""; echo "--- [$((i+1))/${N}] $SLUG ---"

  PROMPT_FILE=$(mktemp /tmp/cmp_chk_prompt_XXXX.txt)
  ITEM_JSON="$ITEM" python3 - > "$PROMPT_FILE" << 'PYEOF'
import json, os
c = json.loads(os.environ['ITEM_JSON'])
print(f"""次のAWSサービス比較記事の「事実の正確性・現行性・構造の妥当性」をチェックし、JSONのみで返してください。

【判定】
- ok: 事実として正確で問題なし
- fix: intro か examPoints に軽微な誤り/古さがある（比較表axes・useCasesは対象外。ここが誤っている場合は delete）
- delete: 比較表やuseCasesに看過できない事実誤り/存在しない機能/古い情報がある（再生成させる）

【対象記事】
title: {c.get('title')}
services: {json.dumps(c.get('services'), ensure_ascii=False)}
intro: {c.get('intro')}
axes: {json.dumps(c.get('axes'), ensure_ascii=False)}
useCases: {json.dumps(c.get('useCases'), ensure_ascii=False)}
examPoints: {c.get('examPoints')}

【出力】JSONのみ。前置き不要。
{{"action":"ok|fix|delete","reason":"120字以内","fix":{{"intro":"修正後(fix時のみ)","examPoints":"修正後(fix時のみ)"}}}}""")
PYEOF

  _OUT=$(mktemp /tmp/cmp_chk_out_XXXX); _ERR=$(mktemp /tmp/cmp_chk_err_XXXX)
  CLAUDE_CODE_MAX_OUTPUT_TOKENS=32000 "$CLAUDE_CMD" -p --model sonnet --tools "" < "$PROMPT_FILE" > "$_OUT" 2> "$_ERR"
  AI_EXIT=$?
  RESULT=$(cat "$_OUT"); ERROUT=$(cat "$_ERR")
  rm -f "$_OUT" "$_ERR" "$PROMPT_FILE"

  if echo "$ERROUT" | grep -qiE "rate.?limit|too many requests|quota|usage limit|529"; then
    echo "⚠️  レート制限。中断"; break
  fi
  [ $AI_EXIT -ne 0 ] && { echo "⚠️  claude エラー。スキップ"; continue; }

  ACTION=$(SLUG="$SLUG" TABLE="$TABLE" AWS_BIN="$AWS" python3 - "$RESULT" << 'PYEOF'
import json, os, re, sys, subprocess
from datetime import datetime, timezone
raw = sys.argv[1]
m = re.search(r'```(?:json)?\s*(\{)', raw, re.DOTALL)
text = raw[m.start(1):] if m else raw
start = text.find('{')
if start == -1: print('ERR'); sys.exit(0)
try: r, _ = json.JSONDecoder().raw_decode(text, start)
except: print('ERR'); sys.exit(0)
action = r.get('action', 'ok'); reason = r.get('reason', ''); fix = r.get('fix') or {}
now = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
slug = os.environ['SLUG']; TABLE = os.environ['TABLE']; AWS = os.environ['AWS_BIN']
key = json.dumps({'slug': {'S': slug}})
if action == 'delete':
    subprocess.run([AWS,'dynamodb','delete-item','--table-name',TABLE,'--key',key], capture_output=True)
    print(f'DELETE|{reason}')
elif action == 'fix' and (fix.get('intro') or fix.get('examPoints')):
    parts = ['contentCheckedAt = :t', 'updatedAt = :t']; vals = {':t': {'S': now}}
    if fix.get('intro'): parts.append('intro = :i'); vals[':i'] = {'S': str(fix['intro'])}
    if fix.get('examPoints'): parts.append('examPoints = :e'); vals[':e'] = {'S': str(fix['examPoints'])}
    subprocess.run([AWS,'dynamodb','update-item','--table-name',TABLE,'--key',key,
        '--update-expression','SET '+', '.join(parts),
        '--expression-attribute-values',json.dumps(vals,ensure_ascii=False)], capture_output=True)
    print(f'FIX|{reason}')
else:
    subprocess.run([AWS,'dynamodb','update-item','--table-name',TABLE,'--key',key,
        '--update-expression','SET contentCheckedAt = :t','--expression-attribute-values',
        json.dumps({':t': {'S': now}})], capture_output=True)
    print(f'OK|{reason}')
PYEOF
)
  case "$ACTION" in
    DELETE*) DEL=$((DEL+1)); echo "  [DELETE] ${ACTION#DELETE|}" ;;
    FIX*)    FIX=$((FIX+1)); echo "  [FIX] ${ACTION#FIX|}" ;;
    OK*)     OK=$((OK+1));   echo "  [OK] ${ACTION#OK|}" ;;
    *)       echo "  ⚠️  判定パース失敗" ;;
  esac
done

echo ""
echo "完了: OK=${OK} 修正=${FIX} 削除=${DEL} / $(date)"
