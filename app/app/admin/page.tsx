'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
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

// Extra personal vaults (uvault-<userId>-<slug>) created via "My Vaults".
interface ExtraVault {
  dbName: string;
  name: string;
  docCount: number;
  sizeBytes: number;
}

interface User {
  id: string;
  email: string;
  createdAt: string | null;
  state: string;
  isAdmin: boolean;
  vault: VaultInfo;
  extraVaults: ExtraVault[];
  provider?: 'local' | 'sso';
}

interface Stats {
  total: number;
  activeVaults: number;
  suspended: number;
  missingVaults: number;
}

type ActionState = 'idle' | 'loading' | 'done' | 'error';

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

function useDebounced(value: string, ms: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

// ─── Small UI atoms ───────────────────────────────────────────────────────────

function Badge({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium"
      style={{ background: color + '1e', color, border: `1px solid ${color}33` }}
    >
      {children}
    </span>
  );
}

function StatusDot({ active }: { active: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: active ? '#4ade80' : '#f87171' }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'currentColor' }} />
      {active ? 'Active' : 'Suspended'}
    </span>
  );
}

function Avatar({ email }: { email: string }) {
  const letter = (email[0] ?? '?').toUpperCase();
  // Stable hue per email so avatars are distinguishable but consistent.
  let hash = 0;
  for (let i = 0; i < email.length; i++) hash = (hash * 31 + email.charCodeAt(i)) | 0;
  const hue = Math.abs(hash) % 360;
  return (
    <span
      className="flex items-center justify-center flex-shrink-0 rounded-full text-xs font-semibold"
      style={{
        width: 30, height: 30,
        background: `hsla(${hue}, 45%, 55%, 0.18)`,
        color: `hsl(${hue}, 65%, 72%)`,
        border: `1px solid hsla(${hue}, 45%, 60%, 0.3)`,
      }}
    >
      {letter}
    </span>
  );
}

