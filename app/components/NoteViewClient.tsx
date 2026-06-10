'use client';
import { useState, useRef, useEffect } from 'react';
import useSWR, { mutate } from 'swr';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import NoteEditor from './NoteEditor';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';

const fetcher = (url: string) => fetch(url).then((r) => r.json());
interface VaultOption { name: string; label: string; role?: string }
interface VaultsData { vaults: VaultOption[]; activeVault: string }

interface Props {
  noteId: string;
  title: string;
  content: string;
  folder: string;
  tags: string[];
  mtime?: number;
  size?: number;
}

export default function NoteViewClient({ noteId, title, content, folder, tags, mtime, size }: Props) {
  const [editing, setEditing] = useState(false);
  const [liveContent, setLiveContent] = useState(content);
  const [renamingTitle, setRenamingTitle] = useState(false);
  const [renameValue, setRenameValue] = useState(title);
  const [renameError, setRenameError] = useState('');
  const [renaming, setRenaming] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (renamingTitle) renameInputRef.current?.select();
  }, [renamingTitle]);

  async function handleRename() {
    const newName = renameValue.trim();
    if (!newName || newName === title) { setRenamingTitle(false); return; }
    setRenaming(true);
    setRenameError('');
    const res = await fetch(`/api/notes/${encodeURIComponent(noteId)}/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName }),
    });
    const data = await res.json();
    setRenaming(false);
    if (res.ok) {
      setRenamingTitle(false);
      await mutate('/api/notes/tree');
      router.push(`/notes/${encodeURIComponent(data.id)}`);
      router.refresh();
    } else {
      setRenameError(data.error || 'Rename failed');
    }
  }

  const { data: vaultsData } = useSWR<VaultsData>('/api/vaults', fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  });
  const activeRole = vaultsData?.vaults.find((v) => v.name === vaultsData.activeVault)?.role;
  const canWrite = activeRole !== 'viewer';

  return (
    <div className="max-w-4xl mx-auto px-8 py-10">
      {/* Header */}
      <div
        className="mb-8 pb-6 border-b flex items-start justify-between gap-4"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="min-w-0">
          <Link
            href="/notes"
            className="text-xs mb-3 inline-block hover:underline"
            style={{ color: 'var(--accent)' }}
          >
            ← All Notes
          </Link>
          {folder && (
            <p className="text-xs mb-2" style={{ color: 'var(--accent)' }}>
              📁 {folder}
            </p>
          )}
          {renamingTitle && canWrite ? (
            <div>
              <input
                ref={renameInputRef}
                value={renameValue}
                onChange={(e) => { setRenameValue(e.target.value); setRenameError(''); }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRename();
                  if (e.key === 'Escape') { setRenamingTitle(false); setRenameValue(title); }
                }}
                disabled={renaming}
                className="text-3xl font-bold bg-transparent outline-none border-b w-full pb-1"
                style={{ color: 'var(--text-primary)', borderColor: 'var(--accent)', caretColor: 'var(--accent)' }}
              />
              {renameError && <p className="text-xs mt-1" style={{ color: '#e55' }}>{renameError}</p>}
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Enter to save · Esc to cancel</p>
            </div>
          ) : (
            <h1
              className="text-3xl font-bold capitalize"
              style={{ color: 'var(--text-primary)', cursor: canWrite ? 'text' : 'default' }}
              onClick={() => { if (canWrite) { setRenameValue(title); setRenamingTitle(true); } }}
              title={canWrite ? 'Click to rename' : undefined}
            >
              {title}
            </h1>
          )}
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-0.5 rounded text-xs font-medium"
                  style={{ background: 'var(--border)', color: 'var(--accent)' }}
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}
          <div className="flex gap-4 mt-3 text-xs" style={{ color: 'var(--text-muted)' }}>
            {mtime ? (
              <span>
                Modified{' '}
                {new Date(mtime).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                })}
              </span>
            ) : null}
            {size ? <span>{(size / 1024).toFixed(1)} KB</span> : null}
          </div>
        </div>

        {canWrite ? (
          <Button
            variant={editing ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setEditing((e) => !e)}
            className="flex-shrink-0"
          >
            {editing ? 'View' : 'Edit'}
          </Button>
        ) : (
          <span
            className="px-2.5 py-1 rounded text-xs font-medium flex-shrink-0"
            style={{ background: '#64748b22', color: '#94a3b8' }}
          >
            Read-only
          </span>
        )}
      </div>

      {/* Body */}
      {editing ? (
        <div style={{ height: '60vh' }}>
          <NoteEditor
            noteId={noteId}
            initialContent={liveContent}
            onSave={setLiveContent}
          />
        </div>
      ) : liveContent ? (
        <div className="prose">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{liveContent}</ReactMarkdown>
        </div>
      ) : (
        <Card className="p-6 text-center">
          <p style={{ color: 'var(--text-secondary)' }}>No content found for this note.</p>
        </Card>
      )}
    </div>
  );
}
