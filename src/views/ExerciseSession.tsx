'use client';
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from '@/compat/react-router-dom';
import { API_ENDPOINT, PASS_RATE, EXAM_DOMAINS, DOMAIN_NAME_EN, EXAM_LEVEL, qDomainName } from '../constants';
import { deleteCached } from '../utils/cache';
import { addPoints } from '../utils/points';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import ReportModal from '../components/ReportModal';
import { IconBookOpen, IconCopy, IconCheck, IconStar, IconChevronUp, IconChevronDown } from '../components/Icons';

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
  choiceExplanations?: string[];
  explanation?: string;
  domain?: number;
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
        background: 'none', border: `1.5px solid ${copied ? 'var(--color-success)' : 'var(--color-primary)'}`, borderRadius: '50%',
        width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', color: copied ? 'var(--color-success)' : 'var(--color-primary)',
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
          <span style={{ color: 'var(--color-primary)', display: 'flex' }}>{open ? <IconChevronUp size={12} /> : <IconChevronDown size={12} />}</span>
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

  const [sessionId, setSessionId] = useState<string>(state?.sessionId ?? '');
  const [questions, setQuestions] = useState<Question[]>(state?.questions ?? []);
  // プログレッシブロード用: 全問IDリスト（useState で hook として登録することで TDZ を回避）
  const [allQuestionIds] = useState<string[]>(state?.questionIds ?? []);
  const loadingNextRef = React.useRef(false);
  const [userId, setUserId] = useState<string>(state?.userId ?? '');
  const [examType, setExamType] = useState<string>(state?.examType ?? '');
  const [isQuick, setIsQuick] = useState<boolean>(state?.isQuick ?? false);
  const [isFocused, setIsFocused] = useState<boolean>(state?.isFocused ?? false);
  const [isMini, setIsMini] = useState<boolean>(state?.isMini ?? false);
  const [initialized, setInitialized] = useState<boolean>(!!state);

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  // currentIndex は下の useEffect の依存配列で使うため先に宣言（TDZ 回避）
  const [currentIndex, setCurrentIndex] = useState<number>(state?.resumeIndex ?? 0);

  // プログレッシブロード: 現在問 + 2問先までをバックグラウンドで先読み
  useEffect(() => {
    if (allQuestionIds.length === 0) return;
    const targetIndex = Math.min(currentIndex + 2, allQuestionIds.length - 1);
    if (targetIndex < questions.length) return; // already loaded
    if (loadingNextRef.current) return;
    const idsToLoad = allQuestionIds
      .slice(questions.length, targetIndex + 1)
      .join(',');
    if (!idsToLoad) return;
    loadingNextRef.current = true;
    fetch(`${API_ENDPOINT}/questions?ids=${idsToLoad}&withAnswers=true`)
      .then(r => r.json())
      .then(d => {
        if (d.items?.length) setQuestions(prev => [...prev, ...d.items]);
      })
      .catch(() => {})
      .finally(() => { loadingNextRef.current = false; });
  }, [currentIndex, questions.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const [viewedFrontier, setViewedFrontier] = useState<number>(state?.resumeIndex ?? 0);
  const [selectedAnswers, setSelectedAnswers] = useState<string[]>(state?.resumeSelectedAnswers ?? []);
  const [answered, setAnswered] = useState<boolean>(state?.resumeAnswered ?? false);
  const [detail, setDetail] = useState<Question | null>(null);
  const [detailFetchFailed, setDetailFetchFailed] = useState(false);
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
    setViewedFrontier(prev => Math.max(prev, currentIndex));
    setStruckChoices(new Set());
  }, [currentIndex]);

  // correctAnswers が事前ロードされていない場合のフォールバックフェッチ + 正解判定の補正
  useEffect(() => {
    const q = questions[currentIndex];
    if (!answered || !q || q.correctAnswers) return;
    fetch(`${API_ENDPOINT}/questions/${q.questionId}`)
      .then(r => r.json())
      .then(d => {
        setDetail(d);
        const correctIdx: number[] = d.correctAnswerIndices ?? [];
        const selOrigIdx = selectedAnswers.map(t => { const si = shuffledChoices.indexOf(t); return si >= 0 ? origIndices[si] : -1; });
        const isCorrect = correctIdx.length > 0 && correctIdx.length === selOrigIdx.length && correctIdx.every(i => selOrigIdx.includes(i));
        setResults(prev => {
          const next = [...prev];
          if (next.length > 0) next[next.length - 1] = { questionId: q.questionId, isCorrect };
          return next;
        });
      })
      .catch(() => { setDetailFetchFailed(true); });
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
  const [selectionHistory, setSelectionHistory] = useState<Record<number, string[]>>({});
  const [hoveredNode, setHoveredNode] = useState<number | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [answerCountError, setAnswerCountError] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [judgmentAnim, setJudgmentAnim] = useState<'correct' | 'incorrect' | null>(null);
  const [showAbortConfirm, setShowAbortConfirm] = useState(false);

  // ドラフト保存 — 常に最新値を ref に保持し、状態変化時と beforeunload 両方で保存する
  const draftStateRef = useRef({ currentIndex, results, answered, selectedAnswers });
  useEffect(() => {
    draftStateRef.current = { currentIndex, results, answered, selectedAnswers };
  });

  const saveDraftNow = useCallback(() => {
    if (!sessionId) return;
    const { currentIndex: ci, results: r, answered: a, selectedAnswers: sa } = draftStateRef.current;
    try {
      const draftKey = isFocused ? `focusedExerciseDraft_${userId}` : isQuick ? `quickExerciseDraft_${userId}` : `practiceExerciseDraft_${userId}`;
      localStorage.setItem(draftKey, JSON.stringify({
        sessionId, examType, questions, questionIds: allQuestionIds, userId,
        currentIndex: ci, results: r, answered: a, selectedAnswers: sa,
        isQuick, isFocused, isMini, savedAt: Date.now(),
      }));
    } catch { /* quota over 等は無視 */ }
  }, [sessionId, examType, questions, userId, isQuick, isFocused, isMini]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    saveDraftNow();
  }, [currentIndex, results, answered, selectedAnswers]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!sessionId) return;
    // beforeunload: PC/Android、pagehide: iOS Safari でより確実
    window.addEventListener('beforeunload', saveDraftNow);
    window.addEventListener('pagehide', saveDraftNow);
    return () => {
      window.removeEventListener('beforeunload', saveDraftNow);
      window.removeEventListener('pagehide', saveDraftNow);
    };
  }, [saveDraftNow]);

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
  const [struckChoices, setStruckChoices] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (state) { setInitialized(true); return; }
    // リロード時: localStorage からドラフトを復元する
    const candidates: any[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (key.startsWith('practiceExerciseDraft_') || key.startsWith('quickExerciseDraft_') || key.startsWith('focusedExerciseDraft_')) {
        try {
          const parsed = JSON.parse(localStorage.getItem(key) ?? '');
          if (parsed.questions?.length > 0) candidates.push(parsed);
        } catch {}
      }
    }
    const draft = candidates.sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0))[0];
    if (!draft) { navigate('/aws/exercise/setup', { replace: true }); return; }
    setSessionId(draft.sessionId ?? '');
    setQuestions(draft.questions);
    setUserId(draft.userId ?? '');
    setExamType(draft.examType ?? '');
    setIsQuick(draft.isQuick ?? false);
    setIsFocused(draft.isFocused ?? false);
    setIsMini(draft.isMini ?? false);
    setCurrentIndex(draft.currentIndex ?? 0);
    setViewedFrontier(draft.currentIndex ?? 0);
    setResults(draft.results ?? []);
    setAnswered(draft.answered ?? false);
    setSelectedAnswers(draft.selectedAnswers ?? []);
    setInitialized(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 全 Hook 呼び出し完了後に computed values を定義
  const totalCount = allQuestionIds.length > 0 ? allQuestionIds.length : questions.length;

  if (!initialized) return null;

  // プログレッシブロード: 現在問がまだロードされていない場合はスピナーを表示
  if (!questions[currentIndex]) {
    return (
      <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg-main)' }}>
        <div className="sherpa-spinner" />
      </div>
    );
  }

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

  const toggleStrikethrough = (choice: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (answered) return;
    setStruckChoices(prev => {
      const next = new Set(prev);
      if (next.has(choice)) next.delete(choice); else next.add(choice);
      return next;
    });
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

    const correctAnswerIndices: number[] = currentQuestion.correctAnswerIndices ?? [];
    const selOrigIdx = selectedAnswers.map(t => { const si = shuffledChoices.indexOf(t); return si >= 0 ? origIndices[si] : -1; });
    const isCorrect = correctAnswerIndices.length > 0 && correctAnswerIndices.length === selOrigIdx.length && correctAnswerIndices.every(i => selOrigIdx.includes(i));

    setResults(prev => [...prev, { questionId: currentQuestion.questionId, isCorrect }]);
    setSelectionHistory(prev => ({ ...prev, [currentIndex]: selectedAnswers }));
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
        isCorrect
      })
    }).catch(err => console.error(err));
  };

  const goToQuestion = (i: number) => {
    if (i > viewedFrontier || i === currentIndex) return;
    setCurrentIndex(i);
    if (i < results.length) {
      setSelectedAnswers(selectionHistory[i] ?? []);
      setAnswered(true);
    } else {
      setSelectedAnswers([]);
      setAnswered(false);
    }
    setDetail(null); setDetailFetchFailed(false);
    setAnswerCountError(null);
  };

  const nextQuestion = async () => {
    const nextIdx = currentIndex + 1;
    // 過去問を復習中（frontierより前）→ 次の問題へ進む
    if (nextIdx < results.length) {
      setCurrentIndex(nextIdx);
      setSelectedAnswers(selectionHistory[nextIdx] ?? []);
      setAnswered(true);
      setDetail(null); setDetailFetchFailed(false);
      setAnswerCountError(null);
      return;
    }
    // 次問がまだロードされていない場合は待機（通常は先読みで間に合う）
    if (nextIdx < totalCount && nextIdx >= questions.length) {
      // プリフェッチを即時トリガーして少し待つ
      return;
    }
    // frontierに戻ってきた場合（かつ未回答の問題が残っている）→ 未回答モードへ
    if (nextIdx === results.length && nextIdx < questions.length) {
      setCurrentIndex(nextIdx);
      setSelectedAnswers([]);
      setAnswered(false);
      setDetail(null); setDetailFetchFailed(false);
      setAnswerCountError(null);
      return;
    }
    if (nextIdx >= totalCount) {
      setFinishing(true);
      const score = Math.round((results.filter(r => r.isCorrect).length / totalCount) * 100);
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
        for (const tag of [qDomainName(q as any)].filter(Boolean)) {
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
      // domain_results に個別正誤を追加（ゲストはlocalStorageのみ、ログイン済みはサーバーにも同期）
      try {
        const dr: Record<string, boolean[]> =
          JSON.parse(localStorage.getItem(`domain_results_${examType}_${userId}`) ?? '{}');
        for (const r of results) {
          const q = questions.find((q: Question) => q.questionId === r.questionId);
          for (const tag of [qDomainName(q as any)].filter(Boolean)) {
            if (!dr[tag]) dr[tag] = [];
            dr[tag] = [...dr[tag], r.isCorrect].slice(-5);
          }
        }
        localStorage.setItem(`domain_results_${examType}_${userId}`, JSON.stringify(dr));
        if (userId && userId !== 'guest') {
          fetch(`${API_ENDPOINT}/users/me/domain-results`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, domainResults: dr }),
          }).catch(() => {});
        }
      } catch {}
      // セッション完了でキャッシュ破棄 → ホーム画面が最新データをサーバーから再取得
      deleteCached(`ustats_${userId}`);
      localStorage.setItem(`postSessionRefresh_${userId}`, String(Date.now()));
      const ptsPerQ = EXAM_LEVEL[examType] === 'Foundational' ? 1 : EXAM_LEVEL[examType] === 'Associate' ? 2 : 3;
      const earnedPts = results.filter(r => r.isCorrect).length * ptsPerQ;
      if (userId && earnedPts > 0) addPoints(userId, earnedPts);
      localStorage.setItem(`sessionScoreAdd_${examType}_${userId}`, '1');
      // 日次演習カウント更新
      const jstToday = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
      const dailyKey = `dailyQCount_${examType}_${userId}_${jstToday}`;
      const prevDaily = parseInt(localStorage.getItem(dailyKey) ?? '0', 10);
      const newDaily = prevDaily + results.length;
      localStorage.setItem(dailyKey, String(newDaily));
      const dailyGoal = parseInt(localStorage.getItem(`dailyGoal_${userId}`) ?? '10', 10);
      const rewardKey = `dailyGoalReward_${examType}_${userId}_${jstToday}`;
      let dailyBonusPts = 0;
      if (newDaily >= dailyGoal && prevDaily < dailyGoal && !localStorage.getItem(rewardKey) && userId !== 'guest') {
        localStorage.setItem(rewardKey, '1');
        dailyBonusPts = 10;
        addPoints(userId, dailyBonusPts);
      }
      navigate('/aws/result', { state: { results, questions, score, isPassed, sessionId, userId, examType, isQuick, isMini, earnedPts, dailyBonusPts } });
    } else {
      setCurrentIndex(prev => prev + 1);
      setSelectedAnswers([]);
      setAnswered(false);
      setDetail(null); setDetailFetchFailed(false);
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
      for (const tag of [qDomainName(q as any)].filter(Boolean)) {
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
    try {
      const dr: Record<string, boolean[]> =
        JSON.parse(localStorage.getItem(`domain_results_${examType}_${userId}`) ?? '{}');
      for (const r of results) {
        const q = questions.find((q: Question) => q.questionId === r.questionId);
        for (const tag of [qDomainName(q as any)].filter(Boolean)) {
          if (!dr[tag]) dr[tag] = [];
          dr[tag] = [...dr[tag], r.isCorrect].slice(-5);
        }
      }
      localStorage.setItem(`domain_results_${examType}_${userId}`, JSON.stringify(dr));
      if (userId && userId !== 'guest') {
        fetch(`${API_ENDPOINT}/users/me/domain-results`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, domainResults: dr }),
        }).catch(() => {});
      }
    } catch {}
    deleteCached(`ustats_${userId}`);
    localStorage.setItem(`postSessionRefresh_${userId}`, String(Date.now()));
    const ptsPerQ = EXAM_LEVEL[examType] === 'Foundational' ? 1 : EXAM_LEVEL[examType] === 'Associate' ? 2 : 3;
    const earnedPts = results.filter(r => r.isCorrect).length * ptsPerQ;
    if (userId && earnedPts > 0) addPoints(userId, earnedPts);
    localStorage.setItem(`sessionScoreAdd_${examType}_${userId}`, '1');
    const jstToday2 = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
    const dailyKey2 = `dailyQCount_${examType}_${userId}_${jstToday2}`;
    const prevDaily2 = parseInt(localStorage.getItem(dailyKey2) ?? '0', 10);
    const newDaily2 = prevDaily2 + results.length;
    localStorage.setItem(dailyKey2, String(newDaily2));
    const dailyGoal2 = parseInt(localStorage.getItem(`dailyGoal_${userId}`) ?? '10', 10);
    const rewardKey2 = `dailyGoalReward_${examType}_${userId}_${jstToday2}`;
    let dailyBonusPts2 = 0;
    if (newDaily2 >= dailyGoal2 && prevDaily2 < dailyGoal2 && !localStorage.getItem(rewardKey2) && userId !== 'guest') {
      localStorage.setItem(rewardKey2, '1');
      dailyBonusPts2 = 10;
      addPoints(userId, dailyBonusPts2);
    }
    const answeredQuestions = questions.slice(0, results.length);
    navigate('/aws/result', { state: { results, questions: answeredQuestions, score, isPassed, sessionId, userId, examType, isQuick, isMini, aborted: true, earnedPts, dailyBonusPts: dailyBonusPts2 } });
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
    const correctAnswerIndices: number[] = displayQ.correctAnswerIndices ?? [];
    const shuffledIdx = shuffledChoices.indexOf(choice);
    const origIdx = shuffledIdx >= 0 ? origIndices[shuffledIdx] : -1;
    const isCorrect = correctAnswerIndices.includes(origIdx);
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

      {/* 進捗ノード（画面上部に固定） */}
      {(() => {
        const WINDOW = 5;
        const useWindow = totalCount > WINDOW;
        const windowStart = useWindow
          ? Math.max(0, Math.min(currentIndex - Math.floor(WINDOW / 2), totalCount - WINDOW))
          : 0;
        const visibleIndices = useWindow
          ? Array.from({ length: WINDOW }, (_, k) => windowStart + k)
          : Array.from({ length: totalCount }, (_, k) => k);

        return (
          <div style={{ position: 'fixed', top: 56, left: 0, right: 0, zIndex: 190, background: 'var(--color-bg-white)', borderBottom: '1px solid var(--color-border)', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 0 }}>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
              {visibleIndices.map((i, visIdx) => {
                const isAnswered = i < results.length;
                const isCurrent = i === currentIndex;
                const isLoaded = i < questions.length;
                // 未ロード問題はタップ不可
                const isClickable = i <= viewedFrontier && !isCurrent && isLoaded;
                const isHovered = hoveredNode === i;
                const notYetLoaded = !isLoaded && !isCurrent;
                return (
                  <React.Fragment key={i}>
                    <div
                      onClick={isClickable ? () => goToQuestion(i) : undefined}
                      onMouseEnter={isClickable ? () => setHoveredNode(i) : undefined}
                      onMouseLeave={isClickable ? () => setHoveredNode(null) : undefined}
                      title={isClickable ? `第${i + 1}問へ` : undefined}
                      style={{
                        width: isCurrent ? 12 : isHovered ? 9 : 7,
                        height: isCurrent ? 12 : isHovered ? 9 : 7,
                        borderRadius: '50%',
                        flexShrink: 0,
                        background: isAnswered || isCurrent ? 'var(--color-primary)' : 'transparent',
                        border: `2px solid ${isAnswered || isCurrent ? 'var(--color-primary)' : 'var(--color-text-light)'}`,
                        opacity: notYetLoaded ? 0.3 : undefined,
                        boxShadow: isCurrent
                          ? '0 0 0 2px var(--color-primary-light, rgba(82,130,255,0.25))'
                          : isHovered
                          ? '0 0 0 3px var(--color-primary-light, rgba(82,130,255,0.35))'
                          : 'none',
                        cursor: isClickable ? 'pointer' : 'default',
                        transition: 'all 0.15s',
                        opacity: isAnswered && !isCurrent && !isHovered ? 0.75 : 1,
                      }}
                    />
                    {visIdx < visibleIndices.length - 1 && (
                      <div style={{
                        flex: 1,
                        height: 2,
                        background: i < results.length ? 'var(--color-primary)' : 'var(--color-text-light)',
                        transition: 'background 0.2s',
                      }} />
                    )}
                  </React.Fragment>
                );
              })}
            </div>
            {useWindow && (
              <span style={{ flexShrink: 0, marginLeft: 12, fontSize: 11, fontWeight: 700, color: 'var(--color-text-light)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                {currentIndex + 1} / {totalCount}
              </span>
            )}
          </div>
        );
      })()}
      {/* 固定ノードバーの高さ分のスペーサー */}
      <div style={{ height: 36 }} />

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
              <span style={{ color: bookmarkedIds.has(currentQuestion.questionId) ? 'var(--color-warning, #f59e0b)' : 'var(--color-text-light)' }}>
                <IconStar filled={bookmarkedIds.has(currentQuestion.questionId)} size={20} />
              </span>
            </button>
          )}
        </div>

        <div style={{ marginBottom: 'var(--spacing-xl)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--spacing-sm)', gap: 'var(--spacing-md)' }}>
            <div>
              {currentQuestion.isMultiple && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center',
                  border: '1.5px solid var(--color-border)', borderRadius: 4,
                  padding: '2px 8px', fontSize: 11, fontWeight: 700,
                  color: 'var(--color-text-sub)', background: 'transparent', whiteSpace: 'nowrap',
                }}>
                  {t('exerciseSession.multiple')}{currentQuestion.correctAnswerCount ? ` (${currentQuestion.correctAnswerCount})` : ''}
                </span>
              )}
            </div>
            <CopyButton getText={() => {
              const choicesText = shuffledChoices.map((c: string, idx: number) => `${CHOICE_LABELS[idx]}. ${stripLabel(c)}`).join('\n');
              return `${currentQuestion.questionText}\n\n${choicesText}`;
            }} />
          </div>
          <p style={{ fontSize: 'var(--font-size-lg)', lineHeight: 1.6, fontWeight: 400, margin: 0, color: 'var(--color-text-main)', overflowWrap: 'break-word', wordBreak: 'break-word', minWidth: 0, whiteSpace: 'pre-wrap' }}>
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
                  {currentQuestion.isMultiple ? (
                    <div style={{
                      width: 16, height: 16, borderRadius: 3, flexShrink: 0, marginTop: 3,
                      border: `2px solid ${isSelected ? 'var(--color-primary)' : 'var(--color-border)'}`,
                      background: isSelected ? 'var(--color-primary)' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      pointerEvents: 'none',
                    }}>
                      {isSelected && <span style={{ color: 'white', fontSize: 10, lineHeight: 1, fontWeight: 700 }}>✓</span>}
                    </div>
                  ) : (
                    <div style={{
                      width: 16, height: 16, borderRadius: '50%', flexShrink: 0, marginTop: 3,
                      border: `2px solid ${isSelected ? 'var(--color-primary)' : 'var(--color-border)'}`,
                      background: isSelected ? 'var(--color-primary)' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      pointerEvents: 'none',
                    }}>
                      {isSelected && <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'white' }} />}
                    </div>
                  )}
                  <span
                    onClick={!answered ? (e) => toggleStrikethrough(choice, e) : undefined}
                    style={{
                      flex: 1, minWidth: 0, overflowWrap: 'break-word', wordBreak: 'break-word', lineHeight: 1.55,
                      textDecoration: struckChoices.has(choice) && !answered ? 'line-through' : 'none',
                      textDecorationColor: 'var(--color-danger)',
                      textDecorationThickness: '2px',
                      cursor: !answered ? 'pointer' : 'default',
                      userSelect: 'none',
                    }}
                  >
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
            return detailFetchFailed ? (
              <div style={{ padding: '12px 16px', marginBottom: 'var(--spacing-xl)', display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ color: 'var(--color-danger)', fontSize: 'var(--font-size-sm)' }}>
                  {lang === 'ja' ? '解説の読み込みに失敗しました。' : 'Failed to load explanation.'}
                </span>
                <button
                  onClick={() => { setDetailFetchFailed(false); setDetail(null); }}
                  style={{ background: 'none', border: '1px solid var(--color-danger)', borderRadius: 'var(--border-radius-full)', padding: '2px 10px', fontSize: 'var(--font-size-xs)', color: 'var(--color-danger)', cursor: 'pointer' }}>
                  {lang === 'ja' ? '再試行' : 'Retry'}
                </button>
              </div>
            ) : (
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
                  const expl = displayQ.choiceExplanations && displayQ.choiceExplanations.length > 0
                    ? displayQ.choiceExplanations.map((e: string, i: number) => `${CHOICE_LABELS[i]}. ${e}`).join('\n')
                    : (displayQ.explanation ?? '');
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
                {(() => {
                  const items = shuffledChoices.map((_: string, di: number) => ({
                    di,
                    origIdx: origIndices[di],
                    label: CHOICE_LABELS[di],
                    isCorrect: (displayQ.correctAnswerIndices ?? []).includes(origIndices[di]),
                    expl: (displayQ.choiceExplanations ?? [])[origIndices[di]] ?? '',
                  }));
                  const sorted = [...items.filter(x => x.isCorrect), ...items.filter(x => !x.isCorrect)];
                  return (
                    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 'var(--font-size-base)' }}>
                      {sorted.map(item => (
                        <div key={item.di} style={{ overflowWrap: 'break-word', wordBreak: 'break-word' }}>
                          <span style={{ fontWeight: 700, color: item.isCorrect ? 'var(--color-success)' : 'var(--color-text-sub)', marginRight: 4 }}>
                            {item.label}.{item.isCorrect ? ` (${lang === 'ja' ? '正解' : 'Correct'})` : ''}
                          </span>
                          <span style={{ whiteSpace: 'pre-wrap' }}>{item.expl}</span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
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
          {/* 上段: 中断・通報ボタン（右寄せ） */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--spacing-sm)', marginBottom: 'var(--spacing-sm)' }}>
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
          {/* 下段: AI確認情報・問題メタデータ（左寄せ） */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--spacing-md)', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-light)' }}>
            <span>
              {lang === 'ja' ? 'AI確認' : 'AI review'}:{' '}
              {currentQuestion.validityCheckedAt
                ? <strong style={{ color: 'var(--color-success)' }}>✓ {new Date(currentQuestion.validityCheckedAt).toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' })}</strong>
                : <strong>{lang === 'ja' ? '未確認' : 'not reviewed'}</strong>
              }
            </span>
            <span>ID: <strong style={{ color: 'var(--color-text-sub)' }}>{currentQuestion.questionId}</strong></span>
            {qDomainName(currentQuestion) && (
              <span>{lang === 'ja' ? 'ドメイン' : 'Domain'}: <strong style={{ color: 'var(--color-text-sub)' }}>{qDomainName(currentQuestion)}</strong></span>
            )}
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
                {currentIndex + 1 >= totalCount ? t('exerciseSession.showResult') : t('exerciseSession.next')}
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
                {currentIndex + 1 >= totalCount ? t('exerciseSession.showResult') : t('exerciseSession.next')}
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', marginBottom: 'var(--spacing-sm)' }}>
              <span style={{ color: 'var(--color-accent)', display: 'flex', alignItems: 'center', flexShrink: 0 }}><IconBookOpen size={22} /></span>
              <p style={{ fontWeight: 700, color: 'var(--color-text-main)', margin: 0, fontSize: 'var(--font-size-base)' }}>{currentTip.title}</p>
            </div>
            <p style={{ color: 'var(--color-text-sub)', margin: 0, fontSize: 'var(--font-size-sm)', lineHeight: 1.8 }}>
              {currentTip.content
                .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
                .replace(/\[[^\]]*\]\[\d+\]/g, '')
                .replace(/\(\s*\)/g, '')
                .replace(/\s{2,}/g, ' ')
                .trim()}
            </p>
          </Card>
        </div>
      )}
    </div>
  );
}
