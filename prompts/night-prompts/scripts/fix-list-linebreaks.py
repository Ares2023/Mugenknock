#!/usr/bin/env python3
"""
fix-list-linebreaks.py
問題文・解説の「列挙改行なし」を検出・修正するスクリプト。

対象パターン:
  [①②③] 同一行に複数の丸数字が連続している（リスト羅列）
  [・]    ・が行頭以外の場所で複数の長い項目を同一行に羅列している（参考報告のみ）

Usage:
  python3 fix-list-linebreaks.py              # dry-run（変更なし、報告のみ）
  python3 fix-list-linebreaks.py --apply      # DynamoDB に書き込み
  python3 fix-list-linebreaks.py --limit N    # 処理件数制限（テスト用）
  python3 fix-list-linebreaks.py --exam SAA   # 特定試験種別のみ

環境変数:
  AWS_REGION  (デフォルト: ap-northeast-1)
"""

import sys
import re
import json
import datetime
import subprocess
import os

# ─── オプション解析 ─────────────────────────────────────────────────────
DRY_RUN = '--apply' not in sys.argv
LIMIT: int | None = None
EXAM_FILTER: str | None = None
for i, a in enumerate(sys.argv):
    if a == '--limit' and i + 1 < len(sys.argv):
        LIMIT = int(sys.argv[i + 1])
    if a == '--exam' and i + 1 < len(sys.argv):
        EXAM_FILTER = sys.argv[i + 1].lower()

AWS_REGION = os.environ.get('AWS_REGION', 'ap-northeast-1')
AWS = '/home/yuzuki/local/bin/aws'
TABLE = 'Questions'

CIRCLES = '①②③④⑤⑥⑦⑧⑨⑩'
CIRCLES_SET = set(CIRCLES)

# 丸数字の直前に来る「参照用」語句（これらに続く丸数字はリスト開始ではない）
REF_SUFFIX_PAT = re.compile(r'[要件条件設定ステップ手順項目フェーズ課題対策パターン方式方法設問問題]$')


# ─── ヘルパー ─────────────────────────────────────────────────────────────

def find_paren_ranges(line: str) -> list[tuple[int, int]]:
    """（）に囲まれた範囲インデックスのリストを返す（ネスト対応）"""
    ranges: list[tuple[int, int]] = []
    depth = 0
    start = -1
    for i, c in enumerate(line):
        if c == '（':
            if depth == 0:
                start = i
            depth += 1
        elif c == '）':
            depth -= 1
            if depth == 0 and start >= 0:
                ranges.append((start, i))
                start = -1
    return ranges


def in_any_range(pos: int, ranges: list[tuple[int, int]]) -> bool:
    return any(s <= pos <= e for s, e in ranges)


# ─── ①②③ 修正 ────────────────────────────────────────────────────────────

def is_list_circle(pos: int, line: str, paren_ranges: list[tuple[int, int]]) -> bool:
    """
    pos にある丸数字が「リスト項目の開始」かどうか判定する。
    以下の場合は参照用とみなして False を返す:
      ・（...）の中にある
      ・直前が参照語句（要件, 条件, 項目, etc.）
    """
    if in_any_range(pos, paren_ranges):
        return False
    prefix = line[max(0, pos - 4):pos]
    if REF_SUFFIX_PAT.search(prefix):
        return False
    return True


def fix_circles(text: str) -> tuple[str, bool]:
    """
    ①②③ リストの改行修正を行う。
    - 同一行に 2 つ以上の「リスト開始」丸数字がある場合、2 番目以降の前に \\n を挿入
    - 最初の丸数字が。や：の直後（mid-sentence）の場合も \\n を挿入
    戻り値: (修正後テキスト, 変更ありフラグ)
    """
    lines = text.split('\n')
    changed = False
    new_lines: list[str] = []

    for line in lines:
        # 丸数字が 2 つ未満なら無条件スキップ
        circle_positions = [i for i, c in enumerate(line) if c in CIRCLES_SET]
        if len(circle_positions) < 2:
            new_lines.append(line)
            continue

        paren_ranges = find_paren_ranges(line)

        # リスト開始として使われている丸数字の位置を抽出
        list_positions = [p for p in circle_positions if is_list_circle(p, line, paren_ranges)]
        if len(list_positions) < 2:
            new_lines.append(line)
            continue

        # 挿入位置を決定
        insert_before: set[int] = set(list_positions[1:])  # 2 番目以降の前

        # 最初の丸数字の前にも \\n を挿入するか（。または：の直後なら入れる）
        first_pos = list_positions[0]
        if first_pos > 0:
            prev_ch = line[first_pos - 1]
            if prev_ch in ('。', '：', ':'):
                insert_before.add(first_pos)

        if not insert_before:
            new_lines.append(line)
            continue

        # 文字を一個ずつ処理して \n を挿入
        chars: list[str] = []
        for i, c in enumerate(line):
            if i in insert_before:
                chars.append('\n')
            chars.append(c)
        new_line = ''.join(chars)

        if new_line != line:
            changed = True
        new_lines.append(new_line)

    return '\n'.join(new_lines), changed


# ─── ・ 検出（参考報告） ──────────────────────────────────────────────────

