'use client';
import { useState, useEffect, useRef } from 'react';

interface FolderPickerProps {
  noteId: string;
  folders: string[];
  onMoved: (newId: string) => void;
  onCancel: () => void;
}

function FolderIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
      <path d="M1.5 4.5C1.5 3.67 2.17 3 3 3h3.38l1.5 1.5H13c.83 0 1.5.67 1.5 1.5v6c0 .83-.67 1.5-1.5 1.5H3c-.83 0-1.5-.67-1.5-1.5V4.5z" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

function FolderRowIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
      <path d="M1 3.5C1 2.95 1.45 2.5 2 2.5h2.78l1.25 1.25H11c.55 0 1 .45 1 1v5c0 .55-.45 1-1 1H2c-.55 0-1-.45-1-1V3.5z" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg
      width="14" height="14" viewBox="0 0 14 14"
      style={{ animation: 'spin 0.7s linear infinite', flexShrink: 0, color: 'var(--accent)' }}
    >
      <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.25" fill="none" />
      <path d="M7 1.5 A5.5 5.5 0 0 1 12.5 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export default function FolderPicker({ noteId, folders, onMoved, onCancel }: FolderPickerProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = query.trim()
    ? folders.filter((f) => f.toLowerCase().includes(query.toLowerCase()))
    : folders;

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => { setSelectedIndex(0); }, [query]);

  useEffect(() => {
    const el = listRef.current?.children[selectedIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onCancel();
      }
    }
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [onCancel]);

  async function confirm(folderDisplay: string) {
    const folder = folderDisplay === '/' ? '' : folderDisplay;
    setLoading(true);
    setError('');
    const res = await fetch(`/api/notes/${encodeURIComponent(noteId)}/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folder }),
    });
    const data = await res.json();
    setLoading(false);
    if (res.ok) onMoved(data.id);
    else setError(data.error || 'Move failed');
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[selectedIndex] !== undefined) confirm(filtered[selectedIndex]);
    } else if (e.key === 'Escape') {
      onCancel();
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: '14vh',
      }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div
        ref={containerRef}
        style={{
          width: 580, maxHeight: '62vh',
          background: 'var(--bg-surface)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 12,
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 32px 80px rgba(0,0,0,0.6)',
        }}
      >
        {/* Input row */}
        <div style={{
          padding: '12px 16px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <FolderIcon />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setError(''); }}
            onKeyDown={handleKeyDown}
            placeholder="Move to folder…"
            disabled={loading}
            style={{
              flex: 1, background: 'none', border: 'none', outline: 'none',
              color: 'var(--text-primary)', fontSize: 15, lineHeight: 1.4,
            }}
          />
          {loading && <SpinnerIcon />}
          <kbd style={{
            fontSize: 10, color: 'var(--text-muted)',
            border: '1px solid var(--border)', borderRadius: 4,
            padding: '2px 5px', fontFamily: 'inherit',
          }}>Esc</kbd>
        </div>

        {error && (
          <div style={{ padding: '8px 16px', fontSize: 12, color: '#f87171', borderBottom: '1px solid var(--border)' }}>
            {error}
          </div>
        )}

        {/* Folder list */}
        <div ref={listRef} style={{ overflowY: 'auto', flex: 1 }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '28px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              No matching folders
            </div>
          ) : (
            filtered.map((f, i) => (
              <div
                key={f}
                onMouseDown={(e) => { e.preventDefault(); confirm(f); }}
                onMouseEnter={() => setSelectedIndex(i)}
                style={{
                  padding: '9px 16px',
                  cursor: 'pointer',
                  userSelect: 'none',
                  background: i === selectedIndex ? 'rgba(127,119,221,0.12)' : 'transparent',
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                  borderLeft: i === selectedIndex ? '2px solid var(--accent)' : '2px solid transparent',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}
              >
                <FolderRowIcon />
                <span style={{ fontSize: 13.5, color: 'var(--text-primary)' }}>{f}</span>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        {filtered.length > 0 && (
          <div style={{
            padding: '7px 16px',
            borderTop: '1px solid var(--border)',
            display: 'flex', gap: 14,
            fontSize: 11, color: 'var(--text-muted)',
          }}>
            <span>↑↓ navigate</span>
            <span>↵ move here</span>
            <span>esc cancel</span>
          </div>
        )}
      </div>
    </div>
  );
}
