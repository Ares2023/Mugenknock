import React from 'react';
import { DOMAIN_NAME_EN } from '../constants';
import Button from './ui/Button';

type Props = {
  domains: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  lang: string;
  label?: React.ReactNode;
  noMargin?: boolean;
};

const activeStyle: React.CSSProperties = {
  background: 'var(--color-primary-light)',
  color: 'var(--color-primary)',
  borderColor: 'var(--color-primary)',
  borderWidth: 2,
};

export default function DomainSelector({ domains, selected, onChange, lang, label, noMargin }: Props) {
  const allSelected = domains.every(d => selected.includes(d));
  const dn = (d: string) => lang === 'en' ? (DOMAIN_NAME_EN[d] ?? d) : d;

  const toggle = (d: string) => {
    if (selected.includes(d)) {
      if (selected.length === 1) return;
      onChange(selected.filter(x => x !== d));
    } else {
      onChange([...selected, d]);
    }
  };

  return (
    <div style={{ marginBottom: noMargin ? 0 : 'var(--spacing-lg)' }}>
      {label}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--spacing-xs)' }}>
        <Button
          size="sm"
          variant="outline"
          style={allSelected ? activeStyle : {}}
          onClick={() => onChange(allSelected ? [] : [...domains])}
        >
          {lang === 'ja' ? 'すべて' : 'All'}
        </Button>
        {domains.map(d => (
          <Button
            key={d}
            size="sm"
            variant="outline"
            style={selected.includes(d) ? activeStyle : {}}
            onClick={() => toggle(d)}
          >
            {dn(d)}
          </Button>
        ))}
      </div>

      {selected.length === 0 && (
        <p style={{ margin: '6px 0 0', fontSize: 'var(--font-size-xs)', color: 'var(--color-danger)' }}>
          {lang === 'ja' ? '最低1つのドメインを選択してください' : 'Please select at least one domain'}
        </p>
      )}
    </div>
  );
}
