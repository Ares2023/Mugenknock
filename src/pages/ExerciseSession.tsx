import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { API_ENDPOINT, PASS_RATE } from '../constants';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import ReportModal from '../components/ReportModal';
import { getServiceLinks } from '../awsServiceLinks';

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
  correctAnswerCount?: number;
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

const PromptMenu = ({ questionText, choices, explanation }: { questionText: string; choices: string[]; explanation?: string }) => {
  const [open, setOpen] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [infoHovered, setInfoHovered] = useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const items = [
    {
      label: 'この問題に関する詳しい解説を質問',
      text: `以下のAWS認定試験の問題について、詳しく解説してください。\n\n【問題文】\n${questionText}\n\n【選択肢】\n${choices.join('\n')}\n\n正解と各選択肢についての詳細な解説をお願いします。`,
    },
    {
      label: 'この問題の正当性を確認',
      text: `以下のAWS認定試験の問題と解説が適切かどうか確認してください。\n\n【問題文】\n${questionText}\n\n【選択肢】\n${choices.join('\n')}\n\n【解説】\n${explanation ?? ''}\n\nこの問題と解説の内容が正確で適切かどうかを評価してください。`,
    },
  ];

  const copy = (text: string, idx: number) => {
    navigator.clipboard.writeText(text).then(() => {
      setOpen(false);
      setCopiedIdx(idx);
      setTimeout(() => { setCopiedIdx(null); }, 1500);
    });
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      {copiedIdx !== null && (
        <span style={{
          fontSize: 'var(--font-size-xs)', color: 'var(--color-primary)',
          whiteSpace: 'nowrap', animation: 'sherpa-fade-in 0.15s ease',
        }}>
          コピーしました ✓
        </span>
      )}
      {/* info icon */}
      <div
        style={{ position: 'relative', display: 'flex', alignItems: 'center' }}
        onMouseEnter={() => setInfoHovered(true)}
        onMouseLeave={() => setInfoHovered(false)}
      >
        <span style={{
          width: 16, height: 16, borderRadius: '50%', border: '1.5px solid var(--color-text-light)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 10, fontWeight: 700, color: 'var(--color-text-light)',
          cursor: 'default', lineHeight: 1, userSelect: 'none',
        }}>i</span>
        {infoHovered && (
          <div style={{
            position: 'absolute', bottom: '100%', left: 0, marginBottom: 6,
            background: 'rgba(30,30,30,0.88)', color: '#fff',
            fontSize: 11, lineHeight: 1.6, padding: '7px 11px',
            borderRadius: 6, whiteSpace: 'pre-wrap', width: 230,
            pointerEvents: 'none', zIndex: 200,
            boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
          }}>
            {'この問題に関する質問・確認をするためのプロンプト文を生成・コピーできます。'}
          </div>
        )}
      </div>
      <div ref={ref} style={{ position: 'relative' }}>
        <Button onClick={() => setOpen(o => !o)} variant="outline" size="sm" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          質問プロンプト生成
          <span style={{ fontSize: 9 }}>{open ? '▲' : '▼'}</span>
        </Button>
        {open && (
          <div style={{
            position: 'absolute', bottom: '100%', right: 0, marginBottom: 4,
            background: 'var(--color-bg-white)', border: '1px solid var(--color-border)',
            borderRadius: 'var(--border-radius-sm)', boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
            minWidth: 240, zIndex: 100,
          }}>
            {items.map((item, i) => (
              <button
                key={i}
                onClick={() => copy(item.text, i)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px',
                  background: 'none',
                  border: 'none', borderBottom: i === 0 ? '1px solid var(--color-border)' : 'none',
                  cursor: 'pointer', fontSize: 'var(--font-size-sm)',
                  color: 'var(--color-text-main)',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => { if (copiedIdx !== i) e.currentTarget.style.background = 'var(--color-bg-sub, #f5f5f5)'; }}
                onMouseLeave={e => { if (copiedIdx !== i) e.currentTarget.style.background = 'none'; }}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
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
    document.querySelector('main')?.scrollTo({ top: 0 });
  }, [currentIndex]);

  // correctAnswers が事前ロードされていない場合のフォールバックフェッチ + 正解判定の補正
  useEffect(() => {
    const q = questions[currentIndex];
    if (!answered || !q || q.correctAnswers) return;
    fetch(`${API_ENDPOINT}/questions/${q.questionId}`)
      .then(r => r.json())
      .then(d => {
        setDetail(d);
        const correct: string[] = d.correctAnswers ?? [];
        const isCorrect = correct.length === selectedAnswers.length &&
          correct.every((a: string) => selectedAnswers.includes(a));
        setResults(prev => {
          const next = [...prev];
          if (next.length > 0) next[next.length - 1] = { questionId: q.questionId, isCorrect };
          return next;
        });
      })
      .catch(() => {});
  }, [answered, currentIndex]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const [reportOpen, setReportOpen] = useState(false);
  const [answerCountError, setAnswerCountError] = useState<string | null>(null);

  // ドラフト保存
  useEffect(() => {
    if (!sessionId) return;
    try {
      localStorage.setItem('exerciseDraft', JSON.stringify({
        sessionId, examType, questions, userId,
        currentIndex, results, answered, selectedAnswers,
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

  const [lastSelected, setLastSelected] = useState<string | null>(null);

  useEffect(() => {
    if (!state) navigate('/exercise/setup', { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!state) return null;

  const toggleAnswer = (choice: string) => {
    if (answered) return;
    setAnswerCountError(null);
    setLastSelected(choice);
    if (currentQuestion.isMultiple) {
      setSelectedAnswers(prev =>
        prev.includes(choice) ? prev.filter(a => a !== choice) : [...prev, choice]
      );
    } else {
      setSelectedAnswers([choice]);
    }
  };

  const submitAnswer = () => {
    if (selectedAnswers.length === 0) return;
    if (currentQuestion.isMultiple && currentQuestion.correctAnswerCount &&
        selectedAnswers.length !== currentQuestion.correctAnswerCount) {
      setAnswerCountError(lang === 'ja'
        ? `${currentQuestion.correctAnswerCount}つ選択してください（現在${selectedAnswers.length}つ）`
        : `Select ${currentQuestion.correctAnswerCount} answers (currently ${selectedAnswers.length})`);
      return;
    }
    setAnswerCountError(null);

    const correctAnswers = currentQuestion.correctAnswers || [];
    const isCorrect = correctAnswers.length === selectedAnswers.length &&
      correctAnswers.every(a => selectedAnswers.includes(a));

    setResults(prev => [...prev, { questionId: currentQuestion.questionId, isCorrect }]);
    setAnswered(true);

    fetch(`${API_ENDPOINT}/sessions/${sessionId}/answers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        questionId: currentQuestion.questionId,
        selectedAnswers,
        isCorrect,
        tags: currentQuestion.tags
      })
    }).catch(err => console.error(err));
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
      setAnswerCountError(null);
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
    const displayQ = (currentQuestion.correctAnswers ? currentQuestion : detail) ?? currentQuestion;
    // 正解データ未ロードの間は色変えしない（フォールバックフェッチ待ち）
    if (!displayQ.correctAnswers) {
      const selected = selectedAnswers.includes(choice);
      return {
        ...base,
        borderColor: selected ? 'var(--color-primary)' : 'var(--color-border)',
        background: selected ? 'var(--color-primary-light)' : 'var(--color-bg-white)',
        boxShadow: selected ? '0 0 0 1px var(--color-primary)' : 'none',
        fontWeight: selected ? 700 : 400,
        cursor: 'default',
      };
    }
    const correctAnswers = displayQ.correctAnswers;
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
                <Badge variant="outline">
                  {t('exerciseSession.multiple')}{currentQuestion.correctAnswerCount ? ` (${currentQuestion.correctAnswerCount})` : ''}
                </Badge>
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
              <span style={{ flex: 1, minWidth: 0, overflowWrap: 'break-word', wordBreak: 'break-word' }}>{choice}</span>
            </button>
          ))}
        </div>

        {answered && (() => {
          const displayQ = (currentQuestion.correctAnswers ? currentQuestion : detail) ?? currentQuestion;
          const lastResult = results[results.length - 1];
          if (!displayQ.correctAnswers) {
            return (
              <div style={{ padding: '12px 16px', marginBottom: 'var(--spacing-xl)', color: 'var(--color-text-light)', fontSize: 'var(--font-size-sm)' }}>
                {lang === 'ja' ? '解説を読み込み中...' : 'Loading explanation...'}
              </div>
            );
          }
          return (
            <div className="fade-slide-in" style={{
              background: lastResult?.isCorrect ? '#f2fcf3' : '#fdf3f1',
              borderLeft: `8px solid ${lastResult?.isCorrect ? 'var(--color-success)' : 'var(--color-danger)'}`,
              padding: '16px 20px', marginBottom: 'var(--spacing-xl)',
              borderRadius: 'var(--border-radius-sm)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--spacing-sm)', gap: 'var(--spacing-md)' }}>
                <h3 style={{
                  margin: 0, fontSize: 'var(--font-size-md)',
                  color: lastResult?.isCorrect ? 'var(--color-success)' : 'var(--color-danger)',
                  display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)'
                }}>
                  {lastResult?.isCorrect ? t('exerciseSession.correct') : t('exerciseSession.incorrect')}
                </h3>
                <CopyButton getText={() =>
                  `${t('exerciseSession.correctAnswer')}${displayQ.correctAnswers?.join(', ')}\n\n${t('exerciseSession.explanation')}\n${displayQ.explanation ?? ''}`
                } />
              </div>
              <p style={{ margin: '0 0 12px', fontSize: 'var(--font-size-base)' }}>
                <strong>{t('exerciseSession.correctAnswer')}</strong>{displayQ.correctAnswers?.join(', ')}
              </p>
              <div style={{ fontSize: 'var(--font-size-base)', lineHeight: 1.6 }}>
                <strong>{t('exerciseSession.explanation')}</strong>
                <div style={{ marginTop: 4 }}>{lang === 'en' && (displayQ as any).explanationEn ? (displayQ as any).explanationEn : displayQ.explanation}</div>
              </div>
              {(() => {
                const links = getServiceLinks(currentQuestion.tags ?? []);
                if (links.length === 0) return null;
                return (
                  <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(0,0,0,0.08)', display: 'flex', flexWrap: 'wrap', gap: '6px 10px', alignItems: 'center' }}>
                    <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-light)', flexShrink: 0 }}>
                      {lang === 'ja' ? 'AWS公式' : 'AWS Docs'}:
                    </span>
                    {links.map(link => (
                      <a key={link.url} href={link.url} target="_blank" rel="noopener noreferrer"
                        style={{ fontSize: 'var(--font-size-xs)', color: '#0073bb', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 3,
                          padding: '2px 8px', borderRadius: 20, border: '1px solid #b3d9f0', background: '#f0f8ff', whiteSpace: 'nowrap' }}>
                        {link.label} ↗
                      </a>
                    ))}
                  </div>
                );
              })()}
            </div>
          );
        })()}

        {answered && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'var(--spacing-sm)' }}>
            <PromptMenu
              questionText={currentQuestion.questionText}
              choices={shuffledChoices}
              explanation={((currentQuestion.correctAnswers ? currentQuestion : detail) ?? currentQuestion).explanation}
            />
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 'var(--spacing-md)', borderTop: '1px solid var(--color-border)', paddingTop: 'var(--spacing-lg)' }}>
          {!answered ? (
            <>
              <Button
                onClick={submitAnswer}
                disabled={selectedAnswers.length === 0}
                variant="primary"
                style={{ minWidth: 120 }}
              >
                {t('exerciseSession.answer')}
              </Button>
              {answerCountError && (
                <span style={{ color: 'var(--color-danger)', fontSize: 'var(--font-size-sm)' }}>{answerCountError}</span>
              )}
            </>
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

        {/* メタデータ */}
        <div style={{ marginTop: 'var(--spacing-md)', paddingTop: 'var(--spacing-sm)', borderTop: '1px dashed var(--color-border)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--spacing-lg)', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-light)' }}>
          <span>
            {lang === 'ja' ? 'AI確認' : 'AI review'}:{' '}
            {currentQuestion.validityCheckedAt
              ? <strong style={{ color: 'var(--color-success)' }}>✓</strong>
              : <strong>{lang === 'ja' ? '未確認' : 'not reviewed'}</strong>
            }
          </span>
          <span>
            {lang === 'ja' ? '最終編集' : 'Last edited'}:{' '}
            <strong style={{ color: (currentQuestion.updatedAt || currentQuestion.createdAt) ? 'var(--color-text-sub)' : 'inherit' }}>
              {(currentQuestion.updatedAt || currentQuestion.createdAt)
                ? new Date((currentQuestion.updatedAt || currentQuestion.createdAt)!).toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' })
                : '-'}
            </strong>
          </span>
          <button
            onClick={() => setReportOpen(true)}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, color: 'var(--color-text-light)', fontSize: 'var(--font-size-xs)', padding: '2px 6px', borderRadius: 'var(--border-radius-sm)', transition: 'all 0.2s' }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-danger)'; e.currentTarget.style.background = '#fdf3f1'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-text-light)'; e.currentTarget.style.background = 'none'; }}
            title={lang === 'ja' ? '問題の不備を通報' : 'Report an issue'}
          >
            <span style={{ fontSize: 12 }}>⚑</span>
            <span>{lang === 'ja' ? '通報' : 'Report'}</span>
          </button>
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
