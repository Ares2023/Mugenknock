import React from 'react';

interface AdPlaceholderProps {
  width?: string | number;
  height?: string | number;
  isPremium?: boolean;
}

const AdPlaceholder: React.FC<AdPlaceholderProps> = ({
  width = '100%',
  height = '250px',
  isPremium = false,
}) => {
  if (isPremium) return null;

  return (
    <div
      aria-hidden="true"
      style={{
        width,
        height,
        minHeight: height,
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6px',
        border: '1px dashed var(--color-border)',
        borderRadius: 'var(--border-radius-md)',
        background: 'var(--color-bg-main)',
        color: 'var(--color-text-light)',
        fontSize: 'var(--font-size-xs)',
        letterSpacing: '0.05em',
        userSelect: 'none',
      }}
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {/* Lucide: layout-panel-top */}
        <rect width="18" height="18" x="3" y="3" rx="2" />
        <path d="M3 9h18" />
        <path d="M9 21V9" />
      </svg>
      <span>広告</span>
    </div>
  );
};

export default AdPlaceholder;
