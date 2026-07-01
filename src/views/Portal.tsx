'use client';
import React, { useState } from 'react';
import { Helmet } from '@/compat/react-helmet-async';
import { Navigate, useNavigate } from '@/compat/react-router-dom';
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
  const [cookieConsent, setCookieConsent] = useState<boolean>(() =>
    localStorage.getItem('cookie_consent_v1') === 'accepted'
  );

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
  const acceptCookies = () => {
    localStorage.setItem('cookie_consent_v1', 'accepted');
    setCookieConsent(true);
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--color-bg-main)', color: 'var(--color-text-main)', fontFamily: 'inherit' }}>
      <Helmet>
        <title>無限ノック｜AWS認定試験 練習問題サービス</title>
        <meta name="description" content="AWS認定試験（SAA・CLF・SAPなど）の無料練習問題サービス。AI生成の本番同等問題2,600問以上、演習・模試・統計の3本柱でスコアアップをサポート。全12資格対応。" />
      </Helmet>

      {/* ── ヘッダー ── */}
      <header style={{ height: 56, minHeight: 56, background: 'var(--color-bg-white)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: isMobile ? '0 12px' : '0 var(--spacing-lg)', zIndex: 200, flexShrink: 0, borderBottom: '1px solid var(--color-border)' }}>
        <button onClick={() => navigate(user ? '/account' : '/login')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: user ? TEAL_L : 'transparent', border: '1px solid var(--color-border)', borderRadius: '50%', cursor: 'pointer', color: user ? TEAL : 'var(--color-text-sub)', width: 36, height: 36, padding: 0, fontSize: 'var(--font-size-base)', fontWeight: 700 }}>
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
            <p style={{ fontSize: 'var(--font-size-sm)', color: '#888', marginTop: 10 }}>
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
                  <span style={{ flexShrink: 0, width: 24, height: 24, borderRadius: '50%', background: TEAL, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'var(--font-size-sm2)', fontWeight: 800 }}>{i + 1}</span>
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
                  <div style={{ fontSize: 'var(--font-size-sm2)', fontWeight: 800, color: TEAL, marginBottom: 8 }}>{ja ? f.ja_title : f.en_title}</div>
                  <p style={{ margin: 0, fontSize: isMobile ? 12 : 13, color: 'var(--color-text-sub)', lineHeight: 1.75 }}>{ja ? f.ja : f.en}</p>
                </div>
              ))}
            </div>
          </section>

          {/* ── 開発の意図・目的 ── */}
          <section style={{ marginBottom: isMobile ? 40 : 56 }}>
            <h2 style={{ fontSize: isMobile ? 'var(--font-size-h3)' : 'var(--font-size-h2)', fontWeight: 800, color: TEAL_D, margin: '0 0 20px', letterSpacing: '-0.3px' }}>
              {ja ? 'なぜ作ったのか' : 'Why I Built This'}
            </h2>
            <div style={{ background: 'var(--color-bg-white)', border: '1px solid var(--color-border)', borderRadius: 'var(--border-radius-lg)', padding: isMobile ? 'var(--spacing-md)' : 'var(--spacing-lg) var(--spacing-xl)', lineHeight: 1.9 }}>
              <p style={{ margin: '0 0 var(--spacing-md)', fontSize: isMobile ? 'var(--font-size-sm2)' : 'var(--font-size-md)', color: 'var(--color-text-main)' }}>
                {ja
                  ? '無限ノックは、AWS認定 SAP（Solutions Architect – Professional）を持つ開発者が、AWS全資格の取得を目指して作った個人開発サービスです。'
                  : 'Mugenknock is a solo-built service created by a developer who holds the AWS Certified Solutions Architect – Professional (SAP), on a personal mission to earn every AWS certification.'}
              </p>
              <p style={{ margin: '0 0 var(--spacing-sm)', fontSize: isMobile ? 'var(--font-size-sm2)' : 'var(--font-size-base)', color: 'var(--color-text-sub)' }}>
                {ja
                  ? '既存の資格演習サービスへの不満が積もり積もって、「それなら自分が欲しいものを作ろう」と生まれました。'
                  : 'It was born out of frustration with existing practice services — so I decided to build the tool I actually wanted.'}
              </p>
              <ul style={{ margin: '0 0 var(--spacing-md)', paddingLeft: '1.3em', color: 'var(--color-text-sub)', fontSize: isMobile ? 'var(--font-size-sm2)' : 'var(--font-size-base)' }}>
                <li>{ja ? 'ロードが遅い' : 'Slow loading'}</li>
                <li>{ja ? '弱点へのパーソナライズが弱い' : 'Weak personalization to your weak points'}</li>
                <li>{ja ? '日本語が充実していない' : 'Thin Japanese support'}</li>
                <li>{ja ? '情報が古い' : 'Outdated content'}</li>
              </ul>
              <p style={{ margin: 0, fontSize: isMobile ? 'var(--font-size-sm2)' : 'var(--font-size-base)', color: 'var(--color-text-main)', fontWeight: 600 }}>
                {ja
                  ? '開発者自身が全資格を取り切るまでは、少なくとも開発を続けます。同じ課題を感じている方は、どうぞ使ってください。'
                  : 'I\'ll keep developing it at least until I\'ve earned every certification myself. If you share the same frustrations, you\'re welcome to use it.'}
              </p>
            </div>
          </section>

        </div>
      </main>

      <footer style={{ padding: '14px var(--spacing-lg)', textAlign: 'center', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-light)', borderTop: '1px solid var(--color-border)' }}>
        © {new Date().getFullYear()} MugenKnock
        <span style={{ margin: '0 10px' }}>|</span>
        <a href="/about#privacy" style={{ color: 'var(--color-text-light)', textDecoration: 'none' }}
          onMouseEnter={e => { e.currentTarget.style.textDecoration = 'underline'; }}
          onMouseLeave={e => { e.currentTarget.style.textDecoration = 'none'; }}>
          プライバシーポリシー
        </a>
        <span style={{ margin: '0 10px' }}>|</span>
        <a href="/about#terms" style={{ color: 'var(--color-text-light)', textDecoration: 'none' }}
          onMouseEnter={e => { e.currentTarget.style.textDecoration = 'underline'; }}
          onMouseLeave={e => { e.currentTarget.style.textDecoration = 'none'; }}>
          利用規約
        </a>
      </footer>

      {/* ── Cookie 同意バナー ── */}
      {!cookieConsent && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 9999,
          background: 'var(--color-bg-white)',
          borderTop: '1px solid var(--color-border)',
          padding: '12px 20px',
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
          boxShadow: 'var(--box-shadow-up)',
        }}>
          <span style={{ flex: 1, minWidth: 200, fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)', lineHeight: 1.6 }}>
            {ja
              ? '本サービスは、広告配信・アクセス解析のためにCookieを使用しています。'
              : 'This site uses cookies for advertising and analytics.'}
            {' '}
            <a href="/about#privacy" style={{ color: TEAL, fontSize: 'var(--font-size-sm)' }}>
              {ja ? '詳細' : 'Learn more'}
            </a>
          </span>
          <button
            onClick={acceptCookies}
            style={{ flexShrink: 0, padding: '6px 18px', background: TEAL, color: '#fff', border: 'none', borderRadius: 'var(--border-radius-full)', fontWeight: 700, fontSize: 'var(--font-size-sm)', cursor: 'pointer' }}
          >
            {ja ? '同意して閉じる' : 'Accept'}
          </button>
        </div>
      )}
    </div>
  );
}
