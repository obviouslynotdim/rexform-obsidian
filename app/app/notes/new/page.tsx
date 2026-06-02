'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import NoteEditor from '@/components/NoteEditor';
import Link from 'next/link';

export default function NewNotePage() {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const handleCreate = async () => {
    if (!title.trim()) {
      setError('Title is required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/notes/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), content }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create note');
      router.push(`/notes/${encodeURIComponent(data.id)}`);
      router.refresh();
    } catch (e: any) {
      setError(e.message);
      setSaving(false);
    }
  };

  return (
    <div className="flex h-[calc(100vh-56px)]" style={{ background: '#1a1a2e' }}>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-8 py-10">
          {/* Title input */}
          <div className="mb-6">
            <input
              type="text"
              placeholder="Note title…"
              value={title}
              onChange={(e) => { setTitle(e.target.value); setError(''); }}
              onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
              className="w-full text-3xl font-bold bg-transparent outline-none border-b pb-3"
              style={{ color: '#f0f0f0', borderColor: '#2a2a4a', caretColor: '#7F77DD' }}
              autoFocus
            />
            {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
          </div>

          {/* Editor */}
          <div
            className="rounded-xl overflow-hidden border"
            style={{ height: '55vh', borderColor: '#2a2a4a' }}
          >
            <NoteEditor
              noteId="new"
              initialContent={content}
              onChange={setContent}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 mt-4">
            <button
              onClick={handleCreate}
              disabled={saving}
              className="px-6 py-2 rounded-lg font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ background: '#7F77DD', color: '#fff' }}
            >
              {saving ? 'Creating…' : 'Create Note'}
            </button>
            <Link
              href="/notes"
              className="px-6 py-2 rounded-lg font-medium border"
              style={{ borderColor: '#2a2a4a', color: '#8892a4' }}
            >
              Cancel
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
