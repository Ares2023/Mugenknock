import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_ENDPOINT, EXAM_TYPES, EXAM_CONFIGS, EXAM_DOMAINS, PASS_SCORES, PASS_RATE, DOMAIN_NAME_EN } from '../constants';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import DomainSelector from '../components/DomainSelector';

const StepBadge = ({ n, optional = false }: { n: number; optional?: boolean }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
    background: optional ? 'var(--color-border)' : 'var(--color-primary)',
    color: optional ? 'var(--color-text-sub)' : 'white',
    fontSize: 11, fontWeight: 700,
  }}>{n}</span>
);

const StepRow = ({ n, optional = false, isLast = false, title, children }: {
  n: number;
  optional?: boolean;
  isLast?: boolean;
  title: React.ReactNode;
  children: React.ReactNode;
}) => (
  <div style={{ display: 'flex', gap: 14 }}>
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 20, flexShrink: 0 }}>
      <StepBadge n={n} optional={optional} />
      {!isLast && <div style={{ width: 2, flex: 1, background: 'var(--color-border)', marginTop: 5, borderRadius: 1 }} />}
    </div>
    <div style={{ flex: 1, paddingBottom: isLast ? 0 : 'var(--spacing-xl)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', fontWeight: 700, fontSize: 'var(--font-size-base)', lineHeight: '20px', marginBottom: 'var(--spacing-sm)' }}>
        {title}
      </div>
      {children}
    </div>
  </div>
);


const EXAM_PREFS_KEY = 'examPrefs';
const loadExamPrefs = (et: string) => {
  try { return JSON.parse(localStorage.getItem(EXAM_PREFS_KEY) ?? '{}')[et] ?? {}; } catch { return {}; }
};
const saveExamPrefs = (et: string, prefs: object) => {
  try {
    const stored = JSON.parse(localStorage.getItem(EXAM_PREFS_KEY) ?? '{}');
    stored[et] = prefs;
    localStorage.setItem(EXAM_PREFS_KEY, JSON.stringify(stored));
  } catch {}
};

