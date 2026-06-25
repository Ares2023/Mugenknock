#!/bin/bash
# 問題自動生成スクリプト
# instructions/ 内の資格ごとの指示を元に Claude で問題を生成し API 経由でインポートする
# 現在の問題数が最も少ない資格を自動選択

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

# scripts/ 配下のどの深さに置かれても動作するパス解決
_d="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
while [ "$(basename "$_d")" != "scripts" ] && [ "$_d" != "/" ]; do _d="$(dirname "$_d")"; done
NIGHT_PROMPTS_DIR="$(dirname "$_d")"
LOG_DIR="$NIGHT_PROMPTS_DIR/logs"
INSTRUCTION_DIR="$_d/instructions"
STATE_DIR="$_d/state"
COUNT_CACHE_FILE="$STATE_DIR/question_counts.json"
API_ENDPOINT="https://a0q3656qw4.execute-api.ap-northeast-1.amazonaws.com/dev"
QUESTIONS_PER_DOMAIN=5
mkdir -p "$STATE_DIR"


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
REBUILD_COUNTS=0

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
    -R|--rebuild-counts)
      REBUILD_COUNTS=1
      shift
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

# ── ドメイン定義: instructions/*.txt の # DOMAINS: 行から動的に読み込む ─
# ドメイン名は公式試験ガイドの表記に完全一致させること（DynamoDB タグとして使用される）
# フォールバック用ハードコーディング（refresh-exam-guide.sh で随時更新される）
declare -A DOMAINS
_load_domains_from_instructions() {
  local exam="$1"
  local inst_file="${INSTRUCTION_DIR}/${exam}.txt"
  if [ -f "$inst_file" ]; then
    local d
    d=$(grep "^# DOMAINS:" "$inst_file" | head -1 | sed 's/^# DOMAINS: *//')
    [ -n "$d" ] && { echo "$d"; return; }
  fi
  # fallback（instructions/*.txt に # DOMAINS: がない場合）
  case "$exam" in
    CLF) echo "クラウドの概念,セキュリティとコンプライアンス,クラウドのテクノロジーとサービス,請求、料金、およびサポート" ;;
    SAA) echo "セキュアなアーキテクチャの設計,弾力性に優れたアーキテクチャの設計,高性能なアーキテクチャの設計,コスト最適化されたアーキテクチャの設計" ;;
    SAP) echo "組織の複雑さに対応する設計,新しいソリューションのための設計,既存のソリューションの継続的改善,ワークロードの移行とモダン化の加速" ;;
    DVA) echo "AWSのサービスを使用した開発,セキュリティ,デプロイ,トラブルシューティングと最適化" ;;
    SOA) echo "モニタリング、ロギング、分析、修復、およびパフォーマンスの最適化,信頼性とビジネス継続性,デプロイ、プロビジョニング、および自動化,セキュリティとコンプライアンス,ネットワークとコンテンツ配信" ;;
    DOP) echo "SDLC の自動化,構成管理と Infrastructure as Code (IaC),弾力性に優れたクラウドソリューション,モニタリングとロギング,インシデントとイベントへの対応,セキュリティとコンプライアンス" ;;
    AIF) echo "AIとMLの基礎,生成AIの基礎,基盤モデルのアプリケーション,責任あるAIのガイドライン,AIソリューションのセキュリティ、コンプライアンス、ガバナンス" ;;
    MLA) echo "機械学習のためのデータ準備,MLモデルの開発,MLワークフローのデプロイとオーケストレーション,MLソリューションの監視、メンテナンス、セキュリティ" ;;
    AIP) echo "基盤モデルの統合、データ管理、コンプライアンス,実装と統合,AIの安全性、セキュリティ、ガバナンス,生成AIアプリケーションの運用効率と最適化,テスト、検証、トラブルシューティング" ;;
    DEA) echo "データの取り込みと変換,データストアの管理,データオペレーションとサポート,データのセキュリティとガバナンス" ;;
    ANS) echo "ネットワーク設計,ネットワーク実装,ネットワーク管理と運用,ネットワークのセキュリティ、コンプライアンス、ガバナンス" ;;
    SCS) echo "検出,インシデント対応,インフラストラクチャのセキュリティ,アイデンティティとアクセス管理,データ保護,セキュリティの基盤とガバナンス" ;;
  esac
}

