'use client';
import { useState, useMemo, useRef, useEffect } from 'react';
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from '@hello-pangea/dnd';
import { parseKanban, serializeKanban, type KanbanBoard, type KanbanColumn } from '@/lib/kanban';

// Renders a note body as an Obsidian-style Kanban board. Fully controlled:
// the board is parsed from `body` on every render and every mutation is
// re-serialized through onBodyChange, so the markdown document stays the
// single source of truth (same discipline as the Properties panel).

interface Props {
  body: string;
  canWrite: boolean;
  onBodyChange: (nextBody: string) => void;
}

const COL_WIDTH = 272;

function cloneBoard(b: KanbanBoard): KanbanBoard {
  return {
    prelude: b.prelude,
    trailer: b.trailer,
    columns: b.columns.map((c) => ({ ...c, cards: c.cards.map((card) => ({ ...card })) })),
  };
}

// Auto-sizing textarea used for card edit / add — Enter commits, Shift+Enter
// inserts a newline, Escape cancels.
function CardTextarea({
  initial,
  placeholder,
  onCommit,
  onCancel,
}: {
  initial: string;
  placeholder?: string;
  onCommit: (text: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  const resize = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };
  useEffect(resize, []);

  return (
    <textarea
      ref={ref}
      value={value}
      placeholder={placeholder}
      onChange={(e) => { setValue(e.target.value); resize(); }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onCommit(value); }
        if (e.key === 'Escape') { e.stopPropagation(); onCancel(); }
      }}
      onBlur={() => onCommit(value)}
      rows={1}
      style={{
        width: '100%', resize: 'none', overflow: 'hidden',
        background: 'var(--bg-base)', border: '1px solid var(--accent)',
        borderRadius: 6, outline: 'none', padding: '7px 9px',
        color: 'var(--text-primary)', fontSize: 13, lineHeight: 1.5,
        fontFamily: 'inherit',
      }}
    />
  );
}

