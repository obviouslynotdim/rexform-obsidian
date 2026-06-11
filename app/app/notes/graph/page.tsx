'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import GraphView from '@/components/GraphView';
import NotePreview from '@/components/NotePreview';

export default function GraphPage() {
  const router = useRouter();
  const [selectedNote, setSelectedNote] = useState<string | null>(null);
  const [selectedNoteTitle, setSelectedNoteTitle] = useState('');

  return (
    <div style={{ display: 'flex', height: '100%', background: 'var(--bg-base)', overflow: 'hidden' }}>

      {/* Graph panel */}
      <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
        <GraphView
          showHeader
          onNodeClick={(id, title) => { setSelectedNote(id); setSelectedNoteTitle(title); }}
          activeNoteId={selectedNote ?? undefined}
        />
      </div>

      {/* Note preview panel */}
      {selectedNote && (
        <div style={{
          width: 480,
          flexShrink: 0,
          borderLeft: '1px solid rgba(255,255,255,0.1)',
          background: 'var(--bg-surface)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 16px',
            height: 44,
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            flexShrink: 0,
          }}>
            <span style={{
              fontSize: 13,
              color: 'rgba(255,255,255,0.6)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flex: 1,
            }}>
              {selectedNoteTitle}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, marginLeft: 8 }}>
              <button
                onClick={() => router.push(`/notes/${encodeURIComponent(selectedNote)}`)}
                style={{
                  fontSize: 12,
                  color: 'var(--accent)',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px 8px',
                  borderRadius: 4,
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.08)';
                  (e.currentTarget as HTMLButtonElement).style.color = '#fff';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                  (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent)';
                }}
              >
                Open ↗
              </button>
              <button
                onClick={() => setSelectedNote(null)}
                style={{
                  fontSize: 16,
                  color: 'rgba(255,255,255,0.4)',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  lineHeight: 1,
                  padding: 4,
                  borderRadius: 4,
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#fff'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.4)'; }}
              >
                ✕
              </button>
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            <NotePreview noteId={selectedNote} />
          </div>
        </div>
      )}
    </div>
  );
}