_get_exam_guide_url() {
  local exam="$1"
  local inst_file="${INSTRUCTION_DIR}/${exam}.txt"
  [ -f "$inst_file" ] && grep "^# EXAM_GUIDE_URL:" "$inst_file" | head -1 | sed 's/^# EXAM_GUIDE_URL: *//'
}

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
ORDER = ['CLF', 'SAA', 'SAP', 'DVA', 'SOA', 'DEA', 'DOP', 'AIF', 'MLA', 'AIP', 'ANS', 'SCS']
items = [l.strip() for l in sys.stdin if l.strip() and not l.strip().startswith('_')]
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
  _USE_CACHE=0
  if [ "$REBUILD_COUNTS" -eq 0 ] && [ -f "$COUNT_CACHE_FILE" ]; then
    # 全試験分のデータが揃っているときのみキャッシュ有効
    if python3 - "$COUNT_CACHE_FILE" "${EXAM_TYPES[@]}" << 'PYEOF' 2>/dev/null
import json, sys
with open(sys.argv[1]) as f:
    cache = json.load(f)
exams_data = cache.get("exams", {})
missing = [e for e in sys.argv[2:] if e not in exams_data]
if missing:
    raise SystemExit(f"missing: {missing}")
PYEOF
    then
      _USE_CACHE=1
    else
      echo "問題数キャッシュが不完全 → DynamoDBから再取得します..."
    fi
  fi

  if [ "$_USE_CACHE" -eq 1 ]; then
    echo "問題数キャッシュを使用..."
    read -r NEXT_EXAM MIN_COUNT <<< "$(python3 - "$COUNT_CACHE_FILE" "${EXAM_TYPES[@]}" << 'PYEOF'
import json, sys
with open(sys.argv[1]) as f:
    cache = json.load(f)
exams_data = cache.get("exams", {})
exam_types = sys.argv[2:]
min_count = 999999
next_exam = exam_types[0]
for e in exam_types:
    c = exams_data.get(e, {}).get("total", 0)
    print(f"  {e}: {c}問 (キャッシュ)", file=sys.stderr)
    if c < min_count:
        min_count = c
        next_exam = e
print(next_exam, min_count)
PYEOF
)"
    echo "選択: $NEXT_EXAM (現在${MIN_COUNT}問 — 最少)"
  else
    # DynamoDB から取得してキャッシュを再構築
    [ "$REBUILD_COUNTS" -eq 1 ] && echo "問題数キャッシュを再構築中..." || echo "キャッシュなし。DynamoDBから問題数を取得中..."
    MIN_COUNT=999999
    NEXT_EXAM="${EXAM_TYPES[0]}"
    declare -A _TMP_COUNTS
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
      _TMP_COUNTS[$exam]=$count
      if [ "$count" -lt "$MIN_COUNT" ]; then
        MIN_COUNT="$count"
        NEXT_EXAM="$exam"
      fi
    done
    echo "選択: $NEXT_EXAM (現在${MIN_COUNT}問 — 最少)"
    # キャッシュに保存（exam total のみ。domain 内訳は Phase2 クエリ後に更新）
    python3 - "$COUNT_CACHE_FILE" << PYEOF
import json, os
from datetime import datetime
f = "$COUNT_CACHE_FILE"
try:
    with open(f) as fp: cache = json.load(fp)
