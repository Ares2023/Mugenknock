#!/bin/bash
# 問題フォーマット移行スクリプト
# Phase 1: choices が文字配列になっている問題を修正
# Phase 2: correctAnswers のラベル接頭辞除去 + correctAnswerIndices 計算
# Phase 3: choiceExplanations を Claude で生成（バッチ処理）

set -uo pipefail

export PATH="/home/yuzuki/local/bin:/home/sera/.config/nvm/versions/node/v20.20.2/bin:$PATH"
unset ANTHROPIC_API_KEY

_find_claude() {
  [ -x /usr/local/bin/claude ] && { echo /usr/local/bin/claude; return; }
  local _cv; _cv=$(command -v claude 2>/dev/null)
  [ -n "$_cv" ] && [ -x "$_cv" ] && echo "$_cv"
}
CLAUDE_CMD=$(_find_claude)
if [ -z "${CLAUDE_CMD:-}" ]; then
  echo "⚠️  claude バイナリ未検出。30秒後にリトライ..." >&2
  sleep 30
  CLAUDE_CMD=$(_find_claude)
fi
if [ -z "${CLAUDE_CMD:-}" ] || [ ! -x "${CLAUDE_CMD:-}" ]; then
  echo "❌ claude コマンドが見つかりません" >&2; exit 1
fi

AWS_CMD=/home/yuzuki/local/bin/aws
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NIGHT_PROMPTS_DIR="$(dirname "$SCRIPT_DIR")"
LOG_DIR="$NIGHT_PROMPTS_DIR/logs"
mkdir -p "$LOG_DIR"
DATE=$(date '+%Y%m%d_%H%M%S')
LOG_FILE="$LOG_DIR/migrate_format_${DATE}.log"

PHASE=0      # 0=all, 1/2/3=specific
DRY_RUN=0
BATCH_SIZE=15
LIMIT=0      # 0=無制限（Phase 3のみ有効）
FORCE_EXAM=""

show_help() {
  cat << 'EOF'
usage: 08-migrate-question-format.sh [options]

  -p N       実行フェーズ (1/2/3、デフォルト: 全フェーズ)
  -n N       Phase 3 の1バッチあたり問題数 (default: 10)
  -l N       Phase 3 の最大処理問題数 (0=無制限, default: 0)
  -e EXAM    資格で絞り込み (例: SAA, CLF)
  --dry-run  実際の更新は行わず内容確認のみ
  -h         このヘルプを表示

Phase 1: choices が文字配列破損 → 正しい選択肢配列に再構築
Phase 2: correctAnswers のラベル接頭辞除去 + correctAnswerIndices 全問計算
Phase 3: choiceExplanations を Claude haiku で生成 (なし or 長さ不一致の問題)
EOF
}

while [[ $# -gt 0 ]]; do
  case $1 in
    -p) PHASE="$2"; shift 2 ;;
    -n) BATCH_SIZE="$2"; shift 2 ;;
    -l) LIMIT="$2"; shift 2 ;;
    -e) FORCE_EXAM="$2"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) show_help; exit 0 ;;
    *) echo "不明なオプション: $1"; show_help; exit 1 ;;
  esac
done

exec > >(tee -a "$LOG_FILE") 2>&1

echo "========================================"
echo "問題フォーマット移行 開始: $(date)"
[ "$DRY_RUN" -eq 1 ] && echo "★ DRY RUN モード（更新は行いません）"
echo "========================================"

# ── DynamoDB から全問題を取得 ─────────────────────────────────
echo ""
echo "DynamoDB Questions テーブルをスキャン中..."
_SCAN_TMP=$(mktemp /tmp/scan_XXXX.json)
_ALL_ITEMS_TMP=$(mktemp /tmp/all_items_XXXX.json)
echo "[]" > "$_ALL_ITEMS_TMP"

_LAST_KEY=""
_PAGE=0
while true; do
  _PAGE=$((_PAGE + 1))
  if [ -n "$_LAST_KEY" ]; then
    $AWS_CMD dynamodb scan \
      --table-name Questions \
      --exclusive-start-key "$_LAST_KEY" \
      --output json > "$_SCAN_TMP" 2>&1
  else
    $AWS_CMD dynamodb scan \
      --table-name Questions \
      --output json > "$_SCAN_TMP" 2>&1
  fi
  if [ $? -ne 0 ]; then
    echo "❌ DynamoDB スキャンエラー"
    cat "$_SCAN_TMP"
    rm -f "$_SCAN_TMP" "$_ALL_ITEMS_TMP"
    exit 1
  fi

  python3 - "$_SCAN_TMP" "$_ALL_ITEMS_TMP" "$_PAGE" << 'PYEOF'
import json, sys
with open(sys.argv[1]) as f:
    data = json.load(f)
