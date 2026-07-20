'use client';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSession } from 'next-auth/react';
import { mutate } from 'swr';
import type { VaultsData, VaultOption } from './types';

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 11px',
  borderRadius: 7,
  border: '1px solid rgba(255,255,255,0.12)',
  background: 'rgba(255,255,255,0.04)',
  color: 'rgba(255,255,255,0.9)',
  fontSize: 13,
  outline: 'none',
};

const selectStyle: React.CSSProperties = {
  padding: '5px 7px',
  borderRadius: 6,
  border: '1px solid rgba(255,255,255,0.12)',
  background: '#262940',
  color: 'rgba(255,255,255,0.8)',
  fontSize: 12,
  outline: 'none',
  cursor: 'pointer',
};

const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0,
  background: 'rgba(0,0,0,0.55)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};

const dialogStyle: React.CSSProperties = {
  background: '#1e2030',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 14,
  boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
};

interface Props {
  data: VaultsData;
  onClose: () => void;
  /** Render as a compact create-only dialog ("New vault") instead of the full manager. */
  initialCreating?: boolean;
  /** Open with this shared vault's members panel already expanded. */
  initialMembersFor?: string;
}

interface Member {
  userId: string;
  role: 'owner' | 'editor' | 'viewer';
  email: string | null;
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontSize: 11, fontWeight: 600, letterSpacing: 0.6, textTransform: 'uppercase',
      color: 'rgba(255,255,255,0.35)', margin: '0 0 6px',
    }}>
      {children}
    </p>
  );
}

