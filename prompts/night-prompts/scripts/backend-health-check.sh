#!/bin/bash
# バックエンド稼働・コスト監視（読み取り専用）
#
# 直近24hの本番バックエンド健全性とAWSコストを集計し、コンパクトなサマリを stdout に出力する。
# 99-send-report.sh がこれを実行して日次メールの「バックエンド稼働・コスト」へ載せる。
# 単体実行も可（手動確認用）。CloudWatch / CloudWatch Logs / Cost Explorer を読むのみで変更しない。
#
# 高速化: CloudWatchは get-metric-data で全メトリクスを1回のAPIで取得、CEも2日分を1回で取得。

set -uo pipefail
AWS=/home/yuzuki/local/bin/aws
REGION=ap-northeast-1
CE_REGION=us-east-1                 # Cost Explorer は us-east-1 エンドポイント
API_NAME=awsquizapi
PROD_LOG_GROUP=/aws/lambda/awsquizHandler-prod

AWS="$AWS" REGION="$REGION" CE_REGION="$CE_REGION" API_NAME="$API_NAME" \
PROD_LOG_GROUP="$PROD_LOG_GROUP" python3 << 'PYEOF'
import os, subprocess, json, tempfile
from datetime import datetime, timezone, timedelta

AWS = os.environ['AWS']; REGION = os.environ['REGION']; CE_REGION = os.environ['CE_REGION']
API_NAME = os.environ['API_NAME']; PROD_LOG_GROUP = os.environ['PROD_LOG_GROUP']

now = datetime.now(timezone.utc)
start = now - timedelta(hours=24)
S = start.strftime('%Y-%m-%dT%H:%M:%SZ'); E = now.strftime('%Y-%m-%dT%H:%M:%SZ')
out = []

# ── CloudWatch: 全メトリクスを1回の get-metric-data で取得 ──
def lam(fn, metric, stat):
    return {'Id': f'l_{fn.split("-")[-1]}_{metric.lower()}', 'MetricStat': {
        'Metric': {'Namespace': 'AWS/Lambda', 'MetricName': metric,
                   'Dimensions': [{'Name': 'FunctionName', 'Value': fn}]},
        'Period': 86400, 'Stat': stat}}
def api(metric, stat):
    return {'Id': f'a_{metric.lower()}', 'MetricStat': {
        'Metric': {'Namespace': 'AWS/ApiGateway', 'MetricName': metric,
                   'Dimensions': [{'Name': 'ApiName', 'Value': API_NAME}, {'Name': 'Stage', 'Value': 'prod'}]},
        'Period': 86400, 'Stat': stat}}

queries = []
for fn in ('awsquizHandler-prod', 'awsquizHandler-dev'):
    queries += [lam(fn, 'Invocations', 'Sum'), lam(fn, 'Errors', 'Sum'),
                lam(fn, 'Throttles', 'Sum'), lam(fn, 'Duration', 'Maximum')]
queries += [api('Count', 'Sum'), api('5XXError', 'Sum'), api('4XXError', 'Sum'), api('Latency', 'p99')]

vals = {}
try:
    qf = tempfile.mktemp(suffix='.json')
    with open(qf, 'w') as f:
        json.dump(queries, f)
    r = subprocess.run([AWS, 'cloudwatch', 'get-metric-data',
        '--start-time', S, '--end-time', E, '--region', REGION,
        '--metric-data-queries', f'file://{qf}', '--output', 'json'],
        capture_output=True, text=True, timeout=60)
    os.unlink(qf)
    for res in json.loads(r.stdout).get('MetricDataResults', []):
        v = res.get('Values', [])
        vals[res['Id']] = v[0] if v else 0.0
except Exception:
    vals = {}

def g(key):
    v = vals.get(key)
    return '?' if v is None else (f'{v:.0f}' if isinstance(v, float) else str(v))

out.append('Lambda(直近24h):')
for fn in ('prod', 'dev'):
    err = vals.get(f'l_{fn}_errors') or 0
    mark = '⚠️ ' if err > 0 else ''
    out.append(f"  {mark}{fn}: 実行{g(f'l_{fn}_invocations')} エラー{g(f'l_{fn}_errors')} "
               f"スロットル{g(f'l_{fn}_throttles')} 最大{g(f'l_{fn}_duration')}ms")
e5 = vals.get('a_5xxerror') or 0
mark5 = '⚠️ ' if e5 > 0 else ''
out.append(f"API(prod,24h): リクエスト{g('a_count')} {mark5}5xx={g('a_5xxerror')} 4xx={g('a_4xxerror')} p99={g('a_latency')}ms")

# ── 本番エラー（prod Lambda ログから直近24hのエラー行）──
try:
    start_ms = int(start.timestamp() * 1000)
    r = subprocess.run([AWS, 'logs', 'filter-log-events', '--log-group-name', PROD_LOG_GROUP,
        '--start-time', str(start_ms), '--region', REGION, '--max-items', '40',
        '--filter-pattern', '?Error ?ERROR ?Exception ?"Task timed out" ?Unhandled',
        '--output', 'json'], capture_output=True, text=True, timeout=45)
    evs = json.loads(r.stdout).get('events', [])
    mark = '⚠️ ' if evs else ''
    out.append(f"{mark}本番エラーログ(prod,24h): {len(evs)}件")
    for ev in evs[:3]:
        out.append(f"  ・{' '.join(ev.get('message', '').split())[:160]}")
except Exception:
    out.append("本番エラーログ(prod,24h): 取得失敗")

# ── コスト（昨日 + 前日を1回のCEで取得・サービス別）──
try:
    d2 = (now - timedelta(days=2)).strftime('%Y-%m-%d')
    today = now.strftime('%Y-%m-%d')
    r = subprocess.run([AWS, 'ce', 'get-cost-and-usage',
        '--time-period', f'Start={d2},End={today}', '--granularity', 'DAILY',
        '--metrics', 'UnblendedCost', '--group-by', 'Type=DIMENSION,Key=SERVICE',
        '--region', CE_REGION, '--output', 'json'], capture_output=True, text=True, timeout=45)
    rt = json.loads(r.stdout)['ResultsByTime']
    def day_total(res):
        gs = {x['Keys'][0]: float(x['Metrics']['UnblendedCost']['Amount']) for x in res.get('Groups', [])}
        return (sum(gs.values()), gs)
    (t_p, _), (t_y, g_y) = day_total(rt[0]), day_total(rt[-1])
    yday = rt[-1]['TimePeriod']['Start']
    delta = ''
    if t_p:
        pct = (t_y - t_p) / t_p * 100
        delta = f"（前日比 {'▲' if pct >= 0 else '▼'}{abs(pct):.0f}%）"
    out.append(f"AWSコスト({yday}): ${t_y:.2f} {delta}")
    for svc, amt in sorted(g_y.items(), key=lambda x: -x[1])[:3]:
        if amt >= 0.005:
            out.append(f"  ・{svc}: ${amt:.2f}")
except Exception:
    out.append("AWSコスト: 取得失敗")

print('\n'.join(out))
PYEOF
