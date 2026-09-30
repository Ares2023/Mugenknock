#!/bin/bash
# 未確認問題（validityCheckedAt なし）のメタデータ欠落を静的検出＋LLMで修正するスクリプト。
#
# 対象の問題:
#   A. isMultiple 不整合  — correctAnswerIndices の長さと isMultiple フラグが食い違う
#                          （静的に 100% 検出可能。LLM 不要）
#   B. domain 欠落        — domain フィールドが未設定。問題文を読んでドメイン分類が必要
#                          （LLM に分類させる。既定は haiku、精度不足なら --model で上書き）
#
# 意図: 02-check-validity.sh の前処理として実行し、Claude 高コストの妥当性チェックに
#       ドメイン欠落・isMultiple 誤りの指摘を混ぜないようにする。
#
# 使い方:
#   ./fix-metadata-unverified.sh           # dry-run (表示のみ)
#   ./fix-metadata-unverified.sh -i        # 実際に DynamoDB を更新
#   ./fix-metadata-unverified.sh -e AIB    # 特定 examType に絞り込み
#   ./fix-metadata-unverified.sh -m sonnet # LLM モデルを変更（既定: haiku）
#   ./fix-metadata-unverified.sh -c 8      # domain 分類チャンクサイズ（既定: 10）

set -uo pipefail
export TZ=Asia/Tokyo
export PATH="/home/yuzuki/local/bin:/home/sera/.config/nvm/versions/node/v20.20.2/bin:$PATH"
unset ANTHROPIC_API_KEY

_d="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
while [ "$(basename "$_d")" != "scripts" ] && [ "$_d" != "/" ]; do _d="$(dirname "$_d")"; done
NIGHT_PROMPTS_DIR="$(dirname "$_d")"
REPO="$(dirname "$(dirname "$NIGHT_PROMPTS_DIR")")"
AWS="${AWS:-/home/yuzuki/local/bin/aws}"
EXAM_DOMAINS_JSON="${REPO}/src/data/examDomains.json"

APPLY=0
EXAM_FILTER=""
MODEL="${FIX_META_MODEL:-haiku}"
CHUNK_SIZE=10

show_help() {
  cat << 'EOF'
usage: fix-metadata-unverified.sh [-i] [-e EXAM] [-m MODEL] [-c N] [-h]

  -i        実際に DynamoDB を更新（省略時は dry-run）
  -e EXAM   examType で絞り込み（例: AIB, AIF）
  -m MODEL  domain 分類に使う claude モデル (default: haiku)
            例: haiku / sonnet / claude-haiku-4-5-20251001
  -c N      domain 分類チャンクサイズ (default: 10)
  -h        このヘルプ

検出・修正対象:
  A. isMultiple 不整合: correctAnswerIndices の長さと isMultiple が食い違う問題
     → 静的に修正（LLM 不要）
  B. domain 欠落: domain フィールドが未設定の問題
     → LLM (--model) が問題文を読んでドメインに分類し設定
EOF
}

while getopts "ie:m:c:h" opt; do
  case "$opt" in
    i) APPLY=1 ;;
    e) EXAM_FILTER="$(echo "$OPTARG" | tr '[:lower:]' '[:upper:]')" ;;
    m) MODEL="$OPTARG" ;;
    c) CHUNK_SIZE="$OPTARG" ;;
    h) show_help; exit 0 ;;
    *) show_help; exit 1 ;;
  esac
done

_find_claude() {
  [ -x /usr/local/bin/claude ] && { echo /usr/local/bin/claude; return; }
  command -v claude 2>/dev/null || true
}
CLAUDE_CMD=$(_find_claude)

echo "=========================================="
echo "未確認問題メタデータ修正 $([ "$APPLY" -eq 1 ] && echo '【更新モード】' || echo '【dry-run】')"
echo "モデル: $MODEL / チャンク: ${CHUNK_SIZE}問${EXAM_FILTER:+ / examType=$EXAM_FILTER}"
echo "=========================================="

# ── 1. DynamoDB から未確認問題を取得 ────────────────────────────
DYNAMO_TMP=$(mktemp /tmp/fix_meta_XXXX.json)
trap 'rm -f "$DYNAMO_TMP"' EXIT

echo "DynamoDB スキャン中..."
if ! "$AWS" dynamodb scan --table-name Questions --output json > "$DYNAMO_TMP" 2>&1; then
  echo "❌ DynamoDB scan 失敗:"; head -5 "$DYNAMO_TMP"; exit 1
fi

# ── 2. Python で解析・分類・修正 ────────────────────────────────
APPLY_FLAG="$APPLY" EXAM_FILTER="$EXAM_FILTER" MODEL="$MODEL" \
  CHUNK_SIZE="$CHUNK_SIZE" CLAUDE_CMD="${CLAUDE_CMD:-}" \
  AWS_CMD="$AWS" EXAM_DOMAINS_JSON="$EXAM_DOMAINS_JSON" \
  python3 - "$DYNAMO_TMP" << 'PYEOF'
import sys, os, json, subprocess, textwrap, re
from collections import defaultdict

