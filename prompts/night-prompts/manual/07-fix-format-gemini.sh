#!/bin/bash
# 問題の体裁のみを修正するスクリプト
# 妥当性チェックなし。改行・解説フォーマットなど見た目の問題のみを修正する。

set -uo pipefail

_find_kilo() {
  local _p=/home/yuzuki/.npm-global/bin/kilo
  [ -x "$_p" ] && { echo "$_p"; return; }
  command -v kilo 2>/dev/null
}
KILO_CMD=$(_find_kilo)
if [ -z "${KILO_CMD:-}" ]; then
  echo "❌ kilo コマンドが見つかりません" >&2; exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NIGHT_PROMPTS_DIR="$(dirname "$SCRIPT_DIR")"
LOG_DIR="$NIGHT_PROMPTS_DIR/logs"
mkdir -p "$LOG_DIR"
DATE=$(date '+%Y%m%d_%H%M%S')
LOG_FILE="$LOG_DIR/format_${DATE}.log"

show_help() {
  cat << 'EOF'
usage: 07-fix-format-gemini.sh [-n N] [-e EXAM] [-h]

  -n N       処理問題数 (default: 10)
  -e EXAM    資格コードで絞り込み (例: SAA, CLF)
  -h         このヘルプを表示
EOF
}

BATCH_SIZE=10
EXAM_FILTER=""
CHUNK_SIZE=10

while [[ $# -gt 0 ]]; do
  case "$1" in
    -n) BATCH_SIZE="${2:?-n requires N}"; shift 2 ;;
    -e) EXAM_FILTER="${2:?-e requires EXAM}"; shift 2 ;;
    -h|--help) show_help; exit 0 ;;
    *) echo "不明なオプション: $1" >&2; show_help >&2; exit 1 ;;
  esac
done


