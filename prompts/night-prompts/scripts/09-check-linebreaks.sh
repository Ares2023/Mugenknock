#!/bin/bash
# 改行チェック（軽量モデル / Haiku）
#
# 目的: 検証(02)から体裁fixを外した分の「可読性」をここで低コストに担保する。
#   問題文・解説・選択肢別解説(choiceExplanations)の「列挙/番号手順/選択肢ごと」の
#   改行だけを Haiku で整える。選択肢(choices)・正解(correctAnswers)・indices 等の
#   採点に関わる項目には一切触れない。
#
# 安全性: モデルが内容を書き換えないよう、fix適用前に「非空白文字が1文字も変化していない
#   （＝空白・改行の増減のみ）」を決定的に検証する。合致しない変更は破棄する。この機械的ガードに
#   より、軽量モデルでも内容改変（誤字・意味変化・正解露出）を構造的に防ぐ。
#
# 対象選定: linebreakCheckedAt 未設定を優先し、以降は古い順（validityCheckedAt と同じ回転方式）。
#   action=ok  → linebreakCheckedAt のみ更新
#   action=fix → 変更フィールド（改行のみ）を上書き＋linebreakCheckedAt/updatedAt 更新

set -uo pipefail

export PATH="/home/yuzuki/local/bin:/home/sera/.config/nvm/versions/node/v20.20.2/bin:$PATH"
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

_d="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
while [ "$(basename "$_d")" != "scripts" ] && [ "$_d" != "/" ]; do _d="$(dirname "$_d")"; done
NIGHT_PROMPTS_DIR="$(dirname "$_d")"
LOG_DIR="$NIGHT_PROMPTS_DIR/logs"
mkdir -p "$LOG_DIR"
DATE=$(date '+%Y%m%d_%H%M%S')
LOG_FILE="$LOG_DIR/linebreak_${DATE}.log"

show_help() {
  cat << 'EOF'
usage: 09-check-linebreaks.sh [-n N] [-c C] [-D HH:MM] [-h]

  -n N       処理問題数 (default: 20)
  -c C       1チャンクあたりの問題数 (default: 6)
  -D HH:MM   処理終了時刻 (JST)。この時刻を過ぎたチャンクはスキップ
  -h         このヘルプ

  軽量モデル(Haiku)で問題文・解説・選択肢別解説の改行だけを整える。
  非空白文字の変化を伴う修正は決定的ガードで破棄する（内容は不変）。
EOF
}

BATCH_SIZE=20
CHUNK_SIZE=6
DEADLINE=""
while getopts "n:c:D:h" opt; do
  case "$opt" in
    n) BATCH_SIZE="$OPTARG" ;;
    c) CHUNK_SIZE="$OPTARG" ;;
    D) DEADLINE="$OPTARG" ;;
    h) show_help; exit 0 ;;
    *) show_help; exit 1 ;;
  esac
done

DEADLINE_EPOCH=0
if [ -n "$DEADLINE" ]; then
  DEADLINE_EPOCH=$(python3 - "$DEADLINE" << 'PYEOF'
import sys
from datetime import datetime, timedelta, timezone
JST = timezone(timedelta(hours=9))
now = datetime.now(JST)
try:
    h, m = map(int, sys.argv[1].split(':'))
    t = now.replace(hour=h, minute=m, second=0, microsecond=0)
    if t <= now:
        t = t + timedelta(days=1)
    print(int(t.timestamp()))
except Exception as e:
    print(f"❌ -D のパースエラー: {e}", file=sys.stderr); print(0)
PYEOF
)
fi

