'use client';
import React, { useState, useMemo, useEffect } from 'react';
import { Helmet } from '@/compat/react-helmet-async';
import { EXAM_LEVEL, EXAM_LEVEL_COLORS } from '../constants';
import { EXAM_ICON_COMPONENTS, IconSearch, IconCopy, IconCheck } from '../components/Icons';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import PageLayout from '../components/ui/PageLayout';

// ── データ型 ─────────────────────────────────────────────────
interface Item { name: string; desc: string; tags: string[]; keyword?: string; seeAlso?: string[]; termKeywords?: Record<string, string> }
interface Section { title: string; items: Item[] }
type CheatData = Record<string, Section[]>

// ── 共有アイテム（複数の試験セクションで使い回す場合はここに定義して参照する） ──
// 同じ Item オブジェクトを複数の items 配列に含めることで1箇所の定義を使い回せる
// 例: const ITEM_FOO: Item = { name: 'Foo', desc: '...', tags: [] };
//     SOA → items: [..., ITEM_FOO]  /  SCS → items: [..., ITEM_FOO]

// ── 試験別チートシートデータ ──────────────────────────────────
const CHEAT_DATA: CheatData = {
  CLF: [
    {
      title: 'クラウドの概念',
      items: [
        { name: '責任共有モデル', desc: 'AWSと顧客でセキュリティ責任を分担するモデル。\nAWS負担: 物理インフラ・ホスト・ネットワーク・ストレージハードウェア\n顧客負担: OS・ミドルウェア・アプリ・データ・IAM設定', keyword: 'AWS 責任共有モデル', tags: ['分担', 'セキュリティ', '範囲'] , seeAlso: ['IAM']},
        { name: 'Well-Architectedフレームワーク', desc: '6本柱でクラウド設計を評価するAWS公式のベストプラクティス集。\n① 運用上の優秀性（変化への対応・自動化）\n② セキュリティ（最小権限・暗号化）\n③ 信頼性（障害自動回復・水平スケール）\n④ パフォーマンス効率（適切なリソース選択）\n⑤ コスト最適化（不要リソース排除）\n⑥ 持続可能性（エネルギー効率）', keyword: 'AWS Well-Architected Framework', tags: ['6本柱', '設計', 'ベストプラクティス'] , seeAlso: ['コスト最適化']},
        { name: 'CAF（Cloud Adoption Framework）', desc: 'クラウド移行を組織全体で成功させる6つの視点のフレームワーク。\nビジネス: ROI・ビジネスケース\n人: スキル・文化変革\nガバナンス: リスク管理・コンプライアンス\nプラットフォーム: アーキテクチャ基盤\nセキュリティ: セキュリティ管理\n運用: 運用モデル', keyword: 'Cloud Adoption Framework', tags: ['移行', '6視点', 'フレームワーク'] },
        { name: 'サービスモデル', desc: 'IaaS（Infrastructure as a Service）: EC2のような仮想インフラ。OS以上は自分で管理\nPaaS（Platform as a Service）: Elastic Beanstalkのような実行基盤。アプリのみ管理\nSaaS（Software as a Service）: WorkSpacesのような完成品アプリ。設定のみ管理', keyword: 'IaaS PaaS SaaS クラウドサービスモデル', tags: ['IaaS', 'PaaS', 'SaaS'] , seeAlso: ['EC2', 'Elastic Beanstalk']},
        { name: 'クラウドメリット', desc: '俊敏性 (Agility): 数分でリソース調達（オンプレは数週間）\n弾力性 (Elasticity): 需要に合わせて自動でスケールアップ/ダウン\nグローバル展開: 世界中のリージョンに即座にデプロイ\nコスト: CAPEX（設備投資）→ OPEX（運用費）に転換し初期投資不要\nスケールメリット: AWSの大規模調達によりユーザーのコストが下がる', keyword: 'AWSクラウドのメリット', tags: ['俊敏性', '弾力性', 'OPEX'] },
      ],
    },
    {
      title: 'コンピューティング',
      items: [
        { name: 'EC2', desc: '仮想サーバー（Elastic Compute Cloud）。OS・ミドルウェアを自由に選択できる。\n購入オプション:\nオンデマンド: 使った秒数だけ課金。短期・不規則な用途に最適\nスポット: 未使用キャパシティを最大90%割引で利用。中断許容が条件\nリザーブド: 1〜3年コミットで最大72%割引。安定した定常ワークロードに最適\nSavings Plans: 利用量をコミットする柔軟な割引プラン', tags: ['オンデマンド', 'スポット', 'リザーブド'] },
        { name: 'Lambda', desc: 'サーバーレス実行環境（FaaS: Function as a Service）。サーバー管理不要でコードだけ書けばよい。\nイベント（S3アップロード・API呼び出し・タイマー等）に応じて自動起動し、実行時間のみ課金される。', tags: ['サーバーレス', 'FaaS', 'トリガー'] , keyword: 'EventBridge SNS SQS', seeAlso: ['EventBridge', 'S3', 'SNS', 'SQS']},        { name: 'Elastic Beanstalk', desc: 'アプリのコードをアップロードするだけで、EC2・ELB（ロードバランサー）・Auto Scalingを自動設定するPaaSサービス。\nインフラを意識せずにアプリを素早くデプロイしたい場合に適している。', tags: ['PaaS', 'デプロイ', '自動設定'] , seeAlso: ['Auto Scaling', 'EC2', 'ELB']},
        { name: 'ECS / EKS', desc: 'コンテナ管理サービス（Docker コンテナを実行・管理する）。\nECS（Elastic Container Service）: AWS独自のコンテナオーケストレーター。シンプルで使いやすい\nEKS（Elastic Kubernetes Service）: Kubernetes（コンテナ管理の業界標準OSS）のマネージドサービス\nどちらもFargate（サーバーレス起動モード）でEC2管理を省略できる', tags: ['コンテナ', 'Kubernetes', 'Fargate'] , seeAlso: ['EC2']},
        { name: 'Lightsail', desc: 'シンプルなVPS（仮想専用サーバー）サービス。固定月額料金でサーバー・SSD・データ転送量が含まれるため料金が予測しやすい。WordPress・小規模WebサイトなどEC2より簡単に使いたい場合に最適。', tags: ['VPS', '固定料金', 'シンプル'] , seeAlso: ['EC2']},
        { name: 'Auto Scaling', desc: '需要の変化に応じてEC2インスタンス数を自動で増減するサービス。\nスケールアウト（インスタンスを追加して処理能力を増強）とスケールイン（インスタンスを削減してコストを節約）を自動化する。\nスケーリングポリシー: CPU使用率などのメトリクスに基づくダイナミックスケーリングと、スケジュール指定のスケーリングがある。\nELBと組み合わせることでアクセス増加時にインスタンスを自動追加してトラフィックを分散する構成が基本形。', keyword: 'Auto Scaling スケールアウト スケールイン 弾力性 水平スケール CloudWatch', tags: ['スケールアウト', '弾力性', '自動化'], seeAlso: ['EC2', 'ELB', 'CloudWatch'] },      ],
    },
    {
      title: 'ストレージ',
      items: [
        { name: 'S3', desc: '耐久性99.999999999%（11ナイン）のオブジェクトストレージ（ファイルをURLで管理する形式）。\nバケット（≒フォルダのコンテナ）単位でデータを整理し、静的Webサイトのホスティングにも使える。容量無制限で、画像・動画・バックアップ・ログ等の保存に広く使われる。', tags: ['オブジェクト', '11ナイン', '静的ホスティング'] , keyword: 'Lambda SNS SQS', seeAlso: ['Lambda', 'SNS', 'SQS']},        { name: 'EBS', desc: 'EC2にアタッチして使うブロックストレージ（HDDやSSDのような仮想ディスク）。\ngp3: 汎用SSD（デフォルト。コストと性能のバランスが良い）\nio2: プロビジョニドIOPS SSD（高IOPSが必要なDB用途）\nst1: スループット最適化HDD（ログやビッグデータの順次読み書き）\nsc1: コールドHDD（アクセス頻度が低いアーカイブ用途）', tags: ['ブロック', 'EC2', 'gp3'] , seeAlso: ['EC2']},
        { name: 'EFS', desc: '複数のEC2インスタンスから同時マウントできるNFS（Network File System）ファイルシステム。容量は自動でスケールするため事前のサイジング不要。Linux EC2やECS・Lambda・SageMakerなどから利用できる。', tags: ['NFS', '共有マウント', 'サーバーレス'] , seeAlso: ['EC2', 'Lambda']},
        { name: 'S3 Glacier', desc: '長期アーカイブ向けの低コストストレージ。S3 Standardと比べ保存コストが大幅に安い。\n取得速度の種類:\nInstant Retrieval: ミリ秒単位で取得可能（月1回程度のアクセスに最適）\nFlexible Retrieval: 数分〜12時間（コスト優先）\nDeep Archive: 最大48時間（最安。7〜10年保持のデータ向け）', tags: ['アーカイブ', '低コスト', '取得遅延'] , seeAlso: ['S3']},
      ],
    },
    {
      title: 'データベース',
      items: [
        { name: 'RDS', desc: 'マネージドなリレーショナルDB（表形式でSQLを使うデータベース）。パッチ・バックアップ・フェイルオーバーをAWSが自動管理。\n対応エンジン: MySQL / PostgreSQL / MariaDB / Oracle / SQL Server / Aurora\nMulti-AZ: プライマリDBの変更をスタンバイDBに同期レプリケーションし、障害時に自動フェイルオーバー', tags: ['MySQL', 'Multi-AZ', 'リードレプリカ'] , seeAlso: ['Aurora']},
        { name: 'DynamoDB', desc: 'フルマネージドなNoSQLデータベース（SQLを使わないキーバリュー型・ドキュメント型）。\nパーティションキー（+オプションでソートキー）でデータを管理し、一桁ミリ秒の低レイテンシを維持しながら自動でスケールする。', tags: ['NoSQL', '低レイテンシ', 'スケーラブル'] , keyword: 'Lambda', seeAlso: ['Lambda']},        { name: 'Aurora', desc: 'AWS独自設計の高性能RDB。MySQL・PostgreSQL互換で既存アプリをそのまま移行できる。\nRDSより最大3倍高速で、6コピーのデータを3つのAZ（アベイラビリティゾーン）に自動分散保存して高耐久性を実現。\nAurora Serverless v2はトラフィックに応じてコンピュートを自動スケールする。', tags: ['MySQL互換', '高性能', 'Aurora Serverless'] , keyword: 'Aurora Global Database', seeAlso: ['Aurora Global Database', 'RDS']},        { name: 'ElastiCache', desc: 'インメモリキャッシュサービス（データをメモリ上に保持し超高速アクセスを実現）。DBへの繰り返し読み取りをキャッシュで代替してレイテンシとDB負荷を削減する。\nRedis: レプリケーション・永続化・Pub/Sub・Sorted Set等の豊富な機能を持つ\nMemcached: シンプルなマルチスレッドキャッシュ。高スループットが必要な場合に適する', tags: ['Redis', 'Memcached', 'インメモリ'] },
        { name: 'Redshift', desc: 'OLAPワークロード（大量データの分析クエリ）向けのデータウェアハウス（DWH）。\n列指向ストレージ（同じ列のデータをまとめて圧縮・格納）により集計クエリを高速処理する。TB〜PBスケールのデータ分析に使用する。', tags: ['DWH', '列指向', '分析'] , keyword: 'S3', seeAlso: ['S3']},      ],
    },
    {
      title: 'ネットワーキング',
      items: [
        { name: 'VPC', desc: 'AWSクラウド内に作る仮想プライベートネットワーク（Virtual Private Cloud）。\nサブネット: VPC内のIPアドレス範囲の分割単位（パブリック/プライベートで用途分け）\nルートテーブル: トラフィックの行き先を定義するルール\nインターネットゲートウェイ（IGW）: VPCとインターネットをつなぐゲートウェイ', tags: ['サブネット', 'ルートテーブル', 'IGW'] },
        { name: 'Route 53', desc: 'マネージドDNSサービス。ドメイン名をIPアドレスに変換する（例: example.com → 1.2.3.4）。\nヘルスチェックでエンドポイントの死活を監視し、フェイルオーバールーティングで正常なリソースへ自動切り替えできる。', tags: ['DNS', 'ヘルスチェック', 'ルーティング'] },
        { name: 'CloudFront', desc: 'グローバルCDN（Content Delivery Network）。世界450以上のエッジロケーションにコンテンツをキャッシュして、ユーザーに最も近いエッジから低レイテンシで配信する。\nオリジン（配信元）にはS3・ALB・EC2・カスタムサーバーを設定できる。', tags: ['CDN', 'エッジ', 'キャッシュ'] , keyword: 'Lambda', seeAlso: ['EC2', 'Lambda', 'S3']},        { name: 'ELB', desc: '複数のターゲット（EC2やコンテナ等）にトラフィックを分散するロードバランサー（負荷分散装置）。\nALB（Application Load Balancer）: HTTP/HTTPS（L7）。URLパスやホストヘッダーでルーティング\nNLB（Network Load Balancer）: TCP/UDP（L4）。固定IP・超低レイテンシが必要な用途向け', tags: ['ALB', 'NLB', 'L7/L4'] , keyword: 'S3', seeAlso: ['EC2', 'S3']},        { name: 'Direct Connect', desc: 'オンプレミスとAWSをインターネットを経由しない専用線（物理回線）で接続するサービス。\n安定した帯域幅・低レイテンシ・高セキュリティが実現でき、大容量データ転送や機密性が高いシステムに適している。', tags: ['専用線', 'ハイブリッド', '低レイテンシ'] , keyword: 'DynamoDB S3 VPC', seeAlso: ['DynamoDB', 'S3', 'VPC']},      ],
    },
    {
      title: 'セキュリティ',
      items: [
        { name: 'IAM', desc: 'AWSリソースへのアクセスを制御するサービス（Identity and Access Management）。\nユーザー: 個人のアカウント\nグループ: 複数ユーザーへのまとめて権限付与\nロール: EC2やLambdaなどのサービスに一時的に権限を付与する仕組み\nポリシー: 「何のリソースに何の操作ができるか」をJSON形式で定義したルール\n最小権限の原則: 必要最小限の権限だけ付与する', tags: ['ポリシー', 'ロール', '最小権限'] , keyword: 'KMS S3', seeAlso: ['EC2', 'KMS', 'Lambda', 'S3']},        { name: 'Shield', desc: 'DDoS攻撃（大量リクエストによるサービス妨害）を自動で軽減するサービス。\nStandard: すべてのAWSリソースに無料で自動適用。L3/L4攻撃を防御\nAdvanced: 有料オプション。L7攻撃も防御し、AWS Shield応答チーム（SRT）への24時間アクセスとDDoS起因のコスト保護も提供', tags: ['DDoS', 'Standard', 'Advanced'] },
        { name: 'WAF', desc: 'WebアプリケーションへのL7攻撃をフィルタリングするWebアプリケーションファイアウォール。\nSQLインジェクション（DBへの不正クエリ注入）・XSS（クロスサイトスクリプティング）・ボット等の攻撃をルールでブロックする。CloudFront・ALB・API Gatewayに適用できる。', tags: ['Webファイアウォール', 'SQLi', 'XSS'] , seeAlso: ['API Gateway', 'CloudFront']},
        { name: 'KMS', desc: '暗号化キーを作成・保管・管理するサービス（Key Management Service）。\nS3・EBS・RDS・DynamoDB等のAWSサービスと統合し、データを透過的に暗号化・復号する。CMK（Customer Managed Key）で暗号化ポリシーを細かく制御できる。', tags: ['暗号化', 'CMK', 'キー管理'] , seeAlso: ['DynamoDB', 'EBS', 'RDS', 'S3']},
        { name: 'Trusted Advisor', desc: 'AWSのベストプラクティスに基づき改善提案をするアドバイザーツール。\n5つのカテゴリ: コスト最適化 / パフォーマンス / セキュリティ / 耐障害性 / サービス上限\nBasicサポートでも一部のチェックは無料で使用できる。', tags: ['ベストプラクティス', 'コスト', 'セキュリティ'] , seeAlso: ['コスト最適化']},
      ],
    },
    {
      title: '管理・監視',
      items: [
        { name: 'CloudWatch', desc: 'AWSリソースとアプリの監視サービス。\nメトリクス: CPU使用率・メモリ・ネットワーク等の数値データをグラフで可視化\nログ: アプリやサービスのログを収集・検索\nアラーム: しきい値を超えたらSNS通知やAutoScalingを自動実行', tags: ['メトリクス', 'ログ', 'アラーム'] , keyword: 'EC2', seeAlso: ['EC2', 'SNS']},        { name: 'CloudTrail', desc: 'AWSアカウントで実行されたすべてのAPIコールを記録する監査ログサービス。\n誰が・どのリソースに・いつ・何をしたかを追跡でき、デフォルトで90日間保持。S3に証跡を保存すれば無期限に保管できる。', tags: ['監査', 'APIログ', 'コンプライアンス'] , keyword: 'Lambda', seeAlso: ['Lambda', 'S3']},        { name: 'AWS Config', desc: 'AWSリソースの設定変更を継続的に記録し、望ましい状態からの逸脱を検出するサービス。\nルール（例: 「S3バケットの公開設定を禁止」）を定義して準拠状況を自動チェックし、違反を通知・自動修復できる。', tags: ['設定管理', 'ルール', 'コンプライアンス'] , keyword: 'Lambda', seeAlso: ['Lambda', 'S3']},        { name: 'Systems Manager', desc: 'EC2などのインフラを一元管理する運用サービス群。\nSession Manager: SSHポートを開けずにブラウザからEC2にアクセス\nPatch Manager: OSのセキュリティパッチを自動適用\nParameter Store: 設定値・秘密情報を安全に保管\nRun Command: 複数EC2に同時コマンド実行', tags: ['パッチ管理', 'Session Manager', '自動化'] , seeAlso: ['EC2']},
        { name: 'Organizations', desc: '複数のAWSアカウントを階層的に管理するサービス。\nOU（組織単位）でアカウントをグループ化し、SCP（サービスコントロールポリシー）でOU/アカウントに使用できるサービスや操作を制限できる。請求を一括でまとめられる（コンソリデーテッドビリング）。', tags: ['マルチアカウント', '一括請求', 'SCP'] },
      ],
    },
    {
      title: '統合・メッセージング',
      items: [
        { name: 'SNS', desc: 'パブリッシュ/サブスクライブ型の通知サービス（Simple Notification Service）。\n1つのメッセージを複数の宛先（Lambda・SQS・Eメール・HTTP/S等）へ同時配信（ファンアウト）できる。\nCloudWatchアラームの通知先として設定したり、S3イベントを複数サービスへ同報するパターンで広く使われる。', keyword: 'SNS Simple Notification Service Pub/Sub ファンアウト 通知', tags: ['Pub/Sub', 'ファンアウト', '通知'], seeAlso: ['SQS', 'Lambda', 'CloudWatch'] },
        { name: 'SQS', desc: 'フルマネージドなメッセージキューサービス（Simple Queue Service）。\nメッセージをキューに蓄積し、受信側が非同期で取り出して処理するデカップリングパターンを実現する。\n標準キュー: 高スループット・ベストエフォートの順序\nFIFOキュー: 厳密な順序保証と重複排除が必要な場合', keyword: 'SQS Simple Queue Service キュー 非同期 デカップリング FIFO SNS Lambda', tags: ['キュー', '非同期', 'デカップリング'], seeAlso: ['SNS', 'Lambda'] },      ],
    },
    {
      title: '料金・サポート',
      items: [
        { name: '料金モデル', desc: '基本は「使った分だけ払う」従量課金（オンデマンド）。\nリザーブドインスタンス: 1〜3年コミットで最大72%割引\nSavings Plans: 1〜3年間の利用量をコミットする柔軟な割引（EC2・Fargate・Lambdaに適用）\nスポットインスタンス: 最大90%割引だが中断あり\nデータ転送: AWSへの受信は無料。送信は有料（リージョン外へ）', keyword: 'AWS 料金 リザーブドインスタンス Savings Plans', tags: ['オンデマンド', 'リザーブド', 'Savings Plans'] , seeAlso: ['EC2', 'Lambda']},
        { name: 'Cost Explorer', desc: '過去・現在・将来のAWSコストをグラフで可視化・分析するツール。\nサービス別・リソース別・タグ別・アカウント別にコストをフィルタリングでき、リザーブドインスタンスやSavings Plansの推奨事項も提示してくれる。', tags: ['コスト分析', '可視化', '予測'] },
        { name: 'Budgets', desc: '月額コスト・使用量・リザーブドインスタンス・Savings Plansに対してしきい値アラートを設定するコスト管理ツール。\n予算の80%・100%に達したらメール通知するよう設定することが多い。', tags: ['予算管理', 'アラート', 'しきい値'] },
        { name: 'サポートプラン', desc: '5段階のサポートプランから選択する。\nベーシック: 無料。ドキュメント・フォーラムのみ\nデベロッパー: 有料。メールサポート（翌日以内応答）\nビジネス: 有料。24時間電話・チャット。信頼できるアドバイザー全チェック\nエンタープライズOn-Ramp: TAM（テクニカルアカウントマネージャー）へのプール制アクセス\nエンタープライズ: 専任TAM・15分以内のSLA', keyword: 'AWS サポートプラン TAM テクニカルアカウントマネージャー', tags: ['ベーシック', 'ビジネス', 'エンタープライズ'] },
      ],
    },
  ],

  AIF: [
    {
      title: 'AI・MLの基礎',
      items: [
        { name: '機械学習の種類', desc: '教師あり学習 (Supervised Learning): 正解ラベル付きデータで学習。分類（カテゴリ予測）と回帰（数値予測）が代表例\n教師なし学習 (Unsupervised Learning): ラベルなしデータのパターンを発見。クラスタリング（グループ化）・次元削減が代表例\n強化学習 (Reinforcement Learning): 報酬を最大化する行動を試行錯誤で学習。ゲームAI・ロボット制御に使用', keyword: '機械学習 教師あり学習 教師なし学習 強化学習', tags: ['教師あり', '教師なし', '強化学習'] },
        { name: 'モデル評価指標', desc: 'Accuracy（精度）: 全予測中の正解率。クラス不均衡時は注意\nPrecision（適合率）: 「陽性」と予測した中で実際に陽性の割合（偽陽性を減らしたい時に重視）\nRecall（再現率）: 実際の陽性のうち正しく検出できた割合（見逃しを減らしたい時に重視）\nF1スコア: PrecisionとRecallの調和平均\nAUC-ROC: 閾値変化に対するモデルの識別能力を示す（1に近いほど優秀）', keyword: 'F1スコア Precision Recall AUC-ROC 機械学習評価指標', tags: ['Accuracy', 'F1スコア', 'AUC-ROC'] },
        { name: '過学習と正則化', desc: '過学習（Overfitting）: 訓練データに過剰適合し、未知データで性能が落ちる問題。\n対策手法:\nL1正則化（Lasso）: 不要な特徴量の重みをゼロにして特徴量選択の効果\nL2正則化（Ridge）: 重みを小さく抑えてモデルを単純化\nドロップアウト: ニューラルネットのニューロンをランダムに無効化して汎化性能を向上\nデータ拡張: 学習データを水増しして多様性を高める', keyword: '過学習 Overfitting L1正則化 L2正則化', tags: ['過学習', 'L1/L2正則化', 'ドロップアウト'] },
        { name: 'MLのライフサイクル', desc: '① データ収集・取り込み\n② データ前処理（クリーニング・正規化・欠損値処理）\n③ 特徴量エンジニアリング（モデルの入力に適した形に変換）\n④ モデル学習（アルゴリズムを選んでパラメータを調整）\n⑤ 評価（テストデータで指標を計測）\n⑥ デプロイ（本番環境への公開）\n⑦ 監視（モデルの性能劣化を検出して再学習）', keyword: 'MLOps 機械学習ライフサイクル', tags: ['MLOps', 'ライフサイクル', 'パイプライン'] },
      ],
    },
    {
      title: '生成AIの基礎',
      items: [
        { name: '基盤モデル（FM）', desc: '大量のテキスト・画像等で事前学習済みの大規模AI モデル（Foundation Model）。LLM（大規模言語モデル）が代表例。\n様々なタスクにファインチューニング（追加学習）やプロンプト（指示文）だけで適用できる汎用性が特徴。', keyword: 'Foundation Model LLM 大規模言語モデル', tags: ['LLM', '事前学習', 'Foundation Model'] , seeAlso: ['ファインチューニング']},
        { name: 'プロンプトエンジニアリング', desc: 'FMへの指示（プロンプト）を工夫してより良い出力を引き出す技術。\nZero-shot: 例示なしで直接タスクを指示\nFew-shot: 入出力例を数件示して形式を教える\nChain-of-Thought（CoT）: 「ステップごとに考えてください」と思考過程を明示させる\nSystem prompt: AIの役割・制約・口調を事前に設定する', keyword: 'プロンプトエンジニアリング Prompt Engineering Chain-of-Thought', tags: ['Zero-shot', 'Few-shot', 'Chain-of-Thought'] },
        { name: 'RAG（検索拡張生成）', desc: 'Retrieval-Augmented Generation。FMが学習していない最新情報や社内情報を活用する仕組み。\n仕組み: ユーザーの質問 → 外部知識ベースをベクトル検索 → 関連情報を取得 → FMへのプロンプトに追加して回答生成\nFMの知識の欠如（学習カットオフ）やハルシネーションを補う', tags: ['検索拡張生成', 'ベクトル検索', '知識ベース'] , seeAlso: ['ハルシネーション']},
        { name: 'ハルシネーション', desc: 'FMが事実と異なる情報を自信満々に生成してしまう問題（幻覚）。\n対策:\nグラウンディング: 回答を引用元のドキュメントに根拠付ける\nRAG: 検索した文書からのみ回答させる\n温度パラメータ（Temperature）を低くする: 出力をより決定論的にする\nガードレール: 誤情報に対してチェックを追加する', keyword: 'LLM ハルシネーション 幻覚 グラウンディング', tags: ['幻覚', 'グラウンディング', '正確性'] },
        { name: 'ファインチューニング', desc: '事前学習済みFMを特定タスク用のデータで追加学習してカスタマイズする手法。\nRLHF（Reinforcement Learning from Human Feedback）: 人間がFMの出力に評価をつけ、その評価を報酬として強化学習で人間の好みに合わせる手法。ChatGPT等で広く使用されている。', keyword: 'Fine-tuning ファインチューニング RLHF', tags: ['追加学習', 'RLHF', 'カスタマイズ'] },
      ],
    },
    {
      title: 'AWSのAI/MLサービス',
      items: [
        { name: 'Amazon Bedrock', desc: 'サーバーレスで複数の基盤モデルにAPIアクセスできるサービス。\n利用可能モデル: Anthropic Claude / Meta Llama / Amazon Titan / Mistral / Cohere 等\n追加機能: Knowledge Bases（RAG構築）/ Agents（自律タスク実行）/ Guardrails（有害コンテンツフィルタ）/ Model Evaluation', tags: ['Claude', 'Titan', 'サーバーレス'] },
        { name: 'Amazon SageMaker', desc: 'ML全ライフサイクルをカバーする統合プラットフォーム。\nデータ準備（Data Wrangler）→ 学習（Training Jobs）→ ハイパーパラメータ調整（AMT）→ モデル登録（Model Registry）→ デプロイ（Endpoints）→ 監視（Model Monitor）まで一気通貫で対応', tags: ['ML全般', 'Studio', 'エンドポイント'], keyword: 'SageMaker Data Wrangler SageMaker Training SageMaker Automatic Model Tuning（AMT） SageMaker Endpoints（推論） SageMaker Model Monitor', seeAlso: ['SageMaker Data Wrangler', 'SageMaker Training', 'SageMaker Automatic Model Tuning（AMT）', 'SageMaker Endpoints（推論）', 'SageMaker Model Monitor'] },        { name: 'Amazon Rekognition', desc: '事前学習済みコンピュータービジョンAPI（画像・動画の分析）。\n顔認識・物体検出・シーン検出・テキスト抽出・コンテンツモデレーション（不適切コンテンツ検出）・有名人認識・PPE（個人用保護具）検出等', tags: ['画像認識', '顔認識', '物体検出'] },
        { name: 'Amazon Comprehend', desc: 'テキストのNLP（自然言語処理）API。\n感情分析（ポジティブ/ネガティブ判定）/ エンティティ抽出（人名・地名・組織名等）/ 言語検出 / キーフレーズ検出 / 構文解析\nComprehend Medical: 医療テキスト特化版', tags: ['NLP', '感情分析', 'エンティティ'] },
        { name: 'Amazon Polly', desc: 'テキストを自然な音声に変換するTTS（Text-to-Speech）サービス。\n60言語以上・多様な声種（ニューラル音声で自然度が高い）に対応。\nSSML（Speech Synthesis Markup Language）で話速・ポーズ・強調等を細かく制御できる。', tags: ['TTS', '音声合成', 'SSML'] },
        { name: 'Amazon Transcribe', desc: '音声をテキストに変換するSTT（Speech-to-Text）サービス。\n話者分離（誰が話したかを識別）/ カスタム語彙（専門用語の認識精度向上）/ リアルタイム文字起こし / Transcribe Medical（医療特化版）', tags: ['STT', '文字起こし', '話者分離'] },
        { name: 'Amazon Lex', desc: 'Alexaと同じ技術を使った会話型AIボットの構築サービス。音声・テキスト両対応。\nインテント（ユーザーの意図）/ スロット（情報の収集項目）/ 発話サンプルを設定してチャットボットを作成し、Lambda関数と連携してバックエンド処理を実行する。', tags: ['チャットボット', '会話AI', 'Alexa'] , seeAlso: ['Lambda']},
        { name: 'Amazon Kendra', desc: '企業向けインテリジェント検索エンジン。自然言語の質問に対してS3・SharePoint・Confluence・Salesforce等の文書から正確に回答を見つけ出す。\nFAQや手順書の検索・社内ポータルのQ&A機能に活用できる。', tags: ['企業検索', 'ナレッジ', 'RAG'] , seeAlso: ['S3']},
        { name: 'Amazon Textract', desc: '文書・フォームからテキストやデータを自動抽出するOCR（光学文字認識）サービス。\n単純なOCRと異なりテーブル構造・フォームのキー・バリュー対・署名等も理解して抽出できる。請求書・契約書・医療フォームの処理に使用。', tags: ['OCR', 'フォーム抽出', '文書解析'] },
        { name: 'Amazon Translate', desc: '75言語以上に対応するニューラル機械翻訳API。\nカスタム用語集を設定することで専門用語・ブランド名・製品名を正確に翻訳できる。リアルタイム翻訳とバッチ翻訳の両方に対応。', tags: ['翻訳', '多言語', 'ニューラル'] },
      ],
    },
    {
      title: '責任あるAI・ガバナンス',
      items: [
        { name: '公平性（Fairness）', desc: 'AIモデルが特定の人種・性別・年齢・地域等に対して不公平な予測をしないようにすること。\n訓練データのバイアス（偏り）を検出・除去し、モデルの予測が集団間で均等になるよう評価・調整する。\nSageMaker Clarifyを使ってバイアスレポートを自動生成できる。', keyword: 'AI 公平性 バイアス SageMaker Clarify', tags: ['バイアス', '公平性', '差別防止'], seeAlso: ['SageMaker Clarify'] },
        { name: '説明可能性（XAI）', desc: 'Explainable AI。「なぜその予測をしたか」を人間が理解できるようにする技術。\nSHAP値（Shapley Additive exPlanations）: 各特徴量が予測にどれだけ貢献したかを定量的に示す手法。SageMaker Clarifyで計算できる。ブラックボックスなモデルの透明性を確保するために重要。', keyword: 'Explainable AI XAI SHAP値', tags: ['XAI', 'SHAP', '透明性'], seeAlso: ['SageMaker Clarify'] },
        { name: 'プライバシーとセキュリティ', desc: 'PII（Personally Identifiable Information: 個人識別情報）を訓練データに含めないことが原則。\n差分プライバシー: 個人データを統計的に保護しながら学習する手法\nフェデレーテッドラーニング: データを送らずにモデルの更新情報だけを集めて分散学習する手法\nAmazon Macieを使ってS3上のPIIを自動検出できる。', keyword: 'PII 個人情報 差分プライバシー フェデレーテッドラーニング', tags: ['PII', '差分プライバシー', 'データ保護'], seeAlso: ['Macie', 'S3'] },
        { name: 'AIガバナンス', desc: 'AIモデルのライフサイクル全体（開発→デプロイ→運用）にわたるリスク管理・監査・ポリシー遵守の枠組み。\nAWS AI Service Cards: AWSが各AIサービスの設計・用途・評価結果を公開して透明性を確保するドキュメント\nAmazon Bedrock Guardrails: 有害コンテンツ・PII・特定トピックのフィルタリングを一元管理', keyword: 'AIガバナンス AWS AI Service Cards Bedrock Guardrails', tags: ['ガバナンス', 'リスク管理', 'コンプライアンス'], seeAlso: ['Bedrock Guardrails', 'Amazon Bedrock'] },
      ],
    },
  ],

  SAA: [
    {
      title: 'コンピューティング',
      items: [
        { name: 'EC2', desc: 'インスタンスタイプ: 汎用（M系）/ コンピュート最適化（C系）/ メモリ最適化（R系）/ GPU（P・G系）\n配置グループ:\nクラスタ: 同一ラック内に密集配置（超低レイテンシ・HPC向け）\n分散: 各インスタンスを別ラックに分散（可用性向上）\nパーティション: ラックをグループ化して大規模分散DB向け\nインスタンスストア: EC2に物理的に接続されたNVMe SSD（停止/終了するとデータ消失）', tags: ['インスタンスタイプ', '配置グループ', 'スポット'] },
        { name: 'Auto Scaling', desc: 'スケーリングポリシーの種類:\nターゲット追跡: CPU使用率50%などのメトリクスを目標値に自動調整\nステップ: メトリクスの値の幅に応じてスケール量を段階的に設定\nスケジュール: 特定の日時に事前にスケール\n起動テンプレート: インスタンスタイプ・AMI・セキュリティグループ等の構成を定義したテンプレート\nウォームアップ期間: 新インスタンスが安定するまでメトリクスへの影響を除外する時間', tags: ['ターゲット追跡', '起動テンプレート', 'ウォームアップ'] },
        { name: 'Lambda', desc: 'イベント駆動型サーバーレス実行環境。最大実行時間15分・最大メモリ10GB。\n同時実行制限: デフォルト1アカウントあたり1000（緩和申請可）\nプロビジョニング済み同時実行: コールドスタートを防ぐために事前にインスタンスを起動する機能\nレイヤー: 共通ライブラリを複数のLambda関数で共有する仕組み\nDestinations: 非同期呼び出しの成功/失敗時に別サービスへ結果を転送', tags: ['同時実行', 'レイヤー', 'デスティネーション'] , keyword: 'EventBridge S3 SNS SQS', seeAlso: ['EventBridge', 'S3', 'SNS', 'SQS']},        { name: 'ECS / EKS', desc: 'ECS（Elastic Container Service）:\nTaskDefinition（コンテナ定義）→ Service（実行台数管理）→ Cluster の構成\nFargate起動タイプでサーバー管理不要、EC2起動タイプでカスタマイズ可能\nEKS（Elastic Kubernetes Service）:\nKubernetes（大規模コンテナ管理のOSS）のマネージドクラスタ。eksctlやkubectlでクラスタ管理', tags: ['Fargate', 'TaskDefinition', 'Kubernetes'] , seeAlso: ['EC2']},
        { name: 'Batch', desc: 'スポットEC2やFargate上でバッチ処理ジョブを効率的に実行するサービス。\nジョブキュー: ジョブの待ち行列。優先度を設定できる\nコンピューティング環境: 使用するEC2タイプ・スポット率・上限vCPU数等を設定\nジョブ依存関係: 依存するジョブが完了してから実行する順序制御が可能', tags: ['バッチ', 'スポット', 'ジョブキュー'] , seeAlso: ['EC2']},
      ],
    },
    {
      title: 'ストレージ',
      items: [
        { name: 'S3', desc: 'ストレージクラス（アクセス頻度に応じて選択）:\nStandard: 高頻度アクセス向け（デフォルト）\nIA（Infrequent Access）: 低頻度アクセス。取得時に追加課金\nOne Zone-IA: 単一AZで低コスト。再作成可能なデータ向け\nIntelligent-Tiering: アクセスパターンを自動学習してクラスを切り替え\nGlacier系: アーカイブ（取得時間とコストがトレードオフ）\nCRR（Cross-Region Replication）: 別リージョンへの自動レプリケーション\nSRR（Same-Region Replication）: 同リージョン内の別バケットへのレプリケーション', tags: ['ストレージクラス', 'ライフサイクル', 'レプリケーション'] , keyword: 'Lambda SNS SQS', seeAlso: ['Lambda', 'SNS', 'SQS']},        { name: 'EBS', desc: 'gp3: 汎用SSD。IOPSとスループットを独立して設定可能\nio2: プロビジョニドIOPS SSD。高IOPS・高耐久性。マルチアタッチ対応\nst1: スループット最適化HDD。ログ・ビッグデータの順次読み書き向け\nsc1: コールドHDD。アクセス頻度が最も低いデータ向け\nマルチアタッチ: 同一AZ内の複数EC2に同時接続（io1/io2のみ）', tags: ['gp3', 'io2', 'マルチアタッチ'] , seeAlso: ['EC2']},
        { name: 'EFS', desc: '自動でスケールするNFS（Network File System）マネージドファイルシステム。\nInfrequent Accessストレージクラスで低頻度アクセスのファイルを自動的に低コストのクラスに移動してコスト削減できる。EC2・ECS・Lambda・SageMakerなどから同時マウント可能。', tags: ['NFS', 'InfrequentAccess', '自動スケール'] , seeAlso: ['EC2', 'Lambda']},
        { name: 'FSx', desc: 'FSx for Windows File Server: SMBプロトコル対応。Active Directory統合。Windowsアプリ・共有フォルダ向け\nFSx for Lustre: 高性能並列ファイルシステム。HPC（高性能コンピューティング）・ML学習向け。S3と統合してデータセットを自動読み込み可能', tags: ['Windows', 'Lustre', 'HPC'] , seeAlso: ['S3']},
        { name: 'S3 Glacier', desc: 'Instant Retrieval: ミリ秒で取得。月1回程度のアクセスに最適\nFlexible Retrieval: 数分〜12時間（Bulk選択で最安）\nDeep Archive: 最大48時間。7〜10年保持が義務付けられたデータ向けで最安ストレージ', tags: ['Instant', 'Flexible', 'Deep Archive'] , keyword: 'S3', seeAlso: ['S3']},        { name: 'Storage Gateway', desc: 'オンプレミスとAWSストレージをブリッジするサービス。\nFile Gateway: NFS/SMBでオンプレからS3にファイル保存。S3のキャッシュをローカルに保持\nVolume Gateway（キャッシュ型）: S3にデータを格納しよく使うデータをローカルキャッシュ\nVolume Gateway（ストア型）: ローカルにデータを保持しS3に非同期バックアップ\nTape Gateway: バックアップソフトからS3 Glacierにテープを仮想化', tags: ['File GW', 'Volume GW', 'ハイブリッド'] , seeAlso: ['S3', 'S3 Glacier']},
      ],
    },
    {
      title: 'データベース',
      items: [
        { name: 'RDS', desc: 'Multi-AZ: プライマリDBの変更をスタンバイDBへ同期レプリケーション。障害時に自動フェイルオーバー（60-120秒程度）。スタンバイは読み取り不可\nリードレプリカ: 非同期レプリケーションで読み取りをスケールアウト。最大5台。マスター昇格も可能\nポイントインタイムリカバリ（PITR）: 任意の時点のデータに最大35日前まで復元可能', tags: ['Multi-AZ', 'リードレプリカ', 'フェイルオーバー'] , keyword: 'Aurora', seeAlso: ['Aurora']},        { name: 'Aurora', desc: '最大15台のリードレプリカをサポート（RDSは最大5台）\nAurora Global Database: 1プライマリリージョン＋最大5セカンダリリージョン。RPO 1秒・RTO 1分以内のDR\nAurora Serverless v2: トラフィックに応じてコンピュートを自動スケール。コスト効率が高い\nストレージ: 6コピーを3つのAZに自動分散。10GBから自動拡張', tags: ['Global Database', 'Serverless v2', '15リードレプリカ'] , seeAlso: ['Aurora Global Database', 'RDS']},
        { name: 'DynamoDB', desc: 'GSI（グローバルセカンダリインデックス）: 別のパーティションキーでクエリを可能にする。非同期で更新\nLSI（ローカルセカンダリインデックス）: 同一パーティション内で別のソートキーを使用。テーブル作成時のみ定義可能\nDAX（DynamoDB Accelerator）: マイクロ秒レイテンシのインメモリキャッシュ。APIを変えずに使用可能\nStreams: テーブルの変更をリアルタイムにLambdaへ配信\nグローバルテーブル: マルチリージョンのアクティブ-アクティブ構成', tags: ['GSI/LSI', 'DAX', 'グローバルテーブル'] , seeAlso: ['Lambda']},
        { name: 'ElastiCache', desc: 'Redis:\nレプリケーション・クラスタモード（シャーディングで水平スケール）\nSentinel（高可用性）・Pub/Sub・Sorted Set等の高度なデータ構造\n永続化（AOF/RDB）でデータを保持\nMemcached:\nマルチスレッドで高スループット。シャーディングで水平スケール\nシンプルなKVストアのみ。永続化なし', tags: ['Redis', 'Memcached', 'クラスタモード'] },
        { name: 'Redshift', desc: '列指向ストレージのDWH（データウェアハウス）。TB〜PBスケールの分析に使用。\nRedshift Spectrum: S3上のデータをRedshiftの外部テーブルとして直接クエリ可能。ETLなしでS3のデータを分析\nAQUA（Advanced Query Accelerator）: 専用ハードウェアでクエリを最大10倍高速化する機能', tags: ['列指向', 'Spectrum', 'AQUA'] , seeAlso: ['S3']},
        { name: 'Neptune', desc: 'グラフデータベース（ノード＝エンティティ、エッジ＝関係性を管理するDB）。\n対応クエリ言語:\nGremlin: Property Graphモデル（汎用グラフ）\nSPARQL: RDF形式の知識グラフ\nOpenCypher: Cypherクエリ言語\nユースケース: ソーシャルネットワーク・不正検知・レコメンデーション・ナレッジグラフ', tags: ['グラフDB', 'Gremlin', 'SPARQL'] },
      ],
    },
    {
      title: 'ネットワーキング',
      items: [
        { name: 'VPC基礎', desc: 'NACL（ネットワークアクセスコントロールリスト）:\nステートレス（行き・戻り両方を明示的に許可必要）\nサブネットに適用。番号が小さいルールから順に評価\nSG（セキュリティグループ）:\nステートフル（戻りパケットは自動許可）\nENI（ネットワークインターフェース）に適用。全ルールを評価', keyword: 'Amazon VPC セキュリティグループ NACL', tags: ['NACL', 'セキュリティグループ', 'ステートレス'] , seeAlso: ['VPC']},
        { name: 'VPCピアリング / TGW', desc: 'VPCピアリング: 2つのVPCを1対1で接続。推移的ルーティング不可（A-B-CでAからCには直接ピアリングが必要）\nTransit Gateway（TGW）: ハブ&スポーク型でN個のVPCを一元接続。各VPCはTGWにアタッチするだけでN対N接続が実現。アタッチメント種別: VPC / Site-to-Site VPN / Direct Connect', tags: ['ピアリング', 'TGW', 'ハブ&スポーク'] , seeAlso: ['Direct Connect', 'Site-to-Site VPN', 'Transit Gateway（TGW）', 'VPC']},
        { name: 'VPCエンドポイント', desc: 'インターネットを経由せずAWSサービスにプライベートアクセスする仕組み。\nゲートウェイ型: S3・DynamoDBのみ対応。ルートテーブルにエントリを追加。追加料金なし\nインターフェース型（PrivateLink）: その他多数のAWSサービスに対応。ENIをサブネットに作成。時間課金あり', tags: ['ゲートウェイ型', 'PrivateLink', 'インターフェース型'] , seeAlso: ['DynamoDB', 'S3']},
        { name: 'ALB / NLB', desc: 'ALB（Application Load Balancer）: HTTP/HTTPS（L7）\nURLパス・ホストヘッダー・HTTPメソッドでコンテンツベースルーティング\nターゲットグループにEC2・ECS・Lambda・IPを登録\nNLB（Network Load Balancer）: TCP/UDP（L4）\n固定IPを提供（ElasticIPを割り当て可能）\n超低レイテンシ・大量同時接続。TLSパススルーが可能', tags: ['ALB', 'NLB', 'ターゲットグループ'] , seeAlso: ['EC2', 'Lambda']},
        { name: 'Route 53 ルーティング', desc: 'シンプル: 1つのリソースに転送\n重み付け: 複数リソースに比率を指定して分散\nレイテンシ: 最もレイテンシが低いリージョンへ転送\nフェイルオーバー: ヘルスチェック失敗時にセカンダリへ切り替え\n地理的（Geolocation）: ユーザーの所在地（国・州）に基づいて転送\n地理的近接性: ユーザーとリソースの物理的距離に基づいて転送\n多値応答: 複数のIPを返し、ヘルスチェックで正常なもののみ返す', tags: ['フェイルオーバー', 'レイテンシ', '地理的近接性'] },
        { name: 'CloudFront', desc: 'グローバルCDN。AWSバックボーン経由で低レイテンシ配信。\nOAC（Origin Access Control）: CloudFrontを経由したアクセスのみS3バケットに許可する仕組み\nビヘイビア: URLパスパターンごとにオリジン・キャッシュポリシー・関数を設定\nLambda@Edge: CloudFrontのイベント（Viewer Request/Response・Origin Request/Response）でLambdaを実行\nCloudFront Functions: JavaScriptでHTTPヘッダー書き換えやURL変換を低コスト・低レイテンシで実行', tags: ['OAC', 'Lambda@Edge', 'ビヘイビア'] , keyword: 'EC2', seeAlso: ['EC2', 'Lambda', 'S3']},        { name: 'Global Accelerator', desc: 'Anycast IPで世界中のユーザーを最寄りAWSエッジロケーションに誘導し、AWSバックボーン経由で最終ターゲットに転送。\n2つの固定グローバルIPを提供（ホワイトリスト管理が容易）。非HTTPプロトコル（TCP/UDP）にも対応。CloudFrontはHTTPコンテンツキャッシュ向けで用途が異なる。', tags: ['Anycast', '固定IP', 'バックボーン'] , keyword: 'EC2', seeAlso: ['CloudFront', 'EC2']},        { name: 'Direct Connect / VPN', desc: 'Direct Connect: 物理専用線でオンプレ↔AWSを接続。BGP（Border Gateway Protocol）でルートを交換。最長一致ルールで転送先を決定。冗長化は複数接続を推奨\nSite-to-Site VPN: インターネット経由の暗号化接続（IPsec）。カスタマーゲートウェイ（CGW）と仮想プライベートゲートウェイ（VGW）を接続\n最大冗長化: DCとVPNの両方を組み合わせて使用', tags: ['BGP', '専用線', '冗長化'] , seeAlso: ['Direct Connect', 'Site-to-Site VPN']},
      ],
    },
    {
      title: 'セキュリティ・IAM',
      items: [
        { name: 'IAM', desc: 'ポリシー評価順: ① 明示的な拒否（Deny） → ② 許可（Allow） → ③ 暗黙の拒否\nクロスアカウントアクセス: AssumeRoleでロールを引き受け一時的な認証情報を取得\nリソースベースポリシー: S3バケットポリシー・KMSキーポリシー等。リソース側に直接付与\nアイデンティティベースポリシー: IAMユーザー・グループ・ロールに付与', tags: ['ポリシー評価', 'クロスアカウント', 'リソースベース'] , keyword: 'EC2 Lambda', seeAlso: ['EC2', 'KMS', 'Lambda', 'S3']},        { name: 'KMS', desc: 'AWSマネージドキー: AWSが自動作成・管理。キーポリシーのカスタマイズ不可\nCMK（カスタマーマネージドキー）: ユーザーが作成・管理。キーポリシーで細かいアクセス制御が可能\nエンベロープ暗号化: データキー（DEK）でデータを暗号化し、DEK自体をCMKで暗号化する二層構造。大きなデータを効率よく暗号化する仕組み', tags: ['CMK', 'エンベロープ暗号化', 'キーポリシー'] , keyword: 'DynamoDB EBS RDS S3', seeAlso: ['DynamoDB', 'EBS', 'RDS', 'S3']},        { name: 'Secrets Manager', desc: 'パスワード・APIキー・DB認証情報等のシークレットを安全に保管・管理するサービス。\n自動ローテーション: Lambda関数を使ってRDS・Redshift・DocumentDB等のパスワードを定期的に自動更新\nSSM Parameter Store との違い: Parameter Storeはシークレットの自動ローテーション機能がない。Secrets Managerはローテーションが必要なDB認証情報に適している', tags: ['自動ローテーション', 'DB認証情報', 'Lambda'] , keyword: 'VPC VPCエンドポイント', seeAlso: ['Lambda', 'RDS', 'Redshift', 'SSM Parameter Store', 'VPC', 'VPCエンドポイント']},        { name: 'Cognito', desc: 'User Pool: ユーザー認証（サインアップ・サインイン）を管理するIDプロバイダー。認証成功時にJWT（IDトークン・アクセストークン・リフレッシュトークン）を発行\nIdentity Pool: フェデレーション（Google・Facebook・User Pool等）した認証情報をもとに一時的なAWS認証情報（IAMロールの権限）を払い出してAWSリソースに直接アクセスさせる', tags: ['User Pool', 'Identity Pool', 'フェデレーション'] , keyword: 'Lambda', seeAlso: ['IAM', 'Lambda']},        { name: 'ACM', desc: 'SSL/TLS証明書を無料で発行・自動更新するマネージドサービス（AWS Certificate Manager）。\nCloudFront・ALB・API GatewayにHTTPS証明書を適用して暗号化通信を有効化できる。\nドメイン検証（DNS検証またはEメール検証）で証明書を発行する。EC2への直接適用は不可（ELB経由で適用する）。\nACM Private CAを使うとプライベートCAを構築して内部サービス間のmTLSも実現できる。', keyword: 'ACM AWS Certificate Manager SSL TLS HTTPS 証明書 mTLS ALB / NLB Route 53 ルーティング', tags: ['SSL/TLS', 'HTTPS', '証明書'], seeAlso: ['CloudFront', 'ALB / NLB', 'API Gateway', 'Route 53 ルーティング'] },        { name: 'Organizations / SCP', desc: 'SCP（サービスコントロールポリシー）: OU（組織単位）やアカウントに適用するガードレール。\n最大権限の上限を設定するだけで権限を付与する機能はない（IAM許可とのAND評価）\n例: 「このOUでは東京リージョン以外のEC2起動を禁止」というルールを一括適用できる', tags: ['SCP', 'OU', 'ガードレール'] , seeAlso: ['EC2', 'IAM']},
      ],
    },
    {
      title: '統合・メッセージング',
      items: [
        { name: 'SQS', desc: '標準キュー: 順序不保証・少なくとも1回配信・ほぼ無制限スループット\nFIFOキュー: 順序保証・1回のみ配信・最大3000msg/s（バッチ使用時）\n可視性タイムアウト: メッセージ取得後に他のConsumerから見えなくする時間（処理中の二重処理防止）\nDLQ（Dead Letter Queue）: 最大受信回数を超えた処理失敗メッセージを退避するキュー', tags: ['標準', 'FIFO', '可視性タイムアウト'] },
        { name: 'SNS', desc: 'Pub/Sub（パブリッシュ/サブスクライブ）メッセージング。\nトピックに複数のサブスクライバー（SQS・Lambda・HTTP・メール・SMS）を登録してファンアウト（1対多配信）を実現する。\nフィルタポリシー: サブスクライバーごとに受信するメッセージをフィルタリングできる', tags: ['Pub/Sub', 'ファンアウト', 'フィルタポリシー'] , seeAlso: ['Lambda', 'SQS']},
        { name: 'EventBridge', desc: 'AWSサービス・SaaSアプリ・カスタムアプリのイベントをルールでターゲットに転送するイベントバスサービス。\nイベントパターンマッチングで条件にあうイベントだけ転送。スケジューラとしてcron式での定期実行も可能。\nEventBridge Pipes: ソース→フィルタ→変換→ターゲットのパイプラインを簡潔に構築', tags: ['イベントバス', 'ルール', 'スケジューラ'] },
        { name: 'Step Functions', desc: 'Lambda・ECS・DynamoDB等のAWSサービスを組み合わせたワークフローをステートマシン（状態遷移図）として定義・実行・可視化するサービス。\nStandardワークフロー: 最大1年・正確に1回実行・実行履歴を保持\nExpressワークフロー: 最大5分・高スループット（1秒間に10万実行）', tags: ['ステートマシン', 'ワークフロー', 'サーバーレス'] , keyword: 'CloudWatch', seeAlso: ['CloudWatch', 'DynamoDB', 'Lambda']},        { name: 'API Gateway', desc: 'REST API・HTTP API・WebSocket APIを構築・管理・公開するサービス。\nLambdaプロキシ統合でサーバーレスAPIを構築。スロットリング（レート制限）・APIキー・使用量プラン・カスタムオーソライザー（Lambda関数で認証）が重要。\nHTTP APIはREST APIより低コスト・低レイテンシだが機能が限定的', tags: ['REST', 'WebSocket', 'スロットリング'] , seeAlso: ['Lambda']},
        { name: 'Kinesis Data Streams', desc: 'リアルタイムストリーミングデータを収集・処理するサービス。\nシャード: データを分散して処理する単位。1シャード = 1MB/s書き込み・2MB/s読み取り。シャード数でスループット調整\n保持期間: デフォルト24時間、最大365日まで延長可能\n拡張ファンアウト: 複数のConsumerが各自2MB/sで同時読み取り可能', tags: ['シャード', 'リアルタイム', '保持期間'] , keyword: 'Kinesis', seeAlso: ['Kinesis']},      ],
    },
    {
      title: '分析・管理',
      items: [
        { name: 'Athena', desc: 'S3上のデータをサーバーレスSQLで直接クエリするサービス。インフラ管理不要で、スキャンしたデータ量（1TB単位）で課金。\nGlueデータカタログと組み合わせてスキーマを管理。Parquet・ORC形式にすると圧縮率が高くスキャン量を削減できてコスト削減になる。', tags: ['サーバーレス', 'S3クエリ', 'Glueカタログ'] , keyword: 'CloudWatch DynamoDB Lambda RDS', seeAlso: ['CloudWatch', 'DynamoDB', 'Glue', 'Lambda', 'RDS', 'S3']},        { name: 'Glue', desc: 'サーバーレスETL（Extract・Transform・Load: データの抽出・変換・格納）サービス。\nクローラー: S3・RDS等のデータソースを自動スキャンしてGlueデータカタログにスキーマを登録する\nETLジョブ: SparkまたはPythonベースで変換処理を定義・実行する\nGlueデータカタログ: スキーマ・場所・メタデータを一元管理するメタデータリポジトリ', tags: ['ETL', 'クローラー', 'データカタログ'] , seeAlso: ['RDS', 'S3']},
        { name: 'CloudWatch', desc: 'カスタムメトリクス: EC2のメモリ等、デフォルトで収集されないメトリクスをPutMetricDataAPIで送信\nLogs Insights: ログをSQLライクなクエリで分析するツール\n複合アラーム: 複数アラームをAND/ORで組み合わせた条件でアクション実行\n異常検知: 機械学習でメトリクスの異常を自動検出\nSynthetics Canary: スクリプトでエンドポイントを定期監視する合成監視', tags: ['カスタムメトリクス', 'Logs Insights', '異常検知'] , keyword: 'SNS', seeAlso: ['EC2', 'SNS']},        { name: 'CloudFormation', desc: 'IaC（Infrastructure as Code）。YAML/JSONテンプレートでAWSリソースを定義・管理するサービス。\nスタック: CloudFormationで一括管理するリソースのグループ\n変更セット（Change Set）: 変更を実際に適用する前に影響範囲を確認\nStackSets: 複数のAWSアカウント・リージョンに同一スタックを一括展開\nカスタムリソース: Lambda関数を使ってCloudFormationに対応していないリソースも管理', tags: ['IaC', 'スタック', 'StackSets'] , seeAlso: ['Lambda']},
        { name: 'Lake Formation', desc: 'データレイク（大量の生データを一元格納するS3ベースのストア）の構築・管理・セキュリティを一元化するサービス。\nGlue・S3・Athena・Redshiftとの統合で列/行レベルのきめ細かいアクセス制御が可能。\nBlueprint: S3やRDBのデータを定期的にGlueワークフローでデータレイクに取り込む設定を自動生成', tags: ['データレイク', '列/行レベル', 'アクセス制御'] , seeAlso: ['Athena', 'Glue', 'Redshift', 'S3']},
      ],
    },
  ],

  DVA: [
    {
      title: 'コアサービス',
      items: [
        { name: 'Lambda', desc: '最大実行時間15分・最大メモリ10GB。CPU性能はメモリ量に比例して割り当てられる。\n同時実行制限: デフォルト1アカウント1000（申請で緩和可）。超えると429エラー\nプロビジョニング済み同時実行: あらかじめインスタンスを起動してコールドスタートを防ぐ\nレイヤー: 共通ライブラリ・依存関係を複数関数で共有できる仕組み\nDestinations（送信先）: 非同期呼び出しの成功/失敗時にSQS・SNS・Lambda・EventBridgeへ自動転送', tags: ['同時実行', 'レイヤー', 'Destinations'] , keyword: 'S3', seeAlso: ['EventBridge', 'S3', 'SNS', 'SQS']},        { name: 'API Gateway', desc: 'マッピングテンプレート: VTL（Velocity Template Language）でリクエスト/レスポンスを変換する\nLambdaプロキシ統合: リクエスト全体をLambdaに渡し、Lambdaがレスポンス全体を組み立てる\n使用量プラン＋APIキー: クライアントごとのスロットリング（レート制限）とクォータ（月次制限）を設定\nカスタムオーソライザー: Lambda関数で独自の認証ロジックを実装する\nキャッシュ: ステージごとにレスポンスキャッシュを設定してバックエンドの負荷軽減', tags: ['マッピングテンプレート', 'カスタムオーソライザー', 'キャッシュ'] , seeAlso: ['Lambda']},
        { name: 'DynamoDB', desc: 'パーティションキー設計: 特定のキーにアクセスが集中する「ホットパーティション」を回避するため、カーディナリティの高いキー設計が重要\nGSI（グローバルセカンダリインデックス）: 別パーティションキーでのクエリを可能にする\nLSI（ローカルセカンダリインデックス）: 同一パーティション内での別ソートキーを使用\nDAX（DynamoDB Accelerator）: マイクロ秒レイテンシのインメモリキャッシュ\nStreams: テーブルの変更を24時間保持してLambdaでリアルタイム処理\nTTL: 有効期限を設定して期限切れアイテムを自動削除', tags: ['パーティション設計', 'DAX', 'Streams'] , seeAlso: ['Lambda']},
        { name: 'S3', desc: 'プレサインドURL: 一時的なアクセス権限をURLに埋め込み、未認証ユーザーがS3に安全にアクセスできる仕組み\nマルチパートアップロード: 大きなファイルを分割してアップロードし、失敗時のリトライが部分的になるため大容量ファイルに推奨\nS3イベント通知: オブジェクトのPUT/DELETEなどのイベントをLambda・SQS・SNSに転送\nCORS（Cross-Origin Resource Sharing）: 異なるオリジンからのブラウザアクセスを許可する設定', tags: ['プレサインドURL', 'マルチパート', 'CORS'] , seeAlso: ['Lambda', 'SNS', 'SQS']},
        { name: 'Cognito', desc: 'User Pool（ユーザー認証）:\nサインアップ・サインイン・MFA（多要素認証）・パスワードポリシー管理\nトリガーLambda: サインアップ前・認証後等のタイミングでカスタム処理を実行\nIdentity Pool（AWSアクセス）:\nGoogle・Facebook・User Pool等でフェデレーションして一時的なIAM認証情報を払い出す\nロールマッピングで認証済み/未認証ユーザーに異なる権限を付与', tags: ['User Pool', 'Identity Pool', 'MFA'] , seeAlso: ['IAM', 'Lambda']},
        { name: 'ElastiCache', desc: 'キャッシュ戦略:\nLazy Loading（キャッシュに無ければDBから取得してキャッシュに保存）: キャッシュミス時のみDBアクセスが発生\nWrite-Through（DB書き込みと同時にキャッシュも更新）: データの鮮度が高いが書き込みのオーバーヘッドあり\nRedis: セッションストア・リアルタイムランキング・Pub/Subに適する\nMemcached: シンプルなキャッシュ・マルチスレッドでの高スループット向け', tags: ['Lazy Loading', 'Write-Through', 'セッション'] },
      ],
    },
    {
      title: 'CI/CDとデプロイ',
      items: [
        { name: 'CodeCommit', desc: 'AWSマネージドのプライベートGitリポジトリ。IAMポリシーで細かいブランチ・ファイルレベルのアクセス制御が可能。HTTPS（Git認証情報）またはSSH（公開鍵）で認証。', tags: ['Git', 'IAM認証', 'プライベートリポジトリ'] , seeAlso: ['IAM']},
        { name: 'CodeBuild', desc: 'buildspec.yml でビルド手順を定義するサーバーレスのビルドサービス。\nフェーズ: install（ランタイム・依存インストール）→ pre_build → build → post_build\nキャッシュ: ローカルキャッシュ（同一ビルドホスト）またはS3キャッシュで依存関係の再ダウンロードを省略\nDockerイメージのビルド・ECRへのプッシュもbuildspec.ymlで記述できる', tags: ['buildspec.yml', 'ビルドフェーズ', 'キャッシュ'] , keyword: 'RDS VPC', seeAlso: ['RDS', 'S3', 'VPC']},        { name: 'CodeDeploy', desc: 'デプロイ先: EC2 / ECS / Lambda / オンプレミスサーバー\nデプロイ種別:\nIn-place: 同じサーバーで旧アプリを停止して新アプリに置き換え（EC2のみ）\nBlue/Green: 新環境を並列に起動してトラフィックを切り替え\nデプロイ戦略:\nAll-at-once（一斉）→ Rolling（順次）→ Rolling with additional batch → Immutable（新インスタンスで並行）\nライフサイクルフック: BeforeInstall・AfterInstall・ApplicationStart等のタイミングでカスタムスクリプトを実行', tags: ['Blue/Green', 'Canary', 'ライフサイクルフック'] , keyword: 'CloudWatch', seeAlso: ['CloudWatch', 'EC2', 'Lambda']},        { name: 'CodePipeline', desc: 'ソースコードの変更を検知して自動でビルド・テスト・デプロイを行うCI/CDパイプライン。\nステージ: Source（CodeCommit/S3/GitHub）→ Build（CodeBuild）→ Test → Deploy（CodeDeploy/ECS/CloudFormation）\n手動承認アクション: 本番デプロイ前に人間の承認を必須にするステップを挿入できる\nクロスアカウントデプロイ: 別AWSアカウントへのデプロイも可能（KMS・S3バケットポリシー設定が必要）', tags: ['ステージ', '手動承認', 'クロスアカウント'] , keyword: 'EventBridge', seeAlso: ['CloudFormation', 'CodeBuild', 'CodeCommit', 'CodeDeploy', 'EventBridge', 'KMS', 'S3']},        { name: 'SAM（Serverless Application Model）', desc: 'サーバーレスアプリ（Lambda・API Gateway・DynamoDB等）をCloudFormationの拡張構文で簡潔に定義するIaCフレームワーク。\nsam local invoke / sam local start-api: LambdaとAPI Gatewayをローカル環境でエミュレートして開発・テストが可能\nGlobals セクション: 全Lambda関数に共通のタイムアウト・メモリ等を一括設定', tags: ['サーバーレス', 'sam local', 'テンプレート'] , seeAlso: ['API Gateway', 'CloudFormation', 'DynamoDB', 'Lambda']},
        { name: 'Elastic Beanstalk', desc: 'デプロイポリシー（デプロイ中のダウンタイムとリスクのトレードオフ）:\nAll-at-once: 最速だがデプロイ中にダウンタイムあり\nRolling: 少数ずつ順次更新。容量が一時的に減少\nRolling with additional batch: 余分なインスタンスを追加してから更新。容量を維持\nImmutable: 新インスタンス群を並行起動してから切り替え。最も安全\n.ebextensions: リソースや設定をYAMLで追加カスタマイズするファイル（.ebextensions/xxx.config）', tags: ['デプロイポリシー', '.ebextensions', 'Immutable'] , keyword: 'Auto Scaling EC2 ELB', seeAlso: ['Auto Scaling', 'EC2', 'ELB']},      ],
    },
    {
      title: 'メッセージング・統合',
      items: [
        { name: 'SQS', desc: '可視性タイムアウト（Visibility Timeout）: メッセージ取得後に他のConsumerから一定時間隠す仕組み。処理が長引く場合はChangeMessageVisibility APIで延長\nDLQ（Dead Letter Queue: デッドレターキュー）: 最大受信回数（maxReceiveCount）を超えた処理失敗メッセージを退避するキュー。原因調査に使用\nロングポーリング: 最大20秒間メッセージが届くまで待機。空のレスポンスを削減してコスト削減', tags: ['可視性タイムアウト', 'DLQ', 'ロングポーリング'] },
        { name: 'SNS', desc: 'サブスクリプションフィルタポリシー: トピックのサブスクライバーごとに受信するメッセージの属性を絞り込むフィルタを設定できる。\n例: 「注文イベント」トピックで「注文確定」だけ受け取るLambdaと「キャンセル」だけ受け取るSQSを別々に設定できる\nSNS FIFOトピック: SQS FIFOと組み合わせて順序保証・重複排除のファンアウトを実現', tags: ['フィルタポリシー', 'ファンアウト', 'FIFO'] , seeAlso: ['Lambda', 'SQS']},
        { name: 'Kinesis', desc: 'Data Streams: シャードベースのストリーミング。KCL（Kinesis Client Library）でConsumerを実装。カスタムな処理・複雑なロジックに向く\nFirehose（Data Firehose）: 自動スケールのマネージド配信サービス。S3・Redshift・OpenSearch・Splunkへのデータ配信に特化。Lambda変換とバッファリングが可能\nData Analytics（for Apache Flink）: ストリームデータをSQLまたはFlinkコードでリアルタイム分析', tags: ['シャード', 'Firehose', 'KCL'] , seeAlso: ['Lambda', 'Redshift', 'S3']},
        { name: 'EventBridge', desc: 'イベントパターンマッチング: イベントのJSON属性でフィルタリングして条件に合うものだけターゲットに転送\nスケジュール: cron式（例: 毎日9時）またはrate式（例: 5分ごと）でターゲットを定期実行\nイベントアーカイブ＆リプレイ: イベントを保存しておいて後からリプレイできる（障害時の再処理に便利）\nクロスアカウントイベントバス: 別アカウントのイベントバスにイベントを送信できる', tags: ['イベントパターン', 'スケジュール', 'アーカイブ'] },
        { name: 'Step Functions', desc: 'Standardワークフロー: 最大1年実行・正確に1回実行保証・実行履歴をCloudWatchに保存。長期バッチ処理向け\nExpressワークフロー: 最大5分・高スループット（秒間10万実行）・少なくとも1回実行。高頻度のイベント処理向け\nステートマシン: ステートをJSONで定義して並列・条件分岐・エラーハンドリング・リトライを視覚化', tags: ['Express', 'Standard', 'ステートマシン'] , keyword: 'DynamoDB Lambda', seeAlso: ['CloudWatch', 'DynamoDB', 'Lambda']},      ],
    },
    {
      title: '監視・トレーシング',
      items: [
        { name: 'X-Ray', desc: 'アプリのリクエストをエンドツーエンドでトレーシングするサービス。\nサービスマップ: 各サービス間の依存関係とレイテンシを視覚化\nアノテーション: インデックス化される任意のキーバリュー（フィルタリング・グループ化に使用）\nメタデータ: インデックス不要の追加情報（デバッグ詳細情報）\nサンプリングルール: トレースするリクエストの割合を設定してコストを調整\nX-Rayデーモン: EC2やECSにインストールしてトレースデータを収集するプロセス', tags: ['トレーシング', 'サービスマップ', 'アノテーション'] , seeAlso: ['EC2']},
        { name: 'CloudWatch Logs', desc: 'ロググループ: ログを管理するコンテナ（保持期間を設定）\nログストリーム: 同一リソース（EC2インスタンス等）からのログの流れ\nメトリクスフィルター: ログのパターンに一致した件数をカスタムメトリクスとして記録（アラームのトリガーに使用）\nサブスクリプションフィルター: ログをリアルタイムでLambda・Firehose・OpenSearchに転送する仕組み', tags: ['ロググループ', 'メトリクスフィルター', 'サブスクリプション'] , seeAlso: ['EC2', 'Lambda']},
        { name: 'CloudWatch Embedded Metrics（EMF）', desc: 'Lambdaのログ内に特定のJSON構造でメトリクスデータを埋め込む形式。\nPutMetricData APIを呼び出さずにカスタムメトリクスを記録できるため、Lambdaの実行時間削減とコスト削減が可能。AWS提供のEMFライブラリ（Python・Node.js等）を使うと実装が容易。', tags: ['EMF', '構造化ログ', 'カスタムメトリクス'] , seeAlso: ['Lambda']},
      ],
    },
    {
      title: 'セキュリティ',
      items: [
        { name: 'IAM', desc: 'アプリからAWSサービスへのアクセスには必ずロールを使用し、アクセスキーのハードコードを避ける。\nEC2インスタンスプロファイル: EC2にIAMロールを付与するコンテナ。EC2上のアプリが自動的にロールの認証情報を取得できる\nLambda実行ロール: LambdaがアクセスできるリソースをIAMロールで定義\n一時認証情報: AssumeRoleで取得した有効期限付きの認証情報（アクセスキー・シークレット・セッショントークン）', tags: ['インスタンスプロファイル', '実行ロール', '一時認証情報'] , keyword: 'KMS S3', seeAlso: ['EC2', 'KMS', 'Lambda', 'S3']},        { name: 'KMS', desc: 'GenerateDataKey API: データ暗号化キー（DEK）を生成するAPI。平文のDEKでデータを暗号化し、暗号化済みDEKと暗号化データをセットで保存するエンベロープ暗号化に使用\nAWS Encryption SDK: エンベロープ暗号化をコードで簡単に実装できるライブラリ\nDecrypt API: 暗号化済みDEKを復号して元のデータを復元', tags: ['GenerateDataKey', 'エンベロープ暗号化', 'SDK統合'] , keyword: 'DynamoDB EBS RDS S3', seeAlso: ['DynamoDB', 'EBS', 'RDS', 'S3']},        { name: 'SSM Parameter Store', desc: 'アプリの設定値・秘密情報を安全に保管・取得するサービス。\nString/StringList: 平文のパラメータ\nSecureString: KMSで暗号化して保管する秘密情報（DBパスワード・APIキー等）\n/path/key形式の階層化でサービス・環境ごとに整理し、IAMポリシーで階層単位のアクセス制御が可能\nバージョニング: パラメータの変更履歴を保持', tags: ['SecureString', '階層化', 'バージョニング'] , seeAlso: ['IAM', 'KMS']},
      ],
    },
  ],

  SOA: [
    {
      title: 'モニタリング・ロギング',
      items: [
        { name: 'CloudWatch', desc: 'カスタムメトリクス: PutMetricData APIで独自メトリクスを送信。高解像度（1秒）まで対応\nLogs Insights: ロググループに対してSQLライクなクエリで分析するツール\nContributor Insights: 上位N件のトラフィックソース・エラー原因を特定する分析機能\n異常検知: 機械学習でメトリクスの異常（季節性考慮）を自動検出してアラーム\n複合アラーム: 複数アラームをAND/ORで組み合わせた複合条件でアクション実行', tags: ['高解像度', 'Logs Insights', '異常検知'] , keyword: 'EC2 SNS', seeAlso: ['EC2', 'SNS']},        { name: 'CloudTrail', desc: 'AWSリソースへのAPIコールを記録する監査ログサービス。イベントの種類:\n管理イベント: AWSリソースの作成・削除・設定変更。デフォルトで有効\nデータイベント: S3オブジェクト操作・Lambda関数実行。明示的に有効化が必要\nInsightsイベント: 通常と異なるAPI呼び出しパターン（突然の大量呼び出し等）を自動検出', tags: ['管理イベント', 'データイベント', 'Insights'] , seeAlso: ['Lambda', 'S3']},
        { name: 'AWS Config', desc: 'リソースの設定変更を時系列で記録し、ルールへの準拠状況を継続的に評価するサービス。\nマネージドルール: AWSが事前定義した150以上のコンプライアンスルール\nカスタムルール: Lambda関数で独自のルールを定義\nコンフォーマンスパック: 複数のConfigルールをまとめてパッケージ化して一括展開\n自動修復: ルール違反を検出したらSSM Automationで自動修正', tags: ['設定変更', 'マネージドルール', '自動修復'] , keyword: 'S3', seeAlso: ['Lambda', 'S3']},        { name: 'Health Dashboard', desc: 'Service Health Dashboard（サービス全体の障害ステータス）: AWSサービス全体の稼働状況を公開しているページ\nPersonal Health Dashboard（個人用ヘルスダッシュボード）: 自分のアカウントのリソースへの影響をお知らせするサービス\nEventBridgeと連携してHealth通知を受けたらSlack/SNSに自動転送するパターンが頻出', tags: ['サービス障害', 'アカウント影響', 'EventBridge連携'] , seeAlso: ['EventBridge', 'SNS']},
      ],
    },
    {
      title: '自動化・運用',
      items: [
        { name: 'Systems Manager', desc: '主要機能:\nSession Manager: SSHポートを開けずにブラウザまたはCLIからEC2にセキュアに接続\nRun Command: 複数EC2に対して同時にシェルコマンドやスクリプトを実行\nPatch Manager: OSのセキュリティパッチを自動適用するスケジュール管理\nState Manager: 設定の継続的な適用・維持（例: 特定のソフトウェアが常にインストール済みであることを保証）\nInventory: EC2のソフトウェア・設定情報を収集\nOpsCenter: 運用上の問題（OpsItem）を一元管理してRunbookで解決\nAutomation: 複数ステップの運用タスクを自動化するRunbook（ドキュメント）を定義・実行', tags: ['Session Manager', 'Patch Manager', 'Automation'] , seeAlso: ['EC2']},
        { name: 'EventBridge（運用自動化）', desc: 'AWSサービスのイベントをトリガーに運用タスクを自動化するパターンが重要。\n例:\nAWS Config違反 → EventBridge → Lambda（自動修復）\nGuardDuty脅威検出 → EventBridge → SNS通知・Lambda隔離\nEC2インスタンス起動 → EventBridge → Systems Manager Automation\nスケジュール → EventBridge → Lambda（定期バックアップ）', tags: ['自動修復', 'Config連携', 'スケジュール'] , seeAlso: ['AWS Config', 'EC2', 'EventBridge', 'GuardDuty', 'Lambda', 'SNS', 'Systems Manager']},
        { name: 'OpsWorks', desc: 'Chef（Rubyベースの設定管理ツール）またはPuppet（宣言型設定管理ツール）を使ったインフラ自動化サービス。\nレシピ: ChefでEC2の設定を定義する手順書\nクックブック: レシピのコレクション\nレイヤー: 同じ役割を持つEC2グループ（Webレイヤー・DBレイヤー等）', tags: ['Chef', 'Puppet', '設定管理'] , seeAlso: ['EC2']},
        { name: 'Elastic Beanstalk（SOA観点）', desc: 'Rolling with additional batch: 追加インスタンスを起動してからローリング更新。容量を全量維持したまま更新できる\nImmutable: 新インスタンスを別オートスケーリンググループで起動してから入れ替え。最も安全だが時間がかかる\nDNS CNAME Swap（環境スワップ）: 新旧環境のCNAMEを瞬時に入れ替えるブルーグリーンデプロイ', tags: ['Rolling', 'Immutable', 'DNS CNAME Swap'] },
      ],
    },
    {
      title: '信頼性・可用性',
      items: [
        { name: 'Auto Scaling', desc: 'ライフサイクルフック: インスタンスの起動時（設定完了まで待機）・終了時（データ退避処理）にカスタムスクリプトを挿入する仕組み\n予測スケーリング: 過去のメトリクスパターンをMLで学習して事前にスケールアウト\nウォームアップ期間（Instance Warmup）: 新インスタンスが準備できるまでメトリクスへの影響を除外する時間', tags: ['ライフサイクルフック', '予測スケーリング', 'ウォームアップ'] },
        { name: 'ELB', desc: 'ヘルスチェック設定パラメータ:\n正常しきい値（HealthyThreshold）: 正常と判断するまでの連続成功回数\n異常しきい値（UnhealthyThreshold）: 異常と判断するまでの連続失敗回数\nアクセスログ: ELBのアクセスログをS3に保存（デフォルト無効）\nクロスゾーン負荷分散: 複数AZにまたがってトラフィックを均等に分散\nConnection Draining: 登録解除中のターゲットへの既存接続を安全に完了させる猶予時間', tags: ['ヘルスチェック', 'アクセスログ', 'Connection Draining'] , keyword: 'EC2', seeAlso: ['EC2', 'S3']},        { name: 'RDS（可用性）', desc: 'Multi-AZフェイルオーバー: 60〜120秒が目安。プライマリ障害時にスタンバイが自動でプライマリに昇格\nスナップショット: 自動（0〜35日間保持）と手動（明示的に削除するまで保持）の2種類\nPITR（ポイントインタイムリカバリ）: 最大35日前の任意の時点のデータに5分以内の精度で復元可能\nリードレプリカのプロモーション: 読み取りレプリカを独立したDBインスタンスに昇格（手動操作）', tags: ['フェイルオーバー', 'ポイントインタイム', 'リードレプリカ'] },
        { name: 'Route 53（DR構成）', desc: 'DR（災害対策）構成の核。ヘルスチェックの種類:\nエンドポイント監視: HTTP/HTTPS/TCPでエンドポイントの死活を監視\n他ヘルスチェック監視: 複数ヘルスチェックのAND/OR評価\nCloudWatchアラーム監視: アラームの状態に連動\nフェイルオーバールーティングと組み合わせてプライマリ障害時にセカンダリサイトに自動切り替え', tags: ['ヘルスチェック', 'フェイルオーバー', 'DR構成'] , seeAlso: ['CloudWatch']},
      ],
    },
    {
      title: 'セキュリティ・コスト',
      items: [
        { name: 'GuardDuty', desc: 'CloudTrail・VPCフローログ・DNSクエリログを機械学習と脅威インテリジェンスフィードで分析して脅威を自動検出するサービス。\nEC2のポートスキャン・認証情報の外部への漏洩・S3への不正アクセス等を検出。\nEventBridge → Lambda で自動隔離・通知のパターンが頻出。マルチアカウント（Organizations）にも一括適用可能。', tags: ['脅威検出', '機械学習', '自動応答'], keyword: 'Security Hub SNS', seeAlso: ['Security Hub', 'CloudTrail', 'EC2', 'EventBridge', 'Lambda', 'Organizations', 'S3', 'SNS', 'VPC', 'VPCフローログ'] },        { name: 'Security Hub', desc: 'GuardDuty・Inspector・Macie・Firewall Manager等の検出結果をASFF（Amazon Security Finding Format）形式で集約して一元管理するサービス。\nコンプライアンス基準への準拠状況:\nCIS AWS Foundations Benchmark / PCI-DSS / NIST 800-53 への自動チェックが可能', tags: ['集約', 'ASFF', '準拠状況'], seeAlso: ['GuardDuty', 'Firewall Manager', 'Inspector', 'Macie'] },
        { name: 'Cost Explorer', desc: 'AWSのコストと使用量を可視化・分析するツール。\nサービス別・リソース別・タグ別・リンクアカウント別にフィルタリング・グループ化が可能。\nRI（リザーブドインスタンス）やSavings Plansの利用率・カバレッジ分析と推奨事項を提示してくれる。', tags: ['コスト可視化', 'RI推奨', 'Savings Plans'] },
        { name: 'Compute Optimizer', desc: 'EC2・Lambda・EBS・ECS・Auto Scalingリソースの過去の使用状況を機械学習で分析して適正サイズを推奨するサービス。\nオーバープロビジョニング（無駄なリソース）とアンダープロビジョニング（性能不足）の両方を検出してコスト削減と性能改善を同時に達成できる。', tags: ['適正サイズ', 'EC2推奨', 'コスト最適化'] , keyword: 'CloudWatch', seeAlso: ['Auto Scaling', 'CloudWatch', 'EBS', 'EC2', 'Lambda']},      ],
    },
  ],

  DOP: [
    {
      title: 'CI/CD・SDLC自動化',
      items: [
        { name: 'CodePipeline', desc: 'ソース変更を検知して自動でビルド・テスト・デプロイを実行するCI/CDパイプライン。\nアーティファクト（Artifact）: ステージ間で受け渡すビルド成果物（S3に保存）\n手動承認アクション: 本番デプロイ前に承認者のメール確認を必須にする\nクロスアカウント/クロスリージョンデプロイ: KMS・S3バケットポリシー設定で別アカウントへのデプロイが可能\nEventBridgeトリガー: CodeCommitプッシュ・ECRイメージプッシュ等のイベントで自動起動', tags: ['クロスアカウント', '手動承認', 'アーティファクト'] , keyword: 'CloudFormation CodeBuild CodeDeploy', seeAlso: ['CloudFormation', 'CodeBuild', 'CodeCommit', 'CodeDeploy', 'EventBridge', 'KMS', 'S3']},        { name: 'CodeBuild', desc: 'buildspec.yml のフェーズ構成:\ninstall: ランタイム・依存パッケージをインストール\npre_build: ビルド前の準備（ECRログイン等）\nbuild: コンパイル・テスト実行・Dockerイメージビルド\npost_build: ECRへのプッシュ・通知\nテストレポート: JUnit・Cucumberなどのテスト結果をCodeBuildに取り込んで可視化\nVPC統合: プライベートリソース（RDS等）へのアクセスが必要な場合にVPC内でビルドを実行', tags: ['buildspec.yml', 'Docker', 'テストレポート'] , keyword: 'S3', seeAlso: ['RDS', 'S3', 'VPC']},        { name: 'CodeDeploy', desc: 'ライフサイクルイベントフック（EC2/オンプレ向け）:\nBeforeInstall → AfterInstall → ApplicationStart → ValidateService\nライフサイクルイベントフック（Lambda Blue/Green）:\nBeforeAllowTraffic: トラフィック切替前にLambda関数でスモークテストを実行\nAfterAllowTraffic: トラフィック切替後にLambda関数で本番検証を実行\nライフサイクルイベントフック（ECS Blue/Green）:\nBeforeInstall → AfterInstall → AfterAllowTestTraffic → BeforeAllowTraffic → AfterAllowTraffic\nBlue/Greenのトラフィック移行設定:\nCanary: 最初に一部（例: 10%）を流し問題なければ残りを移行（LambdaCanary10Percent5Minutes 等）\nLinear: 一定割合ずつ段階的に移行（LambdaLinear10PercentEvery1Minute 等）\nAll-at-once: 一斉に全トラフィックを新バージョンへ\nロールバック: CloudWatchアラームのトリガーで自動ロールバックも設定可能', keyword: 'CodeDeploy ライフサイクルフック BeforeAllowTraffic AfterAllowTraffic Lambda ECS Blue/Green', tags: ['ライフサイクルフック', 'Blue/Green', 'Lambda/ECS'] , seeAlso: ['CloudWatch', 'EC2', 'Lambda']},
        { name: 'CodeArtifact', desc: 'プライベートパッケージリポジトリ（npm/PyPI/Maven/NuGet/Swift対応）。\nUpstream接続: npmjs.com・PyPI・Maven Centralなどのパブリックリポジトリをプロキシして内部からセキュアに利用\n構造: ドメイン（組織単位）→ リポジトリ → パッケージ の3層\nサプライチェーンセキュリティ: 内部でパッケージを管理してバージョン固定や監査が可能', tags: ['パッケージ管理', 'Upstream', 'npm/PyPI'] },
      ],
    },
    {
      title: 'IaC・構成管理',
      items: [
        { name: 'CloudFormation', desc: '変更セット（Change Set）: スタック変更を実際に適用する前に影響範囲を確認・レビューできる\nドリフト検出: 実際のリソース設定とCloudFormationテンプレートの差分を検出（手動変更の発見に使用）\nカスタムリソース: Lambda関数でCloudFormationが対応していないリソースを管理する仕組み\nStackSets: 複数のAWSアカウント・リージョンに同一スタックを一括展開\nCloudFormation Hooks: リソース変更前にカスタムバリデーションを実行してポリシー違反を防止', tags: ['変更セット', 'ドリフト検出', 'StackSets'] , seeAlso: ['Lambda']},
        { name: 'CDK（Cloud Development Kit）', desc: 'TypeScript・Python・Java・C#等のプログラミング言語でCloudFormationテンプレートを生成するIaCフレームワーク。\nConstruct（コンストラクト）の3層:\nL1: CloudFormationリソースを直接ラップ（低レベル）\nL2: AWSサービスを使いやすくした高レベル抽象（セキュアなデフォルト付き）\nL3: 複数サービスを組み合わせた完全なパターン（例: Static Website Hosting）\nCDK Pipelines: CDKアプリ自体をCI/CDパイプラインで自動デプロイするライブラリ', tags: ['CDK', 'Construct', 'CDK Pipelines'], termKeywords: { 'L1': 'L1（CDK Construct）', 'L2': 'L2（CDK Construct）', 'L3': 'L3（CDK Construct）' } , seeAlso: ['CloudFormation']},
        { name: 'Systems Manager（DOP観点）', desc: 'Automation Runbook（旧Document）: 複数ステップの運用タスクをYAMLで定義して自動実行\nState Manager: EC2の設定が常に望ましい状態に保たれることを保証する（設定ドリフトの自動修正）\nRun Command: 複数EC2に対して一括でコマンド実行（パッチ確認・ログ収集等）\nParameter Store: 階層的な設定値・秘密情報の管理。CDK/CloudFormationとの統合でシームレスに利用', tags: ['Automation Runbook', 'State Manager', '設定継続適用'] , seeAlso: ['CloudFormation', 'EC2']},
        { name: 'OpsWorks', desc: 'Chef（Rubyベース）またはPuppet（宣言型）を使ったサーバー設定管理サービス。\nDOPでは複雑な設定管理シナリオや既存のChef/Puppetコードベースを継続利用するケースで登場する。', tags: ['Chef', 'Puppet', '設定管理'] , keyword: 'EC2', seeAlso: ['EC2']},      ],
    },
    {
      title: '監視・インシデント対応',
      items: [
        { name: 'CloudWatch（DOP観点）', desc: 'Contributor Insights: ネットワーク・APIの上位N件のアクセス元・エラー原因を特定するルールベース分析\nSynthetics Canary（合成監視）: ヘッドレスブラウザのスクリプトでAPIやWebUIの死活・レスポンスを定期チェック\nEventBridge Pipes: EventBridgeのソース→フィルタ→変換→ターゲットをシンプルなパイプとして構築\n複合アラーム: 複数アラームのAND/OR条件で不要なアラートを減らす', tags: ['Contributor Insights', 'Synthetics', 'EventBridge Pipes'] , seeAlso: ['EventBridge']},
        { name: 'X-Ray（DOP観点）', desc: 'サービスマップ: マイクロサービス間の依存関係・レイテンシ・エラー率を視覚化してボトルネックを特定\nアノテーション: インデックス化されるキーバリュー。フィルタクエリでトレースを絞り込める\nサンプリングルール: デフォルト（5%）を変更してコスト・データ量を調整\nグループ: フィルタ式でトレースのサブセットを定義して別々にCloudWatchアラームを設定', tags: ['サービスマップ', 'サンプリング', 'グループ'] , seeAlso: ['CloudWatch']},
        { name: 'EventBridge（イベントバス）', desc: 'デフォルトイベントバス: AWSサービスのイベントを受信\nカスタムイベントバス: アプリや外部システムのカスタムイベントを管理\nパートナーイベントバス: Datadog・SaaSパートナーのイベントを受信\nアーカイブ＆リプレイ: イベントを保存しておき障害時の再処理（リプレイ）が可能\nEventBridge Pipes: SQS/DynamoDB Streams/Kinesis → フィルタ → エンリッチ → Lambda/Step Functions への一連のパイプを簡潔に構築', tags: ['カスタムバス', 'アーカイブ/リプレイ', 'Pipes'] , seeAlso: ['DynamoDB', 'EventBridge', 'Kinesis', 'Lambda', 'SQS', 'Step Functions']},
        { name: 'Incident Manager', desc: 'Systems Managerの一機能。インシデントを体系的に管理するサービス。\nフロー: インシデント検出（CloudWatchアラーム等）→ 対応計画（Response Plan）の自動起動 → Runbookで対応手順を実行 → エスカレーション（担当者通知） → PIR（事後分析: Post-Incident Review）\n対応計画: インシデント発生時に誰が・何をすべきかを定義', tags: ['インシデント管理', '対応計画', 'Runbook'] , seeAlso: ['CloudWatch', 'Systems Manager']},
      ],
    },
    {
      title: '弾力性・セキュリティ',
      items: [
        { name: 'Auto Scaling（DOP観点）', desc: 'ライフサイクルフック:\n起動時フック（Launching）: インスタンス起動後にアプリ設定・エージェントインストールが完了するまで待機\n終了時フック（Terminating）: ログ退避・セッション切断などの後処理が完了するまで終了を待機\n予測スケーリング: 過去2週間のメトリクスパターンをMLで学習して事前にスケールアウト\nウォームプール（Warm Pool）: 停止済みEC2をプールして起動時間を短縮する仕組み', tags: ['ライフサイクルフック', '予測スケーリング', 'ウォームプール'] , seeAlso: ['EC2']},
        { name: 'Service Quotas', desc: 'AWSサービスの上限値（クォータ）を一元的に確認・申請するサービス。\nCloudWatchアラームとの統合でクォータ使用率が閾値を超えたら事前に通知\n自動クォータリクエスト: Lambda・Fargateなど一部サービスは使用量に応じて自動で上限引き上げを申請できる', tags: ['上限値', 'クォータ管理', '申請'] , seeAlso: ['CloudWatch', 'Lambda']},
        { name: 'IAM高度管理', desc: 'Permissions Boundary（アクセス許可の境界）: IAMユーザー/ロールに付与できる権限の最大上限を設定するポリシー。開発者が自分より強い権限を持つロールを作れないよう制限する\nABAC（Attribute-Based Access Control: 属性ベースのアクセス制御）: IAMロール・リソースのタグを使って動的にアクセス許可を決定する仕組み。チーム・環境別の権限管理に有効', keyword: 'IAM Permissions Boundary ABAC 属性ベースアクセス制御', tags: ['Permissions Boundary', 'ABAC', '最小権限'] , seeAlso: ['IAM']},
        { name: 'Config + Security Hub（DOP）', desc: 'Configコンフォーマンスパック: 複数のConfigルールをまとめてYAMLでパッケージ化し、組織全体に一括展開できる\nSecurity Hub CIS/PCI自動チェック: CIS AWS Foundations Benchmark（セキュリティのベースライン）やPCI-DSS（クレジットカード業界基準）への準拠状況をAWS Configと連携して自動評価\n自動修復: 違反検出時にSSM Automationで自動修正するパターンが頻出', keyword: 'AWS Config コンフォーマンスパック Security Hub Inspector / GuardDuty / Security Hub 使い分け GuardDuty（脅威検出）', tags: ['コンフォーマンスパック', 'CISベンチマーク', '自動修復'], seeAlso: ['Inspector / GuardDuty / Security Hub 使い分け', 'GuardDuty（脅威検出）', 'AWS Config', 'Security Hub'] },        { name: 'Organizations（マルチアカウント管理）', desc: 'SCP（サービスコントロールポリシー）: OU（組織単位）やアカウントに適用するガードレール。IAM許可とのAND評価で最大権限を制限するだけで権限を付与しない\nOU設計: 開発・ステージング・本番アカウントを別OUで分離し、誤操作・権限逸脱を組織レベルで防ぐ\nStackSets: CloudFormationテンプレートを複数アカウント・リージョンに一括デプロイする仕組み\nConfig組織アグリゲーター: 全アカウント・全リージョンのConfig設定データを1か所に集約して一元監視\n委任された管理者（Delegated Administrator）: 管理アカウント以外のメンバーアカウントにSecurity Hub・GuardDuty・Inspector等の管理権限を委任できる仕組み。セキュリティ専用アカウントに集約して管理アカウントとの職務分離を実現', keyword: 'AWS Organizations SCP OU 委任された管理者 Delegated Administrator マルチアカウント IAM Identity Center（SSO）+ Organizations', tags: ['SCP', 'StackSets', '委任された管理者'], seeAlso: ['IAM Identity Center（SSO）+ Organizations', 'AWS Organizations', 'CloudFormation', 'GuardDuty', 'IAM', 'Inspector', 'Security Hub'] },        { name: 'IAM Identity Center（SSO）+ Organizations', desc: '複数のAWSアカウントへのシングルサインオン（SSO）をOrganizations全体で一元管理するサービス（旧AWS SSO）。\nアイデンティティソース（認証先の選択）:\nAWS組み込みIDストア: Identity Centerが管理するユーザー/グループ（シンプルな構成）\n外部IdP（SAML 2.0）: Okta・Azure AD等のIdPと連携。SCIMで自動プロビジョニング\nActive Directory: AWS Managed Microsoft ADまたはAD Connectorで社内ADと同期\nCognito User Pool連携: CognitoをOIDCアイデンティティソースとしてIdentity Centerに登録することでアプリのユーザーにAWSアカウントアクセスを付与するパターン\n権限セット（Permission Set）: アカウントごとに付与するIAMポリシーの組み合わせを定義して一元管理\nCognitoとの違い: CognitoはB2Cアプリのエンドユーザー認証（ユーザープール）/ Identity CenterはAWSアカウントへの社員アクセス管理', keyword: 'IAM Identity Center AWS SSO Organizations SSO 権限セット Cognito SAML SCIM', tags: ['SSO', '権限セット', 'SAML/SCIM'], seeAlso: ['Organizations（マルチアカウント管理）', 'Cognito', 'IAM'] },
        { name: 'Inspector / GuardDuty / Security Hub 使い分け', desc: '3サービスの役割の違い:\nGuardDuty（脅威検出）: CloudTrail・VPCフロー・DNSログをML+脅威インテリジェンスで分析して「今起きている脅威」を検出。ポートスキャン・クレデンシャル漏洩・クリプトマイニングを発見\nInspector（脆弱性管理）: EC2・ECR・Lambdaの既知脆弱性（CVE）を継続スキャンして「これから起きうる弱点」を予防的に発見。CVSSスコアで優先順位付け\nSecurity Hub（統合・コンプライアンス）: GuardDuty・Inspector・Macie等の検出結果をASFF形式で集約し優先順位付け。CIS AWS Foundations Benchmark・PCI-DSSへの準拠状況を自動評価\n典型的な連携パターン: GuardDuty（脅威を検出）→ EventBridge → Lambda（EC2を自動隔離）+ Security Hub（全体の状態を追跡・管理）+ Inspector（悪用された脆弱性を特定）', keyword: 'GuardDuty Inspector Security Hub 使い分け 脅威検出 脆弱性管理 コンプライアンス Config + Security Hub（DOP）', tags: ['GuardDuty', 'Inspector', 'Security Hub'], seeAlso: ['Inspector（脆弱性管理）', 'GuardDuty（脅威検出）', 'Config + Security Hub（DOP）', 'CloudTrail', 'EC2', 'EventBridge', 'Lambda', 'Macie', 'Security Hub', 'VPC'] },        { name: 'Inspector（脆弱性管理）', desc: '脆弱性（セキュリティの弱点）を継続的にスキャンして優先順位付けするサービス。\nスキャン対象:\nEC2インスタンス: SSMエージェント経由でエージェントレスにOSの既知脆弱性を検出\nECRコンテナイメージ: プッシュ時に自動スキャンして脆弱なイメージのデプロイを防ぐ\nLambda関数: コードと依存パッケージの脆弱性をスキャン\nCVSSスコアでリスク優先順位付けし、Security Hubに集約してDOP全体のセキュリティ可視化に活用', tags: ['CVE', 'CVSS', 'コンテナスキャン'], keyword: 'GuardDuty（脅威検出） Inspector / GuardDuty / Security Hub 使い分け', seeAlso: ['GuardDuty（脅威検出）', 'Inspector / GuardDuty / Security Hub 使い分け', 'EC2', 'Lambda', 'Security Hub'] },        { name: 'GuardDuty（脅威検出）', desc: 'CloudTrail・VPCフローログ・DNSクエリログを機械学習と脅威インテリジェンスフィードで自動分析して脅威を検出するサービス。\n検出例: EC2のポートスキャン・IAMクレデンシャルの外部漏洩・S3への不正アクセス・クリプトマイニング\nOrganizations連携: 全アカウントにGuardDutyを一括有効化し、管理アカウントで検出結果を集約\nEventBridge → Lambda で自動隔離・SNS通知の自動応答パターンが頻出', tags: ['脅威検出', '機械学習', '自動応答'], keyword: 'Inspector（脆弱性管理） Inspector / GuardDuty / Security Hub 使い分け', seeAlso: ['Inspector（脆弱性管理）', 'Inspector / GuardDuty / Security Hub 使い分け', 'CloudTrail', 'EC2', 'EventBridge', 'GuardDuty', 'IAM', 'Lambda', 'Organizations', 'S3', 'SNS', 'VPC', 'VPCフローログ'] },      ],
    },
  ],

  DEA: [
    {
      title: 'データの取り込み',
      items: [
        { name: 'Kinesis Data Streams', desc: 'リアルタイムストリーミングデータの取り込みサービス。\nシャード: スループットの単位。1シャード = 1MB/s書き込み・2MB/s読み取り\n拡張ファンアウト（Enhanced Fan-Out）: 各ConsumerアプリがシャードごとにDedicatedで2MB/sで同時読み取り可能にする機能\nKCL（Kinesis Client Library）: 複数のConsumerが協調してシャードを処理するためのライブラリ\n保持期間: デフォルト24時間〜最大365日（延長は課金）', tags: ['シャード', '拡張ファンアウト', 'KCL'] , seeAlso: ['Kinesis']},
        { name: 'Kinesis Data Firehose', desc: '自動でスケールするマネージドなストリーム配信サービス。シャード管理不要で手軽にデータ配信できる。\n配信先: S3 / Redshift / Amazon OpenSearch / Splunk / HTTP エンドポイント\nLambda変換: 配信前にデータをリアルタイムで変換（JSONからParquet変換等）\nバッファリング: サイズ（1〜128MB）または時間（60〜900秒）でまとめて配信', tags: ['自動スケール', 'Lambda変換', 'バッファリング'] , seeAlso: ['Lambda', 'Redshift', 'S3']},
        { name: 'MSK（Managed Streaming for Apache Kafka）', desc: 'フルマネージドなApache Kafkaサービス。Kafkaのプロデューサー・コンシューマーAPIをそのまま使えるため既存のKafkaコードを移行しやすい。\nKafka Connect: 外部システム（RDS・S3等）とKafkaを接続するコネクタフレームワーク\nKafka Streams: Kafka内でリアルタイム処理を行うストリーム処理ライブラリ\nMSK Serverless: キャパシティ管理不要の自動スケール版', tags: ['Kafka', 'MSK Serverless', 'Connector'] , seeAlso: ['RDS', 'S3']},
        { name: 'DMS（Database Migration Service）', desc: 'ソースDBからターゲットDBへのデータ移行サービス。\n対応: 同種DB間（Oracle→Oracle）と異種DB間（Oracle→Aurora）の両方\nCDC（Change Data Capture）: ソースDBの変更をリアルタイムで継続的にキャプチャしてターゲットに適用\nSCT（Schema Conversion Tool）: 異種DB間でSQLスキーマを自動変換するツール', tags: ['DB移行', 'CDC', 'SCT'] , seeAlso: ['Aurora']},
        { name: 'AppFlow', desc: 'Salesforce・SAP・Zendesk・Slack等のSaaSアプリとAWSサービス（S3・Redshift・EventBridge）間でノーコードでデータを転送・変換するマネージドサービス。\nトリガー: スケジュール・イベント・オンデマンドの3種類\nデータマッピング: フィールドの変換・フィルタリングをGUIで設定', tags: ['SaaS連携', 'ノーコード', 'フロー'] , seeAlso: ['EventBridge', 'Redshift', 'S3']},
        { name: 'DataSync', desc: 'オンプレミスのNFS/SMBファイルサーバー、S3、EFS、FSx間のデータを高速・自動転送するエージェント型サービス。\nエージェント: オンプレ側に仮想アプライアンスをインストールしてAWSと安全に通信\nTLS暗号化・チェックサム検証でデータの整合性を保証。帯域制御とスケジュールも設定可能', tags: ['オンプレ転送', 'エージェント', '自動化'] , seeAlso: ['EFS', 'FSx', 'S3']},
      ],
    },
    {
      title: 'データの変換・処理',
      items: [
        { name: 'AWS Glue', desc: 'サーバーレスETL（Extract・Transform・Load）サービス。インフラ管理不要で大規模データ処理が可能。\nクローラー: S3・RDS・DynamoDB等のデータを自動スキャンしてGlue Data Catalogにスキーマを登録\nETLジョブ: SparkまたはPython ShellベースでデータをS3やRedshiftに変換・格納\nGlue Studio: ビジュアルなUIでETLジョブを構築できるツール\nGlue DataBrew: SQLやコードなしでデータをクリーニング・変換できるノーコードツール', tags: ['ETL', 'クローラー', 'Spark'], seeAlso: ['Glue Data Catalog', 'DynamoDB', 'Glue', 'RDS', 'Redshift', 'S3'] },
        { name: 'EMR（Elastic MapReduce）', desc: 'Apache Spark・Hive・Presto・HBaseなどのビッグデータフレームワークをEC2またはFargate上で実行するマネージドクラスタサービス。\nノードの役割:\nマスターノード: クラスタ全体を管理・調整\nコアノード: データ処理＋HDFSデータを保持（削除すると不可）\nタスクノード: データ処理のみ（HDFS保持なし）。スポットEC2を使うことでコスト削減', tags: ['Spark', 'Hive', 'スポット'] , seeAlso: ['EC2']},
        { name: 'Lambda（データ処理）', desc: 'Kinesis Data StreamsやDynamoDB Streamsのトリガーで起動してリアルタイムにデータを処理・変換するサーバーレス関数。\n軽量な変換処理やイベント駆動のデータパイプライン（フィルタリング・エンリッチメント・ルーティング）に適している。', tags: ['リアルタイム', 'ストリーム処理', 'イベント駆動'] , seeAlso: ['DynamoDB', 'Kinesis', 'Kinesis Data Streams']},
        { name: 'Step Functions（データパイプライン）', desc: 'Glue・EMR・Lambda・Athena等を組み合わせた複雑なETLパイプラインのオーケストレーション（実行順序・状態管理）サービス。\nDAG（有向非巡回グラフ）として処理フローを定義し、並列実行・条件分岐・エラーリトライを自動的に管理する。', tags: ['オーケストレーション', 'パイプライン', 'ワークフロー'], keyword: 'AWS Glue', seeAlso: ['AWS Glue', 'EMR（Elastic MapReduce）', 'Athena', 'Lambda'] },        { name: 'Managed Service for Apache Flink', desc: 'ストリームデータをリアルタイムに処理するフルマネージドサービス（旧Kinesis Data Analytics）。\nApache Flinkアプリケーション（Java/Python/Scala）をサーバーレスで実行し、Kinesis Data StreamsやMSKからのデータを低レイテンシで集計・変換・フィルタリングできる。\n処理結果はKinesis Data Firehose・S3・OpenSearch Service等へ出力できる。', keyword: 'Managed Service for Apache Flink Kinesis Data Analytics KDA MSF ストリーム処理 リアルタイム', tags: ['ストリーム処理', 'リアルタイム', 'Apache Flink'], seeAlso: ['Kinesis Data Streams', 'Kinesis Data Firehose', 'MSK（Managed Streaming for Apache Kafka）'] },
      ],
    },
    {
      title: 'データストア',
      items: [
        { name: 'S3（データレイク）', desc: 'データレイク（あらゆる形式のデータを生のまま保存するリポジトリ）の基盤として最も多く使用される。\nパーティション設計: データをyear=xxx/month=xxx/day=xxx等のフォルダ構造で分割しAthena・Sparkのフィルタ高速化に活用\n推奨フォーマット: Parquet（列指向・高圧縮）/ ORC（Hive向け列指向）/ Avro（スキーマ進化に強い）\nS3 Select: S3オブジェクト内の一部データのみをSQLで取得してネットワーク転送量を削減\nObject Lock（WORM）: 書き込み後の変更・削除を防ぐコンプライアンス要件向けの機能', tags: ['パーティション', 'Parquet/ORC', 'データレイク'] , seeAlso: ['Athena', 'S3']},
        { name: 'Redshift', desc: '列指向ストレージのDWH（データウェアハウス）。\n分散スタイル（各ノードへのデータ配置方式）:\nKEY: 特定カラムの値が同じ行を同じノードに配置（JUSTINでの結合高速化）\nALL: 全行を全ノードにコピー（小テーブル向け）\nEVEN: ラウンドロビンで均等分散\nAUTO: Redshiftが最適な方式を自動選択\nソートキー: よく使うWHERE条件カラムに設定してゾーンマップによるスキャン削減\nバキューム（VACUUM）: 削除マーク行の物理削除とソートキー順の再整列', tags: ['分散スタイル', 'ソートキー', 'Spectrum'] , keyword: 'S3', seeAlso: ['S3']},        { name: 'Lake Formation', desc: 'データレイクの構築・管理・セキュリティを一元管理するサービス。\n列・行レベルのきめ細かいアクセス制御: Athena・GlueからS3のデータへのアクセスをカラム・行単位で制限できる\nBlueprint（ブループリント）: S3やRDBのデータを定期的にGlueワークフローでデータレイクに取り込むパイプラインを自動生成する機能', tags: ['列/行レベル', 'Blueprint', 'アクセス制御'], keyword: 'AWS Glue Glue Data Catalog Redshift', seeAlso: ['AWS Glue', 'Athena', 'Glue Data Catalog', 'Redshift', 'S3'] },        { name: 'Athena', desc: 'S3上のデータをサーバーレスSQLでクエリするサービス。\nワークグループ: チーム・プロジェクト別にクエリを分離してコスト制御・アクセス制御を行う仕組み\nクエリフェデレーション: Lambda Connectorを使ってS3以外のRDS・CloudWatch・DynamoDBのデータも横断的にクエリ可能\nIcebergテーブル: SCHEMAの変更やタイムトラベル（過去の状態をクエリ）・UPDATEをサポートするテーブル形式', tags: ['ワークグループ', 'クエリフェデレーション', 'Iceberg'] , keyword: 'Glue', seeAlso: ['CloudWatch', 'DynamoDB', 'Glue', 'Lambda', 'RDS', 'S3']},        { name: 'DynamoDB（DEA観点）', desc: '大規模なリアルタイムアクセスが必要なKV（キーバリュー）ストア。\nパーティションキー設計: ホットパーティション（特定キーへのアクセス集中）を避けるため書き込みシャーディング（サフィックス追加）等を使用\nDAX（DynamoDB Accelerator）: マイクロ秒レイテンシのインメモリキャッシュ。API互換でアプリ変更が最小限\nTTL（Time to Live）: 有効期限付きアイテムを自動削除してストレージコストを削減', tags: ['KVストア', 'DAX', 'TTL'] , seeAlso: ['DynamoDB']},
      ],
    },
    {
      title: 'データセキュリティ・ガバナンス',
      items: [
        { name: 'KMS（データ暗号化）', desc: 'S3・Redshift・Glue・Athena等のデータサービスとシームレスに統合して保存データを暗号化するサービス。\nキーポリシー: KMSキーへのアクセスをJSON形式で制御するリソースベースポリシー\nグラント（Grant）: 特定の操作（Decrypt等）を特定のAWSプリンシパルに委譲する一時的なアクセス許可の仕組み', tags: ['暗号化', 'キーポリシー', 'グラント'] , seeAlso: ['Athena', 'Glue', 'KMS', 'Redshift', 'S3']},
        { name: 'Macie', desc: 'S3バケット内のPII（Personally Identifiable Information: 個人識別情報）・認証情報・金融データ等の機密データを機械学習で自動検出・分類するサービス。\nバケットの公開設定ミスも検出する。GDPR・HIPAAなどのコンプライアンス対応に活用される。', tags: ['PII検出', 'S3スキャン', 'データ分類'] , seeAlso: ['S3']},
        { name: 'Glue Data Catalog', desc: 'データのスキーマ（テーブル定義・カラム型）・場所（S3パス等）・メタデータを一元管理するメタデータリポジトリ。\nAthena・Redshift Spectrum・EMR・Lake Formationと連携してデータソースのスキーマを共有する。クローラーで自動登録が可能。', tags: ['メタデータ', 'スキーマ管理', 'データカタログ'], keyword: 'AWS Glue', seeAlso: ['AWS Glue', 'Athena', 'Lake Formation', 'Redshift', 'S3'] },        { name: 'OpenSearch Service', desc: 'フルマネージドな全文検索・ログ分析エンジン（旧Elasticsearch Service）。\nKinesis Data Firehose・CloudWatch Logs・S3等からデータを取り込みリアルタイムに検索・集計できる。\nOpenSearch Dashboards（旧Kibana）で可視化UIを構築できる。\nログ解析・アプリケーション検索・セキュリティ分析（SIEM）の3用途が頻出。', keyword: 'OpenSearch Elasticsearch ログ解析 全文検索 Kibana OpenSearch Dashboards SIEM AWS Glue Managed Service for Apache Flink', tags: ['全文検索', 'ログ分析', 'SIEM'], seeAlso: ['Kinesis Data Firehose', 'S3（データレイク）', 'AWS Glue', 'Managed Service for Apache Flink'] },        { name: 'QuickSight', desc: 'クラウドネイティブなBI（Business Intelligence）・可視化サービス。\nAthena・Redshift・S3・RDS等のデータソースに接続してインタラクティブなダッシュボードを作成できる。\nSPICE（Super-fast Parallel In-memory Calculation Engine）という独自インメモリエンジンで大量データを高速集計する。\nML Insights機能で異常検知・予測をノーコードで利用できる。', keyword: 'QuickSight BI ダッシュボード 可視化 SPICE ML Insights Lake Formation', tags: ['BI', '可視化', 'SPICE'], seeAlso: ['Athena', 'Redshift', 'S3（データレイク）', 'Lake Formation'] },      ],
    },
  ],

  MLA: [
    {
      title: 'SageMaker - データ準備',
      items: [
        { name: 'SageMaker Data Wrangler', desc: 'S3・Redshift・Athena等から300以上のデータ変換をGUIで実行できるデータ準備ツール。\nデータ品質レポート: 欠損値・外れ値・クラス不均衡を自動で可視化\n変換したフローをGlue ETLジョブやSageMaker Processingジョブとしてエクスポートできる', tags: ['データ変換', 'GUI', 'データ品質'] , seeAlso: ['Athena', 'Glue', 'Redshift', 'S3']},
        { name: 'SageMaker Feature Store', desc: '特徴量（モデルの入力データ）を管理・共有するリポジトリ。\nオンラインストア: 低レイテンシ（ミリ秒）でリアルタイム推論用の最新特徴量を取得\nオフラインストア（S3）: バッチ学習用に特徴量の履歴を蓄積\n複数チーム・モデルで特徴量を再利用することでデータパイプラインの重複を排除', tags: ['オンラインストア', 'オフラインストア', '特徴量共有'] , seeAlso: ['S3']},
        { name: 'SageMaker Ground Truth', desc: '機械学習用のデータラベリング（教師ラベルの付与）を管理するサービス。\nAmazon Mechanical Turk・専門ラベリング会社・プライベートチームにラベリングを依頼できる\nActive Learning（自動ラベリング）: 信頼度が高いデータは自動でラベル付けし、信頼度が低いデータのみ人間がレビューすることでコストと時間を削減', tags: ['ラベリング', 'Active Learning', '自動ラベリング'] },
      ],
    },
    {
      title: 'SageMaker - モデル開発',
      items: [
        { name: 'SageMaker Studio', desc: 'ML開発のための統合IDE（開発環境）。Jupyter Notebookを拡張したWebベースの環境で以下を統一UIで利用:\nExperiments: 複数の学習実行の条件・メトリクスを比較管理\nPipelines: MLパイプラインの定義・実行・可視化\nModel Registry: モデルのバージョン管理・承認\nClarify: バイアス・説明可能性の分析', tags: ['IDE', 'Experiments', '統合環境'], keyword: 'SageMaker Clarify SageMaker Pipelines SageMaker Model Registry', seeAlso: ['SageMaker Clarify', 'SageMaker Pipelines', 'SageMaker Model Registry'] },        { name: 'SageMaker Training', desc: 'マネージドなMLモデル学習サービス。\n組み込みアルゴリズム: XGBoost（勾配ブースティング）/ Linear Learner（線形モデル）/ DeepAR（時系列予測）/ BlazingText（テキスト分類）等\nカスタムコンテナ: 独自のTensorFlow・PyTorch等のコードをDockerイメージで実行\n分散学習 (Distributed Training): データ並列（大量データを複数GPU/インスタンスで分割学習）とモデル並列（大規模モデルを複数GPUに分割）\nスポットトレーニング: EC2スポットインスタンスで最大90%コスト削減（中断を考慮してチェックポイント設定が必要）', tags: ['組み込みアルゴリズム', '分散学習', 'スポット'] , seeAlso: ['EC2']},
        { name: 'SageMaker Automatic Model Tuning（AMT）', desc: 'ハイパーパラメータ（学習率・バッチサイズ等）を自動探索してモデルを最適化するHPO（Hyperparameter Optimization）機能。\n探索戦略:\nBayesian最適化: 過去の試行結果を学習して効率的に次のパラメータ候補を選択\nGrid Search: 指定した全パラメータ組み合わせを網羅的に試行\nRandom Search: ランダムにパラメータを選択\nウォームスタート: 前回のチューニング結果を引き継いで効率化', tags: ['HPO', 'Bayesian最適化', 'ウォームスタート'] },
        { name: 'SageMaker Clarify', desc: '学習前後のバイアス検出と説明可能性の分析を行うサービス。\nバイアス検出: 訓練データのバイアス（学習前）とモデルの予測バイアス（学習後）を統計指標で測定\nSHAP（Shapley Additive exPlanations）値: 各特徴量が予測に与えた貢献度を定量化するFeature Importance手法\nModel Monitorと統合してデプロイ後のバイアスドリフトも継続監視', tags: ['バイアス検出', 'SHAP', '説明可能性'], keyword: 'SageMaker Model Monitor 公平性（Fairness）', seeAlso: ['SageMaker Model Monitor', '公平性（Fairness）', '説明可能性（XAI）'] },      ],
    },
    {
      title: 'SageMaker - デプロイ・MLOps',
      items: [
        { name: 'SageMaker Endpoints（推論）', desc: '推論エンドポイントの4種類:\nリアルタイムエンドポイント: 同期API。低レイテンシが必要な場合\n非同期推論: リクエストをキューに積んでバックグラウンドで処理。大きなペイロードや処理時間が長い推論向け\nサーバーレス推論: トラフィックがゼロの間はコストゼロ。断続的なトラフィック向け\nバッチ変換: S3のデータをバッチ処理。推論エンドポイントの常時起動不要\nマルチモデルエンドポイント（MME）: 1つのエンドポイントで複数モデルをホスティングしてコスト削減', tags: ['リアルタイム', '非同期', 'バッチ変換'] , seeAlso: ['S3']},
        { name: 'SageMaker Pipelines', desc: 'MLワークフロー（データ処理→学習→評価→モデル登録→デプロイ）をDAG（有向非巡回グラフ）として定義してCI/CD化するサービス。\n各ステップはProcessing・Training・Evaluation・Condition・Register等のタイプから選択。\nExperimentsと自動統合して実行履歴・メトリクスを管理する。', tags: ['MLパイプライン', 'CI/CD', 'DAG'], keyword: 'SageMaker Studio SageMaker Model Registry', seeAlso: ['SageMaker Studio', 'SageMaker Model Registry'] },        { name: 'SageMaker Model Registry', desc: 'モデルのバージョン管理・メタデータ（精度・訓練データ・パラメータ）・承認ワークフローを管理するカタログ。\n承認（Approved）/拒否（Rejected）のステータスを管理し、承認済みモデルのみをCodePipeline・Lambda経由で自動デプロイするパターンが重要。', tags: ['モデル管理', 'バージョン管理', '承認ワークフロー'], keyword: 'SageMaker Pipelines SageMaker Studio', seeAlso: ['SageMaker Pipelines', 'SageMaker Studio', 'CodePipeline', 'Lambda'] },        { name: 'SageMaker Model Monitor', desc: 'デプロイ済みモデルを継続的に監視する4種類のモニター:\nデータ品質: 入力データの統計的特性がベースラインから逸脱していないか（データドリフト）\nモデル品質: 予測精度が劣化していないか\nバイアスドリフト: 特定グループへの偏りが増加していないか\n説明可能性ドリフト: Feature Importanceが変化していないか', tags: ['データドリフト', 'モデル品質', '継続的監視'], keyword: 'SageMaker Clarify SageMaker Endpoints（推論）', seeAlso: ['SageMaker Clarify', 'SageMaker Endpoints（推論）'] },      ],
    },
    {
      title: 'MLインフラ・セキュリティ',
      items: [
        { name: 'ECR（Elastic Container Registry）', desc: 'Dockerコンテナイメージを保存・バージョン管理するAWSのプライベートコンテナレジストリ。\nSageMakerのカスタムTraining Job・Inference Jobでは独自のMLライブラリや依存関係を含んだコンテナイメージをECRに保存して使用する。\nECRのイメージスキャン機能でコンテナの脆弱性を検出できる。', tags: ['コンテナ', 'カスタムイメージ', 'バージョン管理'] },
        { name: 'CloudWatch + SageMaker', desc: 'SageMakerはトレーニング・推論のメトリクスをCloudWatchに自動送信する。\nトレーニングジョブ: CPU/GPU使用率・メモリ使用率・学習損失（カスタムメトリクス）\n推論エンドポイント: Invocations（呼び出し回数）/ Latency（レイテンシ）/ ModelLatency / 4xx・5xxエラー数\nこれらにCloudWatchアラームを設定してスケーリング・通知を自動化する', tags: ['GPU監視', 'レイテンシ', 'アラーム'], keyword: 'SageMaker Endpoints（推論） SageMaker Model Monitor', seeAlso: ['SageMaker Endpoints（推論）', 'SageMaker Model Monitor', 'CloudWatch'] },        { name: 'IAM + VPC統合（SageMaker）', desc: 'SageMakerのジョブをVPC内で実行することでインターネットアクセスを遮断してネットワーク分離を実現。\n実行ロール（Execution Role）: SageMakerがS3・ECR・CloudWatch等にアクセスするためのIAMロール。最小権限の原則で必要なリソースのみに限定する。\nVPCエンドポイント: VPC内からS3・SageMaker APIにプライベートアクセスするために設定', tags: ['VPC統合', '実行ロール', 'ネットワーク分離'] , seeAlso: ['CloudWatch', 'IAM', 'S3', 'VPC', 'VPCエンドポイント']},
      ],
    },
  ],

  SAP: [
    {
      title: '組織とガバナンス',
      items: [
        { name: 'AWS Organizations', desc: '複数のAWSアカウントをOU（組織単位）で階層的に管理するサービス。\nSCP（サービスコントロールポリシー）: OU/アカウントに適用するガードレール。IAM許可との AND評価で最大権限を制限するだけで権限を付与する機能はない\nコンソリデーテッドビリング: 全アカウントの請求を1つにまとめてスケールメリットで割引を受けられる', tags: ['SCP', 'OU', 'ガードレール'] , seeAlso: ['IAM']},
        { name: 'Control Tower', desc: 'AWS Organizationsの上でマルチアカウント環境の推奨アーキテクチャ（ランディングゾーン）を自動セットアップするサービス。\nGuardrails（ガードレール）: 予防的（SCPで禁止）と検出的（Configルールで違反を検出）の2種類\nAccount Factory: 新しいAWSアカウントを承認済み設定で自動プロビジョニング\nログアーカイブアカウント: CloudTrail・Configのログを集約保存する専用アカウント', tags: ['ランディングゾーン', 'Guardrails', 'Account Factory'] , seeAlso: ['AWS Organizations', 'CloudTrail']},
        { name: 'RAM（Resource Access Manager）', desc: 'AWS Organizationsまたはアカウント間でAWSリソースを共有するサービス。\n共有可能なリソース例: VPCサブネット・Transit Gateway・Route 53 Resolverルール・ライセンス\nVPCサブネット共有: 別アカウントのリソースを同一VPCのサブネットに配置できる。VPCピアリングやTGWなしで済む', tags: ['リソース共有', 'VPC共有', 'クロスアカウント'] , seeAlso: ['AWS Organizations', 'Route 53', 'VPC']},
        { name: 'Service Catalog', desc: 'ITサービスのポートフォリオを管理してユーザーにセルフサービスで承認済みリソースを提供するサービス。\nCloudFormationテンプレートをベースに「製品」を定義し、ユーザーが承認済み製品だけをデプロイできるガバナンスを実現。コスト管理・コンプライアンス維持に有効。', tags: ['セルフサービス', 'カタログ', 'ガバナンス'] , seeAlso: ['CloudFormation']},
        { name: 'Config + Organizations', desc: 'Config組織アグリゲーター: 全アカウント・全リージョンの設定データを1か所に集約して一元管理する機能\nコンフォーマンスパック: 複数のConfigルールをまとめてYAMLでパッケージ化し、Organizationsを通じて全アカウントに一括展開する', keyword: 'AWS Config 組織アグリゲーター コンフォーマンスパック', tags: ['アグリゲーター', 'コンフォーマンスパック', '一元管理'] , seeAlso: ['AWS Config', 'Organizations']},
      ],
    },
    {
      title: '移行・モダン化',
      items: [
        { name: 'Application Migration Service（MGN）', desc: 'オンプレミスや他クラウドのサーバーをAWSにリフトアンドシフト（そのまま移行）するサービス。\nエージェントをソースサーバーにインストールして継続的にAWSへレプリケーション。カットオーバー時のダウンタイムを最小限（分単位）に抑えられる。', tags: ['リフト&シフト', 'エージェント', 'レプリケーション'] },
        { name: 'DMS（Database Migration Service）', desc: 'ソースDBからターゲットDBへのマイグレーションサービス。\n同種DB移行: Oracle→Oracle / MySQL→MySQL\n異種DB移行: Oracle→Aurora / SQL Server→PostgreSQL\nCDC（Change Data Capture）: 移行後もソースの変更をリアルタイムで継続レプリケーションして最終カットオーバーのダウンタイムを最小化', tags: ['DB移行', 'CDC', '異種DB'] , seeAlso: ['Aurora']},
        { name: 'Snow Family（オフラインデータ転送）', desc: 'ネットワーク経由のデータ転送が現実的でない場合のオフライン転送デバイス。\nSnowcone: 小型（8TB）。エッジコンピューティングにも対応\nSnowball Edge Storage Optimized: 大容量（80TB）\nSnowball Edge Compute Optimized: EC2・Lambda機能付き（エッジ処理向け）\nSnowmobile: トラックで運搬する100PBの超大規模転送', tags: ['オフライン転送', 'エッジコンピュート', 'ペタバイト'] , seeAlso: ['EC2', 'Lambda']},
        { name: 'Migration Hub', desc: 'Application Migration Service・DMS・CloudEndure等のAWS移行ツールの進捗を一元的に追跡・管理するダッシュボード。\nMigration Hub Refactor Spaces: マイクロサービスへのリファクタリング移行を支援するサービス', tags: ['移行追跡', 'ダッシュボード', '一元管理'] },
        { name: 'DataSync', desc: 'オンプレのNFS/SMBサーバー・S3・EFS・FSx・他クラウド間でデータを高速転送・同期するエージェント型サービス。\nTLS暗号化によるセキュアな転送・転送データのチェックサム検証・帯域制御・スケジュール実行が可能。DataSync vs DMS: DataSyncはファイル/オブジェクト転送、DMSはDBレコード移行', tags: ['高速転送', '同期', 'TLS'] , seeAlso: ['EFS', 'FSx', 'S3']},
      ],
    },
    {
      title: '高度なネットワーキング',
      items: [
        { name: 'Transit Gateway（TGW）', desc: 'VPC・Site-to-Site VPN・Direct Connectを集約してハブ&スポーク型で接続するサービス。\nTGWルートテーブル: アタッチメント間のルーティングを制御。同一ルートテーブルに置かないと通信不可\nリージョン間TGWピアリング: 別リージョンのTGWとピアリングしてマルチリージョン構成を実現\nマルチキャストサポート: マルチキャストトラフィック（1対多の同時配信）をサポート', tags: ['ハブ&スポーク', 'リージョン間ピアリング', 'ルートテーブル'] , seeAlso: ['Direct Connect', 'Site-to-Site VPN', 'VPC']},
        { name: 'Direct Connect', desc: 'オンプレとAWSをインターネットを経由しない物理専用線で接続するサービス。\nLAG（Link Aggregation Group）: 複数の物理回線を束ねて帯域幅を増加・冗長化する仕組み\nMACsec: L2（データリンク層）での暗号化。通信の盗聴防止\nVIFの種別:\nプライベートVIF: VPC内のプライベートリソースへ接続\nパブリックVIF: S3・DynamoDB等のAWS公開エンドポイントへ接続\nトランジットVIF: TGW経由で複数VPCへ接続', tags: ['LAG', 'MACsec', 'VIF種別'] , seeAlso: ['DynamoDB', 'S3', 'VPC']},
        { name: 'Network Firewall', desc: 'VPCに集中型のマネージドIPS/IDS（侵入防止/検知システム）をデプロイするサービス。\nステートフルルール: 接続状態を追跡した上でトラフィックを検査\nステートレスルール: 個々のパケットを条件でフィルタリング\nSuricata互換エンジン: オープンソースのSuricataルール形式でL7（アプリ層）まで詳細なトラフィック検査が可能', tags: ['Suricata', 'IPS', 'ステートフル'] , seeAlso: ['VPC']},
        { name: 'VPC共有（RAM）', desc: 'AWS RAMを使ってアカウント間でVPCサブネットを共有する機能。\n複数アカウントのリソースを同一VPC内のサブネットに配置できるため、TGWのような追加のルーティング設定が不要でネットワーク管理をシンプルに保てる。ホストアカウントがVPCを所有し、参加者アカウントがリソースをデプロイする。', tags: ['サブネット共有', 'TGW不要', '一元管理'] , seeAlso: ['VPC']},
      ],
    },
    {
      title: '弾力性・DR・コスト最適化',
      items: [
        { name: 'Aurora Global Database', desc: '1つのプライマリリージョン（読み書き）＋最大5つのセカンダリリージョン（読み取り専用）で構成するマルチリージョンDR構成。\nRPO（Recovery Point Objective: 目標復旧時点）1秒: 1秒以内のデータ損失に抑えられる\nRTO（Recovery Time Objective: 目標復旧時間）1分以内: 障害発生から1分以内にセカンダリをプライマリに昇格できる\nマネージドフェイルオーバー: GUIまたはAPIで自動的にセカンダリをプライマリに昇格', tags: ['マルチリージョン', 'RPO/RTO', 'フェイルオーバー'] },
        { name: 'DynamoDB Global Tables', desc: 'マルチリージョンのアクティブ-アクティブ（全リージョンで読み書き可能）DynamoDB構成。\n競合解決: Last-Write-Wins（LWW）方式。最後に書き込んだデータが優先される\nバージョン番号（バージョン衝突回避）: タイムスタンプベースで競合を検出して最新の書き込みを保持\nReplicasに複数リージョンを指定するだけで自動的に双方向レプリケーションが設定される', tags: ['アクティブ-アクティブ', 'Last-Write-Wins', 'マルチリージョン'] , seeAlso: ['DynamoDB']},
        { name: 'Elastic Disaster Recovery（DRS）', desc: 'ソースサーバーにエージェントをインストールして継続的にAWSにレプリケーションしPITR（ポイントインタイムリカバリ）を実現するDRサービス。\nRTO（目標復旧時間）数分・低コスト（平常時はストレージのみ課金）のDRソリューション。フェイルオーバー時にEC2を起動してすぐに業務継続できる。', tags: ['PITR', '低コストDR', 'エージェント'] , seeAlso: ['EC2']},
        { name: 'Compute Optimizer', desc: 'EC2・Lambda・EBS・ECS・Auto Scalingのリソース使用状況を機械学習で分析してオーバープロビジョニングを検出し適正サイズを推奨するサービス。\n過去14日間（Extended: 93日間）のCloudWatchメトリクスを分析してコスト削減率とパフォーマンスリスクを表示する。', tags: ['適正サイズ', 'ML分析', 'コスト削減'] , seeAlso: ['Auto Scaling', 'CloudWatch', 'EBS', 'EC2', 'Lambda']},
        { name: 'Cost Anomaly Detection', desc: '機械学習でAWSコストの異常（突然の急増等）を検出してSNS・メールで通知するサービス。\nモニターの種類: AWSサービス別・リンクアカウント別・コストカテゴリ別・タグ別に設定できる\n設定したしきい値（金額または割合）を超えた異常のみアラートするため不要な通知を削減できる', tags: ['異常検出', 'ML', 'SNS通知'] , seeAlso: ['SNS']},
      ],
    },
  ],

  AIP: [
    {
      title: 'Amazon Bedrock - コア',
      items: [
        { name: 'Bedrock 基盤モデル', desc: '単一のAPIで複数の基盤モデルを呼び出せるサービス。サーバー管理不要。\n利用可能モデル例:\nAmazon Titan: AWSが独自開発したテキスト・エンベディング・画像生成モデル\nAnthropic Claude: テキスト理解・生成・コーディング・分析に優れた大規模言語モデル\nMeta Llama: オープンソースベースの高性能テキスト生成モデル\nMistral: 軽量・高速・多言語対応の高コスパモデル\nCohere: エンタープライズ向けテキスト分類・エンベディング特化モデル\nStability AI: 画像生成（Stable Diffusion系）モデル', keyword: 'Amazon Bedrock 基盤モデル Claude Titan', tags: ['Claude', 'Titan', 'マルチモデル'] , seeAlso: ['Amazon Bedrock']},
        { name: 'Bedrock Knowledge Bases', desc: 'RAG（検索拡張生成）を簡単に構築するマネージドサービス。\n仕組み:\n① S3のドキュメントを適切なサイズの「チャンク」に分割\n② エンベディングモデルで各チャンクをベクトル（数値ベクトル）に変換\n③ ベクトルストアに格納して類似度検索を可能にする\n④ ユーザーの質問ベクトルと近いチャンクを取得してFMへのプロンプトに追加\nベクトルストア選択: OpenSearch Serverless / Aurora PostgreSQL（pgvector）/ Pinecone等', tags: ['RAG', 'ベクトルストア', 'チャンキング'], keyword: 'RAGパターン ベクトルDB選択', seeAlso: ['RAGパターン', 'RAG（検索拡張生成）', 'ベクトルDB選択', 'Aurora', 'S3'] },        { name: 'Bedrock Agents', desc: 'FMをオーケストレーターとして複数のツールを使って複雑なタスクを自律実行するサービス。\nAction Groups（アクションのグループ）: Lambda関数でバックエンドAPIを呼び出す能力を定義\nKnowledge Base連携: 必要に応じて社内ドキュメントを検索\nReActアーキテクチャ: 推論（Reason）→行動（Act）→観察（Observe）のループでゴールに向かって自律的に進む\nメモリ: セッション内の会話履歴をコンテキストとして保持するマルチターン対応', tags: ['Action Groups', 'ReAct', 'マルチターン'], keyword: 'Bedrock Knowledge Bases エージェントパターン', seeAlso: ['Bedrock Knowledge Bases', 'エージェントパターン', 'Lambda'] },        { name: 'Bedrock Guardrails', desc: 'FMの出力をポリシーに従ってフィルタリングする安全機能。\nコンテンツフィルタリング: 暴力・ヘイトスピーチ・性的コンテンツ・誤情報を自動ブロック\nPII（個人識別情報）検出・マスキング: 名前・メールアドレス・クレジットカード番号等を検出して匿名化\nグラウンディングチェック: 参照ドキュメントに根拠のない回答（ハルシネーション）を検出・ブロック\n特定トピックの拒否: 扱ってはいけないテーマ（競合他社の製品等）を定義して拒否', tags: ['コンテンツフィルタ', 'PII', 'グラウンディング'], keyword: '安全とコンテンツポリシー AIガバナンス', seeAlso: ['安全とコンテンツポリシー', 'AIガバナンス', 'ハルシネーション'] },        { name: 'Bedrock Model Customization', desc: 'FMを自社データでカスタマイズする方法:\nファインチューニング（Fine-tuning）: ラベル付きの入出力ペアで追加学習してタスク特化したモデルを作成\n継続事前学習（Continued Pre-training）: ドメイン固有の大量テキストでFMを追加学習して知識を拡充\nDistillation（知識蒸留）: 大きなモデル（教師）の出力を使って小さなモデル（生徒）を学習してコンパクト化', tags: ['ファインチューニング', '継続事前学習', 'Distillation'], seeAlso: ['ファインチューニング'] },
        { name: 'Bedrock Model Evaluation', desc: 'モデルを評価・比較してユースケースに最適なモデルを選定するサービス。\n自動評価: 精度・堅牢性・毒性等の組み込みメトリクスでモデルをベンチマーク評価\n人間評価: Mechanical Turkや社内チームが出力品質を評価するHuman Evaluationワーカーチームを設定\n評価結果を基に各タスク（要約・分類・Q&A等）に最適なモデルを選定する', tags: ['モデル評価', '自動評価', '比較'] },
      ],
    },
    {
      title: '生成AIアーキテクチャパターン',
      items: [
        { name: 'RAGパターン', desc: 'Retrieval-Augmented Generation（検索拡張生成）の実装フロー:\n① ユーザーの質問をエンベディングモデルでベクトルに変換\n② ベクトルDBで類似度検索して関連チャンクを取得\n③ 取得したチャンクをコンテキストとしてプロンプトに追加\n④ FMが根拠のある回答を生成\n精度向上のポイント: チャンクサイズの調整（小さすぎると文脈不足・大きすぎると雑音）/ ハイブリッド検索（ベクトル＋キーワード）/ リランキング（再順位付け）', keyword: 'RAG 検索拡張生成 Retrieval-Augmented Generation Bedrock Knowledge Bases ベクトルDB選択', tags: ['チャンキング', 'エンベディング', 'ランク付け'], seeAlso: ['Bedrock Knowledge Bases', 'RAG（検索拡張生成）', 'ベクトルDB選択'] },        { name: 'プロンプトエンジニアリング（AIP）', desc: 'AIP試験でよく問われるプロンプト技法:\nSystem prompt: AIの役割・制約・口調を定義する（「あなたは医療専門家です」等）\nFew-shot: 入出力例を3〜5件示してフォーマットや判断基準を教える\nChain-of-Thought: 「ステップごとに考えてください」で複雑な推論精度を向上\nXML構造: タグでセクションを区切って指示を明確化（Claudeに特に有効）\nネガティブプロンプト: してはいけないことを明示して誤動作を防止', keyword: 'プロンプトエンジニアリング Few-shot Chain-of-Thought', tags: ['System prompt', 'Few-shot', 'Chain-of-Thought'] , seeAlso: ['プロンプトエンジニアリング']},
        { name: 'エージェントパターン', desc: 'FMが自律的にタスクを実行するためのアーキテクチャパターン。\nReActフレームワーク: Reason（推論）→ Act（行動）→ Observe（観察）のループを繰り返してゴールに到達する\nFunction Calling（ツール呼び出し）: FMが外部ツール（天気API・DBクエリ等）をいつ・どのように呼ぶかを決定する能力\nマルチエージェントオーケストレーション: 複数のFMエージェントが協調してより複雑なタスクを分担して実行する', keyword: 'AI エージェント ReAct Function Calling Bedrock Agents', tags: ['ReAct', 'Function Calling', 'マルチエージェント'], seeAlso: ['Bedrock Agents'] },
        { name: 'ベクトルDB選択', desc: 'RAGのベクトル検索バックエンドを選択する基準:\nAmazon OpenSearch Serverless（ベクトルエンジン）: サーバーレスで管理不要。大規模対応\nAurora PostgreSQL（pgvector拡張）: 既存のRDSとの統合・SQLでベクトル検索が可能\nAmazon MemoryDB（Redis互換）: 低レイテンシのインメモリベクトル検索\nPinecone・Weaviate・Qdrant: 外部マネージドベクトルDBサービス。高精度・高機能', keyword: 'ベクトルデータベース Vector Database pgvector OpenSearch', tags: ['OpenSearch', 'pgvector', 'MemoryDB'] , seeAlso: ['Aurora', 'RDS']},
      ],
    },
    {
      title: '責任あるAI・ガバナンス',
      items: [
        { name: '安全とコンテンツポリシー', desc: 'Bedrock Guardrailsで有害コンテンツ・PII・特定トピックのフィルタリングをモデルとアプリに横断して適用。\nモデル提供者（Anthropic・Meta等）のUsage Policy（利用規約）への遵守が義務付けられる。\nAWS AI Service Cards: 各AIサービスの設計意図・評価方法・想定外の使い方を公開して透明性を確保するドキュメント', keyword: 'Bedrock Guardrails コンテンツポリシー AWS AI Service Cards', tags: ['ガードレール', 'Usage Policy', '透明性'], seeAlso: ['Bedrock Guardrails'] },
        { name: 'データプライバシー', desc: 'Bedrockはデフォルトでユーザーのプロンプト・レスポンスをモデル学習に使用しない（データはAWSに保持される）。\nVPCエンドポイント: インターネットを経由せずBedrockのAPIにアクセスしてデータをAWS内に留める\nKMS暗号化: 知識ベースのデータやモデルカスタマイズ用データを顧客管理キーで暗号化', keyword: 'Amazon Bedrock データプライバシー KMS暗号化', tags: ['データ保護', 'VPCエンドポイント', 'KMS'] , seeAlso: ['Amazon Bedrock', 'KMS', 'VPC', 'VPCエンドポイント']},
        { name: 'モニタリングと監査', desc: 'CloudTrail: BedrockのすべてのAPIコール（InvokeModel・RetrieveAndGenerate等）を記録して監査証跡を保持\nCloudWatch メトリクス:\nInvocationCount: モデル呼び出し回数\nInvocationLatency: 呼び出しから応答までの時間\nInputTokenCount / OutputTokenCount: トークン使用量\nModelInvocationThrottledRequests: スロットリングされたリクエスト数', keyword: 'Bedrock CloudTrail CloudWatch 監視 監査', tags: ['CloudTrail', 'CloudWatch', 'APIログ'] , seeAlso: ['CloudTrail', 'CloudWatch']},
      ],
    },
    {
      title: '最適化・運用',
      items: [
        { name: 'コスト最適化', desc: '料金モデルの選択:\nオンデマンド: APIコールごとに課金。小規模・不定期な利用に適する\nプロビジョニドスループット: 一定スループットを月/6か月/1年コミットで割引購入。大規模・定常的な利用に適する\nプロンプトキャッシュ（Prompt Caching）: 同じプレフィックスのプロンプト部分をキャッシュして再利用するとトークンコストを削減できる機能', keyword: 'Bedrock コスト プロビジョニドスループット Prompt Caching', tags: ['プロビジョニドスループット', 'プロンプトキャッシュ', 'コスト'] , seeAlso: ['料金モデル']},
        { name: 'レイテンシ最適化', desc: 'ストリーミングレスポンス: 応答を生成しながらトークン単位で逐次返す。TTFT（Time to First Token: 最初のトークンが届くまでの時間）の体感を改善\n適切なモデルサイズの選択: タスクの複雑さに応じて大きなモデルと小さなモデルを使い分け（小モデルの方が速くコストも安い）\nリージョンの最適化: ユーザーに近いリージョンのBedrockを使用して物理的レイテンシを削減', keyword: 'Bedrock レイテンシ ストリーミングレスポンス TTFT', tags: ['ストリーミング', 'TTFT', 'モデルサイズ'] },
        { name: 'Amazon Q', desc: 'AWSが提供するAIアシスタント製品ファミリー。\nQ Business: 企業の社内ドキュメント（Confluence・Slack・S3等）に接続して自然言語でナレッジを検索・回答するチャットボット\nQ Developer: コード生成・補完・デバッグ・変換・セキュリティスキャンを行うAIコーディングアシスタント（IDE・AWSコンソール統合）\nQ in Amazon QuickSight: BIダッシュボードのNL2SQL（自然言語からSQLを生成して自動でグラフを作成）', tags: ['Q Business', 'Q Developer', 'NL2SQL'] , seeAlso: ['S3']},
      ],
    },
  ],

  ANS: [
    {
      title: 'VPC詳細',
      items: [
        { name: 'VPC設計', desc: 'CIDRブロック（IPアドレス範囲）の設計が基本。\nプライベートアドレス空間: 10.0.0.0/8 / 172.16.0.0/12 / 192.168.0.0/16 の3範囲\nサブネット分割: VPCの/16 CIDR → AZごとに/24サブネット等に分割してパブリック/プライベートに分ける\nセカンダリCIDR: VPCに後からCIDRを追加追加して既存サブネットと合わせて使用できる\nIPv6: VPCに/56を割り当て、サブネットに/64を割り当てるデュアルスタック構成', keyword: 'VPC CIDR サブネット設計 IPv6', tags: ['CIDR設計', 'IPv6', 'セカンダリCIDR'] , seeAlso: ['VPC']},
        { name: 'セキュリティグループ vs NACL', desc: 'SG（セキュリティグループ）:\nステートフル: 戻りパケットは自動的に許可\nENI（ネットワークインターフェース）に適用\n全ルールを評価してからアクションを決定\nNACL（ネットワークアクセスコントロールリスト）:\nステートレス: 行き・戻りを両方明示的に許可が必要\nサブネット境界に適用\n番号が小さいルールから順に評価して最初にマッチしたルールを適用', keyword: 'セキュリティグループ NACL ステートフル ステートレス 違い', tags: ['ステートフル', 'ステートレス', '評価順序'] },
        { name: 'VPCフローログ', desc: 'VPC内のENI（ネットワークインターフェース）を通過するIPトラフィックを記録するログ機能。\n取得レベル: ENI単位 / サブネット単位 / VPC単位\n送信先: CloudWatch Logs または S3\nカスタムフォーマット: 送信元IP・宛先IP・ポート・プロトコル・許可/拒否等に加えて追加フィールド（pkt-src-aws-service等）を選択できる\nネットワークトラブルシューティング・セキュリティ分析に活用', tags: ['フローログ', 'カスタムフォーマット', 'トラブルシュート'] , seeAlso: ['CloudWatch', 'CloudWatch Logs', 'S3', 'VPC']},
        { name: 'VPCトラフィックミラーリング', desc: 'ENIのインバウンド/アウトバウンドトラフィックをコピーして別のENI（モニタリングアプライアンス）に転送する機能。\nDPI（Deep Packet Inspection）: パケットの内容まで詳しく検査してセキュリティ分析や侵入検知に活用できる。\nミラーフィルター: 特定のプロトコル・ポート・方向のみミラーリングするようフィルタを設定できる', tags: ['ミラーリング', 'DPI', 'ネットワーク分析'] },
        { name: 'PrivateLink / VPC Endpoint', desc: 'AWSサービスや他アカウントのサービスへインターネットを経由せずプライベートにアクセスする仕組み。\nInterface Endpoint（PrivateLink）: ENI（プライベートIP）をVPC内に作成して接続。ほぼ全AWSサービスに対応。サービスプロバイダー側がVPC Endpoint Serviceを作成して自分のサービスをPrivateLinkで公開することもできる\nGateway Endpoint: S3・DynamoDB専用の無料エンドポイント。ルートテーブルでターゲットを指定して制御\nANS観点: エンドポイントポリシー・DNS解決（enableDnsSupport）・オンプレ→Interface Endpoint（Direct Connect経由）のアクセスパターンが重要', keyword: 'PrivateLink VPC Endpoint Interface Endpoint Gateway Endpoint VPC Endpoint Service エンドポイントポリシー VPC設計 Route 53 Resolver（ハイブリッドDNS） Transit Gateway（ANS観点）', tags: ['Interface Endpoint', 'Gateway Endpoint', 'エンドポイントポリシー'], seeAlso: ['VPC設計', 'Direct Connect（ANS詳細）', 'Route 53 Resolver（ハイブリッドDNS）', 'Transit Gateway（ANS観点）'] },      ],
    },
    {
      title: '接続・ルーティング',
      items: [
        { name: 'Transit Gateway（ANS観点）', desc: 'TGWルートテーブル: アタッチメント（VPC/VPN/DC）ごとにルーティングを制御。同一ルートテーブルに関連付けないと通信不可\n分離ルーティング: 本番VPCと開発VPCを別ルートテーブルに入れて相互通信を禁止する設計\nTGWピアリング: 別リージョンのTGWとピアリングしてマルチリージョン接続\nVPN/Direct Connectアタッチメントも統合して中央集権的なハブを実現', tags: ['TGWルートテーブル', 'リージョン間', 'アタッチメント'] , seeAlso: ['Direct Connect', 'VPC']},
        { name: 'Direct Connect（ANS詳細）', desc: 'Direct Connect接続の種類:\nホスト型: Direct Connectパートナー経由。1/10Gbps等の共有帯域\n専用型: AWSのDirect Connect施設に直接接続。1/10/100Gbpsの専用回線\nVIF（Virtual Interface: 仮想インターフェース）の種別:\nプライベートVIF: VPCのプライベートリソースへ接続（VGWまたはTGWに接続）\nパブリックVIF: S3・DynamoDB等のAWSパブリックエンドポイントへ接続\nトランジットVIF: Transit Gateway経由で複数VPCへ接続', tags: ['ホスト型', '専用型', 'VIF'] , seeAlso: ['Direct Connect', 'DynamoDB', 'S3', 'VPC']},
        { name: 'Direct Connect 冗長化', desc: 'Direct Connectの冗長性レベル（AWS推奨）:\n最大冗長性: 2つのDirect Connectロケーション × 2接続 = 4接続。シングルポイント障害なしの最高冗長\n高冗長性: 2つのロケーション × 1接続 = 2接続。ロケーション障害に耐性あり\n開発/テスト用: 1接続のみ。冗長性なし。本番では非推奨', tags: ['最大冗長性', '高冗長性', 'HA'] , seeAlso: ['Direct Connect']},
        { name: 'Site-to-Site VPN', desc: 'オンプレとAWS VPCをインターネット経由のIPsec暗号化トンネルで接続。\nCGW（カスタマーゲートウェイ）: オンプレ側のVPN機器を定義するAWSリソース\nVGW（仮想プライベートゲートウェイ）: VPCにアタッチするAWS側のVPNエンドポイント\nBGP動的ルーティング: ルートを自動的に交換・フェイルオーバー\n加速VPN（Accelerated VPN）: AWSグローバルアクセラレーターでバックボーン経由の高速接続', tags: ['CGW', 'VGW', '加速VPN'] , seeAlso: ['VPC']},
        { name: 'Client VPN', desc: 'リモートワーカーのPCからAWS VPCへのOpenVPNプロトコルによるVPN接続サービス。\n認証方式:\n相互TLS認証: クライアント証明書とACM証明書で認証\nActive Directory認証: AWS Managed Microsoft ADと連携\nSAML（IdP）認証: OktaやAzure ADなどのSAML 2.0準拠IdPと連携\nスプリットトンネリング: VPC宛のトラフィックのみVPN経由にしてインターネットトラフィックは直接送信（帯域節約）', tags: ['相互TLS', 'AD認証', 'スプリットトンネル'] , seeAlso: ['VPC']},
      ],
    },
    {
      title: 'DNS・コンテンツ配信',
      items: [
        { name: 'Route 53詳細', desc: '7種類のルーティングポリシーを状況に応じて使い分ける（詳細はSAAの Route 53 ルーティング参照）。\nDNSSEC: DNS応答にデジタル署名を付加してDNSキャッシュポイズニング攻撃を防止する仕組み\nResolver DNS Firewall: 悪意のあるドメイン（C2サーバー・マルウェア配布元）へのDNS解決をブロックする機能', tags: ['DNSSEC', 'Resolver', 'DNS Firewall'] , seeAlso: ['Route 53', 'Route 53 ルーティング']},
        { name: 'Route 53 Resolver（ハイブリッドDNS）', desc: 'オンプレとAWS間のDNS名前解決を統合するサービス。\nインバウンドエンドポイント: オンプレのDNSサーバーからAWS（VPC）のDNSを解決できるようにする\n→ オンプレのサーバーがec2.internal等のAWSのホスト名を解決したい場合\nアウトバウンドエンドポイント: VPC内からオンプレのプライベートDNS（example.internal等）を解決できるようにする\n→ AWS上のアプリがオンプレのDBサーバー名を解決したい場合', tags: ['インバウンド', 'アウトバウンド', 'ハイブリッドDNS'] , seeAlso: ['VPC']},
        { name: 'CloudFront詳細（ANS）', desc: 'Origins: S3 / ALB / EC2 / カスタムHTTPサーバー を配信元として設定\nビヘイビア: URLパスパターン（/api/*・/images/*等）ごとにオリジン・キャッシュ・関数を個別設定\nOAC（Origin Access Control）: S3バケットをCloudFront経由アクセス専用に制限する仕組み\nLambda@Edge: CloudFrontの4つのイベント（Viewer Request/Response・Origin Request/Response）でLambdaを実行\nField-Level暗号化: 機密フィールド（クレカ番号等）をエッジで非対称暗号化してバックエンドまで保護', tags: ['OAC', 'Lambda@Edge', 'Field-Level暗号化'] , seeAlso: ['CloudFront', 'EC2', 'Lambda', 'S3']},
        { name: 'Global Accelerator', desc: 'Anycast IP（複数拠点が同一IPを持つ技術）でユーザーを自動的に最寄りのAWSエッジポイントに誘導し、AWSバックボーン経由でエンドポイントに転送。\nエンドポイントグループ: リージョンごとにリソース（ALB・EC2等）をグループ化\nトラフィックダイヤル: グループへのトラフィック割合を0〜100%で調整（Blue/Greenデプロイに活用）', tags: ['Anycast', 'エンドポイントグループ', 'トラフィックダイヤル'] , keyword: 'CloudFront', seeAlso: ['CloudFront', 'EC2']},      ],
    },
    {
      title: 'セキュリティ・監視',
      items: [
        { name: 'Network Firewall（ANS）', desc: 'VPCに集中型ファイアウォールサブネットを作成してデプロイするマネージドIPS/IDS（侵入防止/検知システム）。\nSuricata互換エンジン: オープンソースのSuricataルール形式でL7アプリケーション層のトラフィックを詳細検査\nステートフルルール: 接続状態を追跡しながら深い検査\nステートレスルール: パケット単位の高速フィルタリング\n集中型アーキテクチャ: TGW経由で全VPCのトラフィックを集中ファイアウォールに通す設計が推奨', tags: ['Suricata', 'L7フィルタ', '集中型'] , seeAlso: ['VPC']},
        { name: 'WAF（ANS観点）', desc: 'WebアプリのL7（アプリ層）攻撃を防御するWebアプリケーションファイアウォール。\nAWS管理ルールグループ: IPレピュテーションリスト（既知の悪意IPをブロック）/ Amazonマネージドルール（OWASPトップ10攻撃）\nBot Control: ボットのスクレイピング・スキャン・ログイン試行を検出・ブロック\nCAPTCHA: 疑わしいリクエストに対してチャレンジを要求\nジオブロッキング: 特定の国・地域からのアクセスをブロック', tags: ['管理ルールグループ', 'Bot Control', 'CAPTCHA'] },
        { name: 'Shield Advanced', desc: '有料のDDoS高度保護サービス。L3（IP層）〜L7（アプリ層）のDDoS攻撃を包括的に保護。\nSRT（Shield Response Team）: AWSのDDoS専門チームへ24時間365日アクセスして攻撃への対応サポートを受けられる\nヘルスベースDDoS検出: CloudWatchのヘルスチェックと連動して正常時のベースラインから検出\nコスト保護: DDoS攻撃起因のEC2・CloudFront・Route 53等のスパイクコストを保護', tags: ['SRT', 'L3-L7保護', 'コスト保護'] , seeAlso: ['CloudFront', 'CloudWatch', 'EC2', 'Route 53', 'Shield']},
        { name: 'Firewall Manager', desc: 'AWS Organizations全体で複数のセキュリティサービスのポリシーを一元管理して強制適用するサービス。\n管理対象: WAF / Shield Advanced / Network Firewall / セキュリティグループ / Route 53 Resolver DNS Firewall\n新しいリソースが作成された際に自動的にポリシーを適用する「自動適用」機能が重要', tags: ['一元管理', '自動適用', 'Organizations'] , seeAlso: ['AWS Organizations', 'Network Firewall', 'Route 53', 'Shield', 'Shield Advanced', 'WAF']},
        { name: 'VPCフローログ分析', desc: 'VPCフローログを分析ツールと組み合わせてネットワークトラフィックを可視化する。\nAthena: S3に保存したフローログをSQLでアドホッククエリ（特定IPへの通信量を集計等）\nCloudWatch Logs Insights: リアルタイムに近い分析。メトリクスフィルターでアラームにも使用可能\nAmazon OpenSearch: Kibanaダッシュボードでリアルタイム可視化・異常検知', tags: ['Athena', 'Logs Insights', 'OpenSearch'] , seeAlso: ['Athena', 'CloudWatch', 'CloudWatch Logs', 'S3', 'VPC', 'VPCフローログ']},
        { name: 'Gateway Load Balancer（GWLB）', desc: 'サードパーティのネットワーク仮想アプライアンス（IDS/IPS・ファイアウォール・DPI等）をインラインで透過的に挿入するロードバランサー。\nGWLBエンドポイント（GWLBe）をルートテーブルのネクストホップに設定し、トラフィックをアプライアンスに通してから宛先へ転送するBump-in-the-wire構成。\nアプライアンスをAuto Scalingして高可用性と水平スケールを両立できる。', keyword: 'Gateway Load Balancer GWLB GWLBe アプライアンス IDS IPS インライン検査 Bump-in-the-wire Network Firewall（ANS） VPC設計 Firewall Manager', tags: ['インライン検査', 'アプライアンス', 'GWLB'], seeAlso: ['Network Firewall（ANS）', 'VPC設計', 'Firewall Manager'] },      ],
    },
  ],

  SCS: [
    {
      title: '脅威検出・インシデント対応',
      items: [
        { name: 'GuardDuty', desc: '複数のデータソースを機械学習と脅威インテリジェンスフィードで分析して脅威を自動検出するサービス。\n分析対象: CloudTrail（APIコール）/ VPCフローログ（ネットワーク）/ DNSログ / S3データイベント / EKS監査ログ\n検出例: EC2のポートスキャン・クレデンシャルの外部漏洩・S3への不正アクセス・マイニングマルウェア\nEventBridge → Lambda で自動隔離・SNS通知のパターンが頻出', tags: ['脅威検出', '機械学習', '自動修復'], keyword: 'Inspector Security Hub Detective Organizations', seeAlso: ['Inspector', 'Security Hub', 'Detective', 'CloudTrail', 'EC2', 'EventBridge', 'Lambda', 'Organizations', 'S3', 'SNS', 'VPC', 'VPCフローログ'] },        { name: 'Macie', desc: 'S3バケット内の機密データを機械学習で自動検出・分類するデータセキュリティサービス。\n検出対象: PII（Personally Identifiable Information: 個人識別情報）/ 認証情報 / 金融データ / 医療情報\nバケットの公開設定ミス（パブリックアクセスが開いているバケット）も検出して通知\nGDPR・HIPAAなどのコンプライアンス対応に活用される', tags: ['PII検出', 'S3スキャン', 'データ分類'] , seeAlso: ['S3']},
        { name: 'Detective', desc: 'GuardDuty・CloudTrail・VPCフローログのデータからグラフデータモデル（振る舞いグラフ）を自動構築してセキュリティインシデントを視覚的に調査・分析するサービス。\n「このEC2インスタンスへの不審な接続はどこから来ているか？」「このIAMユーザーはどのリソースにアクセスしたか？」という調査クエリに素早く回答できる。', tags: ['グラフ分析', 'インシデント調査', '可視化'], seeAlso: ['GuardDuty', 'CloudTrail', 'EC2', 'IAM', 'VPC', 'VPCフローログ'] },
        { name: 'Incident Manager', desc: 'Systems Managerの機能でインシデントを体系的に管理するサービス。\nフロー: インシデント検出（CloudWatchアラーム等） → 対応計画（Response Plan）の自動起動 → Runbook（対応手順）の実行 → エスカレーション（担当者通知） → PIR（Post-Incident Review: 事後分析）\nRunbook: Systems Manager Automationドキュメントで対応手順を自動実行', tags: ['対応計画', 'Runbook', 'PIR'] , seeAlso: ['CloudWatch', 'Systems Manager']},
        { name: 'Security Lake', desc: 'AWSと外部のセキュリティデータを一元的に収集・正規化してS3データレイクに格納するサービス。\nOCSF（Open Cybersecurity Schema Framework）: セキュリティデータの共通スキーマ規格。異なるソースのデータを統一フォーマットに変換することで横断的な分析が可能\n収集元: CloudTrail / VPCフローログ / GuardDuty / Security Hub / Route 53 / 外部SIEMツール', tags: ['OCSF', 'データ集約', 'セキュリティログ'], seeAlso: ['GuardDuty', 'Security Hub', 'CloudTrail', 'Route 53', 'S3', 'VPC', 'VPCフローログ'] },
      ],
    },
    {
      title: 'セキュリティ監視・ログ',
      items: [
        { name: 'Security Hub', desc: 'GuardDuty・Inspector・Macie・Firewall Manager等の検出結果をASFF（Amazon Security Finding Format: セキュリティ検出結果の標準形式）で集約・優先順位付けするサービス。\nコンプライアンス基準への自動チェック:\nCIS AWS Foundations Benchmark: AWSのセキュリティ設定ベースライン\nPCI DSS: クレジットカード業界のデータセキュリティ基準\nNIST 800-53: 米国政府のセキュリティフレームワーク', tags: ['ASFF', 'CIS', 'PCI DSS準拠'], keyword: 'Audit Manager', seeAlso: ['GuardDuty', 'Inspector', 'Audit Manager', 'Firewall Manager', 'Macie'] },        { name: 'CloudTrail（SCS観点）', desc: 'セキュリティ監査の中核。イベントの種類:\n管理イベント: リソースの作成・削除・IAM変更等（デフォルト有効）\nデータイベント: S3オブジェクト操作・Lambda実行等（明示的に有効化が必要）\nInsightsイベント: 異常なAPI呼び出しパターンを自動検出\nS3証跡保護: 証跡をS3に保存する場合はMFAによる削除防止・KMS暗号化・ログファイル整合性検証（改ざん検出）を有効化することが重要', tags: ['管理イベント', 'データイベント', '整合性検証'] , seeAlso: ['IAM', 'KMS', 'Lambda', 'S3']},
        { name: 'Inspector', desc: '脆弱性（セキュリティの弱点）を継続的にスキャンして優先順位付けするサービス。\nスキャン対象:\nEC2インスタンス: エージェント不要でSSMエージェント経由。OSの既知脆弱性を検出\nECRコンテナイメージ: プッシュ時に自動スキャン\nLambda関数: コードと依存パッケージの脆弱性をスキャン\nCVE（Common Vulnerabilities and Exposures）: 既知の脆弱性のIDデータベースと照合してリスクスコア（CVSS）で優先順位付け', tags: ['脆弱性スキャン', 'CVE', 'コンテナ'], keyword: 'GuardDuty Security Hub', seeAlso: ['GuardDuty', 'Security Hub', 'EC2', 'Lambda'] },        { name: 'AWS Config（SCS観点）', desc: 'リソース設定変更の継続的記録とコンプライアンス評価。\nルール評価: マネージドルール（AWS事前定義）またはカスタムルール（Lambda）でリソースの準拠状況を常時評価\nコンフォーマンスパック: 複数のConfigルールをまとめて一括適用。CIS・PCIに対応したパックが利用可能\n自動修復: ルール違反検出時にSSM Automationを起動してリソースを自動修正', tags: ['設定記録', 'ルール評価', '自動修復'] , seeAlso: ['Lambda']},
      ],
    },
    {
      title: 'インフラセキュリティ',
      items: [
        { name: 'WAF（SCS観点）', desc: 'SQLi（SQLインジェクション）/ XSS（クロスサイトスクリプティング）のブロック。\nIPレピュテーションリスト: 既知の悪意あるIPからのリクエストをブロック\nレートベースルール: 一定時間内に同一IPから閾値を超えたリクエストをブロック（DDoS軽減）\nAWSマネージドルールグループ: AWSが管理する事前定義ルールの集合\nスコープダウンステートメント: ルールが評価される対象を特定条件に絞り込んでパフォーマンスとコストを最適化', tags: ['SQLi/XSS', 'レートベース', 'スコープダウン'] },
        { name: 'Shield Advanced（SCS）', desc: 'L3（IP）〜L7（アプリ）のDDoS攻撃を包括的に保護する有料サービス。\nSRT（Shield Response Team）: AWSのDDoS専門エンジニアチームに24時間アクセスして攻撃対応サポートを受けられる\nプロアクティブエンゲージメント: SRTがヘルスチェック異常を検知したら自動的に顧客に連絡してサポートを開始する設定\nコスト保護: DDoS攻撃によるEC2・CloudFront等のスケールアウトコストをAWSが補填', tags: ['SRT', 'プロアクティブ', 'コスト保護'] , seeAlso: ['CloudFront', 'EC2', 'Shield']},
        { name: 'Network Firewall + Firewall Manager', desc: '多層防御（Defense in Depth）を実現する組み合わせ。\nNetwork Firewall: VPCに集中型ファイアウォールをデプロイ。Suricata互換エンジンでL7まで詳細検査\nFirewall Manager: AWS Organizations全体にNetwork Firewallポリシーを一元配布して強制適用\n→ セキュリティポリシーを組織全体で均一に適用でき、新規リソースにも自動適用される', tags: ['多層防御', 'Suricata', '一元配布'] , seeAlso: ['AWS Organizations', 'Firewall Manager', 'Network Firewall', 'VPC']},
        { name: 'ACM Private CA（プライベート認証局）', desc: 'プライベートPKI（Public Key Infrastructure: 公開鍵基盤）を構築して内部サービス・デバイス向けのTLS証明書を発行するサービス。\nインターネット向けの公開証明書ではなく、社内マイクロサービス間・VPN・IoTデバイス等の内部TLS通信に使用する。ACMと統合して証明書の自動更新を管理できる。', tags: ['プライベートCA', 'PKI', 'TLS'] },
      ],
    },
    {
      title: 'IAM・アイデンティティ',
      items: [
        { name: 'IAM高度な管理', desc: 'Permissions Boundary（アクセス許可の境界）: IAMエンティティが持てる権限の最大上限を設定するポリシー。IAM許可とのAND評価\nセッションポリシー: AssumeRoleで取得した一時認証情報のセッションにさらに制限を加えるポリシー\nSCP（サービスコントロールポリシー）: Organizations OU/アカウントへの最大権限制限（ガードレール）\nRCP（リソースコントロールポリシー）: S3・KMS等のリソース側への横断的アクセス制限。SCP と組み合わせて使用\n優先順位: 明示的Deny > SCP > RCP > Permissions Boundary > IAMポリシー', keyword: 'IAM Permissions Boundary SCP RCP セッションポリシー', tags: ['Permission Boundary', 'SCP', 'RCP'] , seeAlso: ['IAM', 'KMS', 'Organizations', 'S3']},
        { name: 'IAM Identity Center（SSO）', desc: '複数のAWSアカウントとSaaSアプリへのシングルサインオン（SSO）を一元管理するサービス。\n外部IdP連携: Okta / Azure AD等のSAML 2.0準拠のIdP（アイデンティティプロバイダー）とフェデレーション\n権限セット（Permission Set）: アカウントごとに付与するIAMポリシーの集合を定義して一元管理\nSCIMプロトコルでユーザー/グループを外部ディレクトリから自動プロビジョニング', tags: ['SSO', 'SAML', '権限セット'] , seeAlso: ['IAM']},
        { name: 'Cognito詳細（SCS）', desc: 'User Pool:\nOpenID Connect（OIDC）準拠のIDプロバイダー\nJWT（JSON Web Token）形式のIDトークン・アクセストークンを発行\nMFA（多要素認証）・高度なセキュリティ機能（不審なサインインを検知・ブロック）\nIdentity Pool:\nフェデレーションされた認証情報（User Pool JWT・Google・Facebook等）をもとにSTS（Security Token Service）から一時的なAWS認証情報を払い出す\nロールマッピングで認証済み/未認証ユーザーに異なるIAMロールを割り当て', tags: ['OIDC', 'JWT', '高度なセキュリティ'] , seeAlso: ['IAM']},
        { name: 'Organizations SCP/RCP', desc: 'SCP（サービスコントロールポリシー）: アカウント/OUが持てる最大権限の上限を設定\n→ IAMの許可とのAND評価。SCPが許可していないとIAMで許可しても実行できない\nRCP（リソースコントロールポリシー）: S3・KMS・SQS等のリソース側にOrganizations横断で制限を適用\n→ 「このS3バケットにはOrganization外からのアクセスを禁止」といった制御が可能\n2つのアプローチ:\nDenyリスト方式: 全てを許可してから禁止事項を明示（デフォルト）\n許可リスト方式: 全てを禁止してから許可事項を明示（より厳格）', keyword: 'AWS Organizations SCP RCP サービスコントロールポリシー', tags: ['SCP', 'RCP', 'Denyリスト'] , seeAlso: ['AWS Organizations', 'IAM', 'KMS', 'S3', 'SQS']},
      ],
    },
    {
      title: 'データ保護',
      items: [
        { name: 'KMS詳細', desc: 'キーポリシー（リソースベースポリシー）: KMSキーへのアクセスを定義。IAMポリシーとのAND評価\nマルチリージョンキー: 同一のキーIDを複数リージョンでレプリケーション。リージョン間で暗号化したデータを別リージョンで復号可能\nXKS（External Key Store）: AWS外部のHSM（ハードウェアセキュリティモジュール）でキーを管理して規制要件を満たす\nエンベロープ暗号化: DEK（Data Encryption Key）でデータを暗号化し、DEK自体をCMKで暗号化する2層構造', keyword: 'AWS KMS キーポリシー マルチリージョンキー エンベロープ暗号化', tags: ['キーポリシー', 'マルチリージョンキー', 'XKS'] , seeAlso: ['IAM', 'KMS']},
        { name: 'Secrets Manager', desc: 'DBパスワード・APIキー・OAuthトークン等のシークレットを安全に保管・管理するサービス。\n自動ローテーション: Lambda関数でRDS・Redshift・DocumentDB等のパスワードを定期的に自動更新（組み込みサポートあり）\nクロスアカウント共有: リソースベースポリシーで別アカウントからのアクセスを許可\nVPCエンドポイント経由: インターネットを経由せずシークレットにアクセスして安全性を高める', tags: ['自動ローテーション', 'クロスアカウント', 'VPCエンドポイント'] , keyword: 'SSM Parameter Store', seeAlso: ['Lambda', 'RDS', 'Redshift', 'SSM Parameter Store', 'VPC', 'VPCエンドポイント']},        { name: 'S3データ保護', desc: 'バケットポリシー: JSON形式でバケット・オブジェクトへのアクセスを細かく制御\nACL無効化: 推奨設定。バケットポリシーのみで一元管理するシンプルな構成\nS3ブロックパブリックアクセス: 設定ミスによる意図しない公開を防ぐ4つのブロック設定\nObject Lock（WORM: Write Once Read Many）: 一度書いたオブジェクトを一定期間変更・削除できないように保護。コンプライアンス要件に使用\nサーバーサイド暗号化:\nSSE-S3: AWSがキーを管理する最もシンプルな暗号化\nSSE-KMS: KMSキーを使用。アクセスログとキーポリシーで細かい制御が可能\nSSE-C: 顧客がキーを管理してAWS側には渡さない（最高の機密性）', keyword: 'S3 Object Lock WORM SSE-KMS バケットポリシー', tags: ['Object Lock', 'WORM', 'SSE-KMS'] , seeAlso: ['KMS', 'S3']},
        { name: 'Audit Manager', desc: 'AWSの利用状況から証拠を自動収集して、コンプライアンスフレームワークへの準拠状況をレポート化するサービス。\n対応フレームワーク: PCI DSS / HIPAA / GDPR / ISO 27001 / NIST 等\n証拠収集: Config・CloudTrail・Security Hub・IAM等からデータを自動取得してフレームワーク要件にマッピング\n監査担当者に証拠レポートを提出するまでのプロセスを簡素化する', tags: ['コンプライアンス', 'PCI DSS', '証拠収集'] , seeAlso: ['CloudTrail', 'IAM', 'Security Hub']},
      ],
    },
  ],
};

