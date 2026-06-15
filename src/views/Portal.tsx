'use client';
import React, { useState } from 'react';
import { Helmet } from '@/compat/react-helmet-async';
import { Link, Navigate, useNavigate } from '@/compat/react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { IconUser } from '../components/Icons';

const TEAL   = '#009E9E';
const TEAL_D = '#007878';
const TEAL_L = '#e6f7f7';
const TEAL_M = '#b2e8e8';

const BENEFITS: { ja: string; en: string }[] = [
  {
    ja: 'キャリアアップに直結。AWS認定は世界標準のクラウド資格として採用市場で高く評価されています。',
    en: 'Globally recognized. AWS certifications are valued by employers worldwide and can lead to career advancement.',
  },
  {
    ja: 'クラウドスキルを客観的に証明できます。設計・セキュリティ・コスト最適化など実務直結の知識が身につきます。',
    en: 'Validate your skills. Gain practical knowledge in architecture, security, and cost optimization with recognized credentials.',
  },
  {
    ja: '入門レベルのCLFからプロフェッショナル・スペシャリティまで、段階的に学習できる体系が整っています。',
    en: 'Structured path. Progress from foundational CLF through professional and specialty levels at your own pace.',
  },
];

const FEATURES: { ja_title: string; en_title: string; ja: string; en: string }[] = [
  {
    ja_title: 'AI生成の練習問題',
    en_title: 'AI-Generated Questions',
    ja: 'Claude AIが作成した本番試験同等の問題を2,600問以上収録。選択肢別の解説付きで理解が深まります。',
    en: 'Over 2,600 exam-quality questions by Claude AI with per-choice explanations for deeper understanding.',
  },
  {
    ja_title: '演習・模試・トレーニング',
    en_title: 'Exercise, Exam & Training',
    ja: '1問ずつ確認する演習モード、本番形式の模試、苦手分野を繰り返すトレーニングの3モードに対応。',
    en: 'Three modes: step-by-step exercise, full timed exam simulation, and targeted training on weak areas.',
  },
  {
    ja_title: 'ドメイン別の弱点分析',
    en_title: 'Domain-by-Domain Analysis',
    ja: 'ドメイン別の正答率グラフで苦手分野を一目で把握。学習の進捗を記録し、スコアアップを実感できます。',
    en: 'Visualize your weak domains at a glance. Track your progress and watch your score improve over time.',
  },
];

