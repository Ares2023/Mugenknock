#!/bin/bash
# AWSサービスカタログ更新スクリプト（記事生成・検証の単一の真実source）
#
# 何をするか:
#   1. AWS公式SSMパラメータから全AWSサービスコードを取得（無料・APIトークン不要）
#   2. 既存の日めくり(DailyServices)からも実在記事サービスを取り込み
#   3. 新規 or 鮮度切れ(--max-age-days)のエントリだけを claude + WebFetch で確認し、
#      正式名称 / カテゴリ / 提供状態(status) / 検証済みdocUrl / 記事対象か(isArticleTarget) /
#      試験関連度 を埋める（大半はキャッシュヒットでスキップ＝コスト有界）
#   4. state/service-catalog.json を出力（git管理＝状態変化が差分で追える）
#
# このカタログを 04-generate（記事化対象の選定）と 05-check（廃止記事の検出・削除）が参照する。
#
# Usage:
#   ./refresh-service-catalog.sh                  # 既定: 未確認/鮮度切れを最大 -n 件確認
#   ./refresh-service-catalog.sh -n 8             # 1回の確認件数（コスト上限）
#   ./refresh-service-catalog.sh --max-age-days 30  # 30日以内に確認済みはスキップ（定期実行用）
#   ./refresh-service-catalog.sh --seed-only      # SSM取込＋seedのみ（claude呼ばない）
#   ./refresh-service-catalog.sh -h

set -uo pipefail
export PATH="/home/yuzuki/local/bin:$PATH"
unset ANTHROPIC_API_KEY

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NIGHT_PROMPTS_DIR="$(dirname "$SCRIPT_DIR")"
CATALOG_FILE="$SCRIPT_DIR/state/service-catalog.json"
AWS_CMD="/home/yuzuki/local/bin/aws"
TODAY=$(date '+%Y-%m-%d')

_find_claude() {
  [ -x /usr/local/bin/claude ] && { echo /usr/local/bin/claude; return; }
  local _cv; _cv=$(command -v claude 2>/dev/null)
  [ -n "$_cv" ] && [ -x "$_cv" ] && { echo "$_cv"; return; }
}
CLAUDE_CMD=$(_find_claude)

show_help() { sed -n '2,20p' "${BASH_SOURCE[0]}"; }

BATCH_LIMIT=8        # 1回の実行で確認(WebFetch)するエントリ数の上限（コスト制御）
CHUNK_SIZE=4         # 1回のclaude呼び出しに渡すエントリ数
MAX_AGE_DAYS=0       # >0: lastVerifiedAt がこの日数以内ならスキップ
SEED_ONLY=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help) show_help; exit 0 ;;
    -n) BATCH_LIMIT="${2:?-n requires N}"; shift 2 ;;
    --max-age-days) MAX_AGE_DAYS="${2:-0}"; shift 2 ;;
    --seed-only) SEED_ONLY=1; shift ;;
    *) echo "不明な引数: $1" >&2; exit 1 ;;
  esac
done

echo "=========================================="
echo "サービスカタログ更新: $(date)"
echo "=========================================="

# ── 1. SSMから全AWSサービスコードを取得（無料）──────────────────
echo "--- AWS公式SSMから全サービスコード取得中 ---"
SSM_CODES=$("$AWS_CMD" ssm get-parameters-by-path \
  --path /aws/service/global-infrastructure/services \
  --query 'Parameters[].Name' --output text 2>/dev/null \
  | tr '\t' '\n' | sed 's#.*/##' | sort -u)
SSM_COUNT=$(echo "$SSM_CODES" | grep -c . || echo 0)
echo "  SSMサービスコード: ${SSM_COUNT}件"
[ "$SSM_COUNT" -eq 0 ] && echo "  ⚠️  SSM取得失敗（既存カタログ＋DailyServices seedのみで継続）"

