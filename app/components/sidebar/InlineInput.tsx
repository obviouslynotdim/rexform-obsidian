'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

interface InlineInputProps {
  folder: string;
  type: 'note' | 'folder';
  depth: number;
  onCreated: (expandFolder?: string) => void;
  onCancel: () => void;
}

export default function InlineInput({ folder, type, depth, onCreated, onCancel }: InlineInputProps) {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => { inputRef.current?.focus(); }, []);

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed) { onCancel(); return; }
    setLoading(true);
    setError('');

    if (type === 'folder') {
      const targetFolder = folder ? `${folder}/${trimmed}` : trimmed;
      const res = await fetch('/api/notes/folder/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder: targetFolder }),
      });
      const data = await res.json();
      setLoading(false);
      if (res.ok) {
        onCreated(targetFolder);
        onCancel();
      } else {
        setError(data.error || 'Failed');
      }
      return;
    }

    // type === 'note'
    const res = await fetch('/api/notes/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: trimmed, folder }),
    });
    const data = await res.json();
    setLoading(false);
    if (res.ok) {
      onCreated(folder || undefined);
      router.push(`/notes/${encodeURIComponent(data.id)}`);
      onCancel();
    } else {
      setError(data.error || 'Failed');
    }
  }

  return (
    <div style={{ paddingLeft: `${depth * 14 + 22}px`, paddingRight: '8px' }} className="py-0.5">
      <input
        ref={inputRef}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
          if (e.key === 'Escape') onCancel();
        }}
        placeholder={type === 'folder' ? 'Folder name…' : 'Note name…'}
        disabled={loading}
        className="w-full px-2 py-0.5 rounded text-xs outline-none border"
        style={{ background: 'var(--bg-base)', borderColor: 'var(--accent)', color: 'var(--text-primary)' }}
      />
      {error && <p className="text-xs mt-0.5" style={{ color: 'var(--error, #e55)' }}>{error}</p>}
    </div>
  );
}
