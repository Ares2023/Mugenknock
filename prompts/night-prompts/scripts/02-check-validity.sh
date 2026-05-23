#!/bin/bash
# AWS問題の正当性チェックスクリプト
# 問題なし→確認日のみ更新 / 問題あり→自動修正またはDB削除

set -uo pipefail

export PATH="/home/yuzuki/.npm-global/bin:/home/sera/.config/nvm/versions/node/v20.20.2/bin:$PATH"
unset ANTHROPIC_API_KEY

_find_claude() {
  local _p=/home/yuzuki/.npm-global/bin/claude
  [ -x "$_p" ] && { echo "$_p"; return; }
  local _cv; _cv=$(command -v claude 2>/dev/null)
  [ -n "$_cv" ] && [ -x "$_cv" ] && echo "$_cv"
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
LOG_FILE="$LOG_DIR/validity_${DATE}.log"

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
    echo "  🔒 レート制限中: リセット予定 $_disp"
    return 1
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
usage: check-validity.sh [-n N] [-D HH:MM] [-h]

  -n N       チェック問題数 (default: 30)
  -D HH:MM   処理終了時刻 (JST)。この時刻を過ぎたチャンクはスキップ
  -h         このヘルプを表示

挙動:
  未チェック（validityCheckedAt なし）を優先
  全問チェック済みの場合は確認日付が古い順
  action=ok  → validityCheckedAt のみ更新
  action=fix → 問題内容を上書き・validityEditLog を記録・updatedAt 更新
  action=delete → DynamoDB から削除
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

{
check_rate_limit
echo "=========================================="
echo "正当性チェック開始: $(date)"
echo "バッチサイズ: ${BATCH_SIZE}問 / チャンクサイズ: ${CHUNK_SIZE}問"
echo "=========================================="

# ── 1. DynamoDBから問題を取得 ──────────────────────────────────
DYNAMO_TMP=$(mktemp /tmp/dynamo_XXXX.json)
aws dynamodb scan --table-name Questions --output json 2>/dev/null > "$DYNAMO_TMP"

QUESTIONS_JSON=$(BATCH_SIZE=$BATCH_SIZE DYNAMO_TMP="$DYNAMO_TMP" python3 << 'PYEOF'
import json, os
from datetime import datetime, timezone, timedelta

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
    checked = q.get('validityCheckedAt')
    sort_key = EPOCH_ZERO
    try:
        if checked:
            sort_key = datetime.fromisoformat(checked.replace('Z', '+00:00'))
    except:
        pass
    candidates.append((sort_key, q))

candidates.sort(key=lambda x: x[0])
batch = int(os.environ.get('BATCH_SIZE', 30))
print(json.dumps([q for _, q in candidates[:batch]]))
PYEOF
)
rm -f "$DYNAMO_TMP"

COUNT=$(echo "$QUESTIONS_JSON" | python3 -c "import json,sys; print(len(json.load(sys.stdin)))" 2>/dev/null || echo 0)
echo "チェック対象: ${COUNT}問"

if [ "$COUNT" -eq 0 ]; then
  echo "チェック対象なし（全問が直近にチェック済み）"
  exit 0
fi

# ── 2. チャンクファイルに分割 ────────────────────────────────────
CHUNKS_DIR=$(mktemp -d /tmp/validity_chunks_XXXX)
QUESTIONS_TMP=$(mktemp /tmp/validity_qs_XXXX.json)
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
TOTAL_DEL=0
RATE_LIMITED=0

TIMEOUT_HIT=0
for chunk_file in "$CHUNKS_DIR"/*.json; do
  [ -e "$chunk_file" ] || continue

  # 終了時刻チェック
  if [ "$DEADLINE_EPOCH" -gt 0 ] && [ "$(date +%s)" -ge "$DEADLINE_EPOCH" ]; then
    echo ""
    echo "⏰ 終了時刻 ${DEADLINE} を過ぎたため、残りチャンクをスキップ（成果はDB反映済み）"
    TIMEOUT_HIT=1
    break
  fi

  CHUNK_NUM=$(python3 -c "import json,sys; print(len(json.load(open(sys.argv[1]))))" "$chunk_file" 2>/dev/null || echo 0)
  CHUNK_IDX=$(basename "$chunk_file" .json | sed 's/^0*//')
  CHUNK_IDX=${CHUNK_IDX:-0}
  _CHUNK_T0=$(date +%s)
  echo ""
  echo "--- チャンク $((CHUNK_IDX+1))/${CHUNK_COUNT}: ${CHUNK_NUM}問  開始=$(date '+%H:%M:%S') ---"

  PROMPT_FILE=$(mktemp /tmp/validity_prompt_XXXX.txt)
  python3 - "$chunk_file" > "$PROMPT_FILE" << 'PYEOF'
import json, sys
with open(sys.argv[1]) as f:
    questions = json.load(f)
lines = ['あなたはAWS認定試験の問題品質チェッカーです。\n以下の問題を精査し、資格勉強サイトの問題として適切かどうか確認してください。\n\n【確認観点】\n- 現在のAWSサービスの仕様・機能と一致しているか（廃止サービスを現行として扱っていないか）\n- 正解が正しく、選択肢に正解が含まれているか\n- correctAnswers の各要素が choices のいずれかと完全一致しているか（「A. 」「B. 」などの記号接頭辞が付いていないか）。不一致の場合は fix で修正する\n- 解説が正確で適切か。ダミーの選択肢がだめな理由も解説しているか\n- 解説は適宜改行を入れて読みやすいか。各選択肢の説明が「選択肢Aは〜」「選択肢Bは〜」のように選択肢ごとに改行して記述されているか。されていない場合は fix で修正すること\n- 試験問題として適切な形式・難易度か\n- AWSに直接関係しない一般的でない略語に注釈・解説がついているか（ない場合は問題文または解説に補足を追加する）\n- タグ（出題ドメイン）が正しく設定されているか。タグが空・欠落・下記ドメイン外の値の場合はfixで正しいドメインを設定すること\n  CLF: クラウドの概念 / セキュリティとコンプライアンス / クラウドのテクノロジーとサービス / 請求、料金、およびサポート\n  SAA: セキュアなアーキテクチャの設計 / 弾力性に優れたアーキテクチャの設計 / 高性能なアーキテクチャの設計 / コスト最適化されたアーキテクチャの設計\n  SAP: 組織の複雑さに対応する設計 / 新しいソリューションのための設計 / 既存のソリューションの継続的改善 / ワークロードの移行とモダン化の加速\n  DOP: SDLC の自動化 / 構成管理と Infrastructure as Code (IaC) / 弾力性に優れたクラウドソリューション / モニタリングとロギング / インシデントとイベントへの対応 / セキュリティとコンプライアンス\n  DVA: AWSのサービスを使用した開発 / セキュリティ / デプロイ / トラブルシューティングと最適化\n  SOA: モニタリング、ロギング、分析、修復、およびパフォーマンスの最適化 / 信頼性とビジネス継続性 / デプロイ、プロビジョニング、および自動化 / セキュリティとコンプライアンス / ネットワークとコンテンツ配信\n  DEA: データの取り込みと変換 / データストアの管理 / データオペレーションとサポート / データのセキュリティとガバナンス\n  AIF: AIとMLの基礎 / 生成AIの基礎 / 基盤モデルのアプリケーション / 責任あるAIのガイドライン / AIソリューションのセキュリティ、コンプライアンス、ガバナンス\n  MLA: 機械学習のためのデータ準備 / MLモデルの開発 / MLワークフローのデプロイとオーケストレーション / MLソリューションの監視、メンテナンス、セキュリティ\n  GAI: 基盤モデルの統合、データ管理、コンプライアンス / 実装と統合 / AIの安全性、セキュリティ、ガバナンス / 生成AIアプリケーションの運用効率と最適化 / テスト、検証、トラブルシューティング\n  ANS: ネットワーク設計 / ネットワーク実装 / ネットワーク管理と運用 / ネットワークのセキュリティ、コンプライアンス、ガバナンス\n  SCS: 検出 / インシデント対応 / インフラストラクチャのセキュリティ / アイデンティティとアクセス管理 / データ保護 / セキュリティの基盤とガバナンス\n\n【アクション】\n- "ok": 問題なし（確認日のみ更新）\n- "fix": 問題あり・修正可能（修正後の内容を含める。変更する項目のみ）\n- "delete": 修正不可能な致命的問題（正解が選択肢に存在しない、完全に誤った情報など）\n\n【出力形式】\n必ず以下のJSONのみを出力してください。説明文・前置きは不要です。\n\n{"results":[\n  {"questionId":"...","action":"ok","reason":"日本語100字以内"},\n  {"questionId":"...","action":"fix","reason":"...","fix":{"questionText":"修正後（変更する場合のみ）","choices":["A","B","C","D"],"correctAnswers":["正解（choices配列内の完全一致テキスト、記号接頭辞なし）"],"explanation":"修正後解説（変更する場合のみ）","tags":["出題ドメイン（変更する場合のみ）"]}},\n  {"questionId":"...","action":"delete","reason":"..."}\n]}\n\n【問題リスト】']
for q in questions:
    lines.append(f"ID: {q['questionId']}")
    lines.append(f"試験: {q.get('examType','')}")
    lines.append(f"問題文: {q.get('questionText','')}")
    choices = q.get('choices', [])
    if choices:
        lines.append(f"選択肢: {' / '.join(str(c) for c in choices)}")
    correct = q.get('correctAnswers', [])
    if correct:
        lines.append(f"正解: {', '.join(str(c) for c in correct)}")
    exp = q.get('explanation', '')
    if exp:
        lines.append(f"解説: {exp}")
    tags = q.get('tags', [])
    lines.append(f"タグ: {', '.join(tags) if tags else '（なし）'}")
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
    echo "❌ claude 実行エラー（認証またはコマンド問題）。スクリプトを終了します"
    echo "stderr: $(echo "$_STDERR" | head -3)"
    exit 1
  fi

  # レート制限 → stderrのみで判定（AI応答テキストはfalse positiveを避けるため除外）
  if echo "$_STDERR" | grep -qiE "rate.?limit|too many requests|529|quota exceeded|usage limit|resource_exhausted"; then
    echo "⚠️  レート制限を検出。残りチャンクをスキップ"
    echo "stderr: $(echo "$_STDERR" | head -3)"
    record_rate_limit "$(echo "${RESULT:-} ${_STDERR:-}" | head -10)"
    RATE_LIMITED=1
    break
  fi

  # その他の非ゼロ終了 → このチャンクのみスキップして続行
  if [ $AI_EXIT -ne 0 ]; then
    echo "⚠️  チャンク $((CHUNK_IDX+1)) でエラー（exit $AI_EXIT）。このチャンクをスキップして続行"
    echo "stderr: $(echo "$_STDERR" | head -5)"
    echo "stdout: $(echo "$RESULT" | head -3)"
    continue
  fi

  RESULT_JSON=$(echo "$RESULT" | python3 -c "
import sys, json, re
text = sys.stdin.read()
cb = re.search(r'\`\`\`(?:json)?\s*(\{)', text, re.DOTALL)
if cb:
    text = text[cb.start(1):]
    text = re.sub(r'\s*\`\`\`.*\$', '', text, flags=re.DOTALL)
start = text.find('{')
if start == -1: print('{}'); exit(0)
try:
    obj, _ = json.JSONDecoder().raw_decode(text, start)
    print(json.dumps(obj) if 'results' in obj else '{}')
except: print('{}')
")

  # ── DB即時更新 ────────────────────────────────────────────────
  RESULT_JSON_FILE=$(mktemp /tmp/validity_result_XXXX.json)
  echo "$RESULT_JSON" > "$RESULT_JSON_FILE"
  CHUNK_STATS=$(python3 - "$RESULT_JSON_FILE" "$chunk_file" << 'PYEOF'
import json, sys, subprocess
from datetime import datetime, timezone

with open(sys.argv[1]) as f:
    data = json.load(f)
results = data.get('results', [])
now = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')

# Build original question map for before/after diff
with open(sys.argv[2]) as f:
    orig_questions = {q['questionId']: q for q in json.load(f)}

ok_count, fix_count, del_count = 0, 0, 0

REMOVE_EXPR = 'REMOVE validityRating, validityNote, fixProposalJson'

for r in results:
    qid = r.get('questionId', '')
    action = r.get('action', 'ok')
    reason = r.get('reason', '')
    fix = r.get('fix', {})
    orig = orig_questions.get(qid, {})

    if action == 'delete':
        subprocess.run([
            'aws', 'dynamodb', 'delete-item',
            '--table-name', 'Questions',
            '--key', json.dumps({'questionId': {'S': qid}}),
        ], capture_output=True)
        del_count += 1
        print(f'  [DELETE] {qid}: {reason}')
        continue

    if action == 'fix' and fix:
        import re as _re
        _label_re = _re.compile(r'^[A-E]\.\s*')
        # Build before/after changes dict
        changes = {}
        update_parts = ['validityCheckedAt = :t', 'updatedAt = :u', 'validityEditLog = :log']
        expr_values = {':t': {'S': now}, ':u': {'S': now}}

        if fix.get('questionText') and fix['questionText'] != orig.get('questionText'):
            update_parts.append('questionText = :qt')
            expr_values[':qt'] = {'S': fix['questionText']}
            changes['questionText'] = {'before': orig.get('questionText', ''), 'after': fix['questionText']}

        if fix.get('choices') and fix['choices'] != orig.get('choices'):
            update_parts.append('choices = :ch')
            expr_values[':ch'] = {'L': [{'S': str(c)} for c in fix['choices']]}
            changes['choices'] = {'before': orig.get('choices', []), 'after': fix['choices']}

        if fix.get('correctAnswers'):
            # ラベル接頭辞を除去してから比較・保存
            stripped_ca = [_label_re.sub('', str(c)) for c in fix['correctAnswers']]
            if stripped_ca != orig.get('correctAnswers'):
                update_parts.append('correctAnswers = :ca')
                expr_values[':ca'] = {'L': [{'S': c} for c in stripped_ca]}
                changes['correctAnswers'] = {'before': orig.get('correctAnswers', []), 'after': stripped_ca}
            # correctAnswerIndices を再計算（choices が変わった場合も考慮）
            eff_choices = fix.get('choices', orig.get('choices', []))
            indices = [eff_choices.index(ca) for ca in stripped_ca if ca in eff_choices]
            if indices:
                update_parts.append('correctAnswerIndices = :ci')
                expr_values[':ci'] = {'L': [{'N': str(i)} for i in indices]}
        elif fix.get('choices'):
            # choices のみ変わった場合も correctAnswerIndices を更新
            eff_choices = fix['choices']
            orig_ca = orig.get('correctAnswers', [])
            indices = [eff_choices.index(ca) for ca in orig_ca if ca in eff_choices]
            if indices:
                update_parts.append('correctAnswerIndices = :ci')
                expr_values[':ci'] = {'L': [{'N': str(i)} for i in indices]}

        if fix.get('explanation') and fix['explanation'] != orig.get('explanation'):
            update_parts.append('explanation = :ex')
            expr_values[':ex'] = {'S': fix['explanation']}
            changes['explanation'] = {'before': orig.get('explanation', ''), 'after': fix['explanation']}

        if fix.get('tags') and fix['tags'] != orig.get('tags'):
            update_parts.append('tags = :tg')
            expr_values[':tg'] = {'L': [{'S': str(t)} for t in fix['tags']]}
            changes['tags'] = {'before': orig.get('tags', []), 'after': fix['tags']}

        edit_log = {'action': 'fixed', 'checkedAt': now, 'reason': reason, 'changes': changes}
        expr_values[':log'] = {'S': json.dumps(edit_log, ensure_ascii=False)}

        update_expr = f'SET {", ".join(update_parts)} {REMOVE_EXPR}'
        subprocess.run([
            'aws', 'dynamodb', 'update-item',
            '--table-name', 'Questions',
            '--key', json.dumps({'questionId': {'S': qid}}),
            '--update-expression', update_expr,
            '--expression-attribute-values', json.dumps(expr_values),
        ], capture_output=True)
        fix_count += 1
        changed_fields = list(changes.keys()) or ['(変更なし)']
        print(f'  [FIX  ] {qid}: {reason} → 変更: {", ".join(changed_fields)}')

    else:
        # action == 'ok' (or unrecognized)
        update_expr = f'SET validityCheckedAt = :t {REMOVE_EXPR}'
        expr_values = {':t': {'S': now}}
        subprocess.run([
            'aws', 'dynamodb', 'update-item',
            '--table-name', 'Questions',
            '--key', json.dumps({'questionId': {'S': qid}}),
            '--update-expression', update_expr,
            '--expression-attribute-values', json.dumps(expr_values),
        ], capture_output=True)
        ok_count += 1
        print(f'  [OK   ] {qid}')

print(f'  → 更新完了: OK={ok_count} 修正={fix_count} 削除={del_count}')
print(f'__STATS__{ok_count},{fix_count},{del_count}')
PYEOF
)

  rm -f "$RESULT_JSON_FILE"
  echo "$CHUNK_STATS" | grep -v '^__STATS__'
  STATS_LINE=$(echo "$CHUNK_STATS" | grep '^__STATS__' | sed 's/^__STATS__//')
  if [ -n "$STATS_LINE" ]; then
    _ok=$(echo "$STATS_LINE" | cut -d, -f1)
    _fix=$(echo "$STATS_LINE" | cut -d, -f2)
    _del=$(echo "$STATS_LINE" | cut -d, -f3)
    TOTAL_OK=$(( TOTAL_OK + _ok ))
    TOTAL_FIX=$(( TOTAL_FIX + _fix ))
    TOTAL_DEL=$(( TOTAL_DEL + _del ))
  fi
  echo "  終了=$(date '+%H:%M:%S')  経過=$(( $(date +%s) - _CHUNK_T0 ))秒"
done

rm -rf "$CHUNKS_DIR"

echo ""
echo "完了サマリー: 問題なし=${TOTAL_OK}問 / 自動修正=${TOTAL_FIX}問 / 削除=${TOTAL_DEL}問"

if [ $RATE_LIMITED -eq 1 ] || [ ${TIMEOUT_HIT:-0} -eq 1 ]; then
  exit 1
fi

echo ""
echo "=========================================="
echo "チェック終了: $(date)"
echo "=========================================="

} 2>&1 | tee -a "$LOG_FILE"

find "$LOG_DIR" -name "validity_*.log" -mtime +30 -delete