export default function ManageVaultsModal({
  data,
  onClose,
  initialCreating = false,
  initialMembersFor,
}: Props) {
  const { data: session } = useSession();
  const myId = session?.user?.id ?? '';

  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleting, setDeleting] = useState<VaultOption | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [membersFor, setMembersFor] = useState<string | null>(initialMembersFor ?? null);
  const [createPopup, setCreatePopup] = useState<'personal' | 'shared' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = () => mutate('/api/vaults');

  const personalVaults = data.vaults.filter((v) => v.kind !== 'shared');
  const sharedVaults = data.vaults.filter((v) => v.kind === 'shared');

  // Compact "New vault" entry point (sidebar dropdown) — creation only, with
  // the vault type selectable. The full manager is everything below.
  if (initialCreating) {
    return (
      <CreateVaultDialog
        kind="personal"
        allowKindSwitch
        onClose={onClose}
        onCreated={async () => {
          await refresh();
          onClose();
        }}
      />
    );
  }

  async function switchTo(vaultName: string) {
    setBusy(true);
    await fetch('/api/vaults', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vault: vaultName }),
    });
    window.location.href = '/notes';
  }

  async function handleRename(vault: VaultOption) {
    const name = renameValue.trim();
    if (!name || busy) return;
    setBusy(true);
    setError('');
    const endpoint =
      vault.kind === 'shared'
        ? `/api/shared-vaults/${encodeURIComponent(vault.name)}`
        : `/api/vaults/${encodeURIComponent(vault.name)}`;
    const res = await fetch(endpoint, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error || 'Failed to rename vault');
    } else {
      setRenaming(null);
      await refresh();
    }
    setBusy(false);
  }

  async function handleDelete(vault: VaultOption) {
    if (confirmText !== vault.label || busy) return;
    setBusy(true);
    setError('');
    const endpoint =
      vault.kind === 'shared'
        ? `/api/shared-vaults/${encodeURIComponent(vault.name)}`
        : `/api/vaults/${encodeURIComponent(vault.name)}`;
    const res = await fetch(endpoint, { method: 'DELETE' });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error || 'Failed to delete vault');
      setBusy(false);
      return;
    }
    if (vault.name === data.activeVault) {
      window.location.href = '/notes';
      return;
    }
    setDeleting(null);
    setConfirmText('');
    await refresh();
    setBusy(false);
  }

  async function handleLeave(vault: VaultOption) {
    if (busy || !myId) return;
    setBusy(true);
    setError('');
    const res = await fetch(
      `/api/shared-vaults/${encodeURIComponent(vault.name)}/members/${encodeURIComponent(myId)}`,
      { method: 'DELETE' }
    );
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error || 'Failed to leave vault');
      setBusy(false);
      return;
    }
    if (vault.name === data.activeVault) {
      window.location.href = '/notes';
      return;
    }
    await refresh();
    setBusy(false);
  }

  function renderVault(vault: VaultOption) {
    const isActive = vault.name === data.activeVault;
    const isOwnPersonal = vault.kind === 'personal';
    const isShared = vault.kind === 'shared';
    const isSharedOwner = isShared && vault.role === 'owner';
    const isDeleting = deleting?.name === vault.name;
    const isRenaming = renaming === vault.name;
    const showMembers = membersFor === vault.name;

    return (
      <div
        key={vault.name}
        style={{
          padding: '11px 13px', borderRadius: 9,
          border: `1px solid ${isActive ? 'var(--accent)44' : 'rgba(255,255,255,0.07)'}`,
          background: isActive ? 'var(--accent)0d' : 'rgba(255,255,255,0.02)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {isRenaming ? (
            <input
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRename(vault);
                if (e.key === 'Escape') setRenaming(null);
              }}
              style={{ ...inputStyle, flex: 1, padding: '5px 9px' }}
            />
          ) : (
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{
                  fontSize: 13.5, fontWeight: 500, color: 'rgba(255,255,255,0.88)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {vault.label}
                </span>
                {isShared && (
                  <span style={{
                    fontSize: 10, padding: '2px 6px', borderRadius: 4, flexShrink: 0,
                    background: '#64748b22', color: '#94a3b8',
                  }}>
                    {vault.role === 'owner' ? 'owner' : vault.role ?? 'shared'}
                  </span>
                )}
                {isActive && (
                  <span style={{
                    fontSize: 10, padding: '2px 6px', borderRadius: 4, flexShrink: 0,
                    background: 'var(--accent)22', color: 'var(--accent)',
                  }}>
                    active
                  </span>
                )}
              </div>
              <p style={{
                fontSize: 10.5, color: 'rgba(255,255,255,0.3)', margin: '3px 0 0',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {vault.name}
              </p>
            </div>
          )}

          <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
            {isRenaming ? (
              <>
                <ActionButton label="Save" accent onClick={() => handleRename(vault)} disabled={busy} />
                <ActionButton label="Cancel" onClick={() => setRenaming(null)} disabled={busy} />
              </>
            ) : (
              <>
                {!isActive && (
                  <ActionButton label="Open" onClick={() => switchTo(vault.name)} disabled={busy} />
                )}
                {isShared && (
                  <ActionButton
                    label="Members"
                    accent={showMembers}
                    onClick={() => { setMembersFor(showMembers ? null : vault.name); setDeleting(null); setRenaming(null); }}
                    disabled={busy}
                  />
                )}
                {(isOwnPersonal || isSharedOwner) && (
                  <ActionButton
                    label="Rename"
                    onClick={() => { setRenaming(vault.name); setRenameValue(vault.label); setDeleting(null); }}
                    disabled={busy}
                  />
                )}
                {(isOwnPersonal || isSharedOwner) && (
                  <ActionButton
                    label="Delete"
                    danger
                    onClick={() => { setDeleting(isDeleting ? null : vault); setConfirmText(''); setRenaming(null); setMembersFor(null); }}
                    disabled={busy}
                  />
                )}
                {isShared && !isSharedOwner && (
                  <ActionButton label="Leave" danger onClick={() => handleLeave(vault)} disabled={busy} />
                )}
              </>
            )}
          </div>
        </div>

        {showMembers && (
          <MembersPanel vaultId={vault.name} canManage={isSharedOwner} myId={myId} />
        )}

        {isDeleting && (
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.07)' }}>
            <p style={{ fontSize: 11.5, color: '#f87171', margin: '0 0 7px' }}>
              This permanently deletes all notes in this vault{isShared ? ' for every member' : ''}. Type <strong>{vault.label}</strong> to confirm.
            </p>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                autoFocus
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={vault.label}
                style={{ ...inputStyle, flex: 1, padding: '6px 9px', fontSize: 12 }}
              />
              <button
                onClick={() => handleDelete(vault)}
                disabled={confirmText !== vault.label || busy}
                style={{
                  padding: '6px 14px', borderRadius: 7, border: 'none', fontSize: 12, fontWeight: 500,
                  cursor: confirmText === vault.label && !busy ? 'pointer' : 'not-allowed',
                  background: confirmText === vault.label ? '#ef4444' : 'rgba(239,68,68,0.25)',
                  color: confirmText === vault.label ? '#fff' : 'rgba(255,255,255,0.4)',
                }}
              >
                Delete
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Portal to <body>: the modal is mounted from inside the sidebar/vault bar,
  // where ancestor overflow/stacking contexts can clip or misplace a fixed
  // overlay (e.g. overlapping the vault dropdown).
  return createPortal(
    <div onClick={onClose} style={{ ...overlayStyle, zIndex: 400 }}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          ...dialogStyle,
          width: 600, maxWidth: '94vw', maxHeight: '85vh', overflowY: 'auto',
          padding: 26,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 }}>
          <h2 style={{ fontSize: 17, fontWeight: 600, color: 'rgba(255,255,255,0.92)', margin: 0 }}>
            Manage vaults
          </h2>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', fontSize: 19, lineHeight: 1 }}
          >
            ×
          </button>
        </div>
        <p style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.45)', margin: '0 0 18px' }}>
          Personal vaults are private to you. Shared vaults let you collaborate — owners invite members and set roles.
        </p>

        {error && (
          <div style={{
            marginBottom: 12, padding: '8px 11px', borderRadius: 7, fontSize: 12,
            background: 'rgba(239,68,68,0.12)', color: '#f87171',
          }}>
            {error}
          </div>
        )}

        <SectionHeader>Personal vaults</SectionHeader>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 18 }}>
          {personalVaults.map(renderVault)}
        </div>

        <SectionHeader>Shared vaults</SectionHeader>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {sharedVaults.length > 0 ? (
            sharedVaults.map(renderVault)
          ) : (
            <p style={{
              fontSize: 12, color: 'rgba(255,255,255,0.35)', margin: 0,
              padding: '12px 13px', borderRadius: 9, border: '1px dashed rgba(255,255,255,0.1)',
            }}>
              No shared vaults yet. Create one to collaborate with your team.
            </p>
          )}
        </div>

        <div style={{ marginTop: 18, paddingTop: 18, borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', gap: 8 }}>
          <CreateButton label="＋ New vault" onClick={() => setCreatePopup('personal')} />
          <CreateButton label="＋ New shared vault" onClick={() => setCreatePopup('shared')} />
        </div>
      </div>

      {createPopup && (
        <CreateVaultDialog
          kind={createPopup}
          onClose={() => setCreatePopup(null)}
          onCreated={async () => {
            await refresh();
            setCreatePopup(null);
          }}
        />
      )}
    </div>,
    document.body
  );
}

