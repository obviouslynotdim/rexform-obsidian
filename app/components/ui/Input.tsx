import { InputHTMLAttributes } from 'react';

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export default function Input({ label, error, hint, className = '', style, ...props }: Props) {
  return (
    <div>
      {label && (
        <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
          {label}
        </label>
      )}
      <input
        {...props}
        className={`w-full px-4 py-2.5 rounded-lg border text-sm outline-none transition-all ${className}`}
        style={{
          background: 'var(--bg-base)',
          borderColor: error ? '#ef4444' : 'var(--border)',
          color: 'var(--text-primary)',
          ...style,
        }}
      />
      {error && (
        <p className="text-xs mt-1" style={{ color: '#f87171' }}>
          {error}
        </p>
      )}
      {!error && hint && (
        <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
          {hint}
        </p>
      )}
    </div>
  );
}
