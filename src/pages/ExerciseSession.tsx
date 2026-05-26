import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import { API_ENDPOINT, PASS_RATE, EXAM_DOMAINS, DOMAIN_NAME_EN } from '../constants';
import { deleteCached } from '../utils/cache';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import ReportModal from '../components/ReportModal';
import { getServiceLinks } from '../awsServiceLinks';
import { IconBookOpen, IconCopy, IconCheck } from '../components/Icons';

type Tip = { tipId: string; title: string; content: string; examType: string };

const WAKARANAI = 'わからない';
// DBによっては correctAnswers に "B. テキスト" のようなラベル接頭辞が付いている場合がある
const stripLabel = (s: string) => s.replace(/^[A-E]\.\s*/, '');

type Question = {
  questionId: string;
  examType: string;
  questionText: string;
  choices: string[];
  correctAnswers?: string[];
  correctAnswerIndices?: number[];
  explanation?: string;
  tags: string[];
  isMultiple: boolean;
  correctAnswerCount?: number;
  validityCheckedAt?: string;
  updatedAt?: string;
  createdAt?: string;
};

const CopyButton = ({ getText }: { getText: () => string }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(getText()).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button
      onClick={handleCopy}
      title={copied ? 'コピー済み' : 'コピー'}
      style={{
        background: 'none', border: '1px solid var(--color-border)', borderRadius: '50%',
        width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', color: copied ? 'var(--color-success)' : 'var(--color-text-light)',
        transition: 'all 0.2s', flexShrink: 0,
      }}
    >
      {copied ? <IconCheck size={13} /> : <IconCopy size={13} />}
    </button>
  );
};

