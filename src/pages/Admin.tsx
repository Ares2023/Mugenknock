import React, { useState, useEffect, useCallback } from 'react';
import { fetchAuthSession } from 'aws-amplify/auth';
import { API_ENDPOINT, EXAM_TYPES, EXAM_DOMAINS } from '../constants';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';

const adminFetch = async (url: string, options: RequestInit = {}): Promise<Response> => {
  const session = await fetchAuthSession();
  const token = session.tokens?.idToken?.toString();
  return fetch(url, {
    ...options,
    headers: {
      ...(options.headers as Record<string, string> ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
};

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
  updatedAt?: string;
};

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
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

type Release = {
  releaseId: string;
  date: string;
  title: string;
  body: string;
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

type Tab = 'questions' | 'reports' | 'tips' | 'import' | 'releases' | 'scan' | 'messages';

type ContactMessage = {
  messageId: string;
  subject: string;
  message: string;
  userId: string;
  sentAt: string;
};

type FlaggedQuestion = {
  questionId: string;
  examType: string;
  questionText: string;
  choices?: string[];
  correctAnswers?: string[];
  explanation?: string;
  domain?: string;
  tags?: string[];
  isMultiple?: boolean;
  validityRating?: number;
  validityNote?: string;
  validityCheckedAt?: string;
  isHidden?: boolean;
};

type EditForm = {
  examType: string;
  domain: string;
  questionText: string;
  questionTextEn: string;
  choices: string[];
  choicesEn: string[];
  correctAnswers: string[];
  explanation: string;
  explanationEn: string;
  tags: string;
  isMultiple: boolean;
};

export default function Admin() {
  const [tab, setTab] = useState<Tab>('questions');
  const [adminError, setAdminError] = useState<string | null>(null);

  // 問題管理
  const [questions, setQuestions] = useState<Question[]>([]);
  const [examFilter, setExamFilter] = useState('ALL');
  const [tagFilter, setTagFilter] = useState('');
  const [domainFilter, setDomainFilter] = useState('');
  const [keyword, setKeyword] = useState('');
  const [loadingQ, setLoadingQ] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

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
  const [tipImportJson, setTipImportJson] = useState('');
  const [tipImportParsed, setTipImportParsed] = useState<{ examType?: string; title: string; content: string }[] | null>(null);
  const [tipImportError, setTipImportError] = useState('');
  const [tipImporting, setTipImporting] = useState(false);
  const [tipImportResult, setTipImportResult] = useState<number | null>(null);
  const [tipImportExamType, setTipImportExamType] = useState('ALL');
  const [showTipImport, setShowTipImport] = useState(false);
  const [tipPromptTopic, setTipPromptTopic] = useState('');
  const [tipPromptCount, setTipPromptCount] = useState('5');
  const [tipPromptExamType, setTipPromptExamType] = useState('SAA');
  const [tipPromptCopied, setTipPromptCopied] = useState(false);
  const [showTipPrompt, setShowTipPrompt] = useState(false);

  // メッセージ
  const [messages, setMessages] = useState<ContactMessage[]>([]);
  const [loadingMsg, setLoadingMsg] = useState(false);

  // リリースノート管理
  const [releases, setReleases] = useState<Release[]>([]);
  const [loadingRel, setLoadingRel] = useState(false);
  const [editingRelease, setEditingRelease] = useState<Release | null>(null);
  const [releaseForm, setReleaseForm] = useState({ date: '', title: '', body: '' });
  const [showReleaseForm, setShowReleaseForm] = useState(false);

  const fetchQuestions = useCallback(async () => {
    setLoadingQ(true);
    setAdminError(null);
    try {
      const params = new URLSearchParams();
      if (examFilter !== 'ALL') params.set('examType', examFilter);
      if (keyword.trim()) params.set('keyword', keyword.trim());
      if (tagFilter.trim()) params.set('tag', tagFilter.trim());
      if (domainFilter) params.set('domain', domainFilter);
      const res = await adminFetch(`${API_ENDPOINT}/admin/questions?${params}`);
      if (res.status === 401 || res.status === 403) {
        setAdminError('管理者アカウントでログインしてください。');
        setQuestions([]);
        return;
      }
      const data = await res.json();
      setQuestions(data.items || []);
    } catch (err) {
      console.error(err);
      setAdminError('APIの接続に失敗しました。');
    } finally {
      setLoadingQ(false);
    }
  }, [examFilter, keyword, tagFilter, domainFilter]);

  const fetchReports = useCallback(async () => {
    setLoadingR(true);
    try {
      const res = await adminFetch(`${API_ENDPOINT}/admin/reports`);
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
      const res = await adminFetch(`${API_ENDPOINT}/admin/tips`);
      const data = await res.json();
      setTips(data.items || []);
    } catch (err) { console.error(err); } finally { setLoadingT(false); }
  }, []);

  const fetchReleases = useCallback(async () => {
    setLoadingRel(true);
    try {
      const res = await adminFetch(`${API_ENDPOINT}/admin/releases`);
      const data = await res.json();
      setReleases(data.items || []);
    } catch (err) { console.error(err); } finally { setLoadingRel(false); }
  }, []);

  const fetchMessages = useCallback(async () => {
    setLoadingMsg(true);
    try {
      const res = await adminFetch(`${API_ENDPOINT}/admin/messages`);
      const data = await res.json();
      setMessages(data.items || []);
    } catch (err) { console.error(err); } finally { setLoadingMsg(false); }
  }, []);

  const handleDeleteMessage = async (m: ContactMessage) => {
    if (!window.confirm('このメッセージを削除しますか？')) return;
    try {
      await adminFetch(`${API_ENDPOINT}/admin/messages/${m.messageId}`, { method: 'DELETE' });
      setMessages(prev => prev.filter(x => x.messageId !== m.messageId));
    } catch (err) { console.error(err); }
  };

  const handleSaveRelease = async () => {
    if (!releaseForm.date || !releaseForm.title.trim() || !releaseForm.body.trim()) return;
    try {
      if (editingRelease) {
        await adminFetch(`${API_ENDPOINT}/admin/releases/${editingRelease.releaseId}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(releaseForm),
        });
      } else {
        await adminFetch(`${API_ENDPOINT}/admin/releases`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(releaseForm),
        });
      }
      setShowReleaseForm(false);
      setEditingRelease(null);
      setReleaseForm({ date: '', title: '', body: '' });
      fetchReleases();
    } catch (err) { console.error(err); }
  };

  const handleDeleteRelease = async (r: Release) => {
    if (!window.confirm(`「${r.title}」を削除しますか？`)) return;
    try {
      await adminFetch(`${API_ENDPOINT}/admin/releases/${r.releaseId}`, { method: 'DELETE' });
      setReleases(prev => prev.filter(x => x.releaseId !== r.releaseId));
    } catch (err) { console.error(err); }
  };

  const [flaggedQuestions, setFlaggedQuestions] = useState<FlaggedQuestion[]>([]);
  const [loadingFlagged, setLoadingFlagged] = useState(false);
  const [validityFilter, setValidityFilter] = useState<'all' | 'flagged' | 'hidden'>('all');
  const [validityTotalCount, setValidityTotalCount] = useState(0);

  // 問題編集
  const EMPTY_EDIT_FORM: EditForm = { examType: 'SAA', domain: '', questionText: '', questionTextEn: '', choices: ['', '', '', ''], choicesEn: ['', '', '', ''], correctAnswers: [], explanation: '', explanationEn: '', tags: '', isMultiple: false };
  const [editingQuestion, setEditingQuestion] = useState<{ id: string } | null>(null);
  const [editForm, setEditForm] = useState<EditForm>(EMPTY_EDIT_FORM);
  const [saving, setSaving] = useState(false);

  const openEdit = (q: Question | FlaggedQuestion) => {
    const choices = (q as Question).choices || (q as FlaggedQuestion).choices || ['', '', '', ''];
    const form: EditForm = {
      examType: q.examType,
      domain: (q as Question).domain || (q as FlaggedQuestion).domain || '',
      questionText: q.questionText,
      questionTextEn: (q as any).questionTextEn || '',
      choices,
      choicesEn: (q as any).choicesEn || choices.map(() => ''),
      correctAnswers: (q as Question).correctAnswers || (q as FlaggedQuestion).correctAnswers || [],
      explanation: (q as Question).explanation || (q as FlaggedQuestion).explanation || '',
      explanationEn: (q as any).explanationEn || '',
      tags: ((q as Question).tags || (q as FlaggedQuestion).tags || []).join(', '),
      isMultiple: (q as Question).isMultiple || (q as FlaggedQuestion).isMultiple || false,
    };
    setEditForm(form);
    setEditingQuestion({ id: q.questionId });
  };

  const handleSaveQuestion = async () => {
    if (!editingQuestion) return;
    setSaving(true);
    try {
      const tags = editForm.tags.split(',').map(t => t.trim()).filter(Boolean);
      const payload: any = { ...editForm, tags, updatedAt: new Date().toISOString() };
      if (!payload.questionTextEn?.trim()) delete payload.questionTextEn;
      if (!payload.explanationEn?.trim()) delete payload.explanationEn;
      const choicesEn = payload.choicesEn?.filter((c: string) => c.trim());
      if (!choicesEn?.length) delete payload.choicesEn;
      const res = await adminFetch(`${API_ENDPOINT}/admin/questions/${editingQuestion.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('保存失敗');
      const updated = { ...payload, tags, questionId: editingQuestion.id };
      setQuestions(prev => prev.map(q => q.questionId === editingQuestion.id ? { ...q, ...updated } : q));
      setFlaggedQuestions(prev => prev.map(q => q.questionId === editingQuestion.id ? { ...q, ...updated } : q));
      setEditingQuestion(null);
    } catch (err) {
      alert('保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const updateChoice = (index: number, value: string) => {
    const oldChoice = editForm.choices[index];
    const newChoices = [...editForm.choices];
    newChoices[index] = value;
    const newCorrect = editForm.correctAnswers.map(c => c === oldChoice ? value : c);
    setEditForm(f => ({ ...f, choices: newChoices, correctAnswers: newCorrect }));
  };

  const fetchFlagged = async (filter: 'all' | 'flagged' | 'hidden' = validityFilter) => {
    setLoadingFlagged(true);
    try {
      const params = filter !== 'all' ? `?filter=${filter}` : '';
      const res = await adminFetch(`${API_ENDPOINT}/admin/questions/flagged${params}`);
      const data = await res.json();
      setFlaggedQuestions(data.items || []);
      setValidityTotalCount(data.totalCount || 0);
    } catch (err) { console.error(err); }
    setLoadingFlagged(false);
  };

  const handleVisibility = async (q: FlaggedQuestion, hide: boolean) => {
    await adminFetch(`${API_ENDPOINT}/admin/questions/${q.questionId}/visibility`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isHidden: hide }),
    });
    setFlaggedQuestions(prev => prev.map(x =>
      x.questionId === q.questionId ? { ...x, isHidden: hide } : x
    ));
  };

  useEffect(() => { fetchQuestions(); setSelectedIds(new Set()); }, [examFilter, tagFilter, domainFilter]);
  useEffect(() => { if (tab === 'reports') fetchReports(); }, [tab]);
  useEffect(() => { if (tab === 'tips') fetchTips(); }, [tab]);
  useEffect(() => { if (tab === 'releases') fetchReleases(); }, [tab]);
  useEffect(() => { if (tab === 'scan') fetchFlagged('all'); }, [tab]);
  useEffect(() => { if (tab === 'messages') fetchMessages(); }, [tab]);

  const handleSaveTip = async () => {
    if (!tipForm.title.trim() || !tipForm.content.trim()) return;
    try {
      if (editingTip) {
        await adminFetch(`${API_ENDPOINT}/admin/tips/${editingTip.tipId}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(tipForm)
        });
      } else {
        await adminFetch(`${API_ENDPOINT}/admin/tips`, {
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
      await adminFetch(`${API_ENDPOINT}/admin/tips/${tip.tipId}`, { method: 'DELETE' });
      setTips(prev => prev.filter(t => t.tipId !== tip.tipId));
    } catch (err) { console.error(err); }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSelectedIds(new Set());
    fetchQuestions();
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds(
      selectedIds.size === questions.length && questions.length > 0
        ? new Set()
        : new Set(questions.map(q => q.questionId))
    );
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`${selectedIds.size}件の問題を削除しますか？\nこの操作は取り消せません。`)) return;
    setBulkDeleting(true);
    try {
      await Promise.all(
        Array.from(selectedIds).map(id =>
          adminFetch(`${API_ENDPOINT}/admin/questions/${id}`, { method: 'DELETE' })
        )
      );
      const deleted = selectedIds;
      setQuestions(prev => prev.filter(q => !deleted.has(q.questionId)));
      if (expandedId && deleted.has(expandedId)) setExpandedId(null);
      setSelectedIds(new Set());
    } catch (err) {
      alert('一部の削除に失敗しました');
    } finally {
      setBulkDeleting(false);
    }
  };

  const handleDelete = async (q: Question) => {
    if (!window.confirm(`「${q.questionId}」を削除しますか？\n\n${q.questionText.slice(0, 60)}…`)) return;
    setDeletingId(q.questionId);
    try {
      const res = await adminFetch(`${API_ENDPOINT}/admin/questions/${q.questionId}`, { method: 'DELETE' });
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

  const tabStyle = (t: Tab): React.CSSProperties => ({
    padding: '10px 24px',
    border: 'none',
    borderBottom: tab === t ? '3px solid var(--color-primary)' : '3px solid transparent',
    background: 'none',
    cursor: 'pointer',
    fontWeight: tab === t ? 700 : 400,
    color: tab === t ? 'var(--color-text-main)' : 'var(--color-text-sub)',
    fontSize: 'var(--font-size-md)',
  });

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: 'var(--spacing-xl) var(--spacing-lg)', color: 'var(--color-text-main)' }} className="admin-container">

      {/* ── 問題編集モーダル ── */}
      {editingQuestion && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: 'var(--spacing-xl) var(--spacing-md)' }}
          onClick={e => { if (e.target === e.currentTarget) setEditingQuestion(null); }}>
          <Card style={{ width: '100%', maxWidth: 780, flexShrink: 0, boxShadow: 'var(--box-shadow-md)' }} padding="var(--spacing-xl)">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-lg)' }}>
              <h3 style={{ margin: 0, fontSize: 'var(--font-size-h3)', fontWeight: 700, color: 'var(--color-text-main)' }}>問題を編集</h3>
              <button onClick={() => setEditingQuestion(null)} style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--color-text-sub)', padding: '4px 8px' }}>✕</button>
            </div>

            {/* 試験種別 */}
            <div style={{ marginBottom: 'var(--spacing-md)' }}>
              <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)', fontWeight: 700, marginBottom: 6 }}>試験種別</div>
              <div style={{ display: 'flex', gap: 'var(--spacing-sm)', flexWrap: 'wrap' }}>
                {EXAM_TYPES.map(t => (
                  <Button
                    key={t}
                    type="button"
                    variant={editForm.examType === t ? 'primary' : 'outline'}
                    size="sm"
                    onClick={() => setEditForm(f => ({ ...f, examType: t }))}
                  >
                    {t}
                  </Button>
                ))}
              </div>
            </div>

            {/* ドメイン */}
            <div style={{ marginBottom: 'var(--spacing-md)' }}>
              <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)', fontWeight: 700, marginBottom: 6 }}>ドメイン</div>
              <input value={editForm.domain} onChange={e => setEditForm(f => ({ ...f, domain: e.target.value }))}
                placeholder="例: セキュアなアーキテクチャの設計"
                style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 'var(--border-radius-md)', fontSize: 'var(--font-size-base)', boxSizing: 'border-box', outline: 'none' }}
                onFocus={e => e.currentTarget.style.borderColor = 'var(--color-primary)'}
                onBlur={e => e.currentTarget.style.borderColor = 'var(--color-border)'} />
            </div>

            {/* 問題文 */}
            <div style={{ marginBottom: 'var(--spacing-md)' }}>
              <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)', fontWeight: 700, marginBottom: 6 }}>問題文（日本語）</div>
              <textarea value={editForm.questionText} onChange={e => setEditForm(f => ({ ...f, questionText: e.target.value }))}
                rows={4}
                style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 'var(--border-radius-md)', fontSize: 'var(--font-size-base)', resize: 'vertical', boxSizing: 'border-box', outline: 'none', lineHeight: 1.6 }}
                onFocus={e => e.currentTarget.style.borderColor = 'var(--color-primary)'}
                onBlur={e => e.currentTarget.style.borderColor = 'var(--color-border)'} />
            </div>

            {/* 問題文（英語） */}
            <div style={{ marginBottom: 'var(--spacing-md)' }}>
              <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)', fontWeight: 700, marginBottom: 6 }}>問題文（English・任意）</div>
              <textarea value={editForm.questionTextEn} onChange={e => setEditForm(f => ({ ...f, questionTextEn: e.target.value }))}
                rows={3} placeholder="English question text (optional)"
                style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 'var(--border-radius-md)', fontSize: 'var(--font-size-base)', resize: 'vertical', boxSizing: 'border-box', outline: 'none', lineHeight: 1.6 }}
                onFocus={e => e.currentTarget.style.borderColor = 'var(--color-primary)'}
                onBlur={e => e.currentTarget.style.borderColor = 'var(--color-border)'} />
            </div>

            {/* 選択肢 */}
            <div style={{ marginBottom: 'var(--spacing-md)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)', fontWeight: 700 }}>選択肢（チェックで正解）</div>
                <Button type="button" variant="outline" size="sm" onClick={() => setEditForm(f => ({ ...f, choices: [...f.choices, ''] }))}>
                  ＋ 追加
                </Button>
              </div>
              {editForm.choices.map((choice, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', marginBottom: 'var(--spacing-xs)' }}>
                  <input type="checkbox"
                    checked={editForm.correctAnswers.includes(choice)}
                    onChange={() => setEditForm(f => ({
                      ...f,
                      correctAnswers: f.correctAnswers.includes(choice)
                        ? f.correctAnswers.filter(c => c !== choice)
                        : [...f.correctAnswers, choice]
                    }))}
                    style={{ width: 16, height: 16, cursor: 'pointer', flexShrink: 0, accentColor: 'var(--color-primary)' }} />
                  <input value={choice} onChange={e => updateChoice(i, e.target.value)}
                    placeholder={`選択肢 ${i + 1}`}
                    style={{ flex: 1, padding: '8px 12px', border: `1px solid ${editForm.correctAnswers.includes(choice) ? 'var(--color-success)' : 'var(--color-border)'}`, borderRadius: 'var(--border-radius-md)', fontSize: 'var(--font-size-sm)',
                      background: editForm.correctAnswers.includes(choice) ? '#f2fcf3' : 'white',
                      color: editForm.correctAnswers.includes(choice) ? 'var(--color-success)' : 'var(--color-text-main)', outline: 'none' }}
                    onFocus={e => { if (!editForm.correctAnswers.includes(choice)) e.currentTarget.style.borderColor = 'var(--color-primary)'; }}
                    onBlur={e => { if (!editForm.correctAnswers.includes(choice)) e.currentTarget.style.borderColor = 'var(--color-border)'; }} />
                  {editForm.choices.length > 2 && (
                    <button type="button" onClick={() => setEditForm(f => ({
                      ...f,
                      choices: f.choices.filter((_, idx) => idx !== i),
                      correctAnswers: f.correctAnswers.filter(c => c !== choice)
                    }))}
                      style={{ fontSize: 16, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--color-text-light)', padding: '0 4px', flexShrink: 0 }}>✕</button>
                  )}
                </div>
              ))}
            </div>

            {/* 選択肢（英語） */}
            <div style={{ marginBottom: 'var(--spacing-md)' }}>
              <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)', fontWeight: 700, marginBottom: 6 }}>選択肢（English・任意）</div>
              {editForm.choices.map((_, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', marginBottom: 'var(--spacing-xs)' }}>
                  <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-light)', width: 20, flexShrink: 0 }}>{i + 1}.</span>
                  <input
                    value={editForm.choicesEn[i] ?? ''}
                    onChange={e => {
                      const next = [...editForm.choicesEn];
                      while (next.length <= i) next.push('');
                      next[i] = e.target.value;
                      setEditForm(f => ({ ...f, choicesEn: next }));
                    }}
                    placeholder={`Choice ${i + 1} in English (optional)`}
                    style={{ flex: 1, padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 'var(--border-radius-md)', fontSize: 'var(--font-size-sm)', outline: 'none' }}
                    onFocus={e => e.currentTarget.style.borderColor = 'var(--color-primary)'}
                    onBlur={e => e.currentTarget.style.borderColor = 'var(--color-border)'} />
                </div>
              ))}
            </div>

            {/* 解説 */}
            <div style={{ marginBottom: 'var(--spacing-md)' }}>
              <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)', fontWeight: 700, marginBottom: 6 }}>解説（日本語）</div>
              <textarea value={editForm.explanation} onChange={e => setEditForm(f => ({ ...f, explanation: e.target.value }))}
                rows={5}
                style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 'var(--border-radius-md)', fontSize: 'var(--font-size-base)', resize: 'vertical', boxSizing: 'border-box', outline: 'none', lineHeight: 1.6 }}
                onFocus={e => e.currentTarget.style.borderColor = 'var(--color-primary)'}
                onBlur={e => e.currentTarget.style.borderColor = 'var(--color-border)'} />
            </div>

            {/* 解説（英語） */}
            <div style={{ marginBottom: 'var(--spacing-md)' }}>
              <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)', fontWeight: 700, marginBottom: 6 }}>解説（English・任意）</div>
              <textarea value={editForm.explanationEn} onChange={e => setEditForm(f => ({ ...f, explanationEn: e.target.value }))}
                rows={4} placeholder="English explanation (optional)"
                style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 'var(--border-radius-md)', fontSize: 'var(--font-size-base)', resize: 'vertical', boxSizing: 'border-box', outline: 'none', lineHeight: 1.6 }}
                onFocus={e => e.currentTarget.style.borderColor = 'var(--color-primary)'}
                onBlur={e => e.currentTarget.style.borderColor = 'var(--color-border)'} />
            </div>

            {/* タグ・複数選択 */}
            <div style={{ display: 'flex', gap: 'var(--spacing-md)', marginBottom: 'var(--spacing-lg)', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)', fontWeight: 700, marginBottom: 6 }}>タグ（カンマ区切り）</div>
                <input value={editForm.tags} onChange={e => setEditForm(f => ({ ...f, tags: e.target.value }))}
                  placeholder="例: S3, IAM, EC2"
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 'var(--border-radius-md)', fontSize: 'var(--font-size-base)', boxSizing: 'border-box', outline: 'none' }}
                  onFocus={e => e.currentTarget.style.borderColor = 'var(--color-primary)'}
                  onBlur={e => e.currentTarget.style.borderColor = 'var(--color-border)'} />
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 4 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', cursor: 'pointer', fontSize: 'var(--font-size-base)', color: 'var(--color-text-main)' }}>
                  <input type="checkbox" checked={editForm.isMultiple} onChange={e => setEditForm(f => ({ ...f, isMultiple: e.target.checked }))}
                    style={{ width: 16, height: 16, accentColor: 'var(--color-primary)' }} />
                  複数選択問題
                </label>
              </div>
            </div>

            {/* ボタン */}
            <div style={{ display: 'flex', gap: 'var(--spacing-sm)', borderTop: '1px solid var(--color-border)', paddingTop: 'var(--spacing-md)' }}>
              <Button onClick={handleSaveQuestion} disabled={saving} variant="primary">
                {saving ? '保存中...' : '保存'}
              </Button>
              <Button onClick={() => setEditingQuestion(null)} variant="outline">
                キャンセル
              </Button>
            </div>
          </Card>
        </div>
      )}

      <h2 style={{ fontSize: 'var(--font-size-xxl)', fontWeight: 700, margin: '0 0 var(--spacing-xl)' }}>管理画面</h2>

      {adminError && (
        <Card padding="var(--spacing-md) var(--spacing-lg)" style={{ background: '#fdf3f1', borderColor: '#f5a09b', marginBottom: 'var(--spacing-xl)', display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)' }}>
          <span style={{ fontSize: 20 }}>⚠️</span>
          <div>
            <div style={{ fontWeight: 700, color: 'var(--color-danger)', fontSize: 'var(--font-size-base)' }}>{adminError}</div>
            <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)', marginTop: 2 }}>
              ヘッダー右上のアイコンからログインし、管理者アカウント（{' '}
              <span style={{ fontFamily: 'monospace' }}>yuzuki2002110@gmail.com</span>
              {' '}）でサインインしてください。
            </div>
          </div>
        </Card>
      )}

      {/* タブ */}
      <div style={{ borderBottom: '1px solid var(--color-border)', marginBottom: 'var(--spacing-xl)' }}>
        <button style={tabStyle('questions')} onClick={() => setTab('questions')}>問題管理</button>
        <button style={tabStyle('import')} onClick={() => setTab('import')}>問題追加</button>
        <button style={tabStyle('reports')} onClick={() => setTab('reports')}>通報確認</button>
        <button style={tabStyle('tips')} onClick={() => setTab('tips')}>コラム管理</button>
        <button style={tabStyle('releases')} onClick={() => setTab('releases')}>リリースノート</button>
        <button style={tabStyle('scan')} onClick={() => setTab('scan')}>スキャン結果</button>
        <button style={tabStyle('messages')} onClick={() => setTab('messages')}>
          メッセージ{messages.length > 0 ? ` (${messages.length})` : ''}
        </button>
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
                    padding: '6px 16px', border: '1px solid', borderRadius: 6, cursor: 'pointer',
                    background: examFilter === type ? '#e0f2f2' : 'white',
                    color: examFilter === type ? '#008c8c' : '#545b64',
                    borderColor: examFilter === type ? '#008c8c' : '#d1d5db',
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
                  style={{ padding: '4px 10px', border: '1px solid', borderRadius: 6, cursor: 'pointer', fontSize: 12,
                    background: domainFilter === '' ? '#e0f2f2' : 'white',
                    color: domainFilter === '' ? '#008c8c' : '#545b64',
                    borderColor: domainFilter === '' ? '#008c8c' : '#d1d5db',
                    fontWeight: domainFilter === '' ? 700 : 400 }}>
                  全ドメイン
                </button>
                {EXAM_DOMAINS[examFilter]?.map(d => (
                  <button key={d} type="button" onClick={() => setDomainFilter(domainFilter === d ? '' : d)}
                    style={{ padding: '4px 10px', border: '1px solid', borderRadius: 6, cursor: 'pointer', fontSize: 12,
                      background: domainFilter === d ? '#e0f2f2' : 'white',
                      color: domainFilter === d ? '#008c8c' : '#545b64',
                      borderColor: domainFilter === d ? '#008c8c' : '#d1d5db',
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
                style={{ flex: 2, minWidth: 180, padding: '6px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, outline: 'none' }}
                onFocus={e => e.currentTarget.style.borderColor = '#008c8c'}
                onBlur={e => e.currentTarget.style.borderColor = '#d1d5db'}
              />
              <input
                value={tagFilter} onChange={e => setTagFilter(e.target.value)}
                placeholder="タグで絞り込み（例: S3）"
                style={{ flex: 1, minWidth: 140, padding: '6px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, outline: 'none' }}
                onFocus={e => e.currentTarget.style.borderColor = '#008c8c'}
                onBlur={e => e.currentTarget.style.borderColor = '#d1d5db'}
              />
              <button type="submit"
                style={{ padding: '6px 20px', background: 'white', color: '#008c8c', border: '1px solid #008c8c', borderRadius: 9999, cursor: 'pointer', fontWeight: 700, fontSize: 14 }}>
                検索
              </button>
            </div>
          </form>

          {/* 件数・一括削除バー */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <p style={{ color: '#545b64', fontSize: 13, margin: 0 }}>
              {loadingQ ? '読み込み中...' : `${questions.length} 件`}
            </p>
            {selectedIds.size > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 13, color: '#008c8c', fontWeight: 700 }}>{selectedIds.size}件選択中</span>
                <button
                  onClick={handleBulkDelete}
                  disabled={bulkDeleting}
                  style={{
                    padding: '6px 16px', fontSize: 13, fontWeight: 700, borderRadius: 9999, cursor: bulkDeleting ? 'default' : 'pointer',
                    background: bulkDeleting ? '#eaeded' : 'white',
                    color: bulkDeleting ? '#aab7b8' : '#d13212',
                    border: `1px solid ${bulkDeleting ? '#eaeded' : '#d13212'}`
                  }}>
                  {bulkDeleting ? '削除中...' : `${selectedIds.size}件を削除`}
                </button>
                <button
                  onClick={() => setSelectedIds(new Set())}
                  style={{ padding: '6px 12px', fontSize: 13, fontWeight: 700, borderRadius: 9999, cursor: 'pointer', background: 'white', color: '#545b64', border: '1px solid #545b64' }}>
                  選択解除
                </button>
              </div>
            )}
          </div>

          {/* 全選択ヘッダー */}
          {questions.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px', background: '#f2f3f3', border: '1px solid #eaeded', borderRadius: 6, marginBottom: 4 }}>
              <input
                type="checkbox"
                checked={selectedIds.size === questions.length}
                onChange={toggleSelectAll}
                style={{ width: 16, height: 16, cursor: 'pointer', flexShrink: 0 }}
              />
              <span style={{ fontSize: 12, color: '#545b64', fontWeight: 700 }}>
                {selectedIds.size === questions.length ? '全選択解除' : '全選択'}
              </span>
            </div>
          )}

          {/* 問題リスト */}
          {questions.map(q => (
            <div key={q.questionId} style={{ border: '1px solid #eaeded', borderRadius: 6, marginBottom: 4, overflow: 'hidden', boxShadow: '0 1px 1px 0 rgba(0,28,36,0.1)', background: selectedIds.has(q.questionId) ? '#e0f2f2' : 'white' }}>
              {/* ヘッダー行 */}
              <div
                onClick={() => setExpandedId(expandedId === q.questionId ? null : q.questionId)}
                style={{ display: 'flex', alignItems: 'center', padding: '10px 16px', cursor: 'pointer', background: selectedIds.has(q.questionId) ? '#e0f2f2' : expandedId === q.questionId ? '#fbfbfb' : 'white', gap: 10 }}>
                <input
                  type="checkbox"
                  checked={selectedIds.has(q.questionId)}
                  onChange={() => toggleSelect(q.questionId)}
                  onClick={e => e.stopPropagation()}
                  style={{ width: 16, height: 16, cursor: 'pointer', flexShrink: 0 }}
                />
                <span style={{ color: '#545b64', fontSize: 12, flexShrink: 0 }}>{expandedId === q.questionId ? '▼' : '▶'}</span>
                <Badge variant="secondary">{q.examType}</Badge>
                <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#545b64', flexShrink: 0, minWidth: 100 }}>{q.questionId}</span>
                <span style={{ fontSize: 14, color: '#16191f', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {q.questionText}
                </span>
                {q.updatedAt && (
                  <span style={{ fontSize: 11, color: '#aab7b8', flexShrink: 0, whiteSpace: 'nowrap' }}>
                    {fmtDate(q.updatedAt)}
                  </span>
                )}
                <button
                  onClick={e => { e.stopPropagation(); openEdit(q); }}
                  style={{ padding: '4px 12px', background: 'white', color: '#545b64', border: '1px solid #545b64', borderRadius: 9999, cursor: 'pointer', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                  編集
                </button>
                <button
                  onClick={e => { e.stopPropagation(); handleDelete(q); }}
                  disabled={deletingId === q.questionId}
                  style={{
                    padding: '4px 12px',
                    background: 'white',
                    color: deletingId === q.questionId ? '#aab7b8' : '#d13212',
                    border: `1px solid ${deletingId === q.questionId ? '#eaeded' : '#d13212'}`,
                    borderRadius: 9999,
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
                          padding: '6px 10px', marginBottom: 4, borderRadius: 6,
                          background: isCorrect ? '#f2fcf3' : '#fbfbfb',
                          border: `1px solid ${isCorrect ? '#037f0c' : '#eaeded'}`,
                          color: isCorrect ? '#037f0c' : '#545b64',
                        }}>
                          {isCorrect ? '✓ ' : ''}{c}
                        </div>
                      );
                    })}
                  </div>

                  <div style={{ background: '#e0f2f2', borderLeft: '4px solid #008c8c', borderRadius: 6, padding: '10px 12px', marginBottom: 10, color: '#16191f', lineHeight: 1.6 }}>
                    <strong>解説：</strong>{q.explanation}
                  </div>

                  {q.domain && (
                    <div style={{ fontSize: 12, color: '#545b64', marginBottom: 4 }}>
                      ドメイン: <span style={{ fontWeight: 700 }}>{q.domain}</span>
                    </div>
                  )}
                  <div style={{ color: '#888', fontSize: 12 }}>
                    タグ: {q.tags?.length ? q.tags.map(t => (
                      <span key={t} style={{ display: 'inline-block', background: '#f2f3f3', border: '1px solid #d1d5db', borderRadius: 6, padding: '1px 6px', marginRight: 4, fontSize: 11 }}>{t}</span>
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
            <div key={r.reportId} style={{ border: '1px solid #eaeded', borderRadius: 6, padding: '14px 16px', marginBottom: 8, background: 'white', boxShadow: '0 1px 1px 0 rgba(0,28,36,0.1)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div>
                  <span style={{ fontFamily: 'monospace', fontSize: 12, background: '#f2f3f3', padding: '2px 8px', borderRadius: 6, color: '#545b64', border: '1px solid #d1d5db' }}>
                    {r.questionId}
                  </span>
                  <span style={{ fontSize: 12, color: '#545b64', marginLeft: 12 }}>
                    {new Date(r.reportedAt).toLocaleString('ja-JP')}
                  </span>
                </div>
                <button
                  onClick={() => {
                    setTab('questions');
                    setKeyword(r.questionId);
                    setTimeout(() => fetchQuestions(), 100);
                  }}
                  style={{ fontSize: 12, padding: '4px 12px', border: '1px solid #008c8c', borderRadius: 9999, cursor: 'pointer', background: 'white', color: '#008c8c', fontWeight: 700 }}>
                  問題を確認
                </button>
              </div>
              <p style={{ margin: '0 0 6px', color: '#16191f', fontSize: 14 }}>{r.message || '（メッセージなし）'}</p>
              <p style={{ margin: 0, fontSize: 12, color: '#545b64' }}>通報者: {r.userId}</p>
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
            questionTextEn: "What should you use to restrict access to an Amazon S3 bucket to only a specific VPC?",
            choices: ["A. バケットACL", "B. S3バケットポリシーとVPCエンドポイント", "C. IAMユーザーポリシー", "D. セキュリティグループ"],
            choicesEn: ["A. Bucket ACL", "B. S3 bucket policy with VPC endpoint", "C. IAM user policy", "D. Security group"],
            correctAnswers: ["B. S3バケットポリシーとVPCエンドポイント"],
            explanation: "VPCエンドポイントを使用しS3バケットポリシーでaws:sourceVpceを条件にすることでVPC外からのアクセスを制限できます。",
            explanationEn: "By using a VPC endpoint and setting aws:sourceVpce as a condition in the S3 bucket policy, you can restrict access from outside the VPC.",
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
            const res = await adminFetch(`${API_ENDPOINT}/admin/questions`, {
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
                      style={{ padding: '4px 12px', border: '1px solid', borderRadius: 6, cursor: 'pointer', fontSize: 13,
                        borderColor: importExamType === t ? '#008c8c' : '#d1d5db',
                        background: importExamType === t ? '#e0f2f2' : 'white',
                        color: importExamType === t ? '#008c8c' : '#545b64',
                        fontWeight: importExamType === t ? 700 : 400 }}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>タグ（カンマ区切り・任意）</div>
                <input value={importTags} onChange={e => setImportTags(e.target.value)}
                  placeholder="例: EC2, VPC, セキュリティ"
                  style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }} />
              </div>
            </div>

            {/* JSON入力 */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <div style={{ fontSize: 12, color: '#888' }}>JSONを貼り付けまたはファイルをアップロード</div>
                <label style={{ padding: '5px 12px', background: '#f2f3f3', border: '1px solid #d1d5db', borderRadius: 9999, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                  ファイルを選択
                  <input type="file" accept=".json" onChange={handleFileUpload} style={{ display: 'none' }} />
                </label>
              </div>
              <textarea value={importJson} onChange={e => { setImportJson(e.target.value); setImportParsed(null); setImportResult(null); setImportError(''); }}
                placeholder={EXAMPLE}
                rows={12}
                style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: 6,
                  fontSize: 13, fontFamily: 'monospace', resize: 'vertical', boxSizing: 'border-box',
                  background: '#fafafa' }} />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
              <button onClick={handleParse} disabled={!importJson.trim()}
                style={{ padding: '8px 20px', background: importJson.trim() ? '#545b64' : '#eaeded',
                  color: importJson.trim() ? 'white' : '#aab7b8', border: 'none', borderRadius: 9999, cursor: importJson.trim() ? 'pointer' : 'default', fontWeight: 700, fontSize: 14 }}>
                構文チェック
              </button>
              {importParsed && (
                <button onClick={handleImport} disabled={importing}
                  style={{ padding: '8px 24px', background: importing ? '#eaeded' : 'white',
                    color: importing ? '#aab7b8' : '#008c8c', border: `1px solid ${importing ? '#eaeded' : '#008c8c'}`, borderRadius: 9999, cursor: importing ? 'default' : 'pointer', fontWeight: 700, fontSize: 14 }}>
                  {importing ? 'インポート中...' : `${importParsed.length}件をインポート`}
                </button>
              )}
            </div>

            {importParsed && !importResult && (
              <div style={{ marginBottom: 16, padding: '10px 14px', background: '#e0f2f2', border: '1px solid #aab7b8', borderRadius: 6, fontSize: 13, color: '#008c8c' }}>
                ✓ {importParsed.length}件の問題を認識しました。「{importExamType}」としてインポートします。
              </div>
            )}
            {importError && (
              <div style={{ marginBottom: 16, padding: '10px 14px', background: '#fdf3f1', border: '1px solid #f5a09b', borderRadius: 6, fontSize: 13, color: '#d13212' }}>
                エラー: {importError}
              </div>
            )}
            {importResult && (
              <div style={{ marginBottom: 16, padding: '14px 16px', background: '#eafaf1', border: '1px solid #6eb57d', borderRadius: 6 }}>
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
・questionTextEn, choicesEn, explanationEn には日本語フィールドの英語訳を必ず含めること
・choicesEn の要素数・順序は choices と完全に一致させること

【出力形式】
[
  {
    "examType": "${importExamType}",
    "domain": "（上記ドメインのいずれか）",
    "questionText": "問題文（日本語）",
    "questionTextEn": "Question text in English",
    "choices": ["A. 選択肢1", "B. 選択肢2", "C. 選択肢3", "D. 選択肢4"],
    "choicesEn": ["A. Choice 1", "B. Choice 2", "C. Choice 3", "D. Choice 4"],
    "correctAnswers": ["A. 選択肢1"],
    "explanation": "解説文（日本語）",
    "explanationEn": "Explanation in English",
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
                <div style={{ marginBottom: 16, background: '#fbfbfb', border: '1px solid #eaeded', borderRadius: 6, padding: '16px', boxShadow: '0 1px 1px 0 rgba(0,28,36,0.1)' }}>
                  <div style={{ fontWeight: 'bold', fontSize: 14, color: '#232f3e', marginBottom: 12 }}>AIプロンプト生成</div>

                  <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>トピック / サービス名</div>
                      <input value={promptTopic} onChange={e => setPromptTopic(e.target.value)}
                        placeholder="例: S3のセキュリティ、EC2のネットワーク"
                        style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }} />
                    </div>
                    <div style={{ width: 80 }}>
                      <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>問題数</div>
                      <input type="number" value={promptCount} onChange={e => setPromptCount(e.target.value)}
                        min={1} max={20}
                        style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }} />
                    </div>
                  </div>

                  <div style={{ position: 'relative' }}>
                    <pre style={{ background: 'white', border: '1px solid #d1d5db', borderRadius: 6, padding: '12px 14px',
                      fontSize: 12, fontFamily: 'monospace', whiteSpace: 'pre-wrap', margin: 0,
                      color: '#333', lineHeight: 1.6, maxHeight: 260, overflowY: 'auto' }}>
                      {prompt}
                    </pre>
                    <button onClick={copyPrompt}
                      style={{ position: 'absolute', top: 8, right: 8,
                        padding: '4px 12px', fontSize: 12, borderRadius: 9999, cursor: 'pointer',
                        background: promptCopied ? '#f2fcf3' : 'white',
                        color: promptCopied ? '#037f0c' : '#008c8c',
                        border: `1px solid ${promptCopied ? '#037f0c' : '#008c8c'}`,
                        transition: 'all 0.2s', fontWeight: 700 }}>
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
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { setShowTipPrompt(v => !v); setShowTipImport(false); setShowTipForm(false); }}
                style={{ padding: '7px 16px', background: showTipPrompt ? '#e0f2f2' : 'white', color: '#008c8c', border: '1px solid #008c8c', borderRadius: 9999, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                AIプロンプト
              </button>
              <button onClick={() => { setShowTipImport(v => !v); setShowTipForm(false); setShowTipPrompt(false); }}
                style={{ padding: '7px 16px', background: showTipImport ? '#e0f2f2' : 'white', color: '#008c8c', border: '1px solid #008c8c', borderRadius: 9999, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                JSONインポート
              </button>
              <button onClick={() => { setEditingTip(null); setTipForm({ examType: 'ALL', title: '', content: '' }); setShowTipForm(true); setShowTipImport(false); setShowTipPrompt(false); }}
                style={{ padding: '7px 16px', background: 'white', color: '#008c8c', border: '1px solid #008c8c', borderRadius: 9999, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                ＋ 手動追加
              </button>
            </div>
          </div>

          {/* AIプロンプト生成 */}
          {showTipPrompt && (() => {
            const EXAM_FULL: Record<string, string> = {
              ALL:  'AWS認定試験全般',
              CLF: 'AWS Certified Cloud Practitioner (CLF-C02)',
              SAA: 'AWS Certified Solutions Architect – Associate (SAA-C03)',
              SAP: 'AWS Certified Solutions Architect – Professional (SAP-C02)',
            };
            const topic = tipPromptTopic.trim() || '（トピックを入力してください）';
            const count = parseInt(tipPromptCount) || 5;
            const prompt = `あなたはAWSクラウドの教育コンテンツ作成の専門家です。
以下の条件に従い、学習コラム（豆知識）を${count}件作成し、JSON配列のみを出力してください（前後の説明文は不要）。

【対象試験】${EXAM_FULL[tipPromptExamType]}
【トピック】${topic}

【作成ルール】
・タイトルは30字以内で、内容を端的に表すこと
・本文は100〜250字程度で、試験に役立つ実践的な知識を書くこと
・「〜です。〜ます。」調の丁寧語で統一すること
・AWSサービスの具体的な特徴・制限・ベストプラクティスを含めること
・試験に出やすい落とし穴や覚え方のヒントがあれば含めること
${tipPromptExamType !== 'ALL' ? `・examType には "${tipPromptExamType}" を設定すること` : '・examType には対象試験に応じて "CLF" / "SAA" / "SAP" / "ALL" のいずれかを設定すること'}

【出力形式】
[
  {
    "examType": "${tipPromptExamType === 'ALL' ? 'SAA' : tipPromptExamType}",
    "title": "コラムタイトル",
    "content": "コラム本文（100〜250字）"
  }
]`;

            const copyPrompt = () => {
              navigator.clipboard.writeText(prompt);
              setTipPromptCopied(true);
              setTimeout(() => setTipPromptCopied(false), 2000);
            };

            return (
              <div style={{ border: '1px solid #eaeded', borderRadius: 6, padding: '20px 24px', marginBottom: 20, background: '#fbfbfb', boxShadow: '0 1px 1px 0 rgba(0,28,36,0.1)' }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: '#16191f', marginBottom: 14 }}>AIプロンプト生成</div>

                <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <div>
                    <div style={{ fontSize: 12, color: '#545b64', fontWeight: 700, marginBottom: 6 }}>対象試験</div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {['ALL', 'CLF', 'SAA', 'SAP'].map(t => (
                        <button key={t} type="button" onClick={() => setTipPromptExamType(t)}
                          style={{ padding: '4px 12px', border: '1px solid', borderRadius: 6, cursor: 'pointer', fontSize: 13,
                            borderColor: tipPromptExamType === t ? '#008c8c' : '#d1d5db',
                            background: tipPromptExamType === t ? '#e0f2f2' : 'white',
                            color: tipPromptExamType === t ? '#008c8c' : '#545b64',
                            fontWeight: tipPromptExamType === t ? 700 : 400 }}>
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <div style={{ fontSize: 12, color: '#545b64', fontWeight: 700, marginBottom: 6 }}>トピック / サービス名</div>
                    <input value={tipPromptTopic} onChange={e => setTipPromptTopic(e.target.value)}
                      placeholder="例: S3のライフサイクル、EC2のインスタンスタイプ"
                      style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, boxSizing: 'border-box', outline: 'none' }}
                      onFocus={e => e.currentTarget.style.borderColor = '#008c8c'}
                      onBlur={e => e.currentTarget.style.borderColor = '#d1d5db'}
                    />
                  </div>
                  <div style={{ width: 80 }}>
                    <div style={{ fontSize: 12, color: '#545b64', fontWeight: 700, marginBottom: 6 }}>件数</div>
                    <input type="number" value={tipPromptCount} onChange={e => setTipPromptCount(e.target.value)}
                      min={1} max={20}
                      style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, boxSizing: 'border-box', outline: 'none' }}
                      onFocus={e => e.currentTarget.style.borderColor = '#008c8c'}
                      onBlur={e => e.currentTarget.style.borderColor = '#d1d5db'}
                    />
                  </div>
                </div>

                <div style={{ position: 'relative' }}>
                  <pre style={{ background: 'white', border: '1px solid #d1d5db', borderRadius: 6, padding: '12px 14px',
                    fontSize: 12, fontFamily: 'monospace', whiteSpace: 'pre-wrap', margin: 0,
                    color: '#16191f', lineHeight: 1.6, maxHeight: 280, overflowY: 'auto' }}>
                    {prompt}
                  </pre>
                  <button onClick={copyPrompt}
                    style={{ position: 'absolute', top: 8, right: 8,
                      padding: '4px 12px', fontSize: 12, borderRadius: 9999, cursor: 'pointer',
                      background: tipPromptCopied ? '#f2fcf3' : 'white',
                      color: tipPromptCopied ? '#037f0c' : '#008c8c',
                      border: `1px solid ${tipPromptCopied ? '#037f0c' : '#008c8c'}`,
                      transition: 'all 0.2s', fontWeight: 700 }}>
                    {tipPromptCopied ? '✓ コピー済み' : 'コピー'}
                  </button>
                </div>
                <div style={{ fontSize: 11, color: '#aab7b8', marginTop: 6 }}>
                  このプロンプトをChatGPT / Claude / Gemini に貼り付け → 出力JSONを「JSONインポート」に貼り付けて登録
                </div>
              </div>
            );
          })()}

          {/* JSONインポートフォーム */}
          {showTipImport && (
            <div style={{ border: '1px solid #eaeded', borderRadius: 6, padding: '20px 24px', marginBottom: 20, background: '#fbfbfb', boxShadow: '0 1px 1px 0 rgba(0,28,36,0.1)' }}>
              <h4 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700 }}>コラムJSONインポート</h4>

              {/* デフォルト試験種別 */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, color: '#545b64', fontWeight: 700, marginBottom: 6 }}>
                  デフォルト試験種別 <span style={{ fontWeight: 400 }}>（JSON内に examType がない場合に使用）</span>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {['ALL', 'CLF', 'SAA', 'SAP'].map(t => (
                    <button key={t} type="button" onClick={() => setTipImportExamType(t)}
                      style={{ padding: '5px 14px', border: '1px solid', borderRadius: 6, cursor: 'pointer', fontSize: 13,
                        background: tipImportExamType === t ? '#e0f2f2' : 'white',
                        color: tipImportExamType === t ? '#008c8c' : '#545b64',
                        borderColor: tipImportExamType === t ? '#008c8c' : '#d1d5db',
                        fontWeight: tipImportExamType === t ? 700 : 400 }}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* JSON入力 */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, color: '#545b64', fontWeight: 700, marginBottom: 6 }}>JSON</div>
                <textarea
                  value={tipImportJson}
                  onChange={e => { setTipImportJson(e.target.value); setTipImportParsed(null); setTipImportError(''); setTipImportResult(null); }}
                  placeholder={JSON.stringify([{ examType: 'SAA', title: 'S3の結果整合性について', content: 'Amazon S3は強力な結果整合性を提供しており...' }], null, 2)}
                  rows={10}
                  style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, fontFamily: 'monospace', resize: 'vertical', boxSizing: 'border-box', background: 'white', outline: 'none' }}
                  onFocus={e => e.currentTarget.style.borderColor = '#008c8c'}
                  onBlur={e => e.currentTarget.style.borderColor = '#d1d5db'}
                />
              </div>

              {/* エラー・結果 */}
              {tipImportError && (
                <div style={{ marginBottom: 12, padding: '10px 14px', background: '#fdf2f2', border: '1px solid #f5a09b', borderRadius: 6, fontSize: 13, color: '#d13212' }}>
                  エラー: {tipImportError}
                </div>
              )}
              {tipImportParsed && !tipImportResult && (
                <div style={{ marginBottom: 12, padding: '10px 14px', background: '#e0f2f2', border: '1px solid #aab7b8', borderRadius: 6, fontSize: 13, color: '#008c8c' }}>
                  ✓ {tipImportParsed.length}件を認識しました
                </div>
              )}
              {tipImportResult !== null && (
                <div style={{ marginBottom: 12, padding: '10px 14px', background: '#eafaf1', border: '1px solid #6eb57d', borderRadius: 6, fontSize: 13, color: '#037f0c', fontWeight: 700 }}>
                  ✓ {tipImportResult}件をインポートしました
                </div>
              )}

              {/* ボタン */}
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => {
                    setTipImportError('');
                    setTipImportParsed(null);
                    setTipImportResult(null);
                    try {
                      const parsed = JSON.parse(tipImportJson);
                      if (!Array.isArray(parsed)) throw new Error('配列形式にしてください');
                      for (const t of parsed) {
                        if (!t.title?.trim()) throw new Error('title が必要です');
                        if (!t.content?.trim()) throw new Error('content が必要です');
                      }
                      setTipImportParsed(parsed);
                    } catch (e: any) {
                      setTipImportError(e.message || 'JSONの形式が正しくありません');
                    }
                  }}
                  disabled={!tipImportJson.trim()}
                  style={{ padding: '7px 20px', background: tipImportJson.trim() ? '#545b64' : '#eaeded', color: tipImportJson.trim() ? 'white' : '#aab7b8', border: 'none', borderRadius: 9999, cursor: tipImportJson.trim() ? 'pointer' : 'default', fontSize: 13, fontWeight: 700 }}>
                  構文チェック
                </button>
                {tipImportParsed && (
                  <button
                    onClick={async () => {
                      setTipImporting(true);
                      setTipImportResult(null);
                      try {
                        const res = await adminFetch(`${API_ENDPOINT}/admin/tips/bulk`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ tips: tipImportParsed, defaultExamType: tipImportExamType })
                        });
                        const data = await res.json();
                        if (!res.ok) throw new Error(data.error || '失敗しました');
                        setTipImportResult(data.count);
                        setTipImportJson('');
                        setTipImportParsed(null);
                        fetchTips();
                      } catch (e: any) {
                        setTipImportError(e.message);
                      } finally {
                        setTipImporting(false);
                      }
                    }}
                    disabled={tipImporting}
                    style={{ padding: '7px 24px', background: tipImporting ? '#eaeded' : 'white', color: tipImporting ? '#aab7b8' : '#008c8c', border: `1px solid ${tipImporting ? '#eaeded' : '#008c8c'}`, borderRadius: 9999, cursor: tipImporting ? 'default' : 'pointer', fontSize: 13, fontWeight: 700 }}>
                    {tipImporting ? 'インポート中...' : `${tipImportParsed.length}件をインポート`}
                  </button>
                )}
              </div>

              {/* フォーマット説明 */}
              <div style={{ marginTop: 16, padding: '12px 16px', background: '#f2f3f3', borderRadius: 6, fontSize: 12, color: '#545b64' }}>
                <strong style={{ display: 'block', marginBottom: 4 }}>JSONフォーマット</strong>
                各オブジェクトに <code>title</code>（必須）、<code>content</code>（必須）、<code>examType</code>（任意: ALL / CLF / SAA / SAP）を含めてください。
                examType を省略するとデフォルト試験種別が使用されます。
              </div>
            </div>
          )}

          {/* フォーム */}
          {showTipForm && (
            <div style={{ border: '1px solid #eaeded', borderRadius: 6, padding: 20, marginBottom: 20, background: '#fbfbfb', boxShadow: '0 1px 1px 0 rgba(0,28,36,0.1)' }}>
              <h4 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 700, color: '#16191f' }}>{editingTip ? 'コラムを編集' : '新規コラム'}</h4>
              <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                {['ALL', 'CLF', 'SAA', 'SAP'].map(t => (
                  <button key={t} type="button" onClick={() => setTipForm(f => ({ ...f, examType: t }))}
                    style={{ padding: '4px 12px', border: '1px solid', borderRadius: 6, cursor: 'pointer', fontSize: 13,
                      borderColor: tipForm.examType === t ? '#008c8c' : '#d1d5db',
                      background: tipForm.examType === t ? '#e0f2f2' : 'white',
                      color: tipForm.examType === t ? '#008c8c' : '#545b64',
                      fontWeight: tipForm.examType === t ? 700 : 400 }}>
                    {t}
                  </button>
                ))}
              </div>
              <input
                value={tipForm.title}
                onChange={e => setTipForm(f => ({ ...f, title: e.target.value }))}
                placeholder="タイトル"
                style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, marginBottom: 8, boxSizing: 'border-box', outline: 'none' }}
                onFocus={e => e.currentTarget.style.borderColor = '#008c8c'}
                onBlur={e => e.currentTarget.style.borderColor = '#d1d5db'}
              />
              <textarea
                value={tipForm.content}
                onChange={e => setTipForm(f => ({ ...f, content: e.target.value }))}
                placeholder="内容"
                rows={4}
                style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, resize: 'vertical', boxSizing: 'border-box', outline: 'none' }}
                onFocus={e => e.currentTarget.style.borderColor = '#008c8c'}
                onBlur={e => e.currentTarget.style.borderColor = '#d1d5db'}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 12, borderTop: '1px solid #eaeded', paddingTop: 12 }}>
                <button onClick={handleSaveTip}
                  style={{ padding: '7px 20px', background: '#ff9900', color: '#16191f', border: '1px solid transparent', borderRadius: 9999, cursor: 'pointer', fontWeight: 700, fontSize: 14 }}>
                  保存
                </button>
                <button onClick={() => { setShowTipForm(false); setEditingTip(null); }}
                  style={{ padding: '7px 16px', border: '1px solid #545b64', borderRadius: 9999, cursor: 'pointer', background: 'white', fontWeight: 700, fontSize: 14 }}>
                  キャンセル
                </button>
              </div>
            </div>
          )}

          {/* コラム一覧 */}
          {tips.map(tip => (
            <div key={tip.tipId} style={{ border: '1px solid #eaeded', borderRadius: 6, padding: '12px 16px', marginBottom: 8, background: 'white', boxShadow: '0 1px 1px 0 rgba(0,28,36,0.1)' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <span style={{
                  background: '#232f3e',
                  color: 'white', fontSize: 11, padding: '2px 8px', borderRadius: 12, flexShrink: 0, marginTop: 2, fontWeight: 700,
                }}>{tip.examType}</span>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: '0 0 4px', fontWeight: 700, fontSize: 14, color: '#16191f' }}>{tip.title}</p>
                  <p style={{ margin: 0, fontSize: 13, color: '#545b64', lineHeight: 1.6 }}>{tip.content}</p>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button onClick={() => { setEditingTip(tip); setTipForm({ examType: tip.examType, title: tip.title, content: tip.content }); setShowTipForm(true); }}
                    style={{ padding: '4px 10px', border: '1px solid #545b64', borderRadius: 9999, cursor: 'pointer', background: 'white', fontSize: 12, fontWeight: 700 }}>
                    編集
                  </button>
                  <button onClick={() => handleDeleteTip(tip)}
                    style={{ padding: '4px 10px', background: 'white', color: '#d13212', border: '1px solid #d13212', borderRadius: 9999, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
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

      {/* ── リリースノート管理 ── */}
      {tab === 'releases' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <p style={{ color: '#888', fontSize: 13, margin: 0 }}>
              {loadingRel ? '読み込み中...' : `${releases.length} 件`}
            </p>
            <button
              onClick={() => {
                setEditingRelease(null);
                setReleaseForm({ date: new Date().toISOString().slice(0, 10), title: '', body: '' });
                setShowReleaseForm(true);
              }}
              style={{ padding: '7px 16px', background: 'white', color: '#008c8c', border: '1px solid #008c8c', borderRadius: 9999, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
              ＋ 新規追加
            </button>
          </div>

          {showReleaseForm && (
            <div style={{ border: '1px solid #eaeded', borderRadius: 6, padding: '20px 24px', marginBottom: 20, background: '#fbfbfb', boxShadow: '0 1px 1px 0 rgba(0,28,36,0.1)' }}>
              <h4 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 700, color: '#16191f' }}>
                {editingRelease ? 'リリースノートを編集' : '新規リリースノート'}
              </h4>
              <div style={{ marginBottom: 10 }}>
                <label style={{ display: 'block', fontSize: 12, color: '#545b64', fontWeight: 700, marginBottom: 4 }}>日付</label>
                <input
                  type="date" value={releaseForm.date}
                  onChange={e => setReleaseForm(f => ({ ...f, date: e.target.value }))}
                  style={{ padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, outline: 'none' }}
                  onFocus={e => e.currentTarget.style.borderColor = '#008c8c'}
                  onBlur={e => e.currentTarget.style.borderColor = '#d1d5db'}
                />
              </div>
              <div style={{ marginBottom: 10 }}>
                <label style={{ display: 'block', fontSize: 12, color: '#545b64', fontWeight: 700, marginBottom: 4 }}>タイトル</label>
                <input
                  value={releaseForm.title}
                  onChange={e => setReleaseForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="例：問題追加・機能改善"
                  style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, boxSizing: 'border-box', outline: 'none' }}
                  onFocus={e => e.currentTarget.style.borderColor = '#008c8c'}
                  onBlur={e => e.currentTarget.style.borderColor = '#d1d5db'}
                />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 12, color: '#545b64', fontWeight: 700, marginBottom: 4 }}>本文</label>
                <textarea
                  value={releaseForm.body}
                  onChange={e => setReleaseForm(f => ({ ...f, body: e.target.value }))}
                  placeholder="変更内容を記入してください"
                  rows={5}
                  style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, resize: 'vertical', boxSizing: 'border-box', outline: 'none' }}
                  onFocus={e => e.currentTarget.style.borderColor = '#008c8c'}
                  onBlur={e => e.currentTarget.style.borderColor = '#d1d5db'}
                />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={handleSaveRelease}
                  style={{ padding: '7px 20px', background: '#ff9900', color: '#16191f', border: '1px solid transparent', borderRadius: 9999, cursor: 'pointer', fontWeight: 700, fontSize: 14 }}>
                  保存
                </button>
                <button onClick={() => { setShowReleaseForm(false); setEditingRelease(null); }}
                  style={{ padding: '7px 16px', border: '1px solid #545b64', borderRadius: 9999, cursor: 'pointer', background: 'white', fontWeight: 700, fontSize: 14 }}>
                  キャンセル
                </button>
              </div>
            </div>
          )}

          {releases.map(r => (
            <div key={r.releaseId} style={{ border: '1px solid #eaeded', borderRadius: 6, padding: '14px 18px', marginBottom: 8, background: 'white', boxShadow: '0 1px 1px 0 rgba(0,28,36,0.1)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, color: '#879596', fontWeight: 700, marginBottom: 3 }}>{r.date}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#16191f', marginBottom: 4 }}>{r.title}</div>
                  <div style={{ fontSize: 13, color: '#545b64', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{r.body}</div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button
                    onClick={() => { setEditingRelease(r); setReleaseForm({ date: r.date, title: r.title, body: r.body }); setShowReleaseForm(true); }}
                    style={{ padding: '4px 10px', border: '1px solid #545b64', borderRadius: 9999, cursor: 'pointer', background: 'white', fontSize: 12, fontWeight: 700 }}>
                    編集
                  </button>
                  <button
                    onClick={() => handleDeleteRelease(r)}
                    style={{ padding: '4px 10px', background: 'white', color: '#d13212', border: '1px solid #d13212', borderRadius: 9999, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                    削除
                  </button>
                </div>
              </div>
            </div>
          ))}

          {!loadingRel && releases.length === 0 && (
            <p style={{ color: '#aaa', textAlign: 'center', padding: 40 }}>リリースノートはありません</p>
          )}
        </div>
      )}
      {tab === 'scan' && (() => {
        const RATING_LABEL: Record<number, string> = { 1: '致命的', 2: '重大', 3: '軽微', 4: 'ほぼ問題なし', 5: '問題なし' };
        const RATING_COLOR: Record<number, string> = { 1: '#d13212', 2: '#d47500', 3: '#8b6914', 4: '#545b64', 5: '#037f0c' };
        const ratingDist = [1, 2, 3, 4, 5].map(r => ({
          r, count: flaggedQuestions.filter(q => q.validityRating === r).length
        }));

        return (
          <div>
            {/* 進捗・統計 */}
            {!loadingFlagged && validityTotalCount > 0 && validityFilter === 'all' && (
              <div style={{ background: '#f2f3f3', border: '1px solid #eaeded', borderRadius: 8, padding: '14px 18px', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ fontSize: 13, color: '#545b64' }}>
                    チェック済み <strong style={{ color: '#16191f', fontSize: 15 }}>{flaggedQuestions.length}</strong> / {validityTotalCount} 問
                  </div>
                  <div style={{ fontSize: 12, color: '#aab7b8' }}>
                    残り {validityTotalCount - flaggedQuestions.length} 問未チェック
                  </div>
                </div>
                {/* プログレスバー */}
                <div style={{ height: 8, background: '#d1d5db', borderRadius: 9999, overflow: 'hidden', marginBottom: 10 }}>
                  <div style={{ height: '100%', background: '#008c8c', borderRadius: 9999, width: `${Math.min(100, (flaggedQuestions.length / validityTotalCount) * 100)}%`, transition: 'width 0.4s' }} />
                </div>
                {/* rating 分布 */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {ratingDist.map(({ r, count }) => count > 0 && (
                    <span key={r} style={{ fontSize: 12, fontWeight: 700, padding: '2px 10px', borderRadius: 9999, background: RATING_COLOR[r] + '18', color: RATING_COLOR[r], border: `1px solid ${RATING_COLOR[r]}40` }}>
                      {r}: {RATING_LABEL[r]} {count}問
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* フィルター・再読み込み */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
              <div style={{ display: 'flex', gap: 6 }}>
                {([
                  { key: 'all', label: '全チェック済み' },
                  { key: 'flagged', label: '要確認 (rating≤2)' },
                  { key: 'hidden', label: '非表示中' },
                ] as const).map(({ key, label }) => (
                  <button key={key} onClick={() => { setValidityFilter(key); fetchFlagged(key); }}
                    style={{ padding: '6px 14px', border: '1px solid', borderRadius: 9999, cursor: 'pointer', fontSize: 13, fontWeight: validityFilter === key ? 700 : 400,
                      background: validityFilter === key ? '#e0f2f2' : 'white',
                      color: validityFilter === key ? '#008c8c' : '#545b64',
                      borderColor: validityFilter === key ? '#008c8c' : '#d1d5db' }}>
                    {label}
                    {!loadingFlagged && validityFilter === key && ` (${flaggedQuestions.length})`}
                  </button>
                ))}
              </div>
              <button onClick={() => fetchFlagged(validityFilter)}
                style={{ padding: '6px 16px', background: 'white', color: '#008c8c', border: '1px solid #008c8c', borderRadius: 9999, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                再読み込み
              </button>
            </div>

            {loadingFlagged && <p style={{ color: '#545b64', fontSize: 13, padding: 20, textAlign: 'center' }}>読み込み中...</p>}

            {!loadingFlagged && flaggedQuestions.length === 0 && (
              <p style={{ color: '#aab7b8', textAlign: 'center', padding: 40 }}>
                {validityFilter === 'all' ? 'チェック済みの問題はありません' : validityFilter === 'flagged' ? '要確認の問題はありません' : '非表示中の問題はありません'}
              </p>
            )}

            {flaggedQuestions.map(q => {
              const rating = q.validityRating;
              const ratingColor = rating !== undefined ? (RATING_COLOR[rating] ?? '#545b64') : '#aab7b8';
              return (
                <div key={q.questionId} style={{ background: 'white', border: `1px solid ${q.isHidden ? '#f5a09b' : '#eaeded'}`, borderLeft: `4px solid ${ratingColor}`, borderRadius: 6, padding: '14px 18px', marginBottom: 8, boxShadow: '0 1px 1px 0 rgba(0,28,36,0.07)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                    <span style={{ background: '#232f3e', color: 'white', fontSize: 11, padding: '2px 8px', borderRadius: 12, fontWeight: 700 }}>{q.examType}</span>
                    {rating !== undefined ? (
                      <span style={{ fontSize: 12, fontWeight: 700, color: ratingColor, background: ratingColor + '18', padding: '2px 10px', borderRadius: 6 }}>
                        rating {rating} — {RATING_LABEL[rating] ?? ''}
                      </span>
                    ) : (
                      <span style={{ fontSize: 12, color: '#aab7b8' }}>未評価</span>
                    )}
                    {q.isHidden && (
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'white', background: '#d13212', padding: '2px 8px', borderRadius: 6 }}>非表示中</span>
                    )}
                    <span style={{ fontSize: 11, color: '#aab7b8', marginLeft: 'auto', flexShrink: 0 }}>
                      {q.validityCheckedAt ? new Date(q.validityCheckedAt).toLocaleDateString('ja-JP') : '未チェック'}
                    </span>
                  </div>
                  <p style={{ fontSize: 13, color: '#16191f', margin: '0 0 6px', lineHeight: 1.6 }}>{q.questionText}</p>
                  {q.validityNote && (
                    <p style={{ fontSize: 12, color: '#545b64', margin: '0 0 10px', padding: '7px 10px', background: '#fbfbfb', borderRadius: 4, lineHeight: 1.6, borderLeft: '3px solid #d1d5db' }}>
                      {q.validityNote}
                    </p>
                  )}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button onClick={() => openEdit(q)} style={{ padding: '4px 12px', fontSize: 12, fontWeight: 700, borderRadius: 9999, cursor: 'pointer', background: 'white', color: '#545b64', border: '1px solid #545b64' }}>
                      編集
                    </button>
                    {q.isHidden ? (
                      <button onClick={() => handleVisibility(q, false)} style={{ padding: '4px 12px', fontSize: 12, fontWeight: 700, borderRadius: 9999, cursor: 'pointer', background: 'white', color: '#037f0c', border: '1px solid #037f0c' }}>
                        表示に戻す
                      </button>
                    ) : (
                      <button onClick={() => handleVisibility(q, true)} style={{ padding: '4px 12px', fontSize: 12, fontWeight: 700, borderRadius: 9999, cursor: 'pointer', background: 'white', color: '#d47500', border: '1px solid #d47500' }}>
                        非表示にする
                      </button>
                    )}
                    <button
                      onClick={async () => {
                        if (!window.confirm('この問題を完全に削除しますか？')) return;
                        await adminFetch(`${API_ENDPOINT}/admin/questions/${q.questionId}`, { method: 'DELETE' });
                        setFlaggedQuestions(prev => prev.filter(x => x.questionId !== q.questionId));
                      }}
                      style={{ padding: '4px 12px', fontSize: 12, fontWeight: 700, borderRadius: 9999, cursor: 'pointer', background: 'white', color: '#d13212', border: '1px solid #d13212' }}>
                      削除
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* ── メッセージ ── */}
      {tab === 'messages' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <p style={{ color: '#545b64', fontSize: 13, margin: 0 }}>
              {loadingMsg ? '読み込み中...' : `${messages.length} 件`}
            </p>
            <button onClick={fetchMessages} style={{ padding: '6px 16px', background: 'white', color: '#008c8c', border: '1px solid #008c8c', borderRadius: 9999, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
              更新
            </button>
          </div>

          {!loadingMsg && messages.length === 0 && (
            <p style={{ color: '#aaa', textAlign: 'center', padding: 40 }}>メッセージはありません</p>
          )}

          {messages.map(m => (
            <div key={m.messageId} style={{ border: '1px solid #eaeded', borderRadius: 6, padding: '16px 20px', marginBottom: 10, background: 'white', boxShadow: '0 1px 1px 0 rgba(0,28,36,0.1)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <span style={{ fontSize: 12, color: '#879596' }}>
                  {new Date(m.sentAt).toLocaleString('ja-JP')}
                </span>
                <button
                  onClick={() => handleDeleteMessage(m)}
                  style={{ padding: '4px 12px', background: 'white', color: '#d13212', border: '1px solid #d13212', borderRadius: 9999, cursor: 'pointer', fontSize: 12, fontWeight: 700, flexShrink: 0 }}
                >
                  削除
                </button>
              </div>
              {m.subject && (
                <p style={{ margin: '0 0 8px', fontWeight: 700, fontSize: 14, color: '#16191f' }}>{m.subject}</p>
              )}
              <p style={{ margin: 0, fontSize: 14, color: '#16191f', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{m.message}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
