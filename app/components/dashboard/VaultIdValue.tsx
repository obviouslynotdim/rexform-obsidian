'use client';
import { useState } from 'react';

// Vault stat-card value: truncated DB name that reveals the full ID in a
// tooltip on hover, with a copy-to-clipboard button next to it.
export default function VaultIdValue({ name }: { name: string }) {
  const [copied, setCopied] = useState(false);
  const [hovered, setHovered] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(name);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative flex items-center gap-2 min-w-0">
      <p
        className="text-lg font-semibold truncate cursor-default"
        style={{ color: 'var(--text-primary)' }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {name}
      </p>

      <button
        onClick={copy}
        title={copied ? 'Copied' : 'Copy vault ID'}
        className="flex items-center justify-center flex-shrink-0 rounded-md transition-colors hover:bg-white/5"
        style={{
          width: 26,
          height: 26,
          border: '1px solid var(--border)',
          background: 'transparent',
          color: copied ? '#4ade80' : 'var(--text-muted)',
          cursor: 'pointer',
        }}
      >
        {copied ? (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        )}
      </button>

      {/* Full-ID tooltip */}
      {hovered && (
        <div
          className="absolute left-0 bottom-full mb-2 px-3 py-2 rounded-lg font-mono text-xs break-all pointer-events-none"
          style={{
            zIndex: 20,
            minWidth: '100%',
            maxWidth: 360,
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            color: 'var(--text-primary)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
          }}
        >
          {name}
        </div>
      )}
    </div>
  );
}
