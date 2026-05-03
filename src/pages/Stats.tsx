import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_ENDPOINT, EXAM_TYPES, PASS_RATE, EXAM_DOMAINS, DOMAIN_NAME_EN } from '../constants';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';

const TARGET_EXAM_KEY = 'targetExam';

type ExamStat = {
  examType: string;
  total: number;
  answered: number;
  lastScore: number | null;
  lastPassed: boolean | null;
};

type Session = {
  sessionId: string;
  examType: string;
  mode: string;
  score: number;
  isPassed: boolean;
  startedAt: string;
  endedAt?: string;
  isMini?: boolean;
};

type TagStat = {
  tagId: string;
  correctCount?: number;
  incorrectCount?: number;
};

type WeakQuestion = {
  questionId: string;
  questionText: string;
  correctCount: number;
  incorrectCount: number;
};

const ScoreLineChart = ({ sessions, passRate, lang }: { sessions: Session[]; passRate: number; lang: string }) => {
  const W = 500, H = 170;
  const padL = 30, padR = 36, padT = 20, padB = 28;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;
  const n = sessions.length;
  const xOf = (i: number) => padL + (n > 1 ? (i / (n - 1)) * chartW : chartW / 2);
  const yOf = (score: number) => padT + chartH * (1 - score / 100);
  const passY = yOf(passRate);
  const linePoints = sessions.map((s, i) => `${xOf(i)},${yOf(s.score)}`).join(' ');
  const gridScores = [0, 25, 50, 75, 100];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img">
      {gridScores.map(v => (
        <g key={v}>
          <line x1={padL} y1={yOf(v)} x2={W - padR} y2={yOf(v)} stroke="var(--color-border)" strokeWidth={0.7} />
          <text x={padL - 4} y={yOf(v) + 3.5} fontSize={9} textAnchor="end" fill="var(--color-text-light)">{v}</text>
        </g>
      ))}
      <line x1={padL} y1={passY} x2={W - padR} y2={passY} stroke="var(--color-primary)" strokeWidth={1.2} strokeDasharray="5 3" />
      <text x={W - padR + 3} y={passY + 3.5} fontSize={9} fill="var(--color-primary)" fontWeight="700">{passRate}%</text>
      {n > 1 && <polyline points={linePoints} fill="none" stroke="var(--color-primary)" strokeWidth={2} strokeOpacity={0.35} strokeLinejoin="round" />}
      {sessions.map((s, i) => {
        const cx = xOf(i), cy = yOf(s.score);
        const color = s.isPassed ? 'var(--color-success)' : 'var(--color-danger)';
        const d = new Date(s.endedAt || s.startedAt);
        const label = `${d.getMonth() + 1}/${d.getDate()}`;
        return (
          <g key={s.sessionId}>
            {s.isMini
              ? <circle cx={cx} cy={cy} r={5} fill="white" stroke={color} strokeWidth={2} strokeDasharray="3 2" />
              : <circle cx={cx} cy={cy} r={5} fill={color} />}
            <text x={cx} y={cy - 8} textAnchor="middle" fontSize={9} fontWeight="700" fill={color}>{s.score}%</text>
            <text x={cx} y={H - padB + 12} textAnchor="middle" fontSize={9} fill="var(--color-text-light)">{label}</text>
            {s.isMini && <text x={cx} y={H - padB + 21} textAnchor="middle" fontSize={8} fill="var(--color-text-light)">{lang === 'ja' ? 'ミニ' : 'mini'}</text>}
          </g>
        );
      })}
    </svg>
  );
};

const SectionDivider = ({ label, color }: { label: string; color: string }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)', margin: 'var(--spacing-xl) 0 var(--spacing-md)' }}>
    <span style={{
      background: color, color: 'white',
      fontSize: 'var(--font-size-xs)', fontWeight: 700,
      padding: '3px 12px', borderRadius: 'var(--border-radius-full)',
      letterSpacing: '0.5px', flexShrink: 0,
    }}>{label}</span>
    <div style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
  </div>
);

