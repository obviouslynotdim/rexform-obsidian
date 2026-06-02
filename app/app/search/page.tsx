'use client';
import { useState } from 'react';
import Link from 'next/link';

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
    <div className="min-h-screen p-8" style={{ background: '#1a1a2e' }}>
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold mb-6" style={{ color: '#e0e0e0' }}>
          Search Notes
        </h1>

        <form onSubmit={handleSearch} className="flex gap-3 mb-8">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by title or content..."
            className="flex-1 px-4 py-3 rounded-xl border outline-none text-sm"
            style={{ background: '#16213e', borderColor: '#2a2a4a', color: '#e0e0e0' }}
            onFocus={(e) => (e.target.style.borderColor = '#7F77DD')}
            onBlur={(e) => (e.target.style.borderColor = '#2a2a4a')}
            autoFocus
          />
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-3 rounded-xl font-medium text-sm transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: '#7F77DD', color: '#fff' }}
          >
            {loading ? 'Searching...' : 'Search'}
          </button>
        </form>

        {loading && (
          <div className="text-center py-10" style={{ color: '#8892a4' }}>
            Searching...
          </div>
        )}

        {!loading && searched && results.length === 0 && (
          <div className="text-center py-10" style={{ color: '#8892a4' }}>
            No results found for &quot;{query}&quot;
          </div>
        )}

        {!loading && results.length > 0 && (
          <div>
            <p className="text-sm mb-4" style={{ color: '#8892a4' }}>
              {results.length} result{results.length !== 1 ? 's' : ''} for &quot;{query}&quot;
            </p>
            <div className="space-y-3">
              {results.map((note: any) => (
                <Link
                  key={note._id}
                  href={`/notes/${encodeURIComponent(note._id)}`}
                  className="block rounded-xl p-5 border transition-colors"
                  style={{ background: '#16213e', borderColor: '#2a2a4a' }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#7F77DD')}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#2a2a4a')}
                >
                  <h3 className="font-medium mb-1" style={{ color: '#e0e0e0' }}>
                    {note.title || note._id}
                  </h3>
                  {note.snippet && (
                    <p className="text-sm line-clamp-3" style={{ color: '#8892a4' }}>
                      {note.snippet}
                    </p>
                  )}
                  <p className="text-xs mt-2" style={{ color: '#4a5568' }}>
                    {note._id}
                  </p>
                </Link>
              ))}
            </div>
          </div>
        )}

        {!searched && (
          <div className="text-center py-16">
            <div className="text-5xl mb-4">🔍</div>
            <p style={{ color: '#8892a4' }}>Enter a query to search your notes</p>
          </div>
        )}
      </div>
    </div>
  );
}
