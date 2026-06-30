'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import useSWR, { mutate } from 'swr';
import { useRouter } from 'next/navigation';
import NoteEditor, { type ViewMode } from './NoteEditor';
import WikiMarkdown from './WikiMarkdown';
import { useTabsContext } from '@/context/TabsContext';
import { combineFrontmatter, parseFrontmatter, type Frontmatter } from '@/lib/frontmatter';

const fetcher = (url: string) => fetch(url).then((r) => r.json());
interface VaultOption { name: string; label: string; role?: string }
interface VaultsData { vaults: VaultOption[]; activeVault: string }
interface FileSettings { syncHeadingWithFilename: boolean; newNoteLocation: 'root' | 'current' }

const TAGS_KEY = 'tags';

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

// Old notes stored tags as a comma string ("saas, rexform"); the panel works in
// arrays, so coerce on load. Everything else passes through untouched.
function normalizeFrontmatter(fm: Frontmatter): Frontmatter {
  const out: Frontmatter = { ...fm };
  if (typeof out[TAGS_KEY] === 'string') {
    out[TAGS_KEY] = (out[TAGS_KEY] as string)
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
  }
  return out;
}

interface Props {
  noteId: string;
  title: string;
  content: string;
  folder: string;
  tags: string[];
  frontmatter: Frontmatter;
  mtime?: number;
  size?: number;
}

const MODE_LABELS: Record<ViewMode, string> = {
  reading: 'Reading',
  source: 'Source mode',
  live: 'Live Preview',
};

// ─── Properties panel ───────────────────────────────────────────────────────

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="12" height="12" viewBox="0 0 12 12" fill="none"
      style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}
    >
      <polyline points="4,2.5 8,6 4,9.5" stroke="currentColor" strokeWidth="1.4"
        fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function RemoveX({ onClick, title }: { onClick: () => void; title?: string }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      title={title}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        border: 'none', background: 'transparent', cursor: 'pointer',
        color: hov ? '#f87171' : 'var(--text-muted)',
        padding: 0, lineHeight: 1, fontSize: 13, display: 'flex', alignItems: 'center',
      }}
    >
      ×
    </button>
  );
}

function PropertiesPanel({
  frontmatter,
  canWrite,
  onChange,
}: {
  frontmatter: Frontmatter;
  canWrite: boolean;
  onChange: (next: Frontmatter) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draftKey, setDraftKey] = useState('');
  const [draftValue, setDraftValue] = useState('');

  const entries = Object.entries(frontmatter);
  const hasProps = entries.length > 0;

  // ── mutations (each produces a new object and saves via onChange) ──
  const setScalar = (key: string, value: string) => onChange({ ...frontmatter, [key]: value });

  const removeKey = (key: string) => {
    const next = { ...frontmatter };
    delete next[key];
    onChange(next);
  };

  const addArrayItem = (key: string, item: string) => {
    const trimmed = item.trim();
    if (!trimmed) return;
    const arr = Array.isArray(frontmatter[key]) ? (frontmatter[key] as string[]) : [];
    if (arr.includes(trimmed)) return;
    onChange({ ...frontmatter, [key]: [...arr, trimmed] });
  };

  const removeArrayItem = (key: string, item: string) => {
    const arr = Array.isArray(frontmatter[key]) ? (frontmatter[key] as string[]) : [];
    onChange({ ...frontmatter, [key]: arr.filter((i) => i !== item) });
  };

  const commitDraft = () => {
    const key = draftKey.trim();
    if (!key) { setAdding(false); setDraftKey(''); setDraftValue(''); return; }
    // 'tags' (or any value typed with commas) becomes an array; else a scalar.
    const isList = key === TAGS_KEY || draftValue.includes(',');
    const value: string | string[] = isList
      ? draftValue.split(',').map((s) => s.trim()).filter(Boolean)
      : draftValue.trim();
    onChange({ ...frontmatter, [key]: value });
    setAdding(false);
    setDraftKey('');
    setDraftValue('');
  };

  if (!canWrite && !hasProps) return null;

  const labelStyle: React.CSSProperties = {
    width: 120, flexShrink: 0, fontSize: 12.5, color: 'var(--text-muted)',
    textTransform: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  };
  const inputStyle: React.CSSProperties = {
    flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none',
    color: 'var(--text-primary)', fontSize: 13.5, padding: '2px 0',
  };

  return (
    <div
      style={{
        border: '1px solid var(--border)', borderRadius: 8,
        background: 'rgba(255,255,255,0.02)', marginBottom: 20,
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 6,
          padding: '8px 12px', border: 'none', background: 'transparent',
          cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 12,
          fontWeight: 600, letterSpacing: '0.03em', textTransform: 'uppercase',
        }}
      >
        <ChevronIcon open={!collapsed} />
        Properties
        {!collapsed && hasProps && (
          <span style={{ marginLeft: 6, fontWeight: 400, textTransform: 'none', color: 'var(--text-muted)' }}>
            {entries.length}
          </span>
        )}
      </button>

      {!collapsed && (
        <div style={{ padding: '0 12px 10px' }}>
          {!hasProps && (
            <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '4px 0 8px' }}>
              No properties yet.
            </p>
          )}

          {entries.map(([key, value]) => (
            <div
              key={key}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 10,
                padding: '6px 0', borderTop: '1px solid var(--border)',
              }}
            >
              <span style={labelStyle} title={key}>{key}</span>

              {Array.isArray(value) ? (
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                  {value.map((item) => (
                    <span
                      key={item}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        background: 'var(--border)', color: 'var(--accent)',
                        borderRadius: 5, padding: '2px 8px', fontSize: 12, fontWeight: 500,
                      }}
                    >
                      {key === TAGS_KEY ? `#${item}` : item}
                      {canWrite && <RemoveX onClick={() => removeArrayItem(key, item)} title="Remove" />}
                    </span>
                  ))}
                  {canWrite && (
                    <AddItemInput
                      placeholder={key === TAGS_KEY ? '+ tag' : '+ item'}
                      onAdd={(v) => addArrayItem(key, v)}
                    />
                  )}
                </div>
              ) : canWrite ? (
                <input
                  value={value}
                  onChange={(e) => setScalar(key, e.target.value)}
                  style={inputStyle}
                  placeholder="empty"
                />
              ) : (
                <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, color: 'var(--text-primary)' }}>{value}</span>
              )}

              {canWrite && <RemoveX onClick={() => removeKey(key)} title="Remove property" />}
            </div>
          ))}

          {/* Add property */}
          {canWrite && (
            adding ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0 2px', borderTop: '1px solid var(--border)' }}>
                <input
                  autoFocus
                  value={draftKey}
                  onChange={(e) => setDraftKey(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') commitDraft(); if (e.key === 'Escape') setAdding(false); }}
                  placeholder="property name"
                  style={{ ...inputStyle, width: 120, flex: 'none', borderBottom: '1px solid var(--border)' }}
                />
                <input
                  value={draftValue}
                  onChange={(e) => setDraftValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') commitDraft(); if (e.key === 'Escape') setAdding(false); }}
                  onBlur={commitDraft}
                  placeholder="value (comma-separated for a list)"
                  style={{ ...inputStyle, borderBottom: '1px solid var(--border)' }}
                />
              </div>
            ) : (
              <button
                onClick={() => setAdding(true)}
                style={{
                  marginTop: hasProps ? 8 : 0,
                  border: 'none', background: 'transparent', cursor: 'pointer',
                  color: 'var(--text-muted)', fontSize: 12.5, padding: '4px 0',
                  display: 'flex', alignItems: 'center', gap: 4,
                }}
              >
                + Add property
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}

// Small controlled input that adds a value on Enter and clears itself.
function AddItemInput({ placeholder, onAdd }: { placeholder: string; onAdd: (value: string) => void }) {
  const [val, setVal] = useState('');
  return (
    <input
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); onAdd(val); setVal(''); }
      }}
      onBlur={() => { if (val.trim()) { onAdd(val); setVal(''); } }}
      placeholder={placeholder}
      style={{
        background: 'transparent', border: 'none', outline: 'none',
        color: 'var(--text-muted)', fontSize: 12, width: 72, padding: '2px 0',
      }}
    />
  );
}

