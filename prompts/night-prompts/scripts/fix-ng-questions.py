#!/usr/bin/env python3
"""監査(audit-questions.sh)で verdict=ng と判定された問題を、指摘に基づいてDB修正する。

audit は本来レポート専用だが、「監査で見つかった不備は問題修正まで対応する」方針に基づき、
ng 問題だけをこのスクリプトで修正する。02-check-validity と同じ整合性ガードを踏襲:
  - 修正後の correctAnswers が全て choices に完全一致で解決できなければ choices/正解の変更を破棄
  - correctAnswerIndices を再計算（アプリは indices が正準）
  - 正解が最長選択肢になる修正は破棄（ヒント漏れ防止）
  - 正解/選択肢が変わったら globalAttempts/globalCorrect をリセット
  - validityEditLog に記録・updatedAt/validityCheckedAt を更新
致命的で修正不能なら delete。判断がつかなければ keep（validityCheckedAt をクリアし 02 の再検査に回す）。

usage: fix-ng-questions.py <results.json> <claude_cmd>
"""
import json, os, re, sys, subprocess, tempfile
from datetime import datetime, timezone

AWS = 'aws'
_label_re = re.compile(r'^[A-E][.\s:：]\s*')


def deser(v):
    if 'S' in v: return v['S']
    if 'N' in v: return float(v['N']) if '.' in v['N'] else int(v['N'])
    if 'BOOL' in v: return v['BOOL']
    if 'L' in v: return [deser(i) for i in v['L']]
    if 'M' in v: return {k: deser(vv) for k, vv in v['M'].items()}
    return None


def fetch_question(qid):
    r = subprocess.run([AWS, 'dynamodb', 'get-item', '--table-name', 'Questions',
                        '--key', json.dumps({'questionId': {'S': qid}}), '--output', 'json'],
                       capture_output=True, text=True)
    if r.returncode != 0 or not r.stdout.strip():
        return None
    item = json.loads(r.stdout).get('Item')
    return {k: deser(v) for k, v in item.items()} if item else None


def ask_fix(claude_cmd, q, issues):
    """ng問題1件をClaudeに渡し、修正案を得る。WebFetchで事実の裏取り可。"""
    choices = q.get('choices', [])
    lines = [
        'あなたはAWS認定試験の問題を修正する担当者です。以下は監査で「要修正(ng)」と判定された問題です。',
        '監査の指摘を踏まえ、事実誤り・破綻を修正してください。',
        '- AIモデルの能力(画像入力の可否・コンテキスト長)、廃止/現行サービス、数値仕様など、確信が持てない事実は WebFetch で AWS 公式を確認してよい（最大3回）。',
        '- 正解が別の選択肢なら correctAnswers を正しい選択肢テキスト(choices内と完全一致)にし、explanation と choiceExplanations も整合させる。',
        '- 選択肢自体が誤っている場合は choices を修正してよい（correctAnswers も必ず整合させる）。',
        '- 正解が選択肢に存在しない等、修正不能な致命的破綻は action=delete。',
        '- 監査の指摘が難易度・体裁のみで事実の誤りが無い場合は action=keep（無理に作り変えない）。',
        '',
        '【出力】JSONのみ: {"action":"fix|delete|keep","reason":"...","fix":{"questionText":"(変更時のみ)","choices":[...],"correctAnswers":["choices内の完全一致テキスト"],"explanation":"...","choiceExplanations":[...]}}',
        '',
        '【監査の指摘】', ' / '.join(issues) or '(詳細なし)',
        '',
        f"ID: {q.get('questionId','')}  試験: {q.get('examType','')}",
        f"問題文: {q.get('questionText','')}",
        '選択肢:',
    ]
    for i, c in enumerate(choices):
        mark = '★正解' if i in (q.get('correctAnswerIndices') or []) else ''
        lines.append(f"  [{i}]{mark} {c}")
    lines.append(f"正解(correctAnswers): {q.get('correctAnswers', [])}")
    lines.append(f"解説: {q.get('explanation','')}")
    ce = q.get('choiceExplanations') or []
    if ce:
        lines.append('選択肢別解説:')
        for i, e in enumerate(ce):
            lines.append(f"  [{i}] {e}")

    with tempfile.NamedTemporaryFile('w', suffix='.txt', delete=False) as f:
        f.write('\n'.join(lines))
        pf = f.name
    # timeout 必須: 応答が返らないまま claude がハングすると、この1問で夜間バッチ全体が
    # 止まる（実際に11時間ブロックした事例あり）。落ちた分は None を返して次へ進める。
    try:
        with open(pf) as inp:
            r = subprocess.run([claude_cmd, '-p', '--model', 'sonnet', '--tools', 'WebFetch',
                                '--allowed-tools', 'WebFetch'], stdin=inp, capture_output=True, text=True,
                               timeout=int(os.environ.get('CLAUDE_TIMEOUT', '1800')))
    except subprocess.TimeoutExpired:
        print('  ⚠️ claude 応答タイムアウト。この問題はスキップします', flush=True)
        return None
    finally:
        os.unlink(pf)
    txt = r.stdout
    m = re.search(r'\{.*\}', txt, re.DOTALL)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except Exception:
        # コードブロック等を除去して再試行
        t = re.sub(r'^```(?:json)?|```$', '', txt.strip(), flags=re.MULTILINE)
        m2 = re.search(r'\{.*\}', t, re.DOTALL)
        try:
            return json.loads(m2.group(0)) if m2 else None
        except Exception:
            return None


