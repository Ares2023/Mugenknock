'use client';
import React, { useState } from 'react';
import { Helmet } from '@/compat/react-helmet-async';
import { Link, useNavigate } from '@/compat/react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { CATALOG } from '../data/awsServiceCatalog';
import { IconUser, ServiceIconImg } from '../components/Icons';

const TEAL   = '#009E9E';
const TEAL_D = '#007878';
const TEAL_L = '#e6f7f7';
const TEAL_M = '#b2e8e8';

const CATEGORY_DESC: Record<string, string> = {
  'コンピューティング':                 'EC2・Lambda などのサーバーレス含むコンピューティングリソース。AWS試験の最重要カテゴリ。',
  'コンテナ':                           'ECS・EKS・Fargate などのコンテナ管理・オーケストレーションサービス。',
  'ストレージ':                         'S3・EBS・EFS などのオブジェクト・ブロック・ファイルストレージ。',
  'データベース':                       'RDS・Aurora・DynamoDB などのリレーショナル・NoSQLデータベース。',
  '移行と転送':                         'DataSync・Snow Family などのオンプレミスからAWSへのデータ・システム移行ツール。',
  'ネットワーキングとコンテンツ配信':   'VPC・CloudFront・Route 53 などのネットワーク・CDN・DNS サービス。',
  '開発者用ツール':                     'CodePipeline・CodeBuild・CodeDeploy などの CI/CD・開発支援ツール。',
  'Customer Enablement':               'AWS Support・Managed Services などの顧客支援・マネージドサービス。',
  'ブロックチェーン':                   'Amazon Managed Blockchain などの分散台帳・ブロックチェーンサービス。',
  '衛星':                               'AWS Ground Station などの地上局・衛星通信サービス。',
  'Quantum Technologies':              'Amazon Braket などの量子コンピューティングサービス。',
  '管理とガバナンス':                   'CloudWatch・CloudTrail・AWS Config などの監視・ガバナンス・コンプライアンスツール。',
  'メディアサービス':                   'Elemental MediaConvert などの動画・音声メディア処理サービス。',
  'Machine Learning':                  'SageMaker・Rekognition・Comprehend などの AI/ML プラットフォームとサービス。',
  '分析':                               'Redshift・Athena・Glue などのデータウェアハウス・分析・ETL・BIサービス。',
  'セキュリティ、ID、およびコンプライアンス': 'IAM・KMS・Shield・WAF などのセキュリティ・ID管理・暗号化サービス。',
  'クラウド財務管理':                   'AWS Cost Explorer・Budgets などのコスト管理・最適化ツール。',
  'モバイル':                           'AWS Amplify・Device Farm などのモバイルアプリ開発・テスト支援。',
  'アプリケーション統合':               'SQS・SNS・EventBridge・Step Functions などのメッセージング・統合サービス。',
  'ビジネスアプリケーション':           'Amazon Connect・WorkMail・Pinpoint などのビジネス向けアプリケーション。',
  'エンドユーザーコンピューティング':   'WorkSpaces・AppStream などの仮想デスクトップ・アプリストリーミング。',
  'IoT':                                'AWS IoT Core・Greengrass などの IoT デバイス管理・データ処理。',
  'ゲーム開発':                         'Amazon GameLift などのゲームサーバー管理・マルチプレイヤーインフラ。',
};

