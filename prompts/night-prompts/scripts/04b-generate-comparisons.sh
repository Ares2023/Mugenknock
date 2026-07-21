#!/bin/bash
# AWSサービス比較ページ生成スクリプト（手動実行想定）
# comparison-catalog.json の未作成トピックを Claude で生成し Comparisons テーブルに登録する。
# 04-generate-daily-services.sh と同型（カタログが単一の真実source・モデルは本文のみ生成）。
#
# Usage:
#   ./04b-generate-comparisons.sh          # 未作成を最大3件生成（デフォルト）
#   ./04b-generate-comparisons.sh -n 5     # 5件
#   ./04b-generate-comparisons.sh -n 1     # 1件（試作・レビュー用）

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
if [ -z "${CLAUDE_CMD:-}" ] || [ ! -x "${CLAUDE_CMD:-}" ]; then
  echo "❌ claude コマンドが見つかりません" >&2; exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NIGHT_PROMPTS_DIR="$(dirname "$SCRIPT_DIR")"
CATALOG_FILE="$SCRIPT_DIR/state/comparison-catalog.json"
RATE_LIMIT_FILE="$NIGHT_PROMPTS_DIR/.claude_rate_limit_reset"

COUNT=3
while [[ $# -gt 0 ]]; do
  case "$1" in
    -n) COUNT="${2:?-n requires N}"; shift 2 ;;
    -h|--help) echo "usage: 04b-generate-comparisons.sh [-n N]"; exit 0 ;;
    *) echo "不明なオプション: $1" >&2; exit 1 ;;
  esac
done