def apply_fix(qid, orig, res):
    now = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    action = (res or {}).get('action', 'keep')
    reason = (res or {}).get('reason', '')

    if action == 'delete':
        subprocess.run([AWS, 'dynamodb', 'delete-item', '--table-name', 'Questions',
                        '--key', json.dumps({'questionId': {'S': qid}})], capture_output=True)
        return ('delete', reason)

    if action != 'fix':
        # keep: 事実の誤りが無いと判断した。validityCheckedAt は消さない。
        #
        # 以前はここで REMOVE して 02 の再検査に回していたが、02 と監査は無限に
        # 押し付け合う（監査が「易しすぎ・体裁」で NG → ここが「事実誤りなし」で keep
        # → 確認済みを解除 → 02 が「事実として正しい」で ok を付け直す → 監査がまた NG）。
        # 難易度や体裁の指摘はどちらのスクリプトも解消できないため、再検査に回しても
        # 同じ結論に戻るだけで、その間その問題は「未確認」に見え続ける。
        # 事実誤りが無いと判断できた時点で妥当性の確認自体は済んでいるので確認済みのまま残す。
        return ('skip', reason)

    fix = res.get('fix', {}) or {}
    stripped_ca = [_label_re.sub('', str(c)).strip() for c in (fix.get('correctAnswers') or [])]
    eff_choices = fix.get('choices') or orig.get('choices', [])
    eff_ca = stripped_ca or orig.get('correctAnswers', [])

    # 整合性ガード: correctAnswers が全て choices に解決できなければ choices/正解/選択肢解説の変更を破棄
    if (fix.get('choices') or stripped_ca) and not (eff_ca and all(ca in eff_choices for ca in eff_ca)):
        return ('skip', '正解がchoicesに解決できず変更破棄: ' + reason)

    update_parts, expr_values, changes = ['updatedAt = :u', 'validityEditLog = :log', 'validityCheckedAt = :t'], {':u': {'S': now}, ':t': {'S': now}}, {}

    if fix.get('questionText') and fix['questionText'] != orig.get('questionText'):
        update_parts.append('questionText = :qt'); expr_values[':qt'] = {'S': fix['questionText']}
        changes['questionText'] = True
    if fix.get('choices') and fix['choices'] != orig.get('choices'):
        update_parts.append('choices = :ch'); expr_values[':ch'] = {'L': [{'S': str(c)} for c in fix['choices']]}
        changes['choices'] = True
    if stripped_ca and stripped_ca != orig.get('correctAnswers'):
        update_parts.append('correctAnswers = :ca'); expr_values[':ca'] = {'L': [{'S': c} for c in stripped_ca]}
        changes['correctAnswers'] = True
    if fix.get('explanation') and fix['explanation'] != orig.get('explanation'):
        update_parts.append('explanation = :ex'); expr_values[':ex'] = {'S': fix['explanation']}
    if fix.get('choiceExplanations') and len(fix['choiceExplanations']) == len(eff_choices) and fix['choiceExplanations'] != orig.get('choiceExplanations'):
        update_parts.append('choiceExplanations = :ce'); expr_values[':ce'] = {'L': [{'S': str(c)} for c in fix['choiceExplanations']]}

    # correctAnswerIndices を再計算（indices が正準）
    if stripped_ca or fix.get('choices'):
        try:
            indices = [eff_choices.index(ca) for ca in eff_ca]
        except ValueError:
            return ('skip', 'indices再計算失敗: ' + reason)
        update_parts.append('correctAnswerIndices = :ci'); expr_values[':ci'] = {'L': [{'N': str(i)} for i in indices]}

    # 正解が最長選択肢になる修正は破棄（文字数で正解が推測できるのを防ぐ）
    if 'choices' in changes or 'correctAnswers' in changes:
        corr_lens = [len(str(c)) for c in eff_choices if c in eff_ca]
        inc_lens = [len(str(c)) for c in eff_choices if c not in eff_ca]
        if corr_lens and inc_lens and max(corr_lens) > max(inc_lens):
            return ('skip', '修正後に正解が最長選択肢になるため破棄: ' + reason)

    if len(update_parts) <= 3:  # 実質変更なし
        return ('skip', '有効な変更なし: ' + reason)

    remove_expr = ''
    if 'choices' in changes or 'correctAnswers' in changes:
        remove_expr = ' REMOVE globalAttempts, globalCorrect'  # 正答率カウンタをリセット
    expr_values[':log'] = {'S': json.dumps({'action': 'fixed', 'checkedAt': now, 'reason': reason, 'source': 'audit-ng-fix', 'changes': list(changes.keys())}, ensure_ascii=False)}
    subprocess.run([AWS, 'dynamodb', 'update-item', '--table-name', 'Questions',
                    '--key', json.dumps({'questionId': {'S': qid}}),
                    '--update-expression', f"SET {', '.join(update_parts)}{remove_expr}",
                    '--expression-attribute-values', json.dumps(expr_values, ensure_ascii=False)],
                   capture_output=True)
    return ('fix', reason + ' → 変更: ' + ', '.join(changes.keys()))


