import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q') || ''
  const base = process.env.COUCHDB_URL
  const user = process.env.COUCHDB_USERNAME
  const pass = process.env.COUCHDB_PASSWORD
  const db = process.env.COUCHDB_DATABASE || 'obsidian'

  const auth = Buffer.from(`${user}:${pass}`).toString('base64')

  try {
    const res = await fetch(
      `${base}/${db}/_all_docs?include_docs=true`,
      { headers: { Authorization: `Basic ${auth}` }, cache: 'no-store' }
    )
    if (!res.ok) {
      return NextResponse.json({ results: [] }, { status: res.status })
    }
    const data = await res.json()
    const lower = q.toLowerCase()

    const results = (data.rows || [])
      .map((row: any) => row.doc)
      .filter((doc: any) => {
        if (!doc || doc._id.startsWith('_')) return false
        const title = (doc.title || doc._id || '').toLowerCase()
        const body = (doc.body || doc.content || doc.text || '').toLowerCase()
        return title.includes(lower) || body.includes(lower)
      })
      .slice(0, 50)
      .map((doc: any) => {
        const body = doc.body || doc.content || doc.text || ''
        const idx = body.toLowerCase().indexOf(lower)
        const snippet = idx >= 0
          ? '...' + body.slice(Math.max(0, idx - 60), idx + 120) + '...'
          : body.slice(0, 180)
        return { _id: doc._id, title: doc.title || doc._id, snippet }
      })

    return NextResponse.json({ results })
  } catch (e: any) {
    return NextResponse.json({ error: e.message, results: [] }, { status: 500 })
  }
}
