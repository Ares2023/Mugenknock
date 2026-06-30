#!/bin/bash
# 問題監査スクリプト（読み取り専用・DBは一切変更しない）
#
# 目的: 生成(01)・正当性チェック(02)スクリプトの「出力品質」を監査しレポートする。
#   生成・確認を通過した問題が、本当に資格模試として妥当かを第三者視点で採点する。
#
# 監査観点:
#   A. 内容: 現行AWSサービスの提供状態として正しいか（古い/誤った情報でないか）、
#            本番相当の難易度・内容か（簡単すぎないか）、出題範囲内か（範囲外でないか）。
#   B. 体裁: 問題文・選択肢・解説が読みやすいか、模試として適切な体裁か。
#
# 各問を verdict = ok / warn / ng で採点し、指摘を集計してレポート出力する。
# 02 と異なり修正・削除は行わない（純粋な監査）。

set -uo pipefail

export PATH="/home/yuzuki/local/bin:/home/sera/.config/nvm/versions/node/v20.20.2/bin:$PATH"
unset ANTHROPIC_API_KEY

_EDR_SD="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd 2>/dev/null || true)"
export EXAM_DOMAINS_JSON_PATH="${EXAM_DOMAINS_JSON_PATH:-${_EDR_SD}/../../../src/data/examDomains.json}"

_find_claude() {
  [ -x /usr/local/bin/claude ] && { echo /usr/local/bin/claude; return; }
  local _cv; _cv=$(command -v claude 2>/dev/null)
  [ -n "$_cv" ] && [ -x "$_cv" ] && { echo "$_cv"; return; }
}
CLAUDE_CMD=$(_find_claude)
if [ -z "${CLAUDE_CMD:-}" ]; then
  echo "⚠️  claude バイナリ未検出。30秒後にリトライします..." >&2
  sleep 30
  CLAUDE_CMD=$(_find_claude)
fi
if [ -z "${CLAUDE_CMD:-}" ] || [ ! -x "${CLAUDE_CMD:-}" ]; then
  echo "❌ claude コマンドが見つかりません" >&2; exit 1
fi

# scripts/ 配下のどの深さに置かれても動作するパス解決
_d="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
while [ "$(basename "$_d")" != "scripts" ] && [ "$_d" != "/" ]; do _d="$(dirname "$_d")"; done
NIGHT_PROMPTS_DIR="$(dirname "$_d")"
INSTRUCTION_DIR="$_d/instructions"
LOG_DIR="$NIGHT_PROMPTS_DIR/logs"
mkdir -p "$LOG_DIR"
DATE=$(date '+%Y%m%d_%H%M%S')
LOG_FILE="$LOG_DIR/audit_${DATE}.log"
RESULTS_FILE="$LOG_DIR/audit_${DATE}.json"

SAMPLE=20
CHUNK_SIZE=5
EXAM_FILTER=""
RANDOM_SAMPLE=0

show_help() {
  cat << 'EOF'
usage: audit-questions.sh [-n N] [-e EXAM] [-r] [-c C] [-h]

  -n N     監査する問題数 (default: 20)
  -e EXAM  資格コードで絞り込み (例: SAA, DEA)。未指定なら全資格
  -r       ランダム抽出（既定は「直近に生成・チェックされた問題」優先）
  -c C     1チャンクあたりの問題数 (default: 5)
  -h       このヘルプ

監査観点:
  A. 内容 — 現行AWS仕様として正しいか / 本番相当の難易度か / 出題範囲内か
  B. 体裁 — 問題・選択肢・解説が読みやすいか / 模試として適切か

  ※ 読み取り専用。DynamoDB は一切変更しない。
  ※ レポートは標準出力 + $LOG_DIR/audit_<日時>.log、生データは audit_<日時>.json
EOF
}

while getopts "n:e:rc:h" opt; do
  case "$opt" in
    n) SAMPLE="$OPTARG" ;;
    e) EXAM_FILTER="$(echo "$OPTARG" | tr '[:lower:]' '[:upper:]')" ;;
    r) RANDOM_SAMPLE=1 ;;
    c) CHUNK_SIZE="$OPTARG" ;;
    h) show_help; exit 0 ;;
    *) show_help; exit 1 ;;
  esac
