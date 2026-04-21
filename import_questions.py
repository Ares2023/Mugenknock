#!/usr/bin/env python3
"""
JSONファイルをDynamoDB Questionsテーブルにインポートする。

使い方:
  python3 import_questions.py questions/sap_governance.json
  python3 import_questions.py questions/*.json
  python3 import_questions.py --dry-run questions/sap_governance.json

JSONフォーマット（配列）:
[
  {
    "questionId": "sap-q-001",
    "examType": "SAP",
    "questionText": "問題文",
    "choices": ["選択肢A", "選択肢B", "選択肢C", "選択肢D"],
    "correctAnswers": ["選択肢A"],
    "explanation": "解説文",
    "tags": ["sap-governance", "sap-organizations"]
  }
]
"""

import json
import argparse
from pathlib import Path

import boto3
from botocore.exceptions import ClientError

TABLE_NAME = "Questions"
REGION = "ap-northeast-1"


def load_json(path: Path) -> list[dict]:
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, list):
        raise ValueError(f"{path}: JSONのトップレベルは配列にしてください")
    return data


def validate_item(item: dict, index: int) -> str | None:
    """バリデーション失敗時はエラーメッセージを返す。"""
    required = ["questionId", "examType", "questionText", "choices", "correctAnswers", "explanation", "tags"]
    for key in required:
        if key not in item:
            return f"[{index}] キー '{key}' がありません"

    if not isinstance(item["choices"], list) or len(item["choices"]) < 2:
        return f"[{index}] choices はリストで2つ以上必要です"

    if not isinstance(item["correctAnswers"], list) or len(item["correctAnswers"]) == 0:
        return f"[{index}] correctAnswers はリストで1つ以上必要です"

    for ans in item["correctAnswers"]:
        if ans not in item["choices"]:
            return f"[{index}] correctAnswers '{ans}' が choices に存在しません"

    if not isinstance(item["tags"], list):
        return f"[{index}] tags はリストにしてください"

    return None


def build_item(item: dict) -> dict:
    return {
        "questionId": item["questionId"].strip(),
        "examType": item["examType"].strip().upper(),
        "questionText": item["questionText"].strip(),
        "choices": [c.strip() for c in item["choices"]],
        "correctAnswers": [c.strip() for c in item["correctAnswers"]],
        "explanation": item["explanation"].strip(),
        "tags": [t.strip() for t in item["tags"]],
        "isMultiple": len(item["correctAnswers"]) > 1,
    }


def import_file(path: Path, table, dry_run: bool) -> tuple[int, int, int]:
    """(success, skip, error) を返す。"""
    try:
        rows = load_json(path)
    except (json.JSONDecodeError, ValueError) as e:
        print(f"  ❌ JSONパースエラー: {e}")
        return 0, 0, 1

    success = skip = error = 0

    for i, row in enumerate(rows):
        qid = row.get("questionId", "").strip() if isinstance(row.get("questionId"), str) else ""
        qtext = row.get("questionText", "").strip() if isinstance(row.get("questionText"), str) else ""

        if not qid or not qtext:
            print(f"  スキップ [{i}]: questionId または questionText が空")
            skip += 1
            continue

        err = validate_item(row, i)
        if err:
            print(f"  警告: {err}")
            error += 1
            continue

        item = build_item(row)

        if dry_run:
            multi = " (複数選択)" if item["isMultiple"] else ""
            print(f"  [DRY-RUN] {item['questionId']} ({item['examType']}){multi} - {item['questionText'][:45]}...")
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
    parser = argparse.ArgumentParser(description="JSONをDynamoDB Questionsテーブルにインポート")
    parser.add_argument("files", nargs="+", help="インポートするJSONファイル")
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
