import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { API_ENDPOINT, EXAM_CONFIGS, PASS_RATE } from '../constants';
import { deleteCached } from '../utils/cache';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import ReportModal from '../components/ReportModal';

type Question = {
  questionId: string;
  examType: string;
  questionText: string;
  choices: string[];
  correctAnswers?: string[];
  explanation?: string;
  isMultiple: boolean;
  correctAnswerCount?: number;
  tags: string[];
  validityCheckedAt?: string;
  updatedAt?: string;
  createdAt?: string;
};

const formatTime = (sec: number) => {
  const m = Math.floor(sec / 60).toString().padStart(2, '0');
  const s = (sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
};

export default function ExamSession() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as any;
  const { user } = useAuth();
  const { lang, t } = useLanguage();

  const sessionId: string = state?.sessionId ?? '';
  const questions: Question[] = state?.questions ?? [];
  const userId: string = state?.userId ?? '';
  const examType: string = state?.examType ?? '';
  const isMini: boolean = state?.isMini ?? false;
  const config = EXAM_CONFIGS[examType] ?? Object.values(EXAM_CONFIGS)[0];
  const timeLimitMin = isMini ? Math.ceil(config.timeLimitMin / 5) : config.timeLimitMin;
  const totalSec = timeLimitMin * 60;

  const [currentIndex, setCurrentIndex] = useState<number>(state?.resumeIndex ?? 0);
  const [answers, setAnswers] = useState<Record<string, string[]>>(state?.resumeAnswers ?? {});
  const [timeLeft, setTimeLeft] = useState<number>(state?.resumeTimeLeft ?? totalSec);
  const timeLeftRef = useRef<number>(state?.resumeTimeLeft ?? totalSec);
  const [paused, setPaused] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const finishedRef = useRef(false);
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!userId) return;
    fetch(`${API_ENDPOINT}/users/me/bookmarks?userId=${userId}`)
      .then(r => r.json())
      .then(d => setBookmarkedIds(new Set(d.questionIds ?? [])))
      .catch(() => {});
  }, [userId]);

  useEffect(() => {
    document.querySelector('main')?.scrollTo({ top: 0 });
    setAnswerCountError(null);
  }, [currentIndex]);

  const toggleBookmark = async (questionId: string) => {
    const isBookmarked = bookmarkedIds.has(questionId);
    try {
      if (isBookmarked) {
        await fetch(`${API_ENDPOINT}/questions/${questionId}/bookmark?userId=${userId}`, { method: 'DELETE' });
        setBookmarkedIds(prev => { const next = new Set(prev); next.delete(questionId); return next; });
      } else {
        await fetch(`${API_ENDPOINT}/questions/${questionId}/bookmark`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId }),
        });
        setBookmarkedIds(prev => { const next = new Set(prev); next.add(questionId); return next; });
      }
    } catch (err) { console.error(err); }
  };

  // timeLeftRef を常に最新値に保つ
  useEffect(() => { timeLeftRef.current = timeLeft; }, [timeLeft]);

  // 回答・問題移動のたびにドラフト保存
  useEffect(() => {
    if (!sessionId) return;
    try {
      localStorage.setItem('examDraft', JSON.stringify({
        sessionId, examType, questions, userId, isMini,
        currentIndex, answers, timeLeft: timeLeftRef.current,
      }));
    } catch { /* quota over 等は無視 */ }
  }, [answers, currentIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  // タイマー
  useEffect(() => {
    if (paused || timeLeft <= 0 || finishedRef.current) return;
    const id = setInterval(() => setTimeLeft(t => t - 1), 1000);
    return () => clearInterval(id);
  }, [paused, timeLeft]);

  // 時間切れ
  useEffect(() => {
    if (timeLeft <= 0 && !finishedRef.current) handleFinish(true);
  }, [timeLeft]);

  const currentQ = questions[currentIndex];
  const selected = answers[currentQ?.questionId] ?? [];

  const shuffledIndices = useMemo(() => {
    if (!currentQ?.choices) return [];
    const idx = currentQ.choices.map((_: unknown, i: number) => i);
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [idx[i], idx[j]] = [idx[j], idx[i]];
    }
    return idx;
  }, [currentQ?.questionId]); // eslint-disable-line react-hooks/exhaustive-deps

  const [lastSelected, setLastSelected] = useState<string | null>(null);

  const toggle = (choice: string) => {
    const qid = currentQ.questionId;
    const cur = answers[qid] ?? [];
    setAnswerCountError(null);
    setLastSelected(choice);
    if (currentQ.isMultiple) {
      setAnswers(prev => ({
        ...prev,
        [qid]: cur.includes(choice) ? cur.filter(c => c !== choice) : [...cur, choice]
      }));
    } else {
      setAnswers(prev => ({ ...prev, [qid]: [choice] }));
    }
  };

  const handleNext = () => {
    if (currentQ.isMultiple && currentQ.correctAnswerCount && selected.length > 0 &&
        selected.length !== currentQ.correctAnswerCount) {
      setAnswerCountError(lang === 'ja'
        ? `${currentQ.correctAnswerCount}つ選択してください（現在${selected.length}つ）`
        : `Select ${currentQ.correctAnswerCount} answers (currently ${selected.length})`);
      return;
    }
    setCurrentIndex(i => Math.min(questions.length - 1, i + 1));
  };

  const handleFinish = async (timeUp = false) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setSubmitting(true);
    setPaused(false);
    localStorage.removeItem('examDraft');

    try {
      const results = questions.map((q: Question) => {
        const userAns = answers[q.questionId] ?? [];
        const correct = q.correctAnswers ?? [];
        const isCorrect = correct.length === userAns.length && correct.every(a => userAns.includes(a));
        return { questionId: q.questionId, isCorrect, userAns, tags: q.tags ?? [] };
      });

      await Promise.all(results.map(r =>
        fetch(`${API_ENDPOINT}/sessions/${sessionId}/answers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, questionId: r.questionId, selectedAnswers: r.userAns, isCorrect: r.isCorrect, tags: r.tags })
        }).catch(() => {})
      ));

      const correctCount = results.filter(r => r.isCorrect).length;
      const score = Math.round((correctCount / questions.length) * 100);
      const isPassed = score >= PASS_RATE[examType];

      await fetch(`${API_ENDPOINT}/sessions/${sessionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, status: 'completed', score, isPassed })
      });

      deleteCached(`ustats_${userId}`);
      navigate('/result', {
        state: { results: results.map(r => ({ questionId: r.questionId, isCorrect: r.isCorrect })), questions, score, isPassed, sessionId, userId, examType, mode: 'exam', timeUp }
      });
    } catch (err) {
      console.error(err);
      alert(t('examSession.submitFailed'));
      finishedRef.current = false;
      setSubmitting(false);
    }
  };

  const [reportOpen, setReportOpen] = useState(false);
  const [answerCountError, setAnswerCountError] = useState<string | null>(null);

  useEffect(() => {
    if (!state) navigate('/exam/setup', { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!state) return null;

  const answeredCount = Object.keys(answers).length;
  const unansweredCount = questions.length - answeredCount;
  const timerRed = timeLeft < 300; // 5分以下で赤

  if (submitting) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 16 }}>
        <div style={{ fontSize: 18, color: 'var(--color-text-sub)' }}>{t('examSession.scoring')}</div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 'var(--spacing-xl) var(--spacing-lg)' }} className="session-container">

      {/* 一時停止オーバーレイ */}
      {paused && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,28,36,0.8)', zIndex: 1000,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 'var(--spacing-xl)', padding: 'var(--spacing-lg)' }}>
          <div style={{ fontSize: 'var(--font-size-xxl)', color: 'white', fontWeight: 700 }}>{t('examSession.pausedTitle')}</div>
          <div style={{ fontSize: 'var(--font-size-base)', color: 'rgba(255,255,255,0.7)', textAlign: 'center' }}>{t('examSession.pausedNote')}</div>
          <Button variant="primary" size="lg" onClick={() => setPaused(false)}>
            {t('examSession.resume')}
          </Button>
        </div>
      )}

      {/* 確認ダイアログ */}
      {showConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--spacing-md)' }}>
          <Card title={t('examSession.confirmTitle')} style={{ maxWidth: 420, width: '100%', boxShadow: 'var(--box-shadow-md)' }} padding="var(--spacing-xl)">
            <div style={{ fontSize: 'var(--font-size-base)', color: 'var(--color-text-sub)', marginBottom: 'var(--spacing-xl)', lineHeight: 1.6, textAlign: 'center' }}>
              {t('examSession.answered')}: <strong>{answeredCount}</strong> / {questions.length} {lang === 'ja' ? '問' : 'Q'}<br />
              {t('examSession.unanswered')}: <strong style={{ color: unansweredCount > 0 ? 'var(--color-danger)' : 'var(--color-success)' }}>{unansweredCount}</strong> {lang === 'ja' ? '問' : 'Q'}<br /><br />
              {t('examSession.confirmQ')}
            </div>
            <div style={{ display: 'flex', gap: 'var(--spacing-md)', justifyContent: 'center' }}>
              <Button variant="outline" onClick={() => setShowConfirm(false)}>
                {t('examSession.cancel')}
              </Button>
              <Button variant="primary" onClick={() => { setShowConfirm(false); handleFinish(); }}>
                {t('examSession.submit')}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* タイマーバー */}
      <Card padding="var(--spacing-md) var(--spacing-lg)" style={{ marginBottom: 'var(--spacing-lg)' }}>
        <div className="exam-timer-bar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)' }}>
            <Badge variant="secondary">{examType} {t('examSession.mock')}</Badge>
            {isMini && <Badge variant="warning">{lang === 'ja' ? 'ミニ' : 'Mini'}</Badge>}
            <span className="exam-timer-time" style={{ fontSize: 'var(--font-size-xxl)', fontWeight: 700, fontFamily: 'monospace',
              color: timerRed ? 'var(--color-danger)' : 'var(--color-text-main)', transition: 'color 1s', whiteSpace: 'nowrap' }}>
              {formatTime(timeLeft)}
            </span>
            {timerRed && <Badge variant="danger">{t('examSession.timeWarning')}</Badge>}
          </div>
          <div style={{ display: 'flex', gap: 'var(--spacing-lg)', alignItems: 'center' }}>
            <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)', fontWeight: 700 }}>{currentIndex + 1} / {questions.length}</span>
            <Button variant="outline" size="sm" onClick={() => setPaused(true)}>
              {t('examSession.pause')}
            </Button>
          </div>
        </div>
      </Card>

      <Card padding="var(--spacing-xl)" style={{ marginBottom: 'var(--spacing-lg)' }}>
        {/* 問題 */}
        <div style={{ marginBottom: 'var(--spacing-xl)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--spacing-sm)' }}>
            <div>
              {currentQ.isMultiple && (
                <Badge variant="outline">
                  {t('examSession.multiple')}{currentQ.correctAnswerCount ? ` (${currentQ.correctAnswerCount})` : ''}
                </Badge>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
              {user && (
                <button
                  onClick={() => toggleBookmark(currentQ.questionId)}
                  title={bookmarkedIds.has(currentQ.questionId) ? t('examSession.removeBookmark') : t('examSession.bookmark')}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }}
                >
                  <span style={{ fontSize: 20, lineHeight: 1, color: bookmarkedIds.has(currentQ.questionId) ? 'var(--color-warning, #f59e0b)' : 'var(--color-text-light)' }}>
                    {bookmarkedIds.has(currentQ.questionId) ? '★' : '☆'}
                  </span>
                </button>
              )}
              <button
                onClick={() => setReportOpen(true)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, color: 'var(--color-text-light)', fontSize: 'var(--font-size-sm)', padding: '4px 8px', borderRadius: 'var(--border-radius-sm)', transition: 'all 0.2s' }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-danger)'; e.currentTarget.style.background = 'var(--color-feedback-incorrect-bg)'; }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-text-light)'; e.currentTarget.style.background = 'none'; }}
                title={lang === 'ja' ? '問題の不備を通報' : 'Report an issue'}
              >
                <span style={{ fontSize: 14 }}>⚑</span>
                <span>{lang === 'ja' ? '通報' : 'Report'}</span>
              </button>
            </div>
          </div>
          <p style={{ fontSize: 'var(--font-size-lg)', lineHeight: 1.6, fontWeight: 400, margin: 0, color: 'var(--color-text-main)' }}>
            {lang === 'en' && (currentQ as any).questionTextEn ? (currentQ as any).questionTextEn : currentQ.questionText}
          </p>
        </div>

        <div style={{ marginBottom: 'var(--spacing-xl)' }}>
          {shuffledIndices.map((ci: number) => {
            const origChoice = currentQ.choices[ci];
            const choicesEn = (currentQ as any).choicesEn;
            const choice = (lang === 'en' && choicesEn) ? (choicesEn[ci] ?? origChoice) : origChoice;
            const isSelected = selected.includes(origChoice);
            return (
              <button
                key={origChoice}
                onClick={() => toggle(origChoice)}
                className={lastSelected === origChoice && selected.includes(origChoice) ? 'choice-select-anim' : ''}
                style={{
                  display: 'flex', alignItems: 'center', width: '100%', textAlign: 'left',
                  padding: 'var(--spacing-md) var(--spacing-lg)', marginBottom: 'var(--spacing-sm)', borderRadius: 'var(--border-radius-md)',
                  border: `1px solid ${isSelected ? 'var(--color-primary)' : 'var(--color-border)'}`,
                  background: isSelected ? 'var(--color-primary-light)' : 'var(--color-bg-elevated)',
                  boxShadow: isSelected ? '0 0 0 1px var(--color-primary)' : 'none',
                  cursor: 'pointer', fontSize: 'var(--font-size-base)', fontWeight: isSelected ? 700 : 400,
                  color: 'var(--color-text-main)',
                  transition: 'all 0.15s ease'
                }}>
                <span style={{
                  width: 18, height: 18, border: '1.5px solid',
                  borderRadius: currentQ.isMultiple ? 2 : '50%',
                  marginRight: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: isSelected ? 'var(--color-primary)' : 'transparent',
                  borderColor: isSelected ? 'var(--color-primary)' : 'var(--color-text-main)',
                  flexShrink: 0
                }}>
                  {isSelected && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-on-primary)' }} />}
                </span>
                <span style={{ flex: 1, minWidth: 0, overflowWrap: 'break-word', wordBreak: 'break-word' }}>{choice}</span>
              </button>
            );
          })}
        </div>

        {/* メタデータ */}
        <div style={{ paddingTop: 'var(--spacing-sm)', borderTop: '1px dashed var(--color-border)', display: 'flex', flexWrap: 'wrap', gap: 'var(--spacing-lg)', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-light)' }}>
          <span>
            {lang === 'ja' ? 'AI確認' : 'AI review'}:{' '}
            {currentQ.validityCheckedAt
              ? <strong style={{ color: 'var(--color-success)' }}>✓</strong>
              : <strong>{lang === 'ja' ? '未確認' : 'not reviewed'}</strong>
            }
          </span>
          <span>
            {lang === 'ja' ? '最終編集' : 'Last edited'}:{' '}
            <strong style={{ color: (currentQ.updatedAt || currentQ.createdAt) ? 'var(--color-text-sub)' : 'inherit' }}>
              {(currentQ.updatedAt || currentQ.createdAt)
                ? new Date((currentQ.updatedAt || currentQ.createdAt)!).toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' })
                : '-'}
            </strong>
          </span>
        </div>
      </Card>

      {/* ナビゲーションパネル */}
      <Card padding="var(--spacing-lg)">
        <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-sub)', marginBottom: 'var(--spacing-lg)', display: 'flex', gap: 'var(--spacing-lg)', fontWeight: 700 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 12, height: 12, background: 'var(--color-primary-light)', borderRadius: 6, border: '2px solid var(--color-primary)' }} />{t('examSession.current')}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 12, height: 12, background: 'var(--color-text-sub)', borderRadius: 6 }} />{t('examSession.answeredLegend')}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 12, height: 12, background: 'var(--color-bg-elevated)', borderRadius: 6, border: '1px solid var(--color-text-sub)' }} />{t('examSession.unansweredLegend')}
          </span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--spacing-sm)', marginBottom: 'var(--spacing-lg)' }}>
          {questions.map((_: any, i: number) => {
            const isCurrent = i === currentIndex;
            const isAnswered = !!answers[questions[i]?.questionId];
            let bg = 'var(--color-bg-elevated)';
            let color = 'var(--color-text-sub)';
            let border = '1px solid var(--color-text-sub)';
            
            if (isCurrent) {
              bg = 'var(--color-primary-light)';
              color = 'var(--color-primary)';
              border = '2px solid var(--color-primary)';
            } else if (isAnswered) {
              bg = 'var(--color-text-sub)';
              color = 'white';
              border = '1px solid var(--color-text-sub)';
            }

            return (
              <button key={i} onClick={() => setCurrentIndex(i)}
                style={{ width: 36, height: 36, borderRadius: 'var(--border-radius-full)', border,
                  background: bg, color,
                  cursor: 'pointer', fontSize: 'var(--font-size-sm)', fontWeight: isCurrent ? 700 : 400, transition: 'all 0.2s' }}>
                {i + 1}
              </button>
            );
          })}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--color-border)', paddingTop: 'var(--spacing-lg)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)' }}>
            <Button variant="outline" onClick={() => setCurrentIndex(i => Math.max(0, i - 1))} disabled={currentIndex === 0}>
              {t('examSession.prev')}
            </Button>
            <Button variant="outline" onClick={handleNext} disabled={currentIndex === questions.length - 1}>
              {t('examSession.next')}
            </Button>
            {answerCountError && (
              <span style={{ color: 'var(--color-danger)', fontSize: 'var(--font-size-sm)' }}>{answerCountError}</span>
            )}
          </div>
          <Button variant="primary" onClick={() => setShowConfirm(true)}>
            {t('examSession.submit')}
          </Button>
        </div>
      </Card>

      {reportOpen && (
        <ReportModal
          questionId={currentQ.questionId}
          userId={userId}
          lang={lang}
          onClose={() => setReportOpen(false)}
        />
      )}
    </div>
  );
}
