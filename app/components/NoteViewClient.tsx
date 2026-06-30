'use client';
import { useState, useRef, useEffect } from 'react';
import useSWR, { mutate } from 'swr';
import { useRouter } from 'next/navigation';
import NoteEditor, { type ViewMode } from './NoteEditor';
import WikiMarkdown from './WikiMarkdown';
import { useTabsContext } from '@/context/TabsContext';

const fetcher = (url: string) => fetch(url).then((r) => r.json());
interface VaultOption { name: string; label: string; role?: string }
interface VaultsData { vaults: VaultOption[]; activeVault: string }
interface FileSettings { syncHeadingWithFilename: boolean; newNoteLocation: 'root' | 'current' }

// Matches the first `# Heading` line anywhere in the document (first occurrence
// only — no /g). [ \t] (not \s) keeps the match on a single line.
const H1_LINE = /^#[ \t]+(.+)$/m;

// Keep the body's first H1 in sync with the note title. If an H1 exists it is
// replaced in place; otherwise one is inserted as the first line. With the
// title bar removed, the body's H1 *is* the visible title, so inserting one on
// rename is the intended Obsidian behavior.
function syncHeadingWithTitle(content: string, newTitle: string): string {
  if (H1_LINE.test(content)) {
    return content.replace(H1_LINE, () => `# ${newTitle}`);
  }
  return `# ${newTitle}\n\n${content}`;
}

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
  const isSavingRef = useRef(false);
  const lastEditMode = useRef<'source' | 'live'>('source');
  const router = useRouter();
  const tabsCtx = useTabsContext();

  const { data: fileSettings } = useSWR<FileSettings>('/api/user/settings', fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  });

  // Escape exits any editing mode back to Reading.
  useEffect(() => {
    if (viewMode === 'reading') return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setViewMode('reading');
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [viewMode]);

  // Programmatic rename entry point. The click-to-rename title bar was removed in
  // favour of Obsidian-style "the body's # H1 is the title"; renaming from the
  // note view now happens via NoteEditor's Direction B (H1 edit → filename), and
  // the sidebar still renames independently. This is kept as the underlying
  // move-API call plus Direction A (title → H1) sync for any caller wired in
  // later. Takes the new name as an argument now that there's no input state.
  async function handleRename(newName: string) {
    if (isSavingRef.current) return;
    const name = newName.trim();
    if (!name || name === title) return;
    isSavingRef.current = true;
    const res = await fetch(`/api/notes/${encodeURIComponent(noteId)}/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    isSavingRef.current = false;
    if (!res.ok) return;
    await mutate('/api/notes/tree');
    // Reconcile the open tab with the new id/title before navigating so the
    // tab never points at the now-deleted old note id.
    tabsCtx?.updateTab(noteId, data.id, name);
    // Direction A — keep the body's first H1 in sync with the new filename
    // (Obsidian behavior). Targets data.id (the freshly-created note), so
    // there's no _rev conflict with the just-deleted old doc.
    if (fileSettings?.syncHeadingWithFilename) {
      const synced = syncHeadingWithTitle(liveContent, name);
      if (synced !== liveContent) {
        setLiveContent(synced);
        try {
          await fetch(`/api/notes/${encodeURIComponent(data.id)}/update`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: synced }),
          });
        } catch { /* best-effort; rename already succeeded */ }
      }
    }
    const newUrlId = String(data.id).replace(/\.md$/i, '');
    router.push(`/notes/${encodeURIComponent(newUrlId)}`);
    router.refresh();
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
          {/* No title bar — Obsidian-style: the body's first `# H1` is the title.
              Tags still render at the top of the content area. */}
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
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
                currentTitle={title}
                onChange={setLiveContent}
                onSave={setLiveContent}
                onTitleChange={(newTitle, newId) => {
                  // Direction B — the editor renamed the file from its H1.
                  // Reconcile tab + URL + sidebar with the new id/title.
                  tabsCtx?.updateTab(noteId, newId, newTitle);
                  mutate('/api/notes/tree');
                  const newUrlId = String(newId).replace(/\.md$/i, '');
                  router.push(`/notes/${encodeURIComponent(newUrlId)}`);
                }}
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
