#!/usr/bin/env python3
"""
Google スプレッドシートからダウンロードしたCSVをDynamoDBにインポートする。

使い方:
  python3 import_questions.py questions/sap_governance.csv
  python3 import_questions.py questions/SAP/*.csv
  python3 import_questions.py --dry-run questions/sap_governance.csv
"""

import sys
import csv
import json
import argparse
from pathlib import Path

import boto3
from botocore.exceptions import ClientError

TABLE_NAME = "Questions"
REGION = "ap-northeast-1"


def parse_pipe(value: str) -> list[str]:
    """パイプ区切りの文字列をリストに変換する。"""
    return [v.strip() for v in value.split("|") if v.strip()]


def load_csv(path: Path) -> list[dict]:
    with open(path, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        return list(reader)


def validate_row(row: dict, row_num: int) -> str | None:
    """バリデーション失敗時はエラーメッセージを返す。"""
    required = ["questionId", "examType", "questionText", "choices", "correctAnswers", "explanation", "tags"]
    for col in required:
        if col not in row or not row[col].strip():
            return f"行{row_num}: カラム '{col}' が空です"

    choices = parse_pipe(row["choices"])
    correct = parse_pipe(row["correctAnswers"])

    if len(choices) < 2:
        return f"行{row_num}: choices が2つ未満です"

    for ans in correct:
        if ans not in choices:
            return f"行{row_num}: correctAnswers '{ans}' が choices に存在しません"

    return None


def build_item(row: dict) -> dict:
    choices = parse_pipe(row["choices"])
    correct = parse_pipe(row["correctAnswers"])
    tags = parse_pipe(row["tags"])

    return {
        "questionId": row["questionId"].strip(),
        "examType": row["examType"].strip().upper(),
        "questionText": row["questionText"].strip(),
        "choices": choices,
        "correctAnswers": correct,
        "explanation": row["explanation"].strip(),
        "tags": tags,
        "isMultiple": len(correct) > 1,
    }


def import_file(path: Path, table, dry_run: bool) -> tuple[int, int, int]:
    """(success, skip, error) を返す。"""
    rows = load_csv(path)
    success = skip = error = 0

    for i, row in enumerate(rows, start=2):
        qid = row.get("questionId", "").strip()
        qtext = row.get("questionText", "").strip()

        if not qid or not qtext:
            print(f"  スキップ (行{i}): questionId または questionText が空")
            skip += 1
            continue

        err = validate_row(row, i)
        if err:
            print(f"  警告: {err}")
            error += 1
            continue

        item = build_item(row)

        if dry_run:
            print(f"  [DRY-RUN] {item['questionId']} ({item['examType']}) - {item['questionText'][:40]}...")
            success += 1
            continue

        try:
            table.put_item(Item=item)
            print(f"  ✅ {item['questionId']} を登録")
            success += 1
        except ClientError as e:
            print(f"  ❌ {item['questionId']} エラー: {e.response['Error']['Message']}")
            error += 1

    return success, skip, error


def main():
    parser = argparse.ArgumentParser(description="CSVをDynamoDB Questionsテーブルにインポート")
    parser.add_argument("files", nargs="+", help="インポートするCSVファイル")
    parser.add_argument("--dry-run", action="store_true", help="DynamoDBに書き込まず内容を確認する")
    args = parser.parse_args()

    dynamodb = boto3.resource("dynamodb", region_name=REGION)
    table = dynamodb.Table(TABLE_NAME)

    total_success = total_skip = total_error = 0

    for pattern in args.files:
        paths = list(Path(".").glob(pattern)) if "*" in pattern else [Path(pattern)]
        for path in sorted(paths):
            if not path.exists():
                print(f"ファイルが見つかりません: {path}")
                continue
            print(f"\n--- {path} ---")
            s, sk, e = import_file(path, table, args.dry_run)
            total_success += s
            total_skip += sk
            total_error += e

    print(f"\n{'[DRY-RUN] ' if args.dry_run else ''}完了: 登録 {total_success} 件 / スキップ {total_skip} 件 / エラー {total_error} 件")


if __name__ == "__main__":
    main()