except: cache = {"exams": {}}
$(for exam in "${!_TMP_COUNTS[@]}"; do echo "cache.setdefault('exams', {}).setdefault('${exam}', {})['total'] = ${_TMP_COUNTS[$exam]}"; done)
cache["updated_at"] = datetime.now().isoformat()
with open(f, 'w') as fp: json.dump(cache, fp, ensure_ascii=False, indent=2)
PYEOF
  fi
fi

# ── ドメイン一覧を取得（instructions/*.txt の # DOMAINS: 行を優先）──
DOMAIN_STR=$(_load_domains_from_instructions "$NEXT_EXAM")
if [ -z "$DOMAIN_STR" ]; then
  echo "⚠️  $NEXT_EXAM のドメイン定義がありません（instructions/${NEXT_EXAM}.txt に # DOMAINS: 行を追加するか refresh-exam-guide.sh を実行してください）"
  exit 1
fi
EXAM_GUIDE_URL=$(_get_exam_guide_url "$NEXT_EXAM")
[ -n "$EXAM_GUIDE_URL" ] && echo "試験ガイドURL: $EXAM_GUIDE_URL"

IFS=',' read -ra DOMAIN_LIST <<< "$DOMAIN_STR"
DOMAIN_COUNT=${#DOMAIN_LIST[@]}

# ── ドメイン指定の解決 ────────────────────────────────────────
STATE_FILE="$STATE_DIR/last_domain_idx.json"

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
COMMON_RULES=$(cat "$INSTRUCTION_DIR/_common-rules.txt")

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
  --projection-expression "#dom, questionText" \
  --expression-attribute-names '{"#dom":"domain"}' \
  --output json 2>/dev/null > "$_EXISTING_TMP" || echo '{"Items":[]}' > "$_EXISTING_TMP"

EXISTING_QS_FILE=$(mktemp /tmp/existing_qs_XXXX.json)
_COUNTS_TMP_EARLY=$(mktemp /tmp/domain_counts_XXXX.json)

TAG_COUNT_TEXT=$(python3 - "$_EXISTING_TMP" "$EXISTING_QS_FILE" "$_COUNTS_TMP_EARLY" "$DOMAIN_STR" "$NEXT_EXAM" << 'PYEOF'
import json, sys, re
from collections import Counter, defaultdict

def norm(s):
    return re.sub(r'[\s　]+', ' ', s).strip()

EXAM_DOMAINS = {'CLF': ['クラウドの概念', 'セキュリティとコンプライアンス', 'クラウドのテクノロジーとサービス', '請求、料金、およびサポート'], 'SAA': ['セキュアなアーキテクチャの設計', '弾力性に優れたアーキテクチャの設計', '高性能なアーキテクチャの設計', 'コスト最適化されたアーキテクチャの設計'], 'SAP': ['組織の複雑さに対応する設計', '新しいソリューションのための設計', '既存のソリューションの継続的改善', 'ワークロードの移行とモダン化の加速'], 'DVA': ['AWSのサービスを使用した開発', 'セキュリティ', 'デプロイ', 'トラブルシューティングと最適化'], 'SOA': ['モニタリング、ロギング、分析、修復、およびパフォーマンスの最適化', '信頼性とビジネス継続性', 'デプロイ、プロビジョニング、および自動化', 'セキュリティとコンプライアンス', 'ネットワークとコンテンツ配信'], 'DOP': ['SDLC の自動化', '構成管理と Infrastructure as Code (IaC)', '弾力性に優れたクラウドソリューション', 'モニタリングとロギング', 'インシデントとイベントへの対応', 'セキュリティとコンプライアンス'], 'AIF': ['AIとMLの基礎', '生成AIの基礎', '基盤モデルのアプリケーション', '責任あるAIのガイドライン', 'AIソリューションのセキュリティ、コンプライアンス、ガバナンス'], 'MLA': ['機械学習のためのデータ準備', 'MLモデルの開発', 'MLワークフローのデプロイとオーケストレーション', 'MLソリューションの監視、メンテナンス、セキュリティ'], 'AIP': ['基盤モデルの統合、データ管理、コンプライアンス', '実装と統合', 'AIの安全性、セキュリティ、ガバナンス', '生成AIアプリケーションの運用効率と最適化', 'テスト、検証、トラブルシューティング'], 'DEA': ['データの取り込みと変換', 'データストアの管理', 'データオペレーションとサポート', 'データのセキュリティとガバナンス'], 'ANS': ['ネットワーク設計', 'ネットワーク実装', 'ネットワーク管理と運用', 'ネットワークのセキュリティ、コンプライアンス、ガバナンス'], 'SCS': ['検出', 'インシデント対応', 'インフラストラクチャのセキュリティ', 'アイデンティティとアクセス管理', 'データ保護', 'セキュリティの基盤とガバナンス']}

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
    qt = item.get('questionText', {}).get('S', '')
    domain_name = ''
    # 新形式: domain 整数インデックス → ドメイン名に変換
    # ※ examType はプロジェクションに含まれないため argv[5] で受け取る
    if 'N' in item.get('domain', {}):
        exam_type = sys.argv[5] if len(sys.argv) > 5 else ''
        try:
            idx = int(item['domain']['N'])
            domain_name = (EXAM_DOMAINS.get(exam_type, [])[idx:idx+1] or [''])[0]
        except (ValueError, IndexError):
            pass
    # 旧形式: tags リスト（後方互換）
    if not domain_name:
        tags_raw = item.get('tags', {})
        tags = []
        if 'L' in tags_raw:
            tags = [t.get('S', '').strip() for t in tags_raw['L'] if t.get('S', '').strip()]
        elif 'SS' in tags_raw:
            tags = [str(v).strip() for v in tags_raw['SS'] if str(v).strip()]
        if tags:
            domain_name = tags[0]
    if domain_name:
        counts[domain_name] += 1
        if qt:
            domain_qs[domain_name].append(qt)

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

# ── キャッシュにドメイン内訳を同期（DynamoDB の正確な値で上書き）────────────
python3 - "$COUNT_CACHE_FILE" "$NEXT_EXAM" "$_COUNTS_TMP_EARLY" << 'PYEOF' 2>/dev/null || true
import json, sys
from datetime import datetime
cache_file, exam, counts_file = sys.argv[1], sys.argv[2], sys.argv[3]
try:
    with open(counts_file, encoding='utf-8') as f:
        domain_counts = json.load(f)
except Exception:
    sys.exit(0)
try:
    with open(cache_file) as f:
        cache = json.load(f)
except Exception:
    cache = {"exams": {}}
entry = cache.setdefault("exams", {}).setdefault(exam, {})
entry["domains"] = domain_counts
entry["total"] = sum(domain_counts.values())
cache["updated_at"] = datetime.now().isoformat()
with open(cache_file, 'w') as f:
    json.dump(cache, f, ensure_ascii=False, indent=2)
PYEOF

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

# ドメイン指定なし時：割り当て数の降順（＝現在問題数の昇順）にROTATED_LISTをソート
# → トークン切れで途中スキップされても問題数の少ない重要ドメインを先に処理できる
if [ "$DOMAIN_ALLOC_SKIP" -eq 0 ]; then
  SORTED=()
  while IFS= read -r _d; do SORTED+=("$_d"); done < <(
    PYTHONIOENCODING=utf-8 python3 - "$_ALLOC_FILE" "${ROTATED_LIST[@]}" << 'PYEOF'
import json, sys
try:
    with open(sys.argv[1], encoding='utf-8') as f:
        alloc, _ = json.JSONDecoder().raw_decode(f.read().strip())
except Exception:
    alloc = {}
domains = sys.argv[2:]
for d in sorted(domains, key=lambda d: (-alloc.get(d, 0), d)):
    print(d)
PYEOF
  )
  ROTATED_LIST=("${SORTED[@]}")
  echo "処理順（問題数少ない順）: $(IFS=', '; echo "${ROTATED_LIST[*]}")"
fi

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

  # チャンク分割（試験の情報量に合わせたサイズ）
  # 8問なら 3×2+2×1=3回（旧: SAP/ANSは2×4=4回だったが3問に統一）
  case "$NEXT_EXAM" in
    SAP|ANS|SCS|DOP|SOA) CHUNK_SIZE=3; MIN_CHUNK_Q=2 ;;
    *) CHUNK_SIZE=5; MIN_CHUNK_Q=3 ;;
  esac
  CHUNKS_TOTAL=$(( (Q_FOR_DOMAIN + CHUNK_SIZE - 1) / CHUNK_SIZE ))
  # 端数チャンクが最低問題数を下回る場合、最初のチャンクに吸収（チャンク数を1減らす）
  _LAST_Q=$(( Q_FOR_DOMAIN % CHUNK_SIZE ))
  if [ "$_LAST_Q" -ne 0 ] && [ "$_LAST_Q" -lt "$MIN_CHUNK_Q" ] && [ "$CHUNKS_TOTAL" -gt 1 ]; then
    FIRST_CHUNK_SIZE=$(( CHUNK_SIZE + _LAST_Q ))
    CHUNKS_TOTAL=$(( CHUNKS_TOTAL - 1 ))
  else
    FIRST_CHUNK_SIZE=$CHUNK_SIZE
  fi
  echo ""
  if [ "$CHUNKS_TOTAL" -gt 1 ]; then
    echo "--- [${domain}] ${Q_FOR_DOMAIN}問 生成中 (${CHUNK_SIZE}問×${CHUNKS_TOTAL}チャンク) --- 開始=$(date '+%H:%M:%S')"
  else
    echo "--- [${domain}] ${Q_FOR_DOMAIN}問 生成中 --- 開始=$(date '+%H:%M:%S')"
  fi

  # このドメインの既存問題テキストを抽出（重量試験は件数・文字数を絞る）
  EXISTING_TEXTS=$(PYTHONIOENCODING=utf-8 python3 - "$EXISTING_QS_FILE" "$domain" "$NEXT_EXAM" << 'PYEOF'
import json, sys
try:
    with open(sys.argv[1]) as f:
        qs_by_domain = json.load(f)
except Exception:
    qs_by_domain = {}
exam = sys.argv[3] if len(sys.argv) > 3 else ''
max_qs = 10 if exam in ('SAP', 'ANS', 'SCS', 'DOP') else 20
max_ch = 40 if exam in ('SAP', 'ANS', 'SCS', 'DOP') else 55
texts = qs_by_domain.get(sys.argv[2], [])
if not texts:
    print('（まだ問題はありません）')
else:
    for t in texts[-max_qs:]:
        print('・' + t.replace('\n', ' ')[:max_ch])
PYEOF
)

  DOMAIN_IMPORTED=0
  STATE_UPDATED=0
  DOMAIN_RATE_LIMITED=0

  for (( _chunk=1; _chunk<=CHUNKS_TOTAL; _chunk++ )); do
    # このチャンクで生成する問題数（端数対応・最初のチャンクは増量調整あり）
    if [ "$_chunk" -eq 1 ]; then
      _CHUNK_Q=$FIRST_CHUNK_SIZE
      [ "$_CHUNK_Q" -gt "$Q_FOR_DOMAIN" ] && _CHUNK_Q=$Q_FOR_DOMAIN
    else
      _CHUNK_Q=$(( Q_FOR_DOMAIN - FIRST_CHUNK_SIZE - (_chunk - 2) * CHUNK_SIZE ))
      [ "$_CHUNK_Q" -gt "$CHUNK_SIZE" ] && _CHUNK_Q=$CHUNK_SIZE
    fi

    [ "$CHUNKS_TOTAL" -gt 1 ] && echo "  チャンク ${_chunk}/${CHUNKS_TOTAL}: ${_CHUNK_Q}問 生成中..."

    PROMPT_FILE=$(mktemp /tmp/gen_prompt_XXXX.txt)
    cat > "$PROMPT_FILE" << PROMPT
