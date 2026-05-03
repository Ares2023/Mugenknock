import React from 'react';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'success' | 'warning' | 'neutral';
  style?: React.CSSProperties;
}

const Badge: React.FC<BadgeProps> = ({ children, variant = 'neutral', style }) => {
  const getVariantStyle = (): React.CSSProperties => {
    switch (variant) {
      case 'primary':
        return { backgroundColor: 'var(--color-primary)', color: 'white' };
      case 'secondary':
        return { backgroundColor: 'var(--color-secondary)', color: 'white' };
      case 'outline':
        return { backgroundColor: 'transparent', color: 'var(--color-primary)', border: '1px solid var(--color-primary)' };
      case 'danger':
        return { backgroundColor: 'var(--color-danger)', color: 'var(--color-on-danger)' };
      case 'success':
        return { backgroundColor: 'var(--color-success)', color: 'var(--color-on-success)' };
      case 'warning':
        return { backgroundColor: 'var(--color-warning)', color: '#1a1a1a' };
      case 'neutral':
      default:
        return { backgroundColor: 'var(--color-bg-main)', color: 'var(--color-text-main)', border: '1px solid var(--color-border)' };
    }
  };

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 10px',
        borderRadius: 'var(--border-radius-full)',
        fontSize: 'var(--font-size-xs)',
        fontWeight: 700,
        whiteSpace: 'nowrap',
        ...getVariantStyle(),
        ...style,
      }}
    >
      {children}
    </span>
  );
};

export default Badge;