const PromptMenu = ({ questionText, choices, explanation, lang }: { questionText: string; choices: string[]; explanation?: string; lang: string }) => {
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

  const isEn = lang === 'en';

  const items = isEn ? [
    {
      label: 'Ask for a detailed explanation',
      text: `Please explain the following AWS certification exam question in detail.\n\n[Question]\n${questionText}\n\n[Choices]\n${choices.join('\n')}\n\nPlease provide a detailed explanation of the correct answer and each choice.`,
    },
    {
      label: 'Check question accuracy',
      text: `Please verify whether the following AWS certification exam question and explanation are accurate and appropriate.\n\n[Question]\n${questionText}\n\n[Choices]\n${choices.join('\n')}\n\n[Explanation]\n${explanation ?? ''}\n\nPlease evaluate whether the content of this question and explanation is correct and appropriate.`,
    },
  ] : [
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
          {isEn ? 'Copied ✓' : 'コピーしました ✓'}
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
            {isEn
              ? 'Generate and copy a prompt to ask about or verify this question.'
              : 'この問題に関する質問・確認をするためのプロンプト文を生成・コピーできます。'}
          </div>
        )}
      </div>
      <div ref={ref} style={{ position: 'relative' }}>
        <button
          onClick={() => setOpen(o => !o)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '5px 10px',
            border: `1.5px solid ${open ? 'var(--color-primary)' : 'var(--color-border)'}`,
            borderRadius: 'var(--border-radius-md)',
            background: 'var(--color-bg-white)',
            color: open ? 'var(--color-text-main)' : 'var(--color-text-sub)',
            cursor: 'pointer',
            fontSize: 'var(--font-size-sm)', fontWeight: 600,
            whiteSpace: 'nowrap', transition: 'border-color 0.15s, color 0.15s',
          }}
        >
          {isEn ? 'Generate Prompt' : '質問プロンプト生成'}
          <span style={{ fontSize: 9, color: 'var(--color-primary)' }}>{open ? '▲' : '▼'}</span>
        </button>
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
  const isQuick: boolean = state?.isQuick ?? false;
  const isFocused: boolean = state?.isFocused ?? false;
  const isMini: boolean = state?.isMini ?? false;

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  const [currentIndex, setCurrentIndex] = useState<number>(state?.resumeIndex ?? 0);
  const [selectedAnswers, setSelectedAnswers] = useState<string[]>(state?.resumeSelectedAnswers ?? []);
  const [answered, setAnswered] = useState<boolean>(state?.resumeAnswered ?? false);
  const [detail, setDetail] = useState<Question | null>(null);
  const [tips, setTips] = useState<Tip[]>([]);
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set());
  const [bookmarkLoading, setBookmarkLoading] = useState(false);

  useEffect(() => {
    fetch(`${API_ENDPOINT}/tips?examType=${examType}`)
      .then(r => r.json())
      .then(d => setTips(d.items ?? []))
      .catch(() => {});
  }, [examType]);

  const [currentTip, setCurrentTip] = useState<Tip | null>(null);

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
        const correctIdx: number[] | undefined = d.correctAnswerIndices;
        const correct: string[] = d.correctAnswers ?? [];
        const isCorrect = correctIdx && correctIdx.length > 0
          ? (() => {
              const selOrigIdx = selectedAnswers.map(t => { const si = shuffledChoices.indexOf(t); return si >= 0 ? origIndices[si] : -1; });
              return correctIdx.length === selOrigIdx.length && correctIdx.every(i => selOrigIdx.includes(i));
            })()
          : correct.length === selectedAnswers.length && correct.every((a: string) => selectedAnswers.map(stripLabel).includes(stripLabel(a)));
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
  const [finishing, setFinishing] = useState(false);
  const [judgmentAnim, setJudgmentAnim] = useState<'correct' | 'incorrect' | null>(null);
  const [showAbortConfirm, setShowAbortConfirm] = useState(false);

  // ドラフト保存
  useEffect(() => {
    if (!sessionId) return;
    try {
      const draftKey = isQuick ? `quickExerciseDraft_${userId}` : isFocused ? `focusedExerciseDraft_${userId}` : `practiceExerciseDraft_${userId}`;
      localStorage.setItem(draftKey, JSON.stringify({
        sessionId, examType, questions, userId,
        currentIndex, results, answered, selectedAnswers,
        isQuick, isFocused, savedAt: Date.now(),
      }));
    } catch { /* quota over 等は無視 */ }
  }, [currentIndex, results]); // eslint-disable-line react-hooks/exhaustive-deps

  const currentQuestion = questions[currentIndex];

  const CHOICE_LABELS = ['A', 'B', 'C', 'D', 'E'];

  const { shuffledChoices, origIndices, labelRemap } = useMemo(() => {
    if (!currentQuestion?.choices) return { shuffledChoices: [], origIndices: [] as number[], labelRemap: {} as Record<string, string> };
    const indexed = currentQuestion.choices
      .filter((c: string) => c !== WAKARANAI)
      .map((c: string, i: number) => ({ text: c, origIdx: i, origLabel: CHOICE_LABELS[i] }));
    for (let i = indexed.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indexed[i], indexed[j]] = [indexed[j], indexed[i]];
    }
    const remap: Record<string, string> = {};
    indexed.forEach((item, newIdx) => { remap[item.origLabel] = CHOICE_LABELS[newIdx]; });
    return { shuffledChoices: indexed.map(x => x.text), origIndices: indexed.map(x => x.origIdx), labelRemap: remap };
  }, [currentQuestion?.questionId]); // eslint-disable-line react-hooks/exhaustive-deps

  const remapLabels = (text: string) =>
    text.replace(/(?<![A-Za-z])([A-E])(?![A-Za-z])/g, (_, l) => labelRemap[l] ?? l);

  const [lastSelected, setLastSelected] = useState<string | null>(null);

  useEffect(() => {
    if (!state) navigate('/aws/exercise/setup', { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!state) return null;

  const toggleAnswer = (choice: string) => {
    if (answered) return;
    setAnswerCountError(null);
    setLastSelected(choice);
    if (choice === WAKARANAI) {
      setSelectedAnswers(prev => prev.includes(WAKARANAI) ? [] : [WAKARANAI]);
    } else if (currentQuestion.isMultiple) {
      setSelectedAnswers(prev =>
        prev.includes(choice)
          ? prev.filter(a => a !== choice)
          : [...prev.filter(a => a !== WAKARANAI), choice]
      );
    } else {
      setSelectedAnswers([choice]);
    }
  };

  const submitAnswer = () => {
    if (selectedAnswers.length === 0) return;
    const isWakaranai = selectedAnswers.includes(WAKARANAI);
    if (!isWakaranai && currentQuestion.isMultiple && currentQuestion.correctAnswerCount &&
        selectedAnswers.length !== currentQuestion.correctAnswerCount) {
      setAnswerCountError(lang === 'ja'
        ? `${currentQuestion.correctAnswerCount}つ選択してください（現在${selectedAnswers.length}つ）`
        : `Select ${currentQuestion.correctAnswerCount} answers (currently ${selectedAnswers.length})`);
      return;
    }
    setAnswerCountError(null);

    const correctAnswers = currentQuestion.correctAnswers || [];
    const correctAnswerIndices = currentQuestion.correctAnswerIndices;
    const isCorrect = correctAnswerIndices && correctAnswerIndices.length > 0
      ? (() => {
          const selOrigIdx = selectedAnswers.map(t => { const si = shuffledChoices.indexOf(t); return si >= 0 ? origIndices[si] : -1; });
          return correctAnswerIndices.length === selOrigIdx.length && correctAnswerIndices.every(i => selOrigIdx.includes(i));
        })()
      : correctAnswers.length === selectedAnswers.length && correctAnswers.every(a => selectedAnswers.map(stripLabel).includes(stripLabel(a)));

    setResults(prev => [...prev, { questionId: currentQuestion.questionId, isCorrect }]);
    setAnswered(true);
    setJudgmentAnim(isCorrect ? 'correct' : 'incorrect');
    setTimeout(() => setJudgmentAnim(null), 600);

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
      setFinishing(true);
      const score = Math.round((results.filter(r => r.isCorrect).length / questions.length) * 100);
      const basePassRate = PASS_RATE[examType] ?? PASS_RATE['SAA'];
      const passRate = isMini ? Math.ceil(basePassRate / 5) : basePassRate;
      const isPassed = score >= passRate;
      try {
        await fetch(`${API_ENDPOINT}/sessions/${sessionId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, status: 'completed', score, isPassed })
        });
      } catch (err) { console.error(err); }
      localStorage.removeItem(`quickExerciseDraft_${userId}`);
      localStorage.removeItem(`focusedExerciseDraft_${userId}`);
      localStorage.removeItem(`practiceExerciseDraft_${userId}`);
      // ドメイン別 delta 計算（全ユーザー共通）
      const delta: Record<string, { c: number; i: number }> = {};
      for (const r of results) {
        const q = questions.find((q: Question) => q.questionId === r.questionId);
        for (const tag of (q?.tags ?? [])) {
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
      navigate('/aws/result', { state: { results, questions, score, isPassed, sessionId, userId, examType, isQuick, isMini } });
    } else {
      setCurrentIndex(prev => prev + 1);
      setSelectedAnswers([]);
      setAnswered(false);
      setDetail(null);
      setAnswerCountError(null);
    }
  };

  const handleAbortAndGrade = async () => {
    if (results.length === 0) return;
    setShowAbortConfirm(false);
    setFinishing(true);
    const correctCount = results.filter(r => r.isCorrect).length;
    const score = Math.round((correctCount / results.length) * 100);
    const basePassRate = PASS_RATE[examType] ?? PASS_RATE['SAA'];
    const passRate = isMini ? Math.ceil(basePassRate / 5) : basePassRate;
    const isPassed = score >= passRate;
    try {
      await fetch(`${API_ENDPOINT}/sessions/${sessionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, status: 'completed', score, isPassed }),
      });
    } catch (err) { console.error(err); }
    localStorage.removeItem(`quickExerciseDraft_${userId}`);
    localStorage.removeItem(`focusedExerciseDraft_${userId}`);
    localStorage.removeItem(`practiceExerciseDraft_${userId}`);
    const delta: Record<string, { c: number; i: number }> = {};
    for (const r of results) {
      const q = questions.find((q: Question) => q.questionId === r.questionId);
      for (const tag of (q?.tags ?? [])) {
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
    const answeredQuestions = questions.slice(0, results.length);
    navigate('/aws/result', { state: { results, questions: answeredQuestions, score, isPassed, sessionId, userId, examType, isQuick, isMini, aborted: true } });
  };

  const getChoiceStyle = (choice: string): React.CSSProperties => {
    const base: React.CSSProperties = {
      padding: 'var(--spacing-md) var(--spacing-lg)',
      marginBottom: 'var(--spacing-sm)',
      borderRadius: 'var(--border-radius-md)',
      cursor: answered ? 'default' : 'pointer',
      border: '1px solid',
      display: 'block',
      width: '100%',
      textAlign: 'left',
      fontSize: 'var(--font-size-base)',
      color: 'var(--color-text-main)',
      transition: 'all 0.15s ease',
      background: 'var(--color-bg-elevated)',
      borderColor: 'var(--color-border)',
    };
    if (!answered) {
      const selected = selectedAnswers.includes(choice);
      return {
        ...base,
        borderColor: selected ? 'var(--color-primary)' : 'var(--color-border)',
        background: selected ? 'var(--color-primary-light)' : 'var(--color-bg-elevated)',
        boxShadow: selected ? '0 0 0 1px var(--color-primary)' : 'none',
      };
    }
    const displayQ = (currentQuestion.correctAnswers ? currentQuestion : detail) ?? currentQuestion;
    if (!displayQ.correctAnswers) {
      const selected = selectedAnswers.includes(choice);
      return {
        ...base,
        borderColor: selected ? 'var(--color-primary)' : 'var(--color-border)',
        background: selected ? 'var(--color-primary-light)' : 'var(--color-bg-elevated)',
        boxShadow: selected ? '0 0 0 1px var(--color-primary)' : 'none',
        cursor: 'default',
      };
    }
    const correctAnswers = displayQ.correctAnswers ?? [];
    const correctAnswerIndices = displayQ.correctAnswerIndices;
    const shuffledIdx = shuffledChoices.indexOf(choice);
    const origIdx = shuffledIdx >= 0 ? origIndices[shuffledIdx] : -1;
    const isCorrect = correctAnswerIndices && correctAnswerIndices.length > 0
      ? correctAnswerIndices.includes(origIdx)
      : correctAnswers.map(stripLabel).includes(stripLabel(choice));
    const isSelected = selectedAnswers.includes(choice);

    if (isCorrect) {
      return { ...base, borderColor: 'var(--color-success)', background: 'var(--color-feedback-correct-bg)', color: 'var(--color-success)' };
    }
    if (isSelected && !isCorrect) {
      return { ...base, borderColor: 'var(--color-danger)', background: 'var(--color-feedback-incorrect-bg)', color: 'var(--color-danger)' };
    }
    return { ...base, borderColor: 'var(--color-border)', background: 'var(--color-bg-main)', color: 'var(--color-text-sub)' };
  };

  if (showAbortConfirm) {
    return createPortal(
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <div style={{ background: 'var(--color-bg-white)', borderRadius: 'var(--border-radius-lg)', padding: '28px 24px', width: '100%', maxWidth: 400, boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
          <div style={{ fontWeight: 700, fontSize: 'var(--font-size-md)', marginBottom: 12, color: 'var(--color-text-main)' }}>
            {lang === 'ja' ? '中断して採点' : 'Interrupt & Grade'}
          </div>
          <div style={{ fontSize: 'var(--font-size-base)', color: 'var(--color-text-sub)', marginBottom: 24, lineHeight: 1.7 }}>
            {lang === 'ja'
              ? <>{results.length}問の回答を採点します。<br />未回答の{questions.length - results.length}問は集計されません。</>
              : <>{results.length} answered question{results.length !== 1 ? 's' : ''} will be graded.<br />The remaining {questions.length - results.length} will not be counted.</>}
          </div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <Button variant="outline" onClick={() => setShowAbortConfirm(false)}>
              {lang === 'ja' ? 'キャンセル' : 'Cancel'}
            </Button>
            <Button variant="primary" onClick={handleAbortAndGrade}>
              {lang === 'ja' ? '採点する' : 'Grade Now'}
            </Button>
          </div>
        </div>
      </div>,
      document.body
    );
  }

  if (finishing) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 16 }}>
        <div className="sherpa-spinner" style={{ width: 36, height: 36, borderWidth: 3 }} />
        <div style={{ fontSize: 18, color: 'var(--color-text-sub)' }}>{lang === 'ja' ? '結果を集計中...' : 'Calculating results...'}</div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: isMobile ? 'var(--spacing-sm) 0' : 'var(--spacing-xl) var(--spacing-lg)' }} className="session-container">
      {/* 正誤アニメーション */}
      {judgmentAnim && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 800,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'none',
        }}>
          <div style={{
            width: 110, height: 110,
            borderRadius: '50%',
            background: judgmentAnim === 'correct' ? 'rgba(47,164,79,0.92)' : 'rgba(220,53,69,0.92)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            animation: judgmentAnim === 'correct' ? 'judgment-ok 0.55s ease forwards' : 'judgment-ng 0.55s ease forwards',
            boxShadow: judgmentAnim === 'correct'
              ? '0 0 0 0 rgba(47,164,79,0.4), 0 4px 24px rgba(47,164,79,0.5)'
              : '0 0 0 0 rgba(220,53,69,0.4), 0 4px 24px rgba(220,53,69,0.5)',
          }}>
            <svg width="52" height="52" viewBox="0 0 52 52" fill="none">
              {judgmentAnim === 'correct'
                ? <polyline points="10,27 21,38 42,16" stroke="white" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" />
                : <><line x1="14" y1="14" x2="38" y2="38" stroke="white" strokeWidth="5.5" strokeLinecap="round" /><line x1="38" y1="14" x2="14" y2="38" stroke="white" strokeWidth="5.5" strokeLinecap="round" /></>
              }
            </svg>
          </div>
        </div>
      )}

      {/* 進捗ノード */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginBottom: 'var(--spacing-sm)' }}>
        {questions.map((_, i) => {
          const isCompleted = i < currentIndex;
          const isCurrent = i === currentIndex;
          const result = results[i];
          const bg = isCompleted
            ? (result?.isCorrect ? 'var(--color-success)' : 'var(--color-danger)')
            : isCurrent ? 'var(--color-primary)' : 'var(--color-border)';
          return (
            <div key={i} style={{ flex: 1, height: isCurrent ? 8 : 5, borderRadius: 999, background: bg, transition: 'all 0.2s' }} />
          );
        })}
      </div>

      <Card padding={isMobile ? 'var(--spacing-md) var(--spacing-sm)' : 'var(--spacing-xl)'}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--spacing-lg)' }}>
          <h1 style={{ fontSize: 'var(--font-size-h2)', fontWeight: 700, margin: 0, color: 'var(--color-text-main)' }}>
            {t('exerciseSession.qLabel')} {currentIndex + 1}
          </h1>
          {user && (
            <button
              onClick={toggleBookmark}
              disabled={bookmarkLoading}
              title={bookmarkedIds.has(currentQuestion.questionId) ? t('exerciseSession.removeBookmark') : t('exerciseSession.bookmark')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center', opacity: bookmarkLoading ? 0.5 : 1, transition: 'all 0.2s', flexShrink: 0 }}
            >
              <span style={{ fontSize: 20, lineHeight: 1, color: bookmarkedIds.has(currentQuestion.questionId) ? 'var(--color-warning, #f59e0b)' : 'var(--color-text-light)' }}>
                {bookmarkedIds.has(currentQuestion.questionId) ? '★' : '☆'}
              </span>
            </button>
          )}
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
            <CopyButton getText={() => {
              const choicesText = shuffledChoices.map((c: string, idx: number) => `${CHOICE_LABELS[idx]}. ${stripLabel(c)}`).join('\n');
              return `${currentQuestion.questionText}\n\n${choicesText}`;
            }} />
          </div>
          <p style={{ fontSize: 'var(--font-size-lg)', lineHeight: 1.6, fontWeight: 400, margin: 0, color: 'var(--color-text-main)', overflowWrap: 'break-word', wordBreak: 'break-word', minWidth: 0 }}>
            {lang === 'en' && (currentQuestion as any).questionTextEn ? (currentQuestion as any).questionTextEn : currentQuestion.questionText}
          </p>
        </div>

        <div style={{ marginBottom: 'var(--spacing-xl)' }}>
          <div style={{ marginBottom: 'var(--spacing-sm)' }}>
            <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)', fontWeight: 700 }}>{t('exerciseSession.choices')}</span>
          </div>
          {shuffledChoices.map((choice: string, idx: number) => {
            const isSelected = selectedAnswers.includes(choice);
            return (
              <button
                key={choice}
                onClick={() => toggleAnswer(choice)}
                style={getChoiceStyle(choice)}
                className={lastSelected === choice && isSelected && !answered ? 'choice-select-anim' : ''}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <input
                    type={currentQuestion.isMultiple ? 'checkbox' : 'radio'}
                    checked={isSelected}
                    readOnly
                    tabIndex={-1}
                    style={{ margin: 0, marginTop: 3, flexShrink: 0, pointerEvents: 'none', accentColor: 'var(--color-primary)' }}
                  />
                  <span style={{ flex: 1, minWidth: 0, overflowWrap: 'break-word', wordBreak: 'break-word', lineHeight: 1.55 }}>
                    <strong style={{ marginRight: 2 }}>{CHOICE_LABELS[idx]}.</strong> {stripLabel(choice)}
                  </span>
                </div>
              </button>
            );
          })}
          {(() => {
            const wSelected = selectedAnswers.includes(WAKARANAI);
            const wAnsweredIncorrect = answered && wSelected;
            return (
              <button
                onClick={() => toggleAnswer(WAKARANAI)}
                disabled={answered}
                style={{
                  padding: 'var(--spacing-sm) var(--spacing-lg)',
                  marginTop: 'var(--spacing-sm)',
                  borderRadius: 'var(--border-radius-md)',
                  cursor: answered ? 'default' : 'pointer',
                  border: `1px ${wSelected ? 'solid' : 'dashed'}`,
                  display: 'flex', alignItems: 'center', width: '100%', textAlign: 'left',
                  fontSize: 'var(--font-size-sm)',
                  transition: 'all 0.15s ease',
                  background: wAnsweredIncorrect ? 'var(--color-feedback-incorrect-bg)' : wSelected ? 'var(--color-bg-main)' : 'transparent',
                  borderColor: wAnsweredIncorrect ? 'var(--color-danger)' : wSelected ? 'var(--color-text-sub)' : 'var(--color-border)',
                  color: wAnsweredIncorrect ? 'var(--color-danger)' : 'var(--color-text-light)',
                }}
              >
                <span style={{ marginRight: 10, fontSize: 12, flexShrink: 0 }}>？</span>
                <span>{WAKARANAI}</span>
              </button>
            );
          })()}
        </div>

        {answered && (() => {
          const displayQ = (currentQuestion.correctAnswers ? currentQuestion : detail) ?? currentQuestion;
          const lastResult = results[results.length - 1];
          if (!displayQ.correctAnswers) {
            return (
              <div style={{ padding: '12px 16px', marginBottom: 'var(--spacing-xl)', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div className="sherpa-spinner" style={{ width: 18, height: 18, borderWidth: 2, flexShrink: 0 }} />
                <span style={{ color: 'var(--color-text-light)', fontSize: 'var(--font-size-sm)' }}>
                  {lang === 'ja' ? '解説を読み込み中...' : 'Loading explanation...'}
                </span>
              </div>
            );
          }
          return (
            <div className="fade-slide-in" style={{
              background: lastResult?.isCorrect ? 'var(--color-feedback-correct-bg)' : 'var(--color-feedback-incorrect-bg)',
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
                <CopyButton getText={() => {
                  const choicesText = shuffledChoices.map((c: string, ci: number) => `${CHOICE_LABELS[ci]}. ${stripLabel(c)}`).join('\n');
                  const correctLabels = (displayQ.correctAnswers ?? []).map((ca: string) => {
                    const si = shuffledChoices.findIndex((c: string) => stripLabel(c) === stripLabel(ca));
                    return si >= 0 ? `${CHOICE_LABELS[si]}. ${stripLabel(ca)}` : stripLabel(ca);
                  }).join(', ');
                  const expl = lang === 'en' && (displayQ as any).explanationEn ? (displayQ as any).explanationEn : (displayQ.explanation ?? '');
                  return `${currentQuestion.questionText}\n\n${choicesText}\n\n${t('exerciseSession.correctAnswer')}${correctLabels}\n\n${t('exerciseSession.explanation')}\n${expl}`;
                }} />
              </div>
              <p style={{ margin: '0 0 12px', fontSize: 'var(--font-size-base)' }}>
                <strong>{t('exerciseSession.correctAnswer')}</strong>
                {displayQ.correctAnswers?.map((ca: string) => {
                  const si = shuffledChoices.findIndex((c: string) => stripLabel(c) === stripLabel(ca));
                  return si >= 0 ? `${CHOICE_LABELS[si]}. ${stripLabel(ca)}` : stripLabel(ca);
                }).join(' / ')}
              </p>
              <div style={{ fontSize: 'var(--font-size-base)', lineHeight: 1.6 }}>
                <strong>{t('exerciseSession.explanation')}</strong>
                <div style={{ marginTop: 4, overflowWrap: 'break-word', wordBreak: 'break-word' }}>{remapLabels(lang === 'en' && (displayQ as any).explanationEn ? (displayQ as any).explanationEn : (displayQ.explanation ?? ''))}</div>
              </div>
              {(() => {
                const links = getServiceLinks(currentQuestion.tags ?? []);
                if (links.length === 0) return null;
                return (
                  <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--color-border)', display: 'flex', flexWrap: 'wrap', gap: '6px 10px', alignItems: 'center' }}>
                    <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-light)', flexShrink: 0 }}>
                      {lang === 'ja' ? 'AWS公式' : 'AWS Docs'}:
                    </span>
                    {links.map(link => (
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
          );
        })()}

        {answerCountError && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 'var(--spacing-sm)', borderTop: '1px solid var(--color-border)' }}>
            <span style={{ color: 'var(--color-danger)', fontSize: 'var(--font-size-sm)' }}>{answerCountError}</span>
          </div>
        )}

        {answered && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 'var(--spacing-sm)', marginTop: 'var(--spacing-sm)' }}>
            <PromptMenu
              questionText={currentQuestion.questionText}
              choices={shuffledChoices.map((c: string, ci: number) => `${CHOICE_LABELS[ci]}. ${c}`)}
              explanation={((currentQuestion.correctAnswers ? currentQuestion : detail) ?? currentQuestion).explanation}
              lang={lang}
            />
          </div>
        )}

        {/* フッター */}
        <div style={{ marginTop: 'var(--spacing-md)', paddingTop: 'var(--spacing-sm)', borderTop: '1px dashed var(--color-border)' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--spacing-md)', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-light)', marginBottom: 'var(--spacing-sm)' }}>
            <span>
              {lang === 'ja' ? 'AI確認' : 'AI review'}:{' '}
              {currentQuestion.validityCheckedAt
                ? <strong style={{ color: 'var(--color-success)' }}>✓ {new Date(currentQuestion.validityCheckedAt).toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' })}</strong>
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
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--spacing-sm)' }}>
            <button
              onClick={() => setReportOpen(true)}
              style={{ background: 'none', border: '1px solid var(--color-border)', borderRadius: 'var(--border-radius-full)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, color: 'var(--color-text-light)', fontSize: 'var(--font-size-xs)', padding: '3px 10px', transition: 'all 0.2s' }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-danger)'; e.currentTarget.style.borderColor = 'var(--color-danger)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-text-light)'; e.currentTarget.style.borderColor = 'var(--color-border)'; }}
              title={lang === 'ja' ? '問題の不備を通報' : 'Report an issue'}
            >
              <span style={{ fontSize: 12 }}>⚑</span>
              <span>{lang === 'ja' ? '通報' : 'Report'}</span>
            </button>
            <button
              onClick={() => results.length > 0 && setShowAbortConfirm(true)}
              disabled={results.length === 0}
              style={{
                background: 'none', border: '1px solid var(--color-border)', borderRadius: 'var(--border-radius-full)',
                padding: '3px 10px', fontSize: 11, fontWeight: 600, cursor: results.length === 0 ? 'default' : 'pointer',
                color: results.length === 0 ? 'var(--color-text-light)' : 'var(--color-text-sub)',
                opacity: results.length === 0 ? 0.45 : 1, whiteSpace: 'nowrap', transition: 'all 0.15s',
              }}
            >
              {lang === 'ja' ? '中断' : 'End'}
            </button>
          </div>
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

      {(() => {
        const _waka = selectedAnswers.includes(WAKARANAI);
        const canSubmit = _waka
          ? true
          : currentQuestion.isMultiple && currentQuestion.correctAnswerCount
            ? selectedAnswers.length === currentQuestion.correctAnswerCount
            : selectedAnswers.length > 0;
        return createPortal(
        isMobile ? (
          <div style={{ position: 'fixed', bottom: 56, left: 0, right: 0, zIndex: 150, padding: '8px 16px', display: 'flex', gap: 8 }}>
            {!answered ? (
              <button
                onClick={submitAnswer}
                disabled={!canSubmit}
                style={{ flex: 1, height: 44, border: 'none', borderRadius: 22, background: !canSubmit ? 'var(--color-text-light)' : 'var(--color-accent)', color: 'var(--color-btn-primary-text)', fontWeight: 600, fontSize: 'var(--font-size-base)', cursor: !canSubmit ? 'default' : 'pointer', opacity: !canSubmit ? 0.5 : 1 }}
              >
                {t('exerciseSession.answer')}
              </button>
            ) : (
              <button
                onClick={nextQuestion}
                style={{ flex: 1, height: 44, border: 'none', borderRadius: 22, background: 'var(--color-accent)', color: 'var(--color-btn-primary-text)', fontWeight: 600, fontSize: 'var(--font-size-base)', cursor: 'pointer' }}
              >
                {currentIndex + 1 >= questions.length ? t('exerciseSession.showResult') : t('exerciseSession.next')}
              </button>
            )}
          </div>
        ) : (
          <div style={{ position: 'fixed', right: 24, bottom: 24, zIndex: 150, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {!answered ? (
              <button
                onClick={submitAnswer}
                disabled={!canSubmit}
                style={{ height: 44, padding: '0 24px', border: 'none', borderRadius: 22, background: !canSubmit ? 'var(--color-text-light)' : 'var(--color-accent)', color: 'var(--color-btn-primary-text)', fontWeight: 600, fontSize: 'var(--font-size-base)', cursor: !canSubmit ? 'default' : 'pointer', opacity: !canSubmit ? 0.5 : 1, whiteSpace: 'nowrap', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}
              >
                {t('exerciseSession.answer')}
              </button>
            ) : (
              <button
                onClick={nextQuestion}
                style={{ height: 44, padding: '0 24px', border: '1.5px solid var(--color-primary)', borderRadius: 22, background: 'var(--color-bg-white)', color: 'var(--color-primary)', fontWeight: 600, fontSize: 'var(--font-size-base)', cursor: 'pointer', whiteSpace: 'nowrap', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}
              >
                {currentIndex + 1 >= questions.length ? t('exerciseSession.showResult') : t('exerciseSession.next')}
              </button>
            )}
          </div>
        ),
        document.body
        );
      })()}

      {/* コラム（豆知識） */}
      {currentTip && (
        <div style={{ marginTop: 'var(--spacing-xl)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)', marginBottom: 'var(--spacing-sm)' }}>
            <span style={{
              background: 'var(--color-accent-hover)', color: 'white',
              fontSize: 10, fontWeight: 700, letterSpacing: '1.5px',
              padding: '3px 10px', borderRadius: 'var(--border-radius-sm)',
            }}>COLUMN</span>
            <span style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
          </div>
          <Card
            padding="var(--spacing-md) var(--spacing-lg)"
            style={{ borderLeft: '4px solid var(--color-accent)' }}
          >
            <span style={{ color: 'var(--color-accent)', display: 'block', marginBottom: 'var(--spacing-sm)' }}><IconBookOpen size={22} /></span>
            <p style={{ fontWeight: 700, color: 'var(--color-text-main)', margin: '0 0 var(--spacing-sm)', fontSize: 'var(--font-size-base)' }}>
              {currentTip.title}
            </p>
            <p style={{ color: 'var(--color-text-sub)', margin: 0, fontSize: 'var(--font-size-sm)', lineHeight: 1.8 }}>
              {currentTip.content}
            </p>
          </Card>
        </div>
      )}
    </div>
  );
}
