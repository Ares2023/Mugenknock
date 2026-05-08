import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { API_ENDPOINT, EXAM_TYPES } from '../constants';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';

type Question = {
  questionId: string;
  examType: string;
  questionText: string;
  choices: string[];
  correctAnswers?: string[];
  explanation?: string;
  tags: string[];
  isMultiple: boolean;
  updatedAt?: string;
  validityCheckedAt?: string;
};

const formatDate = (iso: string) => {
  const d = new Date(iso);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${mm}/${dd} ${hh}:${mi}`;
};

const formatDateOnly = (iso: string) => {
  const d = new Date(iso);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}/${dd}`;
};

const SkeletonCard = () => (
  <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--border-radius-md)', padding: 'var(--spacing-lg)', background: 'var(--color-bg-white)', boxShadow: 'var(--box-shadow-sm)' }}>
    <div style={{ display: 'flex', gap: 'var(--spacing-md)', marginBottom: 'var(--spacing-sm)' }}>
      <div className="skeleton" style={{ width: 48, height: 20 }} />
      <div className="skeleton" style={{ width: 64, height: 20 }} />
    </div>
    <div className="skeleton" style={{ width: '100%', height: 16, marginBottom: 8 }} />
    <div className="skeleton" style={{ width: '85%', height: 16, marginBottom: 'var(--spacing-lg)' }} />
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 'var(--spacing-lg)' }}>
      {[90, 75, 80, 70].map((w, i) => (
        <div key={i} className="skeleton" style={{ width: `${w}%`, height: 14 }} />
      ))}
    </div>
    <div style={{ display: 'flex', gap: 8 }}>
      <div className="skeleton" style={{ width: 80, height: 28 }} />
      <div className="skeleton" style={{ width: 60, height: 28 }} />
    </div>
  </div>
);

