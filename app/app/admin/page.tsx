'use client';
import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { formatBytes } from '@/lib/utils';

interface SharedVault {
  vaultId: string;
  vaultName: string;
  createdAt: number | null;
  docCount: number;
  sizeBytes: number;
}

interface VaultInfo {
  exists: boolean;
  docCount: number;
  dbName: string;
  sizeBytes: number;
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

function CopyIdButton({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(id); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="flex-shrink-0 px-1.5 py-0.5 rounded text-xs transition-colors hover:bg-white/5"
      style={{ color: copied ? '#4ade80' : 'var(--text-muted)', border: '1px solid var(--border)' }}
      title="Copy user ID"
    >
      {copied ? '✓' : 'Copy'}
    </button>
  );
}

function Toast({ msg, type }: { msg: string; type: 'success' | 'error' }) {
  return (
    <div
      className="fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl text-sm font-medium shadow-lg"
      style={{
        background: type === 'success' ? '#14532d' : '#7f1d1d',
        color: '#fff',
        border: `1px solid ${type === 'success' ? '#4ade80' : '#f87171'}`,
      }}
    >
      {type === 'success' ? '✓' : '✗'} {msg}
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  background: 'var(--bg-surface)',
  borderColor: 'var(--border)',
  color: 'var(--text-primary)',
};

export default function AdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [userTotal, setUserTotal] = useState(0);
  const [userTotalPages, setUserTotalPages] = useState(1);
  const [adminPage, setAdminPage] = useState(1);
  const USER_PAGE_LIMIT = 20;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actions, setActions] = useState<Record<string, ActionState>>({});
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'suspended'>('all');
  const [vaultFilter, setVaultFilter] = useState<'all' | 'has' | 'none'>('all');
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [sharedVaults, setSharedVaults] = useState<SharedVault[]>([]);
  const [sharedVaultsLoading, setSharedVaultsLoading] = useState(true);
  const [createVaultOpen, setCreateVaultOpen] = useState(false);
  const [newVaultName, setNewVaultName] = useState('');
  const [creating, setCreating] = useState(false);