export default function Portal() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const { lang } = useLanguage();
  const ja = lang === 'ja';
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  React.useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  if (loading) {
    return (
      <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg-main)' }}>
        <div className="sherpa-spinner" />
      </div>
    );
  }

  if (user && localStorage.getItem(`targetExam_${user.userId}`)) {
    return <Navigate to="/aws/" replace />;
  }

  const handleStart = () => navigate('/aws/');

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--color-bg-main)', color: 'var(--color-text-main)', fontFamily: 'inherit' }}>
      <Helmet>
        <title>無限ノック｜AWS認定試験 練習問題サービス</title>
        <meta name="description" content="AWS認定試験（SAA・CLF・SAPなど）の無料練習問題サービス。AI生成の本番同等問題2,600問以上、演習・模試・統計の3本柱でスコアアップをサポート。全12資格対応。" />
      </Helmet>

      {/* ── ヘッダー ── */}
      <header style={{ height: 56, minHeight: 56, background: 'var(--color-bg-white)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: isMobile ? '0 12px' : '0 var(--spacing-lg)', zIndex: 200, flexShrink: 0, borderBottom: '1px solid var(--color-border)' }}>
        <button onClick={() => navigate(user ? '/account' : '/login')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: user ? TEAL_L : 'transparent', border: '1px solid var(--color-border)', borderRadius: '50%', cursor: 'pointer', color: user ? TEAL : 'var(--color-text-sub)', width: 36, height: 36, padding: 0, fontSize: 14, fontWeight: 700 }}>
          {user?.email ? user.email[0].toUpperCase() : <IconUser />}
        </button>
      </header>

      <main style={{ flex: 1, overflowY: 'auto' }}>

        {/* ── ヒーロー ── */}
        <section style={{ background: TEAL_L, borderBottom: `3px solid ${TEAL_M}`, padding: isMobile ? '40px 20px 36px' : '64px 40px 56px', textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 24 }}>
            <img src="/mugen-icon.png"   alt="無限ノック" style={{ height: isMobile ? 40 : 52, width: 'auto' }} />
            <img src="/mugen-header.png" alt=""           style={{ height: isMobile ? 40 : 52, width: 'auto' }} />
          </div>
          <h1 style={{ fontSize: isMobile ? 22 : 32, fontWeight: 900, color: TEAL_D, margin: '0 0 14px', letterSpacing: '-0.5px', lineHeight: 1.3 }}>
            {ja ? 'AWS認定試験の練習問題サービス' : 'AWS Certification Practice'}
          </h1>
          <p style={{ fontSize: isMobile ? 14 : 16, color: '#555', margin: '0 auto 28px', maxWidth: 480, lineHeight: 1.8 }}>
            {ja
              ? 'AI生成の本番同等問題で実力を磨き、ドメイン別分析で弱点を克服。全12資格に対応。'
              : 'Sharpen your skills with AI-generated questions and conquer your weak domains across all 12 certifications.'}
          </p>
          <button onClick={handleStart} style={{ background: TEAL, color: '#fff', border: 'none', borderRadius: 8, padding: isMobile ? '12px 28px' : '14px 36px', fontSize: isMobile ? 15 : 16, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.02em', transition: 'background 0.15s' }} onMouseEnter={e => { e.currentTarget.style.background = TEAL_D; }} onMouseLeave={e => { e.currentTarget.style.background = TEAL; }}>
            {ja ? '資格を選んで演習を始める' : 'Choose a Cert & Start'}
          </button>
          {!user && (
            <p style={{ fontSize: 12, color: '#888', marginTop: 10 }}>
              {ja ? 'アカウント登録なしで体験できます' : 'No account required to get started'}
            </p>
          )}
        </section>

        <div style={{ maxWidth: 860, margin: '0 auto', padding: isMobile ? '32px 16px' : '52px 32px' }}>

          {/* ── メリット ── */}
          <section style={{ marginBottom: isMobile ? 40 : 56 }}>
            <h2 style={{ fontSize: isMobile ? 17 : 22, fontWeight: 800, color: TEAL_D, margin: '0 0 20px', letterSpacing: '-0.3px' }}>
              {ja ? 'AWS認定資格を取得するメリット' : 'Why Get AWS Certified?'}
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {BENEFITS.map((b, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 14, background: 'var(--color-bg-white)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '14px 16px' }}>
                  <span style={{ flexShrink: 0, width: 24, height: 24, borderRadius: '50%', background: TEAL, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800 }}>{i + 1}</span>
                  <p style={{ margin: 0, fontSize: isMobile ? 13 : 14, color: 'var(--color-text-sub)', lineHeight: 1.75 }}>{ja ? b.ja : b.en}</p>
                </div>
              ))}
            </div>
          </section>

          {/* ── 機能 ── */}
          <section style={{ marginBottom: isMobile ? 40 : 56 }}>
            <h2 style={{ fontSize: isMobile ? 17 : 22, fontWeight: 800, color: TEAL_D, margin: '0 0 20px', letterSpacing: '-0.3px' }}>
              {ja ? '無限ノックでできること' : 'What You Can Do'}
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 14 }}>
              {FEATURES.map((f, i) => (
                <div key={i} style={{ background: 'var(--color-bg-white)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '18px 16px' }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: TEAL, marginBottom: 8 }}>{ja ? f.ja_title : f.en_title}</div>
                  <p style={{ margin: 0, fontSize: isMobile ? 12 : 13, color: 'var(--color-text-sub)', lineHeight: 1.75 }}>{ja ? f.ja : f.en}</p>
                </div>
              ))}
            </div>
          </section>


          {/* ── サービスリファレンス ── */}
          <section style={{ marginBottom: isMobile ? 40 : 56 }}>
            <div style={{ background: 'var(--color-bg-white)', border: '1px solid var(--color-border)', borderRadius: 10, padding: '20px 22px', display: 'flex', alignItems: isMobile ? 'flex-start' : 'center', justifyContent: 'space-between', flexDirection: isMobile ? 'column' : 'row', gap: 14 }}>
              <div>
                <h2 style={{ fontSize: isMobile ? 15 : 17, fontWeight: 800, color: TEAL_D, margin: '0 0 6px' }}>
                  {ja ? 'AWSサービス リファレンス' : 'AWS Service Reference'}
                </h2>
                <p style={{ margin: 0, fontSize: isMobile ? 12 : 13, color: 'var(--color-text-sub)', lineHeight: 1.65 }}>
                  {ja
                    ? '試験に登場する200以上のAWSサービスをカテゴリ別に一覧できます。コンピューティング・ストレージ・セキュリティなど全カテゴリ対応。'
                    : 'Browse 200+ AWS services that appear in certification exams, organized by category.'}
                </p>
              </div>
              <Link to="/encyclopedia" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: TEAL, color: '#fff', textDecoration: 'none', borderRadius: 8, padding: '10px 18px', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 }}>
                {ja ? 'サービス一覧を見る →' : 'Browse Services →'}
              </Link>
            </div>
          </section>

        </div>
      </main>

      <footer style={{ padding: '14px var(--spacing-lg)', textAlign: 'center', fontSize: 11, color: 'var(--color-text-light)', borderTop: '1px solid var(--color-border)' }}>
        © {new Date().getFullYear()} MugenKnock
      </footer>
    </div>
  );
}
