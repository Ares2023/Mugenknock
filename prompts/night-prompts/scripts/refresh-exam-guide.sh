#!/bin/bash
# AWS認定試験ガイド更新スクリプト（手動実行用）
# 公式資格ページをWebFetch経由で取得し、instructions/*.txt を最新情報に更新する
#
# Usage:
#   ./refresh-exam-guide.sh           # 全資格を更新
#   ./refresh-exam-guide.sh SAA       # SAA のみ更新
#   ./refresh-exam-guide.sh SAA CLF   # 複数指定
#   ./refresh-exam-guide.sh -h        # ヘルプ

set -uo pipefail

export PATH="/home/yuzuki/local/bin:$PATH"
unset ANTHROPIC_API_KEY

_find_claude() {
  [ -x /usr/local/bin/claude ] && { echo /usr/local/bin/claude; return; }
  local _cv; _cv=$(command -v claude 2>/dev/null)
  [ -n "$_cv" ] && [ -x "$_cv" ] && { echo "$_cv"; return; }
}
CLAUDE_CMD=$(_find_claude)
if [ -z "${CLAUDE_CMD:-}" ] || [ ! -x "${CLAUDE_CMD:-}" ]; then
  echo "❌ claude コマンドが見つかりません" >&2; exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTRUCTION_DIR="$(dirname "$SCRIPT_DIR")/scripts/instructions"

# 全資格の公式URL定義
declare -A EXAM_URLS
EXAM_URLS[CLF]="https://aws.amazon.com/jp/certification/certified-cloud-practitioner/"
EXAM_URLS[AIF]="https://aws.amazon.com/jp/certification/certified-ai-practitioner/"
EXAM_URLS[SAA]="https://aws.amazon.com/jp/certification/certified-solutions-architect-associate/"
EXAM_URLS[DVA]="https://aws.amazon.com/jp/certification/certified-developer-associate/"
EXAM_URLS[SOA]="https://aws.amazon.com/jp/certification/certified-sysops-admin-associate/"
EXAM_URLS[DEA]="https://aws.amazon.com/jp/certification/certified-data-engineer-associate/"
EXAM_URLS[MLA]="https://aws.amazon.com/jp/certification/certified-machine-learning-engineer-associate/"
EXAM_URLS[SAP]="https://aws.amazon.com/jp/certification/certified-solutions-architect-professional/"
EXAM_URLS[DOP]="https://aws.amazon.com/jp/certification/certified-devops-engineer-professional/"
EXAM_URLS[AIP]="https://aws.amazon.com/jp/certification/certified-generative-ai-developer-professional/"
EXAM_URLS[SCS]="https://aws.amazon.com/jp/certification/certified-security-specialty/"
EXAM_URLS[ANS]="https://aws.amazon.com/jp/certification/certified-advanced-networking-specialty/"

ALL_EXAMS=(CLF AIF SAA DVA SOA DEA MLA SAP DOP AIP SCS ANS)

show_help() {
  cat << 'EOF'
usage: refresh-exam-guide.sh [EXAM...] [-h]

  EXAM   更新する資格コード（CLF / SAA / AIP 等）。省略時は全資格を更新
  -h     このヘルプを表示

挙動:
  公式資格ページを WebFetch で取得し、出題ドメイン・配点・タスク文を抽出して
  instructions/<EXAM>.txt の内容を更新します。
  # DOMAINS: 行と # LAST_REFRESHED: 行も最新値に書き換えます。
  ドメイン名は DynamoDB タグとして使用されるため、変更時は既存問題のタグも要確認。
EOF
}

MAX_AGE_DAYS=0   # >0 のとき: LAST_REFRESHED がこの日数以内の資格はスキップ（定期実行の自己スロットル用）
TARGET_EXAMS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help) show_help; exit 0 ;;
    --max-age-days) MAX_AGE_DAYS="${2:-0}"; shift 2 ;;
    *) TARGET_EXAMS+=("$1"); shift ;;
  esac
