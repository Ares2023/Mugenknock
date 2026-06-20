#!/bin/bash
# 問題の体裁のみを修正するスクリプト（軽量版 / haiku使用）
# 妥当性チェックなし。改行・解説フォーマットなど見た目の問題のみを修正する。

set -uo pipefail

export PATH="/home/yuzuki/local/bin:$PATH"
unset ANTHROPIC_API_KEY

_find_claude() {
  [ -x /usr/local/bin/claude ] && { echo /usr/local/bin/claude; return; }
  local _cv; _cv=$(command -v claude 2>/dev/null)
  [ -n "$_cv" ] && [ -x "$_cv" ] && { echo "$_cv"; return; }
}
CLAUDE_CMD=$(_find_claude)
if [ -z "${CLAUDE_CMD:-}" ]; then
  echo "⚠️  claude バイナリ未検出。30秒後にリトライします..." >&2
  sleep 30
  CLAUDE_CMD=$(_find_claude)
fi
if [ -z "${CLAUDE_CMD:-}" ] || [ ! -x "${CLAUDE_CMD:-}" ]; then
  echo "❌ claude コマンドが見つかりません" >&2; exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NIGHT_PROMPTS_DIR="$(dirname "$SCRIPT_DIR")"
LOG_DIR="$NIGHT_PROMPTS_DIR/logs"
mkdir -p "$LOG_DIR"
DATE=$(date '+%Y%m%d_%H%M%S')
LOG_FILE="$LOG_DIR/format_${DATE}.log"

show_help() {
  cat << 'EOF'
usage: 06-fix-format.sh [-n N] [-e EXAM] [-h]

  -n N       処理問題数 (default: 100)
  -e EXAM    資格コードで絞り込み (例: SAA, CLF)
  -h         このヘルプを表示

挙動:
  問題文・解説の体裁のみをチェック・修正する（妥当性は確認しない）
  haiku モデルを使用してトークンコストを削減。
  action=ok  → formatCheckedAt のみ更新
  action=fix → 体裁を修正・updatedAt 更新

チェック対象:
  - questionText の「・」箇条書き前に改行がない
  - 解説が「正解：\n...\n\n...\n選択肢Xは...」形式でない
  - 解説に「解説：」ラベルが含まれている
  - choices に「A. 」などの接頭辞が付いている
EOF
}

BATCH_SIZE=100
EXAM_FILTER=""
CHUNK_SIZE=20

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
echo "処理数: ${BATCH_SIZE}問 / チャンク: ${CHUNK_SIZE}問 / モデル: haiku${EXAM_FILTER:+ / 資格: $EXAM_FILTER}"
echo "=========================================="

# ── 1. DynamoDBから問題を取得 ──────────────────────────────────
DYNAMO_TMP=$(mktemp /tmp/dynamo_XXXX.json)
if [ -n "$EXAM_FILTER" ]; then
  aws dynamodb scan \
    --table-name Questions \
    --filter-expression "examType = :et" \
    --expression-attribute-values "{\":et\":{\"S\":\"$EXAM_FILTER\"}}" \
    --output json 2>/dev/null > "$DYNAMO_TMP"
else
  aws dynamodb scan --table-name Questions --output json 2>/dev/null > "$DYNAMO_TMP"
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
batch = int(os.environ.get('BATCH_SIZE', 100))
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

# ── 前処理: choices のラベル接頭辞自動除去（Claude 不要・確定的修正） ──
echo "前処理: choices ラベル接頭辞チェック..."
_PRE_TMP=$(mktemp /tmp/format_pre_XXXX.json)
echo "$QUESTIONS_JSON" > "$_PRE_TMP"
QUESTIONS_JSON=$(QS_FILE="$_PRE_TMP" python3 << 'PYEOF'
import json, sys, re, subprocess, tempfile, os
from datetime import datetime, timezone

label_re = re.compile(r'^[A-E][.\s:：]\s+', re.IGNORECASE)
with open(os.environ['QS_FILE']) as f:
    data = json.load(f)
AWS_CMD = 'aws'
now = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')

fixed = 0
clean_data = []
for q in data:
    choices = q.get('choices', [])
    if not any(label_re.match(str(c)) for c in choices):
        clean_data.append(q)
        continue
    clean_choices = [label_re.sub('', str(c)).strip() for c in choices]
    q['choices'] = clean_choices
    clean_data.append(q)
    af = tempfile.mktemp(suffix='.json', prefix='/tmp/pre_fix_')
    with open(af, 'w') as f:
        json.dump({':c': {'L': [{'S': c} for c in clean_choices]}, ':u': {'S': now}}, f, ensure_ascii=False)
    r = subprocess.run([AWS_CMD, 'dynamodb', 'update-item',
        '--table-name', 'Questions',
        '--key', json.dumps({'questionId': {'S': q['questionId']}}),
        '--update-expression', 'SET choices = :c, updatedAt = :u',
        '--expression-attribute-values', f'file://{af}',
        '--output', 'json'], capture_output=True, text=True)
    os.unlink(af)
    if r.returncode == 0:
        fixed += 1
        print(f"  ✓ {q['questionId']}: choices ラベル接頭辞除去", file=sys.stderr)
    else:
        print(f"  ❌ {q['questionId']}: choices 更新失敗", file=sys.stderr)
if fixed > 0:
    print(f"  前処理完了: choices ラベル自動除去 {fixed}件", file=sys.stderr)
else:
    print(f"  前処理: ラベル接頭辞なし（全問クリーン）", file=sys.stderr)
print(json.dumps(clean_data))
PYEOF
)
rm -f "$_PRE_TMP"

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

