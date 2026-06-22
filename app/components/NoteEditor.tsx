'use client';
import { useState, useRef, useCallback, useEffect } from 'react';
import useSWR from 'swr';
import { mutate } from 'swr';
import { useRouter } from 'next/navigation';
import WikiMarkdown from './WikiMarkdown';

interface NoteStub { id: string; path: string }

interface NoteEditorProps {
  noteId: string;
  initialContent: string;
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

function getWikilinkQuery(content: string, cursorPos: number): string | null {
  const before = content.slice(0, cursorPos);
  const match = before.match(/\[\[([^\[\]]*)$/);
  return match ? match[1] : null;
}

function noteDisplayName(path: string): string {
  return path.split('/').pop()?.replace(/\.md$/i, '') ?? path;
}

export default function NoteEditor({ noteId, initialContent, onChange, onSave }: NoteEditorProps) {
  const [content, setContent] = useState(initialContent);
  const [viewMode, setViewMode] = useState<'edit' | 'split' | 'preview'>('edit');
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentRef = useRef(initialContent);
  const dirtyRef = useRef(false);
  const router = useRouter();

  const isNew = noteId === 'new';

  const { data: treeData } = useSWR<{ notes: NoteStub[] }>('/api/notes/tree', fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 30_000,
  });
  const allNotes = treeData?.notes ?? [];

  // Detect wikilink autocomplete state from cursor position
  const cursorPos = textareaRef.current?.selectionStart ?? content.length;
  const wikilinkQuery = getWikilinkQuery(content, cursorPos);

  const suggestions =
    wikilinkQuery !== null
      ? allNotes
          .filter((n) =>
            noteDisplayName(n.path).toLowerCase().includes(wikilinkQuery.toLowerCase())
          )
          .slice(0, 8)
      : [];

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

  const handleChange = (text: string) => {
    setContent(text);
    contentRef.current = text;
    onChange?.(text);
    setSelectedIdx(0);
    if (isNew) return;
    dirtyRef.current = true;
    setSaveStatus('idle');
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => save(text), 2000);
  };

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

  const insertMarkdown = (before: string, after: string) => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = content.slice(start, end);
    const next = content.slice(0, start) + before + selected + after + content.slice(end);
    handleChange(next);
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + before.length, end + before.length);
    }, 0);
  };

  const acceptSuggestion = (note: NoteStub) => {
    const el = textareaRef.current;
    if (!el || wikilinkQuery === null) return;
    const pos = el.selectionStart;
    const before = content.slice(0, pos);
    // Replace the [[<partial> with [[<name>]]
    const replaced = before.replace(/\[\[([^\[\]]*)$/, `[[${noteDisplayName(note.path)}]]`);
    const next = replaced + content.slice(pos);
    handleChange(next);
    const newCursor = replaced.length;
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(newCursor, newCursor);
    }, 0);
  };

  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      acceptSuggestion(suggestions[selectedIdx]);
    } else if (e.key === 'Escape') {
      // Force-clear by moving cursor (re-read from textarea)
      textareaRef.current?.blur();
      setTimeout(() => textareaRef.current?.focus(), 0);
    }
  };

  const handleManualSave = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    save(content);
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
    <div className="relative flex-1 flex flex-col min-w-0">
      <textarea
        ref={textareaRef}
        value={content}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={handleTextareaKeyDown}
        className="flex-1 resize-none outline-none font-mono text-sm p-4 leading-relaxed"
        style={{ background: 'var(--bg-base)', color: 'var(--text-primary)', caretColor: 'var(--accent)' }}
        placeholder="Start writing in Markdown… use [[note name]] to link notes"
        spellCheck={false}
      />

      {/* Wikilink autocomplete dropdown */}
      {suggestions.length > 0 && (
        <div
          className="absolute left-4 bottom-4 z-50 rounded shadow-lg border overflow-hidden"
          style={{
            background: 'var(--bg-surface)',
            borderColor: 'var(--border)',
            minWidth: 220,
            maxWidth: 320,
          }}
        >
          <div
            className="px-2 py-1 text-xs border-b"
            style={{ color: 'var(--text-muted)', borderColor: 'var(--border)' }}
          >
            Link note · ↑↓ navigate · Enter/Tab select · Esc cancel
          </div>
          {suggestions.map((note, i) => (
            <button
              key={note.id}
              onMouseDown={(e) => { e.preventDefault(); acceptSuggestion(note); }}
              className="w-full text-left px-3 py-1.5 text-sm truncate"
              style={{
                background: i === selectedIdx ? 'var(--accent)' : 'transparent',
                color: i === selectedIdx ? '#fff' : 'var(--text-primary)',
              }}
              onMouseEnter={() => setSelectedIdx(i)}
            >
              {noteDisplayName(note.path)}
              {note.path.includes('/') && (
                <span className="ml-1.5 text-xs opacity-60">
                  {note.path.split('/').slice(0, -1).join('/')}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
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

        <div className="flex rounded overflow-hidden border" style={{ borderColor: 'var(--accent)' }}>
          {(['edit', 'split', 'preview'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setViewMode(m)}
              className="px-2.5 py-1 text-xs font-medium capitalize transition-colors"
              style={{
                background: viewMode === m ? 'var(--accent)' : 'transparent',
                color: viewMode === m ? '#fff' : 'var(--accent)',
              }}
            >
              {m}
            </button>
          ))}
        </div>

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

      {/* Content area */}
      {viewMode === 'preview' ? (
        previewPane
      ) : viewMode === 'split' ? (
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
