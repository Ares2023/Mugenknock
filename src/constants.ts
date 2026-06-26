import EXAM_DOMAINS_MASTER from './data/examDomains.json';

export const API_ENDPOINT = process.env.NEXT_PUBLIC_API_ENDPOINT
  ?? 'https://a0q3656qw4.execute-api.ap-northeast-1.amazonaws.com/dev';

export const ADMIN_EMAIL = 'mugenknock@gmail.com';

export const EXAM_TYPES = ['CLF', 'AIF', 'SAA', 'DVA', 'SOA', 'DEA', 'MLA', 'SAP', 'DOP', 'AIP', 'ANS', 'SCS'] as const;
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
  AIP: 750,
  ANS: 700,
  SCS: 750,
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
  AIP: 75,
  ANS: 70,
  SCS: 75,
};

// 試験の出題ドメイン（単一マスタ src/data/examDomains.json から導出）
// 配列 index = ドメインの正準キー。名前は表示専用ラベルとして扱う。
export const EXAM_DOMAINS: Record<string, string[]> = Object.fromEntries(
  Object.entries(EXAM_DOMAINS_MASTER).map(([exam, doms]) => [exam, doms.map(d => d.ja)])
);

// ── domain フィールドのユーティリティ ────────────────────────
// domain は整数インデックス（正準キー）。旧データは文字列の場合があるため両対応。
export type QuestionLike = { examType: string; domain?: number | string | null };

export function qDomainName(q: QuestionLike): string {
  if (typeof q.domain === 'number') return EXAM_DOMAINS[q.examType]?.[q.domain] ?? '';
  if (typeof q.domain === 'string') return EXAM_DOMAINS[q.examType]?.[toDomainIndex(q.examType, q.domain)] ?? '';
  return '';
}

export function qDomainIndex(examType: string, nameOrIndex: number | string): number {
  if (typeof nameOrIndex === 'number') return nameOrIndex;
  return EXAM_DOMAINS[examType]?.indexOf(nameOrIndex) ?? -1;
}

// ── ドメイン正準キー（整数 index）変換ヘルパ ─────────────────
// 表示は名前、永続化・転送は index を正準キーとする。
export function domainName(examType: string, idx: number, lang: string = 'ja'): string {
  const ja = EXAM_DOMAINS[examType]?.[idx] ?? '';
  return lang === 'en' ? (DOMAIN_NAME_EN[ja] ?? ja) : ja;
}
// name / index / 数値文字列 → index（該当なしは -1）
export function toDomainIndex(examType: string, v: string | number): number {
  if (typeof v === 'number') return Number.isInteger(v) ? v : -1;
  if (/^\d+$/.test(v)) return parseInt(v, 10);
  return EXAM_DOMAINS[examType]?.indexOf(v) ?? -1;
}
// 名前/index 配列 → index 配列（永続化・転送用。該当なしは除外）
export function domainsToIndices(examType: string, values: (string | number)[]): number[] {
  return values.map(v => toDomainIndex(examType, v)).filter(i => i >= 0);
}
// 保存済み（index / 旧名いずれも可）→ 現在の名前配列（表示用）。未保存(undefined)は全ドメイン。
export function storedDomainsToNames(examType: string, stored: (string | number)[] | undefined): string[] {
  const all = EXAM_DOMAINS[examType] ?? [];
  if (!stored) return [...all];
  const names = stored
    .map(v => { const i = toDomainIndex(examType, v); return i >= 0 ? all[i] : undefined; })
    .filter((n): n is string => !!n);
  return names.length > 0 ? names : [...all];
}
// UserTagStats / domain_history の tagId が当該 index に一致するか（tagId は index 文字列）。
// 第2引数 examType は呼び出し側の安定性のため残置（照合自体には未使用）。
export function tagIdMatches(tagId: string, _examType: string, idx: number): boolean {
  return tagId === String(idx);
}
// 問題の domain index（旧データ: 文字列は変換、未設定は -1）
export function questionDomainIndex(q: QuestionLike): number {
  if (typeof q.domain === 'number') return q.domain;
  if (typeof q.domain === 'string') return toDomainIndex(q.examType, q.domain);
  return -1;
}

// ドメイン名の英語対応（日本語キー → 英語表示）— マスタから導出
// 共通キー（例: 'セキュリティとコンプライアンス'）は同一 en のため重複しても問題なし。
export const DOMAIN_NAME_EN: Record<string, string> = Object.fromEntries(
  Object.values(EXAM_DOMAINS_MASTER).flat().map(d => [d.ja, d.en])
);

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
  AIP: 'Professional',
  ANS: 'Specialty',
  SCS: 'Specialty',
};

