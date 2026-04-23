import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { API_ENDPOINT, PASS_RATE } from '../constants';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import { IconBookmark } from '../components/Icons';

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
  const { sessionId, questions, userId, examType } = location.state as any;
  const { user } = useAuth();
  const { lang, t } = useLanguage();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<string[]>([]);
  const [answered, setAnswered] = useState(false);
  const [detail, setDetail] = useState<Question | null>(null);
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
  const [results, setResults] = useState<{ questionId: string; isCorrect: boolean }[]>([]);
  const [loading, setLoading] = useState(false);

  const currentQuestion = questions[currentIndex];

  const fetchDetail = async (questionId: string): Promise<Question> => {
    const res = await fetch(`${API_ENDPOINT}/questions/${questionId}`);
    const data = await res.json();
    setDetail(data);
    return data;
  };

  const toggleAnswer = (choice: string) => {
    if (answered) return;
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
                <IconBookmark filled={bookmarkedIds.has(currentQuestion.questionId)} />
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
            <CopyButton getText={() => currentQuestion.choices.join('\n')} />
          </div>
          {currentQuestion.choices.map((choice: string) => (
            <button key={choice} onClick={() => toggleAnswer(choice)} style={getChoiceStyle(choice)}>
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
          <div style={{
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

        <div style={{ display: 'flex', gap: 'var(--spacing-md)', borderTop: '1px solid var(--color-border)', paddingTop: 'var(--spacing-lg)' }}>
          {!answered ? (
            <Button
              onClick={submitAnswer}
              disabled={selectedAnswers.length === 0 || loading}
              variant="accent"
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
        </div>
      </Card>

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
