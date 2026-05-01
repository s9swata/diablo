import { useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useEditorStore } from "../store/editor";
import { MagnifyingGlass, X } from "@phosphor-icons/react";

interface SearchMatch {
  file: string;
  line: number;
  text: string;
  match_start: number;
  match_end: number;
}

interface Group {
  file: string;
  matches: SearchMatch[];
}

interface SearchPanelProps {
  autoFocus?: boolean;
  /** "sidebar" = narrow column in the sidebar (default), "overlay" = full editor area */
  mode?: "sidebar" | "overlay";
  onClose?: () => void;
}

export function SearchPanel({ autoFocus, mode = "sidebar", onClose }: SearchPanelProps) {
  const { workspaceRoot, openFile } = useEditorStore();
  const [query, setQuery] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [results, setResults] = useState<SearchMatch[]>([]);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  // Escape closes overlay
  useEffect(() => {
    if (mode !== "overlay") return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose?.();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, onClose]);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!query.trim() || !workspaceRoot) {
      setResults([]);
      return;
    }
    timerRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await invoke<SearchMatch[]>("search_in_files", {
          root: workspaceRoot,
          query: query.trim(),
          caseSensitive,
        });
        setResults(res);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query, caseSensitive, workspaceRoot]);

  async function handleClick(m: SearchMatch) {
    const content = await invoke<string>("fs_read", { path: m.file });
    openFile(m.file, content);
    // Redirect to the file tab (deactivates search view, tab stays in bar)
    onClose?.();
    setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent("editor-goto", { detail: { line: m.line, col: m.match_start + 1 } })
      );
    }, 120);
  }

  // Group matches by file
  const groups: Group[] = [];
  for (const m of results) {
    const last = groups[groups.length - 1];
    if (last?.file === m.file) last.matches.push(m);
    else groups.push({ file: m.file, matches: [m] });
  }

  const rel = (abs: string) =>
    workspaceRoot && abs.startsWith(workspaceRoot)
      ? abs.slice(workspaceRoot.length + 1)
      : abs;

  const isOverlay = mode === "overlay";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        overflow: "hidden",
        background: isOverlay ? "var(--color-bg-app)" : undefined,
        height: "100%",
      }}
    >
      {/* Header / search input */}
      <div
        style={{
          padding: isOverlay ? "20px 24px 12px" : "8px 10px",
          borderBottom: "1px solid #333",
          display: "flex",
          flexDirection: "column",
          gap: isOverlay ? 10 : 4,
          position: "relative",
        }}
      >
        {/* Overlay title row */}
        {isOverlay && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 4,
            }}
          >
            <span style={{ fontSize: 13, color: "var(--color-text-muted)", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase" }}>
              Search
            </span>
            <button
              onClick={onClose}
              title="Close search (Esc)"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 22,
                height: 22,
                borderRadius: 3,
                border: "none",
                background: "transparent",
                color: "var(--color-text-muted)",
                cursor: "pointer",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--color-hover)"; (e.currentTarget as HTMLElement).style.color = "var(--color-text-main)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "var(--color-text-muted)"; }}
            >
              <X size={13} />
            </button>
          </div>
        )}

        {/* Search input row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: "#3c3c3c",
            border: "1px solid #555",
            borderRadius: 4,
            padding: isOverlay ? "7px 10px" : "5px 8px",
          }}
        >
          <MagnifyingGlass size={isOverlay ? 14 : 12} color="#666" style={{ flexShrink: 0 }} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search in files…"
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              color: "#ccc",
              fontSize: isOverlay ? 14 : 12,
            }}
          />
          <span
            onClick={() => setCaseSensitive((v) => !v)}
            title="Case sensitive (Aa)"
            style={{
              fontSize: 11,
              color: caseSensitive ? "#fff" : "#666",
              cursor: "pointer",
              padding: "1px 4px",
              background: caseSensitive ? "#094771" : "transparent",
              borderRadius: 2,
              userSelect: "none",
              flexShrink: 0,
            }}
          >
            Aa
          </span>
        </div>

        {/* Result count */}
        <div style={{ fontSize: 10, color: "#666", minHeight: 14 }}>
          {searching
            ? "Searching…"
            : results.length > 0
            ? `${results.length} result${results.length !== 1 ? "s" : ""} in ${groups.length} file${groups.length !== 1 ? "s" : ""}`
            : query && !searching
            ? "No results"
            : ""}
        </div>
      </div>

      {/* Results */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          // In overlay mode, constrain width so results don't span the full 4K screen
          maxWidth: isOverlay ? 860 : undefined,
          width: "100%",
          alignSelf: isOverlay ? "flex-start" : undefined,
          paddingLeft: isOverlay ? 24 : 0,
          paddingRight: isOverlay ? 24 : 0,
          paddingTop: isOverlay ? 4 : 0,
          boxSizing: "border-box",
        }}
      >
        {groups.map((g) => (
          <div key={g.file}>
            <div
              style={{
                padding: isOverlay ? "6px 0" : "5px 10px",
                fontSize: 11,
                color: "#bbb",
                background: isOverlay ? "transparent" : "#2a2d2e",
                position: "sticky",
                top: 0,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                zIndex: 1,
                borderBottom: isOverlay ? "1px solid #2a2d2e" : "none",
              }}
              title={g.file}
            >
              {rel(g.file)}
            </div>
            {g.matches.map((m, i) => (
              <div
                key={i}
                onClick={() => handleClick(m)}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#2a2d2e")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                style={{
                  padding: isOverlay ? "4px 0 4px 12px" : "4px 10px 4px 20px",
                  fontSize: isOverlay ? 12 : 11,
                  cursor: "pointer",
                  color: "#888",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  display: "flex",
                  gap: 8,
                  borderRadius: isOverlay ? 3 : 0,
                }}
              >
                <span style={{ color: "#555", flexShrink: 0, minWidth: 28, textAlign: "right" }}>{m.line}</span>
                <span>
                  {m.text.slice(0, m.match_start)}
                  <mark style={{ background: "#613315", color: "#fff", borderRadius: 1 }}>
                    {m.text.slice(m.match_start, m.match_end)}
                  </mark>
                  {m.text.slice(m.match_end)}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
