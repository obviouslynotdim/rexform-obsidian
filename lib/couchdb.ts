const BASE = process.env.COUCHDB_URL
const USER = process.env.COUCHDB_USERNAME
const PASS = process.env.COUCHDB_PASSWORD
const DB = process.env.COUCHDB_DATABASE || 'obsidian'

function authHeader() {
  return 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64')
}

export function stripFrontmatter(markdown: string): { content: string; frontmatter: Record<string, string> } {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!match) return { content: markdown, frontmatter: {} }
  const frontmatter: Record<string, string> = {}
  for (const line of match[1].split('\n')) {
    const colon = line.indexOf(':')
    if (colon > 0) {
      const key = line.slice(0, colon).trim()
      const val = line.slice(colon + 1).trim().replace(/^['"\[]|['"\]]$/g, '')
      frontmatter[key] = val
    }
  }
  return { content: match[2].trim(), frontmatter }
}

// Page docs have a `path` field; block docs use `h:` prefixed IDs
export function isPageDoc(doc: any): boolean {
  return (
    doc &&
    !doc._deleted &&
    !doc._id.startsWith('_design/') &&
    !doc._id.startsWith('h:') &&
    !!doc.path
  )
}

export function extractTitle(doc: any): string {
  if (doc.title) return doc.title
  const filename = (doc.path as string).split('/').pop() || doc.path
  return filename.replace(/\.md$/i, '').replace(/[-_]/g, ' ')
}

export function buildPreview(doc: any): string {
  const folder = (doc.path as string).split('/').slice(0, -1).join('/')
  const blockCount: number = Array.isArray(doc.children) ? doc.children.length : 0
  const mtime: string = doc.mtime
    ? new Date(doc.mtime).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    : ''
  return [
    folder ? `📁 ${folder}` : null,
    blockCount ? `${blockCount} block${blockCount !== 1 ? 's' : ''}` : null,
    mtime ? `Modified ${mtime}` : null,
  ]
    .filter(Boolean)
    .join(' · ')
}

export async function getAllNotes() {
  const res = await fetch(`${BASE}/${DB}/_all_docs?include_docs=true&limit=200`, {
    headers: { Authorization: authHeader() },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`CouchDB error: ${res.status}`)
  return res.json()
}

export async function getNote(id: string) {
  const res = await fetch(`${BASE}/${DB}/${encodeURIComponent(id)}`, {
    headers: { Authorization: authHeader() },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Note not found: ${res.status}`)
  return res.json()
}

export async function assembleNoteContent(doc: any): Promise<string> {
  const children: string[] = Array.isArray(doc.children) ? doc.children : []
  if (children.length === 0) return doc.body || doc.content || doc.text || ''

  const chunks = await Promise.all(
    children.map(async (chunkId: string) => {
      try {
        const res = await fetch(`${BASE}/${DB}/${encodeURIComponent(chunkId)}`, {
          headers: { Authorization: authHeader() },
          cache: 'no-store',
        })
        if (!res.ok) return ''
        const chunk = await res.json()
        return chunk.data || ''
      } catch {
        return ''
      }
    })
  )

  return chunks.join('')
}

async function getContentPreview(doc: any): Promise<string> {
  const children: string[] = Array.isArray(doc.children) ? doc.children : []
  if (children.length === 0) return ''
  try {
    const res = await fetch(`${BASE}/${DB}/${encodeURIComponent(children[0])}`, {
      headers: { Authorization: authHeader() },
      cache: 'no-store',
    })
    if (!res.ok) return ''
    const chunk = await res.json()
    const { content } = stripFrontmatter(chunk.data || '')
    return content.replace(/[#*`>\[\]!]/g, '').replace(/\s+/g, ' ').trim().slice(0, 150)
  } catch {
    return ''
  }
}

export async function getDashboardData() {
  const data = await getAllNotes()
  const rows = data.rows || []
  const pageDocs = rows.map((r: any) => r.doc).filter(isPageDoc)

  const recentNotes = await Promise.all(
    pageDocs.slice(0, 8).map(async (doc: any) => ({
      _id: doc._id,
      title: extractTitle(doc),
      preview: await getContentPreview(doc),
    }))
  )

  return { total: pageDocs.length, recentNotes }
}
