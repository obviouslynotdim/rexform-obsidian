'use client';
import { useState, useRef, useEffect } from 'react';
import useSWR from 'swr';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface VaultOption {
  name: string;
  label: string;
  role?: 'owner' | 'editor' | 'viewer';
}

interface VaultsData {
  vaults: VaultOption[];
  activeVault: string;
}

export default function VaultSwitcher() {
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data } = useSWR<VaultsData>('/api/vaults', fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  });

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (!data?.vaults?.length) return null;

  const active = data.vaults.find((v) => v.name === data.activeVault) ?? data.vaults[0];
  const hasMultiple = data.vaults.length > 1;

  const switchVault = async (vaultName: string) => {
    if (vaultName === data.activeVault) { setOpen(false); return; }
    setSwitching(true);
    setOpen(false);
    await fetch('/api/vaults', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vault: vaultName }),
    });
    window.location.href = '/dashboard';
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => hasMultiple && setOpen((o) => !o)}
        disabled={switching}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs border transition-colors hover:bg-white/5 disabled:opacity-50"
        style={{
          borderColor: 'var(--border)',
          color: 'var(--text-secondary)',
          cursor: hasMultiple ? 'pointer' : 'default',
        }}
        title={active.name}
      >
        <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
          <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
        </svg>
        <span className="max-w-[120px] truncate">{active.label}</span>
        {switching && <span className="animate-pulse">…</span>}
        {hasMultiple && !switching && (
          <svg width="10" height="10" fill="currentColor" viewBox="0 0 20 20">
            <path d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" />
          </svg>
        )}
      </button>

      {open && hasMultiple && (
        <div
          className="absolute top-full mt-1.5 right-0 min-w-[180px] rounded-xl border shadow-lg py-1 z-50"
          style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
        >
          {data.vaults.map((vault) => {
            const isActive = vault.name === data.activeVault;
            return (
              <button
                key={vault.name}
                onClick={() => switchVault(vault.name)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-white/5 transition-colors"
                style={{ color: isActive ? 'var(--accent)' : 'var(--text-primary)' }}
              >
                <svg
                  width="12"
                  height="12"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                  style={{ opacity: isActive ? 1 : 0 }}
                >
                  <path
                    fillRule="evenodd"
                    d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                  />
                </svg>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="font-medium truncate">{vault.label}</p>
                    {vault.role && vault.role !== 'owner' && (
                      <span
                        className="text-xs px-1.5 py-0.5 rounded flex-shrink-0 font-medium"
                        style={{
                          background: vault.role === 'editor' ? 'var(--accent)22' : '#64748b22',
                          color: vault.role === 'editor' ? 'var(--accent)' : '#94a3b8',
                        }}
                      >
                        {vault.role}
                      </span>
                    )}
                  </div>
                  <p className="text-xs opacity-50 truncate">{vault.name}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
