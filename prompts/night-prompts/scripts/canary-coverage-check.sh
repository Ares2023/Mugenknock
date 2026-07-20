#!/bin/bash
# カナリア整合性チェック（＋Opusによる自動修正）
#
# 目的: 現在のWebサイト構成（app/ のルート・主要な公開フロー）と、実施している
#   カナリアテスト(e2e/tests/canary.noauth.spec.ts)の内容が即しているかを確認する。
#   未カバーの公開ページ・陳腐化したテストを検出し、必要なら spec を自動更新する。
#
# 安全策: テストコードの自動書き換えはリスクがあるため、
#   1) 変更前に必ずバックアップ
#   2) 書き換え後 `playwright test --list` で妥当性を検証（失敗なら差し戻し）
#   3) 文字数の大幅短縮は拒否
#   永続する仕組み（テストコード）を書き換えるため claude は --model opus で実行する。
#
# 出力: logs/canary-coverage_<日時>.md（レポート） / 標準出力（メール集約が拾う）

set -uo pipefail

export PATH="/home/yuzuki/local/bin:/home/sera/.config/nvm/versions/node/v20.20.2/bin:$PATH"
unset ANTHROPIC_API_KEY

_find_claude() {
  [ -x /usr/local/bin/claude ] && { echo /usr/local/bin/claude; return; }
  local _cv; _cv=$(command -v claude 2>/dev/null)
  [ -n "$_cv" ] && [ -x "$_cv" ] && { echo "$_cv"; return; }
}
CLAUDE_CMD=$(_find_claude)
if [ -z "${CLAUDE_CMD:-}" ]; then sleep 30; CLAUDE_CMD=$(_find_claude); fi
if [ -z "${CLAUDE_CMD:-}" ] || [ ! -x "${CLAUDE_CMD:-}" ]; then
  echo "❌ claude コマンドが見つかりません" >&2; exit 1
fi

_d="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
while [ "$(basename "$_d")" != "scripts" ] && [ "$_d" != "/" ]; do _d="$(dirname "$_d")"; done
NIGHT_PROMPTS_DIR="$(dirname "$_d")"
LOG_DIR="$NIGHT_PROMPTS_DIR/logs"
ROOT="$(cd "$_d/../.." && pwd)"           # scripts → night-prompts → prompts → ROOT
ROOT="$(cd "$ROOT/.." && pwd)"            # prompts → プロジェクトルート
SPEC="e2e/tests/canary.noauth.spec.ts"
SPEC_ABS="$ROOT/$SPEC"
mkdir -p "$LOG_DIR"
DATE=$(date '+%Y%m%d_%H%M%S')
REPORT="$LOG_DIR/canary-coverage_${DATE}.md"

