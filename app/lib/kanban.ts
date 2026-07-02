// Dependency-free parser/serializer for the Obsidian Kanban board format.
//
// Operates on the note BODY only — the `kanban-plugin: basic` frontmatter that
// marks a note as a board is handled by lib/frontmatter.ts, same as any note.
// Same client/server split rationale as frontmatter.ts: importable from both.
//
// Format (compatible with Obsidian's Kanban community plugin):
//   ## Heading            → a column
//   - [ ] text            → a card ( `- [x]` = checked )
//   **Complete**          → marks the column as the "done" column (cards
//                           dropped there get checked)
//   ***                   → everything from the first `***` (or the
//                           `%% kanban:settings` block) onward — the plugin's
//                           archive/settings — is preserved verbatim as `trailer`.
//
// Round-trips: serializeKanban(parseKanban(doc)) === doc for canonical docs
// (the form this serializer emits — which is also what Obsidian's plugin emits
// modulo blank-line counts). Cards keep multi-line text; continuation lines
// are indented two spaces on output.

export interface KanbanCard {
  text: string; // may contain \n — continuation lines of a multi-line card
  checked: boolean;
}

export interface KanbanColumn {
  title: string;
  /** `**Complete**` marker present — cards moved here get checked. */
  complete: boolean;
  cards: KanbanCard[];
}

export interface KanbanBoard {
  /** Raw text before the first `## ` column heading (usually ''). */
  prelude: string;
  columns: KanbanColumn[];
  /** Raw archive/settings tail (`***…` / `%% kanban:settings…`), verbatim. */
  trailer: string;
}

const COLUMN_RE = /^##(?!#)\s+(.+?)\s*$/;
const CARD_RE = /^-\s+\[( |x|X)\]\s?(.*)$/;
const COMPLETE_MARKER = '**Complete**';

/** True when a parsed frontmatter map marks the note as a Kanban board. */
export function isKanbanFrontmatter(frontmatter: Record<string, unknown>): boolean {
  return 'kanban-plugin' in frontmatter;
}

/** Parse a board BODY (frontmatter already stripped) into a structured board. */
export function parseKanban(body: string): KanbanBoard {
  const lines = body.split('\n');

  // Trailer: from the first `***` rule or `%% kanban:settings` line to the end.
  let trailerStart = lines.length;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t === '***' || t.startsWith('%% kanban:')) {
      trailerStart = i;
      break;
    }
  }
  const trailer = lines.slice(trailerStart).join('\n').trim();

  const board: KanbanBoard = { prelude: '', columns: [], trailer };
  const preludeLines: string[] = [];
  let column: KanbanColumn | null = null;
  let card: KanbanCard | null = null;

  for (let i = 0; i < trailerStart; i++) {
    const line = lines[i];

    const heading = COLUMN_RE.exec(line);
    if (heading) {
      column = { title: heading[1], complete: false, cards: [] };
      card = null;
      board.columns.push(column);
      continue;
    }

    if (!column) {
      preludeLines.push(line);
      continue;
    }

    if (line.trim() === '') { card = null; continue; } // blank ends a card's continuation

    if (line.trim() === COMPLETE_MARKER && column.cards.length === 0) {
      column.complete = true;
      continue;
    }

    const m = CARD_RE.exec(line);
    if (m) {
      card = { text: m[2], checked: m[1] !== ' ' };
      column.cards.push(card);
      continue;
    }

    // Anything else: continuation of the current card (indented sub-content),
    // preserved so a foreign board never loses data on save.
    if (card) {
      card.text += '\n' + line.replace(/^\s+/, '');
    } else {
      // Stray line in a column with no card yet — keep it as an unchecked card
      // rather than dropping it.
      card = { text: line.trim(), checked: false };
      column.cards.push(card);
    }
  }

  board.prelude = preludeLines.join('\n').trim();
  return board;
}

function serializeCard(card: KanbanCard): string {
  const [first, ...rest] = card.text.split('\n');
  const head = `- [${card.checked ? 'x' : ' '}] ${first}`;
  if (rest.length === 0) return head;
  return [head, ...rest.map((l) => `  ${l}`)].join('\n');
}

/** Serialize a board back to a note body (trimmed, no trailing newline). */
export function serializeKanban(board: KanbanBoard): string {
  const blocks: string[] = [];
  if (board.prelude) blocks.push(board.prelude);

  for (const col of board.columns) {
    const bodyLines: string[] = [];
    if (col.complete) bodyLines.push(COMPLETE_MARKER);
    for (const c of col.cards) bodyLines.push(serializeCard(c));
    blocks.push(
      bodyLines.length > 0 ? `## ${col.title}\n\n${bodyLines.join('\n')}` : `## ${col.title}`
    );
  }

  if (board.trailer) blocks.push(board.trailer);
  return blocks.join('\n\n');
}

/**
 * Full document for a freshly-created board. The frontmatter is written raw
 * (not via serializeFrontmatter) so the key stays unquoted — byte-identical
 * to what Obsidian's Kanban plugin writes.
 */
export function starterBoardDoc(): string {
  return `---\nkanban-plugin: basic\n---\n\n${starterBoardBody()}`;
}

/** Body of a freshly-created board (frontmatter added by the caller). */
export function starterBoardBody(): string {
  return serializeKanban({
    prelude: '',
    columns: [
      { title: 'To do', complete: false, cards: [{ text: 'New card', checked: false }] },
      { title: 'Doing', complete: false, cards: [] },
      { title: 'Done', complete: true, cards: [] },
    ],
    trailer: '',
  });
}
