import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

// Editor chrome — transparent background so it sits on --bg-base, accent caret,
// app-matched autocomplete tooltip. Monospace to match the previous textarea.
export const rexformDarkTheme = EditorView.theme(
  {
    '&': {
      color: 'var(--text-primary)',
      backgroundColor: 'transparent',
      height: '100%',
      fontSize: '14px',
    },
    '.cm-content': {
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      padding: '16px',
      caretColor: 'var(--accent)',
      lineHeight: '1.6',
    },
    '.cm-scroller': { overflow: 'auto' },
    '&.cm-focused': { outline: 'none' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--accent)' },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
      backgroundColor: 'rgba(127,119,221,0.25)',
    },
    '.cm-placeholder': { color: 'var(--text-muted)' },
    '.cm-tooltip': {
      background: 'var(--bg-surface)',
      border: '1px solid var(--border)',
      borderRadius: '6px',
      color: 'var(--text-primary)',
      boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
      overflow: 'hidden',
    },
    '.cm-tooltip-autocomplete > ul > li': {
      padding: '3px 10px',
      fontFamily: 'inherit',
      fontSize: '13px',
    },
    '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
      background: 'var(--accent)',
      color: '#fff',
    },
    '.cm-completionDetail': {
      marginLeft: '8px',
      fontStyle: 'normal',
      opacity: 0.55,
      fontSize: '11px',
    },
  },
  { dark: true }
);

// Light syntax highlighting for source markdown (the heavy inline rendering
// lands in Phase A2 as decorations).
const rexformHighlight = HighlightStyle.define([
  { tag: t.heading, color: '#fff', fontWeight: '700' },
  { tag: t.strong, fontWeight: '700' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: t.link, color: 'var(--accent)' },
  { tag: t.url, color: 'var(--accent)' },
  { tag: t.monospace, color: '#a5d6ff' },
  { tag: t.quote, color: 'var(--text-muted)' },
  { tag: t.list, color: 'var(--text-secondary)' },
  { tag: [t.processingInstruction, t.meta], color: 'rgba(255,255,255,0.35)' },
]);

export const rexformSyntaxHighlighting = syntaxHighlighting(rexformHighlight);
