'use client';
import { useState } from 'react';
import { mutate } from 'swr';
import type { VaultsData, VaultOption } from './types';

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '7px 10px',
  borderRadius: 6,
  border: '1px solid rgba(255,255,255,0.12)',
  background: 'rgba(255,255,255,0.04)',
  color: 'rgba(255,255,255,0.9)',
  fontSize: 13,
  outline: 'none',
};

interface Props {
  data: VaultsData;
  onClose: () => void;
  initialCreating?: boolean;
}

export default function ManageVaultsModal({ data, onClose, initialCreating = false }: Props) {
  const [creating, setCreating] = useState(initialCreating);
  const [newName, setNewName] = useState('');
  const [template, setTemplate] = useState<'starter' | 'blank'>('starter');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleting, setDeleting] = useState<VaultOption | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = () => mutate('/api/vaults');

  async function switchTo(vaultName: string) {
    setBusy(true);
    await fetch('/api/vaults', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vault: vaultName }),
    });
    window.location.href = '/notes';
  }

  async function handleCreate() {
    const name = newName.trim();
    if (!name || busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/vaults/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, template }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || 'Failed to create vault');
        setBusy(false);
        return;
      }
      // Show the new vault in the list; user opens it explicitly
      setCreating(false);
      setNewName('');
      await refresh();
    } catch {
      setError('Failed to create vault');
    } finally {
      setBusy(false);
    }
  }

  async function handleRename(vault: VaultOption) {
    const name = renameValue.trim();
    if (!name || busy) return;
    setBusy(true);
    setError('');
    const res = await fetch(`/api/vaults/${encodeURIComponent(vault.name)}`, {
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
    const res = await fetch(`/api/vaults/${encodeURIComponent(vault.name)}`, {
      method: 'DELETE',
    });
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

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 440, maxWidth: '92vw', maxHeight: '80vh', overflowY: 'auto',
          background: '#1e2030',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 12,
          boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
          padding: 20,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: 'rgba(255,255,255,0.9)', margin: 0 }}>
            Manage vaults
          </h2>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', fontSize: 18, lineHeight: 1 }}
          >
            ×
          </button>
        </div>

        {error && (
          <div style={{
            marginBottom: 10, padding: '7px 10px', borderRadius: 6, fontSize: 12,
            background: 'rgba(239,68,68,0.12)', color: '#f87171',
          }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {data.vaults.map((vault) => {
            const isActive = vault.name === data.activeVault;
            const isOwnPersonal = vault.kind === 'personal';
            const isDeleting = deleting?.name === vault.name;
            const isRenaming = renaming === vault.name;

            return (
              <div
                key={vault.name}
                style={{
                  padding: '9px 10px', borderRadius: 8,
                  border: `1px solid ${isActive ? 'var(--accent)44' : 'rgba(255,255,255,0.07)'}`,
                  background: isActive ? 'var(--accent)0d' : 'rgba(255,255,255,0.02)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {isRenaming ? (
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRename(vault);
                        if (e.key === 'Escape') setRenaming(null);
                      }}
                      style={{ ...inputStyle, flex: 1, padding: '4px 8px' }}
                    />
                  ) : (
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{
                          fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.85)',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {vault.label}
                        </span>
                        {vault.kind === 'shared' && (
                          <span style={{
                            fontSize: 10, padding: '1px 5px', borderRadius: 3, flexShrink: 0,
                            background: '#64748b22', color: '#94a3b8',
                          }}>
                            shared{vault.role && vault.role !== 'owner' ? ` · ${vault.role}` : ''}
                          </span>
                        )}
                        {isActive && (
                          <span style={{
                            fontSize: 10, padding: '1px 5px', borderRadius: 3, flexShrink: 0,
                            background: 'var(--accent)22', color: 'var(--accent)',
                          }}>
                            active
                          </span>
                        )}
                      </div>
                      <p style={{
                        fontSize: 10, color: 'rgba(255,255,255,0.3)', margin: '2px 0 0',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {vault.name}
                      </p>
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
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
                        {isOwnPersonal && (
                          <>
                            <ActionButton
                              label="Rename"
                              onClick={() => { setRenaming(vault.name); setRenameValue(vault.label); setDeleting(null); }}
                              disabled={busy}
                            />
                            <ActionButton
                              label="Delete"
                              danger
                              onClick={() => { setDeleting(isDeleting ? null : vault); setConfirmText(''); setRenaming(null); }}
                              disabled={busy}
                            />
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {isDeleting && (
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                    <p style={{ fontSize: 11, color: '#f87171', margin: '0 0 6px' }}>
                      This permanently deletes all notes in this vault. Type <strong>{vault.label}</strong> to confirm.
                    </p>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input
                        autoFocus
                        value={confirmText}
                        onChange={(e) => setConfirmText(e.target.value)}
                        placeholder={vault.label}
                        style={{ ...inputStyle, flex: 1, padding: '5px 8px', fontSize: 12 }}
                      />
                      <button
                        onClick={() => handleDelete(vault)}
                        disabled={confirmText !== vault.label || busy}
                        style={{
                          padding: '5px 12px', borderRadius: 6, border: 'none', fontSize: 12, fontWeight: 500,
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
          })}
        </div>

        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          {creating ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreate();
                  if (e.key === 'Escape') setCreating(false);
                }}
                placeholder="Vault name"
                maxLength={60}
                style={inputStyle}
              />
              <div style={{ display: 'flex', gap: 6 }}>
                {(['starter', 'blank'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTemplate(t)}
                    style={{
                      flex: 1, padding: '6px 0', borderRadius: 6, fontSize: 12, cursor: 'pointer',
                      border: `1px solid ${template === t ? 'var(--accent)' : 'rgba(255,255,255,0.12)'}`,
                      background: template === t ? 'var(--accent)18' : 'transparent',
                      color: template === t ? 'var(--accent)' : 'rgba(255,255,255,0.6)',
                    }}
                  >
                    {t === 'starter' ? 'Starter notes' : 'Blank'}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                <ActionButton label="Cancel" onClick={() => setCreating(false)} disabled={busy} />
                <button
                  onClick={handleCreate}
                  disabled={!newName.trim() || busy}
                  style={{
                    padding: '6px 14px', borderRadius: 6, border: 'none', fontSize: 12, fontWeight: 500,
                    cursor: newName.trim() && !busy ? 'pointer' : 'not-allowed',
                    background: newName.trim() ? 'var(--accent)' : 'rgba(255,255,255,0.1)',
                    color: newName.trim() ? '#fff' : 'rgba(255,255,255,0.4)',
                  }}
                >
                  {busy ? 'Creating…' : 'Create vault'}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setCreating(true)}
              style={{
                width: '100%', padding: '7px 0', borderRadius: 6, fontSize: 12.5, cursor: 'pointer',
                border: '1px dashed rgba(255,255,255,0.2)', background: 'transparent',
                color: 'rgba(255,255,255,0.55)',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.85)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.35)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.55)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; }}
            >
              ＋ New vault
            </button>
          )}
        </div>
      </div>
    </div>
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
        padding: '4px 8px', borderRadius: 5, border: 'none', fontSize: 11.5,
        cursor: disabled ? 'not-allowed' : 'pointer',
        background: 'transparent',
        color: danger ? '#f87171' : accent ? 'var(--accent)' : 'rgba(255,255,255,0.5)',
        opacity: disabled ? 0.5 : 1,
      }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      {label}
    </button>
  );
}
