'use client';
import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';

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
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-base)' }}>
        <div className="text-sm animate-pulse" style={{ color: 'var(--text-secondary)' }}>Loading admin panel…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8" style={{ background: 'var(--bg-base)' }}>
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
              Admin Panel
            </h1>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              {users.length} registered {users.length === 1 ? 'user' : 'users'}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={load}>
            ↻ Refresh
          </Button>
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
            <Card key={stat.label} className="p-5">
              <p className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>{stat.label}</p>
              <p className="text-3xl font-bold" style={{ color: 'var(--accent)' }}>{stat.value}</p>
            </Card>
          ))}
        </div>

        {/* User table */}
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)' }}>
                {['Email', 'Registered', 'Vault', 'Notes', 'Actions'].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider"
                    style={{ color: 'var(--text-secondary)' }}
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
                      background: i % 2 === 0 ? 'var(--bg-base)' : 'var(--bg-surface)',
                      borderBottom: '1px solid var(--border)',
                    }}
                  >
                    {/* Email */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span style={{ color: 'var(--text-primary)' }}>{user.email}</span>
                        {user.isAdmin && <Badge color="var(--accent)">admin</Badge>}
                        {user.state !== 'active' && (
                          <Badge color="#f87171">{user.state}</Badge>
                        )}
                      </div>
                      <p className="text-xs mt-0.5 font-mono" style={{ color: 'var(--text-muted)' }}>
                        {user.id.slice(0, 8)}…
                      </p>
                      {rowErr && (
                        <p className="text-xs mt-1" style={{ color: '#f87171' }}>{rowErr}</p>
                      )}
                    </td>

                    {/* Registered */}
                    <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>
                      {formatDate(user.createdAt)}
                    </td>

                    {/* Vault status */}
                    <td className="px-4 py-3">
                      {user.isAdmin ? (
                        <Badge color="var(--accent)">obsidian</Badge>
                      ) : user.vault.exists ? (
                        <Badge color="#4ade80">✓ active</Badge>
                      ) : (
                        <Badge color="#f87171">✗ missing</Badge>
                      )}
                    </td>

                    {/* Note count */}
                    <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>
                      {user.isAdmin ? '—' : user.vault.exists ? user.vault.docCount : '—'}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {!user.isAdmin && !user.vault.exists && (
                          <Button
                            size="sm"
                            loading={provState === 'loading'}
                            onClick={() => provision(user.id)}
                          >
                            {provState === 'loading' ? 'Creating…' : 'Provision'}
                          </Button>
                        )}
                        {!user.isAdmin && user.vault.exists && (
                          <Button
                            size="sm"
                            variant="danger"
                            loading={delState === 'loading'}
                            onClick={() => deleteVault(user.id, user.email)}
                          >
                            {delState === 'loading' ? 'Deleting…' : 'Delete Vault'}
                          </Button>
                        )}
                        {!user.isAdmin && !user.vault.exists && provState === 'done' && (
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
            <div className="p-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
              No users found
            </div>
          )}
        </div>

        <p className="mt-4 text-xs" style={{ color: 'var(--text-muted)' }}>
          Note count includes all CouchDB documents (parent + chunks). Actual notes = roughly half.
        </p>
      </div>
    </div>
  );
}
