#!/bin/bash
# 英訳チェック・自動補完スクリプト
# 5件ずつチャンク処理し、各チャンク完了後すぐにDBへ反映する

set -uo pipefail

export PATH="/home/yuzuki/.npm-global/bin:/home/yuzuki/local/bin:$PATH"
unset ANTHROPIC_API_KEY

_find_claude() {
  local _p=/home/yuzuki/.npm-global/bin/claude
  [ -x "$_p" ] && { echo "$_p"; return; }
  local _cv; _cv=$(command -v claude 2>/dev/null)
  [ -n "$_cv" ] && [ -x "$_cv" ] && { echo "$_cv"; return; }
  find /home/yuzuki/.npm-global/lib/node_modules/@anthropic-ai \
    -maxdepth 4 -name "claude.exe" -path "*/bin/*" 2>/dev/null | head -1
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
LOG_DIR="$(dirname "$SCRIPT_DIR")/logs"
mkdir -p "$LOG_DIR"
DATE=$(date '+%Y%m%d_%H%M%S')
LOG_FILE="$LOG_DIR/translation_${DATE}.log"

RATE_LIMIT_FILE="$(dirname "$SCRIPT_DIR")/.claude_rate_limit_reset"

check_rate_limit() {
  [ -f "$RATE_LIMIT_FILE" ] || return 0
  local _rst _now _rep _disp
  _rst=$(cat "$RATE_LIMIT_FILE" 2>/dev/null)
  [ -z "$_rst" ] && { rm -f "$RATE_LIMIT_FILE"; return 0; }
  _now=$(date +%s)
  _rep=$(python3 -c "
from datetime import datetime
try: print(int(datetime.fromisoformat('$_rst').timestamp()))
except: print(0)
" 2>/dev/null || echo 0)
  if [ "$_now" -lt "$_rep" ]; then
    _disp=$(python3 -c "
from datetime import datetime, timezone, timedelta
jst = timezone(timedelta(hours=9))
try: print(datetime.fromisoformat('$_rst').astimezone(jst).strftime('%H:%M JST'))
except: print('$_rst')
" 2>/dev/null || echo "$_rst")
    echo "⏸  Claude レート制限中 — 復活予定: ${_disp}（$(basename "$0") をスキップ）"
    exit 2
  fi
  rm -f "$RATE_LIMIT_FILE"
}

record_rate_limit() {
  local _c="$1" _tmp _rst _disp
  _tmp=$(mktemp /tmp/rl_XXXX.txt)
  printf '%s' "$_c" > "$_tmp"
  _rst=$(python3 - "$_tmp" << 'PYEOF'
import sys, re
from datetime import datetime, timezone, timedelta
jst = timezone(timedelta(hours=9))
with open(sys.argv[1]) as f:
    text = f.read()
m = re.search(r'resets\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)', text, re.IGNORECASE)
if not m:
    print((datetime.now(jst) + timedelta(hours=6)).isoformat())
    sys.exit(0)
hour = int(m.group(1))
minute = int(m.group(2)) if m.group(2) else 0
mer = m.group(3).lower()
if mer == 'pm' and hour != 12: hour += 12
elif mer == 'am' and hour == 12: hour = 0
now = datetime.now(jst)
reset_dt = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
if reset_dt <= now:
    reset_dt += timedelta(days=1)
print(reset_dt.isoformat())
PYEOF
)
  rm -f "$_tmp"
  if [ -n "$_rst" ]; then
    echo "$_rst" > "$RATE_LIMIT_FILE"
    _disp=$(python3 -c "
from datetime import datetime, timezone, timedelta
jst = timezone(timedelta(hours=9))
try: print(datetime.fromisoformat('$_rst').astimezone(jst).strftime('%Y-%m-%d %H:%M JST'))
except: print('$_rst')
" 2>/dev/null || echo "$_rst")
    echo "  🔒 レート制限ロックファイル記録: $_disp"
  fi
}

show_help() {
  cat << 'EOF'
usage: check-translation.sh [-n N] [-D HH:MM] [-h]

  -n N       チェック件数 (default: 30)
  -D HH:MM   処理終了時刻 (JST)。この時刻を過ぎたチャンクはスキップ
  -h         このヘルプを表示

挙動:
  未チェック（translationCheckedAt なし）を優先
  全件チェック済みの場合は確認日付が古い順
  対象: Questions / Tips / Releases
EOF
}

BATCH_SIZE=30
CHUNK_SIZE=5
DEADLINE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    -n) BATCH_SIZE="${2:?-n requires N}"; shift 2 ;;
    -D) DEADLINE="${2:?-D requires HH:MM}"; shift 2 ;;
    -h|--help) show_help; exit 0 ;;
    *) echo "不明なオプション: $1" >&2; show_help >&2; exit 1 ;;
  esac
