import {
  Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate, WidgetType,
} from '@codemirror/view';
import { StateField, StateEffect, Facet, type Extension, type EditorState } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import { frontmatterBlockLength } from '../frontmatter';

// ── Wikilink bridge ───────────────────────────────────────────────────────--
// CM extensions can't use React hooks, so the resolver (notes list) and the
// click handler (openTab/router) are supplied from React via this facet, whose
// value reads through stable refs and therefore never needs reconfiguring.
export interface WikilinkConfig {
  resolve: (name: string) => { id: string; title: string } | null;
  onOpen: (id: string, title: string) => void;
}

export const wikilinkConfig = Facet.define<WikilinkConfig | null, WikilinkConfig | null>({
  combine: (values) => values[0] ?? null,
});

// ── Toggle ──────────────────────────────────────────────────────────────────
// Live preview is on in 'live' mode, off in 'source' mode. The editor instance
// is shared between the two, so we flip this field instead of rebuilding it.
export const setLivePreview = StateEffect.define<boolean>();

const livePreviewState = StateField.define<boolean>({
  create: () => false,
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setLivePreview)) value = e.value;
    return value;
  },
});

// ── Widgets ───────────────────────────────────────────────────────────────--
class BulletWidget extends WidgetType {
  eq() { return true; }
  toDOM() {
    const span = document.createElement('span');
    span.className = 'cm-rx-bullet';
    span.textContent = '•';
    return span;
  }
}

class HrWidget extends WidgetType {
  eq() { return true; }
  toDOM() {
    const hr = document.createElement('hr');
    hr.className = 'cm-rx-hr';
    return hr;
  }
}

class LinkWidget extends WidgetType {
  constructor(readonly text: string, readonly url: string) { super(); }
  eq(other: LinkWidget) { return other.text === this.text && other.url === this.url; }
  toDOM() {
    const a = document.createElement('a');
    a.className = 'cm-rx-link';
    a.textContent = this.text;
    a.href = this.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    return a;
  }
  ignoreEvent() { return true; } // let the browser handle clicks (navigate)
}

class WikilinkWidget extends WidgetType {
  constructor(
    readonly name: string,
    readonly resolved: { id: string; title: string } | null,
    readonly cfg: WikilinkConfig | null,
  ) { super(); }
  eq(other: WikilinkWidget) {
    return other.name === this.name && other.resolved?.id === this.resolved?.id;
  }
  toDOM() {
    const el = document.createElement('span');
    if (this.resolved) {
      el.className = 'cm-rx-wikilink';
      el.textContent = this.resolved.title;
      // preventDefault on mousedown so CM doesn't move the caret into the widget.
      el.addEventListener('mousedown', (e) => e.preventDefault());
      el.addEventListener('click', (e) => {
        e.preventDefault();
        this.cfg?.onOpen(this.resolved!.id, this.resolved!.title);
      });
    } else {
      el.className = 'cm-rx-wikilink-broken';
      el.textContent = this.name;
      el.title = `Note "${this.name}" not found`;
    }
    return el;
  }
  ignoreEvent() { return true; }
}

// Tables always render, regardless of cursor position (no reveal-on-cursor
// like headings/emphasis) — AND they're directly editable in place: each cell
// is contentEditable, and edits are written back to the document as a single
// replace transaction when a cell loses focus (blur/Enter/Tab-away), never on
// every keystroke. Syncing on every keystroke would make the StateField
// rebuild the widget's DOM mid-type (new raw text → `eq()` fails → CM
// recreates the DOM), which would yank focus out of the cell the user is
// typing in — blur-only sync avoids that entirely.

// Splits a table row on unescaped `|`, trimming the optional leading/trailing pipe.
function splitTableRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  const cells: string[] = [];
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && s[i + 1] === '|') { cur += '|'; i++; continue; }
    if (s[i] === '|') { cells.push(cur.trim()); cur = ''; continue; }
    cur += s[i];
  }
  cells.push(cur.trim());
  return cells;
}

type CellAlign = '' | 'left' | 'center' | 'right';

function alignOf(delimiterCell: string): CellAlign {
  const left = delimiterCell.startsWith(':');
  const right = delimiterCell.endsWith(':');
  if (left && right) return 'center';
  if (right) return 'right';
  if (left) return 'left';
  return '';
}

