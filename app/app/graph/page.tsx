'use client';
import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import GraphView from '@/components/GraphView';
import { TabsProvider } from '@/context/TabsContext';

export default function GraphPage() {
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login');
  }, [status, router]);

  if (status === 'loading' || status === 'unauthenticated') return null;

  return (
    <TabsProvider>
      <div
        style={{
          width: '100vw',
          height: 'calc(100vh - 56px)',
          background: 'var(--bg-base)',
          overflow: 'hidden',
        }}
      >
        <GraphView showHeader />
      </div>
    </TabsProvider>
  );
}
