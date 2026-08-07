'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
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

function SectionLabel({ children, count }: { children: React.ReactNode; count: number }) {
  return (
    <div className="flex items-baseline gap-2 mb-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
        {children}
      </h3>
      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{count}</span>
    </div>
  );
}

// Dashboard "Vaults" section — overview of every vault the user can open,
// grouped by Personal / Shared (matching the sidebar's Manage vaults modal).
// Each card links straight to the same per-vault management page
// (/dashboard/vaults/[vaultId]) regardless of vault kind, so there's one
// consistent place to rename/delete/manage members instead of personal
// vaults using a popup and shared vaults using a full page.
export default function DashboardVaults() {
  const router = useRouter();
  const { data, isLoading } = useSWR<VaultsData>('/api/vaults', fetcher, {
    dedupingInterval: 30_000,
  });
  const [creating, setCreating] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);

  const vaults = data?.vaults ?? [];
  const personalVaults = vaults.filter((v) => v.kind !== 'shared');
  const sharedVaults = vaults.filter((v) => v.kind === 'shared');

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

  function renderCard(vault: VaultOption) {
    const isActive = vault.name === data?.activeVault;
    const isShared = vault.kind === 'shared';
    const canManage = vault.kind !== 'primary';
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

          <div className="flex-1 min-w-0 pt-0.5">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                {vault.label}
              </p>
              {isShared && (
                <span
                  className="flex-shrink-0"
                  style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: '#64748b22', color: '#94a3b8' }}
                >
                  {vault.role === 'owner' ? 'owner' : vault.role ?? 'shared'}
                </span>
              )}
              {isActive && (
                <span
                  className="flex-shrink-0"
                  style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: 'rgba(127,119,221,0.15)', color: 'var(--accent)' }}
                >
                  active
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-4">
          {canManage && (
            <button
              onClick={() => router.push(`/dashboard/vaults/${vault.name}`)}
              className="text-xs font-medium px-3 py-1.5 rounded-md transition-colors"
              style={{ background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border)', cursor: 'pointer' }}
            >
              Manage
            </button>
          )}
          {isActive ? (
            <span
              className="text-xs font-medium px-3 py-1.5 rounded-md inline-block"
              style={{ background: 'rgba(127,119,221,0.15)', color: 'var(--accent)', marginLeft: canManage ? 0 : 'auto' }}
            >
              Active
            </span>
          ) : (
            <button
              onClick={() => openVault(vault)}
              disabled={!!switching}
              className="text-xs font-medium px-3 py-1.5 rounded-md transition-opacity hover:opacity-90"
              style={{
                background: 'var(--accent)', color: '#fff', border: 'none',
                cursor: switching ? 'default' : 'pointer',
                opacity: switching === vault.name ? 0.6 : 1,
                marginLeft: canManage ? 0 : 'auto',
              }}
            >
              {switching === vault.name ? 'Opening…' : 'Open'}
            </button>
          )}
        </div>
      </Card>
    );
  }

  return (
    <div className="mb-10">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
          Vaults
        </h2>
        <button
          onClick={() => setCreating(true)}
          className="text-sm font-medium px-3 py-1.5 rounded-md hover:opacity-90"
          style={{ background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer' }}
        >
          ＋ New vault
        </button>
      </div>

      {isLoading ? (
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading…</p>
      ) : (
        <>
          <SectionLabel count={personalVaults.length}>Personal vaults</SectionLabel>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 mb-8">
            {personalVaults.map(renderCard)}
          </div>

          <SectionLabel count={sharedVaults.length}>Shared vaults</SectionLabel>
          {sharedVaults.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
              {sharedVaults.map(renderCard)}
            </div>
          ) : (
            <div
              className="text-sm px-4 py-4 rounded-xl border border-dashed"
              style={{ color: 'var(--text-muted)', borderColor: 'var(--border)' }}
            >
              No shared vaults yet. Create one to collaborate with your team.
            </div>
          )}
        </>
      )}

      {creating && data && (
        <ManageVaultsModal
          data={data}
          initialCreating
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  );
}
