#!/bin/bash
# night-prompts実行後の自動検証スクリプト（アルファベット順で最後に実行される）
# 同日ログを解析して各スクリプトの成否を判定し、
# - 非レート制限エラー → 自動リトライ（1回）
# - 複雑な問題 → tmp-texts/ にClaudeプロンプトを生成

set -uo pipefail

export PATH="/home/yuzuki/local/bin:$PATH"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NIGHT_DIR="$(dirname "$SCRIPT_DIR")"
PROMPTS_DIR="$(dirname "$NIGHT_DIR")"
LOG_DIR="${PROMPTS_DIR}/logs"
TMP_TEXTS_DIR="${NIGHT_DIR}/tmp-texts"
TODAY=$(date '+%Y%m%d')
LOG_FILE="${LOG_DIR}/run_${TODAY}.log"

mkdir -p "$TMP_TEXTS_DIR"

echo ""
echo "=== [verify] 夜間スクリプト実行結果を検証 ==="

if [ ! -f "$LOG_FILE" ]; then
  echo "[verify] ログファイルが見つかりません: $LOG_FILE"
  exit 0
fi

# 当日の「🌙 夜間初回実行」以降のブロックを抽出
NIGHT_BLOCK=$(grep -n "🌙 夜間初回実行" "$LOG_FILE" | tail -1 | cut -d: -f1)
if [ -z "$NIGHT_BLOCK" ]; then
  echo "[verify] 本日の夜間実行ブロックが見つかりません（夜間実行なし）"
  exit 0
fi

# 各スクリプトの成否・エラー内容を抽出する関数
# 戻り値: "ok" / "rate_limit" / "error:<エラー抜粋>"
check_script_result() {
  local script_name="$1"
  local section
  section=$(awk "NR>=${NIGHT_BLOCK}" "$LOG_FILE" \
    | awk "/▶ \[night-script\] ${script_name}/{found=1} found{print} found && /▶ \[night-(script|tmp-script)\]/ && !/▶ \[night-script\] ${script_name}/{exit}" \
    | head -200)

  if [ -z "$section" ]; then
    echo "not_run"
    return
  fi

  # レート制限チェック（優先）
  if echo "$section" | grep -qiE "レート制限|rate.?limit|too many requests|overload|quota exceeded|resource_exhausted"; then
    echo "rate_limit"
    return
  fi

  # エラーパターン
  local err
  err=$(echo "$section" | grep -iE "^(Traceback|  File \"|[A-Za-z]+Error:|❌|aws.*error|error:|fatal:)" | head -3)
  if [ -n "$err" ]; then
    echo "error:$(echo "$err" | head -1 | cut -c1-120)"
    return
  fi

  # スクリプト別の成功シグネチャ
  case "$script_name" in
    check-validity.sh)
      echo "$section" | grep -q "チェック終了:" && echo "ok" || echo "error:チェック終了シグネチャが見つかりません" ;;
    check-translation.sh)
      echo "$section" | grep -q "英訳チェック終了:" && echo "ok" || echo "error:英訳チェック終了シグネチャが見つかりません" ;;
    generate-questions.sh)
      echo "$section" | grep -qE "完了: [0-9]|インポート完了:|合計インポート:" && echo "ok" || echo "error:生成完了シグネチャが見つかりません" ;;
    *)
      echo "ok" ;;
  esac
}

# 検証対象スクリプト（このスクリプト自身を除く）
SCRIPTS=("check-validity.sh" "check-translation.sh" "generate-questions.sh")

declare -a FAILED_SCRIPTS=()
declare -a FAILED_REASONS=()

for script in "${SCRIPTS[@]}"; do
  result=$(check_script_result "$script")
  case "$result" in
    ok)
      echo "[verify] ✓ $script: OK" ;;
    not_run)
      echo "[verify] - $script: 未実行（スキップ）" ;;
    rate_limit)
      echo "[verify] ⚡ $script: レート制限（対応不要）" ;;
    error:*)
      reason="${result#error:}"
      echo "[verify] ❌ $script: エラー検出 → $reason"
      FAILED_SCRIPTS+=("$script")
      FAILED_REASONS+=("$reason")
      ;;
  esac
done

