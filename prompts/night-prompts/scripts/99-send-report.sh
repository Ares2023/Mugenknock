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

# scripts/ 配下のどの深さに置かれても動作するパス解決
_d="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
while [ "$(basename "$_d")" != "scripts" ] && [ "$_d" != "/" ]; do _d="$(dirname "$_d")"; done
NIGHT_PROMPTS_DIR="$(dirname "$_d")"
PROJECT_DIR="$(dirname "$(dirname "$NIGHT_PROMPTS_DIR")")"  # repo root
LOG_DIR="$(dirname "$NIGHT_PROMPTS_DIR")/logs"              # prompts/logs/（nscriptログ）
CANARY_SCRIPT="$_d/canary.sh"
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

# 3日分の生成を集計。生成スクリプトは1日に複数回実行されるため、各実行ログ
# （night-prompts/logs/generate_{date}_HHMMSS.log）を全て読む（nscript ログは
# 1日1セッションしか残らず過少報告になるため使わない）。
GEN_SUMMARY=$(NIGHT_LOG_DIR="$NIGHT_PROMPTS_DIR/logs" TODAY="$TODAY" YESTERDAY="$YESTERDAY" python3 << 'PYEOF'
import os, re, glob, datetime

night_log = os.environ.get('NIGHT_LOG_DIR', '')
# レポートは未明に実行され「当日」はまだ実績ゼロのため、完了した直近3日（前日〜3日前）を対象にする。
try:
    base = datetime.datetime.strptime(os.environ.get('TODAY', ''), '%Y%m%d').date()
except Exception:
    base = datetime.date.today()
dates = [(base - datetime.timedelta(days=k)).strftime('%Y%m%d') for k in (1, 2, 3)]

total = 0
rows = []
rate_msgs = []
for d in dates:
    day_total = 0
    day_exam = {}
    files = sorted(glob.glob(os.path.join(night_log, f'generate_{d}_*.log')))
    for f in files:
        try:
            c = open(f, errors='ignore').read()
        except Exception:
            continue
        em = re.search(r'(?:選択|指定資格): (\S+)', c)
        exam = em.group(1) if em else '?'
        n = sum(int(x) for x in re.findall(r'合計インポート: (\d+)問', c))
        if n > 0:
            day_total += n
            day_exam[exam] = day_exam.get(exam, 0) + n
        if 'レート制限' in c:
            rate_msgs.append(f"{d[:4]}-{d[4:6]}-{d[6:]}: レート制限あり")
    total += day_total
    if day_exam:
        ex = ' '.join(f'{k}:{v}問' for k, v in sorted(day_exam.items()))
    elif not files:
        ex = 'ログなし'
    else:
        ex = '0問'
    rows.append(f"{d[:4]}-{d[4:6]}-{d[6:]} {day_total}問生成 ({ex})")

print(f"合計 {total}問生成")
for r in rows:
    print(f"  {r}")
for r in dict.fromkeys(rate_msgs):
    print(f"  ⚠️ {r}")
PYEOF
)

