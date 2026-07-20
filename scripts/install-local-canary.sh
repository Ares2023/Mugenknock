#!/bin/bash
# ローカル(手元PC/WSL)にcanary定期実行のsystemd userタイマーを設置する。
#
# 背景: Fargate夜間バッチにはPlaywright(約1.5GB)を同梱しない方針のため、canaryは
# ローカルで実行しS3(mugenknock-error-logs/canary-logs/)へ結果を上げ、夜間レポート
# (99-send-report / 毎日00:02)がS3の最新結果を読む。本タイマーはレポートの少し前
# (23:50 JST)にcanary(prod)を走らせる。PC/WSLが停止中はスキップされ、レポートは
# 「古い」警告を出す(壊れはしない)。
#
# 使い方: ./scripts/install-local-canary.sh   (再実行で上書き・再有効化)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
UNIT_DIR="$HOME/.config/systemd/user"
mkdir -p "$UNIT_DIR"

cat > "$UNIT_DIR/mugenknock-canary.service" << EOF
[Unit]
Description=mugenknock canary test (nightly, before daily report)
After=network-online.target

[Service]
Type=oneshot
WorkingDirectory=${REPO_ROOT}
ExecStart=/bin/bash -lc 'cd ${REPO_ROOT} && ./prompts/night-prompts/scripts/canary.sh prod'
EOF

cat > "$UNIT_DIR/mugenknock-canary.timer" << 'EOF'
[Unit]
Description=Run mugenknock canary nightly at 23:50 JST (before 00:02 report)

[Timer]
OnCalendar=*-*-* 23:50:00
Persistent=true

[Install]
WantedBy=timers.target
EOF

systemctl --user daemon-reload
systemctl --user enable --now mugenknock-canary.timer
loginctl enable-linger "$USER" 2>/dev/null || true

echo "✓ canaryタイマーを設置・有効化しました"
systemctl --user list-timers mugenknock-canary.timer --all --no-legend
echo ""
echo "手動実行: systemctl --user start mugenknock-canary.service"
echo "ログ:     journalctl --user -u mugenknock-canary.service -n 40"
