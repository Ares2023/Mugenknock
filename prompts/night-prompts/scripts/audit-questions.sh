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
IMPROVE=0

show_help() {
  cat << 'EOF'
usage: audit-questions.sh [-n N] [-e EXAM] [-r] [-c C] [-i] [-h]

  -n N     監査する問題数 (default: 20)
  -e EXAM  資格コードで絞り込み (例: SAA, DEA)。未指定なら全資格
  -r       ランダム抽出（既定は「直近に生成・チェックされた問題」優先）
  -c C     1チャンクあたりの問題数 (default: 5)
  -i       改善モード: 監査結果を元に生成・検証プロンプトを継続改良し、改良結果もレポート
  -h       このヘルプ

監査観点:
  A. 内容 — 現行AWS仕様として正しいか / 本番相当の難易度か / 出題範囲内か
  B. 体裁 — 問題・選択肢・解説が読みやすいか / 模試として適切か

改善モード(-i):
  監査で見つかった systemic な問題を元に、編集可能なプロンプト規則ファイルを
  最小限・追記的に改良する（個別問題の修正ではなくルールの改良）。
    instructions/_common-rules.txt  … 生成(01)の共通ルール
    instructions/<EXAM>.txt          … 生成(01)の資格別指示
    instructions/_validity-extra.txt … 検証(02)に注入される追加確認観点
  変更前にバックアップを取り、改良内容と差分を audit_<日時>_improvement.md に出力。
  夜間自動実行ではこのモードをONにする。

  ※ 監査自体は読み取り専用（DBは変更しない）。-i 時のみプロンプト規則ファイルを編集。
  ※ レポートは標準出力 + $LOG_DIR/audit_<日時>.log、生データは audit_<日時>.json
EOF
}

while getopts "n:e:rc:ih" opt; do
  case "$opt" in
    n) SAMPLE="$OPTARG" ;;
    e) EXAM_FILTER="$(echo "$OPTARG" | tr '[:lower:]' '[:upper:]')" ;;
    r) RANDOM_SAMPLE=1 ;;
    c) CHUNK_SIZE="$OPTARG" ;;
    i) IMPROVE=1 ;;
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

