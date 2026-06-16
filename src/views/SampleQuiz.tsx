'use client';
import React, { useState, useEffect } from 'react';
import { Helmet } from '@/compat/react-helmet-async';
import { Link, useNavigate, useParams } from '@/compat/react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { IconUser } from '../components/Icons';
import {
  API_ENDPOINT, EXAM_TYPES, EXAM_CONFIGS, EXAM_LEVEL, EXAM_DESC_JA,
  EXAM_DOMAINS, ExamType,
} from '../constants';

const TEAL   = '#009E9E';
const TEAL_D = '#007878';
const TEAL_L = '#e6f7f7';
const TEAL_M = '#b2e8e8';

const LEVEL_ORDER = ['Foundational', 'Associate', 'Professional', 'Specialty'];
const LEVEL_JA: Record<string, string> = {
  Foundational: 'Foundational（基礎）',
  Associate:    'Associate（アソシエイト）',
  Professional: 'Professional（プロフェッショナル）',
  Specialty:    'Specialty（スペシャリティ）',
};

type Question = {
  questionId: string;
  questionText: string;
  choices: string[];
  correctAnswerIndices: number[];
  explanation?: string;
  explanationEn?: string;
  domain?: number;
  examType: string;
};

function ExamList({ isMobile }: { isMobile: boolean }) {
  const grouped = LEVEL_ORDER.map(lv => ({
    level: lv,
    codes: EXAM_TYPES.filter(e => EXAM_LEVEL[e] === lv),
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {grouped.map(({ level, codes }) => (
        <div key={level}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--color-text-sub)', marginBottom: 10 }}>
            {LEVEL_JA[level]}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {codes.map(code => {
              const cfg = EXAM_CONFIGS[code];
              return (
                <Link
                  key={code}
                  to={`/sample/${code}`}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: 'var(--color-bg-white)', border: '1px solid var(--color-border)', borderRadius: 10, padding: '14px 16px', textDecoration: 'none' }}
                >
                  <div>
                    <div style={{ fontWeight: 800, fontSize: isMobile ? 14 : 15, color: TEAL_D }}>{code}</div>
                    <div style={{ fontSize: isMobile ? 11 : 12, color: 'var(--color-text-sub)', marginTop: 2 }}>{cfg.fullName}</div>
                    {EXAM_DESC_JA[code] && (
                      <div style={{ fontSize: 11, color: 'var(--color-text-light)', marginTop: 4 }}>{EXAM_DESC_JA[code]}</div>
                    )}
                  </div>
                  <span style={{ fontSize: 18, color: TEAL, flexShrink: 0 }}>→</span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function QuestionView({ q, index, total, domains }: { q: Question; index: number; total: number; domains: string[] }) {
  const isMobile = window.innerWidth < 768;
  const LABELS = ['A', 'B', 'C', 'D', 'E'];
  const domainName = typeof q.domain === 'number' ? domains[q.domain] : '';
  const isMulti = q.correctAnswerIndices.length > 1;

  return (
    <div style={{ background: 'var(--color-bg-white)', border: '1px solid var(--color-border)', borderRadius: 12, padding: isMobile ? '18px 16px' : '22px 24px', marginBottom: 16 }}>
      {/* ヘッダー */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ background: TEAL_L, color: TEAL_D, fontSize: 11, fontWeight: 700, borderRadius: 4, padding: '2px 8px' }}>
          問 {index + 1} / {total}
        </span>
        {domainName && (
          <span style={{ fontSize: 11, color: 'var(--color-text-light)', background: 'var(--color-bg-main)', borderRadius: 4, padding: '2px 8px' }}>
            {domainName}
          </span>
        )}
        {isMulti && (
          <span style={{ fontSize: 11, color: '#e67e22', fontWeight: 700 }}>複数選択</span>
        )}
      </div>

      {/* 問題文 */}
      <p style={{ fontSize: isMobile ? 14 : 15, lineHeight: 1.75, color: 'var(--color-text-main)', margin: '0 0 16px', whiteSpace: 'pre-wrap' }}>
        {q.questionText}
      </p>

      {/* 選択肢 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        {q.choices.map((choice, ci) => {
          const isCorrect = q.correctAnswerIndices.includes(ci);
          return (
            <div
              key={ci}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 10,
                padding: '10px 14px', borderRadius: 8,
                background: isCorrect ? '#f0fdf4' : 'var(--color-bg-main)',
                border: `2px solid ${isCorrect ? '#16a34a' : 'var(--color-border)'}`,
              }}
            >
              <span style={{ fontWeight: 800, fontSize: 13, color: isCorrect ? '#16a34a' : 'var(--color-text-light)', flexShrink: 0, width: 18 }}>
                {LABELS[ci]}
              </span>
              <span style={{ fontSize: isMobile ? 13 : 14, color: isCorrect ? '#166534' : 'var(--color-text-sub)', lineHeight: 1.6 }}>
                {choice}
              </span>
              {isCorrect && (
                <span style={{ marginLeft: 'auto', flexShrink: 0, fontSize: 13, fontWeight: 700, color: '#16a34a' }}>✓ 正解</span>
              )}
            </div>
          );
        })}
      </div>

      {/* 解説 */}
      {q.explanation && (
        <div style={{ background: TEAL_L, borderRadius: 8, padding: '12px 14px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: TEAL_D, marginBottom: 6 }}>解説</div>
          <p style={{ margin: 0, fontSize: isMobile ? 12 : 13, color: '#333', lineHeight: 1.75, whiteSpace: 'pre-wrap' }}>{q.explanation}</p>
        </div>
      )}
    </div>
  );
}

export default function SampleQuiz({ examParam }: { examParam?: string } = {}) {
  const { exam: examFromParams } = useParams<{ exam?: string }>();
  const exam = examParam ?? examFromParams;
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const examType = exam?.toUpperCase() as ExamType | undefined;
  const isValidExam = examType && EXAM_TYPES.includes(examType as ExamType);
  const cfg = isValidExam ? EXAM_CONFIGS[examType!] : null;
  const domains = isValidExam ? (EXAM_DOMAINS[examType!] ?? []) : [];

  React.useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  useEffect(() => {
    if (!isValidExam) return;
    setLoading(true);
    setError(false);
    fetch(`${API_ENDPOINT}/questions?examType=${examType}&limit=5&shuffle=true&withAnswers=true`)
      .then(r => r.json())
      .then(data => setQuestions(data.items ?? []))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [examType, isValidExam]);

  const title = isValidExam
    ? `${examType} サンプル問題（5問）｜無限ノック`
    : 'サンプル問題｜無限ノック';
  const description = isValidExam
    ? `AWS ${cfg?.fullName}（${examType}）の練習問題を5問体験できます。選択肢・正解・解説付き。無料でお試しください。`
    : 'AWS認定試験（SAA・CLF・SAPなど）のサンプル問題を資格ごとに5問体験できます。正解・解説付き。';

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--color-bg-main)', color: 'var(--color-text-main)', fontFamily: 'inherit' }}>
      <Helmet>
        <title>{title}</title>
        <meta name="description" content={description} />
      </Helmet>

      {/* ── ヘッダー ── */}
      <header style={{ height: 56, minHeight: 56, background: 'var(--color-bg-white)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: isMobile ? '0 12px' : '0 var(--spacing-lg)', zIndex: 200, flexShrink: 0, borderBottom: '1px solid var(--color-border)' }}>
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}>
          <img src="/mugen-icon.png"   alt="無限ノック" style={{ height: 26, width: 'auto' }} />
          <img src="/mugen-header.png" alt=""           style={{ height: 26, width: 'auto' }} />
        </Link>
        <button onClick={() => navigate(user ? '/account' : '/login')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: user ? TEAL_L : 'transparent', border: '1px solid var(--color-border)', borderRadius: '50%', cursor: 'pointer', color: user ? TEAL : 'var(--color-text-sub)', width: 36, height: 36, padding: 0, fontSize: 14, fontWeight: 700 }}>
          {user?.email ? user.email[0].toUpperCase() : <IconUser />}
        </button>
      </header>

      <main style={{ flex: 1 }}>
        <div style={{ maxWidth: 720, margin: '0 auto', padding: isMobile ? '24px 16px' : '40px 32px' }}>

          {/* パンくず */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--color-text-light)', marginBottom: 20 }}>
            <Link to="/" style={{ color: 'var(--color-text-light)', textDecoration: 'none' }}>トップ</Link>
            <span>/</span>
            <Link to="/sample" style={{ color: 'var(--color-text-light)', textDecoration: 'none' }}>サンプル問題</Link>
            {isValidExam && (
              <>
                <span>/</span>
                <span style={{ color: 'var(--color-text-sub)' }}>{examType}</span>
              </>
            )}
          </div>

          {/* ── 資格一覧（examType なし） ── */}
          {!isValidExam && (
            <>
              <h1 style={{ fontSize: isMobile ? 20 : 26, fontWeight: 900, color: TEAL_D, margin: '0 0 8px' }}>
                サンプル問題
              </h1>
              <p style={{ fontSize: isMobile ? 13 : 14, color: 'var(--color-text-sub)', margin: '0 0 28px', lineHeight: 1.7 }}>
                各AWS認定試験の練習問題を5問ずつ体験できます。選択肢・正解・解説付き。アカウント登録不要。
              </p>
              <ExamList isMobile={isMobile} />
            </>
          )}

          {/* ── サンプル問題（examType あり） ── */}
          {isValidExam && (
            <>
              {/* ページタイトル */}
              <div style={{ background: TEAL_L, borderRadius: 12, padding: isMobile ? '18px 16px' : '22px 24px', marginBottom: 28, border: `1px solid ${TEAL_M}` }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: TEAL, marginBottom: 4 }}>
                  {EXAM_LEVEL[examType!]}
                </div>
                <h1 style={{ fontSize: isMobile ? 18 : 22, fontWeight: 900, color: TEAL_D, margin: '0 0 4px' }}>
                  {examType} サンプル問題（5問）
                </h1>
                <p style={{ margin: 0, fontSize: isMobile ? 12 : 13, color: '#555' }}>{cfg?.fullName}</p>
                {EXAM_DESC_JA[examType!] && (
                  <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--color-text-sub)', lineHeight: 1.65 }}>{EXAM_DESC_JA[examType!]}</p>
                )}
              </div>

              {/* 問題 */}
              {loading && (
                <div style={{ textAlign: 'center', padding: '48px 0' }}>
                  <div className="sherpa-spinner" />
                  <p style={{ marginTop: 16, fontSize: 13, color: 'var(--color-text-light)' }}>問題を読み込んでいます…</p>
                </div>
              )}

              {error && (
                <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--color-text-light)' }}>
                  <p>問題の読み込みに失敗しました。</p>
                  <button onClick={() => window.location.reload()} style={{ marginTop: 12, padding: '8px 20px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'transparent', cursor: 'pointer', fontSize: 13 }}>再読み込み</button>
                </div>
              )}

              {!loading && !error && questions.map((q, i) => (
                <QuestionView key={q.questionId} q={q} index={i} total={questions.length} domains={domains} />
              ))}

              {/* CTA */}
              {!loading && !error && questions.length > 0 && (
                <div style={{ background: TEAL_L, borderRadius: 12, padding: isMobile ? '20px 16px' : '24px 28px', marginTop: 8, textAlign: 'center', border: `1px solid ${TEAL_M}` }}>
                  <p style={{ fontSize: isMobile ? 14 : 15, fontWeight: 700, color: TEAL_D, margin: '0 0 6px' }}>
                    {EXAM_TYPES.includes(examType as ExamType) ? `${examType} の問題を本格的に練習する` : '本格的に練習する'}
                  </p>
                  <p style={{ fontSize: 12, color: '#555', margin: '0 0 16px' }}>
                    演習・模試・ドメイン別弱点分析など2,600問以上で学べます
                  </p>
                  <button onClick={() => navigate('/aws/')} style={{ background: TEAL, color: '#fff', border: 'none', borderRadius: 8, padding: '12px 28px', fontSize: 14, fontWeight: 700, cursor: 'pointer', marginBottom: 10 }}>
                    無限ノックで演習を始める →
                  </button>
                  <br />
                  <Link to="/sample" style={{ fontSize: 12, color: TEAL, textDecoration: 'none' }}>他の資格のサンプル問題を見る</Link>
                </div>
              )}
            </>
          )}

        </div>
      </main>

      <footer style={{ padding: '14px var(--spacing-lg)', textAlign: 'center', fontSize: 11, color: 'var(--color-text-light)', borderTop: '1px solid var(--color-border)' }}>
        © {new Date().getFullYear()} MugenKnock
      </footer>
    </div>
  );
}
