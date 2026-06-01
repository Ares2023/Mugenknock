import React, { useEffect, useState, useCallback } from 'react';
import { Helmet } from 'react-helmet-async';
import { useNavigate } from 'react-router-dom';
import { API_ENDPOINT, EXAM_DOMAINS, DOMAIN_NAME_EN, EXAM_CONFIGS, DOMAIN_RATE_WARNING, DOMAIN_RATE_CAUTION } from '../constants';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import {
  IconCalendarNotebook, IconTarget, IconAnnoyed, IconList,
  IconSparkles, IconChevronRight, IconChevronDown, IconLock, IconFlag, IconStar,
} from '../components/Icons';

const FOCUSED_UNLOCK_THRESHOLD = 30;

type Session = {
  sessionId: string;
  examType: string;
  mode: string;
  score: number;
  isPassed: boolean;
  startedAt: string;
  endedAt?: string;
  isMini?: boolean;
  isFocused?: boolean;
  questionIds?: string[];
};

type AnswerRecord = {
  questionId: string;
  questionText: string;
  tags: string[];
  isCorrect: boolean;
  answeredAt: string;
};

type WeakQuestion = {
  questionId: string;
  questionText: string;
  correctCount: number;
  incorrectCount: number;
};

type DomainStat = {
  tagId: string;
  correctCount?: number;
  incorrectCount?: number;
  recentResults?: boolean[];
};

function jstToday(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

function daysUntil(dateStr: string): number {
  const examDate = new Date(dateStr + 'T00:00:00+09:00');
  const today = new Date(new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10) + 'T00:00:00+09:00');
  return Math.round((examDate.getTime() - today.getTime()) / 86400000);
}

