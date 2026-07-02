// Dependency-free YAML-frontmatter parser/serializer.
//
// Lives in its own module (not couchdb.ts) so it can be imported from BOTH the
// server (couchdb.ts re-exports these) and 'use client' components without
// dragging server-only code (vault/active-vault/keto, env, Buffer) into the
// client bundle.
//
// Supports the simple subset Obsidian notes actually use:
//   - scalar:        key: value
//   - inline array:  key: [foo, bar]
//   - block array:   key:
//                      - foo
//                      - bar
// Round-trips parse → edit → serialize so frontmatter survives an edit/save.

export type FrontmatterValue = string | string[];
export type Frontmatter = Record<string, FrontmatterValue>;

// Strip one layer of matching surrounding quotes and unescape \" inside.
function unquote(raw: string): string {
  const s = raw.trim();
  if (
    (s.startsWith('"') && s.endsWith('"') && s.length >= 2) ||
    (s.startsWith("'") && s.endsWith("'") && s.length >= 2)
  ) {
    return s.slice(1, -1).replace(/\\"/g, '"');
  }
  return s;
}

// Scalars YAML/Obsidian read as a non-string type stay bare on serialize:
// ISO dates (2026-05-29), numbers, booleans. Everything else is a string and
// gets double-quoted for consistency ("Week 1", "In Progress").
function isBareScalar(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) || // ISO date
    /^-?\d+(\.\d+)?$/.test(value) ||     // int / float
    value === 'true' ||
    value === 'false'
  );
}

function serializeScalar(value: string): string {
  if (value !== '' && isBareScalar(value)) return value;
  return '"' + value.replace(/"/g, '\\"') + '"';
}

// Inline-array items stay bare (spaces are fine: [Week 1, saas]) unless they'd
// break the `[a, b]` syntax — a comma, ':', brackets, quotes, or edge whitespace.
function serializeArrayItem(item: string): string {
  if (item === '' || /[,:\[\]"']/.test(item) || /^\s|\s$/.test(item)) {
    return '"' + item.replace(/"/g, '\\"') + '"';
  }
  return item;
}

// Split the inside of an inline `[...]` on commas, but NOT commas inside a
// quoted item — `[a, "b, c"]` is two items. Keeps quotes on each piece so
// unquote() strips/unescapes them uniformly afterwards.
function splitInlineItems(inner: string): string[] {
  const items: string[] = [];
  let cur = '';
  let quote: '"' | "'" | null = null;
  for (let k = 0; k < inner.length; k++) {
    const ch = inner[k];
    if (quote) {
      if (ch === '\\' && inner[k + 1] === '"') { cur += '\\"'; k++; continue; }
      if (ch === quote) quote = null;
      cur += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
    } else if (ch === ',') {
      items.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  items.push(cur);
  return items.map((s) => unquote(s)).filter((s) => s !== '');
}

/**
 * Parse the leading `--- ... ---` YAML block (if any) off a markdown string.
 * Returns the body content (block removed, trimmed) and a typed frontmatter map.
 */
export function parseFrontmatter(markdown: string): {
  content: string;
  frontmatter: Frontmatter;
} {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { content: markdown, frontmatter: {} };

  const frontmatter: Frontmatter = {};
  const lines = match[1].split(/\r?\n/);
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const colon = line.indexOf(':');
    if (colon <= 0) {
      i++;
      continue;
    }
    const key = line.slice(0, colon).trim();
    const rest = line.slice(colon + 1).trim();

    // Empty value → look ahead for an indented block list (`  - item`).
    if (rest === '') {
      const items: string[] = [];
      let j = i + 1;
      while (j < lines.length && /^\s*-\s+/.test(lines[j])) {
        items.push(unquote(lines[j].replace(/^\s*-\s+/, '')));
        j++;
      }
      if (items.length > 0) {
        frontmatter[key] = items;
        i = j;
        continue;
      }
      frontmatter[key] = '';
      i++;
      continue;
    }

    // Inline array `[a, b]` — quote-aware, so `["b, c"]` stays one item.
    if (rest.startsWith('[') && rest.endsWith(']')) {
      const inner = rest.slice(1, -1).trim();
      frontmatter[key] = inner === '' ? [] : splitInlineItems(inner);
      i++;
      continue;
    }

    // Plain scalar.
    frontmatter[key] = unquote(rest);
    i++;
  }

  return { content: match[2].trim(), frontmatter };
}

/**
 * Serialize a frontmatter map back into a `--- ... ---\n` block.
 * Returns '' (no block) when there are no keys.
 */
export function serializeFrontmatter(frontmatter: Frontmatter): string {
  const keys = Object.keys(frontmatter);
  if (keys.length === 0) return '';

  const lines: string[] = ['---'];
  for (const key of keys) {
    const val = frontmatter[key];
    if (Array.isArray(val)) {
      // Always inline `[a, b, c]` — never block lists (`- item` per line).
      lines.push(`${key}: [${val.map(serializeArrayItem).join(', ')}]`);
    } else {
      lines.push(`${key}: ${serializeScalar(val)}`);
    }
  }
  lines.push('---');
  return lines.join('\n') + '\n';
}

/**
 * Recombine a frontmatter map with body content for persistence.
 * Empty frontmatter → returns the body unchanged (clean note, no block).
 */
export function combineFrontmatter(frontmatter: Frontmatter, content: string): string {
  const fm = serializeFrontmatter(frontmatter);
  if (!fm) return content;
  return fm + '\n' + content;
}

// Backward-compatible alias. Existing callers destructure { content } and (in
// the note page) { frontmatter }; the value type is now string | string[].
export const stripFrontmatter = parseFrontmatter;
