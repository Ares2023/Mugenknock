# プロンプト改良レポート (20260720_015307)

## 改良方針
監査で頻出したMLA固有の事実誤り（SageMakerネットワーク分離とDDP、非同期推論の上限、Serverless Inferenceの1エンドポイント1モデル、inf1/inf2の現行性）と、不正解理由の事実誤認・過度な一般化を検証で弾くための確認観点を _validity-extra.txt に追記する。難易度・構成は既存のwarn観点で網羅済みのため追記しない。

## 適用 1件 / 見送り 0件

### ✅ _validity-extra.txt（末尾に追記）
**理由:** MLAのnetwork_isolation/DDPやAsync Inference上限等の事実誤り(ng多数)と、Terraform誤答理由の過度な一般化を検出するため

```

## MLA 固有の確認観点
- [warn] SageMakerのネットワーク分離(enable_network_isolation=True)を正誤の根拠にする場合は仕様を裏取りする。分離時もコンテナ間ピア通信(NCCL/DDP)は許可され、S3入出力は実行ロールでSageMaker側(コンテナ外)が処理する。「network_isolation=Trueだと分散トレーニング(DDP)が起動直後に失敗する」等は事実誤認。破綻していればfix、正解キー自体が揺らぐならdelete。
- [fix] SageMaker非同期推論(Async Inference)の上限は最大処理時間1時間・ペイロード最大1GB。「最大15分」等の数値誤りは修正する。
- [warn] Serverless Inferenceは1エンドポイント=1モデルで、マルチモデルエンドポイント(MME)のように複数モデルを1エンドポイントに同居できない。N個のモデルにはNエンドポイントが必要な点をMMEとの対比で正確に扱っているか確認する。
- [warn] 推論ハードウェアの現行性: NLP/トランスフォーマー推論の現行推奨はInferentia2(inf2)。inf1は提供中だが現行性で劣るため、inf1固定を最善解にする場合はinf2との比較の妥当性を確認する。

## 追加の確認観点（不正解理由の正確性）
- [warn] choiceExplanationsの不正解理由が事実誤認・過度な一般化になっていないか（例「TerraformはAWSネイティブIaCでもない」は誤りで、TerraformのAWS対応は充実している）。失格理由は当該要件との不一致(例 HCLがPython/TypeScript＋型チェック要件を満たさない)に限定し、事実として正確か確認する。事実誤認であればfix。
```


バックアップ: /home/yuzuki/aws-quiz-app/prompts/night-prompts/logs/audit_20260720_015307_promptbackup
