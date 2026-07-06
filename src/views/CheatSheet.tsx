'use client';
import React, { useState, useMemo } from 'react';
import { Helmet } from '@/compat/react-helmet-async';
import { EXAM_LEVEL, EXAM_LEVEL_COLORS, EXAM_CONFIGS, EXAM_OFFICIAL_URLS, EXAM_TYPES } from '../constants';
import { EXAM_ICON_COMPONENTS } from '../components/Icons';
import { useLanguage } from '../contexts/LanguageContext';
import PageLayout from '../components/ui/PageLayout';

// ── データ型 ─────────────────────────────────────────────────
interface Item { name: string; desc: string; tags: string[] }
interface Section { title: string; items: Item[] }
type CheatData = Record<string, Section[]>

// ── 試験別チートシートデータ ──────────────────────────────────
const CHEAT_DATA: CheatData = {
  CLF: [
    {
      title: 'クラウドの概念',
      items: [
        { name: '責任共有モデル', desc: 'AWSがクラウド自体のセキュリティ（物理・インフラ）を担い、ユーザーはクラウド内（OS・データ・設定）を担う。', tags: ['分担', 'セキュリティ', '範囲'] },
        { name: 'Well-Architectedフレームワーク', desc: '6本柱（運用上の優秀性・セキュリティ・信頼性・パフォーマンス効率・コスト最適化・持続可能性）でクラウド設計を評価する。', tags: ['6本柱', '設計', 'ベストプラクティス'] },
        { name: 'CAF', desc: 'クラウド移行を成功させる6つの視点（ビジネス・人・ガバナンス・プラットフォーム・セキュリティ・運用）のフレームワーク。', tags: ['移行', '6視点', 'フレームワーク'] },
        { name: 'サービスモデル', desc: 'IaaS（EC2等の仮想インフラ）/ PaaS（Elastic Beanstalk等の実行基盤）/ SaaS（Workspaces等のアプリ）の3層。', tags: ['IaaS', 'PaaS', 'SaaS'] },
        { name: 'クラウドメリット', desc: '俊敏性・弾力性・グローバル展開・初期投資不要（CAPEX→OPEX）・スケールメリットによるコスト削減。', tags: ['俊敏性', '弾力性', 'OPEX'] },
      ],
    },
    {
      title: 'コンピューティング',
      items: [
        { name: 'EC2', desc: '仮想サーバー。オンデマンド・スポット・リザーブドの購入オプションを用途に応じて使い分ける。', tags: ['オンデマンド', 'スポット', 'リザーブド'] },
        { name: 'Lambda', desc: 'サーバーレス実行環境。コードをアップロードするだけでトリガーに応じて自動実行される。', tags: ['サーバーレス', 'FaaS', 'トリガー'] },
        { name: 'Elastic Beanstalk', desc: 'アプリをデプロイするとEC2/ELB/Auto Scalingを自動設定するPaaSサービス。', tags: ['PaaS', 'デプロイ', '自動設定'] },
        { name: 'ECS / EKS', desc: 'コンテナ管理サービス。ECSはAWS独自、EKSはKubernetesのマネージドサービス。', tags: ['コンテナ', 'Kubernetes', 'Fargate'] },
        { name: 'Lightsail', desc: 'VPS的なシンプルな仮想サーバー。固定料金で予測しやすくWordPress等に最適。', tags: ['VPS', '固定料金', 'シンプル'] },
      ],
    },
    {
      title: 'ストレージ',
      items: [
        { name: 'S3', desc: '高耐久性(99.999999999%)のオブジェクトストレージ。バケット単位で管理し静的ホスティングも可能。', tags: ['オブジェクト', '11ナイン', '静的ホスティング'] },
        { name: 'EBS', desc: 'EC2にアタッチするブロックストレージ。gp3/io2等のボリュームタイプで用途を使い分ける。', tags: ['ブロック', 'EC2', 'gp3'] },
        { name: 'EFS', desc: '複数のEC2から同時マウントできるサーバーレスのNFSファイルシステム。', tags: ['NFS', '共有マウント', 'サーバーレス'] },
        { name: 'S3 Glacier', desc: '低コストのアーカイブストレージ。取得に数分〜時間かかるが保存コストが非常に安い。', tags: ['アーカイブ', '低コスト', '取得遅延'] },
      ],
    },
    {
      title: 'データベース',
      items: [
        { name: 'RDS', desc: 'マネージドなリレーショナルDB（MySQL/PostgreSQL/Aurora等）。Multi-AZで自動フェイルオーバー。', tags: ['MySQL', 'Multi-AZ', 'リードレプリカ'] },
        { name: 'DynamoDB', desc: 'フルマネージドなNoSQLデータベース。一桁ミリ秒の低レイテンシでキーバリュー/ドキュメント型。', tags: ['NoSQL', '低レイテンシ', 'スケーラブル'] },
        { name: 'Aurora', desc: 'AWS独自の高性能RDB。MySQL/PostgreSQL互換でRDSより最大3倍高速。6コピーを3AZに分散。', tags: ['MySQL互換', '高性能', 'Aurora Serverless'] },
        { name: 'ElastiCache', desc: 'RedisまたはMemcachedのインメモリキャッシュ。DBの読み取り負荷とレイテンシを削減する。', tags: ['Redis', 'Memcached', 'インメモリ'] },
        { name: 'Redshift', desc: 'OLAP向けデータウェアハウス。列指向ストレージで大規模な分析クエリを高速処理。', tags: ['DWH', '列指向', '分析'] },
      ],
    },
    {
      title: 'ネットワーキング',
      items: [
        { name: 'VPC', desc: '仮想プライベートネットワーク。サブネット・ルートテーブル・インターネットゲートウェイを設定する。', tags: ['サブネット', 'ルートテーブル', 'IGW'] },
        { name: 'Route 53', desc: 'マネージドDNSサービス。ヘルスチェックやルーティングポリシー（フェイルオーバー等）も設定できる。', tags: ['DNS', 'ヘルスチェック', 'ルーティング'] },
        { name: 'CloudFront', desc: 'グローバルCDN。エッジロケーションでコンテンツをキャッシュして低レイテンシ配信。', tags: ['CDN', 'エッジ', 'キャッシュ'] },
        { name: 'ELB', desc: 'ロードバランサー。ALB（HTTP/HTTPS L7）とNLB（TCP/UDP L4）の2種類がある。', tags: ['ALB', 'NLB', 'L7/L4'] },
        { name: 'Direct Connect', desc: 'オンプレとAWSを専用線で接続。安定した帯域幅と低レイテンシ・高セキュリティを実現。', tags: ['専用線', 'ハイブリッド', '低レイテンシ'] },
      ],
    },
    {
      title: 'セキュリティ',
      items: [
        { name: 'IAM', desc: 'ユーザー・グループ・ロール・ポリシーでAWSリソースへのアクセスを制御する。最小権限の原則が重要。', tags: ['ポリシー', 'ロール', '最小権限'] },
        { name: 'Shield', desc: 'DDoS攻撃を自動軽減。StandardはすべてのAWSリソースに無料で適用済み。Advancedは追加保護。', tags: ['DDoS', 'Standard', 'Advanced'] },
        { name: 'WAF', desc: 'WebアプリへのSQLインジェクション等の攻撃をフィルタリング。CloudFront/ALBに適用する。', tags: ['Webファイアウォール', 'SQLi', 'XSS'] },
        { name: 'KMS', desc: '暗号化キーの作成・管理サービス。S3/EBS/RDS等と統合してデータを暗号化する。', tags: ['暗号化', 'CMK', 'キー管理'] },
        { name: 'Trusted Advisor', desc: 'コスト・パフォーマンス・セキュリティ・耐障害性のベストプラクティスをチェックして改善を提案。', tags: ['ベストプラクティス', 'コスト', 'セキュリティ'] },
      ],
    },
    {
      title: '管理・監視',
      items: [
        { name: 'CloudWatch', desc: 'メトリクス・ログ・アラームを一元管理。EC2のCPU使用率等をリアルタイム監視してアラートを送信。', tags: ['メトリクス', 'ログ', 'アラーム'] },
        { name: 'CloudTrail', desc: 'APIコールの記録と監査ログ。誰が・何を・いつしたかを90日以上追跡できる。', tags: ['監査', 'APIログ', 'コンプライアンス'] },
        { name: 'AWS Config', desc: 'リソースの設定変更を記録・評価。ルールへの準拠状況をチェックしてコンプライアンス管理。', tags: ['設定管理', 'ルール', 'コンプライアンス'] },
        { name: 'Systems Manager', desc: 'EC2のパッチ管理・設定管理・Session Manager（SSH不要）等を提供するインフラ管理サービス。', tags: ['パッチ管理', 'Session Manager', '自動化'] },
        { name: 'Organizations', desc: '複数のAWSアカウントを階層的に管理。一括請求やSCPでガバナンスを実現する。', tags: ['マルチアカウント', '一括請求', 'SCP'] },
      ],
    },
    {
      title: '料金・サポート',
      items: [
        { name: '料金モデル', desc: '使った分だけ払うオンデマンドが基本。リザーブドで最大72%割引、Savings Plansも柔軟に適用できる。', tags: ['オンデマンド', 'リザーブド', 'Savings Plans'] },
        { name: 'Cost Explorer', desc: '過去・現在・将来のコストをグラフで可視化・分析。リソース別・タグ別にフィルタリングできる。', tags: ['コスト分析', '可視化', '予測'] },
        { name: 'Budgets', desc: '月額コスト・使用量に対してしきい値アラートを設定するコスト管理ツール。', tags: ['予算管理', 'アラート', 'しきい値'] },
        { name: 'サポートプラン', desc: 'ベーシック（無料）→デベロッパー→ビジネス→エンタープライズOn-Ramp→エンタープライズの5段階。', tags: ['ベーシック', 'ビジネス', 'エンタープライズ'] },
      ],
    },
  ],

  AIF: [
    {
      title: 'AI・MLの基礎',
      items: [
        { name: '機械学習の種類', desc: '教師あり学習（分類・回帰）・教師なし学習（クラスタリング・次元削減）・強化学習の3種類。', tags: ['教師あり', '教師なし', '強化学習'] },
        { name: 'モデル評価指標', desc: '精度(Accuracy)・適合率(Precision)・再現率(Recall)・F1スコア・AUC-ROCを用途に応じて使い分ける。', tags: ['Accuracy', 'F1スコア', 'AUC-ROC'] },
        { name: '過学習と正則化', desc: '訓練データへの過剰適合（過学習）はL1/L2正則化・ドロップアウト・データ拡張で対策する。', tags: ['過学習', 'L1/L2正則化', 'ドロップアウト'] },
        { name: 'MLのライフサイクル', desc: 'データ収集→前処理→特徴量エンジニアリング→学習→評価→デプロイ→監視のサイクルで進める。', tags: ['MLOps', 'ライフサイクル', 'パイプライン'] },
      ],
    },
    {
      title: '生成AIの基礎',
      items: [
        { name: '基盤モデル (FM)', desc: '大量データで事前学習済みの大規模モデル。様々なタスクにファインチューニングやプロンプトで適用できる。', tags: ['LLM', '事前学習', 'Foundation Model'] },
        { name: 'プロンプトエンジニアリング', desc: 'Zero-shot（例なし）・Few-shot（例あり）・Chain-of-Thought（思考過程を指示）等の手法でモデルを誘導する。', tags: ['Zero-shot', 'Few-shot', 'Chain-of-Thought'] },
        { name: 'RAG', desc: '外部知識ベースを検索してコンテキストとしてFMに提供し、ハルシネーションを減らして精度を上げる手法。', tags: ['検索拡張生成', 'ベクトル検索', '知識ベース'] },
        { name: 'ハルシネーション', desc: 'FMが事実と異なる情報を自信満々に生成する問題。グラウンディング・RAG・温度パラメータ調整で軽減する。', tags: ['幻覚', 'グラウンディング', '正確性'] },
        { name: 'ファインチューニング', desc: '特定タスク用データでFMを追加学習しカスタマイズ。RLHF（人間のフィードバックを使った強化学習）も重要。', tags: ['追加学習', 'RLHF', 'カスタマイズ'] },
      ],
    },
    {
      title: 'AWSのAI/MLサービス',
      items: [
        { name: 'Amazon Bedrock', desc: 'サーバーレスでClaude/Llama/Titan等の基盤モデルにAPIアクセス。知識ベース・エージェント・ガードレールを提供。', tags: ['Claude', 'Titan', 'サーバーレス'] },
        { name: 'Amazon SageMaker', desc: 'ML全ライフサイクルをカバーするプラットフォーム。データ準備・学習・デプロイ・監視まで一気通貫で対応。', tags: ['ML全般', 'Studio', 'エンドポイント'] },
        { name: 'Amazon Rekognition', desc: '画像・動画の顔認識・物体検出・テキスト抽出・コンテンツモデレーション等のコンピュータービジョンAPI。', tags: ['画像認識', '顔認識', '物体検出'] },
        { name: 'Amazon Comprehend', desc: 'テキストのNLP処理API。感情分析・エンティティ抽出・言語検出・キーフレーズ検出等を提供。', tags: ['NLP', '感情分析', 'エンティティ'] },
        { name: 'Amazon Polly', desc: 'テキストを自然な音声に変換するTTSサービス。60言語以上・多様な声種に対応。SSML対応。', tags: ['TTS', '音声合成', 'SSML'] },
        { name: 'Amazon Transcribe', desc: '音声をテキストに変換するSTTサービス。話者分離・カスタム語彙・医療特化版も提供。', tags: ['STT', '文字起こし', '話者分離'] },
        { name: 'Amazon Lex', desc: 'Alexa同技術を使った会話型AIボットのフルマネージドサービス。音声・テキスト両対応。', tags: ['チャットボット', '会話AI', 'Alexa'] },
        { name: 'Amazon Kendra', desc: '企業向けインテリジェント検索エンジン。自然言語での問いかけに文書から正確に回答。', tags: ['企業検索', 'ナレッジ', 'RAG'] },
        { name: 'Amazon Textract', desc: '文書・フォームからテキストやデータを自動抽出するOCRサービス。テーブル・フォームの構造も理解する。', tags: ['OCR', 'フォーム抽出', '文書解析'] },
        { name: 'Amazon Translate', desc: '75言語以上に対応するニューラル機械翻訳API。カスタム用語集でドメイン特化翻訳も可能。', tags: ['翻訳', '多言語', 'ニューラル'] },
      ],
    },
    {
      title: '責任あるAI・ガバナンス',
      items: [
        { name: '公平性 (Fairness)', desc: 'モデルが特定の人種・性別・年齢等に偏った予測をしないよう訓練データとモデルを評価・調整する。', tags: ['バイアス', '公平性', '差別防止'] },
        { name: '説明可能性 (XAI)', desc: 'モデルがなぜその予測をしたかを人間が理解できるようにする。SageMaker ClarifyでSHAP値を分析。', tags: ['XAI', 'SHAP', '透明性'] },
        { name: 'プライバシーとセキュリティ', desc: '訓練データに個人情報（PII）を含めない。差分プライバシー・フェデレーテッドラーニングで保護。', tags: ['PII', '差分プライバシー', 'データ保護'] },
        { name: 'AIガバナンス', desc: 'モデルのライフサイクル全体にわたるリスク管理・監査・ポリシー遵守の枠組み。AWS AI Service Cardsで透明性を確保。', tags: ['ガバナンス', 'リスク管理', 'コンプライアンス'] },
      ],
    },
  ],

  SAA: [
    {
      title: 'コンピューティング',
      items: [
        { name: 'EC2', desc: 'インスタンスタイプ（汎用/コンピュート最適化/メモリ最適化/GPU）・配置グループ（クラスタ/分散/パーティション）・インスタンスストアを把握する。', tags: ['インスタンスタイプ', '配置グループ', 'スポット'] },
        { name: 'Auto Scaling', desc: 'ターゲット追跡・ステップ・スケジュールの3種類のスケーリングポリシー。起動テンプレートで構成を定義。ウォームアップ期間に注意。', tags: ['ターゲット追跡', '起動テンプレート', 'ウォームアップ'] },
        { name: 'Lambda', desc: 'イベント駆動型サーバーレス。同時実行制限・プロビジョニング済み同時実行・レイヤー・デスティネーション設定を把握する。', tags: ['同時実行', 'レイヤー', 'デスティネーション'] },
        { name: 'ECS / EKS', desc: 'ECSはTaskDefinition/ServiceでFargate or EC2起動タイプ。EKSはKubernetesマネージドクラスタ。Fargateでサーバーレスコンテナ。', tags: ['Fargate', 'TaskDefinition', 'Kubernetes'] },
        { name: 'Batch', desc: 'スポットEC2やFargate上でバッチジョブを効率実行。ジョブキュー・コンピューティング環境・ジョブ依存関係を設定する。', tags: ['バッチ', 'スポット', 'ジョブキュー'] },
      ],
    },
    {
      title: 'ストレージ',
      items: [
        { name: 'S3', desc: 'ストレージクラス（Standard/IA/One Zone-IA/Intelligent-Tiering/Glacier系）・ライフサイクルポリシー・バージョニング・CRR/SRRが頻出。', tags: ['ストレージクラス', 'ライフサイクル', 'レプリケーション'] },
        { name: 'EBS', desc: 'gp3（汎用SSD）/io2（プロビジョニドIOPS）/st1（スループット最適化HDD）/sc1（コールドHDD）。マルチアタッチはio1/io2のみ。', tags: ['gp3', 'io2', 'マルチアタッチ'] },
        { name: 'EFS', desc: '自動スケールするNFSファイルシステム。InfrequentAccessクラスでコスト削減。EC2/ECS/Lambda/SageMakerがマウント可能。', tags: ['NFS', 'InfrequentAccess', '自動スケール'] },
        { name: 'FSx', desc: 'FSx for Windows File Server（SMB）とFSx for Lustre（高性能HPC/ML）の2種類が重要。', tags: ['Windows', 'Lustre', 'HPC'] },
        { name: 'S3 Glacier', desc: 'Instant Retrieval（ms）/Flexible Retrieval（分〜時間）/Deep Archive（12時間）の3階層。コストと取得時間のトレードオフを把握。', tags: ['Instant', 'Flexible', 'Deep Archive'] },
        { name: 'Storage Gateway', desc: 'File/Volume/Tape GWの3種類でオンプレとS3をブリッジ。キャッシュ型とストア型の違いに注意。', tags: ['File GW', 'Volume GW', 'ハイブリッド'] },
      ],
    },
    {
      title: 'データベース',
      items: [
        { name: 'RDS', desc: 'Multi-AZはスタンバイへの自動フェイルオーバー（同期レプリケーション）。リードレプリカは非同期で読み取り分散。', tags: ['Multi-AZ', 'リードレプリカ', 'フェイルオーバー'] },
        { name: 'Aurora', desc: '最大15リードレプリカ・Aurora Global Database・Aurora Serverless v2。ストレージは自動拡張し6コピーを3AZに分散。', tags: ['Global Database', 'Serverless v2', '15リードレプリカ'] },
        { name: 'DynamoDB', desc: 'GSI（クエリの柔軟性）/LSI（同一パーティション内ソート）・DAX（マイクロ秒キャッシュ）・Streams・グローバルテーブルを押さえる。', tags: ['GSI/LSI', 'DAX', 'グローバルテーブル'] },
        { name: 'ElastiCache', desc: 'Redis（レプリケーション・クラスタモード・Sentinel・Pub/Sub）とMemcached（マルチスレッド・シャーディング）の違いを把握。', tags: ['Redis', 'Memcached', 'クラスタモード'] },
        { name: 'Redshift', desc: '列指向DWH。Redshift Spectrum（S3データをRedshiftで直接クエリ）・AQUA（ハードウェアアクセラレーション）が重要。', tags: ['列指向', 'Spectrum', 'AQUA'] },
        { name: 'Neptune', desc: 'グラフデータベース（Property Graph & RDF/SPARQL対応）。ソーシャルネットワーク・不正検知に使用。', tags: ['グラフDB', 'Gremlin', 'SPARQL'] },
      ],
    },
    {
      title: 'ネットワーキング',
      items: [
        { name: 'VPC基礎', desc: 'NACL（ステートレス・番号順ルール評価）とSG（ステートフル・全ルール評価）の違いが頻出。パブリック/プライベートサブネットの構成を把握。', tags: ['NACL', 'セキュリティグループ', 'ステートレス'] },
        { name: 'VPCピアリング / TGW', desc: 'ピアリングは1対1接続で推移的ルーティング不可。Transit GatewayはハブでN対N接続、アタッチメント種別（VPC/VPN/DC）が重要。', tags: ['ピアリング', 'TGW', 'ハブ&スポーク'] },
        { name: 'VPCエンドポイント', desc: 'ゲートウェイ型（S3/DynamoDB、ルートテーブルに追加）とインターフェース型（PrivateLink、ENIを作成）を使い分ける。', tags: ['ゲートウェイ型', 'PrivateLink', 'インターフェース型'] },
        { name: 'ALB / NLB', desc: 'ALBはHTTP/HTTPS L7（コンテンツベースルーティング・ターゲットグループ）。NLBはTCP/UDP L4（固定IP・超低レイテンシ）。', tags: ['ALB', 'NLB', 'ターゲットグループ'] },
        { name: 'Route 53', desc: 'シンプル/重み付け/レイテンシ/フェイルオーバー/地理的近接性/地理的/多値応答の各ルーティングポリシーと用途を把握する。', tags: ['フェイルオーバー', 'レイテンシ', '地理的近接性'] },
        { name: 'CloudFront', desc: 'オリジン（S3/カスタム）・ビヘイビア・キャッシュポリシー・OAC（S3バケットポリシーで制限）・Lambda@Edge/CloudFront Functionsが重要。', tags: ['OAC', 'Lambda@Edge', 'ビヘイビア'] },
        { name: 'Global Accelerator', desc: 'Anycastで最寄りエッジロケーションからAWSバックボーン経由で転送。固定IPを提供。CloudFrontとの違いを把握（非HTTPにも対応）。', tags: ['Anycast', '固定IP', 'バックボーン'] },
        { name: 'Direct Connect / VPN', desc: 'DCは専用線（BGP必須・最長一致ルール）。Site-to-Site VPNはインターネット経由の暗号化接続。冗長化は両方を組み合わせる。', tags: ['BGP', '専用線', '冗長化'] },
      ],
    },
    {
      title: 'セキュリティ・IAM',
      items: [
        { name: 'IAM', desc: 'ポリシー評価順：明示的な拒否→許可→暗黙の拒否。クロスアカウントアクセスはロールのAssumeRoleで実現。リソースベースポリシーも重要。', tags: ['ポリシー評価', 'クロスアカウント', 'リソースベース'] },
        { name: 'KMS', desc: 'AWSマネージドキーとCMK（カスタマーマネージドキー）の違い。エンベロープ暗号化の仕組みとキーポリシーを把握する。', tags: ['CMK', 'エンベロープ暗号化', 'キーポリシー'] },
        { name: 'Secrets Manager', desc: 'DB認証情報等のシークレットを自動ローテーション（Lambda関数で処理）。Parameter Storeとの使い分けはローテーション有無が基準。', tags: ['自動ローテーション', 'DB認証情報', 'Lambda'] },
        { name: 'Cognito', desc: 'User Pool（認証・JWT発行）とIdentity Pool（一時的なAWS認証情報を払い出してAWSリソースアクセス）の2種類。', tags: ['User Pool', 'Identity Pool', 'フェデレーション'] },
        { name: 'Organizations / SCP', desc: 'SCPはOU/アカウントに適用するガードレール。最大権限を制限するだけで権限は付与しない。全体の許可ポリシーとAND評価。', tags: ['SCP', 'OU', 'ガードレール'] },
      ],
    },
    {
      title: '統合・メッセージング',
      items: [
        { name: 'SQS', desc: '標準キュー（順序不保証・少なくとも1回配信・ほぼ無制限スループット）とFIFOキュー（順序保証・1回のみ配信・3000msg/s）の違いが頻出。可視性タイムアウト・DLQも重要。', tags: ['標準', 'FIFO', '可視性タイムアウト'] },
        { name: 'SNS', desc: 'Pub/Subメッセージング。トピックへの複数サブスクライバー（SQS/Lambda/HTTP/メール）でファンアウトを実現。', tags: ['Pub/Sub', 'ファンアウト', 'フィルタポリシー'] },
        { name: 'EventBridge', desc: 'AWSサービス・SaaSイベント・カスタムアプリのイベントをルールでターゲットに転送。スケジューラとしても利用可。', tags: ['イベントバス', 'ルール', 'スケジューラ'] },
        { name: 'Step Functions', desc: 'Lambda等を組み合わせたワークフローをステートマシン（JSON/YAML）として定義・実行・可視化する。', tags: ['ステートマシン', 'ワークフロー', 'サーバーレス'] },
        { name: 'API Gateway', desc: 'REST/HTTP/WebSocket APIを構築・管理。Lambdaとの統合・スロットリング・APIキー・カスタムドメインが重要。', tags: ['REST', 'WebSocket', 'スロットリング'] },
        { name: 'Kinesis Data Streams', desc: 'リアルタイムストリーミング。シャード数でスループット調整（1MB/s書き込み/シャード）。保持期間は1日〜365日。', tags: ['シャード', 'リアルタイム', '保持期間'] },
      ],
    },
    {
      title: '分析・管理',
      items: [
        { name: 'Athena', desc: 'S3上のデータをサーバーレスSQLで直接クエリ。スキャンデータ量で課金。Glueデータカタログと組み合わせて使う。', tags: ['サーバーレス', 'S3クエリ', 'Glueカタログ'] },
        { name: 'Glue', desc: 'サーバーレスETLサービス。クローラーでデータカタログを自動生成し、SparkベースのETLジョブを実行する。', tags: ['ETL', 'クローラー', 'データカタログ'] },
        { name: 'CloudWatch', desc: 'カスタムメトリクス・Logs Insights・ダッシュボード・複合アラーム・異常検知・Syntheticsカナリアが重要。', tags: ['カスタムメトリクス', 'Logs Insights', '異常検知'] },
        { name: 'CloudFormation', desc: 'IaC。スタック・変更セット・クロススタック参照（Export/Import）・StackSets（マルチアカウント/リージョン展開）を把握する。', tags: ['IaC', 'スタック', 'StackSets'] },
        { name: 'Lake Formation', desc: 'データレイクの構築・管理・セキュリティを一元管理。列/行レベルのきめ細かいアクセス制御が可能。', tags: ['データレイク', '列/行レベル', 'アクセス制御'] },
      ],
    },
  ],

  DVA: [
    {
      title: 'コアサービス',
      items: [
        { name: 'Lambda', desc: '最大15分実行・最大10GB メモリ。同時実行制限（デフォルト1000）・プロビジョニング済み同時実行・レイヤー・DestinationsがDVAの頻出項目。', tags: ['同時実行', 'レイヤー', 'Destinations'] },
        { name: 'API Gateway', desc: 'REST/HTTP/WebSocket API。マッピングテンプレート・Lambda proxy統合・使用量プラン・APIキー・カスタムオーソライザーを把握する。', tags: ['マッピングテンプレート', 'カスタムオーソライザー', 'キャッシュ'] },
        { name: 'DynamoDB', desc: 'パーティションキー設計（ホットパーティション回避）・GSI/LSI・DAX・Streams（Lambda連携）・TTL・条件付き書き込みがDVAの頻出。', tags: ['パーティション設計', 'DAX', 'Streams'] },
        { name: 'S3', desc: 'プレサインドURL・マルチパートアップロード・S3イベント通知（→Lambda/SQS/SNS）・CORS設定・S3バッチオペレーション。', tags: ['プレサインドURL', 'マルチパート', 'CORS'] },
        { name: 'Cognito', desc: 'User Pool（認証フロー・トリガーLambda・MFA）とIdentity Pool（フェデレーション・ロールマッピング）の詳細を把握する。', tags: ['User Pool', 'Identity Pool', 'MFA'] },
        { name: 'ElastiCache', desc: 'セッションストア・クエリキャッシュのパターン。Lazy Loading vs Write-Through戦略。Redis vs Memcachedの選択基準。', tags: ['Lazy Loading', 'Write-Through', 'セッション'] },
      ],
    },
    {
      title: 'CI/CDとデプロイ',
      items: [
        { name: 'CodeCommit', desc: 'AWSマネージドのGitリポジトリ。IAMポリシーとHTTPS/SSH認証で細かいアクセス制御が可能。', tags: ['Git', 'IAM認証', 'プライベートリポジトリ'] },
        { name: 'CodeBuild', desc: 'buildspec.ymlでビルドフェーズを定義。ローカルキャッシュ・S3キャッシュ・環境変数・パラメータストア統合が重要。', tags: ['buildspec.yml', 'ビルドフェーズ', 'キャッシュ'] },
        { name: 'CodeDeploy', desc: 'EC2/ECS/Lambda/オンプレへのデプロイ。In-place/Blue-Green・All-at-once/One-at-a-time/Canary/Linear戦略を把握する。', tags: ['Blue/Green', 'Canary', 'ライフサイクルフック'] },
        { name: 'CodePipeline', desc: 'CI/CDパイプラインの自動化。ステージ（Source/Build/Test/Deploy）・アクション・手動承認・クロスアカウントデプロイ。', tags: ['ステージ', '手動承認', 'クロスアカウント'] },
        { name: 'SAM', desc: 'Lambda/API GW/DynamoDB等のサーバーレスアプリをテンプレートで定義するCloudFormationの拡張。sam localでローカルテストが可能。', tags: ['サーバーレス', 'sam local', 'テンプレート'] },
        { name: 'Elastic Beanstalk', desc: 'デプロイポリシー（All-at-once/Rolling/Rolling with additional/Immutable）と.ebextensionsによるカスタマイズが重要。', tags: ['デプロイポリシー', '.ebextensions', 'Immutable'] },
      ],
    },
    {
      title: 'メッセージング・統合',
      items: [
        { name: 'SQS', desc: '可視性タイムアウト（処理中に他のConsumerが取得しないよう隠す時間）・DLQ（最大受信回数超過時）・ロングポーリング（20秒）が頻出。', tags: ['可視性タイムアウト', 'DLQ', 'ロングポーリング'] },
        { name: 'SNS', desc: 'メッセージフィルタリング（サブスクリプションフィルタポリシー）でサブスクライバーごとに受信メッセージを絞り込める。', tags: ['フィルタポリシー', 'ファンアウト', 'FIFO'] },
        { name: 'Kinesis', desc: 'Data Streams（シャードベース、カスタム処理）とFirehose（自動スケール、S3/Redshift/OpenSearch配信）の使い分けが重要。', tags: ['シャード', 'Firehose', 'KCL'] },
        { name: 'EventBridge', desc: 'イベントパターンマッチング・スケジュール（cron式）・イベントアーカイブ・リプレイ・クロスアカウントイベントバスが重要。', tags: ['イベントパターン', 'スケジュール', 'アーカイブ'] },
        { name: 'Step Functions', desc: 'Expressワークフロー（高スループット・短期）とStandardワークフロー（最大1年・正確に1回実行）を用途で使い分ける。', tags: ['Express', 'Standard', 'ステートマシン'] },
      ],
    },
    {
      title: '監視・トレーシング',
      items: [
        { name: 'X-Ray', desc: 'アプリのリクエストをトレースして分布図・サービスマップを表示。Lambda/API GW/ECS等に統合。アノテーションとメタデータで分析。', tags: ['トレーシング', 'サービスマップ', 'アノテーション'] },
        { name: 'CloudWatch Logs', desc: 'ロググループ・ログストリーム・メトリクスフィルター・サブスクリプションフィルター（Lambdaへリアルタイム転送）が重要。', tags: ['ロググループ', 'メトリクスフィルター', 'サブスクリプション'] },
        { name: 'CloudWatch Embedded Metrics', desc: 'Lambdaのログ内に構造化メトリクスを埋め込みPUTMetricData APIコールなしでカスタムメトリクスを記録できる。', tags: ['EMF', '構造化ログ', 'カスタムメトリクス'] },
      ],
    },
    {
      title: 'セキュリティ',
      items: [
        { name: 'IAM', desc: 'アプリからAWSサービスへのアクセスはEC2インスタンスプロファイル or Lambdaの実行ロールを使う。アクセスキーをコードに埋め込まない。', tags: ['インスタンスプロファイル', '実行ロール', '一時認証情報'] },
        { name: 'KMS', desc: 'GenerateDataKey APIでデータキーを生成しエンベロープ暗号化。SDK統合で透過的に暗号化・複合できる。', tags: ['GenerateDataKey', 'エンベロープ暗号化', 'SDK統合'] },
        { name: 'SSM Parameter Store', desc: '設定値（String）と秘密情報（SecureString/KMS暗号化）を管理。/path/key形式の階層化とバージョニングが可能。', tags: ['SecureString', '階層化', 'バージョニング'] },
      ],
    },
  ],

  SOA: [
    {
      title: 'モニタリング・ロギング',
      items: [
        { name: 'CloudWatch', desc: 'カスタムメトリクス（高解像度1秒）・Logs Insights（クエリ言語）・Contributor Insights・異常検知・複合アラームを把握する。', tags: ['高解像度', 'Logs Insights', '異常検知'] },
        { name: 'CloudTrail', desc: '管理イベント（デフォルト有効）・データイベント（S3/Lambda操作）・Insightsイベント（異常なAPI呼び出し検出）の3種類。', tags: ['管理イベント', 'データイベント', 'Insights'] },
        { name: 'AWS Config', desc: 'リソース設定変更の記録と評価。マネージドルール・カスタムルール（Lambda）・コンフォーマンスパック・自動修復が重要。', tags: ['設定変更', 'マネージドルール', '自動修復'] },
        { name: 'Health Dashboard', desc: 'AWS全体の障害ステータス（Service Health Dashboard）と自分のアカウントへの影響（Personal Health Dashboard）を確認。', tags: ['サービス障害', 'アカウント影響', 'EventBridge連携'] },
      ],
    },
    {
      title: '自動化・運用',
      items: [
        { name: 'Systems Manager', desc: 'Session Manager（SSH/RDPなしでEC2接続）・Run Command・Patch Manager・State Manager・Inventory・OpsCenter・Automation・Parameter Store。', tags: ['Session Manager', 'Patch Manager', 'Automation'] },
        { name: 'EventBridge', desc: 'AWSサービスのイベントをトリガーに自動化を実現。Config変更→Lambda修復、GuardDuty検出→SNS通知等のパターンが頻出。', tags: ['自動修復', 'Config連携', 'スケジュール'] },
        { name: 'OpsWorks', desc: 'ChefまたはPuppetを使った設定管理・自動化サービス。レシピ・クックブック・レイヤーの概念を把握する。', tags: ['Chef', 'Puppet', '設定管理'] },
        { name: 'Elastic Beanstalk', desc: 'デプロイポリシー（Rolling with additional batch）・Immutable（ブルーグリーン的）・環境のスワップ（DNS切り替え）が重要。', tags: ['Rolling', 'Immutable', 'DNS CNAME Swap'] },
      ],
    },
    {
      title: '信頼性・可用性',
      items: [
        { name: 'Auto Scaling', desc: 'ライフサイクルフック（起動・終了時にカスタム処理を挿入）・スケジュールスケーリング・予測スケーリング・ウォームアップ期間を把握。', tags: ['ライフサイクルフック', '予測スケーリング', 'ウォームアップ'] },
        { name: 'ELB', desc: 'ヘルスチェック設定（正常しきい値/異常しきい値/タイムアウト/間隔）・アクセスログ（S3）・クロスゾーン負荷分散・Connection Draining。', tags: ['ヘルスチェック', 'アクセスログ', 'Connection Draining'] },
        { name: 'RDS', desc: 'Multi-AZのフェイルオーバー時間（60-120秒目安）・スナップショット（自動/手動）・ポイントインタイムリカバリ（最大35日）・リードレプリカのプロモーション。', tags: ['フェイルオーバー', 'ポイントインタイム', 'リードレプリカ'] },
        { name: 'Route 53', desc: 'ヘルスチェック（エンドポイント/他ヘルスチェック/CloudWatchアラーム）とフェイルオーバールーティングを組み合わせてDR構成を作る。', tags: ['ヘルスチェック', 'フェイルオーバー', 'DR構成'] },
      ],
    },
    {
      title: 'セキュリティ・コスト',
      items: [
        { name: 'GuardDuty', desc: 'CloudTrail/VPCフローログ/DNSログを機械学習で分析して脅威を検出。マルチアカウント対応。EventBridgeで自動応答可能。', tags: ['脅威検出', '機械学習', '自動応答'] },
        { name: 'Security Hub', desc: 'GuardDuty/Inspector/Macie等の検出結果を集約して優先順位付け。コンプライアンス基準（CIS/PCI-DSS/NIST）への準拠状況を確認。', tags: ['集約', 'ASFF', '準拠状況'] },
        { name: 'Cost Explorer', desc: 'コストと使用量の可視化・フィルタリング・グループ化。リザーブドインスタンスやSavings Plansの推奨事項も提示。', tags: ['コスト可視化', 'RI推奨', 'Savings Plans'] },
        { name: 'Compute Optimizer', desc: 'EC2/Lambda/EBS/ECS等のリソースの使用状況を分析して適正サイズの推奨事項を提示。コスト削減と性能改善の両立。', tags: ['適正サイズ', 'EC2推奨', 'コスト最適化'] },
      ],
    },
  ],

  DOP: [
    {
      title: 'CI/CD・SDLC自動化',
      items: [
        { name: 'CodePipeline', desc: 'パイプラインのステージ・アクション・アーティファクト・手動承認・クロスアカウント/クロスリージョンデプロイ・EventBridgeトリガーを把握。', tags: ['クロスアカウント', '手動承認', 'アーティファクト'] },
        { name: 'CodeBuild', desc: 'buildspec.yml（phases: install/pre_build/build/post_build）・ローカルキャッシュ・Dockerイメージのビルド・テストレポート・VPC統合。', tags: ['buildspec.yml', 'Docker', 'テストレポート'] },
        { name: 'CodeDeploy', desc: 'ライフサイクルイベントフック（BeforeInstall/AfterInstall/ApplicationStart等）・Blue/Greenのトラフィック移行タイミング・ロールバックの自動化。', tags: ['ライフサイクルフック', 'Blue/Green', 'ロールバック'] },
        { name: 'CodeArtifact', desc: 'パッケージリポジトリ（npm/PyPI/Maven/NuGet対応）。Upstream接続でpublic repoを内部でプロキシ。ドメイン・リポジトリ・パッケージの3層構造。', tags: ['パッケージ管理', 'Upstream', 'npm/PyPI'] },
      ],
    },
    {
      title: 'IaC・構成管理',
      items: [
        { name: 'CloudFormation', desc: '変更セット（影響確認）・ドリフト検出（実際の設定とテンプレートの差分）・カスタムリソース（Lambda）・StackSets・CloudFormation Hooks。', tags: ['変更セット', 'ドリフト検出', 'StackSets'] },
        { name: 'CDK', desc: 'TypeScript/Python等でCloudFormationを生成するIaCフレームワーク。Construct（L1/L2/L3）・Stack・App・CDK Pipelinesが重要。', tags: ['CDK', 'Construct', 'CDK Pipelines'] },
        { name: 'Systems Manager', desc: 'Automation（Runbooks）・State Manager（設定の継続的適用）・Run Command（一括実行）・Parameter Storeの高度な活用が重要。', tags: ['Automation Runbook', 'State Manager', '設定継続適用'] },
        { name: 'OpsWorks', desc: 'Chef/Puppet統合の設定管理。SOAからの発展として複雑な設定管理シナリオで登場することがある。', tags: ['Chef', 'Puppet', '設定管理'] },
      ],
    },
    {
      title: '監視・インシデント対応',
      items: [
        { name: 'CloudWatch', desc: 'Contributor Insights（ネットワーク・APIの上位N件を特定）・Synthetics Canary（エンドポイント監視）・EventBridge Pipes・アラームの複合アクション。', tags: ['Contributor Insights', 'Synthetics', 'EventBridge Pipes'] },
        { name: 'X-Ray', desc: 'サービスマップ・トレース・アノテーション（インデックス可）・メタデータ・サンプリングルール設定・グループ（サブセットのフィルタ）。', tags: ['サービスマップ', 'サンプリング', 'グループ'] },
        { name: 'EventBridge', desc: 'イベントバス（デフォルト/カスタム/パートナー）・アーカイブとリプレイ・EventBridge Pipes（ソース→フィルタ→変換→ターゲット）。', tags: ['カスタムバス', 'アーカイブ/リプレイ', 'Pipes'] },
        { name: 'Incident Manager', desc: 'Systems Managerの機能。インシデント検出→対応計画→エスカレーション→通知→事後分析の一連フローを管理する。', tags: ['インシデント管理', '対応計画', 'Runbook'] },
      ],
    },
    {
      title: '弾力性・セキュリティ',
      items: [
        { name: 'Auto Scaling', desc: 'ライフサイクルフック（起動時の初期化処理・終了時のデータ退避）・予測スケーリング（過去データからML予測）・ウォームプール。', tags: ['ライフサイクルフック', '予測スケーリング', 'ウォームプール'] },
        { name: 'Service Quotas', desc: 'AWSサービスの上限値を確認・申請するサービス。CloudWatchアラームでクォータ使用率を監視する。自動クォータリクエストも可能。', tags: ['上限値', 'クォータ管理', '申請'] },
        { name: 'IAM権限の高度な管理', desc: 'アクセス許可の境界（Permissions Boundary）でIAMエンティティに付与できる権限の上限を設定。ABAC（属性ベースのアクセス制御）も重要。', tags: ['Permissions Boundary', 'ABAC', '最小権限'] },
        { name: 'Config + Security Hub', desc: 'Configコンフォーマンスパック（複数ルールをパック化）とSecurity HubのCIS/PCIベンチマーク自動チェックをDOP視点で把握する。', tags: ['コンフォーマンスパック', 'CISベンチマーク', '自動修復'] },
      ],
    },
  ],

  DEA: [
    {
      title: 'データの取り込み',
      items: [
        { name: 'Kinesis Data Streams', desc: 'リアルタイムデータ取り込み。シャードでスループット制御（1シャード=1MB/s入力・2MB/s出力）。保持期間は1〜365日。拡張ファンアウトでConsumer追加可能。', tags: ['シャード', '拡張ファンアウト', 'KCL'] },
        { name: 'Kinesis Data Firehose', desc: '自動スケールのストリーム配信サービス。S3/Redshift/OpenSearch/Splunk等へ配信。Lambda変換・バッファリング・圧縮・暗号化が可能。', tags: ['自動スケール', 'Lambda変換', 'バッファリング'] },
        { name: 'MSK (Managed Kafka)', desc: 'フルマネージドApache Kafka。Kafka ConnectやStreamsをそのまま利用できる。MSK ServerlessとプロビジョニングMSKの選択。', tags: ['Kafka', 'MSK Serverless', 'Connector'] },
        { name: 'DMS', desc: 'ソースDBからターゲットDBへの継続的なデータ移行。同種/異種DB移行対応。SCTで異種DB間のスキーマを変換する。', tags: ['DB移行', 'CDC', 'SCT'] },
        { name: 'AppFlow', desc: 'Salesforce/SAP/Zendesk等のSaaSアプリとAWSサービス間でノーコードでデータを転送・変換するフローサービス。', tags: ['SaaS連携', 'ノーコード', 'フロー'] },
        { name: 'DataSync', desc: 'オンプレのNFS/SMBファイルサーバーやS3/EFS等へのデータ転送を高速・自動化するエージェント型サービス。', tags: ['オンプレ転送', 'エージェント', '自動化'] },
      ],
    },
    {
      title: 'データの変換・処理',
      items: [
        { name: 'AWS Glue', desc: 'サーバーレスETL。クローラーでデータカタログを自動生成し、Spark/Pythonベースのジョブを実行。Glue StudioとDataBrewでUI操作も可能。', tags: ['ETL', 'クローラー', 'Spark'] },
        { name: 'EMR', desc: 'Spark/Hive/Presto/HBaseをEC2/Fargate上で実行するマネージドクラスタ。コアノード/タスクノードの役割とスポット活用が重要。', tags: ['Spark', 'Hive', 'スポット'] },
        { name: 'Lambda', desc: 'Kinesis/DynamoDB Streamsのリアルタイム処理・軽量変換・イベント駆動のデータパイプラインに活用。', tags: ['リアルタイム', 'ストリーム処理', 'イベント駆動'] },
        { name: 'Step Functions', desc: 'ETLパイプラインのオーケストレーション。Glue/EMR/Lambda等を組み合わせた複雑なワークフローを状態管理しながら実行。', tags: ['オーケストレーション', 'パイプライン', 'ワークフロー'] },
      ],
    },
    {
      title: 'データストア',
      items: [
        { name: 'S3 (データレイク)', desc: 'パーティション設計（year/month/day）・圧縮形式（Parquet/ORC/Avro推奨）・S3 Select・Object Lock・S3データレイクのベストプラクティスを把握。', tags: ['パーティション', 'Parquet/ORC', 'データレイク'] },
        { name: 'Redshift', desc: '分散スタイル（KEY/ALL/EVEN/AUTO）・ソートキー・バキューム・Spectrum（S3を外部テーブルとしてクエリ）・同時実行スケーリングが重要。', tags: ['分散スタイル', 'ソートキー', 'Spectrum'] },
        { name: 'Lake Formation', desc: 'データレイクのセキュリティ管理。列・行レベルのきめ細かいアクセス制御と Blueprint（S3/RDS→Glueワークフロー自動生成）。', tags: ['列/行レベル', 'Blueprint', 'アクセス制御'] },
        { name: 'Athena', desc: 'S3上のデータをServerless SQLでクエリ。ワークグループ（コスト制御）・クエリフェデレーション（複数ソースをまたぐ）・Icebergテーブルが重要。', tags: ['ワークグループ', 'クエリフェデレーション', 'Iceberg'] },
        { name: 'DynamoDB', desc: '大規模なリアルタイムアクセスが必要なKVストア。パーティションキー設計とDAX（インメモリキャッシュ）でパフォーマンスを最適化。', tags: ['KVストア', 'DAX', 'TTL'] },
      ],
    },
    {
      title: 'データセキュリティ・ガバナンス',
      items: [
        { name: 'KMS', desc: 'S3/Redshift/Glue等のサービスとシームレスに統合してデータを暗号化。キーポリシー・グラントによる細かいアクセス制御。', tags: ['暗号化', 'キーポリシー', 'グラント'] },
        { name: 'Macie', desc: 'S3バケット内のPII（個人情報）・認証情報等の機密データを機械学習で自動検出・分類・アラート。', tags: ['PII検出', 'S3スキャン', 'データ分類'] },
        { name: 'Glue Data Catalog', desc: 'データのスキーマ・場所・メタデータを一元管理するメタデータリポジトリ。Lake Formation・Athena・Redshift Spectrumと連携。', tags: ['メタデータ', 'スキーマ管理', 'データカタログ'] },
      ],
    },
  ],

  MLA: [
    {
      title: 'SageMaker - データ準備',
      items: [
        { name: 'SageMaker Data Wrangler', desc: 'S3/Redshift/Athena等から300以上のデータ変換をGUIで実行。データ品質レポートとクラス不均衡の可視化が可能。', tags: ['データ変換', 'GUI', 'データ品質'] },
        { name: 'SageMaker Feature Store', desc: 'オンラインストア（リアルタイム低レイテンシ）とオフラインストア（S3バッチ学習）の2層構造で特徴量を管理・共有する。', tags: ['オンラインストア', 'オフラインストア', '特徴量共有'] },
        { name: 'SageMaker Ground Truth', desc: '人間によるデータラベリングを管理するサービス。Active Learning機能で自動ラベリングと人間レビューを組み合わせる。', tags: ['ラベリング', 'Active Learning', '自動ラベリング'] },
      ],
    },
    {
      title: 'SageMaker - モデル開発',
      items: [
        { name: 'SageMaker Studio', desc: 'ML開発の統合IDE。実験管理（Experiments）・Notebook・Pipelines・Model Registry・Clarify等を統一UIで利用。', tags: ['IDE', 'Experiments', '統合環境'] },
        { name: 'SageMaker Training', desc: '組み込みアルゴリズム（XGBoost/Linear Learner/DeepAR等）・カスタムコンテナ・分散学習（データ並列/モデル並列）・スポットトレーニングが重要。', tags: ['組み込みアルゴリズム', '分散学習', 'スポット'] },
        { name: 'SageMaker Automatic Model Tuning', desc: 'ハイパーパラメータを自動探索（Bayesian/Grid/Random/Hyperband）してモデルを最適化。ウォームスタートで前回結果を再利用できる。', tags: ['HPO', 'Bayesian最適化', 'ウォームスタート'] },
        { name: 'SageMaker Clarify', desc: 'バイアス検出（学習前/後）と説明可能性（SHAP値によるFeature Importance）を提供。Model Monitorとも統合。', tags: ['バイアス検出', 'SHAP', '説明可能性'] },
      ],
    },
    {
      title: 'SageMaker - デプロイ・MLOps',
      items: [
        { name: 'SageMaker Endpoints', desc: 'リアルタイムエンドポイント・非同期推論・サーバーレス推論・バッチ変換の4種類。マルチモデル/マルチコンテナエンドポイントでコスト最適化。', tags: ['リアルタイム', '非同期', 'バッチ変換'] },
        { name: 'SageMaker Pipelines', desc: 'MLパイプラインをDAGとして定義してCI/CD化。処理ステップ・学習・評価・モデル登録・デプロイを自動化する。', tags: ['MLパイプライン', 'CI/CD', 'DAG'] },
        { name: 'SageMaker Model Registry', desc: 'モデルのバージョン管理・メタデータ管理・承認ワークフロー。承認後にCodePipeline/Lambda経由で自動デプロイするパターンが重要。', tags: ['モデル管理', 'バージョン管理', '承認ワークフロー'] },
        { name: 'SageMaker Model Monitor', desc: 'デプロイ済みモデルのデータ品質・モデル品質・バイアスドリフト・説明可能性ドリフトを継続的に監視してアラートを発報。', tags: ['データドリフト', 'モデル品質', '継続的監視'] },
      ],
    },
    {
      title: 'MLインフラ・セキュリティ',
      items: [
        { name: 'ECR', desc: 'カスタムMLコンテナイメージの保存・バージョン管理。ECR内のイメージをSageMakerのTraining/Inference Jobで利用する。', tags: ['コンテナ', 'カスタムイメージ', 'バージョン管理'] },
        { name: 'CloudWatch + SageMaker', desc: 'SageMakerのトレーニングジョブ・エンドポイントのメトリクス（CPU/GPU/メモリ/レイテンシ）をCloudWatchで監視してアラーム設定。', tags: ['GPU監視', 'レイテンシ', 'アラーム'] },
        { name: 'IAM + VPC統合', desc: 'SageMakerのジョブをVPC内で実行してネットワーク分離。実行ロールでS3/ECR等へのアクセスを最小権限で管理する。', tags: ['VPC統合', '実行ロール', 'ネットワーク分離'] },
      ],
    },
  ],

  SAP: [
    {
      title: '組織とガバナンス',
      items: [
        { name: 'AWS Organizations', desc: '複数アカウントをOU（組織単位）で階層管理。SCP（サービスコントロールポリシー）はガードレールとして最大権限を制限するが権限は付与しない。', tags: ['SCP', 'OU', 'ガードレール'] },
        { name: 'Control Tower', desc: 'Organizationsの上でランディングゾーン（推奨構成）を自動セットアップ。Guardrails（予防/検出）・Account Factory・ログアーカイブアカウント。', tags: ['ランディングゾーン', 'Guardrails', 'Account Factory'] },
        { name: 'RAM (Resource Access Manager)', desc: 'サブネット/トランジットGW/Route 53 Resolverルール/ライセンス等のリソースをアカウント間で共有する。ピアリングなしでVPCリソースを共有できる。', tags: ['リソース共有', 'VPC共有', 'クロスアカウント'] },
        { name: 'Service Catalog', desc: 'ITサービスのカタログを管理してユーザーにセルフサービスで承認済みリソースを提供する。CloudFormationテンプレートベース。', tags: ['セルフサービス', 'カタログ', 'ガバナンス'] },
        { name: 'Config + Organizations', desc: 'Config組織アグリゲーターで全アカウントの設定データを集約して一元管理。コンフォーマンスパックを組織全体に展開。', tags: ['アグリゲーター', 'コンフォーマンスパック', '一元管理'] },
      ],
    },
    {
      title: '移行・モダン化',
      items: [
        { name: 'Application Migration Service', desc: 'オンプレや他クラウドのサーバーをAWSにリフトアンドシフト移行。エージェントで継続レプリケーションし短いカットオーバー時間を実現。', tags: ['リフト&シフト', 'エージェント', 'レプリケーション'] },
        { name: 'DMS (Database Migration Service)', desc: 'ソースDBからターゲットDBへのマイグレーション。同種/異種DB対応。継続的なCDCレプリケーションでダウンタイム最小化。', tags: ['DB移行', 'CDC', '異種DB'] },
        { name: 'Snow Family', desc: 'Snowcone（小型）/Snowball Edge（コンピュート付き）/Snowmobile（ペタバイト級）でオフラインデータ転送とエッジコンピューティング。', tags: ['オフライン転送', 'エッジコンピュート', 'ペタバイト'] },
        { name: 'Migration Hub', desc: 'Application Migration Service・DMS等のAWS移行ツールの進捗を一元的に追跡・管理するダッシュボード。', tags: ['移行追跡', 'ダッシュボード', '一元管理'] },
        { name: 'DataSync', desc: 'NFS/SMBのオンプレサーバー・S3/EFS/FSx・他クラウド間でデータを高速転送・同期する。TLS暗号化・帯域制御・スケジュール設定可能。', tags: ['高速転送', '同期', 'TLS'] },
      ],
    },
    {
      title: '高度なネットワーキング',
      items: [
        { name: 'Transit Gateway', desc: 'VPC/VPN/Direct Connectのハブ。ルートテーブルでルーティングを制御。TGWリージョン間ピアリングでマルチリージョン構成。マルチキャストサポート。', tags: ['ハブ&スポーク', 'リージョン間ピアリング', 'ルートテーブル'] },
        { name: 'Direct Connect', desc: '専用線接続。LAG（リンクアグリゲーション）・MACsec（L2暗号化）・VIF種別（プライベート/パブリック/トランジット）・冗長化パターンを把握。', tags: ['LAG', 'MACsec', 'VIF種別'] },
        { name: 'Network Firewall', desc: 'VPC内のステートフル/ステートレスパケットフィルタリング。Suricataルール（IPS機能）で高度なL7検査が可能。', tags: ['Suricata', 'IPS', 'ステートフル'] },
        { name: 'VPC共有 (RAM)', desc: 'アカウント間でサブネットを共有してリソースを同一VPCに配置。TGWよりシンプルな構成でネットワーク管理を一元化できる。', tags: ['サブネット共有', 'TGW不要', '一元管理'] },
      ],
    },
    {
      title: '弾力性・DR・コスト最適化',
      items: [
        { name: 'Aurora Global Database', desc: '1つのプライマリリージョン＋最大5つのセカンダリリージョン（読み取り）。RPO 1秒・RTO 1分以内のDR。セカンダリのフェイルオーバーはマネージドプランで実行。', tags: ['マルチリージョン', 'RPO/RTO', 'フェイルオーバー'] },
        { name: 'DynamoDB Global Tables', desc: 'マルチリージョンのアクティブ-アクティブ構成。競合解決はLast-Write-Wins。バージョン番号（バージョン衝突回避）。', tags: ['アクティブ-アクティブ', 'Last-Write-Wins', 'マルチリージョン'] },
        { name: 'Elastic Disaster Recovery', desc: 'Agentベースのサーバー継続レプリケーションでポイントインタイムリカバリを実現。RTO数分・低コストのDRソリューション。', tags: ['PITR', '低コストDR', 'エージェント'] },
        { name: 'Compute Optimizer', desc: 'EC2/Lambda/EBS/ECS/Auto Scalingのリソース使用状況をMLで分析して適正サイズを推奨。コスト削減率も表示。', tags: ['適正サイズ', 'ML分析', 'コスト削減'] },
        { name: 'Cost Anomaly Detection', desc: '機械学習でコスト異常を検出してSNS通知。サービス別・リンクアカウント別・コストカテゴリ別のモニターを設定する。', tags: ['異常検出', 'ML', 'SNS通知'] },
      ],
    },
  ],

  AIP: [
    {
      title: 'Amazon Bedrock - コア',
      items: [
        { name: 'Bedrock 基盤モデル', desc: 'Amazon Titan・Anthropic Claude・Meta Llama・Mistral・Cohere・Stability AI等のモデルを単一APIで呼び出せる。モデルの選択基準（コスト/速度/能力）が重要。', tags: ['Claude', 'Titan', 'マルチモデル'] },
        { name: 'Bedrock Knowledge Bases', desc: 'S3のドキュメントをチャンクに分割→エンベディング変換→ベクトルストア（OpenSearch/Aurora pgvector等）に格納してRAGを実現する。', tags: ['RAG', 'ベクトルストア', 'チャンキング'] },
        { name: 'Bedrock Agents', desc: 'FMをオーケストレーターとしてAPIコール（Action Groups）・Knowledge Base検索・メモリ（セッション内/クロスセッション）を組み合わせて複雑タスクを自律実行。', tags: ['Action Groups', 'ReAct', 'マルチターン'] },
        { name: 'Bedrock Guardrails', desc: 'コンテンツフィルタリング（暴力/ヘイト/性的）・PIIの検出・マスキング・グラウンディングチェック（ハルシネーション検出）・特定トピックの拒否を設定。', tags: ['コンテンツフィルタ', 'PII', 'グラウンディング'] },
        { name: 'Bedrock Model Customization', desc: 'ファインチューニング（教師あり）・継続事前学習（ドメインデータで追加学習）・Distillation（大モデル→小モデルへの知識転移）。', tags: ['ファインチューニング', '継続事前学習', 'Distillation'] },
        { name: 'Bedrock Model Evaluation', desc: '自動評価（組み込みメトリクス）・人間評価のどちらかを選択してモデルを評価・比較できる。タスク別に適切なモデルを選定。', tags: ['モデル評価', '自動評価', '比較'] },
      ],
    },
    {
      title: '生成AIアーキテクチャパターン',
      items: [
        { name: 'RAGパターン', desc: 'ユーザークエリ→エンベディング変換→ベクトル検索→関連チャンク取得→コンテキスト付きプロンプト→FM生成の流れ。チャンクサイズ・重複・ランク付けが精度に影響。', tags: ['チャンキング', 'エンベディング', 'ランク付け'] },
        { name: 'プロンプトエンジニアリング', desc: 'System/Human/Assistantの役割設定・Few-shot例示・Chain-of-Thought・XML構造でのタスク明示・ネガティブプロンプトがAIP頻出。', tags: ['System prompt', 'Few-shot', 'Chain-of-Thought'] },
        { name: 'エージェントパターン', desc: 'ReActフレームワーク（推論→行動→観察のループ）・ツール呼び出し（Function Calling）・マルチエージェントオーケストレーション。', tags: ['ReAct', 'Function Calling', 'マルチエージェント'] },
        { name: 'ベクトルDB選択', desc: 'Amazon OpenSearch Serverless（ベクトルエンジン）・Aurora PostgreSQL（pgvector）・MemoryDB（Redis互換）・外部（Pinecone/Weaviate）を用途で選ぶ。', tags: ['OpenSearch', 'pgvector', 'MemoryDB'] },
      ],
    },
    {
      title: '責任あるAI・ガバナンス',
      items: [
        { name: '安全とコンテンツポリシー', desc: 'Bedrockガードレールで有害コンテンツをフィルタリング。モデル提供者（Anthropic等）のUsage Policyへの遵守。AWS AI Service Cardsで透明性。', tags: ['ガードレール', 'Usage Policy', '透明性'] },
        { name: 'データプライバシー', desc: 'Bedrockはデフォルトでモデル学習にユーザーデータを使用しない。VPCエンドポイント経由でデータをAWS内に保持する。KMSでデータを暗号化。', tags: ['データ保護', 'VPCエンドポイント', 'KMS'] },
        { name: 'モニタリングと監査', desc: 'CloudTrailでBedrock APIコールを記録。CloudWatchでInvocationCount/Latency/ErrorCount等のメトリクスを監視してアラーム設定。', tags: ['CloudTrail', 'CloudWatch', 'APIログ'] },
      ],
    },
    {
      title: '最適化・運用',
      items: [
        { name: 'コスト最適化', desc: 'プロビジョニドスループット（コミットメント型で低コスト）vs オンデマンド。プロンプトキャッシュ（Bedrockがサポートするモデルで再利用）でコスト削減。', tags: ['プロビジョニドスループット', 'プロンプトキャッシュ', 'コスト'] },
        { name: 'レイテンシ最適化', desc: 'ストリーミングレスポンス（初回トークンまでの時間を体感改善）・適切なモデルサイズの選択・リージョンの最適化。', tags: ['ストリーミング', 'TTFT', 'モデルサイズ'] },
        { name: 'Amazon Q', desc: 'Q Business（企業内ナレッジへのAIチャット）・Q Developer（コード生成/補完/変換）・Q in QuickSight（BIのNL2SQL）の3製品が重要。', tags: ['Q Business', 'Q Developer', 'NL2SQL'] },
      ],
    },
  ],

  ANS: [
    {
      title: 'VPC詳細',
      items: [
        { name: 'VPC設計', desc: 'CIDRブロックの設計（プライベートアドレス空間・サブネット分割）・プライマリ/セカンダリCIDR追加・IPv6対応（/56割り当て→サブネットに/64）。', tags: ['CIDR設計', 'IPv6', 'セカンダリCIDR'] },
        { name: 'セキュリティグループ vs NACL', desc: 'SGはステートフル（戻りパケット自動許可）・ENIに適用。NACLはステートレス（明示的に許可必要）・サブネットに適用・番号順評価。', tags: ['ステートフル', 'ステートレス', '評価順序'] },
        { name: 'VPCフローログ', desc: 'ENI/サブネット/VPCレベルで取得可能。CWL or S3に送信。カスタムフォーマット（追加フィールド選択）でトラブルシューティング・セキュリティ分析に活用。', tags: ['フローログ', 'カスタムフォーマット', 'トラブルシュート'] },
        { name: 'VPCトラフィックミラーリング', desc: 'ENIのトラフィックをコピーしてモニタリングアプライアンスに転送。ディープパケットインスペクションとネットワーク分析に使用。', tags: ['ミラーリング', 'DPI', 'ネットワーク分析'] },
      ],
    },
    {
      title: '接続・ルーティング',
      items: [
        { name: 'Transit Gateway (TGW)', desc: 'TGWルートテーブルでルーティング制御（同一RTに置かないと通信不可）。TGWピアリングでリージョン間接続。VPN/DCアタッチメントも統合。', tags: ['TGWルートテーブル', 'リージョン間', 'アタッチメント'] },
        { name: 'Direct Connect (DC)', desc: '物理的な専用線。ホスト型（パートナー経由・1/10Gbps等）vs 専用型（AWS直接・1/10/100Gbps）。VIF（Virtual Interface）の種類：プライベート/パブリック/トランジット。', tags: ['ホスト型', '専用型', 'VIF'] },
        { name: 'Direct Connect 冗長化', desc: '最大冗長性（2つのロケーション・4つのDC・4接続）・高冗長性（2つのロケーション・2接続）・開発/テスト（1接続）のパターンを把握。', tags: ['最大冗長性', '高冗長性', 'HA'] },
        { name: 'Site-to-Site VPN', desc: 'カスタマーゲートウェイ（CGW）→仮想プライベートゲートウェイ（VGW）の接続。BGP（動的）またはスタティックルーティング。加速VPNでAWSバックボーン利用。', tags: ['CGW', 'VGW', '加速VPN'] },
        { name: 'Client VPN', desc: '相互TLS認証・Active Directory認証・SAML（IdP）認証の3つの認証方式。スプリットトンネリングで一部トラフィックのみVPN経由に設定可能。', tags: ['相互TLS', 'AD認証', 'スプリットトンネル'] },
      ],
    },
    {
      title: 'DNS・コンテンツ配信',
      items: [
        { name: 'Route 53詳細', desc: 'ルーティングポリシー全7種類・DNSSEC（DNS応答への署名）・Resolver（ハイブリッドDNS解決）・Resolver DNS Firewall（悪意あるドメインのブロック）。', tags: ['DNSSEC', 'Resolver', 'DNS Firewall'] },
        { name: 'Route 53 Resolver', desc: 'インバウンドエンドポイント（オンプレ→AWSのDNS解決）とアウトバウンドエンドポイント（AWS→オンプレのDNS解決）の使い分けが重要。', tags: ['インバウンド', 'アウトバウンド', 'ハイブリッドDNS'] },
        { name: 'CloudFront詳細', desc: 'Origins（S3/ALB/カスタム）・ビヘイビア（パスパターン別設定）・OAC（S3アクセス制限）・Lambda@Edge（CloudFrontイベントで実行）・Field-Level暗号化。', tags: ['OAC', 'Lambda@Edge', 'Field-Level暗号化'] },
        { name: 'Global Accelerator', desc: 'Anycastで世界6つのAWSリージョンのどこからでも最寄りエッジポイントに到達。エンドポイントグループ・トラフィックダイヤルでトラフィック制御。', tags: ['Anycast', 'エンドポイントグループ', 'トラフィックダイヤル'] },
      ],
    },
    {
      title: 'セキュリティ・監視',
      items: [
        { name: 'Network Firewall', desc: 'VPCにデプロイするマネージドIPS/IDS。Suricata互換のステートフルルールエンジンでL7フィルタリング。集中型Firewallサブネットアーキテクチャ。', tags: ['Suricata', 'L7フィルタ', '集中型'] },
        { name: 'WAF', desc: 'AWS管理ルールグループ（IP評判/Amazonマネージドルール）・レートベースルール・Bot Control・CAPTCHA・ジオブロッキング。', tags: ['管理ルールグループ', 'Bot Control', 'CAPTCHA'] },
        { name: 'Shield Advanced', desc: 'L3/L4/L7 DDoS保護。AWSのShield応答チーム（SRT）へのアクセス。コスト保護（DDoS起因のスパイクコストを保護）。', tags: ['SRT', 'L3-L7保護', 'コスト保護'] },
        { name: 'Firewall Manager', desc: 'Organizations全体でWAF/Shield/Network Firewall/SGのポリシーを一元管理して強制適用する。新しいリソースに自動適用も可能。', tags: ['一元管理', '自動適用', 'Organizations'] },
        { name: 'VPCフローログ分析', desc: 'Athena（特定フィールドのクエリ）・CloudWatch Logs Insights（リアルタイム分析）・OpenSearch（ダッシュボード）と組み合わせてネットワーク可視化。', tags: ['Athena', 'Logs Insights', 'OpenSearch'] },
      ],
    },
  ],

  SCS: [
    {
      title: '脅威検出・インシデント対応',
      items: [
        { name: 'GuardDuty', desc: 'CloudTrail・VPCフローログ・DNSログ・S3データイベントを機械学習と脅威インテリジェンスで分析して脅威を検出。EventBridge→Lambda自動修復パターンが重要。', tags: ['脅威検出', '機械学習', '自動修復'] },
        { name: 'Macie', desc: 'S3バケット内のPII・認証情報・金融データ等の機密情報を自動検出・分類。バケットの公開設定ミスも検出する。', tags: ['PII検出', 'S3スキャン', 'データ分類'] },
        { name: 'Detective', desc: 'GuardDuty/CloudTrail/VPCフローログからグラフモデルを構築してセキュリティインシデントを視覚的に調査・分析する。', tags: ['グラフ分析', 'インシデント調査', '可視化'] },
        { name: 'Incident Manager', desc: 'インシデント検出→対応計画（Runbook）→エスカレーション→事後分析（PIR）のワークフローを自動化・管理するSystems Managerの機能。', tags: ['対応計画', 'Runbook', 'PIR'] },
        { name: 'Security Lake', desc: 'CloudTrail/VPCフローログ/GuardDuty等のデータをOCSF（Open Cybersecurity Schema Framework）に正規化してS3データレイクに集約する。', tags: ['OCSF', 'データ集約', 'セキュリティログ'] },
      ],
    },
    {
      title: 'セキュリティ監視・ログ',
      items: [
        { name: 'Security Hub', desc: 'GuardDuty/Inspector/Macie等の検出結果をASFF形式で集約・優先順位付け。CIS AWS Foundations/PCI DSS/NIST 800-53への準拠状況を自動チェック。', tags: ['ASFF', 'CIS', 'PCI DSS準拠'] },
        { name: 'CloudTrail', desc: '管理イベント（デフォルト）・データイベント（S3/Lambda等）・Insights（異常API呼び出し検出）の3種類。証跡のS3暗号化・整合性検証・CloudWatch Logs転送が重要。', tags: ['管理イベント', 'データイベント', '整合性検証'] },
        { name: 'Inspector', desc: 'EC2（エージェント不要）・ECRコンテナイメージ・Lambda関数の脆弱性を継続的にスキャン。CVEデータベースと照合してリスクスコアで優先順位付け。', tags: ['脆弱性スキャン', 'CVE', 'コンテナ'] },
        { name: 'AWS Config', desc: 'リソース設定の変更履歴記録・ルール評価（マネージド/カスタム）・コンフォーマンスパック・自動修復（SSM Automationと連携）。', tags: ['設定記録', 'ルール評価', '自動修復'] },
      ],
    },
    {
      title: 'インフラセキュリティ',
      items: [
        { name: 'WAF', desc: 'SQLi/XSSブロック・IPレピュテーションリスト・レートベースルール・AWSマネージドルールグループ・スコープダウンステートメントで精度向上。', tags: ['SQLi/XSS', 'レートベース', 'スコープダウン'] },
        { name: 'Shield Advanced', desc: 'L3〜L7のDDoS保護。SRT（Shield応答チーム）への24時間アクセス。HealthベースDDoS検出・コスト保護・プロアクティブエンゲージメント。', tags: ['SRT', 'プロアクティブ', 'コスト保護'] },
        { name: 'Network Firewall + Firewall Manager', desc: 'VPC内のNetwork Firewallポリシーと、Organizations全体へのFirewall Manager一元配布を組み合わせて多層防御を実現。', tags: ['多層防御', 'Suricata', '一元配布'] },
        { name: 'ACM Private CA', desc: 'プライベートPKIインフラを構築して内部サービス・デバイス向けの証明書を発行。ACMと統合してTLS証明書を自動管理。', tags: ['プライベートCA', 'PKI', 'TLS'] },
      ],
    },
    {
      title: 'IAM・アイデンティティ',
      items: [
        { name: 'IAM高度な管理', desc: 'アクセス許可の境界（Permission Boundary）・セッションポリシー・サービスコントロールポリシー（SCP）・リソースコントロールポリシー（RCP）の優先順位。', tags: ['Permission Boundary', 'SCP', 'RCP'] },
        { name: 'IAM Identity Center (SSO)', desc: '複数AWSアカウントへのシングルサインオン。外部IdP（Okta/Azure AD）とSAML 2.0フェデレーション。権限セットで一元的なアクセス管理。', tags: ['SSO', 'SAML', '権限セット'] },
        { name: 'Cognito詳細', desc: 'User Pool（OpenID Connect準拠・JWT発行・MFA・高度なセキュリティ機能）とIdentity Pool（クロスサービスアクセス・ロールマッピング）の連携パターン。', tags: ['OIDC', 'JWT', '高度なセキュリティ'] },
        { name: 'Organizations SCP/RCP', desc: 'SCP：アカウント/OUへの最大権限制限（IAM許可とのAND評価）。RCP：リソース（S3/KMS等）への横断的制限。Denyリストと許可リストの2つのアプローチ。', tags: ['SCP', 'RCP', 'Denyリスト'] },
      ],
    },
    {
      title: 'データ保護',
      items: [
        { name: 'KMS詳細', desc: 'キーポリシー（リソースベース）とIAMポリシーの組み合わせ。マルチリージョンキー・外部キーストア（XKS）・キーグラント・エンベロープ暗号化の仕組みを深く理解する。', tags: ['キーポリシー', 'マルチリージョンキー', 'XKS'] },
        { name: 'Secrets Manager', desc: '自動ローテーション（Lambda関数で実装・RDS/Redshift/DocumentDB等は組み込みサポート）。クロスアカウント共有・Secrets Manager VPCエンドポイントで安全なアクセス。', tags: ['自動ローテーション', 'クロスアカウント', 'VPCエンドポイント'] },
        { name: 'S3データ保護', desc: 'バケットポリシー・ACL無効化（推奨）・S3ブロックパブリックアクセス・Object Lock（WORM：Write Once Read Many）・SSE-S3/SSE-KMS/SSE-Cの暗号化。', tags: ['Object Lock', 'WORM', 'SSE-KMS'] },
        { name: 'Audit Manager', desc: 'PCI DSS/HIPAA/GDPR等のコンプライアンスフレームワークへの準拠状況をAWSの証拠を自動収集してレポート化する。', tags: ['コンプライアンス', 'PCI DSS', '証拠収集'] },
      ],
    },
  ],
};

