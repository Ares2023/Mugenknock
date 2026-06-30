#!/bin/bash
# AWS問題の正当性チェックスクリプト
# 問題なし→確認日のみ更新 / 問題あり→自動修正またはDB削除

set -uo pipefail

export PATH="/home/yuzuki/local/bin:/home/sera/.config/nvm/versions/node/v20.20.2/bin:$PATH"
unset ANTHROPIC_API_KEY

# ドメイン定義の単一マスタ（フロント src/data/examDomains.json と共通）。
# 未設定なら本スクリプト位置から解決。python ブロックはこの env を読む（無ければ埋め込みdictにフォールバック）。
_EDR_SD="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd 2>/dev/null || true)"
export EXAM_DOMAINS_JSON_PATH="${EXAM_DOMAINS_JSON_PATH:-${_EDR_SD}/../../../src/data/examDomains.json}"

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
INSTRUCTION_DIR="$_d/instructions"
LOG_DIR="$NIGHT_PROMPTS_DIR/logs"

# 資格コード → 公式試験ガイドURL（instructions/*.txt の # EXAM_GUIDE_URL: 行から読む）
_get_exam_guide_url() {
  local exam="$1"
  local inst_file="${INSTRUCTION_DIR}/${exam}.txt"
  [ -f "$inst_file" ] && grep "^# EXAM_GUIDE_URL:" "$inst_file" | head -1 | sed 's/^# EXAM_GUIDE_URL: *//'
}
mkdir -p "$LOG_DIR"
DATE=$(date '+%Y%m%d_%H%M%S')
LOG_FILE="$LOG_DIR/validity_${DATE}.log"


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
echo "=========================================="
echo "正当性チェック開始: $(date)"
echo "バッチサイズ: ${BATCH_SIZE}問 / チャンクサイズ: ${CHUNK_SIZE}問"
echo "=========================================="

# ── 1. DynamoDBから問題を取得 ──────────────────────────────────
DYNAMO_TMP=$(mktemp /tmp/dynamo_XXXX.json)
if ! aws dynamodb scan --table-name Questions --output json > "$DYNAMO_TMP" 2>&1; then
  echo "❌ DynamoDB scan 失敗:"
  head -5 "$DYNAMO_TMP"
  rm -f "$DYNAMO_TMP"
  exit 1
fi
if [ ! -s "$DYNAMO_TMP" ]; then
  echo "❌ DynamoDB scan: レスポンスが空です（ネットワーク障害の可能性）"
  rm -f "$DYNAMO_TMP"
  exit 1
fi