// Standalone create popup. With allowKindSwitch it shows the Personal/Shared
// type cards (sidebar "New vault"); without, it's fixed to the kind of the
// button that opened it and titled accordingly.
function CreateVaultDialog({
  kind,
  allowKindSwitch = false,
  onClose,
  onCreated,
}: {
  kind: 'personal' | 'shared';
  allowKindSwitch?: boolean;
  onClose: () => void;
  onCreated: () => Promise<void> | void;
}) {
  const [createKind, setCreateKind] = useState<'personal' | 'shared'>(kind);
  const [name, setName] = useState('');
  const [template, setTemplate] = useState<'starter' | 'blank'>('starter');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const title = allowKindSwitch
    ? 'New vault'
    : createKind === 'shared'
      ? 'New shared vault'
      : 'New personal vault';

  async function handleCreate() {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError('');
    try {
      const res =
        createKind === 'shared'
          ? await fetch('/api/shared-vaults', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: trimmed }),
            })
          : await fetch('/api/vaults/create', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: trimmed, template }),
            });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || 'Failed to create vault');
        setBusy(false);
        return;
      }
      await onCreated();
    } catch {
      setError('Failed to create vault');
      setBusy(false);
    }
  }

  return createPortal(
    <div
      onClick={(e) => { e.stopPropagation(); onClose(); }}
      style={{ ...overlayStyle, zIndex: 420 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ ...dialogStyle, width: 460, maxWidth: '92vw', padding: 24 }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: 'rgba(255,255,255,0.92)', margin: 0 }}>
            {title}
          </h2>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', fontSize: 19, lineHeight: 1 }}
          >
            ×
          </button>
        </div>
        <p style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.45)', margin: '0 0 16px' }}>
          {allowKindSwitch
            ? 'Choose a vault type and give it a name.'
            : createKind === 'shared'
              ? 'A vault you can share — invite members and set their roles.'
              : 'A private vault only you can see.'}
        </p>

        {error && (
          <div style={{
            marginBottom: 12, padding: '8px 11px', borderRadius: 7, fontSize: 12,
            background: 'rgba(239,68,68,0.12)', color: '#f87171',
          }}>
            {error}
          </div>
        )}

        {allowKindSwitch && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            {(['personal', 'shared'] as const).map((k) => (
              <button
                key={k}
                onClick={() => setCreateKind(k)}
                style={{
                  flex: 1, padding: '10px 12px', borderRadius: 9, cursor: 'pointer', textAlign: 'left',
                  border: `1px solid ${createKind === k ? 'var(--accent)' : 'rgba(255,255,255,0.12)'}`,
                  background: createKind === k ? 'var(--accent)14' : 'transparent',
                }}
              >
                <div style={{
                  fontSize: 13, fontWeight: 600,
                  color: createKind === k ? 'var(--accent)' : 'rgba(255,255,255,0.8)',
                }}>
                  {k === 'personal' ? 'Personal' : 'Shared'}
                </div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>
                  {k === 'personal' ? 'Private to you' : 'Collaborate with members'}
                </div>
              </button>
            ))}
          </div>
        )}

        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleCreate();
            if (e.key === 'Escape') onClose();
          }}
          placeholder={createKind === 'shared' ? 'Shared vault name' : 'Vault name'}
          maxLength={60}
          style={inputStyle}
        />

        {createKind === 'personal' && (
          <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
            {(['starter', 'blank'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTemplate(t)}
                style={{
                  flex: 1, padding: '7px 0', borderRadius: 7, fontSize: 12, cursor: 'pointer',
                  border: `1px solid ${template === t ? 'var(--accent)' : 'rgba(255,255,255,0.12)'}`,
                  background: template === t ? 'var(--accent)18' : 'transparent',
                  color: template === t ? 'var(--accent)' : 'rgba(255,255,255,0.6)',
                }}
              >
                {t === 'starter' ? 'Starter notes' : 'Blank'}
              </button>
            ))}
          </div>
        )}
        {createKind === 'shared' && (
          <p style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.4)', margin: '10px 0 0' }}>
            You become the owner and can invite members by email afterwards.
          </p>
        )}

        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 16 }}>
          <ActionButton label="Cancel" onClick={onClose} disabled={busy} />
          <button
            onClick={handleCreate}
            disabled={!name.trim() || busy}
            style={{
              padding: '7px 16px', borderRadius: 7, border: 'none', fontSize: 12.5, fontWeight: 500,
              cursor: name.trim() && !busy ? 'pointer' : 'not-allowed',
              background: name.trim() ? 'var(--accent)' : 'rgba(255,255,255,0.1)',
              color: name.trim() ? '#fff' : 'rgba(255,255,255,0.4)',
            }}
          >
            {busy ? 'Creating…' : createKind === 'shared' ? 'Create shared vault' : 'Create vault'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function MembersPanel({ vaultId, canManage, myId }: { vaultId: string; canManage: boolean; myId: string }) {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const [inviteRole, setInviteRole] = useState<'editor' | 'viewer'>('editor');
  const [inviteUrl, setInviteUrl] = useState('');
  const [inviteExpiresAt, setInviteExpiresAt] = useState<number | null>(null);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(() => Date.now());

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

  async function load() {
    try {
      const res = await fetch(`/api/shared-vaults/${encodeURIComponent(vaultId)}/members`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(body.error || 'Failed to load members');
        setMembers([]);
        return;
      }
      setMembers(body.members ?? []);
    } catch {
      setErr('Failed to load members');
      setMembers([]);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vaultId]);

  async function generateInviteLink() {
    setGenerating(true);
    setCopied(false);
    setErr('');
    const res = await fetch(`/api/shared-vaults/${encodeURIComponent(vaultId)}/invite-link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: inviteRole }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr(body.error || 'Failed to create invite link');
    } else {
      setInviteUrl(`${window.location.origin}/invite/${vaultId}/${body.token}`);
      setInviteExpiresAt(body.expiresAt);
      setNow(Date.now());
    }
    setGenerating(false);
  }

  async function copyInviteLink() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setErr('Could not copy — select and copy manually');
    }
  }

  async function changeRole(member: Member, newRole: Member['role']) {
    if (busy || newRole === member.role) return;
    setBusy(true);
    setErr('');
    const res = await fetch(`/api/shared-vaults/${encodeURIComponent(vaultId)}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: member.userId, role: newRole }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) setErr(body.error || 'Failed to change role');
    await load();
    setBusy(false);
  }

  async function removeMember(member: Member) {
    if (busy) return;
    setBusy(true);
    setErr('');
    const res = await fetch(
      `/api/shared-vaults/${encodeURIComponent(vaultId)}/members/${encodeURIComponent(member.userId)}`,
      { method: 'DELETE' }
    );
    const body = await res.json().catch(() => ({}));
    if (!res.ok) setErr(body.error || 'Failed to remove member');
    await load();
    setBusy(false);
  }

  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.07)' }}>
      {err && (
        <div style={{
          marginBottom: 7, padding: '6px 9px', borderRadius: 6, fontSize: 11.5,
          background: 'rgba(239,68,68,0.12)', color: '#f87171',
        }}>
          {err}
        </div>
      )}

      {members === null ? (
        <p style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.35)', margin: 0 }}>Loading members…</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {members.map((m) => (
            <div key={m.userId} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{
                flex: 1, minWidth: 0, fontSize: 12.5, color: 'rgba(255,255,255,0.75)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {m.email ?? <span style={{ fontFamily: 'monospace', fontSize: 11.5 }}>{m.userId}</span>}
                {m.userId === myId && (
                  <span style={{ marginLeft: 6, fontSize: 10, color: '#60a5fa' }}>you</span>
                )}
              </span>
              {canManage ? (
                <select
                  value={m.role}
                  disabled={busy}
                  onChange={(e) => changeRole(m, e.target.value as Member['role'])}
                  style={selectStyle}
                >
                  <option value="owner">owner</option>
                  <option value="editor">editor</option>
                  <option value="viewer">viewer</option>
                </select>
              ) : (
                <span style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.45)' }}>{m.role}</span>
              )}
              {canManage && m.userId !== myId && (
                <button
                  onClick={() => removeMember(m)}
                  disabled={busy}
                  title="Remove member"
                  style={{
                    background: 'transparent', border: 'none', cursor: busy ? 'not-allowed' : 'pointer',
                    color: '#f87171', fontSize: 15, lineHeight: 1, padding: '0 3px',
                  }}
                >
                  ×
                </button>
              )}
            </div>
          ))}
          {members.length === 0 && (
            <p style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.35)', margin: 0 }}>No members.</p>
          )}
        </div>
      )}

      {canManage && (
        <div style={{ marginTop: 9 }}>
          {inviteUrl ? (
            <div>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  readOnly
                  value={inviteUrl}
                  onFocus={(e) => e.target.select()}
                  style={{ ...inputStyle, flex: 1, padding: '6px 9px', fontSize: 11, fontFamily: 'monospace' }}
                />
                <button
                  onClick={copyInviteLink}
                  style={{
                    padding: '6px 12px', borderRadius: 7, border: '1px solid rgba(255,255,255,0.12)',
                    fontSize: 12, fontWeight: 500, cursor: 'pointer',
                    background: 'transparent', color: 'rgba(255,255,255,0.8)',
                  }}
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 5 }}>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
                  {inviteRole} · expires in {inviteExpiresAt ? Math.max(0, Math.ceil((inviteExpiresAt - now) / 1000 / 60)) : 0} min
                </span>
                <button
                  onClick={generateInviteLink}
                  disabled={generating}
                  style={{
                    background: 'transparent', border: 'none', cursor: generating ? 'not-allowed' : 'pointer',
                    color: 'var(--accent)', fontSize: 11,
                  }}
                >
                  Regenerate
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 6 }}>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as 'editor' | 'viewer')}
                style={selectStyle}
              >
                <option value="editor">editor</option>
                <option value="viewer">viewer</option>
              </select>
              <button
                onClick={generateInviteLink}
                disabled={generating}
                style={{
                  flex: 1, padding: '6px 14px', borderRadius: 7, border: 'none', fontSize: 12, fontWeight: 500,
                  cursor: generating ? 'not-allowed' : 'pointer',
                  background: 'var(--accent)', color: '#fff',
                }}
              >
                {generating ? '…' : 'Generate invite link'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CreateButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, padding: '8px 0', borderRadius: 7, fontSize: 12.5, cursor: 'pointer',
        border: '1px dashed rgba(255,255,255,0.2)', background: 'transparent',
        color: 'rgba(255,255,255,0.55)',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.85)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.35)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.55)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; }}
    >
      {label}
    </button>
  );
}

function ActionButton({
  label, onClick, disabled, danger, accent,
}: {
  label: string; onClick: () => void; disabled?: boolean; danger?: boolean; accent?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '5px 10px', borderRadius: 6, border: 'none', fontSize: 12,
        cursor: disabled ? 'not-allowed' : 'pointer',
        background: 'transparent',
        color: danger ? '#f87171' : accent ? 'var(--accent)' : 'rgba(255,255,255,0.55)',
        opacity: disabled ? 0.5 : 1,
      }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      {label}
    </button>
  );
}
