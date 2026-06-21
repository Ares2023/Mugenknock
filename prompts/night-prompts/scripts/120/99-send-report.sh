#!/bin/bash
# 日次稼働レポート送信スクリプト
# night-prompts/scripts/ 内で最後に（ファイル名順）実行される
#
# 設定ファイル: ~/.mugenknock_mail.conf
#   SMTP_USER=your@gmail.com
#   SMTP_PASS=xxxx-xxxx-xxxx-xxxx   # Gmailアプリパスワード
#   SMTP_TO=mugenknock@gmail.com
#
# 内容:
#   1. 前日夜間スクリプト（問題生成・妥当性確認）の成果サマリー
#   2. canary テスト結果
#   3. AWS資格公式情報の変更チェック（WebFetch）
#   4. サイト稼働状況（DynamoDB問題数・未確認数・未解決通報数）

set -uo pipefail

export PATH="/home/yuzuki/local/bin:/home/sera/.config/nvm/versions/node/v20.20.2/bin:$PATH"
unset ANTHROPIC_API_KEY

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NIGHT_PROMPTS_DIR="$(dirname "$SCRIPT_DIR")"
PROJECT_DIR="$(dirname "$(dirname "$NIGHT_PROMPTS_DIR")")"
LOG_DIR="$(dirname "$NIGHT_PROMPTS_DIR")/logs"   # nscriptログは prompts/logs/ に書かれる
CANARY_SCRIPT="$NIGHT_PROMPTS_DIR/manual/canary.sh"
MAIL_CONF="${HOME}/.mugenknock_mail.conf"
AWS=/home/yuzuki/local/bin/aws
REGION=ap-northeast-1

_find_claude() {
  [ -x /usr/local/bin/claude ] && { echo /usr/local/bin/claude; return; }
  local _cv; _cv=$(command -v claude 2>/dev/null)
  [ -n "$_cv" ] && [ -x "$_cv" ] && { echo "$_cv"; return; }
}
CLAUDE_CMD=$(_find_claude)

TODAY=$(date '+%Y%m%d')
YESTERDAY=$(date -d 'yesterday' '+%Y%m%d' 2>/dev/null || date -v-1d '+%Y%m%d' 2>/dev/null || echo "")
JST_NOW=$(TZ='Asia/Tokyo' date '+%Y-%m-%d %H:%M JST')

echo "=========================================="
echo "日次レポート生成 開始: $JST_NOW"
echo "=========================================="

# ── 0. メール設定読み込み ────────────────────────────────────
if [ ! -f "$MAIL_CONF" ]; then
  echo "⚠️  メール設定ファイルが見つかりません: $MAIL_CONF"
  echo "  以下の内容で作成してください:"
  echo "    SMTP_USER=your@gmail.com"
  echo "    SMTP_PASS=xxxx-xxxx-xxxx-xxxx  # Gmailアプリパスワード"
  echo "    SMTP_TO=mugenknock@gmail.com"
  echo "  ※アプリパスワード取得: https://myaccount.google.com/apppasswords"
  # メール送信不可でもレポート内容は生成してログに残す
fi
SMTP_USER=""; SMTP_PASS=""; SMTP_TO="mugenknock@gmail.com"
[ -f "$MAIL_CONF" ] && source "$MAIL_CONF"

# ── 1. AWS資格公式情報 変更チェック（最優先: 他スクリプトのトークン消費前に実行）──
echo ""
echo "--- [1] AWS資格公式情報 変更チェック ---"

CERT_NEWS="取得失敗"
if [ -n "${CLAUDE_CMD:-}" ] && [ -x "${CLAUDE_CMD:-}" ]; then

  # ── フェーズ1: 直近3日の声明を高速スキャン（設定値は注入しない）──
  SCAN_PROMPT=$(mktemp /tmp/cert_scan_XXXX.txt)
  SCAN_SINCE=$(date -d '3 days ago' '+%Y-%m-%d' 2>/dev/null || date -v-3d '+%Y-%m-%d' 2>/dev/null || echo "")
  cat > "$SCAN_PROMPT" << PROMPT
