#!/bin/bash
# 問題の削除予定日チェック・自動削除スクリプト（決定的・claude不要）
#
# Questions テーブルの scheduledDeletionReason / scheduledDeletionDate は
# 管理者が PUT /admin/questions/:id/scheduled-deletion で手動設定する。
# scheduledDeletionDate（YYYY-MM-DD）が当日以前になった問題を自動削除する。
# 削除時は QuestionTagRelations の関連レコードも掃除する
# （lambda/src/app.js の DELETE /admin/questions/:id と同じ後始末）。

set -uo pipefail

export PATH="/home/yuzuki/local/bin:$PATH"

_d="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
while [ "$(basename "$_d")" != "scripts" ] && [ "$_d" != "/" ]; do _d="$(dirname "$_d")"; done
NIGHT_PROMPTS_DIR="$(dirname "$_d")"
LOG_DIR="$(dirname "$NIGHT_PROMPTS_DIR")/logs"
mkdir -p "$LOG_DIR"
AWS=/home/yuzuki/local/bin/aws

echo "=========================================="
echo "削除予定チェック開始: $(date '+%Y-%m-%d %H:%M:%S')"
echo "=========================================="

AWS="$AWS" python3 << 'PYEOF'
import json, os, subprocess
from datetime import date

AWS = os.environ['AWS']
today = date.today().isoformat()

scan = subprocess.run(
    [AWS, 'dynamodb', 'scan', '--table-name', 'Questions',
     '--filter-expression', 'attribute_exists(scheduledDeletionDate)',
     '--projection-expression', 'questionId, scheduledDeletionDate, scheduledDeletionReason',
     '--output', 'json'],
    capture_output=True, text=True
)
if scan.returncode != 0:
    print(f'  ⚠️ scan失敗: {scan.stderr[:300]}')
    raise SystemExit(0)

items = json.loads(scan.stdout).get('Items', [])
if not items:
    print('  対象なし（削除予定フラグが立った問題は0件）')
    raise SystemExit(0)

deleted = kept = 0
for it in items:
    qid = it['questionId']['S']
    due = it.get('scheduledDeletionDate', {}).get('S', '')
    reason = it.get('scheduledDeletionReason', {}).get('S', '')
    if not due or due > today:
        kept += 1
        continue

    rel = subprocess.run(
        [AWS, 'dynamodb', 'scan', '--table-name', 'QuestionTagRelations',
         '--filter-expression', 'questionId = :qid',
         '--expression-attribute-values', json.dumps({':qid': {'S': qid}}),
         '--output', 'json'],
        capture_output=True, text=True
    )
    if rel.returncode == 0:
        for r in json.loads(rel.stdout).get('Items', []):
            subprocess.run([AWS, 'dynamodb', 'delete-item', '--table-name', 'QuestionTagRelations',
                '--key', json.dumps({'tagId': r['tagId'], 'questionId': r['questionId']})],
                capture_output=True)

    res = subprocess.run([AWS, 'dynamodb', 'delete-item', '--table-name', 'Questions',
        '--key', json.dumps({'questionId': {'S': qid}})], capture_output=True, text=True)
    if res.returncode == 0:
        deleted += 1
        print(f'  [削除] {qid}: {reason}（予定日={due}）')
    else:
        print(f'  ⚠️ 削除失敗 {qid}: {res.stderr[:200]}')

print(f'  → 削除={deleted} 未到達（保留中）={kept}')
PYEOF

echo "=========================================="
echo "削除予定チェック終了: $(date '+%Y-%m-%d %H:%M:%S')"
echo "=========================================="
