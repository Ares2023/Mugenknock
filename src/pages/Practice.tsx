import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { API_ENDPOINT, EXAM_CONFIGS, PASS_SCORES } from '../constants';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function ExamConfirmModal({ targetExam, lang, onConfirm, onCancel, loading }: {
  targetExam: string; lang: string; onConfirm: () => void; onCancel: () => void; loading: boolean;
}) {
  const cfg = EXAM_CONFIGS[targetExam];
  const ja = lang === 'ja';
  const rules = ja
    ? ['タイマーは開始後にカウントダウン', '正誤は全問終了後に確認', '途中で一時停止・再開が可能', 'AI確認済み問題・未回答問題のみ出題']
    : ['Timer counts down after start', 'Results shown after finishing all questions', 'You can pause and resume', 'Only AI-verified and unanswered questions'];
  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div style={{ background: 'var(--color-bg-white)', borderRadius: 'var(--border-radius-lg)', padding: '28px 28px 24px', width: '100%', maxWidth: 440, boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 'var(--font-size-h3)', fontWeight: 700, color: 'var(--color-text-main)' }}>
          {ja ? '模試を開始しますか？' : 'Start Mock Exam?'}
        </h3>
        <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)', marginBottom: 20 }}>{cfg.fullName}</div>
        <div style={{ display: 'flex', gap: 24, marginBottom: 20, flexWrap: 'wrap' }}>
          <div><div style={{ fontSize: 11, color: 'var(--color-text-light)', marginBottom: 2 }}>{ja ? '問題数' : 'Questions'}</div><div style={{ fontWeight: 700, fontSize: 'var(--font-size-lg)' }}>{cfg.totalQuestions}<span style={{ fontSize: 12, fontWeight: 400 }}>{ja ? '問' : ' Q'}</span></div></div>
          <div><div style={{ fontSize: 11, color: 'var(--color-text-light)', marginBottom: 2 }}>{ja ? '制限時間' : 'Time Limit'}</div><div style={{ fontWeight: 700, fontSize: 'var(--font-size-lg)' }}>{cfg.timeLimitMin}<span style={{ fontSize: 12, fontWeight: 400 }}>{ja ? '分' : ' min'}</span></div></div>
          <div><div style={{ fontSize: 11, color: 'var(--color-text-light)', marginBottom: 2 }}>{ja ? '合格点' : 'Pass Score'}</div><div style={{ fontWeight: 700, fontSize: 'var(--font-size-lg)' }}>{PASS_SCORES[targetExam]}</div></div>
        </div>
        <div style={{ background: 'var(--color-bg-main)', borderRadius: 'var(--border-radius-md)', padding: '10px 14px', marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-sub)', marginBottom: 6 }}>{ja ? 'ルール' : 'Rules'}</div>
          {rules.map((r, i) => (
            <div key={i} style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)', display: 'flex', gap: 6, alignItems: 'flex-start', marginBottom: i < rules.length - 1 ? 4 : 0 }}>
              <span style={{ color: 'var(--color-primary)', flexShrink: 0, marginTop: 1 }}>•</span>
              <span>{r}</span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="primary" onClick={onConfirm} disabled={loading} style={{ flex: 1 }}>
            {loading ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 12, height: 12, border: '2px solid rgba(0,0,0,0.3)', borderTopColor: '#16191f', borderRadius: '50%', animation: 'sherpa-spin 0.7s linear infinite' }} />{ja ? '準備中...' : 'Preparing...'}</span> : (ja ? '開始する' : 'Start')}
          </Button>
          <Button variant="outline" onClick={onCancel} disabled={loading}>{ja ? 'キャンセル' : 'Cancel'}</Button>
        </div>
      </div>
    </div>
  );
}

const IconCustomExercise = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>
);

const IconMockExam = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="5" y="2" width="14" height="20" rx="2"/>
    <path d="M9 7h6M9 11h6M9 15h4"/>
    <circle cx="17" cy="18" r="3" fill="none"/>
    <path d="M20 21l-1.5-1.5"/>
  </svg>
);

