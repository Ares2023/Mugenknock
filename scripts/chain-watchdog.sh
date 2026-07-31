#!/bin/bash
# ローカルタイマー連鎖の死活監視（定期実行・保険）。
#
# hook/postping は「次回ピン基準の一発(one-shot)タイマー」で、postping 自身が
# sync-local-schedule.sh を呼んで次サイクルを仕込むことで連鎖している。
# この自己再アームが一度でも失敗すると Trigger:n/a のまま永久に止まり、
# 夜間バッチも監査メールも静かに来なくなる（2026-07-30 に発生）。
#
# ここでは「postping.timer に未来の発火予定が無い」= 連鎖切れ とみなし、
# sync-local-schedule.sh で張り直す。連鎖が生きている間は何もしない。
set -uo pipefail
export TZ=Asia/Tokyo
export PATH="/usr/local/bin:/usr/bin:/bin:$HOME/local/bin:$PATH"

REPO=/home/yuzuki/aws-quiz-app

log() { printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }

# DISABLED(ct cancel)中は意図的な停止なので触らない
STATE=$(/home/yuzuki/local/bin/aws scheduler get-schedule --name mugenknock-ping \
  --region ap-northeast-1 --query "State" --output text 2>/dev/null || echo "")
if [ "$STATE" = "DISABLED" ]; then
  log "スケジュール停止中(DISABLED) → 何もしない"
  exit 0
fi

# NextElapseUSecRealtime=0 は「次回発火予定なし」
NEXT=$(systemctl --user show mugenknock-postping.timer \
  -p NextElapseUSecRealtime --value 2>/dev/null || echo "0")

if [ "${NEXT:-0}" != "0" ] && [ -n "${NEXT:-}" ]; then
  log "連鎖は正常（postping 次回発火あり） → 何もしない"
  exit 0
fi

log "⚠️ 連鎖切れを検出（postping.timer に次回発火予定なし） → 再アームします"
bash "$REPO/scripts/sync-local-schedule.sh" || true

NEXT2=$(systemctl --user show mugenknock-postping.timer \
  -p NextElapseUSecRealtime --value 2>/dev/null || echo "0")
if [ "${NEXT2:-0}" = "0" ]; then
  log "❌ 再アームに失敗しました（sync-local-schedule.sh の出力を確認してください）"
  exit 1
fi
log "✓ 再アーム完了"

# 通知（~/.mugenknock_mail.conf があるときのみ。失敗しても止めない）
# 動作確認で実メールを飛ばしたくないときは NO_MAIL=1 を付けて実行する。
MAIL_CONF="${HOME}/.mugenknock_mail.conf"
if [ "${NO_MAIL:-0}" = "1" ]; then
  log "NO_MAIL=1 のため通知メールはスキップ"
elif [ -f "$MAIL_CONF" ]; then
  # shellcheck disable=SC1090
  source "$MAIL_CONF"
  ALERT_USER="${SMTP_USER:-}" ALERT_PASS="${SMTP_PASS:-}" \
  ALERT_TO="${SMTP_TO:-mugenknock@gmail.com}" \
  ALERT_WHEN="$(date '+%Y-%m-%d %H:%M:%S %Z')" \
  python3 << 'PYEOF' 2>/dev/null || true
import smtplib, ssl, os
from email.mime.text import MIMEText
u, p = os.environ.get('ALERT_USER'), os.environ.get('ALERT_PASS')
if u and p:
    m = MIMEText(
        'ローカルタイマー連鎖(hook/postping)が切れていたため自動復旧しました。\n\n'
        f'  検知時刻: {os.environ["ALERT_WHEN"]}\n\n'
        'postping の自己再アームが失敗すると夜間バッチ・監査メールが停止します。\n'
        'journalctl --user -u mugenknock-postping.service で直近の実行を確認してください。',
        'plain', 'utf-8')
    m['Subject'] = '[mugenknock] ⚠️ ローカルタイマー連鎖切れを自動復旧'
    m['From'], m['To'] = u, os.environ['ALERT_TO']
    with smtplib.SMTP('smtp.gmail.com', 587) as s:
        s.starttls(context=ssl.create_default_context())
        s.login(u, p)
        s.send_message(m)
PYEOF
fi
