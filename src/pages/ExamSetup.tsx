import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_ENDPOINT, EXAM_TYPES, EXAM_CONFIGS, EXAM_DOMAINS, PASS_SCORES, PASS_RATE, DOMAIN_NAME_EN, DOMAIN_RATE_WARNING, DOMAIN_RATE_CAUTION } from '../constants';
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
    background: 'var(--color-primary)',
    color: 'var(--color-on-primary)',
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
  const [miniExam, setMiniExam] = useState<boolean>(false);
  const hasDraft = examDraft?.examType === examType;

  type ExamSession = { sessionId: string; examType: string; mode: string; score: number; isPassed: boolean; startedAt: string; isMini?: boolean; };
  const [examSessions, setExamSessions] = useState<ExamSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  type DomainStat = { tagId: string; correctCount: number; incorrectCount: number };
  const [domainStats, setDomainStats] = useState<DomainStat[]>([]);
  const [answeredCount, setAnsweredCount] = useState<number | null>(null);

  const config = EXAM_CONFIGS[examType];
  const passScore = PASS_SCORES[examType];

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
        isMini: examDraft.isMini ?? false,
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

        if (user && (bookmarkOnly || unansweredOnly || incorrectOnly)) {
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
          setAvailableCount(items.length);
        } else {
          const data = await fetch(`${API_ENDPOINT}/questions?${params}`).then(r => r.json());
          setAvailableCount(data.count ?? data.items?.length ?? 0);
        }
      } catch { setAvailableCount(0); }
    };

    fetchCounts();
  }, [examType, selectedDomains, user, bookmarkOnly, unansweredOnly, incorrectOnly]);

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
      const targetCount = miniExam ? Math.ceil(config.totalQuestions / 5) : config.totalQuestions;
      const limit = Math.min(targetCount, availableCount ?? targetCount);
      let selectedItems: any[];

      const allSelected = EXAM_DOMAINS[examType].every(d => selectedDomains.includes(d));
      if (user && (bookmarkOnly || unansweredOnly || incorrectOnly)) {
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
        body: JSON.stringify({ userId, mode: 'exam', examType, questionIds, ...(miniExam ? { isMini: true } : {}) })
      });
      const sessionData = await sessionRes.json();

      navigate('/exam/session', {
        state: { sessionId: sessionData.sessionId, questions: selectedItems, userId, examType, isMini: miniExam }
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
                    variant="outline"
                    size="sm"
                    onClick={() => handleSelectExamInSetup(et)}
                    style={{ width: 72, ...(examType === et ? { background: 'var(--color-primary-light)', borderWidth: 2 } : {}) }}
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
          <StepRow n={optionsStep} optional isLast title={t('exerciseSetup.options')}>
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
              <div style={{ height: 1, background: 'var(--color-border)', margin: '4px 0' }} />
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--spacing-sm)', cursor: 'pointer', fontSize: 'var(--font-size-base)' }}>
                <input type="checkbox" checked={miniExam} onChange={e => setMiniExam(e.target.checked)} style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
                <span>
                  {lang === 'ja' ? 'ミニ模試モード' : 'Mini Exam Mode'}
                  <span style={{ display: 'block', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-light)', marginTop: 2 }}>
                    {lang === 'ja'
                      ? `問題数・時間を 1/5 に短縮（${Math.ceil(config.totalQuestions / 5)}問 / ${Math.ceil(config.timeLimitMin / 5)}分）`
                      : `1/5 questions & time (${Math.ceil(config.totalQuestions / 5)} questions / ${Math.ceil(config.timeLimitMin / 5)} min)`}
                  </span>
                </span>
              </label>
            </div>
          </StepRow>

          {/* 中断中セッション通知 */}
          {hasDraft && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--spacing-md)',
              padding: '12px var(--spacing-md)', marginTop: 'var(--spacing-lg)', marginBottom: 'var(--spacing-md)',
              background: 'var(--color-bg-warning)', border: '1px solid var(--color-border-warning)', borderRadius: 'var(--border-radius-md)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
                <span style={{ fontSize: 18 }}>⏸</span>
                <div>
                  <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 700, color: 'var(--color-text-warning)' }}>{t('examSetup.resumeNotice')}</div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-warning-sub)' }}>{t('examSetup.resumeNoticeDesc')}</div>
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={resumeExam} style={{ borderColor: 'var(--color-border-warning)', color: 'var(--color-text-warning)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                {t('examSetup.resume')} →
              </Button>
            </div>
          )}

          {/* 問題数不足警告 */}
          {availableCount !== null && availableCount > 0 && availableCount < config.totalQuestions && (
            <div style={{ marginBottom: 'var(--spacing-sm)', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-warning)', background: 'var(--color-bg-warning)', border: '1px solid var(--color-border-warning)', borderRadius: 'var(--border-radius-md)', padding: '8px 12px' }}>
              ⚠️ {lang === 'ja'
                ? `条件に合う問題が${availableCount}問しかありません。${availableCount}問で開始します。`
                : `Only ${availableCount} questions match the criteria. The exam will start with ${availableCount} questions.`}
            </div>
          )}

          <div style={{ display: 'flex', gap: 'var(--spacing-md)', borderTop: '1px solid var(--color-border)', paddingTop: 'var(--spacing-lg)', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <Button variant="outline" onClick={() => navigate('/')}
              style={{ border: 'none', color: 'var(--color-text-sub)' }}>
              {t('examSetup.cancel')}
            </Button>
            <Button
              variant="primary"
              onClick={startExam}
              disabled={loading || availableCount === 0}
              style={{ minWidth: 120, background: '#FF9900', color: '#16191f', borderColor: '#FF9900' }}
            >
              {loading ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 13, height: 13, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: 'white', borderRadius: '50%', animation: 'sherpa-spin 0.7s linear infinite', flexShrink: 0 }} />
                  {t('examSetup.starting')}
                </span>
              ) : miniExam
                ? (lang === 'ja' ? 'ミニ模試を開始' : 'Start Mini Exam')
                : t('examSetup.start')}
            </Button>
          </div>
        </Card>

        {/* 右：成績パネル */}
        <div className="setup-grade-panel" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-lg)' }}>

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
              <div style={{ display: 'flex', justifyContent: 'center', padding: '16px 0' }}>
                <div className="sherpa-spinner" style={{ width: 24, height: 24, borderWidth: 2 }} />
              </div>
            ) : examSessions.length === 0 ? (
              <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-light)' }}>
                {lang === 'ja' ? 'まだ模試を受けていません' : 'No exam sessions yet'}
              </div>
            ) : (
              <div>
                {examSessions.slice(0, 3).map(s => {
                  const d = new Date(s.startedAt);
                  const dateStr = `${d.getMonth() + 1}/${d.getDate()}`;
                  return (
                    <div key={s.sessionId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid var(--color-border)' }}>
                      <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)', display: 'flex', alignItems: 'center', gap: 4 }}>
                        {dateStr}
                        {s.isMini && <span style={{ fontSize: 10, background: 'var(--color-warning)', color: 'var(--color-secondary)', borderRadius: 3, padding: '1px 4px', fontWeight: 700 }}>{lang === 'ja' ? 'ミニ' : 'Mini'}</span>}
                      </span>
                      <span style={{ fontSize: 'var(--font-size-base)', fontWeight: 700, color: s.isPassed ? 'var(--color-success)' : 'var(--color-danger)' }}>
                        {s.score}%
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 苦手ドメインランキング */}
          {user && (
            <div style={{ marginTop: 'var(--spacing-lg)', paddingTop: 'var(--spacing-md)', borderTop: '1px solid var(--color-border)' }}>
              <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-text-sub)', marginBottom: 'var(--spacing-xs)' }}>
                {lang === 'ja' ? '苦手ドメインランキング' : 'Weakest Domain Ranking'}
              </div>
              {answeredCount === null ? (
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-light)' }}>...</div>
              ) : answeredCount <= 10 ? (
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-light)', fontStyle: 'italic' }}>
                  {lang === 'ja' ? `回答数が足りません（${answeredCount}問）` : `Not enough answers (${answeredCount} answered)`}
                </div>
              ) : (() => {
                const sorted = EXAM_DOMAINS[examType]
                  .map(d => {
                    const s = domainStats.find(x => x.tagId === d);
                    const correct = s?.correctCount ?? 0;
                    const incorrect = s?.incorrectCount ?? 0;
                    const total = correct + incorrect;
                    const rate = total > 0 ? correct / total : null;
                    return { d, rate };
                  })
                  .filter(x => x.rate !== null)
                  .sort((a, b) => a.rate! - b.rate!);
                if (sorted.length === 0) return <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-light)', fontStyle: 'italic' }}>{lang === 'ja' ? 'データなし' : 'No data'}</div>;
                const base = sorted.slice(0, 3);
                const cutoff = base[base.length - 1].rate;
                const top3 = [...base, ...sorted.slice(3).filter(x => x.rate === cutoff)];
                let rankNum = 1;
                const withRanks = top3.map((item, i) => {
                  if (i > 0 && item.rate !== top3[i - 1].rate) rankNum = i + 1;
                  return { ...item, rankNum };
                });
                const rateColor = (r: number) =>
                  r < DOMAIN_RATE_WARNING ? 'var(--color-danger)' : r < DOMAIN_RATE_CAUTION ? 'var(--color-caution)' : 'var(--color-text-sub)';
                return (
                  <>
                    {withRanks.map(({ d, rate, rankNum: rn }) => (
                      <div key={d} style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', marginBottom: 4 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-light)', width: 14, flexShrink: 0 }}>{rn}</span>
                        <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-main)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {lang === 'en' ? (DOMAIN_NAME_EN[d] ?? d) : d}
                        </span>
                        <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: rateColor(rate!), flexShrink: 0 }}>
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