${INSTRUCTION}

【対象資格】${NEXT_EXAM}
【対象ドメイン】${domain}
【作成問題数】${_CHUNK_Q} 問
${EXAM_GUIDE_URL:+【公式試験ガイド】${EXAM_GUIDE_URL}
（上の「公式試験ガイド概要」は本ガイドから抽出・最新化済み。Web取得は不要。概要のタスク・対象サービスに基づいて作成すること）
}

【既存問題（重複・類似を避けること）】
${EXISTING_TEXTS}
→ 上記と異なるサービス・機能・ユースケース・出題角度で作成してください。

【出力形式】JSONのみ。説明文・前置き・コードブロック不要。

{"questions":[{"questionText":"問題文","choices":["選択肢0","選択肢1","選択肢2","選択肢3"],"correctAnswers":["正解の選択肢テキスト"],"correctAnswerIndices":[1],"explanation":"全体解説（200字程度）","choiceExplanations":["選択肢0の解説","選択肢1の解説","選択肢2の解説","選択肢3の解説"],"isMultiple":false},...]}

※ フォーマット規則:
- choices にラベル（A. B. 等）を付けない（テキストのみ）
- correctAnswers は choices と完全一致するテキスト
- correctAnswerIndices は choices 配列内のインデックス（0始まり）
- choiceExplanations は choices と同じ要素数・同じ順序（⚠最重要: choiceExplanations[i] は必ず choices[i] の選択肢を説明すること。順序ズレ厳禁）
  - 各選択肢の解説は 100〜150 字（短すぎ・1文のみは不可）
  - 正解選択肢: なぜ正解か（根拠から書き始める）
  - 不正解選択肢: なぜ不正解か（誤りの理由から書き始める）
  - 文頭に「正解です」「不正解です」などの判定文を入れない
