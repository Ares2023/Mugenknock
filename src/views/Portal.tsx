'use client';
import React, { useState } from 'react';
import { Helmet } from '@/compat/react-helmet-async';
import { Navigate, useNavigate } from '@/compat/react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { IconUser } from '../components/Icons';
import Reveal from '../components/Reveal';

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

      {/* ── ヘッダー（ホーム画面と同一デザイン：ロゴ＋アカウントのみ） ── */}
      <header style={{
        height: 56, minHeight: 56, background: 'var(--color-bg-white)',
        display: 'flex', alignItems: 'center',
        padding: isMobile ? '0 12px 0 8px' : '0 var(--spacing-lg)',
        gap: 'var(--spacing-md)', zIndex: 200, flexShrink: 0,
        borderBottom: '1px solid var(--color-border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, userSelect: 'none', flexShrink: 0, padding: '0 4px' }}>
          <img src="/mugen-icon.png"   alt="無限ノック" style={{ height: 28, width: 'auto', display: 'block', flexShrink: 0 }} />
          <img src="/mugen-header.png" alt=""           style={{ height: 28, width: 'auto', display: 'block', flexShrink: 0 }} />
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          <button
            onClick={() => navigate(user ? '/account' : '/login')}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: user ? 'var(--color-primary-light)' : 'transparent',
              border: '1px solid var(--color-border)', borderRadius: '50%',
              cursor: 'pointer', color: user ? 'var(--color-primary)' : 'var(--color-text-sub)',
              width: 36, height: 36, padding: 0, flexShrink: 0, transition: 'background 0.2s',
              fontSize: 'var(--font-size-base)', fontWeight: 700, letterSpacing: 0,
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--color-bg-main)'}
            onMouseLeave={e => e.currentTarget.style.background = user ? 'var(--color-primary-light)' : 'transparent'}
          >
            {user?.email ? user.email[0].toUpperCase() : <IconUser />}
          </button>
        </div>
      </header>

      <main style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ maxWidth: 860, margin: '0 auto', padding: isMobile ? 'var(--spacing-md) var(--spacing-md) var(--spacing-xl)' : 'var(--spacing-lg) var(--spacing-xl) var(--spacing-xl)' }}>

          {/* ── ブランド＋サービス説明カード ── */}
          <section style={{ background: 'var(--color-bg-white)', border: '1px solid var(--color-border)', borderRadius: 'var(--border-radius-lg)', boxShadow: 'var(--box-shadow-sm)', padding: isMobile ? 'var(--spacing-lg) var(--spacing-md)' : 'var(--spacing-xl) var(--spacing-xl)', textAlign: 'center', marginBottom: 'var(--spacing-md)' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 'var(--spacing-md)' }}>
              <img src="/mugen-icon.png"   alt="無限ノック" style={{ height: isMobile ? 44 : 56, width: 'auto' }} />
              <img src="/mugen-header.png" alt=""           style={{ height: isMobile ? 44 : 56, width: 'auto' }} />
            </div>
            <h1 style={{ fontSize: isMobile ? 'var(--font-size-h3)' : 'var(--font-size-h2)', fontWeight: 800, color: 'var(--color-text-main)', margin: '0 0 var(--spacing-md)', letterSpacing: '-0.3px', lineHeight: 1.4 }}>
              {ja ? 'AWS認定試験の練習問題サービス' : 'AWS Certification Practice'}
            </h1>
            <p style={{ fontSize: isMobile ? 'var(--font-size-base)' : 'var(--font-size-md)', color: 'var(--color-text-sub)', margin: '0 auto', maxWidth: 620, lineHeight: 2, textAlign: 'left' }}>
              {ja
                ? '「無限ノック」は、AWS認定 全12資格の本番同等問題（2,600問以上）から出題する完全解説付きのWeb問題集です。PC・スマホ・タブレットを使って、スキマ時間に無料で演習に取り組むことができ、学習履歴の記録やドメイン別の苦手分析も可能です。試験対策としてご活用ください。'
                : 'Mugenknock is a fully-explained web question bank drawing from 2,600+ exam-grade questions across all 12 AWS certifications. Practice free in spare moments on PC, phone, or tablet, with learning history and per-domain weak-point analysis. '}
            </p>
          </section>

          {/* ── 演習開始ボタン（ホームのサクッと演習ボタンと同デザイン・全幅） ── */}
          <div style={{ margin: '0 0 var(--spacing-lg)' }}>
            <button
              onClick={handleStart}
              style={{
                width: '100%', height: 44, border: 'none', borderRadius: 22,
                background: 'var(--color-accent)', color: 'var(--color-btn-primary-text)',
                fontWeight: 600, fontSize: 'var(--font-size-base)', cursor: 'pointer',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-accent-hover)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-accent)'; }}
            >
              {ja ? '演習開始' : 'Start Practice'}
            </button>
            {!user && (
              <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-light)', marginTop: 'var(--spacing-sm)', textAlign: 'center' }}>
                {ja ? 'アカウント登録なしで体験できます' : 'No account required to get started'}
              </p>
            )}
          </div>

          {/* ── メリット ── */}
          <section style={{ marginBottom: isMobile ? 'var(--spacing-xl)' : 48 }}>
            <h2 style={{ fontSize: isMobile ? 'var(--font-size-h3)' : 'var(--font-size-h2)', fontWeight: 800, color: 'var(--color-text-main)', margin: '0 0 var(--spacing-md)', letterSpacing: '-0.3px', borderLeft: '4px solid var(--color-accent)', paddingLeft: 'var(--spacing-sm)' }}>
              {ja ? 'AWS認定資格を取得するメリット' : 'Why Get AWS Certified?'}
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
              {BENEFITS.map((b, i) => (
                <Reveal key={i} delay={i * 70} style={{ display: 'flex', alignItems: 'flex-start', gap: 14, background: 'var(--color-bg-white)', border: '1px solid var(--color-border)', borderRadius: 'var(--border-radius-md)', boxShadow: 'var(--box-shadow-sm)', padding: '14px 16px' }}>
                  <span style={{ flexShrink: 0, width: 24, height: 24, borderRadius: '50%', background: 'var(--color-accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'var(--font-size-sm2)', fontWeight: 800 }}>{i + 1}</span>
                  <p style={{ margin: 0, fontSize: isMobile ? 'var(--font-size-sm2)' : 'var(--font-size-base)', color: 'var(--color-text-sub)', lineHeight: 1.75 }}>{ja ? b.ja : b.en}</p>
                </Reveal>
              ))}
            </div>
          </section>

          {/* ── 機能 ── */}
          <section style={{ marginBottom: isMobile ? 'var(--spacing-xl)' : 48 }}>
            <h2 style={{ fontSize: isMobile ? 'var(--font-size-h3)' : 'var(--font-size-h2)', fontWeight: 800, color: 'var(--color-text-main)', margin: '0 0 var(--spacing-md)', letterSpacing: '-0.3px', borderLeft: '4px solid var(--color-accent)', paddingLeft: 'var(--spacing-sm)' }}>
              {ja ? '無限ノックでできること' : 'What You Can Do'}
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 14 }}>
              {FEATURES.map((f, i) => (
                <Reveal key={i} delay={i * 70} style={{ background: 'var(--color-bg-white)', border: '1px solid var(--color-border)', borderRadius: 'var(--border-radius-md)', boxShadow: 'var(--box-shadow-sm)', padding: '18px 16px' }}>
                  <div style={{ fontSize: 'var(--font-size-sm2)', fontWeight: 800, color: 'var(--color-primary)', marginBottom: 'var(--spacing-sm)' }}>{ja ? f.ja_title : f.en_title}</div>
                  <p style={{ margin: 0, fontSize: isMobile ? 'var(--font-size-sm)' : 'var(--font-size-sm2)', color: 'var(--color-text-sub)', lineHeight: 1.75 }}>{ja ? f.ja : f.en}</p>
                </Reveal>
              ))}
            </div>
          </section>

          {/* ── 開発の意図・目的 ── */}
          <section>
            <h2 style={{ fontSize: isMobile ? 'var(--font-size-h3)' : 'var(--font-size-h2)', fontWeight: 800, color: 'var(--color-text-main)', margin: '0 0 var(--spacing-md)', letterSpacing: '-0.3px', borderLeft: '4px solid var(--color-accent)', paddingLeft: 'var(--spacing-sm)' }}>
              {ja ? 'なぜ作ったのか' : 'Why I Built This'}
            </h2>
            <Reveal style={{ background: 'var(--color-bg-white)', border: '1px solid var(--color-border)', borderLeft: '4px solid var(--color-accent)', borderRadius: 'var(--border-radius-lg)', boxShadow: 'var(--box-shadow-sm)', padding: isMobile ? 'var(--spacing-md)' : 'var(--spacing-lg) var(--spacing-xl)', lineHeight: 1.95 }}>
              <p style={{ margin: '0 0 var(--spacing-md)', fontSize: isMobile ? 'var(--font-size-base)' : 'var(--font-size-lg)', fontWeight: 700, color: 'var(--color-text-main)' }}>
                {ja
                  ? 'AWS認定 SAP を持つ、いちエンジニアです。いまはAWS全12資格の制覇に挑んでいます。'
                  : 'I\'m an engineer with the AWS Certified Solutions Architect – Professional (SAP), now taking on all 12 AWS certifications.'}
              </p>
              <p style={{ margin: '0 0 var(--spacing-md)', fontSize: isMobile ? 'var(--font-size-sm2)' : 'var(--font-size-base)', color: 'var(--color-text-sub)' }}>
                {ja
                  ? '正直に言うと、既存の問題演習サービスにずっと不満がありました。開くたびに待たされるロード。何百問解いても「あなたの弱点はここ」と教えてくれない作り。どこか不自然な日本語。そして、いつの間にか古くなった情報。——「本当に欲しい教材はこれじゃない」。その苛立ちが限界を超えて、"なら自分で作る" とキーボードを叩き始めました。'
                  : 'Honestly, I was fed up with the practice services out there. Loads that make you wait. Hundreds of questions, yet nothing tells you where you\'re actually weak. Japanese that reads a little off. Content that quietly goes stale. "This isn\'t the study tool I want." That frustration boiled over — so I started building the one I did.'}
              </p>
              <p style={{ margin: '0 0 var(--spacing-sm)', fontSize: isMobile ? 'var(--font-size-sm2)' : 'var(--font-size-base)', color: 'var(--color-text-sub)' }}>
                {ja ? 'だから無限ノックは、その不満のひとつひとつに答えを用意しました。' : 'So Mugenknock answers every one of those frustrations, head-on.'}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)', margin: '0 0 var(--spacing-md)' }}>
                {[
                  { p: ['ロードが遅い', 'Slow loading'], s: ['待たせない表示速度', 'Loads that never make you wait'] },
                  { p: ['弱点分析が甘い', 'Weak personalization'], s: ['解くほど穴が見える弱点特化', 'Weak-point focus that sharpens as you solve'] },
                  { p: ['日本語が不自然', 'Awkward Japanese'], s: ['自然で読みやすい日本語', 'Natural, readable Japanese'] },
                  { p: ['情報が古い', 'Outdated content'], s: ['最新試験に合わせて作り直し', 'Rebuilt to match the current exams'] },
                ].map((row, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: isMobile ? 'var(--font-size-xs)' : 'var(--font-size-sm)', color: 'var(--color-text-light)', textDecoration: 'line-through' }}>{ja ? row.p[0] : row.p[1]}</span>
                    <span style={{ color: 'var(--color-accent)', fontWeight: 800, flexShrink: 0 }}>→</span>
                    <span style={{ fontSize: isMobile ? 'var(--font-size-sm2)' : 'var(--font-size-base)', color: 'var(--color-text-main)', fontWeight: 700 }}>{ja ? row.s[0] : row.s[1]}</span>
                  </div>
                ))}
              </div>
              <p style={{ margin: 0, fontSize: isMobile ? 'var(--font-size-sm2)' : 'var(--font-size-base)', color: 'var(--color-text-main)', fontWeight: 700 }}>
                {ja
                  ? 'まだ全冠していません。少なくとも自分が獲り切るまで、この教材は磨き続けます。同じ悔しさを知っている人は、遠慮なく相乗りしてください。一緒にノックしましょう。'
                  : 'I haven\'t earned them all yet. At least until I do, I\'ll keep sharpening this tool. If you know the same frustration, hop on — let\'s knock these out together.'}
              </p>
              <p style={{ margin: 'var(--spacing-md) 0 0', textAlign: 'right', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-light)' }}>
                {ja ? '— 無限ノック 開発者' : '— The developer, Mugenknock'}
              </p>
            </Reveal>
          </section>

        </div>
      </main>

      <footer style={{ padding: '14px var(--spacing-lg)', textAlign: 'center', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-light)', borderTop: '1px solid var(--color-border)', background: 'var(--color-bg-white)' }}>
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
            <a href="/about#privacy" style={{ color: 'var(--color-primary)', fontSize: 'var(--font-size-sm)' }}>
              {ja ? '詳細' : 'Learn more'}
            </a>
          </span>
          <button
            onClick={acceptCookies}
            style={{ flexShrink: 0, padding: '6px 18px', background: 'var(--color-accent)', color: 'var(--color-btn-primary-text)', border: 'none', borderRadius: 'var(--border-radius-full)', fontWeight: 700, fontSize: 'var(--font-size-sm)', cursor: 'pointer' }}
          >
            {ja ? '同意して閉じる' : 'Accept'}
          </button>
        </div>
      )}
    </div>
  );
}
