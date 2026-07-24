'use client';
import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import useSWR from 'swr';
import { mutate } from 'swr';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { EditorView, keymap } from '@codemirror/view';
import type { EditorView as EditorViewType } from '@codemirror/view';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { history, historyKeymap, defaultKeymap, indentWithTab } from '@codemirror/commands';
import {
  autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap, acceptCompletion,
} from '@codemirror/autocomplete';
import { useTabsContext } from '@/context/TabsContext';
import ConfirmModal from './ConfirmModal';
import { rexformDarkTheme, rexformSyntaxHighlighting } from '@/lib/cm/theme';
import { wikilinkCompletions, resolveWikilink, noteDisplayName, type NoteStub } from '@/lib/cm/wikilinkComplete';
import { livePreview, setLivePreview, wikilinkConfig } from '@/lib/cm/livePreview';

// CM touches the DOM at instantiation — load client-only to keep it out of SSR.
const CodeMirrorEditor = dynamic(() => import('./CodeMirrorEditor'), {
  ssr: false,
  loading: () => <div style={{ height: '100%', background: 'var(--bg-base)' }} />,
});

export type ViewMode = 'reading' | 'source' | 'live';

interface FileSettings { syncHeadingWithFilename: boolean; newNoteLocation: 'root' | 'current' }

interface NoteEditorProps {
  noteId: string;
  initialContent: string;
  viewMode: ViewMode;
  currentTitle?: string;
  onChange?: (content: string) => void;
  onSave?: (content: string) => void;
  // Called after the editor renames the note from its H1 (Direction B).
  onTitleChange?: (newTitle: string, newId: string) => void;
}

// Matches the first `# Heading` line; [ \t] (not \s) keeps the match single-line.
const H1_LINE = /^#[ \t]+(.+)$/m;

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

