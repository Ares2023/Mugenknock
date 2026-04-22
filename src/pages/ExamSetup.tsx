import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_ENDPOINT, EXAM_TYPES, EXAM_CONFIGS, EXAM_DOMAINS, PASS_SCORES, PASS_RATE } from '../constants';
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
  DOP: [
    { name: 'SDLCの自動化', ratio: '22%' },
    { name: '設定管理とIaC', ratio: '17%' },
    { name: '耐障害性の高いクラウドソリューションの設計と実装', ratio: '15%' },
    { name: 'モニタリングとロギング', ratio: '15%' },
    { name: 'インシデントおよびイベントへの対応', ratio: '14%' },
    { name: 'セキュリティとコンプライアンス', ratio: '17%' },
  ],
};

const SCORED_QUESTIONS: Record<string, number> = { CLF: 50, SAA: 65, SAP: 65, DOP: 65 };

export default function ExamSetup() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [examType, setExamType] = useState('CLF');
  const [selectedDomain, setSelectedDomain] = useState('');
  const [selectedTag, setSelectedTag] = useState('');
  const [availableCount, setAvailableCount] = useState<number | null>(null);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const config = EXAM_CONFIGS[examType];
  const passScore = PASS_SCORES[examType];

  useEffect(() => {
    setSelectedDomain('');
    setSelectedTag('');
  }, [examType]);

  useEffect(() => {
    setAvailableCount(null);
    const params = new URLSearchParams({ examType });
    if (selectedDomain) params.set('domain', selectedDomain);
    if (selectedTag) params.set('tagId', selectedTag);
    fetch(`${API_ENDPOINT}/questions?${params}`)
      .then(r => r.json())
      .then(d => setAvailableCount(d.count ?? d.items?.length ?? 0))
      .catch(() => setAvailableCount(0));
  }, [examType, selectedDomain, selectedTag]);

  useEffect(() => {
    fetch(`${API_ENDPOINT}/tags?examType=${examType}`)
      .then(r => r.json())
      .then(d => setAvailableTags(d.tags || []))
      .catch(() => setAvailableTags([]));
  }, [examType]);

  const startExam = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ examType, shuffle: 'true' });
      if (selectedDomain) params.set('domain', selectedDomain);
      if (selectedTag) params.set('tagId', selectedTag);
      const limit = Math.min(config.totalQuestions, availableCount ?? config.totalQuestions);
      params.set('limit', String(limit));

      const res = await fetch(`${API_ENDPOINT}/questions?${params}`);
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
  const shortage = availableCount !== null && !selectedDomain && !selectedTag
    ? Math.max(0, config.totalQuestions - availableCount) : null;

  const chipStyle = (active: boolean) => ({
    padding: '4px 12px',
    fontSize: 13,
    borderRadius: 2,
    border: '1px solid',
    borderColor: active ? '#008c8c' : '#d1d5db',
    background: active ? '#e0f2f2' : 'white',
    color: active ? '#008c8c' : '#545b64',
    fontWeight: active ? 700 : 400,
    cursor: 'pointer',
  } as React.CSSProperties);

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 20px', color: '#16191f' }} className="page-container">
      <Breadcrumb items={[{ label: 'ホーム', path: '/' }, { label: '模試設定' }]} />

      <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 24px' }}>模試設定</h1>

      <div className="setup-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 32, alignItems: 'flex-start' }}>

        {/* 左：設定フォーム */}
        <div style={{ background: 'white', border: '1px solid #eaeded', borderRadius: 2, padding: '24px 32px', boxShadow: '0 1px 1px 0 rgba(0,28,36,0.1)' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 24px', borderBottom: '1px solid #eaeded', paddingBottom: 12 }}>
            模試パラメーター
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

          {/* 模試モード説明 */}
          <div style={{ background: '#e0f2f2', borderLeft: '4px solid #008c8c', borderRadius: 2, padding: '12px 16px', fontSize: 14, color: '#16191f', marginBottom: 32 }}>
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
              {loading ? '準備中...' : '模試を開始する'}
            </button>
          </div>
        </div>

        {/* 右：試験情報パネル */}
        <div style={{ background: 'white', border: '1px solid #eaeded', borderRadius: 2, padding: '24px', boxShadow: '0 1px 1px 0 rgba(0,28,36,0.1)' }}>
          {/* 試験ヘッダー */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <span style={{ background: '#232f3e', color: 'white', fontSize: 11, padding: '2px 8px', borderRadius: 12, fontWeight: 700 }}>{examType}</span>
            <span style={{ fontSize: 13, color: '#545b64', fontWeight: 700 }}>{config.examCode}</span>
          </div>
          <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 20px', color: '#16191f', lineHeight: 1.4 }}>{config.fullName}</h3>

          {/* ── 試験概要 ── */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#545b64', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>試験概要</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, background: '#eaeded', border: '1px solid #eaeded', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ background: 'white', padding: '10px 12px' }}>
                <div style={{ fontSize: 11, color: '#545b64', marginBottom: 4 }}>問題数</div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{config.totalQuestions}<span style={{ fontSize: 11, fontWeight: 400, marginLeft: 2 }}>問</span></div>
                {SCORED_QUESTIONS[examType] < config.totalQuestions && (
                  <div style={{ fontSize: 10, color: '#879596', marginTop: 2 }}>採点 {SCORED_QUESTIONS[examType]}問</div>
                )}
              </div>
              <div style={{ background: 'white', padding: '10px 12px' }}>
                <div style={{ fontSize: 11, color: '#545b64', marginBottom: 4 }}>制限時間</div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{config.timeLimitMin}<span style={{ fontSize: 11, fontWeight: 400, marginLeft: 2 }}>分</span></div>
              </div>
              <div style={{ background: 'white', padding: '10px 12px' }}>
                <div style={{ fontSize: 11, color: '#545b64', marginBottom: 4 }}>合格スコア</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#037f0c' }}>{passScore}</div>
              </div>
            </div>
          </div>

          {/* ── 今回の出題 ── */}
          <div style={{ marginBottom: 20, padding: '14px 16px', background: shortage !== null && shortage > 0 ? '#fdf3f1' : '#fbfbfb', border: `1px solid ${shortage !== null && shortage > 0 ? '#f5a09b' : '#eaeded'}`, borderRadius: 2 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#545b64', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>今回の出題</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: shortage !== null && shortage > 0 ? 8 : 0 }}>
              <span style={{ fontSize: 13, color: '#16191f' }}>
                {selectedDomain || selectedTag ? 'フィルタ後の出題数' : '出題数'}
              </span>
              <span style={{ fontSize: 20, fontWeight: 700, color: '#008c8c' }}>
                {useableCount === null ? '...' : useableCount}
                <span style={{ fontSize: 12, fontWeight: 400, marginLeft: 4 }}>問</span>
              </span>
            </div>
            {shortage !== null && shortage > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: '#d13212', borderRadius: 2 }}>
                <span style={{ fontSize: 12, color: 'white', fontWeight: 700 }}>⚠ {shortage}問不足 — 問題数が本番より少なくなります</span>
              </div>
            )}
            {(selectedDomain || selectedTag) && (
              <div style={{ fontSize: 11, color: '#545b64', marginTop: 6 }}>
                {selectedDomain && <span style={{ marginRight: 8 }}>ドメイン: {selectedDomain}</span>}
                {selectedTag && <span>タグ: {selectedTag}</span>}
              </div>
            )}
          </div>

          {/* ── 出題範囲と比率 ── */}
          <div style={{ borderTop: '1px solid #eaeded', paddingTop: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#545b64', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12 }}>出題範囲と比率</div>
            {EXAM_CATEGORIES[examType].map(cat => (
              <div key={cat.name} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                  <span style={{
                    color: selectedDomain === cat.name ? '#008c8c' : '#16191f',
                    fontWeight: selectedDomain === cat.name ? 700 : 400,
                  }}>{cat.name}</span>
                  <span style={{ fontWeight: 700, color: '#008c8c', flexShrink: 0, marginLeft: 8 }}>{cat.ratio}</span>
                </div>
                <div style={{ background: '#eaeded', borderRadius: 10, height: 4 }}>
                  <div style={{ background: selectedDomain === cat.name ? '#008c8c' : '#879596', borderRadius: 10, height: 4, width: cat.ratio }} />
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
