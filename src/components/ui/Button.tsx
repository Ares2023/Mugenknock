import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'outline' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
}

const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  style,
  className,
  disabled,
  ...props
}) => {
  const getVariantStyle = (): React.CSSProperties => {
    switch (variant) {
      case 'primary':
        return {
          backgroundColor: 'var(--color-primary)',
          color: 'var(--color-on-primary)',
          border: '1px solid var(--color-primary)',
        };
      case 'outline':
        return {
          backgroundColor: 'transparent',
          color: 'var(--color-primary)',
          border: '1px solid var(--color-primary)',
        };
      case 'danger':
        return {
          backgroundColor: 'var(--color-danger)',
          color: 'var(--color-on-danger)',
          border: '1px solid var(--color-danger)',
        };
      default:
        return {
          backgroundColor: 'var(--color-primary)',
          color: 'var(--color-on-primary)',
          border: '1px solid var(--color-primary)',
        };
    }
  };

  const getSizeStyle = (): React.CSSProperties => {
    switch (size) {
      case 'sm':
        return { padding: '4px 12px', fontSize: 'var(--font-size-sm)' };
      case 'lg':
        return { padding: '12px 24px', fontSize: 'var(--font-size-lg)' };
      default:
        return { padding: '8px 20px', fontSize: 'var(--font-size-base)' };
    }
  };

  const baseStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
    borderRadius: 'var(--border-radius-full)',
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.6 : 1,
    width: fullWidth ? '100%' : 'auto',
    transition: 'all 0.2s ease',
    ...getVariantStyle(),
    ...getSizeStyle(),
    ...style,
  };

  return (
    <button
      className={className}
      style={baseStyle}
      disabled={disabled}
      onMouseEnter={(e) => {
        if (disabled) return;
        if (variant === 'primary' || !variant) e.currentTarget.style.backgroundColor = 'var(--color-primary-hover)';
        if (variant === 'outline') e.currentTarget.style.backgroundColor = 'var(--color-primary-light)';
        if (variant === 'danger') e.currentTarget.style.backgroundColor = 'var(--color-danger-hover, #c0392b)';
      }}
      onMouseLeave={(e) => {
        if (disabled) return;
        const vs = getVariantStyle();
        e.currentTarget.style.backgroundColor = vs.backgroundColor as string;
      }}
      {...props}
    >
      {children}
    </button>
  );
};

export default Button;