export default function MyPage() {
  const { user } = useAuth();
  const { lang } = useLanguage();
  const navigate = useNavigate();
  const ja = lang === 'ja';
  const uid = user?.userId ?? 'guest';

  const [tab, setTab] = useState<'target' | 'analysis' | 'history'>('target');

  // ── ターゲット試験 ──
  const [targetExam, setTargetExam] = useState<string | null>(() => localStorage.getItem(`targetExam_${uid}`));
  useEffect(() => {
    const saved = localStorage.getItem(`targetExam_${uid}`);
    setTargetExam(saved);
  }, [uid]);

  // ── 受験日 ──
  const [examDate, setExamDate] = useState<string>(() =>
    targetExam ? (localStorage.getItem(`examDate_${targetExam}_${uid}`) ?? '') : ''
  );
  useEffect(() => {
    if (targetExam) setExamDate(localStorage.getItem(`examDate_${targetExam}_${uid}`) ?? '');
    else setExamDate('');
  }, [targetExam, uid]);

  const handleExamDateChange = (v: string) => {
    setExamDate(v);
    if (targetExam) {
      if (v) localStorage.setItem(`examDate_${targetExam}_${uid}`, v);
      else localStorage.removeItem(`examDate_${targetExam}_${uid}`);
      window.dispatchEvent(new CustomEvent('examDateChanged', { detail: { examType: targetExam, date: v } }));
    }
  };

  const remainingDays = examDate ? daysUntil(examDate) : null;

  // ── 日次目標 ──
  const [dailyGoal, setDailyGoal] = useState<number>(() =>
    parseInt(localStorage.getItem(`dailyGoal_${uid}`) ?? '10', 10)
  );
  const handleDailyGoalChange = (v: number) => {
    setDailyGoal(v);
    localStorage.setItem(`dailyGoal_${uid}`, String(v));
  };

  // ── 週間達成度 ──
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.now() + 9 * 3600 * 1000 - (6 - i) * 86400000);
    return d.toISOString().slice(0, 10);
  });
  const weekCounts = weekDays.map(d => {
    if (!targetExam) return 0;
    return parseInt(localStorage.getItem(`dailyQCount_${targetExam}_${uid}_${d}`) ?? '0', 10);
  });
  const todayCount = weekCounts[6];

  // ── ドメイン統計（苦手分析タブ） ──
  const [domainStats, setDomainStats] = useState<DomainStat[]>([]);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [statsLoading, setStatsLoading] = useState(false);

  useEffect(() => {
    if (tab !== 'analysis' || !user || !targetExam) return;
    setStatsLoading(true);
    Promise.all([
      fetch(`${API_ENDPOINT}/users/me/stats?userId=${user.userId}`).then(r => r.json()),
      fetch(`${API_ENDPOINT}/users/me/question-stats?userId=${user.userId}&examType=${targetExam}`).then(r => r.json()),
    ]).then(([statsData, qData]) => {
      setDomainStats(statsData.stats ?? []);
      setAnsweredCount(qData.answeredCount ?? 0);
    }).catch(() => {}).finally(() => setStatsLoading(false));
  }, [tab, user, targetExam]);

  const focusedUnlocked = !!user && answeredCount >= FOCUSED_UNLOCK_THRESHOLD;

  // ── 頻出ミス問題（苦手分析タブ） ──
  const [weakQuestions, setWeakQuestions] = useState<WeakQuestion[]>([]);
  const [weakLoading, setWeakLoading] = useState(false);
  const [weakLoaded, setWeakLoaded] = useState(false);

  useEffect(() => {
    if (tab !== 'analysis' || !user || !targetExam || !focusedUnlocked || weakLoaded) return;
    setWeakLoading(true);
    fetch(`${API_ENDPOINT}/users/me/weak-questions?userId=${user.userId}&examType=${targetExam}&minIncorrect=2`)
      .then(r => r.json())
      .then(d => { setWeakQuestions(d.items ?? []); setWeakLoaded(true); })
      .catch(() => {})
      .finally(() => setWeakLoading(false));
  }, [tab, user, targetExam, focusedUnlocked, weakLoaded]);

  // ── 弱問展開（苦手分析タブ） ──
  const [expandedWeakQ, setExpandedWeakQ] = useState<string | null>(null);
  const [weakQDetails, setWeakQDetails] = useState<Record<string, any>>({});
  const [weakQDetailLoading, setWeakQDetailLoading] = useState<string | null>(null);

  const handleToggleWeakQ = useCallback(async (qid: string) => {
    if (expandedWeakQ === qid) { setExpandedWeakQ(null); return; }
    setExpandedWeakQ(qid);
    if (weakQDetails[qid] || weakQDetailLoading === qid) return;
    setWeakQDetailLoading(qid);
    try {
      const res = await fetch(`${API_ENDPOINT}/questions/${qid}`);
      const data = await res.json();
      setWeakQDetails(prev => ({ ...prev, [qid]: data }));
    } catch { setWeakQDetails(prev => ({ ...prev, [qid]: null })); }
    finally { setWeakQDetailLoading(null); }
  }, [expandedWeakQ, weakQDetails, weakQDetailLoading]);

  // ── 演習履歴（履歴タブ） ──
  const [sessions, setSessions] = useState<Session[]>([]);
  const [histLoading, setHistLoading] = useState(false);
  const [histLoaded, setHistLoaded] = useState(false);
  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  const [sessionAnswers, setSessionAnswers] = useState<Record<string, AnswerRecord[]>>({});
  const [answersLoading, setAnswersLoading] = useState<string | null>(null);
  const [expandedAnswer, setExpandedAnswer] = useState<string | null>(null);
  const [answerDetails, setAnswerDetails] = useState<Record<string, any>>({});
  const [answerDetailLoading, setAnswerDetailLoading] = useState<string | null>(null);

  const handleToggleAnswer = useCallback(async (qid: string) => {
    if (expandedAnswer === qid) { setExpandedAnswer(null); return; }
    setExpandedAnswer(qid);
    if (answerDetails[qid] || answerDetailLoading === qid) return;
    setAnswerDetailLoading(qid);
    try {
      const res = await fetch(`${API_ENDPOINT}/questions/${qid}`);
      const data = await res.json();
      setAnswerDetails(prev => ({ ...prev, [qid]: data }));
    } catch { setAnswerDetails(prev => ({ ...prev, [qid]: null })); }
    finally { setAnswerDetailLoading(null); }
  }, [expandedAnswer, answerDetails, answerDetailLoading]);

  // ── ブックマーク ──
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set());
  const [bookmarkOpLoading, setBookmarkOpLoading] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;
    fetch(`${API_ENDPOINT}/users/me/bookmarks?userId=${user.userId}`)
      .then(r => r.json())
      .then(d => setBookmarkedIds(new Set(d.questionIds ?? [])))
      .catch(() => {});
  }, [user]);

  const toggleBookmark = useCallback(async (qid: string) => {
    if (!user || bookmarkOpLoading.has(qid)) return;
    const isBookmarked = bookmarkedIds.has(qid);
    setBookmarkOpLoading(prev => { const n = new Set(prev); n.add(qid); return n; });
    try {
      if (isBookmarked) {
        await fetch(`${API_ENDPOINT}/questions/${qid}/bookmark?userId=${user.userId}`, { method: 'DELETE' });
        setBookmarkedIds(prev => { const n = new Set(prev); n.delete(qid); return n; });
      } else {
        await fetch(`${API_ENDPOINT}/questions/${qid}/bookmark`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.userId }),
        });
        setBookmarkedIds(prev => { const n = new Set(prev); n.add(qid); return n; });
      }
    } catch {}
    finally { setBookmarkOpLoading(prev => { const n = new Set(prev); n.delete(qid); return n; }); }
  }, [user, bookmarkedIds, bookmarkOpLoading]);

  useEffect(() => {
    if (tab !== 'history' || !user || histLoaded) return;
    setHistLoading(true);
    fetch(`${API_ENDPOINT}/users/me/sessions?userId=${user.userId}&limit=10`)
      .then(r => r.json())
      .then(d => { setSessions(d.items ?? []); setHistLoaded(true); })
      .catch(() => {})
      .finally(() => setHistLoading(false));
  }, [tab, user, histLoaded]);

  const recentSessions = [...sessions]
    .sort((a, b) => (a.endedAt || a.startedAt) > (b.endedAt || b.startedAt) ? -1 : 1)
    .slice(0, 10);

  const handleToggleSession = useCallback(async (s: Session) => {
    if (!user) return;
    if (expandedSession === s.sessionId) { setExpandedSession(null); return; }
    setExpandedSession(s.sessionId);
    if (sessionAnswers[s.sessionId] || answersLoading === s.sessionId) return;
    setAnswersLoading(s.sessionId);
    try {
      const res = await fetch(`${API_ENDPOINT}/sessions/${s.sessionId}/answers?userId=${encodeURIComponent(user.userId)}`);
      const data = await res.json();
      setSessionAnswers(prev => ({ ...prev, [s.sessionId]: data.answers ?? [] }));
    } catch { setSessionAnswers(prev => ({ ...prev, [s.sessionId]: [] })); }
    finally { setAnswersLoading(null); }
  }, [user, expandedSession, sessionAnswers, answersLoading]);

  // ── UI helpers ──
  const tabStyle = (active: boolean): React.CSSProperties => ({
    background: 'none', border: 'none', cursor: 'pointer',
    padding: '8px 16px', fontSize: 13, fontWeight: active ? 700 : 400,
    color: active ? 'var(--color-primary)' : 'var(--color-text-sub)',
    borderBottom: `2px solid ${active ? 'var(--color-primary)' : 'transparent'}`,
    marginBottom: -1, transition: 'color 0.15s',
  });

  const domains = EXAM_DOMAINS[targetExam ?? ''] ?? [];

  return (
    <>
      <Helmet>
        <title>マイページ | 無限ノック</title>
      </Helmet>

      <div style={{ maxWidth: 680, margin: '0 auto', padding: '0 var(--spacing-md) var(--spacing-xl)' }}>

        {/* ── ページタイトル ── */}
        <div style={{ padding: '16px 0 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 700, fontSize: 18, color: 'var(--color-text-main)' }}>
            {ja ? 'マイページ' : 'My Page'}
          </span>
          {targetExam && (
            <span style={{ fontSize: 12, color: 'var(--color-text-sub)', fontWeight: 600, background: 'var(--color-bg-main)', borderRadius: 'var(--border-radius-full)', padding: '2px 10px' }}>
              {targetExam}
            </span>
          )}
        </div>

        {/* ── タブ ── */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border)', marginBottom: 16 }}>
          <button style={tabStyle(tab === 'target')} onClick={() => setTab('target')}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <IconTarget size={13} />{ja ? '目標' : 'Goals'}
            </span>
          </button>
          <button style={tabStyle(tab === 'analysis')} onClick={() => setTab('analysis')}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <IconAnnoyed size={13} />{ja ? '苦手分析' : 'Analysis'}
            </span>
          </button>
          <button style={tabStyle(tab === 'history')} onClick={() => setTab('history')}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <IconList />{ja ? '履歴' : 'History'}
            </span>
          </button>
        </div>

        {/* ════════ 目標タブ ════════ */}
        {tab === 'target' && (
          <>
            {/* 目標資格カード */}
            <Card style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                <IconFlag size={14} />
                <span style={{ fontWeight: 700, fontSize: 14 }}>{ja ? '目標資格' : 'Target Exam'}</span>
              </div>
              {targetExam ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--color-text-main)' }}>{targetExam}</div>
                    <div style={{ fontSize: 12, color: 'var(--color-text-sub)', marginTop: 2 }}>
                      {EXAM_CONFIGS[targetExam]?.fullName ?? ''}
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => navigate('/aws/exam-dashboard')}>
                    {ja ? '変更' : 'Change'}<IconChevronRight size={12} />
                  </Button>
                </div>
              ) : (
                <Button variant="outline" onClick={() => navigate('/aws/exam-dashboard')}>
                  {ja ? '目標資格を設定する' : 'Set target exam'}<IconChevronRight size={13} />
                </Button>
              )}
            </Card>

            {/* 受験日カード */}
            <Card style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                <IconCalendarNotebook size={14} />
                <span style={{ fontWeight: 700, fontSize: 14 }}>{ja ? '受験日' : 'Exam Date'}</span>
              </div>
              {!targetExam ? (
                <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-light)' }}>
                  {ja ? '目標資格を設定してください' : 'Set a target exam first'}
                </p>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <input
                      type="date"
                      value={examDate}
                      onChange={e => handleExamDateChange(e.target.value)}
                      style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: '6px 10px', fontSize: 14, background: 'var(--color-bg-white)', color: 'var(--color-text-main)', cursor: 'pointer' }}
                    />
                    {examDate && (
                      <Button variant="outline" size="sm" onClick={() => handleExamDateChange('')}>
                        {ja ? '削除' : 'Clear'}
                      </Button>
                    )}
                  </div>
                  {remainingDays !== null && (
                    <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 8, background: remainingDays < 0 ? 'var(--color-bg-main)' : remainingDays === 0 ? '#fff3cd' : 'var(--color-primary-light)' }}>
                      {remainingDays === 0 ? (
                        <span style={{ fontWeight: 700, fontSize: 15 }}>試験当日！ファイト🔥</span>
                      ) : remainingDays < 0 ? (
                        <span style={{ fontSize: 13, color: 'var(--color-text-sub)' }}>{ja ? `試験日から${Math.abs(remainingDays)}日経過` : `${Math.abs(remainingDays)} days since exam`}</span>
                      ) : (
                        <span style={{ fontSize: 15, fontWeight: 700 }}>
                          {ja ? 'あと' : ''}<span style={{ color: 'var(--color-primary)', fontSize: 22 }}>{remainingDays}</span>{ja ? '日！' : ' days left!'}
                        </span>
                      )}
                    </div>
                  )}
                </>
              )}
            </Card>

            {/* 日次目標カード */}
            <Card style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                <IconTarget size={14} />
                <span style={{ fontWeight: 700, fontSize: 14 }}>{ja ? '1日の目標演習量' : 'Daily Goal'}</span>
              </div>

              {/* ゴール設定スライダー */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {[10, 15, 20, 25, 30, 40, 50].map(v => (
                    <button
                      key={v}
                      onClick={() => handleDailyGoalChange(v)}
                      style={{
                        padding: '4px 12px', borderRadius: 'var(--border-radius-full)', fontSize: 13, fontWeight: dailyGoal === v ? 700 : 400, cursor: 'pointer',
                        background: 'transparent',
                        color: 'var(--color-text-main)',
                        border: `1.5px solid ${dailyGoal === v ? 'var(--color-primary)' : 'var(--color-border)'}`,
                        transition: 'all 0.12s',
                      }}
                    >{v}{ja ? '問' : 'Q'}</button>
                  ))}
                </div>
              </div>

              {/* 今日の進捗 */}
              {targetExam && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: 12, color: 'var(--color-text-sub)' }}>{ja ? '今日' : 'Today'}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: todayCount >= dailyGoal ? 'var(--color-primary)' : 'var(--color-text-main)' }}>
                      {todayCount} / {dailyGoal}{ja ? '問' : 'Q'}
                      {todayCount >= dailyGoal && <span style={{ marginLeft: 4 }}>✓</span>}
                    </span>
                  </div>
                  <div style={{ height: 8, borderRadius: 4, background: 'var(--color-bg-main)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: 4, background: todayCount >= dailyGoal ? 'var(--color-primary)' : 'var(--color-primary)', width: `${Math.min(100, (todayCount / dailyGoal) * 100)}%`, transition: 'width 0.3s' }} />
                  </div>
                </div>
              )}

              {/* 週間達成度 */}
              {targetExam && (
                <div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-sub)', marginBottom: 8 }}>{ja ? '直近7日間' : 'Last 7 days'}</div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
                    {weekDays.map((d, i) => {
                      const count = weekCounts[i];
                      const achieved = count >= dailyGoal;
                      const pct = dailyGoal > 0 ? Math.min(1, count / dailyGoal) : 0;
                      const isToday = d === jstToday();
                      const dayLabel = new Date(d + 'T12:00:00').toLocaleDateString(ja ? 'ja-JP' : 'en-US', { weekday: 'short' });
                      return (
                        <div key={d} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                          <div style={{ width: '100%', height: 44, borderRadius: 4, background: 'var(--color-bg-main)', position: 'relative', overflow: 'hidden' }}>
                            <div style={{ position: 'absolute', bottom: 0, width: '100%', height: `${pct * 100}%`, background: achieved ? 'var(--color-primary)' : 'var(--color-primary-light)', borderRadius: '4px 4px 0 0', transition: 'height 0.3s' }} />
                            {achieved && <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', fontSize: 10, color: 'white', fontWeight: 700 }}>✓</div>}
                          </div>
                          <span style={{ fontSize: 9, color: isToday ? 'var(--color-primary)' : 'var(--color-text-light)', fontWeight: isToday ? 700 : 400 }}>{dayLabel}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ marginTop: 8, fontSize: 11, color: 'var(--color-text-light)', textAlign: 'right' }}>
                    {ja ? `今週の達成日数：${weekCounts.filter(c => c >= dailyGoal).length}/7日` : `Achieved: ${weekCounts.filter(c => c >= dailyGoal).length}/7 days`}
                  </div>
                </div>
              )}
            </Card>

            {/* 日次目標達成で +10p ヒント */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 8, background: 'var(--color-bg-main)', fontSize: 12, color: 'var(--color-text-sub)' }}>
              <IconSparkles size={13} />
              {ja ? '1日の目標演習量を達成すると +10p ボーナス！' : 'Achieve your daily goal to earn +10p bonus!'}
            </div>
          </>
        )}

        {/* ════════ 苦手分析タブ ════════ */}
        {tab === 'analysis' && (
          <>
            {!user ? (
              <Card padding="var(--spacing-xl)">
                <p style={{ margin: 0, textAlign: 'center', fontSize: 13, color: 'var(--color-text-light)' }}>
                  {ja ? 'ログインすると苦手分析が表示されます' : 'Log in to view your analysis'}
                </p>
              </Card>
            ) : !targetExam ? (
              <Card padding="var(--spacing-xl)">
                <p style={{ margin: 0, textAlign: 'center', fontSize: 13, color: 'var(--color-text-light)' }}>
                  {ja ? '目標資格を設定してください' : 'Set a target exam first'}
                </p>
              </Card>
            ) : statsLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '32px 0' }}>
                <div className="sherpa-spinner" style={{ width: 28, height: 28, borderWidth: 3 }} />
              </div>
            ) : (
              <>
                {/* 苦手ドメイン */}
                <Card style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                    <IconAnnoyed size={14} />
                    <span style={{ fontWeight: 700, fontSize: 14 }}>{ja ? '苦手ドメイン' : 'Weak Domains'}</span>
                  </div>
                  {!focusedUnlocked ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 8, background: 'var(--color-bg-main)' }}>
                      <IconLock size={14} />
                      <div>
                        <div style={{ fontSize: 13, color: 'var(--color-text-sub)' }}>
                          {ja ? `あと${Math.max(0, FOCUSED_UNLOCK_THRESHOLD - answeredCount)}問演習するとアンロック` : `${Math.max(0, FOCUSED_UNLOCK_THRESHOLD - answeredCount)} more questions to unlock`}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--color-text-light)' }}>
                          {ja ? `現在 ${answeredCount}/${FOCUSED_UNLOCK_THRESHOLD}問` : `${answeredCount}/${FOCUSED_UNLOCK_THRESHOLD} answered`}
                        </div>
                      </div>
                    </div>
                  ) : domains.length === 0 ? (
                    <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-light)' }}>
                      {ja ? 'ドメイン情報がありません' : 'No domain data'}
                    </p>
                  ) : (
                    <>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {[...domains].sort((a, b) => {
                        const getPct = (d: string) => {
                          const stat = domainStats.find(s => s.tagId === d);
                          const recent = stat?.recentResults ?? [];
                          const total = recent.length;
                          if (total === 0) return -1;
                          return recent.filter(Boolean).length / total;
                        };
                        return getPct(a) - getPct(b);
                      }).map(domain => {
                        const stat = domainStats.find(s => s.tagId === domain);
                        const recent = stat?.recentResults ?? [];
                        const correct = recent.filter(Boolean).length;
                        const total = recent.length;
                        const pct = total > 0 ? Math.round((correct / total) * 100) : null;
                        const isWeak = pct !== null && pct < DOMAIN_RATE_WARNING * 100;
                        const isFair = pct !== null && pct < DOMAIN_RATE_CAUTION * 100 && !isWeak;
                        const color = pct === null ? 'var(--color-text-light)' : isWeak ? 'var(--color-danger)' : isFair ? 'var(--color-caution)' : 'var(--color-success)';
                        const barColor = pct === null ? 'var(--color-bg-main)' : isWeak ? 'var(--color-danger)' : isFair ? 'var(--color-caution)' : 'var(--color-success)';
                        const domainLabel = lang === 'en' ? (DOMAIN_NAME_EN[domain] ?? domain) : domain;
                        return (
                          <div key={domain} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                                <span style={{ fontSize: 12, color: isWeak ? 'var(--color-danger)' : 'var(--color-text-sub)', fontWeight: isWeak ? 700 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {isWeak && '⚠ '}{domainLabel}
                                </span>
                                <span style={{ fontSize: 12, fontWeight: 700, color, flexShrink: 0, marginLeft: 6 }}>
                                  {pct !== null ? `${pct}%` : (ja ? '未演習' : 'N/A')}
                                </span>
                              </div>
                              <div style={{ height: 6, borderRadius: 3, background: 'var(--color-bg-main)', overflow: 'hidden' }}>
                                {pct !== null && <div style={{ height: '100%', width: `${pct}%`, background: barColor, borderRadius: 3, transition: 'width 0.3s' }} />}
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                              {Array.from({ length: 5 }, (_, i) => (
                                <div key={i} style={{ width: 8, height: 8, borderRadius: 2, background: recent[i] === true ? 'var(--color-success)' : recent[i] === false ? 'var(--color-danger)' : 'var(--color-bg-main)' }} />
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--color-border)' }}>
                      {focusedUnlocked ? (
                        <button
                          onClick={() => navigate('/aws/', { state: { startFocused: true } })}
                          style={{ width: '100%', height: 44, border: 'none', background: '#009E9E', color: '#fff', fontWeight: 600, fontSize: 'var(--font-size-base)', borderRadius: 'var(--border-radius-full)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                          {ja ? 'しっかり対策' : 'Focused Practice'}
                        </button>
                      ) : (
                        <button
                          disabled
                          style={{ width: '100%', height: 44, border: '1.5px solid var(--color-border)', borderRadius: 'var(--border-radius-full)', background: 'transparent', color: 'var(--color-text-light)', fontWeight: 600, fontSize: 'var(--font-size-base)', cursor: 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}
                        >
                          <IconLock size={13} />
                          {ja ? 'しっかり対策' : 'Focused Practice'}
                        </button>
                      )}
                    </div>
                    </>
                  )}
                </Card>

                {/* 頻出ミス問題 */}
                <Card>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                    <span style={{ fontSize: 14 }}>✗</span>
                    <span style={{ fontWeight: 700, fontSize: 14 }}>{ja ? '間違えやすい問題（2回以上）' : 'Frequent Mistakes (2+ times)'}</span>
                  </div>
                  {!focusedUnlocked ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 8, background: 'var(--color-bg-main)' }}>
                      <IconLock size={14} />
                      <span style={{ fontSize: 13, color: 'var(--color-text-sub)' }}>
                        {ja ? `あと${Math.max(0, FOCUSED_UNLOCK_THRESHOLD - answeredCount)}問でアンロック` : `${Math.max(0, FOCUSED_UNLOCK_THRESHOLD - answeredCount)} more to unlock`}
                      </span>
                    </div>
                  ) : weakLoading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '16px 0' }}>
                      <div className="sherpa-spinner" style={{ width: 20, height: 20, borderWidth: 2 }} />
                    </div>
                  ) : weakQuestions.length === 0 ? (
                    <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-light)', textAlign: 'center', padding: '8px 0' }}>
                      {ja ? '2回以上間違えた問題はありません' : 'No questions wrong 2+ times'}
                    </p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {weakQuestions.map(q => {
                        const isExpanded = expandedWeakQ === q.questionId;
                        const detail = weakQDetails[q.questionId];
                        return (
                          <div key={q.questionId} style={{ borderRadius: 8, border: '1px solid var(--color-border)', overflow: 'hidden' }}>
                            <div
                              onClick={() => handleToggleWeakQ(q.questionId)}
                              style={{ padding: '8px 10px', display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer', background: isExpanded ? 'var(--color-bg-main)' : 'transparent' }}
                            >
                              <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, color: 'var(--color-danger)', background: 'var(--color-danger-light)', borderRadius: 4, padding: '2px 6px', marginTop: 1 }}>
                                ×{q.incorrectCount}
                              </span>
                              <span style={{ fontSize: 12, color: 'var(--color-text-sub)', lineHeight: 1.5, flex: 1, userSelect: 'text' }}>
                                {q.questionText?.slice(0, 80)}{(q.questionText?.length ?? 0) > 80 ? '…' : ''}
                              </span>
                              <span style={{ flexShrink: 0, color: 'var(--color-text-light)', transition: 'transform 0.2s', transform: isExpanded ? 'rotate(180deg)' : 'none', display: 'flex', alignItems: 'center', marginTop: 2 }}>
                                <IconChevronDown size={14} />
                              </span>
                            </div>
                            {isExpanded && (
                              <div style={{ padding: '10px 12px', borderTop: '1px solid var(--color-border)', background: 'var(--color-bg-white)' }}>
                                {weakQDetailLoading === q.questionId ? (
                                  <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0' }}>
                                    <div className="sherpa-spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
                                  </div>
                                ) : detail ? (
                                  <div style={{ userSelect: 'text' }}>
                                    <p style={{ fontSize: 13, color: 'var(--color-text-main)', lineHeight: 1.6, margin: '0 0 10px', whiteSpace: 'pre-wrap' }}>
                                      {detail.questionText}
                                    </p>
                                    {(detail.choices ?? []).map((c: string, i: number) => (
                                      <div key={i} style={{ fontSize: 12, color: 'var(--color-text-sub)', padding: '4px 8px', marginBottom: 3, borderRadius: 4, background: 'var(--color-bg-main)' }}>
                                        {String.fromCharCode(65 + i)}. {c.replace(/^[A-E]\.\s*/, '')}
                                      </div>
                                    ))}
                                    {detail.explanation && (
                                      <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: 6, background: 'var(--color-bg-info)', border: '1px solid var(--color-border-info)' }}>
                                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-info)', marginBottom: 4 }}>{ja ? '解説' : 'Explanation'}</div>
                                        <p style={{ fontSize: 12, color: 'var(--color-text-sub)', margin: 0, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{detail.explanation}</p>
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-light)' }}>{ja ? '詳細を取得できませんでした' : 'Failed to load details'}</p>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Card>
              </>
            )}
          </>
        )}

        {/* ════════ 履歴タブ ════════ */}
        {tab === 'history' && (
          <>
            {!user ? (
              <Card padding="var(--spacing-xl)">
                <p style={{ margin: 0, textAlign: 'center', fontSize: 13, color: 'var(--color-text-light)' }}>
                  {ja ? 'ログインすると履歴が表示されます' : 'Log in to view your history'}
                </p>
              </Card>
            ) : histLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '32px 0' }}>
                <div className="sherpa-spinner" style={{ width: 28, height: 28, borderWidth: 3 }} />
              </div>
            ) : recentSessions.length === 0 ? (
              <Card padding="var(--spacing-xl)">
                <p style={{ margin: 0, textAlign: 'center', fontSize: 13, color: 'var(--color-text-light)' }}>
                  {ja ? 'まだセッションがありません' : 'No sessions yet'}
                </p>
              </Card>
            ) : (
              <>
                <div style={{ fontSize: 12, color: 'var(--color-text-sub)', marginBottom: 10 }}>
                  {ja ? '直近10セッション' : 'Last 10 sessions'}
                </div>
                {recentSessions.map(s => {
                  const modeLabel = s.mode === 'exam'
                    ? (s.isMini ? (ja ? 'ミニ模試' : 'Mini Exam') : (ja ? '模試' : 'Mock Exam'))
                    : s.isFocused ? (ja ? 'しっかり対策' : 'Focused') : (ja ? 'サクッと演習' : 'Quick');
                  const modeBg = s.mode === 'exam' ? '#fff0f0' : s.isFocused ? '#e6f4f4' : 'var(--color-primary-light)';
                  const modeColor = s.mode === 'exam' ? 'var(--color-danger)' : s.isFocused ? '#009E9E' : 'var(--color-primary)';
                  const d = new Date(s.endedAt || s.startedAt);
                  const dateLabel = `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
                  const isExpanded = expandedSession === s.sessionId;
                  const answers = sessionAnswers[s.sessionId];
                  const qCount = s.questionIds?.length ?? 0;
                  const scoreColor = s.mode === 'exam'
                    ? (s.isPassed ? 'var(--color-success)' : 'var(--color-danger)')
                    : (s.score >= 70 ? 'var(--color-success)' : 'var(--color-danger)');

                  return (
                    <Card key={s.sessionId} style={{ marginBottom: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleToggleSession(s)}>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 'var(--border-radius-full)', background: modeBg, color: modeColor, flexShrink: 0 }}>
                          {modeLabel}
                        </span>
                        <span style={{ fontSize: 12, color: 'var(--color-text-sub)', flex: 1, minWidth: 0 }}>
                          {dateLabel}
                          {qCount > 0 && <span style={{ marginLeft: 6, color: 'var(--color-text-light)' }}>{qCount}{ja ? '問' : 'Q'}</span>}
                        </span>
                        <span style={{ fontWeight: 700, fontSize: 15, color: scoreColor, flexShrink: 0 }}>{s.score}%</span>
                        <span style={{ color: 'var(--color-text-light)', fontSize: 14, transition: 'transform 0.2s', transform: isExpanded ? 'rotate(90deg)' : 'none', flexShrink: 0 }}>›</span>
                      </div>
                      {isExpanded && (
                        <div style={{ marginTop: 10, borderTop: '1px solid var(--color-border)', paddingTop: 8 }}>
                          {answersLoading === s.sessionId ? (
                            <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0' }}>
                              <div className="sherpa-spinner" style={{ width: 18, height: 18, borderWidth: 2 }} />
                            </div>
                          ) : !answers || answers.length === 0 ? (
                            <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-light)', textAlign: 'center' }}>
                              {ja ? '回答データがありません' : 'No answer data'}
                            </p>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              {answers.map((a, idx) => {
                                const isAExpanded = expandedAnswer === a.questionId;
                                const aDetail = answerDetails[a.questionId];
                                return (
                                  <div key={a.questionId + idx} style={{ borderRadius: 6, border: '1px solid var(--color-border)', overflow: 'hidden' }}>
                                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 8px' }}>
                                      <span style={{ flexShrink: 0, width: 15, height: 15, borderRadius: '50%', background: a.isCorrect ? 'var(--color-success)' : 'var(--color-danger)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 8, fontWeight: 700 }}>
                                        {a.isCorrect ? '○' : '×'}
                                      </span>
                                      <span
                                        onClick={() => handleToggleAnswer(a.questionId)}
                                        style={{ fontSize: 12, color: 'var(--color-text-sub)', lineHeight: 1.5, flex: 1, cursor: 'pointer', userSelect: 'text' }}
                                      >
                                        {a.questionText?.slice(0, 60)}{(a.questionText?.length ?? 0) > 60 ? '…' : ''}
                                      </span>
                                      {user && (
                                        <button
                                          onClick={e => { e.stopPropagation(); toggleBookmark(a.questionId); }}
                                          disabled={bookmarkOpLoading.has(a.questionId)}
                                          style={{ flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', display: 'flex', alignItems: 'center', opacity: bookmarkOpLoading.has(a.questionId) ? 0.5 : 1 }}
                                        >
                                          <span style={{ color: bookmarkedIds.has(a.questionId) ? 'var(--color-warning, #f59e0b)' : 'var(--color-text-light)' }}>
                                            <IconStar filled={bookmarkedIds.has(a.questionId)} size={14} />
                                          </span>
                                        </button>
                                      )}
                                      <button
                                        onClick={() => handleToggleAnswer(a.questionId)}
                                        style={{ flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', display: 'flex', alignItems: 'center', color: 'var(--color-text-light)', transition: 'transform 0.2s', transform: isAExpanded ? 'rotate(180deg)' : 'none' }}
                                      >
                                        <IconChevronDown size={13} />
                                      </button>
                                    </div>
                                    {isAExpanded && (
                                      <div style={{ padding: '8px 10px', borderTop: '1px solid var(--color-border)', background: 'var(--color-bg-main)' }}>
                                        {answerDetailLoading === a.questionId ? (
                                          <div style={{ display: 'flex', justifyContent: 'center', padding: '6px 0' }}>
                                            <div className="sherpa-spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                                          </div>
                                        ) : aDetail ? (
                                          <div style={{ userSelect: 'text' }}>
                                            <p style={{ fontSize: 12, color: 'var(--color-text-main)', lineHeight: 1.6, margin: '0 0 8px', whiteSpace: 'pre-wrap' }}>
                                              {aDetail.questionText}
                                            </p>
                                            {(aDetail.choices ?? []).map((c: string, i: number) => (
                                              <div key={i} style={{ fontSize: 11, color: 'var(--color-text-sub)', padding: '3px 6px', marginBottom: 2, borderRadius: 4, background: 'var(--color-bg-white)' }}>
                                                {String.fromCharCode(65 + i)}. {c.replace(/^[A-E]\.\s*/, '')}
                                              </div>
                                            ))}
                                            {aDetail.explanation && (
                                              <div style={{ marginTop: 8, padding: '6px 8px', borderRadius: 5, background: 'var(--color-bg-info)', border: '1px solid var(--color-border-info)' }}>
                                                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-text-info)', marginBottom: 3 }}>{ja ? '解説' : 'Explanation'}</div>
                                                <p style={{ fontSize: 11, color: 'var(--color-text-sub)', margin: 0, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{aDetail.explanation}</p>
                                              </div>
                                            )}
                                          </div>
                                        ) : (
                                          <p style={{ margin: 0, fontSize: 11, color: 'var(--color-text-light)' }}>{ja ? '詳細を取得できませんでした' : 'Failed to load details'}</p>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </Card>
                  );
                })}
              </>
            )}
          </>
        )}
      </div>
    </>
  );
}
