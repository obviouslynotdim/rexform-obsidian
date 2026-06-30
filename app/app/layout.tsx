import type { Metadata } from 'next';
import './globals.css';
import Navbar from '@/components/Navbar';
import SessionProvider from '@/components/SessionProvider';
import { I18nProvider } from '@/lib/i18n/context';

export const metadata: Metadata = {
  title: 'REXFORM Notes',
  description: 'A powerful note-taking app by REXFORM',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <SessionProvider>
          <I18nProvider>
            <Navbar />
            <main className="pt-14">{children}</main>
          </I18nProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
