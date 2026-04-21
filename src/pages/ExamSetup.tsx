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
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 40px', color: '#16191f' }}>
      <Breadcrumb items={[{ label: 'ホーム', path: '/' }, { label: '模試設定' }]} />

      <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 24px' }}>模試設定</h1>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 32, alignItems: 'flex-start' }}>

        {/* 左：設定フォーム */}
        <div style={{ background: 'white', border: '1px solid #eaeded', borderRadius: 2, padding: '24px 32px', boxShadow: '0 1px 1px 0 rgba(0,28,36,0.1)' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 24px', borderBottom: '1px solid #eaeded', paddingBottom: 12 }}>
            模試パラメーター
          </h2>

          <div style={{ marginBottom: 32 }}>
            <label style={{ display: 'block', marginBottom: 8, fontWeight: 700, fontSize: 14 }}>試験種別</label>
            <div style={{ display: 'flex', gap: 12 }}>
              {EXAM_TYPES.map(type => (
                <button key={type} onClick={() => setExamType(type)}
                  style={{
                    padding: '8px 24px',
                    background: examType === type ? '#f2f8fd' : 'white',
                    border: '1px solid',
                    borderColor: examType === type ? '#0073bb' : '#d1d5db',
                    borderRadius: 2,
                    cursor: 'pointer',
                    fontWeight: examType === type ? 700 : 400,
                    color: examType === type ? '#0073bb' : '#545b64',
                    transition: 'all 0.1s'
                  }}>
                  {type}
                </button>
              ))}
            </div>
          </div>

          <div style={{ background: '#f2f8fd', borderLeft: '4px solid #0073bb', borderRadius: 2, padding: '12px 16px', fontSize: 14, color: '#16191f', marginBottom: 32 }}>
            <strong style={{ display: 'block', marginBottom: 4 }}>模試モードについて：</strong>
            回答ごとの正誤は表示されません。全問終了後にまとめて結果を確認できます。タイマーは一時停止可能です。
          </div>

          <div style={{ display: 'flex', gap: 12, borderTop: '1px solid #eaeded', paddingTop: 24, justifyContent: 'flex-end' }}>
            <button onClick={() => navigate('/')}
              style={{ padding: '8px 20px', cursor: 'pointer', borderRadius: 2, border: '1px solid #545b64', background: 'white', fontWeight: 700, fontSize: 14 }}>
              キャンセル
            </button>
            <button onClick={startExam} disabled={loading || availableCount === 0}
              style={{
                padding: '8px 32px',
                background: (loading || availableCount === 0) ? '#eaeded' : '#ff9900',
                color: (loading || availableCount === 0) ? '#aab7b8' : '#16191f',
                border: '1px solid transparent',
                borderRadius: 2,
                cursor: (loading || availableCount === 0) ? 'default' : 'pointer',
                fontSize: 14,
                fontWeight: 700
              }}
              onMouseEnter={e => { if (!loading && availableCount !== 0) e.currentTarget.style.background = '#ec7211'; }}
              onMouseLeave={e => { if (!loading && availableCount !== 0) e.currentTarget.style.background = '#ff9900'; }}
            >
              {loading ? '準備中...' : '模試を開始する'}
            </button>
          </div>
        </div>

        {/* 右：試験情報パネル */}
        <div style={{ background: 'white', border: '1px solid #eaeded', borderRadius: 2, padding: '24px', boxShadow: '0 1px 1px 0 rgba(0,28,36,0.1)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ background: '#232f3e', color: 'white', fontSize: 11, padding: '2px 8px', borderRadius: 12, fontWeight: 700 }}>{examType}</span>
            <span style={{ fontSize: 13, color: '#545b64', fontWeight: 700 }}>{config.examCode}</span>
          </div>
          <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 20px', color: '#16191f', lineHeight: 1.4 }}>{config.fullName}</h3>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
            <div style={{ background: '#fbfbfb', border: '1px solid #eaeded', borderRadius: 2, padding: '12px' }}>
              <div style={{ fontSize: 11, color: '#545b64', fontWeight: 700, marginBottom: 4 }}>本番の問題数</div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>
                {config.totalQuestions}<span style={{ fontSize: 12, fontWeight: 400, marginLeft: 4 }}>問</span>
              </div>
            </div>
            <div style={{ background: '#fbfbfb', border: '1px solid #eaeded', borderRadius: 2, padding: '12px' }}>
              <div style={{ fontSize: 11, color: '#545b64', fontWeight: 700, marginBottom: 4 }}>出題数</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#0073bb' }}>
                {useableCount === null ? '...' : useableCount}
                <span style={{ fontSize: 12, fontWeight: 400, marginLeft: 4 }}>問</span>
              </div>
              {shortage !== null && shortage > 0 && (
                <div style={{ fontSize: 11, color: '#d13212', marginTop: 4, fontWeight: 700 }}>{shortage}問不足</div>
              )}
            </div>
            <div style={{ background: '#fbfbfb', border: '1px solid #eaeded', borderRadius: 2, padding: '12px' }}>
              <div style={{ fontSize: 11, color: '#545b64', fontWeight: 700, marginBottom: 4 }}>制限時間</div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{config.timeLimitMin}分</div>
            </div>
            <div style={{ background: '#fbfbfb', border: '1px solid #eaeded', borderRadius: 2, padding: '12px' }}>
              <div style={{ fontSize: 11, color: '#545b64', fontWeight: 700, marginBottom: 4 }}>合格スコア</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#037f0c' }}>{passScore}</div>
            </div>
          </div>

          <div style={{ borderTop: '1px solid #eaeded', paddingTop: 20 }}>
            <h4 style={{ fontSize: 12, fontWeight: 700, color: '#545b64', marginBottom: 12, textTransform: 'uppercase' }}>出題範囲と比率</h4>
            {EXAM_CATEGORIES[examType].map(cat => (
              <div key={cat.name} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                  <span style={{ color: '#16191f' }}>{cat.name}</span>
                  <span style={{ fontWeight: 700, color: '#0073bb' }}>{cat.ratio}</span>
                </div>
                <div style={{ background: '#eaeded', borderRadius: 10, height: 4 }}>
                  <div style={{ background: '#0073bb', borderRadius: 10, height: 4, width: cat.ratio }} />
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
