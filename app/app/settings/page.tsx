'use client';
import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';

interface Credentials {
  username: string;
  password: string;
  serverUrl: string;
  database: string;
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={copy}
      className="px-2 py-1 rounded text-xs transition-colors hover:bg-white/5 flex-shrink-0"
      style={{ color: copied ? '#4ade80' : 'var(--text-muted)', border: '1px solid var(--border)' }}
    >
      {copied ? '✓ Copied' : 'Copy'}
    </button>
  );
}

function CredentialRow({ label, value, secret }: { label: string; value: string; secret?: boolean }) {
  const [visible, setVisible] = useState(!secret);
  return (
    <div className="py-3 border-b last:border-0" style={{ borderColor: 'var(--border)' }}>
      <p className="text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>{label}</p>
      <div className="flex items-center gap-2">
        <code
          className="flex-1 px-3 py-1.5 rounded-lg text-sm font-mono truncate"
          style={{ background: 'var(--bg-base)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
        >
          {secret && !visible ? '••••••••••••••••' : value}
        </code>
        {secret && (
          <button
            onClick={() => setVisible((v) => !v)}
            className="px-2 py-1 rounded text-xs flex-shrink-0 hover:bg-white/5"
            style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}
          >
            {visible ? 'Hide' : 'Show'}
          </button>
        )}
        <CopyButton value={value} />
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [creds, setCreds] = useState<Credentials | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState('');

  const loadCreds = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/user/credentials');
      if (res.status === 400) {
        setError('Settings are not available for the admin account.');
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to load credentials');
      }
      setCreds(await res.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === 'unauthenticated') { router.replace('/login'); return; }
    if (status === 'authenticated') loadCreds();
  }, [status, loadCreds, router]);

  const regenerate = async () => {
    if (!confirm('Regenerate password? Your current LiveSync connection will stop working until you update it in Obsidian.')) return;
    setRegenerating(true);
    try {
      const res = await fetch('/api/user/credentials', { method: 'POST' });
      if (!res.ok) throw new Error('Failed to regenerate');
      setCreds(await res.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRegenerating(false);
    }
  };

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-base)' }}>
        <div className="text-sm animate-pulse" style={{ color: 'var(--text-secondary)' }}>Loading settings…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8" style={{ background: 'var(--bg-base)' }}>
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Settings</h1>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Account and sync configuration</p>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-xl border border-red-800 bg-red-900/20">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {/* Account section */}
        <Card className="p-6 mb-6">
          <h2 className="text-base font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Account</h2>
          <div className="space-y-2">
            <div className="flex items-center justify-between py-2 border-b" style={{ borderColor: 'var(--border)' }}>
              <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Email</span>
              <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{session?.user?.email}</span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Role</span>
              <span
                className="text-xs px-2 py-0.5 rounded-full font-medium"
                style={{ background: 'var(--accent)22', color: 'var(--accent)' }}
              >
                {session?.user?.isAdmin ? 'Admin' : 'Member'}
              </span>
            </div>
          </div>
        </Card>

        {/* LiveSync section */}
        {creds && (
          <Card className="p-6">
            <div className="flex items-start justify-between mb-1">
              <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
                Connect Obsidian (LiveSync)
              </h2>
            </div>
            <p className="text-sm mb-5" style={{ color: 'var(--text-secondary)' }}>
              Use these details in the{' '}
              <span className="font-medium" style={{ color: 'var(--accent)' }}>
                Self-hosted LiveSync
              </span>{' '}
              Obsidian plugin to sync your vault on desktop or mobile.
            </p>

            <div className="rounded-xl border overflow-hidden mb-4" style={{ borderColor: 'var(--border)' }}>
              <CredentialRow label="Server URL" value={creds.serverUrl} />
              <CredentialRow label="Database" value={creds.database} />
              <CredentialRow label="Username" value={creds.username} />
              <CredentialRow label="Password" value={creds.password} secret />
            </div>

            <div className="flex items-center justify-between">
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Regenerating creates a new password — update it in Obsidian to keep syncing.
              </p>
              <Button
                variant="secondary"
                size="sm"
                loading={regenerating}
                onClick={regenerate}
              >
                Regenerate Password
              </Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
