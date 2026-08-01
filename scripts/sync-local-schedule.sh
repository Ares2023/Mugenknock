#!/bin/bash
# EventBridgeのピンスケジュール(=トークンリセット基準時刻の唯一の正)を読み、
# ローカルsystemd userタイマーをその「次回ピン時刻」に同期する。
#
# ドリフト構成: EventBridgeのピンは at(次回) を保持し、Fargateがピン完了ごとに
# now+5h へ更新する(5時間ごと・毎日ずれる)。ローカルは次回ピン時刻を読み、
#   - mugenknock-hook     : 次回ピンの30分前(妥当性確認・トークン消化)
#   - mugenknock-hook2    : 次回ピンの15分前(妥当性確認・hookと並走)
#   - mugenknock-postping : 次回ピンの10分後(=このスクリプトを再実行して次サイクルへ
#                           自己再アーム。夜間サイクルなら夜間バッチも実行)
# を一発(one-shot)で仕込む。postpingが毎サイクル自身を再アームして追従する。
#
# watchdog: 次回ピンが過去(=ピン連鎖が壊れた/PC復帰直後)なら EventBridge を
# at(now+5h) に張り直してから同期する。
set -euo pipefail

AWS=/home/yuzuki/local/bin/aws
REGION=ap-northeast-1
PROJECT=mugenknock
SCHEDULE_NAME="${PROJECT}-ping"
REPO=/home/yuzuki/aws-quiz-app
UNIT_DIR="$HOME/.config/systemd/user"
ACCT=$("$AWS" sts get-caller-identity --query Account --output text --region "$REGION" 2>/dev/null || echo "")
S3="${PROJECT}-fargate-state-${ACCT}"

# ── メールアラート送信（~/.mugenknock_mail.conf 使用・失敗してもスクリプトは止めない）──
# ピン連鎖切れ(watchdog)検知時に mugenknock@gmail.com へ通知する。
_send_alert() {
  local subject="$1" body="$2"
  local mail_conf="${HOME}/.mugenknock_mail.conf"
  local SMTP_USER="" SMTP_PASS="" SMTP_TO="mugenknock@gmail.com"
  [ -f "$mail_conf" ] && source "$mail_conf"
  local smtp_user="$SMTP_USER" smtp_pass="$SMTP_PASS" smtp_to="${SMTP_TO:-mugenknock@gmail.com}"
  if [ -z "$smtp_user" ] || [ -z "$smtp_pass" ]; then
    echo "  ⚠️ メール設定未設定のためアラート送信スキップ ($mail_conf)"; return 0
  fi
  local _res
  _res=$(ALERT_USER="$smtp_user" ALERT_PASS="$smtp_pass" ALERT_TO="$smtp_to" \
         ALERT_SUBJECT="$subject" ALERT_BODY="$body" python3 << 'PYEOF'
import smtplib, ssl, os
from email.mime.text import MIMEText
u = os.environ['ALERT_USER']; p = os.environ['ALERT_PASS']; to = os.environ['ALERT_TO']
msg = MIMEText(os.environ['ALERT_BODY'], 'plain', 'utf-8')
msg['Subject'] = os.environ['ALERT_SUBJECT']; msg['From'] = u; msg['To'] = to
try:
    ctx = ssl.create_default_context()
    with smtplib.SMTP("smtp.gmail.com", 587) as s:
        s.ehlo(); s.starttls(context=ctx); s.ehlo(); s.login(u, p)
        s.sendmail(u, to, msg.as_string())
    print("SENT")
except Exception as e:
    print(f"FAIL:{e}")
PYEOF
) || true
  echo "  📧 アラートメール: ${_res} → ${smtp_to}"
}

EXPR=$("$AWS" scheduler get-schedule --name "$SCHEDULE_NAME" --region "$REGION" \
  --query "ScheduleExpression" --output text 2>/dev/null || echo "")
STATE=$("$AWS" scheduler get-schedule --name "$SCHEDULE_NAME" --region "$REGION" \
  --query "State" --output text 2>/dev/null || echo "")
[ -z "$EXPR" ] && { echo "❌ EventBridgeスケジュール($SCHEDULE_NAME)が取得できません"; exit 1; }

