const BASE = process.env.COUCHDB_URL
const USER = process.env.COUCHDB_USERNAME
const PASS = process.env.COUCHDB_PASSWORD
const DB = process.env.COUCHDB_DATABASE || 'obsidian'

function authHeader() {
  return 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64')
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

export async function getDashboardData() {
  const data = await getAllNotes()
  const rows = data.rows || []
  const pageDocs = rows.map((r: any) => r.doc).filter(isPageDoc)

  const recentNotes = pageDocs.slice(0, 8).map((doc: any) => ({
    _id: doc._id,
    title: extractTitle(doc),
    preview: buildPreview(doc),
  }))

  return { total: pageDocs.length, recentNotes }
}