# ── 5. 改善モード(-i): 監査結果を元に生成・検証プロンプトを継続改良 ──
if [ "$IMPROVE" -eq 1 ]; then
  echo ""
  echo "=========================================="
  echo "改善モード: 生成・検証プロンプトの継続改良"
  echo "=========================================="
  IMPROVE_REPORT="$LOG_DIR/audit_${DATE}_improvement.md"
  BACKUP_DIR="$LOG_DIR/audit_${DATE}_promptbackup"

  # 通報で確定した不具合（生成・検証をすり抜けた実際の誤り・直近7日）も改良の材料にする
  DEFECTS_LOG="$NIGHT_PROMPTS_DIR/logs/report-confirmed-defects.jsonl"
  _FLAGGED=$(python3 -c "import json;rs=json.load(open('$RESULTS_FILE'));print(sum(1 for r in rs if r.get('verdict') in ('warn','ng')))" 2>/dev/null || echo 0)
  _DEFECTS=$(DEFECTS_LOG="$DEFECTS_LOG" python3 -c "
import json,os,sys
from datetime import datetime,timedelta,timezone
p=os.environ['DEFECTS_LOG']
if not os.path.isfile(p): print(0); sys.exit()
cut=(datetime.now(timezone.utc)-timedelta(days=7)).strftime('%Y-%m-%d')
n=0
for ln in open(p):
    ln=ln.strip()
    if not ln: continue
    try:
        if json.loads(ln).get('date','') >= cut: n+=1
    except: pass
print(n)" 2>/dev/null || echo 0)
  if [ "${_FLAGGED:-0}" -eq 0 ] && [ "${_DEFECTS:-0}" -eq 0 ]; then
    echo "改善対象（監査warn/ng・通報確定不具合）がないため、プロンプト改良はスキップしました。"
  else
    echo "改善対象: 監査${_FLAGGED}件 / 通報確定不具合(直近7日)${_DEFECTS}件。改良案を生成中..."
    IMP_PROMPT=$(mktemp /tmp/audit_imp_prompt_XXXX.txt)
    RESULTS_FILE="$RESULTS_FILE" INSTRUCTION_DIR="$INSTRUCTION_DIR" DEFECTS_LOG="$DEFECTS_LOG" python3 > "$IMP_PROMPT" << 'PYEOF'
import json, os
from collections import OrderedDict
from datetime import datetime, timedelta, timezone

rs = json.load(open(os.environ['RESULTS_FILE']))
inst = os.environ['INSTRUCTION_DIR']
AWS = {'CLF','AIF','SAA','DVA','SOA','DEA','MLA','SAP','DOP','AIP','ANS','SCS'}
flagged = [r for r in rs if r.get('verdict') in ('warn', 'ng')]

# 通報で確定した不具合（直近7日）= 生成・検証をすり抜けた実際の誤り
defects = []
_dp = os.environ.get('DEFECTS_LOG', '')
if _dp and os.path.isfile(_dp):
    _cut = (datetime.now(timezone.utc) - timedelta(days=7)).strftime('%Y-%m-%d')
    for _ln in open(_dp):
        _ln = _ln.strip()
        if not _ln:
            continue
        try:
            _d = json.loads(_ln)
            if _d.get('date', '') >= _cut:
                defects.append(_d)
        except Exception:
            pass
defects = defects[-30:]

def cnt(key, val): return sum(1 for r in flagged if r.get(key) == val)
summary = [
    f"監査総数 {len(rs)}問 / 要改善 {len(flagged)}問",
    f"古い・誤り(outdated): {cnt('currentness','outdated')} / 要確認(uncertain): {cnt('currentness','uncertain')}",
    f"易しすぎ(too_easy): {cnt('difficulty','too_easy')} / 難しすぎ(too_hard): {cnt('difficulty','too_hard')}",
    f"範囲外(scope=out): {cnt('scope','out')}",
    f"読みづらい(hard_to_read): {cnt('format','hard_to_read')} / 模試不適: {sum(1 for r in flagged if r.get('mockSuitable') is False)}",
]
issues = []
for r in flagged:
    for it in (r.get('issues') or []):
        issues.append(f"[{r.get('examType','?')}/{r.get('verdict')}] {it}")
issues = issues[:40]
# 通報で確定した不具合の文言（生成・検証をすり抜けた実際の誤り）
defect_lines = [f"[{d.get('examType','?')}/{d.get('category','')}/{d.get('action','')}] {d.get('reason','')}" for d in defects]
exam_src = [r.get('examType') for r in flagged] + [d.get('examType') for d in defects]
exams = [e for e in OrderedDict((e, 1) for e in exam_src) if e in AWS][:4]
allowed = ['_common-rules.txt', '_validity-extra.txt'] + [f"{e}.txt" for e in exams]

blocks = []
for fn in allowed:
    p = os.path.join(inst, fn)
    try:
        content = open(p).read() if os.path.isfile(p) else '(ファイルなし。必要なら新規作成可)'
    except Exception:
        content = '(読込失敗)'
    blocks.append(f"========== FILE: {fn} ==========\n{content}\n========== END {fn} ==========")

print('''あなたはAWS認定試験の「問題生成・検証プロンプト」を継続的に改良する担当者です。
以下は、生成・検証を通過した問題を第三者監査した結果、見つかった systemic（傾向的）な品質問題です。
個別問題を直すのではなく、今後の生成・検証で同種の問題を防ぐよう、編集可能なプロンプト規則ファイルを
最小限・追記的に改良してください。

【改良の方針】
- 監査で多かった問題クラスに対応する規則だけを、的確に・簡潔に強化する。
- 既存ルールと矛盾させない。冗長な重複を増やさない。表現は短く具体的に。
- 大幅な削除や全面書き換えは禁止（追記・小修正のみ）。改良不要なら changes は空配列。
- 各ファイルの役割:
  - _common-rules.txt … 生成(01)の共通ルール（難易度・体裁・解説・選択肢バランス等）。
    「易しすぎ」「体裁」「模試不適」はここを強化（例: シナリオ性・ひっかけ選択肢・要件比較を必須化）。
  - <資格>.txt … 生成(01)の資格別指示（出題範囲・対象サービス）。「範囲外」はここで範囲を明確化。
  - _validity-extra.txt … 検証(02)に注入される「追加の確認観点」。検証で弾く/警告すべき観点を足す
    （例: 易しすぎる定番キーワード問題を warn、現行性の裏取り強化など）。冒頭の # コメント行は残す。

【監査サマリー】
''' + '\n'.join(summary) + '''

【代表的な指摘（最大40件）】
''' + ('\n'.join(f'- {x}' for x in issues) if issues else '(なし)') + '''

【ユーザー通報で確定した不具合（直近7日・生成と検証の両方をすり抜けた実際の誤り。最優先で再発防止）】
これらは検証(02)が見逃した誤りなので、_validity-extra.txt に「この種の誤りを検出する観点」を必ず追加し、
生成由来であれば _common-rules.txt / 資格別ファイルも強化すること。
''' + ('\n'.join(f'- {x}' for x in defect_lines) if defect_lines else '(なし)') + '''

【編集可能なファイルの現在の内容】
''' + '\n\n'.join(blocks) + '''

【出力形式】次のJSONのみを出力（説明文・前置き・コードブロック不要）。
newContent は当該ファイルの「改良後の全文」を入れること（部分差分ではない）。
{"summary":"全体の改良方針を1〜3文で","changes":[
  {"file":"_common-rules.txt","rationale":"この変更がどの監査結果に対応するか","newContent":"<改良後のファイル全文>"}
]}''')
PYEOF

    _OVERLOAD_RETRY=0
    while true; do
      _IO=$(mktemp /tmp/audit_imp_out_XXXX); _IE=$(mktemp /tmp/audit_imp_err_XXXX)
      # 永続する仕組み（生成・検証プロンプト規則）を書き換えるステップは Opus で実行し誤りを減らす
      "$CLAUDE_CMD" -p --model opus < "$IMP_PROMPT" > "$_IO" 2> "$_IE"
      RESULT=$(cat "$_IO"); _STDERR=$(cat "$_IE"); rm -f "$_IO" "$_IE"
      _RH=$(echo "$RESULT" | head -3)
      if echo "$_STDERR $_RH" | grep -qiE "529|Overloaded" && [ $_OVERLOAD_RETRY -lt 2 ]; then
        _OVERLOAD_RETRY=$(( _OVERLOAD_RETRY + 1 )); echo "⚠️  529。60秒後にリトライ（${_OVERLOAD_RETRY}/2）"; sleep 60; continue
      fi
      break
    done
    rm -f "$IMP_PROMPT"

    # 適用（whitelist + バックアップ + 反破壊ガード + 差分記録）
    RESULT="$RESULT" INSTRUCTION_DIR="$INSTRUCTION_DIR" BACKUP_DIR="$BACKUP_DIR" IMPROVE_REPORT="$IMPROVE_REPORT" DATE="$DATE" python3 << 'PYEOF'
import json, os, sys, shutil, difflib

raw = os.environ.get('RESULT', '')
dec = json.JSONDecoder()
obj = None
start = raw.find('{')
while start != -1:
    try:
        o, _ = dec.raw_decode(raw, start)
        if isinstance(o, dict) and 'changes' in o:
            obj = o; break
    except json.JSONDecodeError:
        pass
    start = raw.find('{', start + 1)

if obj is None:
    print("⚠️  改良案のJSON抽出に失敗。プロンプトは変更しませんでした。")
    sys.exit(0)

inst = os.environ['INSTRUCTION_DIR']
backup = os.environ['BACKUP_DIR']
report = os.environ['IMPROVE_REPORT']
AWS = {'CLF','AIF','SAA','DVA','SOA','DEA','MLA','SAP','DOP','AIP','ANS','SCS'}
ALLOWED = {'_common-rules.txt', '_validity-extra.txt'} | {f"{e}.txt" for e in AWS}

changes = obj.get('changes') or []
applied, skipped = [], []
for ch in changes:
    fn = (ch.get('file') or '').strip()
    nc = ch.get('newContent')
    rationale = (ch.get('rationale') or '').strip()
    if os.path.basename(fn) != fn or fn not in ALLOWED:
        skipped.append((fn, 'whitelist外')); continue
    if not nc or not nc.strip():
        skipped.append((fn, 'newContentが空')); continue
    if not nc.endswith('\n'): nc += '\n'
    p = os.path.join(inst, fn)
    old = open(p).read() if os.path.isfile(p) else ''
    if len(old) > 200 and len(nc) < 0.6 * len(old):
        skipped.append((fn, f'大幅短縮のため拒否({len(old)}→{len(nc)}字)')); continue
    if nc == old:
        skipped.append((fn, '実質変更なし')); continue
    os.makedirs(backup, exist_ok=True)
    if os.path.isfile(p):
        shutil.copy2(p, os.path.join(backup, fn))
    with open(p, 'w') as f:
        f.write(nc)
    diff = ''.join(difflib.unified_diff(old.splitlines(True), nc.splitlines(True),
                                        fromfile=f'a/{fn}', tofile=f'b/{fn}'))
    applied.append((fn, rationale, diff))

# 改良レポート(md)
lines = [f"# プロンプト改良レポート ({os.environ['DATE']})", '',
         '## 改良方針', obj.get('summary', '(なし)'), '',
         f"## 適用 {len(applied)}件 / 見送り {len(skipped)}件", '']
for fn, rationale, diff in applied:
    lines += [f"### ✅ {fn}", f"**理由:** {rationale}", '', '```diff', diff.rstrip('\n'), '```', '']
for fn, why in skipped:
    lines.append(f"- ⏭️ {fn}: {why}")
if applied:
    lines += ['', f"バックアップ: {backup}"]
with open(report, 'w') as f:
    f.write('\n'.join(lines) + '\n')

# コンソール出力
print(f"改良方針: {obj.get('summary','(なし)')}")
print(f"適用 {len(applied)}件 / 見送り {len(skipped)}件")
for fn, rationale, _ in applied:
    print(f"  ✅ {fn} — {rationale[:80]}")
for fn, why in skipped:
    print(f"  ⏭️ {fn} — {why}")
print(f"改良レポート: {report}")
if applied:
    print(f"バックアップ: {backup}")
    print("※ 次回以降の生成(01)・検証(02)からこの改良が反映されます。")
PYEOF
  fi
fi

echo "監査終了: $(date)"
} 2>&1 | tee -a "$LOG_FILE"