{
echo "=========================================="
echo "体裁チェック開始: $(date)"
echo "処理数: ${BATCH_SIZE}問 / チャンク: ${CHUNK_SIZE}問${EXAM_FILTER:+ / 資格: $EXAM_FILTER}"
echo "=========================================="

# ── 1. DynamoDBから問題を取得 ──────────────────────────────────
AWS_CMD=/home/yuzuki/local/bin/aws
DYNAMO_TMP=$(mktemp /tmp/dynamo_XXXX.json)
if [ -n "$EXAM_FILTER" ]; then
  $AWS_CMD dynamodb scan \
    --table-name Questions \
    --filter-expression "examType = :et" \
    --expression-attribute-values "{\":et\":{\"S\":\"$EXAM_FILTER\"}}" \
    --output json 2>/dev/null > "$DYNAMO_TMP"
else
  $AWS_CMD dynamodb scan --table-name Questions --output json 2>/dev/null > "$DYNAMO_TMP"
fi

QUESTIONS_JSON=$(BATCH_SIZE=$BATCH_SIZE DYNAMO_TMP="$DYNAMO_TMP" python3 << 'PYEOF'
import json, os
from datetime import datetime, timezone

with open(os.environ['DYNAMO_TMP']) as f:
    data = json.load(f)
items = data.get('Items', [])

def deser(v):
    if 'S' in v: return v['S']
    if 'N' in v: return float(v['N']) if '.' in v['N'] else int(v['N'])
    if 'BOOL' in v: return v['BOOL']
    if 'L' in v: return [deser(i) for i in v['L']]
    if 'M' in v: return {k: deser(vv) for k, vv in v['M'].items()}
    return None

questions = [{ k: deser(v) for k, v in item.items() } for item in items]

EPOCH_ZERO = datetime(1970, 1, 1, tzinfo=timezone.utc)
candidates = []
for q in questions:
    if q.get('isHidden'):
        continue
    checked = q.get('formatCheckedAt')
    sort_key = EPOCH_ZERO
    try:
        if checked:
            sort_key = datetime.fromisoformat(checked.replace('Z', '+00:00'))
    except:
        pass
    candidates.append((sort_key, q))

candidates.sort(key=lambda x: x[0])
batch = int(os.environ.get('BATCH_SIZE', 50))
print(json.dumps([q for _, q in candidates[:batch]]))
PYEOF
)
rm -f "$DYNAMO_TMP"

COUNT=$(echo "$QUESTIONS_JSON" | python3 -c "import json,sys; print(len(json.load(sys.stdin)))" 2>/dev/null || echo 0)
echo "対象: ${COUNT}問"

if [ "$COUNT" -eq 0 ]; then
  echo "対象なし。終了します。"
  exit 0
fi

# ── 2. チャンクに分割 ──────────────────────────────────────────
CHUNKS_DIR=$(mktemp -d /tmp/format_chunks_XXXX)
QUESTIONS_TMP=$(mktemp /tmp/format_qs_XXXX.json)
echo "$QUESTIONS_JSON" > "$QUESTIONS_TMP"
CHUNK_COUNT=$(QUESTIONS_FILE="$QUESTIONS_TMP" CHUNK_SIZE=$CHUNK_SIZE CHUNKS_DIR="$CHUNKS_DIR" python3 << 'PYEOF'
import json, os
with open(os.environ['QUESTIONS_FILE']) as f:
    qs = json.load(f)
cs = int(os.environ['CHUNK_SIZE'])
for i in range(0, len(qs), cs):
    chunk = qs[i:i+cs]
    idx = i // cs
    with open(f"{os.environ.get('CHUNKS_DIR', '/tmp')}/{idx:04d}.json", 'w') as f:
        json.dump(chunk, f)
print((len(qs) + cs - 1) // cs)
PYEOF
)
rm -f "$QUESTIONS_TMP"
echo "チャンク数: ${CHUNK_COUNT}"

# ── 3. チャンクごとにClaude → 即DB更新 ──────────────────────────
TOTAL_OK=0
TOTAL_FIX=0

for chunk_file in "$CHUNKS_DIR"/*.json; do
  [ -e "$chunk_file" ] || continue

  CHUNK_NUM=$(python3 -c "import json,sys; print(len(json.load(open(sys.argv[1]))))" "$chunk_file" 2>/dev/null || echo 0)
  CHUNK_IDX=$(basename "$chunk_file" .json | sed 's/^0*//')
  CHUNK_IDX=${CHUNK_IDX:-0}
  _CHUNK_T0=$(date +%s)
  echo ""
  echo "--- チャンク $((CHUNK_IDX+1))/${CHUNK_COUNT}: ${CHUNK_NUM}問  開始=$(date '+%H:%M:%S') ---"

  PROMPT_FILE=$(mktemp /tmp/format_prompt_XXXX.txt)
  python3 - "$chunk_file" > "$PROMPT_FILE" << 'PYEOF'
import json, sys

with open(sys.argv[1]) as f:
    questions = json.load(f)

LABELS = ['A', 'B', 'C', 'D', 'E']

prompt = '''\
あなたはAWS認定試験問題の体裁チェッカーです。
問題の正しさ・妥当性は一切確認しません。以下の体裁ルールのみをチェックし、違反があれば修正してください。

【体裁ルール】

■ questionText（問題文）
1. 「・」で始まる箇条書き行の前には必ず改行（\\n）を入れること
   - NG: 「以下の条件があります。・条件1・条件2」
   - OK: 「以下の条件があります。\\n・条件1\\n・条件2」
2. 意味の区切り（要件列挙の前、補足説明の前など）には適切に改行を入れること

■ explanation（解説）
以下の形式に厳密に従うこと：

  正解：\\n[正解選択肢のテキスト（choicesの完全一致テキスト）]。\\n\\n[正解理由の説明]。\\n選択肢Aは[不正解理由]。\\n選択肢Bは[不正解理由]。\\n選択肢Dは[不正解理由]。

ルール：
- 先頭は必ず「正解：\\n」で始めること
- 「解説：」「解説」などのラベルは一切含めないこと
- 正解選択肢テキストの後に空行（\\n\\n）を1つ入れること
- 不正解の選択肢の説明は「選択肢Xは」で始め、各選択肢を \\n で区切ること
- 選択肢ラベルは choices の並び順（A=0番目, B=1番目, …）で付けること

■ その他
- choicesの各テキストは「A. 」「B. 」などの接頭辞を含めないこと

【アクション】
- "ok": 体裁の問題なし
- "fix": 体裁を修正（修正する項目のみ含める）

【出力形式】JSONのみ出力。説明・前置き不要。

{"results":[
  {"questionId":"...","action":"ok"},
  {"questionId":"...","action":"fix","fix":{"questionText":"修正後（変更する場合のみ）","choices":["A","B","C","D"],"explanation":"修正後解説"}}
]}

【問題リスト】
'''

lines = [prompt]
for q in questions:
    qid = q['questionId']
    choices = q.get('choices', [])
    labeled = [f"{LABELS[i]}. {c}" for i, c in enumerate(choices)]
    correct = q.get('correctAnswers', [])
    correct_labels = []
    for ca in correct:
        if ca in choices:
            correct_labels.append(f"{LABELS[choices.index(ca)]}. {ca}")
    lines.append(f"ID: {qid}")
    lines.append(f"問題文: {q.get('questionText', '')}")
    lines.append(f"選択肢: {' / '.join(labeled)}")
    lines.append(f"正解: {', '.join(correct_labels)}")
    lines.append(f"解説: {q.get('explanation', '')}")
    lines.append("")

print('\n'.join(lines))
PYEOF

  _STDOUT_F=$(mktemp /tmp/kilo_out_XXXX)
  _STDERR_F=$(mktemp /tmp/kilo_err_XXXX)
  "$KILO_CMD" -m gemini-1.5-flash-latest < "$PROMPT_FILE" > "$_STDOUT_F" 2> "$_STDERR_F"
  AI_EXIT=$?
  RESULT=$(cat "$_STDOUT_F")
  _STDERR=$(cat "$_STDERR_F")
  rm -f "$_STDOUT_F" "$_STDERR_F" "$PROMPT_FILE"

  if echo "$_STDERR" | grep -qiE "command not found|No such file|API.?key|auth|credential"; then
    echo "❌ Kilo 実行エラー。スクリプトを終了します"
    echo "stderr: $(echo "$_STDERR" | head -3)"
    exit 1
  fi

  if echo "$_STDERR" | grep -qiE "rate.?limit|too many requests|529|quota exceeded|usage limit|resource_exhausted"; then
    echo "⚠️  レート制限を検出。残りチャンクをスキップ"
    break
  fi

  if [ $AI_EXIT -ne 0 ]; then
    echo "⚠️  チャンク $((CHUNK_IDX+1)) でエラー（exit $AI_EXIT）。スキップ"
    echo "stderr: $(echo "$_STDERR" | head -5)"
    continue
  fi

  RESULT_JSON=$(echo "$RESULT" | python3 -c "
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
    print(json.dumps(obj) if 'results' in obj else '{}')
except: print('{}')
")

  RESULT_JSON_FILE=$(mktemp /tmp/format_result_XXXX.json)
  echo "$RESULT_JSON" > "$RESULT_JSON_FILE"
  CHUNK_STATS=$(python3 - "$RESULT_JSON_FILE" "$chunk_file" << 'PYEOF'
import json, sys, subprocess
from datetime import datetime, timezone

with open(sys.argv[1]) as f:
    data = json.load(f)
results = data.get('results', [])
now = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')

with open(sys.argv[2]) as f:
    orig_questions = {q['questionId']: q for q in json.load(f)}

ok_count, fix_count = 0, 0

for r in results:
    qid = r.get('questionId', '')
    action = r.get('action', 'ok')
    fix = r.get('fix', {})
    orig = orig_questions.get(qid, {})

    if action == 'fix' and fix:
        update_parts = ['formatCheckedAt = :t', 'updatedAt = :u']
        expr_values = {':t': {'S': now}, ':u': {'S': now}}
        changed_fields = []

        if fix.get('questionText') and fix['questionText'] != orig.get('questionText'):
            update_parts.append('questionText = :qt')
            expr_values[':qt'] = {'S': fix['questionText']}
            changed_fields.append('questionText')

        if fix.get('choices') and fix['choices'] != orig.get('choices'):
            update_parts.append('choices = :ch')
            expr_values[':ch'] = {'L': [{'S': str(c)} for c in fix['choices']]}
            changed_fields.append('choices')

        if fix.get('explanation') and fix['explanation'] != orig.get('explanation'):
            update_parts.append('explanation = :ex')
            expr_values[':ex'] = {'S': fix['explanation']}
            changed_fields.append('explanation')

        update_expr = f'SET {", ".join(update_parts)}'
        subprocess.run([
            '/home/yuzuki/local/bin/aws', 'dynamodb', 'update-item',
            '--table-name', 'Questions',
            '--key', json.dumps({'questionId': {'S': qid}}),
            '--update-expression', update_expr,
            '--expression-attribute-values', json.dumps(expr_values),
        ], capture_output=True)
        fix_count += 1
        print(f'  [FIX] {qid}: {", ".join(changed_fields) or "(変更なし)"}')
    else:
        update_expr = 'SET formatCheckedAt = :t'
        expr_values = {':t': {'S': now}}
        subprocess.run([
            '/home/yuzuki/local/bin/aws', 'dynamodb', 'update-item',
            '--table-name', 'Questions',
            '--key', json.dumps({'questionId': {'S': qid}}),
            '--update-expression', update_expr,
            '--expression-attribute-values', json.dumps(expr_values),
        ], capture_output=True)
        ok_count += 1
        print(f'  [OK ] {qid}')

print(f'  → 完了: OK={ok_count} 修正={fix_count}')
print(f'__STATS__{ok_count},{fix_count}')
PYEOF
)

  rm -f "$RESULT_JSON_FILE"
  echo "$CHUNK_STATS" | grep -v '^__STATS__'
  STATS_LINE=$(echo "$CHUNK_STATS" | grep '^__STATS__' | sed 's/^__STATS__//')
  if [ -n "$STATS_LINE" ]; then
    _ok=$(echo "$STATS_LINE" | cut -d, -f1)
    _fix=$(echo "$STATS_LINE" | cut -d, -f2)
    TOTAL_OK=$(( TOTAL_OK + _ok ))
    TOTAL_FIX=$(( TOTAL_FIX + _fix ))
  fi
  echo "  終了=$(date '+%H:%M:%S')  経過=$(( $(date +%s) - _CHUNK_T0 ))秒"
done

rm -rf "$CHUNKS_DIR"

echo ""
echo "完了サマリー: 体裁OK=${TOTAL_OK}問 / 修正=${TOTAL_FIX}問"
echo ""
echo "=========================================="
echo "体裁チェック終了: $(date)"
echo "=========================================="

} 2>&1 | tee -a "$LOG_FILE"

find "$LOG_DIR" -name "format_*.log" -mtime +30 -delete