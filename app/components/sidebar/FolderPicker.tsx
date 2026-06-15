'use client';
import { useState, useEffect, useRef } from 'react';

interface FolderPickerProps {
  noteId: string;
  folders: string[];
  onMoved: (newId: string) => void;
  onCancel: () => void;
}

export default function FolderPicker({ noteId, folders, onMoved, onCancel }: FolderPickerProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = query.trim()
    ? folders.filter((f) => f.toLowerCase().includes(query.toLowerCase()))
    : folders;

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => { setSelectedIndex(0); }, [query]);

  useEffect(() => {
    const el = listRef.current?.children[selectedIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

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
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.55)',
        zIndex: 10000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div style={{
        background: '#1e2030',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '10px',
        boxShadow: '0 24px 48px rgba(0,0,0,0.6)',
        width: '340px',
        maxHeight: '400px',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Search input */}
        <div style={{ padding: '12px 12px 8px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setError(''); }}
            onKeyDown={handleKeyDown}
            placeholder="Type a folder..."
            disabled={loading}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: '6px',
              padding: '7px 10px',
              fontSize: '13px',
              color: 'var(--text-primary)',
              outline: 'none',
            }}
          />
          {error && (
            <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#f87171' }}>{error}</p>
          )}
        </div>

        {/* Folder list */}
        <div ref={listRef} style={{ overflowY: 'auto', flex: 1 }}>
          {filtered.length === 0 ? (
            <p style={{ padding: '12px 16px', fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
              No matching folders
            </p>
          ) : (
            filtered.map((f, i) => (
              <div
                key={f}
                onMouseDown={(e) => { e.preventDefault(); confirm(f); }}
                onMouseEnter={() => setSelectedIndex(i)}
                style={{
                  padding: '8px 16px',
                  fontSize: '13px',
                  cursor: 'pointer',
                  userSelect: 'none',
                  color: i === selectedIndex ? '#fff' : 'rgba(255,255,255,0.72)',
                  background: i === selectedIndex ? 'var(--accent)' : 'transparent',
                }}
              >
                {f}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
