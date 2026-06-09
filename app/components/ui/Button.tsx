import { ButtonHTMLAttributes, ReactNode } from 'react';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  children: ReactNode;
}

const variantStyle: Record<string, React.CSSProperties> = {
  primary:   { background: 'var(--accent)', color: '#fff' },
  secondary: { background: 'transparent', color: 'var(--accent)', border: '1px solid var(--accent)' },
  ghost:     { background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border)' },
  danger:    { background: '#2d1a1a', color: '#f87171' },
};

const variantHover: Record<string, string> = {
  primary:   'hover:opacity-90',
  secondary: 'hover:opacity-90',
  ghost:     'hover:bg-white/5',
  danger:    'hover:opacity-80',
};

const sizeClass: Record<string, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-5 py-2.5 text-sm',
  lg: 'px-6 py-3 text-base',
};

export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  children,
  className = '',
  disabled,
  style,
  ...props
}: Props) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={`rounded-lg font-medium transition-opacity disabled:opacity-50 inline-flex items-center justify-center gap-2 ${sizeClass[size]} ${variantHover[variant]} ${className}`}
      style={{ ...variantStyle[variant], ...style }}
    >
      {loading && (
        <svg className="animate-spin h-3.5 w-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {children}
    </button>
  );
}
