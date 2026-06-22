'use client';
import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import useSWR from 'swr';
import { mutate } from 'swr';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { EditorView, keymap } from '@codemirror/view';
import type { EditorView as EditorViewType } from '@codemirror/view';
import { markdown } from '@codemirror/lang-markdown';
import { history, historyKeymap, defaultKeymap, indentWithTab } from '@codemirror/commands';
import {
  autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap,
} from '@codemirror/autocomplete';
import WikiMarkdown from './WikiMarkdown';
import { rexformDarkTheme, rexformSyntaxHighlighting } from '@/lib/cm/theme';
import { wikilinkCompletions, type NoteStub } from '@/lib/cm/wikilinkComplete';

// CM touches the DOM at instantiation — load client-only to keep it out of SSR.
const CodeMirrorEditor = dynamic(() => import('./CodeMirrorEditor'), {
  ssr: false,
  loading: () => <div style={{ height: '100%', background: 'var(--bg-base)' }} />,
});

export type ViewMode = 'reading' | 'source' | 'split';

interface NoteEditorProps {
  noteId: string;
  initialContent: string;
  viewMode: ViewMode;
  onChange?: (content: string) => void;
  onSave?: (content: string) => void;
}

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

export default function NoteEditor({ noteId, initialContent, viewMode, onChange, onSave }: NoteEditorProps) {
  const [content, setContent] = useState(initialContent);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const viewRef = useRef<EditorViewType | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentRef = useRef(initialContent);
  const dirtyRef = useRef(false);
  const manualSaveRef = useRef<() => void>(() => {});
  const notesRef = useRef<NoteStub[]>([]);
  const router = useRouter();

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
        body: JSON.stringify({ content: text }),
      });
      if (!res.ok) throw new Error('Save failed');
      dirtyRef.current = false;
      setSaveStatus('saved');
      onSave?.(text);
      mutate((key) => typeof key === 'string' && key.startsWith('/api/notes'), undefined, { revalidate: true });
      setTimeout(() => setSaveStatus('idle'), 2000);
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

  // Built once — stable for the editor's lifetime. Dynamic bits (notes list,
  // save handler) are read through refs so this never needs to rebuild.
  const extensions = useMemo(() => [
    rexformDarkTheme,
    rexformSyntaxHighlighting,
    markdown(),
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

  const handleDelete = async () => {
    if (!confirm('Delete this note? This cannot be undone.')) return;
    try {
      const res = await fetch(`/api/notes/${encodeURIComponent(noteId)}/delete`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      await mutate((key) => typeof key === 'string' && key.startsWith('/api/notes'), undefined, { revalidate: true });
      router.push('/notes');
      router.refresh();
    } catch {
      alert('Failed to delete note.');
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
        placeholder="Start writing in Markdown… use [[note name]] to link notes"
        autoFocus={!isNew}
      />
    </div>
  );

  const previewPane = (
    <div
      className="flex-1 overflow-y-auto px-6 py-4 prose min-w-0"
      style={{ color: 'var(--text-primary)' }}
    >
      <WikiMarkdown>{content}</WikiMarkdown>
    </div>
  );

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg-base)' }}>
      {/* Toolbar */}
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
              onClick={handleDelete}
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

      {/* Content area — 'split' shows the CM editor beside a live preview pane,
          otherwise editor only. ('reading' is handled by NoteViewClient.)
          True inline live preview replaces the split pane in Phase A2. */}
      {viewMode === 'split' ? (
        <div className="flex-1 flex min-h-0">
          <div className="flex flex-col min-w-0" style={{ flex: 1, borderRight: '1px solid var(--border)' }}>
            {editorPane}
          </div>
          {previewPane}
        </div>
      ) : (
        editorPane
      )}
    </div>
  );
}
