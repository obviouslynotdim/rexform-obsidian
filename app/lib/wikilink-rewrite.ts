import { fetchFromVault, AuthHeaders } from '@/lib/couchdb';

// One moved note: its full path before and after, both without the .md
// extension (the form wikilinks use).
export interface PathPair {
  oldPath: string;
  newPath: string;
}

/**
 * Rewrites path-qualified wikilinks (`[[folder/Note]]`) that pointed at a
 * moved note. Bare `[[Note]]` links resolve by filename and survive moves, so
 * links without a `/` are never touched. A link is rewritten only when it
 * resolved against a note's OLD path (exact or suffix match, matching the
 * client resolver's step-5 semantics: lowercase, no `.md`) but no longer
 * resolves against the NEW path — e.g. `[[projects/Note]]` still works after
 * `projects` merely gains a new parent folder, so it's left alone.
 * Broken links are rewritten to the full new path; `#heading` and `|alias`
 * parts are preserved. Returns the input unchanged when nothing matches.
 */
export function rewritePathWikilinks(content: string, pairs: PathPair[]): string {
  if (pairs.length === 0) return content;
  return content.replace(/\[\[([^\[\]\n]+)\]\]/g, (full, inner: string) => {
    const pipeIdx = inner.indexOf('|');
    const alias = pipeIdx >= 0 ? inner.slice(pipeIdx) : '';
    const beforeAlias = pipeIdx >= 0 ? inner.slice(0, pipeIdx) : inner;
    const hashIdx = beforeAlias.indexOf('#');
    const heading = hashIdx >= 0 ? beforeAlias.slice(hashIdx) : '';
    const name = hashIdx >= 0 ? beforeAlias.slice(0, hashIdx) : beforeAlias;
    if (!name.includes('/')) return full;

    const lower = name.toLowerCase();
    for (const { oldPath, newPath } of pairs) {
      const oldLower = oldPath.toLowerCase();
      const matchesOld = oldLower === lower || oldLower.endsWith('/' + lower);
      if (!matchesOld) continue;
      const newLower = newPath.toLowerCase();
      const matchesNew = newLower === lower || newLower.endsWith('/' + lower);
      if (matchesNew) break; // still resolves — leave the link as written
      return `[[${newPath}${heading}${alias}]]`;
    }
    return full;
  });
}

/**
 * Best-effort vault-wide pass: after notes move (folder rename, folder move,
 * or a single-note move), scan every doc and rewrite path-qualified wikilinks
 * that broke. Content lives in chunk docs (`data`) with inline
 * `body`/`content`/`text` fallbacks — same field set the note-rename backlink
 * update uses. Only docs whose content actually changes are written back.
 * Intended to be fired un-awaited; per-doc failures are swallowed (the move
 * itself already succeeded).
 */
export async function updatePathBacklinks(
  pairs: PathPair[],
  auth: AuthHeaders | undefined,
  db: string
): Promise<void> {
  if (pairs.length === 0) return;
  const res = await fetchFromVault('_all_docs?include_docs=true&limit=5000', {}, auth, db);
  if (!res.ok) return;
  const data = await res.json();
  const rows: any[] = Array.isArray(data.rows) ? data.rows : [];
  const contentFields = ['data', 'body', 'content', 'text'] as const;

  await Promise.all(
    rows.map(async (row) => {
      const doc = row.doc;
      if (!doc || doc._deleted) return;
      const id: string = doc._id;
      if (id.startsWith('_design/') || id.startsWith('_')) return;

      let changed = false;
      const updated: Record<string, unknown> = { ...doc };
      for (const field of contentFields) {
        const value = doc[field];
        if (typeof value !== 'string') continue;
        const rewritten = rewritePathWikilinks(value, pairs);
        if (rewritten !== value) {
          updated[field] = rewritten;
          changed = true;
        }
      }
      if (!changed) return;

      try {
        await fetchFromVault(
          encodeURIComponent(id),
          { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updated) },
          auth,
          db
        );
      } catch {
        // best-effort per doc — skip on conflict/error
      }
    })
  );
}
