import boto3
import json
from datetime import datetime, timedelta, timezone

RECIPIENT = 'mugenknock@gmail.com'
SENDER = 'mugenknock@gmail.com'
REGION = 'ap-northeast-1'

SERVICE_NAMES = {
    'AWS Amplify': 'Amplify',
    'Amazon API Gateway': 'API Gateway',
    'AWS Lambda': 'Lambda',
    'Amazon DynamoDB': 'DynamoDB',
    'Amazon Simple Storage Service': 'S3',
    'Amazon CloudFront': 'CloudFront',
    'Amazon Cognito': 'Cognito',
    'Amazon Simple Email Service': 'SES',
    'Amazon Simple Notification Service': 'SNS',
    'AWS Systems Manager': 'SSM',
    'AWS Key Management Service': 'KMS',
    'Amazon CloudWatch': 'CloudWatch',
    'AWS Support': 'Support',
    'Amazon Route 53': 'Route 53',
}


def lambda_handler(event, context):
    jst = timezone(timedelta(hours=9))
    today = datetime.now(jst).date()
    week_start = today - timedelta(days=7)
    month_start = today.replace(day=1)

    ce = boto3.client('ce', region_name='us-east-1')

    # 週次サービス別コスト
    weekly_resp = ce.get_cost_and_usage(
        TimePeriod={'Start': str(week_start), 'End': str(today)},
        Granularity='MONTHLY',
        Metrics=['UnblendedCost'],
        GroupBy=[{'Type': 'DIMENSION', 'Key': 'SERVICE'}],
    )

    # 月次合計（月初〜今日）
    monthly_resp = ce.get_cost_and_usage(
        TimePeriod={'Start': str(month_start), 'End': str(today)},
        Granularity='MONTHLY',
        Metrics=['UnblendedCost'],
    )

    # 週次日別合計
    daily_resp = ce.get_cost_and_usage(
        TimePeriod={'Start': str(week_start), 'End': str(today)},
        Granularity='DAILY',
        Metrics=['UnblendedCost'],
    )

    # サービス別集計
    services = []
    for group in (weekly_resp['ResultsByTime'] or [{}])[0].get('Groups', []):
        name = group['Keys'][0]
        amount = float(group['Metrics']['UnblendedCost']['Amount'])
        if amount >= 0.001:
            short = SERVICE_NAMES.get(name, name)
            services.append((short, amount))
    services.sort(key=lambda x: -x[1])

    weekly_total = sum(a for _, a in services)
    monthly_total = float(
        (monthly_resp['ResultsByTime'] or [{}])[0]
        .get('Total', {}).get('UnblendedCost', {}).get('Amount', '0')
    )

    # 日別コスト
    daily_rows = []
    for r in daily_resp['ResultsByTime']:
        d = r['TimePeriod']['Start']
        amt = float(r['Total']['UnblendedCost']['Amount'])
        daily_rows.append((d, amt))

    # HTML 生成
    service_rows = ''.join(
        f'<tr><td style="padding:6px 12px;border-bottom:1px solid #eee">{name}</td>'
        f'<td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:right">${amt:.4f}</td></tr>'
        for name, amt in services
    )
    daily_html = ''.join(
        f'<tr><td style="padding:4px 12px;border-bottom:1px solid #eee">{d}</td>'
        f'<td style="padding:4px 12px;border-bottom:1px solid #eee;text-align:right">${amt:.4f}</td></tr>'
        for d, amt in daily_rows
    )

    subject = f'[AWS Quiz App] 週次コストレポート {week_start} 〜 {today}'
    html_body = f"""
<html><body style="font-family:sans-serif;color:#333;max-width:600px;margin:0 auto">
<h2 style="color:#232f3e;border-bottom:3px solid #ff9900;padding-bottom:8px">
  AWS Quiz App 週次コストレポート
</h2>
<p style="color:#666;font-size:14px">集計期間: {week_start} 〜 {today}（JST）</p>

<table style="width:100%;border-collapse:collapse;margin-bottom:24px">
  <tr style="background:#f5f5f5">
    <td style="padding:10px 12px;font-weight:bold">今週の合計</td>
    <td style="padding:10px 12px;font-weight:bold;text-align:right;font-size:20px;color:#e07b00">${weekly_total:.4f} USD</td>
  </tr>
  <tr style="background:#fafafa">
    <td style="padding:8px 12px;color:#666">月初からの合計（{month_start}〜）</td>
    <td style="padding:8px 12px;text-align:right;color:#666">${monthly_total:.4f} USD</td>
  </tr>
</table>

<h3 style="color:#232f3e;margin-top:0">サービス別内訳（今週）</h3>
<table style="width:100%;border-collapse:collapse;margin-bottom:24px;font-size:14px">
  <tr style="background:#232f3e;color:#fff">
    <th style="padding:8px 12px;text-align:left">サービス</th>
    <th style="padding:8px 12px;text-align:right">コスト (USD)</th>
  </tr>
  {service_rows}
  <tr style="background:#fff3cd">
    <td style="padding:8px 12px;font-weight:bold">合計</td>
    <td style="padding:8px 12px;font-weight:bold;text-align:right">${weekly_total:.4f}</td>
  </tr>
</table>

<h3 style="color:#232f3e;margin-top:0">日別コスト（今週）</h3>
<table style="width:100%;border-collapse:collapse;font-size:13px">
  <tr style="background:#232f3e;color:#fff">
    <th style="padding:6px 12px;text-align:left">日付</th>
    <th style="padding:6px 12px;text-align:right">コスト (USD)</th>
  </tr>
  {daily_html}
</table>

<p style="color:#999;font-size:12px;margin-top:24px">
  ※ Cost Explorer の集計は実際の請求と若干異なる場合があります。<br>
  ※ このメールは毎週月曜日 9:00 JST に自動送信されます。
</p>
</body></html>
"""

    ses = boto3.client('ses', region_name=REGION)
    ses.send_email(
        Source=SENDER,
        Destination={'ToAddresses': [RECIPIENT]},
        Message={
            'Subject': {'Data': subject, 'Charset': 'UTF-8'},
            'Body': {'Html': {'Data': html_body, 'Charset': 'UTF-8'}},
        },
    )

    return {'statusCode': 200, 'body': json.dumps({'sent': True, 'weeklyTotal': weekly_total})}
