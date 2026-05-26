import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import { API_ENDPOINT, EXAM_CONFIGS, PASS_RATE } from '../constants';
import { deleteCached } from '../utils/cache';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import ReportModal from '../components/ReportModal';

const WAKARANAI = 'わからない';
const stripLabel = (s: string) => s.replace(/^[A-E]\.\s*/, '');

type Question = {
  questionId: string;
  examType: string;
  questionText: string;
  choices: string[];
  correctAnswers?: string[];
  correctAnswerIndices?: number[];
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

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

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
      localStorage.setItem(`examDraft_${userId}`, JSON.stringify({
        sessionId, examType, questions, userId, isMini,
        currentIndex, answers, timeLeft: timeLeftRef.current, savedAt: Date.now(),
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

  const CHOICE_LABELS = ['A', 'B', 'C', 'D', 'E'];

  const shuffledIndices = useMemo(() => {
    if (!currentQ?.choices) return [];
    const idx = currentQ.choices
      .map((_: unknown, i: number) => i)
      .filter((i: number) => currentQ.choices[i] !== WAKARANAI);
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
    if (choice === WAKARANAI) {
      setAnswers(prev => ({ ...prev, [qid]: cur.includes(WAKARANAI) ? [] : [WAKARANAI] }));
    } else if (currentQ.isMultiple) {
      setAnswers(prev => ({
        ...prev,
        [qid]: cur.includes(choice) ? cur.filter(c => c !== choice) : [...cur.filter(c => c !== WAKARANAI), choice]
      }));
    } else {
      setAnswers(prev => ({ ...prev, [qid]: [choice] }));
    }
  };

  const handleNext = () => {
    const isWakaranai = selected.includes(WAKARANAI);
    if (!isWakaranai && currentQ.isMultiple && currentQ.correctAnswerCount && selected.length > 0 &&
        selected.length !== currentQ.correctAnswerCount) {
      setAnswerCountError(lang === 'ja'
        ? `${currentQ.correctAnswerCount}つ選択してください（現在${selected.length}つ）`
        : `Select ${currentQ.correctAnswerCount} answers (currently ${selected.length})`);
      return;
    }
    setCurrentIndex(i => Math.min(questions.length - 1, i + 1));
  };

  const handleAbortAndGrade = async () => {
    if (finishedRef.current) return;
    const answeredQs = questions.filter((q: Question) => !!answers[q.questionId]);
    if (answeredQs.length === 0) return;
    finishedRef.current = true;
    setShowAbortConfirm(false);
    setSubmitting(true);
    setPaused(false);
    localStorage.removeItem(`examDraft_${userId}`);
    try {
      const abortResults = answeredQs.map((q: Question) => {
        const userAns = answers[q.questionId] ?? [];
        const correctIdx = q.correctAnswerIndices;
        const correct = q.correctAnswers ?? [];
        const isCorrect = correctIdx && correctIdx.length > 0
          ? (() => {
              const userOrigIdx = userAns.map((t: string) => q.choices.indexOf(t));
              return correctIdx.length === userOrigIdx.length && correctIdx.every((i: number) => userOrigIdx.includes(i));
            })()
          : correct.length === userAns.length && correct.every((a: string) => userAns.map(stripLabel).includes(stripLabel(a)));
        return { questionId: q.questionId, isCorrect, userAns, tags: q.tags ?? [] };
      });
      await Promise.all(abortResults.map(r =>
        fetch(`${API_ENDPOINT}/sessions/${sessionId}/answers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, questionId: r.questionId, selectedAnswers: r.userAns, isCorrect: r.isCorrect, tags: r.tags }),
        }).catch(() => {})
      ));
      const correctCount = abortResults.filter(r => r.isCorrect).length;
      const score = Math.round((correctCount / abortResults.length) * 100);
      const isPassed = score >= PASS_RATE[examType];
      await fetch(`${API_ENDPOINT}/sessions/${sessionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, status: 'completed', score, isPassed }),
      });
      const delta: Record<string, { c: number; i: number }> = {};
      for (const r of abortResults) {
        for (const tag of (r.tags ?? [])) {
          if (!delta[tag]) delta[tag] = { c: 0, i: 0 };
          if (r.isCorrect) delta[tag].c++; else delta[tag].i++;
        }
      }
      try {
        const dh: Record<string, { correct: number; total: number }[]> =
          JSON.parse(localStorage.getItem(`domain_history_${examType}_${userId}`) ?? '{}');
        for (const [tag, d] of Object.entries(delta)) {
          if (d.c + d.i === 0) continue;
          if (!dh[tag]) dh[tag] = [];
          dh[tag] = [...dh[tag], { correct: d.c, total: d.c + d.i }].slice(-10);
        }
        localStorage.setItem(`domain_history_${examType}_${userId}`, JSON.stringify(dh));
      } catch {}
      deleteCached(`ustats_${userId}`);
      localStorage.setItem(`postSessionRefresh_${userId}`, String(Date.now()));
      navigate('/aws/result', {
        state: { results: abortResults.map(r => ({ questionId: r.questionId, isCorrect: r.isCorrect })), questions: answeredQs, score, isPassed, sessionId, userId, examType, mode: 'exam', aborted: true },
      });
    } catch (err) {
      console.error(err);
      alert(t('examSession.submitFailed'));
      finishedRef.current = false;
      setSubmitting(false);
    }
  };

  const handleSaveAndExit = () => {
    try {
      localStorage.setItem(`examDraft_${userId}`, JSON.stringify({
        sessionId, examType, questions, userId, isMini,
        currentIndex, answers, timeLeft: timeLeftRef.current, savedAt: Date.now(),
      }));
    } catch {}
    navigate('/aws/practice');
  };

  const handleFinish = async (timeUp = false) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setSubmitting(true);
    setPaused(false);
    localStorage.removeItem(`examDraft_${userId}`);

    try {
      const results = questions.map((q: Question) => {
        const userAns = answers[q.questionId] ?? [];
        const correctIdx = q.correctAnswerIndices;
        const correct = q.correctAnswers ?? [];
        const isCorrect = correctIdx && correctIdx.length > 0
          ? (() => {
              const userOrigIdx = userAns.map(t => q.choices.indexOf(t));
              return correctIdx.length === userOrigIdx.length && correctIdx.every(i => userOrigIdx.includes(i));
            })()
          : correct.length === userAns.length && correct.every(a => userAns.map(stripLabel).includes(stripLabel(a)));
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

      // ドメイン別 delta 計算
      const delta: Record<string, { c: number; i: number }> = {};
      for (const r of results) {
        for (const tag of (r.tags ?? [])) {
          if (!delta[tag]) delta[tag] = { c: 0, i: 0 };
          if (r.isCorrect) delta[tag].c++; else delta[tag].i++;
        }
      }
      // domain_history に追加（直近10セッション、ゲストでも保存）
      try {
        const dh: Record<string, { correct: number; total: number }[]> =
          JSON.parse(localStorage.getItem(`domain_history_${examType}_${userId}`) ?? '{}');
        for (const [tag, d] of Object.entries(delta)) {
          if (d.c + d.i === 0) continue;
          if (!dh[tag]) dh[tag] = [];
          dh[tag] = [...dh[tag], { correct: d.c, total: d.c + d.i }].slice(-10);
        }
        localStorage.setItem(`domain_history_${examType}_${userId}`, JSON.stringify(dh));
      } catch {}
      // セッション完了でキャッシュ破棄 → ホーム画面が最新データをサーバーから再取得
      deleteCached(`ustats_${userId}`);
      localStorage.setItem(`postSessionRefresh_${userId}`, String(Date.now()));
      navigate('/aws/result', {
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
  const [showAbortConfirm, setShowAbortConfirm] = useState(false);

  useEffect(() => {
    if (!state) navigate('/aws/exam/setup', { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!state) return null;

  const answeredCount = Object.keys(answers).length;
  const unansweredCount = questions.length - answeredCount;
  const timerRed = timeLeft < 300; // 5分以下で赤

  if (submitting) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 16 }}>
        <div className="sherpa-spinner" style={{ width: 36, height: 36, borderWidth: 3 }} />
        <div style={{ fontSize: 18, color: 'var(--color-text-sub)' }}>{t('examSession.scoring')}</div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 'var(--spacing-xl) var(--spacing-lg)', paddingBottom: isMobile ? 120 : undefined }} className="session-container">

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

      {/* 中断して採点 確認ダイアログ */}
      {showAbortConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--spacing-md)' }}>
          <Card style={{ maxWidth: 420, width: '100%', boxShadow: 'var(--box-shadow-md)' }} padding="var(--spacing-xl)">
            <div style={{ fontWeight: 700, fontSize: 'var(--font-size-md)', marginBottom: 12, color: 'var(--color-text-main)' }}>
              {lang === 'ja' ? '中断して採点' : 'Interrupt & Grade'}
            </div>
            <div style={{ fontSize: 'var(--font-size-base)', color: 'var(--color-text-sub)', marginBottom: 'var(--spacing-xl)', lineHeight: 1.7 }}>
              {lang === 'ja' ? (
                <>{answeredCount}問の回答を採点します。<br />未回答の{unansweredCount}問は集計されません。</>
              ) : (
                <>{answeredCount} answered question{answeredCount !== 1 ? 's' : ''} will be graded.<br />The remaining {unansweredCount} will not be counted.</>
              )}
            </div>
            <div style={{ display: 'flex', gap: 'var(--spacing-md)', justifyContent: 'flex-end' }}>
              <Button variant="outline" onClick={() => setShowAbortConfirm(false)}>
                {lang === 'ja' ? 'キャンセル' : 'Cancel'}
              </Button>
              <Button variant="primary" onClick={handleAbortAndGrade}>
                {lang === 'ja' ? '採点する' : 'Grade Now'}
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
          <div style={{ display: 'flex', gap: 'var(--spacing-sm)', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)', fontWeight: 700 }}>{currentIndex + 1} / {questions.length}</span>
            <Button variant="outline" size="sm" onClick={handleSaveAndExit}>
              {lang === 'ja' ? '中断' : 'Pause & Save'}
            </Button>
            <Button variant="outline" size="sm" onClick={() => answeredCount > 0 && setShowAbortConfirm(true)}
              style={{ opacity: answeredCount === 0 ? 0.45 : 1, cursor: answeredCount === 0 ? 'default' : 'pointer' }}>
              {lang === 'ja' ? '中断して採点' : 'Grade & End'}
            </Button>
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
          {shuffledIndices.map((ci: number, displayIdx: number) => {
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
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: 'var(--spacing-md) var(--spacing-lg)', marginBottom: 'var(--spacing-sm)', borderRadius: 'var(--border-radius-md)',
                  border: `1px solid ${isSelected ? 'var(--color-primary)' : 'var(--color-border)'}`,
                  background: isSelected ? 'var(--color-primary-light)' : 'var(--color-bg-elevated)',
                  boxShadow: isSelected ? '0 0 0 1px var(--color-primary)' : 'none',
                  cursor: 'pointer', fontSize: 'var(--font-size-base)',
                  color: 'var(--color-text-main)',
                  transition: 'all 0.15s ease'
                }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <input
                    type={currentQ.isMultiple ? 'checkbox' : 'radio'}
                    checked={isSelected}
                    readOnly
                    tabIndex={-1}
                    style={{ margin: 0, marginTop: 3, flexShrink: 0, pointerEvents: 'none', accentColor: 'var(--color-primary)' }}
                  />
                  <span style={{ flex: 1, minWidth: 0, overflowWrap: 'break-word', wordBreak: 'break-word' }}>
                    <strong style={{ marginRight: 2 }}>{CHOICE_LABELS[displayIdx]}.</strong> {stripLabel(choice)}
                  </span>
                </div>
              </button>
            );
          })}
          {(() => {
            const wSelected = selected.includes(WAKARANAI);
            return (
              <button
                onClick={() => toggle(WAKARANAI)}
                style={{
                  display: 'flex', alignItems: 'center', width: '100%', textAlign: 'left',
                  padding: 'var(--spacing-sm) var(--spacing-lg)', marginTop: 'var(--spacing-sm)', borderRadius: 'var(--border-radius-md)',
                  border: `1px ${wSelected ? 'solid' : 'dashed'}`,
                  borderColor: wSelected ? 'var(--color-text-sub)' : 'var(--color-border)',
                  background: wSelected ? 'var(--color-bg-main)' : 'transparent',
                  cursor: 'pointer', fontSize: 'var(--font-size-sm)',
                  color: 'var(--color-text-light)',
                  transition: 'all 0.15s ease',
                }}>
                <span style={{ marginRight: 10, fontSize: 12, flexShrink: 0 }}>？</span>
                <span>{WAKARANAI}</span>
              </button>
            );
          })()}
        </div>

        {/* メタデータ */}
        <div style={{ paddingTop: 'var(--spacing-sm)', borderTop: '1px dashed var(--color-border)', display: 'flex', flexWrap: 'wrap', gap: 'var(--spacing-lg)', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-light)' }}>
          <span>
            {lang === 'ja' ? 'AI確認' : 'AI review'}:{' '}
            {currentQ.validityCheckedAt
              ? <strong style={{ color: 'var(--color-success)' }}>✓ {new Date(currentQ.validityCheckedAt).toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' })}</strong>
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
        {answerCountError && (
          <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 'var(--spacing-sm)' }}>
            <span style={{ color: 'var(--color-danger)', fontSize: 'var(--font-size-sm)' }}>{answerCountError}</span>
          </div>
        )}
      </Card>

      {createPortal(
        isMobile ? (
          <div style={{ position: 'fixed', bottom: 56, left: 0, right: 0, zIndex: 150, padding: '8px 12px', display: 'flex', gap: 8 }}>
            <button
              disabled={currentIndex === 0}
              onClick={() => setCurrentIndex(i => Math.max(0, i - 1))}
              style={{ flex: 1, height: 44, border: '1.5px solid var(--color-primary)', borderRadius: 22, background: 'var(--color-bg-white)', color: 'var(--color-primary)', fontWeight: 600, fontSize: 'var(--font-size-base)', cursor: currentIndex === 0 ? 'default' : 'pointer', opacity: currentIndex === 0 ? 0.4 : 1 }}
            >
              {lang === 'ja' ? '前へ' : 'Prev'}
            </button>
            <button
              disabled={currentIndex === questions.length - 1}
              onClick={handleNext}
              style={{ flex: 1, height: 44, border: '1.5px solid var(--color-primary)', borderRadius: 22, background: 'var(--color-bg-white)', color: 'var(--color-primary)', fontWeight: 600, fontSize: 'var(--font-size-base)', cursor: currentIndex === questions.length - 1 ? 'default' : 'pointer', opacity: currentIndex === questions.length - 1 ? 0.4 : 1 }}
            >
              {lang === 'ja' ? '次へ' : 'Next'}
            </button>
            <button
              onClick={() => setShowConfirm(true)}
              style={{ flex: 1, height: 44, border: 'none', borderRadius: 22, background: 'var(--color-accent)', color: 'var(--color-btn-primary-text)', fontWeight: 600, fontSize: 'var(--font-size-base)', cursor: 'pointer' }}
            >
              {t('examSession.submit')}
            </button>
          </div>
        ) : (
          <div style={{ position: 'fixed', right: 24, bottom: 24, zIndex: 150 }}>
            <button
              onClick={() => setShowConfirm(true)}
              style={{ height: 44, padding: '0 24px', border: 'none', borderRadius: 22, background: 'var(--color-accent)', color: 'var(--color-btn-primary-text)', fontWeight: 600, fontSize: 'var(--font-size-base)', cursor: 'pointer', whiteSpace: 'nowrap', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}
            >
              {t('examSession.submit')}
            </button>
          </div>
        ),
        document.body
      )}

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