// ── コンポーネント ────────────────────────────────────────────
const EXAM_ORDER = ['CLF', 'AIF', 'SAA', 'DVA', 'SOA', 'DEA', 'MLA', 'SAP', 'DOP', 'AIP', 'ANS', 'SCS'] as const;

export default function CheatSheet() {
  const { lang } = useLanguage();
  const [selectedExam, setSelectedExam] = useState<string>('SAA');
  const [search, setSearch] = useState('');

  const examColor = EXAM_LEVEL_COLORS[EXAM_LEVEL[selectedExam]] ?? 'var(--color-primary)';
  const ExamIcon = EXAM_ICON_COMPONENTS[selectedExam];
  const officialUrl = EXAM_OFFICIAL_URLS[selectedExam];
  const config = EXAM_CONFIGS[selectedExam];
  const sections = CHEAT_DATA[selectedExam] ?? [];

  const q = search.trim().toLowerCase();

  const filteredSections = useMemo(() => {
    if (!q) return sections;
    return sections
      .map(sec => ({
        ...sec,
        items: sec.items.filter(item =>
          item.name.toLowerCase().includes(q) ||
          item.desc.toLowerCase().includes(q) ||
          item.tags.some(t => t.toLowerCase().includes(q))
        ),
      }))
      .filter(sec => sec.items.length > 0);
  }, [sections, q]);

  const totalHits = filteredSections.reduce((s, sec) => s + sec.items.length, 0);

  return (
    <PageLayout maxWidth={860}>
      <Helmet>
        <title>チートシート | 無限ノック</title>
        <meta name="description" content="AWS認定試験ごとの代表的サービス・機能・概念を試験前の見直し用にまとめたチートシート。" />
      </Helmet>

      {/* ヘッダー */}
      <div style={{ marginBottom: 'var(--spacing-md)' }}>
        <h1 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 800, color: 'var(--color-text-main)', margin: 0, lineHeight: 1.3 }}>
          チートシート
        </h1>
        <p style={{ margin: '4px 0 0', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)' }}>
          試験前の確認・用語把握用。公式試験ガイドベース。
        </p>
      </div>

      {/* 試験選択 + 検索 */}
      <div style={{ display: 'flex', gap: 'var(--spacing-sm)', marginBottom: 'var(--spacing-md)', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <select
            value={selectedExam}
            onChange={e => { setSelectedExam(e.target.value); setSearch(''); }}
            style={{
              appearance: 'none',
              paddingLeft: 36,
              paddingRight: 32,
              paddingTop: 8,
              paddingBottom: 8,
              borderRadius: 'var(--border-radius-full)',
              border: `2px solid ${examColor}`,
              background: `${examColor}14`,
              color: examColor,
              fontWeight: 700,
              fontSize: 'var(--font-size-base)',
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            {EXAM_ORDER.filter(e => CHEAT_DATA[e]).map(exam => {
              const lv = EXAM_LEVEL[exam];
              const col = EXAM_LEVEL_COLORS[lv] ?? '#000';
              return (
                <option key={exam} value={exam} style={{ color: col, fontWeight: 700 }}>
                  {exam} — {EXAM_CONFIGS[exam]?.fullName?.replace('AWS Certified ', '')}
                </option>
              );
            })}
          </select>
          {ExamIcon && (
            <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: examColor, display: 'flex', pointerEvents: 'none' }}>
              <ExamIcon size={16} />
            </span>
          )}
          <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: examColor, pointerEvents: 'none', fontSize: 10 }}>▼</span>
        </div>

        {/* 検索バー */}
        <div style={{ flex: 1, minWidth: 160, position: 'relative' }}>
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="サービス名・キーワードで絞り込み"
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '8px 12px 8px 36px',
              borderRadius: 'var(--border-radius-full)',
              border: '1.5px solid var(--color-border)',
              background: 'var(--color-bg-white)',
              color: 'var(--color-text-main)',
              fontSize: 'var(--font-size-sm)',
              outline: 'none',
            }}
          />
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-light)', fontSize: 14, pointerEvents: 'none' }}>🔍</span>
        </div>
      </div>

      {/* 試験ヘッダー */}
      <div style={{
        background: `${examColor}10`,
        border: `1.5px solid ${examColor}40`,
        borderRadius: 'var(--border-radius-lg)',
        padding: '12px 16px',
        marginBottom: 'var(--spacing-md)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {ExamIcon && <ExamIcon size={20} />}
          <div>
            <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 800, color: examColor }}>{config?.examCode}</div>
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-sub)', marginTop: 1 }}>{config?.fullName}</div>
          </div>
          <span style={{
            marginLeft: 4,
            fontSize: 'var(--font-size-xs)',
            padding: '2px 8px',
            borderRadius: 'var(--border-radius-full)',
            background: examColor,
            color: '#fff',
            fontWeight: 700,
            flexShrink: 0,
          }}>
            {EXAM_LEVEL[selectedExam]}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {officialUrl && (
            <>
              <a
                href={officialUrl.page}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontSize: 'var(--font-size-xs)',
                  color: examColor,
                  border: `1px solid ${examColor}`,
                  borderRadius: 'var(--border-radius-full)',
                  padding: '3px 10px',
                  textDecoration: 'none',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                }}
              >
                公式ページ ↗
              </a>
              <a
                href={officialUrl.guide}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontSize: 'var(--font-size-xs)',
                  color: 'var(--color-text-sub)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--border-radius-full)',
                  padding: '3px 10px',
                  textDecoration: 'none',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                }}
              >
                試験ガイド PDF ↗
              </a>
            </>
          )}
        </div>
      </div>

      {/* 検索結果ヒント */}
      {q && (
        <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-sub)', marginBottom: 'var(--spacing-sm)' }}>
          「{search}」の検索結果: {totalHits} 件
        </p>
      )}
      {q && totalHits === 0 && (
        <p style={{ color: 'var(--color-text-light)', fontSize: 'var(--font-size-sm)', textAlign: 'center', padding: 'var(--spacing-xl)' }}>
          該当するサービス・概念が見つかりませんでした
        </p>
      )}

      {/* セクション一覧 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
        {filteredSections.map(section => (
          <div key={section.title}>
            <h2 style={{
              fontSize: 'var(--font-size-sm)',
              fontWeight: 700,
              color: examColor,
              margin: '0 0 var(--spacing-sm)',
              paddingBottom: 6,
              borderBottom: `2px solid ${examColor}30`,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}>
              <span style={{ display: 'inline-block', width: 3, height: 14, background: examColor, borderRadius: 2 }} />
              {section.title}
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 'var(--spacing-sm)' }}>
              {section.items.map(item => (
                <ItemCard key={item.name} item={item} q={q} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </PageLayout>
  );
}

function ItemCard({ item, q }: { item: Item; q: string }) {
  const highlight = (text: string) => {
    if (!q) return text;
    const idx = text.toLowerCase().indexOf(q);
    if (idx < 0) return text;
    return (
      <>
        {text.slice(0, idx)}
        <mark style={{ background: '#fef08a', color: 'inherit', borderRadius: 2 }}>{text.slice(idx, idx + q.length)}</mark>
        {text.slice(idx + q.length)}
      </>
    );
  };

  return (
    <div style={{
      background: 'var(--color-bg-white)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--border-radius-md)',
      padding: '10px 12px',
      boxShadow: 'var(--box-shadow-sm)',
    }}>
      <div style={{ fontWeight: 700, fontSize: 'var(--font-size-base)', color: 'var(--color-text-main)', marginBottom: 4 }}>
        {highlight(item.name)}
      </div>
      <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)', margin: '0 0 8px', lineHeight: 1.55 }}>
        {highlight(item.desc)}
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {item.tags.map(tag => (
          <span key={tag} style={{
            fontSize: 'var(--font-size-xs)',
            background: 'var(--color-bg-main)',
            color: 'var(--color-text-sub)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--border-radius-full)',
            padding: '1px 7px',
          }}>
            {highlight(tag)}
          </span>
        ))}
      </div>
    </div>
  );
}
