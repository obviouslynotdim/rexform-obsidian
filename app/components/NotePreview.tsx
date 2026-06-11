'use client';
import useSWR from 'swr';
import WikiMarkdown from '@/components/WikiMarkdown';

const fetcher = (url: string) => fetch(url).then(r => r.json());

export default function NotePreview({ noteId }: { noteId: string }) {
  const { data, isLoading, error } = useSWR(
    `/api/notes/${encodeURIComponent(noteId)}/content`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 30_000 }
  );

  if (isLoading) {
    return (
      <div style={{ padding: 24, color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>
        Loading…
      </div>
    );
  }

  if (error || data?.error) {
    return (
      <div style={{ padding: 24, color: '#f87171', fontSize: 13 }}>
        Failed to load note
      </div>
    );
  }

  return (
    <div
      className="prose prose-invert"
      style={{ padding: 24, fontSize: 14, lineHeight: 1.7, color: 'rgba(255,255,255,0.85)' }}
    >
      {data?.content ? (
        <WikiMarkdown>{data.content}</WikiMarkdown>
      ) : (
        <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13 }}>No content</p>
      )}
    </div>
  );
}
