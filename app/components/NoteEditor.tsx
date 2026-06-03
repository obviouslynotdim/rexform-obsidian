'use client';
import { useState, useRef, useCallback, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useRouter } from 'next/navigation';

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
];

export default function NoteEditor({ noteId, initialContent, onChange, onSave }: NoteEditorProps) {
  const [content, setContent] = useState(initialContent);
  const [preview, setPreview] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();

  const isNew = noteId === 'new';

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
      setSaveStatus('saved');
      onSave?.(text);
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch {
      setSaveStatus('error');
    }
  }, [noteId, isNew, onSave]);

  const handleChange = (text: string) => {
    setContent(text);
    onChange?.(text);
    if (isNew) return;
    setSaveStatus('idle');
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => save(text), 2000);
  };

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

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

  const handleManualSave = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    save(content);
  };

  const handleDelete = async () => {
    if (!confirm('Delete this note? This cannot be undone.')) return;
    try {
      const res = await fetch(`/api/notes/${encodeURIComponent(noteId)}/delete`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
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

        <button
          onClick={() => setPreview((p) => !p)}
          className="px-3 py-1 rounded text-xs font-medium border"
          style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
        >
          {preview ? 'Edit' : 'Preview'}
        </button>

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
      {preview ? (
        <div
          className="flex-1 overflow-y-auto px-6 py-4 prose"
          style={{ color: 'var(--text-primary)' }}
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </div>
      ) : (
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => handleChange(e.target.value)}
          className="flex-1 resize-none outline-none font-mono text-sm p-4 leading-relaxed"
          style={{ background: 'var(--bg-base)', color: 'var(--text-primary)', caretColor: 'var(--accent)' }}
          placeholder="Start writing in Markdown…"
          spellCheck={false}
        />
      )}
    </div>
  );
}
