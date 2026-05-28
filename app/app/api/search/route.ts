import { NextRequest, NextResponse } from 'next/server'
import { isPageDoc, extractTitle, buildPreview } from '@/lib/couchdb'

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
        if (!isPageDoc(doc)) return false
        const searchable = [
          doc.path || '',
          extractTitle(doc),
        ].join(' ').toLowerCase()
        return searchable.includes(lower)
      })
      .slice(0, 50)
      .map((doc: any) => ({
        _id: doc._id,
        title: extractTitle(doc),
        snippet: buildPreview(doc),
      }))

    return NextResponse.json({ results })
  } catch (e: any) {
    return NextResponse.json({ error: e.message, results: [] }, { status: 500 })
  }
}
