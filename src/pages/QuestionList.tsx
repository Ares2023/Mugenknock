import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { API_ENDPOINT, EXAM_DOMAINS, DOMAIN_NAME_EN } from '../constants';
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
};

const formatDate = (iso: string) => {
  const d = new Date(iso);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${mm}/${dd} ${hh}:${mi}`;
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
  const navigate = useNavigate();
  const location = useLocation();
  const { lang, t } = useLanguage();
  const { user } = useAuth();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [examType, setExamType] = useState('');
  const [keyword, setKeyword] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set());
  const [bookmarkLoading, setBookmarkLoading] = useState<Set<string>>(new Set());
  const [bookmarkOnly, setBookmarkOnly] = useState(false);
  const [selectedDomains, setSelectedDomains] = useState<string[]>([]);
  const [domainExpanded, setDomainExpanded] = useState(false);

  const fetchQuestions = async (type: string, kw: string, domains: string[]) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (type) params.set('examType', type);
      if (kw.trim()) params.set('keyword', kw.trim());
      if (domains.length > 0) params.set('domain', domains.join(','));
      const url = `${API_ENDPOINT}/questions${params.toString() ? '?' + params : ''}`;
      const res = await fetch(url);
      const data = await res.json();
      setQuestions(data.items || []);
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
    setKeyword(kw);
    fetchQuestions('', kw, []);
    setSelectedDomains([]);
    setExamType('');
  }, [location.search]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    navigate(`/questions${keyword.trim() ? '?keyword=' + encodeURIComponent(keyword.trim()) : ''}`);
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

  const displayedQuestions = bookmarkOnly
    ? questions.filter(q => bookmarkedIds.has(q.questionId))
    : questions;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 'var(--spacing-xl) var(--spacing-lg)' }} className="page-container">
      <div style={{ marginBottom: 'var(--spacing-xl)' }}>
        <h1 style={{ color: 'var(--color-text-main)', margin: '0 0 var(--spacing-xs)', fontSize: 'var(--font-size-xxl)', fontWeight: 700 }}>{t('questions.title')}</h1>
        <p style={{ fontSize: 'var(--font-size-base)', color: 'var(--color-text-sub)', margin: 0, lineHeight: 1.6 }}>{t('questions.description')}</p>
      </div>

      <Card padding="var(--spacing-lg)" style={{ marginBottom: 'var(--spacing-xl)' }}>
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: 'var(--spacing-md)', marginBottom: 'var(--spacing-md)' }}>
          <input
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
            placeholder={t('questions.searchPlaceholder')}
            style={{
              flex: 1, padding: '8px 12px',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--border-radius-md)',
              fontSize: 'var(--font-size-base)', outline: 'none',
              transition: 'border-color 0.2s',
            }}
            onFocus={e => e.currentTarget.style.borderColor = 'var(--color-primary)'}
            onBlur={e => e.currentTarget.style.borderColor = 'var(--color-border)'}
          />
          <Button type="submit">
            {t('questions.search')}
          </Button>
          {keyword && (
            <Button variant="outline" type="button" onClick={() => navigate('/questions')} style={{ color: 'var(--color-text-light)' }}>
              {t('questions.clear')}
            </Button>
          )}
        </form>

        <div style={{ display: 'flex', gap: 'var(--spacing-sm)', flexWrap: 'wrap', alignItems: 'center', marginBottom: 'var(--spacing-sm)' }}>
          {['CLF', 'SAA', 'SAP', 'DOP'].map(type => (
            <Button
              key={type}
              variant={examType === type ? 'primary' : 'outline'}
              size="sm"
              onClick={() => {
                const next = type === examType ? '' : type;
                setExamType(next);
                setSelectedDomains([]);
                fetchQuestions(next, keyword, []);
              }}
            >
              {type}
            </Button>
          ))}
          {user && (
            <Button
              variant={bookmarkOnly ? 'primary' : 'outline'}
              size="sm"
              onClick={() => setBookmarkOnly(v => !v)}
              style={bookmarkOnly ? {} : { color: 'var(--color-warning, #f59e0b)', borderColor: 'var(--color-warning, #f59e0b)' }}
            >
              ★ {t('questions.bookmarkFilter')}
            </Button>
          )}
        </div>

        {/* ドメインフィルタ（試験種別選択時のみ表示） */}
        {examType && EXAM_DOMAINS[examType] && (
          <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--border-radius-md)', overflow: 'hidden' }}>
            <button
              type="button"
              onClick={() => setDomainExpanded(v => !v)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px var(--spacing-md)', border: 'none', cursor: 'pointer',
                background: selectedDomains.length > 0 ? 'var(--color-primary-light)' : 'var(--color-bg-white)',
                color: selectedDomains.length > 0 ? 'var(--color-primary)' : 'var(--color-text-sub)',
                fontWeight: selectedDomains.length > 0 ? 700 : 400, fontSize: 'var(--font-size-sm)',
              }}
            >
              <span>
                {t('questions.domainFilter')}：{selectedDomains.length === 0
                  ? t('questions.all')
                  : lang === 'ja' ? `${selectedDomains.length}ドメイン選択中` : `${selectedDomains.length} domain(s) selected`}
              </span>
              <span style={{ fontSize: 11, color: 'var(--color-text-light)', display: 'inline-block', transform: domainExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
            </button>
            {domainExpanded && (
              <div style={{ borderTop: '1px solid var(--color-border)', padding: 'var(--spacing-sm) var(--spacing-md)', background: 'var(--color-bg-main)', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-xs)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', cursor: 'pointer', fontSize: 'var(--font-size-sm)', padding: '3px 0', color: 'var(--color-text-sub)' }}>
                  <input type="checkbox" checked={selectedDomains.length === 0} onChange={() => { setSelectedDomains([]); fetchQuestions(examType, keyword, []); }} style={{ width: 15, height: 15 }} />
                  {t('questions.all')}（{lang === 'ja' ? 'クリア' : 'Clear'}）
                </label>
                {EXAM_DOMAINS[examType].map(d => {
                  const checked = selectedDomains.includes(d);
                  return (
                    <label key={d} style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', cursor: 'pointer', fontSize: 'var(--font-size-base)', padding: '3px 0' }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          const next = checked ? selectedDomains.filter(x => x !== d) : [...selectedDomains, d];
                          setSelectedDomains(next);
                          fetchQuestions(examType, keyword, next);
                        }}
                        style={{ width: 15, height: 15 }}
                      />
                      <span style={{ color: checked ? 'var(--color-primary)' : 'var(--color-text-main)', fontWeight: checked ? 700 : 400, lineHeight: 1.4 }}>
                        {lang === 'en' ? (DOMAIN_NAME_EN[d] ?? d) : d}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </Card>

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
          {displayedQuestions.map(q => {
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
                      {q.updatedAt && (
                        <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-light)' }}>
                          最終更新: {formatDate(q.updatedAt)}
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
                        background: '#f2fcf3',
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
    </div>
  );
}
