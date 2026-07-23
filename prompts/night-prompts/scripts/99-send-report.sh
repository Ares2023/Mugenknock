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
# 資格変更チェックはLLM+WebFetch(大きなページ取得)でトークンを消費する。変更は稀なので
# 週次(月曜)のみ実行してトークンを節約する。他曜日はLLMを呼ばずスキップ。
_CERT_DOW=$(date '+%u' 2>/dev/null || echo 1)  # 1=月 .. 7=日
if [ -z "${CLAUDE_CMD:-}" ] || [ ! -x "${CLAUDE_CMD:-}" ]; then
  CERT_NEWS="Claude コマンドが見つからないため取得不可"
  echo "  ⚠️  Claude 未検出"
elif [ "$_CERT_DOW" != "1" ]; then
  CERT_NEWS="資格変更チェックは週次（月曜のみ実行）。今夜はスキップ。"
  echo "  資格変更チェック: 週次（月曜のみ実行）。今夜はスキップ（トークン節約）。"
else

  # ── フェーズ1: 直近7日の声明を高速スキャン（週次実行・設定値は注入しない）──
  SCAN_PROMPT=$(mktemp /tmp/cert_scan_XXXX.txt)
  SCAN_SINCE=$(date -d '7 days ago' '+%Y-%m-%d' 2>/dev/null || date -v-7d '+%Y-%m-%d' 2>/dev/null || echo "")
  cat > "$SCAN_PROMPT" << PROMPT
以下の2つのURLを確認し、${SCAN_SINCE}以降（直近7日以内）に公開されたAWS認定試験の変更声明だけを抽出してください。

確認URL:
- https://aws.amazon.com/certification/coming-soon/
- https://aws.amazon.com/blogs/training-and-certification/

【出力形式】JSONのみ。前置き・説明文不要。
直近7日以内に変更声明がなければ: {"has_changes": false}
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

【直近7日以内の公式声明】
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

    # 60行制限だと変更が多い日に文章が途中で切れるため上限を大きく取る（暴走時の安全弁のみ）
    CERT_NEWS=$("$CLAUDE_CMD" -p --model sonnet < "$DETAIL_PROMPT" 2>&1 | head -300)
    rm -f "$DETAIL_PROMPT"
    echo "  フェーズ2完了"
    echo "$CERT_NEWS" | head -5
  else
    CERT_NEWS="変更なし（対応不要）"
    echo "  直近7日以内の変更声明なし"
  fi
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

echo "  生成: $(echo "$GEN_SUMMARY" | head -1)"
echo "  妥当性: $(echo "$VAL_SUMMARY" | head -1)"
echo "  通報: $(echo "$RPT_SUMMARY" | head -1)"

# ── 2. DynamoDB 稼働状況 ─────────────────────────────────────
echo ""
echo "--- [3] DynamoDB稼働状況 ---"