- 複数正解: isMultiple true、correctAnswers/correctAnswerIndices を複数要素で
- ${_CHUNK_Q} 問を1つのJSONで返す。domain・tags フィールドは不要（インポート時にサーバー側でセットされる）。

【品質基準】
${COMMON_RULES}
PROMPT

    # WebFetch は使わない（公式ガイド概要は instructions/*.txt に埋め込み済み・refresh-exam-guide.sh で最新化）。
    # 毎チャンクのページ取得を止めてトークン消費とレート制限の逼迫を削減する。
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
    _RATE_IN_TEXT=0; echo "$_RESULT_HEAD" | grep -qiE "rate.?limit|too many requests|overload|quota exceeded|usage limit|resource_exhausted" && _RATE_IN_TEXT=1
    # claude -p が稀に exit 非ゼロを返すが questions JSON があれば成功扱い（誤検知防止）
    _HAS_QUESTIONS=0; echo "$RESULT" | grep -q '"questions"' && _HAS_QUESTIONS=1
    # ネットワーク接続エラーはレート制限ではなく一時的な障害として扱う（ロックファイルを作らない）
    _IS_NET_ERROR=0; echo "$_RESULT_HEAD" | grep -qiE "FailedToOpenSocket|connection refused|network error|socket|ECONNREFUSED|ETIMEDOUT" && _IS_NET_ERROR=1
    if [ $_RATE_IN_TEXT -eq 1 ] || { [ $AI_EXIT -ne 0 ] && [ $_HAS_QUESTIONS -eq 0 ]; }; then
      if echo "$_RESULT_HEAD" | grep -qiE "command not found|No such file|GEMINI_API_KEY|API.?key"; then
        echo "❌ claude 実行エラー（認証またはコマンド問題）。スクリプトを終了します"
        echo "出力: $_RESULT_HEAD"
        exit 1
      fi
      if [ $_IS_NET_ERROR -eq 1 ]; then
        echo "⚠️  ネットワーク接続エラー。残りをスキップ（レート制限ロックは作成しない）"
        echo "出力: $_RESULT_HEAD"
        DOMAIN_RATE_LIMITED=1
        break
      fi
      echo "⚠️  レート制限を検出。残りをスキップ"
      echo "出力: $_RESULT_HEAD"
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
label_re = re.compile(r'^[A-E][.\s]\s*', re.IGNORECASE)
valid = []
dropped = 0
for q in d.get('questions', []):
    # choices・correctAnswers 両方からラベル接頭辞を除去してから一致確認
    choices = [label_re.sub('', str(c)).strip() for c in q.get('choices', [])]
    q['choices'] = choices
    correct = [label_re.sub('', str(c)).strip() for c in q.get('correctAnswers', [])]
    q['correctAnswers'] = correct
    # 決定的バリデーション: 壊れた問題は取込前に除外（検証パスの負荷も減らす）
    #  - 選択肢4つ未満 / 重複選択肢あり / 正解なし / 正解が選択肢に存在しない
    if len(choices) < 4 or len(set(choices)) != len(choices) or not correct or any(ca not in choices for ca in correct):
        dropped += 1
        sys.stderr.write('  [DROP] 不正な問題を除外: ' + str(q.get('questionText',''))[:30] + '\n')
        continue
    # choices内のインデックスを計算して保存（テキスト変更後も正解を特定できるように）
    q['correctAnswerIndices'] = [choices.index(ca) for ca in correct]
    # isMultiple を正解数から決定的に設定（生成側の付け忘れ・誤りを防止）
    q['isMultiple'] = len(correct) > 1
    # choiceExplanations が choices と長さ不一致なら除去（検証パスで再生成される）
    ce = q.get('choiceExplanations', [])
    if ce and len(ce) != len(choices):
        del q['choiceExplanations']
    valid.append(q)
