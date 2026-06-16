'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useTabsContext } from '@/context/TabsContext';
import type { FileNode, ContextMenuState } from './types';

interface FileItemProps {
  node: FileNode;
  depth: number;
  activeId: string;
  canWrite: boolean;
  setMoving: (id: string | null) => void;
  onMoved: (oldId: string, newId: string) => void;
  onDeleted: (id: string) => void;
  dragging: string | null;
  setDragging: (id: string | null) => void;
  setContextMenu: (menu: ContextMenuState | null) => void;
  onDropOnFolder?: (targetFolder: string, noteId: string) => void;
}

export default function FileItem({
  node, depth, activeId, canWrite, setMoving,
  onMoved, onDeleted, dragging, setDragging, setContextMenu, onDropOnFolder,
}: FileItemProps) {
  const [renaming, setRenaming] = useState(false);
  const [renameName, setRenameName] = useState('');
  const [renameLoading, setRenameLoading] = useState(false);
  const [renameError, setRenameError] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);
  const cancelRenameRef = useRef(false);
  const justOpenedRename = useRef(false);
  const [hovered, setHovered] = useState(false);
  const [isDragTarget, setIsDragTarget] = useState(false);
  const router = useRouter();
  const tabsCtx = useTabsContext();

  const isActive = node.id === activeId;
  const isDragging = dragging === node.id;

  useEffect(() => {
    if (renaming) requestAnimationFrame(() => renameInputRef.current?.select());
  }, [renaming]);

  function startRename() {
    setRenameName(node.name);
    setRenaming(true);
    setRenameError('');
    justOpenedRename.current = true;
    setTimeout(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }, 50);
  }

  async function handleRename() {
    if (renameLoading) return;
    const trimmed = renameName.trim();
    if (!trimmed || trimmed === node.name) { setRenaming(false); return; }
    setRenameLoading(true);
    setRenameError('');
    const res = await fetch(`/api/notes/${encodeURIComponent(node.id)}/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: trimmed }),
    });
    const data = await res.json();
    setRenameLoading(false);
    if (res.ok) { setRenaming(false); onMoved(node.id, data.id); }
    else setRenameError(data.error || 'Rename failed');
  }

  async function handleDelete() {
    if (!confirm('Delete this note? This cannot be undone.')) return;
    const res = await fetch(`/api/notes/${encodeURIComponent(node.id)}/delete`, { method: 'DELETE' });
    if (res.ok) onDeleted(node.id);
    else alert('Failed to delete note.');
  }

  function navigate() {
    tabsCtx?.openTab(node.id, node.name);
    router.push(`/notes/${encodeURIComponent(node.id)}`);
  }

  return (
    <div>
      <div
        tabIndex={0}
        draggable={canWrite && !renaming}
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', node.id);
          setDragging(node.id);
        }}
        onDragEnd={() => { setDragging(null); setIsDragTarget(false); }}
        onDragOver={(e) => {
          if (!dragging || dragging === node.id) return;
          e.preventDefault();
          e.stopPropagation();
          setIsDragTarget(true);
        }}
        onDragLeave={() => setIsDragTarget(false)}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsDragTarget(false);
          const draggedId = e.dataTransfer.getData('text/plain');
          if (draggedId && draggedId !== node.id && onDropOnFolder) {
            const targetFolder = node.path.split('/').slice(0, -1).join('/');
            onDropOnFolder(targetFolder, draggedId);
          }
        }}
        className="flex items-center py-1 rounded text-sm"
        style={{
          paddingLeft: `${Math.max(0, depth) * 14 + 8}px`,
          paddingRight: '4px',
          background: isDragTarget ? 'rgba(127,119,221,0.18)' : isActive ? 'rgba(255,255,255,0.1)' : hovered ? 'rgba(255,255,255,0.04)' : 'transparent',
          outline: isDragTarget ? '1px solid var(--accent)' : 'none',
          borderRadius: isDragTarget ? '4px' : undefined,
          opacity: isDragging ? 0.4 : 1,
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onDoubleClick={() => { if (canWrite && !renaming) startRename(); }}
        onKeyDown={(e) => {
          if (e.key === 'F2' && canWrite && !renaming) { e.preventDefault(); startRename(); }
        }}
        onContextMenu={(e) => {
          if (!canWrite) return;
          e.preventDefault();
          e.stopPropagation();
          setContextMenu({
            x: e.clientX, y: e.clientY,
            type: 'file', id: node.id, name: node.name, path: node.path,
            onRename: startRename,
            onDelete: handleDelete,
            onMove: () => setMoving(node.id),
          });
        }}
      >
        {renaming ? (
          <>
            <input
              ref={renameInputRef}
              value={renameName}
              onChange={(e) => { setRenameName(e.target.value); setRenameError(''); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.stopPropagation(); handleRename(); }
                if (e.key === 'Escape') { cancelRenameRef.current = true; setRenaming(false); }
                e.stopPropagation();
              }}
              onBlur={() => {
                if (justOpenedRename.current) {
                  justOpenedRename.current = false;
                  renameInputRef.current?.focus();
                  return;
                }
                if (!cancelRenameRef.current) handleRename();
                cancelRenameRef.current = false;
              }}
              onClick={(e) => e.stopPropagation()}
              disabled={renameLoading}
              className="flex-1 min-w-0 px-1 py-0 rounded text-sm outline-none border"
              style={{ background: 'var(--bg-base)', borderColor: 'var(--accent)', color: 'var(--text-primary)' }}
            />
            <div className="flex items-center gap-0.5 flex-shrink-0 ml-1">
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={handleRename}
                disabled={renameLoading}
                title="Save"
                className="w-5 h-5 rounded flex items-center justify-center text-xs"
                style={{ color: '#fff', background: 'var(--accent)' }}
              >{renameLoading ? '…' : '✓'}</button>
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { cancelRenameRef.current = true; setRenaming(false); }}
                title="Cancel"
                className="w-5 h-5 rounded flex items-center justify-center text-xs"
                style={{ color: 'var(--text-secondary)', background: 'var(--bg-elevated)' }}
              >✗</button>
            </div>
          </>
        ) : (
          <div
            onClick={navigate}
            className="flex items-center flex-1 truncate min-w-0 cursor-pointer"
            style={{ color: isActive ? '#fff' : 'rgba(255,255,255,0.72)', userSelect: 'none' }}
          >
            <span className="truncate">{node.name}</span>
          </div>
        )}
      </div>
      {renameError && (
        <p className="text-xs pb-0.5" style={{ paddingLeft: `${depth * 14 + 28}px`, color: '#e55' }}>
          {renameError}
        </p>
      )}
    </div>
  );
}