# ── 2. 既存DailyServices取得（seed用）─────────────────────────
DS_TMP=$(mktemp /tmp/ds_scan_XXXX.json)
"$AWS_CMD" dynamodb scan --table-name DailyServices --output json 2>/dev/null > "$DS_TMP" || echo '{}' > "$DS_TMP"

# ── 3. seed＋SSMマージ → 確認対象(work set)を決定 ───────────────
WORK_TMP=$(mktemp /tmp/catalog_work_XXXX.json)
SSM_TMP=$(mktemp /tmp/ssm_codes_XXXX.txt)
printf '%s\n' "$SSM_CODES" > "$SSM_TMP"

CATALOG_FILE="$CATALOG_FILE" DS_TMP="$DS_TMP" SSM_TMP="$SSM_TMP" \
MAX_AGE_DAYS="$MAX_AGE_DAYS" BATCH_LIMIT="$BATCH_LIMIT" TODAY="$TODAY" \
python3 - "$WORK_TMP" << 'PYEOF'
import json, os, sys, re
from datetime import datetime

catalog_file = os.environ['CATALOG_FILE']
today = os.environ['TODAY']
max_age = int(os.environ['MAX_AGE_DAYS'])
limit = int(os.environ['BATCH_LIMIT'])

# 既存カタログ
try:
    with open(catalog_file, encoding='utf-8') as f:
        catalog = json.load(f)
except Exception:
    catalog = {"updated_at": None, "services": {}}
services = catalog.setdefault("services", {})

def norm(s):
    return re.sub(r'[^a-z0-9]', '', (s or '').lower())

# 既存エントリの正規化名→キー 索引（重複seed防止）
by_norm = {}
for k, v in services.items():
    by_norm[norm(v.get('name') or k)] = k
    if v.get('serviceCode'):
        by_norm[norm(v['serviceCode'])] = k

# DynamoDB DailyServices を deserialize
def deser(v):
    if 'S' in v: return v['S']
    if 'N' in v: return float(v['N']) if '.' in v['N'] else int(v['N'])
    if 'BOOL' in v: return v['BOOL']
    if 'L' in v: return [deser(i) for i in v['L']]
    if 'M' in v: return {k: deser(vv) for k, vv in v['M'].items()}
    return None
try:
    with open(os.environ['DS_TMP']) as f:
        ds = json.load(f)
    ds_items = [{k: deser(v) for k, v in it.items()} for it in ds.get('Items', [])]
except Exception:
    ds_items = []

seeded = 0
# seed: 既存記事サービス（実在記事 → isArticleTarget=true, status=unknown で確認待ち）
for s in ds_items:
    name = s.get('name')
    if not name:
        continue
    nk = norm(name)
    if nk in by_norm:
        continue
    key = name
    services[key] = {
        "name": name,
        "shortName": s.get('shortName', ''),
        "category": s.get('category', ''),
        "status": "unknown",
        "statusNote": "",
        "docUrl": s.get('docUrl', ''),
        "isArticleTarget": True,
        "examRelevance": "unknown",
        "serviceCode": "",
        "lastVerifiedAt": None,
        "source": "daily-services-seed",
    }
    by_norm[nk] = key
    seeded += 1

# SSMコードを stub として追加（未収録のみ・名称は確認時に解決）
ssm_added = 0
try:
    with open(os.environ['SSM_TMP']) as f:
        codes = [c.strip() for c in f if c.strip()]
except Exception:
    codes = []
for code in codes:
    ck = norm(code)
    if ck in by_norm:
        # 既存に紐付け: serviceCode を補完
        ek = by_norm[ck]
        if not services[ek].get('serviceCode'):
            services[ek]['serviceCode'] = code
        continue
    key = '__code__' + code
    if key in services:
        continue
    services[key] = {
        "name": "",
        "shortName": "",
        "category": "",
        "status": "unknown",
        "statusNote": "",
        "docUrl": "",
        "isArticleTarget": None,
        "examRelevance": "unknown",
        "serviceCode": code,
        "lastVerifiedAt": None,
        "needsResolution": True,
        "source": "ssm",
    }
    by_norm[ck] = key
    ssm_added += 1