if dropped:
    sys.stderr.write('  取込前バリデーション: ' + str(dropped) + '件を除外\n')
print(json.dumps({'examType': '${NEXT_EXAM}', 'domain': '${domain}', 'questions': valid}, ensure_ascii=False))
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
      # キャッシュをインクリメント
      python3 - "$COUNT_CACHE_FILE" "$NEXT_EXAM" "$domain" "$Q_COUNT" << 'PYEOF' 2>/dev/null || true
import json, sys
from datetime import datetime
cache_file, exam, domain, n = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4])
try:
    with open(cache_file) as f: cache = json.load(f)
except Exception: cache = {"exams": {}}
entry = cache.setdefault("exams", {}).setdefault(exam, {})
entry["total"] = entry.get("total", 0) + n
entry.setdefault("domains", {})[domain] = entry["domains"].get(domain, 0) + n
cache["updated_at"] = datetime.now().isoformat()
with open(cache_file, 'w') as f: json.dump(cache, f, ensure_ascii=False, indent=2)
PYEOF
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

# ── 終了後キャッシュ再構築（DynamoDBから正確な値を取得）────────────────────
echo ""
echo "--- 問題数キャッシュを再構築中（DynamoDBから正確な値を取得）---"
declare -A _FINAL_COUNTS
_CACHE_VALID=1
for exam in "${EXAM_TYPES[@]}"; do
  count=$(aws dynamodb query \
    --table-name Questions \
    --index-name examType-index \
    --key-condition-expression "examType = :e" \
    --expression-attribute-values "{\":e\": {\"S\": \"$exam\"}}" \
    --select COUNT \
    --query 'Count' \
    --output text 2>&1 | awk '{s+=$1} END{print s+0}')
  count=${count:-0}
  # 全試験が0なら DynamoDB クエリ失敗とみなしキャッシュ更新をスキップ
  if [ "$count" -eq 0 ]; then _CACHE_VALID=0; fi
  _FINAL_COUNTS[$exam]=$count
  echo "  $exam: ${count}問"
