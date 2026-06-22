'use client';
import { useState, useRef, useEffect } from 'react';
import useSWR, { mutate } from 'swr';
import { useRouter } from 'next/navigation';
import NoteEditor, { type ViewMode } from './NoteEditor';
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

const MODE_LABELS: Record<ViewMode, string> = {
  reading: 'Reading',
  source: 'Source mode',
  live: 'Live Preview',
};

export default function NoteViewClient({ noteId, title, content, folder: _folder, tags }: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>('reading');
  const [liveContent, setLiveContent] = useState(content);
  const [renamingTitle, setRenamingTitle] = useState(false);
  const [renameValue, setRenameValue] = useState(title);
  const [renameError, setRenameError] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [titleHovered, setTitleHovered] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const cancelRenameRef = useRef(false);
  const isSavingRef = useRef(false);
  const lastEditMode = useRef<'source' | 'live'>('source');
  const router = useRouter();

  useEffect(() => {
    if (renamingTitle) renameInputRef.current?.select();
  }, [renamingTitle]);

  // Escape exits any editing mode back to Reading.
  useEffect(() => {
    if (viewMode === 'reading') return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setViewMode('reading');
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [viewMode]);

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
      const newUrlId = String(data.id).replace(/\.md$/i, '');
      router.push(`/notes/${encodeURIComponent(newUrlId)}`);
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

  // Ctrl/Cmd+E toggles Reading <-> last edit mode (Obsidian behavior).
  // Separate from the Escape effect above so it stays mounted in every mode.
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
        e.preventDefault();
        if (!canWrite) return;
        if (viewMode === 'reading') {
          setViewMode(lastEditMode.current);
        } else {
          lastEditMode.current = viewMode;
          setViewMode('reading');
        }
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [viewMode, canWrite]);

  // Backlink count for the status bar — BacklinksPanel in the right sidebar
  // uses the same SWR key so only one request is made (SWR deduplication).
  const { data: blData } = useSWR<{ backlinks: { id: string }[] }>(
    `/api/notes/${encodeURIComponent(noteId)}/backlinks`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 30_000 }
  );
  const backlinkCount = blData?.backlinks?.length ?? 0;

  const wordCount = liveContent.trim() ? liveContent.trim().split(/\s+/).filter(Boolean).length : 0;
  const charCount = liveContent.length;

  function handleModeChange(mode: ViewMode) {
    // Viewers can't edit, so Source / Live Preview are unavailable to them.
    if (mode !== 'reading' && !canWrite) return;
    setViewMode(mode);
  }
  const activeMode = viewMode;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* Scrollable note body — NoteViewClient owns its own scroll now. */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ maxWidth: '700px', margin: '0 auto', paddingTop: 40, paddingBottom: 40, paddingLeft: 32, paddingRight: 32 }}>
          {/* Title area */}
          <div>
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
                  className="font-bold bg-transparent outline-none border-none w-full"
                  style={{ fontSize: '2rem', color: '#fff', caretColor: 'var(--accent)' }}
                />
                {renameError && <p className="text-xs mt-1" style={{ color: '#e55' }}>{renameError}</p>}
              </div>
            ) : (
              <h1
                style={{
                  fontSize: '2rem',
                  fontWeight: 700,
                  color: '#fff',
                  cursor: canWrite ? 'text' : 'default',
                  textDecorationLine: (canWrite && titleHovered) ? 'underline' : 'none',
                  textDecorationStyle: 'dotted',
                  textDecorationColor: 'rgba(255,255,255,0.35)',
                  textUnderlineOffset: '4px',
                  marginBottom: '8px',
                }}
                onMouseEnter={() => canWrite && setTitleHovered(true)}
                onMouseLeave={() => setTitleHovered(false)}
                onClick={() => { if (canWrite) { setRenameValue(title); setRenamingTitle(true); } }}
              >
                {title}
              </h1>
            )}
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2 mb-2">
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
          </div>

          {/* Body */}
          {viewMode === 'reading' ? (
            <div
              style={{ cursor: canWrite ? 'text' : 'default', minHeight: '40vh', fontSize: '15px', lineHeight: 1.7, color: 'rgba(255,255,255,0.85)' }}
              onClick={(e) => { if ((e.target as HTMLElement).closest('a')) return; if (canWrite) setViewMode('source'); }}
            >
              {liveContent ? (
                <div className="prose prose-invert">
                  <WikiMarkdown>{liveContent}</WikiMarkdown>
                </div>
              ) : (
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  {canWrite ? 'Click to start writing…' : 'No content.'}
                </p>
              )}
            </div>
          ) : (
            <div style={{ height: '60vh' }}>
              <NoteEditor
                noteId={noteId}
                viewMode={viewMode}
                initialContent={liveContent}
                onChange={setLiveContent}
                onSave={setLiveContent}
              />
            </div>
          )}
        </div>
      </div>

      {/* Status bar — pinned to the bottom of the note pane, does not scroll. */}
      <div style={{
        flexShrink: 0,
        height: 26,
        borderTop: '1px solid rgba(255,255,255,0.06)',
        background: '#1a1a2e',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingLeft: 16,
        paddingRight: 16,
        fontSize: 11.5,
        color: 'var(--text-muted)',
        userSelect: 'none',
      }}>
        {/* Left: stats */}
        <span>
          {backlinkCount} {backlinkCount === 1 ? 'backlink' : 'backlinks'}
          {' · '}{wordCount} words{' · '}{charCount} characters
        </span>

        {/* Right: mode toggles */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {(['reading', 'source', 'live'] as const).map((mode) => {
            const disabled = mode !== 'reading' && !canWrite;
            return (
              <button
                key={mode}
                onClick={() => handleModeChange(mode)}
                disabled={disabled}
                title={MODE_LABELS[mode]}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: '2px 8px',
                  borderRadius: 4,
                  border: 'none',
                  background: activeMode === mode ? 'rgba(127,119,221,0.15)' : 'transparent',
                  color: activeMode === mode ? '#7F77DD' : 'var(--text-muted)',
                  cursor: disabled ? 'default' : 'pointer',
                  opacity: disabled ? 0.4 : 1,
                  fontSize: 11.5,
                }}
              >
                {activeMode === mode && (
                  <svg width="10" height="10" viewBox="0 0 10 10">
                    <polyline points="1.5,5.5 4,8 8.5,2"
                      stroke="currentColor" strokeWidth="1.5"
                      fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
                {MODE_LABELS[mode]}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
