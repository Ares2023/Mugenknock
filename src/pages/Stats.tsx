import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_ENDPOINT, EXAM_DOMAINS, DOMAIN_NAME_EN, PASS_RATE } from '../constants';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';

const TARGET_EXAM_KEY = 'targetExam';
const STATS_GOOD_RATE = 70;
const STATS_FAIR_RATE = 50;

type Session = {
  sessionId: string;
  examType: string;
  mode: string;
  score: number;
  isPassed: boolean;
  startedAt: string;
  endedAt?: string;
  isMini?: boolean;
  questionIds?: string[];
};

type TagStat = { tagId: string; correctCount?: number; incorrectCount?: number };

// ── スコア推移折れ線グラフ ────────────────────────────────────────────
const ScoreLineChart = ({ sessions, passRate, lang }: { sessions: Session[]; passRate?: number; lang: string }) => {
  const W = 500, H = 170;
  const padL = 30, padR = 36, padT = 20, padB = 28;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;
  const n = sessions.length;
  const xOf = (i: number) => padL + (n > 1 ? (i / (n - 1)) * chartW : chartW / 2);
  const yOf = (score: number) => padT + chartH * (1 - score / 100);
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
      {passRate !== undefined && (
        <>
          <line x1={padL} y1={yOf(passRate)} x2={W - padR} y2={yOf(passRate)}
            stroke="var(--color-primary)" strokeWidth={1.2} strokeDasharray="5 3" />
          <text x={W - padR + 3} y={yOf(passRate) + 3.5} fontSize={9} fill="var(--color-primary)" fontWeight="700">{passRate}%</text>
        </>
      )}
      {n > 1 && <polyline points={linePoints} fill="none" stroke="var(--color-primary)" strokeWidth={2} strokeOpacity={0.35} strokeLinejoin="round" />}
      {sessions.map((s, i) => {
        const cx = xOf(i), cy = yOf(s.score);
        const color = s.isPassed ? 'var(--color-success)' : passRate === undefined
          ? (s.score >= STATS_GOOD_RATE ? 'var(--color-success)' : s.score >= STATS_FAIR_RATE ? 'var(--color-caution)' : 'var(--color-danger)')
          : 'var(--color-danger)';
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

// ── 日次活動棒グラフ（万歩計） ───────────────────────────────────────
const ActivityChart = ({ data, lang }: { data: { label: string; count: number; isToday: boolean }[]; lang: string }) => {
  const W = 600, H = 160;
  const padL = 28, padR = 8, padT = 24, padB = 30;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;
  const n = data.length;
  const maxCount = Math.max(...data.map(d => d.count), 1);
  const slotW = chartW / n;
  const barW = Math.max(6, Math.min(28, slotW * 0.65));
  const showEvery = n <= 7 ? 1 : n <= 14 ? 2 : 5;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img">
      {[0, Math.round(maxCount / 2), maxCount].filter((v, i, a) => a.indexOf(v) === i).map(v => (
        <g key={v}>
          <line x1={padL} y1={padT + chartH * (1 - v / maxCount)} x2={W - padR} y2={padT + chartH * (1 - v / maxCount)}
            stroke="var(--color-border)" strokeWidth={0.7} />
          <text x={padL - 4} y={padT + chartH * (1 - v / maxCount) + 3.5} fontSize={8} textAnchor="end" fill="var(--color-text-light)">{v}</text>
        </g>
      ))}
      {data.map((d, i) => {
        const cx = padL + slotW * i + slotW / 2;
        const barH = d.count > 0 ? Math.max(3, (d.count / maxCount) * chartH) : 0;
        const y = padT + chartH - barH;
        return (
          <g key={i}>
            {d.count > 0 && (
              <rect x={cx - barW / 2} y={y} width={barW} height={barH} rx={3}
                fill={d.isToday ? 'var(--color-primary)' : 'var(--color-primary)'} opacity={d.isToday ? 1 : 0.55} />
            )}
            {d.count > 0 && (
              <text x={cx} y={y - 5} textAnchor="middle" fontSize={9} fontWeight="700" fill={d.isToday ? 'var(--color-primary)' : 'var(--color-text-sub)'}>
                {d.count}
              </text>
            )}
            {i % showEvery === 0 && (
              <text x={cx} y={H - padB + 12} textAnchor="middle" fontSize={9} fill={d.isToday ? 'var(--color-primary)' : 'var(--color-text-light)'} fontWeight={d.isToday ? '700' : '400'}>
                {d.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
};

// ── メインコンポーネント ─────────────────────────────────────────────
export default function Stats() {
  const { user } = useAuth();
  const { lang, t } = useLanguage();
  const navigate = useNavigate();

  const [tab, setTab] = useState<'volume' | 'performance'>('volume');
  const [targetExam] = useState<string | null>(() => localStorage.getItem(TARGET_EXAM_KEY));
  const [sessions, setSessions] = useState<Session[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [tagStats, setTagStats] = useState<TagStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [perfLoading, setPerfLoading] = useState(false);
  const [perfLoaded, setPerfLoaded] = useState(false);
  const [activityRange, setActivityRange] = useState<7 | 14 | 30>(7);
  const [historyTab, setHistoryTab] = useState<'exercise' | 'exam'>('exercise');
  const [showHint, setShowHint] = useState(() => !localStorage.getItem('sherpaStatsHint'));

  // ── 初期ロード（ノック量に必要なデータのみ） ──
  useEffect(() => {
    if (!user || !targetExam) { setLoading(false); return; }
    setLoading(true);
    Promise.all([
      fetch(`${API_ENDPOINT}/users/me/sessions?userId=${user.userId}&limit=200`).then(r => r.json()),
      fetch(`${API_ENDPOINT}/questions?examType=${targetExam}&limit=0`).then(r => r.json()),
      fetch(`${API_ENDPOINT}/users/me/question-stats?userId=${user.userId}&examType=${targetExam}`).then(r => r.json()),
    ]).then(([sessRes, qRes, statsRes]) => {
      setSessions((sessRes.items ?? []).filter((s: Session) => s.examType === targetExam));
      setTotalCount(qRes.total ?? qRes.count ?? 0);
      setAnsweredCount(statsRes.answeredCount ?? 0);
    }).catch(console.error).finally(() => setLoading(false));
  }, [user, targetExam]);

  // ── ノック成績タブを開いたときに遅延ロード ──
  useEffect(() => {
    if (tab !== 'performance' || perfLoaded || !user || !targetExam) return;
    setPerfLoading(true);
    fetch(`${API_ENDPOINT}/users/me/stats?userId=${user.userId}`)
      .then(r => r.json())
      .then(d => { setTagStats(d.stats ?? []); setPerfLoaded(true); })
      .catch(console.error)
      .finally(() => setPerfLoading(false));
  }, [tab, user, targetExam, perfLoaded]);

  // ── 派生データ ──
  const exerciseSessions = useMemo(() => sessions.filter(s => s.mode === 'exercise'), [sessions]);
  const examSessions = useMemo(() =>
    sessions.filter(s => s.mode === 'exam').sort((a, b) =>
      (a.endedAt || a.startedAt) > (b.endedAt || b.startedAt) ? 1 : -1), [sessions]);
  const historySessions = historyTab === 'exercise' ? exerciseSessions : examSessions;

  const pct = totalCount > 0 ? Math.round((answeredCount / totalCount) * 100) : 0;

  const dailyData = useMemo(() => {
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    return Array.from({ length: activityRange }, (_, i) => {
      const d = new Date(today);
      d.setDate(d.getDate() - (activityRange - 1 - i));
      const dateStr = d.toISOString().slice(0, 10);
      const count = sessions.reduce((sum, s) => {
        const sDate = (s.endedAt || s.startedAt).slice(0, 10);
        return sDate === dateStr ? sum + (s.questionIds?.length ?? 0) : sum;
      }, 0);
      return { label: `${d.getMonth() + 1}/${d.getDate()}`, count, isToday: dateStr === todayStr };
    });
  }, [sessions, activityRange]);

  const domainStats = useMemo(() => {
    if (!targetExam) return [];
    return (EXAM_DOMAINS[targetExam] ?? []).map(domain => {
      const ts = tagStats.find(t => t.tagId === domain);
      const correct = ts?.correctCount ?? 0;
      const incorrect = ts?.incorrectCount ?? 0;
      const total = correct + incorrect;
      const rate = total > 0 ? Math.round((correct / total) * 100) : null;
      return { domain, correct, incorrect, total, rate };
    });
  }, [targetExam, tagStats]);

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString(lang === 'en' ? 'en-US' : 'ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  const totalActivity = dailyData.reduce((s, d) => s + d.count, 0);
  const avgActivity = activityRange > 0 ? (totalActivity / activityRange).toFixed(1) : '0';

  // ── 目標資格未設定 ──
  if (!targetExam) {
    return (
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: 'var(--spacing-xl) var(--spacing-lg)' }} className="page-container">
        <h2 style={{ fontSize: 'var(--font-size-xxl)', fontWeight: 700, margin: '0 0 var(--spacing-xl)', color: 'var(--color-text-main)' }}>{t('stats.title')}</h2>
        <Card padding="var(--spacing-xl)">
          <div style={{ textAlign: 'center', padding: 'var(--spacing-xl) 0' }}>
            <div style={{ fontSize: 32, marginBottom: 'var(--spacing-md)' }}>🎯</div>
            <p style={{ fontSize: 'var(--font-size-base)', color: 'var(--color-text-sub)', margin: '0 0 var(--spacing-lg)' }}>
              {lang === 'ja' ? '目標資格を設定すると統計が表示されます' : 'Set a target certification to view your stats'}
            </p>
            <Button variant="primary" onClick={() => navigate('/')}>
              {lang === 'ja' ? 'ホームで資格を設定する' : 'Set a certification on Home'}
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const tabStyle = (active: boolean): React.CSSProperties => ({
    background: 'none', border: 'none', cursor: 'pointer',
    padding: '10px 20px', fontSize: 'var(--font-size-base)', fontWeight: active ? 700 : 400,
    color: active ? 'var(--color-primary)' : 'var(--color-text-sub)',
    borderBottom: active ? '2px solid var(--color-primary)' : '2px solid transparent',
    marginBottom: -2, transition: 'all 0.15s', whiteSpace: 'nowrap',
  });

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
          <button onClick={() => { localStorage.setItem('sherpaStatsHint', '1'); setShowHint(false); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-light)', fontSize: 18, lineHeight: 1, padding: '0 4px', flexShrink: 0 }}>✕</button>
        </div>
      )}

      {/* ── ヘッダー ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)', marginBottom: 'var(--spacing-lg)', flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 'var(--font-size-xxl)', fontWeight: 700, margin: 0, color: 'var(--color-text-main)' }}>{t('stats.title')}</h2>
        <Badge variant="secondary">{targetExam}</Badge>
        {!user && (
          <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-light)', fontStyle: 'italic' }}>
            {lang === 'ja' ? '（ログインすると詳細統計が表示されます）' : '(Log in to view detailed stats)'}
          </span>
        )}
      </div>

      {/* ── タブ ── */}
      <div style={{ display: 'flex', borderBottom: '2px solid var(--color-border)', marginBottom: 'var(--spacing-xl)' }}>
        <button style={tabStyle(tab === 'volume')} onClick={() => setTab('volume')}>
          {lang === 'ja' ? 'ノック量' : 'Volume'}
        </button>
        <button style={tabStyle(tab === 'performance')} onClick={() => setTab('performance')}>
          {lang === 'ja' ? 'ノック成績' : 'Performance'}
        </button>
      </div>

      {/* ════════ ノック量タブ ════════ */}
      {tab === 'volume' && (
        <>
          {/* 消化進捗 */}
          <Card padding="var(--spacing-lg)" style={{ marginBottom: 'var(--spacing-lg)' }}>
            <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-text-sub)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 'var(--spacing-md)' }}>
              {lang === 'ja' ? '消化進捗' : 'Coverage'}
            </div>
            {loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--spacing-lg) 0' }}>
                <div className="sherpa-spinner" style={{ width: 24, height: 24, borderWidth: 2 }} />
              </div>
            ) : !user ? (
              <p style={{ margin: 0, fontSize: 'var(--font-size-sm)', color: 'var(--color-text-light)' }}>
                {lang === 'ja' ? 'ログインすると表示されます' : 'Log in to view'}
              </p>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 'var(--spacing-sm)' }}>
                  <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)' }}>
                    {lang === 'ja' ? '1回以上解いた問題' : 'Questions attempted'}
                  </span>
                  <span style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, color: 'var(--color-primary)' }}>
                    {answeredCount}
                    <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 400, color: 'var(--color-text-sub)' }}> / {totalCount} {t('stats.qUnit')}</span>
                  </span>
                </div>
                {/* HP バー */}
                <div style={{ position: 'relative', background: 'var(--color-bg-main)', borderRadius: 10, height: 18, overflow: 'hidden', marginBottom: 6 }}>
                  <div style={{
                    width: `${pct}%`, height: '100%', borderRadius: 10, transition: 'width 0.6s',
                    background: pct >= 60 ? 'var(--color-success)' : pct >= 30 ? 'var(--color-caution)' : 'var(--color-danger)',
                  }} />
                  {pct > 8 && (
                    <span style={{
                      position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
                      fontSize: 11, fontWeight: 700, color: 'white', textShadow: '0 1px 2px rgba(0,0,0,0.3)',
                    }}>{pct}%</span>
                  )}
                </div>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-light)', textAlign: 'right' }}>
                  {pct}% {lang === 'ja' ? '消化' : 'covered'}
                </div>
              </>
            )}
          </Card>

          {/* 万歩計グラフ */}
          <Card padding="var(--spacing-lg)">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--spacing-md)', flexWrap: 'wrap', gap: 'var(--spacing-sm)' }}>
              <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-text-sub)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                {lang === 'ja' ? '日次ノック量' : 'Daily Activity'}
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {([7, 14, 30] as const).map(r => (
                  <button key={r} onClick={() => setActivityRange(r)} style={{
                    padding: '3px 10px', fontSize: 'var(--font-size-xs)', fontWeight: 600, cursor: 'pointer',
                    borderRadius: 'var(--border-radius-full)',
                    border: activityRange === r ? '1.5px solid var(--color-primary)' : '1px solid var(--color-border)',
                    background: activityRange === r ? 'var(--color-primary-light)' : 'transparent',
                    color: activityRange === r ? 'var(--color-primary)' : 'var(--color-text-sub)',
                    transition: 'all 0.15s',
                  }}>{r}{lang === 'ja' ? '日' : 'd'}</button>
                ))}
              </div>
            </div>

            {loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--spacing-lg) 0' }}>
                <div className="sherpa-spinner" style={{ width: 24, height: 24, borderWidth: 2 }} />
              </div>
            ) : !user ? (
              <p style={{ margin: 0, fontSize: 'var(--font-size-sm)', color: 'var(--color-text-light)' }}>
                {lang === 'ja' ? 'ログインすると表示されます' : 'Log in to view'}
              </p>
            ) : (
              <>
                <ActivityChart data={dailyData} lang={lang} />
                <div style={{ display: 'flex', gap: 'var(--spacing-xl)', marginTop: 'var(--spacing-sm)', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-sub)' }}>
                  <span>{lang === 'ja' ? '期間合計' : 'Total'}: <strong style={{ color: 'var(--color-text-main)' }}>{totalActivity}{lang === 'ja' ? '問' : ' Q'}</strong></span>
                  <span>{lang === 'ja' ? '平均' : 'Avg'}: <strong style={{ color: 'var(--color-text-main)' }}>{avgActivity}{lang === 'ja' ? '問/日' : ' Q/day'}</strong></span>
                </div>
              </>
            )}
          </Card>
        </>
      )}

      {/* ════════ ノック成績タブ ════════ */}
      {tab === 'performance' && (
        <>
          {perfLoading && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--spacing-xl) 0' }}>
              <div className="sherpa-spinner" style={{ width: 28, height: 28, borderWidth: 3 }} />
            </div>
          )}

          {/* ドメイン別正答率 */}
          {!perfLoading && user && targetExam && (
            <Card style={{ marginBottom: 'var(--spacing-lg)' }}>
              <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-text-sub)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 'var(--spacing-md)' }}>
                {t('stats.domainAccuracy')}
              </div>
              {!perfLoaded ? (
                <p style={{ margin: 0, fontSize: 'var(--font-size-sm)', color: 'var(--color-text-light)' }}>...</p>
              ) : answeredCount <= 10 ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', padding: '8px 12px', background: 'var(--color-hint-bg)', border: '1px solid var(--color-hint-border)', borderRadius: 'var(--border-radius-sm)', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-sub)' }}>
                  <span>⚠️</span>
                  <span>{lang === 'ja' ? `回答数が足りません（${answeredCount}問）。10問以上解くと精度が上がります。` : `Not enough answers (${answeredCount}). Accuracy improves after 10+ answers.`}</span>
                </div>
              ) : (
                <>
                  {[...domainStats].sort((a, b) => (a.rate ?? 101) - (b.rate ?? 101)).map(({ domain, correct, total, rate }) => (
                    <div key={domain} style={{ marginBottom: 'var(--spacing-lg)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-xs)' }}>
                        <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 700, color: 'var(--color-text-main)' }}>
                          {lang === 'en' ? (DOMAIN_NAME_EN[domain] ?? domain) : domain}
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)', flexShrink: 0 }}>
                          {rate !== null ? (
                            <>
                              <span style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700, color: rate >= STATS_GOOD_RATE ? 'var(--color-success)' : rate >= STATS_FAIR_RATE ? 'var(--color-caution)' : 'var(--color-danger)' }}>
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
                          width: rate !== null ? `${rate}%` : '0%', height: '100%', borderRadius: 10, transition: 'width 0.4s',
                          background: rate === null ? 'var(--color-border)' : rate >= STATS_GOOD_RATE ? 'var(--color-success)' : rate >= STATS_FAIR_RATE ? 'var(--color-caution)' : 'var(--color-danger)',
                        }} />
                      </div>
                    </div>
                  ))}
                  <div style={{ marginTop: 'var(--spacing-sm)', display: 'flex', gap: 'var(--spacing-lg)', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-light)' }}>
                    {[['var(--color-success)', '70%以上'], ['var(--color-caution)', '50〜69%'], ['var(--color-danger)', '50%未満']].map(([bg, label]) => (
                      <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 10, height: 10, borderRadius: 2, background: bg, display: 'inline-block' }} />
                        {label}
                      </span>
                    ))}
                  </div>
                </>
              )}
            </Card>
          )}

          {/* 演習スコア推移 */}
          {!perfLoading && user && exerciseSessions.length > 0 && (
            <Card style={{ marginBottom: 'var(--spacing-lg)' }}>
              <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-text-sub)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 'var(--spacing-md)' }}>
                {lang === 'ja' ? '演習スコア推移' : 'Exercise Score History'}
              </div>
              <ScoreLineChart
                sessions={[...exerciseSessions].sort((a, b) => (a.endedAt || a.startedAt) > (b.endedAt || b.startedAt) ? 1 : -1)}
                passRate={STATS_GOOD_RATE}
                lang={lang}
              />
            </Card>
          )}

          {/* 模試スコア推移 */}
          {!perfLoading && user && examSessions.length > 0 && (
            <Card style={{ marginBottom: 'var(--spacing-lg)' }}>
              <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-text-sub)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 'var(--spacing-md)' }}>
                {t('stats.scoreHistory')}
              </div>
              <ScoreLineChart sessions={examSessions} passRate={PASS_RATE[targetExam]} lang={lang} />
            </Card>
          )}

          {/* 履歴テーブル */}
          {!perfLoading && user && (
            <Card padding={0} style={{ overflow: 'hidden', marginBottom: 'var(--spacing-xl)' }}>
              <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid var(--color-border)' }}>
                {(['exercise', 'exam'] as const).map(mode => {
                  const cnt = mode === 'exercise' ? exerciseSessions.length : examSessions.length;
                  const label = mode === 'exercise'
                    ? (lang === 'ja' ? `演習 (${cnt})` : `Exercise (${cnt})`)
                    : (lang === 'ja' ? `模試 (${cnt})` : `Mock Exam (${cnt})`);
                  const active = historyTab === mode;
                  return (
                    <button key={mode} onClick={() => setHistoryTab(mode)} style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      padding: '10px 16px', fontSize: 'var(--font-size-sm)', fontWeight: active ? 700 : 400,
                      color: active ? 'var(--color-primary)' : 'var(--color-text-sub)',
                      borderBottom: active ? '2px solid var(--color-primary)' : '2px solid transparent',
                      marginBottom: -2, transition: 'all 0.15s',
                    }}>{label}</button>
                  );
                })}
              </div>
              {historySessions.length === 0 ? (
                <div style={{ padding: 'var(--spacing-lg)', color: 'var(--color-text-sub)', fontSize: 'var(--font-size-sm)' }}>
                  {historyTab === 'exercise'
                    ? (lang === 'ja' ? '演習の履歴はありません' : 'No exercise history')
                    : (lang === 'ja' ? '模試の履歴はありません' : 'No exam history')}
                </div>
              ) : (
                <div className="stats-table-scroll" style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--font-size-base)' }}>
                    <thead>
                      <tr style={{ background: 'var(--color-bg-main)', borderBottom: '1px solid var(--color-border)' }}>
                        {[t('stats.colDate'), t('stats.colScore'), t('stats.colResult')].map(h => (
                          <th key={h} style={{ padding: '10px 20px', textAlign: 'left', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-sub)', fontWeight: 700 }}>{h}</th>
                        ))}
                        {historyTab === 'exam' && <th style={{ padding: '10px 20px' }} />}
                      </tr>
                    </thead>
                    <tbody>
                      {historySessions.map((s, i) => (
                        <tr key={s.sessionId} style={{ borderBottom: i < historySessions.length - 1 ? '1px solid var(--color-border)' : 'none' }}>
                          <td style={{ padding: '10px 20px', color: 'var(--color-text-sub)', fontSize: 'var(--font-size-sm)' }}>{fmt(s.endedAt || s.startedAt)}</td>
                          <td style={{ padding: '10px 20px', fontWeight: 700, color: s.score >= STATS_GOOD_RATE ? 'var(--color-success)' : s.score >= STATS_FAIR_RATE ? 'var(--color-caution)' : 'var(--color-danger)' }}>{s.score}%</td>
                          <td style={{ padding: '10px 20px' }}>
                            <Badge variant={s.isPassed ? 'success' : 'danger'}>
                              {s.isPassed ? t('stats.passed') : t('stats.failed')}
                            </Badge>
                          </td>
                          {historyTab === 'exam' && (
                            <td style={{ padding: '10px 20px' }}>
                              {s.isMini && <span style={{ fontSize: 'var(--font-size-xs)', background: 'var(--color-warning)', color: '#1a1a1a', borderRadius: 4, padding: '1px 5px', fontWeight: 700 }}>{lang === 'ja' ? 'ミニ' : 'Mini'}</span>}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}

          {!user && (
            <Card padding="var(--spacing-xl)">
              <p style={{ margin: 0, textAlign: 'center', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-light)' }}>
                {lang === 'ja' ? 'ログインすると成績が表示されます' : 'Log in to view your performance'}
              </p>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
