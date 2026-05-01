import { useState } from "react";
import { useGitStore, GitFileStatus } from "../store/git";
import { useEditorStore } from "../store/editor";

const STATUS_COLOR: Record<string, string> = {
  M: "#e2c08d",
  A: "#73c991",
  D: "#f48771",
  R: "#4ec9b0",
  C: "#4ec9b0",
  "?": "#73c991",
  " ": "#888",
};

const STATUS_LABEL: Record<string, string> = {
  M: "M",
  A: "A",
  D: "D",
  R: "R",
  C: "C",
  "?": "U",
  " ": "",
};

function statusColor(s: string) {
  return STATUS_COLOR[s] ?? "#888";
}

function statusLabel(s: string) {
  return STATUS_LABEL[s] ?? s;
}

function fileName(path: string) {
  return path.split("/").pop() ?? path;
}

function FileRow({
  file,
  side,
  cwd,
  onAction,
}: {
  file: GitFileStatus;
  side: "staged" | "unstaged";
  cwd: string;
  onAction: () => void;
}) {
  const { stage, unstage, discard } = useGitStore();
  const statusChar = side === "staged" ? file.index_status : file.work_status;
  const [hovering, setHovering] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      style={{
        display: "flex",
        alignItems: "center",
        padding: "2px 8px 2px 20px",
        fontSize: 12,
        color: "#ccc",
        gap: 6,
        cursor: "default",
        background: hovering ? "#2a2d2e" : "transparent",
      }}
      title={file.path}
    >
      <span style={{ color: statusColor(statusChar), fontWeight: 600, minWidth: 10, fontSize: 11 }}>
        {statusLabel(statusChar)}
      </span>
      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {fileName(file.path)}
      </span>
      <span style={{ color: "#555", fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 80 }}>
        {file.path.includes("/") ? file.path.split("/").slice(0, -1).join("/") : ""}
      </span>
      {hovering && (
        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
          {side === "unstaged" && (
            <ActionBtn
              title="Stage"
              onClick={async () => { await stage(cwd, file.path); onAction(); }}
            >
              +
            </ActionBtn>
          )}
          {side === "staged" && (
            <ActionBtn
              title="Unstage"
              onClick={async () => { await unstage(cwd, file.path); onAction(); }}
            >
              −
            </ActionBtn>
          )}
          {side === "unstaged" && (
            <ActionBtn
              title="Discard Changes"
              onClick={async () => { await discard(cwd, file.path); onAction(); }}
              danger
            >
              ↺
            </ActionBtn>
          )}
        </div>
      )}
    </div>
  );
}

function ActionBtn({
  children,
  title,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      title={title}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      style={{
        background: "transparent",
        border: "none",
        color: danger ? "#f48771" : "#ccc",
        cursor: "pointer",
        fontSize: 13,
        padding: "0 3px",
        lineHeight: 1,
      }}
    >
      {children}
    </button>
  );
}

function Section({
  title,
  count,
  children,
  defaultOpen = true,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div>
      <div
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: "4px 8px",
          fontSize: 11,
          color: "#bbb",
          cursor: "pointer",
          userSelect: "none",
          textTransform: "uppercase",
          letterSpacing: 0.5,
        }}
      >
        <span style={{ fontSize: 9 }}>{open ? "▾" : "▸"}</span>
        <span>{title}</span>
        <span style={{ marginLeft: "auto", color: "#666" }}>{count}</span>
      </div>
      {open && children}
    </div>
  );
}

