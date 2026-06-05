export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDashboardData, AuthHeaders } from '@/lib/couchdb';
import { getActiveVault } from '@/lib/active-vault';
import Card from '@/components/ui/Card';

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  const auth: AuthHeaders | undefined = session?.kratosSessionToken
    ? { authorization: `Bearer ${session.kratosSessionToken}` }
    : undefined;
  const db = getActiveVault(session);

  let data = { total: 0, recentNotes: [] as any[] };
  try {
    data = await getDashboardData(auth, db);
  } catch (e) {
    console.error('Dashboard fetch error:', e);
  }

  return (
    <div className="min-h-screen p-8" style={{ background: 'var(--bg-base)' }}>
      <div className="max-w-5xl mx-auto">
        <div className="mb-10">
          <h1 className="text-3xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
            Welcome to <span style={{ color: 'var(--accent)' }}>REXFORM Notes</span>
          </h1>
          <p style={{ color: 'var(--text-secondary)' }}>Your personal knowledge base</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
          <Card className="p-6">
            <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Total Notes</p>
            <p className="text-4xl font-bold" style={{ color: 'var(--accent)' }}>{data.total}</p>
          </Card>
          <Card className="p-6">
            <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Vault</p>
            <p className="text-lg font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{db}</p>
          </Card>
          <Card className="p-6">
            <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Status</p>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-400"></div>
              <p className="text-lg font-semibold text-green-400">Connected</p>
            </div>
          </Card>
        </div>

        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>Recent Notes</h2>
            <Link href="/notes" className="text-sm hover:underline" style={{ color: 'var(--accent)' }}>
              View all →
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.recentNotes.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)' }}>No notes found.</p>
            ) : (
              data.recentNotes.map((note: any) => (
                <Link
                  key={note._id}
                  href={`/notes/${encodeURIComponent(note._id)}`}
                  className="block rounded-xl p-5 border transition-colors card-hover"
                  style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
                >
                  <h3 className="font-medium mb-2 truncate" style={{ color: 'var(--text-primary)' }}>
                    {note.title || note._id}
                  </h3>
                  <p className="text-sm line-clamp-2" style={{ color: 'var(--text-secondary)' }}>
                    {note.preview || 'No preview available'}
                  </p>
                  {note._id && (
                    <p className="text-xs mt-3 truncate" style={{ color: 'var(--text-muted)' }}>
                      {note._id}
                    </p>
                  )}
                </Link>
              ))
            )}
          </div>
        </div>

        <div className="flex gap-4 mt-10">
          <Link
            href="/notes"
            className="px-6 py-3 rounded-lg font-medium transition-opacity hover:opacity-90"
            style={{ background: 'var(--accent)', color: '#fff' }}
          >
            Browse All Notes
          </Link>
          <Link
            href="/search"
            className="px-6 py-3 rounded-lg font-medium border transition-colors"
            style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
          >
            Search Notes
          </Link>
        </div>
      </div>
    </div>
  );
}
