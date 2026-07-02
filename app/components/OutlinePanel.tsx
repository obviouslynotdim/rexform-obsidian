'use client';
import { useState, useMemo } from 'react';

// ─── Outline panel ───────────────────────────────────────────────────────────
// Rendered by NotesShell's right column; the outline data itself is computed by
// NoteViewClient (which owns the document) and published via RightPanelContext.

export interface OutlineItem { level: number; text: string; index: number; id: string }

export function OutlineIcon() {
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

export default function OutlinePanel({ outline, onJump }: { outline: OutlineItem[]; onJump: (o: OutlineItem) => void }) {
  const tree = useMemo(() => buildOutlineTree(outline), [outline]);
  if (outline.length === 0) {
    return <p style={{ padding: 12, fontSize: 12.5, color: 'var(--text-muted)' }}>No headings</p>;
  }
  return (
    <div style={{ padding: '4px 4px 12px' }}>
      {tree.map((n) => (
        <OutlineRow key={n.id} node={n} depth={0} onJump={onJump} />
      ))}
    </div>
  );
}
