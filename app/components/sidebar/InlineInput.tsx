'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

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

  const { data: fileSettings } = useSWR<{ syncHeadingWithFilename?: boolean }>(
    '/api/user/settings',
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60_000 }
  );

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

    // type === 'note' — start with a synced "# Heading" unless the user turned
    // filename/heading sync off, in which case start with an empty body
    // (Obsidian convention: filename = title, body = content only).
    const initialContent = fileSettings?.syncHeadingWithFilename === false
      ? ''
      : `# ${trimmed}\n\n`;
    const res = await fetch('/api/notes/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: trimmed, folder, content: initialContent }),
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