# 確認対象(work set): status==unknown / 鮮度切れ / 未解決
def is_stale(v):
    lv = v.get('lastVerifiedAt')
    if not lv:
        return True
    if max_age <= 0:
        return False  # max-age未指定なら、確認済みは再確認しない
    try:
        age = (datetime.now() - datetime.fromisoformat(lv)).days
        return age >= max_age
    except Exception:
        return True

work = []
for key, v in services.items():
    if v.get('needsResolution') or v.get('status') == 'unknown' or is_stale(v):
        work.append(key)
# 優先度: 未検証(unknown)の「新規サービス(=未記事化候補)」を最優先し、日めくり記事の
# 新規候補が増えるようにする。次に未検証の既存記事、最後に確認済みの鮮度切れ再確認。
def _prio(k):
    v = services[k]
    is_seed = v.get('source') == 'daily-services-seed'  # 既存記事＝登録済み
    is_unknown = v.get('status') == 'unknown'
    if is_unknown and not is_seed:
        return 0  # 未検証の新規サービス（active化すれば新規記事候補）
    if is_unknown:
        return 1  # 未検証の既存記事
    return 2      # 確認済み・鮮度切れの再確認（現行性維持）
work.sort(key=_prio)
work = work[:limit]

# カタログを保存（seed/stub反映）。確認結果は後段でマージ
catalog['updated_at'] = datetime.now().isoformat()
os.makedirs(os.path.dirname(catalog_file), exist_ok=True)
tmp = catalog_file + '.tmp'
with open(tmp, 'w', encoding='utf-8') as f:
    json.dump(catalog, f, ensure_ascii=False, indent=2, sort_keys=True)
os.replace(tmp, catalog_file)

# work set を出力
work_payload = [{"key": k, **services[k]} for k in work]
with open(sys.argv[1], 'w', encoding='utf-8') as f:
    json.dump(work_payload, f, ensure_ascii=False)

total = len(services)
print(f"  seed追加(既存記事): {seeded}件 / SSM stub追加: {ssm_added}件")
print(f"  カタログ総数: {total}件 / 今回の確認対象: {len(work)}件（上限 {limit}）")
PYEOF
RC=$?
rm -f "$DS_TMP" "$SSM_TMP"
if [ $RC -ne 0 ]; then echo "❌ カタログseed処理に失敗"; rm -f "$WORK_TMP"; exit 1; fi

WORK_COUNT=$(python3 -c "import json,sys; print(len(json.load(open(sys.argv[1]))))" "$WORK_TMP" 2>/dev/null || echo 0)

if [ "$SEED_ONLY" -eq 1 ]; then
  echo "--seed-only 指定のため確認(claude)はスキップ。カタログ: $CATALOG_FILE"
  rm -f "$WORK_TMP"; exit 0
fi
if [ "$WORK_COUNT" -eq 0 ]; then
  echo "確認対象なし（全件が鮮度内）。カタログ: $CATALOG_FILE"
  rm -f "$WORK_TMP"; exit 0
fi
if [ -z "${CLAUDE_CMD:-}" ] || [ ! -x "${CLAUDE_CMD:-}" ]; then
  echo "❌ claude コマンドが見つかりません（seedのみ反映済み）" >&2
  rm -f "$WORK_TMP"; exit 1
fi

# ── 4. 確認対象をチャンク分割し、claude + WebFetch で検証 ─────────
CHUNKS_DIR=$(mktemp -d /tmp/catalog_chunks_XXXX)
python3 - "$WORK_TMP" "$CHUNKS_DIR" "$CHUNK_SIZE" << 'PYEOF'
import json, sys
work = json.load(open(sys.argv[1]))
cs = int(sys.argv[3])
for i in range(0, len(work), cs):
    with open(f"{sys.argv[2]}/{i//cs:04d}.json", 'w', encoding='utf-8') as f:
        json.dump(work[i:i+cs], f, ensure_ascii=False)
