import {
  Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate, WidgetType,
} from '@codemirror/view';
import { StateField, StateEffect, type Extension, type EditorState } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';

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

// ── Decoration builder ───────────────────────────────────────────────────────
function buildDecorations(view: EditorView): DecorationSet {
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

  const deco: { from: number; to: number; value: Decoration }[] = [];

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from, to,
      enter: (node) => {
        const name = node.name;

        // Headings — keep the rendered size on the whole line; hide the `#` marks
        // only when the caret isn't on that line.
        const h = /^ATXHeading(\d)$/.exec(name);
        if (h) {
          const line = doc.lineAt(node.from);
          deco.push({ from: line.from, to: line.from, value: Decoration.line({ class: `cm-rx-h${h[1]}` }) });
          if (!touches(line.from, line.to)) {
            const mark = node.node.firstChild;
            if (mark && mark.name === 'HeaderMark') {
              const end = Math.min(mark.to + 1, line.to); // include the trailing space
              if (end > mark.from) deco.push({ from: mark.from, to: end, value: Decoration.replace({}) });
            }
          }
          return;
        }

        // Inline styling — style the content always, hide the surrounding marks
        // (`**`, `*`, `~~`, `` ` ``) when the caret isn't inside.
        if (name === 'StrongEmphasis' || name === 'Emphasis' || name === 'Strikethrough' || name === 'InlineCode') {
          const cls =
            name === 'StrongEmphasis' ? 'cm-rx-strong'
            : name === 'Emphasis' ? 'cm-rx-em'
            : name === 'Strikethrough' ? 'cm-rx-strike'
            : 'cm-rx-code';
          deco.push({ from: node.from, to: node.to, value: Decoration.mark({ class: cls }) });
          if (!touches(node.from, node.to)) {
            let child = node.node.firstChild;
            while (child) {
              if (/Mark$/.test(child.name)) {
                deco.push({ from: child.from, to: child.to, value: Decoration.replace({}) });
              }
              child = child.nextSibling;
            }
          }
          return;
        }

        // Horizontal rule → <hr> when the caret isn't on the line.
        if (name === 'HorizontalRule') {
          if (!lineRevealed(node.from)) {
            deco.push({ from: node.from, to: node.to, value: Decoration.replace({ widget: new HrWidget() }) });
          }
          return;
        }

        // Bullet list marker (`-`/`*`/`+`) → • ; leave ordered-list numbers alone.
        if (name === 'ListMark') {
          const text = doc.sliceString(node.from, node.to);
          if (/^[-*+]$/.test(text) && !lineRevealed(node.from)) {
            deco.push({ from: node.from, to: node.to, value: Decoration.replace({ widget: new BulletWidget() }) });
          }
          return;
        }

        // Standard markdown link [text](url) → clickable text. Wikilinks ([[ ]])
        // have no parens, so they fall through here untouched (handled in A3).
        if (name === 'Link') {
          if (!touches(node.from, node.to)) {
            const text = doc.sliceString(node.from, node.to);
            const m = /^\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)$/.exec(text);
            if (m) {
              deco.push({ from: node.from, to: node.to, value: Decoration.replace({ widget: new LinkWidget(m[1], m[2]) }) });
            }
          }
          return;
        }
      },
    });
  }

  return Decoration.set(deco.map((d) => d.value.range(d.from, d.to)), true);
}

// ── Plugin ────────────────────────────────────────────────────────────────--
const livePreviewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) { this.decorations = buildDecorations(view); }
    update(u: ViewUpdate) {
      if (
        u.docChanged ||
        u.viewportChanged ||
        u.selectionSet ||
        u.transactions.some((tr) => tr.effects.some((e) => e.is(setLivePreview)))
      ) {
        this.decorations = buildDecorations(u.view);
      }
    }
  },
  { decorations: (v) => v.decorations }
);

// ── Rendered-form styling ────────────────────────────────────────────────────
const livePreviewTheme = EditorView.baseTheme({
  '.cm-rx-h1': { fontSize: '1.9em', fontWeight: '700', lineHeight: '1.4', color: '#fff' },
  '.cm-rx-h2': { fontSize: '1.55em', fontWeight: '700', lineHeight: '1.4', color: '#fff' },
  '.cm-rx-h3': { fontSize: '1.3em', fontWeight: '700', lineHeight: '1.4', color: '#fff' },
  '.cm-rx-h4': { fontSize: '1.12em', fontWeight: '700', color: '#fff' },
  '.cm-rx-h5': { fontSize: '1em', fontWeight: '700', color: 'rgba(255,255,255,0.9)' },
  '.cm-rx-h6': { fontSize: '0.9em', fontWeight: '700', color: 'var(--text-muted)' },
  '.cm-rx-strong': { fontWeight: '700' },
  '.cm-rx-em': { fontStyle: 'italic' },
  '.cm-rx-strike': { textDecoration: 'line-through', opacity: '0.7' },
  '.cm-rx-code': {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    background: 'rgba(255,255,255,0.08)',
    borderRadius: '4px',
    padding: '0 4px',
    color: '#a5d6ff',
  },
  '.cm-rx-bullet': { color: 'var(--accent)' },
  '.cm-rx-hr': {
    display: 'inline-block',
    width: '100%',
    border: 'none',
    borderTop: '1px solid var(--border)',
    margin: '0',
    verticalAlign: 'middle',
  },
  '.cm-rx-link': { color: 'var(--accent)', textDecoration: 'underline', cursor: 'pointer' },
});

export function livePreview(): Extension {
  return [livePreviewState, livePreviewPlugin, livePreviewTheme];
}
