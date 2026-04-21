import React, { useEffect, useState } from 'react';
import { API_ENDPOINT, EXAM_TYPES, PASS_RATE } from '../constants';
import { useAuth } from '../contexts/AuthContext';

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

export default function Home() {
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
          fetch(`${API_ENDPOINT}/users/me/sessions?userId=${userId}&limit=10`).then(r => r.json()),
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

  const examColor = (et: string) =>
    et === 'SAP' ? '#8e44ad' : et === 'SAA' ? '#2980b9' : '#27ae60';

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '28px 24px', fontFamily: 'sans-serif' }}>
      <h2 style={{ color: '#232f3e', marginTop: 0, marginBottom: 24 }}>ダッシュボード</h2>

      {/* 試験別サマリーカード */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 32 }}>
        {loading
          ? EXAM_TYPES.map(et => (
              <div key={et} style={{ background: 'white', border: '1px solid #e0e0e0', borderRadius: 10, padding: 20, minHeight: 130 }}>
                <div style={{ color: '#bbb', fontSize: 13 }}>読み込み中...</div>
              </div>
            ))
          : examStats.map(stat => {
              const pct = stat.total > 0 ? Math.round((stat.answered / stat.total) * 100) : 0;
              const passRate = PASS_RATE[stat.examType];
              return (
                <div key={stat.examType} style={{ background: 'white', border: '1px solid #e0e0e0', borderRadius: 10, padding: 20, borderTop: `4px solid ${examColor(stat.examType)}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <span style={{ background: examColor(stat.examType), color: 'white', fontSize: 12, padding: '2px 8px', borderRadius: 4, fontWeight: 'bold' }}>{stat.examType}</span>
                  </div>

                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>演習進捗</div>
                    <div style={{ background: '#f0f0f0', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, background: examColor(stat.examType), height: '100%', transition: 'width 0.4s' }} />
                    </div>
                    <div style={{ fontSize: 13, color: '#555', marginTop: 4 }}>
                      <strong>{stat.answered}</strong>
                      <span style={{ color: '#aaa' }}> / {stat.total} 問</span>
                      <span style={{ float: 'right', color: examColor(stat.examType), fontWeight: 'bold' }}>{pct}%</span>
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>直近の模試</div>
                    {stat.lastScore !== null ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 20, fontWeight: 'bold', color: stat.lastPassed ? '#27ae60' : '#e74c3c' }}>{stat.lastScore}%</span>
                        <span style={{ fontSize: 12, padding: '1px 6px', borderRadius: 4, background: stat.lastPassed ? '#eafaf1' : '#fdf2f2', color: stat.lastPassed ? '#27ae60' : '#e74c3c' }}>
                          {stat.lastPassed ? '合格' : '不合格'}
                        </span>
                        <span style={{ fontSize: 11, color: '#bbb', marginLeft: 'auto' }}>基準 {passRate}%</span>
                      </div>
                    ) : (
                      <span style={{ fontSize: 13, color: '#bbb' }}>まだ受験なし</span>
                    )}
                  </div>
                </div>
              );
            })}
      </div>

      {/* 直近の演習履歴 */}
      <h3 style={{ color: '#232f3e', marginBottom: 14, fontSize: 16 }}>直近の演習履歴</h3>
      {loading ? (
        <p style={{ color: '#bbb' }}>読み込み中...</p>
      ) : sessions.length === 0 ? (
        <p style={{ color: '#aaa', padding: '20px 0' }}>まだ演習・模試の記録がありません</p>
      ) : (
        <div style={{ background: 'white', border: '1px solid #e0e0e0', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: '#f8f9fa', borderBottom: '1px solid #e0e0e0' }}>
                {['日時', '試験', 'モード', 'スコア', '結果'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 12, color: '#888', fontWeight: 'normal' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sessions.map((s, i) => (
                <tr key={s.sessionId} style={{ borderBottom: i < sessions.length - 1 ? '1px solid #f0f0f0' : 'none' }}>
                  <td style={{ padding: '10px 16px', color: '#888', fontSize: 13 }}>{fmt(s.endedAt || s.startedAt)}</td>
                  <td style={{ padding: '10px 16px' }}>
                    <span style={{ background: examColor(s.examType), color: 'white', fontSize: 11, padding: '2px 7px', borderRadius: 4 }}>{s.examType}</span>
                  </td>
                  <td style={{ padding: '10px 16px', color: '#555' }}>{s.mode === 'exam' ? '模試' : '演習'}</td>
                  <td style={{ padding: '10px 16px', fontWeight: 'bold', color: s.isPassed ? '#27ae60' : '#e74c3c' }}>{s.score}%</td>
                  <td style={{ padding: '10px 16px' }}>
                    <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 4, background: s.isPassed ? '#eafaf1' : '#fdf2f2', color: s.isPassed ? '#27ae60' : '#e74c3c' }}>
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
