export const dynamic = 'force-dynamic'

import { getNote, assembleNoteContent, extractTitle, stripFrontmatter } from '@/lib/couchdb'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import Link from 'next/link'
import NotesSidebar from '@/components/NotesSidebar'

interface Props {
  params: { id: string }
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  })
}

export default async function NotePage({ params }: Props) {
  const id = decodeURIComponent(params.id)
  let note: any = null
  let content = ''
  let frontmatter: Record<string, string> = {}
  let error = ''

  try {
    note = await getNote(id)
    const raw = await assembleNoteContent(note)
    const parsed = stripFrontmatter(raw)
    content = parsed.content
    frontmatter = parsed.frontmatter
  } catch (e: any) {
    error = e.message || 'Failed to load note'
  }

  const title = frontmatter.title || (note ? extractTitle(note) : id)
  const folder = note?.path ? (note.path as string).split('/').slice(0, -1).join('/') : ''
  const tags = frontmatter.tags ? frontmatter.tags.split(',').map(t => t.trim()).filter(Boolean) : []

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
              <Link href="/notes" className="text-xs mb-3 inline-block hover:underline" style={{ color: '#7F77DD' }}>
                ← All Notes
              </Link>
              {folder && (
                <p className="text-xs mb-2" style={{ color: '#7F77DD' }}>📁 {folder}</p>
              )}
              <h1 className="text-3xl font-bold capitalize" style={{ color: '#f0f0f0' }}>{title}</h1>
              {/* Tags */}
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {tags.map(tag => (
                    <span key={tag} className="px-2 py-0.5 rounded text-xs font-medium" style={{ background: '#2a2a4a', color: '#7F77DD' }}>
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
              {/* Inline meta */}
              <div className="flex gap-4 mt-3 text-xs" style={{ color: '#4a5568' }}>
                {frontmatter.date && <span>{frontmatter.date}</span>}
                {note?.mtime && <span>Modified {formatDate(note.mtime)}</span>}
                {note?.size && <span>{(note.size / 1024).toFixed(1)} KB</span>}
              </div>
            </div>

            {/* Rendered markdown */}
            {content ? (
              <div className="prose">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
              </div>
            ) : (
              <div className="rounded-xl p-6 border text-center" style={{ borderColor: '#2a2a4a', background: '#16213e' }}>
                <p style={{ color: '#8892a4' }}>No content found for this note.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