done

# 終了時刻をepoch秒に変換（JST）
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
    print(int(t.timestamp()))
except Exception as e:
    print(f"❌ -D のパースエラー: {e}", file=sys.stderr); print(0)
PYEOF
)
fi

# deadline チェック関数
deadline_passed() {
  [ "$DEADLINE_EPOCH" -gt 0 ] && [ "$(date +%s)" -ge "$DEADLINE_EPOCH" ]
}

{
check_rate_limit
echo "=========================================="
echo "英訳チェック開始: $(date)"
echo "バッチサイズ: ${BATCH_SIZE}件 / チャンクサイズ: ${CHUNK_SIZE}件"
echo "=========================================="

# ── 共通：DynamoDB デシリアライザ（ファイルに書き出して import）──
PY_DESER_FILE=$(mktemp /tmp/deser_XXXX.py)
cat > "$PY_DESER_FILE" << 'PYEOF'
def deser(v):
    if 'S' in v: return v['S']
    if 'N' in v: return float(v['N']) if '.' in str(v['N']) else int(v['N'])
    if 'BOOL' in v: return v['BOOL']
    if 'L' in v: return [deser(i) for i in v['L']]
    if 'M' in v: return {k: deser(vv) for k, vv in v['M'].items()}
    if 'NULL' in v: return None
    return None
PYEOF

# ── 共通：JSON をファイルでチャンク分割 ──────────────────────────
# 環境変数での大きなJSON渡しは "Argument list too long" になるためファイル経由
make_chunks() {
  local items_file="$1"   # JSONファイルパス
  local chunks_dir="$2"
  CHUNK_COUNT=$(python3 - "$items_file" "$chunks_dir" "$CHUNK_SIZE" << 'PYEOF'
import json, sys
with open(sys.argv[1]) as f:
    items = json.load(f)
cs = int(sys.argv[3])
chunks_dir = sys.argv[2]
for i in range(0, len(items), cs):
    with open(f"{chunks_dir}/{i//cs:04d}.json", 'w') as out:
        json.dump(items[i:i+cs], out)
print((len(items) + cs - 1) // cs)
PYEOF
)
}

# ── 共通：Claudeレスポンスから {results:[...]} を抽出 ───────────
extract_results_json() {
  python3 -c "
import sys, json, re
text = sys.stdin.read()
m = re.search(r'\{.*\"results\".*\}', text, re.DOTALL)
if m:
    try: print(json.dumps(json.loads(m.group())))
    except: print('{}')
else: print('{}')
"
}

# ══════════════════════════════════════════════════════════════
# 1. Questions テーブル：英訳チェック
# ══════════════════════════════════════════════════════════════
echo ""
echo "▶ Questions テーブルを処理中..."

DYNAMO_TMP=$(mktemp /tmp/dynamo_q_XXXX.json)
aws dynamodb scan --table-name Questions --output json 2>/dev/null > "$DYNAMO_TMP"

QUESTIONS_FILE=$(mktemp /tmp/questions_batch_XXXX.json)
python3 - "$DYNAMO_TMP" "$PY_DESER_FILE" "$BATCH_SIZE" > "$QUESTIONS_FILE" << 'PYEOF'
import json, sys
from datetime import datetime, timezone

with open(sys.argv[2]) as f: exec(f.read())  # load deser()
with open(sys.argv[1]) as f: data = json.load(f)
questions = [{k: deser(v) for k, v in item.items()} for item in data.get('Items', [])]

EPOCH_ZERO = datetime(1970, 1, 1, tzinfo=timezone.utc)
candidates = []
for q in questions:
    if q.get('isHidden'):
        continue
    checked = q.get('translationCheckedAt')
    if not checked:
        sort_key = EPOCH_ZERO
    else:
        try: sort_key = datetime.fromisoformat(checked.replace('Z', '+00:00'))
        except: sort_key = EPOCH_ZERO
    candidates.append((sort_key, q))

candidates.sort(key=lambda x: x[0])
batch = int(sys.argv[3])
print(json.dumps([q for _, q in candidates[:batch]]))
PYEOF
rm -f "$DYNAMO_TMP"

Q_COUNT=$(python3 -c "import json,sys; print(len(json.load(open(sys.argv[1]))))" "$QUESTIONS_FILE" 2>/dev/null || echo 0)
echo "  チェック対象: ${Q_COUNT}問"

if [ "$Q_COUNT" -gt 0 ]; then
  Q_CHUNKS_DIR=$(mktemp -d /tmp/trans_q_chunks_XXXX)
  make_chunks "$QUESTIONS_FILE" "$Q_CHUNKS_DIR"
  echo "  チャンク数: ${CHUNK_COUNT}"

  Q_RATE_LIMITED=0
  Q_TIMEOUT_HIT=0
  Q_OK=0; Q_FIXED=0; Q_TRANSLATED=0

  for chunk_file in "$Q_CHUNKS_DIR"/*.json; do
    [ -e "$chunk_file" ] || continue

    if deadline_passed; then
      echo "  ⏰ 終了時刻 ${DEADLINE} を過ぎたため、Questionsの残りチャンクをスキップ"
      Q_TIMEOUT_HIT=1; break
    fi

    CHUNK_NUM=$(python3 -c "import json,sys; print(len(json.load(open(sys.argv[1]))))" "$chunk_file" 2>/dev/null || echo 0)
    CHUNK_IDX=$(( 10#$(basename "$chunk_file" .json) ))
    _CHUNK_T0=$(date +%s)
    echo "  チャンク $((CHUNK_IDX+1)): ${CHUNK_NUM}件  開始=$(date '+%H:%M:%S')"

    PROMPT_FILE=$(mktemp /tmp/trans_prompt_XXXX.txt)
    python3 - "$chunk_file" > "$PROMPT_FILE" << 'PYEOF'
import json, sys
with open(sys.argv[1]) as f:
    questions = json.load(f)
lines = ['あなたはAWS認定試験の英訳専門家です。\n以下の問題リストについて英訳の有無・品質を確認し、必要なら修正・新規翻訳してください。\n\n【出力形式】必ず以下のJSONのみで出力してください。余分なテキスト不要。\n{"results":[{"questionId":"...","status":"ok|fixed|translated","questionTextEn":"英文","choicesEn":["A英文","..."],"explanationEn":"解説英文"},...]}  \n\nstatusの意味: ok=既存英訳が正確 / fixed=誤訳修正 / translated=新規作成\n注意: choicesEnは元のchoicesと同じ順序・同じ数にすること\n\n【問題リスト】']
for q in questions:
    lines.append(f"questionId: {q['questionId']}")
    lines.append(f"examType: {q.get('examType','')}")
    lines.append(f"questionText(JA): {q.get('questionText','')}")
    if q.get('questionTextEn'):
        lines.append(f"questionTextEn(現状): {q['questionTextEn']}")
    choices = q.get('choices', [])
    if choices:
        lines.append(f"choices(JA): {' | '.join(str(c) for c in choices)}")
    if q.get('choicesEn'):
        lines.append(f"choicesEn(現状): {' | '.join(str(c) for c in q['choicesEn'])}")
    exp = q.get('explanation', '')
    if exp:
        lines.append(f"explanation(JA): {exp[:400]}")
    if q.get('explanationEn'):
        lines.append(f"explanationEn(現状): {q['explanationEn'][:300]}")
    lines.append("")
print('\n'.join(lines))
PYEOF

    _STDOUT_F=$(mktemp /tmp/claude_out_XXXX)
    _STDERR_F=$(mktemp /tmp/claude_err_XXXX)
    "$CLAUDE_CMD" -p < "$PROMPT_FILE" > "$_STDOUT_F" 2> "$_STDERR_F"
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
        "$CLAUDE_CMD" -p < "$PROMPT_FILE" > "$_STDOUT_F" 2> "$_STDERR_F"
        AI_EXIT=$?
        RESULT=$(cat "$_STDOUT_F")
        _STDERR=$(cat "$_STDERR_F")
        rm -f "$_STDOUT_F" "$_STDERR_F"
      fi
    fi
    rm -f "$PROMPT_FILE"

    # 致命的エラー（認証・コマンド問題）→ 即終了
    if echo "$_STDERR" | grep -qiE "command not found|No such file|GEMINI_API_KEY|API.?key"; then
      echo "  ❌ claude 実行エラー（認証またはコマンド問題）。スクリプトを終了します"
      echo "  stderr: $(echo "$_STDERR" | head -3)"
      exit 1
    fi
    # レート制限 → stderrのみで判定（AI応答テキストのfalse positiveを避けるため）
    if echo "$_STDERR" | grep -qiE "rate.?limit|too many requests|overload|529|quota exceeded|usage limit|resource_exhausted"; then
      echo "  ⚠️  レート制限を検出。Questionsの残りチャンクをスキップ"
      echo "  stderr: $(echo "$_STDERR" | head -3)"
      record_rate_limit "$(echo "${RESULT:-} ${_STDERR:-}" | head -10)"
      Q_RATE_LIMITED=1
      break
    fi
    # その他の非ゼロ終了 → このチャンクのみスキップして続行
    if [ $AI_EXIT -ne 0 ]; then
      echo "  ⚠️  claude 実行エラー (exit=$AI_EXIT)。このチャンクをスキップして続行"
      echo "  stderr: $(echo "$_STDERR" | head -5)"
      continue
    fi

    RESULT_JSON_FILE=$(mktemp /tmp/result_q_XXXX.json)
    echo "$RESULT" | extract_results_json > "$RESULT_JSON_FILE"

    CHUNK_STATS=$(python3 - "$RESULT_JSON_FILE" << 'PYEOF'
import json, sys, subprocess
from datetime import datetime, timezone
with open(sys.argv[1]) as f:
    data = json.load(f)
results = data.get('results', [])
now = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
ok, fixed, translated = 0, 0, 0
for r in results:
    qid = r.get('questionId', '')
    status = r.get('status', 'ok')
    q_en = r.get('questionTextEn', '')
    choices_en = r.get('choicesEn', [])
    exp_en = r.get('explanationEn', '')
    update_expr = 'SET translationCheckedAt = :t'
    expr_values = {':t': {'S': now}}
    if q_en:
        update_expr += ', questionTextEn = :qe'
        expr_values[':qe'] = {'S': q_en}
    if choices_en:
        update_expr += ', choicesEn = :ce'
        expr_values[':ce'] = {'L': [{'S': str(c)} for c in choices_en]}
    if exp_en:
        update_expr += ', explanationEn = :ee'
        expr_values[':ee'] = {'S': exp_en}
    label = {'ok':'OK','fixed':'FIXED','translated':'TRANSLATED'}.get(status, status.upper())
    if status == 'ok': ok += 1
    elif status == 'fixed': fixed += 1
    else: translated += 1
    print(f'    [{label:10}] {qid}')
    subprocess.run([
        'aws', 'dynamodb', 'update-item',
        '--table-name', 'Questions',
        '--key', json.dumps({'questionId': {'S': qid}}),
        '--update-expression', update_expr,
        '--expression-attribute-values', json.dumps(expr_values),
    ], capture_output=True)
print(f'__STATS__{ok},{fixed},{translated}')
PYEOF
)
    rm -f "$RESULT_JSON_FILE"
    echo "$CHUNK_STATS" | grep -v '^__STATS__'
    STATS_LINE=$(echo "$CHUNK_STATS" | grep '^__STATS__' | sed 's/^__STATS__//')
    if [ -n "$STATS_LINE" ]; then
      Q_OK=$(( Q_OK + $(echo "$STATS_LINE" | cut -d, -f1) ))
      Q_FIXED=$(( Q_FIXED + $(echo "$STATS_LINE" | cut -d, -f2) ))
      Q_TRANSLATED=$(( Q_TRANSLATED + $(echo "$STATS_LINE" | cut -d, -f3) ))
    fi
    echo "  終了=$(date '+%H:%M:%S')  経過=$(( $(date +%s) - _CHUNK_T0 ))秒"
  done

  rm -rf "$Q_CHUNKS_DIR"
  echo ""
  echo "  Questions 完了: OK=${Q_OK} / 修正=${Q_FIXED} / 新規翻訳=${Q_TRANSLATED}"

  if [ "${Q_RATE_LIMITED:-0}" -eq 1 ] || [ "${Q_TIMEOUT_HIT:-0}" -eq 1 ]; then
    echo "  レート制限/終了時刻によりTips/Releasesをスキップ"
    rm -f "$QUESTIONS_FILE" "$PY_DESER_FILE"
    exit 1
  fi
fi
rm -f "$QUESTIONS_FILE"

# ══════════════════════════════════════════════════════════════
# 2. Tips テーブル：英訳チェック
# ══════════════════════════════════════════════════════════════
echo ""
echo "▶ Tips テーブルを処理中..."

TIPS_TMP=$(mktemp /tmp/dynamo_tips_XXXX.json)
aws dynamodb scan --table-name Tips --output json 2>/dev/null > "$TIPS_TMP" || { echo "  Tipsテーブル不在"; rm -f "$TIPS_TMP"; }

if [ -f "$TIPS_TMP" ]; then
  TIPS_FILE=$(mktemp /tmp/tips_batch_XXXX.json)
  python3 - "$TIPS_TMP" "$PY_DESER_FILE" "$BATCH_SIZE" > "$TIPS_FILE" << 'PYEOF'
import json, sys
from datetime import datetime, timezone
with open(sys.argv[2]) as f: exec(f.read())  # load deser()
with open(sys.argv[1]) as f: data = json.load(f)
tips = [{k: deser(v) for k, v in item.items()} for item in data.get('Items', [])]
EPOCH_ZERO = datetime(1970, 1, 1, tzinfo=timezone.utc)
candidates = []
for t in tips:
    checked = t.get('translationCheckedAt')
    if not checked:
        sort_key = EPOCH_ZERO
    else:
        try: sort_key = datetime.fromisoformat(checked.replace('Z', '+00:00'))
        except: sort_key = EPOCH_ZERO
    candidates.append((sort_key, t))
candidates.sort(key=lambda x: x[0])
batch = int(sys.argv[3])
print(json.dumps([t for _, t in candidates[:batch]]))
PYEOF
  rm -f "$TIPS_TMP"

  TIPS_COUNT=$(python3 -c "import json,sys; print(len(json.load(open(sys.argv[1]))))" "$TIPS_FILE" 2>/dev/null || echo 0)
  echo "  チェック対象: ${TIPS_COUNT}件"

  if [ "$TIPS_COUNT" -gt 0 ]; then
    T_CHUNKS_DIR=$(mktemp -d /tmp/trans_t_chunks_XXXX)
    make_chunks "$TIPS_FILE" "$T_CHUNKS_DIR"
    echo "  チャンク数: ${CHUNK_COUNT}"

    T_OK=0; T_UPDATED=0
    T_RATE_LIMITED=0
    T_TIMEOUT_HIT=0

    for chunk_file in "$T_CHUNKS_DIR"/*.json; do
      [ -e "$chunk_file" ] || continue

      if deadline_passed; then
        echo "  ⏰ 終了時刻 ${DEADLINE} を過ぎたため、Tipsの残りチャンクをスキップ"
        T_TIMEOUT_HIT=1; break
      fi

      CHUNK_NUM=$(python3 -c "import json,sys; print(len(json.load(open(sys.argv[1]))))" "$chunk_file" 2>/dev/null || echo 0)
      CHUNK_IDX=$(( 10#$(basename "$chunk_file" .json) ))
      _CHUNK_T0=$(date +%s)
      echo "  チャンク $((CHUNK_IDX+1)): ${CHUNK_NUM}件  開始=$(date '+%H:%M:%S')"

      TIPS_PROMPT=$(mktemp /tmp/tips_prompt_XXXX.txt)
      python3 - "$chunk_file" > "$TIPS_PROMPT" << 'PYEOF'
import json, sys
with open(sys.argv[1]) as f:
    tips = json.load(f)
lines = ['AWSクイズアプリのコラム記事の英訳を確認・補完してください。\n既存英訳が正確なら ok、修正・新規翻訳したなら updated を返してください。\n\n【出力形式】JSONのみで出力。\n{"results":[{"tipId":"...","status":"ok|updated","titleEn":"英語タイトル","contentEn":"英語本文"},...]}\n\nstatusの意味: ok=既存英訳が正確 / updated=修正または新規翻訳\n\n【コラムリスト】']
for t in tips:
    lines.append(f"tipId: {t.get('tipId','')}")
    lines.append(f"title(JA): {t.get('title','')}")
    if t.get('titleEn'):
        lines.append(f"titleEn(現状): {t['titleEn']}")
    lines.append(f"content(JA): {t.get('content','')}")
    if t.get('contentEn'):
        lines.append(f"contentEn(現状): {t['contentEn']}")
    lines.append("")
print('\n'.join(lines))
PYEOF

      _STDOUT_F=$(mktemp /tmp/claude_out_XXXX)
      _STDERR_F=$(mktemp /tmp/claude_err_XXXX)
      "$CLAUDE_CMD" -p < "$TIPS_PROMPT" > "$_STDOUT_F" 2> "$_STDERR_F"
      TIPS_EXIT=$?
      TIPS_RESULT=$(cat "$_STDOUT_F")
      _STDERR=$(cat "$_STDERR_F")
      rm -f "$_STDOUT_F" "$_STDERR_F"
      if [ $TIPS_EXIT -ne 0 ] && echo "$_STDERR" | grep -q "No such file"; then
        CLAUDE_CMD=$(_find_claude)
        if [ -x "${CLAUDE_CMD:-}" ]; then
          _STDOUT_F=$(mktemp /tmp/claude_out_XXXX)
          _STDERR_F=$(mktemp /tmp/claude_err_XXXX)
          "$CLAUDE_CMD" -p < "$TIPS_PROMPT" > "$_STDOUT_F" 2> "$_STDERR_F"
          TIPS_EXIT=$?
          TIPS_RESULT=$(cat "$_STDOUT_F")
          _STDERR=$(cat "$_STDERR_F")
          rm -f "$_STDOUT_F" "$_STDERR_F"
        fi
      fi
      rm -f "$TIPS_PROMPT"

      if echo "$_STDERR" | grep -qiE "command not found|No such file|GEMINI_API_KEY|API.?key"; then
        echo "  ❌ claude 実行エラー（認証またはコマンド問題）。スクリプトを終了します"
        echo "  stderr: $(echo "$_STDERR" | head -3)"
        exit 1
      fi
      if echo "$_STDERR" | grep -qiE "rate.?limit|too many requests|overload|529|quota exceeded|usage limit|resource_exhausted"; then
        echo "  ⚠️  レート制限を検出。Tipsの残りチャンクをスキップ"
        echo "  stderr: $(echo "$_STDERR" | head -3)"
        record_rate_limit "$(echo "${TIPS_RESULT:-} ${_STDERR:-}" | head -10)"
        T_RATE_LIMITED=1
        break
      fi
      if [ $TIPS_EXIT -ne 0 ]; then
        echo "  ⚠️  claude 実行エラー (exit=$TIPS_EXIT)。このチャンクをスキップして続行"
        echo "  stderr: $(echo "$_STDERR" | head -5)"
        continue
      fi

      TIPS_RESULT_FILE=$(mktemp /tmp/result_tips_XXXX.json)
      echo "$TIPS_RESULT" | extract_results_json > "$TIPS_RESULT_FILE"

      TIPS_STATS=$(python3 - "$TIPS_RESULT_FILE" << 'PYEOF'
import json, sys, subprocess
from datetime import datetime, timezone
with open(sys.argv[1]) as f:
    data = json.load(f)
results = data.get('results', [])
now = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
ok_count, updated_count = 0, 0
for r in results:
    tid = r.get('tipId', '')
    status = r.get('status', 'updated')
    title_en = r.get('titleEn', '')
    content_en = r.get('contentEn', '')
    if not tid: continue
    if status == 'ok':
        # タイムスタンプのみ更新（コンテンツはそのまま）
        subprocess.run([
            'aws', 'dynamodb', 'update-item',
            '--table-name', 'Tips',
            '--key', json.dumps({'tipId': {'S': tid}}),
            '--update-expression', 'SET translationCheckedAt = :t',
            '--expression-attribute-values', json.dumps({':t': {'S': now}}),
        ], capture_output=True)
        ok_count += 1
        print(f'    [OK        ] {tid}')
    else:
        subprocess.run([
            'aws', 'dynamodb', 'update-item',
            '--table-name', 'Tips',
            '--key', json.dumps({'tipId': {'S': tid}}),
            '--update-expression', 'SET titleEn = :te, contentEn = :ce, translationCheckedAt = :t',
            '--expression-attribute-values', json.dumps({':te':{'S':title_en},':ce':{'S':content_en},':t':{'S':now}}),
        ], capture_output=True)
        updated_count += 1
        print(f'    [UPDATED   ] {tid}')
print(f'__STATS__{ok_count},{updated_count}')
PYEOF
)
      rm -f "$TIPS_RESULT_FILE"
      echo "$TIPS_STATS" | grep -v '^__STATS__'
      STATS_LINE=$(echo "$TIPS_STATS" | grep '^__STATS__' | sed 's/^__STATS__//')
      if [ -n "$STATS_LINE" ]; then
        T_OK=$(( T_OK + $(echo "$STATS_LINE" | cut -d, -f1) ))
        T_UPDATED=$(( T_UPDATED + $(echo "$STATS_LINE" | cut -d, -f2) ))
      fi
      echo "  終了=$(date '+%H:%M:%S')  経過=$(( $(date +%s) - _CHUNK_T0 ))秒"
    done

    rm -rf "$T_CHUNKS_DIR"
    echo ""
    echo "  Tips 完了: OK=${T_OK} / 更新=${T_UPDATED}"

    if [ "${T_RATE_LIMITED:-0}" -eq 1 ] || [ "${T_TIMEOUT_HIT:-0}" -eq 1 ]; then
      echo "  レート制限/終了時刻によりReleasesをスキップ"
      rm -f "$TIPS_FILE" "$PY_DESER_FILE"
      exit 1
    fi
  else
    echo "  すべて英訳済み"
  fi
  rm -f "$TIPS_FILE"
fi

# ══════════════════════════════════════════════════════════════
# 3. Releases テーブル：英訳チェック
# ══════════════════════════════════════════════════════════════
echo ""
echo "▶ Releases テーブルを処理中..."

RELEASES_TMP=$(mktemp /tmp/dynamo_rel_XXXX.json)
aws dynamodb scan --table-name Releases --output json 2>/dev/null > "$RELEASES_TMP" || { echo "  Releasesテーブル不在"; rm -f "$RELEASES_TMP"; }

if [ -f "$RELEASES_TMP" ]; then
  RELEASES_FILE=$(mktemp /tmp/releases_batch_XXXX.json)
  python3 - "$RELEASES_TMP" "$PY_DESER_FILE" "$BATCH_SIZE" > "$RELEASES_FILE" << 'PYEOF'
import json, sys
from datetime import datetime, timezone
with open(sys.argv[2]) as f: exec(f.read())  # load deser()
with open(sys.argv[1]) as f: data = json.load(f)
releases = [{k: deser(v) for k, v in item.items()} for item in data.get('Items', [])]
EPOCH_ZERO = datetime(1970, 1, 1, tzinfo=timezone.utc)
candidates = []
for r in releases:
    checked = r.get('translationCheckedAt')
    if not checked:
        sort_key = EPOCH_ZERO
    else:
        try: sort_key = datetime.fromisoformat(checked.replace('Z', '+00:00'))
        except: sort_key = EPOCH_ZERO
    candidates.append((sort_key, r))
candidates.sort(key=lambda x: x[0])
batch = int(sys.argv[3])
print(json.dumps([r for _, r in candidates[:batch]]))
PYEOF
  rm -f "$RELEASES_TMP"

  REL_COUNT=$(python3 -c "import json,sys; print(len(json.load(open(sys.argv[1]))))" "$RELEASES_FILE" 2>/dev/null || echo 0)
  echo "  チェック対象: ${REL_COUNT}件"

  if [ "$REL_COUNT" -gt 0 ]; then
    R_CHUNKS_DIR=$(mktemp -d /tmp/trans_r_chunks_XXXX)
    make_chunks "$RELEASES_FILE" "$R_CHUNKS_DIR"
    echo "  チャンク数: ${CHUNK_COUNT}"

    R_OK=0; R_UPDATED=0
    R_TIMEOUT_HIT=0

    for chunk_file in "$R_CHUNKS_DIR"/*.json; do
      [ -e "$chunk_file" ] || continue

      if deadline_passed; then
        echo "  ⏰ 終了時刻 ${DEADLINE} を過ぎたため、Releasesの残りチャンクをスキップ"
        R_TIMEOUT_HIT=1; break
      fi

      CHUNK_NUM=$(python3 -c "import json,sys; print(len(json.load(open(sys.argv[1]))))" "$chunk_file" 2>/dev/null || echo 0)
      CHUNK_IDX=$(( 10#$(basename "$chunk_file" .json) ))
      _CHUNK_T0=$(date +%s)
      echo "  チャンク $((CHUNK_IDX+1)): ${CHUNK_NUM}件  開始=$(date '+%H:%M:%S')"

      REL_PROMPT=$(mktemp /tmp/rel_prompt_XXXX.txt)
      python3 - "$chunk_file" > "$REL_PROMPT" << 'PYEOF'
import json, sys
with open(sys.argv[1]) as f:
    releases = json.load(f)
lines = ['AWSクイズアプリのリリースノートの英訳を確認・補完してください。\n自然なプロダクト英語で技術的な内容を正確に翻訳してください。\n既存英訳が正確なら ok、修正・新規翻訳したなら updated を返してください。\n\n【出力形式】JSONのみで出力。\n{"results":[{"releaseId":"...","status":"ok|updated","titleEn":"英語タイトル","bodyEn":"英語本文"},...]}\n\nstatusの意味: ok=既存英訳が正確 / updated=修正または新規翻訳\n\n【リリースノートリスト】']
for r in releases:
    lines.append(f"releaseId: {r.get('releaseId','')}")
    lines.append(f"date: {r.get('date','')}")
    lines.append(f"title(JA): {r.get('title','')}")
    if r.get('titleEn'):
        lines.append(f"titleEn(現状): {r['titleEn']}")
    lines.append(f"body(JA): {r.get('body','')}")
    if r.get('bodyEn'):
        lines.append(f"bodyEn(現状): {r['bodyEn']}")
    lines.append("")
print('\n'.join(lines))
PYEOF

      _STDOUT_F=$(mktemp /tmp/claude_out_XXXX)
      _STDERR_F=$(mktemp /tmp/claude_err_XXXX)
      "$CLAUDE_CMD" -p < "$REL_PROMPT" > "$_STDOUT_F" 2> "$_STDERR_F"
      REL_EXIT=$?
      REL_RESULT=$(cat "$_STDOUT_F")
      _STDERR=$(cat "$_STDERR_F")
      rm -f "$_STDOUT_F" "$_STDERR_F"
      if [ $REL_EXIT -ne 0 ] && echo "$_STDERR" | grep -q "No such file"; then
        CLAUDE_CMD=$(_find_claude)
        if [ -x "${CLAUDE_CMD:-}" ]; then
          _STDOUT_F=$(mktemp /tmp/claude_out_XXXX)
          _STDERR_F=$(mktemp /tmp/claude_err_XXXX)
          "$CLAUDE_CMD" -p < "$REL_PROMPT" > "$_STDOUT_F" 2> "$_STDERR_F"
          REL_EXIT=$?
          REL_RESULT=$(cat "$_STDOUT_F")
          _STDERR=$(cat "$_STDERR_F")
          rm -f "$_STDOUT_F" "$_STDERR_F"
        fi
      fi
      rm -f "$REL_PROMPT"

      if echo "$_STDERR" | grep -qiE "command not found|No such file|GEMINI_API_KEY|API.?key"; then
        echo "  ❌ claude 実行エラー（認証またはコマンド問題）。スクリプトを終了します"
        echo "  stderr: $(echo "$_STDERR" | head -3)"
        exit 1
      fi
      if echo "$_STDERR" | grep -qiE "rate.?limit|too many requests|overload|529|quota exceeded|usage limit|resource_exhausted"; then
        echo "  ⚠️  レート制限を検出。Releasesの残りチャンクをスキップ"
        echo "  stderr: $(echo "$_STDERR" | head -3)"
        record_rate_limit "$(echo "${REL_RESULT:-} ${_STDERR:-}" | head -10)"
        break
      fi
      if [ $REL_EXIT -ne 0 ]; then
        echo "  ⚠️  claude 実行エラー (exit=$REL_EXIT)。このチャンクをスキップして続行"
        echo "  stderr: $(echo "$_STDERR" | head -5)"
        continue
      fi

      REL_RESULT_FILE=$(mktemp /tmp/result_rel_XXXX.json)
      echo "$REL_RESULT" | extract_results_json > "$REL_RESULT_FILE"

      REL_STATS=$(python3 - "$REL_RESULT_FILE" << 'PYEOF'
import json, sys, subprocess
from datetime import datetime, timezone
with open(sys.argv[1]) as f:
    data = json.load(f)
results = data.get('results', [])
now = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
ok_count, updated_count = 0, 0
for r in results:
    rid = r.get('releaseId', '')
    status = r.get('status', 'updated')
    title_en = r.get('titleEn', '')
    body_en = r.get('bodyEn', '')
    if not rid: continue
    if status == 'ok':
        subprocess.run([
            'aws', 'dynamodb', 'update-item',
            '--table-name', 'Releases',
            '--key', json.dumps({'releaseId': {'S': rid}}),
            '--update-expression', 'SET translationCheckedAt = :t',
            '--expression-attribute-values', json.dumps({':t': {'S': now}}),
        ], capture_output=True)
        ok_count += 1
        print(f'    [OK        ] {rid}')
    else:
        subprocess.run([
            'aws', 'dynamodb', 'update-item',
            '--table-name', 'Releases',
            '--key', json.dumps({'releaseId': {'S': rid}}),
            '--update-expression', 'SET titleEn = :te, bodyEn = :be, translationCheckedAt = :t',
            '--expression-attribute-values', json.dumps({':te':{'S':title_en},':be':{'S':body_en},':t':{'S':now}}),
        ], capture_output=True)
        updated_count += 1
        print(f'    [UPDATED   ] {rid}')
print(f'__STATS__{ok_count},{updated_count}')
PYEOF
)
      rm -f "$REL_RESULT_FILE"
      echo "$REL_STATS" | grep -v '^__STATS__'
      STATS_LINE=$(echo "$REL_STATS" | grep '^__STATS__' | sed 's/^__STATS__//')
      if [ -n "$STATS_LINE" ]; then
        R_OK=$(( R_OK + $(echo "$STATS_LINE" | cut -d, -f1) ))
        R_UPDATED=$(( R_UPDATED + $(echo "$STATS_LINE" | cut -d, -f2) ))
      fi
      echo "  終了=$(date '+%H:%M:%S')  経過=$(( $(date +%s) - _CHUNK_T0 ))秒"
    done

    rm -rf "$R_CHUNKS_DIR"
    echo ""
    echo "  Releases 完了: OK=${R_OK} / 更新=${R_UPDATED}"
  else
    echo "  すべて英訳済み"
  fi
  rm -f "$RELEASES_FILE"
fi

rm -f "$PY_DESER_FILE"

echo ""
echo "=========================================="
echo "英訳チェック終了: $(date)"
echo "=========================================="

} 2>&1 | tee -a "$LOG_FILE"

find "$LOG_DIR" -name "translation_*.log" -mtime +30 -delete 2>/dev/null || true
