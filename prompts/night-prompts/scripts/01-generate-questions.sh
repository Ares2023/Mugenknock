#!/bin/bash
# 問題自動生成スクリプト
# instructions/ 内の資格ごとの指示を元に Claude で問題を生成し API 経由でインポートする
# 現在の問題数が最も少ない資格を自動選択

set -uo pipefail

export PATH="/home/yuzuki/.npm-global/bin:/home/yuzuki/local/bin:/home/sera/.config/nvm/versions/node/v20.20.2/bin:$PATH"
unset ANTHROPIC_API_KEY

# bin/claude.exe はパッケージ直下の安定バイナリ
# node_modules 内プラットフォームバイナリは npm 更新時に一時削除されるため使わない
_find_claude() {
  local _w=/home/yuzuki/local/bin/claude
  [ -x "$_w" ] && { echo "$_w"; return; }
  local _p=/home/yuzuki/.npm-global/lib/node_modules/@anthropic-ai/claude-code/bin/claude.exe
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
INSTRUCTION_DIR="$SCRIPT_DIR/instructions"
API_ENDPOINT="https://a0q3656qw4.execute-api.ap-northeast-1.amazonaws.com/dev"
QUESTIONS_PER_DOMAIN=5

# ── ヘルプ ──────────────────────────────────────────────────
show_help() {
  local exams
  exams=$(ls "$INSTRUCTION_DIR"/*.txt 2>/dev/null | xargs -I{} basename {} .txt | tr '\n' ' ')
  cat << EOF
usage: $(basename "$0") [options]

  -e, --exam EXAM       生成する資格を指定（例: SAA, CLF, DOP）
                        省略時は問題数が最も少ない資格を自動選択
  -n, --questions N     1ドメインあたりの問題数（デフォルト: ${QUESTIONS_PER_DOMAIN}）
  -D, --deadline HH:MM  処理終了時間（JST）。この時刻を過ぎたドメインはスキップ
  -h, --help            このヘルプを表示

利用可能な資格: ${exams:-（instructions/ に .txt がありません）}
EOF
}

# ── 引数処理 ─────────────────────────────────────────────────
FORCE_EXAM=""
DEADLINE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    -e|--exam)
      FORCE_EXAM="${2:?--exam requires EXAM}"
      shift 2
      ;;
    -n|--questions)
      QUESTIONS_PER_DOMAIN="${2:?--questions requires N}"
      shift 2
      ;;
    -D|--deadline)
      DEADLINE="${2:?--deadline requires HH:MM}"
      shift 2
      ;;
    -h|--help)
      show_help; exit 0
      ;;
    *)
      echo "❌ 不明なオプション: $1" >&2
      show_help >&2
      exit 1
      ;;
  esac
done

# ── デッドライン計算 ──────────────────────────────────────────
DEADLINE_EPOCH=0
if [ -n "$DEADLINE" ]; then
  DEADLINE_EPOCH=$(python3 -c "
from datetime import datetime, timezone, timedelta
JST = timezone(timedelta(hours=9))
now = datetime.now(JST)
hh, mm = map(int, '${DEADLINE}'.split(':'))
dt = now.replace(hour=hh, minute=mm, second=0, microsecond=0)
if dt <= now:
    dt = dt + timedelta(days=1)
print(int(dt.timestamp()))
" 2>/dev/null || echo 0)
  echo "⏰ デッドライン: ${DEADLINE} JST (epoch=${DEADLINE_EPOCH})"
fi

mkdir -p "$LOG_DIR"
DATE=$(date '+%Y%m%d_%H%M%S')
LOG_FILE="$LOG_DIR/generate_${DATE}.log"

# ── ドメイン定義 (資格コード → ドメイン配列) ────────────────
declare -A DOMAINS
# ドメイン名は公式試験ガイドの表記に完全一致させること（タグとして使用されるため）
DOMAINS[CLF]="クラウドの概念,セキュリティとコンプライアンス,クラウドのテクノロジーとサービス,請求、料金、およびサポート"
DOMAINS[SAA]="セキュアなアーキテクチャの設計,弾力性に優れたアーキテクチャの設計,高性能なアーキテクチャの設計,コスト最適化されたアーキテクチャの設計"
DOMAINS[SAP]="組織の複雑さに対応する設計,新しいソリューションのための設計,既存のソリューションの継続的改善,ワークロードの移行とモダン化の加速"
DOMAINS[DVA]="AWSのサービスを使用した開発,セキュリティ,デプロイ,トラブルシューティングと最適化"
DOMAINS[SOA]="モニタリング、ロギング、分析、修復、およびパフォーマンスの最適化,信頼性とビジネス継続性,デプロイ、プロビジョニング、および自動化,セキュリティとコンプライアンス,ネットワークとコンテンツ配信"
DOMAINS[DOP]="SDLC の自動化,構成管理と Infrastructure as Code (IaC),弾力性に優れたクラウドソリューション,モニタリングとロギング,インシデントとイベントへの対応,セキュリティとコンプライアンス"
DOMAINS[AIF]="AIとMLの基礎,生成AIの基礎,基盤モデルのアプリケーション,責任あるAIのガイドライン,AIソリューションのセキュリティ、コンプライアンス、ガバナンス"
DOMAINS[MLA]="機械学習のためのデータ準備,MLモデルの開発,MLワークフローのデプロイとオーケストレーション,MLソリューションの監視、メンテナンス、セキュリティ"
DOMAINS[GAI]="生成AIソリューションの設計と評価,基盤モデルのカスタマイズとファインチューニング,生成AIアプリケーションの実装とデプロイ,エージェントとオーケストレーションのアーキテクチャ,セキュリティ、ガバナンス、責任あるAI"

{
echo "=========================================="
echo "問題自動生成 開始: $(date)"
echo "=========================================="

# ── 対象資格の一覧を instructions/ から構築 ─────────────────
mapfile -t EXAM_TYPES < <(
  ls "$INSTRUCTION_DIR"/*.txt 2>/dev/null \
    | xargs -I{} basename {} .txt \
    | python3 -c "
import sys
ORDER = ['CLF', 'SAA', 'SAP', 'DVA', 'SOA', 'DOP', 'SCS', 'ANS', 'DAS', 'MLS', 'PAS', 'AIF', 'MLA', 'GAI']
items = [l.strip() for l in sys.stdin if l.strip()]
known   = [x for x in ORDER if x in items]
unknown = sorted(x for x in items if x not in ORDER)
print('\n'.join(known + unknown))
"
)

if [ ${#EXAM_TYPES[@]} -eq 0 ]; then
  echo "⚠️  instructions/ に .txt ファイルがありません"
  exit 0
fi

echo "対象資格: ${EXAM_TYPES[*]}"

# ── 生成する資格を決定 ────────────────────────────────────────
if [ -n "$FORCE_EXAM" ]; then
  # -e で明示指定
  if [ ! -f "$INSTRUCTION_DIR/${FORCE_EXAM}.txt" ]; then
    echo "❌ 指定した資格の指示ファイルがありません: ${INSTRUCTION_DIR}/${FORCE_EXAM}.txt"
    exit 1
  fi
  NEXT_EXAM="$FORCE_EXAM"
  echo "指定資格: $NEXT_EXAM"
else
  # 問題数が最も少ない資格を選択
  echo "各資格の問題数を取得中..."
  MIN_COUNT=999999
  NEXT_EXAM="${EXAM_TYPES[0]}"
  for exam in "${EXAM_TYPES[@]}"; do
    count=$(aws dynamodb query \
      --table-name Questions \
      --index-name examType-index \
      --key-condition-expression "examType = :e" \
      --expression-attribute-values "{\":e\": {\"S\": \"$exam\"}}" \
      --select COUNT \
      --query 'Count' \
      --output text 2>/dev/null | awk '{s+=$1} END{print s+0}')
    count=${count:-0}
    echo "  $exam: ${count}問"
    if [ "$count" -lt "$MIN_COUNT" ]; then
      MIN_COUNT="$count"
      NEXT_EXAM="$exam"
    fi
  done
  echo "選択: $NEXT_EXAM (現在${MIN_COUNT}問 — 最少)"
fi

# ── ドメイン一覧を取得 ────────────────────────────────────────
DOMAIN_STR="${DOMAINS[$NEXT_EXAM]:-}"
if [ -z "$DOMAIN_STR" ]; then
  echo "⚠️  $NEXT_EXAM のドメイン定義がありません"
  exit 1
fi

IFS=',' read -ra DOMAIN_LIST <<< "$DOMAIN_STR"
DOMAIN_COUNT=${#DOMAIN_LIST[@]}
TOTAL_QUESTIONS=$(( QUESTIONS_PER_DOMAIN * DOMAIN_COUNT ))
echo "ドメイン数: $DOMAIN_COUNT  /  基本 ${QUESTIONS_PER_DOMAIN}問/ドメイン（重み付きで配分）  /  合計予算 ${TOTAL_QUESTIONS}問"

# ── ドメインのラウンドロビン開始位置を決定 ────────────────────
STATE_DIR="$SCRIPT_DIR/state"
STATE_FILE="$STATE_DIR/last_domain_idx.json"
mkdir -p "$STATE_DIR"

START_IDX=$(python3 - "$STATE_FILE" "$NEXT_EXAM" "$DOMAIN_COUNT" << 'PYEOF'
import json, sys
sf, exam, count = sys.argv[1], sys.argv[2], int(sys.argv[3])
try:
    with open(sf) as f:
        state = json.load(f)
    last = int(state.get(exam, -1))
    print((last + 1) % count)
except:
    print(0)
PYEOF
)

ROTATED_LIST=()
for (( _i = 0; _i < DOMAIN_COUNT; _i++ )); do
  ROTATED_LIST+=("${DOMAIN_LIST[$(( (START_IDX + _i) % DOMAIN_COUNT ))]}")
done
echo "開始ドメイン: [${START_IDX}] ${ROTATED_LIST[0]}"

# ── 指示ファイルを読み込む ────────────────────────────────────
INSTRUCTION=$(cat "$INSTRUCTION_DIR/${NEXT_EXAM}.txt")

# ── Cognito 認証（ループ前に1回だけ）────────────────────────────
echo ""
echo "--- Cognito 認証中 ---"
ADMIN_PASSWORD=$(aws ssm get-parameter --name "/quiz-app/admin-password" --with-decryption --query 'Parameter.Value' --output text)
ID_TOKEN=$(aws cognito-idp initiate-auth \
  --auth-flow USER_PASSWORD_AUTH \
  --auth-parameters USERNAME=yuzuki2002110@gmail.com,PASSWORD="$ADMIN_PASSWORD" \
  --client-id 16jjrj5m28o6s2k84og8kh2vh3 \
  --query 'AuthenticationResult.IdToken' --output text 2>/dev/null)

if [ -z "$ID_TOKEN" ] || [ "$ID_TOKEN" = "None" ]; then
  echo "❌ Cognito 認証失敗"
  exit 1
fi
echo "✓ 認証完了"

# ── ドメイン別問題数を取得 → 逆数重み付き割り当て計算 ───────────────────────
echo ""
echo "--- ドメイン別問題数を取得・割り当て計算中 ---"
COUNTS_RAW=$(aws dynamodb query \
  --table-name Questions \
  --index-name examType-index \
  --key-condition-expression "examType = :e" \
  --expression-attribute-values "{\":e\": {\"S\": \"$NEXT_EXAM\"}}" \
  --projection-expression "tags" \
  --output json 2>/dev/null | python3 -c "
import json, sys
from collections import Counter
data = json.load(sys.stdin)
counts = Counter()
for item in data.get('Items', []):
    tags_raw = item.get('tags', {})
    if 'L' in tags_raw:
        for tag in tags_raw['L']:
            val = tag.get('S', '').strip()
            if val:
                counts[val] += 1
    elif 'SS' in tags_raw:
        for val in tags_raw['SS']:
            val = str(val).strip()
            if val:
                counts[val] += 1
print('__JSON__' + json.dumps(dict(counts)))
if counts:
    for k, v in sorted(counts.items(), key=lambda x: x[1]):
        print(f'  {k}: {v}問')
else:
    print('  （まだ問題がありません）')
" 2>/dev/null || echo "__JSON__{}")
DOMAIN_COUNTS_JSON=$(echo "$COUNTS_RAW" | grep '^__JSON__' | sed 's/^__JSON__//')
DOMAIN_COUNTS_JSON="${DOMAIN_COUNTS_JSON:-{}}"
TAG_COUNT_TEXT=$(echo "$COUNTS_RAW" | grep -v '^__JSON__')
echo "$TAG_COUNT_TEXT"

# ── 逆数重みによるドメイン別問題数割り当て ──────────────────────────────────
# 総予算 (TOTAL_QUESTIONS) を各ドメインの現在問題数の逆数で按分する
# 問題数が少ないドメインほど多く割り当て、最低1問/ドメインを保証
# 表示はstderrへ(outer 2>&1|teeでログに記録)、JSONはstdoutへ($()でキャプチャ)
echo ""
echo "ドメイン別生成数（逆数重み付き割り当て）:"
# シェル引数経由だと文字コード・エスケープの問題でjson.loadsが失敗する場合があるため
# 一時ファイル経由でPythonに渡す
_COUNTS_TMP=$(mktemp /tmp/domain_counts_XXXX.json)
echo "$DOMAIN_COUNTS_JSON" > "$_COUNTS_TMP"

DOMAIN_ALLOC_JSON=$(PYTHONIOENCODING=utf-8 python3 - "$DOMAIN_STR" "$_COUNTS_TMP" "$TOTAL_QUESTIONS" << 'PYEOF'
import json, sys, re

def norm(s):
    # 全角スペース・連続空白を正規化してトリム
    return re.sub(r'[\s　]+', ' ', s).strip()

domains = [d.strip() for d in sys.argv[1].split(',')]
total   = int(sys.argv[3])
try:
    with open(sys.argv[2], encoding='utf-8') as f:
        raw_counts = json.load(f)
    counts = {norm(k): v for k, v in raw_counts.items()}
except Exception:
    counts = {}

# 逆数重み: count が少ないほど weight が大きい
weights = {d: 1.0 / (counts.get(norm(d), 0) + 1) for d in domains}
total_w = sum(weights.values())
raw     = {d: (weights[d] / total_w) * total for d in domains}
alloc   = {d: max(1, int(raw[d])) for d in domains}

# 端数補充: 小数部が大きい順に +1
remaining = total - sum(alloc.values())
fracs = sorted(domains, key=lambda d: raw[d] - int(raw[d]), reverse=True)
i = 0
while remaining > 0:
    alloc[fracs[i % len(fracs)]] += 1; remaining -= 1; i += 1

# 最低保証超過分を多い方から削減
while remaining < 0:
    reducible = sorted([d for d in domains if alloc[d] > 1], key=lambda d: -alloc[d])
    if not reducible: break
    alloc[reducible[0]] -= 1; remaining += 1

# 表示をstderrに出力(ログに記録される)
for d, n in sorted(alloc.items(), key=lambda x: -x[1]):
    cur = counts.get(norm(d), 0)
    print(f'  {n}問 → {d} (現在{cur}問)', file=sys.stderr)
print(f'  合計: {sum(alloc.values())}問', file=sys.stderr)

# JSONをstdoutに出力($()でキャプチャ)
print(json.dumps(alloc))
PYEOF
)
rm -f "$_COUNTS_TMP"
DOMAIN_ALLOC_JSON="${DOMAIN_ALLOC_JSON:-{}}"

# ── ドメインごとに生成 → 即インポート ──────────────────────────
RATE_LIMITED=0
TOTAL_IMPORTED=0
TIMEOUT_HIT=0
_DOMAIN_OFFSET=0

for domain in "${ROTATED_LIST[@]}"; do
  _DOMAIN_IDX=$(( (START_IDX + _DOMAIN_OFFSET) % DOMAIN_COUNT ))
  if [ "$DEADLINE_EPOCH" -gt 0 ] && [ "$(date +%s)" -ge "$DEADLINE_EPOCH" ]; then
    echo "⏰ デッドライン到達 (${DEADLINE} JST)。残りドメインをスキップ"
    TIMEOUT_HIT=1
    break
  fi

  _DOMAIN_T0=$(date +%s)
  # このドメインの割り当て問題数を取得（計算失敗時はデフォルト値）
  Q_FOR_DOMAIN=$(echo "$DOMAIN_ALLOC_JSON" | python3 -c "
import json,sys
alloc=json.load(sys.stdin)
print(alloc.get('${domain}', ${QUESTIONS_PER_DOMAIN}))
" 2>/dev/null || echo "$QUESTIONS_PER_DOMAIN")
  echo ""
  echo "--- [${domain}] ${Q_FOR_DOMAIN}問 生成中 --- 開始=$(date '+%H:%M:%S')"

  PROMPT_FILE=$(mktemp /tmp/gen_prompt_XXXX.txt)
  cat > "$PROMPT_FILE" << PROMPT
${INSTRUCTION}

【対象資格】${NEXT_EXAM}
【対象ドメイン】${domain}
【作成問題数】${Q_FOR_DOMAIN} 問

【現在のドメイン別問題数 — 参考情報】
※ 対象ドメインはスクリプトが自動選択しています。今回は【対象ドメイン】の問題を作成してください。
${TAG_COUNT_TEXT}
→ 上記はドメインごとの総数です。今回の対象ドメイン「${domain}」の中で、まだカバーできていないAWSサービス・概念・ユースケースを中心に出題してください。

【出力形式】
以下の JSON 形式のみで出力してください。説明文・前置き・コードブロックは不要です。

{"questions":[
  {
    "questionText": "問題文（日本語）",
    "choices": ["選択肢A", "選択肢B", "選択肢C", "選択肢D"],
    "correctAnswers": ["正解の選択肢"],
    "explanation": "解説（日本語、200字程度）",
    "tags": ["${domain}"],
    "isMultiple": false
  },
  ...
]}

※ 複数正解の場合は isMultiple: true、correctAnswers に複数入れる
※ tags は必ず ["${domain}"] にする
※ ${Q_FOR_DOMAIN} 問を1つの JSON で返す
※ AWSに直接関係しない一般的でない略語には注釈・解説をつけること（AWSの資格勉強とは直接関係しないため）
※ correctAnswers は choices 配列の該当要素テキストと完全一致させること（「A. 」「B. 」などの記号接頭辞を付けないこと）
PROMPT

  RESULT=$("$CLAUDE_CMD" -p < "$PROMPT_FILE" 2>&1)
  AI_EXIT=$?
  # npm更新による一時的なバイナリ消失 → 再探索してリトライ
  if [ $AI_EXIT -ne 0 ] && echo "$RESULT" | grep -q "No such file"; then
    CLAUDE_CMD=$(_find_claude)
    [ -x "${CLAUDE_CMD:-}" ] && { RESULT=$("$CLAUDE_CMD" -p < "$PROMPT_FILE" 2>&1); AI_EXIT=$?; }
  fi
  rm -f "$PROMPT_FILE"

  if [ $AI_EXIT -ne 0 ] || echo "$RESULT" | grep -qiE "rate.?limit|too many requests|overload|quota exceeded|usage limit|resource_exhausted"; then
    if echo "$RESULT" | grep -qiE "command not found|No such file|GEMINI_API_KEY|API.?key"; then
      echo "❌ claude 実行エラー（認証またはコマンド問題）。スクリプトを終了します"
      echo "出力: $(echo "$RESULT" | head -3)"
      exit 1
    fi
    echo "⚠️  レート制限を検出。残りドメインをスキップ"
    echo "出力: $(echo "$RESULT" | head -3)"
    echo "  終了=$(date '+%H:%M:%S')  経過=$(( $(date +%s) - _DOMAIN_T0 ))秒"
    RATE_LIMITED=1
    break
  fi

  # Claude呼び出し成功 → 次回このドメインはスキップ（state更新）
  python3 - "$STATE_FILE" "$NEXT_EXAM" "$_DOMAIN_IDX" << 'PYEOF' 2>/dev/null || true
import json, sys
sf, exam, idx = sys.argv[1], sys.argv[2], int(sys.argv[3])
try:
    with open(sf) as f: state = json.load(f)
except:
    state = {}
state[exam] = idx
with open(sf, 'w') as f: json.dump(state, f)
PYEOF

  DOMAIN_JSON=$(echo "$RESULT" | python3 -c "
import sys, json, re
text = sys.stdin.read()

# markdown コードブロック除去
cb = re.search(r'\`\`\`(?:json)?\s*(\{)', text, re.DOTALL)
if cb:
    text = text[cb.start(1):]
    text = re.sub(r'\s*\`\`\`.*$', '', text, flags=re.DOTALL)

start = text.find('{')
if start == -1:
    print('{}')
    exit(0)
try:
    obj, _ = json.JSONDecoder().raw_decode(text, start)
    if 'questions' in obj:
        print(json.dumps(obj))
    else:
        print('{}')
except:
    print('{}')
")

  Q_COUNT=$(echo "$DOMAIN_JSON" | python3 -c "
import sys, json
d = json.loads(sys.stdin.read())
print(len(d.get('questions', [])))
" 2>/dev/null || echo 0)

  if [ "$Q_COUNT" -eq 0 ]; then
    echo "❌ [${domain}] JSON 抽出失敗。スキップ"
    echo "$RESULT" | head -c 300
    echo "  終了=$(date '+%H:%M:%S')  経過=$(( $(date +%s) - _DOMAIN_T0 ))秒"
    _DOMAIN_OFFSET=$(( _DOMAIN_OFFSET + 1 ))
    continue
  fi

  echo "抽出: ${Q_COUNT}問 → APIインポート中..."

  API_PAYLOAD=$(echo "$DOMAIN_JSON" | python3 -c "
import sys, json, re
d = json.loads(sys.stdin.read())
label_re = re.compile(r'^[A-E]\.\s*')
for q in d.get('questions', []):
    choices = q.get('choices', [])
    # Claudeが誤ってラベル接頭辞を付けた場合に除去
    correct = [label_re.sub('', c) for c in q.get('correctAnswers', [])]
    q['correctAnswers'] = correct
    # choices内のインデックスを計算して保存（テキスト変更後も正解を特定できるように）
    indices = [choices.index(ca) for ca in correct if ca in choices]
    if indices:
        q['correctAnswerIndices'] = indices
print(json.dumps({'examType': '${NEXT_EXAM}', 'questions': d.get('questions', [])}, ensure_ascii=False))
")

  HTTP_RESPONSE=$(curl -s -w "\n%{http_code}" \
    -X POST \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${ID_TOKEN}" \
    -d "$API_PAYLOAD" \
    "${API_ENDPOINT}/admin/questions")

  HTTP_BODY=$(echo "$HTTP_RESPONSE" | head -n -1)
  HTTP_CODE=$(echo "$HTTP_RESPONSE" | tail -n 1)

  if [ "$HTTP_CODE" -eq 200 ] || [ "$HTTP_CODE" -eq 201 ]; then
    CREATED_IDS=$(echo "$HTTP_BODY" | python3 -c "
import sys, json
d = json.loads(sys.stdin.read())
ids = d.get('created', [])
print(f'{len(ids)}件: ' + ', '.join(ids[:3]) + ('...' if len(ids) > 3 else ''))
" 2>/dev/null || echo "$HTTP_BODY")
    echo "✓ [${domain}] インポート成功: $CREATED_IDS"
    TOTAL_IMPORTED=$(( TOTAL_IMPORTED + Q_COUNT ))
  else
    echo "❌ [${domain}] API エラー (HTTP $HTTP_CODE): $HTTP_BODY"
  fi
  echo "  終了=$(date '+%H:%M:%S')  経過=$(( $(date +%s) - _DOMAIN_T0 ))秒"
  _DOMAIN_OFFSET=$(( _DOMAIN_OFFSET + 1 ))
done

echo ""
echo "合計インポート: ${TOTAL_IMPORTED}問 / ${TOTAL_QUESTIONS}問"

if [ $RATE_LIMITED -eq 1 ] || [ $TIMEOUT_HIT -eq 1 ]; then
  exit 1
fi

if [ $TOTAL_IMPORTED -gt 0 ]; then
  echo "インポート完了: $NEXT_EXAM +${TOTAL_IMPORTED}問"
fi

echo ""
echo "=========================================="
echo "完了: $(date)"
echo "=========================================="

} 2>&1 | tee -a "$LOG_FILE"

find "$LOG_DIR" -name "generate_*.log" -mtime +30 -delete 2>/dev/null || true