export function GitPanel() {
  const { status, commits, loading, commitMessage, opError, refresh, setCommitMessage, stageAll, commit, push, pull, clearError } =
    useGitStore();
  const { workspaceRoot } = useEditorStore();

  const cwd = workspaceRoot ?? "";

  const staged = status?.files.filter(
    (f) => f.index_status !== " " && f.index_status !== "?"
  ) ?? [];

  const unstaged = status?.files.filter((f) => f.work_status !== " ") ?? [];

  if (!workspaceRoot) {
    return (
      <div style={{ padding: 12, fontSize: 12, color: "#666" }}>No folder open.</div>
    );
  }

  if (!status?.is_repo) {
    return (
      <div style={{ padding: 12, fontSize: 12, color: "#666" }}>
        {loading ? "Loading..." : "Not a git repository."}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "4px 8px",
          gap: 4,
          borderBottom: "1px solid #333",
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 11, color: "#bbb", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {status.ahead > 0 || status.behind > 0
            ? `${status.ahead > 0 ? `↑${status.ahead}` : ""}${status.behind > 0 ? ` ↓${status.behind}` : ""}`.trim()
            : ""}
        </span>
        <IconBtn title="Refresh" onClick={() => refresh(cwd)}>⟳</IconBtn>
        <IconBtn title="Pull" onClick={() => pull(cwd)}>↓</IconBtn>
        <IconBtn title="Push" onClick={() => push(cwd)}>↑</IconBtn>
      </div>

      {opError && (
        <div
          style={{ padding: "4px 8px", fontSize: 11, color: "#f48771", background: "#3c1a1a", flexShrink: 0 }}
          onClick={clearError}
          title="Click to dismiss"
        >
          {opError}
        </div>
      )}

      <div style={{ flex: 1, overflowY: "auto" }}>
        {/* Commit area */}
        <div style={{ padding: "6px 8px", borderBottom: "1px solid #2a2a2a", flexShrink: 0 }}>
          <textarea
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
            placeholder="Message (⌘Enter to commit)"
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") commit(cwd);
            }}
            style={{
              width: "100%",
              minHeight: 52,
              resize: "vertical",
              background: "#3c3c3c",
              border: "1px solid #444",
              borderRadius: 3,
              color: "#ccc",
              fontSize: 12,
              padding: "4px 6px",
              outline: "none",
              boxSizing: "border-box",
              fontFamily: "inherit",
            }}
          />
          <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
            <button
              onClick={() => commit(cwd)}
              disabled={!commitMessage.trim() || staged.length === 0}
              style={{
                flex: 1,
                background: commitMessage.trim() && staged.length > 0 ? "#0e639c" : "#333",
                color: commitMessage.trim() && staged.length > 0 ? "#fff" : "#555",
                border: "none",
                borderRadius: 3,
                padding: "4px 0",
                fontSize: 12,
                cursor: commitMessage.trim() && staged.length > 0 ? "pointer" : "default",
              }}
            >
              Commit
            </button>
          </div>
        </div>

        {/* Staged changes */}
        <Section title="Staged" count={staged.length} defaultOpen={staged.length > 0}>
          {staged.length === 0 ? (
            <div style={{ padding: "4px 20px", fontSize: 11, color: "#555" }}>No staged changes</div>
          ) : (
            staged.map((f) => (
              <FileRow key={f.path} file={f} side="staged" cwd={cwd} onAction={() => {}} />
            ))
          )}
        </Section>

        {/* Unstaged changes */}
        <Section title="Changes" count={unstaged.length}>
          {unstaged.length === 0 ? (
            <div style={{ padding: "4px 20px", fontSize: 11, color: "#555" }}>No changes</div>
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "flex-end", padding: "0 8px 2px" }}>
                <button
                  onClick={() => stageAll(cwd)}
                  title="Stage All"
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "#888",
                    fontSize: 11,
                    cursor: "pointer",
                    padding: "0 4px",
                  }}
                >
                  + Stage All
                </button>
              </div>
              {unstaged.map((f) => (
                <FileRow key={f.path} file={f} side="unstaged" cwd={cwd} onAction={() => {}} />
              ))}
            </>
          )}
        </Section>

        {/* Recent commits */}
        {commits.length > 0 && (
          <Section title="Recent Commits" count={commits.length} defaultOpen={false}>
            {commits.map((c) => (
              <div
                key={c.hash}
                style={{
                  padding: "3px 12px 3px 20px",
                  fontSize: 11,
                  color: "#aaa",
                  display: "flex",
                  gap: 6,
                  alignItems: "baseline",
                }}
                title={`${c.author} · ${c.date}`}
              >
                <span style={{ color: "#555", fontFamily: "monospace", flexShrink: 0 }}>{c.hash}</span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {c.message}
                </span>
              </div>
            ))}
          </Section>
        )}
      </div>
    </div>
  );
}

function IconBtn({ children, title, onClick }: { children: React.ReactNode; title: string; onClick: () => void }) {
  return (
    <button
      title={title}
      onClick={onClick}
      style={{
        background: "transparent",
        border: "none",
        color: "#aaa",
        cursor: "pointer",
        fontSize: 14,
        padding: "2px 4px",
        borderRadius: 3,
        lineHeight: 1,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "#3c3c3c")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      {children}
    </button>
  );
}
