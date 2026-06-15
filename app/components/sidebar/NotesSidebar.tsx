'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import useSWR from 'swr';
import { buildTree, sortNodes, getAncestorFolders } from './tree';
import FolderItem from './FolderItem';
import FileItem from './FileItem';
import InlineInput from './InlineInput';
import ContextMenu from './ContextMenu';
import FolderPicker from './FolderPicker';
import VaultBar from './VaultBar';
import type { NoteEntry, FileNode, FolderNode, TreeNode, VaultsData, ContextMenuState, CreatingState } from './types';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface Props { currentId?: string }

function SkeletonItem({ width }: { width: string }) {
  return (
    <div className="px-3 py-2">
      <div className="h-3 rounded animate-pulse" style={{ background: 'var(--border)', width }} />
    </div>
  );
}

export default function NotesSidebar({ currentId }: Props) {
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState<CreatingState | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
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

  const notes: NoteEntry[] = data?.notes || [];
  const activeId = currentId ?? decodeURIComponent(pathname.replace('/notes/', ''));
  const activeRole = vaultsData?.vaults.find((v) => v.name === vaultsData.activeVault)?.role;
  const canWrite = activeRole !== 'viewer';

  // Expand ancestors of the active note
  useEffect(() => {
    if (!activeId || notes.length === 0) return;
    const active = notes.find((n) => n.id === activeId);
    if (!active) return;
    const ancestors = getAncestorFolders(active.path);
    if (ancestors.length > 0) {
      setExpanded((prev) => new Set([...Array.from(prev), ...ancestors]));
    }
  }, [activeId, notes]);

  // Clear move state on navigation
  useEffect(() => { setMoving(null); }, [pathname]);

  const toggleExpand = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  }, []);

  const expandFolders = useCallback((folderPath: string) => {
    setExpanded((prev) => new Set([
      ...Array.from(prev),
      ...folderPath.split('/').map((_, i, a) => a.slice(0, i + 1).join('/')),
    ]));
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
      const newPath = [...oldPath.split('/').slice(0, -1), newName].join('/');
      router.push(`/notes/${encodeURIComponent(newPath + activeId.slice(oldPath.length))}`);
    }
  }, [activeId, mutate, router]);

  const handleDropOnFolder = useCallback(async (targetFolder: string, noteId: string) => {
    if (!noteId) return;
    const currentFolder = notes.find((n) => n.id === noteId)?.path.split('/').slice(0, -1).join('/') ?? '';
    if (currentFolder === targetFolder) { setDragging(null); return; }
    try {
      const res = await fetch(`/api/notes/${encodeURIComponent(noteId)}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder: targetFolder }),
      });
      if (res.ok) {
        const resData = await res.json();
        if (targetFolder) expandFolders(targetFolder);
        handleMoved(noteId, resData.id);
      }
    } finally {
      setDragging(null);
    }
  }, [notes, handleMoved, expandFolders]);

  const handleCreated = useCallback((expandFolder?: string) => {
    mutate();
    if (expandFolder) expandFolders(expandFolder);
  }, [mutate, expandFolders]);

  // Tree computation
  const rawTree = buildTree(notes);
  const rootFolders = rawTree.filter((n): n is FolderNode => n.type === 'folder');
  const rootFiles = rawTree.filter((n): n is FileNode => n.type === 'file');
  const singleRootFolder = rootFolders.length === 1 ? rootFolders[0] : null;
  const effectiveRoot = singleRootFolder ? singleRootFolder.path : '';
  const tree: TreeNode[] = sortNodes(rawTree);

  // All unique folder paths for the folder picker
  const allFolders = [
    '/',
    ...Array.from(new Set(
      notes.flatMap((n) => {
        const parts = n.path.split('/').slice(0, -1);
        return parts.map((_, i, a) => a.slice(0, i + 1).join('/'));
      })
    )).filter(Boolean).sort(),
  ];

  // Auto-expand single root folder
  useEffect(() => {
    if (singleRootFolder) {
      setExpanded((prev) => { const next = new Set(prev); next.add(singleRootFolder.path); return next; });
    }
  }, [singleRootFolder?.path]);

  const filtered = search.trim()
    ? notes.filter((n) => n.path.toLowerCase().includes(search.toLowerCase()))
    : [];

  // Shared props passed down to tree items
  const sharedChildProps = { activeId, canWrite, setMoving, onMoved: handleMoved, onDeleted: handleDeleted, dragging, setDragging, setContextMenu };
  const sharedFolderProps = { ...sharedChildProps, expanded, toggleExpand, creating, setCreating, onCreated: handleCreated, onFolderRenamed: handleFolderRenamed, onFolderDeleted: handleFolderDeleted, onDropOnFolder: handleDropOnFolder };

  return (
    <div
      className="w-72 flex-shrink-0 border-r flex flex-col overflow-hidden h-full"
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
                onCreated={handleCreated}
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
                  handleDropOnFolder(effectiveRoot, e.dataTransfer.getData('text/plain'));
                }}
              >
                Drop here → root
              </div>
            )}
            {singleRootFolder ? (
              <>
                <FolderItem node={singleRootFolder} depth={-1} hideHeader {...sharedFolderProps} />
                {rootFiles.map((node) => (
                  <FileItem key={node.id} node={node} depth={0} {...sharedChildProps} />
                ))}
              </>
            ) : (
              tree.map((node) =>
                node.type === 'folder' ? (
                  <FolderItem key={node.path} node={node} depth={0} {...sharedFolderProps} />
                ) : (
                  <FileItem key={node.id} node={node} depth={0} {...sharedChildProps} />
                )
              )
            )}
          </>
        )}
      </div>

      <VaultBar />

      {contextMenu && (
        <ContextMenu menu={contextMenu} onClose={() => setContextMenu(null)} />
      )}

      {moving && (
        <FolderPicker
          noteId={moving}
          folders={allFolders}
          onMoved={(newId) => { handleMoved(moving, newId); setMoving(null); }}
          onCancel={() => setMoving(null)}
        />
      )}
    </div>
  );
}
