#!/usr/bin/env bash
# 指定日付のgitコミットからリリースノートを生成してDynamoDBに挿入する
# 使い方:
#   ./generate-release-note.sh             # 前日分を生成
#   ./generate-release-note.sh 2026-06-01  # 指定日付の分を生成
#   ./generate-release-note.sh --backfill  # コミットがあるのにリリースノートがない日を全て補完

set -uo pipefail

# scripts/ 配下のどの深さに置かれても動作するパス解決
_d="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
while [ "$(basename "$_d")" != "scripts" ] && [ "$_d" != "/" ]; do _d="$(dirname "$_d")"; done
NIGHT_PROMPTS_DIR="$(dirname "$_d")"
REPO_DIR="$(dirname "$(dirname "$NIGHT_PROMPTS_DIR")")"
AWS="/home/yuzuki/local/bin/aws"
TABLE="Releases"
REGION="ap-northeast-1"
RATE_LIMIT_FILE="$NIGHT_PROMPTS_DIR/.claude_rate_limit_reset"

# ── Claudeバイナリを検索 ─────────────────────────────────────
_find_claude() {
  [ -x /usr/local/bin/claude ] && { echo /usr/local/bin/claude; return; }
  local _cv; _cv=$(command -v claude 2>/dev/null)
  [ -n "$_cv" ] && [ -x "$_cv" ] && { echo "$_cv"; return; }
}
CLAUDE_CMD=$(_find_claude)
if [ -z "${CLAUDE_CMD:-}" ] || [ ! -x "${CLAUDE_CMD:-}" ]; then
  echo "[release-note] ERROR: claude コマンドが見つかりません" >&2
  exit 1
fi

# ── レート制限チェック ───────────────────────────────────────
# 戻り値: 0=問題なし, 2=制限中（呼び出し元が exit 2 すべき）
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
    echo "⏸  Claude レート制限中 — 復活予定: ${_disp}（generate-release-note.sh をスキップ）"
    return 2
  fi
  rm -f "$RATE_LIMIT_FILE"
  return 0
}

# ── 1日分を生成するコア関数 ─────────────────────────────────
# 戻り値: 0=成功, 1=スキップ（コミットなし or 既存）, 3=レート制限, 4=エラー
generate_single_date() {
  local date="$1"
  local _prompt_file _json_tmp

  # DynamoDBに既存エントリがあればスキップ
  local existing
  existing=$($AWS dynamodb scan \
    --table-name "$TABLE" \
    --region "$REGION" \
    --filter-expression "#d = :d" \
    --expression-attribute-names '{"#d":"date"}' \
    --expression-attribute-values "{\":d\":{\"S\":\"$date\"}}" \
    --select COUNT \
    --query Count \
    --output text 2>/dev/null || echo "0")
  if [ "${existing:-0}" -gt 0 ]; then
    echo "[release-note] $date はすでに存在します。スキップ。"
    return 1
  fi

  # 対象日のgitコミットメッセージを収集
  cd "$REPO_DIR"
  local commits
  commits=$(git log --after="${date} 00:00:00" --before="${date} 23:59:59" \
    --format='%s' --no-merges 2>/dev/null || true)
  if [ -z "$commits" ]; then
    echo "[release-note] $date にコミットがありません。スキップ。"
    return 1
  fi
  echo "[release-note] $date: $(echo "$commits" | wc -l)件のコミット"

  # Claudeでリリースノートを生成
  _prompt_file=$(mktemp /tmp/release_note_prompt_XXXX.txt)
  _json_tmp=$(mktemp /tmp/release_json_XXXX.json)
  # shellcheck disable=SC2064
  trap "rm -f '$_prompt_file' '$_json_tmp'" RETURN

  cat > "$_prompt_file" <<PROMPT_EOF
あなたはAWS学習アプリ「無限ノック」の開発者です。
以下のgitコミットメッセージをもとに、ユーザー向けのリリースノートを日本語と英語で1件作成してください。

【コミットメッセージ一覧】
$commits

【出力形式】
以下のJSONをそのまま出力してください（コードブロックや説明文は不要）:
{
  "title": "（日本語タイトル：短くキャッチー、!で終わる）",
  "body": "（日本語本文：1〜2文、改行は\nで表現、ユーザーにとっての価値にフォーカス）",
  "titleEn": "（英語タイトル）",
  "bodyEn": "（英語本文：1〜2文）"
}

【スタイル例（既存のリリースノートを参考に）】
- title: 「サービス図鑑が登場！毎日1サービスずつ解放！」
- body: 「日めくりAWSサービスを訪れるたびに1つずつ解放されていくサービス図鑑を追加しました！\n129種の公式AWSアイコンも取り込み、本格的な図鑑体験が楽しめます。」

技術的な変更よりもユーザーにとって何が変わったかを重視してください。
複数の変更がある場合は代表的なものを1〜2件に絞ってください。
PROMPT_EOF

  local raw_output claude_exit
  raw_output=$("$CLAUDE_CMD" -p < "$_prompt_file" 2>&1) || true
  claude_exit=$?

  # レート制限検出
  if [ "$claude_exit" -ne 0 ] || echo "$raw_output" | head -3 | grep -qiE "session.?limit|hit your|rate.?limit|too many requests"; then
    echo "[release-note] ERROR: Claude 実行失敗またはレート制限 (exit=$claude_exit)"
    echo "$raw_output" | head -5
    return 3
  fi

  # JSONを抽出
  echo "$raw_output" | python3 -c "
import sys
text = sys.stdin.read()
text = text.replace('\`\`\`json', '').replace('\`\`\`', '')
start = text.find('{')
end = text.rfind('}') + 1
print(text[start:end].strip() if start >= 0 else text.strip())
" > "$_json_tmp"

  echo "[release-note] 生成結果:"
  cat "$_json_tmp"

  # DynamoDBに挿入
  python3 - "$_json_tmp" "$TABLE" "$REGION" "$date" <<'PYEOF'
import json, sys, uuid, boto3
from datetime import datetime, timezone

json_file, table_name, region, target_date = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]

