import NotesSidebar from '@/components/NotesSidebar';

export default function NotesLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-[calc(100vh-56px)]" style={{ background: 'var(--bg-base)' }}>
      <NotesSidebar />
      <div className="flex-1 min-w-0 overflow-hidden">
        {children}
      </div>
    </div>
  );
}
