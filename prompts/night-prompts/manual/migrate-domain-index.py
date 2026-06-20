#!/usr/bin/env python3
"""
DB マイグレーションスクリプト: tags -> domain インデックス変換
boto3 直接呼び出し + 並列処理版（高速）

使い方:
  python3 migrate-domain-index.py            # dry-run
  python3 migrate-domain-index.py --execute  # 実際に更新
  python3 migrate-domain-index.py --execute --workers 20  # 並列数指定（default: 20）
"""

import sys
import json
import re
import os
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor, as_completed

import boto3
from boto3.dynamodb.types import TypeSerializer, TypeDeserializer

DRY_RUN = '--execute' not in sys.argv
WORKERS = 20
for i, a in enumerate(sys.argv):
    if a == '--workers' and i + 1 < len(sys.argv):
        WORKERS = int(sys.argv[i + 1])

REGION = 'ap-northeast-1'
dynamodb = boto3.client('dynamodb', region_name=REGION)
deser = TypeDeserializer()

EXAM_DOMAINS = {
    'CLF': ['クラウドの概念', 'セキュリティとコンプライアンス', 'クラウドのテクノロジーとサービス', '請求、料金、およびサポート'],
    'SAA': ['セキュアなアーキテクチャの設計', '弾力性に優れたアーキテクチャの設計', '高性能なアーキテクチャの設計', 'コスト最適化されたアーキテクチャの設計'],
    'SAP': ['組織の複雑さに対応する設計', '新しいソリューションのための設計', '既存のソリューションの継続的改善', 'ワークロードの移行とモダン化の加速'],
    'DVA': ['AWSのサービスを使用した開発', 'セキュリティ', 'デプロイ', 'トラブルシューティングと最適化'],
    'SOA': ['モニタリング、ロギング、分析、修復、およびパフォーマンスの最適化', '信頼性とビジネス継続性', 'デプロイ、プロビジョニング、および自動化', 'セキュリティとコンプライアンス', 'ネットワークとコンテンツ配信'],
    'DOP': ['SDLC の自動化', '構成管理と Infrastructure as Code (IaC)', '弾力性に優れたクラウドソリューション', 'モニタリングとロギング', 'インシデントとイベントへの対応', 'セキュリティとコンプライアンス'],
    'AIF': ['AIとMLの基礎', '生成AIの基礎', '基盤モデルのアプリケーション', '責任あるAIのガイドライン', 'AIソリューションのセキュリティ、コンプライアンス、ガバナンス'],
    'MLA': ['機械学習のためのデータ準備', 'MLモデルの開発', 'MLワークフローのデプロイとオーケストレーション', 'MLソリューションの監視、メンテナンス、セキュリティ'],
    'GAI': ['基盤モデルの統合、データ管理、コンプライアンス', '実装と統合', 'AIの安全性、セキュリティ、ガバナンス', '生成AIアプリケーションの運用効率と最適化', 'テスト、検証、トラブルシューティング'],
    'DEA': ['データの取り込みと変換', 'データストアの管理', 'データオペレーションとサポート', 'データのセキュリティとガバナンス'],
    'ANS': ['ネットワーク設計', 'ネットワーク実装', 'ネットワーク管理と運用', 'ネットワークのセキュリティ、コンプライアンス、ガバナンス'],
    'SCS': ['検出', 'インシデント対応', 'インフラストラクチャのセキュリティ', 'アイデンティティとアクセス管理', 'データ保護', 'セキュリティの基盤とガバナンス'],
}

DOMAIN_ALIASES = {
    'クラウドのコンセプト': 'クラウドの概念',
    'クラウドテクノロジーとサービス': 'クラウドのテクノロジーとサービス',
    '請求・料金・サポート': '請求、料金、およびサポート',
    '高パフォーマンスなアーキテクチャの設計': '高性能なアーキテクチャの設計',
    '新しいソリューションの設計': '新しいソリューションのための設計',
    '既存ソリューションの継続的改善': '既存のソリューションの継続的改善',
    '組織の複雑さに対応したソリューションの設計': '組織の複雑さに対応する設計',
    'ワークロードの移行とモダナイゼーション': 'ワークロードの移行とモダン化の加速',
    '設定管理と IaC': '構成管理と Infrastructure as Code (IaC)',
    'セキュリティとコンプライアンスの自動化': 'セキュリティとコンプライアンス',
    'モニタリングとログ': 'モニタリングとロギング',
    '高可用性、耐障害性、およびディザスタリカバリ': '信頼性とビジネス継続性',
    '生成AIソリューションの設計と評価': '基盤モデルの統合、データ管理、コンプライアンス',
    '基盤モデルのカスタマイズとファインチューニング': '実装と統合',
    '生成AIアプリケーションの実装とデプロイ': '生成AIアプリケーションの運用効率と最適化',
    'エージェントとオーケストレーションのアーキテクチャ': 'テスト、検証、トラブルシューティング',
    'セキュリティ、ガバナンス、責任あるAI': 'AIの安全性、セキュリティ、ガバナンス',
}

EXAM_DOMAIN_ALIASES = {
    'DOP': {'信頼性とビジネス継続性': '弾力性に優れたクラウドソリューション'},
    'SOA': {'弾力性に優れたクラウドソリューション': '信頼性とビジネス継続性'},
}