if [ ${#FAILED_SCRIPTS[@]} -eq 0 ]; then
  echo "[verify] 全スクリプト正常完了"
  exit 0
fi

echo ""
echo "[verify] ${#FAILED_SCRIPTS[@]}件のエラーを検出 → 自動リトライを試みます"

# 自動リトライ（1回）
RETRY_FAILED=()
RETRY_REASONS=()

for i in "${!FAILED_SCRIPTS[@]}"; do
  script="${FAILED_SCRIPTS[$i]}"
  reason="${FAILED_REASONS[$i]}"

  # scripts/ と manual/ の両方を検索
  script_path=""
  for _search_dir in "${NIGHT_DIR}/scripts" "${NIGHT_DIR}/manual"; do
    if [ -f "${_search_dir}/${script}" ]; then
      script_path="${_search_dir}/${script}"
      break
    fi
  done

  if [ -z "$script_path" ]; then
    echo "[verify] ⚠ $script: スクリプトファイルが見つかりません"
    RETRY_FAILED+=("$script")
    RETRY_REASONS+=("スクリプトファイルが見つからない (scripts/またはmanual/を検索)")
    continue
  fi

  echo "[verify] 🔄 $script をリトライ中..."
  retry_out=$(bash "$script_path" 2>&1)
  retry_ec=$?
  if [ $retry_ec -eq 0 ]; then
    echo "[verify] ✓ $script: リトライ成功"
  else
    echo "[verify] ❌ $script: リトライも失敗"
    echo "$retry_out" | grep -iE "Error:|❌|Traceback" | head -5
    RETRY_FAILED+=("$script")
    retry_err=$(echo "$retry_out" | grep -iE "Error:|❌|Traceback" | head -3)
    RETRY_REASONS+=("${reason} / リトライ失敗: $(echo "$retry_err" | head -1 | cut -c1-120)")
  fi
done

if [ ${#RETRY_FAILED[@]} -eq 0 ]; then
  echo "[verify] リトライにより全エラーが解消されました"
  exit 0
fi

# リトライ後も残る問題 → Claudeに修復依頼
PROMPT_FILE="${TMP_TEXTS_DIR}/verify_${TODAY}.txt"
REPAIR_LOG="${LOG_DIR}/repair_${TODAY}.log"

{
  echo "以下のAWS問題管理サイトのnight-promptsスクリプトでエラーが発生しました。"
  echo "スクリプトの内容を確認し、バグを修正してください（バグがある場合のみ修正。レート制限やAWS API一時エラーは対応不要）。"
  echo ""
  echo "【エラー一覧】"
  for i in "${!RETRY_FAILED[@]}"; do
    echo "- ${RETRY_FAILED[$i]}: ${RETRY_REASONS[$i]}"
  done
  echo ""
  echo "【関連スクリプトパス】"
  for script in "${RETRY_FAILED[@]}"; do
    for _sd in "${NIGHT_DIR}/scripts" "${NIGHT_DIR}/manual"; do
      if [ -f "${_sd}/${script}" ]; then
        echo "- ${_sd}/${script}"
        break
      fi
    done
  done
  echo ""
  echo "【直近のログ抜粋（エラー部分）】"
  for script in "${RETRY_FAILED[@]}"; do
    echo "--- $script ---"
    awk "NR>=${NIGHT_BLOCK}" "$LOG_FILE" \
      | awk "/▶ \[night-script\] ${script}/{found=1} found{print} found && /▶ \[night-(script|tmp-script)\]/ && !/▶ \[night-script\] ${script}/{exit}" \
      | grep -iE "Error:|❌|Traceback|  File \"|完了サマリー|インポート成功|翻訳完了" \
      | head -20
    echo ""
  done
  echo "スクリプトを読んでバグがあれば修正してください。修正後の再実行は不要です。"
} > "$PROMPT_FILE"

echo "[verify] プロンプト生成: $(basename "$PROMPT_FILE")"

# Claudeバイナリを探す
_CLAUDE_BIN=""
if [ -x /usr/local/bin/claude ]; then
  _CLAUDE_BIN=/usr/local/bin/claude
elif _cv=$(command -v claude 2>/dev/null) && [ -x "$_cv" ]; then
  _CLAUDE_BIN="$_cv"
fi

if [ -z "$_CLAUDE_BIN" ]; then
  echo "[verify] ⚠ claude コマンドが見つかりません。手動で確認: $PROMPT_FILE"
else
  echo "[verify] Claudeに修復依頼中..."
  {
    echo "=== Claude repair: $(date '+%Y-%m-%d %H:%M:%S') ==="
    "$_CLAUDE_BIN" --dangerously-skip-permissions -p < "$PROMPT_FILE" 2>&1
    echo "=== end: $(date '+%Y-%m-%d %H:%M:%S') ==="
  } | tee -a "$REPAIR_LOG"
  _repair_ec=${PIPESTATUS[0]}
  if [ "${_repair_ec}" -eq 0 ]; then
    echo "[verify] ✓ Claude修復完了 → $(basename "$REPAIR_LOG")"
  else
    echo "[verify] ⚠ Claude修復に問題が発生 (exit=${_repair_ec}) → $(basename "$REPAIR_LOG")"
  fi
fi

echo "[verify] 検証完了"