export default function QuestionList() {
  const location = useLocation();
  const { lang, t } = useLanguage();
  const { user } = useAuth();

  const [questions, setQuestions] = useState<Question[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [keywordInput, setKeywordInput] = useState('');
  const [keywordChips, setKeywordChips] = useState<string[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  // フィルター状態
  const [examTypes, setExamTypes] = useState<string[]>([]);
  const [bookmarkOnly, setBookmarkOnly] = useState(false);
  const [filterUnanswered, setFilterUnanswered] = useState(false);
  const [filterIncorrect, setFilterIncorrect] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);

  // ユーザーデータ
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set());
  const [bookmarkLoading, setBookmarkLoading] = useState<Set<string>>(new Set());
  const [answeredIds, setAnsweredIds] = useState<Set<string>>(new Set());
  const [incorrectIds, setIncorrectIds] = useState<Set<string>>(new Set());

  const filterRef = useRef<HTMLDivElement>(null);

  // ドロップダウン外クリックで閉じる
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setFilterOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const fetchQuestions = async (types: string[]) => {
    setLoading(true);
    try {
      let items: Question[] = [];
      if (types.length === 0) {
        const res = await fetch(`${API_ENDPOINT}/questions`);
        const data = await res.json();
        items = data.items || [];
      } else {
        const results = await Promise.all(types.map(async (type) => {
          const params = new URLSearchParams({ examType: type });
          const res = await fetch(`${API_ENDPOINT}/questions?${params}`);
          const data = await res.json();
          return (data.items || []) as Question[];
        }));
        const seen = new Set<string>();
        for (const batch of results) {
          for (const q of batch) {
            if (!seen.has(q.questionId)) {
              seen.add(q.questionId);
              items.push(q);
            }
          }
        }
      }
      setQuestions(items);
      setSelected(new Set());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    fetch(`${API_ENDPOINT}/users/me/bookmarks?userId=${user.userId}`)
      .then(r => r.json())
      .then(d => setBookmarkedIds(new Set(d.questionIds ?? [])))
      .catch(() => {});
  }, [user]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const kw = params.get('keyword') || '';
    setKeywordChips(kw ? [kw] : []);
    setKeywordInput('');
    setExamTypes([]);
    setBookmarkOnly(false);
    setFilterUnanswered(false);
    setFilterIncorrect(false);
    fetchQuestions([]);
  }, [location.search]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const kw = keywordInput.trim();
    if (!kw || keywordChips.includes(kw)) { setKeywordInput(''); return; }
    setKeywordChips(prev => [...prev, kw]);
    setKeywordInput('');
  };

  const removeKeywordChip = (chip: string) => {
    setKeywordChips(prev => prev.filter(c => c !== chip));
  };

  const toggleExamType = (type: string) => {
    const next = examTypes.includes(type)
      ? examTypes.filter(t => t !== type)
      : [...examTypes, type];
    setExamTypes(next);
    fetchQuestions(next);
  };

  const toggleFilterUnanswered = async () => {
    if (!user) return;
    if (!filterUnanswered && answeredIds.size === 0) {
      try {
        const res = await fetch(`${API_ENDPOINT}/users/me/answered-questions?userId=${user.userId}`);
        const data = await res.json();
        setAnsweredIds(new Set(data.questionIds ?? []));
      } catch { /* ignore */ }
    }
    setFilterUnanswered(v => !v);
  };

  const toggleFilterIncorrect = async () => {
    if (!user) return;
    if (!filterIncorrect && incorrectIds.size === 0) {
      try {
        const res = await fetch(`${API_ENDPOINT}/users/me/incorrect-questions?userId=${user.userId}`);
        const data = await res.json();
        setIncorrectIds(new Set(data.questionIds ?? []));
      } catch { /* ignore */ }
    }
    setFilterIncorrect(v => !v);
  };

  const fetchDetail = async (id: string) => {
    if (expandedId === id) { setExpandedId(null); return; }
    try {
      const res = await fetch(`${API_ENDPOINT}/questions/${id}`);
      const data = await res.json();
      setQuestions(prev => prev.map(q => q.questionId === id ? { ...q, ...data } : q));
      setExpandedId(id);
    } catch (err) { console.error(err); }
  };

  const toggleBookmark = async (qid: string) => {
    if (!user) return;
    const isBookmarked = bookmarkedIds.has(qid);
    setBookmarkLoading(prev => new Set(prev).add(qid));
    try {
      if (isBookmarked) {
        await fetch(`${API_ENDPOINT}/questions/${qid}/bookmark?userId=${user.userId}`, { method: 'DELETE' });
        setBookmarkedIds(prev => { const next = new Set(prev); next.delete(qid); return next; });
      } else {
        await fetch(`${API_ENDPOINT}/questions/${qid}/bookmark`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.userId }),
        });
        setBookmarkedIds(prev => new Set(prev).add(qid));
      }
    } catch (err) { console.error(err); }
    setBookmarkLoading(prev => { const next = new Set(prev); next.delete(qid); return next; });
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  };

  const selectAll = () => {
    selected.size === displayedQuestions.length
      ? setSelected(new Set())
      : setSelected(new Set(displayedQuestions.map(q => q.questionId)));
  };

  const copyQuestion = (q: Question) => {
    const qText = lang === 'en' && (q as any).questionTextEn ? (q as any).questionTextEn : q.questionText;
    const choices = lang === 'en' && (q as any).choicesEn ? (q as any).choicesEn : q.choices;
    const expl = lang === 'en' && (q as any).explanationEn ? (q as any).explanationEn : q.explanation;
    const text = [
      `[Q] ${qText}`,
      choices.map((c: string, i: number) => `${i + 1}. ${c}`).join('\n'),
      q.correctAnswers ? `[Answer] ${q.correctAnswers.join(', ')}` : '',
      expl ? `[Explanation] ${expl}` : '',
    ].filter(Boolean).join('\n');
    navigator.clipboard.writeText(text);
    setCopiedId(q.questionId);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const exportCSV = async () => {
    const targets = displayedQuestions.filter(q => selected.has(q.questionId));
    const needFetch = targets.filter(q => !q.correctAnswers);
    const fetched = await Promise.all(needFetch.map(q => fetch(`${API_ENDPOINT}/questions/${q.questionId}`).then(r => r.json())));
    const map = Object.fromEntries(fetched.map(q => [q.questionId, q]));
    const full = targets.map(q => ({ ...q, ...map[q.questionId] }));
    const header = '問題ID,試験種別,問題文,選択肢,正解,解説\n';
    const rows = full.map(q => [q.questionId, q.examType, `"${q.questionText}"`, `"${q.choices.join(' / ')}"`, `"${(q.correctAnswers || []).join(' / ')}"`, `"${q.explanation || ''}"`].join(',')).join('\n');
    const blob = new Blob(['﻿' + header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'questions.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const activeFilterCount =
    (examTypes.length > 0 ? 1 : 0) +
    (filterUnanswered ? 1 : 0) +
    (filterIncorrect ? 1 : 0) +
    (bookmarkOnly ? 1 : 0);

  const matchesKeyword = (q: Question, chip: string): boolean => {
    const kw = chip.toLowerCase();
    return q.questionText.toLowerCase().includes(kw) ||
      q.choices.some(c => c.toLowerCase().includes(kw)) ||
      (q.tags ?? []).some(tag => tag.toLowerCase().includes(kw));
  };

  const displayedQuestions = useMemo(() => questions.filter(q => {
    if (keywordChips.length > 0 && !keywordChips.every(chip => matchesKeyword(q, chip))) return false;
    if (filterUnanswered && answeredIds.has(q.questionId)) return false;
    if (filterIncorrect && !incorrectIds.has(q.questionId)) return false;
    if (bookmarkOnly && !bookmarkedIds.has(q.questionId)) return false;
    return true;
  }), [questions, keywordChips, filterUnanswered, answeredIds, filterIncorrect, incorrectIds, bookmarkOnly, bookmarkedIds]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalPages = Math.max(1, Math.ceil(displayedQuestions.length / PAGE_SIZE));
  const pagedQuestions = displayedQuestions.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [keywordChips, filterUnanswered, filterIncorrect, bookmarkOnly, questions]);

  const clearAll = () => {
    setKeywordChips([]);
    setKeywordInput('');
    setExamTypes([]);
    setBookmarkOnly(false);
    setFilterUnanswered(false);
    setFilterIncorrect(false);
    fetchQuestions([]);
  };

  // チェックボックス行スタイル
  const checkRow: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '5px 0', cursor: 'pointer',
    fontSize: 13, color: 'var(--color-text-main)',
  };
  const secLabel: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, color: 'var(--color-text-light)',
    textTransform: 'uppercase', letterSpacing: '0.6px',
    marginBottom: 6,
  };

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: 'var(--spacing-xl) var(--spacing-lg)' }} className="page-container">
      <div style={{ marginBottom: 'var(--spacing-xl)' }}>
        <h1 style={{ color: 'var(--color-text-main)', margin: 0, fontSize: 'var(--font-size-xxl)', fontWeight: 700 }}>{t('questions.title')}</h1>
      </div>

      <Card padding="var(--spacing-lg)" style={{ marginBottom: 'var(--spacing-xl)' }}>
        {/* 検索バー + フィルタードロップダウン */}
        <div style={{ display: 'flex', gap: 'var(--spacing-sm)', alignItems: 'center' }}>
          <form onSubmit={handleSearch} style={{ display: 'flex', gap: 'var(--spacing-sm)', flex: 1, minWidth: 0 }}>
            <input
              value={keywordInput}
              onChange={e => setKeywordInput(e.target.value)}
              placeholder={t('questions.searchPlaceholder')}
              style={{
                flex: 1, padding: '8px 12px',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--border-radius-md)',
                fontSize: 'var(--font-size-base)', outline: 'none',
                transition: 'border-color 0.2s', minWidth: 0,
              }}
              onFocus={e => e.currentTarget.style.borderColor = 'var(--color-primary)'}
              onBlur={e => e.currentTarget.style.borderColor = 'var(--color-border)'}
            />
            <Button type="submit">{t('questions.search')}</Button>
          </form>

          {/* フィルターボタン + ドロップダウン */}
          <div ref={filterRef} style={{ position: 'relative', flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => setFilterOpen(v => !v)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 14px',
                border: `1px solid ${filterOpen || activeFilterCount > 0 ? 'var(--color-primary)' : 'var(--color-border)'}`,
                borderRadius: 4,
                background: filterOpen ? 'var(--color-primary)' : activeFilterCount > 0 ? 'var(--color-primary-light)' : 'var(--color-bg-white)',
                color: filterOpen ? 'white' : activeFilterCount > 0 ? 'var(--color-primary)' : 'var(--color-text-sub)',
                cursor: 'pointer', fontSize: 13, fontWeight: 700,
                whiteSpace: 'nowrap', transition: 'all 0.15s',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
                <path d="M1 3h12M3 7h8M5 11h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              {lang === 'ja' ? 'フィルター' : 'Filter'}
              {activeFilterCount > 0 && (
                <span style={{
                  background: filterOpen ? 'rgba(255,255,255,0.3)' : 'var(--color-primary)',
                  color: 'white', borderRadius: 9999,
                  minWidth: 18, height: 18, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 700, padding: '0 4px',
                }}>{activeFilterCount}</span>
              )}
              <span style={{ fontSize: 9, display: 'inline-block', transform: filterOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
            </button>

            {/* ドロップダウンパネル */}
            {filterOpen && (
              <div style={{
                position: 'absolute',
                top: 'calc(100% + 6px)',
                right: 0,
                background: 'var(--color-bg-white)',
                border: '1px solid var(--color-border)',
                borderRadius: 6,
                boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                zIndex: 200,
                minWidth: 260,
                maxWidth: 340,
                padding: '14px 16px',
              }}>
                {/* 試験種別 */}
                <div style={{ marginBottom: 14 }}>
                  <div style={secLabel}>{lang === 'ja' ? '試験種別' : 'Exam Type'}</div>
                  {(EXAM_TYPES as readonly string[]).map(type => (
                    <label key={type} style={checkRow}>
                      <input
                        type="checkbox"
                        checked={examTypes.includes(type)}
                        onChange={() => toggleExamType(type)}
                        style={{ width: 15, height: 15, cursor: 'pointer', accentColor: 'var(--color-primary)' }}
                      />
                      {type}
                    </label>
                  ))}
                </div>

                {/* 回答状況・ブックマーク（要ログイン） */}
                {user ? (
                  <div style={{ borderTop: '1px solid #eee', paddingTop: 12 }}>
                    <div style={secLabel}>{lang === 'ja' ? '絞り込み' : 'Filter by'}</div>
                    <label style={checkRow}>
                      <input
                        type="checkbox"
                        checked={filterUnanswered}
                        onChange={toggleFilterUnanswered}
                        style={{ width: 15, height: 15, cursor: 'pointer', accentColor: 'var(--color-primary)' }}
                      />
                      {lang === 'ja' ? '未回答のみ' : 'Unanswered only'}
                    </label>
                    <label style={checkRow}>
                      <input
                        type="checkbox"
                        checked={filterIncorrect}
                        onChange={toggleFilterIncorrect}
                        style={{ width: 15, height: 15, cursor: 'pointer', accentColor: 'var(--color-primary)' }}
                      />
                      {lang === 'ja' ? '未正解のみ' : 'Incorrect only'}
                    </label>
                    <label style={checkRow}>
                      <input
                        type="checkbox"
                        checked={bookmarkOnly}
                        onChange={() => setBookmarkOnly(v => !v)}
                        style={{ width: 15, height: 15, cursor: 'pointer', accentColor: 'var(--color-primary)' }}
                      />
                      ★ {lang === 'ja' ? 'ブックマークのみ' : 'Bookmarked only'}
                    </label>
                  </div>
                ) : (
                  <div style={{ borderTop: '1px solid #eee', paddingTop: 10, fontSize: 12, color: '#879596' }}>
                    {lang === 'ja' ? '※ 未回答・未正解・ブックマークはログイン後に利用できます' : '* Login to filter by progress or bookmarks'}
                  </div>
                )}

                {activeFilterCount > 0 && (
                  <div style={{ borderTop: '1px solid #eee', marginTop: 12, paddingTop: 10 }}>
                    <button
                      onClick={() => { clearAll(); setFilterOpen(false); }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--color-text-light)', textDecoration: 'underline', padding: 0 }}
                    >
                      {lang === 'ja' ? 'すべてクリア' : 'Clear all'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* キーワードチップ */}
        {keywordChips.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 10 }}>
            {keywordChips.map(chip => (
              <span key={chip} style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                background: '#0097a7', color: 'white',
                borderRadius: 20, padding: '4px 10px 4px 12px',
                fontSize: 12, fontWeight: 700,
              }}>
                {chip}
                <button
                  onClick={() => removeKeywordChip(chip)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.7)', padding: '0 0 0 2px', lineHeight: 1, fontSize: 13 }}
                >✕</button>
              </span>
            ))}
            {keywordChips.length > 0 && (
              <button
                onClick={() => setKeywordChips([])}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--color-text-light)', textDecoration: 'underline', padding: '2px 4px' }}
              >
                {lang === 'ja' ? 'キーワードをクリア' : 'Clear keywords'}
              </button>
            )}
          </div>
        )}

        {/* アクティブフィルターチップ */}
        {activeFilterCount > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 10 }}>
            {examTypes.map(type => (
              <span key={type} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: 'var(--color-primary-light)', color: 'var(--color-primary)', borderRadius: 20, padding: '3px 8px 3px 11px', fontSize: 12, fontWeight: 700 }}>
                {type}
                <button onClick={() => toggleExamType(type)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--color-primary)', padding: '0 0 0 2px', lineHeight: 1 }}>✕</button>
              </span>
            ))}
            {filterUnanswered && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: 'var(--color-primary-light)', color: 'var(--color-primary)', borderRadius: 20, padding: '3px 8px 3px 11px', fontSize: 12, fontWeight: 700 }}>
                {lang === 'ja' ? '未回答' : 'Unanswered'}
                <button onClick={() => setFilterUnanswered(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--color-primary)', padding: '0 0 0 2px', lineHeight: 1 }}>✕</button>
              </span>
            )}
            {filterIncorrect && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: 'var(--color-primary-light)', color: 'var(--color-primary)', borderRadius: 20, padding: '3px 8px 3px 11px', fontSize: 12, fontWeight: 700 }}>
                {lang === 'ja' ? '未正解' : 'Incorrect'}
                <button onClick={() => setFilterIncorrect(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--color-primary)', padding: '0 0 0 2px', lineHeight: 1 }}>✕</button>
              </span>
            )}
            {bookmarkOnly && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: 'var(--color-bg-warning)', color: 'var(--color-text-warning)', borderRadius: 20, padding: '3px 8px 3px 11px', fontSize: 12, fontWeight: 700 }}>
                ★ {lang === 'ja' ? 'ブックマーク' : 'Bookmarked'}
                <button onClick={() => setBookmarkOnly(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--color-text-warning)', padding: '0 0 0 2px', lineHeight: 1 }}>✕</button>
              </span>
            )}
            <button
              onClick={clearAll}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--color-text-light)', textDecoration: 'underline', padding: '2px 4px' }}
            >
              {lang === 'ja' ? 'すべてクリア' : 'Clear all'}
            </button>
          </div>
        )}
      </Card>

      <div>
      <div>

      <div style={{ marginBottom: 'var(--spacing-lg)', display: 'flex', gap: 'var(--spacing-md)', alignItems: 'center' }}>
        <Button variant="outline" size="sm" onClick={selectAll}>
          {selected.size === displayedQuestions.length && displayedQuestions.length > 0 ? t('questions.deselectAll') : t('questions.selectAll')}
        </Button>
        <Button variant="outline" size="sm" onClick={exportCSV} disabled={selected.size === 0}>
          {t('questions.csvExport', { n: selected.size })}
        </Button>
        <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)', marginLeft: 'auto' }}>
          {t('questions.count', { n: displayedQuestions.length })}
        </span>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
          {[0, 1, 2].map(i => <SkeletonCard key={i} />)}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
          {pagedQuestions.map(q => {
            const qText = lang === 'en' && (q as any).questionTextEn ? (q as any).questionTextEn : q.questionText;
            const choices = lang === 'en' && (q as any).choicesEn ? (q as any).choicesEn : q.choices;
            const expl = lang === 'en' && (q as any).explanationEn ? (q as any).explanationEn : q.explanation;
            const isSelected = selected.has(q.questionId);
            const isExpanded = expandedId === q.questionId;
            const isBookmarked = bookmarkedIds.has(q.questionId);
            const isBmLoading = bookmarkLoading.has(q.questionId);

            return (
              <Card
                key={q.questionId}
                padding="var(--spacing-lg)"
                style={{
                  background: isSelected ? 'var(--color-primary-light)' : 'var(--color-bg-white)',
                  transition: 'background-color 0.2s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--spacing-md)' }}>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelect(q.questionId)}
                    style={{ marginTop: 4, width: 18, height: 18, cursor: 'pointer' }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ marginBottom: 'var(--spacing-sm)', display: 'flex', gap: 'var(--spacing-sm)', alignItems: 'center', flexWrap: 'wrap' }}>
                      <Badge variant="secondary">{q.examType}</Badge>
                      {q.isMultiple && <Badge variant="outline">{t('questions.multiple')}</Badge>}
                      {q.validityCheckedAt && (
                        <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-light)' }}>
                          {lang === 'ja' ? 'AI確認:' : 'AI:'} {formatDateOnly(q.validityCheckedAt)}
                        </span>
                      )}
                      {q.updatedAt && (
                        <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-light)' }}>
                          {lang === 'ja' ? '更新:' : 'Updated:'} {formatDate(q.updatedAt)}
                        </span>
                      )}
                      {user && (
                        <button
                          onClick={() => toggleBookmark(q.questionId)}
                          disabled={isBmLoading}
                          title={isBookmarked ? t('questions.removeBookmark') : t('questions.bookmark')}
                          style={{
                            marginLeft: 'auto',
                            background: 'none', border: 'none', cursor: isBmLoading ? 'default' : 'pointer',
                            padding: '2px 4px', borderRadius: 4,
                            fontSize: 20, lineHeight: 1,
                            color: isBookmarked ? 'var(--color-warning, #f59e0b)' : 'var(--color-text-light)',
                            opacity: isBmLoading ? 0.5 : 1,
                            transition: 'color 0.15s, opacity 0.15s',
                          }}
                          onMouseEnter={e => { if (!isBmLoading) e.currentTarget.style.color = 'var(--color-warning, #f59e0b)'; }}
                          onMouseLeave={e => { if (!isBmLoading) e.currentTarget.style.color = isBookmarked ? 'var(--color-warning, #f59e0b)' : 'var(--color-text-light)'; }}
                        >
                          {isBookmarked ? '★' : '☆'}
                        </button>
                      )}
                    </div>
                    <p style={{ margin: '0 0 var(--spacing-md)', fontWeight: 700, fontSize: 'var(--font-size-md)', lineHeight: 1.6, color: 'var(--color-text-main)' }}>
                      {qText}
                    </p>
                    <ol style={{ margin: '0 0 var(--spacing-lg)', paddingLeft: 'var(--spacing-xl)', fontSize: 'var(--font-size-base)', color: 'var(--color-text-sub)', lineHeight: 1.6 }}>
                      {choices.map((c: string, i: number) => <li key={i}>{c}</li>)}
                    </ol>

                    {isExpanded && q.correctAnswers && (
                      <div style={{
                        background: 'var(--color-feedback-correct-bg)',
                        borderLeft: '4px solid var(--color-success)',
                        borderRadius: 'var(--border-radius-md)',
                        padding: '16px 20px',
                        marginBottom: 'var(--spacing-lg)',
                        fontSize: 'var(--font-size-base)'
                      }}>
                        <p style={{ margin: '0 0 var(--spacing-sm)' }}>
                          <strong style={{ color: 'var(--color-success)' }}>{t('questions.correctAnswer')}</strong>{q.correctAnswers.join(', ')}
                        </p>
                        <div style={{ color: 'var(--color-text-main)', lineHeight: 1.6 }}>
                          <strong>{t('questions.explanation')}</strong>
                          <div style={{ marginTop: 8, fontSize: 'var(--font-size-sm)' }}>{expl}</div>
                        </div>
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: 'var(--spacing-md)' }}>
                      <Button variant="outline" size="sm" onClick={() => fetchDetail(q.questionId)}>
                        {isExpanded ? t('questions.hideExplanation') : t('questions.showExplanation')}
                      </Button>
                      <Button
                        variant={copiedId === q.questionId ? 'primary' : 'outline'}
                        size="sm"
                        onClick={() => copyQuestion(q)}
                        style={{ color: copiedId === q.questionId ? 'white' : 'var(--color-text-sub)', borderColor: copiedId === q.questionId ? 'var(--color-primary)' : 'var(--color-border)' }}
                      >
                        {copiedId === q.questionId ? t('questions.copied') : t('questions.copy')}
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* ページネーション */}
      {!loading && totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--spacing-sm)', marginTop: 'var(--spacing-xl)' }}>
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
            ←
          </Button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
            <button
              key={p}
              onClick={() => setPage(p)}
              style={{
                minWidth: 32, height: 32, borderRadius: 'var(--border-radius-md)',
                border: p === page ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                background: p === page ? 'var(--color-primary-light)' : 'transparent',
                color: p === page ? 'var(--color-primary)' : 'var(--color-text-sub)',
                fontWeight: p === page ? 700 : 400,
                fontSize: 'var(--font-size-sm)', cursor: 'pointer',
              }}
            >{p}</button>
          ))}
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
            →
          </Button>
        </div>
      )}

      </div>{/* メインカラム終了 */}

      </div>{/* グリッド終了 */}
    </div>
  );
}
