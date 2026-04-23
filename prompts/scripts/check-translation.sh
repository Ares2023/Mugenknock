#!/bin/bash
# 英訳チェック・自動補完スクリプト
# DynamoDB から問題・Tips・リリースノートを取得し、
# 英訳が欠けているものや品質が低いものを Claude で自動修正する
# 使い方: ./check-translation.sh [バッチサイズ]  例: ./check-translation.sh 30

set -uo pipefail

export PATH="/home/sera/.config/nvm/versions/node/v20.20.2/bin:$PATH"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$(dirname "$SCRIPT_DIR")/logs"
mkdir -p "$LOG_DIR"
DATE=$(date '+%Y%m%d_%H%M%S')
LOG_FILE="$LOG_DIR/translation_${DATE}.log"

BATCH_SIZE="${1:-30}"

{
echo "=========================================="
echo "英訳チェック開始: $(date)"
echo "バッチサイズ: ${BATCH_SIZE}件"
echo "=========================================="

# ── 共通：DynamoDB デシリアライザ Python 関数 ──────────────────────────────
read -r -d '' PY_DESER << 'PYEOF' || true
def deser(v):
    if 'S' in v: return v['S']
    if 'N' in v: return float(v['N']) if '.' in str(v['N']) else int(v['N'])
    if 'BOOL' in v: return v['BOOL']
    if 'L' in v: return [deser(i) for i in v['L']]
    if 'M' in v: return {k: deser(vv) for k, vv in v['M'].items()}
    if 'NULL' in v: return None
    return None
PYEOF

# ══════════════════════════════════════════════════════════════
# 1. Questions テーブル：英訳チェック
# ══════════════════════════════════════════════════════════════
echo ""
echo "▶ Questions テーブルを処理中..."

DYNAMO_TMP=$(mktemp /tmp/dynamo_q_XXXX.json)
aws dynamodb scan --table-name Questions --output json 2>/dev/null > "$DYNAMO_TMP"

QUESTIONS_JSON=$(BATCH_SIZE=$BATCH_SIZE DYNAMO_TMP="$DYNAMO_TMP" python3 << PYEOF
import json, os
from datetime import datetime, timezone, timedelta

$PY_DESER

with open(os.environ['DYNAMO_TMP']) as f:
    data = json.load(f)
items = data.get('Items', [])
questions = [{ k: deser(v) for k, v in item.items() } for item in items]

cutoff = datetime.now(timezone.utc) - timedelta(days=30)
candidates = []
for q in questions:
    if q.get('isHidden'):
        continue
    missing = (
        not q.get('questionTextEn') or
        not q.get('choicesEn') or
        not q.get('explanationEn')
    )
    checked = q.get('translationCheckedAt')
    if missing:
        candidates.append((0, q))
    elif not checked:
        candidates.append((1, q))
    else:
        try:
            dt = datetime.fromisoformat(checked.replace('Z', '+00:00'))
            if dt < cutoff:
                candidates.append((2, q))
        except:
            candidates.append((2, q))

candidates.sort(key=lambda x: x[0])
batch = int(os.environ.get('BATCH_SIZE', 30))
print(json.dumps([q for _, q in candidates[:batch]]))
PYEOF
)
rm -f "$DYNAMO_TMP"

Q_COUNT=$(echo "$QUESTIONS_JSON" | python3 -c "import json,sys; print(len(json.load(sys.stdin)))" 2>/dev/null || echo 0)
echo "  チェック対象: ${Q_COUNT}問"

if [ "$Q_COUNT" -gt 0 ]; then
  PROMPT_FILE=$(mktemp /tmp/trans_prompt_XXXX.txt)

  python3 << PYEOF > "$PROMPT_FILE"
import json
questions = json.loads("""$(echo "$QUESTIONS_JSON" | sed 's/\\/\\\\/g; s/"""/\\"/g')""")

lines = ["""あなたはAWS認定試験の英訳専門家です。
以下の問題リストについて英訳の有無・品質を確認し、必要なら修正・新規翻訳してください。

【出力形式】必ず以下のJSONのみで出力してください。余分なテキスト不要。
{"results":[{"questionId":"...","status":"ok|fixed|translated","questionTextEn":"英文","choicesEn":["選択肢A英文","..."],"explanationEn":"解説英文"},...]}

statusの意味:
- ok: 既存英訳が正確（そのまま返す）
- fixed: 誤訳・不自然な表現を修正した
- translated: 英訳がなかったので新規作成した

注意:
- choicesEn は元の choices と同じ順序・同じ数にすること
- AWS固有名詞（S3, Lambda, DynamoDB, CloudFormation等）はそのまま使う
- 専門用語は正確に翻訳すること

【問題リスト】"""]

for q in questions:
    lines.append(f"questionId: {q['questionId']}")
    lines.append(f"examType: {q.get('examType','')}")
    lines.append(f"questionText(JA): {q.get('questionText','')}")
    if q.get('questionTextEn'):
        lines.append(f"questionTextEn(現状): {q['questionTextEn']}")
    choices = q.get('choices', [])
    if choices:
        lines.append(f"choices(JA): {' | '.join(str(c) for c in choices)}")
    if q.get('choicesEn'):
        lines.append(f"choicesEn(現状): {' | '.join(str(c) for c in q['choicesEn'])}")
    exp = q.get('explanation', '')
    if exp:
        lines.append(f"explanation(JA): {exp[:400]}")
    if q.get('explanationEn'):
        lines.append(f"explanationEn(現状): {q['explanationEn'][:300]}")
    lines.append("")

print('\n'.join(lines))
PYEOF

  echo "  Claude に送信中..."
  RESULT=$(claude --dangerously-skip-permissions -p "$(cat "$PROMPT_FILE")" 2>&1)
  CLAUDE_EXIT=$?
  rm -f "$PROMPT_FILE"

  if [ $CLAUDE_EXIT -ne 0 ] || echo "$RESULT" | grep -qiE "rate.?limit|too many requests|overload|529|quota exceeded|usage limit"; then
    echo "⚠️  Claudeのレート制限を検出しました"
    NEXT_RESET=$(python3 << 'PYEOF'
from datetime import datetime, timezone, timedelta
jst = timezone(timedelta(hours=9))
now = datetime.now(jst)
candidates = []
for h in [3, 9, 15, 21]:
    t = now.replace(hour=h, minute=30, second=0, microsecond=0)
    if t <= now:
        t += timedelta(days=1)
    candidates.append(t)
print(min(candidates).strftime('%H:%M'))
PYEOF
)
    echo "次のリセット時刻: ${NEXT_RESET} JST にリスケジュール..."
    systemd-run --user \
      --on-calendar="*-*-* ${NEXT_RESET}:00" \
      --unit="claude-translation-retry.service" \
      /home/sera/aws-quiz-app/prompts/scripts/check-translation.sh "$BATCH_SIZE" \
      && echo "✓ リスケジュール完了" \
      || echo "✗ systemd-run 失敗"
    exit 1
  fi

  RESULT_JSON=$(echo "$RESULT" | python3 -c "
import sys, json, re
text = sys.stdin.read()
m = re.search(r'\{.*\"results\".*\}', text, re.DOTALL)
if m:
    try: print(json.dumps(json.loads(m.group())))
    except: print('{}')
else: print('{}')
")

  echo ""
  echo "  --- Questions 更新結果 ---"
  RESULT_JSON="$RESULT_JSON" python3 << 'PYEOF'
import json, os, subprocess
from datetime import datetime, timezone

data = json.loads(os.environ.get('RESULT_JSON', '{}'))
results = data.get('results', [])
now = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
ok, fixed, translated = 0, 0, 0

for r in results:
    qid = r.get('questionId', '')
    status = r.get('status', 'ok')
    q_en = r.get('questionTextEn', '')
    choices_en = r.get('choicesEn', [])
    exp_en = r.get('explanationEn', '')

    update_expr = 'SET translationCheckedAt = :t'
    expr_values = {':t': {'S': now}}
    if q_en:
        update_expr += ', questionTextEn = :qe'
        expr_values[':qe'] = {'S': q_en}
    if choices_en:
        update_expr += ', choicesEn = :ce'
        expr_values[':ce'] = {'L': [{'S': str(c)} for c in choices_en]}
    if exp_en:
        update_expr += ', explanationEn = :ee'
        expr_values[':ee'] = {'S': exp_en}

    label = {'ok': 'OK', 'fixed': 'FIXED', 'translated': 'TRANSLATED'}.get(status, status.upper())
    if status == 'ok': ok += 1
    elif status == 'fixed': fixed += 1
    else: translated += 1
    print(f'    [{label:10}] {qid}')

    subprocess.run([
        'aws', 'dynamodb', 'update-item',
        '--table-name', 'Questions',
        '--key', json.dumps({'questionId': {'S': qid}}),
        '--update-expression', update_expr,
        '--expression-attribute-values', json.dumps(expr_values),
    ], capture_output=True)

print()
print(f'  Questions 完了: OK={ok} / 修正={fixed} / 新規翻訳={translated}')
PYEOF
fi

# ══════════════════════════════════════════════════════════════
# 2. Tips テーブル：英訳チェック
# ══════════════════════════════════════════════════════════════
echo ""
echo "▶ Tips テーブルを処理中..."

TIPS_TMP=$(mktemp /tmp/dynamo_tips_XXXX.json)
aws dynamodb scan --table-name Tips --output json 2>/dev/null > "$TIPS_TMP" || { echo "  Tips テーブルが存在しないかアクセスできません"; rm -f "$TIPS_TMP"; }

if [ -f "$TIPS_TMP" ]; then
  TIPS_JSON=$(DYNAMO_TMP="$TIPS_TMP" python3 << PYEOF
import json, os

$PY_DESER

with open(os.environ['DYNAMO_TMP']) as f:
    data = json.load(f)
items = data.get('Items', [])
tips = [{ k: deser(v) for k, v in item.items() } for item in items]

# 英訳が欠けているものを対象に
candidates = [t for t in tips if not t.get('titleEn') or not t.get('contentEn')]
print(json.dumps(candidates[:10]))  # Tips は最大10件ずつ
PYEOF
)
  rm -f "$TIPS_TMP"

  TIPS_COUNT=$(echo "$TIPS_JSON" | python3 -c "import json,sys; print(len(json.load(sys.stdin)))" 2>/dev/null || echo 0)
  echo "  チェック対象: ${TIPS_COUNT}件"

  if [ "$TIPS_COUNT" -gt 0 ]; then
    TIPS_PROMPT=$(mktemp /tmp/tips_prompt_XXXX.txt)

    python3 << PYEOF > "$TIPS_PROMPT"
import json
tips = json.loads("""$(echo "$TIPS_JSON" | sed 's/\\/\\\\/g; s/"""/\\"/g')""")

lines = ["""AWSクイズアプリのコラム記事を英訳してください。

【出力形式】JSONのみで出力。
{"results":[{"tipId":"...","titleEn":"英語タイトル","contentEn":"英語本文"},...]}

【コラムリスト】"""]

for t in tips:
    lines.append(f"tipId: {t.get('tipId','')}")
    lines.append(f"title(JA): {t.get('title','')}")
    if t.get('titleEn'):
        lines.append(f"titleEn(現状): {t['titleEn']}")
    lines.append(f"content(JA): {t.get('content','')}")
    if t.get('contentEn'):
        lines.append(f"contentEn(現状): {t['contentEn']}")
    lines.append("")

print('\n'.join(lines))
PYEOF

    TIPS_RESULT=$(claude --dangerously-skip-permissions -p "$(cat "$TIPS_PROMPT")" 2>&1)
    rm -f "$TIPS_PROMPT"

    TIPS_RESULT_JSON=$(echo "$TIPS_RESULT" | python3 -c "
import sys, json, re
text = sys.stdin.read()
m = re.search(r'\{.*\"results\".*\}', text, re.DOTALL)
if m:
    try: print(json.dumps(json.loads(m.group())))
    except: print('{}')
else: print('{}')
")

    echo "  --- Tips 更新結果 ---"
    TIPS_RESULT_JSON="$TIPS_RESULT_JSON" python3 << 'PYEOF'
import json, os, subprocess
from datetime import datetime, timezone

data = json.loads(os.environ.get('TIPS_RESULT_JSON', '{}'))
results = data.get('results', [])
count = 0

for r in results:
    tid = r.get('tipId', '')
    title_en = r.get('titleEn', '')
    content_en = r.get('contentEn', '')
    if not tid: continue

    update_expr = 'SET titleEn = :te, contentEn = :ce'
    expr_values = {
        ':te': {'S': title_en},
        ':ce': {'S': content_en},
    }
    subprocess.run([
        'aws', 'dynamodb', 'update-item',
        '--table-name', 'Tips',
        '--key', json.dumps({'tipId': {'S': tid}}),
        '--update-expression', update_expr,
        '--expression-attribute-values', json.dumps(expr_values),
    ], capture_output=True)
    count += 1
    print(f'    [TRANSLATED] {tid}')

print(f'\n  Tips 完了: {count}件更新')
PYEOF
  else
    echo "  すべて英訳済み"
  fi
fi

# ══════════════════════════════════════════════════════════════
# 3. Releases テーブル：英訳チェック
# ══════════════════════════════════════════════════════════════
echo ""
echo "▶ Releases テーブルを処理中..."

RELEASES_TMP=$(mktemp /tmp/dynamo_rel_XXXX.json)
aws dynamodb scan --table-name Releases --output json 2>/dev/null > "$RELEASES_TMP" || { echo "  Releases テーブルが存在しないかアクセスできません"; rm -f "$RELEASES_TMP"; }

if [ -f "$RELEASES_TMP" ]; then
  RELEASES_JSON=$(DYNAMO_TMP="$RELEASES_TMP" python3 << PYEOF
import json, os

$PY_DESER

with open(os.environ['DYNAMO_TMP']) as f:
    data = json.load(f)
items = data.get('Items', [])
releases = [{ k: deser(v) for k, v in item.items() } for item in items]

candidates = [r for r in releases if not r.get('titleEn') or not r.get('bodyEn')]
print(json.dumps(candidates[:10]))
PYEOF
)
  rm -f "$RELEASES_TMP"

  REL_COUNT=$(echo "$RELEASES_JSON" | python3 -c "import json,sys; print(len(json.load(sys.stdin)))" 2>/dev/null || echo 0)
  echo "  チェック対象: ${REL_COUNT}件"

  if [ "$REL_COUNT" -gt 0 ]; then
    REL_PROMPT=$(mktemp /tmp/rel_prompt_XXXX.txt)

    python3 << PYEOF > "$REL_PROMPT"
import json
releases = json.loads("""$(echo "$RELEASES_JSON" | sed 's/\\/\\\\/g; s/"""/\\"/g')""")

lines = ["""AWSクイズアプリのリリースノートを英訳してください。
自然なプロダクト英語で、技術的な内容を正確に翻訳してください。

【出力形式】JSONのみで出力。
{"results":[{"releaseId":"...","titleEn":"英語タイトル","bodyEn":"英語本文"},...]}

【リリースノートリスト】"""]

for r in releases:
    lines.append(f"releaseId: {r.get('releaseId','')}")
    lines.append(f"date: {r.get('date','')}")
    lines.append(f"title(JA): {r.get('title','')}")
    if r.get('titleEn'):
        lines.append(f"titleEn(現状): {r['titleEn']}")
    lines.append(f"body(JA): {r.get('body','')}")
    if r.get('bodyEn'):
        lines.append(f"bodyEn(現状): {r['bodyEn']}")
    lines.append("")

print('\n'.join(lines))
PYEOF

    REL_RESULT=$(claude --dangerously-skip-permissions -p "$(cat "$REL_PROMPT")" 2>&1)
    rm -f "$REL_PROMPT"

    REL_RESULT_JSON=$(echo "$REL_RESULT" | python3 -c "
import sys, json, re
text = sys.stdin.read()
m = re.search(r'\{.*\"results\".*\}', text, re.DOTALL)
if m:
    try: print(json.dumps(json.loads(m.group())))
    except: print('{}')
else: print('{}')
")

    echo "  --- Releases 更新結果 ---"
    REL_RESULT_JSON="$REL_RESULT_JSON" python3 << 'PYEOF'
import json, os, subprocess

data = json.loads(os.environ.get('REL_RESULT_JSON', '{}'))
results = data.get('results', [])
count = 0

for r in results:
    rid = r.get('releaseId', '')
    title_en = r.get('titleEn', '')
    body_en = r.get('bodyEn', '')
    if not rid: continue

    update_expr = 'SET titleEn = :te, bodyEn = :be'
    expr_values = {
        ':te': {'S': title_en},
        ':be': {'S': body_en},
    }
    subprocess.run([
        'aws', 'dynamodb', 'update-item',
        '--table-name', 'Releases',
        '--key', json.dumps({'releaseId': {'S': rid}}),
        '--update-expression', update_expr,
        '--expression-attribute-values', json.dumps(expr_values),
    ], capture_output=True)
    count += 1
    print(f'    [TRANSLATED] {rid}')

print(f'\n  Releases 完了: {count}件更新')
PYEOF
  else
    echo "  すべて英訳済み"
  fi
fi

echo ""
echo "=========================================="
echo "英訳チェック終了: $(date)"
echo "=========================================="

} 2>&1 | tee -a "$LOG_FILE"

find "$LOG_DIR" -name "translation_*.log" -mtime +30 -delete 2>/dev/null || true
