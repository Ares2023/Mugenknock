export const API_ENDPOINT = 'https://a0q3656qw4.execute-api.ap-northeast-1.amazonaws.com/dev';

export const ADMIN_EMAIL = 'yuzuki2002110@gmail.com';

export const EXAM_TYPES = ['CLF', 'SAA', 'SAP', 'DOP', 'AIF', 'MLA', 'GAI'] as const;
export type ExamType = typeof EXAM_TYPES[number];

// 合格スコア（スケールスコア 100〜1000 での公式合格ライン）
export const PASS_SCORES: Record<string, number> = {
  CLF: 700,
  SAA: 720,
  SAP: 750,
  DOP: 750,
  AIF: 700,
  MLA: 720,
  GAI: 750,
};

// 演習モードでの合否判定に使う正答率の目安（スケールスコアの近似値）
export const PASS_RATE: Record<string, number> = {
  CLF: 70,
  SAA: 72,
  SAP: 75,
  DOP: 75,
  AIF: 70,
  MLA: 72,
  GAI: 75,
};

// 試験の出題ドメイン（公式試験ガイドの表記に完全一致）
export const EXAM_DOMAINS: Record<string, string[]> = {
  CLF: ['クラウドの概念', 'セキュリティとコンプライアンス', 'クラウドのテクノロジーとサービス', '請求、料金、およびサポート'],
  SAA: ['セキュアなアーキテクチャの設計', '弾力性に優れたアーキテクチャの設計', '高性能なアーキテクチャの設計', 'コスト最適化されたアーキテクチャの設計'],
  SAP: ['組織の複雑さに対応する設計', '新しいソリューションのための設計', '既存のソリューションの継続的改善', 'ワークロードの移行とモダン化の加速'],
  DOP: ['SDLC の自動化', '構成管理と Infrastructure as Code (IaC)', '弾力性に優れたクラウドソリューション', 'モニタリングとロギング', 'インシデントとイベントへの対応', 'セキュリティとコンプライアンス'],
  AIF: ['AIとMLの基礎', '生成AIの基礎', '基盤モデルのアプリケーション', '責任あるAIのガイドライン', 'AIソリューションのセキュリティ、コンプライアンス、ガバナンス'],
  MLA: ['機械学習のためのデータ準備', 'MLモデルの開発', 'MLワークフローのデプロイとオーケストレーション', 'MLソリューションの監視、メンテナンス、セキュリティ'],
  GAI: ['生成AIソリューションの設計と評価', '基盤モデルのカスタマイズとファインチューニング', '生成AIアプリケーションの実装とデプロイ', 'エージェントとオーケストレーションのアーキテクチャ', 'セキュリティ、ガバナンス、責任あるAI'],
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
  // GAI
  '生成AIソリューションの設計と評価': 'Design and Evaluation of Gen AI Solutions',
  '基盤モデルのカスタマイズとファインチューニング': 'Foundation Model Customization and Fine-tuning',
  '生成AIアプリケーションの実装とデプロイ': 'Build and Deploy Gen AI Applications',
  'エージェントとオーケストレーションのアーキテクチャ': 'Agent and Orchestration Architecture',
  'セキュリティ、ガバナンス、責任あるAI': 'Security, Governance, and Responsible AI',
};

// 試験レベル表示
export const EXAM_LEVEL: Record<string, string> = {
  CLF: 'Foundational',
  SAA: 'Associate',
  SAP: 'Professional',
  DOP: 'Professional',
  AIF: 'Foundational',
  MLA: 'Associate',
  GAI: 'Professional',
};

// 試験の説明文
export const EXAM_DESC_JA: Record<string, string> = {
  CLF: 'クラウドの基礎を問う入門レベルの認定',
  SAA: '最も人気の高いアソシエイトレベル認定',
  SAP: '高度な設計スキルを証明するプロ認定',
  DOP: '開発・運用の高度なスキルを証明するプロ認定',
  AIF: 'AI/MLの概念とAWSサービスを幅広くカバーする入門認定',
  MLA: 'MLモデルの構築・デプロイ・運用を問うアソシエイト認定',
  GAI: '生成AIソリューションの設計・実装を問うプロ認定',
};
export const EXAM_DESC_EN: Record<string, string> = {
  CLF: 'Foundational certification covering cloud basics',
  SAA: 'Most popular associate-level AWS certification',
  SAP: 'Professional certification for advanced architects',
  DOP: 'Professional certification for DevOps engineers',
  AIF: 'Foundational certification covering AI/ML concepts and AWS services',
  MLA: 'Associate certification for building and operating ML solutions',
  GAI: 'Professional certification for generative AI solution design and implementation',
};

// ドメイン正答率の色分けしきい値（0–1スケール）
export const DOMAIN_RATE_WARNING = 0.50;
export const DOMAIN_RATE_CAUTION = 0.65;

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
  DOP: { examCode: 'DOP-C02', fullName: 'AWS Certified DevOps Engineer – Professional',            totalQuestions: 75, timeLimitMin: 180 },
  AIF: { examCode: 'AIF-C01', fullName: 'AWS Certified AI Practitioner',                          totalQuestions: 85, timeLimitMin: 120 },
  MLA: { examCode: 'MLA-C01', fullName: 'AWS Certified Machine Learning Engineer – Associate',    totalQuestions: 65, timeLimitMin: 130 },
  GAI: { examCode: 'GAI-C01', fullName: 'AWS Certified Generative AI Developer – Professional',   totalQuestions: 75, timeLimitMin: 170 },
};
