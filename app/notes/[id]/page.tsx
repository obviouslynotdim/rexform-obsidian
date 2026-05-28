export const dynamic = 'force-dynamic'

import { getNote } from '@/lib/couchdb'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import Link from 'next/link'
import NotesSidebar from '@/components/NotesSidebar'

interface Props {
  params: { id: string }
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

  const content = note?.body || note?.content || note?.text || note?._id || ''
  const title = note?.title || note?.path || id

  return (
    <div className="flex h-[calc(100vh-56px)]" style={{ background: '#1a1a2e' }}>
      {/* Sidebar */}
      <NotesSidebar currentId={id} />

      {/* Note content */}
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
            <div className="mb-6 pb-6 border-b" style={{ borderColor: '#2a2a4a' }}>
              <Link href="/notes" className="text-xs mb-4 inline-block hover:underline" style={{ color: '#7F77DD' }}>
                ← All Notes
              </Link>
              <h1 className="text-3xl font-bold" style={{ color: '#f0f0f0' }}>{title}</h1>
              {note?.path && (
                <p className="text-sm mt-2" style={{ color: '#4a5568' }}>{note.path}</p>
              )}
            </div>
            {content ? (
              <div className="prose">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
              </div>
            ) : (
              <div className="rounded-xl p-6 border" style={{ borderColor: '#2a2a4a', background: '#16213e' }}>
                <pre className="text-sm overflow-auto font-mono" style={{ color: '#8892a4' }}>
                  {JSON.stringify(note, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