# レート制限ロック確認（04と同じ仕組み）
if [ -f "$RATE_LIMIT_FILE" ]; then
  _rst=$(cat "$RATE_LIMIT_FILE" 2>/dev/null)
  _rep=$(python3 -c "from datetime import datetime;
try: print(int(datetime.fromisoformat('$_rst').timestamp()))
except: print(0)" 2>/dev/null || echo 0)
  if [ -n "$_rst" ] && [ "$(date +%s)" -lt "${_rep:-0}" ]; then
    echo "⏸  Claude レート制限中（$(basename "$0") をスキップ）"; exit 2
  fi
fi

[ -f "$CATALOG_FILE" ] || { echo "❌ カタログが無い: $CATALOG_FILE" >&2; exit 1; }

echo "=========================================="
echo "AWSサービス比較ページ生成（最大 ${COUNT}件）"
echo "=========================================="

# ── 1. 既存slugと最大order を取得 ─────────────────────────────
EXISTING_TMP=$(mktemp /tmp/cmp_existing_XXXX.json)
$AWS dynamodb scan --table-name "$TABLE" --projection-expression "slug,#o" \
  --expression-attribute-names '{"#o":"order"}' --output json 2>/dev/null > "$EXISTING_TMP" || echo '{}' > "$EXISTING_TMP"

# ── 2. カタログから未作成トピックを examRelevance 優先で選定 ──
CAND_TMP=$(mktemp /tmp/cmp_cand_XXXX.json)
CATALOG_FILE="$CATALOG_FILE" EXISTING_TMP="$EXISTING_TMP" COUNT_VAL="$COUNT" python3 - "$CAND_TMP" << 'PYEOF'
import json, os, sys
catalog = json.load(open(os.environ['CATALOG_FILE'], encoding='utf-8'))
ex = json.load(open(os.environ['EXISTING_TMP']))
existing_slugs = set()
max_order = 0
for it in ex.get('Items', []):
    s = (it.get('slug') or {}).get('S')
    if s: existing_slugs.add(s)
    try: max_order = max(max_order, int((it.get('order') or {}).get('N', '0')))
    except: pass
rank = {'high': 0, 'medium': 1, 'low': 2}
cands = [v for v in catalog.get('comparisons', {}).values()
         if v.get('slug') and v['slug'] not in existing_slugs]
cands.sort(key=lambda v: rank.get(v.get('examRelevance', 'low'), 3))
cands = cands[:int(os.environ['COUNT_VAL'])]
json.dump({'candidates': cands, 'startOrder': max_order + 1}, open(sys.argv[1], 'w'), ensure_ascii=False)
print(len(cands))
PYEOF
NCAND=$(python3 -c "import json;print(len(json.load(open('$CAND_TMP'))['candidates']))" 2>/dev/null || echo 0)
rm -f "$EXISTING_TMP"

if [ "${NCAND:-0}" -eq 0 ]; then
  echo "未作成の比較トピックがありません（カタログ全件作成済み）。"
  rm -f "$CAND_TMP"; exit 0
fi
echo "生成対象: ${NCAND}件"

START_ORDER=$(python3 -c "import json;print(json.load(open('$CAND_TMP'))['startOrder'])")
IMPORTED=0

# ── 3. 1件ずつ生成→登録 ───────────────────────────────────────
for i in $(seq 0 $((NCAND-1))); do
  ENTRY=$(python3 -c "import json;print(json.dumps(json.load(open('$CAND_TMP'))['candidates'][$i], ensure_ascii=False))")
  SLUG=$(echo "$ENTRY" | python3 -c "import json,sys;print(json.load(sys.stdin)['slug'])")
  TITLE=$(echo "$ENTRY" | python3 -c "import json,sys;print(json.load(sys.stdin)['title'])")
  ORDER=$((START_ORDER + i))
  echo ""
  echo "--- [$((i+1))/${NCAND}] $SLUG 生成中 ---"

  PROMPT_FILE=$(mktemp /tmp/cmp_prompt_XXXX.txt)
  ENTRY_JSON="$ENTRY" python3 - > "$PROMPT_FILE" << 'PYEOF'
import json, os
e = json.loads(os.environ['ENTRY_JSON'])
svcs = e['services']
svc_list = ' / '.join(svcs)
print(f"""AWSサービス比較記事のコンテンツをJSONで生成してください。以下は確定情報（変更しない）:
- 比較対象サービス: {svc_list}
- タイトル: {e['title']}
- カテゴリ: {e['category']}
- 公式ドキュメント: {', '.join(e.get('docUrls', []))}

AWS認定試験の受験者向けに、正確・簡潔な日本語で以下を作成:
- intro: この比較の概要と「本質的に何が違うか」を120〜200字。
- axes: 比較の軸を6〜8個。各軸 {{"axis":"軸名","values":{{ <各サービス名>: "その軸での説明40〜80字" }}}}。
  軸の例: 用途 / データの持ち方・構造 / アクセス方式 / スケーラビリティ / 性能特性 / 耐久性・可用性 / 料金モデル / 代表ユースケース。
  values のキーは次のサービス名を“厳密に”使う: {json.dumps(svcs, ensure_ascii=False)}
- useCases: 「こういう時はこれ」を3〜5個。各 {{"scenario":"状況40〜80字","recommend":"<サービス名>","why":"理由40〜100字"}}。recommend は上記サービス名のいずれか。
- examPoints: AWS認定試験での狙われ方・ひっかけポイントを150〜250字。

【最重要】正確性。誤った仕様・存在しない機能・古い情報を書かない。不確実な点は一般的で確実な記述に留める。

出力: JSONのみ。前置き・コードブロック不要。
{{"intro":"...","axes":[{{"axis":"...","values":{{}}}}],"useCases":[{{"scenario":"...","recommend":"...","why":"..."}}],"examPoints":"..."}}""")
PYEOF

  _OUT=$(mktemp /tmp/cmp_out_XXXX); _ERR=$(mktemp /tmp/cmp_err_XXXX)
  CLAUDE_CODE_MAX_OUTPUT_TOKENS=32000 "$CLAUDE_CMD" -p --model sonnet --tools "" < "$PROMPT_FILE" > "$_OUT" 2> "$_ERR"
  AI_EXIT=$?
  RESULT=$(cat "$_OUT"); ERROUT=$(cat "$_ERR")
  rm -f "$_OUT" "$_ERR" "$PROMPT_FILE"

  if echo "$ERROUT" | grep -qiE "rate.?limit|too many requests|overload|quota|usage limit|529"; then
    echo "⚠️  レート制限を検出。中断（成果はDB反映済み）"
    _r=$(echo "$RESULT $ERROUT" | python3 -c "import sys,re;m=re.search(r'resets\s+\d',sys.stdin.read());print('hit')" 2>/dev/null)
    break
  fi
  if [ $AI_EXIT -ne 0 ]; then
    echo "⚠️  claude エラー(exit=$AI_EXIT)。この件をスキップ: $(echo "$ERROUT" | head -1)"; continue
  fi

  # JSON抽出＋確定フィールドとマージ→DynamoDB put-item（ネストL/M対応）
  ENTRY_JSON="$ENTRY" ORDER_VAL="$ORDER" TABLE="$TABLE" AWS_BIN="$AWS" \
  python3 - "$RESULT" << 'PYEOF'
import json, os, re, sys, subprocess
from datetime import datetime, timezone

raw = sys.argv[1]
# コードフェンス除去＋最初のJSONオブジェクト抽出
m = re.search(r'```(?:json)?\s*(\{)', raw, re.DOTALL)
text = raw[m.start(1):] if m else raw
start = text.find('{')
if start == -1:
    print('  ❌ JSON抽出失敗'); sys.exit(0)
try:
    gen, _ = json.JSONDecoder().raw_decode(text, start)
except Exception as ex:
    print(f'  ❌ JSONパース失敗: {ex}'); sys.exit(0)

e = json.loads(os.environ['ENTRY_JSON'])
for k in ('intro', 'axes', 'useCases', 'examPoints'):
    if not gen.get(k):
        print(f'  ❌ 生成物に {k} が無い。スキップ'); sys.exit(0)

now = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
item = {
    'slug': e['slug'], 'title': e['title'], 'category': e['category'],
    'services': e['services'], 'examTypes': e.get('examTypes', []),
    'docUrls': e.get('docUrls', []),
    'intro': gen['intro'], 'axes': gen['axes'],
    'useCases': gen['useCases'], 'examPoints': gen['examPoints'],
    'isActive': True, 'order': int(os.environ['ORDER_VAL']), 'createdAt': now,
}

def to_ddb(v):
    if isinstance(v, bool): return {'BOOL': v}
    if isinstance(v, (int, float)): return {'N': str(v)}
    if isinstance(v, str): return {'S': v}
    if isinstance(v, list): return {'L': [to_ddb(x) for x in v]}
    if isinstance(v, dict): return {'M': {k: to_ddb(x) for k, x in v.items()}}
    return {'S': str(v)}

ddb_item = {k: to_ddb(v) for k, v in item.items()}
r = subprocess.run([os.environ['AWS_BIN'], 'dynamodb', 'put-item',
    '--table-name', os.environ['TABLE'], '--item', json.dumps(ddb_item, ensure_ascii=False)],
    capture_output=True, text=True)
if r.returncode == 0:
    print(f"  ✓ 登録: {e['slug']}（axes {len(gen['axes'])} / useCases {len(gen['useCases'])}）")
    print('__OK__')
else:
    print(f"  ❌ put-item失敗: {r.stderr.strip()[:160]}")
PYEOF
  if [ $? -eq 0 ]; then IMPORTED=$((IMPORTED+1)); fi
done

rm -f "$CAND_TMP"
echo ""
echo "=========================================="
echo "生成完了: 登録試行 ${IMPORTED}件 / $(date)"
echo "レビュー: aws dynamodb scan --table-name Comparisons で内容確認"
echo "=========================================="
