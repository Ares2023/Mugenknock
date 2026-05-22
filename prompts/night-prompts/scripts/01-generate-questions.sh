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
QUESTIONS_PER_DOMAIN=2

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

# ── ヘルプ ──────────────────────────────────────────────────
show_help() {
  local exams
  exams=$(ls "$INSTRUCTION_DIR"/*.txt 2>/dev/null | xargs -I{} basename {} .txt | tr '\n' ' ')
  cat << EOF
usage: $(basename "$0") [options]

  -e, --exam EXAM       生成する資格を指定（例: SAA, CLF, DOP）
                        省略時は問題数が最も少ない資格を自動選択
  -d, --domain DOMAIN   生成するドメインを指定（-e と組み合わせて使用）
                        部分一致で検索（例: "セキュリティ"）。省略時は全ドメインを処理
  -n, --questions N     1ドメインあたりの問題数（デフォルト: ${QUESTIONS_PER_DOMAIN}）
  -D, --deadline HH:MM  処理終了時間（JST）。この時刻を過ぎたドメインはスキップ
  -h, --help            このヘルプを表示

利用可能な資格: ${exams:-（instructions/ に .txt がありません）}
EOF
}

# ── 引数処理 ─────────────────────────────────────────────────
FORCE_EXAM=""
FORCE_DOMAIN=""
DEADLINE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    -e|--exam)
      FORCE_EXAM="${2:?--exam requires EXAM}"
      shift 2
      ;;
    -d|--domain)
      FORCE_DOMAIN="${2:?--domain requires DOMAIN}"
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
DOMAINS[GAI]="基盤モデルの統合、データ管理、コンプライアンス,実装と統合,AIの安全性、セキュリティ、ガバナンス,生成AIアプリケーションの運用効率と最適化,テスト、検証、トラブルシューティング"
DOMAINS[DEA]="データの取り込みと変換,データストアの管理,データオペレーションとサポート,データのセキュリティとガバナンス"
DOMAINS[ANS]="ネットワーク設計,ネットワーク実装,ネットワーク管理と運用,ネットワークのセキュリティ、コンプライアンス、ガバナンス"
DOMAINS[SCS]="検出,インシデント対応,インフラストラクチャのセキュリティ,アイデンティティとアクセス管理,データ保護,セキュリティの基盤とガバナンス"
DOMAINS[MLS]="データエンジニアリング,探索的データ分析,モデリング,機械学習の実装とオペレーション"

{
check_rate_limit
echo "=========================================="
echo "問題自動生成 開始: $(date)"
echo "=========================================="

# ── 対象資格の一覧を instructions/ から構築 ─────────────────
mapfile -t EXAM_TYPES < <(
  ls "$INSTRUCTION_DIR"/*.txt 2>/dev/null \
    | xargs -I{} basename {} .txt \
    | python3 -c "
import sys
ORDER = ['CLF', 'SAA', 'SAP', 'DVA', 'SOA', 'DEA', 'DOP', 'AIF', 'MLA', 'GAI', 'ANS', 'SCS', 'MLS']
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

# ── ドメイン指定の解決 ────────────────────────────────────────
STATE_DIR="$SCRIPT_DIR/state"
STATE_FILE="$STATE_DIR/last_domain_idx.json"
mkdir -p "$STATE_DIR"

if [ -n "$FORCE_DOMAIN" ]; then
  # 完全一致 → 部分一致（大文字小文字無視）の順で検索
  MATCHED_DOMAIN=""
  for d in "${DOMAIN_LIST[@]}"; do
    if [ "$d" = "$FORCE_DOMAIN" ]; then
      MATCHED_DOMAIN="$d"
      break
    fi
  done
  if [ -z "$MATCHED_DOMAIN" ]; then
    MATCH_COUNT=0
    for d in "${DOMAIN_LIST[@]}"; do
      if echo "$d" | grep -qiF "$FORCE_DOMAIN"; then
        MATCHED_DOMAIN="$d"
        MATCH_COUNT=$(( MATCH_COUNT + 1 ))
      fi
    done
    if [ "$MATCH_COUNT" -gt 1 ]; then
      echo "❌ --domain '$FORCE_DOMAIN' が複数のドメインに一致します。より具体的なキーワードを指定してください:"
      for d in "${DOMAIN_LIST[@]}"; do
        echo "$d" | grep -qiF "$FORCE_DOMAIN" && echo "  - $d"
      done
      exit 1
    fi
  fi
  if [ -z "$MATCHED_DOMAIN" ]; then
    echo "❌ --domain '$FORCE_DOMAIN' が $NEXT_EXAM のどのドメインにも一致しません"
    echo "利用可能なドメイン:"
    printf '  - %s\n' "${DOMAIN_LIST[@]}"
    exit 1
  fi
  ROTATED_LIST=("$MATCHED_DOMAIN")
  START_IDX=0
  TOTAL_QUESTIONS=$QUESTIONS_PER_DOMAIN
  echo "対象ドメイン: $MATCHED_DOMAIN  /  ${QUESTIONS_PER_DOMAIN}問"
  # ドメイン手動指定時は重み付け割り当て不要（ループ内でデフォルト値を使用）
  DOMAIN_ALLOC_SKIP=1
else
  DOMAIN_ALLOC_SKIP=0
  TOTAL_QUESTIONS=$(( QUESTIONS_PER_DOMAIN * DOMAIN_COUNT ))
  echo "ドメイン数: $DOMAIN_COUNT  /  基本 ${QUESTIONS_PER_DOMAIN}問/ドメイン（重み付きで配分）  /  合計予算 ${TOTAL_QUESTIONS}問"

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
fi

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
# questionText も一緒に取得し、既存問題リストとドメインカウントを同時に構築
_EXISTING_TMP=$(mktemp /tmp/existing_XXXX.json)
aws dynamodb query \
  --table-name Questions \
  --index-name examType-index \
  --key-condition-expression "examType = :e" \
  --expression-attribute-values "{\":e\": {\"S\": \"$NEXT_EXAM\"}}" \
  --projection-expression "tags, questionText" \
  --output json 2>/dev/null > "$_EXISTING_TMP" || echo '{"Items":[]}' > "$_EXISTING_TMP"

EXISTING_QS_FILE=$(mktemp /tmp/existing_qs_XXXX.json)
_COUNTS_TMP_EARLY=$(mktemp /tmp/domain_counts_XXXX.json)

TAG_COUNT_TEXT=$(python3 - "$_EXISTING_TMP" "$EXISTING_QS_FILE" "$_COUNTS_TMP_EARLY" "$DOMAIN_STR" << 'PYEOF'
import json, sys, re
from collections import Counter, defaultdict

def norm(s):
    return re.sub(r'[\s　]+', ' ', s).strip()

# AWS CLI paginates DynamoDB output as multiple concatenated JSON objects
_all_items = []
with open(sys.argv[1]) as _f:
    _content = _f.read()
_dec = json.JSONDecoder()
_pos = 0
while _pos < len(_content):
    _skip = _content.find('{', _pos)
    if _skip == -1:
        break
    try:
        _obj, _end = _dec.raw_decode(_content, _skip)
        _all_items.extend(_obj.get('Items', []))
        _pos = _end
    except Exception:
        break
data = {'Items': _all_items}

# ドメイン名セット（正規化済み）― これ以外のタグは割り当て計算・プロンプト表示から除外
domain_set = {norm(d.strip()) for d in sys.argv[4].split(',')} if len(sys.argv) > 4 else set()

counts = Counter()
domain_qs = defaultdict(list)

for item in data.get('Items', []):
    tags_raw = item.get('tags', {})
    qt = item.get('questionText', {}).get('S', '')
    tags = []
    if 'L' in tags_raw:
        tags = [t.get('S', '').strip() for t in tags_raw['L'] if t.get('S', '').strip()]
    elif 'SS' in tags_raw:
        tags = [str(v).strip() for v in tags_raw['SS'] if str(v).strip()]
    for tag in tags:
        counts[tag] += 1
        if qt:
            domain_qs[tag].append(qt)

# ドメイン名のみのカウント（逆数割り当て計算用）
domain_counts = {k: v for k, v in counts.items() if norm(k) in domain_set} if domain_set else dict(counts)

# EXISTING_QS_FILE は全タグ保持（EXISTING_TEXTS のルックアップで使うため）
with open(sys.argv[2], 'w', encoding='utf-8') as f:
    json.dump({k: v[-60:] for k, v in domain_qs.items()}, f, ensure_ascii=False)
# _COUNTS_TMP_EARLY はドメイン名のみ（割り当て計算の入力）
with open(sys.argv[3], 'w', encoding='utf-8') as f:
    json.dump(domain_counts, f, ensure_ascii=False)

# プロンプトへの表示もドメイン名のみ
if domain_counts:
    for k, v in sorted(domain_counts.items(), key=lambda x: x[1]):
        print(f'  {k}: {v}問')
else:
    print('  （まだ問題がありません）')
PYEOF
)
rm -f "$_EXISTING_TMP"
echo "$TAG_COUNT_TEXT"

# ── 逆数重みによるドメイン別問題数割り当て ──────────────────────────────────
# ドメイン指定時はスキップ（QUESTIONS_PER_DOMAIN をそのまま使用）
if [ "$DOMAIN_ALLOC_SKIP" -eq 0 ]; then
  # 総予算 (TOTAL_QUESTIONS) を各ドメインの現在問題数の逆数で按分する
  # 問題数が少ないドメインほど多く割り当て、最低1問/ドメインを保証
  # 表示はstderrへ(outer 2>&1|teeでログに記録)、JSONはstdoutへ($()でキャプチャ)
  echo ""
  echo "ドメイン別生成数（逆数重み付き割り当て）:"

  DOMAIN_ALLOC_JSON=$(PYTHONIOENCODING=utf-8 python3 - "$DOMAIN_STR" "$_COUNTS_TMP_EARLY" "$TOTAL_QUESTIONS" << 'PYEOF'
import json, sys, re

def norm(s):
    return re.sub(r'[\s　]+', ' ', s).strip()

domains = [d.strip() for d in sys.argv[1].split(',')]
total   = int(sys.argv[3])
try:
    with open(sys.argv[2], encoding='utf-8') as f:
        raw_counts = json.load(f)
    counts = {norm(k): v for k, v in raw_counts.items()}
except Exception:
    counts = {}

# 最小数0（全予算を格差解消に充てる）
alloc = {d: 0 for d in domains}
remaining = total

# レベル埋めアルゴリズム:
#   最も問題数が少ないドメイン群を「次のティア」まで引き上げることを繰り返し、
#   差を積極的に縮める（逆数重みより格差解消効果が大きい）
def cur(d):
    return counts.get(norm(d), 0) + alloc[d]

while remaining > 0:
    min_val  = min(cur(d) for d in domains)
    at_min   = [d for d in domains if cur(d) == min_val]
    above    = [d for d in domains if cur(d) > min_val]

    if not above:
        # 全ドメイン同じ水準 → 現在の少ない順に1問ずつ配分
        sorted_d = sorted(domains, key=lambda d: counts.get(norm(d), 0))
        for i in range(remaining):
            alloc[sorted_d[i % len(sorted_d)]] += 1
        remaining = 0
        break

    next_level   = min(cur(d) for d in above)
    needed_per   = next_level - min_val
    needed_total = needed_per * len(at_min)

    if needed_total <= remaining:
        # at_min 全員を next_level まで引き上げる
        for d in at_min:
            alloc[d] += needed_per
        remaining -= needed_total
    else:
        # 予算不足: at_min に均等配分（余り分は現在数の少ない順に +1）
        each  = remaining // len(at_min)
        extra = remaining % len(at_min)
        for i, d in enumerate(sorted(at_min, key=lambda d: counts.get(norm(d), 0))):
            alloc[d] += each + (1 if i < extra else 0)
        remaining = 0

# 表示をstderrに出力(ログに記録される)
for d, n in sorted(alloc.items(), key=lambda x: -x[1]):
    print(f'  {n}問 → {d} (現在{counts.get(norm(d), 0)}問)', file=sys.stderr)
print(f'  合計: {sum(alloc.values())}問', file=sys.stderr)

# JSONをstdoutに出力($()でキャプチャ)
print(json.dumps(alloc))
PYEOF
  )
  rm -f "$_COUNTS_TMP_EARLY"
  DOMAIN_ALLOC_JSON="${DOMAIN_ALLOC_JSON:-{}}"
else
  rm -f "$_COUNTS_TMP_EARLY"
  DOMAIN_ALLOC_JSON="{}"
fi

# 割り当て結果をファイルに保存（ループ内で sys.argv 経由でルックアップするため）
_ALLOC_FILE=$(mktemp /tmp/alloc_XXXX.json)
printf '%s\n' "$DOMAIN_ALLOC_JSON" > "$_ALLOC_FILE"

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
  # このドメインの割り当て問題数を取得（日本語をソースコードに埋め込まず sys.argv で渡す）
  Q_FOR_DOMAIN=$(PYTHONIOENCODING=utf-8 python3 - "$domain" "$QUESTIONS_PER_DOMAIN" "$_ALLOC_FILE" << 'PYEOF'
import json, sys
domain, default, alloc_file = sys.argv[1], int(sys.argv[2]), sys.argv[3]
try:
    with open(alloc_file, encoding='utf-8') as f:
        content = f.read().strip()
    alloc, _ = json.JSONDecoder().raw_decode(content)
except Exception as e:
    print(f'[WARN] alloc parse error: {e}', file=sys.stderr)
    alloc = {}
print(alloc.get(domain, default))
PYEOF
  )

  # チャンク分割（出力トークン上限回避のため5問ずつ生成）
  CHUNK_SIZE=5
  CHUNKS_TOTAL=$(( (Q_FOR_DOMAIN + CHUNK_SIZE - 1) / CHUNK_SIZE ))
  echo ""
  if [ "$CHUNKS_TOTAL" -gt 1 ]; then
    echo "--- [${domain}] ${Q_FOR_DOMAIN}問 生成中 (${CHUNK_SIZE}問×${CHUNKS_TOTAL}チャンク) --- 開始=$(date '+%H:%M:%S')"
  else
    echo "--- [${domain}] ${Q_FOR_DOMAIN}問 生成中 --- 開始=$(date '+%H:%M:%S')"
  fi

  # このドメインの既存問題テキスト（先頭80文字）を抽出
  EXISTING_TEXTS=$(PYTHONIOENCODING=utf-8 python3 - "$EXISTING_QS_FILE" "$domain" << 'PYEOF'
import json, sys
try:
    with open(sys.argv[1]) as f:
        qs_by_domain = json.load(f)
except Exception:
    qs_by_domain = {}
texts = qs_by_domain.get(sys.argv[2], [])
if not texts:
    print('（まだ問題はありません）')
else:
    for t in texts[-50:]:
        print('・' + t.replace('\n', ' ')[:80])
PYEOF
)

  DOMAIN_IMPORTED=0
  STATE_UPDATED=0
  DOMAIN_RATE_LIMITED=0

  for (( _chunk=1; _chunk<=CHUNKS_TOTAL; _chunk++ )); do
    # このチャンクで生成する問題数（端数対応）
    _CHUNK_Q=$(( Q_FOR_DOMAIN - (_chunk - 1) * CHUNK_SIZE ))
    [ "$_CHUNK_Q" -gt "$CHUNK_SIZE" ] && _CHUNK_Q=$CHUNK_SIZE

    [ "$CHUNKS_TOTAL" -gt 1 ] && echo "  チャンク ${_chunk}/${CHUNKS_TOTAL}: ${_CHUNK_Q}問 生成中..."

    PROMPT_FILE=$(mktemp /tmp/gen_prompt_XXXX.txt)
    cat > "$PROMPT_FILE" << PROMPT
${INSTRUCTION}

【対象資格】${NEXT_EXAM}
【対象ドメイン】${domain}
【作成問題数】${_CHUNK_Q} 問

【現在のドメイン別問題数 — 参考情報】
※ 対象ドメインはスクリプトが自動選択しています。今回は【対象ドメイン】の問題を作成してください。
${TAG_COUNT_TEXT}
→ 上記はドメインごとの総数です。今回の対象ドメイン「${domain}」の中で、まだカバーできていないAWSサービス・概念・ユースケースを中心に出題してください。

【このドメインの既存問題（重複・類似を避けること）】
${EXISTING_TEXTS}
→ 上記とは異なるAWSサービス・機能・ユースケース・出題角度の問題を作成してください。同じサービスを扱う場合でも、別の機能・設定・ユースケース・落とし穴に焦点を当ててください。

【出力形式】
以下の JSON 形式のみで出力してください。説明文・前置き・コードブロックは不要です。

{"questions":[
  {
    "questionText": "問題文（日本語）",
    "choices": ["選択肢A", "選択肢B", "選択肢C", "選択肢D"],
    "correctAnswers": ["正解の選択肢"],
    "explanation": "解説（日本語）",
    "tags": ["${domain}"],
    "isMultiple": false
  },
  ...
]}

※ 複数正解の場合は isMultiple: true、correctAnswers に複数入れる
※ tags は必ず ["${domain}"] にする
※ ${_CHUNK_Q} 問を1つの JSON で返す
※ AWSに直接関係しない一般的でない略語には注釈・解説をつけること（AWSの資格勉強とは直接関係しないため）
※ correctAnswers は choices 配列の該当要素テキストと完全一致させること（「A. 」「B. 」などの記号接頭辞を付けないこと）
※ 解説は正解の根拠と各不正解選択肢がなぜ誤りかを個別に説明すること（全体200〜400字程度）
※ 解説は適宜改行を入れて読みやすくすること。特に各選択肢の説明は「選択肢Aは〜」「選択肢Bは〜」のように選択肢ごとに改行して記述すること
※ 現行のAWSサービス・機能のみを出題すること（廃止・EOL済みのサービスは使わないこと）
PROMPT

    RESULT=$("$CLAUDE_CMD" -p < "$PROMPT_FILE" 2>&1)
    AI_EXIT=$?
    # npm更新による一時的なバイナリ消失 → 再探索してリトライ
    if [ $AI_EXIT -ne 0 ] && echo "$RESULT" | grep -q "No such file"; then
      CLAUDE_CMD=$(_find_claude)
      [ -x "${CLAUDE_CMD:-}" ] && { RESULT=$("$CLAUDE_CMD" -p < "$PROMPT_FILE" 2>&1); AI_EXIT=$?; }
    fi
    rm -f "$PROMPT_FILE"

    # エラー判定は出力の先頭3行のみを対象にする
    # （問題文・解説中に rate limit / API key 等のフレーズが含まれても誤検知しないため）
    _RESULT_HEAD=$(echo "$RESULT" | head -3)
    if [ $AI_EXIT -ne 0 ] || echo "$_RESULT_HEAD" | grep -qiE "rate.?limit|too many requests|overload|quota exceeded|usage limit|resource_exhausted"; then
      if echo "$_RESULT_HEAD" | grep -qiE "command not found|No such file|GEMINI_API_KEY|API.?key"; then
        echo "❌ claude 実行エラー（認証またはコマンド問題）。スクリプトを終了します"
        echo "出力: $_RESULT_HEAD"
        exit 1
      fi
      echo "⚠️  レート制限を検出。残りをスキップ"
      echo "出力: $_RESULT_HEAD"
      record_rate_limit "$(echo "$RESULT" | head -5)"
      DOMAIN_RATE_LIMITED=1
      break
    fi

    # 1チャンク目成功時のみ state を更新（ドメイン手動指定時は更新しない）
    if [ "$DOMAIN_ALLOC_SKIP" -eq 0 ] && [ "$STATE_UPDATED" -eq 0 ]; then
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
      STATE_UPDATED=1
    fi

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
      echo "❌ [${domain}] チャンク${_chunk} JSON抽出失敗。スキップ"
      echo "$RESULT" | head -c 300
      continue
    fi

    echo "  抽出: ${Q_COUNT}問 → APIインポート中..."

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
      echo "  ✓ チャンク${_chunk} インポート成功: $CREATED_IDS"
      DOMAIN_IMPORTED=$(( DOMAIN_IMPORTED + Q_COUNT ))
    else
      echo "  ❌ チャンク${_chunk} API エラー (HTTP $HTTP_CODE): $HTTP_BODY"
    fi
  done  # チャンクループ終了

  if [ "$DOMAIN_RATE_LIMITED" -eq 1 ]; then
    echo "  終了=$(date '+%H:%M:%S')  経過=$(( $(date +%s) - _DOMAIN_T0 ))秒"
    RATE_LIMITED=1
    break
  fi

  echo "  [${domain}] 合計 ${DOMAIN_IMPORTED}/${Q_FOR_DOMAIN}問 インポート"
  TOTAL_IMPORTED=$(( TOTAL_IMPORTED + DOMAIN_IMPORTED ))
  echo "  終了=$(date '+%H:%M:%S')  経過=$(( $(date +%s) - _DOMAIN_T0 ))秒"
  _DOMAIN_OFFSET=$(( _DOMAIN_OFFSET + 1 ))
done

rm -f "$EXISTING_QS_FILE" "$_ALLOC_FILE"

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