def detect_bullet_violations(text: str) -> list[str]:
    """
    ・ リスト違反の疑いがある行を報告する（自動修正はしない）。
    検出条件:
      - 行頭が ・ ではない（行頭 ・ は正しいリスト項目行）
      - 同一行に ・ が 2 つ以上あり、各セグメントが 15 文字以上
      - セグメントが動詞・文末形で終わる（=リスト項目らしい）
    """
    violations: list[str] = []
    VERB_END = re.compile(r'(?:すること|ること|できること|ないこと|必要|こと|する|ある|ない)[。」\s]?$')

    for line in text.split('\n'):
        stripped = line.strip()
        if not stripped or stripped.startswith('・'):
            continue
        if stripped.count('・') < 2:
            continue
        parts = stripped.split('・')
        long_segs = [p for p in parts[1:] if len(p.strip()) >= 15]
        if len(long_segs) < 2:
            continue
        last_seg = parts[-1].strip()
        if VERB_END.search(last_seg):
            violations.append(stripped[:120])

    return violations


# ─── DynamoDB ─────────────────────────────────────────────────────────────

def dynamo_scan() -> list[dict]:
    """Questions テーブルを全件スキャン（ページネーション対応）"""
    items: list[dict] = []
    kwargs_base = [
        AWS, 'dynamodb', 'scan',
        '--table-name', TABLE,
        '--projection-expression', 'questionId,questionText,explanation,validityCheckedAt',
        '--region', AWS_REGION,
    ]
    exclusive_key: str | None = None

    while True:
        cmd = kwargs_base[:]
        if exclusive_key:
            cmd += ['--exclusive-start-key', exclusive_key]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        if result.returncode != 0:
            print(f'[ERROR] DynamoDB scan failed: {result.stderr[:200]}', file=sys.stderr)
            break
        data = json.loads(result.stdout)
        items.extend(data.get('Items', []))
        lek = data.get('LastEvaluatedKey')
        if not lek:
            break
        exclusive_key = json.dumps(lek)

    return items


def dynamo_update(question_id: str, updates: dict[str, str]) -> bool:
    """questionText / explanation を DynamoDB に書き込む"""
    expr_parts = []
    attr_names: dict[str, str] = {}
    attr_values: dict[str, dict] = {}

    for i, (field, value) in enumerate(updates.items()):
        placeholder_n = f'#f{i}'
        placeholder_v = f':v{i}'
        expr_parts.append(f'{placeholder_n} = {placeholder_v}')
        attr_names[placeholder_n] = field
        attr_values[placeholder_v] = {'S': value}

    update_expr = 'SET ' + ', '.join(expr_parts)

    cmd = [
        AWS, 'dynamodb', 'update-item',
        '--table-name', TABLE,
        '--key', json.dumps({'questionId': {'S': question_id}}),
        '--update-expression', update_expr,
        '--expression-attribute-names', json.dumps(attr_names),
        '--expression-attribute-values', json.dumps(attr_values),
        '--region', AWS_REGION,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    return result.returncode == 0


# ─── メイン ───────────────────────────────────────────────────────────────

def main():
    print(f"{'[DRY-RUN]' if DRY_RUN else '[APPLY]'} fix-list-linebreaks.py 開始 {datetime.datetime.now().isoformat()[:19]}")
    if EXAM_FILTER:
        print(f"  試験フィルタ: {EXAM_FILTER.upper()}")
    if LIMIT:
        print(f"  処理件数制限: {LIMIT}")
    print()

    items = dynamo_scan()
    print(f"スキャン完了: {len(items)} 件")
    print()

    circle_fixed = 0
    bullet_reported = 0
    total_processed = 0

    for item in items:
        qid: str = item.get('questionId', {}).get('S', '')
        if not qid:
            continue
        if EXAM_FILTER and not qid.startswith(EXAM_FILTER):
            continue

        qt_orig: str = item.get('questionText', {}).get('S', '')
        ex_orig: str = item.get('explanation', {}).get('S', '')

        # ① ②③ 修正
        qt_new, qt_changed = fix_circles(qt_orig)
        ex_new, ex_changed = fix_circles(ex_orig)

        # ・ 違反検出（報告のみ）
        bullet_viols = detect_bullet_violations(qt_orig) + detect_bullet_violations(ex_orig)

        # 何も変化なし・報告なしならスキップ
        if not qt_changed and not ex_changed and not bullet_viols:
            continue

        total_processed += 1
        if LIMIT and total_processed > LIMIT:
            print(f"[LIMIT] {LIMIT} 件に達したので停止")
            break

        if qt_changed or ex_changed:
            circle_fixed += 1
            print(f"[①②FIXED] {qid}")
            if qt_changed:
                # 変更箇所を可視化（改行を ↵ で表示）
                diff_preview = qt_new[:200].replace('\n', '↵')
                print(f"  questionText: {diff_preview}")
            if ex_changed:
                diff_preview = ex_new[:200].replace('\n', '↵')
                print(f"  explanation:  {diff_preview}")

            if not DRY_RUN:
                updates: dict[str, str] = {}
                if qt_changed:
                    updates['questionText'] = qt_new
                if ex_changed:
                    updates['explanation'] = ex_new
                ok = dynamo_update(qid, updates)
                if ok:
                    print(f"  → DynamoDB 更新 OK")
                else:
                    print(f"  → DynamoDB 更新 FAILED", file=sys.stderr)

        if bullet_viols:
            bullet_reported += 1
            print(f"[・REPORT] {qid}")
            for v in bullet_viols[:3]:
                print(f"  {repr(v)}")

    print()
    print(f"=== 結果 ===")
    print(f"  ①② 改行修正: {circle_fixed} 件 {'(dry-run、未書き込み)' if DRY_RUN else '(DynamoDB 更新済み)'}")
    print(f"  ・ 違反報告:  {bullet_reported} 件 (手動確認推奨)")
    print(f"完了 {datetime.datetime.now().isoformat()[:19]}")


if __name__ == '__main__':
    main()
