export const API_ENDPOINT = 'https://a0q3656qw4.execute-api.ap-northeast-1.amazonaws.com/dev';

export const ADMIN_EMAIL = 'yuzuki2002110@gmail.com';

export const EXAM_TYPES = ['CLF', 'SAA', 'SAP', 'DOP'] as const;
export type ExamType = typeof EXAM_TYPES[number];

// 合格スコア（スケールスコア 100〜1000 での公式合格ライン）
export const PASS_SCORES: Record<string, number> = {
  CLF: 700,
  SAA: 720,
  SAP: 750,
  DOP: 750,
};

// 演習モードでの合否判定に使う正答率の目安（スケールスコアの近似値）
export const PASS_RATE: Record<string, number> = {
  CLF: 70,
  SAA: 72,
  SAP: 75,
  DOP: 75,
};

// 試験の出題ドメイン（出題範囲分類）
export const EXAM_DOMAINS: Record<string, string[]> = {
  CLF: ['クラウドのコンセプト', 'セキュリティとコンプライアンス', 'クラウドテクノロジーとサービス', '請求・料金・サポート'],
  SAA: ['セキュアなアーキテクチャの設計', '弾力性に優れたアーキテクチャの設計', '高パフォーマンスなアーキテクチャの設計', 'コスト最適化されたアーキテクチャの設計'],
  SAP: ['組織の複雑さに対応したソリューションの設計', '新しいソリューションの設計', '既存ソリューションの継続的改善', 'ワークロードの移行とモダナイゼーション'],
  DOP: ['SDLC の自動化', '設定管理と IaC', '高可用性、耐障害性、およびディザスタリカバリ', 'モニタリングとログ', 'セキュリティとコンプライアンスの自動化'],
};

// ドメイン名の英語対応（日本語キー → 英語表示）
export const DOMAIN_NAME_EN: Record<string, string> = {
  'クラウドのコンセプト': 'Cloud Concepts',
  'セキュリティとコンプライアンス': 'Security and Compliance',
  'クラウドテクノロジーとサービス': 'Cloud Technology and Services',
  '請求・料金・サポート': 'Billing, Pricing, and Support',
  'セキュアなアーキテクチャの設計': 'Design Secure Architectures',
  '弾力性に優れたアーキテクチャの設計': 'Design Resilient Architectures',
  '高パフォーマンスなアーキテクチャの設計': 'Design High-Performing Architectures',
  'コスト最適化されたアーキテクチャの設計': 'Design Cost-Optimized Architectures',
  '組織の複雑さに対応したソリューションの設計': 'Design for Organizational Complexity',
  '新しいソリューションの設計': 'Design for New Solutions',
  '既存ソリューションの継続的改善': 'Continuous Improvement for Existing Solutions',
  'ワークロードの移行とモダナイゼーション': 'Accelerate Workload Migration and Modernization',
  'SDLC の自動化': 'SDLC Automation',
  '設定管理と IaC': 'Configuration Management and IaC',
  '高可用性、耐障害性、およびディザスタリカバリ': 'High Availability, Fault Tolerance, and DR',
  'モニタリングとログ': 'Monitoring and Logging',
  'セキュリティとコンプライアンスの自動化': 'Security and Compliance Automation',
};

// 試験レベル表示
export const EXAM_LEVEL: Record<string, string> = {
  CLF: 'Foundational',
  SAA: 'Associate',
  SAP: 'Professional',
  DOP: 'Professional',
};

// 試験の説明文
export const EXAM_DESC_JA: Record<string, string> = {
  CLF: 'クラウドの基礎を問う入門レベルの認定',
  SAA: '最も人気の高いアソシエイトレベル認定',
  SAP: '高度な設計スキルを証明するプロ認定',
  DOP: '開発・運用の高度なスキルを証明するプロ認定',
};
export const EXAM_DESC_EN: Record<string, string> = {
  CLF: 'Foundational certification covering cloud basics',
  SAA: 'Most popular associate-level AWS certification',
  SAP: 'Professional certification for advanced architects',
  DOP: 'Professional certification for DevOps engineers',
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
  CLF: { examCode: 'CLF-C02', fullName: 'AWS Certified Cloud Practitioner',             totalQuestions: 65, timeLimitMin: 90  },
  SAA: { examCode: 'SAA-C03', fullName: 'AWS Certified Solutions Architect – Associate', totalQuestions: 65, timeLimitMin: 130 },
  SAP: { examCode: 'SAP-C02', fullName: 'AWS Certified Solutions Architect – Professional', totalQuestions: 75, timeLimitMin: 180 },
  DOP: { examCode: 'DOP-C02', fullName: 'AWS Certified DevOps Engineer – Professional',  totalQuestions: 75, timeLimitMin: 180 },
};