DYNAMO_TMP  = sys.argv[1]
APPLY       = os.environ.get('APPLY_FLAG', '0') == '1'
EXAM_FILTER = os.environ.get('EXAM_FILTER', '').strip()
MODEL       = os.environ.get('MODEL', 'haiku')
CHUNK_SIZE  = int(os.environ.get('CHUNK_SIZE', '10'))
CLAUDE_CMD  = os.environ.get('CLAUDE_CMD', '')
AWS_CMD     = os.environ.get('AWS_CMD', '/home/yuzuki/local/bin/aws')
DOMAINS_PATH= os.environ.get('EXAM_DOMAINS_JSON', '')

AWS_EXAM_TYPES = {
    'CLF','AIF','AIB','SAA','DVA','SOA','DEA','MLA','SAP','DOP','AIP','ANS','SCS',
    'ML','DB','NW','SEC'
}

# examDomains.json を読み込む
EXAM_DOMAINS: dict[str, list[str]] = {}
if os.path.isfile(DOMAINS_PATH):
    with open(DOMAINS_PATH) as f:
        raw = json.load(f)
    for exam, doms in raw.items():
        if isinstance(doms, list):
            EXAM_DOMAINS[exam] = [d['ja'] if isinstance(d, dict) else d for d in doms]

def deser(v):
    if 'S' in v: return v['S']
    if 'N' in v: return int(v['N']) if '.' not in v['N'] else float(v['N'])
    if 'BOOL' in v: return v['BOOL']
    if 'NULL' in v: return None
    if 'L' in v: return [deser(i) for i in v['L']]
    if 'M' in v: return {k: deser(vv) for k, vv in v['M'].items()}
    return None

with open(DYNAMO_TMP) as f:
    data = json.load(f)

all_qs = []
for item in data.get('Items', []):
    et = item.get('examType', {}).get('S', '')
    if et not in AWS_EXAM_TYPES:
        continue
    if EXAM_FILTER and et != EXAM_FILTER:
        continue
    q = {k: deser(v) for k, v in item.items()}
    if q.get('validityCheckedAt'):
        continue
    if q.get('isHidden'):
        continue
    if not q.get('questionText') or not q.get('choices'):
        continue
    all_qs.append(q)

print(f"\n対象未確認問題: {len(all_qs)} 件\n")

# ────────────────────────────────────────────────
# A. isMultiple 不整合の静的チェック
# ────────────────────────────────────────────────
print("── A. isMultiple 不整合（静的チェック）──")
multiple_fixes: list[dict] = []
for q in all_qs:
    qid  = q['questionId']
    ci   = q.get('correctAnswerIndices') or []
    expected_multi = len(ci) > 1
    actual_multi   = q.get('isMultiple', False)
    if expected_multi != actual_multi:
        multiple_fixes.append({
            'questionId': qid,
            'examType':   q.get('examType', ''),
            'from':       actual_multi,
            'to':         expected_multi,
            'ci_len':     len(ci),
        })

if not multiple_fixes:
    print("  不整合なし\n")
else:
    for fix in multiple_fixes:
        flag = '✅ 修正' if APPLY else '📋 検出'
        print(f"  {flag}  {fix['questionId']}  isMultiple: {fix['from']} → {fix['to']}"
              f"  (correctAnswerIndices: {fix['ci_len']}件)")
    print(f"  計 {len(multiple_fixes)} 件\n")

# A. isMultiple を DynamoDB に書き込む
if APPLY and multiple_fixes:
    ok_a, ng_a = 0, 0
    for fix in multiple_fixes:
        val = 'TRUE' if fix['to'] else 'FALSE'
        cmd = [AWS_CMD, 'dynamodb', 'update-item',
               '--table-name', 'Questions',
               '--key', json.dumps({'questionId': {'S': fix['questionId']}}),
               '--update-expression', 'SET isMultiple = :im',
               '--expression-attribute-values', json.dumps({':im': {'BOOL': fix['to']}}),
               '--output', 'json']
        r = subprocess.run(cmd, capture_output=True, text=True)
        if r.returncode == 0:
            ok_a += 1
            print(f"  ✅ 更新: {fix['questionId']}  isMultiple={fix['to']}")
        else:
            ng_a += 1
            print(f"  ❌ 失敗: {fix['questionId']}\n     {r.stderr.strip()[:120]}")
    print(f"  A: 更新 {ok_a}/{len(multiple_fixes)} 件\n")

# ────────────────────────────────────────────────
# B. domain 欠落のチェック
# ────────────────────────────────────────────────
print("── B. domain 欠落（LLM 分類）──")
no_domain = [q for q in all_qs if q.get('domain') is None]

# domain がある examType のみ対象（域リストが定義されていないものは除外）
classifiable = [q for q in no_domain if q.get('examType', '') in EXAM_DOMAINS]
unclassifiable = [q for q in no_domain if q.get('examType', '') not in EXAM_DOMAINS]

if unclassifiable:
    print(f"  ⚠️  domain リスト未定義の examType をスキップ: "
          + ', '.join(set(q['examType'] for q in unclassifiable)))

if not classifiable:
    print("  domain 欠落なし（または全件スキップ済み）\n")
