'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';
import { usePathname } from 'next/navigation';
import Logo from '@/components/ui/Logo';
import { useSettingsModal } from '@/context/SettingsModalContext';

function MenuIcon({ open }: { open: boolean }) {
  return open ? (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  ) : (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M3 6h18M3 12h18M3 18h18" />
    </svg>
  );
}

export default function Navbar() {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const settingsModal = useSettingsModal();
  const loading = status === 'loading';

  // Below md, the Dashboard/Notes/Admin/Settings row + username badge don't
  // fit next to the logo — they collapse into this dropdown instead of
  // overflowing/wrapping.
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    function onDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMobileOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [mobileOpen]);

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');
  // Admins manage the system, not their own notes — drop the Notes link for
  // them everywhere rather than just on /admin pages.
  const showNotes = !session?.user?.isAdmin;

  const desktopLink = (href: string, label: React.ReactNode) => (
    <Link
      href={href}
      className="px-3 py-1.5 rounded-lg text-sm transition-colors hover:bg-white/5"
      style={{ color: isActive(href) ? 'var(--accent)' : 'var(--text-secondary)', fontWeight: isActive(href) ? 500 : 400 }}
    >
      {label}
    </Link>
  );

  const mobileLink = (href: string, label: React.ReactNode) => (
    <Link
      href={href}
      onClick={() => setMobileOpen(false)}
      className="block px-3 py-2 rounded-lg text-sm transition-colors hover:bg-white/5"
      style={{ color: isActive(href) ? 'var(--accent)' : 'var(--text-secondary)', fontWeight: isActive(href) ? 500 : 400 }}
    >
      {label}
    </Link>
  );

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50 h-14 flex items-center justify-between px-4 sm:px-6 border-b"
      style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
    >
      {/* Logo */}
      <Link href="/dashboard" className="flex items-center gap-2 font-bold text-lg flex-shrink-0">
        <Logo size="sm" />
      </Link>

      {/* Nav links — desktop only */}
      {session && (
        <div className="hidden md:flex items-center gap-1">
          {desktopLink('/dashboard', 'Dashboard')}
          {showNotes && desktopLink('/notes', 'Notes')}
          {session.user?.isAdmin && desktopLink('/admin', 'Admin')}
          <button
            onClick={() => settingsModal?.openSettings()}
            className="px-3 py-1.5 rounded-lg text-sm transition-colors hover:bg-white/5"
            style={{
              color: settingsModal?.open ? 'var(--accent)' : 'var(--text-secondary)',
              fontWeight: settingsModal?.open ? 500 : 400,
            }}
          >
            Settings
          </button>
        </div>
      )}

      {/* Right — auth state, desktop only */}
      <div className="hidden md:flex items-center gap-2 flex-shrink-0">
        {loading ? (
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>…</span>
        ) : session ? (
          <>
            <span
              className="text-xs px-2 py-1 rounded-md border"
              style={{
                color: 'var(--text-secondary)',
                borderColor: 'var(--border)',
                maxWidth: 180,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {session.user?.username || session.user?.email}
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

      {/* Mobile — hamburger for the signed-in nav, or compact sign in/register */}
      {!loading && (
        session ? (
          <div className="md:hidden relative" ref={menuRef}>
            <button
              onClick={() => setMobileOpen((v) => !v)}
              className="p-2 rounded-lg hover:bg-white/5"
              style={{ color: 'var(--text-secondary)' }}
              aria-label="Menu"
            >
              <MenuIcon open={mobileOpen} />
            </button>

            {mobileOpen && (
              <div
                className="absolute right-0 top-full mt-2 w-56 rounded-xl border py-2"
                style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)', boxShadow: '0 12px 32px rgba(0,0,0,0.4)' }}
              >
                {mobileLink('/dashboard', 'Dashboard')}
                {showNotes && mobileLink('/notes', 'Notes')}
                {session.user?.isAdmin && mobileLink('/admin', 'Admin')}
                <button
                  onClick={() => {
                    settingsModal?.openSettings();
                    setMobileOpen(false);
                  }}
                  className="block w-full text-left px-3 py-2 rounded-lg text-sm transition-colors hover:bg-white/5"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Settings
                </button>

                <div className="my-2 border-t" style={{ borderColor: 'var(--border)' }} />

                <p className="px-3 py-1 text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                  {session.user?.username || session.user?.email}
                </p>
                <button
                  onClick={() => signOut({ callbackUrl: '/login' })}
                  className="block w-full text-left px-3 py-2 rounded-lg text-sm transition-colors hover:bg-white/5"
                  style={{ color: '#e05c5c' }}
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="md:hidden flex items-center gap-2 flex-shrink-0">
            <Link
              href="/login"
              className="px-2.5 py-1.5 rounded-lg text-sm transition-colors hover:bg-white/5"
              style={{ color: 'var(--text-secondary)' }}
            >
              Sign in
            </Link>
            <Link
              href="/register"
              className="px-2.5 py-1.5 rounded-lg text-sm font-medium transition-opacity hover:opacity-90"
              style={{ background: 'var(--accent)', color: '#fff' }}
            >
              Register
            </Link>
          </div>
        )
      )}
    </nav>
  );
}
