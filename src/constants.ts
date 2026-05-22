export const API_ENDPOINT = 'https://a0q3656qw4.execute-api.ap-northeast-1.amazonaws.com/dev';

export const ADMIN_EMAIL = 'mugenknock@gmail.com';

export const EXAM_TYPES = ['CLF', 'SAA', 'SAP', 'DVA', 'SOA', 'DEA', 'DOP', 'AIF', 'MLA', 'GAI', 'ANS', 'SCS', 'MLS'] as const;
export type ExamType = typeof EXAM_TYPES[number];

// 合格スコア（スケールスコア 100〜1000 での公式合格ライン）
export const PASS_SCORES: Record<string, number> = {
  CLF: 700,
  SAA: 720,
  SAP: 750,
  DVA: 720,
  SOA: 720,
  DEA: 720,
  DOP: 750,
  AIF: 700,
  MLA: 720,
  GAI: 750,
  ANS: 700,
  SCS: 750,
  MLS: 750,
};

// 演習モードでの合否判定に使う正答率の目安（スケールスコアの近似値）
export const PASS_RATE: Record<string, number> = {
  CLF: 70,
  SAA: 72,
  SAP: 75,
  DVA: 72,
  SOA: 72,
  DEA: 72,
  DOP: 75,
  AIF: 70,
  MLA: 72,
  GAI: 75,
  ANS: 70,
  SCS: 75,
  MLS: 75,
};

// 試験の出題ドメイン（公式試験ガイドの表記に完全一致）
export const EXAM_DOMAINS: Record<string, string[]> = {
  CLF: ['クラウドの概念', 'セキュリティとコンプライアンス', 'クラウドのテクノロジーとサービス', '請求、料金、およびサポート'],
  SAA: ['セキュアなアーキテクチャの設計', '弾力性に優れたアーキテクチャの設計', '高性能なアーキテクチャの設計', 'コスト最適化されたアーキテクチャの設計'],
  SAP: ['組織の複雑さに対応する設計', '新しいソリューションのための設計', '既存のソリューションの継続的改善', 'ワークロードの移行とモダン化の加速'],
  DVA: ['AWSのサービスを使用した開発', 'セキュリティ', 'デプロイ', 'トラブルシューティングと最適化'],
  SOA: ['モニタリング、ロギング、分析、修復、およびパフォーマンスの最適化', '信頼性とビジネス継続性', 'デプロイ、プロビジョニング、および自動化', 'セキュリティとコンプライアンス', 'ネットワークとコンテンツ配信'],
  DOP: ['SDLC の自動化', '構成管理と Infrastructure as Code (IaC)', '弾力性に優れたクラウドソリューション', 'モニタリングとロギング', 'インシデントとイベントへの対応', 'セキュリティとコンプライアンス'],
  AIF: ['AIとMLの基礎', '生成AIの基礎', '基盤モデルのアプリケーション', '責任あるAIのガイドライン', 'AIソリューションのセキュリティ、コンプライアンス、ガバナンス'],
  MLA: ['機械学習のためのデータ準備', 'MLモデルの開発', 'MLワークフローのデプロイとオーケストレーション', 'MLソリューションの監視、メンテナンス、セキュリティ'],
  GAI: ['基盤モデルの統合、データ管理、コンプライアンス', '実装と統合', 'AIの安全性、セキュリティ、ガバナンス', '生成AIアプリケーションの運用効率と最適化', 'テスト、検証、トラブルシューティング'],
  DEA: ['データの取り込みと変換', 'データストアの管理', 'データオペレーションとサポート', 'データのセキュリティとガバナンス'],
  ANS: ['ネットワーク設計', 'ネットワーク実装', 'ネットワーク管理と運用', 'ネットワークのセキュリティ、コンプライアンス、ガバナンス'],
  SCS: ['検出', 'インシデント対応', 'インフラストラクチャのセキュリティ', 'アイデンティティとアクセス管理', 'データ保護', 'セキュリティの基盤とガバナンス'],
  MLS: ['データエンジニアリング', '探索的データ分析', 'モデリング', '機械学習の実装とオペレーション'],
};

