import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_ENDPOINT, EXAM_TYPES, PASS_RATE, EXAM_DOMAINS, DOMAIN_NAME_EN } from '../constants';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';

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

  useEffect(() => {
    if (!user) return;
    const userId = user.userId;

    const fetchAll = async () => {
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
    };

    fetchAll();
  }, [user]);

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString(lang === 'en' ? 'en-US' : 'ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  const AWS_TAG_BG = '#232f3e';
  const AWS_BLUE = '#008c8c';

  const visibleExamTypes = targetExam ? [targetExam] : [...EXAM_TYPES];
  const visibleStats = examStats.filter(s => visibleExamTypes.includes(s.examType));
  const visibleSessions = sessions.filter(s => visibleExamTypes.includes(s.examType));
  const examSessions = visibleSessions.filter(s => s.mode === 'exam');

  // ドメイン別正答率（目標資格のみ）
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

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 20px', color: '#16191f' }} className="page-container">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <h2 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>{t('stats.title')}</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', rowGap: 6 }}>
          <span style={{ fontSize: 12, color: '#545b64' }}>{t('stats.showing')}</span>
          {EXAM_TYPES.map(et => (
            <button
              key={et}
              onClick={() => {
                const next = targetExam === et ? null : et;
                if (next) localStorage.setItem(TARGET_EXAM_KEY, next);
                else localStorage.removeItem(TARGET_EXAM_KEY);
                setTargetExam(next);
              }}
              style={{
                padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                border: `1px solid ${targetExam === et ? AWS_BLUE : '#d1d5db'}`,
                background: targetExam === et ? AWS_BLUE : 'white',
                color: targetExam === et ? 'white' : '#545b64',
                transition: 'all 0.1s',
              }}
            >
              {et}
            </button>
          ))}
          {targetExam && (
            <button
              onClick={() => { localStorage.removeItem(TARGET_EXAM_KEY); setTargetExam(null); }}
              style={{ padding: '4px 10px', borderRadius: 6, fontSize: 12, border: '1px solid #eaeded', background: 'white', color: '#879596', cursor: 'pointer' }}
            >
              {t('stats.all')}
            </button>
          )}
        </div>
      </div>

      {/* 試験別サマリーカード */}
      <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 16px', color: '#545b64' }}>{t('stats.exerciseProgress')}</h3>
      <div className="exam-stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12, marginBottom: 16 }}>
        {loading
          ? visibleExamTypes.map(et => (
              <div key={et} style={{ background: 'white', border: '1px solid #eaeded', borderRadius: 6, padding: 24, minHeight: 140, boxShadow: '0 1px 1px 0 rgba(0,28,36,0.1)' }}>
                <div style={{ color: '#545b64', fontSize: 13 }}>読み込み中...</div>
              </div>
            ))
          : visibleStats.map(stat => {
              const pct = stat.total > 0 ? Math.round((stat.answered / stat.total) * 100) : 0;
              const passRate = PASS_RATE[stat.examType];
              return (
                <div key={stat.examType} style={{ background: 'white', border: '1px solid #eaeded', borderRadius: 6, padding: '24px', borderTop: `4px solid ${AWS_BLUE}`, boxShadow: '0 1px 1px 0 rgba(0,28,36,0.1)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                    <span style={{ background: AWS_TAG_BG, color: 'white', fontSize: 13, padding: '2px 10px', borderRadius: 12, fontWeight: 700 }}>{stat.examType}</span>
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 12, color: '#545b64', marginBottom: 8, fontWeight: 700 }}>{t('stats.exerciseProgressLabel')}</div>
                    <div style={{ background: '#eaeded', borderRadius: 10, height: 6, overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, background: AWS_BLUE, height: '100%', transition: 'width 0.4s' }} />
                    </div>
                    <div style={{ fontSize: 13, color: '#16191f', marginTop: 8 }}>
                      <strong>{stat.answered}</strong>
                      <span style={{ color: '#545b64' }}> / {stat.total} 問</span>
                      <span style={{ float: 'right', color: AWS_BLUE, fontWeight: 700 }}>{pct}%</span>
                    </div>
                  </div>
                  <div style={{ borderTop: '1px solid #eaeded', paddingTop: 16 }}>
                    <div style={{ fontSize: 12, color: '#545b64', marginBottom: 4, fontWeight: 700 }}>{t('stats.lastMock')}</div>
                    {stat.lastScore !== null ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 24, fontWeight: 700, color: stat.lastPassed ? '#037f0c' : '#d13212' }}>{stat.lastScore}%</span>
                        <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 6, background: stat.lastPassed ? '#f2fcf3' : '#fdf3f1', color: stat.lastPassed ? '#037f0c' : '#d13212', border: `1px solid ${stat.lastPassed ? '#037f0c' : '#d13212'}` }}>
                          {stat.lastPassed ? t('stats.passed') : t('stats.failed')}
                        </span>
                        <span style={{ fontSize: 12, color: '#545b64', marginLeft: 'auto' }}>{t('stats.passLine')} {passRate}%</span>
                      </div>
                    ) : (
                      <span style={{ fontSize: 13, color: '#aab7b8' }}>{t('stats.noExam')}</span>
                    )}
                  </div>
                </div>
              );
            })}
      </div>

      {/* ドメイン別正答率（目標資格のみ） */}
      {!loading && targetExam && domainStats.length > 0 && (
        <>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 16px', color: '#545b64' }}>{t('stats.domainAccuracy')}</h3>
          <div style={{ background: 'white', border: '1px solid #eaeded', borderRadius: 6, padding: '20px 24px', marginBottom: 16, boxShadow: '0 1px 1px 0 rgba(0,28,36,0.1)' }}>
            {domainStats.map(({ domain, correct, total, rate }) => (
              <div key={domain} style={{ marginBottom: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#16191f' }}>{lang === 'en' ? (DOMAIN_NAME_EN[domain] ?? domain) : domain}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                    {rate !== null ? (
                      <>
                        <span style={{ fontSize: 18, fontWeight: 700, color: rate >= 70 ? '#037f0c' : rate >= 50 ? '#d47500' : '#d13212' }}>
                          {rate}%
                        </span>
                        <span style={{ fontSize: 11, color: '#879596' }}>{correct}/{total}問</span>
                      </>
                    ) : (
                      <span style={{ fontSize: 12, color: '#aab7b8' }}>{t('stats.noAnswer')}</span>
                    )}
                  </div>
                </div>
                <div style={{ background: '#eaeded', borderRadius: 10, height: 8, overflow: 'hidden' }}>
                  <div style={{
                    width: rate !== null ? `${rate}%` : '0%',
                    height: '100%',
                    background: rate === null ? '#eaeded' : rate >= 70 ? '#037f0c' : rate >= 50 ? '#d47500' : '#d13212',
                    transition: 'width 0.4s',
                    borderRadius: 10,
                  }} />
                </div>
              </div>
            ))}
            <div style={{ marginTop: 8, display: 'flex', gap: 16, fontSize: 11, color: '#879596' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: '#037f0c', display: 'inline-block' }} />70%以上
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: '#d47500', display: 'inline-block' }} />50〜69%
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: '#d13212', display: 'inline-block' }} />50%未満
              </span>
            </div>
          </div>
        </>
      )}

      {/* 模試スコア推移 */}
      {!loading && examSessions.length > 0 && (
        <>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 16px', color: '#545b64' }}>{t('stats.scoreHistory')}</h3>
          <div style={{ background: 'white', border: '1px solid #eaeded', borderRadius: 6, padding: '20px 24px', marginBottom: 16, boxShadow: '0 1px 1px 0 rgba(0,28,36,0.1)' }}>
            {visibleExamTypes.map(et => {
              const etExams = examSessions.filter(s => s.examType === et).reverse();
              if (etExams.length === 0) return null;
              const passRate = PASS_RATE[et];
              return (
                <div key={et} style={{ marginBottom: 24 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <span style={{ background: AWS_TAG_BG, color: 'white', fontSize: 11, padding: '2px 8px', borderRadius: 12, fontWeight: 700 }}>{et}</span>
                    <span style={{ fontSize: 12, color: '#545b64' }}>{t('stats.passTarget')} {passRate}%</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', overflowX: 'auto', paddingBottom: 8 }}>
                    {etExams.map((s, idx) => {
                      const barHeight = Math.max(4, Math.round(s.score * 1.2));
                      return (
                        <div key={s.sessionId} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: s.isPassed ? '#037f0c' : '#d13212' }}>{s.score}%</div>
                          <div style={{ width: 28, height: barHeight, background: s.isPassed ? '#037f0c' : '#d13212', borderRadius: '2px 2px 0 0', opacity: 0.85 }} />
                          <div style={{ fontSize: 10, color: '#879596', whiteSpace: 'nowrap' }}>{t('stats.attempt')}{idx + 1}</div>
                        </div>
                      );
                    })}
                    <div style={{ marginLeft: 8, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', paddingBottom: 20 }}>
                      <div style={{ fontSize: 11, color: '#008c8c', fontWeight: 700, borderTop: '2px dashed #008c8c', paddingTop: 2, whiteSpace: 'nowrap' }}>{t('stats.passTarget')} {passRate}%</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* 演習履歴テーブル */}
      <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 16px', color: '#545b64' }}>{t('stats.history')}</h3>
      {loading ? (
        <p style={{ color: '#545b64' }}>{t('stats.loading')}</p>
      ) : visibleSessions.length === 0 ? (
        <div style={{ color: '#545b64', padding: '20px 0' }}>
          <p style={{ margin: '0 0 8px' }}>{t('stats.noHistory')}</p>
          {targetExam && (
            <button
              onClick={() => navigate('/exercise/setup')}
              style={{ fontSize: 13, color: AWS_BLUE, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 700 }}
            >
              {t('stats.startExercise', { exam: targetExam })}
            </button>
          )}
        </div>
      ) : (
        <div className="stats-table-scroll" style={{ background: 'white', border: '1px solid #eaeded', borderRadius: 6, overflow: 'hidden', boxShadow: '0 1px 1px 0 rgba(0,28,36,0.1)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: '#fbfbfb', borderBottom: '1px solid #eaeded' }}>
                {[t('stats.colDate'), t('stats.colExam'), t('stats.colMode'), t('stats.colScore'), t('stats.colResult')].map(h => (
                  <th key={h} style={{ padding: '12px 24px', textAlign: 'left', fontSize: 12, color: '#545b64', fontWeight: 700 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleSessions.map((s, i) => (
                <tr key={s.sessionId} style={{ borderBottom: i < visibleSessions.length - 1 ? '1px solid #eaeded' : 'none' }}>
                  <td style={{ padding: '12px 24px', color: '#545b64', fontSize: 13 }}>{fmt(s.endedAt || s.startedAt)}</td>
                  <td style={{ padding: '12px 24px' }}>
                    <span style={{ background: AWS_TAG_BG, color: 'white', fontSize: 11, padding: '2px 8px', borderRadius: 12, fontWeight: 700 }}>{s.examType}</span>
                  </td>
                  <td style={{ padding: '12px 24px', color: '#16191f' }}>{s.mode === 'exam' ? t('stats.modeExam') : t('stats.modeExercise')}</td>
                  <td style={{ padding: '12px 24px', fontWeight: 700, color: s.isPassed ? '#037f0c' : '#d13212' }}>{s.score}%</td>
                  <td style={{ padding: '12px 24px' }}>
                    <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 6, background: s.isPassed ? '#f2fcf3' : '#fdf3f1', color: s.isPassed ? '#037f0c' : '#d13212', border: `1px solid ${s.isPassed ? '#037f0c' : '#d13212'}` }}>
                      {s.isPassed ? t('stats.passed') : t('stats.failed')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