export default function ExamSetup() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { lang, t } = useLanguage();
  const [targetExam, setTargetExamState] = useState<string | null>(() => localStorage.getItem('targetExam'));
  const [examType, setExamType] = useState<string>(() => localStorage.getItem('targetExam') || localStorage.getItem('lastExamType') || 'SAA');

  const handleSelectExamInSetup = (et: string) => {
    localStorage.setItem('targetExam', et);
    setTargetExamState(et);
    setExamType(et);
  };
  const [selectedDomains, setSelectedDomains] = useState<string[]>(() => { const et = localStorage.getItem('targetExam') || localStorage.getItem('lastExamType') || 'SAA'; return loadExamPrefs(et).domains ?? EXAM_DOMAINS[et] ?? []; });
  const [availableCount, setAvailableCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [showHint, setShowHint] = useState(() => !localStorage.getItem('sherpaExamHint'));
  const [examDraft, setExamDraft] = useState<any>(() => {
    try { return JSON.parse(localStorage.getItem('examDraft') ?? 'null'); } catch { return null; }
  });
  const [bookmarkOnly, setBookmarkOnly] = useState<boolean>(() => loadExamPrefs(localStorage.getItem('targetExam') || localStorage.getItem('lastExamType') || 'SAA').bookmarkOnly ?? false);
  const [unansweredOnly, setUnansweredOnly] = useState<boolean>(() => loadExamPrefs(localStorage.getItem('targetExam') || localStorage.getItem('lastExamType') || 'SAA').unansweredOnly ?? false);
  const [incorrectOnly, setIncorrectOnly] = useState<boolean>(() => loadExamPrefs(localStorage.getItem('targetExam') || localStorage.getItem('lastExamType') || 'SAA').incorrectOnly ?? false);
  const [shuffle, setShuffle] = useState<boolean>(() => loadExamPrefs(localStorage.getItem('targetExam') || localStorage.getItem('lastExamType') || 'SAA').shuffle ?? false);
  const [keywordChips, setKeywordChips] = useState<string[]>([]);
  const [keywordInput, setKeywordInput] = useState('');
  const hasDraft = examDraft?.examType === examType;

  type ExamSession = { sessionId: string; examType: string; mode: string; score: number; isPassed: boolean; startedAt: string; };
  const [examSessions, setExamSessions] = useState<ExamSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  type DomainStat = { tagId: string; correctCount: number; incorrectCount: number };
  const [domainStats, setDomainStats] = useState<DomainStat[]>([]);
  const [answeredCount, setAnsweredCount] = useState<number | null>(null);

  const config = EXAM_CONFIGS[examType];
  const passScore = PASS_SCORES[examType];

  const matchesKeyword = (q: any, chip: string) => {
    const lower = chip.toLowerCase();
    if ((q.questionText ?? '').toLowerCase().includes(lower)) return true;
    if (Array.isArray(q.choices) && q.choices.some((c: any) => {
      const text = typeof c === 'string' ? c : (c.text ?? c.optionText ?? '');
      return text.toLowerCase().includes(lower);
    })) return true;
    if (Array.isArray(q.tags) && q.tags.some((tag: string) => tag.toLowerCase().includes(lower))) return true;
    return false;
  };

  const handleAddChip = () => {
    const trimmed = keywordInput.trim();
    if (trimmed && !keywordChips.includes(trimmed)) {
      setKeywordChips(prev => [...prev, trimmed]);
    }
    setKeywordInput('');
  };

  const removeChip = (i: number) => setKeywordChips(prev => prev.filter((_, idx) => idx !== i));

  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    const prefs = loadExamPrefs(examType);
    setSelectedDomains(prefs.domains ?? EXAM_DOMAINS[examType]);
    setBookmarkOnly(prefs.bookmarkOnly ?? false);
    setUnansweredOnly(prefs.unansweredOnly ?? false);
    setIncorrectOnly(prefs.incorrectOnly ?? false);
    setShuffle(prefs.shuffle ?? false);
  }, [examType]);

  useEffect(() => {
    saveExamPrefs(examType, { domains: selectedDomains, bookmarkOnly, unansweredOnly, incorrectOnly, shuffle });
  }, [examType, selectedDomains, bookmarkOnly, unansweredOnly, incorrectOnly, shuffle]);

  const resumeExam = () => {
    if (!examDraft) return;
    navigate('/exam/session', {
      state: {
        sessionId: examDraft.sessionId,
        questions: examDraft.questions,
        userId: examDraft.userId,
        examType: examDraft.examType,
        resumeIndex: examDraft.currentIndex,
        resumeAnswers: examDraft.answers,
        resumeTimeLeft: examDraft.timeLeft,
      }
    });
  };

  useEffect(() => {
    setAvailableCount(null);

    const fetchCounts = async () => {
      if (selectedDomains.length === 0) { setAvailableCount(0); return; }
      try {
        const params = new URLSearchParams({ examType });
        const allSelected = EXAM_DOMAINS[examType].every(d => selectedDomains.includes(d));
        if (!allSelected) params.set('domain', selectedDomains.join(','));

        if ((user && (bookmarkOnly || unansweredOnly || incorrectOnly)) || keywordChips.length > 0) {
          const userId = user?.userId;
          const [qRes, bkmRes, answeredRes, incorrectRes] = await Promise.all([
            fetch(`${API_ENDPOINT}/questions?${params}`).then(r => r.json()),
            user && bookmarkOnly ? fetch(`${API_ENDPOINT}/users/me/bookmarks?userId=${userId}`).then(r => r.json()) : Promise.resolve(null),
            user && unansweredOnly ? fetch(`${API_ENDPOINT}/users/me/answered-questions?userId=${userId}&examType=${examType}`).then(r => r.json()) : Promise.resolve(null),
            user && incorrectOnly ? fetch(`${API_ENDPOINT}/users/me/incorrect-questions?userId=${userId}&examType=${examType}`).then(r => r.json()) : Promise.resolve(null),
          ]);
          let items: any[] = qRes.items ?? [];
          if (bookmarkOnly && bkmRes) {
            const bookmarkIds = new Set(bkmRes.questionIds ?? []);
            items = items.filter((q: any) => bookmarkIds.has(q.questionId));
          }
          if (unansweredOnly && answeredRes) {
            const answeredIds = new Set(answeredRes.questionIds ?? []);
            items = items.filter((q: any) => !answeredIds.has(q.questionId));
          }
          if (incorrectOnly && incorrectRes) {
            const incorrectIds = new Set(incorrectRes.questionIds ?? []);
            items = items.filter((q: any) => incorrectIds.has(q.questionId));
          }
          if (keywordChips.length > 0) {
            items = items.filter((q: any) => keywordChips.every(chip => matchesKeyword(q, chip)));
          }
          setAvailableCount(items.length);
        } else {
          const data = await fetch(`${API_ENDPOINT}/questions?${params}`).then(r => r.json());
          setAvailableCount(data.count ?? data.items?.length ?? 0);
        }
      } catch { setAvailableCount(0); }
    };

    fetchCounts();
  }, [examType, selectedDomains, user, bookmarkOnly, unansweredOnly, incorrectOnly, keywordChips]);

  useEffect(() => {
    if (!user) { setExamSessions([]); setDomainStats([]); setAnsweredCount(null); return; }
    setSessionsLoading(true);
    fetch(`${API_ENDPOINT}/users/me/sessions?userId=${user.userId}&limit=50`)
      .then(r => r.json())
      .then(d => setExamSessions(
        (d.items ?? []).filter((s: ExamSession) => s.examType === examType && s.mode === 'exam').slice(0, 10)
      ))
      .catch(() => setExamSessions([]))
      .finally(() => setSessionsLoading(false));
    fetch(`${API_ENDPOINT}/users/me/question-stats?userId=${user.userId}&examType=${examType}`)
      .then(r => r.json())
      .then(d => setAnsweredCount(d.answeredCount ?? 0))
      .catch(() => setAnsweredCount(0));
    fetch(`${API_ENDPOINT}/users/me/stats?userId=${user.userId}`)
      .then(r => r.json())
      .then(d => setDomainStats(d.stats ?? []))
      .catch(() => setDomainStats([]));
  }, [user, examType]);

  const startExam = async () => {
    if (selectedDomains.length === 0) {
      alert(lang === 'ja' ? '最低1つのドメインを選択してください' : 'Please select at least one domain');
      return;
    }
    setLoading(true);
    try {
      const userId = user?.userId ?? 'guest';
      const limit = Math.min(config.totalQuestions, availableCount ?? config.totalQuestions);
      let selectedItems: any[];

      const allSelected = EXAM_DOMAINS[examType].every(d => selectedDomains.includes(d));
      if ((user && (bookmarkOnly || unansweredOnly || incorrectOnly)) || keywordChips.length > 0) {
        const params = new URLSearchParams({ examType, withAnswers: 'true' });
        if (!allSelected) params.set('domain', selectedDomains.join(','));

        const [qRes, bkmRes, answeredRes, incorrectRes] = await Promise.all([
          fetch(`${API_ENDPOINT}/questions?${params}`).then(r => r.json()),
          user && bookmarkOnly ? fetch(`${API_ENDPOINT}/users/me/bookmarks?userId=${userId}`).then(r => r.json()) : Promise.resolve(null),
          user && unansweredOnly ? fetch(`${API_ENDPOINT}/users/me/answered-questions?userId=${userId}&examType=${examType}`).then(r => r.json()) : Promise.resolve(null),
          user && incorrectOnly ? fetch(`${API_ENDPOINT}/users/me/incorrect-questions?userId=${userId}&examType=${examType}`).then(r => r.json()) : Promise.resolve(null),
        ]);
        let filtered: any[] = qRes.items ?? [];
        if (bookmarkOnly && bkmRes) {
          const bookmarkIds = new Set(bkmRes.questionIds ?? []);
          filtered = filtered.filter((q: any) => bookmarkIds.has(q.questionId));
        }
        if (unansweredOnly && answeredRes) {
          const answeredIds = new Set(answeredRes.questionIds ?? []);
          filtered = filtered.filter((q: any) => !answeredIds.has(q.questionId));
        }
        if (incorrectOnly && incorrectRes) {
          const incorrectIds = new Set(incorrectRes.questionIds ?? []);
          filtered = filtered.filter((q: any) => incorrectIds.has(q.questionId));
        }
        if (keywordChips.length > 0) {
          filtered = filtered.filter((q: any) => keywordChips.every(chip => matchesKeyword(q, chip)));
        }
        if (shuffle) {
          for (let i = filtered.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [filtered[i], filtered[j]] = [filtered[j], filtered[i]];
          }
        }
        selectedItems = filtered.slice(0, limit);
      } else {
        const params = new URLSearchParams({ examType, withAnswers: 'true' });
        if (!allSelected) params.set('domain', selectedDomains.join(','));
        const data = await fetch(`${API_ENDPOINT}/questions?${params}`).then(r => r.json());
        let allItems: any[] = data.items ?? [];
        if (keywordChips.length > 0) {
          allItems = allItems.filter((q: any) => keywordChips.every(chip => matchesKeyword(q, chip)));
        }
        if (shuffle) {
          for (let i = allItems.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [allItems[i], allItems[j]] = [allItems[j], allItems[i]];
          }
        }
        selectedItems = allItems.slice(0, limit);
      }

      if (!selectedItems || selectedItems.length === 0) {
        alert(t('examSetup.startFailed'));
        setLoading(false);
        return;
      }

      const questionIds = selectedItems.map((q: any) => q.questionId);
      const sessionRes = await fetch(`${API_ENDPOINT}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, mode: 'exam', examType, questionIds })
      });
      const sessionData = await sessionRes.json();

      navigate('/exam/session', {
        state: { sessionId: sessionData.sessionId, questions: selectedItems, userId, examType }
      });
    } catch (err) {
      console.error(err);
      alert(t('examSetup.startFailed'));
    } finally {
      setLoading(false);
    }
  };

  const allDomainsSelected = EXAM_DOMAINS[examType].every(d => selectedDomains.includes(d));

  let _s = 0;
  const examStep    = targetExam ? null : ++_s;
  const domainStep  = ++_s;
  const optionsStep = ++_s;
  const keywordStep = ++_s;

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: 'var(--spacing-xl) var(--spacing-lg)' }} className="page-container">

      {showHint && (
        <div className="fade-slide-in" style={{
          display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)',
          background: 'var(--color-hint-bg)', border: '1px solid var(--color-hint-border)',
          borderRadius: 'var(--border-radius-md)', padding: '10px var(--spacing-md)',
          marginBottom: 'var(--spacing-lg)', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)',
        }}>
          <span style={{ fontSize: 16, flexShrink: 0 }}>💡</span>
          <span style={{ flex: 1, lineHeight: 1.5 }}>{t('examSetup.hint')}</span>
          <button
            onClick={() => { localStorage.setItem('sherpaExamHint', '1'); setShowHint(false); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-light)', fontSize: 18, lineHeight: 1, padding: '0 4px', flexShrink: 0 }}
          >✕</button>
        </div>
      )}

      <div className="setup-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 'var(--spacing-lg)' }}>

        {/* 左：設定フォーム */}
        <Card padding="var(--spacing-xl)">
          {/* 試験種別 */}
          {targetExam ? (
            <div style={{ marginBottom: 'var(--spacing-lg)', display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)' }}>
              <span style={{ fontSize: 'var(--font-size-base)', fontWeight: 700, color: 'var(--color-text-sub)' }}>{t('examSetup.examType')}</span>
              <Badge variant="secondary">{examType}</Badge>
              <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-light)' }}>{t('examSetup.examTypeHome')}</span>
            </div>
          ) : (
            <StepRow n={examStep!} title={t('examSetup.examType')}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--spacing-sm)' }}>
                {EXAM_TYPES.map(et => (
                  <Button
                    key={et}
                    variant={examType === et ? 'primary' : 'outline'}
                    size="sm"
                    onClick={() => handleSelectExamInSetup(et)}
                    style={{ width: 72 }}
                  >
                    {et}
                  </Button>
                ))}
              </div>
            </StepRow>
          )}

          {/* ドメインフィルタ */}
          <StepRow n={domainStep} optional title={t('examSetup.domain')}>
            <DomainSelector
              domains={EXAM_DOMAINS[examType]}
              selected={selectedDomains}
              onChange={setSelectedDomains}
              lang={lang}
              noMargin
            />
          </StepRow>

          {/* オプション */}
          <StepRow n={optionsStep} optional title={t('exerciseSetup.options')}>
            <div style={{ padding: 'var(--spacing-md)', background: 'var(--color-bg-main)', borderRadius: 'var(--border-radius-md)', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-xs)' }}>
              {user && (
                <label title={t('exerciseSetup.unansweredOnlyDesc')} style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', cursor: 'pointer', fontSize: 'var(--font-size-base)' }}>
                  <input type="checkbox" checked={unansweredOnly} onChange={e => { setUnansweredOnly(e.target.checked); if (e.target.checked) setIncorrectOnly(false); }} style={{ width: 16, height: 16, flexShrink: 0 }} />
                  {t('exerciseSetup.unansweredOnly')}
                </label>
              )}
              {user && (
                <label title={t('exerciseSetup.incorrectOnlyDesc')} style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', cursor: 'pointer', fontSize: 'var(--font-size-base)' }}>
                  <input type="checkbox" checked={incorrectOnly} onChange={e => { setIncorrectOnly(e.target.checked); if (e.target.checked) setUnansweredOnly(false); }} style={{ width: 16, height: 16, flexShrink: 0 }} />
                  {t('exerciseSetup.incorrectOnly')}
                </label>
              )}
              {user && (
                <label title={t('exerciseSetup.bookmarkOnlyDesc')} style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', cursor: 'pointer', fontSize: 'var(--font-size-base)' }}>
                  <input type="checkbox" checked={bookmarkOnly} onChange={e => setBookmarkOnly(e.target.checked)} style={{ width: 16, height: 16, flexShrink: 0 }} />
                  {t('exerciseSetup.bookmarkOnly')}
                </label>
              )}
              <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', cursor: 'pointer', fontSize: 'var(--font-size-base)' }}>
                <input type="checkbox" checked={shuffle} onChange={e => setShuffle(e.target.checked)} style={{ width: 16, height: 16, flexShrink: 0 }} />
                {t('exerciseSetup.shuffle')}
              </label>
            </div>
          </StepRow>

          {/* キーワード検索 */}
          <StepRow n={keywordStep} optional isLast
            title={lang === 'ja' ? 'キーワード検索' : 'Keyword Search'}>
            <div>
              <div style={{ display: 'flex', gap: 'var(--spacing-sm)' }}>
                <input
                  type="text"
                  value={keywordInput}
                  onChange={e => setKeywordInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddChip(); } }}
                  placeholder={t('questions.searchPlaceholder')}
                  style={{ flex: 1, padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 'var(--border-radius-md)', fontSize: 'var(--font-size-base)', outline: 'none', transition: 'border-color 0.2s' }}
                  onFocus={e => e.currentTarget.style.borderColor = 'var(--color-primary)'}
                  onBlur={e => e.currentTarget.style.borderColor = 'var(--color-border)'}
                />
                <Button size="sm" variant="outline" onClick={handleAddChip}>
                  {lang === 'ja' ? '追加' : 'Add'}
                </Button>
              </div>
              {keywordChips.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--spacing-xs)', marginTop: 'var(--spacing-sm)', alignItems: 'center' }}>
                  {keywordChips.map((chip, i) => (
                    <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#0097a7', color: 'white', borderRadius: 20, padding: '3px 10px', fontSize: 'var(--font-size-sm)' }}>
                      {chip}
                      <button onClick={() => removeChip(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'white', fontSize: 14, lineHeight: 1, padding: '0 0 0 2px' }}>✕</button>
                    </span>
                  ))}
                  <button onClick={() => setKeywordChips([])} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-light)', fontSize: 'var(--font-size-sm)' }}>
                    {lang === 'ja' ? 'クリア' : 'Clear'}
                  </button>
                </div>
              )}
            </div>
          </StepRow>

          {/* 中断中セッション通知 */}
          {hasDraft && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--spacing-md)',
              padding: '12px var(--spacing-md)', marginTop: 'var(--spacing-lg)', marginBottom: 'var(--spacing-md)',
              background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 'var(--border-radius-md)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
                <span style={{ fontSize: 18 }}>⏸</span>
                <div>
                  <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 700, color: '#92400e' }}>{t('examSetup.resumeNotice')}</div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: '#b45309' }}>{t('examSetup.resumeNoticeDesc')}</div>
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={resumeExam} style={{ borderColor: '#f59e0b', color: '#92400e', whiteSpace: 'nowrap', flexShrink: 0 }}>
                {t('examSetup.resume')} →
              </Button>
            </div>
          )}

          {/* 問題数不足警告 */}
          {availableCount !== null && availableCount > 0 && availableCount < config.totalQuestions && (
            <div style={{ marginBottom: 'var(--spacing-sm)', fontSize: 'var(--font-size-sm)', color: '#92400e', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 'var(--border-radius-md)', padding: '8px 12px' }}>
              ⚠️ {lang === 'ja'
                ? `条件に合う問題が${availableCount}問しかありません。${availableCount}問で開始します。`
                : `Only ${availableCount} questions match the criteria. The exam will start with ${availableCount} questions.`}
            </div>
          )}

          <div style={{ display: 'flex', gap: 'var(--spacing-md)', borderTop: '1px solid var(--color-border)', paddingTop: 'var(--spacing-lg)', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <Button variant="outline" onClick={() => navigate('/')}>
              {t('examSetup.cancel')}
            </Button>
            <Button
              variant="primary"
              onClick={startExam}
              disabled={loading || availableCount === 0}
              style={{ minWidth: 120 }}
            >
              {loading ? t('examSetup.starting') : t('examSetup.start')}
            </Button>
          </div>
        </Card>

        {/* 右：成績パネル */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-lg)' }}>

        <Card padding="var(--spacing-lg)">

          {/* テスト履歴 */}
          <div>
            <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-text-sub)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 'var(--spacing-sm)' }}>
              {lang === 'ja' ? 'テスト履歴' : 'Score History'} — {examType}
            </div>
            {!user ? (
              <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-light)' }}>
                {lang === 'ja' ? 'ログインすると履歴を確認できます' : 'Log in to view score history'}
              </div>
            ) : sessionsLoading ? (
              <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-light)' }}>...</div>
            ) : examSessions.length === 0 ? (
              <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-light)' }}>
                {lang === 'ja' ? 'まだ模試を受けていません' : 'No exam sessions yet'}
              </div>
            ) : (
              <div>
                {examSessions.map(s => {
                  const d = new Date(s.startedAt);
                  const dateStr = `${d.getMonth() + 1}/${d.getDate()}`;
                  return (
                    <div key={s.sessionId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid var(--color-border)' }}>
                      <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)' }}>{dateStr}</span>
                      <span style={{ fontSize: 'var(--font-size-base)', fontWeight: 700, color: s.isPassed ? 'var(--color-success)' : 'var(--color-danger)' }}>
                        {s.score}%
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 苦手ドメイン トップ3 */}
          {user && (
            <div style={{ marginTop: 'var(--spacing-lg)', paddingTop: 'var(--spacing-md)', borderTop: '1px solid var(--color-border)' }}>
              <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-text-sub)', marginBottom: 'var(--spacing-xs)' }}>
                {lang === 'ja' ? '苦手ドメイン' : 'Weakest Domains'}
              </div>
              {answeredCount === null ? (
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-light)' }}>...</div>
              ) : answeredCount <= 10 ? (
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-light)', fontStyle: 'italic' }}>
                  {lang === 'ja' ? `回答数が足りません（${answeredCount}問）` : `Not enough answers (${answeredCount} answered)`}
                </div>
              ) : (() => {
                const ranked = EXAM_DOMAINS[examType]
                  .map(d => {
                    const s = domainStats.find(x => x.tagId === d);
                    const correct = s?.correctCount ?? 0;
                    const incorrect = s?.incorrectCount ?? 0;
                    const total = correct + incorrect;
                    const rate = total > 0 ? correct / total : null;
                    return { d, rate };
                  })
                  .filter(x => x.rate !== null)
                  .sort((a, b) => a.rate! - b.rate!)
                  .slice(0, 3);
                if (ranked.length === 0) return <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-light)', fontStyle: 'italic' }}>{lang === 'ja' ? 'データなし' : 'No data'}</div>;
                return (
                  <>
                    {ranked.map(({ d, rate }, i) => (
                      <div key={d} style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', marginBottom: 4 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-light)', width: 14, flexShrink: 0 }}>{i + 1}</span>
                        <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-main)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {lang === 'en' ? (DOMAIN_NAME_EN[d] ?? d) : d}
                        </span>
                        <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-danger)', flexShrink: 0 }}>
                          {Math.round(rate! * 100)}%
                        </span>
                      </div>
                    ))}
                  </>
                );
              })()}
            </div>
          )}
        </Card>

        </div>{/* 右カラム終了 */}

      </div>
    </div>
  );
}
