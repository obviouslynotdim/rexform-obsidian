const BASE = process.env.COUCHDB_URL
const USER = process.env.COUCHDB_USERNAME
const PASS = process.env.COUCHDB_PASSWORD
const DB = process.env.COUCHDB_DATABASE || 'obsidian'

function authHeader() {
  return 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64')
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
  const docs = rows
    .map((r: any) => r.doc)
    .filter((d: any) => d && !d._id.startsWith('_design/'))

  const recentNotes = docs.slice(0, 8).map((doc: any) => {
    const body = doc.body || doc.content || doc.text || ''
    return {
      _id: doc._id,
      title: doc.title || doc.path || doc._id,
      preview: body.replace(/[#*`\[\]]/g, '').slice(0, 120),
    }
  })

  return { total: docs.length, recentNotes }
}
