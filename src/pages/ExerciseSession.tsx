import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { API_ENDPOINT, PASS_RATE } from '../constants';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import ReportModal from '../components/ReportModal';

type Tip = { tipId: string; title: string; content: string; examType: string };

type Question = {
  questionId: string;
  examType: string;
  questionText: string;
  choices: string[];
  correctAnswers?: string[];
  explanation?: string;
  tags: string[];
  isMultiple: boolean;
  validityCheckedAt?: string;
  updatedAt?: string;
  createdAt?: string;
};

const CopyButton = ({ getText }: { getText: () => string }) => {
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);
  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(getText()).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <Button
      onClick={handleCopy}
      variant={copied ? 'primary' : 'outline'}
      size="sm"
      style={{ padding: '2px 10px', fontSize: 'var(--font-size-xs)' }}
    >
      {copied ? t('exerciseSession.copied') : t('exerciseSession.copy')}
    </Button>
  );
};

export default function ExerciseSession() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as any;
  const { user } = useAuth();
  const { lang, t } = useLanguage();

  const sessionId: string = state?.sessionId ?? '';
  const questions: Question[] = state?.questions ?? [];
  const userId: string = state?.userId ?? '';
  const examType: string = state?.examType ?? '';

  const [currentIndex, setCurrentIndex] = useState<number>(state?.resumeIndex ?? 0);
  const [selectedAnswers, setSelectedAnswers] = useState<string[]>(state?.resumeSelectedAnswers ?? []);
  const [answered, setAnswered] = useState<boolean>(state?.resumeAnswered ?? false);
  const [detail, setDetail] = useState<Question | null>(state?.resumeDetail ?? null);
  const [tips, setTips] = useState<Tip[]>([]);
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set());
  const [bookmarkLoading, setBookmarkLoading] = useState(false);
  const [currentTip, setCurrentTip] = useState<Tip | null>(null);

  useEffect(() => {
    fetch(`${API_ENDPOINT}/tips?examType=${examType}`)
      .then(r => r.json())
      .then(d => setTips(d.items ?? []))
      .catch(() => {});
  }, [examType]);

  useEffect(() => {
    if (tips.length === 0) return;
    setCurrentTip(tips[Math.floor(Math.random() * tips.length)]);
  }, [currentIndex, tips]);

  useEffect(() => {
    document.querySelector('main')?.scrollTo({ top: 0 });
  }, [currentIndex]);

  useEffect(() => {
    if (!userId) return;
    fetch(`${API_ENDPOINT}/users/me/bookmarks?userId=${userId}`)
      .then(r => r.json())
      .then(d => setBookmarkedIds(new Set(d.questionIds ?? [])))
      .catch(() => {});
  }, [userId]);

  const toggleBookmark = async () => {
    const qid = currentQuestion.questionId;
    const isBookmarked = bookmarkedIds.has(qid);
    setBookmarkLoading(true);
    try {
      if (isBookmarked) {
        await fetch(`${API_ENDPOINT}/questions/${qid}/bookmark?userId=${userId}`, { method: 'DELETE' });
        setBookmarkedIds(prev => { const next = new Set(prev); next.delete(qid); return next; });
      } else {
        await fetch(`${API_ENDPOINT}/questions/${qid}/bookmark`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId }),
        });
        setBookmarkedIds(prev => { const next = new Set(prev); next.add(qid); return next; });
      }
    } catch (err) { console.error(err); }
    setBookmarkLoading(false);
  };
  const [results, setResults] = useState<{ questionId: string; isCorrect: boolean }[]>(state?.resumeResults ?? []);
  const [loading, setLoading] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  // ドラフト保存
  useEffect(() => {
    if (!sessionId) return;
    try {
      localStorage.setItem('exerciseDraft', JSON.stringify({
        sessionId, examType, questions, userId,
        currentIndex, results, answered, selectedAnswers, detail,
      }));
    } catch { /* quota over 等は無視 */ }
  }, [currentIndex, results]); // eslint-disable-line react-hooks/exhaustive-deps

  const currentQuestion = questions[currentIndex];

  const shuffledChoices = useMemo(() => {
    if (!currentQuestion?.choices) return [];
    const arr = [...currentQuestion.choices];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }, [currentQuestion?.questionId]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchDetail = async (questionId: string): Promise<Question> => {
    const res = await fetch(`${API_ENDPOINT}/questions/${questionId}`);
    const data = await res.json();
    setDetail(data);
    return data;
  };

  const [lastSelected, setLastSelected] = useState<string | null>(null);

  useEffect(() => {
    if (!state) navigate('/exercise/setup', { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!state) return null;

  const toggleAnswer = (choice: string) => {
    if (answered) return;
    setLastSelected(choice);
    if (currentQuestion.isMultiple) {
      setSelectedAnswers(prev =>
        prev.includes(choice) ? prev.filter(a => a !== choice) : [...prev, choice]
      );
    } else {
      setSelectedAnswers([choice]);
    }
  };

  const submitAnswer = async () => {
    if (selectedAnswers.length === 0) return;
    setLoading(true);
    const fetched = await fetchDetail(currentQuestion.questionId);
    const correctAnswers = fetched.correctAnswers || [];
    const isCorrect = correctAnswers.length === selectedAnswers.length &&
      correctAnswers.every(a => selectedAnswers.includes(a));

    try {
      await fetch(`${API_ENDPOINT}/sessions/${sessionId}/answers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          questionId: currentQuestion.questionId,
          selectedAnswers,
          isCorrect,
          tags: currentQuestion.tags
        })
      });
    } catch (err) { console.error(err); }

    setResults(prev => [...prev, { questionId: currentQuestion.questionId, isCorrect }]);
    setAnswered(true);
    setLoading(false);
  };

  const nextQuestion = async () => {
    if (currentIndex + 1 >= questions.length) {
      const score = Math.round((results.filter(r => r.isCorrect).length / questions.length) * 100);
      const passRate = PASS_RATE[examType] ?? PASS_RATE['SAA'];
      const isPassed = score >= passRate;
      try {
        await fetch(`${API_ENDPOINT}/sessions/${sessionId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, status: 'completed', score, isPassed })
        });
      } catch (err) { console.error(err); }
      localStorage.removeItem('exerciseDraft');
      navigate('/result', { state: { results, questions, score, isPassed, sessionId, userId, examType } });
    } else {
      setCurrentIndex(prev => prev + 1);
      setSelectedAnswers([]);
      setAnswered(false);
      setDetail(null);
    }
  };

  const getChoiceStyle = (choice: string): React.CSSProperties => {
    const base: React.CSSProperties = {
      padding: 'var(--spacing-md) var(--spacing-lg)',
      marginBottom: 'var(--spacing-sm)',
      borderRadius: 'var(--border-radius-md)',
      cursor: answered ? 'default' : 'pointer',
      border: '1px solid',
      display: 'flex',
      alignItems: 'center',
      width: '100%',
      textAlign: 'left',
      fontSize: 'var(--font-size-base)',
      transition: 'all 0.15s ease',
      background: 'var(--color-bg-white)',
      borderColor: 'var(--color-border)',
    };
    if (!answered) {
      const selected = selectedAnswers.includes(choice);
      return {
        ...base,
        borderColor: selected ? 'var(--color-primary)' : 'var(--color-border)',
        background: selected ? 'var(--color-primary-light)' : 'var(--color-bg-white)',
        boxShadow: selected ? '0 0 0 1px var(--color-primary)' : 'none',
        fontWeight: selected ? 700 : 400,
      };
    }
    const correctAnswers = detail?.correctAnswers || [];
    const isCorrect = correctAnswers.includes(choice);
    const isSelected = selectedAnswers.includes(choice);

    if (isCorrect) {
      return { ...base, borderColor: 'var(--color-success)', background: '#f2fcf3', fontWeight: 700, color: 'var(--color-success)' };
    }
    if (isSelected && !isCorrect) {
      return { ...base, borderColor: 'var(--color-danger)', background: '#fdf3f1', fontWeight: 700, color: 'var(--color-danger)' };
    }
    return { ...base, borderColor: 'var(--color-border)', background: 'var(--color-bg-main)', color: 'var(--color-text-sub)' };
  };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 'var(--spacing-xl) var(--spacing-lg)' }} className="session-container">

      <Card padding="var(--spacing-xl)">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-lg)' }}>
          <h1 style={{ fontSize: 'var(--font-size-h2)', fontWeight: 700, margin: 0, color: 'var(--color-text-main)' }}>
            {t('exerciseSession.qLabel')} {currentIndex + 1}
            <span style={{ fontWeight: 400, fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)', marginLeft: 'var(--spacing-md)' }}>
              {t('exerciseSession.totalQ', { n: questions.length })}
            </span>
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)' }}>
            {user && (
              <button
                onClick={toggleBookmark}
                disabled={bookmarkLoading}
                title={bookmarkedIds.has(currentQuestion.questionId) ? t('exerciseSession.removeBookmark') : t('exerciseSession.bookmark')}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center',
                  opacity: bookmarkLoading ? 0.5 : 1, transition: 'all 0.2s',
                }}
              >
                <span style={{ fontSize: 20, lineHeight: 1, color: bookmarkedIds.has(currentQuestion.questionId) ? 'var(--color-warning, #f59e0b)' : 'var(--color-text-light)' }}>
                  {bookmarkedIds.has(currentQuestion.questionId) ? '★' : '☆'}
                </span>
              </button>
            )}
            <Badge variant="secondary">{currentQuestion.examType}</Badge>
          </div>
        </div>

        <div style={{ marginBottom: 'var(--spacing-xl)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--spacing-sm)', gap: 'var(--spacing-md)' }}>
            <div>
              {currentQuestion.isMultiple && (
                <Badge variant="outline">{t('exerciseSession.multiple')}</Badge>
              )}
            </div>
            <CopyButton getText={() => currentQuestion.questionText} />
          </div>
          <p style={{ fontSize: 'var(--font-size-lg)', lineHeight: 1.6, fontWeight: 400, margin: 0, color: 'var(--color-text-main)' }}>
            {lang === 'en' && (currentQuestion as any).questionTextEn ? (currentQuestion as any).questionTextEn : currentQuestion.questionText}
          </p>
        </div>

        <div style={{ marginBottom: 'var(--spacing-xl)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--spacing-sm)' }}>
            <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)', fontWeight: 700 }}>{t('exerciseSession.choices')}</span>
            <CopyButton getText={() => shuffledChoices.join('\n')} />
          </div>
          {shuffledChoices.map((choice: string) => (
            <button
              key={choice}
              onClick={() => toggleAnswer(choice)}
              style={getChoiceStyle(choice)}
              className={lastSelected === choice && selectedAnswers.includes(choice) && !answered ? 'choice-select-anim' : ''}
            >
              <span style={{
                width: 18, height: 18, border: '1px solid var(--color-text-sub)',
                borderRadius: currentQuestion.isMultiple ? 2 : '50%',
                marginRight: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: selectedAnswers.includes(choice) ? 'var(--color-primary)' : 'var(--color-bg-white)',
                borderColor: selectedAnswers.includes(choice) ? 'var(--color-primary)' : 'var(--color-text-sub)',
                flexShrink: 0
              }}>
                {selectedAnswers.includes(choice) && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'white' }} />}
              </span>
              {choice}
            </button>
          ))}
        </div>

        {answered && detail && (
          <div className="fade-slide-in" style={{
            background: results[results.length - 1]?.isCorrect ? '#f2fcf3' : '#fdf3f1',
            borderLeft: `8px solid ${results[results.length - 1]?.isCorrect ? 'var(--color-success)' : 'var(--color-danger)'}`,
            padding: '16px 20px', marginBottom: 'var(--spacing-xl)',
            borderRadius: 'var(--border-radius-sm)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--spacing-sm)', gap: 'var(--spacing-md)' }}>
              <h3 style={{
                margin: 0, fontSize: 'var(--font-size-md)',
                color: results[results.length - 1]?.isCorrect ? 'var(--color-success)' : 'var(--color-danger)',
                display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)'
              }}>
                {results[results.length - 1]?.isCorrect ? t('exerciseSession.correct') : t('exerciseSession.incorrect')}
              </h3>
              <CopyButton getText={() =>
                `${t('exerciseSession.correctAnswer')}${detail.correctAnswers?.join(', ')}\n\n${t('exerciseSession.explanation')}\n${detail.explanation ?? ''}`
              } />
            </div>
            <p style={{ margin: '0 0 12px', fontSize: 'var(--font-size-base)' }}>
              <strong>{t('exerciseSession.correctAnswer')}</strong>{detail.correctAnswers?.join(', ')}
            </p>
            <div style={{ fontSize: 'var(--font-size-base)', lineHeight: 1.6 }}>
              <strong>{t('exerciseSession.explanation')}</strong>
              <div style={{ marginTop: 4 }}>{lang === 'en' && (detail as any).explanationEn ? (detail as any).explanationEn : detail.explanation}</div>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)', borderTop: '1px solid var(--color-border)', paddingTop: 'var(--spacing-lg)' }}>
          {!answered ? (
            <Button
              onClick={submitAnswer}
              disabled={selectedAnswers.length === 0 || loading}
              variant="primary"
              style={{ minWidth: 120 }}
            >
              {loading ? t('exerciseSession.answering') : t('exerciseSession.answer')}
            </Button>
          ) : (
            <Button
              onClick={nextQuestion}
              variant="outline"
              style={{ minWidth: 120 }}
            >
              {currentIndex + 1 >= questions.length ? t('exerciseSession.showResult') : t('exerciseSession.next')}
            </Button>
          )}
          <button
            onClick={() => setReportOpen(true)}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, color: 'var(--color-text-light)', fontSize: 'var(--font-size-sm)', padding: '4px 8px', borderRadius: 'var(--border-radius-sm)', transition: 'all 0.2s' }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-danger)'; e.currentTarget.style.background = '#fdf3f1'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-text-light)'; e.currentTarget.style.background = 'none'; }}
            title={lang === 'ja' ? '問題の不備を通報' : 'Report an issue'}
          >
            <span style={{ fontSize: 14 }}>⚑</span>
            <span>{lang === 'ja' ? '通報' : 'Report'}</span>
          </button>
        </div>

        {/* メタデータ */}
        <div style={{ marginTop: 'var(--spacing-md)', paddingTop: 'var(--spacing-sm)', borderTop: '1px dashed var(--color-border)', display: 'flex', flexWrap: 'wrap', gap: 'var(--spacing-lg)', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-light)' }}>
          <span>
            {lang === 'ja' ? 'AI確認' : 'AI review'}:{' '}
            <strong style={{ color: currentQuestion.validityCheckedAt ? 'var(--color-text-sub)' : 'inherit' }}>
              {currentQuestion.validityCheckedAt
                ? new Date(currentQuestion.validityCheckedAt).toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' })
                : (lang === 'ja' ? '未確認' : 'not reviewed')}
            </strong>
          </span>
          <span>
            {lang === 'ja' ? '最終編集' : 'Last edited'}:{' '}
            <strong style={{ color: (currentQuestion.updatedAt || currentQuestion.createdAt) ? 'var(--color-text-sub)' : 'inherit' }}>
              {(currentQuestion.updatedAt || currentQuestion.createdAt)
                ? new Date((currentQuestion.updatedAt || currentQuestion.createdAt)!).toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' })
                : '-'}
            </strong>
          </span>
        </div>
      </Card>

      {reportOpen && (
        <ReportModal
          questionId={currentQuestion.questionId}
          userId={userId}
          lang={lang}
          onClose={() => setReportOpen(false)}
        />
      )}

      {/* コラム（豆知識） */}
      {currentTip && (
        <div style={{ marginTop: 'var(--spacing-xl)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)', marginBottom: 'var(--spacing-sm)' }}>
            <span style={{
              background: '#b85c00', color: 'white',
              fontSize: 10, fontWeight: 700, letterSpacing: '1.5px',
              padding: '3px 10px', borderRadius: 'var(--border-radius-sm)',
            }}>COLUMN</span>
            <span style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
          </div>
          <Card
            padding="var(--spacing-md) var(--spacing-lg)"
            style={{ borderLeft: '4px solid var(--color-accent)' }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--spacing-md)' }}>
              <span style={{ fontSize: 24, lineHeight: 1, flexShrink: 0 }}>📖</span>
              <div>
                <p style={{ fontWeight: 700, color: 'var(--color-text-main)', margin: '0 0 var(--spacing-sm)', fontSize: 'var(--font-size-base)' }}>
                  {currentTip.title}
                </p>
                <p style={{ color: 'var(--color-text-sub)', margin: 0, fontSize: 'var(--font-size-sm)', lineHeight: 1.8 }}>
                  {currentTip.content}
                </p>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
