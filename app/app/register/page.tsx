'use client';

import { useState, useEffect } from 'react';
import { signIn, useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Logo from '@/components/ui/Logo';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';

function passwordStrength(pw: string): number {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return score;
}

const SSO_ENABLED = process.env.NEXT_PUBLIC_SSO_ENABLED === 'true';

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
  const r = await fetch('/api/auth/kratos/flow?type=registration');
  if (!r.ok) throw new Error('flow init failed');
  const d = await r.json();
  return d.id;
}

export default function RegisterPage() {
  const router = useRouter();
  const { status } = useSession();

  useEffect(() => {
    if (status === 'authenticated') router.replace('/notes');
  }, [status, router]);

  const [flowId, setFlowId] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [globalError, setGlobalError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    initFlow()
      .then(setFlowId)
      .catch(() => setGlobalError('Failed to initialise registration. Please refresh.'));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!flowId) return;
    setLoading(true);
    setErrors({});
    setGlobalError('');

    try {
      const res = await fetch('/api/auth/kratos/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flowId, email, password, firstName, lastName }),
      });
      const data = await res.json();

      if (!res.ok) {
        const fieldErrors: Record<string, string> = {};
        const nodes: any[] = data?.ui?.nodes ?? [];
        for (const node of nodes) {
          const field: string = node?.attributes?.name ?? '';
          const msg: string = node?.messages?.[0]?.text ?? '';
          if (field && msg) fieldErrors[field] = msg;
        }
        const globalMsg =
          data?.ui?.messages?.[0]?.text || data?.error?.message || 'Registration failed';
        if (Object.keys(fieldErrors).length > 0) {
          setErrors(fieldErrors);
        } else {
          setGlobalError(globalMsg);
        }
        initFlow().then(setFlowId).catch(() => {});
        setLoading(false);
        return;
      }

      const loginFlowRes = await fetch('/api/auth/kratos/flow?type=login');
      const loginFlow = await loginFlowRes.json();
      const result = await signIn('credentials', {
        redirect: false,
        email,
        password,
        flowId: loginFlow.id,
      });
      setLoading(false);
      if (result?.error) {
        setGlobalError('Registered! But auto sign-in failed — please log in manually.');
        router.push('/login');
      } else {
        router.replace('/notes');
        router.refresh();
      }
    } catch {
      setGlobalError('Network error. Please try again.');
      setLoading(false);
    }
  }

  const strength = passwordStrength(password);

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-10"
      style={{ background: 'var(--bg-base)' }}
    >
      <div
        className="w-full max-w-md rounded-2xl border p-8"
        style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
      >
        {/* Logo */}
        <div className="flex items-center gap-2 mb-8">
          <Logo />
        </div>

        <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
          Create your account
        </h1>
        <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
          Your personal knowledge base awaits
        </p>

        {SSO_ENABLED && (
          <>
            <button
              type="button"
              onClick={() => signIn('rexform-sso', { callbackUrl: '/notes' })}
              className="flex items-center justify-center gap-2.5 w-full py-2.5 rounded-lg border text-sm font-medium mb-5 transition-colors hover:border-[#6D4AFF]/60"
              style={{ background: 'var(--bg-base)', borderColor: '#3a3560', color: '#c8c4f0' }}
            >
              <SsoIcon />
              Sign up with REXFORM SSO
            </button>

            <div className="flex items-center gap-3 mb-5">
              <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                or register with email
              </span>
              <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
            </div>
          </>
        )}

        {globalError && (
          <div
            className="mb-4 px-4 py-3 rounded-lg text-sm border"
            style={{ background: '#2d1a1a', borderColor: '#7a2020', color: '#f87171' }}
          >
            {globalError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="First name"
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
              placeholder="John"
              error={errors['traits.name.first']}
            />
            <Input
              label="Last name"
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
              placeholder="Doe"
              error={errors['traits.name.last']}
            />
          </div>

          <Input
            label="Email"
            type="email"
            name="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="you@example.com"
            error={errors['traits.email']}
          />

          <div>
            <Input
              label="Password"
              type="password"
              name="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              error={errors['password']}
            />
            <div className="flex gap-1 mt-2">
              {[1, 2, 3, 4].map((seg) => (
                <div
                  key={seg}
                  className="h-1 flex-1 rounded-full transition-all duration-300"
                  style={{ background: strength >= seg ? 'var(--accent)' : 'var(--border)' }}
                />
              ))}
            </div>
          </div>

          <Button
            type="submit"
            disabled={!flowId}
            loading={loading}
            className="w-full mt-2"
          >
            {loading ? 'Creating account…' : 'Create account'}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
          Already have an account?{' '}
          <Link href="/login" className="font-medium hover:underline" style={{ color: 'var(--accent)' }}>
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
