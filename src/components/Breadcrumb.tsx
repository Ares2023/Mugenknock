import React from 'react';
import { useNavigate } from 'react-router-dom';

type BreadcrumbItem = {
  label: string;
  path?: string;
};

type Props = {
  items: BreadcrumbItem[];
};

export default function Breadcrumb({ items }: Props) {
  const navigate = useNavigate();

  return (
    <nav style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#888', marginBottom: 16, flexWrap: 'wrap' }}>
      {items.map((item, index) => (
        <React.Fragment key={index}>
          {index > 0 && <span style={{ color: '#bbb' }}>›</span>}
          {item.path ? (
            <button
              onClick={() => navigate(item.path!)}
              style={{ background: 'none', border: 'none', padding: 0, color: '#0073bb', cursor: 'pointer', fontSize: 13, textDecoration: 'underline' }}
            >
              {item.label}
            </button>
          ) : (
            <span style={{ color: '#555' }}>{item.label}</span>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
}
