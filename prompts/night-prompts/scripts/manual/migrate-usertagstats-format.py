#!/usr/bin/env python3
"""
UserTagStats の旧形式データ移行スクリプト。

背景:
  ドメイン別集計(UserTagStats)のtagIdは過去に複数の形式で保存されていた
  （裸のindex "0","1"... / ドメイン名文字列）。これらは全試験・全ドメイン名で
  共有されるキーのため、現在は正準形式 "{examType}_{domainIndex}"（例: "SAA_0"）
  のみを読む実装に統一されている（src/constants.ts の makeTagId/tagIdMatches）。

  この移行が行われた時点より前に演習していたユーザーのUserTagStatsは
  旧形式のまま取り残され、現在のコードからは一切読めない
  （＝マイページ「苦手分析」等で見えなくなっている）。

  UserAnswers（個々の回答履歴・questionId単位で試験/ドメインが一意に判別可能）は
  無傷で残っているため、ここから正準形式のrecentResultsを再計算して復元する。

使い方:
  python3 migrate-usertagstats-format.py            # ドライラン（書き込みなし、集計結果のみ表示）
  python3 migrate-usertagstats-format.py --apply     # 実際にUserTagStatsへ書き込む
  python3 migrate-usertagstats-format.py --apply --env dev   # 環境指定（既定: prod）

安全性:
  - 既存の正準形式行は「recentResults」属性のみ上書き（UpdateItem、他属性は保持）。
  - 旧形式の行(裸index・ドメイン名キー)は削除しない（このスクリプトは追加・上書きのみ）。
  - 何度実行しても同じ結果になる（冪等）。
"""
import argparse
import json
import sys
from collections import defaultdict

import boto3
from boto3.dynamodb.conditions import Key

REGION = "ap-northeast-1"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="実際に書き込む（省略時はドライラン）")
    ap.add_argument("--env", default="prod", choices=["prod", "dev"], help="対象環境（既定: prod）")
    args = ap.parse_args()

    suffix = f"-{args.env}"
    dynamodb = boto3.resource("dynamodb", region_name=REGION)
    questions_table = dynamodb.Table("Questions")
    answers_table = dynamodb.Table(f"UserAnswers{suffix}")
    tagstats_table = dynamodb.Table(f"UserTagStats{suffix}")

    # ── 1. Questions を全件スキャンして questionId -> (examType, domainIndex) を構築 ──
    print("[1/3] Questions テーブルをスキャン中...")
    q_map = {}
    scan_kwargs = {"ProjectionExpression": "questionId, examType, #d",
                    "ExpressionAttributeNames": {"#d": "domain"}}
    while True:
        resp = questions_table.scan(**scan_kwargs)
        for item in resp.get("Items", []):
            qid = item.get("questionId")
            et = item.get("examType")
            dom = item.get("domain")
            if qid and et is not None and isinstance(dom, (int,)):
                q_map[qid] = (et, int(dom))
            elif qid and et is not None and hasattr(dom, "__int__"):
                # DynamoDB Decimal
                try:
                    q_map[qid] = (et, int(dom))
                except Exception:
                    pass
        if "LastEvaluatedKey" not in resp:
            break
        scan_kwargs["ExclusiveStartKey"] = resp["LastEvaluatedKey"]
    print(f"  {len(q_map)} 問のexamType/domainを取得")

    # ── 2. UserAnswers を全件スキャンして (userId, examType, domainIndex) ごとにグルーピング ──
    print(f"[2/3] UserAnswers{suffix} テーブルをスキャン中...")
    groups = defaultdict(list)  # (userId, examType, domainIdx) -> [(answeredAt, isCorrect), ...]
    scan_kwargs = {"ProjectionExpression": "userId, questionId, isCorrect, answeredAt"}
    total_answers = 0
    skipped_no_question = 0
    while True:
        resp = answers_table.scan(**scan_kwargs)
        for item in resp.get("Items", []):
            total_answers += 1
            uid = item.get("userId")
            qid = item.get("questionId")
            is_correct = item.get("isCorrect")
            answered_at = item.get("answeredAt") or ""
            if uid is None or qid is None or is_correct is None:
                continue
            info = q_map.get(qid)
            if not info:
                skipped_no_question += 1
                continue
            et, idx = info
            groups[(uid, et, idx)].append((answered_at, bool(is_correct)))
        if "LastEvaluatedKey" not in resp:
            break
        scan_kwargs["ExclusiveStartKey"] = resp["LastEvaluatedKey"]
    print(f"  回答 {total_answers} 件処理（Questions未参照のためスキップ: {skipped_no_question} 件）")
    print(f"  再構築対象グループ(userId×試験×ドメイン): {len(groups)} 件")

    # ── 3. 各グループの直近30件を正準形式のtagIdでUserTagStatsに書き込む ──
    print(f"[3/3] UserTagStats{suffix} へ{'書き込み' if args.apply else 'ドライラン（書き込みなし）'}中...")
    written = 0
    sample = []
    for (uid, et, idx), rows in groups.items():
        rows.sort(key=lambda r: r[0])
        recent = [r[1] for r in rows][-30:]
        tag_id = f"{et}_{idx}"
        if len(sample) < 8:
            sample.append((uid, tag_id, len(recent)))
        if args.apply:
            tagstats_table.update_item(
                Key={"userId": uid, "tagId": tag_id},
                UpdateExpression="SET recentResults = :r",
                ExpressionAttributeValues={":r": recent},
            )
        written += 1

    print(f"\n  対象 {written} 件{'を書き込みました' if args.apply else '（--apply で実際に書き込みます）'}")
    print("\n  サンプル（先頭8件）:")
    for uid, tag_id, n in sample:
        print(f"    userId={uid[:12]}... tagId={tag_id} recentResults={n}件")


if __name__ == "__main__":
    main()
