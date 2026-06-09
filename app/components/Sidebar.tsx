'use client';
import Link from 'next/link';

interface Props {
  notes: any[];
  currentId?: string;
}

export default function Sidebar({ notes, currentId }: Props) {
  return (
    <div
      className="w-72 flex-shrink-0 border-r flex flex-col overflow-hidden"
      style={{ background: '#16213e', borderColor: '#2a2a4a' }}
    >
      <div className="p-4 border-b" style={{ borderColor: '#2a2a4a' }}>
        <h2 className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#8892a4' }}>
          Notes
        </h2>
      </div>
      <div className="flex-1 overflow-y-auto">
        {notes.map((note: any) => {
          const id = note.id || note._id;
          const title = note.doc?.title || note.doc?.path || id;
          const isActive = id === currentId;
          return (
            <Link
              key={id}
              href={`/notes/${encodeURIComponent(id)}`}
              className="block px-4 py-3 border-b text-sm truncate"
              style={{
                borderColor: '#2a2a4a',
                color: isActive ? '#7F77DD' : '#c8d4e8',
                background: isActive ? '#1a1a2e' : 'transparent',
              }}
            >
              {title}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
