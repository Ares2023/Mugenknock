import React, { useState, useEffect, useCallback } from 'react';
import { API_ENDPOINT, EXAM_TYPES, EXAM_DOMAINS } from '../constants';

type Question = {
  questionId: string;
  examType: string;
  domain?: string;
  questionText: string;
  choices: string[];
  correctAnswers: string[];
  explanation: string;
  tags: string[];
  isMultiple: boolean;
};

type Report = {
  questionId: string;
  reportId: string;
  userId: string;
  message: string;
  reportedAt: string;
};

type Tip = {
  tipId: string;
  examType: string;
  title: string;
  content: string;
};

type ImportQuestion = {
  examType?: string;
  domain?: string;
  questionText: string;
  choices: string[];
  correctAnswers: string[];
  explanation?: string;
  isMultiple?: boolean;
  tags?: string[];
};

type Tab = 'questions' | 'reports' | 'tips' | 'import';

export default function Admin() {
  const [tab, setTab] = useState<Tab>('questions');

  // 問題管理
  const [questions, setQuestions] = useState<Question[]>([]);
  const [examFilter, setExamFilter] = useState('ALL');
  const [tagFilter, setTagFilter] = useState('');
  const [domainFilter, setDomainFilter] = useState('');
  const [keyword, setKeyword] = useState('');
  const [loadingQ, setLoadingQ] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // 通報
  const [reports, setReports] = useState<Report[]>([]);
  const [loadingR, setLoadingR] = useState(false);

  // 問題インポート
  const [importExamType, setImportExamType] = useState('SAA');
  const [importTags, setImportTags] = useState('');
  const [importJson, setImportJson] = useState('');
  const [importParsed, setImportParsed] = useState<ImportQuestion[] | null>(null);
  const [importError, setImportError] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ count: number; ids: string[] } | null>(null);
  const [promptTopic, setPromptTopic] = useState('');
  const [promptCount, setPromptCount] = useState('5');
  const [promptCopied, setPromptCopied] = useState(false);

  // コラム管理
  const [tips, setTips] = useState<Tip[]>([]);
  const [loadingT, setLoadingT] = useState(false);
  const [editingTip, setEditingTip] = useState<Tip | null>(null);
  const [tipForm, setTipForm] = useState({ examType: 'ALL', title: '', content: '' });
  const [showTipForm, setShowTipForm] = useState(false);

  const fetchQuestions = useCallback(async () => {
    setLoadingQ(true);
    try {
      const params = new URLSearchParams();
      if (examFilter !== 'ALL') params.set('examType', examFilter);
      if (keyword.trim()) params.set('keyword', keyword.trim());
      if (tagFilter.trim()) params.set('tag', tagFilter.trim());
      if (domainFilter) params.set('domain', domainFilter);
      const res = await fetch(`${API_ENDPOINT}/admin/questions?${params}`);
      const data = await res.json();
      setQuestions(data.items || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingQ(false);
    }
  }, [examFilter, keyword, tagFilter, domainFilter]);

  const fetchReports = useCallback(async () => {
    setLoadingR(true);
    try {
      const res = await fetch(`${API_ENDPOINT}/admin/reports`);
      const data = await res.json();
      setReports(data.items || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingR(false);
    }
  }, []);

  const fetchTips = useCallback(async () => {
    setLoadingT(true);
    try {
      const res = await fetch(`${API_ENDPOINT}/admin/tips`);
      const data = await res.json();
      setTips(data.items || []);
    } catch (err) { console.error(err); } finally { setLoadingT(false); }
  }, []);

  useEffect(() => { fetchQuestions(); }, [examFilter, tagFilter, domainFilter]);
  useEffect(() => { if (tab === 'reports') fetchReports(); }, [tab]);
  useEffect(() => { if (tab === 'tips') fetchTips(); }, [tab]);

  const handleSaveTip = async () => {
    if (!tipForm.title.trim() || !tipForm.content.trim()) return;
    try {
      if (editingTip) {
        await fetch(`${API_ENDPOINT}/admin/tips/${editingTip.tipId}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(tipForm)
        });
      } else {
        await fetch(`${API_ENDPOINT}/admin/tips`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(tipForm)
        });
      }
      setShowTipForm(false);
      setEditingTip(null);
      setTipForm({ examType: 'ALL', title: '', content: '' });
      fetchTips();
    } catch (err) { console.error(err); }
  };

  const handleDeleteTip = async (tip: Tip) => {
    if (!window.confirm(`「${tip.title}」を削除しますか？`)) return;
    try {
      await fetch(`${API_ENDPOINT}/admin/tips/${tip.tipId}`, { method: 'DELETE' });
      setTips(prev => prev.filter(t => t.tipId !== tip.tipId));
    } catch (err) { console.error(err); }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchQuestions();
  };

  const handleDelete = async (q: Question) => {
    if (!window.confirm(`「${q.questionId}」を削除しますか？\n\n${q.questionText.slice(0, 60)}…`)) return;
    setDeletingId(q.questionId);
    try {
      const res = await fetch(`${API_ENDPOINT}/questions/${q.questionId}`, { method: 'DELETE' });
      if (res.ok) {
        setQuestions(prev => prev.filter(item => item.questionId !== q.questionId));
        if (expandedId === q.questionId) setExpandedId(null);
      } else {
        alert('削除に失敗しました');
      }
    } catch (err) {
      alert('削除に失敗しました');
    } finally {
      setDeletingId(null);
    }
  };

  const tabStyle = (t: Tab) => ({
    padding: '10px 24px',
    border: 'none',
    borderBottom: tab === t ? '3px solid #0073bb' : '3px solid transparent',
    background: 'none',
    cursor: 'pointer',
    fontWeight: (tab === t ? 700 : 400) as any,
    color: tab === t ? '#16191f' : '#545b64',
    fontSize: 15,
  });

  const AWS_TAG_BG = '#232f3e';

  const examBadge = (type: string) => (
    <span style={{
      background: AWS_TAG_BG,
      color: 'white', fontSize: 11, padding: '2px 8px', borderRadius: 12, marginRight: 8, fontWeight: 700
    }}>{type}</span>
  );

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 40px', color: '#16191f' }}>
      <h2 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 24px' }}>管理画面</h2>

      {/* タブ */}
      <div style={{ borderBottom: '1px solid #eaeded', marginBottom: 24 }}>
        <button style={tabStyle('questions')} onClick={() => setTab('questions')}>問題管理</button>
        <button style={tabStyle('import')} onClick={() => setTab('import')}>問題追加</button>
        <button style={tabStyle('reports')} onClick={() => setTab('reports')}>通報確認</button>
        <button style={tabStyle('tips')} onClick={() => setTab('tips')}>コラム管理</button>
      </div>

      {/* ── 問題管理 ── */}
      {tab === 'questions' && (
        <div>
          {/* 検索バー */}
          <form onSubmit={handleSearch} style={{ marginBottom: 16 }}>
            {/* 試験種別 */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
              {['ALL', ...EXAM_TYPES].map(type => (
                <button key={type} type="button" onClick={() => { setExamFilter(type); setDomainFilter(''); }}
                  style={{
                    padding: '6px 16px', border: '1px solid', borderRadius: 2, cursor: 'pointer',
                    background: examFilter === type ? '#f2f8fd' : 'white',
                    color: examFilter === type ? '#0073bb' : '#545b64',
                    borderColor: examFilter === type ? '#0073bb' : '#d1d5db',
                    fontWeight: examFilter === type ? 700 : 400, fontSize: 14
                  }}>
                  {type}
                </button>
              ))}
            </div>

            {/* ドメインフィルタ（試験種別が選択されている場合のみ） */}
            {examFilter !== 'ALL' && (
              <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
                <button type="button" onClick={() => setDomainFilter('')}
                  style={{ padding: '4px 10px', border: '1px solid', borderRadius: 2, cursor: 'pointer', fontSize: 12,
                    background: domainFilter === '' ? '#f2f8fd' : 'white',
                    color: domainFilter === '' ? '#0073bb' : '#545b64',
                    borderColor: domainFilter === '' ? '#0073bb' : '#d1d5db',
                    fontWeight: domainFilter === '' ? 700 : 400 }}>
                  全ドメイン
                </button>
                {EXAM_DOMAINS[examFilter]?.map(d => (
                  <button key={d} type="button" onClick={() => setDomainFilter(domainFilter === d ? '' : d)}
                    style={{ padding: '4px 10px', border: '1px solid', borderRadius: 2, cursor: 'pointer', fontSize: 12,
                      background: domainFilter === d ? '#f2f8fd' : 'white',
                      color: domainFilter === d ? '#0073bb' : '#545b64',
                      borderColor: domainFilter === d ? '#0073bb' : '#d1d5db',
                      fontWeight: domainFilter === d ? 700 : 400 }}>
                    {d}
                  </button>
                ))}
              </div>
            )}

            {/* キーワード・タグ・検索ボタン */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input
                value={keyword} onChange={e => setKeyword(e.target.value)}
                placeholder="問題ID・問題文で検索"
                style={{ flex: 2, minWidth: 180, padding: '6px 12px', border: '1px solid #d1d5db', borderRadius: 2, fontSize: 14, outline: 'none' }}
                onFocus={e => e.currentTarget.style.borderColor = '#0073bb'}
                onBlur={e => e.currentTarget.style.borderColor = '#d1d5db'}
              />
              <input
                value={tagFilter} onChange={e => setTagFilter(e.target.value)}
                placeholder="タグで絞り込み（例: S3）"
                style={{ flex: 1, minWidth: 140, padding: '6px 12px', border: '1px solid #d1d5db', borderRadius: 2, fontSize: 14, outline: 'none' }}
                onFocus={e => e.currentTarget.style.borderColor = '#0073bb'}
                onBlur={e => e.currentTarget.style.borderColor = '#d1d5db'}
              />
              <button type="submit"
                style={{ padding: '6px 20px', background: 'white', color: '#0073bb', border: '1px solid #0073bb', borderRadius: 2, cursor: 'pointer', fontWeight: 700, fontSize: 14 }}>
                検索
              </button>
            </div>
          </form>

          {/* 件数 */}
          <p style={{ color: '#545b64', fontSize: 13, marginBottom: 12 }}>
            {loadingQ ? '読み込み中...' : `${questions.length} 件`}
          </p>

          {/* 問題リスト */}
          {questions.map(q => (
            <div key={q.questionId} style={{ border: '1px solid #eaeded', borderRadius: 2, marginBottom: 8, overflow: 'hidden', boxShadow: '0 1px 1px 0 rgba(0,28,36,0.1)' }}>
              {/* ヘッダー行 */}
              <div
                onClick={() => setExpandedId(expandedId === q.questionId ? null : q.questionId)}
                style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', cursor: 'pointer', background: expandedId === q.questionId ? '#fbfbfb' : 'white', gap: 12 }}>
                <span style={{ color: '#545b64', fontSize: 12, flexShrink: 0 }}>{expandedId === q.questionId ? '▼' : '▶'}</span>
                {examBadge(q.examType)}
                <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#545b64', flexShrink: 0, minWidth: 100 }}>{q.questionId}</span>
                <span style={{ fontSize: 14, color: '#16191f', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {q.questionText}
                </span>
                <button
                  onClick={e => { e.stopPropagation(); handleDelete(q); }}
                  disabled={deletingId === q.questionId}
                  style={{
                    padding: '4px 12px',
                    background: 'white',
                    color: deletingId === q.questionId ? '#aab7b8' : '#d13212',
                    border: `1px solid ${deletingId === q.questionId ? '#eaeded' : '#d13212'}`,
                    borderRadius: 2,
                    cursor: deletingId === q.questionId ? 'default' : 'pointer',
                    fontSize: 12,
                    fontWeight: 700,
                    flexShrink: 0
                  }}>
                  {deletingId === q.questionId ? '削除中...' : '削除'}
                </button>
              </div>

              {/* 展開詳細 */}
              {expandedId === q.questionId && (
                <div style={{ padding: '14px 16px', borderTop: '1px solid #e8e8e8', background: '#fafafa', fontSize: 13 }}>
                  <p style={{ fontWeight: 'bold', marginTop: 0 }}>{q.questionText}</p>
                  {q.isMultiple && <p style={{ color: '#5a9fd4', fontSize: 12 }}>複数選択</p>}

                  <div style={{ marginBottom: 12 }}>
                    {q.choices.map((c, i) => {
                      const isCorrect = q.correctAnswers?.includes(c);
                      return (
                        <div key={i} style={{
                          padding: '6px 10px', marginBottom: 4, borderRadius: 4,
                          background: isCorrect ? '#eafaf1' : '#f5f5f5',
                          border: `1px solid ${isCorrect ? '#27ae60' : '#e0e0e0'}`,
                          color: isCorrect ? '#27ae60' : '#333',
                        }}>
                          {isCorrect ? '✓ ' : ''}{c}
                        </div>
                      );
                    })}
                  </div>

                  <div style={{ background: '#f0f8ff', borderRadius: 4, padding: '10px 12px', marginBottom: 10, color: '#555', lineHeight: 1.6 }}>
                    <strong>解説：</strong>{q.explanation}
                  </div>

                  {q.domain && (
                    <div style={{ fontSize: 12, color: '#545b64', marginBottom: 4 }}>
                      ドメイン: <span style={{ fontWeight: 700 }}>{q.domain}</span>
                    </div>
                  )}
                  <div style={{ color: '#888', fontSize: 12 }}>
                    タグ: {q.tags?.length ? q.tags.map(t => (
                      <span key={t} style={{ display: 'inline-block', background: '#f2f3f3', border: '1px solid #d1d5db', borderRadius: 2, padding: '1px 6px', marginRight: 4, fontSize: 11 }}>{t}</span>
                    )) : 'なし'}
                  </div>
                </div>
              )}
            </div>
          ))}

          {!loadingQ && questions.length === 0 && (
            <p style={{ color: '#aaa', textAlign: 'center', padding: 40 }}>問題が見つかりません</p>
          )}
        </div>
      )}

      {/* ── 通報確認 ── */}
      {tab === 'reports' && (
        <div>
          <p style={{ color: '#888', fontSize: 13, marginBottom: 16 }}>
            {loadingR ? '読み込み中...' : `${reports.length} 件`}
          </p>

          {reports.map(r => (
            <div key={r.reportId} style={{ border: '1px solid #e0e0e0', borderRadius: 8, padding: '14px 16px', marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div>
                  <span style={{ fontFamily: 'monospace', fontSize: 12, background: '#f5f5f5', padding: '2px 8px', borderRadius: 4, color: '#555' }}>
                    {r.questionId}
                  </span>
                  <span style={{ fontSize: 12, color: '#aaa', marginLeft: 12 }}>
                    {new Date(r.reportedAt).toLocaleString('ja-JP')}
                  </span>
                </div>
                <button
                  onClick={() => {
                    setTab('questions');
                    setKeyword(r.questionId);
                    setTimeout(() => fetchQuestions(), 100);
                  }}
                  style={{ fontSize: 12, padding: '3px 10px', border: '1px solid #ccc', borderRadius: 4, cursor: 'pointer', background: 'white', color: '#555' }}>
                  問題を確認
                </button>
              </div>
              <p style={{ margin: '0 0 6px', color: '#333' }}>{r.message || '（メッセージなし）'}</p>
              <p style={{ margin: 0, fontSize: 12, color: '#aaa' }}>通報者: {r.userId}</p>
            </div>
          ))}

          {!loadingR && reports.length === 0 && (
            <p style={{ color: '#aaa', textAlign: 'center', padding: 40 }}>通報はありません</p>
          )}
        </div>
      )}

      {/* ── 問題追加 ── */}
      {tab === 'import' && (() => {
        const EXAMPLE = JSON.stringify([
          {
            examType: "SAA",
            domain: "セキュアなアーキテクチャの設計",
            questionText: "Amazon S3バケットへのアクセスを特定のVPCからのみに制限するために使用すべきものはどれですか？",
            choices: ["A. バケットACL", "B. S3バケットポリシーとVPCエンドポイント", "C. IAMユーザーポリシー", "D. セキュリティグループ"],
            correctAnswers: ["B. S3バケットポリシーとVPCエンドポイント"],
            explanation: "VPCエンドポイントを使用しS3バケットポリシーでaws:sourceVpceを条件にすることでVPC外からのアクセスを制限できます。",
            tags: ["S3", "VPC", "セキュリティ"],
            isMultiple: false
          }
        ], null, 2);

        const handleParse = () => {
          setImportError('');
          setImportParsed(null);
          setImportResult(null);
          try {
            const parsed = JSON.parse(importJson);
            if (!Array.isArray(parsed)) throw new Error('配列形式にしてください');
            for (const q of parsed) {
              if (!q.questionText) throw new Error('questionText が必要です');
              if (!Array.isArray(q.choices) || q.choices.length < 2) throw new Error('choices は2つ以上必要です');
              if (!Array.isArray(q.correctAnswers) || q.correctAnswers.length === 0) throw new Error('correctAnswers が必要です');
            }
            setImportParsed(parsed);
          } catch (e: any) {
            setImportError(e.message || 'JSONの形式が正しくありません');
          }
        };

        const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = ev => {
            setImportJson(ev.target?.result as string);
            setImportParsed(null);
            setImportResult(null);
            setImportError('');
          };
          reader.readAsText(file);
          e.target.value = '';
        };

        const handleImport = async () => {
          if (!importParsed) return;
          setImporting(true);
          setImportResult(null);
          try {
            const tags = importTags.split(',').map(t => t.trim()).filter(Boolean);
            const res = await fetch(`${API_ENDPOINT}/admin/questions`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ examType: importExamType, tags, questions: importParsed })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || '失敗しました');
            setImportResult({ count: data.count, ids: data.created });
            setImportJson('');
            setImportParsed(null);
          } catch (e: any) {
            setImportError(e.message);
          } finally {
            setImporting(false);
          }
        };

        return (
          <div>
            {/* 設定 */}
            <div style={{ display: 'flex', gap: 24, marginBottom: 20, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>試験種別</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {EXAM_TYPES.map(t => (
                    <button key={t} onClick={() => setImportExamType(t)}
                      style={{ padding: '6px 16px', border: 'none', borderRadius: 4, cursor: 'pointer',
                        background: importExamType === t ? '#0073bb' : '#eee',
                        color: importExamType === t ? 'white' : '#333',
                        fontWeight: importExamType === t ? 'bold' : 'normal' }}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>タグ（カンマ区切り・任意）</div>
                <input value={importTags} onChange={e => setImportTags(e.target.value)}
                  placeholder="例: EC2, VPC, セキュリティ"
                  style={{ width: '100%', padding: '7px 10px', border: '1px solid #ddd', borderRadius: 4, fontSize: 14, boxSizing: 'border-box' }} />
              </div>
            </div>

            {/* JSON入力 */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <div style={{ fontSize: 12, color: '#888' }}>JSONを貼り付けまたはファイルをアップロード</div>
                <label style={{ padding: '5px 12px', background: '#eee', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>
                  ファイルを選択
                  <input type="file" accept=".json" onChange={handleFileUpload} style={{ display: 'none' }} />
                </label>
              </div>
              <textarea value={importJson} onChange={e => { setImportJson(e.target.value); setImportParsed(null); setImportResult(null); setImportError(''); }}
                placeholder={EXAMPLE}
                rows={12}
                style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: 6,
                  fontSize: 13, fontFamily: 'monospace', resize: 'vertical', boxSizing: 'border-box',
                  background: '#fafafa' }} />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
              <button onClick={handleParse} disabled={!importJson.trim()}
                style={{ padding: '8px 20px', background: importJson.trim() ? '#555' : '#ccc',
                  color: 'white', border: 'none', borderRadius: 4, cursor: importJson.trim() ? 'pointer' : 'default' }}>
                構文チェック
              </button>
              {importParsed && (
                <button onClick={handleImport} disabled={importing}
                  style={{ padding: '8px 24px', background: importing ? '#ccc' : '#0073bb',
                    color: 'white', border: 'none', borderRadius: 4, cursor: importing ? 'default' : 'pointer', fontWeight: 'bold' }}>
                  {importing ? 'インポート中...' : `${importParsed.length}件をインポート`}
                </button>
              )}
            </div>

            {importParsed && !importResult && (
              <div style={{ marginBottom: 16, padding: '10px 14px', background: '#eaf3fa', borderRadius: 6, fontSize: 13, color: '#0056a3' }}>
                ✓ {importParsed.length}件の問題を認識しました。「{importExamType}」としてインポートします。
              </div>
            )}
            {importError && (
              <div style={{ marginBottom: 16, padding: '10px 14px', background: '#fdf2f2', borderRadius: 6, fontSize: 13, color: '#e74c3c' }}>
                エラー: {importError}
              </div>
            )}
            {importResult && (
              <div style={{ marginBottom: 16, padding: '14px 16px', background: '#eafaf1', border: '1px solid #a8e6c1', borderRadius: 6 }}>
                <div style={{ fontWeight: 'bold', color: '#27ae60', marginBottom: 6 }}>✓ {importResult.count}件をインポートしました</div>
                <div style={{ fontSize: 12, color: '#555', fontFamily: 'monospace' }}>{importResult.ids.join(', ')}</div>
              </div>
            )}

            <hr style={{ border: 'none', borderTop: '1px solid #e0e0e0', marginBottom: 20 }} />

            {/* AIプロンプト生成 */}
            {(() => {
              const EXAM_FULL: Record<string, string> = {
                CLF: 'AWS Certified Cloud Practitioner (CLF-C02)',
                SAA: 'AWS Certified Solutions Architect – Associate (SAA-C03)',
                SAP: 'AWS Certified Solutions Architect – Professional (SAP-C02)',
              };
              const topic = promptTopic.trim() || '（トピックを入力してください）';
              const count = parseInt(promptCount) || 5;
              const EXAM_DOMAIN_LIST = {
                CLF: ['クラウドのコンセプト', 'セキュリティとコンプライアンス', 'クラウドテクノロジーとサービス', '請求・料金・サポート'],
                SAA: ['セキュアなアーキテクチャの設計', '弾力性に優れたアーキテクチャの設計', '高パフォーマンスなアーキテクチャの設計', 'コスト最適化されたアーキテクチャの設計'],
                SAP: ['組織の複雑さに対応したソリューションの設計', '新しいソリューションの設計', '既存ソリューションの継続的改善', 'ワークロードの移行とモダナイゼーション'],
              } as Record<string, string[]>;
              const prompt = `あなたはAWS認定試験の問題作成の専門家です。
以下の条件に従い、試験問題を${count}問作成し、JSON配列のみを出力してください（前後の説明文は不要）。

【試験】${EXAM_FULL[importExamType]}
【トピック】${topic}

【作問ルール】
・選択肢は必ず4つ（A. B. C. D. の形式）
・単一正解の場合は isMultiple: false、複数正解は isMultiple: true
・correctAnswers の文字列は choices の文字列と完全一致させること
・解説は「正解の理由」と「各不正解の理由」を含めること（150字以上）
・本番試験と同等の難易度・文体で作成すること
・examType には "${importExamType}" を必ず設定すること
・domain には以下のいずれかを設定すること: ${EXAM_DOMAIN_LIST[importExamType]?.join(' / ')}
・tags 配列には関連するAWSサービス名のみを入れること（例: "S3", "IAM", "EC2"）

【出力形式】
[
  {
    "examType": "${importExamType}",
    "domain": "（上記ドメインのいずれか）",
    "questionText": "問題文",
    "choices": ["A. 選択肢1", "B. 選択肢2", "C. 選択肢3", "D. 選択肢4"],
    "correctAnswers": ["A. 選択肢1"],
    "explanation": "解説文",
    "isMultiple": false,
    "tags": ["関連AWSサービス名"]
  }
]`;

              const copyPrompt = () => {
                navigator.clipboard.writeText(prompt);
                setPromptCopied(true);
                setTimeout(() => setPromptCopied(false), 2000);
              };

              return (
                <div style={{ marginBottom: 16, background: '#f8f9fa', border: '1px solid #e0e0e0', borderRadius: 8, padding: '16px' }}>
                  <div style={{ fontWeight: 'bold', fontSize: 14, color: '#232f3e', marginBottom: 12 }}>AIプロンプト生成</div>

                  <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>トピック / サービス名</div>
                      <input value={promptTopic} onChange={e => setPromptTopic(e.target.value)}
                        placeholder="例: S3のセキュリティ、EC2のネットワーク"
                        style={{ width: '100%', padding: '7px 10px', border: '1px solid #ddd', borderRadius: 4, fontSize: 14, boxSizing: 'border-box' }} />
                    </div>
                    <div style={{ width: 80 }}>
                      <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>問題数</div>
                      <input type="number" value={promptCount} onChange={e => setPromptCount(e.target.value)}
                        min={1} max={20}
                        style={{ width: '100%', padding: '7px 10px', border: '1px solid #ddd', borderRadius: 4, fontSize: 14, boxSizing: 'border-box' }} />
                    </div>
                  </div>

                  <div style={{ position: 'relative' }}>
                    <pre style={{ background: 'white', border: '1px solid #ddd', borderRadius: 6, padding: '12px 14px',
                      fontSize: 12, fontFamily: 'monospace', whiteSpace: 'pre-wrap', margin: 0,
                      color: '#333', lineHeight: 1.6, maxHeight: 260, overflowY: 'auto' }}>
                      {prompt}
                    </pre>
                    <button onClick={copyPrompt}
                      style={{ position: 'absolute', top: 8, right: 8,
                        padding: '4px 12px', fontSize: 12, borderRadius: 4, border: 'none', cursor: 'pointer',
                        background: promptCopied ? '#27ae60' : '#0073bb', color: 'white', transition: 'background 0.2s' }}>
                      {promptCopied ? '✓ コピー済み' : 'コピー'}
                    </button>
                  </div>
                  <div style={{ fontSize: 11, color: '#aaa', marginTop: 6 }}>
                    このプロンプトをChatGPT / Claude / Gemini に貼り付け → 出力JSONをそのまま上のテキストエリアへ
                  </div>
                </div>
              );
            })()}
          </div>
        );
      })()}

      {/* ── コラム管理 ── */}
      {tab === 'tips' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <p style={{ color: '#888', fontSize: 13, margin: 0 }}>
              {loadingT ? '読み込み中...' : `${tips.length} 件`}
            </p>
            <button onClick={() => { setEditingTip(null); setTipForm({ examType: 'ALL', title: '', content: '' }); setShowTipForm(true); }}
              style={{ padding: '7px 18px', background: '#0073bb', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 13 }}>
              ＋ コラムを追加
            </button>
          </div>

          {/* フォーム */}
          {showTipForm && (
            <div style={{ border: '1px solid #e0e0e0', borderRadius: 8, padding: 20, marginBottom: 20, background: '#fafafa' }}>
              <h4 style={{ margin: '0 0 14px', color: '#232f3e' }}>{editingTip ? 'コラムを編集' : '新規コラム'}</h4>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                {['ALL', 'CLF', 'SAA', 'SAP'].map(t => (
                  <button key={t} type="button" onClick={() => setTipForm(f => ({ ...f, examType: t }))}
                    style={{ padding: '5px 12px', border: 'none', borderRadius: 4, cursor: 'pointer',
                      background: tipForm.examType === t ? '#232f3e' : '#eee',
                      color: tipForm.examType === t ? 'white' : '#333',
                      fontWeight: tipForm.examType === t ? 'bold' : 'normal' }}>
                    {t}
                  </button>
                ))}
              </div>
              <input
                value={tipForm.title}
                onChange={e => setTipForm(f => ({ ...f, title: e.target.value }))}
                placeholder="タイトル"
                style={{ width: '100%', padding: '7px 10px', border: '1px solid #ddd', borderRadius: 4, fontSize: 14, marginBottom: 8, boxSizing: 'border-box' }}
              />
              <textarea
                value={tipForm.content}
                onChange={e => setTipForm(f => ({ ...f, content: e.target.value }))}
                placeholder="内容"
                rows={4}
                style={{ width: '100%', padding: '7px 10px', border: '1px solid #ddd', borderRadius: 4, fontSize: 14, resize: 'vertical', boxSizing: 'border-box' }}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button onClick={handleSaveTip}
                  style={{ padding: '7px 20px', background: '#232f3e', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                  保存
                </button>
                <button onClick={() => { setShowTipForm(false); setEditingTip(null); }}
                  style={{ padding: '7px 16px', border: '1px solid #ccc', borderRadius: 4, cursor: 'pointer', background: 'white' }}>
                  キャンセル
                </button>
              </div>
            </div>
          )}

          {/* コラム一覧 */}
          {tips.map(tip => (
            <div key={tip.tipId} style={{ border: '1px solid #e0e0e0', borderRadius: 8, padding: '12px 16px', marginBottom: 8, background: 'white' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <span style={{
                  background: tip.examType === 'SAP' ? '#8e44ad' : tip.examType === 'SAA' ? '#2980b9' : tip.examType === 'CLF' ? '#27ae60' : '#888',
                  color: 'white', fontSize: 11, padding: '2px 7px', borderRadius: 4, flexShrink: 0, marginTop: 2,
                }}>{tip.examType}</span>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: '0 0 4px', fontWeight: 'bold', fontSize: 14 }}>{tip.title}</p>
                  <p style={{ margin: 0, fontSize: 13, color: '#555', lineHeight: 1.6 }}>{tip.content}</p>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button onClick={() => { setEditingTip(tip); setTipForm({ examType: tip.examType, title: tip.title, content: tip.content }); setShowTipForm(true); }}
                    style={{ padding: '4px 10px', border: '1px solid #ccc', borderRadius: 4, cursor: 'pointer', background: 'white', fontSize: 12 }}>
                    編集
                  </button>
                  <button onClick={() => handleDeleteTip(tip)}
                    style={{ padding: '4px 10px', background: '#e74c3c', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>
                    削除
                  </button>
                </div>
              </div>
            </div>
          ))}

          {!loadingT && tips.length === 0 && (
            <p style={{ color: '#aaa', textAlign: 'center', padding: 40 }}>コラムはありません</p>
          )}
        </div>
      )}
    </div>
  );
}