// ── レベル定義（ExamSelectOverlay と同じ構成） ─────────────────
const EXAM_LEVELS = [
  { key: 'Practitioner', color: '#6b9e3a', exams: ['CLF', 'AIF'] },
  { key: 'Associate',    color: '#006CE0', exams: ['SAA', 'DVA', 'SOA', 'DEA', 'MLA'] },
  { key: 'Professional', color: '#8b5cf6', exams: ['SAP', 'DOP', 'AIP'] },
  { key: 'Specialty',    color: '#0ea5e9', exams: ['ANS', 'SCS'] },
] as const;

type LevelKey = typeof EXAM_LEVELS[number]['key'];

function levelOf(exam: string): LevelKey {
  return (EXAM_LEVELS.find(l => (l.exams as readonly string[]).includes(exam))?.key ?? 'Associate') as LevelKey;
}

// ── コンポーネント ────────────────────────────────────────────
export default function CheatSheet() {
  const { lang: _lang } = useLanguage();
  const { user, loading } = useAuth();
  const [activeLevel, setActiveLevel] = useState<LevelKey>('Associate');
  const [selectedExam, setSelectedExam] = useState<string>('SAA');
  const [search, setSearch] = useState('');
  const [goalInit, setGoalInit] = useState(false);
  const [copiedTerm, setCopiedTerm] = useState<string | null>(null);
  const [pendingScrollTo, setPendingScrollTo] = useState<string | null>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);

  function handleTermCopy(term: string) {
    navigator.clipboard.writeText(term);
    setCopiedTerm(term);
    setTimeout(() => setCopiedTerm(null), 1500);
  }

  function navigateToItem(name: string) {
    setSearch('');
    let targetExam: string | null = null;
    outer: for (const [exam, secs] of Object.entries(CHEAT_DATA)) {
      for (const sec of secs) {
        if (sec.items.some(it => it.name === name)) {
          targetExam = exam;
          break outer;
        }
      }
    }
    if (!targetExam) return;
    if (targetExam !== selectedExam) {
      const lv = levelOf(targetExam) as LevelKey;
      setActiveLevel(lv);
      setSelectedExam(targetExam);
    }
    setPendingScrollTo(name);
  }

  useEffect(() => {
    const container = document.getElementById('main-scroll');
    if (!container) return;
    const onScroll = () => setShowScrollTop(container.scrollTop > 300);
    container.addEventListener('scroll', onScroll, { passive: true });
    return () => container.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!pendingScrollTo) return;
    const el = document.querySelector(`[data-item-name="${pendingScrollTo.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setPendingScrollTo(null);
    }
  }, [selectedExam, pendingScrollTo]);

  useEffect(() => {
    if (loading || goalInit) return;
    setGoalInit(true);
    if (user?.userId) {
      const goal = localStorage.getItem(`targetExam_${user.userId}`);
      if (goal && CHEAT_DATA[goal]) {
        const lv = levelOf(goal) as LevelKey;
        setActiveLevel(lv);
        setSelectedExam(goal);
      }
    }
  }, [user, loading, goalInit]);

  const examColor = EXAM_LEVEL_COLORS[EXAM_LEVEL[selectedExam]] ?? 'var(--color-primary)';
  const levelColor = EXAM_LEVELS.find(l => l.key === activeLevel)?.color ?? examColor;
  const sections = CHEAT_DATA[selectedExam] ?? [];
  const currentLevelExams = EXAM_LEVELS.find(l => l.key === activeLevel)?.exams ?? [];

  const q = search.trim().toLowerCase();

  const filteredSections = useMemo(() => {
    if (!q) return sections;
    return sections
      .map(sec => ({
        ...sec,
        items: sec.items.filter(item =>
          item.name.toLowerCase().includes(q) ||
          item.desc.toLowerCase().includes(q) ||
          (item.keyword && item.keyword.toLowerCase().includes(q)) ||
          item.tags.some(t => t.toLowerCase().includes(q))
        ),
      }))
      .filter(sec => sec.items.length > 0);
  }, [sections, q]);

  const totalHits = filteredSections.reduce((s, sec) => s + sec.items.length, 0);

  // 全試験横断検索
  const allExamsSearchResults = useMemo(() => {
    if (!q) return [];
    const results: Array<{ exam: string; items: Item[] }> = [];
    for (const [exam, secs] of Object.entries(CHEAT_DATA)) {
      const matched: Item[] = [];
      for (const sec of secs) {
        for (const item of sec.items) {
          if (
            item.name.toLowerCase().includes(q) ||
            item.desc.toLowerCase().includes(q) ||
            (item.keyword && item.keyword.toLowerCase().includes(q)) ||
            item.tags.some(t => t.toLowerCase().includes(q))
          ) {
            matched.push(item);
          }
        }
      }
      if (matched.length > 0) results.push({ exam, items: matched });
    }
    return results;
  }, [q]);

  const allExamsTotalHits = allExamsSearchResults.reduce((s, g) => s + g.items.length, 0);

  function selectExam(exam: string) {
    setSelectedExam(exam);
    setSearch('');
  }

  function selectLevel(lv: LevelKey) {
    setActiveLevel(lv);
    const lvDef = EXAM_LEVELS.find(l => l.key === lv);
    const first = lvDef?.exams.find(e => CHEAT_DATA[e]) ?? lvDef?.exams[0];
    if (first) selectExam(first);
  }

  return (
    <PageLayout maxWidth={860}>
      <Helmet>
        <title>チートシート | 無限ノック</title>
        <meta name="description" content="AWS認定試験ごとの代表的サービス・機能・概念を試験前の見直し用にまとめたチートシート。" />
      </Helmet>

      {/* 検索バー（最上部） */}
      <div style={{ position: 'relative', marginBottom: 'var(--spacing-sm)' }}>
        <div style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-light)', display: 'flex', pointerEvents: 'none' }}>
          <IconSearch />
        </div>
        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="全資格を横断検索（サービス名・キーワード）"
          style={{
            width: '100%',
            boxSizing: 'border-box',
            padding: '8px 12px 8px 34px',
            borderRadius: 'var(--border-radius-full)',
            border: '1.5px solid var(--color-border)',
            background: 'var(--color-bg-white)',
            color: 'var(--color-text-main)',
            fontSize: 'var(--font-size-sm)',
            outline: 'none',
          }}
        />
      </div>

      {/* レベルタブ */}
      <div style={{ display: 'flex', borderBottom: '2px solid var(--color-border)', marginBottom: 0 }}>
        {EXAM_LEVELS.map(({ key, color }) => (
          <button
            key={key}
            onClick={() => selectLevel(key as LevelKey)}
            style={{
              padding: '10px 14px',
              background: 'none', border: 'none', cursor: 'pointer',
              borderBottom: activeLevel === key ? `2px solid ${color}` : '2px solid transparent',
              marginBottom: -2,
              color: activeLevel === key ? color : 'var(--color-text-sub)',
              fontWeight: activeLevel === key ? 700 : 400,
              fontSize: 'var(--font-size-sm2)',
              whiteSpace: 'nowrap', flexShrink: 0,
              transition: 'all 0.15s',
            }}
          >
            {key}
          </button>
        ))}
      </div>

      {/* 試験カード（横スクロール） */}
      <div style={{ display: 'flex', gap: 10, padding: '14px 0', overflowX: 'auto', flexShrink: 0 }}>
        {currentLevelExams.filter(e => CHEAT_DATA[e]).map(exam => {
          const isSelected = selectedExam === exam;
          const EIcon = EXAM_ICON_COMPONENTS[exam];
          return (
            <button
              key={exam}
              onClick={() => selectExam(exam)}
              style={{
                flexShrink: 0, width: 80, padding: '10px 6px 8px', cursor: 'pointer',
                borderRadius: 10, textAlign: 'center',
                border: `2px solid ${isSelected ? levelColor : 'var(--color-border)'}`,
                background: isSelected
                  ? `linear-gradient(145deg, ${levelColor}, ${levelColor}bb)`
                  : 'var(--color-bg-white)',
                color: isSelected ? '#fff' : 'var(--color-text-sub)',
                transition: 'all 0.15s',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4, opacity: isSelected ? 1 : 0.6 }}>
                {EIcon ? <EIcon size={20} /> : null}
              </div>
              <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 700 }}>{exam}</div>
            </button>
          );
        })}
      </div>

      {/* 用語コピーヒント */}
      {!q && (
        <p style={{ fontSize: 'var(--font-size-xs)', color: '#009E9E', marginBottom: 'var(--spacing-sm)', marginTop: 'calc(var(--spacing-xs) * -1)' }}>
          色付き太字の用語はタップしてコピーできます（検索向けに文脈補足が付く場合あり）
        </p>
      )}

      {/* 全試験横断検索結果 */}
      {q && (
        <>
          <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-sub)', marginBottom: 'var(--spacing-sm)' }}>
            全資格: 「{search}」 {allExamsTotalHits} 件
          </p>
          {allExamsTotalHits === 0 && (
            <p style={{ color: 'var(--color-text-light)', fontSize: 'var(--font-size-sm)', textAlign: 'center', padding: 'var(--spacing-xl)' }}>
              該当するサービス・概念が見つかりませんでした
            </p>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
            {allExamsSearchResults.map(({ exam, items }) => {
              const ec = EXAM_LEVEL_COLORS[EXAM_LEVEL[exam]] ?? 'var(--color-primary)';
              const EIcon = EXAM_ICON_COMPONENTS[exam];
              return (
                <div key={exam}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    marginBottom: 'var(--spacing-sm)',
                    paddingBottom: 6,
                    borderBottom: `2px solid ${ec}30`,
                  }}>
                    {EIcon && <span style={{ opacity: 0.7 }}><EIcon size={14} /></span>}
                    <span style={{ fontWeight: 700, fontSize: 'var(--font-size-sm)', color: ec }}>{exam}</span>
                    <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-light)' }}>{items.length}件</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 'var(--spacing-sm)' }}>
                    {items.map(item => (
                      <ItemCard key={`${exam}-${item.name}`} item={item} q={q} onCopy={handleTermCopy} onNavigate={navigateToItem} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* 通常表示: 選択試験のセクション一覧 */}
      {!q && (
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
                  <ItemCard key={item.name} item={item} q={q} onCopy={handleTermCopy} onNavigate={navigateToItem} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {/* トップへ戻るボタン */}
      {showScrollTop && (
        <button
          onClick={() => {
            const el = document.getElementById('main-scroll');
            if (!el) return;
            const start = el.scrollTop;
            const t0 = performance.now();
            const step = (now: number) => {
              const p = Math.min((now - t0) / 200, 1);
              el.scrollTop = start * (1 - p) ** 3;
              if (p < 1) requestAnimationFrame(step);
            };
            requestAnimationFrame(step);
          }}
          title="トップへ戻る"
          style={{
            position: 'fixed',
            bottom: 80,
            right: 16,
            width: 44,
            height: 44,
            borderRadius: '50%',
            border: '1px solid var(--color-border)',
            background: 'var(--color-bg-white)',
            boxShadow: 'var(--box-shadow-md)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            color: 'var(--color-text-main)',
          }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m18 15-6-6-6 6"/>
          </svg>
        </button>
      )}
      {/* コピー完了トースト */}
      {copiedTerm !== null && (
        <div style={{
          position: 'fixed',
          bottom: 80,
          left: '50%',
          transform: 'translateX(-50%)',
          background: '#009E9E',
          color: '#fff',
          padding: '8px 20px',
          borderRadius: 'var(--border-radius-full)',
          fontSize: 'var(--font-size-sm)',
          fontWeight: 600,
          boxShadow: 'var(--box-shadow-md)',
          zIndex: 9999,
          pointerEvents: 'none',
          whiteSpace: 'nowrap',
        }}>
          コピーしました
        </div>
      )}
    </PageLayout>
  );
}

function ItemCard({ item, q, onCopy, onNavigate }: { item: Item; q: string; onCopy: (term: string) => void; onNavigate: (name: string) => void }) {
  const [allCopied, setAllCopied] = useState(false);
  const handleCopyAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(`${item.name}\n\n${item.desc}`).then(() => {
      setAllCopied(true);
      setTimeout(() => setAllCopied(false), 1500);
    });
  };

  const highlight = (text: string): React.ReactNode => {
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
    <div
      data-item-name={item.name}
      style={{
        background: 'var(--color-bg-white)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--border-radius-md)',
        padding: '10px 12px',
        boxShadow: 'var(--box-shadow-sm)',
      }}
    >
      <div style={{ marginBottom: 4, display: 'flex', alignItems: 'flex-start', gap: 'var(--spacing-xs)' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {(/[A-Za-z]/.test(item.name) || /[゠-ヿ]{5,}/.test(item.name)) ? (
            <div
              onClick={() => onCopy(item.keyword ?? item.name.replace(/[（(][^）)]*[）)]/g, '').trim())}
              title="タップしてコピー"
              style={{ fontWeight: 700, fontSize: 'var(--font-size-base)', color: '#009E9E', cursor: 'pointer' }}
            >
              {highlight(item.name)}
            </div>
          ) : (
            <div style={{ fontWeight: 700, fontSize: 'var(--font-size-base)', color: 'var(--color-text-main)' }}>
              {highlight(item.name)}
            </div>
          )}
        </div>
        <button
          onClick={handleCopyAll}
          title={allCopied ? 'コピー済み' : '記事全体をコピー（AI質問用）'}
          style={{
            flexShrink: 0,
            background: 'none',
            border: `1.5px solid ${allCopied ? 'var(--color-success)' : 'var(--color-border)'}`,
            borderRadius: '50%',
            width: 28, height: 28,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
            color: allCopied ? 'var(--color-success)' : 'var(--color-text-light)',
            transition: 'all 0.2s',
          }}
        >
          {allCopied ? <IconCheck size={13} /> : <IconCopy size={13} />}
        </button>
      </div>
      <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)', margin: 0, lineHeight: 1.6 }}>
        {item.desc.split('\n').map((line, i) => {
          const colonIdx = line.indexOf(': ');
          const term = colonIdx > 0 ? line.slice(0, colonIdx) : '';
          // ASCII英字を含む、または5文字以上の連続カタカナを含む場合にIT用語として強調
          const isITTerm = colonIdx > 0 && (
            /[A-Za-z]/.test(term) ||
            /[゠-ヿ]{5,}/.test(term)
          );
          const copyTerm = item.termKeywords?.[term] ?? term;
          const content = isITTerm ? (
            <>
              <span
                onClick={() => onCopy(copyTerm)}
                title={copyTerm !== term ? `コピー: ${copyTerm}` : 'タップしてコピー'}
                style={{ fontWeight: 700, color: '#009E9E', cursor: 'pointer' }}
              >{highlight(term)}</span>
              {': '}
              {highlight(line.slice(colonIdx + 2))}
            </>
          ) : highlight(line);
          return (
            <React.Fragment key={i}>
              {i > 0 && <br />}
              {content}
            </React.Fragment>
          );
        })}
      </p>
      {item.seeAlso && item.seeAlso.length > 0 && (
        <div style={{ marginTop: 8, paddingTop: 6, borderTop: '1px solid var(--color-border)', display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 'var(--font-size-2xs)', color: 'var(--color-text-light)' }}>関連:</span>
          {item.seeAlso.map(name => (
            <button
              key={name}
              onClick={() => onNavigate(name)}
              style={{
                fontSize: 'var(--font-size-2xs)',
                color: '#009E9E',
                background: 'rgba(0,158,158,0.08)',
                border: '1px solid rgba(0,158,158,0.25)',
                borderRadius: 'var(--border-radius-full)',
                padding: '1px 8px',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >→ {name}</button>
          ))}
        </div>
      )}
    </div>
  );
}