done
[ ${#TARGET_EXAMS[@]} -eq 0 ] && TARGET_EXAMS=("${ALL_EXAMS[@]}")

TODAY=$(date '+%Y-%m-%d')

echo "=========================================="
echo "試験ガイド更新: $(date)"
echo "対象: ${TARGET_EXAMS[*]}"
echo "=========================================="

for exam in "${TARGET_EXAMS[@]}"; do
  url="${EXAM_URLS[$exam]:-}"
  if [ -z "$url" ]; then
    echo "⚠️  $exam: URL定義なし（スキップ）"
    continue
  fi

  inst_file="${INSTRUCTION_DIR}/${exam}.txt"
  if [ ! -f "$inst_file" ]; then
    echo "⚠️  $exam: $inst_file が存在しません（スキップ）"
    continue
  fi

  # 定期実行の自己スロットル: MAX_AGE_DAYS 以内に更新済みならスキップ（claude/WebFetch を呼ばない）
  if [ "$MAX_AGE_DAYS" -gt 0 ]; then
    last_ref=$(grep "^# LAST_REFRESHED:" "$inst_file" | head -1 | sed 's/^# LAST_REFRESHED: *//')
    if [ -n "$last_ref" ]; then
      last_epoch=$(date -d "$last_ref" +%s 2>/dev/null || echo 0)
      if [ "$last_epoch" -gt 0 ]; then
        age_days=$(( ( $(date +%s) - last_epoch ) / 86400 ))
        if [ "$age_days" -lt "$MAX_AGE_DAYS" ]; then
          echo "⏭  $exam: ${age_days}日前に更新済み（< ${MAX_AGE_DAYS}日）→ スキップ"
          continue
        fi
      fi
    fi
  fi

  echo ""
  echo "--- $exam: $url ---"

  # 現在の instruction 本文（メタデータ除く）を取得
  CURRENT_BODY=$(grep -v "^# EXAM_GUIDE_URL:\|^# DOMAINS:\|^# LAST_REFRESHED:" "$inst_file")

  PROMPT_FILE=$(mktemp /tmp/refresh_prompt_XXXX.txt)
  cat > "$PROMPT_FILE" << PROMPT
あなたはAWS認定試験の問題生成支援AIです。
以下の公式資格ページを WebFetch で取得し、最新の試験ガイド情報を抽出してください。

【対象資格】${exam}
【公式URL】${url}

【タスク】
1. 上記URLにアクセスして試験ガイドの内容を確認する
2. 以下の情報を日本語で正確に抽出する：
   - 出題ドメイン名（公式表記のまま、カンマ区切り）
   - 各ドメインの配点（%）
   - 主要なタスク文（各ドメイン3〜5個程度）
   - 主要な対象サービス一覧
3. 以下のフォーマットで出力する（前置き・説明文不要）：

---DOMAINS---
ドメイン1,ドメイン2,ドメイン3
---GUIDE_CONTENT---
（既存の instruction 本文を上記の最新情報で更新した全文。
 問題作成者へのシステムプロンプトとして機能する形式を維持すること。
 難易度・スタイル・フォーマット規則・品質基準セクションは以下の現行内容を
 ベースにしつつ、ドメイン配点・タスク文・対象サービスのみ最新情報に更新すること）

【現行の instruction 本文（参考）】
${CURRENT_BODY}
PROMPT

  RESULT=$("$CLAUDE_CMD" -p --allowed-tools WebFetch < "$PROMPT_FILE" 2>&1)
  EXIT_CODE=$?
  rm -f "$PROMPT_FILE"

  if [ $EXIT_CODE -ne 0 ]; then
    echo "❌ $exam: Claude 実行エラー (exit=$EXIT_CODE)"
    echo "$RESULT" | head -5
    continue
  fi

  # DOMAINS 行を抽出
  NEW_DOMAINS=$(echo "$RESULT" | sed -n '/^---DOMAINS---/,/^---/{ /^---/d; p }' | head -1 | tr -d '\r')
  # ガイドコンテンツを抽出
  NEW_CONTENT=$(echo "$RESULT" | sed -n '/^---GUIDE_CONTENT---/,$ { /^---GUIDE_CONTENT---/d; p }')

  if [ -z "$NEW_DOMAINS" ] || [ -z "$NEW_CONTENT" ]; then
    echo "⚠️  $exam: 期待するフォーマットで出力されませんでした（スキップ）"
    echo "--- 生出力（先頭200字）---"
    echo "$RESULT" | head -c 200
    continue
  fi

  # バックアップ
  cp "$inst_file" "${inst_file}.bak"

  # ファイル書き込み
  {
    echo "# EXAM_GUIDE_URL: ${url}"
    echo "# DOMAINS: ${NEW_DOMAINS}"
    echo "# LAST_REFRESHED: ${TODAY}"
    echo ""
    echo "$NEW_CONTENT"
  } > "$inst_file"

  echo "✅ $exam: 更新完了（ドメイン: $NEW_DOMAINS）"
  echo "   バックアップ: ${inst_file}.bak"

  # ドメイン変更の警告
  OLD_DOMAINS=$(grep "^# DOMAINS:" "${inst_file}.bak" 2>/dev/null | sed 's/^# DOMAINS: *//' || echo "")
  if [ -n "$OLD_DOMAINS" ] && [ "$OLD_DOMAINS" != "$NEW_DOMAINS" ]; then
    echo "   ⚠️  ドメイン名が変更されました！DynamoDB上の既存問題のタグ確認が必要です"
    echo "   旧: $OLD_DOMAINS"
    echo "   新: $NEW_DOMAINS"
  fi
done

echo ""
echo "=========================================="
echo "完了: $(date)"
echo "=========================================="
