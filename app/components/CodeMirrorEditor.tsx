'use client';
import { useEffect, useRef } from 'react';
import { EditorState, type Extension } from '@codemirror/state';
import { EditorView, placeholder as cmPlaceholder } from '@codemirror/view';

interface Props {
  value: string;
  onChange: (value: string) => void;
  /** Stable extension array — must be memoized by the parent (created once). */
  extensions?: Extension[];
  /** Parent-owned handle to the EditorView (for toolbar dispatch, focus, etc.). */
  viewRef?: React.MutableRefObject<EditorView | null>;
  placeholder?: string;
  autoFocus?: boolean;
}

export default function CodeMirrorEditor({
  value, onChange, extensions = [], viewRef, placeholder, autoFocus,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewInternal = useRef<EditorView | null>(null);
  // Keep onChange current without re-creating the view.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Create the EditorView once on mount.
  useEffect(() => {
    if (!hostRef.current) return;

    const updateListener = EditorView.updateListener.of((u) => {
      if (u.docChanged) onChangeRef.current(u.state.doc.toString());
    });

    const state = EditorState.create({
      doc: value,
      extensions: [
        updateListener,
        placeholder ? cmPlaceholder(placeholder) : [],
        ...extensions,
      ],
    });

    const view = new EditorView({ state, parent: hostRef.current });
    viewInternal.current = view;
    if (viewRef) viewRef.current = view;
    if (autoFocus) view.focus();

    return () => {
      view.destroy();
      viewInternal.current = null;
      if (viewRef) viewRef.current = null;
    };
    // Intentionally mount-once; `value` is reconciled in the effect below and
    // `extensions` is required to be stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reconcile external value changes (note switch, save reset) without clobbering
  // in-progress typing — when typing, `value` already equals the doc, so this skips.
  useEffect(() => {
    const view = viewInternal.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (value !== current) {
      view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
    }
  }, [value]);

  return <div ref={hostRef} style={{ height: '100%', overflow: 'hidden' }} />;
}
