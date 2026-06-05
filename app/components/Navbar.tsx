'use client';

import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';
import { usePathname } from 'next/navigation';
import Logo from '@/components/ui/Logo';
import VaultSwitcher from '@/components/VaultSwitcher';

export default function Navbar() {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const loading = status === 'loading';

  const navLink = (href: string, label: React.ReactNode) => {
    const active = pathname === href || pathname.startsWith(href + '/');
    return (
      <Link
        href={href}
        className="px-3 py-1.5 rounded-lg text-sm transition-colors hover:bg-white/5"
        style={{ color: active ? 'var(--accent)' : 'var(--text-secondary)', fontWeight: active ? 500 : 400 }}
      >
        {label}
      </Link>
    );
  };

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50 h-14 flex items-center justify-between px-6 border-b"
      style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
    >
      {/* Logo */}
      <Link href="/dashboard" className="flex items-center gap-2 font-bold text-lg flex-shrink-0">
        <Logo size="sm" />
      </Link>

      {/* Nav links */}
      {session && (
        <div className="flex items-center gap-1">
          {navLink('/dashboard', 'Dashboard')}
          {navLink('/notes', 'Notes')}
          {session.user?.isAdmin && navLink('/admin', 'Admin')}
          {navLink(
            '/search',
            <span className="flex items-center gap-1.5">
              <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
              Search
            </span>
          )}
        </div>
      )}

      {/* Vault switcher */}
      {session && <VaultSwitcher />}

      {/* Right — auth state */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {loading ? (
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>…</span>
        ) : session ? (
          <>
            <span
              className="text-xs px-2 py-1 rounded-md border hidden sm:block"
              style={{
                color: 'var(--text-secondary)',
                borderColor: 'var(--border)',
                maxWidth: 180,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {session.user?.email}
            </span>
            <button
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="px-3 py-1.5 rounded-lg text-sm transition-colors hover:bg-white/5 border"
              style={{ color: '#e05c5c', borderColor: 'var(--border)' }}
            >
              Sign out
            </button>
          </>
        ) : (
          <>
            <Link
              href="/login"
              className="px-3 py-1.5 rounded-lg text-sm transition-colors hover:bg-white/5"
              style={{ color: 'var(--text-secondary)' }}
            >
              Sign in
            </Link>
            <Link
              href="/register"
              className="px-3 py-1.5 rounded-lg text-sm font-medium transition-opacity hover:opacity-90"
              style={{ background: 'var(--accent)', color: '#fff' }}
            >
              Register
            </Link>
          </>
        )}
      </div>
    </nav>
  );
}
