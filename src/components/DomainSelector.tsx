import React from 'react';
import { DOMAIN_NAME_EN } from '../constants';
import Button from './ui/Button';

type Props = {
  domains: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  lang: string;
  label: React.ReactNode;
};

const HR = () => (
  <div style={{ borderTop: '1px solid var(--color-border)', margin: 'var(--spacing-sm) 0' }} />
);

export default function DomainSelector({ domains, selected, onChange, lang, label }: Props) {
  const allSelected = domains.every(d => selected.includes(d));
  const dn = (d: string) => lang === 'en' ? (DOMAIN_NAME_EN[d] ?? d) : d;

  const toggle = (d: string) => {
    if (selected.includes(d)) {
      if (selected.length === 1) return; // keep at least 1
      onChange(selected.filter(x => x !== d));
    } else {
      onChange([...selected, d]);
    }
  };

  return (
    <div style={{ marginBottom: 'var(--spacing-lg)' }}>
      {label}

      {/* クイック選択ボタン行 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--spacing-xs)', marginBottom: 'var(--spacing-sm)' }}>
        <Button
          size="sm"
          variant={allSelected ? 'primary' : 'outline'}
          onClick={() => onChange(allSelected ? [] : [...domains])}
        >
          {lang === 'ja' ? 'すべて' : 'All'}
        </Button>
        {domains.map(d => (
          <Button
            key={d}
            size="sm"
            variant={selected.includes(d) ? 'primary' : 'outline'}
            onClick={() => toggle(d)}
          >
            {dn(d)}
          </Button>
        ))}
      </div>

      <HR />

      {/* 選択中チップ（すべて選択時は非表示） */}
      {!allSelected && selected.length > 0 && (
        <>
          <div style={{ marginBottom: 'var(--spacing-sm)' }}>
            <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 700, color: 'var(--color-text-sub)', marginBottom: 'var(--spacing-xs)' }}>
              {lang === 'ja' ? `選択中ドメイン（${selected.length}件）` : `Selected (${selected.length})`}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--spacing-xs)' }}>
              {selected.map(d => (
                <span key={d} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  fontSize: 'var(--font-size-sm)', fontWeight: 600,
                  background: 'var(--color-primary-light)', color: 'var(--color-primary)',
                  borderRadius: 'var(--border-radius-sm)', padding: '3px 8px',
                }}>
                  {dn(d)}
                  <button
                    onClick={() => toggle(d)}
                    disabled={selected.length === 1}
                    style={{ background: 'none', border: 'none', cursor: selected.length === 1 ? 'default' : 'pointer', color: 'var(--color-primary)', fontSize: 11, padding: '0 0 0 2px', lineHeight: 1, opacity: selected.length === 1 ? 0.4 : 1 }}
                  >✕</button>
                </span>
              ))}
            </div>
          </div>
          <HR />
        </>
      )}

      {selected.length === 0 && (
        <p style={{ margin: '4px 0 0', fontSize: 'var(--font-size-xs)', color: 'var(--color-danger)' }}>
          {lang === 'ja' ? '最低1つのドメインを選択してください' : 'Please select at least one domain'}
        </p>
      )}
    </div>
  );
}
