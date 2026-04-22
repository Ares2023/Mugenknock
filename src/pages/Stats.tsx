import React, { useEffect, useState } from 'react';
import { API_ENDPOINT, EXAM_TYPES, PASS_RATE } from '../constants';
import { useAuth } from '../contexts/AuthContext';
import Breadcrumb from '../components/Breadcrumb';

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

export default function Stats() {
  const { user } = useAuth();
  const [examStats, setExamStats] = useState<ExamStat[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const userId = user.userId;

    const fetchAll = async () => {
      setLoading(true);
      try {
        const [sessionsRes, ...statsRes] = await Promise.all([
          fetch(`${API_ENDPOINT}/users/me/sessions?userId=${userId}&limit=50`).then(r => r.json()),
          ...EXAM_TYPES.map(et =>
            Promise.all([
              fetch(`${API_ENDPOINT}/questions?examType=${et}`).then(r => r.json()),
              fetch(`${API_ENDPOINT}/users/me/question-stats?userId=${userId}&examType=${et}`).then(r => r.json()),
            ])
          ),
        ]);

        const completedSessions: Session[] = sessionsRes.items || [];
        setSessions(completedSessions);

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
    new Date(iso).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  const AWS_TAG_BG = '#232f3e';
  const AWS_BLUE = '#0073bb';

  // スコアの推移（模試のみ）
  const examSessions = sessions.filter(s => s.mode === 'exam');

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '32px 20px', color: '#16191f' }} className="page-container">
      <Breadcrumb items={[{ label: 'ホーム', path: '/' }, { label: '統計・分析' }]} />
      <h2 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 24px' }}>統計・分析</h2>

      {/* 試験別サマリーカード */}
      <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 16px', color: '#545b64' }}>試験別の演習進捗</h3>
      <div className="exam-stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 20, marginBottom: 40 }}>
        {loading
          ? EXAM_TYPES.map(et => (
              <div key={et} style={{ background: 'white', border: '1px solid #eaeded', borderRadius: 2, padding: 24, minHeight: 140, boxShadow: '0 1px 1px 0 rgba(0,28,36,0.1)' }}>
                <div style={{ color: '#545b64', fontSize: 13 }}>読み込み中...</div>
              </div>
            ))
          : examStats.map(stat => {
              const pct = stat.total > 0 ? Math.round((stat.answered / stat.total) * 100) : 0;
              const passRate = PASS_RATE[stat.examType];
              return (
                <div key={stat.examType} style={{ background: 'white', border: '1px solid #eaeded', borderRadius: 2, padding: '24px', borderTop: `4px solid ${AWS_BLUE}`, boxShadow: '0 1px 1px 0 rgba(0,28,36,0.1)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                    <span style={{ background: AWS_TAG_BG, color: 'white', fontSize: 13, padding: '2px 10px', borderRadius: 12, fontWeight: 700 }}>{stat.examType}</span>
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 12, color: '#545b64', marginBottom: 8, fontWeight: 700 }}>演習進捗</div>
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
                    <div style={{ fontSize: 12, color: '#545b64', marginBottom: 4, fontWeight: 700 }}>直近の模試</div>
                    {stat.lastScore !== null ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 24, fontWeight: 700, color: stat.lastPassed ? '#037f0c' : '#d13212' }}>{stat.lastScore}%</span>
                        <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 2, background: stat.lastPassed ? '#f2fcf3' : '#fdf3f1', color: stat.lastPassed ? '#037f0c' : '#d13212', border: `1px solid ${stat.lastPassed ? '#037f0c' : '#d13212'}` }}>
                          {stat.lastPassed ? '合格' : '不合格'}
                        </span>
                        <span style={{ fontSize: 12, color: '#545b64', marginLeft: 'auto' }}>基準 {passRate}%</span>
                      </div>
                    ) : (
                      <span style={{ fontSize: 13, color: '#aab7b8' }}>まだ受験なし</span>
                    )}
                  </div>
                </div>
              );
            })}
      </div>

      {/* 模試スコア推移 */}
      {!loading && examSessions.length > 0 && (
        <>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 16px', color: '#545b64' }}>模試スコアの推移</h3>
          <div style={{ background: 'white', border: '1px solid #eaeded', borderRadius: 2, padding: '20px 24px', marginBottom: 40, boxShadow: '0 1px 1px 0 rgba(0,28,36,0.1)' }}>
            {EXAM_TYPES.map(et => {
              const etExams = examSessions.filter(s => s.examType === et).reverse();
              if (etExams.length === 0) return null;
              const passRate = PASS_RATE[et];
              return (
                <div key={et} style={{ marginBottom: 24 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <span style={{ background: AWS_TAG_BG, color: 'white', fontSize: 11, padding: '2px 8px', borderRadius: 12, fontWeight: 700 }}>{et}</span>
                    <span style={{ fontSize: 12, color: '#545b64' }}>合格ライン {passRate}%</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', overflowX: 'auto', paddingBottom: 8 }}>
                    {etExams.map((s, idx) => {
                      const barHeight = Math.max(4, Math.round(s.score * 1.2));
                      return (
                        <div key={s.sessionId} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: s.isPassed ? '#037f0c' : '#d13212' }}>{s.score}%</div>
                          <div style={{ width: 28, height: barHeight, background: s.isPassed ? '#037f0c' : '#d13212', borderRadius: '2px 2px 0 0', opacity: 0.85 }} />
                          <div style={{ fontSize: 10, color: '#879596', whiteSpace: 'nowrap' }}>回{idx + 1}</div>
                        </div>
                      );
                    })}
                    {/* 合格ライン表示 */}
                    <div style={{ marginLeft: 8, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', paddingBottom: 20 }}>
                      <div style={{ fontSize: 11, color: '#0073bb', fontWeight: 700, borderTop: '2px dashed #0073bb', paddingTop: 2, whiteSpace: 'nowrap' }}>合格ライン {passRate}%</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* 演習履歴テーブル */}
      <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 16px', color: '#545b64' }}>演習・模試の履歴</h3>
      {loading ? (
        <p style={{ color: '#545b64' }}>読み込み中...</p>
      ) : sessions.length === 0 ? (
        <p style={{ color: '#545b64', padding: '20px 0' }}>まだ演習・模試の記録がありません</p>
      ) : (
        <div style={{ background: 'white', border: '1px solid #eaeded', borderRadius: 2, overflow: 'hidden', boxShadow: '0 1px 1px 0 rgba(0,28,36,0.1)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: '#fbfbfb', borderBottom: '1px solid #eaeded' }}>
                {['日時', '試験', 'モード', 'スコア', '結果'].map(h => (
                  <th key={h} style={{ padding: '12px 24px', textAlign: 'left', fontSize: 12, color: '#545b64', fontWeight: 700 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sessions.map((s, i) => (
                <tr key={s.sessionId} style={{ borderBottom: i < sessions.length - 1 ? '1px solid #eaeded' : 'none' }}>
                  <td style={{ padding: '12px 24px', color: '#545b64', fontSize: 13 }}>{fmt(s.endedAt || s.startedAt)}</td>
                  <td style={{ padding: '12px 24px' }}>
                    <span style={{ background: AWS_TAG_BG, color: 'white', fontSize: 11, padding: '2px 8px', borderRadius: 12, fontWeight: 700 }}>{s.examType}</span>
                  </td>
                  <td style={{ padding: '12px 24px', color: '#16191f' }}>{s.mode === 'exam' ? '模試' : '演習'}</td>
                  <td style={{ padding: '12px 24px', fontWeight: 700, color: s.isPassed ? '#037f0c' : '#d13212' }}>{s.score}%</td>
                  <td style={{ padding: '12px 24px' }}>
                    <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 2, background: s.isPassed ? '#f2fcf3' : '#fdf3f1', color: s.isPassed ? '#037f0c' : '#d13212', border: `1px solid ${s.isPassed ? '#037f0c' : '#d13212'}` }}>
                      {s.isPassed ? '合格' : '不合格'}
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