// ドメイン名の英語対応（日本語キー → 英語表示）
export const DOMAIN_NAME_EN: Record<string, string> = {
  // CLF
  'クラウドの概念': 'Cloud Concepts',
  'セキュリティとコンプライアンス': 'Security and Compliance',
  'クラウドのテクノロジーとサービス': 'Cloud Technology and Services',
  '請求、料金、およびサポート': 'Billing, Pricing, and Support',
  // SAA
  'セキュアなアーキテクチャの設計': 'Design Secure Architectures',
  '弾力性に優れたアーキテクチャの設計': 'Design Resilient Architectures',
  '高性能なアーキテクチャの設計': 'Design High-Performing Architectures',
  'コスト最適化されたアーキテクチャの設計': 'Design Cost-Optimized Architectures',
  // SAP
  '組織の複雑さに対応する設計': 'Design for Organizational Complexity',
  '新しいソリューションのための設計': 'Design for New Solutions',
  '既存のソリューションの継続的改善': 'Continuous Improvement for Existing Solutions',
  'ワークロードの移行とモダン化の加速': 'Accelerate Workload Migration and Modernization',
  // DVA
  'AWSのサービスを使用した開発': 'Development with AWS Services',
  'セキュリティ': 'Security',
  'デプロイ': 'Deployment',
  'トラブルシューティングと最適化': 'Troubleshooting and Optimization',
  // SOA
  'モニタリング、ロギング、分析、修復、およびパフォーマンスの最適化': 'Monitoring, Logging, Analysis, Remediation, and Performance Optimization',
  '信頼性とビジネス継続性': 'Reliability and Business Continuity',
  'デプロイ、プロビジョニング、および自動化': 'Deployment, Provisioning, and Automation',
  'ネットワークとコンテンツ配信': 'Networking and Content Delivery',
  // 'セキュリティとコンプライアンス' は CLF と共通キーのため CLF 側で定義済み
  // DOP
  'SDLC の自動化': 'SDLC Automation',
  '構成管理と Infrastructure as Code (IaC)': 'Configuration Management and IaC',
  '弾力性に優れたクラウドソリューション': 'Resilient Cloud Solutions',
  'モニタリングとロギング': 'Monitoring and Logging',
  'インシデントとイベントへの対応': 'Incident and Event Response',
  // 'セキュリティとコンプライアンス' は CLF と共通キーのため CLF 側で定義済み
  // AIF
  'AIとMLの基礎': 'Fundamentals of AI and ML',
  '生成AIの基礎': 'Fundamentals of Generative AI',
  '基盤モデルのアプリケーション': 'Applications of Foundation Models',
  '責任あるAIのガイドライン': 'Guidelines for Responsible AI',
  'AIソリューションのセキュリティ、コンプライアンス、ガバナンス': 'Security, Compliance, and Governance for AI',
  // MLA
  '機械学習のためのデータ準備': 'Data Preparation for ML',
  'MLモデルの開発': 'ML Model Development',
  'MLワークフローのデプロイとオーケストレーション': 'Deployment and Orchestration of ML Workflows',
  'MLソリューションの監視、メンテナンス、セキュリティ': 'ML Solution Monitoring, Maintenance, and Security',
  // GAI (AIP-C01)
  '基盤モデルの統合、データ管理、コンプライアンス': 'Foundation Model Integration, Data Management, and Compliance',
  '実装と統合': 'Implementation and Integration',
  'AIの安全性、セキュリティ、ガバナンス': 'AI Safety, Security, and Governance',
  '生成AIアプリケーションの運用効率と最適化': 'Operational Efficiency and Optimization for GenAI Applications',
  'テスト、検証、トラブルシューティング': 'Testing, Validation, and Troubleshooting',
  // DEA
  'データの取り込みと変換': 'Data Ingestion and Transformation',
  'データストアの管理': 'Data Store Management',
  'データオペレーションとサポート': 'Data Operations and Support',
  'データのセキュリティとガバナンス': 'Data Security and Governance',
  // ANS
  'ネットワーク設計': 'Network Design',
  'ネットワーク実装': 'Network Implementation',
  'ネットワーク管理と運用': 'Network Management and Operation',
  'ネットワークのセキュリティ、コンプライアンス、ガバナンス': 'Network Security, Compliance, and Governance',
  // SCS
  '検出': 'Detection',
  'インシデント対応': 'Incident Response',
  'インフラストラクチャのセキュリティ': 'Infrastructure Security',
  'アイデンティティとアクセス管理': 'Identity and Access Management',
  'データ保護': 'Data Protection',
  'セキュリティの基盤とガバナンス': 'Security Foundations and Governance',
  // MLS
  'データエンジニアリング': 'Data Engineering',
  '探索的データ分析': 'Exploratory Data Analysis',
  'モデリング': 'Modeling',
  '機械学習の実装とオペレーション': 'ML Implementation and Operations',
};

// 試験レベル表示
export const EXAM_LEVEL: Record<string, string> = {
  CLF: 'Foundational',
  SAA: 'Associate',
  SAP: 'Professional',
  DVA: 'Associate',
  SOA: 'Associate',
  DOP: 'Professional',
  DEA: 'Associate',
  AIF: 'Foundational',
  MLA: 'Associate',
  GAI: 'Professional',
  ANS: 'Specialty',
  SCS: 'Specialty',
  MLS: 'Specialty',
};

