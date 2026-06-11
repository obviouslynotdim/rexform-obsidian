'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface NoteEntry { id: string; path: string }
interface FileNode { type: 'file'; name: string; id: string; path: string }
interface FolderNode { type: 'folder'; name: string; path: string; children: TreeNode[] }
type TreeNode = FileNode | FolderNode

interface VaultOption { name: string; label: string; role?: string }
interface VaultsData { vaults: VaultOption[]; activeVault: string }

interface ContextMenuState {
  x: number;
  y: number;
  type: 'file' | 'folder' | 'root';
  id: string;
  name: string;
  path: string;
  onRename?: () => void;
  onDelete?: () => void;
  onMove?: () => void;
  onNewNote?: () => void;
  onNewFolder?: () => void;
}

interface Props { currentId?: string }

function buildTree(notes: NoteEntry[]): TreeNode[] {
  const root: FolderNode = { type: 'folder', name: '', path: '', children: [] };
  for (const note of notes) {
    const parts = note.path.split('/');
    let cur = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const name = parts[i];
      const path = parts.slice(0, i + 1).join('/');
      let folder = cur.children.find((c): c is FolderNode => c.type === 'folder' && c.name === name);
      if (!folder) {
        folder = { type: 'folder', name, path, children: [] };
        cur.children.push(folder);
      }
      cur = folder;
    }
    const filename = parts[parts.length - 1];
    cur.children.push({ type: 'file', name: filename.replace(/\.md$/i, ''), id: note.id, path: note.path });
  }
  function sort(node: FolderNode) {
    node.children.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });
    });
    node.children.filter((c): c is FolderNode => c.type === 'folder').forEach(sort);
  }
  sort(root);
  return root.children;
}

function sortNodes(nodes: TreeNode[]): TreeNode[] {
  return [...nodes].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });
  });
}

function getAncestorFolders(notePath: string): string[] {
  const parts = notePath.split('/');
  const folders: string[] = [];
  for (let i = 1; i < parts.length; i++) {
    folders.push(parts.slice(0, i).join('/'));
  }
  return folders;
}

interface CreatingState { folder: string; type: 'note' | 'folder' }

interface InlineInputProps {
  folder: string;
  type: 'note' | 'folder';
  depth: number;
  onCreated: (expandFolder?: string) => void;
  onCancel: () => void;
}

function InlineInput({ folder, type, depth, onCreated, onCancel }: InlineInputProps) {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => { inputRef.current?.focus(); }, []);

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed) { onCancel(); return; }
    setLoading(true);
    setError('');

    let targetFolder = folder;
    let title = trimmed;

    if (type === 'folder') {
      targetFolder = folder ? `${folder}/${trimmed}` : trimmed;
      title = 'Untitled';
    }

    const res = await fetch('/api/notes/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, folder: targetFolder }),
    });
    const data = await res.json();
    setLoading(false);
    if (res.ok) {
      onCreated(targetFolder || undefined);
      router.push(`/notes/${encodeURIComponent(data.id)}`);
      onCancel();
    } else {
      setError(data.error || 'Failed');
    }
  }

  return (
    <div style={{ paddingLeft: `${depth * 14 + 22}px`, paddingRight: '8px' }} className="py-0.5">
      <input
        ref={inputRef}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
          if (e.key === 'Escape') onCancel();
        }}
        placeholder={type === 'folder' ? 'Folder name…' : 'Note name…'}
        disabled={loading}
        className="w-full px-2 py-0.5 rounded text-xs outline-none border"
        style={{ background: 'var(--bg-base)', borderColor: 'var(--accent)', color: 'var(--text-primary)' }}
      />
      {error && <p className="text-xs mt-0.5" style={{ color: 'var(--error, #e55)' }}>{error}</p>}
    </div>
  );
}

interface MoveInputProps {
  node: FileNode;
  depth: number;
  onMoved: (newId: string) => void;
  onCancel: () => void;
}

