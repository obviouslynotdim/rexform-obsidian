'use client';
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
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

  if (!hasProps) return null;

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

// ─── Outline panel ───────────────────────────────────────────────────────────

interface OutlineItem { level: number; text: string; index: number; id: string }

function OutlineIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
      <line x1="2"  y1="3.5"  x2="14" y2="3.5"  stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <line x1="4.5" y1="6.5"  x2="14" y2="6.5"  stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <line x1="4.5" y1="9.5"  x2="14" y2="9.5"  stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <line x1="2"  y1="12.5" x2="14" y2="12.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

interface OutlineNode extends OutlineItem { children: OutlineNode[] }

// Nest each heading under the nearest preceding heading of a LOWER level. Skipped
// levels still nest sensibly (an H4 after an H2 with no H3 lands under the H2).
function buildOutlineTree(items: OutlineItem[]): OutlineNode[] {
  const roots: OutlineNode[] = [];
  const stack: OutlineNode[] = [];
  for (const it of items) {
    const node: OutlineNode = { ...it, children: [] };
    while (stack.length && stack[stack.length - 1].level >= node.level) stack.pop();
    if (stack.length) stack[stack.length - 1].children.push(node);
    else roots.push(node);
    stack.push(node);
  }
  return roots;
}

function OutlineRow({ node, depth, onJump }: { node: OutlineNode; depth: number; onJump: (o: OutlineItem) => void }) {
  const [open, setOpen] = useState(true);
  const hasKids = node.children.length > 0;
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, paddingLeft: depth === 0 ? 4 : 0 }}>
        {hasKids ? (
          <button
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? 'Collapse' : 'Expand'}
            style={{
              width: 14, height: 14, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
              color: 'var(--text-muted)', transition: 'color .12s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
          >
            <svg
              width="10" height="10" viewBox="0 0 10 10"
              style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .12s' }}
            >
              <polyline points="3,2 7,5 3,8" stroke="currentColor" strokeWidth="1.4"
                fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        ) : (
          <span style={{ width: 14, flexShrink: 0 }} />
        )}
        <button
          onClick={() => onJump(node)}
          title={node.text}
          style={{
            flex: 1, minWidth: 0, textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.5,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', padding: '2px 0',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
        >
          {node.text}
        </button>
      </div>

      {hasKids && open && (
        <div style={{ marginLeft: 10, borderLeft: '1px solid var(--border)', paddingLeft: 6 }}>
          {node.children.map((c) => (
            <OutlineRow key={c.id} node={c} depth={depth + 1} onJump={onJump} />
          ))}
        </div>
      )}
    </div>
  );
}

function OutlinePanel({ outline, onJump }: { outline: OutlineItem[]; onJump: (o: OutlineItem) => void }) {
  const tree = useMemo(() => buildOutlineTree(outline), [outline]);
  if (outline.length === 0) {
    return <p style={{ padding: 12, fontSize: 12.5, color: 'var(--text-muted)' }}>No headings</p>;
  }
  return (
    <div style={{ padding: '4px 4px 12px', overflowY: 'auto' }}>
      {tree.map((n) => (
        <OutlineRow key={n.id} node={n} depth={0} onJump={onJump} />
      ))}
    </div>
  );
}

// ─── Note view ──────────────────────────────────────────────────────────────

export default function NoteViewClient({ noteId, title, content, folder, frontmatter: initialFrontmatter }: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>('reading');
  // Single source of truth: the FULL raw document (frontmatter + body). The
  // Properties panel, the Source/Live editor, and the reading view ALL derive
  // from this one string, so they can never desync. The editor edits it directly
  // (raw `---` block included); the panel edits it by recombining with the body.
  const [doc, setDoc] = useState(() =>
    combineFrontmatter(normalizeFrontmatter(initialFrontmatter), content)
  );
  // Bumped only on panel / rename edits to force the editor to remount and re-read
  // `doc`. MUST NOT bump on editor onChange — that would remount per keystroke
  // (flicker + lost caret).
  const [editorEpoch, setEditorEpoch] = useState(0);
  const isSavingRef = useRef(false);
  const lastEditMode = useRef<'source' | 'live'>('source');
  const router = useRouter();
  const tabsCtx = useTabsContext();

  // Derived frontmatter + body — the only readers of `doc`'s parts. Reading mode
  // and the status-bar counts use `body` (never `doc`, else raw YAML would show).
  const { frontmatter, content: body } = useMemo(() => {
    const p = parseFrontmatter(doc);
    return { frontmatter: normalizeFrontmatter(p.frontmatter), content: p.content };
  }, [doc]);

  // Outline — every ATX heading in the body, in document order. The ordinal
  // `index` matches the `h-<n>` id stamped on reading-mode headings by the
  // collapsible-headings rehype plugin, so a click resolves via getElementById.
  // Fenced code blocks are skipped so `#comment` lines aren't treated as headings.
  const outline = useMemo<OutlineItem[]>(() => {
    const items: OutlineItem[] = [];
    let inFence = false;
    for (const ln of body.split('\n')) {
      if (/^\s*(```|~~~)/.test(ln)) { inFence = !inFence; continue; }
      if (inFence) continue;
      const m = /^\s{0,3}(#{1,6})\s+(.+?)\s*$/.exec(ln);
      if (!m) continue;
      const idx = items.length;
      items.push({
        level: m[1].length,
        text: m[2].replace(/\s*#+\s*$/, '').replace(/[*_`~]/g, '').trim(), // strip closing #, inline marks
        index: idx,
        id: `h-${idx}`,
      });
    }
    return items;
  }, [body]);

  // Outline panel open/collapsed — Obsidian-style, closed by default until the
  // user opens it; their choice is then persisted across reloads.
  const [outlineOpen, setOutlineOpen] = useState(false);
  useEffect(() => {
    const s = localStorage.getItem('notes.outlineOpen');
    if (s != null) setOutlineOpen(s === '1');
  }, []);
  useEffect(() => {
    localStorage.setItem('notes.outlineOpen', outlineOpen ? '1' : '0');
  }, [outlineOpen]);

  // Resizable Outline column — width owned here, dragged from its left edge,
  // clamped and persisted. The panel sits flush to the pane's right edge, so its
  // width is (viewport right edge − cursor x).
  const [outlineWidth, setOutlineWidth] = useState(240);
  const resizingOutlineRef = useRef(false);
  useEffect(() => {
    const s = localStorage.getItem('notes.outlineWidth');
    if (s) {
      const n = parseInt(s, 10);
      if (!Number.isNaN(n)) setOutlineWidth(Math.min(480, Math.max(180, n)));
    }
  }, []);
  useEffect(() => {
    localStorage.setItem('notes.outlineWidth', String(outlineWidth));
  }, [outlineWidth]);
  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!resizingOutlineRef.current) return;
      setOutlineWidth(Math.min(480, Math.max(180, window.innerWidth - e.clientX)));
    }
    function onUp() {
      if (!resizingOutlineRef.current) return;
      resizingOutlineRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  // Smooth-scroll the reading view to a heading. Primary lookup is the ordinal
  // id; the DOM-order fallback keeps the click working even if an id ever fails
  // to line up. (Only resolves in reading mode, where the headings are rendered.)
  const handleOutlineJump = useCallback((o: OutlineItem) => {
    const headings = document.querySelectorAll<HTMLElement>(
      '.prose h1, .prose h2, .prose h3, .prose h4, .prose h5, .prose h6'
    );
    const el = document.getElementById(o.id) ?? headings[o.index];
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const docSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: fileSettings } = useSWR<FileSettings>('/api/user/settings', fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  });

  // Debounced persistence of the WHOLE document. Used by the panel; the editor
  // has its own autosave. PUTting the full doc is the round-trip that stops a
  // panel edit from dropping the body and a body edit from wiping the YAML.
  const persistDoc = useCallback((fullDoc: string) => {
    if (docSaveTimer.current) clearTimeout(docSaveTimer.current);
    docSaveTimer.current = setTimeout(() => {
      fetch(`/api/notes/${encodeURIComponent(noteId)}/update`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: fullDoc }),
      }).catch(() => {});
    }, 600);
  }, [noteId]);

  const handleFrontmatterChange = useCallback((next: Frontmatter) => {
    const nextDoc = combineFrontmatter(next, body);
    setDoc(nextDoc);
    setEditorEpoch((e) => e + 1);
    persistDoc(nextDoc);
  }, [body, persistDoc]);

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
      const synced = syncHeadingWithTitle(body, name);
      if (synced !== body) {
        const syncedDoc = combineFrontmatter(frontmatter, synced);
        setDoc(syncedDoc);
        setEditorEpoch((e) => e + 1);
        try {
          await fetch(`/api/notes/${encodeURIComponent(data.id)}/update`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: syncedDoc }),
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

  const wordCount = body.trim() ? body.trim().split(/\s+/).filter(Boolean).length : 0;
  const charCount = body.length;

  function handleModeChange(mode: ViewMode) {
    // Viewers can't edit, so Source / Live Preview are unavailable to them.
    if (mode !== 'reading' && !canWrite) return;
    setViewMode(mode);
  }
  const activeMode = viewMode;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* Note area + right-hand Outline column. The split is a non-scrolling
          layer so the Outline toggle can pin to the pane's top-right. */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0, position: 'relative' }}>

      {/* Scrollable note body — NoteViewClient owns its own scroll now. */}
      <div style={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>
        <div style={{ width: '100%', maxWidth: 860, margin: '0 auto', padding: '40px 32px' }}>
          {/* Dim, non-editable breadcrumb: folder path + filename. Purely
              contextual — renaming still happens via the sidebar only. The
              body's `# H1` below is ordinary markdown content, not connected
              to the filename (no sync). */}
          <div
            style={{
              fontSize: 13,
              color: 'rgba(255,255,255,0.5)',
              marginBottom: 16,
              userSelect: 'none',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {[...folder.split('/').filter(Boolean), title].join(' / ')}
          </div>

          {/* Properties panel — hidden in Source mode, where the raw `---`
              block in the editor is already the frontmatter UI. */}
          {viewMode !== 'source' && (
            <PropertiesPanel
              frontmatter={frontmatter}
              canWrite={canWrite}
              onChange={handleFrontmatterChange}
            />
          )}

          {/* Body */}
          {viewMode === 'reading' ? (
            <div
              style={{ cursor: canWrite ? 'text' : 'default', minHeight: '40vh', fontSize: '15px', lineHeight: 1.7, color: 'rgba(255,255,255,0.85)' }}
              onClick={(e) => {
                const t = e.target as HTMLElement;
                // A link navigates and a heading's collapse summary/chevron folds
                // its section — neither should fall through to opening Source mode.
                if (t.closest('a') || t.closest('summary')) return;
                if (canWrite) setViewMode('source');
              }}
            >
              {body ? (
                <div className="prose prose-invert">
                  <WikiMarkdown>{body}</WikiMarkdown>
                </div>
              ) : (
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  {canWrite ? 'Click to start writing…' : 'No content.'}
                </p>
              )}
            </div>
          ) : (
            <div style={{ height: '60vh' }}>
              {/* The editor owns the FULL raw document (frontmatter + body). Its
                  onChange feeds `doc` directly — no split — so the raw `---` block
                  is editable in Source and `doc` stays the single source of truth.
                  `key` remounts it only when the panel/rename mutates `doc`
                  out-of-band (editorEpoch), never on a keystroke. */}
              <NoteEditor
                key={editorEpoch}
                noteId={noteId}
                viewMode={viewMode}
                initialContent={doc}
                currentTitle={title}
                onChange={setDoc}
                onSave={setDoc}
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

        {/* Outline toggle — pinned to the pane's top-right (Obsidian-style).
            Lives in the non-scrolling split layer so it stays put while the
            note scrolls; floats over the Outline header when the panel is open. */}
        <button
          onClick={() => setOutlineOpen((v) => !v)}
          title="Outline"
          style={{
            position: 'absolute', top: 8, right: 10, zIndex: 3,
            width: 30, height: 30, borderRadius: 6, border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: outlineOpen ? 'rgba(255,255,255,0.10)' : 'var(--bg-base)',
            color: outlineOpen ? '#fff' : 'var(--text-muted)',
            transition: 'background 0.12s, color 0.12s',
          }}
          onMouseEnter={(e) => { if (!outlineOpen) e.currentTarget.style.color = 'var(--text-secondary)'; }}
          onMouseLeave={(e) => { if (!outlineOpen) e.currentTarget.style.color = 'var(--text-muted)'; }}
        >
          <OutlineIcon />
        </button>

        {/* Drag handle to resize the Outline column (grabbed from its left edge) */}
        {outlineOpen && (
          <div
            onMouseDown={() => {
              resizingOutlineRef.current = true;
              document.body.style.cursor = 'col-resize';
              document.body.style.userSelect = 'none';
            }}
            title="Drag to resize"
            style={{ width: 5, flexShrink: 0, cursor: 'col-resize', background: 'transparent' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(127,119,221,0.3)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          />
        )}

        {/* Outline column */}
        {outlineOpen && (
          <aside
            style={{
              width: outlineWidth, flexShrink: 0, borderLeft: '1px solid var(--border)',
              background: 'var(--bg-surface)', display: 'flex', flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '10px 46px 10px 12px', // right pad clears the floating toggle
                fontSize: 12, fontWeight: 600, letterSpacing: '0.04em',
                textTransform: 'uppercase', color: 'var(--text-secondary)', flexShrink: 0,
              }}
            >
              Outline
            </div>
            <OutlinePanel outline={outline} onJump={handleOutlineJump} />
          </aside>
        )}
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