# ── 3. チャンクごとにClaude(haiku) → 即DB更新 ────────────────
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

# ── コンパクトプロンプト（トークン節約） ──────────────────────
prompt = '''\
体裁のみチェック（内容・妥当性の確認不要）。以下ルールに違反していればfixで修正。

ルール:
1. questionText: 「・」の直前に\nがなければ追加
2. choices: 「A. 」等のラベル接頭辞を含まないこと
3. explanation: 「正解：」「解説：」等のラベルで始まらないこと。理由・根拠から書き始める
4. choiceExplanations が present で choices と長さ不一致 → fix で choices に合わせて再生成
   （正解選択肢: なぜ正解か。不正解選択肢: なぜ不正解か。文頭に判定文を入れない）

JSONのみ出力。前置き不要。
{"results":[
  {"questionId":"...","action":"ok"},
  {"questionId":"...","action":"fix","fix":{"explanation":"修正後（変更フィールドのみ）","choiceExplanations":["選択肢0","..."]}}
]}

問題リスト（Q=問題文 C=選択肢リスト ANS=正解テキスト E=解説 CE=選択肢別解説）:
'''

lines = [prompt]
for q in questions:
    qid = q['questionId']
    choices = q.get('choices', [])
    correct = q.get('correctAnswers', [])
    # 正解の選択肢ラベルを付ける
    ans_labels = []
    for ca in correct:
        if ca in choices:
            ans_labels.append(f"{LABELS[choices.index(ca)]}:{ca}")
    exp = q.get('explanation', '').replace('\n', '\\n')
    qt  = q.get('questionText', '').replace('\n', '\\n')
    ce  = q.get('choiceExplanations', [])
    # 選択肢は番号なしでスラッシュ区切り（ラベルはAIが0始まりで付ける）
    c_str = ' / '.join(choices)
    ans_str = ', '.join(ans_labels)
    ce_str = f"CE({len(ce)}件)" if ce and len(ce) == len(choices) else f"CE:なし/不一致({len(ce)}件≠{len(choices)}個)"
    lines.append(f"[{qid}] Q:{qt} | C:{c_str} | ANS:{ans_str} | E:{exp} | {ce_str}")

print('\n'.join(lines))
PYEOF

  _STDOUT_F=$(mktemp /tmp/claude_out_XXXX)
  _STDERR_F=$(mktemp /tmp/claude_err_XXXX)
  "$CLAUDE_CMD" --model haiku -p < "$PROMPT_FILE" > "$_STDOUT_F" 2> "$_STDERR_F"
  AI_EXIT=$?
  RESULT=$(cat "$_STDOUT_F")
  _STDERR=$(cat "$_STDERR_F")
  rm -f "$_STDOUT_F" "$_STDERR_F"

  # npm更新による一時的なバイナリ消失 → 再探索してリトライ
  if [ $AI_EXIT -ne 0 ] && echo "$_STDERR" | grep -q "No such file"; then
    CLAUDE_CMD=$(_find_claude)
    if [ -x "${CLAUDE_CMD:-}" ]; then
      _STDOUT_F=$(mktemp /tmp/claude_out_XXXX)
      _STDERR_F=$(mktemp /tmp/claude_err_XXXX)
      "$CLAUDE_CMD" --model haiku -p < "$PROMPT_FILE" > "$_STDOUT_F" 2> "$_STDERR_F"
      AI_EXIT=$?
      RESULT=$(cat "$_STDOUT_F")
      _STDERR=$(cat "$_STDERR_F")
      rm -f "$_STDOUT_F" "$_STDERR_F"
    fi
  fi
  rm -f "$PROMPT_FILE"

  if echo "$_STDERR" | grep -qiE "command not found|No such file|GEMINI_API_KEY|API.?key"; then
    echo "❌ claude 実行エラー。スクリプトを終了します"
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

        if fix.get('choiceExplanations'):
            eff_choices = fix.get('choices', orig.get('choices', []))
            if len(fix['choiceExplanations']) == len(eff_choices) and fix['choiceExplanations'] != orig.get('choiceExplanations'):
                update_parts.append('choiceExplanations = :ce')
                expr_values[':ce'] = {'L': [{'S': str(c)} for c in fix['choiceExplanations']]}
                changed_fields.append('choiceExplanations')

        update_expr = f'SET {", ".join(update_parts)}'
        subprocess.run([
            'aws', 'dynamodb', 'update-item',
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
            'aws', 'dynamodb', 'update-item',
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