const TOOLBAR = [
  { label: 'B',    title: 'Bold',        before: '**',    after: '**' },
  { label: 'I',    title: 'Italic',      before: '*',     after: '*'  },
  { label: 'H2',   title: 'Heading',     before: '## ',   after: ''   },
  { label: '•',    title: 'Bullet list', before: '- ',    after: ''   },
  { label: '</>',  title: 'Code block',  before: '```\n', after: '\n```' },
  { label: '🔗',   title: 'Link',        before: '[',     after: '](url)' },
  { label: '[[]]', title: 'Wikilink',    before: '[[',    after: ']]' },
];

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function NoteEditor({ noteId, initialContent, viewMode, currentTitle, onChange, onSave, onTitleChange }: NoteEditorProps) {
  const [content, setContent] = useState(initialContent);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const viewRef = useRef<EditorViewType | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentRef = useRef(initialContent);
  const dirtyRef = useRef(false);
  const manualSaveRef = useRef<() => void>(() => {});
  const notesRef = useRef<NoteStub[]>([]);
  const viewModeRef = useRef(viewMode);
  viewModeRef.current = viewMode;
  const router = useRouter();
  const tabsCtx = useTabsContext();

  // Live values read by the stable save() callback through refs (so save never
  // needs rebuilding when these change), mirroring the wikilink-facet pattern.
  const { data: fileSettings } = useSWR<FileSettings>('/api/user/settings', fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  });

  // Speech plugin gates the toolbar's dictation (speech-to-text) button.
  const { data: pluginsData } = useSWR('/api/user/plugins', fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 30_000,
  });
  const speechOn =
    (pluginsData?.installed ?? []).includes('speech') && !!pluginsData?.enabled?.speech;

  // Dictation via the Web Speech API: final transcripts are inserted at the
  // cursor. The recognizer lives in a ref; `dictating` drives the button UI.
  const [dictating, setDictating] = useState(false);
  const recognitionRef = useRef<any>(null);
  const toggleDictation = () => {
    if (dictating) {
      recognitionRef.current?.stop();
      return;
    }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      alert('Speech recognition is not supported in this browser. Try Chrome or Edge.');
      return;
    }
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = 'en-US';
    rec.onresult = (e: any) => {
      let text = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) text += e.results[i][0].transcript;
      }
      text = text.trim();
      if (!text) return;
      const view = viewRef.current;
      if (!view) return;
      const { from, to } = view.state.selection.main;
      // Pad with a space when gluing onto a non-whitespace character.
      const charBefore = from > 0 ? view.state.sliceDoc(from - 1, from) : '';
      const insert = (charBefore && !/\s/.test(charBefore) ? ' ' : '') + text + ' ';
      view.dispatch({
        changes: { from, to, insert },
        selection: { anchor: from + insert.length },
      });
    };
    rec.onend = () => {
      recognitionRef.current = null;
      setDictating(false);
    };
    rec.onerror = () => {
      // onend fires after onerror; state cleanup happens there.
    };
    recognitionRef.current = rec;
    rec.start();
    setDictating(true);
  };
  useEffect(() => {
    return () => recognitionRef.current?.stop();
  }, []);
  const settingsRef = useRef<FileSettings | undefined>(undefined);
  settingsRef.current = fileSettings;
  const currentTitleRef = useRef(currentTitle);
  currentTitleRef.current = currentTitle;
  const onTitleChangeRef = useRef(onTitleChange);
  onTitleChangeRef.current = onTitleChange;
  // Loop guard: set true right after an editor-triggered rename so the next
  // autosave doesn't immediately try to rename again before the remount lands.
  const skipNextH1Sync = useRef(false);

  // Stable closures for the CM wikilink facet — they read live values via refs
  // so the editor extension never needs rebuilding.
  const resolveRef = useRef<(name: string) => { id: string; title: string } | null>(() => null);
  resolveRef.current = (name: string) => {
    const note = resolveWikilink(name, notesRef.current);
    return note ? { id: note.id, title: noteDisplayName(note.path) } : null;
  };
  const onOpenRef = useRef<(id: string, title: string) => void>(() => {});
  onOpenRef.current = (id: string, title: string) => {
    tabsCtx?.openTab(id, title);
    router.push(`/notes/${encodeURIComponent(id.replace(/\.md$/i, ''))}`);
  };

  const isNew = noteId === 'new';

  const { data: treeData } = useSWR<{ notes: NoteStub[] }>('/api/notes/tree', fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 30_000,
  });
  // Keep the completion source's notes list current without rebuilding the editor.
  notesRef.current = treeData?.notes ?? [];

  const save = useCallback(async (text: string) => {
    if (isNew) return;
    setSaveStatus('saving');
    try {
      const res = await fetch(`/api/notes/${encodeURIComponent(noteId)}/update`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        // The editor holds the full document (frontmatter + body) — PUT directly.
        body: JSON.stringify({ content: text }),
      });
      if (!res.ok) throw new Error('Save failed');
      dirtyRef.current = false;
      setSaveStatus('saved');
      onSave?.(text);
      setTimeout(() => setSaveStatus('idle'), 2000);

      // Deliberately no broad mutate('/api/notes*') here — this runs on every
      // debounced autosave (every ~2s while typing), and invalidating the
      // sidebar tree/backlinks/etc. that often caused a visible refetch/flash
      // across the app on every keystroke pause. A rename (below) already
      // does its own targeted `mutate('/api/notes/tree')` in NoteViewClient;
      // plain content edits don't need anything else to invalidate.

      // Direction B — heading → filename. After the content is persisted, if the
      // first H1 differs from the current filename title, rename the note to match.
      if (skipNextH1Sync.current) {
        skipNextH1Sync.current = false;
      } else if (settingsRef.current?.syncHeadingWithFilename) {
        const h1Title = text.match(H1_LINE)?.[1]?.trim();
        const cur = currentTitleRef.current;
        // Skip if there's no heading, it already matches, or it contains a path
        // separator (which would move the note into a different folder).
        if (h1Title && cur && h1Title !== cur && !h1Title.includes('/')) {
          try {
            const moveRes = await fetch(`/api/notes/${encodeURIComponent(noteId)}/move`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: h1Title }),
            });
            if (moveRes.ok) {
              const moveData = await moveRes.json();
              skipNextH1Sync.current = true;
              onTitleChangeRef.current?.(h1Title, moveData.id);
            }
          } catch { /* best-effort; content already saved */ }
        }
      }
    } catch {
      setSaveStatus('error');
    }
  }, [noteId, isNew, onSave]);

  const handleChange = useCallback((text: string) => {
    setContent(text);
    contentRef.current = text;
    onChange?.(text);
    if (isNew) return;
    dirtyRef.current = true;
    setSaveStatus('idle');
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => save(text), 2000);
  }, [isNew, onChange, save]);

  const handleManualSave = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    save(contentRef.current);
  };
  manualSaveRef.current = handleManualSave;

  // Flush any pending debounced save when unmounting (navigating away / switching
  // notes) or when the tab/window closes — otherwise edits made within the 2s
  // debounce window are silently lost. keepalive lets the request outlive the page.
  useEffect(() => {
    const flush = () => {
      if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null; }
      if (isNew || !dirtyRef.current) return;
      dirtyRef.current = false;
      fetch(`/api/notes/${encodeURIComponent(noteId)}/update`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: contentRef.current }),
        keepalive: true,
      }).catch(() => {});
    };
    window.addEventListener('beforeunload', flush);
    return () => {
      window.removeEventListener('beforeunload', flush);
      flush();
    };
  }, [noteId, isNew]);

  // Toggle inline live-preview decorations when the mode changes (same editor
  // instance for 'source' and 'live'). onReady covers the initial dispatch once
  // the view exists (it's created lazily via the dynamic import).
  useEffect(() => {
    viewRef.current?.dispatch({ effects: setLivePreview.of(viewMode === 'live') });
  }, [viewMode]);

  // When the notes list resolves (SWR), re-run the decoration build so wikilinks
  // that rendered as "broken" before the list loaded resolve to real links.
  useEffect(() => {
    if (viewModeRef.current === 'live') {
      viewRef.current?.dispatch({ effects: setLivePreview.of(true) });
    }
  }, [treeData]);

  // Built once — stable for the editor's lifetime. Dynamic bits (notes list,
  // save handler) are read through refs so this never needs to rebuild.
  const extensions = useMemo(() => [
    rexformDarkTheme,
    rexformSyntaxHighlighting,
    livePreview(),
    wikilinkConfig.of({
      resolve: (name) => resolveRef.current(name),
      onOpen: (id, title) => onOpenRef.current(id, title),
    }),
    // Default markdown() uses plain CommonMark — `base: markdownLanguage`
    // switches to the GFM-configured parser so tables and strikethrough
    // actually produce Table/Strikethrough syntax-tree nodes (livePreview.ts
    // decorates both; without this, `~~text~~` and `| a | b |` never matched
    // anything and rendered as plain paragraph text).
    markdown({ base: markdownLanguage }),
    EditorView.lineWrapping,
    history(),
    closeBrackets(),
    autocompletion({
      override: [wikilinkCompletions(notesRef)],
      icons: false,
      activateOnTyping: true,
    }),
    keymap.of([
      { key: 'Mod-s', preventDefault: true, run: () => { manualSaveRef.current(); return true; } },
      ...closeBracketsKeymap,
      ...completionKeymap,
      // Obsidian-style: Tab accepts the highlighted completion (e.g. in the
      // [[wikilink]] popup). Returns false when no popup is open, falling
      // through to indentWithTab below.
      { key: 'Tab', run: acceptCompletion },
      ...historyKeymap,
      ...defaultKeymap,
      indentWithTab,
    ]),
  ], []);

  const insertMarkdown = (before: string, after: string) => {
    const view = viewRef.current;
    if (!view) return;
    const { from, to } = view.state.selection.main;
    const selected = view.state.sliceDoc(from, to);
    view.dispatch({
      changes: { from, to, insert: before + selected + after },
      selection: { anchor: from + before.length, head: from + before.length + selected.length },
    });
    view.focus();
  };

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const handleDelete = async () => {
    if (deleteBusy) return;
    setDeleteBusy(true);
    setDeleteError('');
    try {
      const res = await fetch(`/api/notes/${encodeURIComponent(noteId)}/delete`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      await mutate((key) => typeof key === 'string' && key.startsWith('/api/notes'), undefined, { revalidate: true });
      setConfirmDelete(false);
      router.push('/notes');
      router.refresh();
    } catch {
      setDeleteError('Failed to delete note.');
    } finally {
      setDeleteBusy(false);
    }
  };

  const statusLabel: Record<SaveStatus, string> = {
    idle: '', saving: 'Saving…', saved: 'Saved ✓', error: 'Error saving',
  };
  const statusColor: Record<SaveStatus, string> = {
    idle: '', saving: 'var(--text-secondary)', saved: '#4ade80', error: '#f87171',
  };

  const editorPane = (
    <div className="flex-1 min-w-0" style={{ minHeight: 0 }}>
      <CodeMirrorEditor
        value={content}
        onChange={handleChange}
        extensions={extensions}
        viewRef={viewRef}
        onReady={(view) => view.dispatch({ effects: setLivePreview.of(viewModeRef.current === 'live') })}
        placeholder="Start writing in Markdown… use [[note name]] to link notes"
        autoFocus={!isNew}
      />
    </div>
  );

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg-base)' }}>
      {/* Toolbar — Source mode only. Live Preview reads like Reading mode, so
          there's no toolbar/border to separate it from the content at all;
          Save is automatic (autosave) and Delete already lives in the note's
          ⋮ menu (NoteMenu, in NoteViewClient's breadcrumb) regardless of mode. */}
      {viewMode === 'source' && (
      <div
        className="flex items-center gap-1 px-3 py-2 border-b flex-shrink-0"
        style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
      >
        {TOOLBAR.map((btn) => (
          <button
            key={btn.label}
            title={btn.title}
            onClick={() => insertMarkdown(btn.before, btn.after)}
            className="px-2 py-1 rounded text-xs font-medium hover:opacity-80 transition-opacity"
            style={{ background: 'var(--border)', color: 'var(--text-primary)', minWidth: 28 }}
          >
            {btn.label}
          </button>
        ))}

        {speechOn && (
          <button
            title={dictating ? 'Stop dictation' : 'Dictate (speech-to-text)'}
            onClick={toggleDictation}
            className="px-2 py-1 rounded text-xs font-medium hover:opacity-80 transition-opacity"
            style={{
              background: dictating ? 'rgba(248,113,113,0.18)' : 'var(--border)',
              color: dictating ? '#f87171' : 'var(--text-primary)',
              minWidth: 28,
            }}
          >
            {dictating ? '🎤 …' : '🎤'}
          </button>
        )}

        <div className="flex-1" />

        {!isNew && (
          <>
            <button
              onClick={handleManualSave}
              className="px-3 py-1 rounded text-xs font-medium"
              style={{ background: 'var(--accent)', color: '#fff' }}
            >
              Save
            </button>
            <button
              onClick={() => setConfirmDelete(true)}
              className="px-3 py-1 rounded text-xs font-medium"
              style={{ background: '#2d1a1a', color: '#f87171' }}
            >
              Delete
            </button>
            {statusLabel[saveStatus] && (
              <span className="text-xs ml-1" style={{ color: statusColor[saveStatus] }}>
                {statusLabel[saveStatus]}
              </span>
            )}
          </>
        )}
      </div>
      )}

      {/* Single CM pane for both 'source' (raw) and 'live' (inline decorations,
          toggled via setLivePreview). 'reading' is handled by NoteViewClient. */}
      {editorPane}

      {confirmDelete && (
        <ConfirmModal
          title="Delete note"
          message={<>Are you sure you want to delete <strong style={{ color: 'rgba(255,255,255,0.85)' }}>{noteId.replace(/\.md$/i, '').split('/').pop()}</strong>? This cannot be undone.</>}
          busy={deleteBusy}
          error={deleteError}
          onConfirm={handleDelete}
          onCancel={() => { setConfirmDelete(false); setDeleteError(''); }}
        />
      )}
    </div>
  );
}
