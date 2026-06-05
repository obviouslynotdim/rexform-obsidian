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
}

const ROLE_COLORS: Record<VaultRole, string> = {
  owner: '#7F77DD',
  editor: '#4ade80',
  viewer: '#94a3b8',
};

function RoleBadge({ role }: { role: VaultRole }) {
  return (
    <span
      className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ background: ROLE_COLORS[role] + '22', color: ROLE_COLORS[role] }}
    >
      {role}
    </span>
  );
}

export default function VaultDetailPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const vaultId = params.vaultId as string;

  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newUserId, setNewUserId] = useState('');
  const [newRole, setNewRole] = useState<VaultRole>('viewer');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState('');

  const loadMembers = useCallback(async () => {
    setLoading(true);
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

  useEffect(() => {
    if (status === 'unauthenticated') { router.replace('/login'); return; }
    if (status === 'authenticated') loadMembers();
  }, [status, loadMembers, router]);

  const addMember = async () => {
    if (!newUserId.trim()) return;
    setAdding(true);
    setAddError('');
    try {
      const res = await fetch(`/api/admin/vaults/${vaultId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: newUserId.trim(), role: newRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add');
      setNewUserId('');
      await loadMembers();
    } catch (e: any) {
      setAddError(e.message);
    } finally {
      setAdding(false);
    }
  };

  const changeRole = async (userId: string, role: VaultRole) => {
    const res = await fetch(`/api/admin/vaults/${vaultId}/members/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    });
    if (res.ok) await loadMembers();
  };

  const removeMember = async (userId: string) => {
    if (!confirm('Remove this member from the vault?')) return;
    const res = await fetch(`/api/admin/vaults/${vaultId}/members/${userId}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) { alert(data.error || 'Failed to remove'); return; }
    await loadMembers();
  };

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-base)' }}>
        <div className="text-sm animate-pulse" style={{ color: 'var(--text-secondary)' }}>Loading…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8" style={{ background: 'var(--bg-base)' }}>
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <Link href="/admin" className="text-sm hover:underline" style={{ color: 'var(--accent)' }}>
            ← Admin Panel
          </Link>
          <h1 className="text-2xl font-bold mt-3 mb-1" style={{ color: 'var(--text-primary)' }}>
            Vault Members
          </h1>
          <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>{vaultId}</p>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-xl border border-red-800 bg-red-900/20">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {/* Add member */}
        <Card className="p-5 mb-6">
          <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Add Member</h2>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="User ID (Kratos identity ID)"
              value={newUserId}
              onChange={(e) => setNewUserId(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addMember()}
              className="flex-1 px-3 py-1.5 rounded-lg border text-sm outline-none"
              style={{ background: 'var(--bg-base)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            />
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

        {/* Members table */}
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
          <div
            className="px-4 py-3 border-b"
            style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
          >
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
              {members.length} {members.length === 1 ? 'member' : 'members'}
            </p>
          </div>
          {members.length === 0 ? (
            <div className="p-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
              No members yet
            </div>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {members.map((m, i) => {
                  const isOnlyOwner = m.role === 'owner' && members.filter((x) => x.role === 'owner').length === 1;
                  return (
                    <tr
                      key={m.userId}
                      style={{
                        background: i % 2 === 0 ? 'var(--bg-base)' : 'var(--bg-surface)',
                        borderBottom: '1px solid var(--border)',
                      }}
                    >
                      <td className="px-4 py-3">
                        <p className="font-mono text-xs truncate" style={{ color: 'var(--text-primary)' }}>
                          {m.userId}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <RoleBadge role={m.role} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 justify-end">
                          <select
                            value={m.role}
                            onChange={(e) => changeRole(m.userId, e.target.value as VaultRole)}
                            className="px-2 py-1 rounded text-xs outline-none border"
                            style={{ background: 'var(--bg-base)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                          >
                            <option value="viewer">viewer</option>
                            <option value="editor">editor</option>
                            <option value="owner">owner</option>
                          </select>
                          <button
                            onClick={() => removeMember(m.userId)}
                            disabled={isOnlyOwner}
                            className="px-2 py-1 rounded text-xs hover:opacity-80 disabled:opacity-30"
                            style={{ background: '#7f1d1d22', color: '#f87171', border: '1px solid #f8717144' }}
                          >
                            Remove
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
