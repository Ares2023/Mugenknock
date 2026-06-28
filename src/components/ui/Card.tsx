import React from 'react';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  title?: React.ReactNode;
  footer?: React.ReactNode;
  padding?: string | number;
}

const Card: React.FC<CardProps> = ({
  children,
  title,
  footer,
  style,
  className,
  padding = 'var(--spacing-lg)',
  onClick,
  ...rest
}) => {
  return (
    <div
      className={className}
      onClick={onClick}
      {...rest}
      style={{
        background: 'var(--color-bg-white)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--border-radius-md)',
        boxShadow: 'var(--box-shadow-sm)',
        display: 'flex',
        flexDirection: 'column',
        ...style,
      }}
    >
      {title && (
        <div
          style={{
            padding: 'var(--spacing-md) var(--spacing-lg)',
            borderBottom: '1px solid var(--color-border)',
            fontWeight: 700,
            fontSize: 'var(--font-size-md)',
            color: 'var(--color-text-main)',
          }}
        >
          {title}
        </div>
      )}
      <div style={{ padding, flex: 1 }}>{children}</div>
      {footer && (
        <div
          style={{
            padding: 'var(--spacing-md) var(--spacing-lg)',
            borderTop: '1px solid var(--color-border)',
            background: 'var(--color-bg-main)',
            borderBottomLeftRadius: 'var(--border-radius-md)',
            borderBottomRightRadius: 'var(--border-radius-md)',
          }}
        >
          {footer}
        </div>
      )}
    </div>
  );
};

export default Card;
