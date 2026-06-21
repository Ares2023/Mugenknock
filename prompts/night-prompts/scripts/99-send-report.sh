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
  CERT_PROMPT_FILE=$(mktemp /tmp/cert_news_XXXX.txt)
  cat > "$CERT_PROMPT_FILE" << 'PROMPT'
あなたはAWS認定試験学習サイトの運営者アシスタントです。
以下のURLを確認し、AWS認定試験に関する「変更・修正・更新情報」を日本語でまとめてください。

【確認URL（優先度順）】
1. Coming Soon（新資格・改定・廃止の一次情報）:
   https://aws.amazon.com/certification/coming-soon/

2. 試験ガイド一覧（Revisionsページ）:
   https://docs.aws.amazon.com/aws-certification/latest/examguides/aws-certification-exam-guides.html

3. DVA Revisions:
   https://docs.aws.amazon.com/aws-certification/latest/developer-associate-02/dva-02-revisions.html

4. DEA Revisions:
   https://docs.aws.amazon.com/aws-certification/latest/data-engineer-associate-01/dea-01-revisions.html

5. SCS Revisions:
   https://docs.aws.amazon.com/aws-certification/latest/security-specialty-03/scs03-revisions.html

6. AWS Training & Certification Blog:
   https://aws.amazon.com/blogs/training-and-certification/

【レポート観点】
このサイトは「AWS資格演習問題サービス（全12資格対応）」です。
以下の観点で変更・更新情報を報告してください：

確認項目:
- 新しい資格の追加（サービスへの追加対応が必要）
- 資格の廃止・終了予定（サービスからの削除が必要）
- 試験コード変更（CLF-C02→C03 等）
- Revisionsページに掲載された出題範囲の変更
- 対象AWSサービスの追加・削除
- 試験開始日・終了日の変更

【出力形式（変更なしの場合も明記）】
変更あり・なし共に以下の形式で返答：

## AWS資格 更新情報サマリー
確認日時: [今日の日付]

### 変更・更新情報
（変更がなければ「現時点で変更情報なし」と記載）

各変更は以下の形式で：
- 【資格名】変更内容：[具体的な変更]
  学習サイトへの影響：[対応要否と内容]

### 要対応アクション
（なければ「対応不要」）

---

URLを順番にFetchして確認し、日本語でまとめてください。
PROMPT

  CERT_NEWS=$("$CLAUDE_CMD" -p --allowed-tools WebFetch < "$CERT_PROMPT_FILE" 2>&1 | head -100)
  rm -f "$CERT_PROMPT_FILE"
  echo "$CERT_NEWS" | head -10
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

gen      = e(d['gen']);       val     = e(d['val'])
rpt      = e(d['rpt']);       rate    = e(d['rate'])
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
