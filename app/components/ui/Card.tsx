import { ReactNode, HTMLAttributes } from 'react';

interface Props extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'bordered';
  hover?: boolean;
  children: ReactNode;
}

export default function Card({
  variant = 'default',
  hover = false,
  children,
  className = '',
  style,
  ...props
}: Props) {
  return (
    <div
      {...props}
      className={`rounded-xl border transition-colors ${hover ? 'card-hover' : ''} ${className}`}
      style={{
        background: 'var(--bg-surface)',
        borderColor: variant === 'bordered' ? 'var(--accent)' : 'var(--border)',
        ...style,
      }}
    >
      {children}
    </div>
  );
}