interface ParsedTable { header: string[]; aligns: CellAlign[]; body: string[][] }

function parseTable(raw: string): ParsedTable | null {
  const rows = raw.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (rows.length < 2) return null;
  return {
    header: splitTableRow(rows[0]),
    aligns: splitTableRow(rows[1]).map(alignOf),
    body: rows.slice(2).map(splitTableRow),
  };
}

// A cell can't contain a literal `|` or newline in GFM table syntax.
function escapeCell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
}

function serializeTable(table: HTMLTableElement, aligns: CellAlign[]): string {
  const lines = Array.from(table.rows).map(
    (tr) => '| ' + Array.from(tr.cells).map((c) => escapeCell(c.textContent ?? '')).join(' | ') + ' |'
  );
  const delimiter =
    '| ' +
    aligns
      .map((a) => (a === 'center' ? ':---:' : a === 'right' ? '---:' : a === 'left' ? ':---' : '---'))
      .join(' | ') +
    ' |';
  return [lines[0], delimiter, ...lines.slice(1)].join('\n');
}

class TableWidget extends WidgetType {
  constructor(readonly raw: string) { super(); }
  eq(other: TableWidget) { return other.raw === this.raw; }

  toDOM() {
    const wrap = document.createElement('div');
    wrap.className = 'cm-rx-table-wrap';
    const parsed = parseTable(this.raw);
    if (!parsed) { wrap.textContent = this.raw; return wrap; }

    const table = document.createElement('table');
    table.className = 'cm-rx-table';

    // Writes the table's current (possibly edited) DOM state back to the
    // document, replacing exactly this widget's original text range. Reads
    // the CURRENT position via posAtDOM (not a position captured at widget
    // creation) so it stays correct even if unrelated edits elsewhere shifted
    // this table's location in the document since the widget was built.
    const sync = () => {
      const newRaw = serializeTable(table, parsed.aligns);
      if (newRaw === this.raw) return;
      const view = EditorView.findFromDOM(wrap);
      if (!view) return;
      const from = view.posAtDOM(wrap);
      view.dispatch({ changes: { from, to: from + this.raw.length, insert: newRaw } });
    };

    const makeCell = (tag: 'th' | 'td', text: string, align: CellAlign) => {
      const cell = document.createElement(tag);
      cell.textContent = text;
      cell.contentEditable = 'true';
      cell.spellcheck = false;
      if (align) cell.style.textAlign = align;
      cell.addEventListener('blur', sync);
      cell.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') {
          e.preventDefault();
          const cells = Array.from(table.querySelectorAll<HTMLElement>('th, td'));
          const i = cells.indexOf(cell);
          (e.shiftKey ? cells[i - 1] : cells[i + 1])?.focus();
        } else if (e.key === 'Enter' || e.key === 'Escape') {
          e.preventDefault();
          cell.blur();
        }
      });
      return cell;
    };

    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    parsed.header.forEach((text, i) => headRow.appendChild(makeCell('th', text, parsed.aligns[i] ?? '')));
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    parsed.body.forEach((row) => {
      const tr = document.createElement('tr');
      row.forEach((text, i) => tr.appendChild(makeCell('td', text, parsed.aligns[i] ?? '')));
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);

    wrap.appendChild(table);
    return wrap;
  }

  ignoreEvent() { return true; }
}

let mermaidWidgetId = 0;

class MermaidWidget extends WidgetType {
  constructor(readonly chart: string) { super(); }
  eq(other: MermaidWidget) { return other.chart === this.chart; }
  toDOM() {
    const wrap = document.createElement('div');
    wrap.className = 'cm-rx-mermaid';
    wrap.textContent = 'Rendering diagram…';
    const id = `cm-rx-mermaid-${mermaidWidgetId++}`;
    const chart = this.chart;
    // Same theme config as WikiMarkdown's Mermaid renderer (Reading mode) —
    // matches WidgetType's synchronous toDOM by mutating the placeholder once
    // the async render resolves.
    import('mermaid')
      .then((m) => {
        const mermaid = m.default;
        mermaid.initialize({
          startOnLoad: false,
          theme: 'dark',
          securityLevel: 'loose',
          fontFamily: 'inherit',
          themeVariables: {
            background: '#1a1a2e',
            primaryColor: '#252538',
            primaryTextColor: '#e8e8f0',
            primaryBorderColor: '#7F77DD',
            lineColor: '#7F77DD',
            secondaryColor: '#2a2a40',
            tertiaryColor: '#1f1f30',
            fontSize: '14px',
          },
        });
        return mermaid.render(id, chart);
      })
      .then(({ svg }) => { wrap.innerHTML = svg; })
      .catch(() => {
        wrap.textContent = chart;
        wrap.classList.add('cm-rx-mermaid-error');
      });
    return wrap;
  }
  ignoreEvent() { return true; }
}

