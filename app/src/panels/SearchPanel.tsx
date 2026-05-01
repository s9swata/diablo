import { useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useEditorStore } from "../store/editor";

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

export function SearchPanel({ autoFocus }: { autoFocus?: boolean }) {
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

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
      <div style={{ padding: "8px 10px", borderBottom: "1px solid #333" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            background: "#3c3c3c",
            border: "1px solid #555",
            borderRadius: 3,
            padding: "5px 8px",
          }}
        >
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
              fontSize: 12,
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
            }}
          >
            Aa
          </span>
        </div>
        <div style={{ fontSize: 10, color: "#666", marginTop: 4, minHeight: 14 }}>
          {searching
            ? "Searching…"
            : results.length > 0
            ? `${results.length} result${results.length !== 1 ? "s" : ""} in ${groups.length} file${groups.length !== 1 ? "s" : ""}`
            : query && !searching
            ? "No results"
            : ""}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto" }}>
        {groups.map((g) => (
          <div key={g.file}>
            <div
              style={{
                padding: "5px 10px",
                fontSize: 11,
                color: "#bbb",
                background: "#2a2d2e",
                position: "sticky",
                top: 0,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
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
                  padding: "4px 10px 4px 20px",
                  fontSize: 11,
                  cursor: "pointer",
                  color: "#888",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  display: "flex",
                  gap: 6,
                }}
              >
                <span style={{ color: "#555", flexShrink: 0 }}>{m.line}</span>
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
