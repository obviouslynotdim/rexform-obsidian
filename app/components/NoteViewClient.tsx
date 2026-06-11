'use client';
import { useState, useRef, useEffect } from 'react';
import useSWR, { mutate } from 'swr';
import { useRouter } from 'next/navigation';
import NoteEditor from './NoteEditor';
import WikiMarkdown from './WikiMarkdown';

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
  const [titleHovered, setTitleHovered] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const cancelRenameRef = useRef(false);
  const isSavingRef = useRef(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (renamingTitle) renameInputRef.current?.select();
  }, [renamingTitle]);

  useEffect(() => {
    if (!editing) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setEditing(false);
    }
    function handleMouse(e: MouseEvent) {
      if (editorRef.current && !editorRef.current.contains(e.target as Node)) {
        setEditing(false);
      }
    }
    document.addEventListener('keydown', handleKey);
    document.addEventListener('mousedown', handleMouse);
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.removeEventListener('mousedown', handleMouse);
    };
  }, [editing]);

  async function handleRename() {
    if (isSavingRef.current) return;
    isSavingRef.current = true;
    const newName = renameValue.trim();
    if (!newName || newName === title) { setRenamingTitle(false); isSavingRef.current = false; return; }
    setRenaming(true);
    setRenameError('');
    const res = await fetch(`/api/notes/${encodeURIComponent(noteId)}/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName }),
    });
    const data = await res.json();
    setRenaming(false);
    isSavingRef.current = false;
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
                  if (e.key === 'Escape') { cancelRenameRef.current = true; setRenamingTitle(false); setRenameValue(title); }
                }}
                onBlur={() => { if (!cancelRenameRef.current) handleRename(); cancelRenameRef.current = false; }}
                disabled={renaming}
                className="text-3xl font-bold capitalize bg-transparent outline-none border-none w-full"
                style={{ color: 'var(--text-primary)', caretColor: 'var(--accent)' }}
              />
              {renameError && <p className="text-xs mt-1" style={{ color: '#e55' }}>{renameError}</p>}
            </div>
          ) : (
            <h1
              className="text-3xl font-bold capitalize"
              style={{
                color: 'var(--text-primary)',
                cursor: canWrite ? 'text' : 'default',
                textDecorationLine: (canWrite && titleHovered) ? 'underline' : 'none',
                textDecorationStyle: 'dotted',
                textDecorationColor: 'var(--text-muted)',
                textUnderlineOffset: '4px',
              }}
              onMouseEnter={() => canWrite && setTitleHovered(true)}
              onMouseLeave={() => setTitleHovered(false)}
              onClick={() => { if (canWrite) { setRenameValue(title); setRenamingTitle(true); } }}
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

      </div>

      {/* Body */}
      {editing ? (
        <div ref={editorRef} style={{ height: '60vh' }}>
          <NoteEditor
            noteId={noteId}
            initialContent={liveContent}
            onSave={setLiveContent}
          />
        </div>
      ) : (
        <div
          style={{ cursor: canWrite ? 'text' : 'default', minHeight: '40vh' }}
          onClick={() => { if (canWrite) setEditing(true); }}
        >
          {liveContent ? (
            <div className="prose">
              <WikiMarkdown>{liveContent}</WikiMarkdown>
            </div>
          ) : (
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {canWrite ? 'Click to start writing…' : 'No content.'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
