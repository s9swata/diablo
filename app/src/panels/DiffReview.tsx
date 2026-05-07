import { useEffect, useRef } from "react";
import { EditorView } from "@codemirror/view";
import { MergeView } from "@codemirror/merge";
import { EditorState } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";
import { keymap, lineNumbers } from "@codemirror/view";
import { oneDark } from "@codemirror/theme-one-dark";
import { invoke } from "@tauri-apps/api/core";
import { useAgentStore } from "../store/agent";
import { useEditorStore } from "../store/editor";
import { langFromPath } from "../editor/language";
import { Button } from "../ui/primitives";

function buildState(content: string, path: string): EditorState {
  const langInfo = langFromPath(path);
  return EditorState.create({
    doc: content,
    extensions: [
      lineNumbers(),
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      oneDark,
      EditorState.readOnly.of(true),
      ...(langInfo.support ? [langInfo.support] : []),
      EditorView.theme({ "&": { fontSize: "12px" } }),
    ],
  });
}

export function DiffReview() {
  const { pendingDiffs, removePendingDiff, clearPendingDiffs } = useAgentStore();
  const { openFile, updateContent, markSaved } = useEditorStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const mergeViewRef = useRef<MergeView | null>(null);

  const diff = pendingDiffs[0];
  const fileName = diff?.path.split("/").pop() ?? diff?.path;

  useEffect(() => {
    if (!containerRef.current || !diff) return;

    // Destroy previous
    mergeViewRef.current?.destroy();

    mergeViewRef.current = new MergeView({
      parent: containerRef.current,
      a: buildState(diff.original, diff.path),
      b: buildState(diff.patched, diff.path),
      orientation: "a-b",
      revertControls: "a-to-b",
      highlightChanges: true,
      gutter: true,
    });

    return () => {
      mergeViewRef.current?.destroy();
      mergeViewRef.current = null;
    };
  }, [diff?.path, diff?.original, diff?.patched]);

  if (!diff) return null;

  async function accept() {
    await invoke("fs_write", { path: diff.path, content: diff.patched });
    updateContent(diff.path, diff.patched);
    markSaved(diff.path);
    openFile(diff.path, diff.patched);
    removePendingDiff(diff.path);
  }

  function reject() { removePendingDiff(diff.path); }
  function rejectAll() { clearPendingDiffs(); }

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.7)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}
      onClick={rejectAll}
    >
      <div
        style={{ width: "min(900px, 90vw)", height: "min(600px, 80vh)", display: "flex", flexDirection: "column", background: "var(--color-bg-app, #111)", border: "1px solid var(--color-border-subtle, #333)", borderRadius: 6, overflow: "hidden" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", padding: "8px 14px", borderBottom: "1px solid var(--color-border-subtle, #333)", gap: 8, flexShrink: 0 }}>
          <span style={{ fontSize: 12, color: "var(--color-text-main, #d4d4d4)", flex: 1 }}>
            Review changes — <span style={{ opacity: 0.7 }}>{fileName}</span>
          </span>
          {pendingDiffs.length > 1 && (
            <span style={{ fontSize: 11, color: "var(--color-text-muted, #888)" }}>{pendingDiffs.length} files</span>
          )}
          <Button variant="ghost" onClick={rejectAll} style={{ fontSize: 11, padding: "2px 8px" }}>Reject All</Button>
          <Button variant="danger" onClick={reject} style={{ fontSize: 11, padding: "2px 8px" }}>Reject</Button>
          <Button onClick={accept} style={{ fontSize: 11, padding: "2px 8px" }}>Accept</Button>
        </div>

        <div ref={containerRef} style={{ flex: 1, overflow: "auto" }} />
      </div>
    </div>
  );
}