export default function Stats() {
  const { user } = useAuth();
  const { lang, t } = useLanguage();
  const navigate = useNavigate();
  const [examStats, setExamStats] = useState<ExamStat[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [tagStats, setTagStats] = useState<TagStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [targetExam, setTargetExam] = useState<string | null>(() => localStorage.getItem(TARGET_EXAM_KEY));
  const [showHint, setShowHint] = useState(() => !localStorage.getItem('sherpaStatsHint'));
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [weakQuestions, setWeakQuestions] = useState<WeakQuestion[]>([]);
  const [weakLoading, setWeakLoading] = useState(false);
  const [historyTab, setHistoryTab] = useState<'exercise' | 'exam'>('exercise');

  const fetchAll = useCallback(async () => {
    if (!user) return;
    const userId = user.userId;
    setLoading(true);
    try {
      const [sessionsRes, tagStatsRes, ...statsRes] = await Promise.all([
        fetch(`${API_ENDPOINT}/users/me/sessions?userId=${userId}&limit=50`).then(r => r.json()),
        fetch(`${API_ENDPOINT}/users/me/stats?userId=${userId}`).then(r => r.json()),
        ...EXAM_TYPES.map(et =>
          Promise.all([
            fetch(`${API_ENDPOINT}/questions?examType=${et}`).then(r => r.json()),
            fetch(`${API_ENDPOINT}/users/me/question-stats?userId=${userId}&examType=${et}`).then(r => r.json()),
          ])
        ),
      ]);

      const completedSessions: Session[] = sessionsRes.items || [];
      setSessions(completedSessions);
      setTagStats(tagStatsRes.stats || []);

      const stats: ExamStat[] = EXAM_TYPES.map((et, i) => {
        const [qRes, sRes] = statsRes[i];
        const etSessions = completedSessions
          .filter(s => s.examType === et && s.mode === 'exam')
          .sort((a, b) => ((b.endedAt || b.startedAt) > (a.endedAt || a.startedAt) ? 1 : -1));
        return {
          examType: et,
          total: qRes.count ?? 0,
          answered: sRes.answeredCount ?? 0,
          lastScore: etSessions[0]?.score ?? null,
          lastPassed: etSessions[0]?.isPassed ?? null,
        };
      });
      setExamStats(stats);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    if (!user || !targetExam) { setWeakQuestions([]); return; }
    setWeakLoading(true);
    fetch(`${API_ENDPOINT}/users/me/weak-questions?userId=${user.userId}&examType=${targetExam}&minIncorrect=2`)
      .then(r => r.json())
      .then(d => setWeakQuestions(d.items ?? []))
      .catch(() => setWeakQuestions([]))
      .finally(() => setWeakLoading(false));
  }, [user, targetExam]);

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString(lang === 'en' ? 'en-US' : 'ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  const visibleExamTypes = targetExam ? [targetExam] : [...EXAM_TYPES];
  const visibleStats = examStats.filter(s => visibleExamTypes.includes(s.examType));
  const visibleSessions = sessions.filter(s => visibleExamTypes.includes(s.examType));
  const exerciseSessions = visibleSessions.filter(s => s.mode === 'exercise');
  const examSessions = visibleSessions.filter(s => s.mode === 'exam');
  const historySessions = historyTab === 'exercise' ? exerciseSessions : examSessions;

  const domainStats = targetExam
    ? (EXAM_DOMAINS[targetExam] ?? []).map(domain => {
        const ts = tagStats.find(t => t.tagId === domain);
        const correct = ts?.correctCount ?? 0;
        const incorrect = ts?.incorrectCount ?? 0;
        const total = correct + incorrect;
        const rate = total > 0 ? Math.round((correct / total) * 100) : null;
        return { domain, correct, incorrect, total, rate };
      })
    : [];

  const handleDelete = async (examType: string) => {
    if (!user) return;
    setDeleting(true);
    try {
      await fetch(`${API_ENDPOINT}/users/me/data?userId=${user.userId}&examType=${examType}`, { method: 'DELETE' });
      setConfirmDelete(null);
      await fetchAll();
    } catch (err) {
      console.error(err);
    } finally {
      setDeleting(false);
    }
  };

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
          <span style={{ flex: 1, lineHeight: 1.5 }}>{t('stats.hint')}</span>
          <button
            onClick={() => { localStorage.setItem('sherpaStatsHint', '1'); setShowHint(false); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-light)', fontSize: 18, lineHeight: 1, padding: '0 4px', flexShrink: 0 }}
          >✕</button>
        </div>
      )}

      {/* ── ヘッダー + 試験フィルター ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--spacing-lg)', flexWrap: 'wrap', gap: 'var(--spacing-md)' }}>
        <div>
          <h2 style={{ fontSize: 'var(--font-size-xxl)', fontWeight: 700, margin: '0 0 var(--spacing-xs)', color: 'var(--color-text-main)' }}>{t('stats.title')}</h2>
          <p style={{ fontSize: 'var(--font-size-base)', color: 'var(--color-text-sub)', margin: 0, lineHeight: 1.6 }}>{t('stats.description')}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', flexWrap: 'wrap', rowGap: 'var(--spacing-xs)' }}>
          <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)' }}>{t('stats.showing')}</span>
          {EXAM_TYPES.map(et => (
            <Button key={et} variant={targetExam === et ? 'primary' : 'outline'} size="sm"
              onClick={() => {
                const next = targetExam === et ? null : et;
                if (next) localStorage.setItem(TARGET_EXAM_KEY, next);
                else localStorage.removeItem(TARGET_EXAM_KEY);
                setTargetExam(next);
              }}>
              {et}
            </Button>
          ))}
          {targetExam && (
            <Button variant="outline" size="sm"
              onClick={() => { localStorage.removeItem(TARGET_EXAM_KEY); setTargetExam(null); }}
              style={{ color: 'var(--color-text-light)' }}>
              {t('stats.all')}
            </Button>
          )}
        </div>
      </div>

      {/* ━━━━━ 演習 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <SectionDivider label={lang === 'ja' ? '演習' : 'Exercise'} color="var(--color-primary)" />

      {/* 演習進捗カード */}
      <div className="exam-stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 'var(--spacing-md)', marginBottom: 'var(--spacing-xl)' }}>
        {loading
          ? visibleExamTypes.map(et => (
              <Card key={et} style={{ minHeight: 100 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 80 }}>
                  <div className="sherpa-spinner" style={{ width: 24, height: 24, borderWidth: 2 }} />
                </div>
              </Card>
            ))
          : !user
          ? (
            <Card padding="var(--spacing-lg)" style={{ gridColumn: '1/-1' }}>
              <p style={{ margin: 0, fontSize: 'var(--font-size-sm)', color: 'var(--color-text-light)' }}>
                {lang === 'ja' ? 'ログインすると演習進捗を確認できます' : 'Log in to view your exercise progress'}
              </p>
            </Card>
          )
          : visibleStats.map(stat => {
              const pct = stat.total > 0 ? Math.round((stat.answered / stat.total) * 100) : 0;
              return (
                <Card key={stat.examType} padding="var(--spacing-lg)" style={{ borderTop: '3px solid var(--color-primary)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', marginBottom: 'var(--spacing-md)' }}>
                    <Badge variant="secondary">{stat.examType}</Badge>
                  </div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-sub)', marginBottom: 'var(--spacing-sm)', fontWeight: 700 }}>
                    {t('stats.exerciseProgressLabel')}
                  </div>
                  <div style={{ background: 'var(--color-bg-main)', borderRadius: 10, height: 8, overflow: 'hidden', marginBottom: 'var(--spacing-sm)' }}>
                    <div style={{ width: `${pct}%`, background: 'var(--color-primary)', height: '100%', transition: 'width 0.4s' }} />
                  </div>
                  <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-main)' }}>
                    <strong>{stat.answered}</strong>
                    <span style={{ color: 'var(--color-text-sub)' }}> / {stat.total} {t('stats.qUnit')}</span>
                    <span style={{ float: 'right', color: 'var(--color-primary)', fontWeight: 700 }}>{pct}%</span>
                  </div>
                </Card>
              );
            })}
      </div>

      {/* ドメイン別正答率（目標資格選択時のみ） */}
      {!loading && user && targetExam && domainStats.length > 0 && (() => {
        const targetAnswered = examStats.find(s => s.examType === targetExam)?.answered ?? 0;
        return (
          <Card style={{ marginBottom: 'var(--spacing-xl)' }}>
            <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-text-sub)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 'var(--spacing-md)' }}>
              {t('stats.domainAccuracy')}
            </div>
            {targetAnswered <= 10 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', padding: '8px 12px', marginBottom: 'var(--spacing-md)', background: 'var(--color-hint-bg)', border: '1px solid var(--color-hint-border)', borderRadius: 'var(--border-radius-sm)', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-sub)' }}>
                <span style={{ flexShrink: 0 }}>⚠️</span>
                <span>{lang === 'ja' ? `回答数が足りません（${targetAnswered}問）。10問以上解くと精度が上がります。` : `Not enough answers (${targetAnswered} answered). Accuracy improves after 10+ answers.`}</span>
              </div>
            )}
            {[...domainStats].sort((a, b) => (a.rate ?? 101) - (b.rate ?? 101)).map(({ domain, correct, total, rate }) => (
              <div key={domain} style={{ marginBottom: 'var(--spacing-lg)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-xs)' }}>
                  <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 700, color: 'var(--color-text-main)' }}>{lang === 'en' ? (DOMAIN_NAME_EN[domain] ?? domain) : domain}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)', flexShrink: 0 }}>
                    {rate !== null ? (
                      <>
                        <span style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700, color: rate >= 70 ? 'var(--color-success)' : rate >= 50 ? 'var(--color-caution)' : 'var(--color-danger)' }}>
                          {rate}%
                        </span>
                        <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-light)' }}>{correct}/{total}{t('stats.qUnit')}</span>
                      </>
                    ) : (
                      <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-light)', fontStyle: 'italic' }}>{t('stats.noAnswer')}</span>
                    )}
                  </div>
                </div>
                <div style={{ background: 'var(--color-bg-main)', borderRadius: 10, height: 8, overflow: 'hidden' }}>
                  <div style={{
                    width: rate !== null ? `${rate}%` : '0%', height: '100%',
                    background: rate === null ? 'var(--color-border)' : rate >= 70 ? 'var(--color-success)' : rate >= 50 ? 'var(--color-caution)' : 'var(--color-danger)',
                    transition: 'width 0.4s', borderRadius: 10,
                  }} />
                </div>
              </div>
            ))}
            <div style={{ marginTop: 'var(--spacing-sm)', display: 'flex', gap: 'var(--spacing-lg)', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-light)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--color-success)', display: 'inline-block' }} />70%以上
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--color-caution)', display: 'inline-block' }} />50〜69%
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--color-danger)', display: 'inline-block' }} />50%未満
              </span>
            </div>
          </Card>
        );
      })()}

      {/* 頻出ミス問題（目標資格選択時のみ） */}
      {!loading && user && targetExam && (
        <Card style={{ marginBottom: 'var(--spacing-xl)' }}>
          <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-text-sub)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 'var(--spacing-md)' }}>
            {lang === 'ja' ? '頻出ミス問題' : 'Frequently Missed Questions'}
          </div>
          {weakLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '16px 0' }}>
              <div className="sherpa-spinner" style={{ width: 24, height: 24, borderWidth: 2 }} />
            </div>
          ) : weakQuestions.length === 0 ? (
            <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-light)', fontStyle: 'italic', padding: 'var(--spacing-xs) 0' }}>
              {lang === 'ja' ? '2回以上間違えた問題はありません' : 'No questions missed 2 or more times'}
            </div>
          ) : (
            <>
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-light)', marginBottom: 'var(--spacing-md)' }}>
                {lang === 'ja' ? `2回以上間違えた問題 (${weakQuestions.length}問)` : `Questions missed 2+ times (${weakQuestions.length})`}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {weakQuestions.map((q, i) => {
                  const total = q.correctCount + q.incorrectCount;
                  const acc = total > 0 ? Math.round((q.correctCount / total) * 100) : 0;
                  return (
                    <div key={q.questionId} style={{
                      display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center',
                      gap: 'var(--spacing-md)', padding: '10px 0',
                      borderBottom: i < weakQuestions.length - 1 ? '1px solid var(--color-border)' : 'none',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--spacing-sm)', minWidth: 0 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-light)', flexShrink: 0, paddingTop: 1, width: 20 }}>{i + 1}</span>
                        <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-main)', lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                          {q.questionText}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)', flexShrink: 0 }}>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-danger)', fontWeight: 700 }}>✕ {q.incorrectCount}</div>
                          <div style={{ fontSize: 10, color: 'var(--color-text-light)' }}>{acc}%</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </Card>
      )}

      {/* ━━━━━ 模試 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <SectionDivider label={lang === 'ja' ? '模試' : 'Mock Exam'} color="var(--color-accent)" />

      {/* 模試成績サマリーカード */}
      <div className="exam-stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 'var(--spacing-md)', marginBottom: 'var(--spacing-xl)' }}>
        {loading
          ? visibleExamTypes.map(et => (
              <Card key={et} style={{ minHeight: 100 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 80 }}>
                  <div className="sherpa-spinner" style={{ width: 24, height: 24, borderWidth: 2 }} />
                </div>
              </Card>
            ))
          : !user
          ? (
            <Card padding="var(--spacing-lg)" style={{ gridColumn: '1/-1' }}>
              <p style={{ margin: 0, fontSize: 'var(--font-size-sm)', color: 'var(--color-text-light)' }}>
                {lang === 'ja' ? 'ログインすると模試成績を確認できます' : 'Log in to view your exam scores'}
              </p>
            </Card>
          )
          : visibleExamTypes.map(et => {
              const etExamSessions = sessions
                .filter(s => s.examType === et && s.mode === 'exam')
                .sort((a, b) => ((b.endedAt || b.startedAt) > (a.endedAt || a.startedAt) ? 1 : -1));
              const attempts = etExamSessions.length;
              const passCount = etExamSessions.filter(s => s.isPassed).length;
              const lastSess = etExamSessions[0];
              const bestScore = attempts > 0 ? Math.max(...etExamSessions.map(s => s.score)) : null;
              const passRate = PASS_RATE[et];
              return (
                <Card key={et} padding="var(--spacing-lg)" style={{ borderTop: '3px solid var(--color-accent)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', marginBottom: 'var(--spacing-md)' }}>
                    <Badge variant="secondary">{et}</Badge>
                  </div>
                  {attempts === 0 ? (
                    <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-light)', fontStyle: 'italic' }}>
                      {t('stats.noExam')}
                    </div>
                  ) : (
                    <>
                      <div style={{ marginBottom: 'var(--spacing-sm)' }}>
                        <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-sub)', fontWeight: 700, marginBottom: 4 }}>
                          {t('stats.lastMock')}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
                          <span style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, color: lastSess.isPassed ? 'var(--color-success)' : 'var(--color-danger)' }}>
                            {lastSess.score}%
                          </span>
                          <Badge variant={lastSess.isPassed ? 'success' : 'danger'}>
                            {lastSess.isPassed ? t('stats.passed') : t('stats.failed')}
                          </Badge>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 'var(--spacing-lg)', borderTop: '1px solid var(--color-border)', paddingTop: 'var(--spacing-sm)', marginTop: 'var(--spacing-sm)' }}>
                        <div>
                          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-light)' }}>
                            {lang === 'ja' ? '最高' : 'Best'}
                          </div>
                          <div style={{ fontSize: 'var(--font-size-base)', fontWeight: 700, color: 'var(--color-text-main)' }}>
                            {bestScore}%
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-light)' }}>
                            {lang === 'ja' ? '合格' : 'Passed'}
                          </div>
                          <div style={{ fontSize: 'var(--font-size-base)', fontWeight: 700, color: 'var(--color-text-main)' }}>
                            {passCount}<span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-sub)', fontWeight: 400 }}>/{attempts}{lang === 'ja' ? '回' : ''}</span>
                          </div>
                        </div>
                        <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-light)' }}>
                            {lang === 'ja' ? '合格ライン' : 'Pass line'}
                          </div>
                          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-sub)', fontWeight: 700 }}>
                            {passRate}%
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </Card>
              );
            })}
      </div>

      {/* スコア推移グラフ */}
      {!loading && user && examSessions.length > 0 && (
        <Card style={{ marginBottom: 'var(--spacing-xl)' }}>
          <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-text-sub)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 'var(--spacing-md)' }}>
            {t('stats.scoreHistory')}
          </div>
          {visibleExamTypes.map(et => {
            const etExams = sessions.filter(s => s.examType === et && s.mode === 'exam')
              .sort((a, b) => ((a.endedAt || a.startedAt) > (b.endedAt || b.startedAt) ? 1 : -1));
            if (etExams.length === 0) return null;
            const passRate = PASS_RATE[et];
            return (
              <div key={et} style={{ marginBottom: 'var(--spacing-lg)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', marginBottom: 'var(--spacing-md)' }}>
                  <Badge variant="secondary">{et}</Badge>
                  <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-light)', marginLeft: 'auto' }}>
                    {etExams.length}{lang === 'ja' ? '回' : ' attempts'}
                  </span>
                </div>
                <ScoreLineChart sessions={etExams} passRate={passRate} lang={lang} />
              </div>
            );
          })}
        </Card>
      )}

      {/* ━━━━━ 履歴 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <SectionDivider label={lang === 'ja' ? '履歴' : 'History'} color="var(--color-text-sub)" />

      {/* モード切り替えタブ */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 'var(--spacing-md)', borderBottom: '2px solid var(--color-border)' }}>
        {(['exercise', 'exam'] as const).map(mode => {
          const label = mode === 'exercise'
            ? (lang === 'ja' ? `演習 (${exerciseSessions.length})` : `Exercise (${exerciseSessions.length})`)
            : (lang === 'ja' ? `模試 (${examSessions.length})` : `Mock Exam (${examSessions.length})`);
          const active = historyTab === mode;
          return (
            <button
              key={mode}
              onClick={() => setHistoryTab(mode)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: '8px 16px', fontSize: 'var(--font-size-sm)', fontWeight: active ? 700 : 400,
                color: active ? 'var(--color-primary)' : 'var(--color-text-sub)',
                borderBottom: active ? '2px solid var(--color-primary)' : '2px solid transparent',
                marginBottom: -2, transition: 'all 0.15s',
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0' }}>
          <div className="sherpa-spinner" style={{ width: 24, height: 24, borderWidth: 2 }} />
        </div>
      ) : historySessions.length === 0 ? (
        <div style={{ color: 'var(--color-text-sub)', padding: 'var(--spacing-lg) 0' }}>
          <p style={{ margin: '0 0 var(--spacing-sm)' }}>
            {historyTab === 'exercise'
              ? (lang === 'ja' ? '演習の履歴はありません' : 'No exercise history')
              : (lang === 'ja' ? '模試の履歴はありません' : 'No exam history')}
          </p>
          {targetExam && historyTab === 'exercise' && (
            <Button variant="outline" onClick={() => navigate('/exercise/setup')}>
              {t('stats.startExercise', { exam: targetExam })}
            </Button>
          )}
        </div>
      ) : (
        <Card padding={0} style={{ overflow: 'hidden', marginBottom: 'var(--spacing-xl)' }}>
          <div className="stats-table-scroll" style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--font-size-base)' }}>
              <thead>
                <tr style={{ background: 'var(--color-bg-main)', borderBottom: '1px solid var(--color-border)' }}>
                  {(historyTab === 'exam'
                    ? [t('stats.colDate'), t('stats.colExam'), t('stats.colScore'), t('stats.colResult')]
                    : [t('stats.colDate'), t('stats.colExam'), t('stats.colScore'), t('stats.colResult')]
                  ).map(h => (
                    <th key={h} style={{ padding: '12px 24px', textAlign: 'left', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-sub)', fontWeight: 700 }}>{h}</th>
                  ))}
                  {historyTab === 'exam' && <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-sub)', fontWeight: 700 }}></th>}
                </tr>
              </thead>
              <tbody>
                {historySessions.map((s, i) => (
                  <tr key={s.sessionId} style={{ borderBottom: i < historySessions.length - 1 ? '1px solid var(--color-border)' : 'none' }}>
                    <td style={{ padding: '12px 24px', color: 'var(--color-text-sub)', fontSize: 'var(--font-size-sm)' }}>{fmt(s.endedAt || s.startedAt)}</td>
                    <td style={{ padding: '12px 24px' }}><Badge variant="secondary">{s.examType}</Badge></td>
                    <td style={{ padding: '12px 24px', fontWeight: 700, color: s.isPassed ? 'var(--color-success)' : 'var(--color-danger)' }}>{s.score}%</td>
                    <td style={{ padding: '12px 24px' }}>
                      <Badge variant={s.isPassed ? 'success' : 'danger'}>
                        {s.isPassed ? t('stats.passed') : t('stats.failed')}
                      </Badge>
                    </td>
                    {historyTab === 'exam' && (
                      <td style={{ padding: '12px 24px' }}>
                        {s.isMini && <span style={{ fontSize: 'var(--font-size-xs)', background: 'var(--color-warning)', color: '#1a1a1a', borderRadius: 4, padding: '1px 5px', fontWeight: 700 }}>{lang === 'ja' ? 'ミニ' : 'Mini'}</span>}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ━━━━━ データ管理 ━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {user && (
        <>
          <SectionDivider label={lang === 'ja' ? 'データ管理' : 'Data Management'} color="var(--color-danger)" />
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-light)', margin: '0 0 var(--spacing-md)' }}>
            {lang === 'ja' ? '資格ごとの演習・模試データをリセットします。この操作は取り消せません。' : 'Reset exercise and exam data per certification. This action cannot be undone.'}
          </p>
          <Card padding="var(--spacing-lg)" style={{ border: '1px solid var(--color-danger)', marginBottom: 'var(--spacing-xl)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
              {EXAM_TYPES.map(et => (
                <div key={et} style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)', flexWrap: 'wrap' }}>
                  <Badge variant="secondary" style={{ flexShrink: 0 }}>{et}</Badge>
                  <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)', flex: 1 }}>
                    {lang === 'ja' ? `${et} の演習・模試データをすべて削除` : `Delete all exercise and exam data for ${et}`}
                  </span>
                  {confirmDelete === et ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', flexShrink: 0 }}>
                      <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-danger)', fontWeight: 700 }}>
                        {lang === 'ja' ? '本当に削除しますか？' : 'Are you sure?'}
                      </span>
                      <Button size="sm" variant="outline" onClick={() => setConfirmDelete(null)} disabled={deleting}
                        style={{ color: 'var(--color-text-sub)', borderColor: 'var(--color-border)' }}>
                        {lang === 'ja' ? 'キャンセル' : 'Cancel'}
                      </Button>
                      <Button size="sm" variant="primary" onClick={() => handleDelete(et)} disabled={deleting}
                        style={{ background: 'var(--color-danger)', borderColor: 'var(--color-danger)' }}>
                        {deleting ? '...' : (lang === 'ja' ? '削除する' : 'Delete')}
                      </Button>
                    </div>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => setConfirmDelete(et)}
                      style={{ color: 'var(--color-danger)', borderColor: 'var(--color-danger)', flexShrink: 0 }}>
                      {lang === 'ja' ? 'データを削除' : 'Delete Data'}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