以下の2つのURLを確認し、${SCAN_SINCE}以降（直近3日以内）に公開されたAWS認定試験の変更声明だけを抽出してください。

確認URL:
- https://aws.amazon.com/certification/coming-soon/
- https://aws.amazon.com/blogs/training-and-certification/

【出力形式】JSONのみ。前置き・説明文不要。
直近3日以内に変更声明がなければ: {"has_changes": false}
変更声明がある場合:
{
  "has_changes": true,
  "changes": [
    {
      "exam": "資格コード（CLF/SAA/AIP等。新資格なら'NEW'）",
      "change_type": "exam_code|question_count|time_limit|pass_score|domain|new_exam|retirement|service_scope",
      "summary": "変更内容の1行要約（日本語）",
      "announced_date": "YYYY-MM-DD（不明ならnull）"
    }
  ]
}
PROMPT

  SCAN_RESULT=$("$CLAUDE_CMD" -p --model claude-haiku-4-5-20251001 --allowed-tools WebFetch < "$SCAN_PROMPT" 2>&1)
  rm -f "$SCAN_PROMPT"

  # JSONを抽出
  SCAN_JSON=$(echo "$SCAN_RESULT" | python3 -c "
import sys, json, re
text = sys.stdin.read()
m = re.search(r'\{[\s\S]*\}', text)
if m:
    try:
        obj = json.loads(m.group())
        print(json.dumps(obj))
        sys.exit(0)
    except: pass
print('{\"has_changes\": false}')
" 2>/dev/null || echo '{"has_changes": false}')

  HAS_CHANGES=$(echo "$SCAN_JSON" | python3 -c "import json,sys; print(json.load(sys.stdin).get('has_changes', False))" 2>/dev/null || echo "False")
  echo "  フェーズ1完了: has_changes=$HAS_CHANGES"

  if [ "$HAS_CHANGES" = "True" ]; then
    # ── フェーズ2: 影響を受ける資格の設定値だけを注入して詳細判定 ──
    DETAIL_PROMPT=$(mktemp /tmp/cert_detail_XXXX.txt)

    # 変更声明に関係する資格の設定値だけを絞り込んで注入するPythonスクリプト
    RELEVANT_CONFIG=$(echo "$SCAN_JSON" | python3 << 'PYEOF'
import json, sys

data = json.load(sys.stdin)
changes = data.get('changes', [])

# 関係する資格コードを抽出
affected = set()
for c in changes:
    exam = c.get('exam', '')
    if exam and exam != 'NEW':
        affected.add(exam)

# 現在のサイト設定（全量）
ALL_CONFIG = {
    'CLF': {'code': 'CLF-C02', 'q': 65, 'min': 90,  'pass': 700, 'domains': 'クラウドの概念 / セキュリティとコンプライアンス / クラウドのテクノロジーとサービス / 請求、料金、およびサポート'},
    'AIF': {'code': 'AIF-C01', 'q': 85, 'min': 120, 'pass': 700, 'domains': 'AIとMLの基礎 / 生成AIの基礎 / 基盤モデルのアプリケーション / 責任あるAIのガイドライン / AIソリューションのセキュリティ、コンプライアンス、ガバナンス'},
    'SAA': {'code': 'SAA-C03', 'q': 65, 'min': 130, 'pass': 720, 'domains': 'セキュアなアーキテクチャの設計 / 弾力性に優れたアーキテクチャの設計 / 高性能なアーキテクチャの設計 / コスト最適化されたアーキテクチャの設計'},
    'DVA': {'code': 'DVA-C02', 'q': 65, 'min': 130, 'pass': 720, 'domains': 'AWSのサービスを使用した開発 / セキュリティ / デプロイ / トラブルシューティングと最適化'},
    'SOA': {'code': 'SOA-C03', 'q': 65, 'min': 130, 'pass': 720, 'domains': 'モニタリング、ロギング、分析、修復、およびパフォーマンスの最適化 / 信頼性とビジネス継続性 / デプロイ、プロビジョニング、および自動化 / セキュリティとコンプライアンス / ネットワークとコンテンツ配信'},
    'DEA': {'code': 'DEA-C01', 'q': 65, 'min': 130, 'pass': 720, 'domains': 'データの取り込みと変換 / データストアの管理 / データオペレーションとサポート / データのセキュリティとガバナンス'},
    'MLA': {'code': 'MLA-C01', 'q': 65, 'min': 130, 'pass': 720, 'domains': '機械学習のためのデータ準備 / MLモデルの開発 / MLワークフローのデプロイとオーケストレーション / MLソリューションの監視、メンテナンス、セキュリティ'},
    'SAP': {'code': 'SAP-C02', 'q': 75, 'min': 180, 'pass': 750, 'domains': '組織の複雑さに対応する設計 / 新しいソリューションのための設計 / 既存のソリューションの継続的改善 / ワークロードの移行とモダン化の加速'},
    'DOP': {'code': 'DOP-C02', 'q': 75, 'min': 180, 'pass': 750, 'domains': 'SDLC の自動化 / 構成管理と Infrastructure as Code (IaC) / 弾力性に優れたクラウドソリューション / モニタリングとロギング / インシデントとイベントへの対応 / セキュリティとコンプライアンス'},
    'AIP': {'code': 'AIP-C01', 'q': 75, 'min': 170, 'pass': 750, 'domains': '基盤モデルの統合、データ管理、コンプライアンス / 実装と統合 / AIの安全性、セキュリティ、ガバナンス / 生成AIアプリケーションの運用効率と最適化 / テスト、検証、トラブルシューティング'},
    'ANS': {'code': 'ANS-C01', 'q': 65, 'min': 170, 'pass': 700, 'domains': 'ネットワーク設計 / ネットワーク実装 / ネットワーク管理と運用 / ネットワークのセキュリティ、コンプライアンス、ガバナンス'},
    'SCS': {'code': 'SCS-C03', 'q': 65, 'min': 170, 'pass': 750, 'domains': '検出 / インシデント対応 / インフラストラクチャのセキュリティ / アイデンティティとアクセス管理 / データ保護 / セキュリティの基盤とガバナンス'},
}

# 変更声明のサマリー
change_lines = [f"- [{c.get('exam','')}] {c.get('summary','')} （{c.get('announced_date','日付不明')}）" for c in changes]

# 関係する資格の設定値のみ出力
config_lines = []
for exam in sorted(affected):
    cfg = ALL_CONFIG.get(exam)
    if cfg:
        config_lines.append(f"- {exam}: {cfg['code']}, {cfg['q']}問, {cfg['min']}分, 合格{cfg['pass']}, ドメイン: {cfg['domains']}")

print('\n'.join(change_lines))
print('---CONFIG---')
print('\n'.join(config_lines) if config_lines else '（新資格のみ - 既存設定値への影響なし）')
PYEOF
)

    CHANGE_SUMMARY=$(echo "$RELEVANT_CONFIG" | sed '/^---CONFIG---/,$d')
    CONFIG_SECTION=$(echo "$RELEVANT_CONFIG" | sed -n '/^---CONFIG---/,$ { /^---CONFIG---/d; p }')

    cat > "$DETAIL_PROMPT" << PROMPT
AWS認定試験学習サイトの運営担当です。
以下の直近の公式声明について、このサイトで対応が必要かどうかを判断してください。

【直近3日以内の公式声明】
${CHANGE_SUMMARY}

【影響を受ける資格の現在のサイト設定】
${CONFIG_SECTION}

【判定依頼】
上記の声明と設定値を比較し、対応が必要なものだけ報告してください。
設定値と公式が一致している場合は「対応不要」です。

出力形式:
- 対応不要なら「変更なし（対応不要）」のみ
- 対応が必要な場合のみ:

### 対応が必要な変更
- **[資格コード] 変更種別**
  現在の設定: [現在値]
  公式の最新: [新しい値]
  必要なアクション: [具体的にすること]
PROMPT

    CERT_NEWS=$("$CLAUDE_CMD" -p < "$DETAIL_PROMPT" 2>&1 | head -60)
    rm -f "$DETAIL_PROMPT"
    echo "  フェーズ2完了"
    echo "$CERT_NEWS" | head -5
  else
    CERT_NEWS="変更なし（対応不要）"
    echo "  直近3日以内の変更声明なし"
  fi
else
  CERT_NEWS="Claude コマンドが見つからないため取得不可"
  echo "  ⚠️  Claude 未検出"
fi

# ── 2. 夜間スクリプト成果をログから集計 ─────────────────────
echo ""
echo "--- [2] 夜間スクリプト成果集計 ---"

# 直近3日分のログファイルを列挙する
_log_files_3days() {
  local name="$1"
  for d in "$TODAY" "${YESTERDAY:-}" $(date -d '2 days ago' '+%Y%m%d' 2>/dev/null || echo ""); do
    [ -z "$d" ] && continue
    local f="$LOG_DIR/nscript_${name}_${d}.log"
    [ -f "$f" ] && echo "$f"
  done
}

# 3日分の生成スクリプトログを集計（生成問題数合計 + 資格別明細）
GEN_SUMMARY=$(LOG_DIR="$LOG_DIR" TODAY="$TODAY" YESTERDAY="$YESTERDAY" python3 << 'PYEOF'
import os, re, glob

log_dir = os.environ.get('LOG_DIR', '')
today = os.environ.get('TODAY', '')
yesterday = os.environ.get('YESTERDAY', '')

dates = [today, yesterday]
try:
    import subprocess, datetime
    d2 = (datetime.date.today() - datetime.timedelta(days=2)).strftime('%Y%m%d')
    dates.append(d2)
except:
    pass

total = 0
rows = []   # (date, exam, count)
rate_msgs = []

for d in dates:
    if not d:
        continue
    f = os.path.join(log_dir, f"nscript_01-generate-questions_{d}.log")
    if not os.path.exists(f):
        continue
    content = open(f).read()
    # 各実行セッションの合計インポート数
    for m in re.finditer(r'選択: (\S+).*?合計インポート: (\d+)問', content, re.DOTALL):
        exam, cnt = m.group(1), int(m.group(2))
        total += cnt
        rows.append(f"{d[:4]}-{d[4:6]}-{d[6:]} {exam}: {cnt}問生成")
    if 'レート制限' in content:
        rate_msgs.append(f"{d[:4]}-{d[4:6]}-{d[6:]}: レート制限あり")

if total == 0 and not rows:
    print("3日分の生成なし")
else:
    print(f"合計 {total}問生成")
    for r in rows:
        print(f"  {r}")
    for r in rate_msgs:
        print(f"  ⚠️ {r}")
PYEOF
)

# 3日分の妥当性確認ログを集計
VAL_SUMMARY=$(LOG_DIR="$LOG_DIR" TODAY="$TODAY" YESTERDAY="$YESTERDAY" python3 << 'PYEOF'
import os, re

log_dir = os.environ.get('LOG_DIR', '')
today = os.environ.get('TODAY', '')
yesterday = os.environ.get('YESTERDAY', '')

dates = [today, yesterday]
try:
    import datetime
    d2 = (datetime.date.today() - datetime.timedelta(days=2)).strftime('%Y%m%d')
    dates.append(d2)
except:
    pass

total_ok, total_fix, total_del = 0, 0, 0
rows = []

for d in dates:
    if not d:
        continue
    f = os.path.join(log_dir, f"nscript_02-check-validity_{d}.log")
    if not os.path.exists(f):
        continue
    content = open(f).read()
    m = re.search(r'完了サマリー: 問題なし=(\d+)問 / 自動修正=(\d+)問 / 削除=(\d+)問', content)
    if m:
        ok, fix, dl = int(m.group(1)), int(m.group(2)), int(m.group(3))
        total_ok += ok; total_fix += fix; total_del += dl
        rows.append(f"{d[:4]}-{d[4:6]}-{d[6:]}: 問題なし={ok} 修正={fix} 削除={dl}")

if not rows:
    print("3日分の実行なし")
else:
    print(f"合計: 問題なし={total_ok}問 / 自動修正={total_fix}問 / 削除={total_del}問")
    for r in rows:
        print(f"  {r}")
PYEOF
)

# 3日分の通報チェックログを集計
RPT_SUMMARY=$(LOG_DIR="$LOG_DIR" TODAY="$TODAY" YESTERDAY="$YESTERDAY" python3 << 'PYEOF'
import os, re

log_dir = os.environ.get('LOG_DIR', '')
today = os.environ.get('TODAY', '')
yesterday = os.environ.get('YESTERDAY', '')

dates = [today, yesterday]
try:
    import datetime
    d2 = (datetime.date.today() - datetime.timedelta(days=2)).strftime('%Y%m%d')
    dates.append(d2)
except:
    pass

rows = []
for d in dates:
    if not d:
        continue
    f = os.path.join(log_dir, f"nscript_03-check-reports_{d}.log")
    if not os.path.exists(f):
        continue
    content = open(f).read()
    m = re.search(r'通報件数: (\d+)件', content)
    if m:
        rows.append(f"{d[:4]}-{d[4:6]}-{d[6:]}: {m.group(1)}件処理")

print('\n'.join(rows) if rows else "3日分の実行なし")
PYEOF
)

# レート制限情報（生成サマリー内に含まれるが別途抽出）
GEN_RATE_INFO=$(echo "$GEN_SUMMARY" | grep "レート制限" | tr '\n' ' ')

echo "  生成: $(echo "$GEN_SUMMARY" | head -1)"
echo "  妥当性: $(echo "$VAL_SUMMARY" | head -1)"
echo "  通報: $(echo "$RPT_SUMMARY" | head -1)"

# ── 2. DynamoDB 稼働状況 ─────────────────────────────────────
echo ""
echo "--- [3] DynamoDB稼働状況 ---"

DB_STATS=$(python3 << 'PYEOF'
import subprocess, json, sys

AWS = "/home/yuzuki/local/bin/aws"
REGION = "ap-northeast-1"
EXAMS = ["CLF","AIF","SAA","DVA","SOA","DEA","MLA","SAP","DOP","AIP","SCS","ANS"]

def scan_count(filter_expr=None, expr_vals=None):
    cmd = [AWS, "dynamodb", "scan", "--table-name", "Questions",
           "--select", "COUNT", "--region", REGION]
    if filter_expr:
        cmd += ["--filter-expression", filter_expr]
    if expr_vals:
        cmd += ["--expression-attribute-values", json.dumps(expr_vals)]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        return json.loads(r.stdout).get("Count", 0)
    except Exception:
        return -1

# 全問題数
total = scan_count()

# 未妥当性確認数
unchecked = scan_count("attribute_not_exists(validityCheckedAt)")

# 未解決通報数
try:
    r = subprocess.run([AWS, "dynamodb", "scan", "--table-name", "Reports",
                       "--select", "COUNT", "--region", REGION],
                      capture_output=True, text=True, timeout=30)
    reports = json.loads(r.stdout).get("Count", 0)
except:
    reports = -1

# 資格別問題数（DynamoDBのキャッシュを使う）
cache_file = "/home/yuzuki/aws-quiz-app/prompts/night-prompts/scripts/state/question_counts.json"
try:
    with open(cache_file) as f:
        cache = json.load(f)
    exam_data = cache.get("exams", {})
    exam_counts = [(e, exam_data.get(e, {}).get("total", "?")) for e in EXAMS]
except:
    exam_counts = [(e, "?") for e in EXAMS]

print(json.dumps({
    "total": total,
    "unchecked": unchecked,
    "reports": reports,
    "exam_counts": exam_counts,
}, ensure_ascii=False))
PYEOF
)

DB_TOTAL=$(echo "$DB_STATS" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['total'])" 2>/dev/null || echo "?")
DB_UNCHECKED=$(echo "$DB_STATS" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['unchecked'])" 2>/dev/null || echo "?")
DB_REPORTS=$(echo "$DB_STATS" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['reports'])" 2>/dev/null || echo "?")
DB_EXAM_TABLE=$(echo "$DB_STATS" | python3 -c "
import json,sys
d=json.load(sys.stdin)
rows=[]
for exam,cnt in d['exam_counts']:
    rows.append(f'  {exam}: {cnt}問')
print('\n'.join(rows))
" 2>/dev/null || echo "  取得失敗")

echo "  総問題数: $DB_TOTAL 問"
echo "  未妥当性確認: $DB_UNCHECKED 問"
echo "  未解決通報: $DB_REPORTS 件"
echo "  資格別:"
echo "$DB_EXAM_TABLE"

# ── 3. canary テスト ─────────────────────────────────────────
echo ""
echo "--- [4] canary テスト ---"

CANARY_RESULT="未実行"
CANARY_PASS=0
CANARY_FAIL=0
CANARY_WARNINGS=0
CANARY_EXIT=0

if [ -x "$CANARY_SCRIPT" ]; then
  CANARY_TMP=$(mktemp /tmp/canary_out_XXXX.txt)
  bash "$CANARY_SCRIPT" > "$CANARY_TMP" 2>&1
  CANARY_EXIT=$?
  CANARY_PASS=$(awk '/✓/{c++} END{print c+0}' "$CANARY_TMP")
  CANARY_FAIL=$(awk '/✘/{c++} END{print c+0}' "$CANARY_TMP")
  CANARY_WARNINGS=$(awk '/⚠️/{c++} END{print c+0}' "$CANARY_TMP")
  CANARY_RESULT="$([ "$CANARY_EXIT" -eq 0 ] && echo '✅ PASS' || echo '❌ FAIL') (passed=${CANARY_PASS} failed=${CANARY_FAIL} warnings=${CANARY_WARNINGS})"
  # 失敗詳細（最大20行）
  CANARY_DETAIL=$(grep -E "✘|Error|FAIL|error" "$CANARY_TMP" | head -20 || true)
  rm -f "$CANARY_TMP"
  echo "  $CANARY_RESULT"
  [ -n "$CANARY_DETAIL" ] && echo "  失敗詳細:" && echo "$CANARY_DETAIL" | sed 's/^/    /'
else
  echo "  ⚠️  canary.sh が見つかりません"
fi

# ── 5. メール生成・送信 ────────────────────────────────────────
echo ""
echo "--- [5] メール送信 ---"

# データをJSONファイルに書き出してからPythonに渡す（特殊文字対策）
REPORT_DATA_FILE=$(mktemp /tmp/report_data_XXXX.json)
python3 -c "
import json, sys
data = {
    'gen':       sys.argv[1],
    'val':       sys.argv[2],
    'rpt':       sys.argv[3],
    'rate':      sys.argv[4],
    'canary_r':  sys.argv[5],
    'canary_d':  sys.argv[6],
    'db_total':  sys.argv[7],
    'db_unchk':  sys.argv[8],
    'db_rpts':   sys.argv[9],
    'db_exams':  sys.argv[10],
    'cert':      sys.argv[11],
    'jst_now':   sys.argv[12],
    'smtp_user': sys.argv[13],
    'smtp_pass': sys.argv[14],
    'smtp_to':   sys.argv[15],
}
with open('$REPORT_DATA_FILE', 'w') as f:
    json.dump(data, f, ensure_ascii=False)
" \
  "$GEN_SUMMARY" "$VAL_SUMMARY" "$RPT_SUMMARY" "$GEN_RATE_INFO" \
  "$CANARY_RESULT" "${CANARY_DETAIL:-}" \
  "$DB_TOTAL" "$DB_UNCHECKED" "$DB_REPORTS" "$DB_EXAM_TABLE" \
  "$CERT_NEWS" "$JST_NOW" \
  "$SMTP_USER" "$SMTP_PASS" "$SMTP_TO"

# HTML生成＋メール送信を1つのPythonスクリプトで実行
SEND_RESULT=$(REPORT_DATA_FILE="$REPORT_DATA_FILE" python3 << 'PYEOF'
import json, html, smtplib, ssl, sys, re
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
import os

data_file = os.environ.get('REPORT_DATA_FILE', '')
try:
    with open(data_file) as f:
        d = json.load(f)
except Exception as e:
    print(f"ERROR: データファイル読み込み失敗: {e}")
    sys.exit(1)

def e(s): return html.escape(str(s))

def e_lines(s):
    """複数行テキストをHTMLに変換（1行目を太字、以降はインデント付き小文字）"""
    lines = str(s).strip().split('\n')
    if not lines:
        return ''
    parts = [f'<b>{html.escape(lines[0])}</b>']
    for line in lines[1:]:
        stripped = line.strip()
        if stripped:
            parts.append(f'<span style="display:block;margin-left:12px;font-size:12px;color:#666">{html.escape(stripped)}</span>')
    return ''.join(parts)

def md_to_html(text):
    """マークダウンをHTMLに変換（Claude出力の典型パターン対応）"""
    try:
        import markdown
        return markdown.markdown(text, extensions=['nl2br'])
    except ImportError:
        pass
    # フォールバック: 簡易変換
    lines = text.split('\n')
    out = []
    for line in lines:
        if line.startswith('### '): out.append(f'<h3 style="color:#232f3e;margin:16px 0 6px">{html.escape(line[4:])}</h3>')
        elif line.startswith('## '): out.append(f'<h2 style="color:#232f3e;border-left:3px solid #ff9900;padding-left:8px;margin:20px 0 8px">{html.escape(line[3:])}</h2>')
        elif line.startswith('# '): out.append(f'<h2 style="color:#232f3e">{html.escape(line[2:])}</h2>')
        elif line.strip() == '---': out.append('<hr style="border:none;border-top:1px solid #ddd;margin:12px 0">')
        elif re.match(r'^- ', line): out.append(f'<li style="margin:3px 0">{html.escape(line[2:])}</li>')
        elif line.strip() == '': out.append('<br>')
        else:
            esc = html.escape(line)
            esc = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', esc)
            out.append(f'<p style="margin:4px 0">{esc}</p>')
    return '\n'.join(out)

def e_pre(s):
    """プレーンテキスト表示用（コードブロック・ログ等）"""
    return html.escape(str(s))

gen      = e_lines(d['gen']); val     = e_lines(d['val'])
rpt      = e_lines(d['rpt']); rate    = e(d['rate'])
canary_r = e(d['canary_r']); canary_d = e(d['canary_d'])
db_total = e(d['db_total']); db_unchk = e(d['db_unchk'])
db_rpts  = e(d['db_rpts']);  db_exams = e(d['db_exams'])
cert_html = md_to_html(d['cert']); jst_now  = e(d['jst_now'])

canary_color = "#27ae60" if "PASS" in d['canary_r'] else "#e74c3c"
unchk_num    = int(d['db_unchk'].replace("?","0")) if d['db_unchk'].replace("?","0").isdigit() else 0
rpts_num     = int(d['db_rpts'].replace("?","0"))  if d['db_rpts'].replace("?","0").isdigit()  else 0
unchk_color  = "#e74c3c" if unchk_num > 50 else "#333"
rpts_color   = "#e74c3c" if rpts_num > 0  else "#27ae60"

rate_row     = f"<tr><td>レート制限</td><td class='warn'>{rate}</td></tr>" if d['rate'].strip() else ""
canary_detail_html = f"<br><br><b>失敗詳細:</b><pre>{canary_d}</pre>" if d['canary_d'].strip() else ""

html_body = f"""<!DOCTYPE html>
<html lang="ja"><head><meta charset="UTF-8">
<style>
  body{{font-family:-apple-system,sans-serif;color:#333;max-width:720px;margin:0 auto;padding:16px}}
  h1{{color:#232f3e;border-bottom:3px solid #ff9900;padding-bottom:8px}}
  h2{{color:#232f3e;margin-top:24px;font-size:15px;border-left:4px solid #ff9900;padding-left:10px}}
  .card{{background:#f8f9fa;border-radius:8px;padding:12px 16px;margin-bottom:12px}}
  table{{border-collapse:collapse;width:100%;font-size:13px}}
  th{{background:#232f3e;color:white;padding:6px 10px;text-align:left}}
  td{{padding:5px 10px;border-bottom:1px solid #eee}}
  pre{{background:#f4f4f4;padding:10px;border-radius:4px;font-size:12px;white-space:pre-wrap;word-break:break-all}}
  .warn{{color:#e67e22;font-weight:700}}
</style>
</head><body>
<h1>&#127769; 無限ノック 日次稼働レポート</h1>
<p style="color:#888;font-size:13px;">生成日時: {jst_now} | <a href="https://mugenknock.com">mugenknock.com</a></p>

<h2>1. 夜間スクリプト成果（直近3日分）</h2>
<div class="card">
  <table>
    <tr><th>項目</th><th>サマリー</th></tr>
    <tr><td>問題生成</td><td>{gen}</td></tr>
    <tr><td>妥当性確認</td><td>{val}</td></tr>
    <tr><td>通報チェック</td><td>{rpt}</td></tr>
    {rate_row}
  </table>
</div>

<h2>2. Canary テスト（検証環境）</h2>
<div class="card">
  <span style="color:{canary_color};font-weight:700;font-size:15px;">{canary_r}</span>
  {canary_detail_html}
</div>

<h2>3. AWS資格 公式情報チェック</h2>
<div class="card" style="font-size:13px;line-height:1.7">{cert_html}</div>

<h2>4. サイト稼働状況（DynamoDB）</h2>
<div class="card"><table>
  <tr><th>指標</th><th>値</th></tr>
  <tr><td>総問題数</td><td><b>{db_total} 問</b></td></tr>
  <tr><td>未妥当性確認</td><td style="color:{unchk_color}"><b>{db_unchk} 問</b></td></tr>
  <tr><td>未解決通報</td><td style="color:{rpts_color}"><b>{db_rpts} 件</b></td></tr>
</table>
<br><b>資格別問題数:</b><pre>{db_exams}</pre></div>

<hr style="border:none;border-top:1px solid #eee;margin-top:24px;">
<p style="color:#aaa;font-size:11px;">無限ノック 自動レポート | <a href="https://mugenknock.com">mugenknock.com</a></p>
</body></html>"""

smtp_user = d['smtp_user']
smtp_pass = d['smtp_pass']
smtp_to   = d['smtp_to']

if not smtp_user or not smtp_pass:
    # メール設定なし → HTMLをstdoutに出力してスキップ
    print("NO_SMTP")
    sys.exit(0)

subject = f"[無限ノック] 日次レポート {d['jst_now'][:10]}"
msg = MIMEMultipart("alternative")
msg["Subject"] = subject
msg["From"]    = smtp_user
msg["To"]      = smtp_to
msg.attach(MIMEText(html_body, "html", "utf-8"))

try:
    ctx = ssl.create_default_context()
    with smtplib.SMTP("smtp.gmail.com", 587) as s:
        s.ehlo()
        s.starttls(context=ctx)
        s.login(smtp_user, smtp_pass)
        s.sendmail(smtp_user, smtp_to, msg.as_string())
    print("OK")
except Exception as ex:
    print(f"ERROR: {ex}")
PYEOF
)
rm -f "$REPORT_DATA_FILE"

if [ "$SEND_RESULT" = "OK" ]; then
  echo "  ✅ メール送信完了 → $SMTP_TO"
elif [ "$SEND_RESULT" = "NO_SMTP" ]; then
  echo "  ⚠️  SMTP設定なし → メール送信スキップ（$MAIL_CONF を確認してください）"
else
  echo "  ❌ メール送信失敗: $SEND_RESULT"
fi

echo ""
echo "=========================================="
echo "日次レポート 完了: $(TZ='Asia/Tokyo' date '+%Y-%m-%d %H:%M JST')"
echo "=========================================="
