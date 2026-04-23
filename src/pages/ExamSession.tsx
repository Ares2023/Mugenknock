import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { API_ENDPOINT, EXAM_CONFIGS, PASS_RATE } from '../constants';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';

type Question = {
  questionId: string;
  examType: string;
  questionText: string;
  choices: string[];
  correctAnswers?: string[];
  explanation?: string;
  isMultiple: boolean;
  tags: string[];
};

const formatTime = (sec: number) => {
  const m = Math.floor(sec / 60).toString().padStart(2, '0');
  const s = (sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
};

export default function ExamSession() {
  const navigate = useNavigate();
  const location = useLocation();
  const { sessionId, questions, userId, examType } = location.state as any;
  const { user } = useAuth();

  const config = EXAM_CONFIGS[examType];
  const { lang, t } = useLanguage();
  const totalSec = config.timeLimitMin * 60;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [timeLeft, setTimeLeft] = useState(totalSec);
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

  const [lastSelected, setLastSelected] = useState<string | null>(null);

  const toggle = (choice: string) => {
    const qid = currentQ.questionId;
    const cur = answers[qid] ?? [];
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

  const handleFinish = async (timeUp = false) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setSubmitting(true);
    setPaused(false);

    try {
      const details = await Promise.all(
        questions.map((q: Question) =>
          fetch(`${API_ENDPOINT}/questions/${q.questionId}`).then(r => r.json())
        )
      );

      const results: { questionId: string; isCorrect: boolean }[] = [];
      const fullQuestions: Question[] = [];

      for (let i = 0; i < questions.length; i++) {
        const detail: Question = details[i];
        const userAns = answers[detail.questionId] ?? [];
        const correct = detail.correctAnswers ?? [];
        const isCorrect = correct.length === userAns.length && correct.every(a => userAns.includes(a));
        results.push({ questionId: detail.questionId, isCorrect });
        fullQuestions.push({ ...questions[i], ...detail });

        try {
          await fetch(`${API_ENDPOINT}/sessions/${sessionId}/answers`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, questionId: detail.questionId, selectedAnswers: userAns, isCorrect, tags: detail.tags ?? [] })
          });
        } catch { /* ignore individual errors */ }
      }

      const correctCount = results.filter(r => r.isCorrect).length;
      const score = Math.round((correctCount / questions.length) * 100);
      const isPassed = score >= PASS_RATE[examType];

      await fetch(`${API_ENDPOINT}/sessions/${sessionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, status: 'completed', score, isPassed })
      });

      navigate('/result', {
        state: { results, questions: fullQuestions, score, isPassed, sessionId, userId, examType, mode: 'exam', timeUp }
      });
    } catch (err) {
      console.error(err);
      alert(t('examSession.submitFailed'));
      finishedRef.current = false;
      setSubmitting(false);
    }
  };

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
                <Badge variant="outline">{t('examSession.multiple')}</Badge>
              )}
            </div>
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
          </div>
          <p style={{ fontSize: 'var(--font-size-lg)', lineHeight: 1.6, fontWeight: 400, margin: 0, color: 'var(--color-text-main)' }}>
            {lang === 'en' && (currentQ as any).questionTextEn ? (currentQ as any).questionTextEn : currentQ.questionText}
          </p>
        </div>

        <div style={{ marginBottom: 'var(--spacing-xl)' }}>
          {((lang === 'en' && (currentQ as any).choicesEn) ? (currentQ as any).choicesEn : currentQ.choices).map((choice: string, ci: number) => {
            const origChoice = currentQ.choices[ci] ?? choice;
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
                  background: isSelected ? 'var(--color-primary-light)' : 'var(--color-bg-white)',
                  boxShadow: isSelected ? '0 0 0 1px var(--color-primary)' : 'none',
                  cursor: 'pointer', fontSize: 'var(--font-size-base)', fontWeight: isSelected ? 700 : 400,
                  transition: 'all 0.15s ease'
                }}>
                <span style={{
                  width: 18, height: 18, border: '1px solid var(--color-text-sub)',
                  borderRadius: currentQ.isMultiple ? 2 : '50%',
                  marginRight: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: isSelected ? 'var(--color-primary)' : 'var(--color-bg-white)',
                  borderColor: isSelected ? 'var(--color-primary)' : 'var(--color-text-sub)',
                  flexShrink: 0
                }}>
                  {isSelected && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'white' }} />}
                </span>
                {choice}
              </button>
            );
          })}
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
            <span style={{ width: 12, height: 12, background: 'var(--color-bg-white)', borderRadius: 6, border: '1px solid var(--color-border)' }} />{t('examSession.unansweredLegend')}
          </span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--spacing-sm)', marginBottom: 'var(--spacing-lg)' }}>
          {questions.map((_: any, i: number) => {
            const isCurrent = i === currentIndex;
            const isAnswered = !!answers[questions[i]?.questionId];
            let bg = 'var(--color-bg-white)';
            let color = 'var(--color-text-sub)';
            let border = '1px solid var(--color-border)';
            
            if (isCurrent) {
              bg = 'var(--color-primary-light)';
              color = 'var(--color-primary)';
              border = '2px solid var(--color-primary)';
            } else if (isAnswered) {
              bg = 'var(--color-text-sub)';
              color = 'var(--color-bg-white)';
              border = '1px solid var(--color-text-sub)';
            }

            return (
              <button key={i} onClick={() => { setCurrentIndex(i); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                style={{ width: 36, height: 36, borderRadius: 'var(--border-radius-full)', border,
                  background: bg, color,
                  cursor: 'pointer', fontSize: 'var(--font-size-sm)', fontWeight: isCurrent ? 700 : 400, transition: 'all 0.2s' }}>
                {i + 1}
              </button>
            );
          })}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--color-border)', paddingTop: 'var(--spacing-lg)' }}>
          <div style={{ display: 'flex', gap: 'var(--spacing-md)' }}>
            <Button variant="outline" onClick={() => { setCurrentIndex(i => Math.max(0, i - 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); }} disabled={currentIndex === 0}>
              {t('examSession.prev')}
            </Button>
            <Button variant="outline" onClick={() => { setCurrentIndex(i => Math.min(questions.length - 1, i + 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); }} disabled={currentIndex === questions.length - 1}>
              {t('examSession.next')}
            </Button>
          </div>
          <Button variant="primary" onClick={() => setShowConfirm(true)}>
            {t('examSession.submit')}
          </Button>
        </div>
      </Card>
    </div>
  );
}