def main():
    if len(sys.argv) < 3:
        print('usage: fix-ng-questions.py <results.json> <claude_cmd>'); sys.exit(1)
    results_path, claude_cmd = sys.argv[1], sys.argv[2]
    rs = json.load(open(results_path))
    ng = [r for r in rs if r.get('verdict') == 'ng']
    if not ng:
        print('  ng 判定の問題はありません。修正対象なし。')
        return
    print(f"  ng 判定 {len(ng)}問 をDB修正します...")
    counts = {'fix': 0, 'delete': 0, 'recheck': 0, 'skip': 0, 'error': 0}
    for r in ng:
        qid = r.get('questionId', '')
        q = fetch_question(qid)
        if not q:
            print(f"    ⚠️ {qid}: 取得失敗（削除済み?）"); counts['error'] += 1; continue
        res = ask_fix(claude_cmd, q, r.get('issues', []))
        if res is None:
            # 修正案が得られない → 再検査に回す
            subprocess.run([AWS, 'dynamodb', 'update-item', '--table-name', 'Questions',
                            '--key', json.dumps({'questionId': {'S': qid}}),
                            '--update-expression', 'REMOVE validityCheckedAt'], capture_output=True)
            print(f"    ⚠️ {qid}: 修正案なし → 再検査キューへ"); counts['recheck'] += 1; continue
        kind, msg = apply_fix(qid, q, res)
        counts[kind] = counts.get(kind, 0) + 1
        icon = {'fix': '🔧', 'delete': '🗑️', 'recheck': '🔁', 'skip': '➖'}.get(kind, '?')
        print(f"    {icon} {qid}: {msg[:160]}")
    print(f"  → 修正={counts['fix']} 削除={counts['delete']} 再検査={counts['recheck']} 見送り={counts['skip']} 失敗={counts['error']}")


if __name__ == '__main__':
    main()
