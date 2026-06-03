'use client';
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Link from 'next/link';
import NoteEditor from './NoteEditor';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';

interface Props {
  noteId: string;
  title: string;
  content: string;
  folder: string;
  tags: string[];
  mtime?: number;
  size?: number;
}

export default function NoteViewClient({ noteId, title, content, folder, tags, mtime, size }: Props) {
  const [editing, setEditing] = useState(false);
  const [liveContent, setLiveContent] = useState(content);

  return (
    <div className="max-w-4xl mx-auto px-8 py-10">
      {/* Header */}
      <div
        className="mb-8 pb-6 border-b flex items-start justify-between gap-4"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="min-w-0">
          <Link
            href="/notes"
            className="text-xs mb-3 inline-block hover:underline"
            style={{ color: 'var(--accent)' }}
          >
            ← All Notes
          </Link>
          {folder && (
            <p className="text-xs mb-2" style={{ color: 'var(--accent)' }}>
              📁 {folder}
            </p>
          )}
          <h1 className="text-3xl font-bold capitalize" style={{ color: 'var(--text-primary)' }}>
            {title}
          </h1>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-0.5 rounded text-xs font-medium"
                  style={{ background: 'var(--border)', color: 'var(--accent)' }}
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}
          <div className="flex gap-4 mt-3 text-xs" style={{ color: 'var(--text-muted)' }}>
            {mtime ? (
              <span>
                Modified{' '}
                {new Date(mtime).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                })}
              </span>
            ) : null}
            {size ? <span>{(size / 1024).toFixed(1)} KB</span> : null}
          </div>
        </div>

        <Button
          variant={editing ? 'primary' : 'secondary'}
          size="sm"
          onClick={() => setEditing((e) => !e)}
          className="flex-shrink-0"
        >
          {editing ? 'View' : 'Edit'}
        </Button>
      </div>

      {/* Body */}
      {editing ? (
        <div style={{ height: '60vh' }}>
          <NoteEditor
            noteId={noteId}
            initialContent={liveContent}
            onSave={setLiveContent}
          />
        </div>
      ) : liveContent ? (
        <div className="prose">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{liveContent}</ReactMarkdown>
        </div>
      ) : (
        <Card className="p-6 text-center">
          <p style={{ color: 'var(--text-secondary)' }}>No content found for this note.</p>
        </Card>
      )}
    </div>
  );
}
