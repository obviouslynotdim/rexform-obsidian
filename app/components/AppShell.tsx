'use client';

import { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import Navbar from './Navbar';

// The auth split-screen (AuthLayout) already fills the full viewport height
// itself — the fixed Navbar + its pt-14 offset on <main> would just push
// everything down and leave a dead 56px strip above it.
const NO_NAVBAR_ROUTES = ['/login', '/register'];

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const hideNavbar = NO_NAVBAR_ROUTES.includes(pathname ?? '');

  if (hideNavbar) {
    return <main>{children}</main>;
  }

  return (
    <>
      <Navbar />
      <main className="pt-14">{children}</main>
    </>
  );
}
