import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_ENDPOINT, EXAM_TYPES, EXAM_CONFIGS, PASS_SCORES, PASS_RATE } from '../constants';
import { useAuth } from '../contexts/AuthContext';
import Breadcrumb from '../components/Breadcrumb';

const EXAM_CATEGORIES: Record<string, { name: string; ratio: string }[]> = {
  CLF: [
    { name: 'クラウドのコンセプト', ratio: '24%' },
    { name: 'セキュリティとコンプライアンス', ratio: '30%' },
    { name: 'クラウドテクノロジーとサービス', ratio: '34%' },
    { name: '請求・料金・サポート', ratio: '12%' },
  ],
  SAA: [
    { name: 'セキュアなアーキテクチャの設計', ratio: '30%' },
    { name: '弾力性に優れたアーキテクチャの設計', ratio: '26%' },
    { name: '高パフォーマンスなアーキテクチャの設計', ratio: '24%' },
    { name: 'コスト最適化されたアーキテクチャの設計', ratio: '20%' },
  ],
  SAP: [
    { name: '組織の複雑さに対応したソリューションの設計', ratio: '26%' },
    { name: '新しいソリューションの設計', ratio: '29%' },
    { name: '既存ソリューションの継続的改善', ratio: '25%' },
    { name: 'ワークロードの移行とモダナイゼーション', ratio: '20%' },
  ],
};

const SCORED_QUESTIONS: Record<string, number> = {
  CLF: 50,
  SAA: 65,
  SAP: 65,
};

export default function ExamSetup() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [examType, setExamType] = useState('CLF');
  const [availableCount, setAvailableCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const config = EXAM_CONFIGS[examType];
  const passScore = PASS_SCORES[examType];

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
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px 32px', fontFamily: 'sans-serif' }}>
      <Breadcrumb items={[{ label: 'ホーム', path: '/' }, { label: '模試設定' }]} />

      <div style={{ display: 'flex', gap: 32, alignItems: 'flex-start' }}>

        {/* 左：設定フォーム */}
        <div style={{ flex: '0 0 320px' }}>
          <h1 style={{ color: '#232f3e', marginTop: 0, marginBottom: 24 }}>模試設定</h1>

          <div style={{ marginBottom: 32 }}>
            <label style={{ display: 'block', marginBottom: 8, fontWeight: 'bold' }}>試験種別</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {EXAM_TYPES.map(type => (
                <button key={type} onClick={() => setExamType(type)}
                  style={{ padding: '8px 20px', background: examType === type ? '#0073bb' : '#eee', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: examType === type ? 'bold' : 'normal' }}>
                  {type}
                </button>
              ))}
            </div>
          </div>

          <div style={{ background: '#fff8ee', border: '1px solid #ffe0a0', borderRadius: 6, padding: '10px 14px', fontSize: 13, color: '#555', marginBottom: 32 }}>
            <strong>模試モードについて：</strong> 回答ごとの正誤は表示されません。全問終了後にまとめて結果を確認できます。一時停止可能です。
          </div>

          <div style={{ display: 'flex', gap: 16 }}>
            <button onClick={() => navigate('/')}
              style={{ padding: '12px 24px', cursor: 'pointer', borderRadius: 4, border: '1px solid #aaa', background: 'white' }}>
              ホームへ戻る
            </button>
            <button onClick={startExam} disabled={loading || availableCount === 0}
              style={{ padding: '12px 24px', background: loading || availableCount === 0 ? '#ccc' : '#0073bb',
                color: 'white', border: 'none', borderRadius: 4, cursor: loading || availableCount === 0 ? 'default' : 'pointer', fontSize: 16 }}>
              {loading ? '準備中...' : '模試を開始する'}
            </button>
          </div>
        </div>

        {/* 右：試験情報パネル */}
        <div style={{ flex: 1, background: '#f8f9fa', border: '1px solid #e0e0e0', borderRadius: 10, padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ background: '#232f3e', color: 'white', fontSize: 12, padding: '2px 8px', borderRadius: 4 }}>{examType}</span>
            <span style={{ fontSize: 12, color: '#888' }}>{config.examCode}</span>
          </div>
          <p style={{ fontSize: 13, color: '#555', marginTop: 6, marginBottom: 20 }}>{config.fullName}</p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
            <div style={{ background: 'white', border: '1px solid #e8e8e8', borderRadius: 8, padding: '12px 16px' }}>
              <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>問題数（本番）</div>
              <div style={{ fontSize: 22, fontWeight: 'bold', color: '#232f3e' }}>
                {config.totalQuestions}<span style={{ fontSize: 13, fontWeight: 'normal', marginLeft: 2 }}>問</span>
              </div>
              {SCORED_QUESTIONS[examType] < config.totalQuestions && (
                <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>採点対象 {SCORED_QUESTIONS[examType]}問</div>
              )}
            </div>
            <div style={{ background: 'white', border: '1px solid #e8e8e8', borderRadius: 8, padding: '12px 16px' }}>
              <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>出題数</div>
              <div style={{ fontSize: 22, fontWeight: 'bold', color: useableCount === null ? '#ccc' : '#232f3e' }}>
                {useableCount === null ? '…' : useableCount}
                <span style={{ fontSize: 13, fontWeight: 'normal', marginLeft: 2 }}>問</span>
              </div>
              {shortage !== null && shortage > 0 && (
                <div style={{ fontSize: 11, color: '#e74c3c', marginTop: 2 }}>{shortage}問不足</div>
              )}
            </div>
            <div style={{ background: 'white', border: '1px solid #e8e8e8', borderRadius: 8, padding: '12px 16px' }}>
              <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>制限時間</div>
              <div style={{ fontSize: 22, fontWeight: 'bold', color: '#232f3e' }}>{config.timeLimitMin}分</div>
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
            {EXAM_CATEGORIES[examType].map(cat => (
              <div key={cat.name} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 3 }}>
                  <span style={{ color: '#333' }}>{cat.name}</span>
                  <span style={{ fontWeight: 'bold', color: '#0073bb' }}>{cat.ratio}</span>
                </div>
                <div style={{ background: '#e8e8e8', borderRadius: 4, height: 6 }}>
                  <div style={{ background: '#0073bb', borderRadius: 4, height: 6, width: cat.ratio, transition: 'width 0.3s' }} />
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