export const EXAM_LEVEL_COLORS: Record<string, string> = {
  Foundational: '#6b9e3a',
  Associate:    '#006CE0',
  Professional: '#8b5cf6',
  Specialty:    '#0ea5e9',
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
  AIP: 'AWSで生成AIソリューションを実装・デプロイするプロフェッショナル認定',
  ANS: 'AWSとハイブリッドネットワークの高度な設計・実装スキルを問うスペシャリティ認定',
  SCS: 'AWSクラウドのセキュリティ専門知識を証明するスペシャリティ認定',
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
  AIP: 'Professional certification for integrating and deploying generative AI solutions on AWS',
  ANS: 'Specialty certification for advanced AWS and hybrid network architecture design',
  SCS: 'Specialty certification for AWS cloud security expertise',
};

// ドメイン正答率の色分けしきい値（0–1スケール）
export const DOMAIN_RATE_WARNING = 0.40;
export const DOMAIN_RATE_CAUTION = 0.60;

// ドメイン配点（公式試験ガイドの割合 %）— マスタから導出
export const DOMAIN_WEIGHTS: Record<string, number[]> = Object.fromEntries(
  Object.entries(EXAM_DOMAINS_MASTER).map(([exam, doms]) => [exam, doms.map(d => d.weight)])
);

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
  AIP: { examCode: 'AIP-C01', fullName: 'AWS Certified Generative AI Developer – Professional',   totalQuestions: 75, timeLimitMin: 170 },
  ANS: { examCode: 'ANS-C01', fullName: 'AWS Certified Advanced Networking – Specialty',           totalQuestions: 65, timeLimitMin: 170 },
  SCS: { examCode: 'SCS-C03', fullName: 'AWS Certified Security – Specialty',                     totalQuestions: 65, timeLimitMin: 170 },
};

export const EXAM_OFFICIAL_URLS: Record<string, { page: string; guide: string }> = {
  CLF: { page: 'https://aws.amazon.com/certification/certified-cloud-practitioner/',                    guide: 'https://d1.awsstatic.com/training-and-certification/docs-cloud-practitioner/AWS-Certified-Cloud-Practitioner_Exam-Guide.pdf' },
  AIF: { page: 'https://aws.amazon.com/certification/certified-ai-practitioner/',                       guide: 'https://d1.awsstatic.com/training-and-certification/docs-ai-practitioner/AWS-Certified-AI-Practitioner_Exam-Guide.pdf' },
  SAA: { page: 'https://aws.amazon.com/certification/certified-solutions-architect-associate/',         guide: 'https://d1.awsstatic.com/training-and-certification/docs-sa-assoc/AWS-Certified-Solutions-Architect-Associate_Exam-Guide.pdf' },
  DVA: { page: 'https://aws.amazon.com/certification/certified-developer-associate/',                   guide: 'https://d1.awsstatic.com/training-and-certification/docs-dev-associate/AWS-Certified-Developer-Associate_Exam-Guide.pdf' },
  SOA: { page: 'https://aws.amazon.com/certification/certified-sysops-admin-associate/',                guide: 'https://d1.awsstatic.com/training-and-certification/docs-sysops-associate/AWS-Certified-SysOps-Administrator-Associate_Exam-Guide.pdf' },
  DEA: { page: 'https://aws.amazon.com/certification/certified-data-engineer-associate/',               guide: 'https://d1.awsstatic.com/training-and-certification/docs-data-engineer-associate/AWS-Certified-Data-Engineer-Associate_Exam-Guide.pdf' },
  MLA: { page: 'https://aws.amazon.com/certification/certified-machine-learning-engineer-associate/',   guide: 'https://d1.awsstatic.com/training-and-certification/docs-ml-engineer-associate/AWS-Certified-Machine-Learning-Engineer-Associate_Exam-Guide.pdf' },
  SAP: { page: 'https://aws.amazon.com/certification/certified-solutions-architect-professional/',      guide: 'https://d1.awsstatic.com/training-and-certification/docs-sa-pro/AWS-Certified-Solutions-Architect-Professional_Exam-Guide.pdf' },
  DOP: { page: 'https://aws.amazon.com/certification/certified-devops-engineer-professional/',          guide: 'https://d1.awsstatic.com/training-and-certification/docs-devops-pro/AWS-Certified-DevOps-Engineer-Professional_Exam-Guide.pdf' },
  AIP: { page: 'https://aws.amazon.com/certification/certified-generative-ai-developer-professional/',  guide: 'https://d1.awsstatic.com/training-and-certification/docs-generative-ai-developer-professional/AWS-Certified-Generative-AI-Developer-Professional_Exam-Guide.pdf' },
  ANS: { page: 'https://aws.amazon.com/certification/certified-advanced-networking-specialty/',         guide: 'https://d1.awsstatic.com/training-and-certification/docs-advnetworking-spec/AWS-Certified-Advanced-Networking-Specialty_Exam-Guide.pdf' },
  SCS: { page: 'https://aws.amazon.com/certification/certified-security-specialty/',                    guide: 'https://d1.awsstatic.com/training-and-certification/docs-security-spec/AWS-Certified-Security-Specialty_Exam-Guide.pdf' },
};
