'use client';
import { useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function NotesPage() {
  const { data, error, isLoading } = useSWR('/api/notes', fetcher);
  const [search, setSearch] = useState('');

  const notes: any[] = (data?.rows || []).filter(
    (n: any) => n && !n._deleted && n._id && !n._id.startsWith('_design/') && !!n.path
  );
  const filtered = notes.filter((n: any) =>
    (n.path || n._id || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex h-[calc(100vh-56px)]" style={{ background: '#1a1a2e' }}>
      {/* Sidebar */}
      <div
        className="w-72 flex-shrink-0 border-r flex flex-col"
        style={{ background: '#16213e', borderColor: '#2a2a4a' }}
      >
        <div className="p-4 border-b" style={{ borderColor: '#2a2a4a' }}>
          <div className="flex items-center justify-between mb-3">
            <h2
              className="font-semibold text-sm uppercase tracking-wider"
              style={{ color: '#8892a4' }}
            >
              All Notes
            </h2>
            <Link
              href="/notes/new"
              className="px-2 py-1 rounded text-xs font-medium transition-opacity hover:opacity-80"
              style={{ background: '#7F77DD', color: '#fff' }}
            >
              + New
            </Link>
          </div>
          <input
            type="text"
            placeholder="Filter notes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-3 py-2 rounded-lg text-sm outline-none border"
            style={{ background: '#1a1a2e', borderColor: '#2a2a4a', color: '#e0e0e0' }}
          />
        </div>
        <div className="flex-1 overflow-y-auto">
          {isLoading && (
            <div className="p-4 text-sm" style={{ color: '#8892a4' }}>
              Loading notes...
            </div>
          )}
          {error && <div className="p-4 text-sm text-red-400">Failed to load notes</div>}
          {filtered.map((note: any) => {
            const id = note._id;
            const filename =
              (note.path || id).split('/').pop()?.replace(/\.md$/i, '').replace(/[-_]/g, ' ') || id;
            const folder = note.path ? (note.path as string).split('/').slice(0, -1).join('/') : '';
            return (
              <Link
                key={id}
                href={`/notes/${encodeURIComponent(id)}`}
                className="block px-4 py-3 border-b transition-colors hover:bg-bg"
                style={{ borderColor: '#2a2a4a' }}
              >
                <p className="text-sm font-medium truncate capitalize" style={{ color: '#e0e0e0' }}>
                  {filename}
                </p>
                {folder && (
                  <p className="text-xs mt-0.5 truncate" style={{ color: '#7F77DD' }}>
                    📁 {folder}
                  </p>
                )}
              </Link>
            );
          })}
          {!isLoading && filtered.length === 0 && (
            <div className="p-4 text-sm" style={{ color: '#8892a4' }}>
              No notes found
            </div>
          )}
        </div>
        <div className="p-3 border-t text-xs" style={{ borderColor: '#2a2a4a', color: '#4a5568' }}>
          {filtered.length} notes
        </div>
      </div>

      {/* Main: prompt to select or create */}
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">📝</div>
          <p className="text-lg font-medium" style={{ color: '#8892a4' }}>
            Select a note to view
          </p>
          <p className="text-sm mt-1 mb-6" style={{ color: '#4a5568' }}>
            Choose from the sidebar, or create a new one
          </p>
          <Link
            href="/notes/new"
            className="px-5 py-2 rounded-lg font-medium text-sm transition-opacity hover:opacity-90"
            style={{ background: '#7F77DD', color: '#fff' }}
          >
            + New Note
          </Link>
        </div>
      </div>
    </div>
  );
}
