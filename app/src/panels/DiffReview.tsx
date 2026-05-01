import { DiffEditor } from "@monaco-editor/react";
import { invoke } from "@tauri-apps/api/core";
import { useAgentStore } from "../store/agent";
import { useEditorStore } from "../store/editor";
import { Button } from "../ui/primitives";

export function DiffReview() {
  const { pendingDiffs, removePendingDiff, clearPendingDiffs } = useAgentStore();
  const { openFile, updateContent, markSaved } = useEditorStore();

  if (pendingDiffs.length === 0) return null;

  const diff = pendingDiffs[0];
  const fileName = diff.path.split("/").pop() ?? diff.path;

  async function accept() {
    await invoke("fs_write", { path: diff.path, content: diff.patched });
    updateContent(diff.path, diff.patched);
    markSaved(diff.path);
    openFile(diff.path, diff.patched);
    removePendingDiff(diff.path);
  }

  function reject() {
    removePendingDiff(diff.path);
  }

  function rejectAll() {
    clearPendingDiffs();
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: "rgba(0,0,0,0.7)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={rejectAll}
    >
      <div
        style={{
          width: "min(900px, 90vw)",
          height: "min(600px, 80vh)",
          display: "flex",
          flexDirection: "column",
          background: "var(--color-bg-app, #111)",
          border: "1px solid var(--color-border-subtle, #333)",
          borderRadius: 6,
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            padding: "8px 14px",
            borderBottom: "1px solid var(--color-border-subtle, #333)",
            gap: 8,
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 12, color: "var(--color-text-main, #d4d4d4)", flex: 1 }}>
            Review changes — <span style={{ opacity: 0.7 }}>{fileName}</span>
          </span>
          {pendingDiffs.length > 1 && (
            <span style={{ fontSize: 11, color: "var(--color-text-muted, #888)" }}>
              {pendingDiffs.length} files
            </span>
          )}
          <Button variant="ghost" onClick={rejectAll} style={{ fontSize: 11, padding: "2px 8px" }}>
            Reject All
          </Button>
          <Button variant="danger" onClick={reject} style={{ fontSize: 11, padding: "2px 8px" }}>
            Reject
          </Button>
          <Button onClick={accept} style={{ fontSize: 11, padding: "2px 8px" }}>
            Accept
          </Button>
        </div>

        {/* Diff editor */}
        <div style={{ flex: 1, overflow: "hidden" }}>
          <DiffEditor
            original={diff.original}
            modified={diff.patched}
            language={detectLang(diff.path)}
            theme="vs-dark"
            options={{
              readOnly: true,
              renderSideBySide: true,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              fontSize: 12,
              lineNumbers: "on",
            }}
          />
        </div>
      </div>
    </div>
  );
}

function detectLang(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    rs: "rust",
    py: "python",
    go: "go",
    json: "json",
    md: "markdown",
    css: "css",
    html: "html",
  };
  return map[ext] ?? "plaintext";
}
