'use client';
import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

interface VaultInfo {
  exists: boolean;
  docCount: number;
  dbName: string;
}

interface User {
  id: string;
  email: string;
  createdAt: string | null;
  state: string;
  isAdmin: boolean;
  vault: VaultInfo;
}

type ActionState = 'idle' | 'loading' | 'done' | 'error';

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

function Badge({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ background: color + '22', color }}
    >
      {children}
    </span>
  );
}

export default function AdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actions, setActions] = useState<Record<string, ActionState>>({});
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/users');
      if (res.status === 403) { router.replace('/dashboard'); return; }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load');
      setUsers(data.users);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    if (status === 'unauthenticated') { router.replace('/login'); return; }
    if (status === 'authenticated') load();
  }, [status, load, router]);

  const provision = async (userId: string) => {
    setActions((p) => ({ ...p, [userId]: 'loading' }));
    setActionErrors((p) => { const n = { ...p }; delete n[userId]; return n; });
    try {
      const res = await fetch(`/api/admin/users/${userId}/provision`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setActions((p) => ({ ...p, [userId]: 'done' }));
      await load();
    } catch (e: any) {
      setActions((p) => ({ ...p, [userId]: 'error' }));
      setActionErrors((p) => ({ ...p, [userId]: e.message }));
    }
  };

  const deleteVault = async (userId: string, email: string) => {
    if (!confirm(`Delete vault for ${email}? All their notes will be permanently erased.`)) return;
    setActions((p) => ({ ...p, [`del-${userId}`]: 'loading' }));
    try {
      const res = await fetch(`/api/admin/users/${userId}/vault`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setActions((p) => ({ ...p, [`del-${userId}`]: 'done' }));
      await load();
    } catch (e: any) {
      setActions((p) => ({ ...p, [`del-${userId}`]: 'error' }));
      setActionErrors((p) => ({ ...p, [`del-${userId}`]: e.message }));
    }
  };

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#1a1a2e' }}>
        <div className="text-sm animate-pulse" style={{ color: '#8892a4' }}>Loading admin panel…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8" style={{ background: '#1a1a2e' }}>
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold mb-1" style={{ color: '#e0e0e0' }}>
              Admin Panel
            </h1>
            <p className="text-sm" style={{ color: '#8892a4' }}>
              {users.length} registered {users.length === 1 ? 'user' : 'users'}
            </p>
          </div>
          <button
            onClick={load}
            className="px-4 py-2 rounded-lg text-sm border transition-colors hover:bg-white/5"
            style={{ borderColor: '#2a2a4a', color: '#8892a4' }}
          >
            ↻ Refresh
          </button>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-xl border border-red-800 bg-red-900/20">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[
            { label: 'Total Users', value: users.length },
            { label: 'Active Vaults', value: users.filter((u) => u.vault.exists).length },
            { label: 'Missing Vaults', value: users.filter((u) => !u.vault.exists && !u.isAdmin).length },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl p-5 border"
              style={{ background: '#16213e', borderColor: '#2a2a4a' }}
            >
              <p className="text-xs mb-1" style={{ color: '#8892a4' }}>{stat.label}</p>
              <p className="text-3xl font-bold" style={{ color: '#7F77DD' }}>{stat.value}</p>
            </div>
          ))}
        </div>

        {/* User table */}
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: '#2a2a4a' }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: '#16213e', borderBottom: '1px solid #2a2a4a' }}>
                {['Email', 'Registered', 'Vault', 'Notes', 'Actions'].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider"
                    style={{ color: '#8892a4' }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((user, i) => {
                const provKey = user.id;
                const delKey = `del-${user.id}`;
                const provState = actions[provKey] ?? 'idle';
                const delState = actions[delKey] ?? 'idle';
                const rowErr = actionErrors[provKey] || actionErrors[delKey];

                return (
                  <tr
                    key={user.id}
                    style={{
                      background: i % 2 === 0 ? '#1a1a2e' : '#16213e',
                      borderBottom: '1px solid #2a2a4a',
                    }}
                  >
                    {/* Email */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span style={{ color: '#e0e0e0' }}>{user.email}</span>
                        {user.isAdmin && <Badge color="#7F77DD">admin</Badge>}
                        {user.state !== 'active' && (
                          <Badge color="#f87171">{user.state}</Badge>
                        )}
                      </div>
                      <p className="text-xs mt-0.5 font-mono" style={{ color: '#4a5568' }}>
                        {user.id.slice(0, 8)}…
                      </p>
                      {rowErr && (
                        <p className="text-xs mt-1" style={{ color: '#f87171' }}>{rowErr}</p>
                      )}
                    </td>

                    {/* Registered */}
                    <td className="px-4 py-3" style={{ color: '#8892a4' }}>
                      {formatDate(user.createdAt)}
                    </td>

                    {/* Vault status */}
                    <td className="px-4 py-3">
                      {user.isAdmin ? (
                        <Badge color="#7F77DD">obsidian</Badge>
                      ) : user.vault.exists ? (
                        <Badge color="#4ade80">✓ active</Badge>
                      ) : (
                        <Badge color="#f87171">✗ missing</Badge>
                      )}
                    </td>

                    {/* Note count */}
                    <td className="px-4 py-3" style={{ color: '#8892a4' }}>
                      {user.isAdmin ? '—' : user.vault.exists ? user.vault.docCount : '—'}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {!user.isAdmin && !user.vault.exists && (
                          <button
                            onClick={() => provision(user.id)}
                            disabled={provState === 'loading'}
                            className="px-3 py-1 rounded text-xs font-medium disabled:opacity-50 transition-opacity hover:opacity-80"
                            style={{ background: '#7F77DD', color: '#fff' }}
                          >
                            {provState === 'loading' ? 'Creating…' : 'Provision'}
                          </button>
                        )}
                        {!user.isAdmin && user.vault.exists && (
                          <button
                            onClick={() => deleteVault(user.id, user.email)}
                            disabled={delState === 'loading'}
                            className="px-3 py-1 rounded text-xs font-medium disabled:opacity-50 transition-opacity hover:opacity-80"
                            style={{ background: '#2d1a1a', color: '#f87171' }}
                          >
                            {delState === 'loading' ? 'Deleting…' : 'Delete Vault'}
                          </button>
                        )}
                        {!user.isAdmin && !user.vault.exists && user.vault.exists === false && provState === 'done' && (
                          <span className="text-xs" style={{ color: '#4ade80' }}>✓ created</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {users.length === 0 && !loading && (
            <div className="p-8 text-center text-sm" style={{ color: '#4a5568' }}>
              No users found
            </div>
          )}
        </div>

        <p className="mt-4 text-xs" style={{ color: '#4a5568' }}>
          Note count includes all CouchDB documents (parent + chunks). Actual notes = roughly half.
        </p>
      </div>
    </div>
  );
}