DB_STATS=$(TODAY="$TODAY" STATE_DIR="$_d/state" python3 << 'PYEOF'
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
cache_file = os.path.join(os.environ.get("STATE_DIR", "."), "question_counts.json")
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

# ── Portal.tsx 問題数更新 ────────────────────────────────────
echo ""
echo "--- [3b] Portal.tsx 問題数更新 ---"
PORTAL_TSX="$PROJECT_DIR/src/views/Portal.tsx"
if [ "$DB_TOTAL" != "?" ] && [ -n "$DB_TOTAL" ] && echo "$DB_TOTAL" | grep -qE '^[0-9]+$'; then
  PORTAL_COUNT=$(( (DB_TOTAL / 100) * 100 ))
  CURRENT_COUNT=$(grep -oP 'const QUESTION_COUNT = \K[0-9]+' "$PORTAL_TSX" 2>/dev/null || echo "0")
  if [ "$PORTAL_COUNT" != "$CURRENT_COUNT" ]; then
    sed -i "s/const QUESTION_COUNT = [0-9]*/const QUESTION_COUNT = $PORTAL_COUNT/" "$PORTAL_TSX"
    git -C "$PROJECT_DIR" add src/views/Portal.tsx
    git -C "$PROJECT_DIR" commit -m "chore(portal): 問題数を ${CURRENT_COUNT} → ${PORTAL_COUNT} に更新 (DB実績: ${DB_TOTAL}問)"
    git -C "$PROJECT_DIR" push github develop
    echo "  ✅ Portal.tsx 更新・push完了: ${CURRENT_COUNT} → ${PORTAL_COUNT} (DB: ${DB_TOTAL}問)"
  else
    echo "  ℹ️  変更なし: ${CURRENT_COUNT}問 (100問刻み未達)"
  fi
else
  echo "  ⚠️  DB_TOTAL取得失敗のためスキップ (DB_TOTAL='${DB_TOTAL}')"
fi

# ── Cognito 新規ユーザー（前日1日分・JST） ────────────────────
echo ""
echo "--- [3c] Cognito 新規ユーザー（前日） ---"
# 認証カナリアのテストユーザーは実登録ではないため集計から除外する
CANARY_EMAIL=""
[ -f "${HOME}/.mugenknock_canary.conf" ] && CANARY_EMAIL=$(grep -E '^PLAYWRIGHT_EMAIL=' "${HOME}/.mugenknock_canary.conf" | head -1 | cut -d= -f2- | tr -d '"'"'"' \r')
COGNITO_NEW=$(AWS="$AWS" TODAY="$TODAY" CANARY_EMAIL="$CANARY_EMAIL" python3 << 'PYEOF'
import subprocess, json, os, datetime as dt

AWS = os.environ.get('AWS', '/home/yuzuki/local/bin/aws')
REGION = "ap-northeast-1"
POOL = "ap-northeast-1_KIOFciGhQ"
JST = dt.timezone(dt.timedelta(hours=9))
# 除外アカウント（認証カナリア等のシステム用ユーザー）
EXCLUDE = {e.strip().lower() for e in [os.environ.get('CANARY_EMAIL', ''), 'e2e-canary@mugenknock.com'] if e.strip()}

# レポートは未明実行のため、集計対象は「前日 00:00〜当日 00:00（JST）」の1日分
try:
    base = dt.datetime.strptime(os.environ.get('TODAY', ''), '%Y%m%d').date()
except Exception:
    base = dt.datetime.now(JST).date()
lo = dt.datetime.combine(base - dt.timedelta(days=1), dt.time(0, 0), JST)
hi = dt.datetime.combine(base, dt.time(0, 0), JST)

users = []
token = None
try:
    while True:
        cmd = [AWS, "cognito-idp", "list-users", "--user-pool-id", POOL,
               "--region", REGION, "--attributes-to-get", "email", "--max-items", "60"]
        if token:
            cmd += ["--starting-token", token]
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        data = json.loads(r.stdout)
        users += data.get("Users", [])
        token = data.get("NextToken")
        if not token:
            break
except Exception as ex:
    print(f"取得失敗: {ex}")
    raise SystemExit(0)

new = []
for u in users:
    cd = u.get("UserCreateDate")
    if not cd:
        continue
    try:
        t = dt.datetime.fromisoformat(cd)
    except Exception:
        continue
    if lo <= t < hi:
        email = next((a["Value"] for a in u.get("Attributes", []) if a.get("Name") == "email"), "(email不明)")
        if email.strip().lower() in EXCLUDE:
            continue
        new.append((t, email, u.get("UserStatus", "")))

new.sort()
if not new:
    print("新規登録なし")
else:
    print(f"新規登録 {len(new)}件")
    for t, email, st in new:
        print(f"{t.strftime('%m/%d %H:%M')} {email} [{st}]")
PYEOF
)
echo "$COGNITO_NEW" | sed 's/^/  /'

# ── 3. canary テスト ─────────────────────────────────────────
echo ""
echo "--- [4] canary テスト ---"

CANARY_RESULT="未実行"
CANARY_PASS=0
CANARY_FAIL=0
CANARY_WARNINGS=0
CANARY_EXIT=0

# canary はライブ実行せず、S3(mugenknock-error-logs/canary-logs/)の最新結果を読む。
# canary 本体(canary.sh)はローカル/専用タスクで実行し、その結果をここで参照する
# （Fargateレポートにplaywrightを同梱しないための方針）。
CANARY_S3_BUCKET="mugenknock-error-logs"
CANARY_S3_PREFIX="canary-logs"
CANARY_REGION="${REGION:-ap-northeast-1}"
CANARY_DETAIL=""
CANARY_LATEST_KEY=$("$AWS" s3api list-objects-v2 \
  --bucket "$CANARY_S3_BUCKET" --prefix "${CANARY_S3_PREFIX}/" \
  --query "reverse(sort_by(Contents[?ends_with(Key, '.json')], &LastModified))[0].Key" \
  --output text --region "$CANARY_REGION" 2>/dev/null)
if [ -n "$CANARY_LATEST_KEY" ] && [ "$CANARY_LATEST_KEY" != "None" ]; then
  CANARY_JSON_TMP=$(mktemp)
  "$AWS" s3 cp "s3://${CANARY_S3_BUCKET}/${CANARY_LATEST_KEY}" "$CANARY_JSON_TMP" --quiet --region "$CANARY_REGION" 2>/dev/null
  # env/ts/age は空白を含まない単一トークンなので read で安全に取得
  read -r CANARY_PASS CANARY_FAIL CANARY_WARNINGS CANARY_EXIT CANARY_ENV CANARY_TS CANARY_AGE < <(python3 -c "
import json,datetime
try:
    d=json.load(open('$CANARY_JSON_TMP'))
except Exception:
    print('0 0 0 1 ? ? ?'); raise SystemExit
ts=d.get('timestamp','?')
try:
    t=datetime.datetime.strptime(ts,'%Y%m%d-%H%M%S'); days=(datetime.datetime.now()-t).days
    age=('本日' if days<=0 else str(days)+'日前')
except Exception:
    age='?'
print(d.get('passed',0), d.get('failed',0), d.get('warnings',0), d.get('exit_code',1), d.get('env','?'), ts, age)
")
  rm -f "$CANARY_JSON_TMP"
  CANARY_RESULT="$([ "${CANARY_EXIT:-1}" -eq 0 ] && echo '✅ PASS' || echo '❌ FAIL') (passed=${CANARY_PASS} failed=${CANARY_FAIL} warnings=${CANARY_WARNINGS}) [${CANARY_ENV} 最終${CANARY_TS} ${CANARY_AGE}]"
  echo "  $CANARY_RESULT"
  if [ "${CANARY_AGE}" != "本日" ] && [ "${CANARY_AGE}" != "?" ]; then
    echo "  ⚠️ 最新canaryが古い（${CANARY_AGE}）。canary.sh を実行して更新してください"
  fi
  if [ "${CANARY_EXIT:-1}" -ne 0 ]; then
    CANARY_DETAIL="最新canary(${CANARY_TS} ${CANARY_ENV})がFAIL。ログ: s3://${CANARY_S3_BUCKET}/${CANARY_LATEST_KEY%.json}.log"
    echo "  失敗詳細: $CANARY_DETAIL"
  fi
else
  echo "  ⚠️ S3にcanary結果がありません（canary.sh未実行）: s3://${CANARY_S3_BUCKET}/${CANARY_S3_PREFIX}/"
  CANARY_RESULT="結果なし（S3にcanary記録なし）"
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
    # canary-auth.sh が末尾に出す "RESULT=PASS passed=X failed=Y" を信頼する。
    # 旧実装は awk /passed|failed/ でこのサマリー行自体の単語まで数え、
    # 実際は失敗0でも passed/failed を水増し（毎晩 failed=2）していた。
    CA_RESULT_LINE=$(grep -E '^RESULT=' "$CA_TMP" | tail -1)
    CA_PASS=$(echo "$CA_RESULT_LINE" | grep -oE 'passed=[0-9]+' | cut -d= -f2); CA_PASS=${CA_PASS:-0}
    CA_FAIL=$(echo "$CA_RESULT_LINE" | grep -oE 'failed=[0-9]+' | cut -d= -f2); CA_FAIL=${CA_FAIL:-0}
    CANARY_AUTH_RESULT="$([ "$CA_EXIT" -eq 0 ] && echo '✅ PASS' || echo '❌ FAIL') (passed=${CA_PASS} failed=${CA_FAIL})"
    # 失敗詳細は FAIL 時のみ・実マーカーに限定（error 部分一致のノイズを排除）。
    if [ "$CA_EXIT" -ne 0 ]; then
      CANARY_AUTH_DETAIL=$(grep -E "✘|❌|FAIL" "$CA_TMP" | head -30 || true)
    fi
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
# 出力は行頭マーカーで構造化し、メール側の audit_to_html が装飾する:
#   1行目=ヘッダ / 【〜】=小見出し / ⚠・✖=指摘問題 / ・=指摘詳細 / ✅=改良適用 / その他=本文
# 文字数スライスはしない（全文を載せる。途切れ防止）
AUDIT_SUMMARY=$(NL="$NL_DIR" TODAY="$TODAY" python3 << 'PYEOF'
import os, glob, json, re, datetime
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
exams = sorted({r.get('examType', '') for r in rs if r.get('examType')})
exam_note = f"（{'/'.join(exams)}）" if exams else ''
lines = [f"監査 {len(rs)}問{exam_note}: OK {vc.get('ok',0)} / 注意 {vc.get('warn',0)} / 要修正 {vc.get('ng',0)}"]

# 指摘のあった問題を列挙。ng(要修正=自動修正対象)は全文、warn(注意)は1行要約＋上限で
# レポート量を抑える（トークン不足対策・メール肥大化防止）。
flagged = [r for r in rs if r.get('verdict') in ('warn', 'ng')]
def _extra(r):
    d = r.get('difficulty')
    return f"（難易度: {d}）" if d and d != 'appropriate' else ''
if flagged:
    lines.append('【指摘のあった問題】')
    for r in [x for x in flagged if x.get('verdict') == 'ng']:
        lines.append(f"✖ {r.get('questionId', '?')}{_extra(r)}")
        for issue in (r.get('issues') or []):
            lines.append(f"・{issue}")
    warn_items = [x for x in flagged if x.get('verdict') == 'warn']
    WARN_CAP = 10
    for r in warn_items[:WARN_CAP]:
        first = (r.get('issues') or ['(詳細なし)'])[0]
        lines.append(f"⚠ {r.get('questionId', '?')}{_extra(r)}: {first}")
    if len(warn_items) > WARN_CAP:
        lines.append(f"…他 warn {len(warn_items) - WARN_CAP} 件（詳細は生データ audit_*.json 参照）")

# 直近3日以内に生成された改良のみ対象にする。最新ファイルを無条件に読むと、
# 何日も前に一度適用した改良を毎晩「今夜の成果」として重複再掲してしまうため。
try:
    _base = datetime.datetime.strptime(os.environ.get('TODAY', ''), '%Y%m%d').date()
except Exception:
    _base = datetime.date.today()
_cutoff = _base - datetime.timedelta(days=3)
def _imp_date(p):
    m = re.search(r'audit_(\d{8})_', os.path.basename(p))
    if not m:
        return None
    try:
        return datetime.datetime.strptime(m.group(1), '%Y%m%d').date()
    except Exception:
        return None
imp = sorted(p for p in glob.glob(os.path.join(nl, 'audit_*_improvement.md'))
             if (_d := _imp_date(p)) and _d >= _cutoff)
if imp:
    txt = open(imp[-1]).read()
    m = re.search(r'適用 (\d+)件 / 見送り (\d+)件', txt)
    lines.append('【プロンプト自動改良】' + (f" 適用 {m.group(1)}件 / 見送り {m.group(2)}件" if m else ''))
    # 改良方針は複数行でもセクション全体を取り込む（行頭 .+ だと初行で途切れる）
    m2 = re.search(r'## 改良方針\s*\n(.*?)(?=\n#|\Z)', txt, re.S)
    if m2:
        lines.append('方針: ' + m2.group(1).strip())
    # 適用先ファイルと理由（全文）
    for fm in re.finditer(r'### ✅ (\S+)\s*\n\*\*理由:\*\*\s*(.*?)(?=\n```|\n###|\Z)', txt, re.S):
        reason = ' '.join(fm.group(2).split())
        lines.append(f"✅ {fm.group(1)}: {reason}")
else:
    lines.append('【プロンプト自動改良】直近3日は改良なし')
print('\n'.join(lines))
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
# 整合性チェック自体が失敗した回（Claudeの判定/JSON抽出エラー）は、
# 「所見:(判定失敗) / 対応:JSON抽出失敗のため未対応」を生のまま載せると
# 毎回の障害表示になり紛らわしいので、簡潔な1行に丸める。
if '(判定失敗)' in txt or 'JSON抽出失敗' in txt:
    print('整合性チェック: 今回は判定不可（実行時エラーによりスキップ）')
    raise SystemExit
out = []
# 所見・対応はセクション全体を取り込む（行頭 .+ の1行マッチだと複数行の文章が初行で途切れる）
m = re.search(r'## 所見\s*\n(.*?)(?=\n## |\Z)', txt, re.S)
if m and m.group(1).strip():
    out.append('所見: ' + ' '.join(m.group(1).split('```')[0].split()))
mg = re.search(r'## カバー漏れ・陳腐化\s*\n((?:- .*\n?)+)', txt)
gaps = []
if mg:
    gaps = [g.strip()[2:] for g in mg.group(1).splitlines() if g.strip().startswith('- ') and '指摘なし' not in g]
    out.append(f"カバー漏れ/陳腐化: {len(gaps)}件")
    for g in gaps:
        out.append(f"・{g}")
ma = re.search(r'## 対応\s*\n(.*?)(?=\n## |\Z)', txt, re.S)
if ma and ma.group(1).strip():
    # diff等のコードブロックはメールに載せない（specファイル側で確認できる）
    body = ma.group(1).split('```')[0]
    resp = [l.strip()[2:] if l.strip().startswith('- ') else l.strip() for l in body.strip().splitlines() if l.strip()]
    if resp:
        out.append('対応: ' + ' / '.join(resp))
print('\n'.join(out) if out else '整合性チェック結果あり')
PYEOF
)
echo "$CANARY_COV_SUMMARY" | sed 's/^/  /'

# 日めくりAWSサービス 生成(04)・検証(05) の直近結果（nscriptログから）
# レポートは未明に実行されるため当日ログはまだ完成途中（スキップ等の中間状態を誤報告しやすい）。
# GEN_SUMMARY と同様に「前日〜3日前」を優先して読む。
DAILY_SUMMARY=$(LOGD="$LOG_DIR" TODAY="$TODAY" YESTERDAY="$YESTERDAY" python3 << 'PYEOF'
import os, glob, datetime
ld = os.environ['LOGD']
try:
    base = datetime.date.fromisoformat(os.environ.get('TODAY', '')[:4] + '-' + os.environ.get('TODAY', '')[4:6] + '-' + os.environ.get('TODAY', '')[6:])
except Exception:
    base = datetime.date.today()
# 前日〜3日前を優先（当日は未完成のためスキップ）
dates = [(base - datetime.timedelta(days=k)).strftime('%Y%m%d') for k in (1, 2, 3)]

def dated_tail(prefix, keywords):
    for d in dates:
        f = os.path.join(ld, f'nscript_{prefix}_{d}.log')
        if not os.path.exists(f):
            continue
        lines = open(f, errors='ignore').read().splitlines()
        hits = [l.strip() for l in lines if any(k in l for k in keywords)]
        if hits:
            return f"{d[:4]}-{d[4:6]}-{d[6:]} {hits[-1]}"
    return None

gen = dated_tail('04-generate-daily-services', ['件 生成完了', '登録完了', 'スキップ', '対象がありません', '完了'])
chk = dated_tail('05-check-daily-services', ['完了サマリー', 'サマリー', '修正', '削除', '警告'])
out = []
out.append(f"生成: {gen}" if gen else "生成: ログなし（直近3日）")
out.append(f"検証: {chk}" if chk else "検証: ログなし（直近3日）")
print('\n'.join(out))
PYEOF
)
echo "$DAILY_SUMMARY" | sed 's/^/  /'

# バックエンド稼働・コスト（Lambda/API健全性・本番エラー・AWS前日コスト・今月累計コスト:AWS/Cloudflare/ほか）
BACKEND_HEALTH="未取得"
_BH_SCRIPT="$_d/backend-health-check.sh"
if [ -x "$_BH_SCRIPT" ]; then
  BACKEND_HEALTH=$(bash "$_BH_SCRIPT" 2>/dev/null)
  [ -z "$BACKEND_HEALTH" ] && BACKEND_HEALTH="取得失敗"
fi
echo "$BACKEND_HEALTH" | sed 's/^/  /'

# ── 4.8 テストユーザー データ整合性チェック ──────────────────────
echo ""
echo "--- [4.8] テストユーザー データ整合性チェック ---"

TEST_USER_ID="0734fa28-60c1-707d-f888-f2cb860e561d"
TEST_USER_SNAPSHOT="$_d/state/test_user_snapshot.json"
TODAY_DATE=$(TZ='Asia/Tokyo' date '+%Y-%m-%d')

TEST_USER_CHECK=$(AWS_BIN="$AWS" REGION="$REGION" USERID="$TEST_USER_ID" \
  SNAPSHOT_FILE="$TEST_USER_SNAPSHOT" TODAY_DATE="$TODAY_DATE" python3 << 'PYEOF'
import os, json, subprocess, datetime

aws  = os.environ['AWS_BIN']
reg  = os.environ['REGION']
uid  = os.environ['USERID']
snap = os.environ['SNAPSHOT_FILE']
today = os.environ['TODAY_DATE']

def dynamo_get(table, key_json):
    try:
        r = subprocess.run(
            [aws, 'dynamodb', 'get-item', '--table-name', table,
             '--key', key_json, '--region', reg],
            capture_output=True, text=True, timeout=60)
        if r.returncode != 0:
            return None
        return json.loads(r.stdout).get('Item')
    except Exception:
        return None

def dynamo_query(table, key_expr, expr_vals):
    try:
        r = subprocess.run(
            [aws, 'dynamodb', 'query', '--table-name', table,
             '--key-condition-expression', key_expr,
             '--expression-attribute-values', json.dumps(expr_vals),
             '--region', reg, '--select', 'COUNT'],
            capture_output=True, text=True, timeout=60)
        if r.returncode != 0:
            return None
        return json.loads(r.stdout).get('Count')
    except Exception:
        return None

lines = ['テストユーザー (yuzukisera00@gmail.com) データ整合性チェック']
issues = []
tag_count = None
today_count = 0
reset_at = ''

try:
    # ── 1. 今日の演習量 (dailyProgress) — 全試験種別の合計 ──
    daily_key = json.dumps({'settingId': {'S': f'dailyProgress_{uid}'}})
    daily_item = dynamo_get('AppSettings', daily_key)
    if daily_item:
        # 属性キーは {examType}_{date} 形式 — 今日分を全試験種別で合計
        today_count = sum(
            int(v.get('N', 0))
            for k, v in daily_item.items()
            if k.endswith(f'_{today}') and 'N' in v
        )
        exam_breakdown = {k.split('_')[0]: int(v['N']) for k, v in daily_item.items()
                          if k.endswith(f'_{today}') and 'N' in v and int(v['N']) > 0}
        detail = ' / '.join(f'{e}:{n}問' for e, n in sorted(exam_breakdown.items())) or 'なし'
        lines.append(f'今日の演習量: {today_count} 問 ({today}) [{detail}]')
    else:
        lines.append('今日の演習量: データなし')

    # ── 2. UserTagStats 件数 (distinct tagId 数) ──
    tag_count = dynamo_query(
        'UserTagStats',
        'userId = :uid',
        {':uid': {'S': uid}}
    )
    if tag_count is None:
        lines.append('UserTagStats: クエリ失敗')
        issues.append('UserTagStats クエリ失敗')
    else:
        lines.append(f'UserTagStats エントリ数: {tag_count} tagId')

    # ── 3. resetAt チェック ──
    reset_key = json.dumps({'settingId': {'S': f'userReset_{uid}'}})
    reset_item = dynamo_get('AppSettings', reset_key)
    reset_at = reset_item.get('resetAt', {}).get('S', '') if reset_item else ''
    lines.append(f'resetAt: {reset_at if reset_at else "なし"}')

    # ── 4. スナップショット比較 ──
    prev = {}
    if os.path.exists(snap):
        try:
            prev = json.load(open(snap))
        except Exception:
            pass

    prev_tag_count = prev.get('tag_count')
    prev_reset_at  = prev.get('reset_at', '')

    if prev_tag_count is not None and tag_count is not None:
        diff = tag_count - prev_tag_count
        if diff < -2:
            msg = f'⚠ UserTagStats が前回より {abs(diff)} tagId 減少 ({prev_tag_count} → {tag_count})'
            lines.append(msg)
            issues.append(msg)
        elif diff < 0:
            lines.append(f'UserTagStats 微減: {prev_tag_count} → {tag_count}（許容範囲）')
        else:
            lines.append(f'UserTagStats 増減: {prev_tag_count} → {tag_count}（正常）')
    else:
        lines.append('スナップショット比較: 前回データなし（初回実行）')

    if prev_reset_at and prev_reset_at != reset_at:
        msg = f'⚠ resetAt 変化: {prev_reset_at} → {reset_at if reset_at else "なし"}'
        lines.append(msg)
        issues.append(msg)

    # ── 5. 演習量 vs tagId の整合性チェック ──
    if today_count > 5 and tag_count is not None and tag_count == 0:
        msg = f'✖ 演習量 {today_count} 問あるが UserTagStats が 0 — データ消失の可能性'
        lines.append(msg)
        issues.append(msg)
    elif today_count > 0 and tag_count is not None:
        max_expected = tag_count * 10
        if today_count > max_expected + 5:
            msg = f'⚠ 演習量 ({today_count}) が UserTagStats ({tag_count} tagId, 最大 {max_expected} 問) を大幅に超過'
            lines.append(msg)
            issues.append(msg)

    if issues:
        lines.append(f'--- {len(issues)}件の問題を検出 ---')
    else:
        lines.append('✅ 整合性OK（問題なし）')

    # ── 6. スナップショット保存 ──
    new_snap = {'date': today, 'tag_count': tag_count, 'today_count': today_count, 'reset_at': reset_at}
    try:
        with open(snap, 'w') as f:
            json.dump(new_snap, f, ensure_ascii=False)
    except Exception as e:
        lines.append(f'スナップショット保存失敗: {e}')

except Exception as e:
    lines.append(f'⚠ チェック中断 ({type(e).__name__}): {e}')

print('\n'.join(lines))
PYEOF
)
echo "$TEST_USER_CHECK" | sed 's/^/  /'

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
    'canary_r':  sys.argv[4],
    'canary_d':  sys.argv[5],
    'db_total':  sys.argv[6],
    'db_unchk':  sys.argv[7],
    'db_rpts':   sys.argv[8],
    'db_exams':  sys.argv[9],
    'cert':      sys.argv[10],
    'jst_now':   sys.argv[11],
    'smtp_user': sys.argv[12],
    'smtp_pass': sys.argv[13],
    'smtp_to':   sys.argv[14],
    'db_gen3d':  sys.argv[15],
    'db_chk3d':  sys.argv[16],
    'audit':     sys.argv[17],
    'canary_cov':sys.argv[18],
    'daily':     sys.argv[19],
    'backend':   sys.argv[20],
    'canary_auth':sys.argv[21],
    'cognito_new':sys.argv[22],
    'canary_auth_d':sys.argv[23],
    'test_user_check':sys.argv[24],
}
with open('$REPORT_DATA_FILE', 'w') as f:
    json.dump(data, f, ensure_ascii=False)
" \
  "$GEN_SUMMARY" "$VAL_SUMMARY" "$RPT_SUMMARY" \
  "$CANARY_RESULT" "${CANARY_DETAIL:-}" \
  "$DB_TOTAL" "$DB_UNCHECKED" "$DB_REPORTS" "$DB_EXAM_TABLE" \
  "$CERT_NEWS" "$JST_NOW" \
  "$SMTP_USER" "$SMTP_PASS" "$SMTP_TO" \
  "$DB_GEN3D" "$DB_CHK3D" \
  "$AUDIT_SUMMARY" "$CANARY_COV_SUMMARY" "$DAILY_SUMMARY" \
  "$BACKEND_HEALTH" "$CANARY_AUTH_RESULT" "$COGNITO_NEW" \
  "${CANARY_AUTH_DETAIL:-}" "$TEST_USER_CHECK"

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

def audit_to_html(s):
    """監査サマリー専用レンダラー。行頭マーカーで装飾を分ける:
    1行目=太字ヘッダ / 【〜】=小見出し / ✖=赤 / ⚠=橙 / ・=詳細(小さめ) / ✅=緑 / その他=本文"""
    lines = [l for l in str(s).strip().split('\n')]
    if not lines:
        return ''
    parts = [f'<b>{html.escape(lines[0])}</b>']
    for line in lines[1:]:
        st = line.strip()
        if not st:
            continue
        esc = html.escape(st)
        if st.startswith('【'):
            parts.append(f'<div style="font-weight:700;margin-top:10px;color:#232f3e">{esc}</div>')
        elif st.startswith('✖'):
            parts.append(f'<div style="margin:4px 0 0 4px;color:#e74c3c;font-weight:600">{esc}</div>')
        elif st.startswith('⚠'):
            parts.append(f'<div style="margin:4px 0 0 4px;color:#e67e22;font-weight:600">{esc}</div>')
        elif st.startswith('・'):
            parts.append(f'<div style="margin-left:22px;font-size:12px;color:#555;line-height:1.6">{esc}</div>')
        elif st.startswith('✅'):
            parts.append(f'<div style="margin:4px 0 0 4px;color:#1e8449">{esc}</div>')
        else:
            parts.append(f'<div style="margin:2px 0 0 8px;font-size:12.5px;color:#444;line-height:1.7">{esc}</div>')
    return ''.join(parts)

gen      = e_lines(d['gen']); val     = e_lines(d['val'])
rpt      = e_lines(d['rpt'])
canary_r = e(d['canary_r']); canary_d = e(d['canary_d'])
db_total = e(d['db_total']); db_unchk = e(d['db_unchk'])
db_rpts  = e(d['db_rpts']);  db_exams = e(d['db_exams'])
db_gen3d = e(d.get('db_gen3d','?')); db_chk3d = e(d.get('db_chk3d','?'))
cert_html = md_to_html(d['cert']); jst_now  = e(d['jst_now'])
audit_html      = audit_to_html(d.get('audit', '監査未実施'))
canary_cov_html = audit_to_html(d.get('canary_cov', '整合性チェック未実施'))
daily_html      = e_lines(d.get('daily', '日めくり情報なし'))
def backend_to_html(raw):
    """backend-health-check.sh の出力をテーブル形式 HTML に変換"""
    import re
    rows = []
    cost_rows = []
    for line in str(raw).strip().split('\n'):
        s = line.strip()
        if not s:
            continue
        warn = '⚠️' in s
        color = ' style="color:#e67e22;font-weight:700"' if warn else ''
        # Lambda prod/dev
        m = re.match(r'(⚠️\s*)?(prod|dev): 実行(\S+) エラー(\S+) スロットル(\S+) 最大(\S+)', s)
        if m:
            fn = m.group(2); inv = m.group(3); err = m.group(4); thr = m.group(5); dur = m.group(6)
            err_style = ' style="color:#e74c3c;font-weight:700"' if err != '0' else ''
            rows.append(f'<tr><td>Lambda({fn})</td><td>実行 {inv}</td>'
                        f'<td{err_style}>エラー {err}</td><td>スロットル {thr}</td><td>最大 {dur}</td></tr>')
            continue
        # API
        m = re.match(r'(⚠️\s*)?API\(prod,24h\): リクエスト(\S+) 5xx=(\S+) 4xx=(\S+) p99=(\S+)', s)
        if m:
            req = m.group(2); e5 = m.group(3); e4 = m.group(4); p99 = m.group(5)
            e5_style = ' style="color:#e74c3c;font-weight:700"' if e5 != '0' else ''
            rows.append(f'<tr><td>API Gateway(prod)</td><td>リクエスト {req}</td>'
                        f'<td{e5_style}>5xx {e5}</td><td>4xx {e4}</td><td>p99 {p99}</td></tr>')
            continue
        # エラーログ
        m = re.match(r'(⚠️\s*)?本番エラーログ.*?(\d+)件', s)
        if m:
            cnt = m.group(2)
            style = ' style="color:#e74c3c;font-weight:700"' if cnt != '0' else ''
            rows.append(f'<tr><td colspan="5"{style}>本番エラーログ(24h): {cnt}件</td></tr>')
            continue
        # 月次累計コスト（見出し: AWS / Cloudflare / ほか / 合計）
        m = re.match(r'月次コスト\((.+?)\)\s*(.+?): (\$[\d.]+)(.*)', s)
        if m:
            scope = m.group(1); label = m.group(2); total = m.group(3); note = m.group(4).strip()
            is_total = label == '合計'
            style = 'padding-top:6px;font-weight:700;border-top:1px solid #ddd' if is_total else 'padding-top:4px'
            cost_rows.append(f'<tr><td colspan="4" style="{style}">📅 今月 {html.escape(label)} '
                             f'({html.escape(scope)}): <b>{total}</b> {html.escape(note)}</td></tr>')
            continue
        # コスト合計
        m = re.match(r'AWSコスト\((.+?)\): (\$[\d.]+)(.*)', s)
        if m:
            date = m.group(1); total = m.group(2); delta = m.group(3).strip()
            cost_rows.append(f'<tr><td colspan="4"><b>AWSコスト ({date}): {total}</b> {html.escape(delta)}</td></tr>')
            continue
        # サービス別コスト
        m = re.match(r'[・\-]\s*(.+?): (\$[\d.]+)', s)
        if m:
            cost_rows.append(f'<tr><td style="padding-left:16px;color:#666">{html.escape(m.group(1))}</td>'
                             f'<td colspan="3" style="color:#666">{html.escape(m.group(2))}</td></tr>')
            continue
        # その他
        rows.append(f'<tr><td colspan="5"{color}>{html.escape(s)}</td></tr>')
    header = '<tr><th>対象</th><th>実行</th><th>エラー</th><th>スロットル/4xx</th><th>最大レイテンシ</th></tr>'
    return (f'<table>{header}{"".join(rows)}</table>'
            + (f'<table style="margin-top:8px">{"".join(cost_rows)}</table>' if cost_rows else ''))

backend_html    = backend_to_html(d.get('backend', '未取得'))
test_user_html  = audit_to_html(d.get('test_user_check', 'チェック未実施'))
test_user_raw   = str(d.get('test_user_check', ''))
test_user_has_issue = any(m in test_user_raw for m in ('⚠', '✖', '問題を検出'))

cognito_raw     = str(d.get('cognito_new', '')).strip()
cognito_has_new = bool(cognito_raw) and not cognito_raw.startswith('新規登録なし') and '取得失敗' not in cognito_raw
cognito_html    = e_lines(cognito_raw) if cognito_raw else e('新規登録なし')

canary_auth_r = e(d.get('canary_auth', '未実行'))
canary_auth_d = e(d.get('canary_auth_d', ''))
canary_auth_color = "#27ae60" if "PASS" in d.get('canary_auth', '') else ("#888" if "SKIP" in d.get('canary_auth', '') else "#e74c3c")
canary_color = "#27ae60" if "PASS" in d['canary_r'] else "#e74c3c"
unchk_num    = int(d['db_unchk'].replace("?","0")) if d['db_unchk'].replace("?","0").isdigit() else 0
rpts_num     = int(d['db_rpts'].replace("?","0"))  if d['db_rpts'].replace("?","0").isdigit()  else 0
unchk_color  = "#e74c3c" if unchk_num > 50 else "#333"
rpts_color   = "#e74c3c" if rpts_num > 0  else "#27ae60"

# 新規ユーザー登録は「登録があった時だけ」目立つカードで表示する
cognito_section = (
    f'<h2 style="border-left-color:#27ae60">&#128100; 新規ユーザー登録（前日）</h2>'
    f'<div class="card" style="font-size:13px;line-height:1.7;background:#eafaf1;border:1px solid #27ae60">{cognito_html}</div>'
) if cognito_has_new else ""
canary_detail_html = f"<br><br><b>失敗詳細:</b><pre>{canary_d}</pre>" if d['canary_d'].strip() else ""
canary_auth_detail_html = f"<br><b>ログイン後 失敗詳細:</b><pre>{canary_auth_d}</pre>" if d.get('canary_auth_d','').strip() else ""

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
  {canary_auth_detail_html}
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

{cognito_section}

<h2>7. バックエンド稼働・コスト（直近24h）</h2>
<div class="card" style="font-size:13px;line-height:1.7">{backend_html}</div>

<h2 style="border-left-color:{'#e74c3c' if test_user_has_issue else '#ff9900'}">8. テストユーザー データ整合性（yuzukisera00）</h2>
<div class="card" style="font-size:13px;line-height:1.7;{'background:#fef9f0;border:1px solid #e67e22' if test_user_has_issue else ''}">{test_user_html}</div>

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
