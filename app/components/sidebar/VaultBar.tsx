'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { useSettingsModal } from '@/context/SettingsModalContext';
import ManageVaultsModal from './ManageVaultsModal';
import type { VaultsData } from './types';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function VaultBar() {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [manageCreating, setManageCreating] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const settingsModal = useSettingsModal();

  const { data } = useSWR<VaultsData>('/api/vaults', fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  });

  const activeVault = data?.vaults.find((v) => v.name === data.activeVault);
  const canSwitch = !!data;

  useEffect(() => {
    if (!dropdownOpen) return;
    function handleClick(e: MouseEvent) {
      if (barRef.current && !barRef.current.contains(e.target as Node)) setDropdownOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [dropdownOpen]);

  async function switchVault(vaultName: string) {
    if (vaultName === data?.activeVault) { setDropdownOpen(false); return; }
    setSwitching(true);
    setDropdownOpen(false);
    await fetch('/api/vaults', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vault: vaultName }),
    });
    window.location.href = '/notes';
  }

  return (
    <div
      ref={barRef}
      className="flex-shrink-0"
      style={{ borderTop: '1px solid rgba(255,255,255,0.06)', background: 'var(--bg-surface)', position: 'relative' }}
    >
      {dropdownOpen && data && canSwitch && (
        <div style={{
          position: 'absolute', bottom: '100%', left: 0, right: 0,
          background: '#1e2030',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '8px 8px 0 0',
          boxShadow: '0 -8px 24px rgba(0,0,0,0.4)',
          overflow: 'hidden', zIndex: 100,
        }}>
          {data.vaults.map((vault) => {
            const isActive = vault.name === data.activeVault;
            return (
              <button
                key={vault.name}
                onClick={() => switchVault(vault.name)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 12px', background: 'transparent', border: 'none',
                  cursor: 'pointer',
                  color: isActive ? 'var(--accent)' : 'rgba(255,255,255,0.8)',
                  fontSize: 13, textAlign: 'left',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                <svg width="12" height="12" fill="currentColor" viewBox="0 0 20 20" style={{ opacity: isActive ? 1 : 0, flexShrink: 0 }}>
                  <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" />
                </svg>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {vault.label}
                    </span>
                    {vault.role && vault.role !== 'owner' && (
                      <span style={{
                        fontSize: 11, padding: '1px 5px', borderRadius: 3, flexShrink: 0,
                        background: vault.role === 'editor' ? 'var(--accent)22' : '#64748b22',
                        color: vault.role === 'editor' ? 'var(--accent)' : '#94a3b8',
                      }}>{vault.role}</span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}

          <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', margin: '2px 0' }} />
          <button
            onClick={() => { setDropdownOpen(false); setManageCreating(true); setManageOpen(true); }}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 12px', background: 'transparent', border: 'none',
              cursor: 'pointer', color: 'rgba(255,255,255,0.6)', fontSize: 13, textAlign: 'left',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            <span style={{ width: 12, textAlign: 'center', flexShrink: 0 }}>＋</span>
            New vault
          </button>
          <button
            onClick={() => { setDropdownOpen(false); setManageCreating(false); setManageOpen(true); }}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 12px', background: 'transparent', border: 'none',
              cursor: 'pointer', color: 'rgba(255,255,255,0.6)', fontSize: 13, textAlign: 'left',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33h0a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51h0a1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82v0a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" />
            </svg>
            Manage vaults…
          </button>
        </div>
      )}

      {manageOpen && data && (
        <ManageVaultsModal
          data={data}
          initialCreating={manageCreating}
          onClose={() => setManageOpen(false)}
        />
      )}

      <div style={{ display: 'flex', alignItems: 'center', height: 40, padding: '0 8px', gap: 4 }}>
        <button
          onClick={() => canSwitch && setDropdownOpen((o) => !o)}
          disabled={switching}
          title={data?.activeVault ?? 'Vault'}
          style={{
            flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6,
            background: 'transparent', border: 'none',
            cursor: canSwitch ? 'pointer' : 'default',
            padding: '0 4px', borderRadius: 4,
            opacity: switching ? 0.5 : 1,
          }}
          onMouseEnter={(e) => { if (canSwitch) e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
            <rect x="1" y="3" width="12" height="9" rx="1.5" stroke="rgba(255,255,255,0.45)" strokeWidth="1.2" />
            <path d="M1 6h12" stroke="rgba(255,255,255,0.45)" strokeWidth="1.2" />
            <path d="M4 3V1.5" stroke="rgba(255,255,255,0.45)" strokeWidth="1.2" strokeLinecap="round" />
            <path d="M10 3V1.5" stroke="rgba(255,255,255,0.45)" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
          <span style={{
            fontSize: 12, color: 'rgba(255,255,255,0.45)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            flex: 1, textAlign: 'left',
          }}>
            {switching ? '…' : (activeVault?.label ?? data?.activeVault ?? '—')}
          </span>
          {canSwitch && !switching && (
            <svg
              width="10" height="10" fill="rgba(255,255,255,0.35)" viewBox="0 0 20 20"
              style={{ flexShrink: 0, transform: dropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}
            >
              <path d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" />
            </svg>
          )}
        </button>

        <button
          onClick={() => settingsModal?.openSettings()}
          title="Settings"
          style={{
            width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'transparent', border: 'none', cursor: 'pointer',
            borderRadius: 4, flexShrink: 0, color: 'rgba(255,255,255,0.35)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'rgba(255,255,255,0.7)';
            e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'rgba(255,255,255,0.35)';
            e.currentTarget.style.background = 'transparent';
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00.73 2.73l.15.1a2 2 0 011 1.72v.51a2 2 0 01-1 1.74l-.15.09a2 2 0 00-.73 2.73l.22.38a2 2 0 002.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.39a2 2 0 00-.73-2.73l-.15-.08a2 2 0 01-1-1.74v-.5a2 2 0 011-1.74l.15-.09a2 2 0 00.73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>
      </div>
    </div>
  );
}