export default function Practice() {
  const { user } = useAuth();
  const { lang } = useLanguage();
  const navigate = useNavigate();
  const ja = lang === 'ja';

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [targetExam, setTargetExam] = useState<string | null>(() => localStorage.getItem('targetExam'));
  const [showExamConfirm, setShowExamConfirm] = useState(false);
  const [examLoading, setExamLoading] = useState(false);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => setTargetExam((e as CustomEvent).detail);
    window.addEventListener('targetExamChanged', handler);
    return () => window.removeEventListener('targetExamChanged', handler);
  }, []);

  const startExam = async () => {
    if (!targetExam) return;
    const cfg = EXAM_CONFIGS[targetExam];
    setExamLoading(true);
    try {
      const userId = user?.userId ?? 'guest';
      const params = new URLSearchParams({ examType: targetExam, withAnswers: 'true', withValidity: 'true' });
      const data = await fetch(`${API_ENDPOINT}/questions?${params}`).then(r => r.json());
      let items: any[] = (data.items ?? []).filter((q: any) => !!q.validityCheckedAt);
      if (user) {
        const res = await fetch(`${API_ENDPOINT}/users/me/answered-questions?userId=${userId}&examType=${targetExam}`).then(r => r.json());
        const answered = new Set(res.questionIds ?? []);
        items = items.filter((q: any) => !answered.has(q.questionId));
      }
      items = shuffleArray(items).slice(0, cfg.totalQuestions);
      if (items.length === 0) {
        alert(ja ? '条件に合う問題がありません（AI確認済み・未回答問題が0件）' : 'No questions match');
        setExamLoading(false); setShowExamConfirm(false); return;
      }
      const sessionRes = await fetch(`${API_ENDPOINT}/sessions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, mode: 'exam', examType: targetExam, questionIds: items.map((q: any) => q.questionId) }),
      });
      const sessionData = await sessionRes.json();
      navigate('/exam/session', { state: { sessionId: sessionData.sessionId, questions: items, userId, examType: targetExam, isMini: false } });
    } catch (err) {
      console.error(err);
      alert(ja ? '模試の開始に失敗しました' : 'Failed to start exam');
    } finally { setExamLoading(false); setShowExamConfirm(false); }
  };

  const cards = [
    {
      key: 'custom',
      Icon: IconCustomExercise,
      title: ja ? 'カスタム演習' : 'Custom Exercise',
      description: ja
        ? '出題ドメイン・問題数・フィルター条件を自分で設定して演習できます。苦手分野の集中練習に最適です。'
        : 'Set your own domain, question count, and filters. Great for focused practice on weak areas.',
      action: () => navigate('/exercise/setup'),
      actionLabel: ja ? 'カスタム演習を始める →' : 'Start Custom Exercise →',
      disabled: false,
    },
    {
      key: 'exam',
      Icon: IconMockExam,
      title: ja ? '模試' : 'Mock Exam',
      description: ja
        ? '本番と同じ形式・問題数・制限時間で模擬試験を受けられます。AI確認済みの未回答問題からランダム出題されます。'
        : 'Take a mock exam in the same format as the real test. Questions are randomly picked from AI-verified unanswered items.',
      action: () => { if (targetExam) setShowExamConfirm(true); },
      actionLabel: ja ? '模試を開始する →' : 'Start Mock Exam →',
      disabled: !targetExam,
    },
  ];

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 'var(--spacing-lg)' }} className="page-container">
      <div style={{ marginBottom: 'var(--spacing-lg)' }}>
        <h2 style={{ margin: '0 0 4px', fontSize: 'var(--font-size-h2)', fontWeight: 800, color: 'var(--color-text-main)' }}>
          {ja ? '演習・テスト' : 'Practice & Tests'}
        </h2>
        <p style={{ margin: 0, fontSize: 'var(--font-size-sm)', color: 'var(--color-text-light)' }}>
          {ja ? '試験対策の演習モードを選択してください' : 'Choose a practice mode for your exam preparation'}
        </p>
      </div>

      {!targetExam && (
        <div style={{ marginBottom: 'var(--spacing-md)', padding: '10px 14px', background: 'var(--color-primary-light)', border: '1px solid var(--color-primary)', borderRadius: 'var(--border-radius-md)', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-main)' }}>
          {ja ? '模試を利用するには、サイドメニューから試験を選択してください。' : 'To use Mock Exam, select your target exam from the sidebar.'}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 'var(--spacing-md)' }}>
        {cards.map(({ key, Icon, title, description, action, actionLabel, disabled }) => (
          <Card key={key} padding="var(--spacing-lg)">
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 12 }}>
              <div style={{
                width: 52, height: 52, borderRadius: 14, flexShrink: 0,
                background: disabled ? 'var(--color-bg-main)' : 'var(--color-primary-light)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: disabled ? 'var(--color-text-light)' : 'var(--color-primary)',
              }}>
                <Icon />
              </div>
              <div>
                <h3 style={{ margin: '0 0 6px', fontSize: 'var(--font-size-md)', fontWeight: 700, color: 'var(--color-text-main)' }}>
                  {title}
                </h3>
                <p style={{ margin: 0, fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)', lineHeight: 1.7 }}>
                  {description}
                </p>
              </div>
              <div style={{ marginTop: 'auto', paddingTop: 4 }}>
                <Button
                  variant={disabled ? 'outline' : 'primary'}
                  fullWidth
                  disabled={disabled}
                  onClick={action}
                >
                  {actionLabel}
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {showExamConfirm && targetExam && (
        <ExamConfirmModal
          targetExam={targetExam}
          lang={lang}
          onConfirm={startExam}
          onCancel={() => setShowExamConfirm(false)}
          loading={examLoading}
        />
      )}
    </div>
  );
}
