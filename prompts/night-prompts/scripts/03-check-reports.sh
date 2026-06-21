#!/bin/bash
# 通報済み問題のチェック・修正スクリプト
# 通報内容を踏まえてClaudeが問題を精査し、ok/fix/delete を判定する
# さらに、通報で発覚した不具合パターンが同じ試験・ドメインの他の問題にないかも確認する
#
# ok     → 通報を削除（問題は変更なし）
# fix    → 問題を修正・validityCheckedAt更新 → 通報を削除
# delete → 問題をDBから削除 → 通報を削除
# related_fix    → 関連問題を修正（通報なし）
# related_delete → 関連問題を削除（通報なし）

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

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NIGHT_PROMPTS_DIR="$(dirname "$SCRIPT_DIR")"
LOG_DIR="$NIGHT_PROMPTS_DIR/logs"
mkdir -p "$LOG_DIR"
DATE=$(date '+%Y%m%d_%H%M%S')
LOG_FILE="$LOG_DIR/reports_${DATE}.log"

RATE_LIMIT_FILE="$NIGHT_PROMPTS_DIR/.claude_rate_limit_reset"

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
usage: check-reports.sh [-n N] [-r N] [-h]

  -n N   処理する通報数上限 (default: 全件)
  -r N   通報問題と同じドメインから追加でチェックする関連問題数/ドメイン (default: 10)
  -h     このヘルプを表示

挙動:
  1. Reports テーブルから通報を全件取得し、対応する問題を照合
  2. 通報された問題と同じ試験・ドメインから関連問題を取得
  3. Claude が通報内容・通報問題・関連問題をまとめて精査
     - 通報問題: 通報が妥当なら fix/delete、不当なら ok
     - 関連問題: 同様の不具合があれば fix/delete、なければ ok（スキップ）
  4. 通報問題の処理後、通報レコードを削除
EOF
}

MAX_REPORTS=0   # 0 = 全件
RELATED_PER_DOMAIN=10  # ドメインごとの関連問題サンプル数

while [[ $# -gt 0 ]]; do
  case "$1" in
    -n) MAX_REPORTS="${2:?-n requires N}"; shift 2 ;;
    -r) RELATED_PER_DOMAIN="${2:?-r requires N}"; shift 2 ;;
    -h|--help) show_help; exit 0 ;;
    *) echo "不明なオプション: $1" >&2; show_help >&2; exit 1 ;;
  esac
done

