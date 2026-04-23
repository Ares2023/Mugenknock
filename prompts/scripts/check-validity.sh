#!/bin/bash
# AWS問題の正当性チェックスクリプト
# DynamoDBから直接問題を取得し、Claudeで評価して結果をDBに書き戻す

set -uo pipefail

export PATH="/home/sera/.config/nvm/versions/node/v20.20.2/bin:$PATH"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$(dirname "$SCRIPT_DIR")/logs"
mkdir -p "$LOG_DIR"
DATE=$(date '+%Y%m%d_%H%M%S')
LOG_FILE="$LOG_DIR/validity_${DATE}.log"

BATCH_SIZE="${1:-30}"   # 引数で変更可 例: ./check-validity.sh 10

{
echo "=========================================="
echo "正当性チェック開始: $(date)"
echo "バッチサイズ: ${BATCH_SIZE}問"
echo "=========================================="

# ── 1. DynamoDBから問題を取得（正解・解説込み）──────────────
QUESTIONS_JSON=$(aws dynamodb scan \
  --table-name Questions \
  --output json 2>/dev/null | python3 - << 'PYEOF'
import json, sys
from datetime import datetime, timezone, timedelta

data = json.load(sys.stdin)
items = data.get('Items', [])

def deser(v):
    if 'S' in v: return v['S']
    if 'N' in v: return float(v['N']) if '.' in v['N'] else int(v['N'])
    if 'BOOL' in v: return v['BOOL']
    if 'L' in v: return [deser(i) for i in v['L']]
    if 'M' in v: return {k: deser(vv) for k, vv in v['M'].items()}
    return None

questions = [{ k: deser(v) for k, v in item.items() } for item in items]

# isHidden=True のものは除く（既に非表示）
# 未チェック or 30日以上前にチェックしたもの を優先
cutoff = datetime.now(timezone.utc) - timedelta(days=30)
candidates = []
for q in questions:
    if q.get('isHidden'):
        continue
    checked = q.get('validityCheckedAt')
    if not checked:
        candidates.append((0, q))  # 未チェックを最優先
    else:
        try:
            dt = datetime.fromisoformat(checked.replace('Z', '+00:00'))
            if dt < cutoff:
                candidates.append((1, q))
        except:
            candidates.append((1, q))

candidates.sort(key=lambda x: x[0])
result = [q for _, q in candidates]

import os
batch = int(os.environ.get('BATCH_SIZE', 30))
print(json.dumps(result[:batch]))
PYEOF
)

COUNT=$(echo "$QUESTIONS_JSON" | python3 -c "import json,sys; print(len(json.load(sys.stdin)))" 2>/dev/null || echo 0)
echo "チェック対象: ${COUNT}問"

if [ "$COUNT" -eq 0 ]; then
  echo "チェック対象なし（全問が30日以内にチェック済み）"
  exit 0
fi

# ── 2. Claudeへのプロンプトを一時ファイルに書き出す ───────────
PROMPT_FILE=$(mktemp /tmp/validity_prompt_XXXX.txt)

python3 << PYEOF > "$PROMPT_FILE"
import json, sys

questions = json.loads("""$(echo "$QUESTIONS_JSON" | sed 's/\\/\\\\/g; s/"""/\\"/g')""")

lines = []
lines.append("""あなたはAWS認定試験の問題品質チェッカーです。
以下の問題リストを精査し、各問題を5段階で評価してください。

【評価基準】
1 (致命的): 問題が成立しない / 正解が選択肢に存在しない / 完全に事実と異なる
2 (重大): 現在のAWSサービス仕様と明確に矛盾している / 廃止されたサービスを現行として扱っている
3 (軽微): 表現が曖昧・誤解を招く可能性 / 軽微な誤り
4 (ほぼ問題なし): わずかな改善余地あり
5 (問題なし): 正確で適切

【出力形式】
必ず以下のJSON形式のみで出力してください。説明文は不要です。

{"results":[{"questionId":"...","rating":1〜5,"reason":"日本語で100字以内"},...]}

【問題リスト】
""")

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
    explanation = q.get('explanation', '')
    if explanation:
        lines.append(f"解説: {explanation[:200]}")
    lines.append("")

print('\n'.join(lines))
PYEOF

echo ""
echo "--- Claudeに送信中（${COUNT}問）---"

# ── 3. Claude呼び出し ──────────────────────────────────────
RESULT=$(claude --dangerously-skip-permissions -p "$(cat "$PROMPT_FILE")" 2>/dev/null)
rm -f "$PROMPT_FILE"

# JSON部分だけ抽出（前後に余計なテキストがある場合に対応）
RESULT_JSON=$(echo "$RESULT" | python3 -c "
import sys, json, re
text = sys.stdin.read()
# JSON ブロックを探す
m = re.search(r'\{.*\"results\".*\}', text, re.DOTALL)
if m:
    try:
        d = json.loads(m.group())
        print(json.dumps(d))
    except:
        print('{}')
else:
    print('{}')
")

echo ""
echo "--- 評価結果 ---"

# ── 4. DynamoDB更新 ────────────────────────────────────────
BATCH_SIZE=$BATCH_SIZE RESULT_JSON="$RESULT_JSON" python3 << 'PYEOF'
import json, os, subprocess
from datetime import datetime, timezone

result_json = os.environ.get('RESULT_JSON', '{}')
try:
    data = json.loads(result_json)
except:
    print("JSONパース失敗")
    exit(1)

results = data.get('results', [])
now = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')

hidden_count = 0
flagged_count = 0
ok_count = 0

RATING_LABELS = {1: '致命的', 2: '重大', 3: '軽微', 4: 'ほぼ問題なし', 5: '問題なし'}

for r in results:
    qid = r.get('questionId', '')
    rating = int(r.get('rating', 5))
    reason = r.get('reason', '')
    label = RATING_LABELS.get(rating, '不明')

    update_expr = 'SET validityRating = :r, validityNote = :n, validityCheckedAt = :t'
    expr_values = {
        ':r': {'N': str(rating)},
        ':n': {'S': reason},
        ':t': {'S': now},
    }

    if rating == 1:
        update_expr += ', isHidden = :h'
        expr_values[':h'] = {'BOOL': True}
        hidden_count += 1
        print(f'  [AUTO-HIDE rating={rating} {label}] {qid}')
        print(f'    → {reason}')
    elif rating <= 2:
        flagged_count += 1
        print(f'  [FLAGGED   rating={rating} {label}] {qid}')
        print(f'    → {reason}')
    else:
        ok_count += 1
        print(f'  [OK        rating={rating} {label}] {qid}')

    subprocess.run([
        'aws', 'dynamodb', 'update-item',
        '--table-name', 'Questions',
        '--key', json.dumps({'questionId': {'S': qid}}),
        '--update-expression', update_expr,
        '--expression-attribute-values', json.dumps(expr_values),
    ], capture_output=True)

print()
print(f'完了サマリー: OK={ok_count}問 / 要確認={flagged_count}問 / 自動非表示={hidden_count}問')
PYEOF

echo ""
echo "=========================================="
echo "チェック終了: $(date)"
echo "=========================================="

} 2>&1 | tee -a "$LOG_FILE"