// ── Decoration builder ───────────────────────────────────────────────────────
// `exclusive` marks decorations that hide/replace a range of text (heading
// `#` marks, emphasis marks, HR, bullets, links, wikilinks). CodeMirror
// disallows two of these overlapping each other, so they're tracked
// separately from `mark`/`line` decorations (which are fine to overlap freely
// — that's how e.g. a heading's line style and its inline bold coexist).
interface DecoItem { from: number; to: number; value: Decoration; exclusive: boolean }

function buildInlineDecorations(view: EditorView): DecorationSet {
  try {
    const state: EditorState = view.state;
    if (!state.field(livePreviewState, false)) return Decoration.none;

    const doc = state.doc;
    const sel = state.selection;
    // A range is "revealed" (shows raw markdown) when any cursor/selection touches it.
    const touches = (from: number, to: number) =>
      sel.ranges.some((r) => r.from <= to && r.to >= from);
    const lineRevealed = (pos: number) => {
      const ln = doc.lineAt(pos);
      return touches(ln.from, ln.to);
    };

    // Frontmatter's `---` delimiters collide with CommonMark's Setext-heading
    // grammar (a `---` line right after paragraph-like text becomes a heading
    // underline), so the leading `---\n...\n---` block is never handed to the
    // decoration walk below — it always renders as raw YAML, matching
    // Obsidian's separate properties panel rather than decorating the text.
    const fmEnd = frontmatterBlockLength(doc.sliceString(0, Math.min(doc.length, 4000)));

    const deco: DecoItem[] = [];

    for (const { from, to } of view.visibleRanges) {
      const rangeFrom = Math.max(from, fmEnd);
      if (rangeFrom >= to) continue; // this visible range is entirely inside frontmatter
      syntaxTree(state).iterate({
        from: rangeFrom, to,
        enter: (node) => {
          const name = node.name;

          // Headings — keep the rendered size on the whole line; hide the `#` marks
          // only when the caret isn't on that line. The mark-hide only covers the
          // `# ` prefix (not the whole line), so nested inline styles (bold,
          // wikilinks) inside the heading still need their own pass — keep descending.
          const h = /^ATXHeading(\d)$/.exec(name);
          if (h) {
            const line = doc.lineAt(node.from);
            deco.push({ from: line.from, to: line.from, value: Decoration.line({ class: `cm-rx-h${h[1]}` }), exclusive: false });
            if (!touches(line.from, line.to)) {
              const mark = node.node.firstChild;
              if (mark && mark.name === 'HeaderMark') {
                const end = Math.min(mark.to + 1, line.to); // include the trailing space
                if (end > mark.from) deco.push({ from: mark.from, to: end, value: Decoration.replace({}), exclusive: true });
              }
            }
            return true;
          }

          // Inline styling — style the content always, hide the surrounding marks
          // (`**`, `*`, `~~`, `` ` ``) when the caret isn't inside.
          if (name === 'StrongEmphasis' || name === 'Emphasis' || name === 'Strikethrough' || name === 'InlineCode') {
            const cls =
              name === 'StrongEmphasis' ? 'cm-rx-strong'
              : name === 'Emphasis' ? 'cm-rx-em'
              : name === 'Strikethrough' ? 'cm-rx-strike'
              : 'cm-rx-code';
            deco.push({ from: node.from, to: node.to, value: Decoration.mark({ class: cls }), exclusive: false });
            if (!touches(node.from, node.to)) {
              let child = node.node.firstChild;
              while (child) {
                if (/Mark$/.test(child.name)) {
                  deco.push({ from: child.from, to: child.to, value: Decoration.replace({}), exclusive: true });
                }
                child = child.nextSibling;
              }
            }
            // Inline code's contents are literal text, never further markdown —
            // don't descend. Bold/italic/strikethrough CAN nest other inline
            // styles or a wikilink, so keep descending for those.
            return name !== 'InlineCode';
          }

          // Horizontal rule → <hr> when the caret isn't on the line. Leaf node,
          // nothing to nest.
          if (name === 'HorizontalRule') {
            if (!lineRevealed(node.from)) {
              deco.push({ from: node.from, to: node.to, value: Decoration.replace({ widget: new HrWidget() }), exclusive: true });
            }
            return false;
          }

          // Bullet list marker (`-`/`*`/`+`) → • ; leave ordered-list numbers alone.
          // Leaf node, nothing to nest.
          if (name === 'ListMark') {
            const text = doc.sliceString(node.from, node.to);
            if (/^[-*+]$/.test(text) && !lineRevealed(node.from)) {
              deco.push({ from: node.from, to: node.to, value: Decoration.replace({ widget: new BulletWidget() }), exclusive: true });
            }
            return false;
          }

          // Tables are handled entirely by the separate livePreviewBlockField
          // below — CodeMirror requires block-level decorations (block: true)
          // to come from a StateField, not a ViewPlugin ("Block decorations
          // may not be specified via plugins"). Skip descending so inline
          // decorations here (e.g. bold inside a cell) never overlap the
          // block widget that already replaces the whole node.
          if (name === 'Table') return false;

          // Fenced code blocks — styled like a code block (monospace,
          // background, rounded top/bottom) and the ``` fence lines hide
          // unless the caret is on that specific line, same reveal-on-cursor
          // pattern as headings. Unlike Table, the code CONTENT itself is
          // left as plain editable text (no replace decoration on it) — no
          // widget involved, so typing/cursor behaves exactly like normal
          // text editing. Monospace is restored here specifically because
          // Live Preview's base font is now Inter (proportional), which
          // breaks alignment-dependent code content (ASCII art, tables of
          // numbers, etc.).
          if (name === 'FencedCode') {
            const raw = doc.sliceString(node.from, node.to);
            const firstLineEnd = raw.indexOf('\n');
            const firstLine = firstLineEnd === -1 ? raw : raw.slice(0, firstLineEnd);
            const info = firstLine.replace(/^[`~]+/, '').trim().toLowerCase();
            // Mermaid fences are fully replaced by a diagram widget — handled
            // entirely by livePreviewBlockField, nothing to do here.
            if (info === 'mermaid') return false;

            const startLine = doc.lineAt(node.from);
            const endLine = doc.lineAt(node.to);
            for (let ln = startLine.number; ln <= endLine.number; ln++) {
              const line = doc.line(ln);
              const edge = ln === startLine.number ? ' cm-rx-codeblock-start' : ln === endLine.number ? ' cm-rx-codeblock-end' : '';
              deco.push({ from: line.from, to: line.from, value: Decoration.line({ class: `cm-rx-codeblock${edge}` }), exclusive: false });
            }

            let child = node.node.firstChild;
            while (child) {
              if (child.name === 'CodeMark' || child.name === 'CodeInfo') {
                const line = doc.lineAt(child.from);
                if (!touches(line.from, line.to)) {
                  deco.push({ from: child.from, to: child.to, value: Decoration.replace({}), exclusive: true });
                }
              }
              child = child.nextSibling;
            }
            return false;
          }

          // Standard markdown link [text](url) → clickable text. Wikilinks ([[ ]])
          // have no parens, so they fall through here untouched (handled in A3).
          // The whole node is either replaced by the widget or shown fully raw —
          // never partially decorated — so descending into children (e.g. bold
          // text inside the link label) would only produce decorations that
          // overlap the widget replacement above. Never descend.
          if (name === 'Link') {
            if (!touches(node.from, node.to)) {
              const text = doc.sliceString(node.from, node.to);
              const m = /^\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)$/.exec(text);
              if (m) {
                deco.push({ from: node.from, to: node.to, value: Decoration.replace({ widget: new LinkWidget(m[1], m[2]) }), exclusive: true });
              }
            }
            return false;
          }

          return true;
        },
      });
    }

    // Wikilinks aren't part of the markdown grammar, so scan visible lines for
    // `[[name]]` directly. (They never span lines and have no parens, so they
    // don't collide with the Link handling above.)
    const cfg = state.facet(wikilinkConfig);
    if (cfg) {
      for (const { from, to } of view.visibleRanges) {
        const rangeFrom = Math.max(from, fmEnd);
        if (rangeFrom >= to) continue;
        const startLine = doc.lineAt(rangeFrom).number;
        const endLine = doc.lineAt(to).number;
        for (let n = startLine; n <= endLine; n++) {
          const line = doc.line(n);
          const re = /\[\[([^\[\]\n]+)\]\]/g;
          let m: RegExpExecArray | null;
          while ((m = re.exec(line.text)) !== null) {
            const wFrom = line.from + m.index;
            const wTo = wFrom + m[0].length;
            if (wFrom < fmEnd) continue;
            if (touches(wFrom, wTo)) continue; // caret inside → show raw
            const name = m[1].trim();
            const resolved = cfg.resolve(name);
            deco.push({ from: wFrom, to: wTo, value: Decoration.replace({ widget: new WikilinkWidget(name, resolved, cfg) }), exclusive: true });
          }
        }
      }
    }

    // CodeMirror disallows overlapping "replace" decorations. The traversal
    // above is careful not to produce them, but the syntax-tree pass and the
    // regex-based wikilink pass are independent, so this is a hard backstop:
    // sort the exclusive (replace) decorations and drop any that overlap a
    // previously-kept one. Mark/line decorations are exempt — they're
    // designed to overlap (e.g. a heading's line style + its inline bold).
    const nonExclusive = deco.filter((d) => !d.exclusive);
    const exclusive = deco.filter((d) => d.exclusive).sort((a, b) => a.from - b.from || a.to - b.to);
    const keptExclusive: DecoItem[] = [];
    let lastTo = -1;
    for (const d of exclusive) {
      if (d.from < lastTo) continue;
      keptExclusive.push(d);
      lastTo = d.to;
    }

    const all = [...nonExclusive, ...keptExclusive];
    return Decoration.set(all.map((d) => d.value.range(d.from, d.to)), true);
  } catch (e) {
    // Fail safe: never let a decoration-building bug propagate out of this
    // function. CodeMirror permanently deactivates a ViewPlugin whose update()
    // throws, which would silently kill Live Preview for the rest of the
    // session — falling back to raw text for one pass is much better.
    console.error('[livePreview] buildInlineDecorations failed, showing raw text for this pass:', e);
    return Decoration.none;
  }
}

// ── Block-level decorations (Table, Mermaid) ─────────────────────────────────
// These can't be provided by the ViewPlugin above — CodeMirror throws
// "Block decorations may not be specified via plugins" for any `block: true`
// decoration coming from a plugin's `decorations` getter. Block decorations
// must come from a StateField instead, which is also a reasonable fit here:
// unlike headings/emphasis, Table/Mermaid never reveal raw text on cursor, so
// this field only needs to rebuild on document changes or the live-preview
// toggle — never on plain selection/viewport changes.
function buildBlockDecorations(state: EditorState): DecorationSet {
  try {
    if (!state.field(livePreviewState, false)) return Decoration.none;

    const doc = state.doc;
    const fmEnd = frontmatterBlockLength(doc.sliceString(0, Math.min(doc.length, 4000)));
    const deco: { from: number; to: number; value: Decoration }[] = [];

    syntaxTree(state).iterate({
      enter: (node) => {
        if (node.to <= fmEnd) return false; // fully inside frontmatter — skip
        const name = node.name;

        if (name === 'Table') {
          const raw = doc.sliceString(node.from, node.to);
          deco.push({ from: node.from, to: node.to, value: Decoration.replace({ widget: new TableWidget(raw), block: true }) });
          return false;
        }

        if (name === 'FencedCode') {
          const raw = doc.sliceString(node.from, node.to);
          const firstLineEnd = raw.indexOf('\n');
          const firstLine = firstLineEnd === -1 ? raw : raw.slice(0, firstLineEnd);
          const info = firstLine.replace(/^[`~]+/, '').trim().toLowerCase();
          if (info === 'mermaid') {
            const closing = /\r?\n[ \t]*[`~]{3,}[ \t]*$/.exec(raw);
            const bodyStart = firstLineEnd === -1 ? raw.length : firstLineEnd + 1;
            const bodyEnd = closing ? raw.length - closing[0].length + 1 : raw.length;
            const chart = raw.slice(bodyStart, Math.max(bodyStart, bodyEnd)).replace(/\r?\n$/, '');
            if (chart.trim()) {
              deco.push({ from: node.from, to: node.to, value: Decoration.replace({ widget: new MermaidWidget(chart), block: true }) });
            }
          }
          return false;
        }

        return true;
      },
    });

    // Same overlap backstop as the inline builder — sort and drop overlaps
    // (e.g. a table immediately followed by another table with no blank line,
    // an edge case the lezer parser could still hand us as two adjacent nodes).
    deco.sort((a, b) => a.from - b.from || a.to - b.to);
    const kept: typeof deco = [];
    let lastTo = -1;
    for (const d of deco) {
      if (d.from < lastTo) continue;
      kept.push(d);
      lastTo = d.to;
    }

    return Decoration.set(kept.map((d) => d.value.range(d.from, d.to)), true);
  } catch (e) {
    console.error('[livePreview] buildBlockDecorations failed, showing raw text for this pass:', e);
    return Decoration.none;
  }
}

const livePreviewBlockField = StateField.define<DecorationSet>({
  create(state) {
    return buildBlockDecorations(state);
  },
  update(deco, tr) {
    if (tr.docChanged || tr.effects.some((e) => e.is(setLivePreview))) {
      return buildBlockDecorations(tr.state);
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

// ── Plugin (inline, cursor/viewport-reactive decorations) ────────────────────
const livePreviewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) { this.decorations = buildInlineDecorations(view); }
    update(u: ViewUpdate) {
      if (
        u.docChanged ||
        u.viewportChanged ||
        u.selectionSet ||
        u.transactions.some((tr) => tr.effects.some((e) => e.is(setLivePreview)))
      ) {
        this.decorations = buildInlineDecorations(u.view);
      }
    }
  },
  { decorations: (v) => v.decorations }
);

// ── Rendered-form styling ────────────────────────────────────────────────────
// Values below are matched 1:1 against Reading mode's rendered look
// (app/globals.css `.prose` rules + the "prose prose-invert" wrapper) so
// switching Reading → Live Preview → Reading is visually seamless — only
// Source mode keeps the raw monospace editor look.
const livePreviewTheme = EditorView.baseTheme({
  '.cm-rx-h1': { fontSize: '2em', fontWeight: '600', lineHeight: '1.3', color: '#fff' },
  '.cm-rx-h2': {
    fontSize: '1.5em', fontWeight: '600', lineHeight: '1.3', color: '#fff',
    borderBottom: '1px solid var(--border)', paddingBottom: '0.15em',
  },
  '.cm-rx-h3': { fontSize: '1.25em', fontWeight: '600', lineHeight: '1.3', color: '#fff' },
  '.cm-rx-h4': { fontSize: '1.12em', fontWeight: '600', color: '#fff' },
  '.cm-rx-h5': { fontSize: '1em', fontWeight: '600', color: 'rgba(255,255,255,0.9)' },
  '.cm-rx-h6': { fontSize: '0.9em', fontWeight: '600', color: 'var(--text-muted)' },
  '.cm-rx-strong': { color: 'var(--text-primary)', fontWeight: '600' },
  '.cm-rx-em': { fontStyle: 'italic', color: '#c8d4e8' },
  '.cm-rx-strike': { textDecoration: 'line-through', opacity: '0.7' },
  '.cm-rx-code': {
    fontFamily: "'JetBrains Mono', monospace",
    background: '#0f1628',
    borderRadius: '3px',
    padding: '0.15em 0.4em',
    fontSize: '0.875em',
    color: '#a8d8ea',
  },
  '.cm-rx-bullet': { color: 'var(--text-primary)' },
  '.cm-rx-hr': {
    display: 'inline-block',
    width: '100%',
    border: 'none',
    borderTop: '1px solid var(--border)',
    margin: '0',
    verticalAlign: 'middle',
  },
  '.cm-rx-link': { color: 'var(--accent)', textDecoration: 'underline', cursor: 'pointer' },
  '.cm-rx-wikilink': { color: 'var(--accent)', textDecoration: 'underline', cursor: 'pointer' },
  '.cm-rx-wikilink-broken': {
    color: '#f87171',
    textDecoration: 'underline dotted',
    cursor: 'help',
  },
  // Table/Mermaid widgets are block decorations — CodeMirror explicitly warns
  // against vertical margin on those (throws off its own height measurement),
  // so spacing here is padding-only, matching .prose table's look otherwise.
  '.cm-rx-table-wrap': { padding: '0.5em 0', overflowX: 'auto' },
  '.cm-rx-table': {
    width: '100%',
    borderCollapse: 'collapse',
    fontFamily: "'Inter', system-ui, sans-serif",
    fontSize: '0.95em',
  },
  '.cm-rx-table th, .cm-rx-table td': {
    border: '1px solid var(--border)',
    padding: '0.5rem 0.75rem',
    textAlign: 'left',
    outline: 'none',
    WebkitTapHighlightColor: 'transparent',
  },
  // No focus ring on click — cells are editable, but pressing into one
  // shouldn't visibly "highlight" like a button. Text selection (while
  // actively replacing content) is untouched — that's a different thing.
  '.cm-rx-table th:focus, .cm-rx-table td:focus': { outline: 'none', boxShadow: 'none' },
  '.cm-rx-table th': { background: 'var(--bg-surface)', fontWeight: '600' },
  '.cm-rx-mermaid': {
    display: 'flex',
    justifyContent: 'center',
    padding: '12px 0',
    overflowX: 'auto',
    color: 'rgba(255,255,255,0.3)',
    fontSize: '13px',
  },
  '.cm-rx-mermaid.cm-rx-mermaid-error': {
    display: 'block',
    fontFamily: "'JetBrains Mono', monospace",
    whiteSpace: 'pre-wrap',
    color: 'var(--text-secondary)',
  },
  // Fenced code block lines — matches .prose pre/code (background, monospace,
  // rounded top/bottom only on the fence lines so the block reads as one box).
  '.cm-rx-codeblock': {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '0.875em',
    background: '#0f1628',
    borderLeft: '1px solid var(--border)',
    borderRight: '1px solid var(--border)',
    paddingLeft: '1rem',
    paddingRight: '1rem',
  },
  '.cm-rx-codeblock-start': {
    borderTop: '1px solid var(--border)',
    borderTopLeftRadius: '8px',
    borderTopRightRadius: '8px',
    paddingTop: '0.25em',
  },
  '.cm-rx-codeblock-end': {
    borderBottom: '1px solid var(--border)',
    borderBottomLeftRadius: '8px',
    borderBottomRightRadius: '8px',
    paddingBottom: '0.25em',
  },
});

// ── Reading-mode-matched chrome (font/size/column width) ────────────────────
// A `.cm-rx-live-active` class is stamped on the editor root only while Live
// Preview is on (Source keeps the default monospace editor chrome from
// rexformDarkTheme). Scoped via a plain EditorView.theme() so its higher
// selector specificity (`&.cm-rx-live-active .cm-content` vs the base
// `.cm-content`) reliably wins over rexformDarkTheme regardless of extension
// order. Only non-vertical-margin properties are touched here — CodeMirror
// measures per-line height itself, and vertical margins on `.cm-line`/widget
// boxes are a known way to throw that measurement off; horizontal centering
// and padding don't have that risk.
const livePreviewLayoutTheme = EditorView.theme({
  '&.cm-rx-live-active .cm-content': {
    fontFamily: "'Inter', system-ui, sans-serif",
    fontSize: '15px',
    lineHeight: '1.75',
    maxWidth: '860px',
    margin: '0 auto',
    padding: '40px 32px',
  },
});

const livePreviewEditorAttrs = EditorView.editorAttributes.of((view) => ({
  class: view.state.field(livePreviewState, false) ? 'cm-rx-live-active' : '',
}));

export function livePreview(): Extension {
  return [
    livePreviewState,
    livePreviewBlockField,
    livePreviewPlugin,
    livePreviewTheme,
    livePreviewLayoutTheme,
    livePreviewEditorAttrs,
  ];
}
