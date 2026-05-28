import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { PASS_SCORES, PASS_RATE, API_ENDPOINT, EXAM_DOMAINS, DOMAIN_NAME_EN } from '../constants';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import { getServiceLinks } from '../awsServiceLinks';
import { IconChevronDown, IconChevronRight, IconSparkles } from '../components/Icons';

const QUICK_PREFS_KEY = 'quickExercisePrefs';
const loadQuickPrefs = () => { try { return JSON.parse(localStorage.getItem(QUICK_PREFS_KEY) ?? '{}'); } catch { return {}; } };
function shuffleArray<T>(arr: T[]): T[] { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

export default function Result() {
  const navigate = useNavigate();
  const location = useLocation();
  const { results, questions, score, isPassed, examType, mode, timeUp, isQuick, isMini, aborted, earnedPts } = location.state as any;
  const { user } = useAuth();

  const resolvedExamType = examType ?? questions?.[0]?.examType ?? 'SAA';
  const basePassScore = PASS_SCORES[resolvedExamType];
  const basePassRate = PASS_RATE[resolvedExamType];
  const passScore = isMini ? Math.ceil(basePassScore / 5) : basePassScore;
  const passRate = isMini ? Math.ceil(basePassRate / 5) : basePassRate;
  const isExam = mode === 'exam';

  const { lang, t } = useLanguage();
  const ja = lang === 'ja';
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [quickLoading, setQuickLoading] = useState(false);

  const restartQuick = async () => {
    setQuickLoading(true);
    const qPrefs = loadQuickPrefs();
    try {
      const userId = user?.userId ?? 'guest';
      const params = new URLSearchParams({ examType: resolvedExamType, withAnswers: 'true', withValidity: 'true' });
      const data = await fetch(`${API_ENDPOINT}/questions?${params}`).then(r => r.json());
      let items: any[] = (data.items ?? []).filter((q: any) => !!q.validityCheckedAt);
      if (user && (qPrefs.unansweredOnly || qPrefs.incorrectOnly || qPrefs.bookmarkOnly)) {
        const [answeredRes, incorrectRes, bkmRes] = await Promise.all([
          qPrefs.unansweredOnly ? fetch(`${API_ENDPOINT}/users/me/answered-questions?userId=${userId}&examType=${resolvedExamType}`).then(r => r.json()) : null,
          qPrefs.incorrectOnly  ? fetch(`${API_ENDPOINT}/users/me/incorrect-questions?userId=${userId}&examType=${resolvedExamType}`).then(r => r.json()) : null,
          qPrefs.bookmarkOnly   ? fetch(`${API_ENDPOINT}/users/me/bookmarks?userId=${userId}`).then(r => r.json()) : null,
        ]);
        if (qPrefs.unansweredOnly && answeredRes) { const s = new Set(answeredRes.questionIds ?? []); items = items.filter((q: any) => !s.has(q.questionId)); }
        if (qPrefs.incorrectOnly  && incorrectRes) { const s = new Set(incorrectRes.questionIds ?? []); items = items.filter((q: any) => s.has(q.questionId)); }
        if (qPrefs.bookmarkOnly   && bkmRes)       { const s = new Set(bkmRes.questionIds ?? []);      items = items.filter((q: any) => s.has(q.questionId)); }
      }
      items = shuffleArray(items).slice(0, qPrefs.questionCount ?? 5);
      if (items.length === 0) { alert(ja ? '条件に合う問題がありません' : 'No questions match the criteria'); return; }
      const sessionRes = await fetch(`${API_ENDPOINT}/sessions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, mode: 'exercise', examType: resolvedExamType, questionIds: items.map((q: any) => q.questionId) }) });
      const sessionData = await sessionRes.json();
      navigate('/aws/exercise/session', { state: { sessionId: sessionData.sessionId, questions: items, userId, mode: 'exercise', examType: resolvedExamType, isQuick: true } });
    } catch (err) { console.error(err); alert(ja ? '演習の開始に失敗しました' : 'Failed to start exercise'); }
    finally { setQuickLoading(false); }
  };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 'var(--spacing-xl) var(--spacing-lg)' }} className="result-container">
      <h2 style={{ fontSize: 'var(--font-size-xxl)', fontWeight: 700, margin: '0 0 var(--spacing-xl)', color: 'var(--color-text-main)' }}>
        {isExam ? t('result.examResult') : t('result.exerciseResult')}
      </h2>

      {/* スコアカード */}
      <Card
        padding="var(--spacing-xl) var(--spacing-lg)"
        style={{
          textAlign: 'center',
          background: isPassed ? 'var(--color-primary-light)' : 'var(--color-feedback-incorrect-bg)',
          borderColor: isPassed ? 'var(--color-primary)' : 'var(--color-danger)',
          marginBottom: 'var(--spacing-xl)',
        }}
      >
        {timeUp && <Badge variant="danger" style={{ marginBottom: 'var(--spacing-md)' }}>{t('result.timeUp')}</Badge>}
        {aborted && <Badge variant="warning" style={{ marginBottom: 'var(--spacing-md)' }}>{ja ? '中断採点' : 'Interrupted'}</Badge>}
        <p style={{ fontSize: 64, fontWeight: 700, color: isPassed ? 'var(--color-primary)' : 'var(--color-danger)', margin: 0 }}>{score}%</p>
        <p style={{ fontSize: 'var(--font-size-xxl)', fontWeight: 700, color: isPassed ? 'var(--color-primary)' : 'var(--color-danger)', margin: 'var(--spacing-sm) 0' }}>
          {isPassed ? t('result.passed') : t('result.failed')}
        </p>
        <p style={{ color: 'var(--color-text-sub)', fontSize: 'var(--font-size-base)', margin: 'var(--spacing-sm) 0 var(--spacing-xs)' }}>
          {t('result.passLine')}: <strong>{passRate}%</strong>
          <span style={{ marginLeft: 12 }}>{t('result.officialScore', { score: passScore })}</span>
        </p>
        <p style={{ color: 'var(--color-text-main)', marginTop: 'var(--spacing-md)', fontSize: 'var(--font-size-lg)', fontWeight: 700 }}>
          {t('result.correctCount', { correct: results.filter((r: any) => r.isCorrect).length, total: questions.length })}
        </p>
        {earnedPts > 0 && (
          <p style={{ color: '#009E9E', fontWeight: 800, fontSize: 'var(--font-size-base)', marginTop: 8 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><IconSparkles size={16} /> {ja ? `+${earnedPts}pt 獲得！` : `+${earnedPts}pt earned!`}</span>
          </p>
        )}
      </Card>

      {/* ドメイン別スコア内訳 */}
      {(() => {
        const domains = EXAM_DOMAINS[resolvedExamType] ?? [];
        const breakdown = domains.map(domain => {
          const indices = questions.reduce((acc: number[], q: any, i: number) => {
            if ((q.tags ?? []).includes(domain)) acc.push(i);
            return acc;
          }, []);
          const correct = indices.filter((i: number) => results[i]?.isCorrect).length;
          return { domain, correct, total: indices.length };
        }).filter(d => d.total > 0);

        if (breakdown.length === 0) return null;

        const weakest = [...breakdown].sort((a, b) => (a.correct / a.total) - (b.correct / b.total))[0];
        const showGuide = weakest && (weakest.correct / weakest.total) < 0.7;

        return (
          <Card padding="var(--spacing-lg)" style={{ marginBottom: 'var(--spacing-xl)' }}>
            <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-text-sub)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 'var(--spacing-md)' }}>
              {ja ? 'ドメイン別スコア' : 'Domain Breakdown'}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {breakdown.map(({ domain, correct, total }) => {
                const pct = Math.round((correct / total) * 100);
                const label = lang === 'en' ? (DOMAIN_NAME_EN[domain] ?? domain) : domain;
                const color = pct >= 70 ? 'var(--color-success)' : pct >= 50 ? '#f59e0b' : 'var(--color-danger)';
                return (
                  <div key={domain}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                      <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-main)', flex: 1, marginRight: 8, lineHeight: 1.4 }}>{label}</span>
                      <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 700, color, flexShrink: 0 }}>
                        {pct}%
                        <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 400, color: 'var(--color-text-light)', marginLeft: 4 }}>
                          {correct}/{total}
                        </span>
                      </span>
                    </div>
                    <div style={{ height: 6, background: 'var(--color-bg-main)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{
                        width: `${pct}%`, height: '100%', borderRadius: 3,
                        background: color,
                        transformOrigin: 'left center',
                        animation: 'growWidth 0.5s cubic-bezier(0.34,1.56,0.64,1) both',
                      }} />
                    </div>
                  </div>
                );
              })}
            </div>
            {showGuide && !isExam && (
              <div style={{ marginTop: 'var(--spacing-md)', paddingTop: 'var(--spacing-md)', borderTop: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)', flex: 1 }}>
                  {ja
                    ? `「${weakest.domain}」を重点的に演習しましょう`
                    : `Focus on "${DOMAIN_NAME_EN[weakest.domain] ?? weakest.domain}" next`}
                </span>
                <Button variant="outline" size="sm"
                  onClick={() => navigate('/aws/exercise/setup', { state: { domain: weakest.domain } })}>
                  {ja ? '集中演習する →' : 'Practice this domain →'}
                </Button>
              </div>
            )}
          </Card>
        );
      })()}

      {/* 問題ごとの結果 */}
      <h3 style={{ fontSize: 'var(--font-size-h2)', fontWeight: 700, margin: '0 0 var(--spacing-lg)', color: 'var(--color-text-main)' }}>{t('result.perQuestion')}</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
        {questions.map((q: any, i: number) => {
          const result = results[i];
          const isCorrect = result?.isCorrect;
          const expanded = expandedId === q.questionId;

          return (
            <Card
              key={q.questionId}
              padding={0}
              style={{
                borderLeft: `8px solid ${isCorrect ? 'var(--color-success)' : 'var(--color-danger)'}`,
                overflow: 'hidden',
              }}
            >
              {/* ヘッダー行 */}
              <div
                onClick={() => setExpandedId(expanded ? null : q.questionId)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--spacing-md)',
                  padding: '12px 16px',
                  cursor: 'pointer',
                  background: expanded ? 'var(--color-bg-main)' : 'var(--color-bg-white)',
                  transition: 'all 0.2s',
                }}
              >
                <span style={{ color: 'var(--color-text-sub)', flexShrink: 0, display: 'flex' }}>{expanded ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}</span>
                <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)', flexShrink: 0, minWidth: 40, fontWeight: 700 }}>{t('result.qLabel')} {i + 1}</span>
                <span style={{ flex: 1, fontSize: 'var(--font-size-base)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--color-text-main)' }}>
                  {q.questionText}
                </span>
                <Badge variant={isCorrect ? 'success' : 'danger'}>
                  {isCorrect ? t('result.correct') : t('result.incorrect')}
                </Badge>
              </div>

              {/* 展開：選択肢・解説 */}
              {expanded && (
                <div style={{ padding: 'var(--spacing-lg) var(--spacing-xl)', borderTop: '1px solid var(--color-border)', background: 'var(--color-bg-main)', fontSize: 'var(--font-size-base)' }}>
                  <div style={{ marginBottom: 'var(--spacing-lg)', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
                    {q.choices?.map((c: string, ci: number) => {
                      const correct = q.correctAnswers?.includes(c);
                      const label = ['A', 'B', 'C', 'D', 'E'][ci];
                      return (
                        <div key={c} style={{
                          padding: '10px 16px',
                          borderRadius: 'var(--border-radius-md)',
                          background: correct ? 'var(--color-feedback-correct-bg)' : 'var(--color-bg-white)',
                          border: `1px solid ${correct ? 'var(--color-success)' : 'var(--color-border)'}`,
                          color: correct ? 'var(--color-success)' : 'var(--color-text-main)',
                          fontWeight: correct ? 700 : 400,
                          fontSize: 'var(--font-size-sm)',
                          display: 'flex', alignItems: 'flex-start', gap: 8,
                        }}>
                          <span style={{ fontWeight: 700, flexShrink: 0 }}>{label}.</span>
                          <span style={{ whiteSpace: 'pre-wrap' }}>{correct ? '✓ ' : ''}{c}</span>
                        </div>
                      );
                    })}
                  </div>
                  {q.explanation && (
                    <div style={{
                      background: 'var(--color-primary-light)',
                      borderRadius: 'var(--border-radius-md)',
                      padding: '16px 20px',
                      color: 'var(--color-text-main)',
                      lineHeight: 1.6
                    }}>
                      <strong style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-primary)' }}>{t('result.explanation')}</strong>
                      <div style={{ marginTop: 8, fontSize: 'var(--font-size-sm)', overflowWrap: 'break-word', wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>{lang === 'en' && q.explanationEn ? q.explanationEn : q.explanation}</div>
                      {(() => {
                        const links = getServiceLinks(q.tags ?? []);
                        if (links.length === 0) return null;
                        return (
                          <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--color-border)', display: 'flex', flexWrap: 'wrap', gap: '6px 10px', alignItems: 'center' }}>
                            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-light)', flexShrink: 0 }}>
                              {lang === 'ja' ? 'AWS公式' : 'AWS Docs'}:
                            </span>
                            {links.map((link: { label: string; url: string }) => (
                              <a key={link.url} href={link.url} target="_blank" rel="noopener noreferrer"
                                style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-info)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 3,
                                  padding: '2px 8px', borderRadius: 20, border: '1px solid var(--color-border-info)', background: 'var(--color-bg-info)', whiteSpace: 'nowrap' }}>
                                {link.label} ↗
                              </a>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: 'var(--spacing-md)', marginTop: 'var(--spacing-xl)' }}>
        <Button variant="outline" onClick={() => navigate('/aws/')}>
          {t('result.backHome')}
        </Button>
        {isQuick ? (
          <Button variant="primary" disabled={quickLoading} onClick={restartQuick}>
            {quickLoading ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 14, height: 14, border: '2px solid rgba(0,0,0,0.2)', borderTopColor: '#16191f', borderRadius: '50%', animation: 'sherpa-spin 0.7s linear infinite', flexShrink: 0 }} />
                {ja ? '準備中...' : 'Loading...'}
              </span>
            ) : (ja ? 'もう一度（サクッと演習）' : 'Again (Quick)')}
          </Button>
        ) : (
          <Button variant="primary" onClick={() => navigate(isExam ? '/aws/exam/setup' : '/aws/exercise/setup')}>
            {t('result.retry')}
          </Button>
        )}
      </div>
    </div>
  );
}
