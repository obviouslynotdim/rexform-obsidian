'use client';
import { useState } from 'react';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      setResults(data.results || []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen p-8" style={{ background: 'var(--bg-base)' }}>
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>
          Search Notes
        </h1>

        <form onSubmit={handleSearch} className="flex gap-3 mb-8">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by title or content..."
            className="flex-1 px-4 py-3 rounded-xl border outline-none text-sm transition-all"
            style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            onFocus={(e) => (e.target.style.borderColor = 'var(--accent)')}
            onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
            autoFocus
          />
          <Button type="submit" loading={loading} size="lg" className="rounded-xl">
            {loading ? 'Searching...' : 'Search'}
          </Button>
        </form>

        {loading && (
          <div className="text-center py-10" style={{ color: 'var(--text-secondary)' }}>
            Searching...
          </div>
        )}

        {!loading && searched && results.length === 0 && (
          <div className="text-center py-10" style={{ color: 'var(--text-secondary)' }}>
            No results found for &quot;{query}&quot;
          </div>
        )}

        {!loading && results.length > 0 && (
          <div>
            <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
              {results.length} result{results.length !== 1 ? 's' : ''} for &quot;{query}&quot;
            </p>
            <div className="space-y-3">
              {results.map((note: any) => (
                <Link key={note._id} href={`/notes/${encodeURIComponent(note._id)}`} className="block">
                  <Card hover className="p-5">
                    <h3 className="font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                      {note.title || note._id}
                    </h3>
                    {note.snippet && (
                      <p className="text-sm line-clamp-3" style={{ color: 'var(--text-secondary)' }}>
                        {note.snippet}
                      </p>
                    )}
                    <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
                      {note._id}
                    </p>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        )}

        {!searched && (
          <div className="text-center py-16">
            <div className="text-5xl mb-4">🔍</div>
            <p style={{ color: 'var(--text-secondary)' }}>Enter a query to search your notes</p>
          </div>
        )}
      </div>
    </div>
  );
}
