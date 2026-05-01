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
};

type TagStat = {
  tagId: string;
  correctCount?: number;
  incorrectCount?: number;
};

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
          .filter(s => s.examType === et)
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

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString(lang === 'en' ? 'en-US' : 'ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  const visibleExamTypes = targetExam ? [targetExam] : [...EXAM_TYPES];
  const visibleStats = examStats.filter(s => visibleExamTypes.includes(s.examType));
  const visibleSessions = sessions.filter(s => visibleExamTypes.includes(s.examType));
  const examSessions = visibleSessions.filter(s => s.mode === 'exam');

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

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--spacing-xl)', flexWrap: 'wrap', gap: 'var(--spacing-md)' }}>
        <div>
          <h2 style={{ fontSize: 'var(--font-size-xxl)', fontWeight: 700, margin: '0 0 var(--spacing-xs)', color: 'var(--color-text-main)' }}>{t('stats.title')}</h2>
          <p style={{ fontSize: 'var(--font-size-base)', color: 'var(--color-text-sub)', margin: 0, lineHeight: 1.6 }}>{t('stats.description')}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', flexWrap: 'wrap', rowGap: 'var(--spacing-xs)' }}>
          <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)' }}>{t('stats.showing')}</span>
          {EXAM_TYPES.map(et => (
            <Button
              key={et}
              variant={targetExam === et ? 'primary' : 'outline'}
              size="sm"
              onClick={() => {
                const next = targetExam === et ? null : et;
                if (next) localStorage.setItem(TARGET_EXAM_KEY, next);
                else localStorage.removeItem(TARGET_EXAM_KEY);
                setTargetExam(next);
              }}
            >
              {et}
            </Button>
          ))}
          {targetExam && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => { localStorage.removeItem(TARGET_EXAM_KEY); setTargetExam(null); }}
              style={{ color: 'var(--color-text-light)' }}
            >
              {t('stats.all')}
            </Button>
          )}
        </div>
      </div>

      {/* 試験別サマリーカード */}
      <h3 style={{ fontSize: 'var(--font-size-h3)', fontWeight: 700, margin: '0 0 var(--spacing-md)', color: 'var(--color-text-sub)' }}>{t('stats.exerciseProgress')}</h3>
      <div className="exam-stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 'var(--spacing-md)', marginBottom: 'var(--spacing-xl)' }}>
        {loading
          ? visibleExamTypes.map(et => (
              <Card key={et} style={{ minHeight: 140 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 100 }}>
                  <div className="sherpa-spinner" style={{ width: 24, height: 24, borderWidth: 2 }} />
                </div>
              </Card>
            ))
          : visibleStats.map(stat => {
              const pct = stat.total > 0 ? Math.round((stat.answered / stat.total) * 100) : 0;
              const passRate = PASS_RATE[stat.examType];
              return (
                <Card key={stat.examType} padding="var(--spacing-lg)" style={{ borderTop: '4px solid var(--color-primary)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', marginBottom: 'var(--spacing-lg)' }}>
                    <Badge variant="secondary">{stat.examType}</Badge>
                  </div>
                  <div style={{ marginBottom: 'var(--spacing-lg)' }}>
                    <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-sub)', marginBottom: 'var(--spacing-sm)', fontWeight: 700 }}>{t('stats.exerciseProgressLabel')}</div>
                    <div style={{ background: 'var(--color-bg-main)', borderRadius: 10, height: 8, overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, background: 'var(--color-primary)', height: '100%', transition: 'width 0.4s' }} />
                    </div>
                    <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-main)', marginTop: 'var(--spacing-sm)' }}>
                      <strong>{stat.answered}</strong>
                      <span style={{ color: 'var(--color-text-sub)' }}> / {stat.total} {t('stats.qUnit')}</span>
                      <span style={{ float: 'right', color: 'var(--color-primary)', fontWeight: 700 }}>{pct}%</span>
                    </div>
                  </div>
                  <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 'var(--spacing-md)' }}>
                    <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-sub)', marginBottom: 'var(--spacing-xs)', fontWeight: 700 }}>{t('stats.lastMock')}</div>
                    {stat.lastScore !== null ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
                        <span style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, color: stat.lastPassed ? 'var(--color-success)' : 'var(--color-danger)' }}>{stat.lastScore}%</span>
                        <Badge variant={stat.lastPassed ? 'success' : 'danger'}>
                          {stat.lastPassed ? t('stats.passed') : t('stats.failed')}
                        </Badge>
                        <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-light)', marginLeft: 'auto' }}>{t('stats.passLine')} {passRate}%</span>
                      </div>
                    ) : (
                      <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-light)', fontStyle: 'italic' }}>{t('stats.noExam')}</span>
                    )}
                  </div>
                </Card>
              );
            })}
      </div>

      {/* ドメイン別正答率（目標資格のみ） */}
      {!loading && targetExam && domainStats.length > 0 && (() => {
        const targetAnswered = examStats.find(s => s.examType === targetExam)?.answered ?? 0;
        return (
        <>
          <h3 style={{ fontSize: 'var(--font-size-h3)', fontWeight: 700, margin: '0 0 var(--spacing-md)', color: 'var(--color-text-sub)' }}>{t('stats.domainAccuracy')}</h3>
          <Card style={{ marginBottom: 'var(--spacing-xl)' }}>
            {targetAnswered <= 10 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', padding: '8px 12px', marginBottom: 'var(--spacing-md)', background: 'var(--color-hint-bg)', border: '1px solid var(--color-hint-border)', borderRadius: 'var(--border-radius-sm)', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-sub)' }}>
                <span style={{ flexShrink: 0 }}>⚠️</span>
                <span>{lang === 'ja' ? `回答数が足りません（${targetAnswered}問）。10問以上解くと精度が上がります。` : `Not enough answers (${targetAnswered} answered). Accuracy improves after 10+ answers.`}</span>
              </div>
            )}
            {domainStats.map(({ domain, correct, total, rate }) => (
              <div key={domain} style={{ marginBottom: 'var(--spacing-lg)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-xs)' }}>
                  <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 700, color: 'var(--color-text-main)' }}>{lang === 'en' ? (DOMAIN_NAME_EN[domain] ?? domain) : domain}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)', flexShrink: 0 }}>
                    {rate !== null ? (
                      <>
                        <span style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700, color: rate >= 70 ? 'var(--color-success)' : rate >= 50 ? 'var(--color-warning)' : 'var(--color-danger)' }}>
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
                    width: rate !== null ? `${rate}%` : '0%',
                    height: '100%',
                    background: rate === null ? 'var(--color-border)' : rate >= 70 ? 'var(--color-success)' : rate >= 50 ? 'var(--color-warning)' : 'var(--color-danger)',
                    transition: 'width 0.4s',
                    borderRadius: 10,
                  }} />
                </div>
              </div>
            ))}
            <div style={{ marginTop: 'var(--spacing-sm)', display: 'flex', gap: 'var(--spacing-lg)', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-light)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--color-success)', display: 'inline-block' }} />70%以上
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--color-warning)', display: 'inline-block' }} />50〜69%
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--color-danger)', display: 'inline-block' }} />50%未満
              </span>
            </div>
          </Card>
        </>
        );
      })()}

      {/* 模試スコア推移 */}
      {!loading && examSessions.length > 0 && (
        <>
          <h3 style={{ fontSize: 'var(--font-size-h3)', fontWeight: 700, margin: '0 0 var(--spacing-md)', color: 'var(--color-text-sub)' }}>{t('stats.scoreHistory')}</h3>
          <Card style={{ marginBottom: 'var(--spacing-xl)' }}>
            {visibleExamTypes.map(et => {
              const etExams = examSessions.filter(s => s.examType === et).reverse();
              if (etExams.length === 0) return null;
              const passRate = PASS_RATE[et];
              return (
                <div key={et} style={{ marginBottom: 'var(--spacing-xl)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', marginBottom: 'var(--spacing-md)' }}>
                    <Badge variant="secondary">{et}</Badge>
                    <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-sub)' }}>{t('stats.passTarget')} {passRate}%</span>
                  </div>
                  <div style={{ display: 'flex', gap: 'var(--spacing-sm)', alignItems: 'flex-end', overflowX: 'auto', paddingBottom: 'var(--spacing-sm)' }}>
                    {etExams.map((s, idx) => {
                      const barHeight = Math.max(4, Math.round(s.score * 1.5));
                      return (
                        <div key={s.sessionId} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                          <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: s.isPassed ? 'var(--color-success)' : 'var(--color-danger)' }}>{s.score}%</div>
                          <div style={{ width: 32, height: barHeight, background: s.isPassed ? 'var(--color-success)' : 'var(--color-danger)', borderRadius: '2px 2px 0 0', opacity: 0.8 }} />
                          <div style={{ fontSize: 10, color: 'var(--color-text-light)', whiteSpace: 'nowrap' }}>{t('stats.attempt')}{idx + 1}</div>
                        </div>
                      );
                    })}
                    <div style={{ marginLeft: 'var(--spacing-md)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', paddingBottom: 24 }}>
                      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-primary)', fontWeight: 700, borderTop: '2px dashed var(--color-primary)', paddingTop: 4, whiteSpace: 'nowrap' }}>{t('stats.passTarget')} {passRate}%</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </Card>
        </>
      )}

      {/* 演習履歴テーブル */}
      <h3 style={{ fontSize: 'var(--font-size-h3)', fontWeight: 700, margin: '0 0 var(--spacing-md)', color: 'var(--color-text-sub)' }}>{t('stats.history')}</h3>
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0' }}>
          <div className="sherpa-spinner" style={{ width: 24, height: 24, borderWidth: 2 }} />
        </div>
      ) : visibleSessions.length === 0 ? (
        <div style={{ color: 'var(--color-text-sub)', padding: 'var(--spacing-lg) 0' }}>
          <p style={{ margin: '0 0 var(--spacing-sm)' }}>{t('stats.noHistory')}</p>
          {targetExam && (
            <Button variant="outline" onClick={() => navigate('/exercise/setup')}>
              {t('stats.startExercise', { exam: targetExam })}
            </Button>
          )}
        </div>
      ) : (
        <Card padding={0} style={{ overflow: 'hidden' }}>
          <div className="stats-table-scroll" style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--font-size-base)' }}>
              <thead>
                <tr style={{ background: 'var(--color-bg-main)', borderBottom: '1px solid var(--color-border)' }}>
                  {[t('stats.colDate'), t('stats.colExam'), t('stats.colMode'), t('stats.colScore'), t('stats.colResult')].map(h => (
                    <th key={h} style={{ padding: '12px 24px', textAlign: 'left', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-sub)', fontWeight: 700 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleSessions.map((s, i) => (
                  <tr key={s.sessionId} style={{ borderBottom: i < visibleSessions.length - 1 ? '1px solid var(--color-border)' : 'none' }}>
                    <td style={{ padding: '12px 24px', color: 'var(--color-text-sub)', fontSize: 'var(--font-size-sm)' }}>{fmt(s.endedAt || s.startedAt)}</td>
                    <td style={{ padding: '12px 24px' }}>
                      <Badge variant="secondary">{s.examType}</Badge>
                    </td>
                    <td style={{ padding: '12px 24px', color: 'var(--color-text-main)' }}>{s.mode === 'exam' ? t('stats.modeExam') : t('stats.modeExercise')}</td>
                    <td style={{ padding: '12px 24px', fontWeight: 700, color: s.isPassed ? 'var(--color-success)' : 'var(--color-danger)' }}>{s.score}%</td>
                    <td style={{ padding: '12px 24px' }}>
                      <Badge variant={s.isPassed ? 'success' : 'danger'}>
                        {s.isPassed ? t('stats.passed') : t('stats.failed')}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      {/* データ管理 */}
      {user && (
        <div style={{ marginTop: 'var(--spacing-xxl)' }}>
          <h3 style={{ fontSize: 'var(--font-size-h3)', fontWeight: 700, margin: '0 0 var(--spacing-xs)', color: 'var(--color-text-sub)' }}>
            {lang === 'ja' ? 'データ管理' : 'Data Management'}
          </h3>
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-light)', margin: '0 0 var(--spacing-md)' }}>
            {lang === 'ja' ? '資格ごとの演習・模試データをリセットします。この操作は取り消せません。' : 'Reset exercise and exam data per certification. This action cannot be undone.'}
          </p>
          <Card padding="var(--spacing-lg)" style={{ border: '1px solid var(--color-danger)', borderRadius: 'var(--border-radius-md)' }}>
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
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setConfirmDelete(null)}
                        disabled={deleting}
                        style={{ color: 'var(--color-text-sub)', borderColor: 'var(--color-border)' }}
                      >
                        {lang === 'ja' ? 'キャンセル' : 'Cancel'}
                      </Button>
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => handleDelete(et)}
                        disabled={deleting}
                        style={{ background: 'var(--color-danger)', borderColor: 'var(--color-danger)' }}
                      >
                        {deleting ? '...' : (lang === 'ja' ? '削除する' : 'Delete')}
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setConfirmDelete(et)}
                      style={{ color: 'var(--color-danger)', borderColor: 'var(--color-danger)', flexShrink: 0 }}
                    >
                      {lang === 'ja' ? 'データを削除' : 'Delete Data'}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
