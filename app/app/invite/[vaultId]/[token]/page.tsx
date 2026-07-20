'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Logo from '@/components/ui/Logo';
import Button from '@/components/ui/Button';

interface Preview {
  vaultName: string;
  role: 'owner' | 'editor' | 'viewer';
  expiresAt: number;
  alreadyMember: boolean;
}

export default function InviteAcceptPage() {
  const { vaultId, token } = useParams<{ vaultId: string; token: string }>();
  const router = useRouter();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [joined, setJoined] = useState<{ vaultName: string; role: string } | null>(null);

  useEffect(() => {
    fetch(`/api/shared-vaults/${vaultId}/invite-link/${token}`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || 'This invite link is invalid or has expired.');
        setPreview(data);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [vaultId, token]);

  async function accept() {
    setAccepting(true);
    setError('');
    try {
      const r = await fetch(`/api/shared-vaults/${vaultId}/invite-link/${token}`, { method: 'POST' });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Failed to join vault.');
      setJoined({ vaultName: data.vaultName || preview?.vaultName || 'the vault', role: data.role });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setAccepting(false);
    }
  }

  const minutesLeft = preview ? Math.max(0, Math.ceil((preview.expiresAt - Date.now()) / 60000)) : 0;

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--bg-base)' }}>
      <div
        className="w-full max-w-md rounded-2xl border p-8 text-center"
        style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
      >
        <div className="flex items-center justify-center gap-2 mb-8">
          <Logo />
        </div>

        {loading && <p style={{ color: 'var(--text-secondary)' }}>Checking invite…</p>}

        {!loading && error && !joined && (
          <>
            <h1 className="text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
              Invite unavailable
            </h1>
            <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>{error}</p>
            <Button variant="secondary" onClick={() => router.push('/dashboard')}>
              Go to dashboard
            </Button>
          </>
        )}

        {!loading && !error && preview && !joined && (
          <>
            <h1 className="text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
              Join &ldquo;{preview.vaultName}&rdquo;?
            </h1>
            <p className="text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>
              {preview.alreadyMember
                ? "You're already a member of this vault."
                : `You'll join as ${preview.role}.`}
            </p>
            <p className="text-xs mb-6" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>
              Link expires in {minutesLeft} min
            </p>
            <Button onClick={accept} loading={accepting} className="w-full">
              {preview.alreadyMember ? 'Continue' : 'Accept invite'}
            </Button>
          </>
        )}

        {joined && (
          <>
            <h1 className="text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
              You&apos;re in!
            </h1>
            <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
              Joined &ldquo;{joined.vaultName}&rdquo; as {joined.role}.
            </p>
            <Button onClick={() => router.push('/dashboard')} className="w-full">
              Go to dashboard
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
