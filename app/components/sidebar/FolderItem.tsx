'use client';
import { useState, useEffect, useRef } from 'react';
import type { FolderNode, ContextMenuState, CreatingState } from './types';
import InlineInput from './InlineInput';
import FileItem from './FileItem';

interface FolderItemProps {
  node: FolderNode;
  depth: number;
  activeId: string;
  expanded: Set<string>;
  toggleExpand: (path: string) => void;
  creating: CreatingState | null;
  setCreating: (s: CreatingState | null) => void;
  canWrite: boolean;
  onCreated: (expandFolder?: string) => void;
  moving: string | null;
  setMoving: (id: string | null) => void;
  onMoved: (oldId: string, newId: string) => void;
  onDeleted: (id: string) => void;
  onFolderRenamed: (oldPath: string, newName: string) => void;
  onFolderDeleted: (path: string) => void;
  dragging: string | null;
  setDragging: (id: string | null) => void;
  onDropOnFolder: (targetFolder: string, noteId: string) => void;
  setContextMenu: (menu: ContextMenuState | null) => void;
  hideHeader?: boolean;
}

export default function FolderItem({
  node, depth, activeId, expanded, toggleExpand, creating, setCreating,
  canWrite, onCreated, moving, setMoving, onMoved, onDeleted,
  onFolderRenamed, onFolderDeleted, dragging, setDragging,
  onDropOnFolder, setContextMenu, hideHeader,
}: FolderItemProps) {
  const [renaming, setRenaming] = useState(false);
  const [renameName, setRenameName] = useState('');
  const [renameLoading, setRenameLoading] = useState(false);
  const [renameError, setRenameError] = useState('');
  const [confirmDeleteFolder, setConfirmDeleteFolder] = useState(false);
  const [deletingFolder, setDeletingFolder] = useState(false);
  const [dragCounter, setDragCounter] = useState(0);
  const renameInputRef = useRef<HTMLInputElement>(null);

  const isOpen = hideHeader ? true : expanded.has(node.path);
  const isCreatingHere = creating?.folder === node.path;
  const isDragOver = dragCounter > 0;

  useEffect(() => {
    if (renaming) requestAnimationFrame(() => renameInputRef.current?.select());
  }, [renaming]);

  function openAndCreate(type: 'note' | 'folder') {
    if (!isOpen) toggleExpand(node.path);
    setCreating({ folder: node.path, type });
  }

  async function handleRename() {
    const trimmed = renameName.trim();
    if (!trimmed || trimmed === node.name) { setRenaming(false); return; }
    setRenameLoading(true);
    setRenameError('');
    const res = await fetch('/api/notes/folder/rename', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldPath: node.path, newName: trimmed }),
    });
    const data = await res.json();
    setRenameLoading(false);
    if (res.ok) { setRenaming(false); onFolderRenamed(node.path, trimmed); }
    else setRenameError(data.error || 'Rename failed');
  }

  async function handleDeleteFolder() {
    setDeletingFolder(true);
    const res = await fetch(`/api/notes/folder?path=${encodeURIComponent(node.path)}`, { method: 'DELETE' });
    setDeletingFolder(false);
    if (res.ok) onFolderDeleted(node.path);
    else setConfirmDeleteFolder(false);
  }

  const sharedChildProps = {
    activeId, canWrite, moving, setMoving, onMoved, onDeleted,
    dragging, setDragging, setContextMenu,
  };

  const sharedFolderProps = {
    ...sharedChildProps,
    expanded, toggleExpand, creating, setCreating,
    onCreated, onFolderRenamed, onFolderDeleted, onDropOnFolder,
  };

  return (
    <div
      style={{
        outline: isDragOver ? '1px solid var(--accent)' : 'none',
        borderRadius: '4px',
        background: isDragOver ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'transparent',
      }}
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
      onDragEnter={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!e.dataTransfer.types.includes('text/plain')) return;
        setDragCounter((c) => c + 1);
      }}
      onDragLeave={(e) => { e.stopPropagation(); setDragCounter((c) => Math.max(0, c - 1)); }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragCounter(0);
        const noteId = e.dataTransfer.getData('text/plain');
        onDropOnFolder(node.path, noteId);
      }}
    >
      {!hideHeader && (
        <div
          className="flex items-center py-1 rounded cursor-pointer select-none"
          style={{ paddingLeft: `${depth * 14 + 8}px`, paddingRight: '4px' }}
          onClick={() => { if (!renaming) toggleExpand(node.path); }}
          onContextMenu={(e) => {
            if (!canWrite) return;
            e.preventDefault();
            e.stopPropagation();
            setContextMenu({
              x: e.clientX, y: e.clientY,
              type: 'folder', id: node.path, name: node.name, path: node.path,
              onRename: () => { setRenameName(node.name); setRenaming(true); if (!isOpen) toggleExpand(node.path); },
              onDelete: () => setConfirmDeleteFolder(true),
              onNewNote: () => openAndCreate('note'),
              onNewFolder: () => openAndCreate('folder'),
            });
          }}
        >
          <svg
            className="mr-1 flex-shrink-0"
            width="12" height="12" viewBox="0 0 12 12" fill="none"
            style={{
              color: 'rgba(255,255,255,0.55)',
              transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform 0.15s ease',
            }}
          >
            <path d="M3.5 2.5 L7.5 6 L3.5 9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>

          {renaming ? (
            <input
              ref={renameInputRef}
              value={renameName}
              onChange={(e) => { setRenameName(e.target.value); setRenameError(''); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRename();
                if (e.key === 'Escape') setRenaming(false);
                e.stopPropagation();
              }}
              onClick={(e) => e.stopPropagation()}
              disabled={renameLoading}
              className="flex-1 min-w-0 px-1 py-0 rounded text-sm outline-none border"
              style={{ background: 'var(--bg-base)', borderColor: 'var(--accent)', color: 'var(--text-primary)' }}
            />
          ) : (
            <span className="truncate flex-1 text-sm" style={{ color: 'var(--text-primary)' }}>
              {node.name}
            </span>
          )}

          {confirmDeleteFolder ? (
            <div className="flex items-center gap-0.5 flex-shrink-0 ml-1" onClick={(e) => e.stopPropagation()}>
              <span className="text-xs mr-0.5" style={{ color: '#e55' }}>delete all?</span>
              <button
                onClick={handleDeleteFolder}
                disabled={deletingFolder}
                className="w-5 h-5 rounded flex items-center justify-center text-xs"
                style={{ color: '#fff', background: '#c0392b' }}
              >{deletingFolder ? '…' : '✓'}</button>
              <button
                onClick={() => setConfirmDeleteFolder(false)}
                className="w-5 h-5 rounded flex items-center justify-center text-xs"
                style={{ color: 'var(--text-secondary)', background: 'var(--bg-elevated)' }}
              >✗</button>
            </div>
          ) : renaming ? (
            <div className="flex items-center gap-0.5 flex-shrink-0 ml-1" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={handleRename}
                disabled={renameLoading}
                title="Save"
                className="w-5 h-5 rounded flex items-center justify-center text-xs"
                style={{ color: '#fff', background: 'var(--accent)' }}
              >{renameLoading ? '…' : '✓'}</button>
              <button
                onClick={() => setRenaming(false)}
                title="Cancel"
                className="w-5 h-5 rounded flex items-center justify-center text-xs"
                style={{ color: 'var(--text-secondary)', background: 'var(--bg-elevated)' }}
              >✗</button>
            </div>
          ) : null}
        </div>
      )}

      {!hideHeader && renameError && (
        <p className="text-xs px-3 pb-0.5" style={{ paddingLeft: `${depth * 14 + 30}px`, color: '#e55' }}>
          {renameError}
        </p>
      )}

      {isOpen && (
        <div style={{ position: 'relative' }}>
          {!hideHeader && (
            <div style={{
              position: 'absolute',
              left: `${depth * 14 + 14}px`,
              top: 0, bottom: 0, width: '1px',
              background: 'rgba(255,255,255,0.07)',
              pointerEvents: 'none',
            }} />
          )}
          {isCreatingHere && (
            <InlineInput
              folder={node.path}
              type={creating!.type}
              depth={depth + 1}
              onCreated={onCreated}
              onCancel={() => setCreating(null)}
            />
          )}
          {node.children.map((child) =>
            child.type === 'folder' ? (
              <FolderItem key={child.path} node={child} depth={depth + 1} {...sharedFolderProps} />
            ) : (
              <FileItem key={child.id} node={child} depth={depth + 1} {...sharedChildProps} />
            )
          )}
        </div>
      )}
    </div>
  );
}