# 3日分の妥当性確認を集計。1日に複数回実行されるため各実行ログを全て読み、
# 全 "完了サマリー" 行を合算する（旧実装は re.search で1日1件しか拾えず過少報告だった）。
VAL_SUMMARY=$(NIGHT_LOG_DIR="$NIGHT_PROMPTS_DIR/logs" TODAY="$TODAY" YESTERDAY="$YESTERDAY" python3 << 'PYEOF'
import os, re, glob, datetime

night_log = os.environ.get('NIGHT_LOG_DIR', '')
# 完了した直近3日（前日〜3日前）を対象にする。
try:
    base = datetime.datetime.strptime(os.environ.get('TODAY', ''), '%Y%m%d').date()
except Exception:
    base = datetime.date.today()
dates = [(base - datetime.timedelta(days=k)).strftime('%Y%m%d') for k in (1, 2, 3)]

t_ok, t_fix, t_del = 0, 0, 0
rows = []
for d in dates:
    ok = fix = dl = runs = 0
    files = sorted(glob.glob(os.path.join(night_log, f'validity_{d}_*.log')))
    for f in files:
        try:
            c = open(f, errors='ignore').read()
        except Exception:
            continue
        for m in re.finditer(r'完了サマリー: 問題なし=(\d+)問 / 自動修正=(\d+)問 / 削除=(\d+)問', c):
            ok += int(m.group(1)); fix += int(m.group(2)); dl += int(m.group(3)); runs += 1
    t_ok += ok; t_fix += fix; t_del += dl
    detail = 'ログなし' if not files else f"問題なし={ok} 修正={fix} 削除={dl} / {runs}回"
    rows.append(f"{d[:4]}-{d[4:6]}-{d[6:]}: 確認{ok+fix+dl}件（{detail}）")

print(f"合計: 確認{t_ok+t_fix+t_del}件（問題なし={t_ok} 自動修正={t_fix} 削除={t_del}）")
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

DB_STATS=$(TODAY="$TODAY" python3 << 'PYEOF'
import subprocess, json, sys, os

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

# 直近3日の権威ある実数（DynamoDBタイムスタンプ。ログ集計のクロスチェック）
import datetime as _dt
try:
    _base = _dt.datetime.strptime(os.environ.get('TODAY', ''), '%Y%m%d').date()
except Exception:
    _base = _dt.date.today()
_lo = (_base - _dt.timedelta(days=3)).strftime('%Y-%m-%d')   # 3日前 00:00
_hi = _base.strftime('%Y-%m-%d')                            # 当日 00:00（未明実行のため当日は除外）
# 完了した直近3日（前日〜3日前）の権威ある実数
gen_3d = scan_count("createdAt >= :lo AND createdAt < :hi", {":lo": {"S": _lo}, ":hi": {"S": _hi}})
chk_3d = scan_count("validityCheckedAt >= :lo AND validityCheckedAt < :hi", {":lo": {"S": _lo}, ":hi": {"S": _hi}})

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
    "gen_3d": gen_3d,
    "chk_3d": chk_3d,
    "reports": reports,
    "exam_counts": exam_counts,
}, ensure_ascii=False))
PYEOF
)

DB_TOTAL=$(echo "$DB_STATS" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['total'])" 2>/dev/null || echo "?")
DB_UNCHECKED=$(echo "$DB_STATS" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['unchecked'])" 2>/dev/null || echo "?")
DB_GEN3D=$(echo "$DB_STATS" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('gen_3d','?'))" 2>/dev/null || echo "?")
DB_CHK3D=$(echo "$DB_STATS" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('chk_3d','?'))" 2>/dev/null || echo "?")
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
echo "  直近3日 新規生成(createdAt): $DB_GEN3D 問"
echo "  直近3日 確認済み(validityCheckedAt): $DB_CHK3D 問"
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

# 認証カナリア（ログイン後の主要フロー）。認証情報未設定なら SKIP。
CANARY_AUTH_RESULT="未実行"
CANARY_AUTH_SCRIPT="$_d/canary-auth.sh"
if [ -x "$CANARY_AUTH_SCRIPT" ]; then
  CA_TMP=$(mktemp /tmp/canary_auth_out_XXXX.txt)
  bash "$CANARY_AUTH_SCRIPT" > "$CA_TMP" 2>&1
  CA_EXIT=$?
  if grep -q "RESULT=SKIP" "$CA_TMP"; then
    CANARY_AUTH_RESULT="⏭️ SKIP（認証情報未設定）"
  else
    CA_PASS=$(awk '/✓|passed/{c++} END{print c+0}' "$CA_TMP")
    CA_FAIL=$(awk '/✘|failed/{c++} END{print c+0}' "$CA_TMP")
    CANARY_AUTH_RESULT="$([ "$CA_EXIT" -eq 0 ] && echo '✅ PASS' || echo '❌ FAIL') (passed=${CA_PASS} failed=${CA_FAIL})"
    CANARY_AUTH_DETAIL=$(grep -E "✘|Error|FAIL|error" "$CA_TMP" | head -15 || true)
  fi
  rm -f "$CA_TMP"
  echo "  認証カナリア: $CANARY_AUTH_RESULT"
  [ -n "${CANARY_AUTH_DETAIL:-}" ] && echo "$CANARY_AUTH_DETAIL" | sed 's/^/    /'
fi