// 試験の説明文
export const EXAM_DESC_JA: Record<string, string> = {
  CLF: 'クラウドの基礎を問う入門レベルの認定',
  SAA: '最も人気の高いアソシエイトレベル認定',
  SAP: '高度な設計スキルを証明するプロ認定',
  DVA: 'AWSを使ったアプリケーション開発スキルを問うアソシエイト認定',
  SOA: 'AWSインフラの運用・監視・自動化・デプロイスキルを問うアソシエイト認定',
  DOP: '開発・運用の高度なスキルを証明するプロ認定',
  DEA: 'データパイプラインの実装・管理・最適化スキルを問うアソシエイト認定',
  AIF: 'AI/MLの概念とAWSサービスを幅広くカバーする入門認定',
  MLA: 'MLモデルの構築・デプロイ・運用を問うアソシエイト認定',
  GAI: 'AWSで生成AIソリューションを実装・デプロイするプロフェッショナル認定',
  ANS: 'AWSとハイブリッドネットワークの高度な設計・実装スキルを問うスペシャリティ認定',
  SCS: 'AWSクラウドのセキュリティ専門知識を証明するスペシャリティ認定',
  MLS: '機械学習のエンドツーエンドのスキルを証明するスペシャリティ認定',
};
export const EXAM_DESC_EN: Record<string, string> = {
  CLF: 'Foundational certification covering cloud basics',
  SAA: 'Most popular associate-level AWS certification',
  SAP: 'Professional certification for advanced architects',
  DVA: 'Associate certification for AWS application developers',
  SOA: 'Associate certification for AWS cloud operations, monitoring, and automation',
  DOP: 'Professional certification for DevOps engineers',
  DEA: 'Associate certification for implementing and managing data pipelines on AWS',
  AIF: 'Foundational certification covering AI/ML concepts and AWS services',
  MLA: 'Associate certification for building and operating ML solutions',
  GAI: 'Professional certification for integrating and deploying generative AI solutions on AWS',
  ANS: 'Specialty certification for advanced AWS and hybrid network architecture design',
  SCS: 'Specialty certification for AWS cloud security expertise',
  MLS: 'Specialty certification validating end-to-end machine learning skills on AWS',
};

// ドメイン正答率の色分けしきい値（0–1スケール）
export const DOMAIN_RATE_WARNING = 0.50;
export const DOMAIN_RATE_CAUTION = 0.65;

// ドメイン配点（公式試験ガイドの割合 %）
export const DOMAIN_WEIGHTS: Record<string, number[]> = {
  CLF: [24, 30, 34, 12],
  SAA: [30, 26, 24, 20],
  SAP: [26, 29, 25, 20],
  DVA: [32, 26, 24, 18],
  SOA: [20, 16, 24, 16, 24],
  DOP: [22, 17, 15, 15, 14, 17],
  DEA: [34, 26, 22, 18],
  AIF: [20, 24, 28, 14, 14],
  MLA: [28, 26, 22, 24],
  GAI: [31, 26, 20, 12, 11],
  ANS: [30, 26, 20, 24],
  SCS: [16, 14, 18, 20, 18, 14],
  MLS: [20, 24, 36, 20],
};

// 模試モードの設定
export const EXAM_CONFIGS: Record<string, {
  examCode: string;
  fullName: string;
  totalQuestions: number;
  timeLimitMin: number;
}> = {
  CLF: { examCode: 'CLF-C02', fullName: 'AWS Certified Cloud Practitioner',                       totalQuestions: 65, timeLimitMin: 90  },
  SAA: { examCode: 'SAA-C03', fullName: 'AWS Certified Solutions Architect – Associate',           totalQuestions: 65, timeLimitMin: 130 },
  SAP: { examCode: 'SAP-C02', fullName: 'AWS Certified Solutions Architect – Professional',        totalQuestions: 75, timeLimitMin: 180 },
  DVA: { examCode: 'DVA-C02', fullName: 'AWS Certified Developer – Associate',                    totalQuestions: 65, timeLimitMin: 130 },
  SOA: { examCode: 'SOA-C03', fullName: 'AWS Certified CloudOps Engineer – Associate',             totalQuestions: 65, timeLimitMin: 130 },
  DOP: { examCode: 'DOP-C02', fullName: 'AWS Certified DevOps Engineer – Professional',            totalQuestions: 75, timeLimitMin: 180 },
  DEA: { examCode: 'DEA-C01', fullName: 'AWS Certified Data Engineer – Associate',                 totalQuestions: 65, timeLimitMin: 130 },
  AIF: { examCode: 'AIF-C01', fullName: 'AWS Certified AI Practitioner',                          totalQuestions: 85, timeLimitMin: 120 },
  MLA: { examCode: 'MLA-C01', fullName: 'AWS Certified Machine Learning Engineer – Associate',    totalQuestions: 65, timeLimitMin: 130 },
  GAI: { examCode: 'AIP-C01', fullName: 'AWS Certified Generative AI Developer – Professional',   totalQuestions: 75, timeLimitMin: 170 },
  ANS: { examCode: 'ANS-C01', fullName: 'AWS Certified Advanced Networking – Specialty',           totalQuestions: 65, timeLimitMin: 170 },
  SCS: { examCode: 'SCS-C03', fullName: 'AWS Certified Security – Specialty',                     totalQuestions: 65, timeLimitMin: 170 },
  MLS: { examCode: 'MLS-C01', fullName: 'AWS Certified Machine Learning – Specialty',              totalQuestions: 65, timeLimitMin: 180 },
};
