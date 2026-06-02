'use client';
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Link from 'next/link';
import NoteEditor from './NoteEditor';

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
        style={{ borderColor: '#2a2a4a' }}
      >
        <div className="min-w-0">
          <Link
            href="/notes"
            className="text-xs mb-3 inline-block hover:underline"
            style={{ color: '#7F77DD' }}
          >
            ← All Notes
          </Link>
          {folder && (
            <p className="text-xs mb-2" style={{ color: '#7F77DD' }}>
              📁 {folder}
            </p>
          )}
          <h1 className="text-3xl font-bold capitalize" style={{ color: '#f0f0f0' }}>
            {title}
          </h1>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-0.5 rounded text-xs font-medium"
                  style={{ background: '#2a2a4a', color: '#7F77DD' }}
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}
          <div className="flex gap-4 mt-3 text-xs" style={{ color: '#4a5568' }}>
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

        <button
          onClick={() => setEditing((e) => !e)}
          className="flex-shrink-0 px-4 py-2 rounded-lg text-sm font-medium border transition-colors"
          style={{
            borderColor: '#7F77DD',
            color: editing ? '#fff' : '#7F77DD',
            background: editing ? '#7F77DD' : 'transparent',
          }}
        >
          {editing ? 'View' : 'Edit'}
        </button>
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
        <div
          className="rounded-xl p-6 border text-center"
          style={{ borderColor: '#2a2a4a', background: '#16213e' }}
        >
          <p style={{ color: '#8892a4' }}>No content found for this note.</p>
        </div>
      )}
    </div>
  );
}
