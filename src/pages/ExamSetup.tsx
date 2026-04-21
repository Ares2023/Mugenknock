import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_ENDPOINT, EXAM_TYPES, EXAM_CONFIGS, PASS_SCORES, PASS_RATE } from '../constants';
import { useAuth } from '../contexts/AuthContext';

export default function ExamSetup() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [examType, setExamType] = useState('CLF');
  const [availableCount, setAvailableCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const config = EXAM_CONFIGS[examType];

  useEffect(() => {
    setAvailableCount(null);
    fetch(`${API_ENDPOINT}/questions?examType=${examType}`)
      .then(r => r.json())
      .then(d => setAvailableCount(d.count ?? d.items?.length ?? 0))
      .catch(() => setAvailableCount(0));
  }, [examType]);

  const startExam = async () => {
    setLoading(true);
    try {
      const limit = Math.min(config.totalQuestions, availableCount ?? config.totalQuestions);
      const res = await fetch(`${API_ENDPOINT}/questions?examType=${examType}&limit=${limit}&shuffle=true`);
      const data = await res.json();
      const questionIds = data.items.map((q: any) => q.questionId);

      const userId = user?.userId ?? 'guest';
      const sessionRes = await fetch(`${API_ENDPOINT}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, mode: 'exam', examType, questionIds })
      });
      const sessionData = await sessionRes.json();

      navigate('/exam/session', {
        state: { sessionId: sessionData.sessionId, questions: data.items, userId, examType }
      });
    } catch (err) {
      console.error(err);
      alert('開始に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const useableCount = availableCount !== null ? Math.min(config.totalQuestions, availableCount) : null;
  const shortage = availableCount !== null ? Math.max(0, config.totalQuestions - availableCount) : null;

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '32px 24px', fontFamily: 'sans-serif' }}>
      <h2 style={{ color: '#232f3e', marginTop: 0 }}>模試設定</h2>

      {/* 試験種別 */}
      <div style={{ marginBottom: 28 }}>
        <label style={{ display: 'block', marginBottom: 10, fontWeight: 'bold' }}>試験種別</label>
        <div style={{ display: 'flex', gap: 8 }}>
          {EXAM_TYPES.map(type => (
            <button key={type} onClick={() => setExamType(type)}
              style={{ padding: '8px 24px', border: 'none', borderRadius: 4, cursor: 'pointer',
                background: examType === type ? '#0073bb' : '#eee',
                fontWeight: examType === type ? 'bold' : 'normal' }}>
              {type}
            </button>
          ))}
        </div>
      </div>

      {/* 模試情報カード */}
      <div style={{ background: 'white', border: '1px solid #e0e0e0', borderRadius: 10, padding: 24, marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{ background: '#232f3e', color: 'white', fontSize: 12, padding: '2px 8px', borderRadius: 4 }}>{examType}</span>
          <span style={{ fontSize: 12, color: '#888' }}>{config.examCode}</span>
        </div>
        <p style={{ fontSize: 13, color: '#555', margin: '0 0 20px' }}>{config.fullName}</p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          {[
            { label: '出題数',     value: useableCount === null ? '…' : `${useableCount}問`, sub: shortage ? `（${shortage}問不足）` : undefined, subColor: '#e74c3c' },
            { label: '制限時間',   value: `${config.timeLimitMin}分` },
            { label: '合格スコア', value: `${PASS_SCORES[examType]} / 1000`, sub: `正答率 ${PASS_RATE[examType]}% 相当`, subColor: '#888', span: true },
          ].map(card => (
            <div key={card.label} style={{ background: '#f8f9fa', borderRadius: 8, padding: '12px 16px', gridColumn: (card as any).span ? '1 / -1' : undefined }}>
              <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>{card.label}</div>
              <div style={{ fontSize: 20, fontWeight: 'bold', color: '#232f3e' }}>{card.value}</div>
              {card.sub && <div style={{ fontSize: 11, color: card.subColor, marginTop: 2 }}>{card.sub}</div>}
            </div>
          ))}
        </div>

        <div style={{ background: '#fff8ee', border: '1px solid #ffe0a0', borderRadius: 6, padding: '10px 14px', fontSize: 13, color: '#555' }}>
          <strong>模試モードについて：</strong> 回答ごとの正誤は表示されません。全問終了後にまとめて結果を確認できます。一時停止可能です。
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12 }}>
        <button onClick={() => navigate('/')}
          style={{ padding: '12px 24px', border: '1px solid #aaa', borderRadius: 4, cursor: 'pointer', background: 'white' }}>
          戻る
        </button>
        <button onClick={startExam} disabled={loading || availableCount === 0}
          style={{ padding: '12px 32px', background: loading || availableCount === 0 ? '#ccc' : '#232f3e',
            color: 'white', border: 'none', borderRadius: 4, cursor: loading || availableCount === 0 ? 'default' : 'pointer', fontSize: 16 }}>
          {loading ? '準備中...' : '模試を開始する'}
        </button>
      </div>
    </div>
  );
}
