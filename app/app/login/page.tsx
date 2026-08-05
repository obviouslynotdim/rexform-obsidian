'use client';

import { Suspense, useState, useEffect, useRef } from 'react';
import { signIn, signOut, useSession, getProviders } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Logo from '@/components/ui/Logo';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import AuthLayout, { SsoIcon } from '@/components/auth/AuthLayout';

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
  const [ssoLoading, setSsoLoading] = useState(false);
  const [flowLoading, setFlowLoading] = useState(true);
  // null = provider list not fetched yet; the error handler below must wait
  // for it before deciding between a silent SSO retry and the error banner.
  const [ssoEnabled, setSsoEnabled] = useState<boolean | null>(null);
  const searchParams = useSearchParams();

  // True the instant this page mounts for either auto-redirect path below
  // (?sso=1 deep link, or a retryable OAuth error) — before that, the full
  // email/password form would otherwise render for a beat while ssoEnabled/
  // status are still resolving, which is exactly the "flash of the login
  // form" a portal-initiated SSO entry produces. Only flips to false once an
  // effect below actually decides NOT to auto-redirect.
  const [autoRedirecting, setAutoRedirecting] = useState(() => {
    const err = searchParams.get('error');
    const sso = searchParams.get('sso') === '1';
    return (sso && !err) || (!!err && err !== 'AccessDenied');
  });

  // Runtime check instead of a NEXT_PUBLIC_ flag: build-time inlining goes
  // stale behind Docker layer caching, and this can never disagree with the
  // server's actual provider list.
  useEffect(() => {
    getProviders()
      .then((p) => setSsoEnabled(!!p?.['rexform-sso']))
      .catch(() => setSsoEnabled(false));
  }, []);

  // Safety net: if SSO turns out not to be configured, neither auto-redirect
  // effect below will ever fire — without this, autoRedirecting would stay
  // true forever and strand the user on a spinner with no form.
  useEffect(() => {
    if (ssoEnabled === false) setAutoRedirecting(false);
  }, [ssoEnabled]);

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
    setAutoRedirecting(false);
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

  // Portal-initiated entry (?sso=1) or a retryable OAuth error — skip the
  // credentials form entirely instead of mounting it for a beat while we
  // figure out whether to auto-redirect.
  if (autoRedirecting) {
    return (
      <AuthLayout scrollable={false}>
        <div className="flex flex-col items-center text-center">
          <div className="flex items-center gap-2 mb-8">
            <Logo />
          </div>
          <svg className="animate-spin h-6 w-6 mb-4" fill="none" viewBox="0 0 24 24" style={{ color: 'var(--accent)' }}>
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Signing you in via REXFORM SSO…
          </p>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout scrollable={false}>
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
            disabled={ssoLoading}
            onClick={() => {
              setSsoLoading(true);
              signIn('rexform-sso', { callbackUrl: '/notes' });
            }}
            className="flex items-center justify-center gap-2.5 w-full py-2.5 rounded-lg border text-sm font-medium transition-colors hover:border-[#6D4AFF]/60 disabled:opacity-60"
            style={{ background: 'var(--bg-base)', borderColor: '#3a3560', color: '#c8c4f0' }}
          >
            {ssoLoading ? (
              <svg className="animate-spin h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <SsoIcon />
            )}
            {ssoLoading ? 'Redirecting to SSO…' : 'Continue with REXFORM SSO'}
          </button>
        </>
      )}

      <p className="mt-6 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
        Don&apos;t have an account?{' '}
        <Link href="/register" className="font-medium hover:underline" style={{ color: 'var(--accent)' }}>
          Create one
        </Link>
      </p>
    </AuthLayout>
  );
}
