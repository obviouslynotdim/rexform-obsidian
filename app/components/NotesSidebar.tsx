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
      return a.name.localeCompare(b.name);
    });
    node.children.filter((c): c is FolderNode => c.type === 'folder').forEach(sort);
  }
  sort(root);
  return root.children;
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
      // Pass the folder that should be expanded after tree revalidates
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
}

function FileItem({ node, depth, activeId, canWrite, moving, setMoving, onMoved, onDeleted, dragging, setDragging }: FileItemProps) {
  const [hovered, setHovered] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameName, setRenameName] = useState('');
  const [renameLoading, setRenameLoading] = useState(false);
  const [renameError, setRenameError] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);
  const cancelRenameRef = useRef(false);
  const isActive = node.id === activeId;
  const isMoving = moving === node.id;
  const isDragging = dragging === node.id;

  useEffect(() => { if (renaming) renameInputRef.current?.select(); }, [renaming]);

  function startRename() {
    setRenameName(node.name);
    setRenaming(true);
    setRenameError('');
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
    setDeleting(true);
    const res = await fetch(`/api/notes/${encodeURIComponent(node.id)}`, { method: 'DELETE' });
    setDeleting(false);
    if (res.ok) onDeleted(node.id);
    else setConfirmDelete(false);
  }

  return (
    <div
      draggable={canWrite && !renaming}
      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', node.id); setDragging(node.id); }}
      onDragEnd={() => setDragging(null)}
      onDoubleClick={() => { if (canWrite && !renaming) startRename(); }}
    >
      <div
        tabIndex={0}
        className="flex items-center py-1 rounded text-sm"
        style={{
          paddingLeft: `${depth * 14 + 8}px`,
          paddingRight: '4px',
          background: isActive ? 'var(--bg-base)' : 'transparent',
          borderLeft: isActive ? '2px solid var(--accent)' : '2px solid transparent',
          opacity: isDragging ? 0.4 : 1,
          outline: 'none',
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => { setHovered(false); if (!isMoving) setConfirmDelete(false); }}
        onKeyDown={(e) => { if (e.key === 'F2' && canWrite && !renaming) { e.preventDefault(); startRename(); } }}
      >
        {renaming ? (
          <>
            <span className="mr-1.5 opacity-40 text-xs flex-shrink-0">○</span>
            <input
              ref={renameInputRef}
              value={renameName}
              onChange={(e) => { setRenameName(e.target.value); setRenameError(''); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.stopPropagation(); handleRename(); }
                if (e.key === 'Escape') { cancelRenameRef.current = true; setRenaming(false); }
                e.stopPropagation();
              }}
              onBlur={() => { if (!cancelRenameRef.current) handleRename(); cancelRenameRef.current = false; }}
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
              draggable={false}
              className="flex items-center flex-1 truncate min-w-0"
              style={{ color: isActive ? 'var(--accent-hover)' : 'var(--text-primary)' }}
            >
              <span className="mr-1.5 opacity-40 text-xs flex-shrink-0">○</span>
              <span className="truncate">{node.name}</span>
            </Link>
            {confirmDelete ? (
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
            ) : hovered && canWrite && (
              <div className="flex items-center gap-0.5 flex-shrink-0 ml-1" onClick={(e) => e.preventDefault()}>
                <button
                  title="Rename note"
                  onClick={(e) => { e.preventDefault(); startRename(); }}
                  className="w-5 h-5 rounded flex items-center justify-center text-xs hover:opacity-100 opacity-40"
                  style={{ color: 'var(--text-secondary)', background: 'var(--bg-elevated)' }}
                >✏</button>
                <button
                  title="Move to folder"
                  onClick={() => setMoving(isMoving ? null : node.id)}
                  className="w-5 h-5 rounded flex items-center justify-center text-xs hover:opacity-100 opacity-40"
                  style={{ color: 'var(--text-secondary)', background: 'var(--bg-elevated)' }}
                >⋯</button>
                <button
                  title="Delete note"
                  onClick={() => setConfirmDelete(true)}
                  className="w-5 h-5 rounded flex items-center justify-center text-xs hover:opacity-100 opacity-40"
                  style={{ color: '#e55', background: 'var(--bg-elevated)' }}
                >×</button>
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
  onDropOnFolder: (targetFolder: string) => void;
}

function FolderItem({ node, depth, activeId, expanded, toggleExpand, creating, setCreating, canWrite, onCreated, moving, setMoving, onMoved, onDeleted, onFolderRenamed, onFolderDeleted, dragging, setDragging, onDropOnFolder }: FolderItemProps) {
  const [hovered, setHovered] = useState(false);
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

  useEffect(() => { if (renaming) renameInputRef.current?.select(); }, [renaming]);

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
    <div>
      <div
        className="flex items-center py-1 rounded cursor-pointer select-none"
        style={{
          paddingLeft: `${depth * 14 + 8}px`,
          paddingRight: '4px',
          outline: isDragOver ? '2px solid var(--accent)' : 'none',
          borderRadius: '4px',
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => { setHovered(false); if (!renaming) setConfirmDeleteFolder(false); }}
        onClick={() => { if (!renaming) toggleExpand(node.path); }}
        onDragOver={(e) => e.preventDefault()}
        onDragEnter={(e) => { e.preventDefault(); setDragCounter((c) => c + 1); }}
        onDragLeave={() => setDragCounter((c) => Math.max(0, c - 1))}
        onDrop={(e) => { e.preventDefault(); setDragCounter(0); onDropOnFolder(node.path); }}
      >
        <span className="mr-1 text-xs opacity-40 w-3 flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>
          {isOpen ? '▾' : '▸'}
        </span>
        <span className="mr-1.5 text-xs flex-shrink-0 opacity-60">📁</span>
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
        ) : hovered && canWrite && (
          <div className="flex items-center gap-0.5 flex-shrink-0 ml-1" onClick={(e) => e.stopPropagation()}>
            <button title="New note" onClick={() => openAndCreate('note')}
              className="w-5 h-5 rounded flex items-center justify-center text-xs hover:opacity-100 opacity-50"
              style={{ color: 'var(--text-secondary)', background: 'var(--bg-elevated)' }}
            >+</button>
            <button title="New folder" onClick={() => openAndCreate('folder')}
              className="w-5 h-5 rounded flex items-center justify-center text-xs hover:opacity-100 opacity-50"
              style={{ color: 'var(--text-secondary)', background: 'var(--bg-elevated)' }}
            >⊞</button>
            <button title="Rename folder"
              onClick={() => { setRenameName(node.name); setRenaming(true); if (!isOpen) toggleExpand(node.path); }}
              className="w-5 h-5 rounded flex items-center justify-center text-xs hover:opacity-100 opacity-50"
              style={{ color: 'var(--text-secondary)', background: 'var(--bg-elevated)' }}
            >✏</button>
            <button title="Delete folder" onClick={() => setConfirmDeleteFolder(true)}
              className="w-5 h-5 rounded flex items-center justify-center text-xs hover:opacity-100 opacity-50"
              style={{ color: '#e55', background: 'var(--bg-elevated)' }}
            >×</button>
          </div>
        )}
      </div>
      {renameError && (
        <p className="text-xs px-3 pb-0.5" style={{ paddingLeft: `${depth * 14 + 30}px`, color: '#e55' }}>{renameError}</p>
      )}

      {isOpen && (
        <div>
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
              />
            )
          )}
        </div>
      )}
    </div>
  );
}

