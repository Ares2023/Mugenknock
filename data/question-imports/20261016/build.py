#!/usr/bin/env python3
"""src/<EXAM>/*.json（作問用の簡易形式）→ 管理画面「問題追加」用の <EXAM>.json を生成する。

簡易形式（配列）: {"d": ドメインindex, "q": 問題文, "a": [正解...], "w": [不正解...],
                  "ea": [正解の解説...], "ew": [不正解の解説...], "x": 全体解説}
choices は a+w を再現可能なシャッフルで並べ替え、choiceExplanations も同じ順に揃える。
使い方: python3 build.py [EXAM ...]   （省略時は全資格）
"""
import json, random, sys, hashlib, pathlib

HERE = pathlib.Path(__file__).resolve().parent
DOMAINS = json.load(open(HERE / '../../../src/data/examDomains.json', encoding='utf-8'))

def build(exam):
    names = [d['ja'] for d in DOMAINS[exam]]
    items = []
    for f in sorted((HERE / 'src' / exam).glob('*.json')):
        items += json.load(open(f, encoding='utf-8'))
    out = []
    used = [0, 0, 0, 0]  # 単一正解の正解位置の使用回数（均等化用）
    for it in items:
        a, w, ea, ew = it['a'], it['w'], it['ea'], it['ew']
        assert len(a) == len(ea) and len(w) == len(ew), it['q'][:30]
        pairs = list(zip(a + w, ea + ew, [True] * len(a) + [False] * len(w)))
        seed = int(hashlib.sha256((exam + it['q']).encode()).hexdigest()[:12], 16)
        rng = random.Random(seed)
        rng.shuffle(pairs)
        if len(a) == 1:
            # 正解位置を、これまで最も使われていない位置へ寄せる（位置の偏りでヒントを与えない）
            cur = next(i for i, p in enumerate(pairs) if p[2])
            low = min(used)
            cands = [i for i in range(4) if used[i] == low]
            tgt = cur if cur in cands else rng.choice(cands)
            pairs[cur], pairs[tgt] = pairs[tgt], pairs[cur]
            used[tgt] += 1
        out.append({
            'examType': exam,
            'domain': names[it['d']],
            'questionText': it['q'],
            'choices': [p[0] for p in pairs],
            'correctAnswerIndices': [i for i, p in enumerate(pairs) if p[2]],
            'explanation': it['x'],
            'choiceExplanations': [p[1] for p in pairs],
            'isMultiple': len(a) > 1,
        })
    json.dump(out, open(HERE / f'{exam}.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    print(f'{exam}: {len(out)}問 -> {exam}.json')

if __name__ == '__main__':
    for e in (sys.argv[1:] or ['DB', 'AIB', 'SEC', 'ML', 'NW']):
        build(e)