done
if [ "$_CACHE_VALID" -eq 0 ] && [ "${#_FINAL_COUNTS[@]}" -gt 0 ]; then
  _total_sum=0
  for v in "${_FINAL_COUNTS[@]}"; do _total_sum=$(( _total_sum + v )); done
  if [ "$_total_sum" -eq 0 ]; then
    echo "⚠️  全試験が0問 — DynamoDBクエリ失敗の可能性。キャッシュ更新をスキップします"
    find "$LOG_DIR" -name "generate_*.log" -mtime +30 -delete 2>/dev/null || true
    exit 0
  fi
fi
python3 - "$COUNT_CACHE_FILE" << PYEOF
import json
from datetime import datetime
f = "$COUNT_CACHE_FILE"
try:
    with open(f) as fp: cache = json.load(fp)
except Exception: cache = {"exams": {}}
$(for exam in "${!_FINAL_COUNTS[@]}"; do echo "cache.setdefault('exams', {}).setdefault('${exam}', {})['total'] = ${_FINAL_COUNTS[$exam]}"; done)
cache["updated_at"] = datetime.now().isoformat()
with open(f, 'w') as fp: json.dump(cache, fp, ensure_ascii=False, indent=2)
PYEOF
echo "キャッシュ更新完了"

if [ $RATE_LIMITED -eq 1 ] || [ $TIMEOUT_HIT -eq 1 ]; then
  exit 1
