'use client';

import { useState, useEffect } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

function ProtonIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M3 5C3 3.89543 3.89543 3 5 3H14L21 10V19C21 20.1046 20.1046 21 19 21H5C3.89543 21 3 20.1046 3 19V5Z"
        fill="#6D4AFF"
        opacity="0.9"
      />
      <path d="M14 3L21 10H16C14.8954 10 14 9.10457 14 8V3Z" fill="#9B7FFF" />
      <path d="M7 12H17M7 16H13" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

async function initFlow(): Promise<string> {
  const r = await fetch('/api/auth/kratos/flow?type=login');
  if (!r.ok) throw new Error('flow init failed');
  const d = await r.json();
  return d.id;
}

export default function LoginPage() {
  const router = useRouter();
  const [flowId, setFlowId] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [flowLoading, setFlowLoading] = useState(true);

  useEffect(() => {
    initFlow()
      .then(setFlowId)
      .catch(() => setError('Failed to initialise login. Please refresh.'))
      .finally(() => setFlowLoading(false));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!flowId) return;
    setLoading(true);
    setError('');
    const result = await signIn('credentials', {
      redirect: false,
      email,
      password,
      flowId,
    });
    setLoading(false);
    if (result?.error) {
      setError(result.error);
      initFlow()
        .then(setFlowId)
        .catch(() => {});
    } else {
      router.push('/');
      router.refresh();
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: '#1a1a2e' }}
    >
      <div
        className="w-full max-w-md rounded-2xl border p-8"
        style={{ background: '#16213e', borderColor: '#2a2a4a' }}
      >
        {/* Logo */}
        <div className="flex items-center gap-2 mb-8">
          <span
            className="w-8 h-8 rounded flex items-center justify-center text-white text-sm font-bold"
            style={{ background: '#7F77DD' }}
          >
            R
          </span>
          <span className="font-bold text-lg" style={{ color: '#e0e0e0' }}>
            REXFORM
          </span>
          <span className="font-bold text-lg" style={{ color: '#7F77DD' }}>
            · Notes
          </span>
        </div>

        <h1 className="text-2xl font-bold mb-1" style={{ color: '#e0e0e0' }}>
          Welcome back
        </h1>
        <p className="text-sm mb-6" style={{ color: '#8892a4' }}>
          Sign in to your workspace
        </p>

        {/* Proton SSO */}
        <a
          href="https://account.proton.me"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2.5 w-full py-2.5 rounded-lg border text-sm font-medium mb-5 transition-colors hover:border-[#6D4AFF]/60"
          style={{ background: '#1a1a2e', borderColor: '#3a3560', color: '#c8c4f0' }}
        >
          <ProtonIcon />
          Continue with Proton
        </a>

        <div className="flex items-center gap-3 mb-5">
          <div className="flex-1 h-px" style={{ background: '#2a2a4a' }} />
          <span className="text-xs" style={{ color: '#4a5568' }}>
            or sign in with email
          </span>
          <div className="flex-1 h-px" style={{ background: '#2a2a4a' }} />
        </div>

        {error && (
          <div
            className="mb-4 px-4 py-3 rounded-lg text-sm border"
            style={{ background: '#2d1a1a', borderColor: '#7a2020', color: '#f87171' }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: '#8892a4' }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@example.com"
              className="w-full px-4 py-2.5 rounded-lg border text-sm outline-none transition-all"
              style={{ background: '#1a1a2e', borderColor: '#2a2a4a', color: '#e0e0e0' }}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: '#8892a4' }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              className="w-full px-4 py-2.5 rounded-lg border text-sm outline-none transition-all"
              style={{ background: '#1a1a2e', borderColor: '#2a2a4a', color: '#e0e0e0' }}
            />
          </div>
          <button
            type="submit"
            disabled={loading || flowLoading}
            className="w-full py-2.5 rounded-lg font-medium text-sm transition-opacity disabled:opacity-50"
            style={{ background: '#7F77DD', color: '#fff' }}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm" style={{ color: '#8892a4' }}>
          Don&apos;t have an account?{' '}
          <Link
            href="/register"
            className="font-medium hover:underline"
            style={{ color: '#7F77DD' }}
          >
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
