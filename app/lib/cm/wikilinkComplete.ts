import type { CompletionContext, CompletionResult, CompletionSource } from '@codemirror/autocomplete';

export interface NoteStub { id: string; path: string; title?: string }

export function noteDisplayName(path: string): string {
  return path.split('/').pop()?.replace(/\.md$/i, '') ?? path;
}

// Resolve a wikilink name to a note, mirroring WikiMarkdown's 5-pass strategy:
// exact filename → normalized (hyphen/underscore as space) → id → title → partial path.
export function resolveWikilink(name: string, notes: NoteStub[]): NoteStub | null {
  const lower = name.toLowerCase();
  const norm = (s: string) => s.toLowerCase().replace(/[-_]/g, ' ');
  const lowerNorm = norm(lower);
  const filename = (n: NoteStub) => n.path.split('/').pop()?.replace(/\.md$/i, '') ?? '';

  return (
    notes.find((n) => filename(n).toLowerCase() === lower) ??
    notes.find((n) => norm(filename(n)) === lowerNorm) ??
    notes.find((n) => n.id.replace(/\.md$/i, '').toLowerCase() === lower) ??
    notes.find((n) => !!n.title && n.title.toLowerCase() === lower) ??
    notes.find((n) => {
      const p = n.path.replace(/\.md$/i, '').toLowerCase();
      return p === lower || p.endsWith('/' + lower);
    }) ??
    null
  );
}

// CM6 completion source for `[[wikilink]]`. Reads the latest notes list from a
// ref so the extension can be created once (stable identity) while the notes
// list updates underneath it as SWR resolves.
export function wikilinkCompletions(notesRef: { current: NoteStub[] }): CompletionSource {
  return (context: CompletionContext): CompletionResult | null => {
    // Match `[[` plus any partial name typed after it, up to the cursor.
    const before = context.matchBefore(/\[\[[^\[\]\n]*/);
    if (!before) return null;
    // Don't pop up on an empty `[[` unless the user explicitly triggered it.
    if (before.text === '[[' && !context.explicit) {
      // still offer — Obsidian shows the list immediately on `[[`
    }

    const query = before.text.slice(2).toLowerCase();
    const notes = notesRef.current ?? [];

    const options = notes
      .filter((n) => noteDisplayName(n.path).toLowerCase().includes(query))
      .slice(0, 12)
      .map((n) => {
        const name = noteDisplayName(n.path);
        const folder = n.path.includes('/') ? n.path.split('/').slice(0, -1).join('/') : undefined;
        return {
          label: name,
          detail: folder,
          // Replace the typed `[[partial` with a complete `[[name]]` and drop
          // the caret just after the closing brackets.
          apply: (view: any, _completion: unknown, from: number, to: number) => {
            view.dispatch({
              changes: { from, to, insert: `[[${name}]]` },
              selection: { anchor: from + name.length + 4 },
            });
          },
        };
      });

    if (options.length === 0) return null;
    // We've already filtered; tell CM not to re-filter against the `[[` prefix.
    return { from: before.from, options, filter: false };
  };
}
