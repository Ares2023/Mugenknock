from datetime import datetime, timedelta

def get_next_run_time(now=None):
    if now is None:
        now = datetime.now()
    
    # 1. 10分単位で切り捨て (セッション開始基準)
    base_time = now.replace(minute=(now.minute // 10) * 10, second=0, microsecond=0)
    
    # 2. 5時間5分を加算
    # (5時間で回復 + 5分のバッファ)
    next_run = base_time + timedelta(hours=5, minutes=5)
    
    return next_run

if __name__ == "__main__":
    now = datetime.now()
    next_run = get_next_run_time(now)
    print(f"Current:  {now.strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"Session:  {now.replace(minute=(now.minute // 10) * 10, second=0, microsecond=0).strftime('%H:%M:%S')}")
    print(f"Next Run: {next_run.strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"Systemd:  {next_run.strftime('%Y-%m-%d %H:%M:00')}")