{
echo "=========================================="
echo "カナリア整合性チェック 開始: $(date)"
echo "=========================================="

if [ ! -f "$SPEC_ABS" ]; then
  echo "❌ カナリアspecが見つかりません: $SPEC_ABS"; exit 1
fi

# ── 1. 現在のサイト構成（ルート一覧）を収集 ──────────────────────
ROUTES=$(cd "$ROOT" && find app -name 'page.tsx' 2>/dev/null \
  | sed 's|/page.tsx||; s|^app||; s|^$|/|' | sort)
echo "現在のルート数: $(echo "$ROUTES" | grep -c . )"

# ── 2. Opus に整合性を判定させる（必要なら更新版specを生成）──────
PROMPT_FILE=$(mktemp /tmp/canarycov_prompt_XXXX.txt)
{
cat << 'HDR'
あなたはPlaywrightのE2E/カナリアテストを保守する担当者です。
現在のWebサイトの構成（ルート一覧）と、実施中のカナリアテスト(no-auth=未ログインで到達できる
公開ページのスモークテスト)の内容が即しているかを確認してください。

【判定の観点】
- 公開ページ（未ログインで到達可）のうち、スモークテスト（表示・主要導線・コンソールエラー無し）が
  無い「カバー漏れ」はないか。例: 新規追加された公開ルートがテストされていない。
- 既に存在しない/改名されたルートを指すテスト（陳腐化）はないか。
- 認証必須ページ(/aws/* や /account /admin など)は no-auth カナリアの対象外。無理にテストを足さない。

【方針】
- カバー漏れ・陳腐化があれば、既存のテスト様式（test.describe / page.goto / expectNoSevereErrors 等）を
  踏襲して最小限・追記的に spec を更新する。既存の正常なテストは壊さない（削除や全面書換えは禁止）。
- 変更が不要なら newSpec は空文字にする。

【出力形式】次のJSONのみ（説明文・コードブロック不要）。newSpecは更新後のspec全文（部分差分ではない）。
{"summary":"整合性の所見を1〜3文","gaps":["カバー漏れ・陳腐化の具体指摘"],"newSpec":"<更新後のspec全文 or 空文字>"}

【現在のルート一覧（app/ の page.tsx より）】
HDR
echo "$ROUTES"
echo ""
echo "【現在のカナリアspec（$SPEC）】"
echo '--------- BEGIN SPEC ---------'
cat "$SPEC_ABS"
echo '--------- END SPEC ---------'
} > "$PROMPT_FILE"

echo "Opusで整合性を判定中..."
_OV=0
while true; do
  _O=$(mktemp /tmp/canarycov_out_XXXX); _E=$(mktemp /tmp/canarycov_err_XXXX)
  "$CLAUDE_CMD" -p --model opus < "$PROMPT_FILE" > "$_O" 2> "$_E"
  RESULT=$(cat "$_O"); _STDERR=$(cat "$_E"); rm -f "$_O" "$_E"
  _RH=$(echo "$RESULT" | head -3)
  if echo "$_STDERR $_RH" | grep -qiE "529|Overloaded" && [ $_OV -lt 2 ]; then
    _OV=$(( _OV + 1 )); echo "⚠️ 529。60秒後にリトライ(${_OV}/2)"; sleep 60; continue
  fi
  break
done
rm -f "$PROMPT_FILE"

# ── 3. 結果を解析し、更新版があれば検証ゲートを通して適用 ─────────
RESULT="$RESULT" ROOT="$ROOT" SPEC="$SPEC" SPEC_ABS="$SPEC_ABS" LOG_DIR="$LOG_DIR" \
  DATE="$DATE" REPORT="$REPORT" python3 << 'PYEOF'
import json, os, sys, shutil, subprocess, difflib

raw = os.environ.get('RESULT', '')
dec = json.JSONDecoder()
obj = None; start = raw.find('{')
while start != -1:
    try:
        o, _ = dec.raw_decode(raw, start)
        if isinstance(o, dict) and ('newSpec' in o or 'gaps' in o):
            obj = o; break
    except json.JSONDecodeError:
        pass
    start = raw.find('{', start + 1)

report = os.environ['REPORT']
spec_abs = os.environ['SPEC_ABS']
spec = os.environ['SPEC']
root = os.environ['ROOT']
log_dir = os.environ['LOG_DIR']
date = os.environ['DATE']

def write_report(summary, gaps, action_lines):
    lines = [f"# カナリア整合性チェック ({date})", '', '## 所見', summary or '(なし)', '',
             '## カバー漏れ・陳腐化', *([f"- {g}" for g in gaps] if gaps else ['- (指摘なし)']), '',
             '## 対応', *action_lines]
    with open(report, 'w') as f:
        f.write('\n'.join(lines) + '\n')

if obj is None:
    print("⚠️ 判定結果のJSON抽出に失敗。specは変更しません。")
    write_report('(判定失敗)', [], ['- JSON抽出失敗のため未対応'])
    sys.exit(0)

summary = obj.get('summary', '')
gaps = obj.get('gaps') or []
new_spec = obj.get('newSpec') or ''

print(f"所見: {summary}")
for g in gaps:
    print(f"  - {g}")

old = open(spec_abs).read()
if not new_spec.strip() or new_spec.strip() == old.strip():
    print("→ spec更新は不要（整合済み）。")
    write_report(summary, gaps, ['- 整合済み。spec更新なし。'])
    sys.exit(0)

# 反破壊ガード: 大幅短縮は拒否
if len(new_spec) < 0.7 * len(old):
    print(f"→ 提案specが大幅に短い({len(old)}→{len(new_spec)})ため安全のため差し戻し。")
    with open(report.replace('.md', '.proposed.spec'), 'w') as f:
        f.write(new_spec)
    write_report(summary, gaps, [f'- 提案あり（大幅短縮のため未適用・差し戻し）。提案は .proposed.spec に保存。'])
    sys.exit(0)

# バックアップ → 書き込み → playwright --list で検証
backup = os.path.join(log_dir, f"canary-coverage_{date}_spec.bak")
shutil.copy2(spec_abs, backup)
with open(spec_abs, 'w') as f:
    f.write(new_spec if new_spec.endswith('\n') else new_spec + '\n')

diff = ''.join(difflib.unified_diff(old.splitlines(True), open(spec_abs).read().splitlines(True),
                                    fromfile=f'a/{spec}', tofile=f'b/{spec}'))

print("更新版specを検証中（playwright --list）...")
r = subprocess.run(['npx', 'playwright', 'test', spec, '--list'],
                   cwd=root, capture_output=True, text=True, timeout=180)
if r.returncode == 0:
    print("✅ 検証OK。更新版specを適用しました。")
    write_report(summary, gaps,
                 ['- specを更新（検証OK=playwright --list 成功）。', f'- バックアップ: {backup}', '', '```diff', diff.rstrip('\n'), '```'])
else:
    shutil.copy2(backup, spec_abs)  # 差し戻し
    print("❌ 検証失敗（playwright --list がエラー）。元のspecに差し戻しました。")
    print((r.stderr or r.stdout)[:500])
    with open(report.replace('.md', '.proposed.spec'), 'w') as f:
        f.write(new_spec)
    write_report(summary, gaps,
                 ['- 提案specは検証失敗(playwright --list)のため差し戻し。提案は .proposed.spec に保存。',
                  '```', (r.stderr or r.stdout)[:500], '```'])
PYEOF

echo ""
echo "レポート: $REPORT"
echo "カナリア整合性チェック 終了: $(date)"
} 2>&1 | tee -a "$LOG_DIR/canary-coverage_${DATE}.log"
