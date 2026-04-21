import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_ENDPOINT, EXAM_TYPES, PASS_SCORES, PASS_RATE } from '../constants';
import { useAuth } from '../contexts/AuthContext';
import Breadcrumb from '../components/Breadcrumb';

const EXAM_INFO: Record<string, {
  fullName: string;
  examCode: string;
  timeLimit: string;
  totalQuestions: number;
  scoredQuestions: number;
  categories: { name: string; ratio: string }[];
}> = {
  CLF: {
    fullName: 'AWS Certified Cloud Practitioner',
    examCode: 'CLF-C02',
    timeLimit: '90分',
    totalQuestions: 65,
    scoredQuestions: 50,
    categories: [
      { name: 'クラウドのコンセプト', ratio: '24%' },
      { name: 'セキュリティとコンプライアンス', ratio: '30%' },
      { name: 'クラウドテクノロジーとサービス', ratio: '34%' },
      { name: '請求・料金・サポート', ratio: '12%' },
    ],
  },
  SAA: {
    fullName: 'AWS Certified Solutions Architect – Associate',
    examCode: 'SAA-C03',
    timeLimit: '130分',
    totalQuestions: 65,
    scoredQuestions: 65,
    categories: [
      { name: 'セキュアなアーキテクチャの設計', ratio: '30%' },
      { name: '弾力性に優れたアーキテクチャの設計', ratio: '26%' },
      { name: '高パフォーマンスなアーキテクチャの設計', ratio: '24%' },
      { name: 'コスト最適化されたアーキテクチャの設計', ratio: '20%' },
    ],
  },
  SAP: {
    fullName: 'AWS Certified Solutions Architect – Professional',
    examCode: 'SAP-C02',
    timeLimit: '180分',
    totalQuestions: 75,
    scoredQuestions: 65,
    categories: [
      { name: '組織の複雑さに対応したソリューションの設計', ratio: '26%' },
      { name: '新しいソリューションの設計', ratio: '29%' },
      { name: '既存ソリューションの継続的改善', ratio: '25%' },
      { name: 'ワークロードの移行とモダナイゼーション', ratio: '20%' },
    ],
  },
};

export default function ExerciseSetup() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [examType, setExamType] = useState('CLF');
  const [limit, setLimit] = useState(10);
  const [shuffle, setShuffle] = useState(true);
  const [loading, setLoading] = useState(false);

  const info = EXAM_INFO[examType];
  const passScore = PASS_SCORES[examType];

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
        state: { sessionId: sessionData.sessionId, questions: data.items, userId, mode: 'exercise', examType }
      });
    } catch (err) {
      console.error(err);
      alert('セッション開始に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: 24, fontFamily: 'sans-serif' }}>
      <Breadcrumb items={[{ label: 'ホーム', path: '/' }, { label: '演習設定' }]} />
      <h1 style={{ color: '#232f3e' }}>演習設定</h1>

      <div style={{ display: 'flex', gap: 32, alignItems: 'flex-start' }}>

        {/* 左：設定フォーム */}
        <div style={{ flex: '0 0 320px' }}>
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', marginBottom: 8, fontWeight: 'bold' }}>試験種別</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {EXAM_TYPES.map(type => (
                <button key={type} onClick={() => setExamType(type)}
                  style={{ padding: '8px 20px', background: examType === type ? '#ff9900' : '#eee', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: examType === type ? 'bold' : 'normal' }}>
                  {type}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', marginBottom: 8, fontWeight: 'bold' }}>問題数</label>
            <input type="number" value={limit} onChange={e => setLimit(parseInt(e.target.value))} min={1} max={50}
              style={{ padding: '8px', width: 80, border: '1px solid #ddd', borderRadius: 4, fontSize: 16 }} />
          </div>

          <div style={{ marginBottom: 32 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={shuffle} onChange={e => setShuffle(e.target.checked)} />
              <span style={{ fontWeight: 'bold' }}>問題をシャッフルする</span>
            </label>
          </div>

          <div style={{ display: 'flex', gap: 16 }}>
            <button onClick={() => navigate('/')}
              style={{ padding: '12px 24px', cursor: 'pointer', borderRadius: 4, border: '1px solid #aaa' }}>
              ホームへ戻る
            </button>
            <button onClick={startSession} disabled={loading}
              style={{ padding: '12px 24px', background: loading ? '#ccc' : '#ff9900', color: 'white', border: 'none', borderRadius: 4, cursor: loading ? 'default' : 'pointer', fontSize: 16 }}>
              {loading ? '準備中...' : '演習開始'}
            </button>
          </div>
        </div>

        {/* 右：試験情報パネル */}
        <div style={{ flex: 1, background: '#f8f9fa', border: '1px solid #e0e0e0', borderRadius: 10, padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ background: '#232f3e', color: 'white', fontSize: 12, padding: '2px 8px', borderRadius: 4 }}>{examType}</span>
            <span style={{ fontSize: 12, color: '#888' }}>{info.examCode}</span>
          </div>
          <p style={{ fontSize: 13, color: '#555', marginTop: 6, marginBottom: 20 }}>{info.fullName}</p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
            <div style={{ background: 'white', border: '1px solid #e8e8e8', borderRadius: 8, padding: '12px 16px' }}>
              <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>問題数（本番）</div>
              <div style={{ fontSize: 22, fontWeight: 'bold', color: '#232f3e' }}>
                {info.totalQuestions}<span style={{ fontSize: 13, fontWeight: 'normal', marginLeft: 2 }}>問</span>
              </div>
              {info.scoredQuestions < info.totalQuestions && (
                <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>採点対象 {info.scoredQuestions}問</div>
              )}
            </div>
            <div style={{ background: 'white', border: '1px solid #e8e8e8', borderRadius: 8, padding: '12px 16px' }}>
              <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>制限時間</div>
              <div style={{ fontSize: 22, fontWeight: 'bold', color: '#232f3e' }}>{info.timeLimit}</div>
            </div>
            <div style={{ background: 'white', border: '1px solid #e8e8e8', borderRadius: 8, padding: '12px 16px', gridColumn: '1 / -1' }}>
              <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>合格スコア（スケールスコア 100〜1000）</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                <span style={{ fontSize: 26, fontWeight: 'bold', color: '#27ae60' }}>{passScore}</span>
                <span style={{ fontSize: 13, color: '#888' }}>/ 1000</span>
                <span style={{ fontSize: 12, color: '#aaa', marginLeft: 8 }}>（正答率 {PASS_RATE[examType]}% 相当）</span>
              </div>
            </div>
          </div>

          <div>
            <div style={{ fontSize: 12, fontWeight: 'bold', color: '#555', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>出題範囲</div>
            {info.categories.map(cat => (
              <div key={cat.name} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 3 }}>
                  <span style={{ color: '#333' }}>{cat.name}</span>
                  <span style={{ fontWeight: 'bold', color: '#ff9900' }}>{cat.ratio}</span>
                </div>
                <div style={{ background: '#e8e8e8', borderRadius: 4, height: 6 }}>
                  <div style={{ background: '#ff9900', borderRadius: 4, height: 6, width: cat.ratio, transition: 'width 0.3s' }} />
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