export default function PublicEncyclopedia() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' ? window.innerWidth < 768 : false);
  const [search, setSearch] = useState('');

  React.useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  const q = search.trim().toLowerCase();
  const filtered = q
    ? CATALOG.map(c => ({
        ...c,
        services: c.services.filter(s => s.name.toLowerCase().includes(q)),
      })).filter(c => c.services.length > 0)
    : CATALOG;

  const totalCount = CATALOG.reduce((s, c) => s + c.services.length, 0);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--color-bg-main)', color: 'var(--color-text-main)', fontFamily: 'inherit' }}>
      <Helmet>
        <title>AWSサービス一覧｜無限ノック</title>
        <meta name="description" content={`AWS認定試験に登場する${totalCount}以上のAWSサービスをカテゴリ別に一覧できるリファレンス。コンピューティング・ストレージ・セキュリティ・データベースなど全カテゴリ対応。`} />
      </Helmet>

      {/* ── ヘッダー ── */}
      <header style={{ height: 56, minHeight: 56, background: 'var(--color-bg-white)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: isMobile ? '0 12px' : '0 var(--spacing-lg)', zIndex: 200, flexShrink: 0, borderBottom: '1px solid var(--color-border)' }}>
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}>
          <img src="/mugen-icon.png"   alt="無限ノック" style={{ height: 26, width: 'auto' }} />
          <img src="/mugen-header.png" alt=""           style={{ height: 26, width: 'auto' }} />
        </Link>
        <button onClick={() => navigate(user ? '/account' : '/login')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: user ? TEAL_L : 'transparent', border: '1px solid var(--color-border)', borderRadius: '50%', cursor: 'pointer', color: user ? TEAL : 'var(--color-text-sub)', width: 36, height: 36, padding: 0, fontSize: 'var(--font-size-base)', fontWeight: 700 }}>
          {user?.email ? user.email[0].toUpperCase() : <IconUser />}
        </button>
      </header>

      <main style={{ flex: 1 }}>

        {/* ── ページヘッダー ── */}
        <section style={{ background: TEAL_L, borderBottom: `2px solid ${TEAL_M}`, padding: isMobile ? '28px 20px 24px' : '40px 40px 32px' }}>
          <div style={{ maxWidth: 860, margin: '0 auto' }}>
            <h1 style={{ fontSize: isMobile ? 20 : 28, fontWeight: 900, color: TEAL_D, margin: '0 0 8px' }}>
              AWSサービス リファレンス
            </h1>
            <p style={{ fontSize: isMobile ? 13 : 14, color: '#555', margin: '0 0 20px', lineHeight: 1.7 }}>
              AWS認定試験に登場する {totalCount}以上 のサービスをカテゴリ別に一覧できます。コンピューティング・ストレージ・セキュリティ・データベースなど全カテゴリ対応。
            </p>
            {/* 検索 */}
            <input
              type="text"
              placeholder="サービス名で検索…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: '100%', maxWidth: 360, padding: '8px 14px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-bg-white)', color: 'var(--color-text-main)', fontSize: 'var(--font-size-base)', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
        </section>

        {/* ── サービス一覧 ── */}
        <div style={{ maxWidth: 860, margin: '0 auto', padding: isMobile ? '24px 16px' : '36px 32px' }}>
          {filtered.map(({ category, services }) => (
            <section key={category} style={{ marginBottom: isMobile ? 32 : 40 }}>
              <h2 style={{ fontSize: isMobile ? 14 : 16, fontWeight: 800, color: TEAL_D, margin: '0 0 6px' }}>{category}</h2>
              {CATEGORY_DESC[category] && (
                <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)', margin: '0 0 12px', lineHeight: 1.6 }}>{CATEGORY_DESC[category]}</p>
              )}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {services.map(svc => (
                  <div key={svc.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--color-bg-white)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '6px 10px' }}>
                    {svc.icon && (
                      <ServiceIconImg icon={svc.icon} name={svc.name} size={18} />
                    )}
                    <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--color-text-main)' }}>{svc.name}</span>
                  </div>
                ))}
              </div>
            </section>
          ))}

          {filtered.length === 0 && (
            <p style={{ textAlign: 'center', color: 'var(--color-text-light)', padding: '40px 0' }}>「{search}」に一致するサービスが見つかりませんでした</p>
          )}

          {/* ── CTA ── */}
          <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 32, marginTop: 8, textAlign: 'center' }}>
            <p style={{ fontSize: 'var(--font-size-base)', color: 'var(--color-text-sub)', marginBottom: 16 }}>
              各サービスの詳細な説明・トリビアは演習内で解放できます
            </p>
            <button onClick={() => navigate('/aws/')} style={{ background: TEAL, color: '#fff', border: 'none', borderRadius: 8, padding: '12px 28px', fontSize: 'var(--font-size-base)', fontWeight: 700, cursor: 'pointer' }}>
              無限ノックで演習を始める →
            </button>
          </div>
        </div>
      </main>

      <footer style={{ padding: '14px var(--spacing-lg)', textAlign: 'center', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-light)', borderTop: '1px solid var(--color-border)' }}>
        © {new Date().getFullYear()} MugenKnock
      </footer>
    </div>
  );
}