done

# 公式試験ガイドURLマップ（instructions/*.txt の # EXAM_GUIDE_URL: 行から構築）
EXAM_GUIDE_URLS_JSON=$(INST_DIR="$INSTRUCTION_DIR" python3 << 'PYEOF'
import os, json
inst_dir = os.environ.get('INST_DIR', '')
urls = {}
if inst_dir and os.path.isdir(inst_dir):
    for fname in os.listdir(inst_dir):
        if not fname.endswith('.txt') or fname.startswith('_'):
            continue
        exam = fname[:-4]
        try:
            with open(os.path.join(inst_dir, fname)) as f:
                for line in f:
                    if line.startswith('# EXAM_GUIDE_URL:'):
                        urls[exam] = line.split(':', 1)[1].strip()
                        break
        except Exception:
            pass
print(json.dumps(urls, ensure_ascii=False))
PYEOF
)

{
echo "=========================================="
echo "問題監査 開始: $(date)"
echo "サンプル数: ${SAMPLE}問 / チャンク: ${CHUNK_SIZE}問 / 抽出: $([ "$RANDOM_SAMPLE" -eq 1 ] && echo ランダム || echo 直近優先)${EXAM_FILTER:+ / 資格=$EXAM_FILTER}"
echo "（読み取り専用 — DBは変更しません）"
echo "=========================================="

# ── 1. DynamoDB から問題を取得 ──────────────────────────────────
DYNAMO_TMP=$(mktemp /tmp/audit_dynamo_XXXX.json)
if ! aws dynamodb scan --table-name Questions --output json > "$DYNAMO_TMP" 2>&1; then
  echo "❌ DynamoDB scan 失敗:"; head -5 "$DYNAMO_TMP"; rm -f "$DYNAMO_TMP"; exit 1
fi
if [ ! -s "$DYNAMO_TMP" ]; then
  echo "❌ DynamoDB scan: レスポンスが空です（ネットワーク障害の可能性）"; rm -f "$DYNAMO_TMP"; exit 1
fi

QUESTIONS_JSON=$(SAMPLE=$SAMPLE EXAM_FILTER="$EXAM_FILTER" RANDOM_SAMPLE=$RANDOM_SAMPLE DYNAMO_TMP="$DYNAMO_TMP" python3 << 'PYEOF'
import json, os, sys, random
from datetime import datetime, timezone

AWS_EXAM_TYPES = {'CLF','AIF','SAA','DVA','SOA','DEA','MLA','SAP','DOP','AIP','ANS','SCS'}

with open(os.environ['DYNAMO_TMP']) as f:
    content = f.read()
try:
    data = json.loads(content)
except json.JSONDecodeError as e:
    sys.stderr.write(f"❌ JSON パース失敗: {e}\n"); sys.exit(1)

def deser(v):
    if 'S' in v: return v['S']
    if 'N' in v: return float(v['N']) if '.' in v['N'] else int(v['N'])
    if 'BOOL' in v: return v['BOOL']
    if 'L' in v: return [deser(i) for i in v['L']]
    if 'M' in v: return {k: deser(vv) for k, vv in v['M'].items()}
    return None

exam_filter = os.environ.get('EXAM_FILTER', '').strip()
questions = []
for item in data.get('Items', []):
    et = item.get('examType', {}).get('S', '')
    if et not in AWS_EXAM_TYPES:
        continue
    if exam_filter and et != exam_filter:
        continue
    q = {k: deser(v) for k, v in item.items()}
    if q.get('isHidden'):
        continue
    # 内容が空の壊れた問題は監査対象外（02の削除対象）
    if not q.get('questionText') or not q.get('choices'):
        continue
    questions.append(q)

if not questions:
    print('[]'); sys.exit(0)

n = int(os.environ.get('SAMPLE', 20))
if os.environ.get('RANDOM_SAMPLE') == '1':
    random.shuffle(questions)
    sample = questions[:n]
else:
    # 直近に生成・チェックされた問題を優先（createdAt → updatedAt → validityCheckedAt の新しい順）
    def recency(q):
        for k in ('createdAt', 'updatedAt', 'validityCheckedAt'):
            v = q.get(k)
            if v:
                try:
                    return datetime.fromisoformat(str(v).replace('Z', '+00:00'))
                except Exception:
                    pass
        return datetime(1970, 1, 1, tzinfo=timezone.utc)
    questions.sort(key=recency, reverse=True)
    sample = questions[:n]

print(json.dumps(sample, ensure_ascii=False))
PYEOF
)
rm -f "$DYNAMO_TMP"

COUNT=$(echo "$QUESTIONS_JSON" | python3 -c "import json,sys; print(len(json.load(sys.stdin)))" 2>/dev/null || echo 0)
echo "監査対象: ${COUNT}問"
if [ "$COUNT" -eq 0 ]; then
  echo "対象問題がありません（フィルタ条件を確認してください）"; exit 0
fi

# ── 2. チャンク分割 ──────────────────────────────────────────────
CHUNKS_DIR=$(mktemp -d /tmp/audit_chunks_XXXX)
QUESTIONS_TMP=$(mktemp /tmp/audit_qs_XXXX.json)
echo "$QUESTIONS_JSON" > "$QUESTIONS_TMP"
CHUNK_COUNT=$(QUESTIONS_FILE="$QUESTIONS_TMP" CHUNK_SIZE=$CHUNK_SIZE CHUNKS_DIR="$CHUNKS_DIR" python3 << 'PYEOF'
import json, os
with open(os.environ['QUESTIONS_FILE']) as f:
    qs = json.load(f)
cs = int(os.environ['CHUNK_SIZE'])
for i in range(0, len(qs), cs):
    with open(f"{os.environ['CHUNKS_DIR']}/{i//cs:04d}.json", 'w') as f:
        json.dump(qs[i:i+cs], f, ensure_ascii=False)
print((len(qs) + cs - 1) // cs)
PYEOF
)
rm -f "$QUESTIONS_TMP"
echo "チャンク数: ${CHUNK_COUNT}"
echo ""

# ── 3. チャンクごとに Claude で監査 → 結果を蓄積 ──────────────────
ALL_RESULTS=$(mktemp /tmp/audit_all_XXXX.json)
echo "[]" > "$ALL_RESULTS"
RATE_LIMITED=0

for CHUNK_FILE in "$CHUNKS_DIR"/*.json; do
  CHUNK_IDX=$(basename "$CHUNK_FILE" .json | sed 's/^0*//'); CHUNK_IDX=${CHUNK_IDX:-0}
  N_IN_CHUNK=$(python3 -c "import json;print(len(json.load(open('$CHUNK_FILE'))))" 2>/dev/null || echo 0)
  echo "--- チャンク $((CHUNK_IDX+1))/${CHUNK_COUNT}: ${N_IN_CHUNK}問  開始=$(date +%H:%M:%S) ---"

  PROMPT_FILE=$(mktemp /tmp/audit_prompt_XXXX.txt)
  EXAM_GUIDE_URLS_JSON_ESC="$EXAM_GUIDE_URLS_JSON" python3 - "$CHUNK_FILE" > "$PROMPT_FILE" << 'PYEOF'
import json, os, sys

with open(sys.argv[1]) as f:
    chunk = json.load(f)

# 出題範囲の判断材料として examDomains.json を読む（index → ドメイン名）
exam_domains = {}
try:
    p = os.environ.get('EXAM_DOMAINS_JSON_PATH')
    if p and os.path.isfile(p):
        with open(p) as f:
            exam_domains = {k: [d.get('ja', d) if isinstance(d, dict) else d for d in v]
                            for k, v in json.load(f).items()}
except Exception:
    pass

urls = {}
try:
    urls = json.loads(os.environ.get('EXAM_GUIDE_URLS_JSON_ESC', '{}'))
except Exception:
    pass

HEADER = (
'あなたはAWS認定試験の問題を厳格に評価するベテラン試験作成者です。\n'
'以下は「自動生成 → 正当性チェック」を通過した問題です。これらが資格模試として本当に妥当かを、'
'第三者の監査者として批判的に採点してください。判定は厳しめに。簡単すぎ・古い・範囲外は見逃さないこと。\n'
'\n'
'【監査観点A: 内容】\n'
'- 現行性: 現在のAWSサービスの提供状態・仕様と一致しているか。古い/誤った情報、廃止・名称変更されたサービスを現行として扱っていないか。'
'サービスの現行仕様・上限・課金・推奨構成に少しでも確信が持てない場合は推測せず WebFetch で公式ドキュメント（docs.aws.amazon.com / aws.amazon.com）を確認してから判定すること（確信できる一般的事実は取得不要）。'
'なお CodeCommit は現行サービスであり古い扱いにしないこと。\n'
'- 難易度: 本番の試験問題に近い難易度・内容か。単なる用語の暗記や一読で正解が自明な問題は too_easy。'
'本番はシナリオベースで、もっともらしい不正解（ひっかけ）があり、要件の取捨選択や比較を要する。明らかに簡単すぎる場合は指摘すること。\n'
'- 範囲: 当該資格の出題範囲（ドメイン・対象サービス）に収まっているか。範囲外・別資格向けの内容は out。\n'
'\n'
'【監査観点B: 体裁】\n'
'- 問題文・選択肢・解説が読みやすいか（適切な改行、列挙の整形、冗長や破綻がないか）。\n'
'- 模試として適切な体裁か（選択肢の粒度や文字数バランスが揃い、正解が文字数や書きぶりから推測できないか。解説が各選択肢の正誤理由を述べているか）。\n'
'\n'
'【判定】各問について verdict を付ける:\n'
'- "ok": 本番相当で問題なし\n'
'- "warn": 使用可能だが軽微な難あり（やや易しい/体裁の小さな乱れ等）\n'
'- "ng": 模試として不適切（古い・誤り・範囲外・簡単すぎ・体裁が読みづらい等の重大な問題）\n'
'\n'
'【出力形式】次のJSONのみ。説明文・前置き・コードブロックは不要。\n'
'{"results":[\n'
'  {"questionId":"...","examType":"...","verdict":"ok|warn|ng",'
'"currentness":"ok|outdated|uncertain","difficulty":"appropriate|too_easy|too_hard",'
'"scope":"in|out","format":"ok|hard_to_read","mockSuitable":true,'
'"issues":["具体的な指摘を日本語で簡潔に。問題なければ空配列"]}\n'
']}\n'
'\n'
'【監査対象の問題】'
)

lines = [HEADER]
for i, q in enumerate(chunk, 1):
    exam = q.get('examType', '')
    lines.append(f"\n──── 問題 {i} ────")
    lines.append(f"questionId: {q.get('questionId','')}")
    lines.append(f"examType: {exam}")
    if exam in urls:
        lines.append(f"公式試験ガイド: {urls[exam]}")
    dom = q.get('domain')
    if isinstance(dom, int) and exam in exam_domains and 0 <= dom < len(exam_domains[exam]):
        lines.append(f"出題ドメイン: {exam_domains[exam][dom]}")
    if exam in exam_domains:
        lines.append(f"当該資格の出題ドメイン一覧（範囲判定用）: {' / '.join(exam_domains[exam])}")
    lines.append(f"問題文: {q.get('questionText','')}")
    choices = q.get('choices', []) or []
    lines.append("選択肢:")
    for j, c in enumerate(choices):
        lines.append(f"  [{j}] {c}")
    ca = q.get('correctAnswers') or []
    cai = q.get('correctAnswerIndices')
    lines.append(f"正解: {ca}")
    if cai is not None:
        lines.append(f"正解index: {cai}")
    lines.append(f"isMultiple: {q.get('isMultiple', False)}")
    lines.append(f"解説: {q.get('explanation','')}")
    ce = q.get('choiceExplanations') or []
    if ce:
        lines.append("選択肢別解説:")
        for j, e in enumerate(ce):
            lines.append(f"  [{j}] {e}")
    lines.append("")
print('\n'.join(lines))
PYEOF

  # claude 呼び出し（529 Overloaded は最大2回リトライ、真のレート制限は中断）
  _OVERLOAD_RETRY=0
  _SKIP_CHUNK=0
  while true; do
    _STDOUT_F=$(mktemp /tmp/audit_out_XXXX)
    _STDERR_F=$(mktemp /tmp/audit_err_XXXX)
    "$CLAUDE_CMD" -p --allowed-tools WebFetch < "$PROMPT_FILE" > "$_STDOUT_F" 2> "$_STDERR_F"
    AI_EXIT=$?
    RESULT=$(cat "$_STDOUT_F"); _STDERR=$(cat "$_STDERR_F")
    rm -f "$_STDOUT_F" "$_STDERR_F"

    if [ $AI_EXIT -ne 0 ] && echo "$_STDERR" | grep -q "No such file"; then
      CLAUDE_CMD=$(_find_claude)
      [ -x "${CLAUDE_CMD:-}" ] && RESULT=$("$CLAUDE_CMD" -p --allowed-tools WebFetch < "$PROMPT_FILE" 2>/dev/null)
    fi

    if echo "$_STDERR" | grep -qiE "command not found|GEMINI_API_KEY|API.?key"; then
      rm -f "$PROMPT_FILE"; echo "❌ claude 実行エラー（認証/コマンド）。終了します"; exit 1
    fi

    _RESULT_HEAD=$(echo "$RESULT" | head -3)
    if echo "$_STDERR $_RESULT_HEAD" | grep -qiE "529|Overloaded"; then
      if [ $_OVERLOAD_RETRY -lt 2 ]; then
        _OVERLOAD_RETRY=$(( _OVERLOAD_RETRY + 1 ))
        echo "⚠️  サーバー過負荷（529）。60秒後にリトライ（${_OVERLOAD_RETRY}/2）"; sleep 60; continue
      else
        echo "⚠️  529 が続くためチャンク $((CHUNK_IDX+1)) をスキップ"; _SKIP_CHUNK=1; break
      fi
    fi
    if echo "$_STDERR $_RESULT_HEAD" | grep -qiE "rate.?limit|too many requests|quota exceeded|usage limit|resource_exhausted|session.?limit|hit your"; then
      rm -f "$PROMPT_FILE"; echo "⚠️  レート制限を検出。残りチャンクをスキップ"; RATE_LIMITED=1; break 2
    fi
    break
  done
  rm -f "$PROMPT_FILE"
  [ $_SKIP_CHUNK -eq 1 ] && continue

  # JSON 抽出 → ALL_RESULTS にマージ + チャンク内サマリを表示
  RESULT="$RESULT" ALL_RESULTS="$ALL_RESULTS" python3 << 'PYEOF'
import json, os, sys

raw = os.environ.get('RESULT', '')
dec = json.JSONDecoder()
obj = None
start = raw.find('{')
while start != -1:
    try:
        obj, _ = dec.raw_decode(raw, start)
        if isinstance(obj, dict) and 'results' in obj:
            break
        obj = None
    except json.JSONDecodeError:
        pass
    start = raw.find('{', start + 1)

if not obj or 'results' not in obj:
    print("  ⚠️  監査結果のJSON抽出に失敗（このチャンクをスキップ）", file=sys.stderr)
    sys.exit(0)

results = obj['results']
with open(os.environ['ALL_RESULTS']) as f:
    acc = json.load(f)
acc.extend(results)
with open(os.environ['ALL_RESULTS'], 'w') as f:
    json.dump(acc, f, ensure_ascii=False)

mark = {'ok': '✅', 'warn': '⚠️ ', 'ng': '❌'}
for r in results:
    v = r.get('verdict', '?')
    flags = []
    if r.get('currentness') == 'outdated': flags.append('古い/誤り')
    if r.get('currentness') == 'uncertain': flags.append('要確認')
    if r.get('difficulty') == 'too_easy': flags.append('易しすぎ')
    if r.get('difficulty') == 'too_hard': flags.append('難しすぎ')
    if r.get('scope') == 'out': flags.append('範囲外')
    if r.get('format') == 'hard_to_read': flags.append('体裁')
    if r.get('mockSuitable') is False: flags.append('模試不適')
    tag = (' [' + ','.join(flags) + ']') if flags else ''
    issue = ('  ' + ' / '.join(r.get('issues', []))) if v != 'ok' and r.get('issues') else ''
    print(f"  {mark.get(v,'?')} {r.get('questionId','?')} ({r.get('examType','?')}){tag}{issue}")
PYEOF
  echo "  終了=$(date +%H:%M:%S)"
  echo ""
done
rm -rf "$CHUNKS_DIR"

# ── 4. レポート集計 ─────────────────────────────────────────────
echo "=========================================="
echo "監査レポート"
echo "=========================================="
ALL_RESULTS="$ALL_RESULTS" RESULTS_FILE="$RESULTS_FILE" python3 << 'PYEOF'
import json, os
from collections import Counter

with open(os.environ['ALL_RESULTS']) as f:
    rs = json.load(f)
# 生データを保存
with open(os.environ['RESULTS_FILE'], 'w') as f:
    json.dump(rs, f, ensure_ascii=False, indent=2)

n = len(rs)
if n == 0:
    print("監査結果が0件でした（全チャンクが失敗/スキップ）")
    raise SystemExit

vc = Counter(r.get('verdict', '?') for r in rs)
ok, warn, ng = vc.get('ok', 0), vc.get('warn', 0), vc.get('ng', 0)
print(f"総監査数: {n}問")
print(f"  ✅ ok  : {ok}問 ({ok*100//n}%)")
print(f"  ⚠️  warn: {warn}問 ({warn*100//n}%)")
print(f"  ❌ ng  : {ng}問 ({ng*100//n}%)")
print()

def dist(key, labels):
    c = Counter(r.get(key) for r in rs)
    parts = [f"{labels.get(k,k)}={c[k]}" for k in labels if c.get(k)]
    return ', '.join(parts) if parts else 'なし'

print("内容観点:")
print(f"  現行性 : {dist('currentness', {'ok':'正常','outdated':'古い/誤り','uncertain':'要確認'})}")
print(f"  難易度 : {dist('difficulty', {'appropriate':'適切','too_easy':'易しすぎ','too_hard':'難しすぎ'})}")
print(f"  範囲   : {dist('scope', {'in':'範囲内','out':'範囲外'})}")
print("体裁観点:")
print(f"  読みやすさ: {dist('format', {'ok':'良','hard_to_read':'読みづらい'})}")
print(f"  模試適性  : 不適={sum(1 for r in rs if r.get('mockSuitable') is False)}問")
print()

# 資格別 ng/warn 内訳
by_exam = {}
for r in rs:
    e = r.get('examType', '?')
    d = by_exam.setdefault(e, Counter())
    d[r.get('verdict', '?')] += 1
print("資格別 (ok/warn/ng):")
for e in sorted(by_exam):
    d = by_exam[e]
    print(f"  {e}: {d.get('ok',0)}/{d.get('warn',0)}/{d.get('ng',0)}")
print()

flagged = [r for r in rs if r.get('verdict') in ('warn', 'ng')]
if flagged:
    print(f"要対応の問題 ({len(flagged)}件):")
    order = {'ng': 0, 'warn': 1}
    for r in sorted(flagged, key=lambda r: order.get(r.get('verdict'), 9)):
        mark = '❌' if r.get('verdict') == 'ng' else '⚠️ '
        issues = ' / '.join(r.get('issues', [])) or '(詳細なし)'
        print(f"  {mark} {r.get('questionId','?')} ({r.get('examType','?')}): {issues}")
else:
    print("要対応の問題はありませんでした。")
PYEOF

echo ""
echo "生データ: $RESULTS_FILE"
[ "$RATE_LIMITED" -eq 1 ] && echo "※ レート制限により一部チャンクが未監査です"
echo "監査終了: $(date)"
} 2>&1 | tee -a "$LOG_FILE"
