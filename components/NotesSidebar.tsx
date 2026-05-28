'use client'
import useSWR from 'swr'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const fetcher = (url: string) => fetch(url).then(r => r.json())

interface Props {
  currentId?: string
}

export default function NotesSidebar({ currentId }: Props) {
  const { data, isLoading } = useSWR('/api/notes', fetcher)
  const notes: any[] = data?.rows || []

  return (
    <div className="w-72 flex-shrink-0 border-r flex flex-col overflow-hidden" style={{ background: '#16213e', borderColor: '#2a2a4a' }}>
      <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: '#2a2a4a' }}>
        <h2 className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#8892a4' }}>All Notes</h2>
        <span className="text-xs" style={{ color: '#4a5568' }}>{notes.length}</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <div className="p-4 text-sm" style={{ color: '#8892a4' }}>Loading...</div>
        )}
        {notes.map((note: any) => {
          const id = note.id || note._id
          const title = note.doc?.title || note.doc?.path || id
          const isActive = id === currentId
          return (
            <Link
              key={id}
              href={`/notes/${encodeURIComponent(id)}`}
              className="block px-4 py-2.5 border-b text-sm"
              style={{
                borderColor: '#2a2a4a',
                color: isActive ? '#7F77DD' : '#c8d4e8',
                background: isActive ? '#1a1a2e' : 'transparent',
              }}
            >
              <p className="truncate">{title}</p>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