export default function NotesSidebar({ currentId }: Props) {
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState<CreatingState | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
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

  // Close move input when navigating to a different note
  useEffect(() => { setMoving(null); }, [pathname]);

  // Auto-expand folders containing the active note
  useEffect(() => {
    if (!activeId || notes.length === 0) return;
    const active = notes.find((n) => n.id === activeId);
    if (!active) return;
    const ancestors = getAncestorFolders(active.path);
    if (ancestors.length > 0) {
      setExpanded((prev) => new Set(Array.from(prev).concat(ancestors)));
    }
  }, [activeId, notes]);

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

  const handleDropOnFolder = useCallback(async (targetFolder: string) => {
    if (!dragging) return;
    const noteId = dragging;
    setDragging(null);
    const currentFolder = notes.find((n) => n.id === noteId)?.path.split('/').slice(0, -1).join('/') ?? '';
    if (currentFolder === targetFolder) return;
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
  }, [dragging, notes, handleMoved]);

  const rawTree = buildTree(notes);
  // Unwrap a single root-level folder (e.g. "my-vaults") so its children appear at the top level
  const singleRootFolder = rawTree.length === 1 && rawTree[0].type === 'folder' ? rawTree[0] as FolderNode : null;
  const effectiveRoot = singleRootFolder ? singleRootFolder.path : '';
  const tree = singleRootFolder ? singleRootFolder.children : rawTree;

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
      <div className="flex-1 overflow-y-auto py-1">
        {isLoading ? (
          <>
            <SkeletonItem width="60%" />
            <SkeletonItem width="45%" />
            <SkeletonItem width="75%" />
            <SkeletonItem width="55%" />
          </>
        ) : search.trim() ? (
          /* Flat search results */
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
          /* File tree */
          <>
            {/* Root-level inline input */}
            {creating?.folder === '' && (
              <InlineInput
                folder={effectiveRoot}
                type={creating.type}
                depth={0}
                onCreated={(expandFolder) => { mutate(); if (expandFolder) setExpanded((prev) => new Set(Array.from(prev).concat(expandFolder.split('/').map((_, i, a) => a.slice(0, i + 1).join('/'))))); }}
                onCancel={() => setCreating(null)}
              />
            )}
            {/* Root drop zone — only visible while dragging */}
            {dragging && (
              <div
                className="mx-2 mb-1 py-1 rounded text-xs text-center border border-dashed"
                style={{ color: 'var(--text-muted)', borderColor: 'var(--accent)', opacity: 0.7 }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); handleDropOnFolder(effectiveRoot); }}
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
                />
              )
            )}
          </>
        )}
      </div>

      {/* Footer: note count */}
      {!isLoading && notes.length > 0 && !search && (
        <div className="px-4 py-2 border-t flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {notes.length} note{notes.length !== 1 ? 's' : ''}
          </p>
        </div>
      )}
    </div>
  );
}
