#!/usr/bin/env python3
"""
explanation フィールド先頭の「正解：」行を一括削除するスクリプト。

実行:
  python3 fix-explanation-prefix.py            # ドライラン（変更なし）
  python3 fix-explanation-prefix.py --apply    # 実際に更新
"""

import json, re, subprocess, sys
from datetime import datetime, timezone

DRY_RUN = '--apply' not in sys.argv
AWS = '/home/yuzuki/local/bin/aws'

def aws(*args):
    result = subprocess.run([AWS] + list(args), capture_output=True, text=True)
    return result.stdout

def fix_explanation(text: str) -> tuple[str, bool]:
    """先頭の「正解：...」行（＋続く空行）を取り除く。変更後テキストと変更有無を返す。"""
    if not text.startswith('正解：'):
        return text, False
    # 最初の改行まで（1行目）を除去
    newline_pos = text.find('\n')
    if newline_pos == -1:
        # 正解：しかない（そんな問題はないはずだが）
        return '', True
    rest = text[newline_pos + 1:]
    # 先頭の空行を取り除く
    rest = rest.lstrip('\n')
    return rest, True

def scan_all():
    items = []
    scan_kwargs = ['dynamodb', 'scan', '--table-name', 'Questions', '--output', 'json']
    last_key = None
    while True:
        if last_key:
            scan_kwargs_with_start = scan_kwargs + ['--exclusive-start-key', json.dumps(last_key)]
        else:
            scan_kwargs_with_start = scan_kwargs
        raw = aws(*scan_kwargs_with_start)
        data = json.loads(raw)
        items.extend(data.get('Items', []))
        last_key = data.get('LastEvaluatedKey')
        if not last_key:
            break
    return items

def deser(v):
    if 'S' in v: return v['S']
    if 'N' in v: return float(v['N']) if '.' in str(v['N']) else int(v['N'])
    if 'BOOL' in v: return v['BOOL']
    if 'L' in v: return [deser(i) for i in v['L']]
    if 'M' in v: return {k: deser(vv) for k, vv in v['M'].items()}
    if 'NULL' in v: return None
    return None

print(f"{'[DRY RUN] ' if DRY_RUN else ''}explanation 先頭「正解：」削除スクリプト")
print("DynamoDB Questions テーブルをスキャン中...")

items_raw = scan_all()
items = [{k: deser(v) for k, v in item.items()} for item in items_raw]
print(f"  取得: {len(items)}件")

targets = []
for item in items:
    qid = item.get('questionId', '')
    exp = item.get('explanation', '')
    if not exp or not exp.startswith('正解：'):
        continue
    new_exp, changed = fix_explanation(exp)
    if changed:
        targets.append((qid, exp, new_exp))

print(f"  対象（正解：で始まる）: {len(targets)}件")

if DRY_RUN:
    print("\n【ドライラン - 最初の5件プレビュー】")
    for qid, old, new in targets[:5]:
        old_preview = repr(old[:80])
        new_preview = repr(new[:80])
        print(f"  {qid}:")
        print(f"    before: {old_preview}")
        print(f"    after : {new_preview}")
    print(f"\n→ --apply を付けて実行すると {len(targets)} 件を更新します")
    sys.exit(0)

print(f"\n更新開始...")
ok, fail = 0, 0
for i, (qid, old, new) in enumerate(targets):
    try:
        aws('dynamodb', 'update-item',
            '--table-name', 'Questions',
            '--key', json.dumps({'questionId': {'S': qid}}),
            '--update-expression', 'SET explanation = :e',
            '--expression-attribute-values', json.dumps({':e': {'S': new}}))
        ok += 1
        if (i + 1) % 50 == 0:
            print(f"  {i+1}/{len(targets)} 処理中...")
    except Exception as e:
        print(f"  ❌ {qid}: {e}")
        fail += 1

print(f"\n完了: 成功={ok} 失敗={fail}")
