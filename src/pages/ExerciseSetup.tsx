import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_ENDPOINT, EXAM_TYPES } from '../constants';
import { useAuth } from '../contexts/AuthContext';

export default function ExerciseSetup() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [examType, setExamType] = useState('CLF');
  const [limit, setLimit] = useState(10);
  const [shuffle, setShuffle] = useState(true);
  const [loading, setLoading] = useState(false);

  const startSession = async () => {
    setLoading(true);
    try {
      const url = `${API_ENDPOINT}/questions?examType=${examType}&limit=${limit}&shuffle=${shuffle}`;
      const res = await fetch(url);
      const data = await res.json();
      const questionIds = data.items.map((q: any) => q.questionId);

      const userId = user?.userId ?? 'guest';
      const sessionRes = await fetch(`${API_ENDPOINT}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, mode: 'exercise', examType, questionIds })
      });
      const sessionData = await sessionRes.json();

      navigate('/exercise/session', {
        state: {
          sessionId: sessionData.sessionId,
          questions: data.items,
          userId,
          mode: 'exercise'
        }
      });
    } catch (err) {
      console.error(err);
      alert('セッション開始に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 600, margin: "0 auto", padding: 24, fontFamily: "sans-serif" }}>
      <h1 style={{ color: "#232f3e" }}>演習設定</h1>

      <div style={{ marginBottom: 24 }}>
        <label style={{ display: "block", marginBottom: 8, fontWeight: "bold" }}>試験種別</label>
        <div style={{ display: "flex", gap: 8 }}>
          {EXAM_TYPES.map(type => (
            <button key={type} onClick={() => setExamType(type)}
              style={{ padding: "8px 20px", background: examType === type ? "#ff9900" : "#eee", border: "none", borderRadius: 4, cursor: "pointer", fontWeight: examType === type ? "bold" : "normal" }}>
              {type}
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: 24 }}>
        <label style={{ display: "block", marginBottom: 8, fontWeight: "bold" }}>問題数</label>
        <input type="number" value={limit} onChange={e => setLimit(parseInt(e.target.value))} min={1} max={50}
          style={{ padding: "8px", width: 80, border: "1px solid #ddd", borderRadius: 4, fontSize: 16 }} />
      </div>

      <div style={{ marginBottom: 24 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
          <input type="checkbox" checked={shuffle} onChange={e => setShuffle(e.target.checked)} />
          <span style={{ fontWeight: "bold" }}>問題をシャッフルする</span>
        </label>
      </div>

      <div style={{ display: "flex", gap: 16 }}>
        <button onClick={() => navigate("/")}
          style={{ padding: "12px 24px", cursor: "pointer", borderRadius: 4, border: "1px solid #aaa" }}>
          戻る
        </button>
        <button onClick={startSession} disabled={loading}
          style={{ padding: "12px 24px", background: loading ? "#ccc" : "#ff9900", color: "white", border: "none", borderRadius: 4, cursor: loading ? "default" : "pointer", fontSize: 16 }}>
          {loading ? "準備中..." : "演習開始"}
        </button>
      </div>
    </div>
  );
}