QUESTIONS_JSON=$(BATCH_SIZE=$BATCH_SIZE DYNAMO_TMP="$DYNAMO_TMP" python3 << 'PYEOF'
import json, os, sys
from datetime import datetime, timezone, timedelta

AWS_EXAM_TYPES = {'CLF','AIF','SAA','DVA','SOA','DEA','MLA','SAP','DOP','AIP','ANS','SCS'}

with open(os.environ['DYNAMO_TMP']) as f:
    content = f.read()
if not content.strip():
    sys.stderr.write("❌ DynamoDB レスポンスが空です\n")
    sys.exit(1)
try:
    data = json.loads(content)
except json.JSONDecodeError as e:
    sys.stderr.write(f"❌ JSON パース失敗: {e}\n")
    sys.exit(1)
items = data.get('Items', [])
# AWS以外の試験種別（OCIAA等）を除外
items = [it for it in items if it.get('examType', {}).get('S', '') in AWS_EXAM_TYPES or 'examType' not in it]

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
  if [ -z "$QUESTIONS_JSON" ]; then
    echo "❌ 問題取得失敗（DynamoDB scan またはパースエラー）"
    exit 1
  fi
  echo "チェック対象なし（全問が直近にチェック済み）"
  exit 0
fi

# ── 前処理: choices のラベル接頭辞自動除去（Claude 不要・確定的修正） ──
echo "前処理: choices ラベル接頭辞チェック..."
_PRE_TMP=$(mktemp /tmp/validity_pre_XXXX.json)
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

# 公式試験ガイドURLマップを instructions/*.txt から構築
EXAM_GUIDE_URLS_JSON=$(INST_DIR="$INSTRUCTION_DIR" python3 << 'PYEOF'
import os, json
inst_dir = os.environ.get('INST_DIR', '')
urls = {}
if inst_dir and os.path.isdir(inst_dir):
    for fname in os.listdir(inst_dir):
        if not fname.endswith('.txt') or fname.startswith('_'):
            continue
        exam = fname[:-4]
        path = os.path.join(inst_dir, fname)
        try:
            with open(path) as f:
                for line in f:
                    if line.startswith('# EXAM_GUIDE_URL:'):
                        urls[exam] = line.split(':', 1)[1].strip()
                        break
        except Exception:
            pass
print(json.dumps(urls, ensure_ascii=False))
PYEOF
)
# JSON取得失敗時のフォールバック
[ -z "$EXAM_GUIDE_URLS_JSON" ] && EXAM_GUIDE_URLS_JSON='{}'

# 自動改良で追記される追加確認観点（audit-questions.sh -i が編集）。存在すればプロンプトに注入。
VALIDITY_EXTRA=""
[ -f "$INSTRUCTION_DIR/_validity-extra.txt" ] && VALIDITY_EXTRA="$(cat "$INSTRUCTION_DIR/_validity-extra.txt")"

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
  EXAM_GUIDE_URLS_JSON_ESC="$EXAM_GUIDE_URLS_JSON" VALIDITY_EXTRA="$VALIDITY_EXTRA" python3 - "$chunk_file" > "$PROMPT_FILE" << 'PYEOF'
import json, sys, os
with open(sys.argv[1]) as f:
    questions = json.load(f)
# A(再有効化): 検証ゲートでは WebFetch を許可し、現行性が不確かな場合のみ公式ドキュメントで裏取りさせる。
#   生成・検証が同じモデル知識のみだと「同じ思い込みの事実誤り」を素通りさせるため、
#   ゲート側だけ外部の正解突き合わせ手段を残す。トークン抑制のためチャンク内に実在する資格のURLだけ添える。
exam_guide_urls = json.loads(os.environ.get('EXAM_GUIDE_URLS_JSON_ESC', '{}') or '{}')
_chunk_exam_set = set(q.get('examType', '') for q in questions)
_chunk_urls = {k: v for k, v in exam_guide_urls.items() if k in _chunk_exam_set}
url_note = ''
if _chunk_urls:
    url_lines = '\n'.join(f'  {k}: {v}' for k, v in sorted(_chunk_urls.items()))
    url_note = f'\n【公式試験ガイドURL（出題範囲・現行性の確認に使用してよい）】\n{url_lines}\n'
PROMPT_HEADER = 'あなたはAWS認定試験の問題品質チェッカーです。\n以下の問題を精査し、資格勉強サイトの問題として適切かどうか確認してください。' + url_note + '\n【確認観点】\n- 現在のAWSサービスの仕様・機能と一致しているか（廃止サービスを現行として扱っていないか）。サービスの現行仕様・廃止/非推奨状況・推奨構成・上限値や課金モデルなどに少しでも確信が持てない場合は、推測で判断せず WebFetch で公式AWSドキュメント（docs.aws.amazon.com / aws.amazon.com 等）を確認してから ok/fix/delete を判定すること。確信がある一般的事実までは取得不要（毎回の取得は避け、不確かな点のみ確認する）。ただし CodeCommit は現行サービスであり廃止扱いにしないこと（CodeCommit を理由に delete/fix しない）\n- 正解が正しく、選択肢に正解が含まれているか\n- correctAnswers の各要素が choices のいずれかと完全一致しているか（「A. 」「B. 」などの記号接頭辞が付いていないか）。不一致の場合は fix で修正する\n- 解説が正確で適切か。ダミーの選択肢がだめな理由も解説しているか\n- 解説は適宜改行を入れて読みやすいか。各選択肢の説明が「選択肢Aは〜」「選択肢Bは〜」のように選択肢ごとに改行して記述されているか。されていない場合は fix で修正すること\n- 問題文（questionText）が適切に改行されているか。要件・条件を列挙する場合や複数の操作ステップがある場合は改行（\\n）が使われているか。されていない場合は fix で修正すること\n- 試験問題として適切な形式・難易度か\n- AWSに直接関係しない一般的でない略語に注釈・解説がついているか（ない場合は問題文または解説に補足を追加する）\n- タグ（出題ドメイン）が正しく設定されているか。タグが空・欠落・下記ドメイン外の値の場合はfixで正しいドメインを設定すること\n  CLF: クラウドの概念 / セキュリティとコンプライアンス / クラウドのテクノロジーとサービス / 請求、料金、およびサポート\n  SAA: セキュアなアーキテクチャの設計 / 弾力性に優れたアーキテクチャの設計 / 高性能なアーキテクチャの設計 / コスト最適化されたアーキテクチャの設計\n  SAP: 組織の複雑さに対応する設計 / 新しいソリューションのための設計 / 既存のソリューションの継続的改善 / ワークロードの移行とモダン化の加速\n  DOP: SDLC の自動化 / 構成管理と Infrastructure as Code (IaC) / 弾力性に優れたクラウドソリューション / モニタリングとロギング / インシデントとイベントへの対応 / セキュリティとコンプライアンス\n  DVA: AWSのサービスを使用した開発 / セキュリティ / デプロイ / トラブルシューティングと最適化\n  SOA: モニタリング、ロギング、分析、修復、およびパフォーマンスの最適化 / 信頼性とビジネス継続性 / デプロイ、プロビジョニング、および自動化 / セキュリティとコンプライアンス / ネットワークとコンテンツ配信\n  DEA: データの取り込みと変換 / データストアの管理 / データオペレーションとサポート / データのセキュリティとガバナンス\n  AIF: AIとMLの基礎 / 生成AIの基礎 / 基盤モデルのアプリケーション / 責任あるAIのガイドライン / AIソリューションのセキュリティ、コンプライアンス、ガバナンス\n  MLA: 機械学習のためのデータ準備 / MLモデルの開発 / MLワークフローのデプロイとオーケストレーション / MLソリューションの監視、メンテナンス、セキュリティ\n  AIP: 基盤モデルの統合、データ管理、コンプライアンス / 実装と統合 / AIの安全性、セキュリティ、ガバナンス / 生成AIアプリケーションの運用効率と最適化 / テスト、検証、トラブルシューティング\n  ANS: ネットワーク設計 / ネットワーク実装 / ネットワーク管理と運用 / ネットワークのセキュリティ、コンプライアンス、ガバナンス\n  SCS: 検出 / インシデント対応 / インフラストラクチャのセキュリティ / アイデンティティとアクセス管理 / データ保護 / セキュリティの基盤とガバナンス\n- isMultiple フラグが正しいか。correctAnswers が複数なら isMultiple: true、1つなら isMultiple: false であること。不一致の場合は fix で修正する\n- 解説の文字数が極端に短くないか（目安100字未満は不足）。短い場合は fix で解説を補足・拡充すること\n- choiceExplanations が choices と同じ長さかどうか（未設定または長さ不一致の場合は fix で choiceExplanations を生成・修正する。正解選択肢はなぜ正解かを、不正解選択肢はなぜ不正解かを100〜150字程度で記述。文頭に「正解です」「不正解です」などの判定文を入れない）\n- choiceExplanations[i] の説明内容が choices[i] の選択肢テキストと対応しているか（順番対応チェック）。「選択肢別解説」として渡された各インデックスの解説が、同じインデックスの選択肢について説明しているかを確認すること。内容がずれている場合（例: choices[0]がマルチAZ配置なのに choiceExplanations[0] がリードレプリカについて説明しているなど）は fix で choiceExplanations を正しい順番に並び替えること\n- 正解の選択肢の文字数が不正解の選択肢群から浮いていないか（正解だけが著しく長い・短いと文字数から正解が推測できてしまう。正解の文字数が不正解の平均文字数と大きく乖離している場合は fix で正解・不正解の文章量を揃えること）\n\n【アクション】\n- "ok": 問題なし（確認日のみ更新）\n- "fix": 問題あり・修正可能（修正後の内容を含める。変更する項目のみ）\n- "delete": 修正不可能な致命的問題（正解が選択肢に存在しない、完全に誤った情報など）\n\n【出力形式】\n必ず以下のJSONのみを出力してください。説明文・前置きは不要です。\n\n{"results":[\n  {"questionId":"...","action":"ok","reason":"日本語100字以内"},\n  {"questionId":"...","action":"fix","reason":"...","fix":{"questionText":"修正後（変更する場合のみ）","choices":["A","B","C","D"],"correctAnswers":["正解（choices配列内の完全一致テキスト、記号接頭辞なし）"],"explanation":"修正後解説（変更する場合のみ）","choiceExplanations":["選択肢0の解説","選択肢1の解説","選択肢2の解説","選択肢3の解説"],"tags":["出題ドメイン（変更する場合のみ）"],"isMultiple":true}},\n  {"questionId":"...","action":"delete","reason":"..."}\n]}\n\n【問題リスト】'
# 自動改良された追加確認観点を注入（audit-questions.sh -i が _validity-extra.txt を更新）
_extra = (os.environ.get('VALIDITY_EXTRA', '') or '').strip()
if _extra:
    PROMPT_HEADER = PROMPT_HEADER.replace('\n\n【問題リスト】', '\n\n【追加の確認観点（監査による自動改良）】\n' + _extra + '\n\n【問題リスト】')
# B: チャンク内に実在する資格のドメイン表だけ残す（他資格の "  XXX: ..." 行を削除しトークン削減）
import re as _re
_chunk_exams = set(q.get('examType', '') for q in questions)
PROMPT_HEADER = _re.sub(r'\n  ([A-Z]{2,4}): [^\n]+',
                        lambda m: m.group(0) if m.group(1) in _chunk_exams else '',
                        PROMPT_HEADER)
lines = [PROMPT_HEADER]
EXAM_DOMAINS_LOCAL = {'CLF': ['クラウドの概念', 'セキュリティとコンプライアンス', 'クラウドのテクノロジーとサービス', '請求、料金、およびサポート'], 'SAA': ['セキュアなアーキテクチャの設計', '弾力性に優れたアーキテクチャの設計', '高性能なアーキテクチャの設計', 'コスト最適化されたアーキテクチャの設計'], 'SAP': ['組織の複雑さに対応する設計', '新しいソリューションのための設計', '既存のソリューションの継続的改善', 'ワークロードの移行とモダン化の加速'], 'DVA': ['AWSのサービスを使用した開発', 'セキュリティ', 'デプロイ', 'トラブルシューティングと最適化'], 'SOA': ['モニタリング、ロギング、分析、修復、およびパフォーマンスの最適化', '信頼性とビジネス継続性', 'デプロイ、プロビジョニング、および自動化', 'セキュリティとコンプライアンス', 'ネットワークとコンテンツ配信'], 'DOP': ['SDLC の自動化', '構成管理と Infrastructure as Code (IaC)', '弾力性に優れたクラウドソリューション', 'モニタリングとロギング', 'インシデントとイベントへの対応', 'セキュリティとコンプライアンス'], 'AIF': ['AIとMLの基礎', '生成AIの基礎', '基盤モデルのアプリケーション', '責任あるAIのガイドライン', 'AIソリューションのセキュリティ、コンプライアンス、ガバナンス'], 'MLA': ['機械学習のためのデータ準備', 'MLモデルの開発', 'MLワークフローのデプロイとオーケストレーション', 'MLソリューションの監視、メンテナンス、セキュリティ'], 'AIP': ['基盤モデルの統合、データ管理、コンプライアンス', '実装と統合', 'AIの安全性、セキュリティ、ガバナンス', '生成AIアプリケーションの運用効率と最適化', 'テスト、検証、トラブルシューティング'], 'DEA': ['データの取り込みと変換', 'データストアの管理', 'データオペレーションとサポート', 'データのセキュリティとガバナンス'], 'ANS': ['ネットワーク設計', 'ネットワーク実装', 'ネットワーク管理と運用', 'ネットワークのセキュリティ、コンプライアンス、ガバナンス'], 'SCS': ['検出', 'インシデント対応', 'インフラストラクチャのセキュリティ', 'アイデンティティとアクセス管理', 'データ保護', 'セキュリティの基盤とガバナンス']}
try:
    import json as _ejson, os as _eos
    _ep = _eos.environ.get('EXAM_DOMAINS_JSON_PATH')
    if _ep and _eos.path.exists(_ep):
        with open(_ep, encoding='utf-8') as _ef:
            EXAM_DOMAINS_LOCAL = {k: [d['ja'] for d in v] for k, v in _ejson.load(_ef).items()}
except Exception:
    pass
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
    ce = q.get('choiceExplanations', [])
    if ce:
        if len(ce) == len(choices):
            lines.append(f"選択肢別解説（choiceExplanations[i]とchoices[i]の対応を確認すること）:")
            for i, (ch, ex) in enumerate(zip(choices, ce)):
                lines.append(f"  [{i}] 選択肢: 「{str(ch)}」")
                lines.append(f"      解説:   「{str(ex)}」")
        else:
            lines.append(f"選択肢別解説数: {len(ce)}件（choices数: {len(choices)}件・不一致）")
    else:
        lines.append(f"選択肢別解説: なし（要生成）")
    domain_int = q.get('domain')
    tags = q.get('tags', [])
    if isinstance(domain_int, int):
        exam = q.get('examType', '')
        domain_name = (EXAM_DOMAINS_LOCAL.get(exam, [])[domain_int:domain_int+1] or [''])[0]
        lines.append(f"ドメイン: {domain_name if domain_name else '（不明）'}")
    else:
        lines.append(f"タグ: {', '.join(tags) if tags else '（なし）'}")
    lines.append("")
print('\n'.join(lines))
PYEOF

  # claude 呼び出し（529 Overloaded は最大2回リトライ）
  _OVERLOAD_RETRY=0
  _SKIP_CHUNK=0
  while true; do
    _STDOUT_F=$(mktemp /tmp/claude_out_XXXX)
    _STDERR_F=$(mktemp /tmp/claude_err_XXXX)
    "$CLAUDE_CMD" -p --allowed-tools WebFetch < "$PROMPT_FILE" > "$_STDOUT_F" 2> "$_STDERR_F"
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
        "$CLAUDE_CMD" -p --allowed-tools WebFetch < "$PROMPT_FILE" > "$_STDOUT_F" 2> "$_STDERR_F"
        AI_EXIT=$?
        RESULT=$(cat "$_STDOUT_F")
        _STDERR=$(cat "$_STDERR_F")
        rm -f "$_STDOUT_F" "$_STDERR_F"
      fi
    fi

    # 致命的エラー（認証・コマンド問題）→ 即終了
    if echo "$_STDERR" | grep -qiE "command not found|No such file|GEMINI_API_KEY|API.?key"; then
      rm -f "$PROMPT_FILE"
      echo "❌ claude 実行エラー（認証またはコマンド問題）。スクリプトを終了します"
      echo "stderr: $(echo "$_STDERR" | head -3)"
      exit 1
    fi

    _RESULT_HEAD=$(echo "$RESULT" | head -3)

    # 529 Overloaded（一時的なサーバー過負荷）→ 最大2回リトライ後、このチャンクのみスキップして続行
    if echo "$_STDERR $_RESULT_HEAD" | grep -qiE "529|Overloaded"; then
      if [ $_OVERLOAD_RETRY -lt 2 ]; then
        _OVERLOAD_RETRY=$(( _OVERLOAD_RETRY + 1 ))
        echo "⚠️  サーバー過負荷（529）を検出。60秒後にリトライ（${_OVERLOAD_RETRY}/2回目）"
        sleep 60
        continue
      else
        echo "⚠️  529 Overloaded が続くためチャンク $((CHUNK_IDX+1)) をスキップして続行"
        echo "stdout: $_RESULT_HEAD"
        _SKIP_CHUNK=1
        break
      fi
    fi

    # 真のレート制限（429・quota 超過など）→ 残りチャンクをすべてスキップ
    if echo "$_STDERR $_RESULT_HEAD" | grep -qiE "rate.?limit|too many requests|quota exceeded|usage limit|resource_exhausted|session.?limit|hit your"; then
      rm -f "$PROMPT_FILE"
      echo "⚠️  レート制限を検出。残りチャンクをスキップ"
      echo "stdout: $_RESULT_HEAD"
      RATE_LIMITED=1
      break 2
    fi

    break
  done
  rm -f "$PROMPT_FILE"

  [ $_SKIP_CHUNK -eq 1 ] && continue

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

REMOVE_EXPR = 'REMOVE validityRating, validityNote, fixProposalJson, tags'

EXAM_DOMAINS_FIX = {'CLF': ['クラウドの概念', 'セキュリティとコンプライアンス', 'クラウドのテクノロジーとサービス', '請求、料金、およびサポート'], 'SAA': ['セキュアなアーキテクチャの設計', '弾力性に優れたアーキテクチャの設計', '高性能なアーキテクチャの設計', 'コスト最適化されたアーキテクチャの設計'], 'SAP': ['組織の複雑さに対応する設計', '新しいソリューションのための設計', '既存のソリューションの継続的改善', 'ワークロードの移行とモダン化の加速'], 'DVA': ['AWSのサービスを使用した開発', 'セキュリティ', 'デプロイ', 'トラブルシューティングと最適化'], 'SOA': ['モニタリング、ロギング、分析、修復、およびパフォーマンスの最適化', '信頼性とビジネス継続性', 'デプロイ、プロビジョニング、および自動化', 'セキュリティとコンプライアンス', 'ネットワークとコンテンツ配信'], 'DOP': ['SDLC の自動化', '構成管理と Infrastructure as Code (IaC)', '弾力性に優れたクラウドソリューション', 'モニタリングとロギング', 'インシデントとイベントへの対応', 'セキュリティとコンプライアンス'], 'AIF': ['AIとMLの基礎', '生成AIの基礎', '基盤モデルのアプリケーション', '責任あるAIのガイドライン', 'AIソリューションのセキュリティ、コンプライアンス、ガバナンス'], 'MLA': ['機械学習のためのデータ準備', 'MLモデルの開発', 'MLワークフローのデプロイとオーケストレーション', 'MLソリューションの監視、メンテナンス、セキュリティ'], 'AIP': ['基盤モデルの統合、データ管理、コンプライアンス', '実装と統合', 'AIの安全性、セキュリティ、ガバナンス', '生成AIアプリケーションの運用効率と最適化', 'テスト、検証、トラブルシューティング'], 'DEA': ['データの取り込みと変換', 'データストアの管理', 'データオペレーションとサポート', 'データのセキュリティとガバナンス'], 'ANS': ['ネットワーク設計', 'ネットワーク実装', 'ネットワーク管理と運用', 'ネットワークのセキュリティ、コンプライアンス、ガバナンス'], 'SCS': ['検出', 'インシデント対応', 'インフラストラクチャのセキュリティ', 'アイデンティティとアクセス管理', 'データ保護', 'セキュリティの基盤とガバナンス']}
try:
    import json as _ejson, os as _eos
    _ep = _eos.environ.get('EXAM_DOMAINS_JSON_PATH')
    if _ep and _eos.path.exists(_ep):
        with open(_ep, encoding='utf-8') as _ef:
            EXAM_DOMAINS_FIX = {k: [d['ja'] for d in v] for k, v in _ejson.load(_ef).items()}
except Exception:
    pass

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

        if fix.get('choiceExplanations'):
            eff_choices = fix.get('choices', orig.get('choices', []))
            if len(fix['choiceExplanations']) == len(eff_choices) and fix['choiceExplanations'] != orig.get('choiceExplanations'):
                update_parts.append('choiceExplanations = :ce')
                expr_values[':ce'] = {'L': [{'S': str(c)} for c in fix['choiceExplanations']]}
                changes['choiceExplanations'] = {'before': orig.get('choiceExplanations', []), 'after': fix['choiceExplanations']}

        if fix.get('tags'):
            new_tags = fix['tags']
            # tags → domain 整数インデックスに変換してセット（アプリは domain integer を使用）
            exam = orig.get('examType', '')
            new_tag = new_tags[0] if new_tags else ''
            domains_for_exam = EXAM_DOMAINS_FIX.get(exam, [])
            domain_idx = domains_for_exam.index(new_tag) if new_tag in domains_for_exam else -1
            if domain_idx >= 0 and domain_idx != orig.get('domain'):
                update_parts.append('#d = :domidx')
                expr_values[':domidx'] = {'N': str(domain_idx)}
                changes['domain'] = {'before': orig.get('domain'), 'after': domain_idx}
            # 旧 tags フィールドは書き込まない（domain 整数インデックスが正準。tags は REMOVE で削除）

        edit_log = {'action': 'fixed', 'checkedAt': now, 'reason': reason, 'changes': changes}
        expr_values[':log'] = {'S': json.dumps(edit_log, ensure_ascii=False)}

        update_expr = f'SET {", ".join(update_parts)} {REMOVE_EXPR}'
        cmd = ['aws', 'dynamodb', 'update-item',
            '--table-name', 'Questions',
            '--key', json.dumps({'questionId': {'S': qid}}),
            '--update-expression', update_expr,
            '--expression-attribute-values', json.dumps(expr_values),
        ]
        if '#d' in update_expr:
            cmd += ['--expression-attribute-names', '{"#d": "domain"}']
        subprocess.run(cmd, capture_output=True)
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