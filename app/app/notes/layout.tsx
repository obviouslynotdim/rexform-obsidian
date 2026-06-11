import NotesShell from '@/components/NotesShell';

export default function NotesLayout({ children }: { children: React.ReactNode }) {
  return <NotesShell>{children}</NotesShell>;
}
