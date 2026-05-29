import { NextResponse } from 'next/server'

function isVaultNote(doc: { _id: string; type?: string; path?: string }): boolean {
  const id = doc._id
  if (id.startsWith('docs/')) return false
  if (id.startsWith('node_modules/')) return false
  if (id.startsWith('h:')) return false
  if (id.startsWith('_')) return false
  return doc.type === 'plain' || (typeof doc.path === 'string' && doc.path.endsWith('.md'))
}

export async function GET() {
  const base = process.env.COUCHDB_URL
  const user = process.env.COUCHDB_USERNAME
  const pass = process.env.COUCHDB_PASSWORD
  const db = process.env.COUCHDB_DATABASE || 'obsidian'

  const auth = Buffer.from(`${user}:${pass}`).toString('base64')

  try {
    const res = await fetch(
      `${base}/${db}/_all_docs?include_docs=true&limit=500`,
      { headers: { Authorization: `Basic ${auth}` }, cache: 'no-store' }
    )
    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json({ error: text }, { status: res.status })
    }
    const data = await res.json()
    const notes = (data.rows as { doc: { _id: string; type?: string; path?: string } }[])
      .map((row) => row.doc)
      .filter(isVaultNote)
    return NextResponse.json({ ...data, rows: notes, total_rows: notes.length }, { headers: { 'X-Notes-Count': String(notes.length) } })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
