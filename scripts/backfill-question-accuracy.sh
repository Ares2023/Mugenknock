#!/bin/bash
# 全ユーザー正答率（Questions.globalAttempts / globalCorrect）の初期バックフィル。
# UserAnswers-prod（本番の実回答）と旧 UserAnswers（分割前のレガシー）を走査して
# 問題ごとに集計し、Questions テーブルへ SET する（存在しない問題はスキップ）。
# UserAnswers-dev はテストノイズのため対象外。
#
# 一度だけ実行する想定。再実行すると「実行時点のログ全量」で上書きされる
# （実行〜書き込みの間に入ったリアルタイム加算は失われるが数秒〜数分の窓のみ）。
#
# usage: ./scripts/backfill-question-accuracy.sh [--dry-run]

set -uo pipefail
export PATH="/home/yuzuki/local/bin:$PATH"

DRY_RUN=0
[ "${1:-}" = "--dry-run" ] && DRY_RUN=1

TMP_DIR=$(mktemp -d /tmp/qacc_backfill_XXXX)
trap 'rm -rf "$TMP_DIR"' EXIT

echo "=========================================="
echo "正答率バックフィル 開始: $(date)"
[ "$DRY_RUN" -eq 1 ] && echo "（ドライラン: 書き込みなし）"
echo "=========================================="

for table in UserAnswers-prod UserAnswers; do
  echo "--- $table をスキャン中 ---"
  aws dynamodb scan --table-name "$table" \
    --projection-expression "questionId, isCorrect" \
    --output json > "$TMP_DIR/${table}.json" 2>/dev/null \
    || echo '{"Items":[]}' > "$TMP_DIR/${table}.json"
done

python3 - "$TMP_DIR" "$DRY_RUN" << 'PYEOF'
import json, sys, subprocess, os
from collections import defaultdict

tmp_dir, dry_run = sys.argv[1], sys.argv[2] == '1'

# AWS CLI のページネーションで複数JSONが連結されるためデコーダで順次読む
def load_items(path):
    items = []
    with open(path) as f:
        content = f.read()
    dec = json.JSONDecoder()
    pos = 0
    while pos < len(content):
        start = content.find('{', pos)
        if start == -1:
            break
        try:
            obj, pos = dec.raw_decode(content, start)
            items.extend(obj.get('Items', []))
        except Exception:
            break
    return items

agg = defaultdict(lambda: [0, 0])  # questionId -> [attempts, correct]
total_answers = 0
for table in ('UserAnswers-prod', 'UserAnswers'):
    items = load_items(os.path.join(tmp_dir, f'{table}.json'))
    print(f'  {table}: {len(items)}件の回答ログ')
    for it in items:
        qid = it.get('questionId', {}).get('S', '')
        if not qid:
            continue
        agg[qid][0] += 1
        if it.get('isCorrect', {}).get('BOOL', False):
            agg[qid][1] += 1
        total_answers += 1

print(f'集計: 回答{total_answers}件 → 対象問題 {len(agg)}問')

updated = skipped = failed = 0
for qid, (attempts, correct) in sorted(agg.items()):
    if dry_run:
        acc = round(correct / attempts * 100) if attempts else 0
        print(f'  [DRY] {qid}: {correct}/{attempts} ({acc}%)')
        continue
    r = subprocess.run([
        'aws', 'dynamodb', 'update-item',
        '--table-name', 'Questions',
        '--key', json.dumps({'questionId': {'S': qid}}),
        '--update-expression', 'SET globalAttempts = :a, globalCorrect = :c',
        '--condition-expression', 'attribute_exists(questionId)',
        '--expression-attribute-values', json.dumps({':a': {'N': str(attempts)}, ':c': {'N': str(correct)}}),
    ], capture_output=True, text=True)
    if r.returncode == 0:
        updated += 1
    elif 'ConditionalCheckFailed' in (r.stderr or ''):
        skipped += 1  # 削除済み問題
    else:
        failed += 1
        print(f'  ❌ {qid}: {(r.stderr or "").strip()[:120]}')

if not dry_run:
    print(f'完了: 更新{updated}問 / 削除済みスキップ{skipped}問 / 失敗{failed}問')
PYEOF

echo "=========================================="
echo "完了: $(date)"
echo "=========================================="
