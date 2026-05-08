import React, { useState, useRef, useEffect } from 'react';
import { DOMAIN_NAME_EN } from '../constants';

type Props = {
  domains: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  lang: string;
  label?: React.ReactNode;
  noMargin?: boolean;
};

const chipStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 3,
  padding: '2px 8px 4px',
  fontSize: 11,
  background: 'var(--color-primary-light)',
  color: 'var(--color-primary)',
  border: '1px solid var(--color-primary)',
  borderRadius: 'var(--border-radius-full)',
  lineHeight: 1,
};

const chipXStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'none', border: 'none', cursor: 'pointer',
  color: 'var(--color-primary)', fontSize: 12, lineHeight: 1,
  padding: 0, width: 14, height: 14, flexShrink: 0,
};

export default function DomainSelector({ domains, selected, onChange, lang, label, noMargin }: Props) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const allSelected = domains.every(d => selected.includes(d));
  const dn = (d: string) => lang === 'en' ? (DOMAIN_NAME_EN[d] ?? d) : d;

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const toggle = (d: string) => {
    if (selected.includes(d)) {
      if (selected.length === 1) return;
      onChange(selected.filter(x => x !== d));
    } else {
      onChange([...selected, d]);
    }
  };

  const removeChip = (d: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (selected.length === 1) return;
    onChange(selected.filter(x => x !== d));
  };

  const handleAllChange = () => {
    onChange(allSelected ? [domains[0]] : [...domains]);
  };

  return (
    <div style={{ marginBottom: noMargin ? 0 : 'var(--spacing-lg)' }}>
      {label}

      <div ref={containerRef} style={{ position: 'relative', display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
        {/* Trigger row */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setOpen(o => !o)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '5px 12px',
              fontSize: 'var(--font-size-sm)',
              fontWeight: 600,
              color: 'var(--color-primary)',
              border: '1.5px solid var(--color-primary)',
              borderRadius: 'var(--border-radius-full)',
              background: open ? 'var(--color-primary-light)' : 'transparent',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'background 0.15s',
            }}
          >
            {lang === 'ja' ? '出題ドメイン' : 'Domains'}
            <span style={{ fontSize: 9, lineHeight: 1 }}>{open ? '▲' : '▼'}</span>
          </button>

          {/* Dropdown panel — positioned relative to trigger */}
          {open && (
            <div style={{
              position: 'absolute',
              top: 'calc(100% + 4px)',
              left: 0,
              zIndex: 1000,
              background: 'var(--color-bg-white)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--border-radius-md)',
              boxShadow: 'var(--box-shadow-md)',
              padding: '6px 0',
              minWidth: 220,
              maxHeight: 320,
              overflowY: 'auto',
            }}>
              <label style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '7px 14px', cursor: 'pointer',
                fontSize: 'var(--font-size-sm)', fontWeight: 600,
                color: 'var(--color-text-main)',
                userSelect: 'none',
              }}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={handleAllChange}
                  style={{ cursor: 'pointer', width: 14, height: 14, flexShrink: 0 }}
                />
                {lang === 'ja' ? 'すべて' : 'All'}
              </label>
              <div style={{ height: 1, background: 'var(--color-border)', margin: '2px 0 4px' }} />
              {domains.map(d => (
                <label key={d} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '7px 14px', cursor: 'pointer',
                  fontSize: 'var(--font-size-sm)',
                  color: 'var(--color-text-main)',
                  userSelect: 'none',
                }}>
                  <input
                    type="checkbox"
                    checked={selected.includes(d)}
                    onChange={() => toggle(d)}
                    style={{ cursor: 'pointer', width: 14, height: 14, flexShrink: 0 }}
                  />
                  {dn(d)}
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Chips — shown below trigger when panel is closed */}
        {!open && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {allSelected ? (
              <span style={chipStyle}>
                {lang === 'ja' ? 'すべて' : 'All'}
                <button
                  onClick={(e) => { e.stopPropagation(); onChange([domains[0]]); }}
                  style={chipXStyle}
                >×</button>
              </span>
            ) : (
              selected.map(d => (
                <span key={d} style={chipStyle}>
                  {dn(d)}
                  {selected.length > 1 && (
                    <button
                      onClick={(e) => removeChip(d, e)}
                      style={chipXStyle}
                    >×</button>
                  )}
                </span>
              ))
            )}
          </div>
        )}
      </div>

      {selected.length === 0 && (
        <p style={{ margin: '6px 0 0', fontSize: 'var(--font-size-xs)', color: 'var(--color-danger)' }}>
          {lang === 'ja' ? '最低1つのドメインを選択してください' : 'Please select at least one domain'}
        </p>
      )}
    </div>
  );
}