with open(sys.argv[2]) as f:
    existing = json.load(f)
items = data.get('Items', [])
existing.extend(items)
with open(sys.argv[2], 'w') as f:
    json.dump(existing, f, ensure_ascii=False)
print(f"  ページ {sys.argv[3]}: {len(items)}件取得（累計 {len(existing)}件）")
PYEOF

  _LAST_KEY=$(python3 -c "
import json, sys
with open('$_SCAN_TMP') as f:
    d = json.load(f)
lk = d.get('LastEvaluatedKey')
if lk:
    print(json.dumps(lk))
" 2>/dev/null)
  [ -z "$_LAST_KEY" ] && break
done
rm -f "$_SCAN_TMP"

TOTAL=$(python3 -c "import json; d=json.load(open('$_ALL_ITEMS_TMP')); print(len(d))" 2>/dev/null)
echo "  合計: ${TOTAL}件"

if [ -n "$FORCE_EXAM" ]; then
  echo "  資格フィルタ: $FORCE_EXAM"
fi

# ── ユーティリティ: DynamoDB 属性値をデシリアライズ ─────────────
deserialize_py='
import json, sys

def deser(v):
    if "S" in v: return v["S"]
    if "N" in v: return float(v["N"]) if "." in v["N"] else int(v["N"])
    if "BOOL" in v: return v["BOOL"]
    if "NULL" in v: return None
    if "L" in v: return [deser(x) for x in v["L"]]
    if "M" in v: return {k: deser(vv) for k, vv in v["M"].items()}
    if "SS" in v: return list(v["SS"])
    if "NS" in v: return [int(x) for x in v["NS"]]
    return v

def deser_item(item):
    return {k: deser(v) for k, v in item.items()}
'

# ── Phase 1: choices 文字配列修正 ────────────────────────────────
run_phase1() {
  echo ""
  echo "━━ Phase 1: choices 文字配列修正 ━━"

  FIXED=0
  SKIPPED=0

  python3 - "$_ALL_ITEMS_TMP" "$FORCE_EXAM" << 'PYEOF'
import json, sys

def deser(v):
    if "S" in v: return v["S"]
    if "N" in v: return float(v["N"]) if "." in v["N"] else int(v["N"])
    if "BOOL" in v: return v["BOOL"]
    if "NULL" in v: return None
    if "L" in v: return [deser(x) for x in v["L"]]
    if "M" in v: return {k: deser(vv) for k, vv in v["M"].items()}
    if "SS" in v: return list(v["SS"])
    if "NS" in v: return [int(x) for x in v["NS"]]
    return v

with open(sys.argv[1]) as f:
    items = json.load(f)

exam_filter = sys.argv[2] if len(sys.argv) > 2 else ""
corrupt = []

for item in items:
    qid = item.get("questionId", {}).get("S", "")
    exam = item.get("examType", {}).get("S", "")
    if exam_filter and exam != exam_filter:
        continue
    choices_raw = item.get("choices", {})
    choices_list = []
    if "L" in choices_raw:
        choices_list = [deser(x) for x in choices_raw["L"]]
    elif "SS" in choices_raw:
        choices_list = list(choices_raw["SS"])

    if not choices_list:
        continue

    # 文字配列かどうか判定: 全要素が1文字 or 2文字以下
    if all(len(str(c)) <= 2 for c in choices_list) and len(choices_list) > 6:
        corrupt.append({
            "questionId": qid,
            "examType": exam,
            "rawChoices": choices_list,
        })

print(f"文字配列破損: {len(corrupt)}件")
for c in corrupt:
    joined = "".join(c["rawChoices"])
    parts = [p.strip() for p in joined.split(" / ") if p.strip()]
    print(f"  {c['questionId']} ({c['examType']}): {len(c['rawChoices'])}文字 → {len(parts)}選択肢")
    for p in parts:
        print(f"    - {p[:60]}")
PYEOF

  # 実際に修正
  FIXED_COUNT=0
  FAILED_COUNT=0

  while IFS= read -r line; do
    QID=$(echo "$line" | python3 -c "import json,sys; d=json.loads(sys.stdin.read()); print(d['questionId'])")
    EXAM=$(echo "$line" | python3 -c "import json,sys; d=json.loads(sys.stdin.read()); print(d['examType'])")
    RAW_CHOICES=$(echo "$line" | python3 -c "import json,sys; d=json.loads(sys.stdin.read()); print(json.dumps(d['rawChoices']))")

    NEW_CHOICES=$(python3 -c "
import json, sys
raw = json.loads('$RAW_CHOICES')
joined = ''.join(raw)
parts = [p.strip() for p in joined.split(' / ') if p.strip()]
print(json.dumps(parts, ensure_ascii=False))
" 2>/dev/null)

    if [ -z "$NEW_CHOICES" ] || [ "$NEW_CHOICES" = "[]" ]; then
      echo "  ❌ [$QID] 選択肢再構築失敗"
      FAILED_COUNT=$((FAILED_COUNT + 1))
      continue
    fi

    if [ "$DRY_RUN" -eq 1 ]; then
      echo "  [DRY] [$QID] choices 修正: $(echo "$NEW_CHOICES" | python3 -c "import json,sys;print(len(json.loads(sys.stdin.read())), '選択肢')")"
      FIXED_COUNT=$((FIXED_COUNT + 1))
      continue
    fi

    DYNAMO_CHOICES=$(python3 -c "
import json, sys
parts = json.loads(sys.stdin.read())
dynamo_l = {\"L\": [{\"S\": p} for p in parts]}
print(json.dumps(dynamo_l, ensure_ascii=False))
" <<< "$NEW_CHOICES")

    $AWS_CMD dynamodb update-item \
      --table-name Questions \
      --key "{\"questionId\":{\"S\":\"$QID\"}}" \
      --update-expression "SET choices = :c, updatedAt = :u" \
      --expression-attribute-values "{\":c\":$DYNAMO_CHOICES,\":u\":{\"S\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}}" \
      --output json > /dev/null 2>&1

    if [ $? -eq 0 ]; then
      echo "  ✓ [$QID] choices 修正完了"
      FIXED_COUNT=$((FIXED_COUNT + 1))
    else
      echo "  ❌ [$QID] 更新失敗"
      FAILED_COUNT=$((FAILED_COUNT + 1))
    fi
  done < <(python3 - "$_ALL_ITEMS_TMP" "$FORCE_EXAM" << 'PYEOF'
import json, sys

def deser(v):
    if "S" in v: return v["S"]
    if "N" in v: return float(v["N"]) if "." in v["N"] else int(v["N"])
    if "BOOL" in v: return v["BOOL"]
    if "NULL" in v: return None
    if "L" in v: return [deser(x) for x in v["L"]]
    if "M" in v: return {k: deser(vv) for k, vv in v["M"].items()}
    if "SS" in v: return list(v["SS"])
    return v

with open(sys.argv[1]) as f:
    items = json.load(f)
exam_filter = sys.argv[2] if len(sys.argv) > 2 else ""

for item in items:
    qid = item.get("questionId", {}).get("S", "")
    exam = item.get("examType", {}).get("S", "")
    if exam_filter and exam != exam_filter:
        continue
    choices_raw = item.get("choices", {})
    choices_list = []
    if "L" in choices_raw:
        choices_list = [deser(x) for x in choices_raw["L"]]
    elif "SS" in choices_raw:
        choices_list = list(choices_raw["SS"])
    if not choices_list:
        continue
    if all(len(str(c)) <= 2 for c in choices_list) and len(choices_list) > 6:
        print(json.dumps({"questionId": qid, "examType": exam, "rawChoices": choices_list}))
PYEOF
  )

  echo "Phase 1 完了: 修正=$FIXED_COUNT 失敗=$FAILED_COUNT"
}

# ── Phase 2: correctAnswers ラベル除去 + correctAnswerIndices 全問計算 ──
run_phase2() {
  echo ""
  echo "━━ Phase 2: correctAnswers 正規化 + correctAnswerIndices 計算 ━━"

  python3 - "$_ALL_ITEMS_TMP" "$FORCE_EXAM" << 'PYEOF'
import json, sys, re

def deser(v):
    if "S" in v: return v["S"]
    if "N" in v: return float(v["N"]) if "." in v["N"] else int(v["N"])
    if "BOOL" in v: return v["BOOL"]
    if "NULL" in v: return None
    if "L" in v: return [deser(x) for x in v["L"]]
    if "M" in v: return {k: deser(vv) for k, vv in v["M"].items()}
    if "SS" in v: return list(v["SS"])
    return v

label_re = re.compile(r'^[A-E][.\s:：]\s*', re.IGNORECASE)

with open(sys.argv[1]) as f:
    items = json.load(f)
exam_filter = sys.argv[2] if len(sys.argv) > 2 else ""

has_prefix = 0
missing_indices = 0
total_target = 0

for item in items:
    exam = item.get("examType", {}).get("S", "")
    if exam_filter and exam != exam_filter:
        continue
    choices_raw = item.get("choices", {})
    correct_raw = item.get("correctAnswers", {})
    idx_raw = item.get("correctAnswerIndices", {})

    choices = []
    if "L" in choices_raw:
        choices = [deser(x) for x in choices_raw["L"]]
    elif "SS" in choices_raw:
        choices = list(choices_raw["SS"])
    if not choices:
        continue

    total_target += 1
    correct = []
    if "L" in correct_raw:
        correct = [deser(x) for x in correct_raw["L"]]
    elif "SS" in correct_raw:
        correct = list(correct_raw["SS"])

    for c in correct:
        if label_re.match(str(c)):
            has_prefix += 1
            break

    has_idx = bool(idx_raw.get("L") or idx_raw.get("NS"))
    if not has_idx:
        missing_indices += 1

print(f"対象問題: {total_target}件")
print(f"  ラベル接頭辞あり: {has_prefix}件")
print(f"  correctAnswerIndices なし: {missing_indices}件")
PYEOF

  local _MAX_PAR=10
  local _UPD_DIR; _UPD_DIR=$(mktemp -d /tmp/phase2_upd_XXXX)
  local _pids=()

  while IFS= read -r _line; do
    local _tmp; _tmp=$(mktemp /tmp/phase2_item_XXXX.json)
    printf '%s\n' "$_line" > "$_tmp"

    if [ "$DRY_RUN" -eq 1 ]; then
      python3 -c "
import json,sys
d=json.load(open(sys.argv[1]))
print(f'  [DRY] [{d.get(\"questionId\",\"\")}] {d.get(\"update_expr\",\"\")}')
" "$_tmp" 2>/dev/null
      rm -f "$_tmp"
      touch "$_UPD_DIR/ok_$$_${RANDOM}"
      continue
    fi

    while [ "$(jobs -rp | wc -l)" -ge "$_MAX_PAR" ]; do
      wait -n 2>/dev/null || sleep 0.1
    done

    (
      local _af; _af=$(mktemp /tmp/phase2_attr_XXXX.json)
      local _q _ue
      { read -r _q; read -r _ue; } < <(python3 - "$_tmp" "$_af" << 'PYEOF'
import json, sys
d = json.load(open(sys.argv[1]))
qid = d.get('questionId', '')
ue = d.get('update_expr', '')
av = d.get('attr_values', '')
if not ue or not av:
    print(qid); print(''); sys.exit(0)
with open(sys.argv[2], 'w') as f:
    f.write(av)
print(qid); print(ue)
PYEOF
      )
      rm -f "$_tmp"
      if [ -z "$_ue" ]; then
        rm -f "$_af"
        touch "$_UPD_DIR/skip_$$_${RANDOM}"
        exit 0
      fi
      if $AWS_CMD dynamodb update-item \
        --table-name Questions \
        --key "{\"questionId\":{\"S\":\"$_q\"}}" \
        --update-expression "$_ue" \
        --expression-attribute-values "file://$_af" \
        --output json > /dev/null 2>&1; then
        touch "$_UPD_DIR/ok_$$_${RANDOM}"
      else
        echo "  ❌ [$_q] 更新失敗"
        touch "$_UPD_DIR/fail_$$_${RANDOM}"
      fi
      rm -f "$_af"
    ) &
    _pids+=($!)
  done < <(python3 - "$_ALL_ITEMS_TMP" "$FORCE_EXAM" << 'PYEOF'
import json, sys, re
from datetime import datetime, timezone

def deser(v):
    if "S" in v: return v["S"]
    if "N" in v: return float(v["N"]) if "." in v["N"] else int(v["N"])
    if "BOOL" in v: return v["BOOL"]
    if "NULL" in v: return None
    if "L" in v: return [deser(x) for x in v["L"]]
    if "M" in v: return {k: deser(vv) for k, vv in v["M"].items()}
    if "SS" in v: return list(v["SS"])
    return v

label_re = re.compile(r'^[A-E][.\s:：]\s*', re.IGNORECASE)
now = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')

with open(sys.argv[1]) as f:
    items = json.load(f)
exam_filter = sys.argv[2] if len(sys.argv) > 2 else ""

for item in items:
    exam = item.get("examType", {}).get("S", "")
    if exam_filter and exam != exam_filter:
        continue
    choices_raw = item.get("choices", {})
    correct_raw = item.get("correctAnswers", {})
    idx_raw = item.get("correctAnswerIndices", {})
    qid = item.get("questionId", {}).get("S", "")
    if not qid:
        continue

    choices = []
    if "L" in choices_raw:
        choices = [deser(x) for x in choices_raw["L"]]
    elif "SS" in choices_raw:
        choices = list(choices_raw["SS"])
    if not choices:
        continue

    correct = []
    if "L" in correct_raw:
        correct = [deser(x) for x in correct_raw["L"]]
    elif "SS" in correct_raw:
        correct = list(correct_raw["SS"])

    has_prefix = any(label_re.match(str(c)) for c in correct)
    clean_correct = [label_re.sub('', str(c)).strip() for c in correct]

    # correctAnswerIndices を計算
    indices = []
    for ca in clean_correct:
        for i, ch in enumerate(choices):
            if str(ch).strip() == ca:
                indices.append(i)
                break

    # 現在の indices と変化があるか確認
    existing_indices = []
    if "L" in idx_raw:
        existing_indices = [deser(x) for x in idx_raw["L"]]
    elif "NS" in idx_raw:
        existing_indices = sorted([int(x) for x in idx_raw["NS"]])

    needs_correct_update = has_prefix
    needs_idx_update = sorted(indices) != sorted(existing_indices)

    if not needs_correct_update and not needs_idx_update:
        continue

    # DynamoDB 更新式を生成
    expr_parts = []
    attr_vals = {}

    if needs_correct_update:
        expr_parts.append("correctAnswers = :ca")
        attr_vals[":ca"] = {"L": [{"S": c} for c in clean_correct]}

    if needs_idx_update and indices:
        expr_parts.append("correctAnswerIndices = :ci")
        attr_vals[":ci"] = {"L": [{"N": str(i)} for i in indices]}

    expr_parts.append("updatedAt = :u")
    attr_vals[":u"] = {"S": now}

    update_expr = "SET " + ", ".join(expr_parts)
    out = {
        "questionId": qid,
        "update_expr": update_expr,
        "attr_values": json.dumps(attr_vals, ensure_ascii=False),
    }
    print(json.dumps(out))
PYEOF
  )

  [ ${#_pids[@]} -gt 0 ] && wait "${_pids[@]}"

  local UPDATED SKIPPED FAILED
  UPDATED=$(find "$_UPD_DIR" -name 'ok_*'   2>/dev/null | wc -l)
  SKIPPED=$(find "$_UPD_DIR" -name 'skip_*' 2>/dev/null | wc -l)
  FAILED=$(find  "$_UPD_DIR" -name 'fail_*' 2>/dev/null | wc -l)
  rm -rf "$_UPD_DIR"

  echo "Phase 2 完了: 更新=$UPDATED スキップ=$SKIPPED 失敗=$FAILED"
}

# ── DynamoDB 並列更新ヘルパー ──────────────────────────────────────
# 引数: $1=更新対象JSONLファイル（{questionId, ce_dynamo}形式 1行1問）, $2=UPD_DIR, $3=NOW
# 標準出力: ok件数 fail件数
_parallel_update_ce() {
  local _src="$1" _upd_dir="$2" _now="$3"
  local _MAX_PAR=10
  local _pids=()
  while IFS= read -r _line; do
    while [ "$(jobs -rp | wc -l)" -ge "$_MAX_PAR" ]; do
      wait -n 2>/dev/null || sleep 0.1
    done
    (
      local _tmp; _tmp=$(mktemp /tmp/phase3_upd_XXXX.json)
      printf '%s' "$_line" > "$_tmp"
      local _q; _q=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['questionId'])" "$_tmp")
      local _af; _af=$(mktemp /tmp/phase3_attr_XXXX.json)
      python3 - "$_tmp" "$_af" "$_now" << 'PYEOF'
import json, sys
d = json.load(open(sys.argv[1]))
attr = {':ce': json.loads(d['ce_dynamo']), ':u': {'S': sys.argv[3]}}
with open(sys.argv[2], 'w', encoding='utf-8') as f:
    json.dump(attr, f, ensure_ascii=False)
PYEOF
      if "$AWS_CMD" dynamodb update-item \
        --table-name Questions \
        --key "{\"questionId\":{\"S\":\"$_q\"}}" \
        --update-expression "SET choiceExplanations = :ce, updatedAt = :u" \
        --expression-attribute-values "file://$_af" \
        --output json > /dev/null 2>&1; then
        touch "$_upd_dir/ok_$$_${RANDOM}"
      else
        echo "  ❌ [$_q] 更新失敗"
        touch "$_upd_dir/fail_$$_${RANDOM}"
      fi
      rm -f "$_tmp" "$_af"
    ) &
    _pids+=($!)
  done < "$_src"
  [ ${#_pids[@]} -gt 0 ] && wait "${_pids[@]}"
  local _ok; _ok=$(find "$_upd_dir" -name 'ok_*' 2>/dev/null | wc -l)
  local _fail; _fail=$(find "$_upd_dir" -name 'fail_*' 2>/dev/null | wc -l)
  echo "$_ok $_fail"
}

# ── Phase 3: choiceExplanations 生成（静的解析優先 + AI フォールバック） ──
run_phase3() {
  echo ""
  echo "━━ Phase 3: choiceExplanations 生成 ━━"

  # 対象問題: choiceExplanations が未設定 or choices と長さ不一致
  _TARGET_TMP=$(mktemp /tmp/phase3_targets_XXXX.json)

  python3 - "$_ALL_ITEMS_TMP" "$FORCE_EXAM" "$LIMIT" << 'PYEOF' > "$_TARGET_TMP"
import json, sys

def deser(v):
    if "S" in v: return v["S"]
    if "N" in v: return float(v["N"]) if "." in v["N"] else int(v["N"])
    if "BOOL" in v: return v["BOOL"]
    if "NULL" in v: return None
    if "L" in v: return [deser(x) for x in v["L"]]
    if "M" in v: return {k: deser(vv) for k, vv in v["M"].items()}
    if "SS" in v: return list(v["SS"])
    return v

with open(sys.argv[1]) as f:
    items = json.load(f)
exam_filter = sys.argv[2] if len(sys.argv) > 2 else ""
limit = int(sys.argv[3]) if len(sys.argv) > 3 and sys.argv[3] != "0" else 0

targets = []
for item in items:
    exam = item.get("examType", {}).get("S", "")
    if exam_filter and exam != exam_filter:
        continue
    qid = item.get("questionId", {}).get("S", "")
    if not qid:
        continue

    choices_raw = item.get("choices", {})
    choices = []
    if "L" in choices_raw:
        choices = [deser(x) for x in choices_raw["L"]]
    elif "SS" in choices_raw:
        choices = list(choices_raw["SS"])
    if len(choices) < 2:
        continue

    ce_raw = item.get("choiceExplanations", {})
    ce = []
    if "L" in ce_raw:
        ce = [deser(x) for x in ce_raw["L"]]

    if len(ce) == len(choices):
        continue  # 既に完備

    correct_raw = item.get("correctAnswers", {})
    correct = []
    if "L" in correct_raw:
        correct = [deser(x) for x in correct_raw["L"]]
    elif "SS" in correct_raw:
        correct = list(correct_raw["SS"])

    idx_raw = item.get("correctAnswerIndices", {})
    indices = []
    if "L" in idx_raw:
        indices = [int(deser(x)) for x in idx_raw["L"]]
    elif "NS" in idx_raw:
        indices = sorted([int(x) for x in idx_raw["NS"]])

    qt = item.get("questionText", {}).get("S", "")
    expl = item.get("explanation", {}).get("S", "")

    targets.append({
        "questionId": qid,
        "examType": exam,
        "questionText": qt,
        "choices": choices,
        "correctAnswers": correct,
        "correctAnswerIndices": indices,
        "explanation": expl,
    })

    if limit > 0 and len(targets) >= limit:
        break

print(json.dumps(targets, ensure_ascii=False))
PYEOF

  TARGET_COUNT=$(python3 -c "import json; print(len(json.load(open('$_TARGET_TMP'))))" 2>/dev/null || echo 0)
  echo "  対象: ${TARGET_COUNT}件"
  if [ "$TARGET_COUNT" -eq 0 ]; then
    echo "  対象なし。Phase 3 をスキップ"
    rm -f "$_TARGET_TMP"
    return
  fi

  DONE=0
  FAILED=0

  # ── Step A: 静的解析（explanation の「選択肢X」パターンを分割） ──
  _STATIC_JSONL=$(mktemp /tmp/phase3_static_XXXX.jsonl)
  _AI_TMP=$(mktemp /tmp/phase3_ai_XXXX.json)

  python3 - "$_TARGET_TMP" "$_STATIC_JSONL" "$_AI_TMP" << 'PYEOF'
import json, re, sys

def try_static(expl, choices, correct_indices):
    """explanation から choiceExplanations を静的に抽出。失敗時は None を返す"""
    if not re.search(r'選択肢\s*[A-E]', expl):
        return None
    parts = re.split(r'\n+(?=選択肢\s*[A-E])', expl)
    # イントロ: 「正解：\n[選択肢テキスト]\n\n」を除去して本文のみに
    intro = re.sub(r'^正解[：:]\s*\n.*?\n\n', '', parts[0].strip(), flags=re.DOTALL).strip()
    if not intro:
        intro = parts[0].strip()
    n = len(choices)
    result = [''] * n
    for idx in correct_indices:
        if 0 <= idx < n:
            result[idx] = intro
    for part in parts[1:]:
        m = re.match(r'選択肢\s*([A-E])', part)
        if not m: continue
        idx = ord(m.group(1)) - ord('A')
        if not (0 <= idx < n): continue
        body = re.sub(r'^選択肢\s*[A-E][はのをにと：:、．. ]*', '', part).strip()
        if body:
            result[idx] = body
    return result if all(result) else None

with open(sys.argv[1]) as f:
    targets = json.load(f)

static_out = open(sys.argv[2], 'w', encoding='utf-8')
ai_targets = []

for t in targets:
    ces = try_static(t['explanation'], t['choices'], t['correctAnswerIndices'])
    if ces:
        ce_dynamo = json.dumps({'L': [{'S': c} for c in ces]}, ensure_ascii=False)
        static_out.write(json.dumps({'questionId': t['questionId'], 'ce_dynamo': ce_dynamo}, ensure_ascii=False) + '\n')
    else:
        ai_targets.append(t)

static_out.close()
with open(sys.argv[3], 'w', encoding='utf-8') as f:
    json.dump(ai_targets, f, ensure_ascii=False)
PYEOF

  STATIC_COUNT=$(wc -l < "$_STATIC_JSONL" | tr -d ' ')
  AI_COUNT=$(python3 -c "import json; print(len(json.load(open('$_AI_TMP'))))" 2>/dev/null || echo 0)
  echo "  静的解析: ${STATIC_COUNT}件  AI必要: ${AI_COUNT}件"

  # ── Step B: 静的解析結果を DynamoDB に並列更新 ──
  if [ "$DRY_RUN" -eq 1 ]; then
    python3 -c "
import json, sys
for line in open(sys.argv[1]):
    d = json.loads(line)
    ce = json.loads(d['ce_dynamo'])['L']
    print(f'  [DRY static] {d[\"questionId\"]}: {len(ce)}件')
    for i, c in enumerate(ce[:2]):
        print(f'    [{i}] {c[\"S\"][:60]}...')
" "$_STATIC_JSONL"
    DONE=$((DONE + STATIC_COUNT))
  elif [ "$STATIC_COUNT" -gt 0 ]; then
    _UPD_DIR=$(mktemp -d /tmp/phase3_upd_XXXX)
    _NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    read -r _s_ok _s_fail <<< "$(_parallel_update_ce "$_STATIC_JSONL" "$_UPD_DIR" "$_NOW")"
    rm -rf "$_UPD_DIR"
    DONE=$((DONE + _s_ok))
    FAILED=$((FAILED + _s_fail))
    echo "  静的更新完了（成功=${_s_ok} 失敗=${_s_fail}）"
  fi
  rm -f "$_STATIC_JSONL"

  # ── Step C: AI フォールバック（バッチ処理） ──
  if [ "$AI_COUNT" -gt 0 ]; then
    echo ""
    echo "  ── AI フォールバック: ${AI_COUNT}件 ──"
    _TOTAL_BATCHES=$(( (AI_COUNT + BATCH_SIZE - 1) / BATCH_SIZE ))

    for (( _b=0; _b<_TOTAL_BATCHES; _b++ )); do
      _OFFSET=$(( _b * BATCH_SIZE ))
      echo ""
      echo "  AIバッチ $((_b + 1))/${_TOTAL_BATCHES} (offset=${_OFFSET}, size=${BATCH_SIZE})"

      BATCH_JSON=$(python3 -c "
import json, sys
with open(sys.argv[1]) as f:
    targets = json.load(f)
batch = targets[$_OFFSET:$_OFFSET + $BATCH_SIZE]
# AI には choices, correctAnswerIndices, explanation のみ送る（questionText 不要）
slim = [{'questionId':t['questionId'],'choices':t['choices'],
         'correctAnswerIndices':t['correctAnswerIndices'],'explanation':t['explanation']} for t in batch]
print(json.dumps(slim, ensure_ascii=False))
" "$_AI_TMP" 2>/dev/null)

      if [ -z "$BATCH_JSON" ] || [ "$BATCH_JSON" = "[]" ]; then
        echo "  バッチデータ取得失敗。スキップ"
        continue
      fi

      PROMPT_FILE=$(mktemp /tmp/phase3_prompt_XXXX.txt)
      _BATCH_JSON_FILE=$(mktemp /tmp/phase3_batch_XXXX.json)
      printf '%s' "$BATCH_JSON" > "$_BATCH_JSON_FILE"
      python3 - "$PROMPT_FILE" "$_BATCH_JSON_FILE" << 'PYEOF'
import json, sys
out, batch_file = sys.argv[1], sys.argv[2]
with open(batch_file, encoding='utf-8') as f:
    batch_json = f.read().strip()
prompt = (
    "以下のAWS資格試験問題について、各選択肢に対する解説を生成してください。\n\n"
    "# 入力データ\n"
    + batch_json + "\n\n"
    "# 出力形式\n"
    "各問題について choiceExplanations 配列を生成してください。\n"
    "- choiceExplanations の長さは choices と完全に一致させる（choices[0] の解説は choiceExplanations[0]）\n"
    "- 各解説は日本語で100〜150字程度\n"
    "- 正解の選択肢: なぜ正解なのか（根拠・理由）を説明\n"
    "- 不正解の選択肢: なぜ不正解なのか（誤りの理由・正しい説明）を説明\n"
    "- 文頭に「〜は正解です」「〜は不正解です」などの判定文を含めない（理由から始める）\n"
    "- explanation フィールドを参考にして一貫した解説にすること\n\n"
    "JSONのみを返す（説明文・コードブロック不要）:\n"
    '{"results":[{"questionId":"...","choiceExplanations":["選択肢0の解説","選択肢1の解説",...]},...]}'
)
with open(out, 'w', encoding='utf-8') as f:
    f.write(prompt)
PYEOF
      rm -f "$_BATCH_JSON_FILE"

      RESULT=$("$CLAUDE_CMD" --model claude-haiku-4-5-20251001 -p < "$PROMPT_FILE" 2>&1)
      AI_EXIT=$?
      rm -f "$PROMPT_FILE"

      if [ $AI_EXIT -ne 0 ]; then
        _HEAD=$(echo "$RESULT" | head -3)
        if echo "$_HEAD" | grep -qiE "rate.?limit|too many requests|overload|quota exceeded"; then
          echo "  ⚠️  レート制限。60秒待機..."
          sleep 60
          _b=$((_b - 1))
          continue
        fi
        echo "  ❌ Claude 実行エラー: $_HEAD"
        FAILED=$((FAILED + BATCH_SIZE))
        continue
      fi

      # JSON 抽出
      PARSED=$(echo "$RESULT" | python3 -c "
import sys, json, re
text = sys.stdin.read()
cb = re.search(r'\`\`\`(?:json)?\s*(\{)', text, re.DOTALL)
if cb:
    text = text[cb.start(1):]
    text = re.sub(r'\s*\`\`\`.*\$', '', text, flags=re.DOTALL)
start = text.find('{')
if start == -1: print('{}'); sys.exit(0)
try:
    obj, _ = json.JSONDecoder().raw_decode(text, start)
    print(json.dumps(obj, ensure_ascii=False))
except: print('{}')
" 2>/dev/null)

      RESULT_COUNT=$(echo "$PARSED" | python3 -c "
import json, sys
print(len(json.loads(sys.stdin.read()).get('results', [])))
" 2>/dev/null || echo 0)

      if [ "$RESULT_COUNT" -eq 0 ]; then
        echo "  ❌ JSON解析失敗"
        echo "$RESULT" | head -c 200
        FAILED=$((FAILED + BATCH_SIZE))
        continue
      fi

      echo "  AI解析: ${RESULT_COUNT}問"

      if [ "$DRY_RUN" -eq 1 ]; then
        echo "$PARSED" | python3 -c "
import json, sys
d = json.loads(sys.stdin.read())
for r in d.get('results', []):
    ces = r.get('choiceExplanations', [])
    print(f'  [DRY AI] {r[\"questionId\"]}: {len(ces)}件')
    for i, ce in enumerate(ces[:2]):
        print(f'    [{i}] {ce[:60]}...')
"
        DONE=$((DONE + RESULT_COUNT))
        continue
      fi

      # 並列 DynamoDB 更新
      _AI_JSONL=$(mktemp /tmp/phase3_ai_upd_XXXX.jsonl)
      echo "$PARSED" | python3 -c "
import json, sys
d = json.loads(sys.stdin.read())
for r in d.get('results', []):
    qid, ces = r.get('questionId',''), r.get('choiceExplanations',[])
    if not qid or not ces: continue
    ce_dynamo = json.dumps({'L': [{'S': str(c)} for c in ces]}, ensure_ascii=False)
    print(json.dumps({'questionId': qid, 'ce_dynamo': ce_dynamo}))
" 2>/dev/null > "$_AI_JSONL"

      _UPD_DIR=$(mktemp -d /tmp/phase3_upd_XXXX)
      _NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
      read -r _a_ok _a_fail <<< "$(_parallel_update_ce "$_AI_JSONL" "$_UPD_DIR" "$_NOW")"
      rm -rf "$_UPD_DIR" "$_AI_JSONL"
      DONE=$((DONE + _a_ok))
      FAILED=$((FAILED + _a_fail))
      echo "  AIバッチ $((_b + 1)) 完了（成功=${_a_ok} 失敗=${_a_fail}）"
    done
  fi

  rm -f "$_TARGET_TMP" "$_AI_TMP"
  echo ""
  echo "Phase 3 完了: 成功=$DONE 失敗=$FAILED"
}

# ── メイン ─────────────────────────────────────────────────────
if [ "$PHASE" -eq 0 ] || [ "$PHASE" -eq 1 ]; then run_phase1; fi
if [ "$PHASE" -eq 0 ] || [ "$PHASE" -eq 2 ]; then run_phase2; fi
if [ "$PHASE" -eq 0 ] || [ "$PHASE" -eq 3 ]; then run_phase3; fi

rm -f "$_ALL_ITEMS_TMP"

echo ""
echo "========================================"
echo "移行完了: $(date)"
echo "ログ: $LOG_FILE"
echo "========================================"
