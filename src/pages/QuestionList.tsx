import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { API_ENDPOINT } from '../constants';
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
};

export default function QuestionList() {
  const navigate = useNavigate();
  const location = useLocation();
  const { lang, t } = useLanguage();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [examType, setExamType] = useState('');
  const [keyword, setKeyword] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchQuestions = async (type: string, kw: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (type) params.set('examType', type);
      if (kw.trim()) params.set('keyword', kw.trim());
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
    const params = new URLSearchParams(location.search);
    const kw = params.get('keyword') || '';
    setKeyword(kw);
    fetchQuestions('', kw);
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

  const toggleSelect = (id: string) => {
    setSelected(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  };

  const selectAll = () => {
    selected.size === questions.length ? setSelected(new Set()) : setSelected(new Set(questions.map(q => q.questionId)));
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
    const targets = questions.filter(q => selected.has(q.questionId));
    const needFetch = targets.filter(q => !q.correctAnswers);
    const fetched = await Promise.all(needFetch.map(q => fetch(`${API_ENDPOINT}/questions/${q.questionId}`).then(r => r.json())));
    const map = Object.fromEntries(fetched.map(q => [q.questionId, q]));
    const full = targets.map(q => ({ ...q, ...map[q.questionId] }));
    const header = '問題ID,試験種別,問題文,選択肢,正解,解説\n';
    const rows = full.map(q => [q.questionId, q.examType, `"${q.questionText}"`, `"${q.choices.join(' / ')}"`, `"${(q.correctAnswers || []).join(' / ')}"`, `"${q.explanation || ''}"`].join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'questions.csv'; a.click();
    URL.revokeObjectURL(url);
  };

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
            <Button variant="ghost" type="button" onClick={() => navigate('/questions')} style={{ color: 'var(--color-text-light)' }}>
              {t('questions.clear')}
            </Button>
          )}
        </form>

        <div style={{ display: 'flex', gap: 'var(--spacing-sm)', flexWrap: 'wrap' }}>
          {['CLF', 'SAA', 'SAP', 'DOP'].map(type => (
            <Button
              key={type}
              variant={examType === type ? 'primary' : 'outline'}
              size="sm"
              onClick={() => { setExamType(type === examType ? '' : type); fetchQuestions(type === examType ? '' : type, keyword); }}
            >
              {type}
            </Button>
          ))}
        </div>
      </Card>

      <div style={{ marginBottom: 'var(--spacing-lg)', display: 'flex', gap: 'var(--spacing-md)', alignItems: 'center' }}>
        <Button variant="outline" size="sm" onClick={selectAll}>
          {selected.size === questions.length ? t('questions.deselectAll') : t('questions.selectAll')}
        </Button>
        <Button variant="secondary" size="sm" onClick={exportCSV} disabled={selected.size === 0}>
          {t('questions.csvExport', { n: selected.size })}
        </Button>
        <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-sub)', marginLeft: 'auto' }}>
          {t('questions.count', { n: questions.length })}
        </span>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 'var(--spacing-xl)' }}>
          <p style={{ color: 'var(--color-text-sub)' }}>{t('questions.loading')}</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
          {questions.map(q => {
            const qText = lang === 'en' && (q as any).questionTextEn ? (q as any).questionTextEn : q.questionText;
            const choices = lang === 'en' && (q as any).choicesEn ? (q as any).choicesEn : q.choices;
            const expl = lang === 'en' && (q as any).explanationEn ? (q as any).explanationEn : q.explanation;
            const isSelected = selected.has(q.questionId);
            const isExpanded = expandedId === q.questionId;

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
                    <div style={{ marginBottom: 'var(--spacing-sm)', display: 'flex', gap: 'var(--spacing-sm)' }}>
                      <Badge variant="secondary">{q.examType}</Badge>
                      {q.isMultiple && <Badge variant="outline">{t('questions.multiple')}</Badge>}
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