try:
    with open(json_file) as f:
        data = json.load(f)
except Exception as e:
    print(f"[release-note] ERROR: JSONパースに失敗しました: {e}", file=sys.stderr)
    sys.exit(1)

for key in ["title", "body", "titleEn", "bodyEn"]:
    if key not in data:
        print(f"[release-note] ERROR: JSONに '{key}' フィールドがありません", file=sys.stderr)
        sys.exit(1)

dynamodb = boto3.resource("dynamodb", region_name=region)
table = dynamodb.Table(table_name)
now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
table.put_item(Item={
    "releaseId": str(uuid.uuid4()),
    "date": target_date,
    "title": data["title"],
    "body": data["body"],
    "titleEn": data["titleEn"],
    "bodyEn": data["bodyEn"],
    "createdAt": now,
})
print(f"[release-note] ✓ DynamoDBに挿入しました: {target_date} — {data['title']}")
PYEOF
  return $?
}

# ════════════════════════════════════════════════════════════
# メイン処理
# ════════════════════════════════════════════════════════════

if [ "${1:-}" = "--backfill" ]; then
  # ── バックフィルモード ──────────────────────────────────
  echo "[release-note] バックフィルモード: コミットがあるのにリリースノートがない日を補完します"
  echo ""

  # レート制限チェック
  check_rate_limit || exit 2

  # gitコミットが存在する全日付を取得（今日より前のみ）
  TODAY=$(date +%Y-%m-%d)
  cd "$REPO_DIR"
  ALL_COMMIT_DATES=$(git log --format='%ad' --date=format:'%Y-%m-%d' --no-merges 2>/dev/null \
    | sort -u \
    | awk -v today="$TODAY" '$0 < today')

  if [ -z "$ALL_COMMIT_DATES" ]; then
    echo "[release-note] コミット履歴が見つかりません。"
    exit 0
  fi

  # DynamoDBに既存のリリースノート日付を全件取得
  echo "[release-note] DynamoDB から既存リリースノート日付を取得中..."
  EXISTING_DATES=$($AWS dynamodb scan \
    --table-name "$TABLE" \
    --region "$REGION" \
    --projection-expression "#d" \
    --expression-attribute-names '{"#d":"date"}' \
    --output json 2>/dev/null \
    | python3 -c "
import json, sys
d = json.load(sys.stdin)
dates = set(item['date']['S'] for item in d.get('Items', []) if 'date' in item)
print('\n'.join(sorted(dates)))
" || true)

  # ギャップ（コミットあり・リリースノートなし）の日付を抽出
  GAP_DATES=$(comm -23 \
    <(echo "$ALL_COMMIT_DATES" | sort) \
    <(echo "$EXISTING_DATES" | sort))

  if [ -z "$GAP_DATES" ]; then
    echo "[release-note] 補完が必要な日付はありません。"
    exit 0
  fi

  GAP_COUNT=$(echo "$GAP_DATES" | wc -l)
  echo "[release-note] 補完対象: ${GAP_COUNT}日"
  echo "$GAP_DATES" | sed 's/^/  /'
  echo ""

  DONE=0; SKIPPED=0; FAILED=0
  while IFS= read -r gap_date; do
    echo "──────────────────────────────────"
    echo "[release-note] 処理中: $gap_date"

    # 処理前にレート制限チェック
    if ! check_rate_limit; then
      echo "[release-note] レート制限のため中断します。残り $((GAP_COUNT - DONE - SKIPPED - FAILED)) 日は次回以降に処理されます。"
      break
    fi

    generate_single_date "$gap_date"
    result=$?
    case $result in
      0) DONE=$((DONE+1)) ;;
      1) SKIPPED=$((SKIPPED+1)) ;;
      3)
        echo "[release-note] レート制限のため中断します。"
        FAILED=$((FAILED+1))
        break
        ;;
      *) FAILED=$((FAILED+1)) ;;
    esac
  done <<< "$GAP_DATES"

  echo ""
  echo "══════════════════════════════════"
  echo "[release-note] バックフィル完了"
  echo "  ✓ 生成成功: ${DONE}日"
  echo "  - スキップ: ${SKIPPED}日"
  [ "$FAILED" -gt 0 ] && echo "  ✗ エラー:   ${FAILED}日"
  echo "══════════════════════════════════"

else
  # ── 通常モード（単日） ──────────────────────────────────
  TARGET_DATE="${1:-$(date -d yesterday +%Y-%m-%d)}"
  echo "[release-note] 対象日: $TARGET_DATE"

  check_rate_limit || exit 2

  generate_single_date "$TARGET_DATE"
  result=$?
  case $result in
    0) exit 0 ;;
    1) exit 0 ;;  # スキップも正常終了
    3) exit 1 ;;  # レート制限
    *) exit 1 ;;
  esac
fi