PYEOF
rm -f "$WORK_TMP"

RATE_LIMITED=0
VERIFIED=0
for chunk_file in "$CHUNKS_DIR"/*.json; do
  [ -e "$chunk_file" ] || continue
  [ "$RATE_LIMITED" -eq 1 ] && break
  CN=$(python3 -c "import json,sys;print(len(json.load(open(sys.argv[1]))))" "$chunk_file" 2>/dev/null || echo 0)
  echo ""
  echo "--- ${CN}件を確認中（WebFetchで公式裏取り）開始=$(date '+%H:%M:%S') ---"

  PROMPT_FILE=$(mktemp /tmp/catalog_prompt_XXXX.txt)
  python3 - "$chunk_file" > "$PROMPT_FILE" << 'PYEOF'
import json, sys
work = json.load(open(sys.argv[1]))
VALID_CATEGORIES = ['コンピューティング','ストレージ','データベース','ネットワーキング','メッセージング','コンテナ','セキュリティ','モニタリング','アプリケーション統合','DevOps','データ分析','機械学習','生成AI','マネジメント','移行']
lines = []
lines.append('あなたはAWSサービスのカタログ管理者です。以下の各AWSサービスについて、公式情報に基づき最新の属性を確定してください。')
lines.append('現行性・廃止/新規受付終了/EOL/改名 の判定や docUrl は、少しでも不確かなら推測せず WebFetch で公式（aws.amazon.com / docs.aws.amazon.com / What\'s New / 公式ブログ）を確認してから答えること。確信のある定番サービスは取得不要。')
lines.append('')
lines.append('【各フィールドの定義】')
lines.append('- name: 正式名称（例: "Amazon EC2"）。serviceCodeのみ与えられた場合は正式名称を解決する')
lines.append('- shortName: 短縮名（例: "EC2"）')
lines.append(f'- category: 次のいずれか1つ → {" / ".join(VALID_CATEGORIES)}')
lines.append('- status: 次のいずれか')
lines.append('    active        = 現行・新規利用可能')
lines.append('    closed_to_new = 既存利用者は使えるが新規受付終了（例: Cloud9, Forecast 等）')
lines.append('    deprecated    = 非推奨・縮小・代替推奨')
lines.append('    eol           = 提供終了/終了予定（End of Life）')
lines.append('    renamed       = 改名/別サービスへ統合（statusNoteに新名称）')
lines.append('- statusNote: status の根拠を簡潔に（時期・代替サービス名など。activeなら空でよい）')
lines.append('- docUrl: 実在を確認した公式ページURL（https://aws.amazon.com/jp/... 推奨。無ければ英語版可）')
lines.append('- isArticleTarget: 学習サイトの「日めくりAWSサービス」記事にふさわしいか（true/false）。')
lines.append('    現行で試験/実務で意味のある主要サービスは true。status が active 以外、極端にニッチ/地域限定/内部用は false。')
lines.append('- examRelevance: AWS認定試験での重要度 → high / medium / low / none')
lines.append('')
lines.append('【出力】JSONのみ。前置き・コードブロック不要。入力のkeyをそのまま返すこと。')
lines.append('{"results":[{"key":"<入力key>","name":"...","shortName":"...","category":"...","status":"active","statusNote":"","docUrl":"https://...","isArticleTarget":true,"examRelevance":"high"}]}')
lines.append('')
lines.append('【対象サービス】')
for w in work:
    ident = w.get('name') or ''
    code = w.get('serviceCode') or ''
    lines.append(f'- key="{w["key"]}" | 現在の名称="{ident}" | serviceCode="{code}" | 現在のdocUrl="{w.get("docUrl","")}"')
print('\n'.join(lines))
PYEOF

  _OUT=$(mktemp /tmp/catalog_out_XXXX); _ERR=$(mktemp /tmp/catalog_err_XXXX)
  "$CLAUDE_CMD" -p --allowed-tools WebFetch < "$PROMPT_FILE" > "$_OUT" 2> "$_ERR"
  AI_EXIT=$?
  RESULT=$(cat "$_OUT"); ERRTXT=$(cat "$_ERR")
  rm -f "$_OUT" "$_ERR" "$PROMPT_FILE"

  # npm更新でバイナリ消失 → 再探索リトライ
  if [ $AI_EXIT -ne 0 ] && echo "$ERRTXT" | grep -q "No such file"; then
    CLAUDE_CMD=$(_find_claude)
    [ -x "${CLAUDE_CMD:-}" ] && { RESULT=$("$CLAUDE_CMD" -p --allowed-tools WebFetch < "$chunk_file" 2>&1); AI_EXIT=$?; }
  fi
  # レート制限/セッション上限 → 残りをスキップ（seedは保存済み）
  if echo "$RESULT $ERRTXT" | grep -qiE "rate.?limit|too many requests|usage limit|session.?limit|hit your|resource_exhausted"; then
    echo "⚠️  レート制限/セッション上限を検出。残りをスキップ"
    echo "$RESULT $ERRTXT" | grep -oiE "resets [^·]*" | head -1
    RATE_LIMITED=1
    break
  fi
  if [ $AI_EXIT -ne 0 ]; then
    echo "  ⚠️  claude 実行エラー（このチャンクをスキップ）"; continue
  fi

  # 結果をカタログにマージ
  _MERGED=$(CATALOG_FILE="$CATALOG_FILE" TODAY="$TODAY" RESULT_RAW="$RESULT" python3 << 'PYEOF'
import json, os, re
from datetime import datetime
catalog_file = os.environ['CATALOG_FILE']
today = os.environ['TODAY']
raw = os.environ['RESULT_RAW']
# JSON抽出
m = raw.find('{')
results = []
if m != -1:
    try:
        obj, _ = json.JSONDecoder().raw_decode(raw, m)
        results = obj.get('results', [])
    except Exception:
        results = []
with open(catalog_file, encoding='utf-8') as f:
    catalog = json.load(f)
services = catalog['services']
VALID = {'active','closed_to_new','deprecated','eol','renamed'}
applied = 0
for r in results:
    key = r.get('key')
    if not key or key not in services:
        continue
    e = services[key]
    name = (r.get('name') or e.get('name') or '').strip()
    status = r.get('status') if r.get('status') in VALID else 'unknown'
    e['name'] = name
    if r.get('shortName'): e['shortName'] = r['shortName']
    if r.get('category'): e['category'] = r['category']
    e['status'] = status
    e['statusNote'] = r.get('statusNote', '') or ''
    if r.get('docUrl'): e['docUrl'] = r['docUrl']
    if r.get('isArticleTarget') is not None: e['isArticleTarget'] = bool(r['isArticleTarget'])
    if r.get('examRelevance'): e['examRelevance'] = r['examRelevance']
    e['lastVerifiedAt'] = today
    e.pop('needsResolution', None)
    # SSM stub(__code__...) が名称解決できたら正式名称キーへ移設
    if key.startswith('__code__') and name:
        if name not in services:
            services[name] = e
            del services[key]
    applied += 1
catalog['updated_at'] = datetime.now().isoformat()
tmp = catalog_file + '.tmp'
with open(tmp, 'w', encoding='utf-8') as f:
    json.dump(catalog, f, ensure_ascii=False, indent=2, sort_keys=True)
os.replace(tmp, catalog_file)
print(applied)
PYEOF
)
  echo "  ✓ ${_MERGED}件をカタログに反映（確認日=${TODAY}）"
  VERIFIED=$(( VERIFIED + ${_MERGED:-0} ))
done
rm -rf "$CHUNKS_DIR"

echo ""
echo "=========================================="
echo "完了: 確認 ${VERIFIED}件 / カタログ: $CATALOG_FILE"
[ "$RATE_LIMITED" -eq 1 ] && echo "（レート制限により一部未処理。次回実行で継続）"
echo "=========================================="
