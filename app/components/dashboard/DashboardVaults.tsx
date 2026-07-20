'use client';
import { useState } from 'react';
import useSWR from 'swr';
import Card from '@/components/ui/Card';
import ManageVaultsModal from '@/components/sidebar/ManageVaultsModal';
import type { VaultsData, VaultOption } from '@/components/sidebar/types';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function VaultGlyph({ shared, active }: { shared: boolean; active: boolean }) {
  const color = active ? 'var(--accent)' : 'var(--text-muted)';
  if (shared) {
    // Two-person glyph for shared vaults
    return (
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    );
  }
  // Safe-box glyph for personal vaults
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 8.8v-1M12 16.2v-1M15.2 12h1M7.8 12h1" />
    </svg>
  );
}

// Dashboard "Vaults" section — overview of every vault the user can open
// (personal + shared with role), quick switch, and the full Manage vaults
// modal (create/rename/delete/members). Same /api/vaults SWR key as the
// sidebar vault bar, so changes propagate everywhere.
export default function DashboardVaults() {
  const { data, isLoading } = useSWR<VaultsData>('/api/vaults', fetcher, {
    dedupingInterval: 30_000,
  });
  const [manageOpen, setManageOpen] = useState(false);
  const [membersVault, setMembersVault] = useState<string | undefined>(undefined);
  const [switching, setSwitching] = useState<string | null>(null);

  const vaults = data?.vaults ?? [];
  const sharedCount = vaults.filter((v) => v.kind === 'shared').length;

  async function openVault(vault: VaultOption) {
    if (switching) return;
    setSwitching(vault.name);
    await fetch('/api/vaults', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vault: vault.name }),
    });
    window.location.href = '/notes';
  }

  return (
    <div className="mb-10">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-baseline gap-3">
          <h2 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
            Vaults
          </h2>
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {isLoading
              ? 'Loading…'
              : `${vaults.length} vault${vaults.length !== 1 ? 's' : ''}${sharedCount > 0 ? ` · ${sharedCount} shared` : ''}`}
          </span>
        </div>
        <button
          onClick={() => setManageOpen(true)}
          className="text-sm hover:underline"
          style={{ color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          Manage vaults →
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {vaults.map((vault) => {
          const isActive = vault.name === data?.activeVault;
          const isShared = vault.kind === 'shared';
          return (
            <Card key={vault.name} className="p-5">
              <div className="flex items-start gap-3">
                <div
                  className="flex items-center justify-center flex-shrink-0"
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    background: isActive ? 'rgba(127,119,221,0.15)' : 'rgba(255,255,255,0.05)',
                    border: `1px solid ${isActive ? 'rgba(127,119,221,0.35)' : 'var(--border)'}`,
                    transition: 'all 0.2s',
                  }}
                >
                  <VaultGlyph shared={isShared} active={isActive} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p
                      className="text-sm font-semibold truncate"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {vault.label}
                    </p>
                    {isShared && (
                      <span
                        className="flex-shrink-0"
                        style={{
                          fontSize: 10, padding: '1px 6px', borderRadius: 4,
                          background: '#64748b22', color: '#94a3b8',
                        }}
                      >
                        {vault.role === 'owner' ? 'owner' : vault.role ?? 'shared'}
                      </span>
                    )}
                  </div>
                  <p
                    className="text-xs truncate mt-0.5"
                    style={{ color: 'var(--text-muted)', fontFamily: 'monospace' }}
                  >
                    {vault.name}
                  </p>
                </div>

                <div className="flex-shrink-0 pt-1 flex items-center gap-1.5">
                  {isShared && (
                    <button
                      onClick={() => { setMembersVault(vault.name); setManageOpen(true); }}
                      className="text-xs font-medium px-3 py-1 rounded-md transition-colors"
                      style={{
                        background: 'transparent',
                        color: 'var(--text-secondary)',
                        border: '1px solid var(--border)',
                        cursor: 'pointer',
                      }}
                    >
                      Members
                    </button>
                  )}
                  {isActive ? (
                    <span
                      className="text-xs font-medium px-3 py-1 rounded-md inline-block"
                      style={{ background: 'rgba(127,119,221,0.15)', color: 'var(--accent)' }}
                    >
                      Active
                    </span>
                  ) : (
                    <button
                      onClick={() => openVault(vault)}
                      disabled={!!switching}
                      className="text-xs font-medium px-3 py-1 rounded-md transition-opacity hover:opacity-90"
                      style={{
                        background: 'var(--accent)',
                        color: '#fff',
                        border: 'none',
                        cursor: switching ? 'default' : 'pointer',
                        opacity: switching === vault.name ? 0.6 : 1,
                      }}
                    >
                      {switching === vault.name ? 'Opening…' : 'Open'}
                    </button>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {manageOpen && data && (
        <ManageVaultsModal
          data={data}
          initialMembersFor={membersVault}
          onClose={() => { setManageOpen(false); setMembersVault(undefined); }}
        />
      )}
    </div>
  );
}