// Small ⋯ popover for column actions. Closes on outside click.
function ColumnMenu({
  column,
  onRename,
  onToggleComplete,
  onDelete,
}: {
  column: KanbanColumn;
  onRename: () => void;
  onToggleComplete: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const itemStyle: React.CSSProperties = {
    display: 'block', width: '100%', textAlign: 'left', border: 'none',
    background: 'transparent', color: 'var(--text-primary)', fontSize: 12.5,
    padding: '6px 12px', cursor: 'pointer', whiteSpace: 'nowrap',
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onClick={() => setOpen((o) => !o)}
        title="Column options"
        style={{
          border: 'none', background: 'transparent', cursor: 'pointer',
          color: 'var(--text-muted)', fontSize: 14, lineHeight: 1,
          padding: '2px 4px', borderRadius: 4,
        }}
      >⋯</button>
      {open && (
        <div
          style={{
            position: 'absolute', top: '100%', right: 0, zIndex: 50,
            background: 'var(--bg-elevated)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '4px 0', minWidth: 170,
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          }}
        >
          <button style={itemStyle} onClick={() => { setOpen(false); onRename(); }}>
            Rename
          </button>
          <button style={itemStyle} onClick={() => { setOpen(false); onToggleComplete(); }}>
            {column.complete ? 'Unmark as done column' : 'Mark as done column'}
          </button>
          <button
            style={{ ...itemStyle, color: '#f87171' }}
            onClick={() => { setOpen(false); onDelete(); }}
          >
            Delete column
          </button>
        </div>
      )}
    </div>
  );
}

export default function KanbanView({ body, canWrite, onBodyChange }: Props) {
  const board = useMemo(() => parseKanban(body), [body]);

  const [editingCard, setEditingCard] = useState<{ col: number; card: number } | null>(null);
  const [addingCardIn, setAddingCardIn] = useState<number | null>(null);
  const [renamingCol, setRenamingCol] = useState<number | null>(null);
  const [addingColumn, setAddingColumn] = useState(false);

  const commit = (next: KanbanBoard) => onBodyChange(serializeKanban(next));

  // ── mutations ──
  const handleDragEnd = (result: DropResult) => {
    const { source, destination, type } = result;
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    const next = cloneBoard(board);
    if (type === 'COLUMN') {
      const [moved] = next.columns.splice(source.index, 1);
      next.columns.splice(destination.index, 0, moved);
    } else {
      const from = next.columns[Number(source.droppableId)];
      const to = next.columns[Number(destination.droppableId)];
      if (!from || !to) return;
      const [card] = from.cards.splice(source.index, 1);
      // Obsidian behavior: landing in a "done" column checks the card,
      // leaving one unchecks it.
      if (from !== to) card.checked = to.complete;
      to.cards.splice(destination.index, 0, card);
    }
    commit(next);
  };

  const setCardText = (ci: number, i: number, text: string) => {
    const trimmed = text.trim();
    const next = cloneBoard(board);
    if (trimmed) next.columns[ci].cards[i].text = trimmed;
    else next.columns[ci].cards.splice(i, 1); // emptied card → delete
    commit(next);
  };

  const toggleCardChecked = (ci: number, i: number) => {
    const next = cloneBoard(board);
    next.columns[ci].cards[i].checked = !next.columns[ci].cards[i].checked;
    commit(next);
  };

  const deleteCard = (ci: number, i: number) => {
    const next = cloneBoard(board);
    next.columns[ci].cards.splice(i, 1);
    commit(next);
  };

  const addCard = (ci: number, text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const next = cloneBoard(board);
    next.columns[ci].cards.push({ text: trimmed, checked: next.columns[ci].complete });
    commit(next);
  };

  const renameColumn = (ci: number, title: string) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    const next = cloneBoard(board);
    next.columns[ci].title = trimmed;
    commit(next);
  };

  const toggleColumnComplete = (ci: number) => {
    const next = cloneBoard(board);
    next.columns[ci].complete = !next.columns[ci].complete;
    commit(next);
  };

  const deleteColumn = (ci: number) => {
    const col = board.columns[ci];
    if (col.cards.length > 0 && !window.confirm(`Delete "${col.title}" and its ${col.cards.length} card(s)?`)) return;
    const next = cloneBoard(board);
    next.columns.splice(ci, 1);
    commit(next);
  };

  const addColumn = (title: string) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    const next = cloneBoard(board);
    next.columns.push({ title: trimmed, complete: false, cards: [] });
    commit(next);
  };

  // ── render ──
  return (
    <div style={{ height: '100%', overflowX: 'auto', overflowY: 'hidden', padding: '20px 24px' }}>
      <DragDropContext onDragEnd={handleDragEnd}>
        <Droppable droppableId="board" type="COLUMN" direction="horizontal">
          {(boardProvided) => (
            <div
              ref={boardProvided.innerRef}
              {...boardProvided.droppableProps}
              style={{ display: 'flex', gap: 14, alignItems: 'flex-start', height: '100%' }}
            >
              {board.columns.map((col, ci) => (
                <Draggable
                  key={`col-${ci}`}
                  draggableId={`col-${ci}`}
                  index={ci}
                  isDragDisabled={!canWrite || renamingCol === ci}
                >
                  {(colProvided) => (
                    <div
                      ref={colProvided.innerRef}
                      {...colProvided.draggableProps}
                      style={{
                        ...colProvided.draggableProps.style,
                        width: COL_WIDTH, flexShrink: 0,
                        display: 'flex', flexDirection: 'column', maxHeight: '100%',
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid var(--border)', borderRadius: 10,
                      }}
                    >
                      {/* Column header — the drag handle for reordering columns */}
                      <div
                        {...colProvided.dragHandleProps}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          padding: '10px 12px 8px', flexShrink: 0,
                        }}
                      >
                        {renamingCol === ci ? (
                          <div style={{ flex: 1 }}>
                            <CardTextarea
                              initial={col.title}
                              onCommit={(t) => { setRenamingCol(null); renameColumn(ci, t); }}
                              onCancel={() => setRenamingCol(null)}
                            />
                          </div>
                        ) : (
                          <>
                            <span
                              onClick={canWrite ? () => setRenamingCol(ci) : undefined}
                              title={canWrite ? 'Click to rename' : undefined}
                              style={{
                                flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600,
                                color: 'var(--text-primary)', overflow: 'hidden',
                                textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                cursor: canWrite ? 'text' : 'default',
                              }}
                            >
                              {col.title}
                            </span>
                            <span style={{ fontSize: 11.5, color: 'var(--text-muted)', flexShrink: 0 }}>
                              {col.cards.length}
                            </span>
                            {canWrite && (
                              <ColumnMenu
                                column={col}
                                onRename={() => setRenamingCol(ci)}
                                onToggleComplete={() => toggleColumnComplete(ci)}
                                onDelete={() => deleteColumn(ci)}
                              />
                            )}
                          </>
                        )}
                      </div>

                      {/* Cards */}
                      <Droppable droppableId={String(ci)} type="CARD">
                        {(dropProvided, dropSnapshot) => (
                          <div
                            ref={dropProvided.innerRef}
                            {...dropProvided.droppableProps}
                            style={{
                              flex: 1, minHeight: 8, overflowY: 'auto',
                              padding: '2px 8px',
                              background: dropSnapshot.isDraggingOver ? 'rgba(127,119,221,0.06)' : 'transparent',
                              borderRadius: 8, transition: 'background 0.12s',
                            }}
                          >
                            {col.cards.map((card, i) => (
                              <Draggable
                                key={`card-${ci}-${i}`}
                                draggableId={`card-${ci}-${i}`}
                                index={i}
                                isDragDisabled={!canWrite || (editingCard?.col === ci && editingCard?.card === i)}
                              >
                                {(cardProvided, cardSnapshot) => (
                                  <div
                                    ref={cardProvided.innerRef}
                                    {...cardProvided.draggableProps}
                                    {...cardProvided.dragHandleProps}
                                    className="kanban-card"
                                    style={{
                                      ...cardProvided.draggableProps.style,
                                      marginBottom: 8,
                                    }}
                                  >
                                    {editingCard?.col === ci && editingCard?.card === i ? (
                                      <CardTextarea
                                        initial={card.text}
                                        onCommit={(t) => { setEditingCard(null); setCardText(ci, i, t); }}
                                        onCancel={() => setEditingCard(null)}
                                      />
                                    ) : (
                                      <div
                                        style={{
                                          display: 'flex', alignItems: 'flex-start', gap: 8,
                                          background: cardSnapshot.isDragging ? 'var(--bg-elevated)' : 'var(--bg-surface)',
                                          border: '1px solid var(--border)',
                                          borderRadius: 6, padding: '7px 9px',
                                          boxShadow: cardSnapshot.isDragging ? '0 6px 18px rgba(0,0,0,0.35)' : 'none',
                                        }}
                                      >
                                        <input
                                          type="checkbox"
                                          checked={card.checked}
                                          disabled={!canWrite}
                                          onChange={() => toggleCardChecked(ci, i)}
                                          onClick={(e) => e.stopPropagation()}
                                          style={{ marginTop: 3, accentColor: 'var(--accent)', cursor: canWrite ? 'pointer' : 'default' }}
                                        />
                                        <span
                                          onClick={canWrite ? () => setEditingCard({ col: ci, card: i }) : undefined}
                                          style={{
                                            flex: 1, minWidth: 0, fontSize: 13, lineHeight: 1.5,
                                            color: card.checked ? 'var(--text-muted)' : 'var(--text-primary)',
                                            textDecoration: card.checked ? 'line-through' : 'none',
                                            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                                            cursor: canWrite ? 'text' : 'default',
                                          }}
                                        >
                                          {card.text}
                                        </span>
                                        {canWrite && (
                                          <button
                                            className="kanban-card-delete"
                                            title="Delete card"
                                            onClick={(e) => { e.stopPropagation(); deleteCard(ci, i); }}
                                            style={{
                                              border: 'none', background: 'transparent', cursor: 'pointer',
                                              color: 'var(--text-muted)', fontSize: 13, lineHeight: 1,
                                              padding: 0, flexShrink: 0,
                                            }}
                                          >×</button>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </Draggable>
                            ))}
                            {dropProvided.placeholder}
                          </div>
                        )}
                      </Droppable>

                      {/* Add card */}
                      {canWrite && (
                        <div style={{ padding: '4px 8px 10px', flexShrink: 0 }}>
                          {addingCardIn === ci ? (
                            <CardTextarea
                              initial=""
                              placeholder="Card text…"
                              onCommit={(t) => { setAddingCardIn(null); addCard(ci, t); }}
                              onCancel={() => setAddingCardIn(null)}
                            />
                          ) : (
                            <button
                              onClick={() => setAddingCardIn(ci)}
                              style={{
                                width: '100%', textAlign: 'left', border: 'none',
                                background: 'transparent', cursor: 'pointer',
                                color: 'var(--text-muted)', fontSize: 12.5,
                                padding: '5px 4px', borderRadius: 6,
                              }}
                            >
                              + Add card
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </Draggable>
              ))}
              {boardProvided.placeholder}

              {/* Add column */}
              {canWrite && (
                <div style={{ width: COL_WIDTH, flexShrink: 0 }}>
                  {addingColumn ? (
                    <CardTextarea
                      initial=""
                      placeholder="Column name…"
                      onCommit={(t) => { setAddingColumn(false); addColumn(t); }}
                      onCancel={() => setAddingColumn(false)}
                    />
                  ) : (
                    <button
                      onClick={() => setAddingColumn(true)}
                      style={{
                        width: '100%', border: '1px dashed var(--border)',
                        background: 'transparent', cursor: 'pointer',
                        color: 'var(--text-muted)', fontSize: 13,
                        padding: '10px 12px', borderRadius: 10, textAlign: 'left',
                      }}
                    >
                      + Add column
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </Droppable>
      </DragDropContext>
    </div>
  );
}
