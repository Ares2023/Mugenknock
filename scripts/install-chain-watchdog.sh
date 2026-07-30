#!/bin/bash
# ローカルタイマー連鎖の死活監視タイマーを設置する。
#
# 背景: hook/postping は「次回ピン基準の一発(one-shot)タイマー」で、postping 自身が
# sync-local-schedule.sh を呼んで次サイクルを仕込むことで連鎖している。この自己再アームが
# 一度でも失敗すると Trigger:n/a のまま永久に止まり、夜間バッチも監査メールも静かに
# 来なくなる（2026-07-30 に発生: 夜間バッチが66分走り、その最中に来る予定だった
# postping の発火を systemd が二重起動しないため取りこぼした）。
#
# 本タイマーは2時間おきに連鎖の生死だけを見て、切れていれば張り直す。
# 連鎖が生きている間は何もしない。
#
# 使い方: ./scripts/install-chain-watchdog.sh   (再実行で上書き・再有効化)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
UNIT_DIR="$HOME/.config/systemd/user"
mkdir -p "$UNIT_DIR"

cat > "$UNIT_DIR/mugenknock-chainwatch.service" << EOF
[Unit]
Description=mugenknock local timer chain watchdog (re-arm if postping chain died)
After=network-online.target

[Service]
Type=oneshot
WorkingDirectory=${REPO_ROOT}
ExecStart=/bin/bash -lc '${REPO_ROOT}/scripts/chain-watchdog.sh'
EOF

cat > "$UNIT_DIR/mugenknock-chainwatch.timer" << 'EOF'
[Unit]
Description=mugenknock chain watchdog timer (every 2h)

[Timer]
# 2時間おき。連鎖が生きている間は何もしないので頻度は安全側に倒してよい。
OnCalendar=*-*-* 00/2:15:00
# PC/WSLが止まっていて逃した場合は次回起動時に走らせる（復帰直後の連鎖切れを拾う）。
Persistent=true

[Install]
WantedBy=timers.target
EOF

systemctl --user daemon-reload
systemctl --user enable --now mugenknock-chainwatch.timer
loginctl enable-linger "$USER" 2>/dev/null || true

echo "✓ 連鎖ウォッチドッグを設置・有効化しました"
systemctl --user list-timers mugenknock-chainwatch.timer --all --no-legend
echo ""
echo "手動実行(メール抑止): NO_MAIL=1 ./scripts/chain-watchdog.sh"
echo "ログ:                journalctl --user -u mugenknock-chainwatch.service -n 40"