def to_int(v):
    """boto3 TypeDeserializer は Number を Decimal で返すので int に変換"""
    try: return int(v)
    except (TypeError, ValueError): return None

def q_domain_name(q):
    domain = q.get('domain')
    domain_int = to_int(domain)
    if domain_int is not None and isinstance(domain, (int, float)) or (domain_int is not None and not isinstance(domain, str)):
        return (EXAM_DOMAINS.get(q.get('examType', ''), []) + [''])[domain_int] or ''
    raw = domain if isinstance(domain, str) and domain else ((q.get('tags') or [''])[0])
    name = DOMAIN_ALIASES.get(raw, raw)
    name = EXAM_DOMAIN_ALIASES.get(q.get('examType', ''), {}).get(name, name)
    return name

def compute_cai(choices, correct_answers):
    label_re = re.compile(r'^[A-E]\.\s*')
    strip = lambda s: label_re.sub('', str(s)).strip()
    stripped = [strip(c) for c in choices]
    return sorted({stripped.index(strip(ca)) for ca in correct_answers if strip(ca) in stripped})

def scan_all():
    print("DynamoDB スキャン中...")
    items = []
    kwargs = {'TableName': 'Questions'}
    while True:
        resp = dynamodb.scan(**kwargs)
        for item in resp.get('Items', []):
            items.append({k: deser.deserialize(v) for k, v in item.items()})
        if 'LastEvaluatedKey' not in resp:
            break
        kwargs['ExclusiveStartKey'] = resp['LastEvaluatedKey']
    return items

def update_question_boto3(qid, domain_idx, new_cai, has_old_tags):
    now = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    update_parts = ['#dom = :di', 'updatedAt = :u']
    expr_names = {'#dom': 'domain'}
    expr_values = {':di': {'N': str(domain_idx)}, ':u': {'S': now}}

    if new_cai is not None:
        update_parts.append('correctAnswerIndices = :ci')
        expr_values[':ci'] = {'L': [{'N': str(i)} for i in new_cai]}

    update_expr = 'SET ' + ', '.join(update_parts)
    if has_old_tags:
        update_expr += ' REMOVE tags'

    dynamodb.update_item(
        TableName='Questions',
        Key={'questionId': {'S': qid}},
        UpdateExpression=update_expr,
        ExpressionAttributeNames=expr_names,
        ExpressionAttributeValues=expr_values,
    )

def process(q):
    qid = q.get('questionId', '')
    exam_type = q.get('examType', '')
    has_old_tags = bool(q.get('tags'))
    current_domain = q.get('domain')
    has_cai = bool(q.get('correctAnswerIndices'))

    domain_int = to_int(current_domain)
    if domain_int is not None and not isinstance(current_domain, str) and not has_old_tags and has_cai:
        return ('skip', qid, '')

    domain_name = q_domain_name(q)
    domains = EXAM_DOMAINS.get(exam_type, [])
    domain_idx = domains.index(domain_name) if domain_name in domains else -1

    if domain_idx < 0:
        return ('unknown', qid, domain_name)

    new_cai = None
    if not has_cai:
        choices = q.get('choices', [])
        correct = q.get('correctAnswers', [])
        if choices and correct:
            cai = compute_cai(choices, correct)
            if cai:
                new_cai = cai

    action_parts = []
    if not isinstance(current_domain, int) or has_old_tags:
        action_parts.append(f'domain→{domain_idx}')
    if new_cai:
        action_parts.append(f'cai={new_cai}')
    if has_old_tags:
        action_parts.append('remove tags')

    if DRY_RUN:
        return ('dry', qid, ' / '.join(action_parts))

    update_question_boto3(qid, domain_idx, new_cai, has_old_tags)
    return ('ok', qid, ' / '.join(action_parts))

def main():
    mode = "DRY-RUN" if DRY_RUN else f"EXECUTE (並列 {WORKERS})"
    print(f"========== domain インデックス移行 ({mode}) ==========")

    questions = scan_all()
    print(f"総問題数: {len(questions)}")

    stats = {'skip': 0, 'ok': 0, 'dry': 0, 'unknown': 0, 'fail': 0}
    done = 0
    total = len(questions)

    with ThreadPoolExecutor(max_workers=WORKERS) as executor:
        futures = {executor.submit(process, q): q for q in questions}
        for future in as_completed(futures):
            done += 1
            try:
                status, qid, detail = future.result()
                stats[status] = stats.get(status, 0) + 1
                if status == 'unknown':
                    print(f"  [SKIP] {qid}: ドメイン名不明 '{detail}'")
                elif status not in ('skip',):
                    if done % 100 == 0 or status == 'dry':
                        label = 'DRY' if status == 'dry' else 'OK'
                        print(f"  [{label}] {qid}: {detail}  ({done}/{total})")
            except Exception as e:
                stats['fail'] += 1
                print(f"  [FAIL] {futures[future].get('questionId','?')}: {e}")

    print()
    print("========== 結果 ==========")
    print(f"  移行済み (スキップ): {stats['skip']}")
    print(f"  更新{'(dry-run)' if DRY_RUN else '成功'}: {stats.get('ok', 0) + stats.get('dry', 0)}")
    print(f"  ドメイン名不明:      {stats['unknown']}")
    print(f"  失敗:                {stats['fail']}")

if __name__ == '__main__':
    main()