mkdir -p "$UNIT_DIR"

# DISABLED(ct cancel)ならローカルタイマーも停止して終了
if [ "$STATE" = "DISABLED" ]; then
  systemctl --user disable --now mugenknock-hook.timer mugenknock-postping.timer 2>/dev/null || true
  echo "スケジュール停止中(DISABLED) → ローカルタイマー停止"
  exit 0
fi

# 前回夜間実行日(once/day判定用)
LAST_RUN_DATE=$("$AWS" s3 cp "s3://$S3/meta/.last_run_date" - --quiet 2>/dev/null | tr -d '\n' || echo "")

# 次回ピン時刻を算出(at/cron両対応)。過去なら now+5h とみなす(watchdog)。
read -r NEXT_DT RUN_NIGHT STALE < <(python3 - "$EXPR" "$LAST_RUN_DATE" << 'PYEOF'
import sys, re
from datetime import datetime, timedelta
expr, last_run_date = sys.argv[1].strip(), (sys.argv[2].strip() if len(sys.argv) > 2 else "")
now = datetime.now()
# 分を一桁切り捨て(10分単位)して +5時間（Claudeのトークン枠のリセット則。例:15:23→15:20→20:20）
def next5(base):
    return base.replace(minute=(base.minute // 10) * 10, second=0, microsecond=0) + timedelta(hours=5)
a = re.match(r'at\((\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})\)', expr)
c = re.match(r'cron\((\d+)\s+([\d,]+)\s', expr)
if a:
    dt = datetime.strptime(expr[3:-1], '%Y-%m-%dT%H:%M:%S')
elif c:
    minute = int(c.group(1)); hours = sorted(int(h) for h in c.group(2).split(','))
    cand = []
    for d in (0, 1):
        day = now + timedelta(days=d)
        for h in hours:
            t = day.replace(hour=h, minute=minute, second=0, microsecond=0)
            if t > now: cand.append(t)
    dt = min(cand)
else:
    dt = next5(now)
stale = 0
if dt <= now + timedelta(minutes=1):   # 過去/直近=連鎖切れ → 張り直し
    dt = next5(now); stale = 1
# 夜間サイクル判定: 次回ピンが 0:00-4:59 かつ その日まだ夜間未実行
run_night = 1 if (dt.hour < 5 and last_run_date != dt.strftime('%Y-%m-%d')) else 0
print(dt.strftime('%Y-%m-%dT%H:%M:%S'), run_night, stale)
PYEOF
)

# watchdog: 連鎖が切れていたら EventBridge を at(NEXT_DT) に張り直す＋メール通知
if [ "$STALE" = "1" ]; then
  TARGET_JSON=$("$AWS" scheduler get-schedule --name "$SCHEDULE_NAME" --region "$REGION" \
    --output json 2>/dev/null | python3 -c "import sys,json; print(json.dumps(json.load(sys.stdin)['Target']))")
  "$AWS" scheduler update-schedule --name "$SCHEDULE_NAME" \
    --schedule-expression "at(${NEXT_DT})" --schedule-expression-timezone "Asia/Tokyo" \
    --flexible-time-window '{"Mode":"OFF"}' --state ENABLED --target "$TARGET_JSON" \
    --region "$REGION" > /dev/null 2>&1 \
  && echo "⚠️ ピン連鎖切れを検出 → EventBridgeを at(${NEXT_DT}) に張り直し" || true
  # 障害通知: 連鎖切れ=前回ピンが再スケジュールに失敗（今回のような不調）。メールで知らせる。
  _send_alert "[mugenknock] ⚠️ Fargateピン連鎖切れを検出・自動復旧" \
"Fargateピンのドリフト連鎖が切れていました（EventBridgeの次回ピンが過去 = 前回ピンが次回を再スケジュールできていない）。

ローカルのウォッチドッグが EventBridge を張り直して自動復旧しました。
  検知時刻     : $(date '+%Y-%m-%d %H:%M:%S %Z')
  復旧後の次回ピン: ${NEXT_DT/T/ } JST

再発する場合は、Fargateタスクロール(mugenknock-fargate-task)のscheduler権限、
またはFargateイメージ/認証(S3のOAuth資格情報)を確認してください。"
fi

# 次回ピンから hook(-30分) / hook2(-15分) / postping(+10分) の絶対時刻を算出
HOOK_CAL=$(python3 -c "from datetime import datetime,timedelta; print((datetime.strptime('$NEXT_DT','%Y-%m-%dT%H:%M:%S')-timedelta(minutes=30)).strftime('%Y-%m-%d %H:%M:00'))")
HOOK2_CAL=$(python3 -c "from datetime import datetime,timedelta; print((datetime.strptime('$NEXT_DT','%Y-%m-%dT%H:%M:%S')-timedelta(minutes=15)).strftime('%Y-%m-%d %H:%M:00'))")
POST_CAL=$(python3 -c "from datetime import datetime,timedelta; print((datetime.strptime('$NEXT_DT','%Y-%m-%dT%H:%M:%S')+timedelta(minutes=10)).strftime('%Y-%m-%d %H:%M:00'))")

# hook タイマー(one-shot)
cat > "$UNIT_DIR/mugenknock-hook.service" << EOF
[Unit]
Description=mugenknock local validity hook (before ping)

[Service]
Type=oneshot
WorkingDirectory=${REPO}
ExecStart=/bin/bash -lc '${REPO}/scripts/local-hook-run.sh'
EOF
cat > "$UNIT_DIR/mugenknock-hook.timer" << EOF
[Unit]
Description=mugenknock hook timer (synced from EventBridge ${SCHEDULE_NAME})

[Timer]
OnCalendar=${HOOK_CAL}
Persistent=true

[Install]
WantedBy=timers.target
EOF

# hook2 タイマー(one-shot): ピン15分前に問題生成
cat > "$UNIT_DIR/mugenknock-hook2.service" << EOF
[Unit]
Description=mugenknock local generate hook (before ping)

[Service]
Type=oneshot
WorkingDirectory=${REPO}
ExecStart=/bin/bash -lc '${REPO}/scripts/local-hook2-run.sh'
EOF
cat > "$UNIT_DIR/mugenknock-hook2.timer" << EOF
[Unit]
Description=mugenknock hook2 timer (synced from EventBridge ${SCHEDULE_NAME})

[Timer]
OnCalendar=${HOOK2_CAL}
Persistent=true

[Install]
WantedBy=timers.target
EOF

# postping タイマー(one-shot): 再同期 + (夜間サイクルなら)夜間バッチ
cat > "$UNIT_DIR/mugenknock-postping.service" << EOF
[Unit]
Description=mugenknock post-ping resync (+ night batch on night cycle)

[Service]
Type=oneshot
WorkingDirectory=${REPO}
Environment=RUN_NIGHT=${RUN_NIGHT}
ExecStart=/bin/bash -lc '${REPO}/scripts/local-postping-run.sh'
EOF
cat > "$UNIT_DIR/mugenknock-postping.timer" << EOF
[Unit]
Description=mugenknock post-ping timer (synced from EventBridge ${SCHEDULE_NAME})

[Timer]
OnCalendar=${POST_CAL}
Persistent=true

[Install]
WantedBy=timers.target
EOF

systemctl --user daemon-reload
systemctl --user enable mugenknock-hook.timer mugenknock-hook2.timer mugenknock-postping.timer >/dev/null 2>&1 || true
# one-shot絶対時刻タイマーは restart で新OnCalendarを反映
systemctl --user restart mugenknock-hook.timer mugenknock-hook2.timer mugenknock-postping.timer 2>/dev/null || \
  systemctl --user start mugenknock-hook.timer mugenknock-hook2.timer mugenknock-postping.timer 2>/dev/null || true
loginctl enable-linger "$USER" 2>/dev/null || true

echo "✓ ローカルタイマーを EventBridge(${EXPR}) に同期"
echo "  次回ピン : ${NEXT_DT/T/ }"
echo "  hook     : ${HOOK_CAL}"
echo "  hook2    : ${HOOK2_CAL}"
echo "  postping : ${POST_CAL}  (RUN_NIGHT=${RUN_NIGHT})"
