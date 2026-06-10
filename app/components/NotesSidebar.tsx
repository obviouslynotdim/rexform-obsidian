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
  onCreated: () => void;
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
      onCreated();
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

interface FileItemProps { node: FileNode; depth: number; activeId: string }

function FileItem({ node, depth, activeId }: FileItemProps) {
  const isActive = node.id === activeId;
  return (
    <Link
      href={`/notes/${encodeURIComponent(node.id)}`}
      className="flex items-center py-1 rounded text-sm truncate"
      style={{
        paddingLeft: `${depth * 14 + 8}px`,
        paddingRight: '8px',
        background: isActive ? 'var(--bg-base)' : 'transparent',
        color: isActive ? 'var(--accent-hover)' : 'var(--text-primary)',
        borderLeft: isActive ? '2px solid var(--accent)' : '2px solid transparent',
      }}
    >
      <span className="mr-1.5 opacity-40 text-xs flex-shrink-0">○</span>
      <span className="truncate">{node.name}</span>
    </Link>
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
  onCreated: () => void;
}

function FolderItem({ node, depth, activeId, expanded, toggleExpand, creating, setCreating, canWrite, onCreated }: FolderItemProps) {
  const [hovered, setHovered] = useState(false);
  const isOpen = expanded.has(node.path);
  const isCreatingHere = creating?.folder === node.path;

  function openAndCreate(type: 'note' | 'folder') {
    if (!isOpen) toggleExpand(node.path);
    setCreating({ folder: node.path, type });
  }

  return (
    <div>
      <div
        className="flex items-center py-1 rounded cursor-pointer select-none"
        style={{ paddingLeft: `${depth * 14 + 8}px`, paddingRight: '4px' }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={() => toggleExpand(node.path)}
      >
        <span className="mr-1 text-xs opacity-40 w-3 flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>
          {isOpen ? '▾' : '▸'}
        </span>
        <span className="mr-1.5 text-xs flex-shrink-0 opacity-60">📁</span>
        <span className="truncate flex-1 text-sm" style={{ color: 'var(--text-primary)' }}>
          {node.name}
        </span>
        {hovered && canWrite && (
          <div className="flex items-center gap-0.5 flex-shrink-0 ml-1" onClick={(e) => e.stopPropagation()}>
            <button
              title="New note"
              onClick={() => openAndCreate('note')}
              className="w-5 h-5 rounded flex items-center justify-center text-xs hover:opacity-100 opacity-50"
              style={{ color: 'var(--text-secondary)', background: 'var(--bg-elevated)' }}
            >+</button>
            <button
              title="New folder"
              onClick={() => openAndCreate('folder')}
              className="w-5 h-5 rounded flex items-center justify-center text-xs hover:opacity-100 opacity-50"
              style={{ color: 'var(--text-secondary)', background: 'var(--bg-elevated)' }}
            >⊞</button>
          </div>
        )}
      </div>

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
              />
            ) : (
              <FileItem key={child.id} node={child} depth={depth + 1} activeId={activeId} />
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
  const pathname = usePathname();

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

  const tree = buildTree(notes);

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
                folder=""
                type={creating.type}
                depth={0}
                onCreated={() => mutate()}
                onCancel={() => setCreating(null)}
              />
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
                  onCreated={() => mutate()}
                />
              ) : (
                <FileItem key={node.id} node={node} depth={0} activeId={activeId} />
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
