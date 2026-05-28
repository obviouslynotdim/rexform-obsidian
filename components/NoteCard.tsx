import Link from 'next/link'

interface Props {
  id: string
  title: string
  preview?: string
}

export default function NoteCard({ id, title, preview }: Props) {
  return (
    <Link
      href={`/notes/${encodeURIComponent(id)}`}
      className="block rounded-xl p-5 border transition-colors"
      style={{ background: '#16213e', borderColor: '#2a2a4a' }}
    >
      <h3 className="font-medium mb-2 truncate" style={{ color: '#e0e0e0' }}>{title}</h3>
      {preview && (
        <p className="text-sm line-clamp-2" style={{ color: '#8892a4' }}>{preview}</p>
      )}
    </Link>
  )
}