{
check_rate_limit
echo "=========================================="
echo "通報チェック開始: $(date)"
echo "関連問題チェック: ドメインあたり最大 ${RELATED_PER_DOMAIN}問"
echo "=========================================="

# ── 1. Reports + Questions をスキャン ──────────────────────────
REPORTS_TMP=$(mktemp /tmp/reports_XXXX.json)
QUESTIONS_TMP=$(mktemp /tmp/questions_XXXX.json)
aws dynamodb scan --table-name Reports --output json 2>/dev/null > "$REPORTS_TMP"
aws dynamodb scan --table-name Questions --output json 2>/dev/null > "$QUESTIONS_TMP"

# ── 2. 通報・問題のマージ + 関連問題の収集 ────────────────────
WORK_JSON=$(MAX_REPORTS=$MAX_REPORTS RELATED_PER_DOMAIN=$RELATED_PER_DOMAIN \
  python3 - "$REPORTS_TMP" "$QUESTIONS_TMP" << 'PYEOF'
import json, sys, os, random
from datetime import datetime, timezone

def deser(v):
    if 'S' in v: return v['S']
    if 'N' in v: return float(v['N']) if '.' in v['N'] else int(v['N'])
    if 'BOOL' in v: return v['BOOL']
    if 'L' in v: return [deser(i) for i in v['L']]
    if 'M' in v: return {k: deser(vv) for k, vv in v['M'].items()}
    return None

EXAM_DOMAINS = {'CLF': ['クラウドの概念', 'セキュリティとコンプライアンス', 'クラウドのテクノロジーとサービス', '請求、料金、およびサポート'], 'SAA': ['セキュアなアーキテクチャの設計', '弾力性に優れたアーキテクチャの設計', '高性能なアーキテクチャの設計', 'コスト最適化されたアーキテクチャの設計'], 'SAP': ['組織の複雑さに対応する設計', '新しいソリューションのための設計', '既存のソリューションの継続的改善', 'ワークロードの移行とモダン化の加速'], 'DVA': ['AWSのサービスを使用した開発', 'セキュリティ', 'デプロイ', 'トラブルシューティングと最適化'], 'SOA': ['モニタリング、ロギング、分析、修復、およびパフォーマンスの最適化', '信頼性とビジネス継続性', 'デプロイ、プロビジョニング、および自動化', 'セキュリティとコンプライアンス', 'ネットワークとコンテンツ配信'], 'DOP': ['SDLC の自動化', '構成管理と Infrastructure as Code (IaC)', '弾力性に優れたクラウドソリューション', 'モニタリングとロギング', 'インシデントとイベントへの対応', 'セキュリティとコンプライアンス'], 'AIF': ['AIとMLの基礎', '生成AIの基礎', '基盤モデルのアプリケーション', '責任あるAIのガイドライン', 'AIソリューションのセキュリティ、コンプライアンス、ガバナンス'], 'MLA': ['機械学習のためのデータ準備', 'MLモデルの開発', 'MLワークフローのデプロイとオーケストレーション', 'MLソリューションの監視、メンテナンス、セキュリティ'], 'AIP': ['基盤モデルの統合、データ管理、コンプライアンス', '実装と統合', 'AIの安全性、セキュリティ、ガバナンス', '生成AIアプリケーションの運用効率と最適化', 'テスト、検証、トラブルシューティング'], 'DEA': ['データの取り込みと変換', 'データストアの管理', 'データオペレーションとサポート', 'データのセキュリティとガバナンス'], 'ANS': ['ネットワーク設計', 'ネットワーク実装', 'ネットワーク管理と運用', 'ネットワークのセキュリティ、コンプライアンス、ガバナンス'], 'SCS': ['検出', 'インシデント対応', 'インフラストラクチャのセキュリティ', 'アイデンティティとアクセス管理', 'データ保護', 'セキュリティの基盤とガバナンス']}

def q_domain_name(q):
    """domain 整数インデックス（新形式）または tags[0]（旧形式）からドメイン名を返す"""
    d = q.get('domain')
    if isinstance(d, int):
        return (EXAM_DOMAINS.get(q.get('examType', ''), [])[d:d+1] or [''])[0]
    tags = q.get('tags') or []
    return tags[0] if tags else ''

with open(sys.argv[1]) as f:
    rdata = json.load(f)
with open(sys.argv[2]) as f:
    qdata = json.load(f)

reports = [{k: deser(v) for k, v in item.items()} for item in rdata.get('Items', [])]
all_questions = {
    q['questionId']: q
    for q in [{k: deser(v) for k, v in item.items()} for item in qdata.get('Items', [])]
    if not q.get('isHidden')
}

reports.sort(key=lambda r: r.get('reportedAt', ''))
max_n = int(os.environ.get('MAX_REPORTS', '0'))
if max_n > 0:
    reports = reports[:max_n]

# 通報問題を収集
reported_work = []
reported_ids = set()
reported_domain_keys = set()  # (examType, domain) のペア

for r in reports:
    qid = r.get('questionId', '')
    q = all_questions.get(qid)
    reported_work.append({'report': r, 'question': q})
    if q:
        reported_ids.add(qid)
        et = q.get('examType', '')
        dn = q_domain_name(q)
        if dn:
            reported_domain_keys.add((et, dn))

# 同じ examType + domain から関連問題をサンプリング
related_per = int(os.environ.get('RELATED_PER_DOMAIN', '10'))
related_questions = []
seen_related = set()

for (et, domain) in sorted(reported_domain_keys):
    candidates = [
        q for q in all_questions.values()
        if q.get('examType') == et
        and q_domain_name(q) == domain
        and q['questionId'] not in reported_ids
        and q['questionId'] not in seen_related
    ]
    # 確認日が古い順（未確認を優先）→ ランダムにrelated_per件
    candidates.sort(key=lambda q: q.get('validityCheckedAt') or '')
    sampled = candidates[:related_per]
    for q in sampled:
        seen_related.add(q['questionId'])
        related_questions.append({'examType': et, 'domain': domain, 'question': q})

result = {
    'reported': reported_work,
    'related': related_questions,
}
print(json.dumps(result, ensure_ascii=False))
PYEOF
)
rm -f "$REPORTS_TMP" "$QUESTIONS_TMP"

REPORT_COUNT=$(echo "$WORK_JSON" | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d['reported']))" 2>/dev/null || echo 0)
RELATED_COUNT=$(echo "$WORK_JSON" | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d['related']))" 2>/dev/null || echo 0)
echo "通報件数: ${REPORT_COUNT}件 / 関連問題: ${RELATED_COUNT}問"

