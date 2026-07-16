'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import useSWR from 'swr';
import { buildTree, getAncestorFolders } from './tree';
import FolderItem from './FolderItem';
import FileItem from './FileItem';
import InlineInput from './InlineInput';
import ContextMenu from './ContextMenu';
import FolderPicker from './FolderPicker';
import VaultBar from './VaultBar';
import { starterBoardDoc } from '@/lib/kanban';
import type { NoteEntry, VaultsData, ContextMenuState, CreatingState } from './types';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface Props { currentId?: string }

function loadExpanded(vaultId: string | null): Set<string> {
  if (!vaultId || typeof window === 'undefined') return new Set();
  try {
    const saved = localStorage.getItem(`notes.expanded:${vaultId}`);
    return saved ? new Set<string>(JSON.parse(saved)) : new Set<string>();
  } catch {
    return new Set();
  }
}

function lastVaultId(): string | null {
  if (typeof window === 'undefined') return null;
  try { return localStorage.getItem('notes.lastVault'); } catch { return null; }
}

function SkeletonItem({ width }: { width: string }) {
  return (
    <div className="px-3 py-2">
      <div className="h-3 rounded animate-pulse" style={{ background: 'var(--border)', width }} />
    </div>
  );
}

export default function NotesSidebar({ currentId }: Props) {
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(() => loadExpanded(lastVaultId()));
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

  const { data: fileSettings } = useSWR<{ newNoteLocation?: 'root' | 'current' }>(
    '/api/user/settings',
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60_000 }
  );

  // Kanban plugin state — gates the "New Kanban board" context-menu action.
  const { data: pluginsData } = useSWR('/api/user/plugins', fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 30_000,
  });
  const kanbanEnabled =
    (pluginsData?.installed ?? []).includes('kanban') && !!pluginsData?.enabled?.kanban;

  const notes: NoteEntry[] = data?.notes || [];

  // Derive the active note ID from the URL, normalising to the CouchDB ID (with .md)
  // so sidebar highlighting works whether the URL uses clean or legacy .md paths.
  const rawActiveId = currentId ?? decodeURIComponent(pathname.replace('/notes/', ''));
  const activeNote = notes.find((n) => n.id === rawActiveId || n.id === rawActiveId + '.md');
  const activeId = activeNote?.id ?? rawActiveId;

  const activeRole = vaultsData?.vaults.find((v) => v.name === vaultsData.activeVault)?.role;
  const canWrite = activeRole !== 'viewer';

  const vaultId = vaultsData?.activeVault || null;
  const [restoredVault, setRestoredVault] = useState<string | null>(lastVaultId);

  // Expanded folders live in localStorage — the sidebar unmounts when navigating
  // away (e.g. to the dashboard). State is seeded synchronously from the last
  // active vault's saved set so there is no collapsed flash on remount; if the
  // resolved vault turns out to be a different one, swap in its saved set.
  useEffect(() => {
    if (!vaultId) return;
    try { localStorage.setItem('notes.lastVault', vaultId); } catch {}
    if (restoredVault === vaultId) return;
    setExpanded(loadExpanded(vaultId));
    setRestoredVault(vaultId);
  }, [vaultId, restoredVault]);

  // Persist expanded folders — only once this vault's state has been restored,
  // so we never overwrite the saved set with the initial empty one.
  useEffect(() => {
    if (!vaultId || restoredVault !== vaultId) return;
    try {
      localStorage.setItem(`notes.expanded:${vaultId}`, JSON.stringify(Array.from(expanded)));
    } catch {}
  }, [expanded, vaultId, restoredVault]);

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

  // "Reveal file in navigation" from the note's ⋮ menu: expand the note's
  // ancestor folders, then scroll its row into view once they've rendered.
  useEffect(() => {
    function onReveal(e: Event) {
      const id = (e as CustomEvent).detail?.id as string | undefined;
      if (!id) return;
      const note = notes.find((n) => n.id === id || n.id === id + '.md');
      if (note) {
        const ancestors = getAncestorFolders(note.path);
        if (ancestors.length > 0) {
          setExpanded((prev) => new Set([...Array.from(prev), ...ancestors]));
        }
      }
      const targetId = note?.id ?? id;
      setTimeout(() => {
        document
          .querySelector(`[data-note-id="${CSS.escape(targetId)}"]`)
          ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }, 60);
    }
    window.addEventListener('rexform:reveal-note', onReveal);
    return () => window.removeEventListener('rexform:reveal-note', onReveal);
  }, [notes]);

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

  const handleFolderMove = useCallback(async (sourcePath: string, targetParent: string) => {
    try {
      const folderName = sourcePath.split('/').pop() ?? sourcePath;
      const newPath = targetParent ? `${targetParent}/${folderName}` : folderName;
      if (newPath === sourcePath || newPath.startsWith(sourcePath + '/')) {
        setDragging(null);
        return;
      }
      const res = await fetch('/api/notes/folder/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: sourcePath, target: targetParent }),
      });
      if (res.ok) {
        mutate();
        if (activeId.startsWith(sourcePath + '/')) {
          const newId = newPath + activeId.slice(sourcePath.length);
          router.push(`/notes/${encodeURIComponent(newId)}`);
        }
      }
    } finally {
      setDragging(null);
    }
  }, [activeId, mutate, router]);

  const handleCreated = useCallback((expandFolder?: string) => {
    mutate();
    if (expandFolder) expandFolders(expandFolder);
  }, [mutate, expandFolders]);

  function createAtRoot(type: 'note' | 'folder') {
    setCreating({ folder: '', type });
  }

  // Creates a seeded starter board in the given folder ('' = vault root) and
  // opens it. Naming is delegated to the create API ("Untitled Board", …).
  async function createKanbanBoard(folder = '') {
    const res = await fetch('/api/notes/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Untitled Board', folder, content: starterBoardDoc() }),
    });
    if (!res.ok) return;
    const data = await res.json();
    mutate();
    if (folder) expandFolders(folder);
    router.push(`/notes/${encodeURIComponent(data.id)}`);
  }

  // "+ New" honors the user's default-location setting. When set to 'current',
  // the new note is created in the active note's folder; otherwise at the root.
  function createNote() {
    const activeFolder = fileSettings?.newNoteLocation === 'current' && activeId
      ? (activeId.includes('/') ? activeId.split('/').slice(0, -1).join('/') : '')
      : '';
    setCreating({ folder: activeFolder, type: 'note' });
    if (activeFolder) expandFolders(activeFolder);
  }

  // buildTree already returns a sorted tree
  const tree = buildTree(notes);

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

  const filtered = search.trim()
    ? notes.filter((n) => n.path.toLowerCase().includes(search.toLowerCase()))
    : [];

  // Banner: visible whenever something inside a folder is being dragged (note or folder).
  // Dropping on it moves to true root ('').
  const isFolderDrag = typeof dragging === 'string' && dragging.startsWith('folder:');
  const draggedNote = (!isFolderDrag && dragging) ? notes.find((n) => n.id === dragging) : null;
  const draggedFolder = isFolderDrag
    ? dragging!.slice('folder:'.length).split('/').slice(0, -1).join('/')
    : (draggedNote?.path ?? '').split('/').slice(0, -1).join('/');
  const showRootBanner = !!dragging && draggedFolder !== '';

  // Shared props passed down to tree items
  const sharedChildProps = { activeId, canWrite, setMoving, onMoved: handleMoved, onDeleted: handleDeleted, dragging, setDragging, setContextMenu, onDropOnFolder: handleDropOnFolder, setCreating };
  const sharedFolderProps = { ...sharedChildProps, expanded, toggleExpand, creating, setCreating, onCreated: handleCreated, onFolderRenamed: handleFolderRenamed, onFolderDeleted: handleFolderDeleted, onDropOnFolder: handleDropOnFolder, onFolderMoved: handleFolderMove, onNewKanbanInFolder: kanbanEnabled ? createKanbanBoard : undefined };

  return (
    <div
      className="w-full flex-shrink-0 border-r flex flex-col overflow-hidden h-full"
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
                title="New folder"
                onClick={() => createAtRoot('folder')}
                className="px-2 py-1 rounded text-xs font-medium transition-opacity hover:opacity-80"
                style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
              >⊞</button>
              <button
                title="New note"
                onClick={createNote}
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

      {/* Body — catch-all drop target for root-level drops (notes and folders) */}
      <div
        className="flex-1 overflow-y-auto py-1"
        onContextMenu={(e) => {
          if (!canWrite) return;
          e.preventDefault();
          setContextMenu({
            x: e.clientX, y: e.clientY,
            type: 'root', id: '', name: '', path: '',
            onNewNote: () => createAtRoot('note'),
            onNewFolder: () => createAtRoot('folder'),
            onNewKanban: kanbanEnabled ? createKanbanBoard : undefined,
          });
        }}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes('text/plain')) return;
          e.preventDefault();
        }}
        onDrop={(e) => {
          e.preventDefault();
          const data = e.dataTransfer.getData('text/plain');
          if (!data) return;
          if (data.startsWith('folder:')) {
            handleFolderMove(data.slice('folder:'.length), '');
          } else {
            handleDropOnFolder('', data);
          }
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
                folder=""
                type={creating.type}
                depth={0}
                onCreated={handleCreated}
                onCancel={() => setCreating(null)}
              />
            )}
            {showRootBanner && (
              <div
                className="mx-2 mb-1 py-1 rounded text-xs text-center border border-dashed"
                style={{ color: 'var(--text-muted)', borderColor: 'var(--accent)', opacity: 0.7 }}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const data = e.dataTransfer.getData('text/plain');
                  if (data.startsWith('folder:')) {
                    handleFolderMove(data.slice('folder:'.length), '');
                  } else {
                    handleDropOnFolder('', data);
                  }
                }}
              >
                Move to vault root
              </div>
            )}
            {tree.map((node) =>
              node.type === 'folder' ? (
                <FolderItem key={node.path} node={node} depth={0} {...sharedFolderProps} />
              ) : (
                <FileItem key={node.id} node={node} depth={0} {...sharedChildProps} />
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
