'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { mutate } from 'swr';
import NoteEditor from '@/components/NoteEditor';
import Link from 'next/link';
import Button from '@/components/ui/Button';

const fetcher = (url: string) => fetch(url).then((r) => r.json());
interface VaultOption { name: string; label: string; role?: string }
interface VaultsData { vaults: VaultOption[]; activeVault: string }

export default function NewNotePage() {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const { data: vaultsData } = useSWR<VaultsData>('/api/vaults', fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  });
  const activeRole = vaultsData?.vaults.find((v) => v.name === vaultsData.activeVault)?.role;
  const canWrite = !vaultsData || activeRole !== 'viewer';

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
      // Invalidate all paginated notes keys so the sidebar refreshes
      await mutate((key) => typeof key === 'string' && key.startsWith('/api/notes'), undefined, { revalidate: true });
      router.push(`/notes/${encodeURIComponent(data.id)}`);
      router.refresh();
    } catch (e: any) {
      setError(e.message);
      setSaving(false);
    }
  };

  if (!canWrite) {
    return (
      <div className="flex h-[calc(100vh-56px)] items-center justify-center" style={{ background: 'var(--bg-base)' }}>
        <div className="text-center">
          <p className="text-lg font-medium mb-2" style={{ color: 'var(--text-primary)' }}>Read-only vault</p>
          <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>You have viewer access to this vault and cannot create notes.</p>
          <Link href="/notes" className="text-sm" style={{ color: 'var(--accent)' }}>← Back to notes</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-56px)]" style={{ background: 'var(--bg-base)' }}>
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
              style={{ color: 'var(--text-primary)', borderColor: 'var(--border)', caretColor: 'var(--accent)' }}
              autoFocus
            />
            {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
          </div>

          {/* Editor */}
          <div
            className="rounded-xl overflow-hidden border"
            style={{ height: '55vh', borderColor: 'var(--border)' }}
          >
            <NoteEditor
              noteId="new"
              initialContent={content}
              onChange={setContent}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 mt-4">
            <Button onClick={handleCreate} loading={saving}>
              {saving ? 'Creating…' : 'Create Note'}
            </Button>
            <Link
              href="/notes"
              className="px-6 py-2 rounded-lg font-medium border text-sm"
              style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
            >
              Cancel
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