function CopyIdButton({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(id); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="admin-copy-id flex-shrink-0 px-1.5 rounded text-[11px] transition-colors hover:bg-white/5"
      style={{ color: copied ? '#4ade80' : 'var(--text-muted)' }}
      title="Copy user ID"
    >
      {copied ? '✓ copied' : 'copy'}
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

// ─── Row actions menu (⋯) ─────────────────────────────────────────────────────
// Fixed-position dropdown so it never gets clipped by the table container.

interface MenuItem {
  label: string;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

function RowMenu({ items }: { items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function close(e: MouseEvent) {
      if (menuRef.current?.contains(e.target as Node)) return;
      if (btnRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    }
    const closeOnScroll = () => setOpen(false);
    document.addEventListener('mousedown', close);
    window.addEventListener('scroll', closeOnScroll, true);
    window.addEventListener('resize', closeOnScroll);
    return () => {
      document.removeEventListener('mousedown', close);
      window.removeEventListener('scroll', closeOnScroll, true);
      window.removeEventListener('resize', closeOnScroll);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => {
          const r = btnRef.current?.getBoundingClientRect();
          if (r) setPos({ x: r.right, y: r.bottom + 4 });
          setOpen((o) => !o);
        }}
        title="Actions"
        className="w-7 h-7 rounded-md flex items-center justify-center transition-colors hover:bg-white/10"
        style={{
          border: '1px solid var(--border)',
          background: open ? 'rgba(255,255,255,0.08)' : 'transparent',
          color: open ? '#fff' : 'var(--text-muted)',
          cursor: 'pointer',
        }}
      >
        <svg width="13" height="13" viewBox="0 0 14 14" fill="currentColor">
          <circle cx="2.5" cy="7" r="1.3" />
          <circle cx="7" cy="7" r="1.3" />
          <circle cx="11.5" cy="7" r="1.3" />
        </svg>
      </button>

      {open && (
        <div
          ref={menuRef}
          style={{
            position: 'fixed', top: pos.y, left: pos.x, transform: 'translateX(-100%)',
            zIndex: 100, minWidth: 180, padding: '4px 0',
            background: '#1e2030', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          }}
        >
          {items.map((item, i) => (
            <button
              key={`${item.label}-${i}`}
              disabled={item.disabled}
              onClick={() => { setOpen(false); item.onClick(); }}
              className="block w-full text-left px-3.5 py-1.5 text-[13px] transition-colors disabled:opacity-40"
              style={{
                background: 'transparent', border: 'none',
                color: item.danger ? '#f87171' : 'rgba(255,255,255,0.82)',
                cursor: item.disabled ? 'default' : 'pointer',
              }}
              onMouseEnter={(e) => { if (!item.disabled) e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

const selectStyle: React.CSSProperties = {
  background: 'var(--bg-surface)',
  borderColor: 'var(--border)',
  color: 'var(--text-primary)',
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [userTotal, setUserTotal] = useState(0);
  const [userTotalPages, setUserTotalPages] = useState(1);
  const [adminPage, setAdminPage] = useState(1);
  const USER_PAGE_LIMIT = 20;
  const [loading, setLoading] = useState(true);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [error, setError] = useState('');
  const [actions, setActions] = useState<Record<string, ActionState>>({});
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search, 300);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'suspended'>('all');
  const [vaultFilter, setVaultFilter] = useState<'all' | 'has' | 'none'>('all');
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [sharedVaults, setSharedVaults] = useState<SharedVault[]>([]);
  const [sharedVaultsLoading, setSharedVaultsLoading] = useState(true);
  const [createVaultOpen, setCreateVaultOpen] = useState(false);
  const [newVaultName, setNewVaultName] = useState('');
  const [creating, setCreating] = useState(false);
  // Per-user vault management modal. Stores the user ID and derives the user
  // from `users` each render, so the list updates live after deletions.
  const [manageVaultsUserId, setManageVaultsUserId] = useState<string | null>(null);

  const showToast = useCallback((msg: string, type: 'success' | 'error') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const load = useCallback(async (page: number, opts?: { quiet?: boolean }) => {
    if (!opts?.quiet) setLoading(true);
    setError('');
    try {
      const qs = new URLSearchParams({
        page: String(page),
        limit: String(USER_PAGE_LIMIT),
        state: statusFilter,
        vault: vaultFilter,
      });
      if (debouncedSearch.trim()) qs.set('search', debouncedSearch.trim());
      const res = await fetch(`/api/admin/users?${qs}`);
      if (res.status === 403) { router.replace('/notes'); return; }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load');
      setUsers(data.users);
      setStats(data.stats ?? null);
      setUserTotal(data.total ?? 0);
      setUserTotalPages(data.totalPages ?? 1);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
      setInitialLoaded(true);
    }
  }, [router, debouncedSearch, statusFilter, vaultFilter]);

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

  // Initial load + reload on search/filter changes (page resets to 1).
  useEffect(() => {
    if (status === 'unauthenticated') { router.replace('/login'); return; }
    if (status !== 'authenticated') return;
    setAdminPage(1);
    load(1);
  }, [status, load, router]);

  useEffect(() => {
    if (status === 'authenticated') loadSharedVaults();
  }, [status, loadSharedVaults]);

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

  const provision = async (userId: string) => {
    setActions((p) => ({ ...p, [userId]: 'loading' }));
    try {
      const res = await fetch(`/api/admin/users/${userId}/provision`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setActions((p) => ({ ...p, [userId]: 'done' }));
      showToast('Vault provisioned', 'success');
      await load(adminPage, { quiet: true });
    } catch (e: any) {
      setActions((p) => ({ ...p, [userId]: 'error' }));
      showToast(e.message, 'error');
    }
  };

  async function runDelete(url: string, key: string, successMsg: string, after: () => Promise<void>) {
    setActions((p) => ({ ...p, [key]: 'loading' }));
    try {
      const res = await fetch(url, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      if (data.success === false) {
        const failed = Object.entries(data.results as Record<string, string>)
          .filter(([, v]) => v !== 'ok' && v !== 'not_found')
          .map(([k]) => k).join(', ');
        showToast(`Partial delete — failed steps: ${failed}`, 'error');
      } else {
        showToast(successMsg, 'success');
      }
      setActions((p) => ({ ...p, [key]: 'done' }));
      await after();
    } catch (e: any) {
      setActions((p) => ({ ...p, [key]: 'error' }));
      showToast(e.message, 'error');
    }
  }

  const deleteUser = (userId: string, email: string, extraCount: number, isSso: boolean) => {
    const extras = extraCount > 0
      ? ` (including ${extraCount} extra personal vault${extraCount !== 1 ? 's' : ''})`
      : '';
    // SSO users have no local Kratos identity to remove — deleting them just
    // drops their vault data and the rexform-sso-users registry entry. Their
    // central IAM account is unaffected (that's the other REXFORM apps' data).
    const identityLine = isSso
      ? `This will remove their vault databases${extras}, CouchDB credentials, and SSO registry entry (their central IAM account is untouched).`
      : `This will remove their Kratos identity, vault databases${extras}, and CouchDB credentials.`;
    if (!confirm(`Permanently delete ${email}?\n\n${identityLine} This cannot be undone.`)) return;
    runDelete(`/api/admin/users/${userId}/vault`, `del-${userId}`, 'User deleted', () => load(adminPage, { quiet: true }));
  };

  const deleteVault = (userId: string, email: string) => {
    if (!confirm(`Delete primary vault for ${email}?\n\nThis removes their CouchDB database and credentials but keeps their account and any extra vaults. They can re-provision later.`)) return;
    runDelete(`/api/admin/users/${userId}/vault-db`, `delvault-${userId}`, 'Vault deleted', () => load(adminPage, { quiet: true }));
  };

  const deleteExtraVault = (dbName: string, name: string, email: string) => {
    if (!confirm(`Delete vault "${name}" belonging to ${email}?\n\nThis removes the database and its access permissions. This cannot be undone.`)) return;
    runDelete(`/api/admin/vaults/${dbName}`, `deluvault-${dbName}`, `Vault "${name}" deleted`, () => load(adminPage, { quiet: true }));
  };

  const deleteSharedVault = (vaultId: string, vaultName: string) => {
    if (!confirm(`Delete shared vault "${vaultName}"?\n\nThis removes the database and all member permissions. This cannot be undone.`)) return;
    runDelete(`/api/admin/vaults/${vaultId}`, `delsvault-${vaultId}`, `Vault "${vaultName}" deleted`, loadSharedVaults);
  };

  const toggleState = async (userId: string, currentState: string) => {
    const newState = currentState === 'active' ? 'inactive' : 'active';
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
      showToast(newState === 'inactive' ? 'User suspended' : 'User reactivated', 'success');
    } catch (e: any) {
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, state: currentState } : u));
      showToast(e.message, 'error');
    }
  };

  if (status === 'loading' || (!initialLoaded && loading)) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-base)' }}>
        <div className="text-sm animate-pulse" style={{ color: 'var(--text-secondary)' }}>Loading admin panel…</div>
      </div>
    );
  }

  const statCards = [
    { label: 'Total Users', value: stats?.total ?? userTotal },
    { label: 'Active Vaults', value: stats?.activeVaults ?? 0 },
    { label: 'Suspended', value: stats?.suspended ?? 0 },
    { label: 'Missing Vaults', value: stats?.missingVaults ?? 0 },
  ];

  return (
    <div className="min-h-screen p-8" style={{ background: 'var(--bg-base)' }}>
      {toast && <Toast msg={toast.msg} type={toast.type} />}
      {/* Copy-id affordance appears on row hover only */}
      <style dangerouslySetInnerHTML={{ __html: `
        .admin-user-row .admin-copy-id { opacity: 0; transition: opacity 0.12s; }
        .admin-user-row:hover .admin-copy-id { opacity: 1; }
        .admin-user-row:hover { background: rgba(255,255,255,0.025); }
      ` }} />

      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
              Admin Panel
            </h1>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Manage users, vaults and shared workspaces
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => { load(adminPage); loadSharedVaults(); }}>
            ↻ Refresh
          </Button>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-xl border" style={{ borderColor: 'rgba(248,113,113,0.3)', background: 'rgba(248,113,113,0.07)' }}>
            <p className="text-sm font-medium mb-1" style={{ color: '#f87171' }}>Couldn&apos;t load users</p>
            <p className="text-xs leading-relaxed" style={{ color: 'rgba(248,113,113,0.8)' }}>{error}</p>
          </div>
        )}

        {/* Stats row */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          {statCards.map((stat) => (
            <Card key={stat.label} className="p-5">
              <p className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>{stat.label}</p>
              <p className="text-3xl font-bold" style={{ color: 'var(--accent)' }}>{stat.value}</p>
            </Card>
          ))}
        </div>

        {/* User table */}
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>

          {/* Filters — applied server-side across ALL users, not just this page */}
          <div
            className="flex gap-3 p-3 border-b"
            style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
          >
            <input
              type="text"
              placeholder="Search by email or user ID…"
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

          <table className="w-full text-sm" style={{ opacity: loading ? 0.55 : 1, transition: 'opacity 0.15s' }}>
            <thead>
              <tr style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)' }}>
                {['User', 'Registered', 'Vault', 'Status', ''].map((h, i) => (
                  <th
                    key={i}
                    className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const isSelf = user.id === session?.user?.id;
                const extraVaults = user.extraVaults ?? [];
                const busy =
                  actions[user.id] === 'loading' ||
                  actions[`del-${user.id}`] === 'loading' ||
                  actions[`delvault-${user.id}`] === 'loading' ||
                  extraVaults.some((v) => actions[`deluvault-${v.dbName}`] === 'loading');

                const extraDocs = extraVaults.reduce((n, v) => n + v.docCount, 0);
                const extraSize = extraVaults.reduce((n, v) => n + v.sizeBytes, 0);

                // SSO users have no local Kratos identity to suspend (that's
                // a Kratos identity-state flip), so they don't get that
                // action — but deleting them is still supported (it just
                // skips the Kratos step and clears their SSO registry entry
                // instead).
                const isSso = user.provider === 'sso';
                const menuItems: MenuItem[] = [];
                if (!user.isAdmin && !isSelf && !isSso) {
                  menuItems.push({
                    label: user.state === 'active' ? 'Suspend user' : 'Reactivate user',
                    onClick: () => toggleState(user.id, user.state),
                  });
                }
                if (!user.isAdmin && !user.vault.exists) {
                  menuItems.push({ label: 'Provision vault', onClick: () => provision(user.id) });
                }
                if (!user.isAdmin && (user.vault.exists || extraVaults.length > 0)) {
                  menuItems.push({ label: 'Manage vaults…', onClick: () => setManageVaultsUserId(user.id) });
                }
                if (!user.isAdmin) {
                  menuItems.push({ label: 'Delete user…', danger: true, onClick: () => deleteUser(user.id, user.email, extraVaults.length, isSso) });
                }

                return (
                  <tr
                    key={user.id}
                    className="admin-user-row"
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
                  >
                    {/* User */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar email={user.email} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="truncate" style={{ color: 'var(--text-primary)', maxWidth: 260 }}>
                              {user.email}
                            </span>
                            {user.isAdmin && <Badge color="#7F77DD">admin</Badge>}
                            {isSelf && !user.isAdmin && <Badge color="#60a5fa">you</Badge>}
                            {isSso && <Badge color="#9B7FFF">SSO</Badge>}
                          </div>
                          <div className="flex items-center gap-1 mt-0.5">
                            <span className="text-[11px] font-mono truncate" style={{ color: 'var(--text-muted)', maxWidth: 230 }}>
                              {user.id}
                            </span>
                            <CopyIdButton id={user.id} />
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Registered */}
                    <td className="px-4 py-3 whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
                      {formatDate(user.createdAt)}
                    </td>

                    {/* Vault */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      {user.isAdmin ? (
                        <Badge color="#7F77DD">obsidian</Badge>
                      ) : user.vault.exists ? (
                        <div>
                          <span style={{ color: 'var(--text-secondary)' }}>{user.vault.docCount} docs</span>
                          {user.vault.sizeBytes > 0 && (
                            <span className="text-xs ml-1.5" style={{ color: 'var(--text-muted)' }}>
                              · {formatBytes(user.vault.sizeBytes)}
                            </span>
                          )}
                        </div>
                      ) : (
                        <Badge color="#fbbf24">no vault</Badge>
                      )}
                      {extraVaults.length > 0 && (
                        <button
                          onClick={() => setManageVaultsUserId(user.id)}
                          className="block text-[11px] mt-0.5 truncate hover:underline"
                          style={{
                            color: 'var(--text-muted)', maxWidth: 220,
                            background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left',
                          }}
                          title="Manage vaults"
                        >
                          + {extraVaults.length} extra vault{extraVaults.length !== 1 ? 's' : ''} · {extraDocs} docs
                          {extraSize > 0 && <> · {formatBytes(extraSize)}</>}
                        </button>
                      )}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <StatusDot active={user.state === 'active'} />
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3 text-right" style={{ width: 52 }}>
                      {busy ? (
                        <span className="text-xs animate-pulse" style={{ color: 'var(--text-muted)' }}>…</span>
                      ) : menuItems.length > 0 ? (
                        <RowMenu items={menuItems} />
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {users.length === 0 && !loading && !error && (
            <div className="p-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
              {debouncedSearch || statusFilter !== 'all' || vaultFilter !== 'all'
                ? 'No users match the current search/filters'
                : 'No users found'}
            </div>
          )}
        </div>

        {/* Pagination */}
        {userTotalPages > 1 && (
          <div className="mt-4 flex items-center justify-between">
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Showing {(adminPage - 1) * USER_PAGE_LIMIT + 1}–{Math.min(adminPage * USER_PAGE_LIMIT, userTotal)} of {userTotal}
              {debouncedSearch || statusFilter !== 'all' || vaultFilter !== 'all' ? ' matching' : ''} users
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost" size="sm"
                onClick={() => { const p = adminPage - 1; setAdminPage(p); load(p); }}
                disabled={adminPage <= 1}
              >← Prev</Button>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Page {adminPage} of {userTotalPages}
              </span>
              <Button
                variant="ghost" size="sm"
                onClick={() => { const p = adminPage + 1; setAdminPage(p); load(p); }}
                disabled={adminPage >= userTotalPages}
              >Next →</Button>
            </div>
          </div>
        )}

        <p className="mt-4 text-xs" style={{ color: 'var(--text-muted)' }}>
          Doc count includes parent + chunk documents; actual notes ≈ half. Vault size = CouchDB active data size.
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
            <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)' }}>
                    {['Vault', 'Created', 'Docs', 'Size', ''].map((h, i) => (
                      <th
                        key={i}
                        className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sharedVaults.map((sv) => {
                    const svBusy = actions[`delsvault-${sv.vaultId}`] === 'loading';
                    return (
                      <tr
                        key={sv.vaultId}
                        className="admin-user-row"
                        style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
                      >
                        <td className="px-4 py-3">
                          <div className="min-w-0">
                            <p className="font-medium truncate" style={{ color: 'var(--text-primary)', maxWidth: 320 }}>
                              {sv.vaultName}
                            </p>
                            <p className="text-[11px] font-mono truncate mt-0.5" style={{ color: 'var(--text-muted)', maxWidth: 320 }}>
                              {sv.vaultId}
                            </p>
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
                          {sv.createdAt
                            ? new Date(sv.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
                            : '—'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
                          {sv.docCount}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
                          {sv.sizeBytes > 0 ? formatBytes(sv.sizeBytes) : '—'}
                        </td>
                        <td className="px-4 py-3 text-right" style={{ width: 52 }}>
                          {svBusy ? (
                            <span className="text-xs animate-pulse" style={{ color: 'var(--text-muted)' }}>…</span>
                          ) : (
                            <RowMenu
                              items={[
                                { label: 'Manage members', onClick: () => router.push(`/admin/vaults/${sv.vaultId}`) },
                                { label: 'Delete vault…', danger: true, onClick: () => deleteSharedVault(sv.vaultId, sv.vaultName) },
                              ]}
                            />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
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

      {/* Per-user vault management modal */}
      {(() => {
        const mUser = manageVaultsUserId ? users.find((u) => u.id === manageVaultsUserId) : undefined;
        if (!mUser) return null;
        const mExtras = mUser.extraVaults ?? [];
        const rows = [
          ...(mUser.vault.exists
            ? [{
                key: 'primary',
                name: 'Primary vault',
                dbName: mUser.vault.dbName,
                docCount: mUser.vault.docCount,
                sizeBytes: mUser.vault.sizeBytes,
                primary: true,
                busy: actions[`delvault-${mUser.id}`] === 'loading',
                onDelete: () => deleteVault(mUser.id, mUser.email),
              }]
            : []),
          ...mExtras.map((v) => ({
            key: v.dbName,
            name: v.name,
            dbName: v.dbName,
            docCount: v.docCount,
            sizeBytes: v.sizeBytes,
            primary: false,
            busy: actions[`deluvault-${v.dbName}`] === 'loading',
            onDelete: () => deleteExtraVault(v.dbName, v.name, mUser.email),
          })),
        ];
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.6)' }}
            onClick={(e) => e.target === e.currentTarget && setManageVaultsUserId(null)}
          >
            <div
              className="w-full max-w-lg rounded-2xl p-6 shadow-2xl"
              style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
            >
              <div className="flex items-start justify-between gap-3 mb-1">
                <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Manage Vaults
                </h3>
                <button
                  onClick={() => setManageVaultsUserId(null)}
                  className="w-7 h-7 rounded-md flex items-center justify-center transition-colors hover:bg-white/10 flex-shrink-0"
                  style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 15 }}
                  title="Close"
                >
                  ✕
                </button>
              </div>
              <p className="text-xs mb-4 truncate" style={{ color: 'var(--text-muted)' }}>{mUser.email}</p>

              {rows.length === 0 ? (
                <p className="text-sm py-6 text-center" style={{ color: 'var(--text-muted)' }}>
                  This user has no vaults.
                </p>
              ) : (
                <div className="space-y-2 overflow-y-auto" style={{ maxHeight: '55vh' }}>
                  {rows.map((row) => (
                    <div
                      key={row.key}
                      className="flex items-center gap-3 p-3 rounded-lg border"
                      style={{ borderColor: 'var(--border)', background: 'var(--bg-base)' }}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                            {row.name}
                          </span>
                          {row.primary && <Badge color="#7F77DD">primary</Badge>}
                        </div>
                        <p className="text-[11px] font-mono truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>
                          {row.dbName}
                        </p>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                          {row.docCount} docs
                          {row.sizeBytes > 0 && <> · {formatBytes(row.sizeBytes)}</>}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="danger"
                        loading={row.busy}
                        onClick={row.onDelete}
                      >
                        {row.busy ? 'Deleting…' : 'Delete'}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
