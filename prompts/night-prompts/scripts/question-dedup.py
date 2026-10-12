#!/usr/bin/env python3
"""問題生成(01)の重複対策ヘルパー。Claude を呼ばない決定的な処理だけを持つ。

背景（2026-10-12 調査）:
  01 は既存問題をプロンプトに一切渡さず、2問ずつの独立した呼び出しを同じプロンプトで
  数十回繰り返していた。直近2日の435問のうち DB「SQL・クエリ」60問中16問が NOT EXISTS の
  反結合、「インデックスと性能」96問中19問が同じ複合インデックスの論点で、NW には一字一句
  同じ問題が2問あった。02 は他の問題を見ないので重複は素通りする。

サブコマンド:
  build  RAW EXAM DOMAINS_CSV OUT   DynamoDB query の出力（ページ連結JSON）を軽量な一覧にする
  avoid  EXISTING DOMAIN N          そのドメインの既出の決め手（正解肢）を新しい順に N 件、プロンプト用に出す
  check  EXISTING                   標準入力の取込ペイロードが既存と重複していないか判定する。
                                    重複なら理由を出して終了コード 3。重複でなければ EXISTING に追記して 0。

重複の判定（全5,449問で較正。CLF の完全一致26件・DB の同一論点を拾う。0.1〜0.2 で増える分も目視で同一論点だった）:
  - 問題文の文字3-gram Jaccard >= 0.6（言い回しを変えただけの同一問題）
  - または 正解肢の文字2-gram Jaccard >= 0.8 かつ 正解肢が12文字以上 かつ 問題文 >= 0.1
    （決め手が同じ別シナリオ。「論点の重複回避」ルールが禁じているもの。
      短い用語だけの正解（「Amazon S3」等）は別論点でも一致しうるので対象外）
同じ資格の全ドメインと比較する（ドメインをまたいだ同一問題も重複とみなす）。
"""
import json
import re
import sys

Q_THRESHOLD = 0.6
A_THRESHOLD = 0.8
A_MIN_LEN = 12
A_Q_THRESHOLD = 0.1


def _norm(s):
    return re.sub(r'\s+', '', s or '')


def _grams(s, n):
    s = _norm(s)
    return {s[i:i + n] for i in range(len(s) - n + 1)}


def _jac(a, b):
    return len(a & b) / len(a | b) if a and b else 0.0


def _ddb_val(v):
    if not isinstance(v, dict) or not v:
        return None
    t, x = next(iter(v.items()))
    if t == 'L':
        return [_ddb_val(e) for e in x]
    return x


def build(raw_path, exam, domains_csv, out_path):
    domains = [d.strip() for d in domains_csv.split(',') if d.strip()]
    with open(raw_path, encoding='utf-8') as f:
        content = f.read()
    # AWS CLI はページングした結果を複数の JSON オブジェクトとして連結して出す
    items, pos, dec = [], 0, json.JSONDecoder()
    while True:
        start = content.find('{', pos)
        if start == -1:
            break
        try:
            obj, pos = dec.raw_decode(content, start)
        except ValueError:
            break
        items.extend(obj.get('Items', []))
    out = []
    for it in items:
        dom = ''
        raw_dom = _ddb_val(it.get('domain'))
        try:
            idx = int(raw_dom)
            dom = domains[idx] if 0 <= idx < len(domains) else ''
        except (TypeError, ValueError):
            pass
        out.append({
            'd': dom,
            'q': _ddb_val(it.get('questionText')) or '',
            'a': _ddb_val(it.get('correctAnswers')) or [],
            'c': _ddb_val(it.get('createdAt')) or '',
        })
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False)
    print(len(out))


def avoid(existing_path, domain, n):
    with open(existing_path, encoding='utf-8') as f:
        items = json.load(f)
    rows = sorted((x for x in items if x.get('d') == domain), key=lambda x: x.get('c') or '', reverse=True)
    seen, lines = set(), []
    for x in rows:
        a = ' / '.join(str(s) for s in x.get('a') or []).replace('\n', ' ').strip()
        if not a:
            continue
        a = a[:50]
        if a in seen:
            continue
        seen.add(a)
        lines.append(f'- {a}')
        if len(lines) >= n:
            break
    print('\n'.join(lines))


def _is_dup(cand, other):
    qs = _jac(cand['_q'], other['_q'])
    if qs >= Q_THRESHOLD:
        return f'問題文の類似度 {qs:.2f}'
    if cand['_alen'] >= A_MIN_LEN and other['_alen'] >= A_MIN_LEN and qs >= A_Q_THRESHOLD:
        as_ = _jac(cand['_a'], other['_a'])
        if as_ >= A_THRESHOLD:
            return f'正解肢の類似度 {as_:.2f}・問題文 {qs:.2f}'
    return None


def _features(q, answers):
    ans = ' '.join(str(s) for s in answers or [])
    return {'_q': _grams(q, 3), '_a': _grams(ans, 2), '_alen': len(_norm(ans))}


def check(existing_path):
    payload = json.loads(sys.stdin.read())
    q = payload['questions'][0]
    cand = _features(q.get('questionText', ''), q.get('correctAnswers'))
    with open(existing_path, encoding='utf-8') as f:
        items = json.load(f)
    for x in items:
        reason = _is_dup(cand, _features(x.get('q', ''), x.get('a')))
        if reason:
            print(f"{reason}（既出: {_norm(x.get('q'))[:30]}…）")
            sys.exit(3)
    items.append({'d': payload.get('domain', ''), 'q': q.get('questionText', ''),
                  'a': q.get('correctAnswers') or [], 'c': '9999'})  # 今回の生成分は最新扱い
    with open(existing_path, 'w', encoding='utf-8') as f:
        json.dump(items, f, ensure_ascii=False)


if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else ''
    if cmd == 'build' and len(sys.argv) == 6:
        build(*sys.argv[2:6])
    elif cmd == 'avoid' and len(sys.argv) == 5:
        avoid(sys.argv[2], sys.argv[3], int(sys.argv[4]))
    elif cmd == 'check' and len(sys.argv) == 3:
        check(sys.argv[2])
    else:
        sys.stderr.write(__doc__)
        sys.exit(2)