else:
    print(f"  domain 欠落: {len(classifiable)} 件 → LLM ({MODEL}) で分類します\n")
    if not CLAUDE_CMD:
        print("  ❌ claude コマンドが見つかりません。スキップ。")
        sys.exit(0)

    # チャンクに分けて処理
    chunks = [classifiable[i:i+CHUNK_SIZE] for i in range(0, len(classifiable), CHUNK_SIZE)]
    domain_results: dict[str, int] = {}   # questionId -> domain index

    for ci_idx, chunk in enumerate(chunks):
        exam = chunk[0].get('examType', '')
        doms = EXAM_DOMAINS.get(exam, [])
        dom_list = '\n'.join(f"  {i}: {d}" for i, d in enumerate(doms))
        # チャンク内に複数の examType が混在する可能性があるので examType ごとに整理
        by_exam: dict[str, list] = defaultdict(list)
        for q in chunk:
            by_exam[q.get('examType', '')].append(q)

        for et, qs_chunk in by_exam.items():
            doms_et = EXAM_DOMAINS.get(et, [])
            if not doms_et:
                continue
            dom_list_et = '\n'.join(f"  {i}: {d}" for i, d in enumerate(doms_et))

            # 問題リスト（questionText + choices を短縮して渡す）
            q_lines = []
            for q in qs_chunk:
                txt = (q.get('questionText') or '')[:200]
                ch  = '、'.join((q.get('choices') or [])[:4])[:120]
                q_lines.append(f'- id: {q["questionId"]}\n  問題: {txt}\n  選択肢: {ch}')
            q_block = '\n'.join(q_lines)

            prompt = textwrap.dedent(f"""\
                以下の AWS 認定 {et} 試験の問題リストについて、各問題が属するドメインのインデックスを判定してください。

                ドメイン定義:
                {dom_list_et}

                問題リスト:
                {q_block}

                回答は必ず以下の JSON 形式のみで返してください（説明不要）:
                {{"results":[{{"id":"<questionId>","domain":<0-{len(doms_et)-1}>}},...]}}\
            """)

            print(f"  chunk {ci_idx+1}/{len(chunks)} ({et} {len(qs_chunk)}問) 分類中...", flush=True)

            try:
                result = subprocess.run(
                    [CLAUDE_CMD, '--dangerously-skip-permissions',
                     '--model', MODEL, '-p', prompt],
                    capture_output=True, text=True, timeout=120
                )
                raw_out = result.stdout.strip()
                # JSON 部分を抽出（前後の余分なテキストを除去）
                m = re.search(r'\{.*\}', raw_out, re.DOTALL)
                if not m:
                    print(f"  ⚠️  JSON 解析失敗 chunk {ci_idx+1}: {raw_out[:100]}")
                    continue
                parsed = json.loads(m.group())
                for item in parsed.get('results', []):
                    qid  = item.get('id', '')
                    didx = item.get('domain')
                    if qid and isinstance(didx, int) and 0 <= didx < len(doms_et):
                        domain_results[qid] = didx
                        dom_name = doms_et[didx]
                        print(f"    {qid}  → {didx}: {dom_name}")
                    else:
                        print(f"    ⚠️  不正値: id={qid} domain={didx}")
            except subprocess.TimeoutExpired:
                print(f"  ⚠️  タイムアウト chunk {ci_idx+1}")
            except Exception as e:
                print(f"  ⚠️  例外 chunk {ci_idx+1}: {e}")

    print(f"\n  分類完了: {len(domain_results)}/{len(classifiable)} 件\n")

    # B. domain を DynamoDB に書き込む
    if APPLY and domain_results:
        ok_b, ng_b = 0, 0
        for qid, didx in domain_results.items():
            cmd = [AWS_CMD, 'dynamodb', 'update-item',
                   '--table-name', 'Questions',
                   '--key', json.dumps({'questionId': {'S': qid}}),
                   '--update-expression', 'SET #d = :di',
                   '--expression-attribute-names', '{"#d": "domain"}',
                   '--expression-attribute-values', json.dumps({':di': {'N': str(didx)}}),
                   '--output', 'json']
            r = subprocess.run(cmd, capture_output=True, text=True)
            if r.returncode == 0:
                ok_b += 1
            else:
                ng_b += 1
                print(f"  ❌ 更新失敗: {qid}\n     {r.stderr.strip()[:120]}")
        print(f"  B: 更新 {ok_b}/{len(domain_results)} 件\n")
    elif not APPLY and domain_results:
        print(f"  （dry-run: -i を付けると {len(domain_results)} 件を更新します）\n")

# ────────────────────────────────────────────────
# 最終サマリー
# ────────────────────────────────────────────────
print("==========================================")
a_cnt = len(multiple_fixes)
b_cnt = len(classifiable)
if APPLY:
    print(f"完了: isMultiple {a_cnt} 件修正 / domain {b_cnt} 件分類・更新")
else:
    print(f"dry-run 完了: isMultiple {a_cnt} 件検出 / domain {b_cnt} 件分類対象")
    print("  → -i を付けて実行すると DynamoDB を更新します")
print("==========================================")
PYEOF
