import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import {
  EXAM_TYPES, EXAM_CONFIGS, EXAM_LEVEL, EXAM_DOMAINS, PASS_RATE,
  EXAM_DESC_JA, EXAM_DESC_EN,
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

  const cfg = EXAM_CONFIGS[selectedExam];
  const level = EXAM_LEVEL[selectedExam] ?? '';
  const passRate = PASS_RATE[selectedExam];
  const domains = EXAM_DOMAINS[selectedExam] ?? [];
  const desc = ja ? EXAM_DESC_JA[selectedExam] : EXAM_DESC_EN[selectedExam];
  const lc = LEVEL_COLOR[level] ?? LEVEL_COLOR.Associate;

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* ── 資格選択 ── */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-light)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
          {ja ? '目標資格' : 'Target Certification'}
        </div>
        <select
          value={selectedExam}
          onChange={e => handleChange(e.target.value)}
          style={{
            width: '100%', padding: '10px 14px', fontSize: 15, fontWeight: 600,
            border: '2px solid var(--color-primary)', borderRadius: 8,
            background: 'var(--color-bg-white)', color: 'var(--color-text-main)',
            cursor: 'pointer', outline: 'none', appearance: 'auto',
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
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-primary)', minWidth: 24, fontVariantNumeric: 'tabular-nums' }}>
                  {i + 1}
                </span>
                <span style={{ fontSize: 13, color: 'var(--color-text-main)', lineHeight: 1.4 }}>{d}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── クイックナビ ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-light)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          {ja ? 'この資格で学習する' : 'Study for This Exam'}
        </div>
        {[
          { label: ja ? '演習を始める' : 'Start Exercise', path: '/aws/exercise/setup' },
          { label: ja ? '模擬試験を始める' : 'Start Mock Exam', path: '/aws/exam/setup' },
          { label: ja ? '学習統計を見る' : 'View Stats', path: '/aws/stats' },
        ].map(({ label, path }) => (
          <button
            key={path}
            onClick={() => navigate(path)}
            style={{
              padding: '12px 16px', border: '1px solid var(--color-border)', borderRadius: 8,
              background: 'var(--color-bg-white)', color: 'var(--color-text-main)',
              cursor: 'pointer', fontSize: 14, fontWeight: 600, textAlign: 'left',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-bg-main)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-bg-white)'; }}
          >
            <span>{label}</span>
            <span style={{ color: 'var(--color-primary)', fontSize: 18, fontWeight: 900 }}>›</span>
          </button>
        ))}
      </div>
    </div>
  );
}
