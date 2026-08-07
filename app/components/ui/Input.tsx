'use client';
import { InputHTMLAttributes, useState } from 'react';

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

function EyeIcon({ crossed }: { crossed: boolean }) {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" />
      <circle cx="12" cy="12" r="3" />
      {crossed && <path d="M2 2l20 20" />}
    </svg>
  );
}

// type="password" fields get a show/hide toggle for free — every password
// field in the app (login, register, settings) goes through this component.
export default function Input({ label, error, hint, className = '', style, type, ...props }: Props) {
  const isPassword = type === 'password';
  const [revealed, setRevealed] = useState(false);

  return (
    <div>
      {label && (
        <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
          {label}
        </label>
      )}
      <div style={{ position: 'relative' }}>
        <input
          {...props}
          type={isPassword ? (revealed ? 'text' : 'password') : type}
          className={`w-full px-4 py-2.5 rounded-lg border text-sm outline-none transition-all ${isPassword ? 'pr-11' : ''} ${className}`}
          style={{
            background: 'var(--bg-base)',
            borderColor: error ? '#ef4444' : 'var(--border)',
            color: 'var(--text-primary)',
            ...style,
          }}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setRevealed((v) => !v)}
            tabIndex={-1}
            aria-label={revealed ? 'Hide password' : 'Show password'}
            className="absolute inset-y-0 right-0 flex items-center px-3 transition-colors hover:opacity-100"
            style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', opacity: 0.8 }}
          >
            <EyeIcon crossed={revealed} />
          </button>
        )}
      </div>
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
