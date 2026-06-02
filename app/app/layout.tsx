import type { Metadata } from 'next';
import './globals.css';
import Navbar from '@/components/Navbar';
import SessionProvider from '@/components/SessionProvider';

export const metadata: Metadata = {
  title: 'REXFORM Notes',
  description: 'A powerful note-taking app by REXFORM',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen" style={{ background: '#1a1a2e', color: '#e0e0e0' }}>
        <SessionProvider>
          <Navbar />
          <main className="pt-14">{children}</main>
        </SessionProvider>
      </body>
    </html>
  );
}
