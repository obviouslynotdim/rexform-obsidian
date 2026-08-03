'use client';
import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { mutate } from 'swr';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { Toast, useToast } from '@/components/ui/Toast';

type VaultRole = 'owner' | 'editor' | 'viewer';

interface Member {
  userId: string;
  role: VaultRole;
  email: string | null;
}

const ROLE_ORDER: VaultRole[] = ['owner', 'editor', 'viewer'];

const ROLE_META: Record<VaultRole, { color: string; plural: string; desc: string }> = {
  owner:  { color: '#7F77DD', plural: 'Owners',  desc: 'Full access — manage notes and members' },
  editor: { color: '#4ade80', plural: 'Editors', desc: 'Can read and write notes' },
  viewer: { color: '#94a3b8', plural: 'Viewers', desc: 'Read-only access' },
};

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

function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function DashboardVaultDetailPage() {
  const { status, data: session } = useSession();
  const router = useRouter();
  const params = useParams();
  const vaultId = params.vaultId as string;
  const myUserId = session?.user?.id;

  const [members, setMembers] = useState<Member[]>([]);
  const [myRole, setMyRole] = useState<VaultRole | null>(null);
  const [vaultKind, setVaultKind] = useState<'personal' | 'shared' | null>(null);
  const [vaultName, setVaultName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { toast, showToast } = useToast();
  const [rowBusy, setRowBusy] = useState<Record<string, boolean>>({});

  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const [inviteRole, setInviteRole] = useState<'editor' | 'viewer'>('editor');
  const [inviteUrl, setInviteUrl] = useState('');
  const [inviteExpiresAt, setInviteExpiresAt] = useState<number | null>(null);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // Personal (extra) vaults have no members/invite concept — the API base
  // and the sections rendered below both key off this.
  const isShared = vaultKind === 'shared';
  const apiBase = isShared ? `/api/shared-vaults/${vaultId}` : `/api/vaults/${vaultId}`;

  const loadMembers = useCallback(async () => {
    setError('');
    try {
      const res = await fetch(`/api/shared-vaults/${vaultId}/members`);
      if (res.status === 403) { router.replace('/dashboard'); return; }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load');
      setMembers(data.members);
      setMyRole(data.myRole);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [vaultId, router]);

  // Resolves this vault's kind first, then either loads real members (shared)
  // or treats the caller as the sole owner (personal) — one entry point for
  // both kinds so this page is the single place to manage any vault.
  const init = useCallback(async () => {
    setError('');
    try {
      const res = await fetch('/api/vaults');
      const data = await res.json();
      const v = (data.vaults || []).find((x: any) => x.name === vaultId);
      if (!v || v.kind === 'primary') { router.replace('/dashboard'); return; }
      setVaultName(v.label);
      setNameDraft(v.label);
      setVaultKind(v.kind);
      if (v.kind === 'shared') {
        await loadMembers();
      } else {
        setMyRole('owner');
        setMembers([]);
        setLoading(false);
      }
    } catch (e: any) {
      setError(e.message);
      setLoading(false);
    }
  }, [vaultId, router, loadMembers]);

  useEffect(() => {
    if (status === 'unauthenticated') { router.replace('/login'); return; }
    if (status === 'authenticated') { init(); }
  }, [status, init, router]);

  // Live countdown tick while an invite link is showing.
  useEffect(() => {
    if (!inviteExpiresAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [inviteExpiresAt]);

  useEffect(() => {
    if (inviteExpiresAt && now >= inviteExpiresAt) {
      setInviteUrl('');
      setInviteExpiresAt(null);
    }
  }, [now, inviteExpiresAt]);

  const owners = members.filter((m) => m.role === 'owner');
  const isOwner = myRole === 'owner';

  const changeRole = async (userId: string, role: VaultRole) => {
    setRowBusy((p) => ({ ...p, [userId]: true }));
    try {
      const res = await fetch(`/api/shared-vaults/${vaultId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: userId, role }),
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
    const isSelf = userId === myUserId;
    if (!confirm(isSelf ? 'Leave this vault?' : `Remove ${email ?? userId} from this vault?`)) return;
    setRowBusy((p) => ({ ...p, [userId]: true }));
    try {
      const res = await fetch(`/api/shared-vaults/${vaultId}/members/${userId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to remove');
      if (isSelf) {
        await mutate('/api/vaults');
        router.replace('/dashboard');
        return;
      }
      showToast('Member removed', 'success');
      await loadMembers();
    } catch (e: any) {
      showToast(e.message, 'error');
    } finally {
      setRowBusy((p) => ({ ...p, [userId]: false }));
    }
  };

  const saveRename = async () => {
    const name = nameDraft.trim();
    if (!name || name === vaultName) { setRenaming(false); return; }
    setSavingName(true);
    try {
      const res = await fetch(apiBase, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to rename');
      setVaultName(name);
      setRenaming(false);
      await mutate('/api/vaults');
      showToast('Vault renamed', 'success');
    } catch (e: any) {
      showToast(e.message, 'error');
    } finally {
      setSavingName(false);
    }
  };

  const deleteVault = async () => {
    const prompt = isShared
      ? `Delete "${vaultName}" for every member? This can't be undone.`
      : `Delete "${vaultName}"? This can't be undone.`;
    if (!confirm(prompt)) return;
    setLeaving(true);
    try {
      const res = await fetch(apiBase, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete');
      await mutate('/api/vaults');
      router.replace('/dashboard');
    } catch (e: any) {
      showToast(e.message, 'error');
      setLeaving(false);
    }
  };

  const generateInviteLink = async () => {
    setGenerating(true);
    setCopied(false);
    try {
      const res = await fetch(`/api/shared-vaults/${vaultId}/invite-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: inviteRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create invite link');
      setInviteUrl(`${window.location.origin}/invite/${vaultId}/${data.token}`);
      setInviteExpiresAt(data.expiresAt);
      setNow(Date.now());
    } catch (e: any) {
      showToast(e.message, 'error');
    } finally {
      setGenerating(false);
    }
  };

  const copyInviteLink = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast('Could not copy — select and copy manually', 'error');
    }
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
      {toast && <Toast msg={toast.msg} type={toast.type} />}
      <div className="max-w-3xl mx-auto">

        {/* Header */}
        <div className="mb-8">
          <Link href="/dashboard" className="text-sm hover:underline" style={{ color: 'var(--accent)' }}>
            ← Dashboard
          </Link>
          <div className="flex items-baseline gap-3 mt-3 mb-1 flex-wrap">
            {renaming ? (
              <div className="flex items-center gap-2">
                <input
                  autoFocus
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveRename(); if (e.key === 'Escape') setRenaming(false); }}
                  className="px-2 py-1 rounded-lg border text-xl font-bold outline-none"
                  style={{ background: 'var(--bg-surface)', borderColor: 'var(--accent)', color: 'var(--text-primary)' }}
                />
                <Button size="sm" loading={savingName} onClick={saveRename}>Save</Button>
                <Button size="sm" variant="ghost" onClick={() => setRenaming(false)}>Cancel</Button>
              </div>
            ) : (
              <>
                <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                  {vaultName || 'Vault'}
                </h1>
                {isOwner && (
                  <button
                    onClick={() => { setNameDraft(vaultName); setRenaming(true); }}
                    className="text-xs hover:underline"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    Rename
                  </button>
                )}
              </>
            )}
            {isShared && (
              <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
                {members.length} {members.length === 1 ? 'member' : 'members'}
              </span>
            )}
          </div>
          <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>{vaultId}</p>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-xl border border-red-800 bg-red-900/20">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {/* Invite via link — shared vaults, owner only */}
        {isShared && isOwner && (
          <Card className="p-5 mb-6">
            <h2 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Invite by link</h2>
            <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
              Anyone signed in who opens the link joins with the chosen role. Links are single-use and expire 5 minutes after they're generated.
            </p>
            {inviteUrl ? (
              <div>
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={inviteUrl}
                    onFocus={(e) => e.target.select()}
                    className="flex-1 px-3 py-1.5 rounded-lg border text-xs font-mono outline-none"
                    style={{ background: 'var(--bg-base)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                  />
                  <Button size="sm" variant="secondary" onClick={copyInviteLink}>
                    {copied ? 'Copied!' : 'Copy'}
                  </Button>
                </div>
                <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
                  Role: {inviteRole} · expires in {inviteExpiresAt ? formatCountdown(inviteExpiresAt - now) : '0:00'}
                </p>
                <button
                  onClick={generateInviteLink}
                  disabled={generating}
                  className="text-xs mt-1 hover:underline disabled:opacity-50"
                  style={{ color: 'var(--accent)' }}
                >
                  Regenerate (invalidates this link)
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as 'editor' | 'viewer')}
                  className="px-3 py-1.5 rounded-lg border text-sm outline-none"
                  style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                >
                  <option value="editor">Editor</option>
                  <option value="viewer">Viewer</option>
                </select>
                <Button size="sm" loading={generating} onClick={generateInviteLink}>
                  Generate invite link
                </Button>
              </div>
            )}
          </Card>
        )}

        {/* Members grouped by role — shared vaults only */}
        {isShared && ROLE_ORDER.map((role) => {
          const meta = ROLE_META[role];
          const group = members.filter((m) => m.role === role);
          if (group.length === 0 && role !== 'owner') return null;
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
                    const isSelf = m.userId === myUserId;
                    const canManageRow = isOwner && (!isOnlyOwner || !isSelf);
                    const canRemoveRow = isOwner ? !isOnlyOwner : isSelf;
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
                            {m.email ?? 'Unknown user'} {isSelf && <span style={{ color: 'var(--text-muted)' }}>(you)</span>}
                          </p>
                          <p className="font-mono text-[11px] truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>
                            {m.userId}
                          </p>
                        </div>

                        {isOwner ? (
                          <select
                            value={m.role}
                            disabled={busy || !canManageRow}
                            title={isOnlyOwner ? 'The only owner — promote someone else first' : 'Change role'}
                            onChange={(e) => changeRole(m.userId, e.target.value as VaultRole)}
                            className="px-2 py-1 rounded-md text-xs outline-none border disabled:opacity-40 flex-shrink-0"
                            style={{ background: 'var(--bg-base)', borderColor: 'var(--border)', color: 'var(--text-primary)', cursor: busy || !canManageRow ? 'default' : 'pointer' }}
                          >
                            <option value="owner">Owner</option>
                            <option value="editor">Editor</option>
                            <option value="viewer">Viewer</option>
                          </select>
                        ) : (
                          <span className="text-xs capitalize flex-shrink-0" style={{ color: 'var(--text-muted)' }}>{m.role}</span>
                        )}
                        {canRemoveRow && (
                          <button
                            onClick={() => removeMember(m.userId, m.email)}
                            disabled={busy}
                            title={isSelf ? 'Leave this vault' : 'Remove from vault'}
                            className="px-2.5 py-1 rounded-md text-xs hover:opacity-80 disabled:opacity-30 flex-shrink-0"
                            style={{ background: '#7f1d1d22', color: '#f87171', border: '1px solid #f8717144', cursor: busy ? 'default' : 'pointer' }}
                          >
                            {isSelf ? 'Leave' : 'Remove'}
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}

        {isOwner && (
          <Card className="p-5 mt-8" style={{ borderColor: '#f8717144' }}>
            <h2 className="text-sm font-semibold mb-1" style={{ color: '#f87171' }}>Danger zone</h2>
            <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
              {isShared
                ? "Deletes this vault and all its notes for every member. This can't be undone."
                : "Deletes this vault and all its notes. This can't be undone."}
            </p>
            <Button size="sm" variant="danger" loading={leaving} onClick={deleteVault}>
              Delete vault
            </Button>
          </Card>
        )}
      </div>
    </div>
  );
}
