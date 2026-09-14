#!/bin/bash
# フック設定の共有ロジック(source して使う)。
# 設定ファイル ~/.config/mugenknock/hooks.conf を唯一の正とし、ct と sync が共用する。
#   形式(1行1フック): 分前|スクリプト|ラベル
#     分前     : ピンの何分前に実行するか(正整数)
#     スクリプト: 絶対パス、または scripts/ 配下の名前
#     ラベル   : 表示用(任意)
#   # で始まる行と空行は無視。
MK_CFG="${MK_CFG:-$HOME/.config/mugenknock}"
HOOKS_CONF="${HOOKS_CONF:-$MK_CFG/hooks.conf}"
MK_REPO="${MK_REPO:-/home/yuzuki/aws-quiz-app}"

# 初回は既存挙動(30分前=生成 / 15分前=検証)をデフォルトとして書く
hooks_seed_defaults() {
  [ -f "$HOOKS_CONF" ] && return 0
  mkdir -p "$MK_CFG"
  cat > "$HOOKS_CONF" << 'EOF'
# mugenknock フック設定 — ピンの何分前に何を実行するか
# 形式: 分前|スクリプト|ラベル   ( # 行と空行は無視。分前は正整数=ピンより前 )
# スクリプトは絶対パス、または scripts/ 配下の名前。
30|local-hook-run.sh|問題生成(01-generate --hard)
15|local-hook2-run.sh|妥当性検証(02-check-validity)
EOF
}

# 有効行を "分前<TAB>スクリプト<TAB>ラベル" で出力(分前の大きい順=実行が早い順)
hooks_list() {
  hooks_seed_defaults
  awk -F'|' '
    /^[[:space:]]*#/ {next} /^[[:space:]]*$/ {next}
    { m=$1; s=$2; l=$3;
      gsub(/^[ \t]+|[ \t]+$/,"",m); gsub(/^[ \t]+|[ \t]+$/,"",s); gsub(/^[ \t]+|[ \t]+$/,"",l);
      if (m ~ /^[0-9]+$/ && s!="") printf "%s\t%s\t%s\n", m, s, l }
  ' "$HOOKS_CONF" | sort -t"$(printf '\t')" -k1,1 -nr
}

# スクリプト名 → 絶対パス
hooks_resolve() {
  case "$1" in
    /*)   echo "$1" ;;
    */*)  echo "$MK_REPO/$1" ;;
    *)    echo "$MK_REPO/scripts/$1" ;;
  esac
}

# 設定を正規形(header + 分前|スクリプト|ラベル)で書き直す(add/rm用)。stdin から "分前<TAB>script<TAB>label" 行を受ける
hooks_rewrite() {
  mkdir -p "$MK_CFG"
  {
    echo "# mugenknock フック設定 — ピンの何分前に何を実行するか"
    echo "# 形式: 分前|スクリプト|ラベル   ( # 行と空行は無視。分前は正整数=ピンより前 )"
    echo "# スクリプトは絶対パス、または scripts/ 配下の名前。"
    while IFS="$(printf '\t')" read -r m s l; do
      [ -n "$m" ] || continue
      echo "${m}|${s}|${l}"
    done
  } > "$HOOKS_CONF"
}
