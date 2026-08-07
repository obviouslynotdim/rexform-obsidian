'use client';
import { useCallback, useState } from 'react';

export type ToastType = 'success' | 'error';
export interface ToastState { msg: string; type: ToastType }

// Bottom-right, auto-dismissing notice. Was duplicated verbatim across the
// admin panel and the vault detail page — pulled out so new call sites (e.g.
// plugin uninstall) reuse the same widget instead of re-copying it.
export function Toast({ msg, type }: ToastState) {
  return (
    <div
      className="fixed bottom-6 right-6 z-[100] px-4 py-3 rounded-xl text-sm font-medium shadow-lg"
      style={{
        background: type === 'success' ? '#14532d' : '#7f1d1d',
        color: '#fff',
        border: `1px solid ${type === 'success' ? '#4ade80' : '#f87171'}`,
      }}
    >
      {type === 'success' ? '✓' : '✗'} {msg}
    </div>
  );
}

export function useToast() {
  const [toast, setToast] = useState<ToastState | null>(null);

  const showToast = useCallback((msg: string, type: ToastType) => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  return { toast, showToast };
}
