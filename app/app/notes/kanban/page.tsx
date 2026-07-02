'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR, { mutate } from 'swr';
import { starterBoardDoc } from '@/lib/kanban';
import { useTabsContext } from '@/context/TabsContext';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface BoardEntry {
  id: string;
  title: string;
  path: string;
  mtime: number | null;
  columns: number;
  cards: number;
}
interface VaultsData {
  vaults: { name: string; label: string; role?: string }[];
  activeVault: string;
}

function BoardIcon() {
  return (
    <svg width="34" height="26" viewBox="0 0 120 90" fill="none">
      <rect x="4" y="4" width="32" height="82" rx="4" stroke="#7F77DD" strokeWidth="6" />
      <rect x="44" y="4" width="32" height="82" rx="4" stroke="#7F77DD" strokeWidth="6" />
      <rect x="84" y="4" width="32" height="82" rx="4" stroke="#7F77DD" strokeWidth="6" />
      <rect x="10" y="12" width="20" height="12" rx="2" fill="#7F77DD" />
      <rect x="50" y="12" width="20" height="12" rx="2" fill="#7F77DD" />
      <rect x="50" y="30" width="20" height="12" rx="2" fill="#7F77DD" />
      <rect x="90" y="12" width="20" height="12" rx="2" fill="#7F77DD" />
    </svg>
  );
}

export default function KanbanPage() {
  const router = useRouter();
  const tabsCtx = useTabsContext();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const { data, isLoading } = useSWR<{ boards: BoardEntry[] }>('/api/kanban/boards', fetcher, {
    revalidateOnFocus: false,
  });
  const boards = data?.boards ?? [];

  const { data: vaultsData } = useSWR<VaultsData>('/api/vaults', fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  });
  const activeRole = vaultsData?.vaults.find((v) => v.name === vaultsData.activeVault)?.role;
  const canWrite = activeRole !== 'viewer';

  function openBoard(board: BoardEntry) {
    tabsCtx?.openTab(board.id, board.title, 'note');
    router.push(`/notes/${encodeURIComponent(board.id)}`);
  }

  async function createBoard() {
    if (creating) return;
    setCreating(true);
    setError('');
    try {
      const content = starterBoardDoc();
      const res = await fetch('/api/notes/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Untitled Board', folder: '', content }),
      });
      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || 'Failed to create board');
      mutate('/api/notes/tree');
      mutate('/api/kanban/boards');
      tabsCtx?.openTab(resData.id, resData.title, 'note');
      router.push(`/notes/${encodeURIComponent(resData.id)}`);
    } catch (e: any) {
      setError(e.message);
      setCreating(false);
    }
  }

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: 'var(--bg-base)' }}>
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '40px 32px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 6 }}>
          <BoardIcon />
          <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>
            Kanban boards
          </h1>
          {canWrite && (
            <button
              onClick={createBoard}
              disabled={creating}
              style={{
                background: 'var(--accent)', color: '#fff', border: 'none',
                borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 500,
                cursor: creating ? 'default' : 'pointer', opacity: creating ? 0.6 : 1,
              }}
            >
              {creating ? 'Creating…' : '+ New board'}
            </button>
          )}
        </div>
        <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', marginBottom: 28 }}>
          Boards are plain markdown notes with a <code style={{ fontSize: 12 }}>kanban-plugin</code>{' '}
          property — they sync like any note and open in Obsidian&apos;s Kanban plugin.
        </p>

        {error && (
          <p style={{ fontSize: 13, color: '#f87171', marginBottom: 16 }}>{error}</p>
        )}

        {/* Board list */}
        {isLoading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
            {[0, 1, 2].map((i) => (
              <div key={i} className="animate-pulse" style={{ height: 92, borderRadius: 10, background: 'var(--border)', opacity: 0.4 }} />
            ))}
          </div>
        ) : boards.length === 0 ? (
          <div
            style={{
              border: '1px dashed var(--border)', borderRadius: 12,
              padding: '48px 24px', textAlign: 'center',
            }}
          >
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 6 }}>
              No boards yet.
            </p>
            <p style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
              {canWrite
                ? 'Create one with “New board”, or add `kanban-plugin: basic` to any note’s properties.'
                : 'This vault has no Kanban boards.'}
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
            {boards.map((board) => {
              const folder = board.path.split('/').slice(0, -1).join('/');
              return (
                <button
                  key={board.id}
                  onClick={() => openBoard(board)}
                  style={{
                    textAlign: 'left', cursor: 'pointer',
                    background: 'var(--bg-surface)', border: '1px solid var(--border)',
                    borderRadius: 10, padding: '14px 16px',
                    display: 'flex', flexDirection: 'column', gap: 6,
                  }}
                >
                  <span
                    style={{
                      fontSize: 14.5, fontWeight: 600, color: 'var(--text-primary)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}
                  >
                    {board.title}
                  </span>
                  {folder && (
                    <span style={{ fontSize: 11.5, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      📁 {folder}
                    </span>
                  )}
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {board.columns} {board.columns === 1 ? 'column' : 'columns'}
                    {' · '}
                    {board.cards} {board.cards === 1 ? 'card' : 'cards'}
                  </span>
                  {board.mtime && (
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      Modified {new Date(board.mtime).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
