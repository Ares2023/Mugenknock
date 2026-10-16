#!/usr/bin/env python3
"""生成済み <EXAM>.json の形式・品質ルールを検査する。使い方: python3 validate.py [EXAM ...]"""
import json, re, sys, pathlib, collections

HERE = pathlib.Path(__file__).resolve().parent
DOMAINS = json.load(open(HERE / '../../../src/data/examDomains.json', encoding='utf-8'))
TARGET = {
    'DB':  [18, 22, 20, 15, 15, 10],
    'AIB': [24, 28, 24, 24],
    'SEC': [20, 20, 18, 16, 14, 12],
    'ML':  [15, 20, 20, 20, 15, 10],
    'NW':  [18, 20, 18, 14, 15, 15],
}
LABEL = re.compile(r'^[A-E][.\s]\s*')
LETTER_REF = re.compile(r'選択肢\s*[A-E1-5０-９]|[（(][A-E][）)]で|\b[A-E]は')

def check(exam):
    f = HERE / f'{exam}.json'
    qs = json.load(open(f, encoding='utf-8'))
    names = [d['ja'] for d in DOMAINS[exam]]
    errs, warns = [], []
    dom = collections.Counter(q['domain'] for q in qs)
    for i, n in enumerate(names):
        if dom.get(n, 0) != TARGET[exam][i]:
            warns.append(f'ドメイン配分 {n}: {dom.get(n,0)} (目標{TARGET[exam][i]})')
    seen = set(); longest = 0; single = 0; pos = collections.Counter()
    for k, q in enumerate(qs):
        tag = f'#{k+1}'
        if q['examType'] != exam: errs.append(f'{tag} examType')
        if q['domain'] not in names: errs.append(f'{tag} domain不正 {q["domain"]}')
        ch, ci, ce = q['choices'], q['correctAnswerIndices'], q['choiceExplanations']
        n = len(ch)
        if q['isMultiple']:
            if n != 5 or len(ci) != 2: errs.append(f'{tag} 複数正解は5択2正解')
        else:
            if n != 4 or len(ci) != 1: errs.append(f'{tag} 単一正解は4択1正解')
        if len(ce) != n: errs.append(f'{tag} choiceExplanations数')
        if len(set(ch)) != n: errs.append(f'{tag} 選択肢重複')
        if any(LABEL.match(c) for c in ch): errs.append(f'{tag} 選択肢にラベル接頭辞')
        if len(q['explanation']) > 120: errs.append(f'{tag} explanation {len(q["explanation"])}字>120')
        if q['explanation'].startswith('正解'): errs.append(f'{tag} explanationが「正解」始まり')
        for j, e in enumerate(ce):
            if len(e) > 80: errs.append(f'{tag} choiceExplanations[{j}] {len(e)}字>80')
            if re.match(r'^(正解|不正解)です', e): errs.append(f'{tag} choiceExplanations[{j}]判定文')
        if len(set(ce)) != len(ce): errs.append(f'{tag} choiceExplanations重複')
        for t in [q['explanation']] + ce:
            if LETTER_REF.search(t): errs.append(f'{tag} 選択肢をレター参照: {t[:25]}')
        key = re.sub(r'\s', '', q['questionText'])[:40]
        if key in seen: errs.append(f'{tag} 問題文先頭40字が重複')
        seen.add(key)
        if not q['isMultiple']:
            single += 1; pos[ci[0]] += 1
            lens = [len(c) for c in ch]
            if lens[ci[0]] > max(l for j, l in enumerate(lens) if j != ci[0]): longest += 1
            others = [l for j, l in enumerate(lens) if j != ci[0]]
            if lens[ci[0]] > 1.5 * (sum(others) / len(others)): warns.append(f'{tag} 正解が不正解平均の1.5倍超')
    if single:
        r = longest / single
        if not 0.10 <= r <= 0.35: warns.append(f'正解が最長の割合 {r:.0%}（目安20〜25%）')
    multi = sum(q['isMultiple'] for q in qs)
    print(f'== {exam}: {len(qs)}問 (複数正解{multi}) 正解位置{dict(sorted(pos.items()))} 最長正解{longest}/{single}')
    for w in warns: print('  WARN', w)
    for e in errs: print('  ERR ', e)
    return len(errs)

if __name__ == '__main__':
    bad = sum(check(e) for e in (sys.argv[1:] or ['DB', 'AIB', 'SEC', 'ML', 'NW']))
    sys.exit(1 if bad else 0)