if [ "$REPORT_COUNT" -eq 0 ]; then
  echo "処理対象の通報なし"
  exit 0
fi

# ── 3. 問題が存在しない通報を先に削除 ─────────────────────────
_WORK_TMP=$(mktemp /tmp/reports_work_XXXX.json)
echo "$WORK_JSON" > "$_WORK_TMP"
python3 - "$_WORK_TMP" << 'PYEOF'
import json, sys, subprocess

with open(sys.argv[1]) as f:
    data = json.load(f)
for item in data['reported']:
    if item.get('question') is None:
        r = item['report']
        rid = r.get('reportId', '')
        qid = r.get('questionId', '')
        subprocess.run([
            'aws', 'dynamodb', 'delete-item',
            '--table-name', 'Reports',
            '--key', json.dumps({'reportId': {'S': rid}}),
        ], capture_output=True)
        print(f"  [SKIP] 問題が存在しない通報を削除: reportId={rid} questionId={qid}", file=sys.stderr)
PYEOF
rm -f "$_WORK_TMP"

# 有効な通報のみ抽出
VALID_JSON=$(echo "$WORK_JSON" | python3 -c "
import json, sys
data = json.load(sys.stdin)
data['reported'] = [d for d in data['reported'] if d.get('question') is not None]
print(json.dumps(data, ensure_ascii=False))
")

VALID_REPORT_COUNT=$(echo "$VALID_JSON" | python3 -c "import json,sys; print(len(json.load(sys.stdin)['reported']))" 2>/dev/null || echo 0)
echo "Claude 判定対象: 通報=${VALID_REPORT_COUNT}件 / 関連=${RELATED_COUNT}問"

# ── 4. プロンプト生成 ─────────────────────────────────────────
PROMPT_FILE=$(mktemp /tmp/reports_prompt_XXXX.txt)
_VALID_TMP=$(mktemp /tmp/reports_valid_XXXX.json)
echo "$VALID_JSON" > "$_VALID_TMP"
python3 - "$_VALID_TMP" << 'PYEOF' > "$PROMPT_FILE"
import json, sys

EXAM_DOMAINS = {'CLF': ['クラウドの概念', 'セキュリティとコンプライアンス', 'クラウドのテクノロジーとサービス', '請求、料金、およびサポート'], 'SAA': ['セキュアなアーキテクチャの設計', '弾力性に優れたアーキテクチャの設計', '高性能なアーキテクチャの設計', 'コスト最適化されたアーキテクチャの設計'], 'SAP': ['組織の複雑さに対応する設計', '新しいソリューションのための設計', '既存のソリューションの継続的改善', 'ワークロードの移行とモダン化の加速'], 'DVA': ['AWSのサービスを使用した開発', 'セキュリティ', 'デプロイ', 'トラブルシューティングと最適化'], 'SOA': ['モニタリング、ロギング、分析、修復、およびパフォーマンスの最適化', '信頼性とビジネス継続性', 'デプロイ、プロビジョニング、および自動化', 'セキュリティとコンプライアンス', 'ネットワークとコンテンツ配信'], 'DOP': ['SDLC の自動化', '構成管理と Infrastructure as Code (IaC)', '弾力性に優れたクラウドソリューション', 'モニタリングとロギング', 'インシデントとイベントへの対応', 'セキュリティとコンプライアンス'], 'AIF': ['AIとMLの基礎', '生成AIの基礎', '基盤モデルのアプリケーション', '責任あるAIのガイドライン', 'AIソリューションのセキュリティ、コンプライアンス、ガバナンス'], 'MLA': ['機械学習のためのデータ準備', 'MLモデルの開発', 'MLワークフローのデプロイとオーケストレーション', 'MLソリューションの監視、メンテナンス、セキュリティ'], 'AIP': ['基盤モデルの統合、データ管理、コンプライアンス', '実装と統合', 'AIの安全性、セキュリティ、ガバナンス', '生成AIアプリケーションの運用効率と最適化', 'テスト、検証、トラブルシューティング'], 'DEA': ['データの取り込みと変換', 'データストアの管理', 'データオペレーションとサポート', 'データのセキュリティとガバナンス'], 'ANS': ['ネットワーク設計', 'ネットワーク実装', 'ネットワーク管理と運用', 'ネットワークのセキュリティ、コンプライアンス、ガバナンス'], 'SCS': ['検出', 'インシデント対応', 'インフラストラクチャのセキュリティ', 'アイデンティティとアクセス管理', 'データ保護', 'セキュリティの基盤とガバナンス']}

def q_domain_name(q):
    d = q.get('domain')
    if isinstance(d, int):
        return (EXAM_DOMAINS.get(q.get('examType', ''), [])[d:d+1] or [''])[0]
    tags = q.get('tags') or []
    return tags[0] if tags else ''

with open(sys.argv[1]) as f:
    data = json.load(f)
reported_work = data['reported']
related_questions = data['related']

CATEGORY_LABELS = {
    'wrong_answer':      '正解が誤っている',
    'wrong_explanation': '解説が誤っている',
    'outdated':          'サービス仕様が古い・廃止済み',
    'bad_question':      '問題文が不明瞭・不適切',
    'other':             'その他',
}

lines = []
lines.append("""あなたはAWS認定試験の問題品質チェッカーです。

【役割】
セクション1: 通報された問題を精査し、通報内容の妥当性を判断して対応する
セクション2: 通報で発覚した不具合と同様の問題が、関連問題にも存在しないかを確認する

【アクション定義】
- "ok"     : 問題なし（通報問題: 通報が不当。関連問題: 同様の不具合なし → どちらも結果に含めなくてよい）
- "fix"    : 問題あり・修正可能（修正内容を含める）
- "delete" : 致命的な問題・修正不可（正解が存在しない、完全に誤った情報など）

【修正時の確認観点】
- 正解・解説の正確性
- correctAnswers の文字列は choices と完全一致させること（記号接頭辞「A. 」等を含めない）
- choiceExplanations も必要に応じて修正（choices と同数・同順序、各100〜150字）
- 正解選択肢の文字数が不正解群から浮かないようにすること

【出力形式】
必ず以下のJSONのみを出力してください。説明文・前置きは不要です。
ok の問題は結果に含めなくてよいです（件数削減のため）。

{"results":[
  {"reportId":"（通報問題のみ）","questionId":"...","action":"fix","reason":"...","fix":{"questionText":"（変更時のみ）","choices":["A","B","C","D"],"correctAnswers":["記号接頭辞なし"],"explanation":"（変更時のみ）","choiceExplanations":["0の解説","1の解説","2の解説","3の解説"]}},
  {"reportId":"（通報問題のみ）","questionId":"...","action":"delete","reason":"..."},
  {"questionId":"（関連問題はreportIdなし）","action":"fix","reason":"...","fix":{...}},
  {"questionId":"（関連問題はreportIdなし）","action":"delete","reason":"..."}
]}
""")

lines.append("=" * 50)
lines.append("【セクション1: 通報された問題】")
lines.append("=" * 50)
for item in reported_work:
    r = item['report']
    q = item['question']
    cat = CATEGORY_LABELS.get(r.get('category', 'other'), r.get('category', 'other'))
    lines.append(f"\n--- 通報 ---")
    lines.append(f"reportId   : {r.get('reportId', '')}")
    lines.append(f"questionId : {r.get('questionId', '')}")
    lines.append(f"通報日時   : {r.get('reportedAt', '')}")
    lines.append(f"カテゴリ   : {cat}")
    msg = r.get('message', '').strip()
    if msg:
        lines.append(f"通報コメント: {msg}")
    lines.append(f"試験: {q.get('examType', '')} / ドメイン: {q_domain_name(q)}")
    lines.append(f"問題文: {q.get('questionText', '')}")
    choices = q.get('choices', [])
    if choices:
        lines.append(f"選択肢: {' / '.join(str(c) for c in choices)}")
    correct = q.get('correctAnswers', [])
    if correct:
        lines.append(f"正解: {', '.join(str(c) for c in correct)}")
    exp = q.get('explanation', '')
    if exp:
        lines.append(f"解説: {exp[:300]}{'...' if len(exp) > 300 else ''}")

if related_questions:
    lines.append("\n" + "=" * 50)
    lines.append("【セクション2: 関連問題（同様の不具合がないか確認）】")
    lines.append("通報で発覚した不具合と同じパターンが以下の問題にも存在しないか確認してください。")
    lines.append("問題なし（ok）の場合は結果に含めなくてよいです。")
    lines.append("=" * 50)

    current_key = None
    for item in related_questions:
        key = (item['examType'], item['domain'])
        if key != current_key:
            lines.append(f"\n--- 試験: {item['examType']} / ドメイン: {item['domain']} ---")
            current_key = key
        q = item['question']
        lines.append(f"\nquestionId : {q.get('questionId', '')}")
        lines.append(f"問題文: {q.get('questionText', '')}")
        choices = q.get('choices', [])
        if choices:
            lines.append(f"選択肢: {' / '.join(str(c) for c in choices)}")
        correct = q.get('correctAnswers', [])
        if correct:
            lines.append(f"正解: {', '.join(str(c) for c in correct)}")
        exp = q.get('explanation', '')
        if exp:
            lines.append(f"解説: {exp[:200]}{'...' if len(exp) > 200 else ''}")

print('\n'.join(lines))
PYEOF
rm -f "$_VALID_TMP"

# ── 5. Claude 実行 ────────────────────────────────────────────
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

# 致命的エラー
if echo "$_STDERR" | grep -qiE "command not found|No such file|GEMINI_API_KEY|API.?key"; then
  echo "❌ claude 実行エラー（認証またはコマンド問題）。スクリプトを終了します"
  echo "stderr: $(echo "$_STDERR" | head -3)"
  exit 1
fi

# レート制限
if echo "$_STDERR" | grep -qiE "rate.?limit|too many requests|529|quota exceeded|usage limit|resource_exhausted"; then
  echo "⚠️  レート制限を検出"
  record_rate_limit "$(echo "${RESULT:-} ${_STDERR:-}" | head -10)"
  exit 1
fi

if [ $AI_EXIT -ne 0 ]; then
  echo "⚠️  Claude でエラー（exit $AI_EXIT）"
  echo "stderr: $(echo "$_STDERR" | head -5)"
  exit 1
fi

# ── 6. JSON パース ────────────────────────────────────────────
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

# ── 7. DB 更新 & 通報削除 ─────────────────────────────────────
RESULT_JSON_FILE=$(mktemp /tmp/reports_result_XXXX.json)
VALID_JSON_FILE=$(mktemp /tmp/reports_valid_XXXX.json)
echo "$RESULT_JSON" > "$RESULT_JSON_FILE"
echo "$VALID_JSON"  > "$VALID_JSON_FILE"

python3 - "$RESULT_JSON_FILE" "$VALID_JSON_FILE" << 'PYEOF'
import json, sys, subprocess, re as _re, tempfile, os
from datetime import datetime, timezone

with open(sys.argv[1]) as f:
    data = json.load(f)
results = data.get('results', [])

with open(sys.argv[2]) as f:
    work = json.load(f)

# 全問題マップ（通報問題 + 関連問題）
orig_questions = {}
for item in work.get('reported', []):
    q = item.get('question')
    if q: orig_questions[q['questionId']] = q
for item in work.get('related', []):
    q = item.get('question')
    if q: orig_questions[q['questionId']] = q

# 通報マップ（reportId → reportId）
report_ids = {
    item['report']['questionId']: item['report']['reportId']
    for item in work.get('reported', [])
    if item.get('question') and item.get('report', {}).get('reportId')
}

now = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
_label_re = _re.compile(r'^[A-E]\.\s*')

ok_count = fix_count = del_count = rel_fix = rel_del = 0

def apply_fix(qid, fix, orig):
    update_parts = ['validityCheckedAt = :t', 'updatedAt = :u']
    expr_values  = {':t': {'S': now}, ':u': {'S': now}}

    if fix.get('questionText') and fix['questionText'] != orig.get('questionText'):
        update_parts.append('questionText = :qt')
        expr_values[':qt'] = {'S': fix['questionText']}

    if fix.get('choices') and fix['choices'] != orig.get('choices'):
        update_parts.append('choices = :ch')
        expr_values[':ch'] = {'L': [{'S': str(c)} for c in fix['choices']]}

    if fix.get('correctAnswers'):
        stripped = [_label_re.sub('', str(c)) for c in fix['correctAnswers']]
        if stripped != orig.get('correctAnswers'):
            update_parts.append('correctAnswers = :ca')
            expr_values[':ca'] = {'L': [{'S': c} for c in stripped]}

    if fix.get('explanation') and fix['explanation'] != orig.get('explanation'):
        update_parts.append('explanation = :ex')
        expr_values[':ex'] = {'S': fix['explanation']}

    if fix.get('choiceExplanations'):
        eff_choices = fix.get('choices', orig.get('choices', []))
        if len(fix['choiceExplanations']) == len(eff_choices):
            update_parts.append('choiceExplanations = :ce')
            expr_values[':ce'] = {'L': [{'S': str(e)} for e in fix['choiceExplanations']]}

    ef = tempfile.mktemp(suffix='.json', prefix='/tmp/rep_fix_')
    with open(ef, 'w') as fh:
        json.dump(expr_values, fh, ensure_ascii=False)
    ret = subprocess.run([
        'aws', 'dynamodb', 'update-item',
        '--table-name', 'Questions',
        '--key', json.dumps({'questionId': {'S': qid}}),
        '--update-expression', 'SET ' + ', '.join(update_parts),
        '--expression-attribute-values', f'file://{ef}',
        '--output', 'json',
    ], capture_output=True, text=True)
    os.unlink(ef)
    return ret.returncode == 0

for r in results:
    rid    = r.get('reportId', '')   # 通報問題のみ存在
    qid    = r.get('questionId', '')
    action = r.get('action', 'ok')
    reason = r.get('reason', '')
    fix    = r.get('fix', {})
    orig   = orig_questions.get(qid, {})
    is_reported = qid in report_ids

    label = '通報' if is_reported else '関連'

    if action == 'delete':
        subprocess.run([
            'aws', 'dynamodb', 'delete-item',
            '--table-name', 'Questions',
            '--key', json.dumps({'questionId': {'S': qid}}),
        ], capture_output=True)
        if is_reported: del_count += 1
        else: rel_del += 1
        print(f'  [DELETE/{label}] {qid}: {reason}')

    elif action == 'fix' and fix:
        success = apply_fix(qid, fix, orig)
        if success:
            if is_reported: fix_count += 1
            else: rel_fix += 1
            print(f'  [FIX/{label}]    {qid}: {reason}')
        else:
            print(f'  [FIX❌/{label}]  {qid}: DB更新失敗')

    else:
        if is_reported: ok_count += 1
        # ok の関連問題はカウントもログも省略

    # 通報レコードを削除（通報問題のみ、ok/fix/delete いずれも）
    actual_rid = rid or report_ids.get(qid, '')
    if actual_rid and is_reported:
        subprocess.run([
            'aws', 'dynamodb', 'delete-item',
            '--table-name', 'Reports',
            '--key', json.dumps({'reportId': {'S': actual_rid}}),
        ], capture_output=True)

print(f'\n通報問題  → OK={ok_count}  FIX={fix_count}  DELETE={del_count}')
print(f'関連問題  → FIX={rel_fix}  DELETE={rel_del}')
PYEOF

rm -f "$RESULT_JSON_FILE" "$VALID_JSON_FILE"

echo ""
echo "=========================================="
echo "通報チェック完了: $(date)"
echo "=========================================="

} 2>&1 | tee -a "$LOG_FILE"