function MoveInput({ node, depth, onMoved, onCancel }: MoveInputProps) {
  const currentFolder = node.path.split('/').slice(0, -1).join('/');
  const [folder, setFolder] = useState(currentFolder);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); inputRef.current?.select(); }, []);

  async function submit() {
    setLoading(true);
    setError('');
    const res = await fetch(`/api/notes/${encodeURIComponent(node.id)}/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folder }),
    });
    const data = await res.json();
    setLoading(false);
    if (res.ok) onMoved(data.id);
    else setError(data.error || 'Move failed');
  }

  return (
    <div style={{ paddingLeft: `${depth * 14 + 8}px`, paddingRight: '8px' }} className="py-0.5">
      <p className="text-xs mb-0.5" style={{ color: 'var(--text-muted)' }}>Move to folder:</p>
      <input
        ref={inputRef}
        value={folder}
        onChange={(e) => { setFolder(e.target.value); setError(''); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
          if (e.key === 'Escape') onCancel();
        }}
        placeholder="folder/subfolder (empty = root)"
        disabled={loading}
        className="w-full px-2 py-0.5 rounded text-xs outline-none border"
        style={{ background: 'var(--bg-base)', borderColor: 'var(--accent)', color: 'var(--text-primary)' }}
      />
      {error && <p className="text-xs mt-0.5" style={{ color: '#e55' }}>{error}</p>}
    </div>
  );
}

interface FileItemProps {
  node: FileNode;
  depth: number;
  activeId: string;
  canWrite: boolean;
  moving: string | null;
  setMoving: (id: string | null) => void;
  onMoved: (oldId: string, newId: string) => void;
  onDeleted: (id: string) => void;
  dragging: string | null;
  setDragging: (id: string | null) => void;
  setContextMenu: (menu: ContextMenuState | null) => void;
}

function FileItem({ node, depth, activeId, canWrite, moving, setMoving, onMoved, onDeleted, dragging, setDragging, setContextMenu }: FileItemProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameName, setRenameName] = useState('');
  const [renameLoading, setRenameLoading] = useState(false);
  const [renameError, setRenameError] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);
  const cancelRenameRef = useRef(false);
  const justOpenedRename = useRef(false);
  const [hovered, setHovered] = useState(false);
  const isActive = node.id === activeId;
  const isMoving = moving === node.id;
  const isDragging = dragging === node.id;

  useEffect(() => { if (renaming) requestAnimationFrame(() => renameInputRef.current?.select()); }, [renaming]);

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
    if (!trimmed) { setRenaming(false); return; }
    if (trimmed === node.name) { setRenaming(false); return; }
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
    setDeleting(true);
    const res = await fetch(`/api/notes/${encodeURIComponent(node.id)}`, { method: 'DELETE' });
    setDeleting(false);
    if (res.ok) onDeleted(node.id);
    else setConfirmDelete(false);
  }

  return (
    <div
      draggable={canWrite && !renaming}
      onDragStart={(e) => {
        console.log('[drag] started:', node.id);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', node.id);
        setDragging(node.id);
      }}
      onDragEnd={() => setDragging(null)}
    >
      <div
        tabIndex={0}
        className="flex items-center py-1 rounded text-sm"
        style={{
          paddingLeft: `${depth * 14 + 8}px`,
          paddingRight: '4px',
          background: isActive ? 'rgba(255,255,255,0.1)' : hovered ? 'rgba(255,255,255,0.04)' : 'transparent',
          opacity: isDragging ? 0.4 : 1,
          outline: 'none',
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onDoubleClick={() => { if (canWrite && !renaming) startRename(); }}
        onKeyDown={(e) => { if (e.key === 'F2' && canWrite && !renaming) { e.preventDefault(); startRename(); } }}
        onContextMenu={(e) => {
          if (!canWrite) return;
          e.preventDefault();
          e.stopPropagation();
          setContextMenu({
            x: e.clientX, y: e.clientY,
            type: 'file', id: node.id, name: node.name, path: node.path,
            onRename: startRename,
            onDelete: () => setConfirmDelete(true),
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
                className="w-5 h-5 rounded flex items-center justify-center text-xs hover:opacity-100"
                style={{ color: '#fff', background: 'var(--accent)' }}
              >{renameLoading ? '…' : '✓'}</button>
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { cancelRenameRef.current = true; setRenaming(false); }}
                title="Cancel"
                className="w-5 h-5 rounded flex items-center justify-center text-xs hover:opacity-100"
                style={{ color: 'var(--text-secondary)', background: 'var(--bg-elevated)' }}
              >✗</button>
            </div>
          </>
        ) : (
          <>
            <Link
              href={`/notes/${encodeURIComponent(node.id)}`}
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', node.id);
                setDragging(node.id);
              }}
              className="flex items-center flex-1 truncate min-w-0"
              style={{ color: isActive ? '#fff' : 'rgba(255,255,255,0.72)' }}
            >
              <span className="truncate">{node.name}</span>
            </Link>
            {confirmDelete && (
              <div className="flex items-center gap-0.5 flex-shrink-0 ml-1" onClick={(e) => e.preventDefault()}>
                <span className="text-xs mr-0.5" style={{ color: '#e55' }}>delete?</span>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="w-5 h-5 rounded flex items-center justify-center text-xs hover:opacity-100"
                  style={{ color: '#fff', background: '#c0392b' }}
                >{deleting ? '…' : '✓'}</button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="w-5 h-5 rounded flex items-center justify-center text-xs hover:opacity-100"
                  style={{ color: 'var(--text-secondary)', background: 'var(--bg-elevated)' }}
                >✗</button>
              </div>
            )}
          </>
        )}
      </div>
      {renameError && (
        <p className="text-xs pb-0.5" style={{ paddingLeft: `${depth * 14 + 28}px`, color: '#e55' }}>{renameError}</p>
      )}
      {isMoving && (
        <MoveInput
          node={node}
          depth={depth}
          onMoved={(newId) => { onMoved(node.id, newId); setMoving(null); }}
          onCancel={() => setMoving(null)}
        />
      )}
    </div>
  );
}

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
}

function FolderItem({ node, depth, activeId, expanded, toggleExpand, creating, setCreating, canWrite, onCreated, moving, setMoving, onMoved, onDeleted, onFolderRenamed, onFolderDeleted, dragging, setDragging, onDropOnFolder, setContextMenu }: FolderItemProps) {
  const [renaming, setRenaming] = useState(false);
  const [renameName, setRenameName] = useState('');
  const [renameLoading, setRenameLoading] = useState(false);
  const [renameError, setRenameError] = useState('');
  const [confirmDeleteFolder, setConfirmDeleteFolder] = useState(false);
  const [deletingFolder, setDeletingFolder] = useState(false);
  const [dragCounter, setDragCounter] = useState(0);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const isOpen = expanded.has(node.path);
  const isCreatingHere = creating?.folder === node.path;
  const isDragOver = dragCounter > 0 && !!dragging;

  useEffect(() => { if (renaming) requestAnimationFrame(() => renameInputRef.current?.select()); }, [renaming]);

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

  return (
    <div
      style={{
        outline: isDragOver ? '1px solid var(--accent)' : 'none',
        borderRadius: '4px',
        background: isDragOver ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'transparent',
      }}
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
      onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setDragCounter((c) => c + 1); }}
      onDragLeave={(e) => { e.stopPropagation(); setDragCounter((c) => Math.max(0, c - 1)); }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragCounter(0);
        const noteId = e.dataTransfer.getData('text/plain');
        onDropOnFolder(node.path, noteId);
      }}
    >
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
              className="w-5 h-5 rounded flex items-center justify-center text-xs hover:opacity-100"
              style={{ color: '#fff', background: '#c0392b' }}
            >{deletingFolder ? '…' : '✓'}</button>
            <button
              onClick={() => setConfirmDeleteFolder(false)}
              className="w-5 h-5 rounded flex items-center justify-center text-xs hover:opacity-100"
              style={{ color: 'var(--text-secondary)', background: 'var(--bg-elevated)' }}
            >✗</button>
          </div>
        ) : renaming ? (
          <div className="flex items-center gap-0.5 flex-shrink-0 ml-1" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={handleRename}
              disabled={renameLoading}
              title="Save"
              className="w-5 h-5 rounded flex items-center justify-center text-xs hover:opacity-100"
              style={{ color: '#fff', background: 'var(--accent)' }}
            >{renameLoading ? '…' : '✓'}</button>
            <button
              onClick={() => setRenaming(false)}
              title="Cancel"
              className="w-5 h-5 rounded flex items-center justify-center text-xs hover:opacity-100"
              style={{ color: 'var(--text-secondary)', background: 'var(--bg-elevated)' }}
            >✗</button>
          </div>
        ) : null}
      </div>
      {renameError && (
        <p className="text-xs px-3 pb-0.5" style={{ paddingLeft: `${depth * 14 + 30}px`, color: '#e55' }}>{renameError}</p>
      )}

      {isOpen && (
        <div style={{ position: 'relative' }}>
          <div style={{
            position: 'absolute',
            left: `${depth * 14 + 14}px`,
            top: 0,
            bottom: 0,
            width: '1px',
            background: 'rgba(255,255,255,0.07)',
            pointerEvents: 'none',
          }} />
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
              <FolderItem
                key={child.path}
                node={child}
                depth={depth + 1}
                activeId={activeId}
                expanded={expanded}
                toggleExpand={toggleExpand}
                creating={creating}
                setCreating={setCreating}
                canWrite={canWrite}
                onCreated={onCreated}
                moving={moving}
                setMoving={setMoving}
                onMoved={onMoved}
                onDeleted={onDeleted}
                onFolderRenamed={onFolderRenamed}
                onFolderDeleted={onFolderDeleted}
                dragging={dragging}
                setDragging={setDragging}
                onDropOnFolder={onDropOnFolder}
                setContextMenu={setContextMenu}
              />
            ) : (
              <FileItem
                key={child.id}
                node={child}
                depth={depth + 1}
                activeId={activeId}
                canWrite={canWrite}
                moving={moving}
                setMoving={setMoving}
                onMoved={onMoved}
                onDeleted={onDeleted}
                dragging={dragging}
                setDragging={setDragging}
                setContextMenu={setContextMenu}
              />
            )
          )}
        </div>
      )}
    </div>
  );
}

const menuItemStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  textAlign: 'left',
  padding: '6px 16px',
  fontSize: '13px',
  color: 'rgba(255,255,255,0.8)',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
};

export default function NotesSidebar({ currentId }: Props) {
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState<CreatingState | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const router = useRouter();

  const { data, mutate, isLoading } = useSWR('/api/notes/tree', fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 0,
  });

  const { data: vaultsData } = useSWR<VaultsData>('/api/vaults', fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  });
  const activeRole = vaultsData?.vaults.find((v) => v.name === vaultsData.activeVault)?.role;
  const canWrite = activeRole !== 'viewer';

  const notes: NoteEntry[] = data?.notes || [];
  const activeId = currentId ?? decodeURIComponent(pathname.replace('/notes/', ''));

  useEffect(() => { setMoving(null); }, [pathname]);

  useEffect(() => {
    if (!activeId || notes.length === 0) return;
    const active = notes.find((n) => n.id === activeId);
    if (!active) return;
    const ancestors = getAncestorFolders(active.path);
    if (ancestors.length > 0) {
      setExpanded((prev) => new Set(Array.from(prev).concat(ancestors)));
    }
  }, [activeId, notes]);

  useEffect(() => {
    if (!contextMenu) return;
    function handleClick(e: MouseEvent) {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setContextMenu(null);
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [contextMenu]);

  const toggleExpand = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  }, []);

  const handleMoved = useCallback((oldId: string, newId: string) => {
    mutate();
    if (activeId === oldId) router.push(`/notes/${encodeURIComponent(newId)}`);
  }, [activeId, mutate, router]);

  const handleDeleted = useCallback((id: string) => {
    mutate();
    if (activeId === id) router.push('/notes');
  }, [activeId, mutate, router]);

  const handleFolderDeleted = useCallback((path: string) => {
    mutate();
    if (activeId.startsWith(path + '/')) router.push('/notes');
  }, [activeId, mutate, router]);

  const handleFolderRenamed = useCallback((oldPath: string, newName: string) => {
    mutate();
    if (activeId.startsWith(oldPath + '/')) {
      const parentSegments = oldPath.split('/').slice(0, -1);
      const newPath = [...parentSegments, newName].join('/');
      const newId = newPath + activeId.slice(oldPath.length);
      router.push(`/notes/${encodeURIComponent(newId)}`);
    }
  }, [activeId, mutate, router]);

  const handleDropOnFolder = useCallback(async (targetFolder: string, noteId: string) => {
    if (!noteId) return;
    const currentFolder = notes.find((n) => n.id === noteId)?.path.split('/').slice(0, -1).join('/') ?? '';
    console.log('[drop]', { noteId, currentFolder, targetFolder });
    if (currentFolder === targetFolder) { setDragging(null); return; }
    try {
      const res = await fetch(`/api/notes/${encodeURIComponent(noteId)}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder: targetFolder }),
      });
      if (res.ok) {
        const data = await res.json();
        if (targetFolder) {
          setExpanded((prev) => new Set([
            ...Array.from(prev),
            ...targetFolder.split('/').map((_, i, a) => a.slice(0, i + 1).join('/')),
          ]));
        }
        handleMoved(noteId, data.id);
      }
    } finally {
      setDragging(null);
    }
  }, [notes, handleMoved]);

  const rawTree = buildTree(notes);
  const rootFolders = rawTree.filter((n): n is FolderNode => n.type === 'folder');
  const rootFiles = rawTree.filter((n): n is FileNode => n.type === 'file');
  const singleRootFolder = rootFolders.length === 1 ? rootFolders[0] : null;
  const effectiveRoot = singleRootFolder ? singleRootFolder.path : '';
  const tree: TreeNode[] = sortNodes(singleRootFolder ? [...rootFiles, ...singleRootFolder.children] : rawTree);

  const filtered = search.trim()
    ? notes.filter((n) => n.path.toLowerCase().includes(search.toLowerCase()))
    : [];

  function SkeletonItem({ width }: { width: string }) {
    return (
      <div className="px-3 py-2">
        <div className="h-3 rounded animate-pulse" style={{ background: 'var(--border)', width }} />
      </div>
    );
  }

  return (
    <div
      className="w-72 flex-shrink-0 border-r flex flex-col overflow-hidden"
      style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
    >
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
            Files
          </h2>
          {canWrite && (
            <div className="flex items-center gap-1">
              <button
                title="New folder at root"
                onClick={() => setCreating({ folder: '', type: 'folder' })}
                className="px-2 py-1 rounded text-xs font-medium transition-opacity hover:opacity-80"
                style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
              >⊞</button>
              <button
                title="New note at root"
                onClick={() => setCreating({ folder: '', type: 'note' })}
                className="px-2 py-1 rounded text-xs font-medium transition-opacity hover:opacity-80"
                style={{ background: 'var(--accent)', color: '#fff' }}
              >+ New</button>
            </div>
          )}
        </div>
        <input
          type="text"
          placeholder="Search files…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-3 py-1.5 rounded-lg text-xs outline-none border"
          style={{ background: 'var(--bg-base)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
        />
      </div>

      {/* Body */}
      <div
        className="flex-1 overflow-y-auto py-1"
        onContextMenu={(e) => {
          if (!canWrite) return;
          e.preventDefault();
          setContextMenu({
            x: e.clientX, y: e.clientY,
            type: 'root', id: '', name: '', path: '',
            onNewNote: () => setCreating({ folder: '', type: 'note' }),
            onNewFolder: () => setCreating({ folder: '', type: 'folder' }),
          });
        }}
      >
        {isLoading ? (
          <>
            <SkeletonItem width="60%" />
            <SkeletonItem width="45%" />
            <SkeletonItem width="75%" />
            <SkeletonItem width="55%" />
          </>
        ) : search.trim() ? (
          filtered.length === 0 ? (
            <p className="px-4 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>No matches</p>
          ) : (
            filtered.map((note) => {
              const name = note.path.split('/').pop()?.replace(/\.md$/i, '') || note.id;
              const folder = note.path.split('/').slice(0, -1).join('/');
              const isActive = note.id === activeId;
              return (
                <Link
                  key={note.id}
                  href={`/notes/${encodeURIComponent(note.id)}`}
                  className="block px-4 py-2 border-b text-sm"
                  style={{
                    borderColor: 'var(--border)',
                    background: isActive ? 'var(--bg-base)' : 'transparent',
                    borderLeft: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                  }}
                >
                  <p className="truncate font-medium" style={{ color: isActive ? 'var(--accent-hover)' : 'var(--text-primary)' }}>
                    {name}
                  </p>
                  {folder && (
                    <p className="text-xs truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      📁 {folder}
                    </p>
                  )}
                </Link>
              );
            })
          )
        ) : notes.length === 0 ? (
          <p className="px-4 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>No notes yet</p>
        ) : (
          <>
            {creating?.folder === '' && (
              <InlineInput
                folder={effectiveRoot}
                type={creating.type}
                depth={0}
                onCreated={(expandFolder) => { mutate(); if (expandFolder) setExpanded((prev) => new Set(Array.from(prev).concat(expandFolder.split('/').map((_, i, a) => a.slice(0, i + 1).join('/'))))); }}
                onCancel={() => setCreating(null)}
              />
            )}
            {dragging && (
              <div
                className="mx-2 mb-1 py-1 rounded text-xs text-center border border-dashed"
                style={{ color: 'var(--text-muted)', borderColor: 'var(--accent)', opacity: 0.7 }}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const noteId = e.dataTransfer.getData('text/plain');
                  handleDropOnFolder(effectiveRoot, noteId);
                }}
              >
                Drop here → root
              </div>
            )}
            {tree.map((node) =>
              node.type === 'folder' ? (
                <FolderItem
                  key={node.path}
                  node={node}
                  depth={0}
                  activeId={activeId}
                  expanded={expanded}
                  toggleExpand={toggleExpand}
                  creating={creating}
                  setCreating={setCreating}
                  canWrite={canWrite}
                  onCreated={(expandFolder) => { mutate(); if (expandFolder) setExpanded((prev) => new Set(Array.from(prev).concat(expandFolder.split('/').map((_, i, a) => a.slice(0, i + 1).join('/'))))); }}
                  moving={moving}
                  setMoving={setMoving}
                  onMoved={handleMoved}
                  onDeleted={handleDeleted}
                  onFolderRenamed={handleFolderRenamed}
                  onFolderDeleted={handleFolderDeleted}
                  dragging={dragging}
                  setDragging={setDragging}
                  onDropOnFolder={handleDropOnFolder}
                  setContextMenu={setContextMenu}
                />
              ) : (
                <FileItem
                  key={node.id}
                  node={node}
                  depth={0}
                  activeId={activeId}
                  canWrite={canWrite}
                  moving={moving}
                  setMoving={setMoving}
                  onMoved={handleMoved}
                  onDeleted={handleDeleted}
                  dragging={dragging}
                  setDragging={setDragging}
                  setContextMenu={setContextMenu}
                />
              )
            )}
          </>
        )}
      </div>

      {/* Footer */}
      {!isLoading && notes.length > 0 && !search && (
        <div className="px-4 py-2 border-t flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {notes.length} note{notes.length !== 1 ? 's' : ''}
          </p>
        </div>
      )}

      {/* Context menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          style={{
            position: 'fixed',
            left: contextMenu.x,
            top: contextMenu.y,
            background: '#1e2030',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '8px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            zIndex: 9999,
            minWidth: 160,
            padding: '4px 0',
            overflow: 'hidden',
          }}
        >
          {contextMenu.onNewNote && (
            <button
              style={menuItemStyle}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              onClick={() => { contextMenu.onNewNote!(); setContextMenu(null); }}
            >
              New Note here
            </button>
          )}
          {contextMenu.onNewFolder && (
            <button
              style={menuItemStyle}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              onClick={() => { contextMenu.onNewFolder!(); setContextMenu(null); }}
            >
              New Folder here
            </button>
          )}
          {(contextMenu.onNewNote || contextMenu.onNewFolder) && (contextMenu.onRename || contextMenu.onDelete) && (
            <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '4px 0' }} />
          )}
          {contextMenu.onRename && (
            <button
              style={menuItemStyle}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              onClick={() => { contextMenu.onRename!(); setContextMenu(null); }}
            >
              Rename
            </button>
          )}
          {contextMenu.type === 'file' && contextMenu.onMove && (
            <button
              style={menuItemStyle}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              onClick={() => { contextMenu.onMove!(); setContextMenu(null); }}
            >
              Move to folder
            </button>
          )}
          {contextMenu.onDelete && (
            <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '4px 0' }} />
          )}
          {contextMenu.onDelete && (
            <button
              style={{ ...menuItemStyle, color: '#f87171' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              onClick={() => { contextMenu.onDelete!(); setContextMenu(null); }}
            >
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}