# ── 4.5 監査・プロンプト改良 / カナリア整合性 / 日めくり 集計 ──────
echo ""
echo "--- [4.5] 監査・改良 / カナリア整合性 / 日めくり 集計 ---"
NL_DIR="$NIGHT_PROMPTS_DIR/logs"

# 問題品質監査＋プロンプト改良（audit-questions.sh -i の直近成果）
AUDIT_SUMMARY=$(NL="$NL_DIR" python3 << 'PYEOF'
import os, glob, json, re
from collections import Counter
nl = os.environ['NL']
js = sorted(p for p in glob.glob(os.path.join(nl, 'audit_*.json')) if p.endswith('.json'))
if not js:
    print('監査未実施'); raise SystemExit
try:
    rs = json.load(open(js[-1]))
except Exception:
    rs = []
vc = Counter(r.get('verdict') for r in rs)
line = f"監査{len(rs)}問: ok={vc.get('ok',0)} warn={vc.get('warn',0)} ng={vc.get('ng',0)}"
imp = sorted(glob.glob(os.path.join(nl, 'audit_*_improvement.md')))
if imp:
    txt = open(imp[-1]).read()
    m = re.search(r'適用 (\d+)件 / 見送り (\d+)件', txt)
    if m:
        line += f"\nプロンプト改良: 適用{m.group(1)}件 / 見送り{m.group(2)}件"
    m2 = re.search(r'## 改良方針\s*\n(.+)', txt)
    if m2:
        line += f"\n方針: {m2.group(1).strip()[:120]}"
else:
    line += "\nプロンプト改良: なし"
print(line)
PYEOF
)
echo "$AUDIT_SUMMARY" | sed 's/^/  /'

# カナリア整合性チェック（canary-coverage-check.sh の直近結果）
CANARY_COV_SUMMARY=$(NL="$NL_DIR" python3 << 'PYEOF'
import os, glob, re
nl = os.environ['NL']
md = sorted(glob.glob(os.path.join(nl, 'canary-coverage_*.md')))
if not md:
    print('整合性チェック未実施'); raise SystemExit
txt = open(md[-1]).read()
out = []
m = re.search(r'## 所見\s*\n(.+)', txt)
if m:
    out.append('所見: ' + m.group(1).strip()[:150])
mg = re.search(r'## カバー漏れ・陳腐化\s*\n((?:- .*\n?)+)', txt)
if mg:
    gaps = [g for g in mg.group(1).splitlines() if g.strip().startswith('- ') and '指摘なし' not in g]
    out.append(f"カバー漏れ/陳腐化: {len(gaps)}件")
ma = re.search(r'## 対応\s*\n(- .+)', txt)
if ma:
    out.append('対応: ' + ma.group(1).strip()[2:][:120])
print('\n'.join(out) if out else '整合性チェック結果あり')
PYEOF
)
echo "$CANARY_COV_SUMMARY" | sed 's/^/  /'

# 日めくりAWSサービス 生成(04)・検証(05) の直近結果（nscriptログから）
DAILY_SUMMARY=$(LOGD="$LOG_DIR" python3 << 'PYEOF'
import os, glob
ld = os.environ['LOGD']
def latest_tail(prefix, keywords):
    fs = sorted(glob.glob(os.path.join(ld, f'nscript_{prefix}_*.log')))
    if not fs:
        return None
    lines = open(fs[-1], errors='ignore').read().splitlines()
    hits = [l.strip() for l in lines if any(k in l for k in keywords)]
    return hits[-1] if hits else (lines[-1].strip() if lines else '')
gen = latest_tail('04-generate-daily-services', ['記事化', '生成', 'スキップ', '対象がありません', '完了'])
chk = latest_tail('05-check-daily-services', ['完了', 'サマリー', '修正', '削除', '警告', 'OK'])
out = []
out.append(f"生成: {gen}" if gen else "生成: ログなし")
out.append(f"検証: {chk}" if chk else "検証: ログなし")
print('\n'.join(out))
PYEOF
)
echo "$DAILY_SUMMARY" | sed 's/^/  /'

# バックエンド稼働・コスト（Lambda/API健全性・本番エラー・AWSコスト）
BACKEND_HEALTH="未取得"
_BH_SCRIPT="$_d/backend-health-check.sh"
if [ -x "$_BH_SCRIPT" ]; then
  BACKEND_HEALTH=$(bash "$_BH_SCRIPT" 2>/dev/null)
  [ -z "$BACKEND_HEALTH" ] && BACKEND_HEALTH="取得失敗"
