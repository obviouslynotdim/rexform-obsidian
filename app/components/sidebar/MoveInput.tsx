'use client';
import { useState, useEffect, useRef } from 'react';
import type { FileNode } from './types';

interface MoveInputProps {
  node: FileNode;
  depth: number;
  onMoved: (newId: string) => void;
  onCancel: () => void;
}

export default function MoveInput({ node, depth, onMoved, onCancel }: MoveInputProps) {
  const currentFolder = node.path.split('/').slice(0, -1).join('/');
  const [folder, setFolder] = useState(currentFolder);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); inputRef.current?.select(); }, []);

  async function submit() {
    setLoading(true);
    setError('');
    const res = await fetch(`/api/notes/${encodeURIComponent(node.id)}/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folder }),
    });
    const data = await res.json();
    setLoading(false);
    if (res.ok) onMoved(data.id);
    else setError(data.error || 'Move failed');
  }

  return (
    <div style={{ paddingLeft: `${depth * 14 + 8}px`, paddingRight: '8px' }} className="py-0.5">
      <p className="text-xs mb-0.5" style={{ color: 'var(--text-muted)' }}>Move to folder:</p>
      <input
        ref={inputRef}
        value={folder}
        onChange={(e) => { setFolder(e.target.value); setError(''); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
          if (e.key === 'Escape') onCancel();
        }}
        placeholder="folder/subfolder (empty = root)"
        disabled={loading}
        className="w-full px-2 py-0.5 rounded text-xs outline-none border"
        style={{ background: 'var(--bg-base)', borderColor: 'var(--accent)', color: 'var(--text-primary)' }}
      />
      {error && <p className="text-xs mt-0.5" style={{ color: '#e55' }}>{error}</p>}
    </div>
  );
}
