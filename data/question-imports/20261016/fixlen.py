#!/usr/bin/env python3
"""長さ調整用: (ファイル, 元の文字列の先頭, 新しい文字列) で src の選択肢テキストを置換する補助。"""
import json, sys
def apply(exam, edits):
    for f, prefix, new in edits:
        path = f'src/{exam}/{f}'
        raw = open(path, encoding='utf-8').read()
        data = json.loads(raw)
        olds = [s for q in data for k in ('a', 'w') for s in q[k] if s.startswith(prefix)]
        assert len(olds) == 1, (f, prefix, len(olds))
        assert raw.count(olds[0]) == 1, (f, prefix, 'raw count')
        open(path, 'w', encoding='utf-8').write(raw.replace(olds[0], new))
