'use client';
import { useState, useRef, useEffect } from 'react';

// Obsidian-style "More options" (⋮) menu shown at the top-right of a note.
// Rename/Delete are owned by NoteViewClient (they touch tabs + routing);
// clipboard and cross-panel actions live here. Cross-panel actions reach
// NotesShell / NotesSidebar via window CustomEvents so no context plumbing
// is needed for one-shot commands.

interface Props {
  noteId: string;
  title: string;
  canWrite: boolean;
  onRename: () => void;
  onDelete: () => void;
}

const itemStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8,
  width: '100%', textAlign: 'left',
  padding: '6px 14px', fontSize: 13,
  color: 'rgba(255,255,255,0.8)',
  background: 'transparent', border: 'none', cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const sepStyle: React.CSSProperties = {
  height: 1, background: 'rgba(255,255,255,0.08)', margin: '4px 0',
};

const hoverBg = 'rgba(255,255,255,0.08)';

function MenuItem({
  label,
  danger,
  onClick,
}: {
  label: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      style={{ ...itemStyle, color: danger ? '#f87171' : itemStyle.color }}
      onMouseEnter={(e) => { e.currentTarget.style.background = hoverBg; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

export default function NoteMenu({ noteId, title, canWrite, onRename, onDelete }: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); }
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  const close = () => setOpen(false);

  const copy = (what: string, text: string) => {
    navigator.clipboard?.writeText(text).catch(() => {});
    // Brief "Copied" feedback inside the still-open menu, then close.
    setCopied(what);
    setTimeout(() => { setCopied(null); setOpen(false); }, 650);
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onClick={() => setOpen((o) => !o)}
        title="More options"
        style={{
          width: 26, height: 26, borderRadius: 6,
          border: 'none', cursor: 'pointer', padding: 0,
          background: open ? 'rgba(255,255,255,0.08)' : 'transparent',
          color: open ? '#fff' : 'var(--text-muted)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'background 0.15s, color 0.15s',
        }}
        onMouseEnter={(e) => { if (!open) e.currentTarget.style.color = '#fff'; }}
        onMouseLeave={(e) => { if (!open) e.currentTarget.style.color = 'var(--text-muted)'; }}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
          <circle cx="7" cy="2.5" r="1.3" />
          <circle cx="7" cy="7" r="1.3" />
          <circle cx="7" cy="11.5" r="1.3" />
        </svg>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 200,
            background: '#1e2030',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            minWidth: 190,
            padding: '4px 0',
            overflow: 'hidden',
          }}
        >
          {canWrite && (
            <MenuItem label="Rename file" onClick={() => { close(); onRename(); }} />
          )}
          <MenuItem
            label="Search notes"
            onClick={() => {
              close();
              window.dispatchEvent(new CustomEvent('rexform:open-search'));
            }}
          />
          <MenuItem
            label="Reveal file in navigation"
            onClick={() => {
              close();
              window.dispatchEvent(new CustomEvent('rexform:reveal-note', { detail: { id: noteId } }));
            }}
          />

          <div style={sepStyle} />

          <MenuItem
            label={copied === 'path' ? 'Copied ✓' : 'Copy path'}
            onClick={() => copy('path', noteId)}
          />
          <MenuItem
            label={copied === 'link' ? 'Copied ✓' : 'Copy wikilink'}
            onClick={() => copy('link', `[[${title}]]`)}
          />

          {canWrite && (
            <>
              <div style={sepStyle} />
              <MenuItem label="Delete file" danger onClick={() => { close(); onDelete(); }} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