fi

if [ $TOTAL_IMPORTED -gt 0 ]; then
  echo "インポート完了: $NEXT_EXAM +${TOTAL_IMPORTED}問"

  # Cloudflare Pages 再ビルドを2時間後にスケジュール
  # （手動実行・夜間実行どちらでも対応。複数回生成された場合は最後の完了から2時間にリセット）
  DEPLOY_HOOK="https://api.cloudflare.com/client/v4/pages/webhooks/deploy_hooks/7835a67a-386f-4874-b5d2-964556deea71"
  DEPLOY_UNIT="cloudflare-pages-deploy"
  # 既存スケジュールをキャンセルして新しく設定（最後の完了から2時間に更新）
  systemctl --user stop "${DEPLOY_UNIT}.service" 2>/dev/null || true
  systemctl --user reset-failed "${DEPLOY_UNIT}.service" 2>/dev/null || true
  if systemd-run --user --collect --on-active=7200 \
      --unit="$DEPLOY_UNIT" \
      --description="Cloudflare Pages Deploy Hook (scheduled)" \
      bash -c "curl -s -X POST '${DEPLOY_HOOK}' -o /dev/null -w 'CF Deploy: HTTP %{http_code}\n' && echo \"\$(date): CF Pages rebuild triggered\" >> /tmp/cloudflare-deploy.log" \
      2>/dev/null; then
    TRIGGER_TIME=$(date -d '+2 hours' '+%H:%M' 2>/dev/null || date -v+2H '+%H:%M' 2>/dev/null || echo "2時間後")
    echo "✓ Cloudflare Pages 再ビルドを ${TRIGGER_TIME} にスケジュールしました"
  else
    # systemd-runが使えない場合は即時フォールバック
    curl -s -X POST "$DEPLOY_HOOK" -o /dev/null -w "CF Deploy (即時): HTTP %{http_code}\n" 2>/dev/null \
      || echo "⚠ 再ビルドトリガー失敗"
  fi
fi

echo ""
echo "=========================================="
echo "完了: $(date)"
echo "=========================================="

} 2>&1 | tee -a "$LOG_FILE"

find "$LOG_DIR" -name "generate_*.log" -mtime +30 -delete 2>/dev/null || true