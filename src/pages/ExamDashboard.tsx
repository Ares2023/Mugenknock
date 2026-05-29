import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import { IconChevronLeft } from '../components/Icons';
import {
  EXAM_TYPES, EXAM_CONFIGS, EXAM_LEVEL, EXAM_DOMAINS, PASS_RATE,
  EXAM_DESC_JA, EXAM_DESC_EN, DOMAIN_WEIGHTS, API_ENDPOINT,
} from '../constants';

const LEVEL_ORDER = ['Foundational', 'Associate', 'Professional', 'Specialty'] as const;

const LEVEL_COLOR: Record<string, { bg: string; text: string; border: string }> = {
  Foundational: { bg: '#f0f8ff', text: '#2563eb', border: '#bfdbfe' },
  Associate:    { bg: '#f0fdf4', text: '#16a34a', border: '#bbf7d0' },
  Professional: { bg: '#fdf4ff', text: '#9333ea', border: '#e9d5ff' },
  Specialty:    { bg: '#fff7ed', text: '#ea580c', border: '#fed7aa' },
};

export default function ExamDashboard() {
  const { user } = useAuth();
  const { lang } = useLanguage();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const ja = lang === 'ja';
  const uid = user?.userId ?? 'guest';

  const [selectedExam, setSelectedExam] = useState<string>(
    () => localStorage.getItem(`targetExam_${uid}`) ?? 'SAA'
  );

  const handleChange = (et: string) => {
    localStorage.setItem(`targetExam_${uid}`, et);
    setSelectedExam(et);
    window.dispatchEvent(new CustomEvent('targetExamChanged', { detail: et }));
  };

  const [passComments, setPassComments] = useState<Record<string, string>>({});
  useEffect(() => {
    fetch(`${API_ENDPOINT}/pass-comments`)
      .then(r => r.json())
      .then(d => setPassComments(d.comments ?? {}))
      .catch(() => {});
  }, []);

  const cfg = EXAM_CONFIGS[selectedExam];
  const level = EXAM_LEVEL[selectedExam] ?? '';
  const passRate = PASS_RATE[selectedExam];
  const domains = EXAM_DOMAINS[selectedExam] ?? [];
  const weights = DOMAIN_WEIGHTS[selectedExam] ?? [];
  const desc = ja ? EXAM_DESC_JA[selectedExam] : EXAM_DESC_EN[selectedExam];
  const lc = LEVEL_COLOR[level] ?? LEVEL_COLOR.Associate;
  const passComment = passComments[selectedExam];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--color-bg-main)', fontFamily: 'inherit' }}>

      {/* ── ヘッダー ── */}
      <header style={{
        height: 56, minHeight: 56, background: 'var(--color-bg-white)',
        display: 'flex', alignItems: 'center',
        padding: '0 16px 0 8px',
        borderBottom: '1px solid var(--color-border)',
        flexShrink: 0, position: 'sticky', top: 0, zIndex: 100,
      }}>
        <button
          onClick={() => navigate(-1)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 44, height: 44, border: 'none', background: 'none',
            cursor: 'pointer', color: 'var(--color-text-main)', borderRadius: 8,
            flexShrink: 0, transition: 'background 0.15s',
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--color-bg-main)'}
          onMouseLeave={e => e.currentTarget.style.background = 'none'}
        >
          <IconChevronLeft size={22} />
        </button>
        <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--color-text-main)' }}>
          {ja ? '資格ダッシュボード' : 'Exam Dashboard'}
        </span>
      </header>

      {/* ── スクロール可能なコンテンツ ── */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ maxWidth: 640, margin: '0 auto', padding: '24px 16px 48px', display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* ── 資格選択 ── */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-light)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
              {ja ? '目標資格' : 'Target Certification'}
            </div>
            <select
              value={selectedExam}
              onChange={e => handleChange(e.target.value)}
              style={{
                width: '100%', padding: '6px 10px', fontSize: 13, fontWeight: 600,
                border: '1px solid var(--color-border)', borderRadius: 8,
                background: 'var(--color-bg-white)', color: 'var(--color-text-main)',
                cursor: 'pointer', outline: 'none', appearance: 'auto',
                colorScheme: theme === 'dark' ? 'dark' : 'light',
              }}
            >
              {LEVEL_ORDER.map(lv => {
                const items = EXAM_TYPES.filter(et => EXAM_LEVEL[et] === lv);
                if (items.length === 0) return null;
                return (
                  <optgroup key={lv} label={lv}>
                    {items.map(et => (
                      <option key={et} value={et}>
                        {et} — {EXAM_CONFIGS[et]?.fullName}
                      </option>
                    ))}
                  </optgroup>
                );
              })}
            </select>
          </div>

          {/* ── 資格情報カード ── */}
          <div style={{ border: '1px solid var(--color-border)', borderRadius: 12, overflow: 'hidden', background: 'var(--color-bg-white)', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>

            {/* カードヘッダー */}
            <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid var(--color-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                <span style={{
                  fontSize: 11, fontWeight: 700, letterSpacing: '0.4px',
                  padding: '3px 10px', borderRadius: 9999,
                  background: lc.bg, color: lc.text, border: `1px solid ${lc.border}`,
                }}>
                  {level}
                </span>
                <span style={{ fontSize: 12, color: 'var(--color-text-light)', fontWeight: 600, fontFamily: 'monospace' }}>
                  {cfg?.examCode}
                </span>
              </div>
              <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--color-text-main)', lineHeight: 1.3 }}>
                {cfg?.fullName}
              </h1>
              {desc && (
                <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--color-text-sub)', lineHeight: 1.5 }}>
                  {desc}
                </p>
              )}
            </div>

            {/* 試験ルール */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-light)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12 }}>
                {ja ? '試験ルール' : 'Exam Rules'}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                {[
                  { label: ja ? '問題数' : 'Questions', value: `${cfg?.totalQuestions}${ja ? '問' : ''}` },
                  { label: ja ? '制限時間' : 'Time Limit', value: `${cfg?.timeLimitMin}${ja ? '分' : ' min'}` },
                  { label: ja ? '合格点' : 'Pass Score', value: `${passRate}%` },
                ].map(({ label, value }) => (
                  <div key={label} style={{ background: 'var(--color-bg-main)', borderRadius: 8, padding: '12px 14px', textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: 'var(--color-text-light)', fontWeight: 600, marginBottom: 4 }}>{label}</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--color-text-main)', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* 出題ドメイン */}
            <div style={{ padding: '16px 20px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-light)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12 }}>
                {ja ? '出題ドメイン' : 'Exam Domains'}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {domains.map((d, i) => (
                  <div key={d} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-primary)', minWidth: 24, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                      {i + 1}
                    </span>
                    <span style={{ fontSize: 13, color: 'var(--color-text-main)', lineHeight: 1.4, flex: 1 }}>{d}</span>
                    {weights[i] !== undefined && (
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-sub)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                        {weights[i]}%
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* 合格コメント */}
            {passComment && (
              <div style={{ padding: '16px 20px', borderTop: '1px solid var(--color-border)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-light)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>
                  {ja ? '合格コメント' : 'Pass Comment'}
                </div>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-main)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                  {passComment}
                </p>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
