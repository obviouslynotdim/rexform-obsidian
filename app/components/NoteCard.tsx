import Link from 'next/link';
import Card from '@/components/ui/Card';

interface Props {
  id: string;
  title: string;
  preview?: string;
}

export default function NoteCard({ id, title, preview }: Props) {
  return (
    <Link href={`/notes/${encodeURIComponent(id)}`} className="block">
      <Card hover className="p-5">
        <h3 className="font-medium mb-2 truncate" style={{ color: 'var(--text-primary)' }}>
          {title}
        </h3>
        {preview && (
          <p className="text-sm line-clamp-2" style={{ color: 'var(--text-secondary)' }}>
            {preview}
          </p>
        )}
      </Card>
    </Link>
  );
}
