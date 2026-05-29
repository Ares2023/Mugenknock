import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { fetchAuthSession } from 'aws-amplify/auth';
import { API_ENDPOINT, ADMIN_EMAIL, EXAM_TYPES, EXAM_DOMAINS, EXAM_CONFIGS, EXAM_LEVEL } from '../constants';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import { ServiceIcon, isServiceIconKey, IconChevronDown, IconChevronRight } from '../components/Icons';
import { useTheme, CustomColors } from '../contexts/ThemeContext';

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
  createdAt?: string;
  updatedAt?: string;
  validityCheckedAt?: string;
  formatCheckedAt?: string;
};

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
};

type Report = {
  questionId: string;
  reportId: string;
  userId: string;
  category?: string;
  message: string;
  reportedAt: string;
};

const REPORT_CATEGORY_LABEL: Record<string, string> = {
  question_error:    '問題文の誤り',
  choice_error:      '選択肢・正解の誤り',
  explanation_error: '解説の誤り',
  other:             'その他',
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

type Tab = 'questions' | 'reports' | 'tips' | 'import' | 'releases' | 'scan' | 'messages' | 'dailyservice' | 'theme' | 'admins' | 'about' | 'deleteuser' | 'passcomments';
type Group = 'content' | 'ops' | 'settings';

const TAB_GROUPS: { key: Group; label: string; tabs: Tab[] }[] = [
  { key: 'content',  label: 'コンテンツ', tabs: ['questions', 'import', 'tips', 'releases', 'dailyservice'] },
  { key: 'ops',      label: '運営',       tabs: ['reports', 'scan', 'messages', 'deleteuser'] },
  { key: 'settings', label: '設定',       tabs: ['theme', 'admins', 'about', 'passcomments'] },
];
const TAB_LABELS: Record<Tab, string> = {
  questions: '問題管理', import: '問題追加', tips: 'コラム管理',
  releases: 'リリースノート', dailyservice: '日めくりAWSサービス',
  reports: '通報確認', scan: 'スキャン結果', messages: 'メッセージ', deleteuser: 'データ削除',
  theme: 'テーマ設定', admins: '管理者設定', about: 'サイト情報', passcomments: '合格コメント',
};
function getGroupForTab(t: Tab): Group {
  for (const g of TAB_GROUPS) if ((g.tabs as Tab[]).includes(t)) return g.key;
  return 'content';
}

type DailyServiceItem = {
  serviceId: string;
  name: string;
  shortName?: string;
  category?: string;
  icon: string;
  description: string;
  trivia?: string;
  docUrl?: string;
  order: number;
  isActive: boolean;
  createdAt?: string;
};

type ContactMessage = {
  messageId: string;
  subject: string;
  message: string;
  userId: string;
  sentAt: string;
};

type FixProposal = {
  questionText?: string;
  choices?: string[];
  correctAnswers?: string[];
  explanation?: string;
};

type ValidityEditLog = {
  action: 'fixed';
  checkedAt: string;
  reason: string;
  changes?: {
    questionText?: { before: string; after: string };
    choices?: { before: string[]; after: string[] };
    correctAnswers?: { before: string[]; after: string[] };
    explanation?: { before: string; after: string };
  };
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
  validityCheckedAt?: string;
  formatCheckedAt?: string;
  validityEditLog?: string;
  isHidden?: boolean;
  // 旧フィールド（後方互換）
  validityRating?: number;
  validityNote?: string;
  fixProposalJson?: string;
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

const THEME_COLOR_LABELS: { key: string; label: string; group?: string }[] = [
  { key: '--color-primary',        label: 'メインカラー（青）',           group: 'ブランド' },
  { key: '--color-primary-hover',  label: 'メインカラー・ホバー',          group: 'ブランド' },
  { key: '--color-primary-light',  label: 'メインカラー・薄',             group: 'ブランド' },
  { key: '--color-secondary',      label: 'セカンダリ（ナビ・ヘッダー）',   group: 'ブランド' },
  { key: '--color-accent',         label: 'アクセント / Primaryボタン背景', group: 'ボタン' },
  { key: '--color-accent-hover',   label: 'Primaryボタン・ホバー',         group: 'ボタン' },
  { key: '--color-accent-dark',    label: 'Primaryボタン・押下',           group: 'ボタン' },
  { key: '--color-btn-primary-text', label: 'Primaryボタン・文字色',       group: 'ボタン' },
  { key: '--color-bg-main',        label: 'ページ背景',                   group: '背景' },
  { key: '--color-bg-white',       label: 'カード背景',                   group: '背景' },
  { key: '--color-text-main',      label: 'テキスト・メイン',             group: 'テキスト' },
  { key: '--color-text-sub',       label: 'テキスト・サブ',               group: 'テキスト' },
  { key: '--color-text-light',     label: 'テキスト・薄',                 group: 'テキスト' },
  { key: '--color-border',         label: 'ボーダー',                     group: 'その他' },
  { key: '--color-danger',         label: 'エラー・危険',                 group: 'その他' },
  { key: '--color-success',        label: '成功・正解',                   group: 'その他' },
];

const DEFAULT_COLORS: CustomColors = {
  '--color-primary':          '#006CE0',
  '--color-primary-hover':    '#0055B3',
  '--color-primary-light':    '#E8F3FF',
  '--color-secondary':        '#232f3e',
  '--color-accent':           '#ff9900',
  '--color-accent-hover':     '#ec7211',
  '--color-accent-dark':      '#cc7a00',
  '--color-btn-primary-text': '#16191f',
  '--color-bg-main':          '#f2f3f3',
  '--color-bg-white':         '#ffffff',
  '--color-text-main':        '#16191f',
  '--color-text-sub':         '#545b64',
  '--color-text-light':       '#879596',
  '--color-border':           '#eaeded',
  '--color-danger':           '#d13212',
  '--color-success':          '#037f0c',
};

export default function Admin() {
  const [tab, setTab] = useState<Tab>('questions');
  const [adminError, setAdminError] = useState<string | null>(null);
  const { customColors, customColorsEnabled, applyColors, setCustomColorsEnabled } = useTheme();
  const [themeColors, setThemeColors] = useState<CustomColors>(() => ({ ...DEFAULT_COLORS, ...customColors }));
  const [themeEnabled, setThemeEnabled] = useState(customColorsEnabled);
  const [themeSaving, setThemeSaving] = useState(false);
  const [themeSaved, setThemeSaved] = useState(false);

  // サイト情報
  const [aboutSections, setAboutSections] = useState<Record<string, string>>({ privacy: '', terms: '', operator: '' });
  const [aboutSaving, setAboutSaving] = useState(false);
  const [aboutSaved, setAboutSaved] = useState(false);
  const [aboutLoading, setAboutLoading] = useState(false);

  // データ削除
  const [delEmail, setDelEmail] = useState('');
  const [delExecuting, setDelExecuting] = useState(false);
  const [delDone, setDelDone] = useState(false);
  const [delError, setDelError] = useState('');

  // 合格コメント
  const [passComments, setPassComments] = useState<Record<string, string>>({});
  const [passCommentExam, setPassCommentExam] = useState('SAA');
  const [passCommentText, setPassCommentText] = useState('');
  const [passCommentSaving, setPassCommentSaving] = useState(false);
  const [passCommentSaved, setPassCommentSaved] = useState(false);

  // 管理者設定
  const [adminEmails, setAdminEmails] = useState<string[]>([]);
  const [adminEmailsLoading, setAdminEmailsLoading] = useState(false);
  const [adminEmailsError, setAdminEmailsError] = useState<string | null>(null);
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [adminSaving, setAdminSaving] = useState(false);
  const [adminSaved, setAdminSaved] = useState(false);

  // 問題管理
  const [questions, setQuestions] = useState<Question[]>([]);
  const [examFilter, setExamFilter] = useState('ALL');
  const [tagFilter, setTagFilter] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [domainFilter, setDomainFilter] = useState('');
  const [keyword, setKeyword] = useState('');
  const [keywordInput, setKeywordInput] = useState('');
  const [sortBy, setSortBy] = useState<'id_asc' | 'updatedAt_desc' | 'updatedAt_asc' | 'validityCheckedAt_desc' | 'validityCheckedAt_asc' | 'createdAt_desc' | 'createdAt_asc' | 'formatCheckedAt_desc' | 'formatCheckedAt_asc'>('id_asc');
  const [loadingQ, setLoadingQ] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedDetail, setExpandedDetail] = useState<Record<string, Question>>({});
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const PAGE_SIZE = 100;

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

  // 今日のサービス
  const [dailyServices, setDailyServices] = useState<DailyServiceItem[]>([]);
  const [loadingDS, setLoadingDS] = useState(false);
  const [editingDS, setEditingDS] = useState<DailyServiceItem | null>(null);
  const [showDSForm, setShowDSForm] = useState(false);
  const emptyDSForm = { name: '', shortName: '', category: '', icon: '☁️', description: '', trivia: '', docUrl: '', order: 0, isActive: true };
  const [dsForm, setDsForm] = useState(emptyDSForm);

  // リリースノート管理
  const [releases, setReleases] = useState<Release[]>([]);
  const [loadingRel, setLoadingRel] = useState(false);
  const [editingRelease, setEditingRelease] = useState<Release | null>(null);
  const [releaseForm, setReleaseForm] = useState({ date: '', title: '', body: '' });
  const [showReleaseForm, setShowReleaseForm] = useState(false);

  const fetchSummary = useCallback(async () => {
    try {
      const res = await adminFetch(`${API_ENDPOINT}/admin/questions/summary`);
      if (!res.ok) return;
      const data = await res.json();
      setExamCounts(data.examCounts || {});
      setDomainCountsByExam(data.domainCounts || {});
      if (data.validityCheckedCount != null) setValidityCheckedCount(data.validityCheckedCount);
      if (data.formatCheckedCount   != null) setFormatCheckedCount(data.formatCheckedCount);
    } catch (err) {
      console.error(err);
    }
  }, []);

  const fetchQuestions = useCallback(async (page = 0) => {
    setLoadingQ(true);
    setAdminError(null);
    try {
      const params = new URLSearchParams();
      if (examFilter !== 'ALL') params.set('examType', examFilter);
      if (keyword.trim()) params.set('keyword', keyword.trim());
      if (tagFilter.trim()) params.set('tag', tagFilter.trim());
      if (domainFilter) params.set('domain', domainFilter);
      params.set('page', String(page));
      params.set('pageSize', String(PAGE_SIZE));
      params.set('sort', sortBy);
      const res = await adminFetch(`${API_ENDPOINT}/admin/questions?${params}`);
      if (res.status === 401 || res.status === 403) {
        setAdminError('管理者アカウントでログインしてください。');
        setQuestions([]);
        return;
      }
      const data = await res.json();
      const items: Question[] = data.items || [];
      setQuestions(items);
      setCurrentPage(data.page ?? page);
      setTotalQuestions(data.total ?? items.length);
    } catch (err) {
      console.error(err);
      setAdminError('APIの接続に失敗しました。');
    } finally {
      setLoadingQ(false);
    }
  }, [examFilter, keyword, tagFilter, domainFilter, sortBy, PAGE_SIZE]);


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

  const deleteReport = async (reportId: string) => {
    try {
      await adminFetch(`${API_ENDPOINT}/admin/reports/${reportId}`, { method: 'DELETE' });
      setReports(prev => prev.filter(r => r.reportId !== reportId));
    } catch (err) { console.error(err); }
  };

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

  const fetchDailyServices = useCallback(async () => {
    setLoadingDS(true);
    try {
      const res = await adminFetch(`${API_ENDPOINT}/admin/daily-services`);
      const data = await res.json();
      setDailyServices(data.items || []);
    } catch (err) { console.error(err); } finally { setLoadingDS(false); }
  }, []);

  const saveDailyService = async () => {
    if (!dsForm.name.trim() || !dsForm.description.trim()) {
      alert('サービス名と説明は必須です');
      return;
    }
    try {
      if (editingDS) {
        await adminFetch(`${API_ENDPOINT}/admin/daily-services/${editingDS.serviceId}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(dsForm),
        });
      } else {
        await adminFetch(`${API_ENDPOINT}/admin/daily-services`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(dsForm),
        });
      }
      setShowDSForm(false);
      setEditingDS(null);
      setDsForm(emptyDSForm);
      fetchDailyServices();
    } catch (err) { console.error(err); }
  };

  const deleteDailyService = async (serviceId: string) => {
    if (!window.confirm('このサービスを削除しますか？')) return;
    try {
      await adminFetch(`${API_ENDPOINT}/admin/daily-services/${serviceId}`, { method: 'DELETE' });
      setDailyServices(prev => prev.filter(s => s.serviceId !== serviceId));
    } catch (err) { console.error(err); }
  };


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
  const [validityFilter, setValidityFilter] = useState<'all' | 'fixed' | 'hidden'>('all');
  const [validityTotalCount, setValidityTotalCount] = useState(0);
  const [scanExamFilter, setScanExamFilter] = useState<string>('ALL');
  const [scanSort, setScanSort] = useState<'date_desc' | 'date_asc'>('date_desc');

  // 問題数カウント
  const [examCounts, setExamCounts] = useState<Record<string, number>>({});
  const [domainCountsByExam, setDomainCountsByExam] = useState<Record<string, Record<string, number>>>({});
  const [validityCheckedCount, setValidityCheckedCount] = useState<number | null>(null);
  const [formatCheckedCount, setFormatCheckedCount] = useState<number | null>(null);

  // 問題編集
  const EMPTY_EDIT_FORM: EditForm = { examType: 'SAA', domain: '', questionText: '', questionTextEn: '', choices: ['', '', '', ''], choicesEn: ['', '', '', ''], correctAnswers: [], explanation: '', explanationEn: '', tags: '', isMultiple: false };
  const [editingQuestion, setEditingQuestion] = useState<{ id: string } | null>(null);
  const [editForm, setEditForm] = useState<EditForm>(EMPTY_EDIT_FORM);
  const [saving, setSaving] = useState(false);

  const openEdit = async (q: Question | FlaggedQuestion) => {
    setEditingQuestion({ id: q.questionId });
    setEditForm(EMPTY_EDIT_FORM);
    // ALLスキャン時はexplanationが省略されているため個別取得する
    let full: any = q;
    if ((q as Question).explanation === undefined) {
      try {
        const res = await adminFetch(`${API_ENDPOINT}/admin/questions/${q.questionId}`);
        if (res.ok) full = await res.json();
      } catch {}
    }
    const choices = full.choices || ['', '', '', ''];
    setEditForm({
      examType: full.examType,
      domain: full.domain || '',
      questionText: full.questionText,
      questionTextEn: full.questionTextEn || '',
      choices,
      choicesEn: full.choicesEn || choices.map(() => ''),
      correctAnswers: full.correctAnswers || [],
      explanation: full.explanation || '',
      explanationEn: full.explanationEn || '',
      tags: (full.tags || []).join(', '),
      isMultiple: full.isMultiple || false,
    });
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

  const fetchFlagged = async (filter: 'all' | 'fixed' | 'hidden' = validityFilter) => {
    setLoadingFlagged(true);
    try {
      const apiParam = filter === 'hidden' ? '?filter=hidden' : '';
      const res = await adminFetch(`${API_ENDPOINT}/admin/questions/flagged${apiParam}`);
      const data = await res.json();
      setFlaggedQuestions(data.items || []);
      setValidityTotalCount(data.totalCount || 0);
    } catch (err) { console.error(err); }
    setLoadingFlagged(false);
  };

  const handleApplyFix = async (q: FlaggedQuestion) => {
    if (!q.fixProposalJson) return;
    const fix: FixProposal = JSON.parse(q.fixProposalJson);
    if (!window.confirm('修正案を適用しますか？\n問題文・選択肢・解説が上書きされます。')) return;
    await adminFetch(`${API_ENDPOINT}/admin/questions/${q.questionId}/apply-fix`, { method: 'POST' });
    setFlaggedQuestions(prev => prev.map(x =>
      x.questionId === q.questionId
        ? { ...x, fixProposalJson: undefined, validityNote: '修正適用済',
            ...(fix.questionText  ? { questionText: fix.questionText }   : {}),
            ...(fix.choices       ? { choices: fix.choices }             : {}),
            ...(fix.correctAnswers? { correctAnswers: fix.correctAnswers }: {}),
            ...(fix.explanation   ? { explanation: fix.explanation }     : {}),
          }
        : x
    ));
  };

  const handleRejectFix = async (q: FlaggedQuestion) => {
    await adminFetch(`${API_ENDPOINT}/admin/questions/${q.questionId}/reject-fix`, { method: 'POST' });
    setFlaggedQuestions(prev => prev.map(x =>
      x.questionId === q.questionId ? { ...x, fixProposalJson: undefined } : x
    ));
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

  useEffect(() => {
    setCurrentPage(0);
    fetchQuestions(0);
    setSelectedIds(new Set());
    if (examFilter === 'ALL') fetchSummary();
  }, [examFilter, keyword, tagFilter, domainFilter, sortBy]);
  useEffect(() => { if (tab === 'reports') fetchReports(); }, [tab]);
  useEffect(() => { if (tab === 'tips') fetchTips(); }, [tab]);
  useEffect(() => { if (tab === 'releases') fetchReleases(); }, [tab]);
  useEffect(() => { if (tab === 'scan') fetchFlagged('all'); }, [tab]);
  useEffect(() => { if (tab === 'messages') fetchMessages(); }, [tab]);
  useEffect(() => { if (tab === 'dailyservice') fetchDailyServices(); }, [tab]);
  useEffect(() => { fetchDailyServices(); }, []); // pre-fetch for tab count
  useEffect(() => { if (tab === 'admins') fetchAdminEmails(); }, [tab]);
  useEffect(() => { if (tab === 'about') fetchAboutContent(); }, [tab]);
  useEffect(() => {
    if (tab !== 'passcomments') return;
    fetch(`${API_ENDPOINT}/settings/pass-comments`)
      .then(r => r.json())
      .then(d => {
        const comments = d.comments ?? {};
        setPassComments(comments);
        setPassCommentText(comments[passCommentExam] ?? '');
      })
      .catch(() => {});
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchAdminEmails = async () => {
    setAdminEmailsLoading(true);
    setAdminEmailsError(null);
    try {
      const res = await adminFetch(`${API_ENDPOINT}/admin/settings/admins`);
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      setAdminEmails(data.emails ?? []);
    } catch {
      setAdminEmailsError('管理者リストの取得に失敗しました。Lambda のデプロイが必要な場合があります。');
    }
    setAdminEmailsLoading(false);
  };

  const saveAdminEmails = async (emails: string[]) => {
    setAdminSaving(true);
    setAdminSaved(false);
    try {
      await adminFetch(`${API_ENDPOINT}/admin/settings/admins`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails }),
      });
      setAdminEmails(emails);
      setAdminSaved(true);
      setTimeout(() => setAdminSaved(false), 3000);
    } catch { alert('保存に失敗しました'); }
    setAdminSaving(false);
  };

  const addAdminEmail = () => {
    const email = newAdminEmail.trim().toLowerCase();
    if (!email || !email.includes('@')) return;
    if (adminEmails.includes(email)) { setNewAdminEmail(''); return; }
    const next = [...adminEmails, email];
    setNewAdminEmail('');
    saveAdminEmails(next);
  };

  const removeAdminEmail = (email: string) => {
    saveAdminEmails(adminEmails.filter(e => e !== email));
  };

  const executeDeletion = async () => {
    if (!delEmail.trim()) return;
    if (!window.confirm(`${delEmail.trim()} のすべてのデータを削除します。この操作は取り消せません。\n\n続行しますか？`)) return;
    setDelExecuting(true);
    setDelError('');
    setDelDone(false);
    try {
      const res = await adminFetch(`${API_ENDPOINT}/admin/direct-delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: delEmail.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setDelError(data.error || '削除に失敗しました'); setDelExecuting(false); return; }
      setDelDone(true);
    } catch { setDelError('通信エラーが発生しました'); }
    setDelExecuting(false);
  };

  const fetchAboutContent = async () => {
    setAboutLoading(true);
    try {
      const res = await fetch(`${API_ENDPOINT}/settings/about`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setAboutSections(prev => ({ ...prev, ...data.sections }));
    } catch {}
    setAboutLoading(false);
  };

  const saveAboutSection = async (key: string, value: string) => {
    setAboutSaving(true);
    setAboutSaved(false);
    try {
      const next = { ...aboutSections, [key]: value };
      await adminFetch(`${API_ENDPOINT}/admin/settings/about`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sections: next }),
      });
      setAboutSections(next);
      setAboutSaved(true);
      setTimeout(() => setAboutSaved(false), 3000);
    } catch { alert('保存に失敗しました'); }
    setAboutSaving(false);
  };

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

  const totalCount = useMemo(() => Object.values(examCounts).reduce((a, b) => a + b, 0), [examCounts]);

  const tabStyle = (t: Tab): React.CSSProperties => ({
    padding: '10px 16px',
    border: 'none',
    borderBottom: tab === t ? '3px solid var(--color-primary)' : '3px solid transparent',
    background: 'none',
    cursor: 'pointer',
    fontWeight: tab === t ? 700 : 400,
    color: tab === t ? 'var(--color-text-main)' : 'var(--color-text-sub)',
    fontSize: 'var(--font-size-md)',
    whiteSpace: 'nowrap',
    flexShrink: 0,
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
                    style={{ flex: 1, padding: '8px 12px', border: `1.5px solid ${editForm.correctAnswers.includes(choice) ? 'var(--color-success)' : 'var(--color-border)'}`, borderRadius: 'var(--border-radius-md)', fontSize: 'var(--font-size-sm)',
                      background: editForm.correctAnswers.includes(choice) ? 'var(--color-feedback-correct-bg)' : 'var(--color-bg-white)',
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
        <Card padding="var(--spacing-md) var(--spacing-lg)" style={{ background: 'var(--color-danger-light)', borderColor: 'var(--color-danger)', marginBottom: 'var(--spacing-xl)', display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)' }}>
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

      {/* ── グループナビゲーション ── */}
      {(() => {
        const activeGroup = getGroupForTab(tab);
        return (
          <div style={{ marginBottom: 'var(--spacing-xl)' }}>
            {/* グループ選択 */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 'var(--spacing-sm)' }}>
              {TAB_GROUPS.map(g => (
                <button
                  key={g.key}
                  onClick={() => setTab(g.tabs[0])}
                  style={{
                    padding: '5px 16px', border: 'none', borderRadius: 9999, cursor: 'pointer',
                    fontWeight: 600, fontSize: 'var(--font-size-sm)',
                    background: activeGroup === g.key ? 'var(--color-primary)' : 'var(--color-bg-main)',
                    color: activeGroup === g.key ? '#fff' : 'var(--color-text-sub)',
                    transition: 'background 0.15s',
                  }}
                >
                  {g.label}
                </button>
              ))}
            </div>
            {/* サブタブ */}
            <div className="admin-tabs" style={{ borderBottom: '1px solid var(--color-border)', display: 'flex', overflowX: 'auto', flexWrap: 'nowrap' }}>
              {TAB_GROUPS.find(g => g.key === activeGroup)!.tabs.map(t => (
                <button key={t} style={tabStyle(t)} onClick={() => setTab(t)}>
                  {t === 'messages' && messages.length > 0
                    ? `メッセージ (${messages.length})`
                    : t === 'dailyservice' && dailyServices.length > 0
                    ? `日めくりAWSサービス(${dailyServices.length})`
                    : TAB_LABELS[t]}
                </button>
              ))}
            </div>
          </div>
        );
      })()}

      {/* ── 問題管理 ── */}
      {tab === 'questions' && (
        <div>
          {/* ヘッダー行 */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
            <button
              onClick={() => { fetchQuestions(currentPage); fetchSummary(); }}
              style={{ padding: '5px 14px', background: 'transparent', color: 'var(--color-primary)', border: '1.5px solid var(--color-primary)', borderRadius: 9999, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
              更新
            </button>
          </div>
          {/* カバレッジ */}
          {totalCount > 0 && (validityCheckedCount != null || formatCheckedCount != null) && (
            <div style={{ display: 'flex', gap: 16, marginBottom: 14, flexWrap: 'wrap' }}>
              {[
                { label: 'AI確認', count: validityCheckedCount, color: 'var(--color-primary)' },
                { label: '体裁確認', count: formatCheckedCount, color: '#009E9E' },
              ].map(({ label, count, color }) => count == null ? null : (
                <div key={label} style={{ flex: '1 1 200px', minWidth: 200 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--color-text-sub)', marginBottom: 4 }}>
                    <span style={{ fontWeight: 600 }}>{label}</span>
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {count.toLocaleString()} / {totalCount.toLocaleString()}
                      <span style={{ marginLeft: 6, fontWeight: 700, color }}>{Math.round(count / totalCount * 100)}%</span>
                    </span>
                  </div>
                  <div style={{ height: 6, borderRadius: 9999, background: 'var(--color-border)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: 9999, background: color, width: `${Math.min(100, count / totalCount * 100)}%`, transition: 'width 0.4s' }} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 検索バー */}
          <form onSubmit={handleSearch} style={{ marginBottom: 16 }}>
            {/* 試験種別 */}
            {(() => {
              const examBtn = (type: string) => (
                <button key={type} type="button" onClick={() => { setExamFilter(type); setDomainFilter(''); }}
                  style={{
                    padding: '4px 12px', border: examFilter === type ? '2px solid' : '1.5px solid', borderRadius: 6, cursor: 'pointer',
                    background: examFilter === type ? 'var(--color-primary-light)' : 'transparent',
                    color: examFilter === type ? 'var(--color-primary)' : 'var(--color-text-sub)',
                    borderColor: examFilter === type ? 'var(--color-primary)' : 'var(--color-border)',
                    fontWeight: examFilter === type ? 700 : 400, fontSize: 13
                  }}>
                  {type === 'ALL'
                    ? `ALL${totalCount > 0 ? `(${totalCount})` : ''}`
                    : `${type}${examCounts[type] != null ? `(${examCounts[type]})` : ''}`}
                </button>
              );
              const levels = ['Foundational', 'Associate', 'Professional', 'Specialty'] as const;
              const byLevel: Record<string, string[]> = {};
              for (const t of EXAM_TYPES) {
                const lv = EXAM_LEVEL[t] ?? 'Other';
                (byLevel[lv] ??= []).push(t);
              }
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    {examBtn('ALL')}
                  </div>
                  {levels.map(lv => byLevel[lv]?.length ? (
                    <div key={lv} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11, color: 'var(--color-text-light)', fontWeight: 700, minWidth: 88, textAlign: 'right', flexShrink: 0 }}>{lv}</span>
                      <span style={{ width: 1, height: 16, background: 'var(--color-border)', display: 'inline-block', flexShrink: 0 }} />
                      {byLevel[lv].map(t => examBtn(t))}
                    </div>
                  ) : null)}
                </div>
              );
            })()}

            {/* ドメインフィルタ（試験種別が選択されている場合のみ） */}
            {examFilter !== 'ALL' && (
              <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <button type="button" onClick={() => setDomainFilter('')}
                  style={{ padding: '4px 10px', border: domainFilter === '' ? '2px solid' : '1.5px solid', borderRadius: 6, cursor: 'pointer', fontSize: 12,
                    background: domainFilter === '' ? 'var(--color-primary-light)' : 'transparent',
                    color: domainFilter === '' ? 'var(--color-primary)' : 'var(--color-text-sub)',
                    borderColor: domainFilter === '' ? 'var(--color-primary)' : 'var(--color-border)',
                    fontWeight: domainFilter === '' ? 700 : 400 }}>
                  全ドメイン{examCounts[examFilter] != null ? `(${examCounts[examFilter]})` : ''}
                </button>
                <span style={{ width: 1, height: 16, background: 'var(--color-border)', display: 'inline-block', flexShrink: 0 }} />
                {EXAM_DOMAINS[examFilter]?.map(d => (
                  <button key={d} type="button" onClick={() => setDomainFilter(domainFilter === d ? '' : d)}
                    style={{ padding: '4px 10px', border: domainFilter === d ? '2px solid' : '1.5px solid', borderRadius: 6, cursor: 'pointer', fontSize: 12,
                      background: domainFilter === d ? 'var(--color-primary-light)' : 'transparent',
                      color: domainFilter === d ? 'var(--color-primary)' : 'var(--color-text-sub)',
                      borderColor: domainFilter === d ? 'var(--color-primary)' : 'var(--color-border)',
                      fontWeight: domainFilter === d ? 700 : 400 }}>
                    {d}{domainCountsByExam[examFilter]?.[d] != null ? `(${domainCountsByExam[examFilter][d]})` : ''}
                  </button>
                ))}
              </div>
            )}

            {/* ソート */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 12, color: 'var(--color-text-sub)', fontWeight: 700, flexShrink: 0 }}>ソート:</span>
              <select
                value={sortBy}
                onChange={e => { setSortBy(e.target.value as typeof sortBy); setCurrentPage(0); }}
                style={{ padding: '5px 10px', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: 13, background: 'var(--color-bg-white)', color: 'var(--color-text-main)', cursor: 'pointer', outline: 'none' }}
              >
                <option value="id_asc">ID (昇順)</option>
                <option value="createdAt_desc">作成日 (新しい順)</option>
                <option value="createdAt_asc">作成日 (古い順)</option>
                <option value="updatedAt_desc">最終編集 (新しい順)</option>
                <option value="updatedAt_asc">最終編集 (古い順)</option>
                <option value="validityCheckedAt_desc">AI確認 (新しい順)</option>
                <option value="validityCheckedAt_asc">AI確認 (古い順)</option>
                <option value="formatCheckedAt_desc">体裁確認 (新しい順)</option>
                <option value="formatCheckedAt_asc">体裁確認 (古い順)</option>
              </select>
            </div>

            {/* キーワード・タグ検索（チップ形式） */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <div style={{ flex: 2, minWidth: 180 }}>
                <input
                  value={keywordInput}
                  onChange={e => setKeywordInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const kw = keywordInput.trim();
                      setKeyword(kw);
                      setKeywordInput('');
                    }
                  }}
                  placeholder="問題ID・問題文で検索 (Enter で確定)"
                  style={{ width: '100%', padding: '6px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
                  onFocus={e => e.currentTarget.style.borderColor = 'var(--color-primary)'}
                  onBlur={e => e.currentTarget.style.borderColor = 'var(--color-border)'}
                />
                {keyword && (
                  <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 8px 2px 10px', background: 'var(--color-primary-light)', color: 'var(--color-primary)', borderRadius: 9999, fontSize: 12, fontWeight: 600 }}>
                      {keyword}
                      <button onClick={() => setKeyword('')}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-primary)', fontSize: 15, lineHeight: 1, padding: '0 0 0 2px', display: 'flex', alignItems: 'center' }}>×</button>
                    </span>
                  </div>
                )}
              </div>
              <div style={{ flex: 1, minWidth: 140 }}>
                <input
                  value={tagInput}
                  onChange={e => setTagInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const tag = tagInput.trim();
                      setTagFilter(tag);
                      setTagInput('');
                    }
                  }}
                  placeholder="タグで絞り込み (Enter で確定)"
                  style={{ width: '100%', padding: '6px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
                  onFocus={e => e.currentTarget.style.borderColor = 'var(--color-primary)'}
                  onBlur={e => e.currentTarget.style.borderColor = 'var(--color-border)'}
                />
                {tagFilter && (
                  <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 8px 2px 10px', background: 'var(--color-primary-light)', color: 'var(--color-primary)', borderRadius: 9999, fontSize: 12, fontWeight: 600 }}>
                      {tagFilter}
                      <button onClick={() => setTagFilter('')}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-primary)', fontSize: 15, lineHeight: 1, padding: '0 0 0 2px', display: 'flex', alignItems: 'center' }}>×</button>
                    </span>
                  </div>
                )}
              </div>
            </div>
          </form>

          {/* 件数・一括削除バー */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <p style={{ color: 'var(--color-text-sub)', fontSize: 13, margin: 0 }}>
              {loadingQ ? '読み込み中...' : totalQuestions > 0
                ? `${totalQuestions} 件中 ${currentPage * PAGE_SIZE + 1}–${Math.min((currentPage + 1) * PAGE_SIZE, totalQuestions)} 件表示`
                : `${questions.length} 件`}
            </p>
            {selectedIds.size > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 13, color: 'var(--color-primary)', fontWeight: 700 }}>{selectedIds.size}件選択中</span>
                <button
                  onClick={handleBulkDelete}
                  disabled={bulkDeleting}
                  style={{
                    padding: '6px 16px', fontSize: 13, fontWeight: 700, borderRadius: 9999, cursor: bulkDeleting ? 'default' : 'pointer',
                    background: bulkDeleting ? 'var(--color-border)' : 'var(--color-bg-white)',
                    color: bulkDeleting ? 'var(--color-text-light)' : 'var(--color-danger)',
                    border: `1.5px solid ${bulkDeleting ? 'var(--color-border)' : 'var(--color-danger)'}`
                  }}>
                  {bulkDeleting ? '削除中...' : `${selectedIds.size}件を削除`}
                </button>
                <button
                  onClick={() => setSelectedIds(new Set())}
                  style={{ padding: '6px 12px', fontSize: 13, fontWeight: 700, borderRadius: 9999, cursor: 'pointer', background: 'transparent', color: 'var(--color-text-sub)', border: '1px solid var(--color-border)' }}>
                  選択解除
                </button>
              </div>
            )}
          </div>

          {/* 全選択ヘッダー */}
          {questions.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px', background: 'var(--color-bg-main)', border: '1px solid #eaeded', borderRadius: 6, marginBottom: 4 }}>
              <input
                type="checkbox"
                checked={selectedIds.size === questions.length}
                onChange={toggleSelectAll}
                style={{ width: 16, height: 16, cursor: 'pointer', flexShrink: 0 }}
              />
              <span style={{ fontSize: 12, color: 'var(--color-text-sub)', fontWeight: 700 }}>
                {selectedIds.size === questions.length ? '全選択解除' : '全選択'}
              </span>
            </div>
          )}

          {/* 問題リスト */}
          {loadingQ && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {[0, 1, 2, 3, 4].map(i => (
                <div key={i} style={{ border: '1px solid #eaeded', borderRadius: 6, padding: '14px 16px', background: 'var(--color-bg-white)' }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <div className="skeleton" style={{ width: 16, height: 16, borderRadius: 3, flexShrink: 0 }} />
                    <div className="skeleton" style={{ width: 52, height: 18, borderRadius: 4 }} />
                    <div className="skeleton" style={{ flex: 1, height: 16, borderRadius: 4 }} />
                    <div className="skeleton" style={{ width: 80, height: 14, borderRadius: 4 }} />
                  </div>
                </div>
              ))}
            </div>
          )}
          {!loadingQ && questions.map(q => (
            <div key={q.questionId} style={{ border: '1px solid #eaeded', borderRadius: 6, marginBottom: 4, overflow: 'hidden', boxShadow: '0 1px 1px 0 rgba(0,28,36,0.1)', background: selectedIds.has(q.questionId) ? 'var(--color-primary-light)' : 'transparent' }}>
              {/* ヘッダー行 */}
              <div
                onClick={() => {
                  const next = expandedId === q.questionId ? null : q.questionId;
                  setExpandedId(next);
                  if (next && !expandedDetail[next]) {
                    adminFetch(`${API_ENDPOINT}/admin/questions/${next}`)
                      .then(r => r.json()).then(d => setExpandedDetail(prev => ({ ...prev, [next]: d })));
                  }
                }}
                style={{ display: 'flex', alignItems: 'center', padding: '10px 16px', cursor: 'pointer', background: selectedIds.has(q.questionId) ? 'var(--color-primary-light)' : expandedId === q.questionId ? 'var(--color-bg-main)' : 'var(--color-bg-white)', gap: 10 }}>
                <input
                  type="checkbox"
                  checked={selectedIds.has(q.questionId)}
                  onChange={() => toggleSelect(q.questionId)}
                  onClick={e => e.stopPropagation()}
                  style={{ width: 16, height: 16, cursor: 'pointer', flexShrink: 0 }}
                />
                <span style={{ color: 'var(--color-text-sub)', flexShrink: 0, display: 'flex' }}>{expandedId === q.questionId ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}</span>
                <Badge variant="secondary">{q.examType}</Badge>
                <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--color-text-sub)', flexShrink: 0, minWidth: 100 }}>{q.questionId}</span>
                <span style={{ fontSize: 14, color: 'var(--color-text-main)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {q.questionText}
                </span>
                {q.validityCheckedAt && (
                  <span style={{ fontSize: 11, color: 'var(--color-text-light)', flexShrink: 0, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 3 }}>
                    <span style={{ color: 'var(--color-success)', fontWeight: 700 }}>✓</span>
                    AI: {fmtDate(q.validityCheckedAt)}
                  </span>
                )}
                {q.formatCheckedAt && (
                  <span style={{ fontSize: 11, color: 'var(--color-text-light)', flexShrink: 0, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 3 }}>
                    <span style={{ color: '#009E9E', fontWeight: 700 }}>✓</span>
                    体裁: {fmtDate(q.formatCheckedAt)}
                  </span>
                )}
                {q.updatedAt && (
                  <span style={{ fontSize: 11, color: 'var(--color-text-light)', flexShrink: 0, whiteSpace: 'nowrap' }}>
                    編集: {fmtDate(q.updatedAt)}
                  </span>
                )}
                <button
                  onClick={e => { e.stopPropagation(); openEdit(q); }}
                  style={{ padding: '4px 12px', background: 'transparent', color: 'var(--color-text-sub)', border: '1px solid var(--color-border)', borderRadius: 9999, cursor: 'pointer', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                  編集
                </button>
                <button
                  onClick={e => { e.stopPropagation(); handleDelete(q); }}
                  disabled={deletingId === q.questionId}
                  style={{
                    padding: '4px 12px',
                    background: 'transparent',
                    color: deletingId === q.questionId ? 'var(--color-text-light)' : 'var(--color-danger)',
                    border: `1.5px solid ${deletingId === q.questionId ? 'var(--color-border)' : 'var(--color-danger)'}`,
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
              {expandedId === q.questionId && (() => {
                const detail = expandedDetail[q.questionId];
                return (
                  <div style={{ padding: '14px 16px', borderTop: '1px solid #e8e8e8', background: 'var(--color-bg-main)', fontSize: 13 }}>
                    <p style={{ fontWeight: 'bold', marginTop: 0, whiteSpace: 'pre-wrap' }}>{q.questionText}</p>
                    {q.isMultiple && <p style={{ color: 'var(--color-text-info)', fontSize: 12 }}>複数選択</p>}

                    <div style={{ marginBottom: 12 }}>
                      {q.choices.map((c, i) => {
                        const isCorrect = q.correctAnswers?.includes(c);
                        return (
                          <div key={i} style={{
                            padding: '6px 10px', marginBottom: 4, borderRadius: 6,
                            background: isCorrect ? 'var(--color-feedback-correct-bg)' : 'var(--color-bg-main)',
                            border: `1.5px solid ${isCorrect ? 'var(--color-success)' : 'var(--color-border)'}`,
                            color: isCorrect ? 'var(--color-success)' : 'var(--color-text-sub)',
                          }}>
                            <span style={{ whiteSpace: 'pre-wrap' }}>{isCorrect ? '✓ ' : ''}{c}</span>
                          </div>
                        );
                      })}
                    </div>

                    <div style={{ background: 'var(--color-primary-light)', borderRadius: 6, padding: '10px 12px', marginBottom: 10, color: 'var(--color-text-main)', lineHeight: 1.6 }}>
                      <strong>解説：</strong>
                      {detail
                        ? <span style={{ whiteSpace: 'pre-wrap' }}>{detail.explanation ?? '（解説なし）'}</span>
                        : <span style={{ color: 'var(--color-text-light)' }}>読み込み中…</span>}
                    </div>

                    {q.domain && (
                      <div style={{ fontSize: 12, color: 'var(--color-text-sub)', marginBottom: 4 }}>
                        ドメイン: <span style={{ fontWeight: 700 }}>{q.domain}</span>
                      </div>
                    )}
                    <div style={{ color: 'var(--color-text-light)', fontSize: 12, marginBottom: 4 }}>
                      タグ: {q.tags?.length ? q.tags.map(t => (
                        <span key={t} style={{ display: 'inline-block', background: 'var(--color-bg-main)', border: '1px solid #d1d5db', borderRadius: 6, padding: '1px 6px', marginRight: 4, fontSize: 11 }}>{t}</span>
                      )) : 'なし'}
                    </div>
                    <div style={{ color: 'var(--color-text-light)', fontSize: 11, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                      {q.createdAt && <span>作成: {fmtDate(q.createdAt)}</span>}
                      {q.updatedAt && <span>編集: {fmtDate(q.updatedAt)}</span>}
                      {q.validityCheckedAt && <span>AI確認: {fmtDate(q.validityCheckedAt)}</span>}
                      {detail?.formatCheckedAt && <span>体裁確認: {fmtDate(detail.formatCheckedAt)}</span>}
                    </div>
                  </div>
                );
              })()}
            </div>
          ))}

          {!loadingQ && questions.length === 0 && (
            <p style={{ color: 'var(--color-text-light)', textAlign: 'center', padding: 40 }}>問題が見つかりません</p>
          )}

          {/* ページネーション */}
          {totalQuestions > PAGE_SIZE && !loadingQ && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 20, padding: '12px 0' }}>
              <button
                onClick={() => { fetchQuestions(currentPage - 1); setSelectedIds(new Set()); }}
                disabled={currentPage === 0}
                style={{ padding: '6px 16px', borderRadius: 9999, border: '1px solid var(--color-border)', background: currentPage === 0 ? 'var(--color-bg-main)' : 'var(--color-bg-white)', color: currentPage === 0 ? 'var(--color-text-light)' : 'var(--color-text-main)', cursor: currentPage === 0 ? 'default' : 'pointer', fontWeight: 700, fontSize: 13 }}>
                ← 前
              </button>
              <span style={{ fontSize: 13, color: 'var(--color-text-sub)' }}>
                {currentPage + 1} / {Math.ceil(totalQuestions / PAGE_SIZE)} ページ
              </span>
              <button
                onClick={() => { fetchQuestions(currentPage + 1); setSelectedIds(new Set()); }}
                disabled={(currentPage + 1) * PAGE_SIZE >= totalQuestions}
                style={{ padding: '6px 16px', borderRadius: 9999, border: '1px solid var(--color-border)', background: (currentPage + 1) * PAGE_SIZE >= totalQuestions ? 'var(--color-bg-main)' : 'var(--color-bg-white)', color: (currentPage + 1) * PAGE_SIZE >= totalQuestions ? 'var(--color-text-light)' : 'var(--color-text-main)', cursor: (currentPage + 1) * PAGE_SIZE >= totalQuestions ? 'default' : 'pointer', fontWeight: 700, fontSize: 13 }}>
                次 →
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── 通報確認 ── */}
      {tab === 'reports' && (
        <div>
          <p style={{ color: 'var(--color-text-light)', fontSize: 13, marginBottom: 16 }}>
            {loadingR ? '読み込み中...' : `${reports.length} 件`}
          </p>

          {reports.map(r => (
            <div key={r.reportId} style={{ border: '1px solid #eaeded', borderRadius: 6, padding: '14px 16px', marginBottom: 8, background: 'var(--color-bg-white)', boxShadow: '0 1px 1px 0 rgba(0,28,36,0.1)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8, gap: 8 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontFamily: 'monospace', fontSize: 12, background: 'var(--color-bg-main)', padding: '2px 8px', borderRadius: 6, color: 'var(--color-text-sub)', border: '1px solid #d1d5db' }}>
                    {r.questionId}
                  </span>
                  {r.category && (
                    <span style={{ fontSize: 11, background: 'var(--color-bg-warning)', color: 'var(--color-text-warning)', padding: '2px 8px', borderRadius: 9999, fontWeight: 700, border: '1px solid #ffc107' }}>
                      {REPORT_CATEGORY_LABEL[r.category] ?? r.category}
                    </span>
                  )}
                  <span style={{ fontSize: 12, color: 'var(--color-text-sub)' }}>
                    {new Date(r.reportedAt).toLocaleString('ja-JP')}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button
                    onClick={() => {
                      setTab('questions');
                      setKeyword(r.questionId);
                      setTimeout(() => fetchQuestions(), 100);
                    }}
                    style={{ fontSize: 12, padding: '4px 12px', border: '1.5px solid var(--color-primary)', borderRadius: 9999, cursor: 'pointer', background: 'transparent', color: 'var(--color-primary)', fontWeight: 700 }}>
                    問題を確認
                  </button>
                  <button
                    onClick={() => deleteReport(r.reportId)}
                    style={{ fontSize: 12, padding: '4px 12px', border: '1px solid #d1d5db', borderRadius: 9999, cursor: 'pointer', background: 'transparent', color: 'var(--color-text-sub)', fontWeight: 700 }}
                    title="解決済みとして削除">
                    ✓ 解決済み
                  </button>
                </div>
              </div>
              <p style={{ margin: '0 0 6px', color: 'var(--color-text-main)', fontSize: 14 }}>{r.message || '（メッセージなし）'}</p>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-sub)' }}>通報者: {r.userId}</p>
            </div>
          ))}

          {!loadingR && reports.length === 0 && (
            <p style={{ color: 'var(--color-text-light)', textAlign: 'center', padding: 40 }}>通報はありません</p>
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
                <div style={{ fontSize: 12, color: 'var(--color-text-light)', marginBottom: 6 }}>試験種別</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {EXAM_TYPES.map(t => (
                    <button key={t} onClick={() => setImportExamType(t)}
                      style={{ padding: '4px 12px', border: importExamType === t ? '2px solid' : '1.5px solid', borderRadius: 6, cursor: 'pointer', fontSize: 13,
                        borderColor: importExamType === t ? 'var(--color-primary)' : 'var(--color-border)',
                        background: importExamType === t ? 'var(--color-primary-light)' : 'transparent',
                        color: importExamType === t ? 'var(--color-primary)' : 'var(--color-text-sub)',
                        fontWeight: importExamType === t ? 700 : 400 }}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-light)', marginBottom: 6 }}>タグ（カンマ区切り・任意）</div>
                <input value={importTags} onChange={e => setImportTags(e.target.value)}
                  placeholder="例: EC2, VPC, セキュリティ"
                  style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }} />
              </div>
            </div>

            {/* JSON入力 */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-light)' }}>JSONを貼り付けまたはファイルをアップロード</div>
                <label style={{ padding: '5px 12px', background: 'var(--color-bg-main)', border: '1px solid #d1d5db', borderRadius: 9999, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                  ファイルを選択
                  <input type="file" accept=".json" onChange={handleFileUpload} style={{ display: 'none' }} />
                </label>
              </div>
              <textarea value={importJson} onChange={e => { setImportJson(e.target.value); setImportParsed(null); setImportResult(null); setImportError(''); }}
                placeholder={EXAMPLE}
                rows={12}
                style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: 6,
                  fontSize: 13, fontFamily: 'monospace', resize: 'vertical', boxSizing: 'border-box',
                  background: 'var(--color-bg-main)' }} />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
              <button onClick={handleParse} disabled={!importJson.trim()}
                style={{ padding: '8px 20px', background: importJson.trim() ? 'var(--color-text-sub)' : 'var(--color-border)',
                  color: importJson.trim() ? 'white' : 'var(--color-text-light)', border: 'none', borderRadius: 9999, cursor: importJson.trim() ? 'pointer' : 'default', fontWeight: 700, fontSize: 14 }}>
                構文チェック
              </button>
              {importParsed && (
                <button onClick={handleImport} disabled={importing}
                  style={{ padding: '8px 24px', background: importing ? 'var(--color-border)' : 'transparent',
                    color: importing ? 'var(--color-text-light)' : 'var(--color-primary)', border: `1.5px solid ${importing ? 'var(--color-border)' : 'var(--color-primary)'}`, borderRadius: 9999, cursor: importing ? 'default' : 'pointer', fontWeight: 700, fontSize: 14 }}>
                  {importing ? 'インポート中...' : `${importParsed.length}件をインポート`}
                </button>
              )}
            </div>

            {importParsed && !importResult && (
              <div style={{ marginBottom: 16, padding: '10px 14px', background: 'var(--color-primary-light)', border: '1px solid #aab7b8', borderRadius: 6, fontSize: 13, color: 'var(--color-primary)' }}>
                ✓ {importParsed.length}件の問題を認識しました。「{importExamType}」としてインポートします。
              </div>
            )}
            {importError && (
              <div style={{ marginBottom: 16, padding: '10px 14px', background: 'var(--color-danger-light)', border: '1px solid #f5a09b', borderRadius: 6, fontSize: 13, color: 'var(--color-danger)' }}>
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
              const examFull = `${EXAM_CONFIGS[importExamType]?.fullName} (${EXAM_CONFIGS[importExamType]?.examCode})`;
              const topic = promptTopic.trim() || '（トピックを入力してください）';
              const count = parseInt(promptCount) || 5;
              const prompt = `あなたはAWS認定試験の問題作成の専門家です。
以下の条件に従い、試験問題を${count}問作成し、JSON配列のみを出力してください（前後の説明文は不要）。

【試験】${examFull}
【トピック】${topic}

【作問ルール】
・選択肢は必ず4つ（A. B. C. D. の形式）
・単一正解の場合は isMultiple: false、複数正解は isMultiple: true
・correctAnswers の文字列は choices の文字列と完全一致させること
・解説は「正解の理由」と「各不正解の理由」を含めること（150字以上）
・本番試験と同等の難易度・文体で作成すること
・examType には "${importExamType}" を必ず設定すること
・domain には以下のいずれかを設定すること: ${EXAM_DOMAINS[importExamType]?.join(' / ')}
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
                <div style={{ marginBottom: 16, background: 'var(--color-bg-main)', border: '1px solid #eaeded', borderRadius: 6, padding: '16px', boxShadow: '0 1px 1px 0 rgba(0,28,36,0.1)' }}>
                  <div style={{ fontWeight: 'bold', fontSize: 14, color: '#232f3e', marginBottom: 12 }}>AIプロンプト生成</div>

                  <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <div style={{ fontSize: 11, color: 'var(--color-text-light)', marginBottom: 4 }}>トピック / サービス名</div>
                      <input value={promptTopic} onChange={e => setPromptTopic(e.target.value)}
                        placeholder="例: S3のセキュリティ、EC2のネットワーク"
                        style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }} />
                    </div>
                    <div style={{ width: 80 }}>
                      <div style={{ fontSize: 11, color: 'var(--color-text-light)', marginBottom: 4 }}>問題数</div>
                      <input type="number" value={promptCount} onChange={e => setPromptCount(e.target.value)}
                        min={1} max={20}
                        style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }} />
                    </div>
                  </div>

                  <div style={{ position: 'relative' }}>
                    <pre style={{ background: 'var(--color-bg-white)', border: '1px solid #d1d5db', borderRadius: 6, padding: '12px 14px',
                      fontSize: 12, fontFamily: 'monospace', whiteSpace: 'pre-wrap', margin: 0,
                      color: '#333', lineHeight: 1.6, maxHeight: 260, overflowY: 'auto' }}>
                      {prompt}
                    </pre>
                    <button onClick={copyPrompt}
                      style={{ position: 'absolute', top: 8, right: 8,
                        padding: '4px 12px', fontSize: 12, borderRadius: 9999, cursor: 'pointer',
                        background: promptCopied ? 'var(--color-feedback-correct-bg)' : 'var(--color-bg-white)',
                        color: promptCopied ? 'var(--color-success)' : 'var(--color-primary)',
                        border: `1.5px solid ${promptCopied ? 'var(--color-success)' : 'var(--color-primary)'}`,
                        transition: 'all 0.2s', fontWeight: 700 }}>
                      {promptCopied ? '✓ コピー済み' : 'コピー'}
                    </button>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-light)', marginTop: 6 }}>
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
            <p style={{ color: 'var(--color-text-light)', fontSize: 13, margin: 0 }}>
              {loadingT ? '読み込み中...' : `${tips.length} 件`}
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { setShowTipPrompt(v => !v); setShowTipImport(false); setShowTipForm(false); }}
                style={{ padding: '7px 16px', background: showTipPrompt ? 'var(--color-primary-light)' : 'transparent', color: 'var(--color-primary)', border: '1.5px solid var(--color-primary)', borderRadius: 9999, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                AIプロンプト
              </button>
              <button onClick={() => { setShowTipImport(v => !v); setShowTipForm(false); setShowTipPrompt(false); }}
                style={{ padding: '7px 16px', background: showTipImport ? 'var(--color-primary-light)' : 'transparent', color: 'var(--color-primary)', border: '1.5px solid var(--color-primary)', borderRadius: 9999, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                JSONインポート
              </button>
              <button onClick={() => { setEditingTip(null); setTipForm({ examType: 'ALL', title: '', content: '' }); setShowTipForm(true); setShowTipImport(false); setShowTipPrompt(false); }}
                style={{ padding: '7px 16px', background: 'transparent', color: 'var(--color-primary)', border: '1.5px solid var(--color-primary)', borderRadius: 9999, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                ＋ 手動追加
              </button>
            </div>
          </div>

          {/* AIプロンプト生成 */}
          {showTipPrompt && (() => {
            const tipExamFull = tipPromptExamType === 'ALL'
              ? 'AWS認定試験全般'
              : `${EXAM_CONFIGS[tipPromptExamType]?.fullName} (${EXAM_CONFIGS[tipPromptExamType]?.examCode})`;
            const topic = tipPromptTopic.trim() || '（トピックを入力してください）';
            const count = parseInt(tipPromptCount) || 5;
            const prompt = `あなたはAWSクラウドの教育コンテンツ作成の専門家です。
以下の条件に従い、学習コラム（豆知識）を${count}件作成し、JSON配列のみを出力してください（前後の説明文は不要）。

【対象試験】${tipExamFull}
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
              <div style={{ border: '1px solid #eaeded', borderRadius: 6, padding: '20px 24px', marginBottom: 20, background: 'var(--color-bg-main)', boxShadow: '0 1px 1px 0 rgba(0,28,36,0.1)' }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--color-text-main)', marginBottom: 14 }}>AIプロンプト生成</div>

                <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--color-text-sub)', fontWeight: 700, marginBottom: 6 }}>対象試験</div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      {['ALL', 'CLF', 'SAA', 'SAP', 'DOP', 'AIF', 'MLA', 'GAI'].map(t => (
                        <React.Fragment key={t}>
                          <button type="button" onClick={() => setTipPromptExamType(t)}
                            style={{ padding: '4px 12px', border: tipPromptExamType === t ? '2px solid' : '1.5px solid', borderRadius: 6, cursor: 'pointer', fontSize: 13,
                              borderColor: tipPromptExamType === t ? 'var(--color-primary)' : 'var(--color-border)',
                              background: tipPromptExamType === t ? 'var(--color-primary-light)' : 'transparent',
                              color: tipPromptExamType === t ? 'var(--color-primary)' : 'var(--color-text-sub)',
                              fontWeight: tipPromptExamType === t ? 700 : 400 }}>
                            {t}
                          </button>
                          {t === 'ALL' && <span style={{ width: 1, height: 16, background: 'var(--color-border)', display: 'inline-block', flexShrink: 0 }} />}
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <div style={{ fontSize: 12, color: 'var(--color-text-sub)', fontWeight: 700, marginBottom: 6 }}>トピック / サービス名</div>
                    <input value={tipPromptTopic} onChange={e => setTipPromptTopic(e.target.value)}
                      placeholder="例: S3のライフサイクル、EC2のインスタンスタイプ"
                      style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, boxSizing: 'border-box', outline: 'none' }}
                      onFocus={e => e.currentTarget.style.borderColor = 'var(--color-primary)'}
                      onBlur={e => e.currentTarget.style.borderColor = 'var(--color-border)'}
                    />
                  </div>
                  <div style={{ width: 80 }}>
                    <div style={{ fontSize: 12, color: 'var(--color-text-sub)', fontWeight: 700, marginBottom: 6 }}>件数</div>
                    <input type="number" value={tipPromptCount} onChange={e => setTipPromptCount(e.target.value)}
                      min={1} max={20}
                      style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, boxSizing: 'border-box', outline: 'none' }}
                      onFocus={e => e.currentTarget.style.borderColor = 'var(--color-primary)'}
                      onBlur={e => e.currentTarget.style.borderColor = 'var(--color-border)'}
                    />
                  </div>
                </div>

                <div style={{ position: 'relative' }}>
                  <pre style={{ background: 'var(--color-bg-white)', border: '1px solid #d1d5db', borderRadius: 6, padding: '12px 14px',
                    fontSize: 12, fontFamily: 'monospace', whiteSpace: 'pre-wrap', margin: 0,
                    color: 'var(--color-text-main)', lineHeight: 1.6, maxHeight: 280, overflowY: 'auto' }}>
                    {prompt}
                  </pre>
                  <button onClick={copyPrompt}
                    style={{ position: 'absolute', top: 8, right: 8,
                      padding: '4px 12px', fontSize: 12, borderRadius: 9999, cursor: 'pointer',
                      background: tipPromptCopied ? 'var(--color-feedback-correct-bg)' : 'var(--color-bg-white)',
                      color: tipPromptCopied ? 'var(--color-success)' : 'var(--color-primary)',
                      border: `1.5px solid ${tipPromptCopied ? 'var(--color-success)' : 'var(--color-primary)'}`,
                      transition: 'all 0.2s', fontWeight: 700 }}>
                    {tipPromptCopied ? '✓ コピー済み' : 'コピー'}
                  </button>
                </div>
                <div style={{ fontSize: 11, color: 'var(--color-text-light)', marginTop: 6 }}>
                  このプロンプトをChatGPT / Claude / Gemini に貼り付け → 出力JSONを「JSONインポート」に貼り付けて登録
                </div>
              </div>
            );
          })()}

          {/* JSONインポートフォーム */}
          {showTipImport && (
            <div style={{ border: '1px solid #eaeded', borderRadius: 6, padding: '20px 24px', marginBottom: 20, background: 'var(--color-bg-main)', boxShadow: '0 1px 1px 0 rgba(0,28,36,0.1)' }}>
              <h4 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700 }}>コラムJSONインポート</h4>

              {/* デフォルト試験種別 */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-sub)', fontWeight: 700, marginBottom: 6 }}>
                  デフォルト試験種別 <span style={{ fontWeight: 400 }}>（JSON内に examType がない場合に使用）</span>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {['ALL', 'CLF', 'SAA', 'SAP'].map(t => (
                    <React.Fragment key={t}>
                      <button type="button" onClick={() => setTipImportExamType(t)}
                        style={{ padding: '5px 14px', border: tipImportExamType === t ? '2px solid' : '1.5px solid', borderRadius: 6, cursor: 'pointer', fontSize: 13,
                          background: tipImportExamType === t ? 'var(--color-primary-light)' : 'transparent',
                          color: tipImportExamType === t ? 'var(--color-primary)' : 'var(--color-text-sub)',
                          borderColor: tipImportExamType === t ? 'var(--color-primary)' : 'var(--color-border)',
                          fontWeight: tipImportExamType === t ? 700 : 400 }}>
                        {t}
                      </button>
                      {t === 'ALL' && <span style={{ width: 1, height: 16, background: 'var(--color-border)', display: 'inline-block', flexShrink: 0 }} />}
                    </React.Fragment>
                  ))}
                </div>
              </div>

              {/* JSON入力 */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-sub)', fontWeight: 700, marginBottom: 6 }}>JSON</div>
                <textarea
                  value={tipImportJson}
                  onChange={e => { setTipImportJson(e.target.value); setTipImportParsed(null); setTipImportError(''); setTipImportResult(null); }}
                  placeholder={JSON.stringify([{ examType: 'SAA', title: 'S3の結果整合性について', content: 'Amazon S3は強力な結果整合性を提供しており...' }], null, 2)}
                  rows={10}
                  style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, fontFamily: 'monospace', resize: 'vertical', boxSizing: 'border-box', background: 'var(--color-bg-white)', outline: 'none' }}
                  onFocus={e => e.currentTarget.style.borderColor = 'var(--color-primary)'}
                  onBlur={e => e.currentTarget.style.borderColor = 'var(--color-border)'}
                />
              </div>

              {/* エラー・結果 */}
              {tipImportError && (
                <div style={{ marginBottom: 12, padding: '10px 14px', background: '#fdf2f2', border: '1px solid #f5a09b', borderRadius: 6, fontSize: 13, color: 'var(--color-danger)' }}>
                  エラー: {tipImportError}
                </div>
              )}
              {tipImportParsed && !tipImportResult && (
                <div style={{ marginBottom: 12, padding: '10px 14px', background: 'var(--color-primary-light)', border: '1px solid #aab7b8', borderRadius: 6, fontSize: 13, color: 'var(--color-primary)' }}>
                  ✓ {tipImportParsed.length}件を認識しました
                </div>
              )}
              {tipImportResult !== null && (
                <div style={{ marginBottom: 12, padding: '10px 14px', background: '#eafaf1', border: '1px solid #6eb57d', borderRadius: 6, fontSize: 13, color: 'var(--color-success)', fontWeight: 700 }}>
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
                  style={{ padding: '7px 20px', background: tipImportJson.trim() ? 'var(--color-text-sub)' : 'var(--color-border)', color: tipImportJson.trim() ? 'white' : 'var(--color-text-light)', border: 'none', borderRadius: 9999, cursor: tipImportJson.trim() ? 'pointer' : 'default', fontSize: 13, fontWeight: 700 }}>
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
                    style={{ padding: '7px 24px', background: tipImporting ? 'var(--color-border)' : 'transparent', color: tipImporting ? 'var(--color-text-light)' : 'var(--color-primary)', border: `1.5px solid ${tipImporting ? 'var(--color-border)' : 'var(--color-primary)'}`, borderRadius: 9999, cursor: tipImporting ? 'default' : 'pointer', fontSize: 13, fontWeight: 700 }}>
                    {tipImporting ? 'インポート中...' : `${tipImportParsed.length}件をインポート`}
                  </button>
                )}
              </div>

              {/* フォーマット説明 */}
              <div style={{ marginTop: 16, padding: '12px 16px', background: 'var(--color-bg-main)', borderRadius: 6, fontSize: 12, color: 'var(--color-text-sub)' }}>
                <strong style={{ display: 'block', marginBottom: 4 }}>JSONフォーマット</strong>
                各オブジェクトに <code>title</code>（必須）、<code>content</code>（必須）、<code>examType</code>（任意: ALL / CLF / SAA / SAP）を含めてください。
                examType を省略するとデフォルト試験種別が使用されます。
              </div>
            </div>
          )}

          {/* フォーム */}
          {showTipForm && (
            <div style={{ border: '1px solid #eaeded', borderRadius: 6, padding: 20, marginBottom: 20, background: 'var(--color-bg-main)', boxShadow: '0 1px 1px 0 rgba(0,28,36,0.1)' }}>
              <h4 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 700, color: 'var(--color-text-main)' }}>{editingTip ? 'コラムを編集' : '新規コラム'}</h4>
              <div style={{ display: 'flex', gap: 6, marginBottom: 10, alignItems: 'center' }}>
                {['ALL', 'CLF', 'SAA', 'SAP'].map(t => (
                  <React.Fragment key={t}>
                    <button type="button" onClick={() => setTipForm(f => ({ ...f, examType: t }))}
                      style={{ padding: '4px 12px', border: tipForm.examType === t ? '2px solid' : '1.5px solid', borderRadius: 6, cursor: 'pointer', fontSize: 13,
                        borderColor: tipForm.examType === t ? 'var(--color-primary)' : 'var(--color-border)',
                        background: tipForm.examType === t ? 'var(--color-primary-light)' : 'transparent',
                        color: tipForm.examType === t ? 'var(--color-primary)' : 'var(--color-text-sub)',
                        fontWeight: tipForm.examType === t ? 700 : 400 }}>
                      {t}
                    </button>
                    {t === 'ALL' && <span style={{ width: 1, height: 16, background: 'var(--color-border)', display: 'inline-block', flexShrink: 0 }} />}
                  </React.Fragment>
                ))}
              </div>
              <input
                value={tipForm.title}
                onChange={e => setTipForm(f => ({ ...f, title: e.target.value }))}
                placeholder="タイトル"
                style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, marginBottom: 8, boxSizing: 'border-box', outline: 'none' }}
                onFocus={e => e.currentTarget.style.borderColor = 'var(--color-primary)'}
                onBlur={e => e.currentTarget.style.borderColor = 'var(--color-border)'}
              />
              <textarea
                value={tipForm.content}
                onChange={e => setTipForm(f => ({ ...f, content: e.target.value }))}
                placeholder="内容"
                rows={4}
                style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, resize: 'vertical', boxSizing: 'border-box', outline: 'none' }}
                onFocus={e => e.currentTarget.style.borderColor = 'var(--color-primary)'}
                onBlur={e => e.currentTarget.style.borderColor = 'var(--color-border)'}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 12, borderTop: '1px solid #eaeded', paddingTop: 12 }}>
                <button onClick={handleSaveTip}
                  style={{ padding: '7px 20px', background: '#ff9900', color: 'var(--color-text-main)', border: '1px solid transparent', borderRadius: 9999, cursor: 'pointer', fontWeight: 700, fontSize: 14 }}>
                  保存
                </button>
                <button onClick={() => { setShowTipForm(false); setEditingTip(null); }}
                  style={{ padding: '7px 16px', border: '1px solid var(--color-border)', borderRadius: 9999, cursor: 'pointer', background: 'transparent', fontWeight: 700, fontSize: 14 }}>
                  キャンセル
                </button>
              </div>
            </div>
          )}

          {/* コラム一覧 */}
          {tips.map(tip => (
            <div key={tip.tipId} style={{ border: '1px solid #eaeded', borderRadius: 6, padding: '12px 16px', marginBottom: 8, background: 'var(--color-bg-white)', boxShadow: '0 1px 1px 0 rgba(0,28,36,0.1)' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <span style={{
                  background: '#232f3e',
                  color: 'white', fontSize: 11, padding: '2px 8px', borderRadius: 12, flexShrink: 0, marginTop: 2, fontWeight: 700,
                }}>{tip.examType}</span>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: '0 0 4px', fontWeight: 700, fontSize: 14, color: 'var(--color-text-main)' }}>{tip.title}</p>
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-sub)', lineHeight: 1.6 }}>{tip.content}</p>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button onClick={() => { setEditingTip(tip); setTipForm({ examType: tip.examType, title: tip.title, content: tip.content }); setShowTipForm(true); }}
                    style={{ padding: '4px 10px', border: '1px solid var(--color-border)', borderRadius: 9999, cursor: 'pointer', background: 'transparent', fontSize: 12, fontWeight: 700 }}>
                    編集
                  </button>
                  <button onClick={() => handleDeleteTip(tip)}
                    style={{ padding: '4px 10px', background: 'transparent', color: 'var(--color-danger)', border: '1px solid #d13212', borderRadius: 9999, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                    削除
                  </button>
                </div>
              </div>
            </div>
          ))}

          {!loadingT && tips.length === 0 && (
            <p style={{ color: 'var(--color-text-light)', textAlign: 'center', padding: 40 }}>コラムはありません</p>
          )}
        </div>
      )}

      {/* ── リリースノート管理 ── */}
      {tab === 'releases' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <p style={{ color: 'var(--color-text-light)', fontSize: 13, margin: 0 }}>
              {loadingRel ? '読み込み中...' : `${releases.length} 件`}
            </p>
            <button
              onClick={() => {
                setEditingRelease(null);
                setReleaseForm({ date: new Date().toISOString().slice(0, 10), title: '', body: '' });
                setShowReleaseForm(true);
              }}
              style={{ padding: '7px 16px', background: 'transparent', color: 'var(--color-primary)', border: '1.5px solid var(--color-primary)', borderRadius: 9999, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
              ＋ 新規追加
            </button>
          </div>

          {showReleaseForm && (
            <div style={{ border: '1px solid #eaeded', borderRadius: 6, padding: '20px 24px', marginBottom: 20, background: 'var(--color-bg-main)', boxShadow: '0 1px 1px 0 rgba(0,28,36,0.1)' }}>
              <h4 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 700, color: 'var(--color-text-main)' }}>
                {editingRelease ? 'リリースノートを編集' : '新規リリースノート'}
              </h4>
              <div style={{ marginBottom: 10 }}>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--color-text-sub)', fontWeight: 700, marginBottom: 4 }}>日付</label>
                <input
                  type="date" value={releaseForm.date}
                  onChange={e => setReleaseForm(f => ({ ...f, date: e.target.value }))}
                  style={{ padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, outline: 'none' }}
                  onFocus={e => e.currentTarget.style.borderColor = 'var(--color-primary)'}
                  onBlur={e => e.currentTarget.style.borderColor = 'var(--color-border)'}
                />
              </div>
              <div style={{ marginBottom: 10 }}>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--color-text-sub)', fontWeight: 700, marginBottom: 4 }}>タイトル</label>
                <input
                  value={releaseForm.title}
                  onChange={e => setReleaseForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="例：問題追加・機能改善"
                  style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, boxSizing: 'border-box', outline: 'none' }}
                  onFocus={e => e.currentTarget.style.borderColor = 'var(--color-primary)'}
                  onBlur={e => e.currentTarget.style.borderColor = 'var(--color-border)'}
                />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--color-text-sub)', fontWeight: 700, marginBottom: 4 }}>本文</label>
                <textarea
                  value={releaseForm.body}
                  onChange={e => setReleaseForm(f => ({ ...f, body: e.target.value }))}
                  placeholder="変更内容を記入してください"
                  rows={5}
                  style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, resize: 'vertical', boxSizing: 'border-box', outline: 'none' }}
                  onFocus={e => e.currentTarget.style.borderColor = 'var(--color-primary)'}
                  onBlur={e => e.currentTarget.style.borderColor = 'var(--color-border)'}
                />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={handleSaveRelease}
                  style={{ padding: '7px 20px', background: '#ff9900', color: 'var(--color-text-main)', border: '1px solid transparent', borderRadius: 9999, cursor: 'pointer', fontWeight: 700, fontSize: 14 }}>
                  保存
                </button>
                <button onClick={() => { setShowReleaseForm(false); setEditingRelease(null); }}
                  style={{ padding: '7px 16px', border: '1px solid var(--color-border)', borderRadius: 9999, cursor: 'pointer', background: 'transparent', fontWeight: 700, fontSize: 14 }}>
                  キャンセル
                </button>
              </div>
            </div>
          )}

          {[...releases].sort((a, b) => b.date.localeCompare(a.date)).map(r => (
            <div key={r.releaseId} style={{ border: '1px solid #eaeded', borderRadius: 6, padding: '14px 18px', marginBottom: 8, background: 'var(--color-bg-white)', boxShadow: '0 1px 1px 0 rgba(0,28,36,0.1)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, color: '#879596', fontWeight: 700, marginBottom: 3 }}>{r.date}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-main)', marginBottom: 4 }}>{r.title}</div>
                  <div style={{ fontSize: 13, color: 'var(--color-text-sub)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{r.body}</div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button
                    onClick={() => { setEditingRelease(r); setReleaseForm({ date: r.date, title: r.title, body: r.body }); setShowReleaseForm(true); }}
                    style={{ padding: '4px 10px', border: '1px solid var(--color-border)', borderRadius: 9999, cursor: 'pointer', background: 'transparent', fontSize: 12, fontWeight: 700 }}>
                    編集
                  </button>
                  <button
                    onClick={() => handleDeleteRelease(r)}
                    style={{ padding: '4px 10px', background: 'transparent', color: 'var(--color-danger)', border: '1px solid #d13212', borderRadius: 9999, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                    削除
                  </button>
                </div>
              </div>
            </div>
          ))}

          {!loadingRel && releases.length === 0 && (
            <p style={{ color: 'var(--color-text-light)', textAlign: 'center', padding: 40 }}>リリースノートはありません</p>
          )}
        </div>
      )}
      {tab === 'scan' && (() => {
        const filteredFlagged = flaggedQuestions
          .filter(q => scanExamFilter === 'ALL' || q.examType === scanExamFilter)
          .filter(q => validityFilter !== 'fixed' || !!q.validityEditLog)
          .sort((a, b) => {
            const da = a.validityCheckedAt ? new Date(a.validityCheckedAt).getTime() : 0;
            const db = b.validityCheckedAt ? new Date(b.validityCheckedAt).getTime() : 0;
            return scanSort === 'date_asc' ? da - db : db - da;
          });

        const fixedCount = flaggedQuestions.filter(q => !!q.validityEditLog).length;

        return (
          <div>
            {/* 進捗・統計 */}
            {!loadingFlagged && totalCount > 0 && validityFilter !== 'hidden' && (
              <div style={{ background: 'var(--color-bg-main)', border: '1px solid #eaeded', borderRadius: 8, padding: '14px 18px', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ fontSize: 13, color: 'var(--color-text-sub)' }}>
                    確認済み <strong style={{ color: 'var(--color-text-main)', fontSize: 15 }}>{flaggedQuestions.length}</strong> / {totalCount} 問
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-light)' }}>
                    未確認 {totalCount - flaggedQuestions.length} 問
                  </div>
                </div>
                <div style={{ height: 8, background: 'var(--color-border)', borderRadius: 9999, overflow: 'hidden' }}>
                  <div style={{ height: '100%', background: 'var(--color-primary)', borderRadius: 9999, width: `${Math.min(100, (flaggedQuestions.length / totalCount) * 100)}%`, transition: 'width 0.4s' }} />
                </div>
              </div>
            )}

            {/* フィルター・再読み込み */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {([
                  { key: 'all', label: '全チェック済み' },
                  { key: 'fixed', label: `AI修正済み (${fixedCount})` },
                  { key: 'hidden', label: '非表示中' },
                ] as const).map(({ key, label }) => (
                  <button key={key} onClick={() => { setValidityFilter(key); fetchFlagged(key); }}
                    style={{ padding: '6px 14px', border: validityFilter === key ? '2px solid' : '1.5px solid', borderRadius: 9999, cursor: 'pointer', fontSize: 13, fontWeight: validityFilter === key ? 700 : 400,
                      background: validityFilter === key ? 'var(--color-primary-light)' : 'transparent',
                      color: validityFilter === key ? 'var(--color-primary)' : 'var(--color-text-sub)',
                      borderColor: validityFilter === key ? 'var(--color-primary)' : 'var(--color-border)', }}>
                    {label}
                    {key === 'all' && !loadingFlagged && validityFilter === 'all' && ` (${flaggedQuestions.length})`}
                  </button>
                ))}
              </div>
              <button onClick={() => fetchFlagged(validityFilter)}
                style={{ padding: '6px 16px', background: 'transparent', color: 'var(--color-primary)', border: '1.5px solid var(--color-primary)', borderRadius: 9999, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                再読み込み
              </button>
            </div>

            {/* クライアントサイドフィルター */}
            {!loadingFlagged && flaggedQuestions.length > 0 && (
              <div style={{ background: '#f8f9fa', border: '1px solid #eaeded', borderRadius: 8, padding: '12px 16px', marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>
                {/* 試験種別 */}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#879596', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>試験種別</div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                    {(['ALL', ...EXAM_TYPES] as string[]).map(et => (
                      <React.Fragment key={et}>
                        <button onClick={() => setScanExamFilter(et)}
                          style={{ padding: '3px 10px', border: scanExamFilter === et ? '2px solid' : '1.5px solid', borderRadius: 9999, cursor: 'pointer', fontSize: 12, fontWeight: scanExamFilter === et ? 700 : 400,
                            background: scanExamFilter === et ? 'var(--color-secondary)' : 'transparent',
                            color: scanExamFilter === et ? 'white' : 'var(--color-text-sub)',
                            borderColor: scanExamFilter === et ? 'var(--color-secondary)' : 'var(--color-border)', }}>
                          {et}
                        </button>
                        {et === 'ALL' && <span style={{ width: 1, height: 14, background: 'var(--color-border)', display: 'inline-block', flexShrink: 0 }} />}
                      </React.Fragment>
                    ))}
                  </div>
                </div>

                {/* ソート */}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#879596', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>並べ替え</div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {([
                      { key: 'date_desc', label: '新→古' },
                      { key: 'date_asc', label: '古→新' },
                    ] as const).map(({ key, label }) => (
                      <button key={key} onClick={() => setScanSort(key)}
                        style={{ padding: '3px 10px', border: scanSort === key ? '2px solid' : '1.5px solid', borderRadius: 9999, cursor: 'pointer', fontSize: 12, fontWeight: scanSort === key ? 700 : 400,
                          background: scanSort === key ? 'var(--color-primary-light)' : 'transparent',
                          color: scanSort === key ? 'var(--color-primary)' : 'var(--color-text-sub)',
                          borderColor: scanSort === key ? 'var(--color-primary)' : 'var(--color-border)', }}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 件数 */}
                <div style={{ marginLeft: 'auto', alignSelf: 'flex-end', fontSize: 12, color: '#879596' }}>
                  {filteredFlagged.length} / {flaggedQuestions.length} 件
                </div>
              </div>
            )}

            {loadingFlagged && <p style={{ color: 'var(--color-text-sub)', fontSize: 13, padding: 20, textAlign: 'center' }}>読み込み中...</p>}

            {!loadingFlagged && flaggedQuestions.length === 0 && (
              <p style={{ color: 'var(--color-text-light)', textAlign: 'center', padding: 40 }}>
                {validityFilter === 'hidden' ? '非表示中の問題はありません' : 'チェック済みの問題はありません'}
              </p>
            )}

            {!loadingFlagged && flaggedQuestions.length > 0 && filteredFlagged.length === 0 && (
              <p style={{ color: 'var(--color-text-light)', textAlign: 'center', padding: 40 }}>フィルター条件に一致する問題はありません</p>
            )}

            {filteredFlagged.map(q => {
              const editLog: ValidityEditLog | null = (() => {
                if (!q.validityEditLog) return null;
                try { return JSON.parse(q.validityEditLog); } catch { return null; }
              })();
              const hasEdit = !!editLog;
              const borderColor = hasEdit ? '#d47500' : q.isHidden ? 'var(--color-danger)' : 'var(--color-primary)';
              return (
                <div key={q.questionId} style={{ background: 'var(--color-bg-white)', border: `1.5px solid ${q.isHidden ? 'var(--color-danger)' : 'var(--color-border)'}`, borderLeft: `4px solid ${borderColor}`, borderRadius: 6, padding: '14px 18px', marginBottom: 8, boxShadow: '0 1px 1px 0 rgba(0,28,36,0.07)' }}>
                  {/* ヘッダー行 */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                    <span style={{ background: '#232f3e', color: 'white', fontSize: 11, padding: '2px 8px', borderRadius: 12, fontWeight: 700 }}>{q.examType}</span>
                    {q.domain && (
                      <span style={{ fontSize: 11, color: '#879596', background: 'var(--color-bg-main)', padding: '2px 8px', borderRadius: 12 }}>{q.domain}</span>
                    )}
                    {hasEdit ? (
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#d47500', background: '#fdf3e1', padding: '2px 10px', borderRadius: 6, border: '1px solid #f5c98a' }}>
                        AI修正済
                      </span>
                    ) : (
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-primary)', background: 'var(--color-primary-light)', padding: '2px 10px', borderRadius: 6, border: '1px solid var(--color-primary)40' }}>
                        問題なし
                      </span>
                    )}
                    {q.isHidden && (
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'white', background: 'var(--color-danger)', padding: '2px 8px', borderRadius: 6 }}>非表示中</span>
                    )}
                    <span style={{ fontSize: 11, color: 'var(--color-text-light)', marginLeft: 'auto', flexShrink: 0 }}>
                      AI確認: {q.validityCheckedAt ? new Date(q.validityCheckedAt).toLocaleDateString('ja-JP') : '未チェック'}
                    </span>
                  </div>

                  {/* 問題文 */}
                  <p style={{ fontSize: 13, color: 'var(--color-text-main)', margin: '0 0 8px', lineHeight: 1.6 }}>{q.questionText}</p>

                  {/* 修正ログ */}
                  {editLog && (
                    <div style={{ margin: '0 0 12px', border: '1px solid #d47500', borderRadius: 6, overflow: 'hidden' }}>
                      <div style={{ background: '#fdf3e1', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#d47500', textTransform: 'uppercase', letterSpacing: '0.05em' }}>AI修正ログ</span>
                        <span style={{ fontSize: 11, color: '#879596' }}>
                          {new Date(editLog.checkedAt).toLocaleString('ja-JP')}
                        </span>
                        {editLog.changes && (
                          <span style={{ fontSize: 11, color: 'var(--color-text-sub)' }}>
                            変更: {Object.keys(editLog.changes).map(k => ({ questionText: '問題文', choices: '選択肢', correctAnswers: '正解', explanation: '解説' }[k] ?? k)).join(' · ')}
                          </span>
                        )}
                      </div>
                      <div style={{ padding: '10px 12px', background: 'var(--color-bg-white)' }}>
                        <p style={{ fontSize: 12, color: 'var(--color-text-sub)', margin: '0 0 10px', lineHeight: 1.6 }}>{editLog.reason}</p>
                        {editLog.changes && Object.entries(editLog.changes).map(([field, diff]) => {
                          const fieldLabel: Record<string, string> = { questionText: '問題文', choices: '選択肢', correctAnswers: '正解', explanation: '解説' };
                          const label = fieldLabel[field] ?? field;
                          const before = Array.isArray((diff as any).before) ? (diff as any).before.join(' / ') : (diff as any).before;
                          const after = Array.isArray((diff as any).after) ? (diff as any).after.join(' / ') : (diff as any).after;
                          return (
                            <div key={field} style={{ marginBottom: 8 }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: '#879596', marginBottom: 4 }}>{label}</div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <div style={{ fontSize: 12, padding: '5px 10px', borderRadius: 4, background: '#fff5f5', border: '1px solid #f5a09b', color: 'var(--color-danger)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                                  <span style={{ fontWeight: 700, marginRight: 6 }}>前:</span>{before}
                                </div>
                                <div style={{ fontSize: 12, padding: '5px 10px', borderRadius: 4, background: '#f0faf0', border: '1px solid #b7e5c0', color: 'var(--color-success)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                                  <span style={{ fontWeight: 700, marginRight: 6 }}>後:</span>{after}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* アクションボタン */}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button onClick={() => openEdit(q)} style={{ padding: '4px 12px', fontSize: 12, fontWeight: 700, borderRadius: 9999, cursor: 'pointer', background: 'transparent', color: 'var(--color-text-sub)', border: '1px solid var(--color-border)' }}>
                      編集
                    </button>
                    {q.isHidden ? (
                      <button onClick={() => handleVisibility(q, false)} style={{ padding: '4px 12px', fontSize: 12, fontWeight: 700, borderRadius: 9999, cursor: 'pointer', background: 'transparent', color: 'var(--color-success)', border: '1px solid #037f0c' }}>
                        表示に戻す
                      </button>
                    ) : (
                      <button onClick={() => handleVisibility(q, true)} style={{ padding: '4px 12px', fontSize: 12, fontWeight: 700, borderRadius: 9999, cursor: 'pointer', background: 'transparent', color: '#d47500', border: '1px solid #d47500' }}>
                        非表示にする
                      </button>
                    )}
                    <button
                      onClick={async () => {
                        if (!window.confirm('この問題を完全に削除しますか？')) return;
                        await adminFetch(`${API_ENDPOINT}/admin/questions/${q.questionId}`, { method: 'DELETE' });
                        setFlaggedQuestions(prev => prev.filter(x => x.questionId !== q.questionId));
                      }}
                      style={{ padding: '4px 12px', fontSize: 12, fontWeight: 700, borderRadius: 9999, cursor: 'pointer', background: 'transparent', color: 'var(--color-danger)', border: '1px solid #d13212' }}>
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
            <p style={{ color: 'var(--color-text-sub)', fontSize: 13, margin: 0 }}>
              {loadingMsg ? '読み込み中...' : `${messages.length} 件`}
            </p>
            <button onClick={fetchMessages} style={{ padding: '6px 16px', background: 'transparent', color: 'var(--color-primary)', border: '1.5px solid var(--color-primary)', borderRadius: 9999, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
              更新
            </button>
          </div>

          {!loadingMsg && messages.length === 0 && (
            <p style={{ color: 'var(--color-text-light)', textAlign: 'center', padding: 40 }}>メッセージはありません</p>
          )}

          {messages.map(m => (
            <div key={m.messageId} style={{ border: '1px solid #eaeded', borderRadius: 6, padding: '16px 20px', marginBottom: 10, background: 'var(--color-bg-white)', boxShadow: '0 1px 1px 0 rgba(0,28,36,0.1)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <span style={{ fontSize: 12, color: '#879596' }}>
                  {new Date(m.sentAt).toLocaleString('ja-JP')}
                </span>
                <button
                  onClick={() => handleDeleteMessage(m)}
                  style={{ padding: '4px 12px', background: 'transparent', color: 'var(--color-danger)', border: '1px solid #d13212', borderRadius: 9999, cursor: 'pointer', fontSize: 12, fontWeight: 700, flexShrink: 0 }}
                >
                  削除
                </button>
              </div>
              {m.subject && (
                <p style={{ margin: '0 0 8px', fontWeight: 700, fontSize: 14, color: 'var(--color-text-main)' }}>{m.subject}</p>
              )}
              <p style={{ margin: 0, fontSize: 14, color: 'var(--color-text-main)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{m.message}</p>
            </div>
          ))}
        </div>
      )}
      {/* ── 日めくりAWSサービス管理 ── */}
      {tab === 'dailyservice' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <p style={{ color: 'var(--color-text-sub)', fontSize: 13, margin: 0 }}>
              {loadingDS ? '' : `${dailyServices.length} 件`}
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={fetchDailyServices}
                style={{ padding: '6px 14px', background: 'transparent', color: 'var(--color-primary)', border: '1.5px solid var(--color-primary)', borderRadius: 9999, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                更新
              </button>
              <button
                onClick={() => { setEditingDS(null); setDsForm(emptyDSForm); setShowDSForm(true); }}
                style={{ padding: '6px 16px', background: '#ff9900', color: '#16191f', border: 'none', borderRadius: 9999, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                + 追加
              </button>
            </div>
          </div>

          {showDSForm && (
            <div style={{ border: '2px solid var(--color-primary)', borderRadius: 8, padding: '20px 20px 16px', marginBottom: 20, background: 'var(--color-bg-main)' }}>
              <h4 style={{ margin: '0 0 14px', fontSize: 15, color: 'var(--color-text-main)' }}>
                {editingDS ? 'サービス編集' : '新規サービス'}
              </h4>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-sub)', marginBottom: 4 }}>アイコン（絵文字）</div>
                  <input value={dsForm.icon} onChange={e => setDsForm(f => ({ ...f, icon: e.target.value }))}
                    placeholder="☁️" style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: 20, boxSizing: 'border-box', outline: 'none', textAlign: 'center' }} />
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-sub)', marginBottom: 4 }}>表示順（小さいほど前）</div>
                  <input type="number" value={dsForm.order} onChange={e => setDsForm(f => ({ ...f, order: Number(e.target.value) }))}
                    style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: 14, boxSizing: 'border-box', outline: 'none' }} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10, marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-sub)', marginBottom: 4 }}>サービス名 *</div>
                  <input value={dsForm.name} onChange={e => setDsForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="例: Amazon S3" style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: 14, boxSizing: 'border-box', outline: 'none' }} />
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-sub)', marginBottom: 4 }}>略称</div>
                  <input value={dsForm.shortName} onChange={e => setDsForm(f => ({ ...f, shortName: e.target.value }))}
                    placeholder="例: S3" style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: 14, boxSizing: 'border-box', outline: 'none' }} />
                </div>
              </div>

              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-sub)', marginBottom: 4 }}>カテゴリ</div>
                <input value={dsForm.category} onChange={e => setDsForm(f => ({ ...f, category: e.target.value }))}
                  placeholder="例: ストレージ / コンピューティング / データベース" style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: 14, boxSizing: 'border-box', outline: 'none' }} />
              </div>

              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-sub)', marginBottom: 4 }}>説明 *（カジュアルに）</div>
                <textarea value={dsForm.description} onChange={e => setDsForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="このサービスが何をするか、どんな場面で使うかを簡潔に"
                  rows={3} style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: 14, resize: 'vertical', boxSizing: 'border-box', outline: 'none' }} />
              </div>

              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-sub)', marginBottom: 4 }}>💡 豆知識・意外な用途（任意）</div>
                <textarea value={dsForm.trivia} onChange={e => setDsForm(f => ({ ...f, trivia: e.target.value }))}
                  placeholder="「実はこんな使い方も！」「名前の由来は〇〇」など"
                  rows={2} style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: 14, resize: 'vertical', boxSizing: 'border-box', outline: 'none' }} />
              </div>

              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-sub)', marginBottom: 4 }}>公式ドキュメントURL（任意）</div>
                <input value={dsForm.docUrl} onChange={e => setDsForm(f => ({ ...f, docUrl: e.target.value }))}
                  placeholder="https://aws.amazon.com/jp/s3/" style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: 14, boxSizing: 'border-box', outline: 'none' }} />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 16, borderTop: '1px solid var(--color-border)', paddingTop: 12 }}>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                  <button onClick={saveDailyService}
                    style={{ padding: '7px 20px', background: '#ff9900', color: '#16191f', border: 'none', borderRadius: 9999, cursor: 'pointer', fontWeight: 700, fontSize: 14 }}>
                    保存
                  </button>
                  <button onClick={() => { setShowDSForm(false); setEditingDS(null); setDsForm(emptyDSForm); }}
                    style={{ padding: '7px 16px', border: '1px solid var(--color-border)', borderRadius: 9999, cursor: 'pointer', background: 'transparent', fontWeight: 700, fontSize: 14 }}>
                    キャンセル
                  </button>
                </div>
              </div>
            </div>
          )}

          {loadingDS && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[0, 1, 2, 3].map(i => (
                <div key={i} style={{ border: '1px solid var(--color-border)', borderLeft: '4px solid var(--color-border)', borderRadius: 6, padding: '14px 16px', background: 'var(--color-bg-white)' }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <div className="skeleton" style={{ width: 36, height: 36, borderRadius: 6, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="skeleton" style={{ width: 140, height: 16, borderRadius: 4, marginBottom: 8 }} />
                      <div className="skeleton" style={{ width: '80%', height: 13, borderRadius: 4 }} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
                      <div className="skeleton" style={{ width: 44, height: 26, borderRadius: 9999 }} />
                      <div className="skeleton" style={{ width: 44, height: 26, borderRadius: 9999 }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loadingDS && dailyServices.length === 0 && (
            <p style={{ color: 'var(--color-text-light)', textAlign: 'center', padding: 40 }}>サービスが登録されていません</p>
          )}

          {!loadingDS && dailyServices.map(ds => (
            <div key={ds.serviceId} style={{
              border: '1px solid var(--color-border)',
              borderRadius: 6, padding: '12px 16px', marginBottom: 8,
              background: 'var(--color-bg-white)',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: 'var(--color-bg-main)', borderRadius: 6, color: 'var(--color-primary)', fontSize: 22 }}>
                  {ds.icon.startsWith('/') || ds.icon.startsWith('http')
                    ? <img src={ds.icon} alt={ds.name} style={{ width: 26, height: 26, objectFit: 'contain' }} />
                    : isServiceIconKey(ds.icon)
                      ? <ServiceIcon name={ds.icon} size={22} />
                      : ds.icon}
                </div>
                <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                    <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--color-text-main)' }}>{ds.name}</span>
                    {ds.shortName && <span style={{ fontSize: 11, color: 'var(--color-text-light)', background: 'var(--color-bg-main)', padding: '1px 6px', borderRadius: 4 }}>{ds.shortName}</span>}
                    {ds.category && <span style={{ fontSize: 11, color: 'var(--color-primary)', background: 'var(--color-primary-light)', padding: '1px 7px', borderRadius: 12, fontWeight: 700 }}>{ds.category}</span>}
                    <span style={{ fontSize: 11, color: 'var(--color-text-light)', marginLeft: 'auto' }}>順: {ds.order}</span>
                  </div>
                  <p style={{ margin: '0 0 4px', fontSize: 13, color: 'var(--color-text-sub)', lineHeight: 1.5, wordBreak: 'break-word' }}>{ds.description}</p>
                  {ds.trivia && <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-light)', lineHeight: 1.5, wordBreak: 'break-word' }}>💡 {ds.trivia}</p>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
                  <button
                    onClick={() => { setEditingDS(ds); setDsForm({ name: ds.name, shortName: ds.shortName ?? '', category: ds.category ?? '', icon: ds.icon, description: ds.description, trivia: ds.trivia ?? '', docUrl: ds.docUrl ?? '', order: ds.order, isActive: true }); setShowDSForm(true); }}
                    style={{ padding: '4px 10px', border: '1px solid var(--color-border)', borderRadius: 9999, cursor: 'pointer', background: 'transparent', fontSize: 11, fontWeight: 700 }}>
                    編集
                  </button>
                  <button onClick={() => deleteDailyService(ds.serviceId)}
                    style={{ padding: '4px 10px', background: 'transparent', color: 'var(--color-danger)', border: '1px solid #d13212', borderRadius: 9999, cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>
                    削除
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── テーマ設定 ── */}
      {tab === 'theme' && (
        <div style={{ maxWidth: 600 }}>
          <p style={{ color: 'var(--color-text-sub)', fontSize: 13, marginTop: 0, marginBottom: 20 }}>
            ライトモードのカラー変数を変更できます。変更は全ユーザーに即時反映されます。
          </p>

          {/* カスタムカラー 有効/無効トグル */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', background: 'var(--color-bg-white)', border: '1px solid var(--color-border)', borderRadius: 10, marginBottom: 24 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-main)' }}>カスタムカラーを適用する</div>
              <div style={{ fontSize: 12, color: 'var(--color-text-sub)', marginTop: 2 }}>
                オフにすると全ユーザーのカラーがデフォルトに戻ります（設定は保持されます）
              </div>
            </div>
            <button
              onClick={async () => {
                const next = !themeEnabled;
                setThemeEnabled(next);
                setCustomColorsEnabled(next);
                try {
                  await adminFetch(`${API_ENDPOINT}/admin/settings/theme`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ colors: themeColors, enabled: next }),
                  });
                } catch { /* silent */ }
              }}
              style={{
                width: 52, height: 28, borderRadius: 14, border: 'none', cursor: 'pointer',
                background: themeEnabled ? 'var(--color-primary)' : 'var(--color-border)',
                position: 'relative', transition: 'background 0.2s', flexShrink: 0, padding: 0,
              }}
              aria-label={themeEnabled ? '無効にする' : '有効にする'}
            >
              <span style={{
                position: 'absolute', top: 3, left: themeEnabled ? 26 : 3,
                width: 22, height: 22, borderRadius: '50%', background: '#fff',
                transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
              }} />
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 0, marginBottom: 24 }}>
            {(['ブランド', 'ボタン', '背景', 'テキスト', 'その他'] as const).map(group => {
              const items = THEME_COLOR_LABELS.filter(c => c.group === group);
              return (
                <div key={group}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-light)', textTransform: 'uppercase', letterSpacing: '0.5px', padding: '14px 0 6px' }}>{group}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {items.map(({ key, label }) => {
                      const currentVal = themeColors[key] ?? DEFAULT_COLORS[key] ?? '#000000';
                      return (
                        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--color-bg-white)', border: '1px solid var(--color-border)', borderRadius: 8 }}>
                          <input
                            type="color"
                            value={currentVal}
                            onChange={e => {
                              const updated = { ...themeColors, [key]: e.target.value };
                              setThemeColors(updated);
                              applyColors(updated);
                            }}
                            style={{ width: 40, height: 32, border: 'none', borderRadius: 4, cursor: 'pointer', padding: 0, background: 'none' }}
                          />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-main)' }}>{label}</div>
                            <div style={{ fontSize: 11, color: 'var(--color-text-light)', fontFamily: 'monospace' }}>{key}</div>
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--color-text-sub)', fontFamily: 'monospace', background: 'var(--color-bg-main)', padding: '2px 8px', borderRadius: 4, flexShrink: 0 }}>
                            {currentVal}
                          </div>
                          <button
                            onClick={() => {
                              const reset = { ...themeColors, [key]: DEFAULT_COLORS[key] };
                              setThemeColors(reset);
                              applyColors(reset);
                            }}
                            style={{ fontSize: 11, padding: '3px 8px', border: '1px solid var(--color-border)', borderRadius: 9999, background: 'transparent', cursor: 'pointer', color: 'var(--color-text-light)', whiteSpace: 'nowrap' }}>
                            リセット
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button
              onClick={async () => {
                setThemeSaving(true);
                setThemeSaved(false);
                try {
                  await adminFetch(`${API_ENDPOINT}/admin/settings/theme`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ colors: themeColors, enabled: themeEnabled }),
                  });
                  applyColors(themeColors);
                  setThemeSaved(true);
                  setTimeout(() => setThemeSaved(false), 3000);
                } catch { alert('保存に失敗しました'); }
                setThemeSaving(false);
              }}
              disabled={themeSaving}
              style={{ padding: '8px 24px', background: '#ff9900', color: '#16191f', border: 'none', borderRadius: 9999, cursor: themeSaving ? 'default' : 'pointer', fontWeight: 700, fontSize: 14 }}>
              {themeSaving ? '保存中...' : '全ユーザーに適用'}
            </button>
            <button
              onClick={() => {
                setThemeColors({ ...DEFAULT_COLORS });
                applyColors({ ...DEFAULT_COLORS });
              }}
              style={{ padding: '8px 18px', border: '1px solid var(--color-border)', borderRadius: 9999, cursor: 'pointer', background: 'transparent', fontSize: 13, fontWeight: 700 }}>
              すべてデフォルトに戻す
            </button>
            {themeSaved && <span style={{ fontSize: 13, color: 'var(--color-success)', fontWeight: 700 }}>✓ 保存しました</span>}
          </div>
        </div>
      )}

      {/* ── 管理者設定 ── */}
      {tab === 'admins' && (
        <div style={{ maxWidth: 560 }}>
          <p style={{ fontSize: 13, color: 'var(--color-text-sub)', marginBottom: 20 }}>
            スーパー管理者（{ADMIN_EMAIL}）は常にアクセス可能です。追加の管理者アカウントをここで設定できます。
          </p>

          {/* 追加フォーム */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
            <input
              type="email"
              value={newAdminEmail}
              onChange={e => setNewAdminEmail(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addAdminEmail(); } }}
              placeholder="追加するメールアドレス"
              style={{ flex: 1, padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 14, background: 'var(--color-bg-card)', color: 'var(--color-text-main)' }}
            />
            <button
              onClick={addAdminEmail}
              disabled={adminSaving || !newAdminEmail.trim()}
              style={{ padding: '8px 18px', background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 8, cursor: adminSaving || !newAdminEmail.trim() ? 'default' : 'pointer', fontWeight: 700, fontSize: 14, opacity: !newAdminEmail.trim() ? 0.5 : 1 }}>
              追加
            </button>
          </div>

          {/* 管理者リスト */}
          {adminEmailsLoading ? (
            <p style={{ color: 'var(--color-text-sub)', fontSize: 14 }}>読み込み中...</p>
          ) : adminEmailsError ? (
            <p style={{ color: 'var(--color-danger)', fontSize: 14 }}>{adminEmailsError}</p>
          ) : adminEmails.length === 0 ? (
            <p style={{ color: 'var(--color-text-sub)', fontSize: 14 }}>追加の管理者アカウントはありません</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {adminEmails.map(email => (
                <div key={email} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', border: '1px solid var(--color-border)', borderRadius: 8, background: 'var(--color-bg-card)' }}>
                  <span style={{ fontSize: 14, color: 'var(--color-text-main)' }}>{email}</span>
                  <button
                    onClick={() => { if (window.confirm(`${email} を管理者から削除しますか？`)) removeAdminEmail(email); }}
                    disabled={adminSaving}
                    style={{ background: 'none', border: 'none', color: 'var(--color-danger)', cursor: adminSaving ? 'default' : 'pointer', fontSize: 13, fontWeight: 700, padding: '2px 8px' }}>
                    削除
                  </button>
                </div>
              ))}
            </div>
          )}

          {adminSaved && <p style={{ marginTop: 16, fontSize: 13, color: 'var(--color-success)', fontWeight: 700 }}>✓ 保存しました</p>}
        </div>
      )}

      {/* ── サイト情報 ── */}
      {tab === 'about' && (
        <div style={{ maxWidth: 760 }}>
          <p style={{ fontSize: 13, color: 'var(--color-text-sub)', marginBottom: 24 }}>
            「このサイトについて」ページの各セクションを編集できます。空白のままにすると、デフォルトのコンテンツが表示されます。
          </p>
          {aboutLoading ? (
            <p style={{ color: 'var(--color-text-sub)', fontSize: 14 }}>読み込み中...</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-xl)' }}>
              {[
                { key: 'privacy', label: 'プライバシーポリシー' },
                { key: 'terms', label: '利用規約' },
                { key: 'operator', label: '運営者情報' },
              ].map(({ key, label }) => (
                <div key={key}>
                  <div style={{ fontWeight: 700, fontSize: 'var(--font-size-md)', color: 'var(--color-text-main)', marginBottom: 8 }}>{label}</div>
                  <textarea
                    value={aboutSections[key] ?? ''}
                    onChange={e => setAboutSections(prev => ({ ...prev, [key]: e.target.value }))}
                    rows={12}
                    style={{
                      width: '100%', boxSizing: 'border-box', padding: '10px 12px',
                      border: '1px solid var(--color-border)', borderRadius: 8,
                      fontSize: 13, lineHeight: 1.7, fontFamily: 'inherit',
                      background: 'var(--color-bg-white)', color: 'var(--color-text-main)',
                      resize: 'vertical',
                    }}
                    placeholder={`${label}のテキストを入力（空欄=デフォルト表示）`}
                  />
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                    <button
                      onClick={() => saveAboutSection(key, aboutSections[key] ?? '')}
                      disabled={aboutSaving}
                      style={{
                        padding: '7px 20px', background: 'var(--color-primary)', color: '#fff',
                        border: 'none', borderRadius: 8, cursor: aboutSaving ? 'default' : 'pointer',
                        fontWeight: 700, fontSize: 13, opacity: aboutSaving ? 0.7 : 1,
                      }}
                    >
                      {aboutSaving ? '保存中...' : '保存'}
                    </button>
                  </div>
                </div>
              ))}
              {aboutSaved && <p style={{ fontSize: 13, color: 'var(--color-success)', fontWeight: 700 }}>✓ 保存しました</p>}
            </div>
          )}
        </div>
      )}

      {/* ── データ削除 ── */}
      {tab === 'deleteuser' && (
        <div style={{ maxWidth: 560 }}>
          <p style={{ fontSize: 13, color: 'var(--color-text-sub)', marginBottom: 24, lineHeight: 1.7 }}>
            指定したメールアドレスのユーザーのアプリデータ（演習履歴・成績・ブックマーク等）を削除します。<br />
            Cognitoアカウントは削除されません。
          </p>

          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <input
              type="email"
              value={delEmail}
              onChange={e => { setDelEmail(e.target.value); setDelDone(false); setDelError(''); }}
              placeholder="削除対象のメールアドレス"
              style={{ flex: 1, padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 13, background: 'var(--color-bg-white)', color: 'var(--color-text-main)' }}
            />
          </div>

          {delError && (
            <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, color: '#c00', fontSize: 13, marginBottom: 16 }}>
              {delError}
            </div>
          )}

          {delDone && (
            <div style={{ padding: '10px 14px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, color: '#166534', fontSize: 13, marginBottom: 16, fontWeight: 700 }}>
              ✓ データを削除しました
            </div>
          )}

          <button
            onClick={executeDeletion}
            disabled={!delEmail.trim() || delExecuting}
            style={{ width: '100%', padding: '10px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 8, cursor: (!delEmail.trim() || delExecuting) ? 'default' : 'pointer', fontWeight: 700, fontSize: 14, opacity: (!delEmail.trim() || delExecuting) ? 0.6 : 1 }}
          >
            {delExecuting ? '削除中...' : 'データを削除する'}
          </button>
        </div>
      )}

      {/* ══ 合格コメント ══ */}
      {tab === 'passcomments' && (
        <div style={{ maxWidth: 600 }}>
          <h3 style={{ marginTop: 0, fontSize: 16, fontWeight: 700 }}>合格コメント管理</h3>
          <p style={{ fontSize: 13, color: 'var(--color-text-sub)', marginBottom: 20 }}>
            各資格ダッシュボードに表示される「合格コメント」を編集します。空欄にして保存するとコメントが削除されます。
          </p>

          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-sub)', display: 'block', marginBottom: 6 }}>資格</label>
            <select
              value={passCommentExam}
              onChange={e => {
                setPassCommentExam(e.target.value);
                setPassCommentText(passComments[e.target.value] ?? '');
                setPassCommentSaved(false);
              }}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 13, background: 'var(--color-bg-white)', color: 'var(--color-text-main)', cursor: 'pointer' }}
            >
              {EXAM_TYPES.map(et => (
                <option key={et} value={et}>
                  {et} — {EXAM_CONFIGS[et]?.fullName}{passComments[et] ? ' ✓' : ''}
                </option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-sub)', display: 'block', marginBottom: 6 }}>コメント（空欄で削除）</label>
            <textarea
              value={passCommentText}
              onChange={e => { setPassCommentText(e.target.value); setPassCommentSaved(false); }}
              rows={6}
              placeholder={`${passCommentExam} の合格コメントを入力...`}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 13, resize: 'vertical', boxSizing: 'border-box', background: 'var(--color-bg-white)', color: 'var(--color-text-main)', lineHeight: 1.6 }}
            />
          </div>

          {passCommentSaved && (
            <div style={{ padding: '8px 12px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, color: '#166534', fontSize: 13, marginBottom: 12, fontWeight: 700 }}>
              ✓ 保存しました
            </div>
          )}

          <button
            onClick={async () => {
              setPassCommentSaving(true);
              setPassCommentSaved(false);
              try {
                const res = await adminFetch(`${API_ENDPOINT}/admin/pass-comments`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ examType: passCommentExam, comment: passCommentText.trim() }),
                });
                if (!res.ok) throw new Error(`status ${res.status}`);
                const data = await res.json();
                setPassComments(data.comments ?? {});
                setPassCommentSaved(true);
              } catch (e) {
                alert('保存に失敗しました');
              } finally {
                setPassCommentSaving(false);
              }
            }}
            disabled={passCommentSaving}
            style={{ padding: '9px 24px', background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 8, cursor: passCommentSaving ? 'default' : 'pointer', fontWeight: 700, fontSize: 14, opacity: passCommentSaving ? 0.6 : 1 }}
          >
            {passCommentSaving ? '保存中...' : '保存'}
          </button>
        </div>
      )}
    </div>
  );
}
