export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { getDashboardData } from '@/lib/couchdb'

export default async function DashboardPage() {
  let data = { total: 0, recentNotes: [] as any[] }
  try {
    data = await getDashboardData()
  } catch (e) {
    console.error('Dashboard fetch error:', e)
  }

  return (
    <div className="min-h-screen p-8" style={{ background: '#1a1a2e' }}>
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-10">
          <h1 className="text-3xl font-bold mb-1" style={{ color: '#e0e0e0' }}>
            Welcome to <span style={{ color: '#7F77DD' }}>REXFORM Notes</span>
          </h1>
          <p style={{ color: '#8892a4' }}>Your personal knowledge base</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
          <div className="rounded-xl p-6 border" style={{ background: '#16213e', borderColor: '#2a2a4a' }}>
            <p className="text-sm font-medium mb-1" style={{ color: '#8892a4' }}>Total Notes</p>
            <p className="text-4xl font-bold" style={{ color: '#7F77DD' }}>{data.total}</p>
          </div>
          <div className="rounded-xl p-6 border" style={{ background: '#16213e', borderColor: '#2a2a4a' }}>
            <p className="text-sm font-medium mb-1" style={{ color: '#8892a4' }}>Database</p>
            <p className="text-lg font-semibold" style={{ color: '#e0e0e0' }}>obsidian</p>
          </div>
          <div className="rounded-xl p-6 border" style={{ background: '#16213e', borderColor: '#2a2a4a' }}>
            <p className="text-sm font-medium mb-1" style={{ color: '#8892a4' }}>Status</p>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-400"></div>
              <p className="text-lg font-semibold text-green-400">Connected</p>
            </div>
          </div>
        </div>

        {/* Recent Notes */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold" style={{ color: '#e0e0e0' }}>Recent Notes</h2>
            <Link href="/notes" className="text-sm hover:underline" style={{ color: '#7F77DD' }}>
              View all →
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.recentNotes.length === 0 ? (
              <p style={{ color: '#8892a4' }}>No notes found.</p>
            ) : (
              data.recentNotes.map((note: any) => (
                <Link
                  key={note._id}
                  href={`/notes/${encodeURIComponent(note._id)}`}
                  className="block rounded-xl p-5 border border-border hover:border-accent transition-colors"
                  style={{ background: '#16213e' }}
                >
                  <h3 className="font-medium mb-2 truncate" style={{ color: '#e0e0e0' }}>
                    {note.title || note._id}
                  </h3>
                  <p className="text-sm line-clamp-2" style={{ color: '#8892a4' }}>
                    {note.preview || 'No preview available'}
                  </p>
                  {note._id && (
                    <p className="text-xs mt-3 truncate" style={{ color: '#4a5568' }}>
                      {note._id}
                    </p>
                  )}
                </Link>
              ))
            )}
          </div>
        </div>

        {/* Quick links */}
        <div className="flex gap-4 mt-10">
          <Link
            href="/notes"
            className="px-6 py-3 rounded-lg font-medium transition-opacity hover:opacity-90"
            style={{ background: '#7F77DD', color: '#fff' }}
          >
            Browse All Notes
          </Link>
          <Link
            href="/search"
            className="px-6 py-3 rounded-lg font-medium border transition-colors"
            style={{ borderColor: '#7F77DD', color: '#7F77DD' }}
          >
            Search Notes
          </Link>
        </div>
      </div>
    </div>
  )
}
