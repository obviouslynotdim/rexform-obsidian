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
  const notes: any[] = (data?.rows || []).filter((n: any) => {
    const doc = n.doc
    return doc && !doc._deleted && !doc._id.startsWith('_design/') && !doc._id.startsWith('h:') && !!doc.path
  })

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
          const doc = note.doc
          const filename = (doc?.path || id).split('/').pop()?.replace(/\.md$/i, '').replace(/[-_]/g, ' ') || id
          const folder = doc?.path ? (doc.path as string).split('/').slice(0, -1).join('/') : ''
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
              <p className="truncate capitalize">{filename}</p>
              {folder && <p className="text-xs truncate mt-0.5" style={{ color: isActive ? '#9b96e8' : '#4a5568' }}>📁 {folder}</p>}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
