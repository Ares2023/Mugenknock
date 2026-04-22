import React from 'react';
import { useNavigate } from 'react-router-dom';

type BreadcrumbItem = {
  label: string;
  path?: string;
};

type Props = {
  items: BreadcrumbItem[];
  style?: React.CSSProperties;
};

export default function Breadcrumb({ items, style }: Props) {
  const navigate = useNavigate();

  return (
    <nav style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: '#545b64', marginBottom: 20, flexWrap: 'wrap', fontWeight: 400, ...style }}>
      {items.map((item, index) => (
        <React.Fragment key={index}>
          {index > 0 && <span style={{ color: '#879596', fontSize: 12 }}>❯</span>}
          {item.path ? (
            <button
              onClick={() => navigate(item.path!)}
              style={{
                background: 'none', border: 'none', padding: 0,
                color: '#008c8c', cursor: 'pointer', fontSize: 14,
                textDecoration: 'none',
              }}
              onMouseEnter={e => e.currentTarget.style.textDecoration = 'underline'}
              onMouseLeave={e => e.currentTarget.style.textDecoration = 'none'}
            >
              {item.label}
            </button>
          ) : (
            <span style={{ color: '#545b64' }}>{item.label}</span>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
}
