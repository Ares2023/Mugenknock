import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'accent';
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
          color: 'var(--color-bg-white)',
          border: '1px solid var(--color-primary)',
        };
      case 'secondary':
        return {
          backgroundColor: 'var(--color-secondary)',
          color: 'var(--color-bg-white)',
          border: '1px solid var(--color-secondary)',
        };
      case 'outline':
        return {
          backgroundColor: 'transparent',
          color: 'var(--color-primary)',
          border: '1px solid var(--color-primary)',
        };
      case 'ghost':
        return {
          backgroundColor: 'transparent',
          color: 'var(--color-text-sub)',
          border: '1px solid transparent',
        };
      case 'danger':
        return {
          backgroundColor: 'var(--color-danger)',
          color: 'var(--color-bg-white)',
          border: '1px solid var(--color-danger)',
        };
      case 'accent':
        return {
          backgroundColor: 'var(--color-accent)',
          color: 'var(--color-secondary)',
          border: '1px solid var(--color-accent)',
        };
      default:
        return {};
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
        if (variant === 'primary') e.currentTarget.style.backgroundColor = 'var(--color-primary-hover)';
        if (variant === 'secondary') e.currentTarget.style.backgroundColor = 'var(--color-secondary-hover)';
        if (variant === 'outline') e.currentTarget.style.backgroundColor = 'var(--color-primary-light)';
        if (variant === 'ghost') e.currentTarget.style.backgroundColor = 'var(--color-bg-main)';
        if (variant === 'accent') e.currentTarget.style.backgroundColor = 'var(--color-accent-hover)';
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
