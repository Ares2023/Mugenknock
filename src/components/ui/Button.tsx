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
  const getSizeStyle = (): React.CSSProperties => {
    switch (size) {
      case 'sm': return { padding: '4px 12px', fontSize: 'var(--font-size-sm)' };
      case 'lg': return { padding: '12px 24px', fontSize: 'var(--font-size-lg)' };
      default:   return { padding: '8px 20px',  fontSize: 'var(--font-size-base)' };
    }
  };

  const baseStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
    borderRadius: 'var(--border-radius-full)',
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    width: fullWidth ? '100%' : 'auto',
    transition: 'background-color 0.15s ease, border-width 0.1s ease',
    ...getSizeStyle(),
    ...style,
  };

  const variantClass = `btn-${variant ?? 'primary'}`;

  return (
    <button
      className={[variantClass, className].filter(Boolean).join(' ')}
      style={baseStyle}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
};

export default Button;