fi
echo "$BACKEND_HEALTH" | sed 's/^/  /'

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
    'db_gen3d':  sys.argv[16],
    'db_chk3d':  sys.argv[17],
    'audit':     sys.argv[18],
    'canary_cov':sys.argv[19],
    'daily':     sys.argv[20],
    'backend':   sys.argv[21],
    'canary_auth':sys.argv[22],
}
with open('$REPORT_DATA_FILE', 'w') as f:
    json.dump(data, f, ensure_ascii=False)
" \
  "$GEN_SUMMARY" "$VAL_SUMMARY" "$RPT_SUMMARY" "$GEN_RATE_INFO" \
  "$CANARY_RESULT" "${CANARY_DETAIL:-}" \
  "$DB_TOTAL" "$DB_UNCHECKED" "$DB_REPORTS" "$DB_EXAM_TABLE" \
  "$CERT_NEWS" "$JST_NOW" \
  "$SMTP_USER" "$SMTP_PASS" "$SMTP_TO" \
  "$DB_GEN3D" "$DB_CHK3D" \
  "$AUDIT_SUMMARY" "$CANARY_COV_SUMMARY" "$DAILY_SUMMARY" \
  "$BACKEND_HEALTH" "$CANARY_AUTH_RESULT"

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
db_gen3d = e(d.get('db_gen3d','?')); db_chk3d = e(d.get('db_chk3d','?'))
cert_html = md_to_html(d['cert']); jst_now  = e(d['jst_now'])
audit_html      = e_lines(d.get('audit', '監査未実施'))
canary_cov_html = e_lines(d.get('canary_cov', '整合性チェック未実施'))
daily_html      = e_lines(d.get('daily', '日めくり情報なし'))
backend_html    = e_lines(d.get('backend', '未取得'))

canary_auth_r = e(d.get('canary_auth', '未実行'))
canary_auth_color = "#27ae60" if "PASS" in d.get('canary_auth', '') else ("#888" if "SKIP" in d.get('canary_auth', '') else "#e74c3c")
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

<h2>2. 問題品質監査＋プロンプト継続改良</h2>
<div class="card" style="font-size:13px;line-height:1.7">{audit_html}</div>

<h2>3. 日めくりAWSサービス記事（生成・検証）</h2>
<div class="card" style="font-size:13px;line-height:1.7">{daily_html}</div>

<h2>4. Canary テスト（検証環境）</h2>
<div class="card">
  <div><b>未ログイン:</b> <span style="color:{canary_color};font-weight:700;font-size:15px;">{canary_r}</span></div>
  <div style="margin-top:4px"><b>ログイン後:</b> <span style="color:{canary_auth_color};font-weight:700;font-size:15px;">{canary_auth_r}</span></div>
  {canary_detail_html}
  <div style="margin-top:10px;font-size:13px;line-height:1.7;border-top:1px dashed #ddd;padding-top:8px">
    <b>構成との整合性チェック</b><br>{canary_cov_html}
  </div>
</div>

<h2>5. AWS資格 公式情報チェック</h2>
<div class="card" style="font-size:13px;line-height:1.7">{cert_html}</div>

<h2>6. サイト稼働状況（DynamoDB）</h2>
<div class="card"><table>
  <tr><th>指標</th><th>値</th></tr>
  <tr><td>総問題数</td><td><b>{db_total} 問</b></td></tr>
  <tr><td>直近3日 新規生成</td><td><b>{db_gen3d} 問</b></td></tr>
  <tr><td>直近3日 確認済み</td><td><b>{db_chk3d} 問</b></td></tr>
  <tr><td>未妥当性確認</td><td style="color:{unchk_color}"><b>{db_unchk} 問</b></td></tr>
  <tr><td>未解決通報</td><td style="color:{rpts_color}"><b>{db_rpts} 件</b></td></tr>
</table>
<br><b>資格別問題数:</b><pre>{db_exams}</pre></div>

<h2>7. バックエンド稼働・コスト（直近24h）</h2>
<div class="card" style="font-size:13px;line-height:1.7">{backend_html}</div>

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
