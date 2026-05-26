import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_ENDPOINT, EXAM_TYPES, EXAM_CONFIGS, EXAM_DOMAINS } from '../constants';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import DomainSelector from '../components/DomainSelector';
import { getCached, setCached, SHORT_TTL } from '../utils/cache';
import { IconLightbulb } from '../components/Icons';

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


const loadExamPrefs = (et: string, uid: string) => {
  try { return JSON.parse(localStorage.getItem(`examPrefs_${uid}`) ?? '{}')[et] ?? {}; } catch { return {}; }
};
const saveExamPrefs = (et: string, uid: string, prefs: object) => {
  try {
    const stored = JSON.parse(localStorage.getItem(`examPrefs_${uid}`) ?? '{}');
    stored[et] = prefs;
    localStorage.setItem(`examPrefs_${uid}`, JSON.stringify(stored));
  } catch {}
};

export default function ExamSetup() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { lang, t } = useLanguage();
  const uid = user?.userId ?? 'guest';
  const [targetExam, setTargetExamState] = useState<string | null>(() => localStorage.getItem(`targetExam_${uid}`));
  const [examType, setExamType] = useState<string>(() => localStorage.getItem(`targetExam_${uid}`) || 'SAA');

  const handleSelectExamInSetup = (et: string) => {
    localStorage.setItem(`targetExam_${uid}`, et);
    setTargetExamState(et);
    setExamType(et);
  };
  const [selectedDomains, setSelectedDomains] = useState<string[]>(() => { const et = localStorage.getItem(`targetExam_${uid}`) || 'SAA'; return loadExamPrefs(et, uid).domains ?? EXAM_DOMAINS[et] ?? []; });
  const [availableCount, setAvailableCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [showHint, setShowHint] = useState(() => !localStorage.getItem(`sherpaExamHint_${uid}`));
  const [examDraft] = useState<any>(() => {
    try { return JSON.parse(localStorage.getItem(`examDraft_${uid}`) ?? 'null'); } catch { return null; }
  });
  const [bookmarkOnly, setBookmarkOnly] = useState<boolean>(() => loadExamPrefs(localStorage.getItem(`targetExam_${uid}`) || 'SAA', uid).bookmarkOnly ?? false);
  const [unansweredOnly, setUnansweredOnly] = useState<boolean>(() => loadExamPrefs(localStorage.getItem(`targetExam_${uid}`) || 'SAA', uid).unansweredOnly ?? false);
  const [incorrectOnly, setIncorrectOnly] = useState<boolean>(() => loadExamPrefs(localStorage.getItem(`targetExam_${uid}`) || 'SAA', uid).incorrectOnly ?? false);
  const [aiVerifiedOnly, setAiVerifiedOnly] = useState<boolean>(() => loadExamPrefs(localStorage.getItem(`targetExam_${uid}`) || 'SAA', uid).aiVerifiedOnly ?? false);
  const [miniExam, setMiniExam] = useState<boolean>(false);
  const hasDraft = examDraft?.examType === examType;

  type ExamSession = { sessionId: string; examType: string; mode: string; score: number; isPassed: boolean; startedAt: string; isMini?: boolean; };
  const [examSessions, setExamSessions] = useState<ExamSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  type DomainStat = { tagId: string; correctCount: number; incorrectCount: number };
  const [domainStats, setDomainStats] = useState<DomainStat[]>([]);

  const config = EXAM_CONFIGS[examType];

  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    const prefs = loadExamPrefs(examType, uid);
    setSelectedDomains(prefs.domains ?? EXAM_DOMAINS[examType]);
    setBookmarkOnly(prefs.bookmarkOnly ?? false);
    setUnansweredOnly(prefs.unansweredOnly ?? false);
    setIncorrectOnly(prefs.incorrectOnly ?? false);
    setAiVerifiedOnly(prefs.aiVerifiedOnly ?? false);
  }, [examType]);

  useEffect(() => {
    saveExamPrefs(examType, uid, { domains: selectedDomains, bookmarkOnly, unansweredOnly, incorrectOnly, aiVerifiedOnly });
  }, [examType, selectedDomains, bookmarkOnly, unansweredOnly, incorrectOnly, aiVerifiedOnly]);

  const resumeExam = () => {
    if (!examDraft) return;
    navigate('/aws/exam/session', {
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
          if (aiVerifiedOnly) items = items.filter((q: any) => q.aiVerified === true);
          setAvailableCount(items.length);
        } else {
          const data = await fetch(`${API_ENDPOINT}/questions?${params}`).then(r => r.json());
          let countItems: any[] = data.items ?? [];
          if (aiVerifiedOnly) countItems = countItems.filter((q: any) => q.aiVerified === true);
          setAvailableCount(aiVerifiedOnly ? countItems.length : (data.count ?? countItems.length));
        }
      } catch { setAvailableCount(0); }
    };

    fetchCounts();
  }, [examType, selectedDomains, user, bookmarkOnly, unansweredOnly, incorrectOnly, aiVerifiedOnly]);

  useEffect(() => {
    if (!user) { setExamSessions([]); setDomainStats([]); return; }
    setSessionsLoading(true);
    fetch(`${API_ENDPOINT}/users/me/sessions?userId=${user.userId}&limit=50`)
      .then(r => r.json())
      .then(d => setExamSessions(
        (d.items ?? []).filter((s: ExamSession) => s.examType === examType && s.mode === 'exam').slice(0, 10)
      ))
      .catch(() => setExamSessions([]))
      .finally(() => setSessionsLoading(false));
    const cachedStats = getCached<any[]>(`ustats_${user.userId}`);
    if (cachedStats !== null) {
      setDomainStats(cachedStats);
    } else {
      fetch(`${API_ENDPOINT}/users/me/stats?userId=${user.userId}`)
        .then(r => r.json())
        .then(d => {
          setDomainStats(d.stats ?? []);
          setCached(`ustats_${user.userId}`, d.stats ?? [], SHORT_TTL);
        })
        .catch(() => setDomainStats([]));
    }
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
        let pool: any[] = qRes.items ?? [];
        if (aiVerifiedOnly) pool = pool.filter((q: any) => q.aiVerified === true);
        let filtered = [...pool];
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
        for (let i = filtered.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [filtered[i], filtered[j]] = [filtered[j], filtered[i]];
        }
        let usedFallback = false;
        if (filtered.length < limit && filtered.length < pool.length) {
          const usedIds = new Set(filtered.map((q: any) => q.questionId));
          const extras = pool.filter((q: any) => !usedIds.has(q.questionId));
          for (let i = extras.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [extras[i], extras[j]] = [extras[j], extras[i]]; }
          filtered = [...filtered, ...extras];
          usedFallback = true;
        }
        selectedItems = filtered.slice(0, limit);
        if (usedFallback) alert(lang === 'ja' ? 'フィルタ条件に合う問題が不足したため、条件外の問題も含めて出題します。' : 'Not enough questions matched your filters. Including additional questions.');
      } else {
        const params = new URLSearchParams({ examType, withAnswers: 'true' });
        if (!allSelected) params.set('domain', selectedDomains.join(','));
        const data = await fetch(`${API_ENDPOINT}/questions?${params}`).then(r => r.json());
        let allItems: any[] = data.items ?? [];
        if (aiVerifiedOnly) allItems = allItems.filter((q: any) => q.aiVerified === true);
        for (let i = allItems.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [allItems[i], allItems[j]] = [allItems[j], allItems[i]];
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

      navigate('/aws/exam/session', {
        state: { sessionId: sessionData.sessionId, questions: selectedItems, userId, examType, isMini: miniExam }
      });
    } catch (err) {
      console.error(err);
      alert(t('examSetup.startFailed'));
    } finally {
      setLoading(false);
    }
  };

  let _s = 0;
  const examStep    = targetExam ? null : ++_s;
  const domainStep  = ++_s;
  const optionsStep = ++_s;
  const domainRates: Record<string, number | null> = {};
  for (const d of EXAM_DOMAINS[examType]) {
    const s = domainStats.find(x => x.tagId === d);
    if (!s) { domainRates[d] = null; continue; }
    const total = s.correctCount + s.incorrectCount;
    domainRates[d] = total > 0 ? s.correctCount / total : null;
  }

  const lastExam = examSessions.length > 0 ? examSessions[0] : null;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 'var(--spacing-xl) var(--spacing-lg)' }} className="page-container">

      {showHint && (
        <div className="fade-slide-in" style={{
          display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)',
          background: 'var(--color-hint-bg)', border: '1px solid var(--color-hint-border)',
          borderRadius: 'var(--border-radius-md)', padding: '10px var(--spacing-md)',
          marginBottom: 'var(--spacing-lg)', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)',
        }}>
          <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center', color: 'var(--color-text-sub)' }}><IconLightbulb size={16} /></span>
          <span style={{ flex: 1, lineHeight: 1.5 }}>{t('examSetup.hint')}</span>
          <button
            onClick={() => { localStorage.setItem(`sherpaExamHint_${uid}`, '1'); setShowHint(false); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-light)', fontSize: 18, lineHeight: 1, padding: '0 4px', flexShrink: 0 }}
          >✕</button>
        </div>
      )}

      {/* 前回の模試成績 */}
      {user && (
        <Card padding="var(--spacing-md)" style={{ marginBottom: 'var(--spacing-lg)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--spacing-sm)' }}>
            <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-text-sub)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              {lang === 'ja' ? '前回の模試成績' : 'Last Exam Result'}
            </span>
            <button
              onClick={() => navigate('/aws/stats')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 'var(--font-size-sm)', color: 'var(--color-primary)', padding: 0, fontWeight: 600 }}
            >
              {lang === 'ja' ? 'ノック成績 →' : 'Performance →'}
            </button>
          </div>
          {sessionsLoading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-lg)' }}>
              <div className="skeleton" style={{ height: 36, width: 68, borderRadius: 4 }} />
              <div>
                <div className="skeleton" style={{ height: 14, width: 48, borderRadius: 4, marginBottom: 6 }} />
                <div className="skeleton" style={{ height: 12, width: 80, borderRadius: 4 }} />
              </div>
            </div>
          ) : !lastExam ? (
            <p style={{ margin: 0, fontSize: 'var(--font-size-sm)', color: 'var(--color-text-light)', fontStyle: 'italic' }}>
              {lang === 'ja' ? 'まだ模試を受けていません' : 'No exam history yet'}
            </p>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-lg)' }}>
              <span style={{ fontSize: 'var(--font-size-xxl)', fontWeight: 800, color: lastExam.isPassed ? 'var(--color-success)' : 'var(--color-danger)' }}>
                {lastExam.score}%
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 700, color: lastExam.isPassed ? 'var(--color-success)' : 'var(--color-danger)' }}>
                  {lastExam.isPassed ? (lang === 'ja' ? '合格' : 'Passed') : (lang === 'ja' ? '不合格' : 'Failed')}
                </span>
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-light)' }}>
                  {new Date(lastExam.startedAt).toLocaleDateString(lang === 'ja' ? 'ja-JP' : 'en-US')}
                  {lastExam.isMini ? (lang === 'ja' ? '（ミニ）' : ' (Mini)') : ''}
                </span>
              </div>
            </div>
          )}
        </Card>
      )}

        {/* 設定フォーム */}
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
              weakRates={user ? domainRates : undefined}
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
                <input type="checkbox" checked={aiVerifiedOnly} onChange={e => setAiVerifiedOnly(e.target.checked)} style={{ width: 16, height: 16, flexShrink: 0 }} />
                {lang === 'ja' ? 'AI確認済' : 'AI Verified'}
              </label>
              {!user && (
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-light)', paddingTop: 6, borderTop: '1px solid var(--color-border)' }}>
                  {lang === 'ja'
                    ? '※ ログインするとブックマーク・未回答・誤答フィルタが使えます'
                    : '* Log in to filter by bookmarks, unanswered, or incorrect'}
                </div>
              )}
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

        </Card>
      <div className="sticky-page-action">
        {!user && (
          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-light)', marginBottom: 6, textAlign: 'center' }}>
            {lang === 'ja' ? '※ ログインすると結果が保存されます' : '* Log in to save your results'}
          </div>
        )}
        <Button
          variant="primary"
          onClick={startExam}
          disabled={loading || availableCount === 0}
          style={{ width: '100%' }}
        >
          {loading ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 13, height: 13, border: '2px solid rgba(0,0,0,0.25)', borderTopColor: '#16191f', borderRadius: '50%', animation: 'sherpa-spin 0.7s linear infinite', flexShrink: 0 }} />
              {t('examSetup.starting')}
            </span>
          ) : miniExam
            ? (lang === 'ja' ? 'ミニ模試を開始' : 'Start Mini Exam')
            : t('examSetup.start')}
        </Button>
      </div>
      {loading && <div style={{ position: 'fixed', inset: 0, zIndex: 9000, cursor: 'wait' }} />}
    </div>
  );
}
