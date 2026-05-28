import { NextResponse } from 'next/server'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const base = process.env.COUCHDB_URL
  const user = process.env.COUCHDB_USERNAME
  const pass = process.env.COUCHDB_PASSWORD
  const db = process.env.COUCHDB_DATABASE || 'obsidian'

  const auth = Buffer.from(`${user}:${pass}`).toString('base64')
  const id = decodeURIComponent(params.id)

  try {
    const res = await fetch(
      `${base}/${db}/${encodeURIComponent(id)}`,
      { headers: { Authorization: `Basic ${auth}` }, cache: 'no-store' }
    )
    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json({ error: text }, { status: res.status })
    }
    const data = await res.json()
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
