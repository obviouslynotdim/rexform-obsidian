'use client';

import { Suspense, useState, useEffect, useRef } from 'react';
import { signIn, signOut, useSession, getProviders } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Logo from '@/components/ui/Logo';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';

function SsoIcon() {
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
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const { data: session, status } = useSession();
  const [flowId, setFlowId] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [flowLoading, setFlowLoading] = useState(true);
  // null = provider list not fetched yet; the error handler below must wait
  // for it before deciding between a silent SSO retry and the error banner.
  const [ssoEnabled, setSsoEnabled] = useState<boolean | null>(null);
  const searchParams = useSearchParams();

  // Runtime check instead of a NEXT_PUBLIC_ flag: build-time inlining goes
  // stale behind Docker layer caching, and this can never disagree with the
  // server's actual provider list.
  useEffect(() => {
    getProviders()
      .then((p) => setSsoEnabled(!!p?.['rexform-sso']))
      .catch(() => setSsoEnabled(false));
  }, []);

  useEffect(() => {
    // NextAuth redirects failed OAuth flows back here with ?error=...
    const err = searchParams.get('error');
    if (!err) return;
    if (err === 'AccessDenied') {
      setError('SSO sign-in was cancelled or denied.');
      return;
    }
    if (ssoEnabled === null || status === 'loading') return;
    // IdP-initiated entries (a portal deep-linking the OAuth callback) fail
    // with "State cookie was missing" because the flow didn't start here.
    // Restarting it from this app once succeeds; the sessionStorage flag
    // stops an error loop when the flow is genuinely broken.
    if (ssoEnabled && status === 'unauthenticated' && !sessionStorage.getItem('ssoAutoRetried')) {
      sessionStorage.setItem('ssoAutoRetried', '1');
      signIn('rexform-sso', { callbackUrl: '/notes' });
      return;
    }
    setError('SSO sign-in failed. Please try again or use email login.');
  }, [searchParams, ssoEnabled, status]);

  // IdP-initiated entry point: other REXFORM apps link to /login?sso=1 and
  // the OAuth flow starts HERE (state/PKCE cookies must originate from this
  // app — deep-linking the callback URL fails with "State cookie was
  // missing"). Skipped when ?error= is present so a failed flow can't loop.
  // A stale local session is discarded first so the entry always reflects
  // whoever is signed into the IAM right now, not a previous notes login.
  // The ref stops a second signIn when signOut flips status to
  // unauthenticated (two racing flows would clobber each other's state
  // cookie).
  const ssoEntryStarted = useRef(false);
  const ssoEntry = searchParams.get('sso') === '1' && !searchParams.get('error');
  useEffect(() => {
    if (!ssoEntry || !ssoEnabled || status === 'loading' || ssoEntryStarted.current) return;
    ssoEntryStarted.current = true;
    sessionStorage.removeItem('ssoAutoRetried');
    if (status === 'authenticated') {
      signOut({ redirect: false }).then(() => signIn('rexform-sso', { callbackUrl: '/notes' }));
    } else {
      signIn('rexform-sso', { callbackUrl: '/notes' });
    }
  }, [ssoEntry, ssoEnabled, status]);

  useEffect(() => {
    if (status === 'authenticated' && !ssoEntry) {
      sessionStorage.removeItem('ssoAutoRetried');
      window.location.href = session?.user?.isAdmin ? '/admin' : '/notes';
    }
  }, [status, session, ssoEntry]);

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
      initFlow().then(setFlowId).catch(() => {});
    } else {
      // '/' lets the middleware route by role — /admin for admins, /notes
      // otherwise (the fresh session isn't readable client-side yet here).
      // Honor an incoming callbackUrl (e.g. an invite link that redirected
      // here to sign in first) — restricted to relative paths to rule out
      // an open redirect via a crafted query param.
      const cb = searchParams.get('callbackUrl');
      window.location.href = cb && cb.startsWith('/') && !cb.startsWith('//') ? cb : '/';
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--bg-base)' }}>
      <div
        className="w-full max-w-md rounded-2xl border p-8"
        style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
      >
        {/* Logo */}
        <div className="flex items-center gap-2 mb-8">
          <Logo />
        </div>

        <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
          Welcome back
        </h1>
        <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
          Sign in to your workspace
        </p>

        {error && (
          <div
            className="mb-4 px-4 py-3 rounded-lg text-sm border"
            style={{ background: '#2d1a1a', borderColor: '#7a2020', color: '#f87171' }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Email"
            type="email"
            name="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="you@example.com"
          />
          <Input
            label="Password"
            type="password"
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            placeholder="••••••••"
          />
          <Button
            type="submit"
            disabled={flowLoading}
            loading={loading}
            className="w-full"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>

        {ssoEnabled && (
          <>
            <div className="flex items-center gap-3 my-5">
              <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                or
              </span>
              <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
            </div>

            <button
              type="button"
              onClick={() => signIn('rexform-sso', { callbackUrl: '/notes' })}
              className="flex items-center justify-center gap-2.5 w-full py-2.5 rounded-lg border text-sm font-medium transition-colors hover:border-[#6D4AFF]/60"
              style={{ background: 'var(--bg-base)', borderColor: '#3a3560', color: '#c8c4f0' }}
            >
              <SsoIcon />
              Continue with REXFORM SSO
            </button>
          </>
        )}

        <p className="mt-6 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
          Don&apos;t have an account?{' '}
          <Link href="/register" className="font-medium hover:underline" style={{ color: 'var(--accent)' }}>
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