// ─── Note view ──────────────────────────────────────────────────────────────

export default function NoteViewClient({ noteId, title, content, folder: _folder, frontmatter: initialFrontmatter }: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>('reading');
  const [liveContent, setLiveContent] = useState(content);
  const [frontmatter, setFrontmatter] = useState<Frontmatter>(() => normalizeFrontmatter(initialFrontmatter));
  const isSavingRef = useRef(false);
  const lastEditMode = useRef<'source' | 'live'>('source');
  const router = useRouter();
  const tabsCtx = useTabsContext();

  // Live body content (frontmatter-stripped), read by the debounced properties
  // saver without needing to rebuild the saver on every keystroke.
  const liveContentRef = useRef(content);
  useEffect(() => { liveContentRef.current = liveContent; }, [liveContent]);

  const fmSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: fileSettings } = useSWR<FileSettings>('/api/user/settings', fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  });

  // Persist frontmatter by re-combining it with the current body and saving the
  // whole document — this is the round-trip that stops edits from wiping YAML.
  const persistFrontmatter = useCallback((fm: Frontmatter) => {
    if (fmSaveTimer.current) clearTimeout(fmSaveTimer.current);
    fmSaveTimer.current = setTimeout(() => {
      const body = combineFrontmatter(fm, liveContentRef.current);
      fetch(`/api/notes/${encodeURIComponent(noteId)}/update`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: body }),
      }).catch(() => {});
    }, 600);
  }, [noteId]);

  const handleFrontmatterChange = useCallback((next: Frontmatter) => {
    setFrontmatter(next);
    persistFrontmatter(next);
  }, [persistFrontmatter]);

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
    // there's no _rev conflict with the just-deleted old doc. Frontmatter is
    // re-attached so the rename doesn't drop it.
    if (fileSettings?.syncHeadingWithFilename) {
      const synced = syncHeadingWithTitle(liveContent, name);
      if (synced !== liveContent) {
        setLiveContent(synced);
        try {
          await fetch(`/api/notes/${encodeURIComponent(data.id)}/update`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: combineFrontmatter(frontmatter, synced) }),
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
        <div style={{ width: '100%', maxWidth: 860, margin: '0 auto', padding: '40px 32px' }}>
          {/* No title bar — Obsidian-style: the body's first `# H1` is the title.
              Frontmatter properties render above it in an editable panel. */}
          <PropertiesPanel
            frontmatter={frontmatter}
            canWrite={canWrite}
            onChange={handleFrontmatterChange}
          />

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
              {/* Pass the full document (frontmatter + body combined) so Source/Live
                  mode shows the raw --- block. The onChange handler re-parses it so
                  liveContent stays body-only for reading mode and the status bar. */}
              <NoteEditor
                noteId={noteId}
                viewMode={viewMode}
                initialContent={combineFrontmatter(frontmatter, liveContent)}
                currentTitle={title}
                onChange={(fullText) => {
                  const { content: body, frontmatter: fm } = parseFrontmatter(fullText);
                  setLiveContent(body);
                  setFrontmatter(fm);
                }}
                onSave={(fullText) => {
                  const { content: body, frontmatter: fm } = parseFrontmatter(fullText);
                  setLiveContent(body);
                  setFrontmatter(fm);
                }}
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
