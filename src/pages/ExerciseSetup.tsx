import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_ENDPOINT, EXAM_TYPES, EXAM_DOMAINS, PASS_SCORES, PASS_RATE } from '../constants';
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
  const [selectedDomain, setSelectedDomain] = useState('');
  const [selectedTag, setSelectedTag] = useState('');
  const [limit, setLimit] = useState(10);
  const [shuffle, setShuffle] = useState(true);
  const [loading, setLoading] = useState(false);

  const info = EXAM_INFO[examType];
  const passScore = PASS_SCORES[examType];
  const [availableCount, setAvailableCount] = useState<number | null>(null);
  const [answeredCount, setAnsweredCount] = useState<number | null>(null);
  const [availableTags, setAvailableTags] = useState<string[]>([]);

  useEffect(() => {
    setSelectedDomain('');
    setSelectedTag('');
  }, [examType]);

  useEffect(() => {
    setAvailableCount(null);
    setAnsweredCount(null);

    const params = new URLSearchParams({ examType });
    if (selectedDomain) params.set('domain', selectedDomain);
    if (selectedTag) params.set('tagId', selectedTag);

    fetch(`${API_ENDPOINT}/questions?${params}`)
      .then(r => r.json())
      .then(d => setAvailableCount(d.count ?? d.items?.length ?? 0))
      .catch(() => setAvailableCount(0));

    if (user) {
      fetch(`${API_ENDPOINT}/users/me/question-stats?userId=${user.userId}&examType=${examType}`)
        .then(r => r.json())
        .then(d => setAnsweredCount(d.answeredCount ?? 0))
        .catch(() => setAnsweredCount(0));
    } else {
      setAnsweredCount(0);
    }
  }, [examType, selectedDomain, selectedTag, user]);

  useEffect(() => {
    fetch(`${API_ENDPOINT}/tags?examType=${examType}`)
      .then(r => r.json())
      .then(d => setAvailableTags(d.tags || []))
      .catch(() => setAvailableTags([]));
  }, [examType]);

  const startSession = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ examType, limit: String(limit), shuffle: String(shuffle) });
      if (selectedDomain) params.set('domain', selectedDomain);
      if (selectedTag) params.set('tagId', selectedTag);

      const res = await fetch(`${API_ENDPOINT}/questions?${params}`);
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

  const chipStyle = (active: boolean) => ({
    padding: '4px 12px',
    fontSize: 13,
    borderRadius: 2,
    border: '1px solid',
    borderColor: active ? '#0073bb' : '#d1d5db',
    background: active ? '#f2f8fd' : 'white',
    color: active ? '#0073bb' : '#545b64',
    fontWeight: active ? 700 : 400,
    cursor: 'pointer',
  } as React.CSSProperties);

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 40px', color: '#16191f' }}>
      <Breadcrumb items={[{ label: 'ホーム', path: '/' }, { label: '演習設定' }]} />

      <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 24px' }}>演習設定</h1>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 32, alignItems: 'flex-start' }}>

        {/* 左：設定フォーム */}
        <div style={{ background: 'white', border: '1px solid #eaeded', borderRadius: 2, padding: '24px 32px', boxShadow: '0 1px 1px 0 rgba(0,28,36,0.1)' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 24px', borderBottom: '1px solid #eaeded', paddingBottom: 12 }}>
            演習パラメーター
          </h2>

          {/* 試験種別 */}
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', marginBottom: 8, fontWeight: 700, fontSize: 14 }}>試験種別</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {EXAM_TYPES.map(type => (
                <button key={type} onClick={() => setExamType(type)} style={chipStyle(examType === type)}>
                  {type}
                </button>
              ))}
            </div>
          </div>

          {/* ドメインフィルタ */}
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', marginBottom: 8, fontWeight: 700, fontSize: 14 }}>
              出題ドメイン <span style={{ fontWeight: 400, fontSize: 12, color: '#545b64' }}>（任意）</span>
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              <button onClick={() => setSelectedDomain('')} style={chipStyle(selectedDomain === '')}>すべて</button>
              {EXAM_DOMAINS[examType].map(d => (
                <button key={d} onClick={() => setSelectedDomain(selectedDomain === d ? '' : d)} style={chipStyle(selectedDomain === d)}>
                  {d}
                </button>
              ))}
            </div>
          </div>

          {/* タグフィルタ */}
          {availableTags.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 700, fontSize: 14 }}>
                タグ <span style={{ fontWeight: 400, fontSize: 12, color: '#545b64' }}>（任意）</span>
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                <button onClick={() => setSelectedTag('')} style={chipStyle(selectedTag === '')}>すべて</button>
                {availableTags.map(t => (
                  <button key={t} onClick={() => setSelectedTag(selectedTag === t ? '' : t)} style={chipStyle(selectedTag === t)}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 問題数 */}
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', marginBottom: 8, fontWeight: 700, fontSize: 14 }}>問題数</label>
            <input type="number" value={limit} onChange={e => setLimit(Math.max(1, parseInt(e.target.value) || 1))} min={1} max={availableCount ?? 50}
              style={{ padding: '6px 12px', width: 100, border: '1px solid #d1d5db', borderRadius: 2, fontSize: 14, outline: 'none' }}
              onFocus={e => e.currentTarget.style.borderColor = '#0073bb'}
              onBlur={e => e.currentTarget.style.borderColor = '#d1d5db'}
            />
            <span style={{ marginLeft: 12, fontSize: 12, color: '#545b64' }}>
              {availableCount !== null ? `最大 ${availableCount} 問` : '読込中...'}
            </span>
          </div>

          {/* シャッフル */}
          <div style={{ marginBottom: 32, padding: '16px', background: '#f2f3f3', borderRadius: 2 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 14 }}>
              <input type="checkbox" checked={shuffle} onChange={e => setShuffle(e.target.checked)} style={{ width: 16, height: 16 }} />
              <span style={{ fontWeight: 700 }}>問題をシャッフルする</span>
            </label>
          </div>

          <div style={{ display: 'flex', gap: 12, borderTop: '1px solid #eaeded', paddingTop: 24, justifyContent: 'flex-end' }}>
            <button onClick={() => navigate('/')}
              style={{ padding: '8px 20px', cursor: 'pointer', borderRadius: 2, border: '1px solid #545b64', background: 'white', fontWeight: 700, fontSize: 14 }}>
              キャンセル
            </button>
            <button onClick={startSession} disabled={loading || availableCount === 0}
              style={{
                padding: '8px 32px',
                background: loading || availableCount === 0 ? '#eaeded' : '#ff9900',
                color: loading || availableCount === 0 ? '#aab7b8' : '#16191f',
                border: '1px solid transparent',
                borderRadius: 2,
                cursor: loading || availableCount === 0 ? 'default' : 'pointer',
                fontSize: 14,
                fontWeight: 700
              }}
              onMouseEnter={e => { if (!loading && availableCount !== 0) e.currentTarget.style.background = '#ec7211'; }}
              onMouseLeave={e => { if (!loading && availableCount !== 0) e.currentTarget.style.background = '#ff9900'; }}
            >
              {loading ? '準備中...' : '演習を開始する'}
            </button>
          </div>
        </div>

        {/* 右：試験情報パネル */}
        <div style={{ background: 'white', border: '1px solid #eaeded', borderRadius: 2, padding: '24px', boxShadow: '0 1px 1px 0 rgba(0,28,36,0.1)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ background: '#232f3e', color: 'white', fontSize: 11, padding: '2px 8px', borderRadius: 12, fontWeight: 700 }}>{examType}</span>
            <span style={{ fontSize: 13, color: '#545b64', fontWeight: 700 }}>{info.examCode}</span>
          </div>
          <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 20px', color: '#16191f', lineHeight: 1.4 }}>{info.fullName}</h3>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
            <div style={{ background: '#fbfbfb', border: '1px solid #eaeded', borderRadius: 2, padding: '12px' }}>
              <div style={{ fontSize: 11, color: '#545b64', fontWeight: 700, marginBottom: 4 }}>本番の問題数</div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>
                {info.totalQuestions}<span style={{ fontSize: 12, fontWeight: 400, marginLeft: 4 }}>問</span>
              </div>
            </div>
            <div style={{ background: '#fbfbfb', border: '1px solid #eaeded', borderRadius: 2, padding: '12px' }}>
              <div style={{ fontSize: 11, color: '#545b64', fontWeight: 700, marginBottom: 4 }}>
                {selectedDomain || selectedTag ? 'フィルタ後の問題数' : 'サイト内問題数'}
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#0073bb' }}>
                {availableCount === null ? '...' : availableCount}
                <span style={{ fontSize: 12, fontWeight: 400, marginLeft: 4 }}>問</span>
              </div>
            </div>
            <div style={{ background: '#fbfbfb', border: '1px solid #eaeded', borderRadius: 2, padding: '12px' }}>
              <div style={{ fontSize: 11, color: '#545b64', fontWeight: 700, marginBottom: 4 }}>演習済み</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#037f0c' }}>
                {answeredCount === null ? '...' : answeredCount}
                <span style={{ fontSize: 12, fontWeight: 400, marginLeft: 4 }}>問</span>
              </div>
            </div>
            <div style={{ background: '#fbfbfb', border: '1px solid #eaeded', borderRadius: 2, padding: '12px' }}>
              <div style={{ fontSize: 11, color: '#545b64', fontWeight: 700, marginBottom: 4 }}>合格スコア</div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{passScore}</div>
            </div>
          </div>

          <div style={{ borderTop: '1px solid #eaeded', paddingTop: 20 }}>
            <h4 style={{ fontSize: 12, fontWeight: 700, color: '#545b64', marginBottom: 12, textTransform: 'uppercase' }}>出題範囲と比率</h4>
            {info.categories.map(cat => (
              <div key={cat.name} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                  <span style={{
                    color: selectedDomain === cat.name ? '#0073bb' : '#16191f',
                    fontWeight: selectedDomain === cat.name ? 700 : 400,
                  }}>{cat.name}</span>
                  <span style={{ fontWeight: 700, color: '#0073bb' }}>{cat.ratio}</span>
                </div>
                <div style={{ background: '#eaeded', borderRadius: 10, height: 4 }}>
                  <div style={{ background: selectedDomain === cat.name ? '#0073bb' : '#879596', borderRadius: 10, height: 4, width: cat.ratio }} />
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