  const showToast = useCallback((msg: string, type: 'success' | 'error') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const load = useCallback(async (page = adminPage) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/users?page=${page}&limit=${USER_PAGE_LIMIT}`);
      if (res.status === 403) { router.replace('/dashboard'); return; }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load');
      setUsers(data.users);
      setUserTotal(data.total ?? 0);
      setUserTotalPages(data.totalPages ?? 1);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, adminPage]);

  const loadSharedVaults = useCallback(async () => {
    setSharedVaultsLoading(true);
    try {
      const res = await fetch('/api/admin/vaults');
      if (!res.ok) return;
      const data = await res.json();
      setSharedVaults(data.vaults || []);
    } finally {
      setSharedVaultsLoading(false);
    }
  }, []);

  const createSharedVault = async () => {
    if (!newVaultName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/admin/vaults', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newVaultName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create');
      setCreateVaultOpen(false);
      setNewVaultName('');
      showToast(`Vault "${data.vaultName}" created`, 'success');
      await loadSharedVaults();
    } catch (e: any) {
      showToast(e.message, 'error');
    } finally {
      setCreating(false);
    }
  };

  useEffect(() => {
    if (status === 'unauthenticated') { router.replace('/login'); return; }
    if (status === 'authenticated') { load(); loadSharedVaults(); }
  }, [status, load, loadSharedVaults, router]);

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

  const deleteUser = async (userId: string, email: string) => {
    if (!confirm(`Permanently delete ${email}?\n\nThis will remove their Kratos identity, vault database, and CouchDB credentials. This cannot be undone.`)) return;
    setActions((p) => ({ ...p, [`del-${userId}`]: 'loading' }));
    try {
      const res = await fetch(`/api/admin/users/${userId}/vault`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      if (!data.success) {
        const failed = Object.entries(data.results as Record<string, string>)
          .filter(([, v]) => v !== 'ok' && v !== 'not_found')
          .map(([k]) => k).join(', ');
        showToast(`Partial delete — failed steps: ${failed}`, 'error');
      } else {
        showToast('User deleted', 'success');
      }
      setActions((p) => ({ ...p, [`del-${userId}`]: 'done' }));
      await load();
    } catch (e: any) {
      setActions((p) => ({ ...p, [`del-${userId}`]: 'error' }));
      setActionErrors((p) => ({ ...p, [`del-${userId}`]: e.message }));
    }
  };

  const deleteVault = async (userId: string, email: string) => {
    if (!confirm(`Delete vault for ${email}?\n\nThis removes their CouchDB database and credentials but keeps their account. They can re-provision later.`)) return;
    setActions((p) => ({ ...p, [`delvault-${userId}`]: 'loading' }));
    try {
      const res = await fetch(`/api/admin/users/${userId}/vault-db`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      if (!data.success) {
        const failed = Object.entries(data.results as Record<string, string>)
          .filter(([, v]) => v !== 'ok' && v !== 'not_found')
          .map(([k]) => k).join(', ');
        showToast(`Partial delete — failed steps: ${failed}`, 'error');
      } else {
        showToast('Vault deleted', 'success');
      }
      setActions((p) => ({ ...p, [`delvault-${userId}`]: 'done' }));
      await load();
    } catch (e: any) {
      setActions((p) => ({ ...p, [`delvault-${userId}`]: 'error' }));
      setActionErrors((p) => ({ ...p, [`delvault-${userId}`]: e.message }));
    }
  };

  const deleteSharedVault = async (vaultId: string, vaultName: string) => {
    if (!confirm(`Delete shared vault "${vaultName}"?\n\nThis removes the database and all member permissions. This cannot be undone.`)) return;
    setActions((p) => ({ ...p, [`delsvault-${vaultId}`]: 'loading' }));
    try {
      const res = await fetch(`/api/admin/vaults/${vaultId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      if (!data.success) {
        const failed = Object.entries(data.results as Record<string, string>)
          .filter(([, v]) => v !== 'ok' && v !== 'not_found')
          .map(([k]) => k).join(', ');
        showToast(`Partial delete — failed steps: ${failed}`, 'error');
      } else {
        showToast(`Vault "${vaultName}" deleted`, 'success');
      }
      setActions((p) => ({ ...p, [`delsvault-${vaultId}`]: 'done' }));
      await loadSharedVaults();
    } catch (e: any) {
      setActions((p) => ({ ...p, [`delsvault-${vaultId}`]: 'error' }));
      showToast(e.message, 'error');
    }
  };

  const toggleState = async (userId: string, currentState: string) => {
    const newState = currentState === 'active' ? 'inactive' : 'active';
    const key = `sus-${userId}`;
    setActions((p) => ({ ...p, [key]: 'loading' }));
    // Optimistic update
    setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, state: newState } : u));
    try {
      const res = await fetch(`/api/admin/users/${userId}/state`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: newState }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setActions((p) => ({ ...p, [key]: 'idle' }));
      showToast(
        newState === 'inactive' ? 'User suspended' : 'User reactivated',
        'success'
      );
    } catch (e: any) {
      // Revert optimistic update on failure
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, state: currentState } : u));
      setActions((p) => ({ ...p, [key]: 'error' }));
      showToast(e.message, 'error');
    }
  };

  // Client-side filtering
  const filteredUsers = users.filter((u) => {
    if (search && !u.email.toLowerCase().includes(search.toLowerCase())) return false;
    if (statusFilter === 'active' && u.state !== 'active') return false;
    if (statusFilter === 'suspended' && u.state === 'active') return false;
    if (vaultFilter === 'has' && !u.vault.exists) return false;
    if (vaultFilter === 'none' && u.vault.exists) return false;
    return true;
  });

  const suspendedCount = users.filter((u) => !u.isAdmin && u.state !== 'active').length;

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-base)' }}>
        <div className="text-sm animate-pulse" style={{ color: 'var(--text-secondary)' }}>Loading admin panel…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8" style={{ background: 'var(--bg-base)' }}>
      {toast && <Toast msg={toast.msg} type={toast.type} />}

      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
              Admin Panel
            </h1>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              {userTotal} registered {userTotal === 1 ? 'user' : 'users'}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => load()}>
            ↻ Refresh
          </Button>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-xl border border-red-800 bg-red-900/20">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {/* Stats row */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Total Users', value: users.length },
            { label: 'Active Vaults', value: users.filter((u) => u.vault.exists).length },
            { label: 'Suspended', value: suspendedCount },
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

          {/* Filters */}
          <div
            className="flex gap-3 p-3 border-b"
            style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
          >
            <input
              type="text"
              placeholder="Search by email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 px-3 py-1.5 rounded-lg border text-sm outline-none"
              style={{ background: 'var(--bg-base)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
              className="px-3 py-1.5 rounded-lg border text-sm outline-none"
              style={selectStyle}
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
            </select>
            <select
              value={vaultFilter}
              onChange={(e) => setVaultFilter(e.target.value as typeof vaultFilter)}
              className="px-3 py-1.5 rounded-lg border text-sm outline-none"
              style={selectStyle}
            >
              <option value="all">All Vaults</option>
              <option value="has">Has Vault</option>
              <option value="none">No Vault</option>
            </select>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)' }}>
                {['Email', 'Registered', 'Vault', 'Docs', 'Actions'].map((h) => (
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
              {filteredUsers.map((user, i) => {
                const provKey = user.id;
                const delKey = `del-${user.id}`;
                const delVaultKey = `delvault-${user.id}`;
                const susKey = `sus-${user.id}`;
                const provState = actions[provKey] ?? 'idle';
                const delState = actions[delKey] ?? 'idle';
                const delVaultState = actions[delVaultKey] ?? 'idle';
                const susState = actions[susKey] ?? 'idle';
                const rowErr = actionErrors[provKey] || actionErrors[delKey] || actionErrors[delVaultKey];
                const isSelf = user.id === session?.user?.id;

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
                      <div className="flex items-center gap-2 flex-wrap">
                        <span style={{ color: 'var(--text-primary)' }}>{user.email}</span>
                        {user.isAdmin && <Badge color="var(--accent)">admin</Badge>}
                        {user.state !== 'active' && (
                          <Badge color="#f87171">{user.state}</Badge>
                        )}
                        {/* Suspend / Reactivate toggle — next to state badge */}
                        {!user.isAdmin && !isSelf && (
                          <button
                            onClick={() => toggleState(user.id, user.state)}
                            disabled={susState === 'loading'}
                            className="px-2 py-0.5 rounded text-xs font-medium transition-opacity hover:opacity-80 disabled:opacity-50"
                            style={
                              user.state === 'active'
                                ? { background: '#7f1d1d22', color: '#f87171', border: '1px solid #f8717144' }
                                : { background: '#14532d22', color: '#4ade80', border: '1px solid #4ade8044' }
                            }
                          >
                            {susState === 'loading'
                              ? '…'
                              : user.state === 'active'
                              ? 'Suspend'
                              : 'Reactivate'}
                          </button>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <p className="text-xs font-mono truncate" style={{ color: 'var(--text-muted)', maxWidth: 260 }}>
                          {user.id}
                        </p>
                        <CopyIdButton id={user.id} />
                      </div>
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

                    {/* Docs + size */}
                    <td className="px-4 py-3">
                      {user.isAdmin ? (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                      ) : user.vault.exists ? (
                        <>
                          <p style={{ color: 'var(--text-secondary)' }}>{user.vault.docCount} docs</p>
                          {user.vault.sizeBytes > 0 && (
                            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                              {formatBytes(user.vault.sizeBytes)}
                            </p>
                          )}
                        </>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 flex-wrap">
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
                            loading={delVaultState === 'loading'}
                            onClick={() => deleteVault(user.id, user.email)}
                          >
                            {delVaultState === 'loading' ? 'Deleting…' : 'Delete Vault'}
                          </Button>
                        )}
                        {!user.isAdmin && (
                          <Button
                            size="sm"
                            variant="danger"
                            loading={delState === 'loading'}
                            onClick={() => deleteUser(user.id, user.email)}
                          >
                            {delState === 'loading' ? 'Deleting…' : 'Delete User'}
                          </Button>
                        )}
                        {!user.isAdmin && !user.vault.exists && provState === 'done' && (
                          <span className="text-xs" style={{ color: '#4ade80' }}>✓ provisioned</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {filteredUsers.length === 0 && !loading && (
            <div className="p-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
              {users.length === 0 ? 'No users found' : 'No users match the current filters'}
            </div>
          )}
        </div>

        {/* Pagination controls */}
        {userTotalPages > 1 && (
          <div className="mt-4 flex items-center justify-between">
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Showing {(adminPage - 1) * USER_PAGE_LIMIT + 1}–{Math.min(adminPage * USER_PAGE_LIMIT, userTotal)} of {userTotal} users
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost" size="sm"
                onClick={() => { setAdminPage((p) => p - 1); load(adminPage - 1); }}
                disabled={adminPage <= 1}
              >← Prev</Button>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Page {adminPage} of {userTotalPages}
              </span>
              <Button
                variant="ghost" size="sm"
                onClick={() => { setAdminPage((p) => p + 1); load(adminPage + 1); }}
                disabled={adminPage >= userTotalPages}
              >Next →</Button>
            </div>
          </div>
        )}

        <p className="mt-4 text-xs" style={{ color: 'var(--text-muted)' }}>
          Doc count includes parent + chunk documents. Actual notes ≈ half. Vault size = CouchDB active data size.
        </p>

        {/* Shared Vaults section */}
        <div className="mt-12">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>Shared Vaults</h2>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                Collaborative vaults accessible by multiple users
              </p>
            </div>
            <Button size="sm" onClick={() => setCreateVaultOpen(true)}>+ Create Vault</Button>
          </div>

          {sharedVaultsLoading ? (
            <div className="p-6 text-center text-sm animate-pulse" style={{ color: 'var(--text-secondary)' }}>
              Loading…
            </div>
          ) : sharedVaults.length === 0 ? (
            <div
              className="p-8 rounded-xl border text-center text-sm"
              style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
            >
              No shared vaults yet
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {sharedVaults.map((sv) => {
                const delSVState = actions[`delsvault-${sv.vaultId}`] ?? 'idle';
                return (
                  <Card key={sv.vaultId} className="p-5">
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="min-w-0">
                        <p className="font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                          {sv.vaultName}
                        </p>
                        <p className="text-xs font-mono truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>
                          {sv.vaultId}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Link href={`/admin/vaults/${sv.vaultId}`}>
                          <Button size="sm" variant="ghost">Manage</Button>
                        </Link>
                        <Button
                          size="sm"
                          variant="danger"
                          loading={delSVState === 'loading'}
                          onClick={() => deleteSharedVault(sv.vaultId, sv.vaultName)}
                        >
                          {delSVState === 'loading' ? 'Deleting…' : 'Delete'}
                        </Button>
                      </div>
                    </div>
                    <div className="flex gap-4 text-xs" style={{ color: 'var(--text-secondary)' }}>
                      <span>{sv.docCount} docs</span>
                      {sv.sizeBytes > 0 && <span>{formatBytes(sv.sizeBytes)}</span>}
                      {sv.createdAt && (
                        <span>
                          {new Date(sv.createdAt).toLocaleDateString('en-US', {
                            year: 'numeric', month: 'short', day: 'numeric',
                          })}
                        </span>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Create shared vault modal */}
      {createVaultOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={(e) => e.target === e.currentTarget && setCreateVaultOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl p-6 shadow-2xl"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
          >
            <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
              Create Shared Vault
            </h3>
            <input
              type="text"
              placeholder="Vault name"
              value={newVaultName}
              onChange={(e) => setNewVaultName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && createSharedVault()}
              autoFocus
              className="w-full px-3 py-2 rounded-lg border text-sm outline-none mb-4"
              style={{ background: 'var(--bg-base)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            />
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => setCreateVaultOpen(false)}>Cancel</Button>
              <Button size="sm" loading={creating} onClick={createSharedVault}>Create</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