{
echo "=========================================="
echo "改行チェック(軽量モデル) 開始: $(date)"
echo "対象: ${BATCH_SIZE}問 / チャンク: ${CHUNK_SIZE}問${DEADLINE:+ / 終了時刻=$DEADLINE}"
echo "=========================================="

# ── 1. DynamoDB から問題を取得 ──────────────────────────────────
DYNAMO_TMP=$(mktemp /tmp/linebreak_dynamo_XXXX.json)
if ! aws dynamodb scan --table-name Questions --output json > "$DYNAMO_TMP" 2>&1; then
  echo "❌ DynamoDB scan 失敗:"; head -5 "$DYNAMO_TMP"; rm -f "$DYNAMO_TMP"; exit 1
fi
if [ ! -s "$DYNAMO_TMP" ]; then
  echo "❌ DynamoDB scan: レスポンスが空です（ネットワーク障害の可能性）"; rm -f "$DYNAMO_TMP"; exit 1
fi

QUESTIONS_JSON=$(BATCH_SIZE=$BATCH_SIZE DYNAMO_TMP="$DYNAMO_TMP" python3 << 'PYEOF'
import json, os, sys
from datetime import datetime, timezone

AWS_EXAM_TYPES = {'CLF','AIF','SAA','DVA','SOA','DEA','MLA','SAP','DOP','AIP','ANS','SCS','ML','DB','NW'}

with open(os.environ['DYNAMO_TMP']) as f:
    content = f.read()
try:
    data = json.loads(content)
except json.JSONDecodeError as e:
    sys.stderr.write(f"❌ JSON パース失敗: {e}\n"); sys.exit(1)

def deser(v):
    if 'S' in v: return v['S']
    if 'N' in v: return float(v['N']) if '.' in v['N'] else int(v['N'])
    if 'BOOL' in v: return v['BOOL']
    if 'L' in v: return [deser(i) for i in v['L']]
    if 'M' in v: return {k: deser(vv) for k, vv in v['M'].items()}
    return None

EPOCH_ZERO = datetime(1970, 1, 1, tzinfo=timezone.utc)
candidates = []
for item in data.get('Items', []):
    et = item.get('examType', {}).get('S', '')
    if et and et not in AWS_EXAM_TYPES:
        continue
    q = {k: deser(v) for k, v in item.items()}
    if q.get('isHidden'):
        continue
    if not q.get('questionText'):
        continue
    checked = q.get('linebreakCheckedAt')
    sk = EPOCH_ZERO
    try:
        if checked:
            sk = datetime.fromisoformat(str(checked).replace('Z', '+00:00'))
    except Exception:
        pass
    candidates.append((sk, q))

candidates.sort(key=lambda x: x[0])
batch = int(os.environ.get('BATCH_SIZE', 40))
selected = [q for _, q in candidates[:batch]]
print(json.dumps(selected, ensure_ascii=False))
PYEOF
)
rm -f "$DYNAMO_TMP"

COUNT=$(echo "$QUESTIONS_JSON" | python3 -c "import json,sys; print(len(json.load(sys.stdin)))" 2>/dev/null || echo 0)
echo "対象: ${COUNT}問"
if [ "$COUNT" -eq 0 ]; then
  echo "対象なし"; exit 0
fi

# ── 2. チャンク分割 ──────────────────────────────────────────────
CHUNKS_DIR=$(mktemp -d /tmp/linebreak_chunks_XXXX)
QUESTIONS_TMP=$(mktemp /tmp/linebreak_qs_XXXX.json)
echo "$QUESTIONS_JSON" > "$QUESTIONS_TMP"
CHUNK_COUNT=$(QUESTIONS_FILE="$QUESTIONS_TMP" CHUNK_SIZE=$CHUNK_SIZE CHUNKS_DIR="$CHUNKS_DIR" python3 << 'PYEOF'
import json, os
with open(os.environ['QUESTIONS_FILE']) as f:
    qs = json.load(f)
cs = int(os.environ['CHUNK_SIZE'])
for i in range(0, len(qs), cs):
    with open(f"{os.environ['CHUNKS_DIR']}/{i//cs:04d}.json", 'w') as f:
        json.dump(qs[i:i+cs], f, ensure_ascii=False)
print((len(qs) + cs - 1) // cs)
PYEOF
)
rm -f "$QUESTIONS_TMP"
echo "チャンク数: ${CHUNK_COUNT}"

# ── 3. チャンクごとに Haiku → 即DB更新 ──────────────────────────
TOTAL_OK=0
TOTAL_FIX=0
RATE_LIMITED=0

for chunk_file in "$CHUNKS_DIR"/*.json; do
  [ -e "$chunk_file" ] || continue

  if [ "$DEADLINE_EPOCH" -gt 0 ] && [ "$(date +%s)" -ge "$DEADLINE_EPOCH" ]; then
    echo ""; echo "⏰ 終了時刻 ${DEADLINE} を過ぎたため残りチャンクをスキップ"; break
  fi

  CHUNK_IDX=$(basename "$chunk_file" .json | sed 's/^0*//'); CHUNK_IDX=${CHUNK_IDX:-0}
  N_IN_CHUNK=$(python3 -c "import json,sys;print(len(json.load(open(sys.argv[1]))))" "$chunk_file" 2>/dev/null || echo 0)
  echo ""; echo "--- チャンク $((CHUNK_IDX+1))/${CHUNK_COUNT}: ${N_IN_CHUNK}問  開始=$(date '+%H:%M:%S') ---"

  PROMPT_FILE=$(mktemp /tmp/linebreak_prompt_XXXX.txt)
  python3 - "$chunk_file" > "$PROMPT_FILE" << 'PYEOF'
import json, sys
with open(sys.argv[1]) as f:
    questions = json.load(f)

HEADER = (
'あなたは日本語テキストの整形担当です。以下のAWS試験問題について、「問題文・解説・選択肢別解説」の\n'
'読みやすさのための改行だけを調整してください。\n'
'\n'
'【厳守】空白以外の文字は1文字も追加・削除・変更・並べ替えしないこと。行ってよいのは改行(\\n)や\n'
'空白の挿入・削除のみ。語句の修正・言い換え・要約・句読点の追加は一切禁止。\n'
'\n'
'【改行を入れる箇所】\n'
'- 要件の列挙や番号付き手順（①②③④ / 1. 2. 3. / 箇条書き「・」）が同一行に連続していれば、各項目の前で改行する。\n'
'- 解説(explanation)や選択肢別解説で「選択肢Aは〜」「選択肢Bは〜」と各選択肢の評価が続く場合、各評価の前で改行する。\n'
'- すでに読みやすく改行されていれば action=ok（変更不要）。\n'
'\n'
'【出力形式】次のJSONのみ。説明文・前置き・コードブロックは不要。\n'
'変更するフィールドだけ fix に入れる（改行のみ変えたフィールド）。choiceExplanations を返す場合は全要素を配列で返す。\n'
'{"results":[\n'
'  {"questionId":"...","action":"ok"},\n'
'  {"questionId":"...","action":"fix","fix":{"questionText":"改行調整後","explanation":"改行調整後","choiceExplanations":["...","..."]}}\n'
']}\n'
'\n'
'【対象の問題】'
)

lines = [HEADER]
for i, q in enumerate(questions, 1):
    lines.append(f"\n──── 問題 {i} ────")
    lines.append(f"questionId: {q.get('questionId','')}")
    lines.append(f"questionText: {q.get('questionText','')}")
    exp = q.get('explanation', '')
    if exp:
        lines.append(f"explanation: {exp}")
    ce = q.get('choiceExplanations') or []
    if ce:
        lines.append(f"choiceExplanations（{len(ce)}件・順序と件数は変えないこと）:")
        for j, e in enumerate(ce):
            lines.append(f"  [{j}] {e}")
    lines.append("")
print('\n'.join(lines))
PYEOF

  # claude 呼び出し（軽量モデル）。529 は最大2回リトライ、真のレート制限は中断。
  _OVERLOAD_RETRY=0
  _SKIP_CHUNK=0
  while true; do
    _STDOUT_F=$(mktemp /tmp/linebreak_out_XXXX)
    _STDERR_F=$(mktemp /tmp/linebreak_err_XXXX)
    timeout -k 30 "${CLAUDE_TIMEOUT:-1800}" "$CLAUDE_CMD" -p --model haiku --tools "" < "$PROMPT_FILE" > "$_STDOUT_F" 2> "$_STDERR_F"
    AI_EXIT=$?
    RESULT=$(cat "$_STDOUT_F"); _STDERR=$(cat "$_STDERR_F")
    rm -f "$_STDOUT_F" "$_STDERR_F"

    if [ $AI_EXIT -ne 0 ] && echo "$_STDERR" | grep -q "No such file"; then
      CLAUDE_CMD=$(_find_claude)
      [ -x "${CLAUDE_CMD:-}" ] && RESULT=$(timeout -k 30 "${CLAUDE_TIMEOUT:-1800}" "$CLAUDE_CMD" -p --model haiku --tools "" < "$PROMPT_FILE" 2>/dev/null)
    fi
    if echo "$_STDERR" | grep -qiE "command not found|GEMINI_API_KEY|API.?key"; then
      rm -f "$PROMPT_FILE"; echo "❌ claude 実行エラー（認証/コマンド）。終了します"; exit 1
    fi

    _RESULT_HEAD=$(echo "$RESULT" | head -3)
    if echo "$_STDERR $_RESULT_HEAD" | grep -qiE "529|Overloaded"; then
      if [ $_OVERLOAD_RETRY -lt 2 ]; then
        _OVERLOAD_RETRY=$(( _OVERLOAD_RETRY + 1 ))
        echo "⚠️  サーバー過負荷（529）。60秒後にリトライ（${_OVERLOAD_RETRY}/2）"; sleep 60; continue
      else
        echo "⚠️  529 が続くためチャンク $((CHUNK_IDX+1)) をスキップ"; _SKIP_CHUNK=1; break
      fi
    fi
    if echo "$_STDERR $_RESULT_HEAD" | grep -qiE "rate.?limit|too many requests|quota exceeded|usage limit|resource_exhausted|session.?limit|hit your"; then
      rm -f "$PROMPT_FILE"; echo "⚠️  レート制限を検出。残りチャンクをスキップ"; RATE_LIMITED=1; break 2
    fi
    break
  done
  rm -f "$PROMPT_FILE"
  [ $_SKIP_CHUNK -eq 1 ] && continue
  if [ $AI_EXIT -ne 0 ]; then
    echo "⚠️  チャンク $((CHUNK_IDX+1)) でエラー（exit $AI_EXIT）。スキップ"; continue
  fi

  # JSON 抽出
  RESULT_JSON=$(echo "$RESULT" | python3 -c "
import sys, json, re
text = sys.stdin.read()
start = text.find('{')
if start == -1: print('{}'); exit(0)
try:
    obj, _ = json.JSONDecoder().raw_decode(text, start)
    print(json.dumps(obj) if isinstance(obj, dict) and 'results' in obj else '{}')
except Exception: print('{}')
")

  # ── DB即時更新（非空白文字が不変なフィールドのみ改行を反映）──
  RESULT_JSON_FILE=$(mktemp /tmp/linebreak_result_XXXX.json)
  echo "$RESULT_JSON" > "$RESULT_JSON_FILE"
  CHUNK_STATS=$(python3 - "$RESULT_JSON_FILE" "$chunk_file" << 'PYEOF'
import json, sys, re, subprocess
from datetime import datetime, timezone

with open(sys.argv[1]) as f:
    data = json.load(f)
with open(sys.argv[2]) as f:
    orig = {q['questionId']: q for q in json.load(f)}
results = data.get('results', [])
now = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')

def strip_ws(s):
    return re.sub(r'\s+', '', str(s))

ok_count, fix_count = 0, 0
for r in results:
    qid = r.get('questionId', '')
    if qid not in orig:
        continue
    o = orig[qid]
    action = r.get('action', 'ok')
    fix = r.get('fix', {}) or {}

    update_parts = ['linebreakCheckedAt = :t']
    expr_values = {':t': {'S': now}}
    changed = []
    rejected = []

    if action == 'fix':
        # 問題文・解説（文字列フィールド）: 非空白が不変な場合のみ改行を反映
        for field, key in (('questionText', ':qt'), ('explanation', ':ex')):
            nv = fix.get(field)
            if nv is None:
                continue
            ov = o.get(field, '')
            if str(nv) == str(ov):
                continue
            if strip_ws(nv) != strip_ws(ov):
                rejected.append(field)
                continue
            expr_values[key] = {'S': str(nv)}
            update_parts.append(f'{field} = {key}')
            changed.append(field)

        # choiceExplanations（配列）: 件数一致かつ各要素の非空白が不変な場合のみ反映
        nce = fix.get('choiceExplanations')
        oce = o.get('choiceExplanations') or []
        if nce is not None:
            if not isinstance(nce, list) or len(nce) != len(oce):
                rejected.append('choiceExplanations(件数不一致)')
            elif nce == oce:
                pass
            elif any(strip_ws(a) != strip_ws(b) for a, b in zip(nce, oce)):
                rejected.append('choiceExplanations(内容変化)')
            else:
                expr_values[':ce'] = {'L': [{'S': str(c)} for c in nce]}
                update_parts.append('choiceExplanations = :ce')
                changed.append('choiceExplanations')

    if changed:
        update_parts.append('updatedAt = :u')
        expr_values[':u'] = {'S': now}

    update_expr = 'SET ' + ', '.join(update_parts)
    subprocess.run([
        'aws', 'dynamodb', 'update-item',
        '--table-name', 'Questions',
        '--key', json.dumps({'questionId': {'S': qid}}),
        '--update-expression', update_expr,
        '--expression-attribute-values', json.dumps(expr_values),
    ], capture_output=True)

    if changed:
        fix_count += 1
        print(f'  [FIX ] {qid}: 改行整形 → {", ".join(changed)}')
    else:
        ok_count += 1
    if rejected:
        print(f'  [WARN] {qid}: 内容変化を検出し破棄（改行のみ許可）: {", ".join(rejected)}')

print(f'__STATS__ {ok_count} {fix_count}')
PYEOF
)
  echo "$CHUNK_STATS" | grep -v '^__STATS__'
  _S=$(echo "$CHUNK_STATS" | grep '^__STATS__' | head -1)
  _OK=$(echo "$_S" | awk '{print $2}'); _FX=$(echo "$_S" | awk '{print $3}')
  TOTAL_OK=$((TOTAL_OK + ${_OK:-0}))
  TOTAL_FIX=$((TOTAL_FIX + ${_FX:-0}))
  rm -f "$RESULT_JSON_FILE"
  echo "  終了=$(date '+%H:%M:%S')"
done
rm -rf "$CHUNKS_DIR"

echo ""
echo "=========================================="
echo "改行チェック完了: ok ${TOTAL_OK}問 / 整形 ${TOTAL_FIX}問"
[ "$RATE_LIMITED" -eq 1 ] && echo "※ レート制限により一部未処理（次回実行時に処理）"
echo "終了: $(date)"
} 2>&1 | tee -a "$LOG_FILE"
