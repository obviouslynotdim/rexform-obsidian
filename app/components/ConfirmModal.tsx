'use client';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  busy?: boolean;
  error?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

// Small "Are you sure?" dialog used for destructive actions (delete note/folder).
export default function ConfirmModal({
  title, message, confirmLabel = 'Delete', busy, error, onConfirm, onCancel,
}: Props) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.stopPropagation(); onCancel(); }
      if (e.key === 'Enter' && !busy) { e.stopPropagation(); onConfirm(); }
    }
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [busy, onConfirm, onCancel]);

  return createPortal(
    <div
      onClick={onCancel}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        position: 'fixed', inset: 0, zIndex: 300,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 360, maxWidth: '90vw',
          background: '#1e2030',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 12,
          boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
          padding: 18,
        }}
      >
        <h2 style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.9)', margin: '0 0 8px' }}>
          {title}
        </h2>
        <p style={{ fontSize: 12.5, lineHeight: 1.5, color: 'rgba(255,255,255,0.6)', margin: 0, wordBreak: 'break-word' }}>
          {message}
        </p>

        {error && (
          <div style={{
            marginTop: 10, padding: '6px 9px', borderRadius: 6, fontSize: 12,
            background: 'rgba(239,68,68,0.12)', color: '#f87171',
          }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button
            onClick={onCancel}
            disabled={busy}
            style={{
              padding: '5px 12px', borderRadius: 6, fontSize: 12.5, cursor: 'pointer',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: 'rgba(255,255,255,0.7)',
            }}
          >
            Cancel
          </button>
          <button
            autoFocus
            onClick={onConfirm}
            disabled={busy}
            style={{
              padding: '5px 12px', borderRadius: 6, fontSize: 12.5, fontWeight: 500,
              cursor: busy ? 'default' : 'pointer',
              background: '#c0392b', border: '1px solid transparent', color: '#fff',
              opacity: busy ? 0.6 : 1,
            }}
          >
            {busy ? 'Deleting…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
