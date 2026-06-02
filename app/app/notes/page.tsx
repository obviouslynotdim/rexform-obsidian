'use client';
import Link from 'next/link';
import NotesSidebar from '@/components/NotesSidebar';

export default function NotesPage() {
  return (
    <div className="flex h-[calc(100vh-56px)]" style={{ background: '#1a1a2e' }}>
      <NotesSidebar />

      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5 text-3xl"
            style={{ background: '#16213e', border: '1px solid #2a2a4a' }}
          >
            📝
          </div>
          <p className="text-base font-medium mb-1" style={{ color: '#c8d4e8' }}>
            Select a note to view
          </p>
          <p className="text-sm mb-6" style={{ color: '#4a5568' }}>
            or create something new
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
