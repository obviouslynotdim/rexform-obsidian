'use client';
import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';

type VaultRole = 'owner' | 'editor' | 'viewer';

interface Member {
  userId: string;
  role: VaultRole;
  email: string | null;
}

interface UserOption {
  id: string;
  email: string;
}

// Sections render in this order — highest privilege first.
const ROLE_ORDER: VaultRole[] = ['owner', 'editor', 'viewer'];

const ROLE_META: Record<VaultRole, { color: string; plural: string; desc: string }> = {
  owner:  { color: '#7F77DD', plural: 'Owners',  desc: 'Full access — manage notes and members' },
  editor: { color: '#4ade80', plural: 'Editors', desc: 'Can read and write notes' },
  viewer: { color: '#94a3b8', plural: 'Viewers', desc: 'Read-only access' },
};

// Same stable-hue avatar as the admin users table.
function Avatar({ email }: { email: string }) {
  const letter = (email[0] ?? '?').toUpperCase();
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

export default function VaultDetailPage() {
  const { status } = useSession();
  const router = useRouter();
  const params = useParams();
  const vaultId = params.vaultId as string;

  const [members, setMembers] = useState<Member[]>([]);
  const [vaultName, setVaultName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  // Per-member busy flag while a role change / removal is in flight.
  const [rowBusy, setRowBusy] = useState<Record<string, boolean>>({});

  // Add member state
  const [allUsers, setAllUsers] = useState<UserOption[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState<UserOption | null>(null);
  const [newRole, setNewRole] = useState<VaultRole>('viewer');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const showToast = useCallback((msg: string, type: 'success' | 'error') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const loadMembers = useCallback(async () => {
    setError('');
    try {
      const res = await fetch(`/api/admin/vaults/${vaultId}/members`);
      if (res.status === 403) { router.replace('/dashboard'); return; }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load');
      setMembers(data.members);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [vaultId, router]);

  // Display name comes from the vaults list (rexform-metadata) — non-critical.
  const loadVaultName = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/vaults');
      if (!res.ok) return;
      const data = await res.json();
      const v = (data.vaults || []).find((x: any) => x.vaultId === vaultId);
      if (v?.vaultName) setVaultName(v.vaultName);
    } catch {}
  }, [vaultId]);

  const loadAllUsers = useCallback(async () => {
    try {
      // Fetch up to 200 users for the search dropdown
      const res = await fetch('/api/admin/users?page=1&limit=200');
      if (!res.ok) return;
      const data = await res.json();
      setAllUsers((data.users || []).map((u: any) => ({ id: u.id, email: u.email })));
    } catch {
      // non-critical — falls back to manual UUID entry
    }
  }, []);

  useEffect(() => {
    if (status === 'unauthenticated') { router.replace('/login'); return; }
    if (status === 'authenticated') { loadMembers(); loadVaultName(); loadAllUsers(); }
  }, [status, loadMembers, loadVaultName, loadAllUsers, router]);

  // Users already in the vault shouldn't reappear in the add-member search.
  const memberIds = new Set(members.map((m) => m.userId));
  const candidates = allUsers.filter((u) => !memberIds.has(u.id));
  const filteredUsers = userSearch.trim()
    ? candidates.filter((u) =>
        u.email.toLowerCase().includes(userSearch.toLowerCase()) ||
        u.id.toLowerCase().includes(userSearch.toLowerCase())
      )
    : candidates;

  const addMember = async () => {
    const userId = selectedUser?.id || userSearch.trim();
    if (!userId) return;
    if (memberIds.has(userId)) {
      setAddError('Already a member — change their role in the list below.');
      return;
    }
    setAdding(true);
    setAddError('');
    try {
      const res = await fetch(`/api/admin/vaults/${vaultId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, role: newRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add');
      setSelectedUser(null);
      setUserSearch('');
      setDropdownOpen(false);
      showToast('Member added', 'success');
      await loadMembers();
    } catch (e: any) {
      setAddError(e.message);
    } finally {
      setAdding(false);
    }
  };

  const changeRole = async (userId: string, role: VaultRole) => {
    setRowBusy((p) => ({ ...p, [userId]: true }));
    try {
      const res = await fetch(`/api/admin/vaults/${vaultId}/members/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to change role');
      showToast(`Role changed to ${role}`, 'success');
      await loadMembers();
    } catch (e: any) {
      showToast(e.message, 'error');
    } finally {
      setRowBusy((p) => ({ ...p, [userId]: false }));
    }
  };

  const removeMember = async (userId: string, email: string | null) => {
    if (!confirm(`Remove ${email ?? userId} from this vault?`)) return;
    setRowBusy((p) => ({ ...p, [userId]: true }));
    try {
      const res = await fetch(`/api/admin/vaults/${vaultId}/members/${userId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to remove');
      showToast('Member removed', 'success');
      await loadMembers();
    } catch (e: any) {
      showToast(e.message, 'error');
    } finally {
      setRowBusy((p) => ({ ...p, [userId]: false }));
    }
  };

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-base)' }}>
        <div className="text-sm animate-pulse" style={{ color: 'var(--text-secondary)' }}>Loading…</div>
      </div>
    );
  }

  const owners = members.filter((m) => m.role === 'owner');

  return (
    <div className="min-h-screen p-8" style={{ background: 'var(--bg-base)' }}>
      {toast && <Toast msg={toast.msg} type={toast.type} />}
      <div className="max-w-3xl mx-auto">

        {/* Header */}
        <div className="mb-8">
          <Link href="/admin" className="text-sm hover:underline" style={{ color: 'var(--accent)' }}>
            ← Admin Panel
          </Link>
          <div className="flex items-baseline gap-3 mt-3 mb-1 flex-wrap">
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
              {vaultName || 'Vault Members'}
            </h1>
            <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {members.length} {members.length === 1 ? 'member' : 'members'}
            </span>
          </div>
          <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>{vaultId}</p>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-xl border border-red-800 bg-red-900/20">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {/* Add member */}
        <Card className="p-5 mb-8">
          <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Add Member</h2>
          <div className="flex gap-2">
            {/* User search input */}
            <div className="flex-1 relative">
              <input
                type="text"
                placeholder="Search by email or paste UUID…"
                value={selectedUser ? selectedUser.email : userSearch}
                onChange={(e) => {
                  setSelectedUser(null);
                  setUserSearch(e.target.value);
                  setDropdownOpen(true);
                }}
                onFocus={() => setDropdownOpen(true)}
                onBlur={() => setTimeout(() => setDropdownOpen(false), 150)}
                onKeyDown={(e) => e.key === 'Enter' && addMember()}
                className="w-full px-3 py-1.5 rounded-lg border text-sm outline-none"
                style={{ background: 'var(--bg-base)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              />
              {selectedUser && (
                <p className="text-xs mt-0.5 font-mono px-1" style={{ color: 'var(--text-muted)' }}>
                  {selectedUser.id}
                </p>
              )}
              {dropdownOpen && filteredUsers.length > 0 && !selectedUser && (
                <div
                  className="absolute left-0 right-0 top-full mt-1 rounded-xl border shadow-lg z-50 overflow-y-auto"
                  style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)', maxHeight: 220 }}
                >
                  {filteredUsers.slice(0, 20).map((u) => (
                    <button
                      key={u.id}
                      onMouseDown={() => { setSelectedUser(u); setUserSearch(''); setDropdownOpen(false); }}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-white/5 transition-colors"
                    >
                      <p style={{ color: 'var(--text-primary)' }}>{u.email}</p>
                      <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>{u.id}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as VaultRole)}
              className="px-3 py-1.5 rounded-lg border text-sm outline-none"
              style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            >
              <option value="viewer">Viewer</option>
              <option value="editor">Editor</option>
              <option value="owner">Owner</option>
            </select>
            <Button size="sm" loading={adding} onClick={addMember}>Add</Button>
          </div>
          {addError && <p className="text-xs mt-2" style={{ color: '#f87171' }}>{addError}</p>}
        </Card>

        {/* Members grouped by role — highest privilege first */}
        {ROLE_ORDER.map((role) => {
          const meta = ROLE_META[role];
          const group = members.filter((m) => m.role === role);
          return (
            <div key={role} className="mb-6">
              <div className="flex items-baseline gap-2 mb-2 px-1">
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: meta.color, alignSelf: 'center', flexShrink: 0 }} />
                <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {meta.plural}
                </h2>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {group.length} · {meta.desc}
                </span>
              </div>

              <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
                {group.length === 0 ? (
                  <div className="px-4 py-3 text-xs" style={{ color: 'var(--text-muted)', background: 'var(--bg-surface)' }}>
                    No {meta.plural.toLowerCase()} yet
                  </div>
                ) : (
                  group.map((m, i) => {
                    const isOnlyOwner = m.role === 'owner' && owners.length === 1;
                    const busy = !!rowBusy[m.userId];
                    return (
                      <div
                        key={m.userId}
                        className="flex items-center gap-3 px-4 py-3"
                        style={{
                          background: 'var(--bg-surface)',
                          borderBottom: i === group.length - 1 ? 'none' : '1px solid var(--border)',
                          opacity: busy ? 0.6 : 1,
                          transition: 'opacity 0.15s',
                        }}
                      >
                        <Avatar email={m.email ?? m.userId} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                            {m.email ?? 'Unknown user'}
                          </p>
                          <p className="font-mono text-[11px] truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>
                            {m.userId}
                          </p>
                        </div>

                        <select
                          value={m.role}
                          disabled={busy || isOnlyOwner}
                          title={isOnlyOwner ? 'The only owner — promote someone else first' : 'Change role'}
                          onChange={(e) => changeRole(m.userId, e.target.value as VaultRole)}
                          className="px-2 py-1 rounded-md text-xs outline-none border disabled:opacity-40 flex-shrink-0"
                          style={{ background: 'var(--bg-base)', borderColor: 'var(--border)', color: 'var(--text-primary)', cursor: busy || isOnlyOwner ? 'default' : 'pointer' }}
                        >
                          <option value="owner">Owner</option>
                          <option value="editor">Editor</option>
                          <option value="viewer">Viewer</option>
                        </select>
                        <button
                          onClick={() => removeMember(m.userId, m.email)}
                          disabled={busy || isOnlyOwner}
                          title={isOnlyOwner ? 'The only owner — promote someone else first' : 'Remove from vault'}
                          className="px-2.5 py-1 rounded-md text-xs hover:opacity-80 disabled:opacity-30 flex-shrink-0"
                          style={{ background: '#7f1d1d22', color: '#f87171', border: '1px solid #f8717144', cursor: busy || isOnlyOwner ? 'default' : 'pointer' }}
                        >
                          Remove
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
