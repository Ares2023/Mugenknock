#!/usr/bin/env python3
"""正解の選択肢が「単独で最長」になっている割合を測る（Claude 不要・読み取りのみ）。

01 は「正解を最長にする」指定を約6%の問題にだけ付けている（2026-10-12〜）。モデルは放っておくと
正解を長く書くので、指定と合わせた割合が4択の偶然（25%）前後になるかをこれで確かめ、
01 の `RANDOM % 16 -lt 1` を調整する。目安: 25% を大きく超えるなら指定を減らす（0 にする）、
大きく下回るなら増やす。

使い方:
  measure-answer-length.py [--since YYYY-MM-DD]   既定は直近7日に作られた問題
単一正解の問題だけを数える。選択肢が用語だけ（すべて15字未満）の問題は長さを問わない方針なので除く。
"""
import argparse
import collections
import json
import subprocess
from datetime import date, timedelta

AWS = '/home/yuzuki/local/bin/aws'


def scan():
    out = subprocess.run(
        [AWS, 'dynamodb', 'scan', '--table-name', 'Questions', '--output', 'json',
         '--projection-expression', 'examType, choices, correctAnswerIndices, createdAt'],
        capture_output=True, text=True, check=True).stdout
    items, pos, dec = [], 0, json.JSONDecoder()
    while True:
        s = out.find('{', pos)
        if s == -1:
            break
        try:
            obj, pos = dec.raw_decode(out, s)
        except ValueError:
            break
        items.extend(obj.get('Items', []))
    return items


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--since', default=(date.today() - timedelta(days=7)).isoformat())
    args = ap.parse_args()
    total, longest = collections.Counter(), collections.Counter()
    for it in scan():
        if (it.get('createdAt', {}).get('S') or '') < args.since:
            continue
        choices = [c.get('S', '') for c in it.get('choices', {}).get('L', [])]
        idx = [int(x['N']) for x in it.get('correctAnswerIndices', {}).get('L', [])]
        if len(idx) != 1 or not choices or not (0 <= idx[0] < len(choices)):
            continue
        lens = [len(c) for c in choices]
        if max(lens) < 15:
            continue
        exam = it.get('examType', {}).get('S', '?')
        total[exam] += 1
        if lens[idx[0]] == max(lens) and lens.count(max(lens)) == 1:
            longest[exam] += 1
    n, k = sum(total.values()), sum(longest.values())
    if not n:
        print(f'{args.since} 以降の対象問題はありません')
        return
    print(f'{args.since} 以降: 単一正解 {n}問のうち正解が単独最長 {k}問（{k / n:.0%}、4択の偶然は25%）')
    for e in sorted(total, key=lambda e: -total[e]):
        print(f'  {e}: {longest[e]}/{total[e]}（{longest[e] / total[e]:.0%}）')


if __name__ == '__main__':
    main()
