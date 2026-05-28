export const dynamic = 'force-dynamic'

import { getNote, extractTitle } from '@/lib/couchdb'
import Link from 'next/link'
import NotesSidebar from '@/components/NotesSidebar'

interface Props {
  params: { id: string }
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export default async function NotePage({ params }: Props) {
  const id = decodeURIComponent(params.id)
  let note: any = null
  let error = ''

  try {
    note = await getNote(id)
  } catch (e: any) {
    error = e.message || 'Failed to load note'
  }

  const title = note ? extractTitle(note) : id
  const folder = note?.path ? (note.path as string).split('/').slice(0, -1).join('/') : ''
  const blockIds: string[] = Array.isArray(note?.children) ? note.children : []
  const plainText = note?.body || note?.content || note?.text || ''

  return (
    <div className="flex h-[calc(100vh-56px)]" style={{ background: '#1a1a2e' }}>
      <NotesSidebar currentId={id} />

      <div className="flex-1 overflow-y-auto">
        {error ? (
          <div className="p-8">
            <div className="rounded-xl p-6 border border-red-800 bg-red-900/20">
              <p className="text-red-400 font-medium">Error loading note</p>
              <p className="text-red-300/70 text-sm mt-1">{error}</p>
            </div>
            <Link href="/notes" className="mt-4 inline-block text-sm" style={{ color: '#7F77DD' }}>
              ← Back to notes
            </Link>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto px-8 py-10">
            {/* Header */}
            <div className="mb-8 pb-6 border-b" style={{ borderColor: '#2a2a4a' }}>
              <Link href="/notes" className="text-xs mb-4 inline-block hover:underline" style={{ color: '#7F77DD' }}>
                ← All Notes
              </Link>
              {folder && (
                <p className="text-xs mb-2" style={{ color: '#7F77DD' }}>📁 {folder}</p>
              )}
              <h1 className="text-3xl font-bold capitalize" style={{ color: '#f0f0f0' }}>{title}</h1>
              {note?.path && (
                <p className="text-xs mt-2 font-mono" style={{ color: '#4a5568' }}>{note.path}</p>
              )}
            </div>

            {/* Metadata grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
              {[
                { label: 'Blocks', value: blockIds.length || '—' },
                { label: 'Size', value: note?.size ? `${(note.size / 1024).toFixed(1)} KB` : '—' },
                { label: 'Created', value: note?.ctime ? formatDate(note.ctime) : '—' },
                { label: 'Modified', value: note?.mtime ? formatDate(note.mtime) : '—' },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-lg p-3 border" style={{ background: '#16213e', borderColor: '#2a2a4a' }}>
                  <p className="text-xs mb-1" style={{ color: '#8892a4' }}>{label}</p>
                  <p className="text-sm font-medium" style={{ color: '#e0e0e0' }}>{value}</p>
                </div>
              ))}
            </div>

            {/* Plain text content if available */}
            {plainText && (
              <div className="prose mb-8">
                <pre className="text-sm whitespace-pre-wrap font-mono" style={{ color: '#c8d4e8' }}>{plainText}</pre>
              </div>
            )}

            {/* Block references */}
            {blockIds.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: '#8892a4' }}>
                  Blocks ({blockIds.length})
                </p>
                <div className="rounded-xl border p-4 space-y-1" style={{ background: '#16213e', borderColor: '#2a2a4a' }}>
                  {blockIds.map((bid: string) => (
                    <p key={bid} className="text-xs font-mono" style={{ color: '#4a5568' }}>{bid}</p>
                  ))}
                </div>
                <p className="text-xs mt-3" style={{ color: '#4a5568' }}>
                  Block content is stored encrypted in the Logseq database.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
