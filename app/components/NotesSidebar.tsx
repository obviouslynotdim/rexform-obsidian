'use client';
import { useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const SWR_CONFIG = {
  revalidateOnFocus: false,
  revalidateOnReconnect: false,
  dedupingInterval: 30_000,
} as const;

interface Props {
  currentId?: string;
}

function SkeletonItem({ width }: { width: string }) {
  return (
    <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
      <div
        className="h-3 rounded mb-1.5 animate-pulse"
        style={{ background: 'var(--border)', width }}
      />
      <div
        className="h-2 rounded animate-pulse"
        style={{ background: 'var(--bg-elevated)', width: '38%' }}
      />
    </div>
  );
}

export default function NotesSidebar({ currentId }: Props) {
  const [search, setSearch] = useState('');
  const pathname = usePathname();
  const { data, isLoading } = useSWR('/api/notes', fetcher, SWR_CONFIG);

  const notes: any[] = (data?.rows || [])
    .filter((n: any) => n && !n._deleted && n._id && !n._id.startsWith('_design/') && !!n.path)
    .sort((a: any, b: any) => (b.mtime ?? 0) - (a.mtime ?? 0));

  const filtered = search.trim()
    ? notes.filter((n: any) =>
        (n.path || n._id || '').toLowerCase().includes(search.toLowerCase())
      )
    : notes;

  const activeId = currentId ?? decodeURIComponent(pathname.replace('/notes/', ''));

  return (
    <div
      className="w-72 flex-shrink-0 border-r flex flex-col overflow-hidden"
      style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
    >
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
            All Notes
          </h2>
          <Link
            href="/notes/new"
            className="px-2 py-1 rounded text-xs font-medium transition-opacity hover:opacity-80"
            style={{ background: 'var(--accent)', color: '#fff' }}
          >
            + New
          </Link>
        </div>
        <input
          type="text"
          placeholder="Filter…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-3 py-1.5 rounded-lg text-xs outline-none border"
          style={{ background: 'var(--bg-base)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
        />
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <>
            <SkeletonItem width="72%" />
            <SkeletonItem width="55%" />
            <SkeletonItem width="80%" />
            <SkeletonItem width="63%" />
            <SkeletonItem width="70%" />
          </>
        ) : filtered.length === 0 ? (
          <p className="p-4 text-xs" style={{ color: 'var(--text-muted)' }}>
            {search ? 'No matches' : 'No notes yet'}
          </p>
        ) : (
          filtered.map((note: any) => {
            const id = note._id;
            const filename =
              (note.path || id).split('/').pop()?.replace(/\.md$/i, '').replace(/[-_]/g, ' ') || id;
            const folder = note.path
              ? (note.path as string).split('/').slice(0, -1).join('/')
              : '';
            const isActive = id === activeId;

            return (
              <Link
                key={id}
                href={`/notes/${encodeURIComponent(id)}`}
                className="block px-4 py-2.5 border-b text-sm transition-colors"
                style={{
                  borderColor: 'var(--border)',
                  background: isActive ? 'var(--bg-base)' : 'transparent',
                  borderLeft: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                }}
              >
                <p
                  className="truncate capitalize font-medium"
                  style={{ color: isActive ? 'var(--accent-hover)' : 'var(--text-primary)' }}
                >
                  {filename}
                </p>
                {folder && (
                  <p className="text-xs truncate mt-0.5" style={{ color: isActive ? 'var(--accent)' : 'var(--text-muted)' }}>
                    📁 {folder}
                  </p>
                )}
              </Link>
            );
          })
        )}
      </div>

      {/* Footer */}
      {!isLoading && (
        <div
          className="px-4 py-2 border-t text-xs flex-shrink-0"
          style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
        >
          {filtered.length} {filtered.length === 1 ? 'note' : 'notes'}
          {search && notes.length !== filtered.length && ` of ${notes.length}`}
        </div>
      )}
    </div>
  );
}
