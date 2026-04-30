import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEditorStore } from "../store/editor";

interface DirEntry {
  name: string;
  path: string;
  is_dir: boolean;
  children?: DirEntry[];
}

function EntryRow({
  entry,
  depth,
  onOpen,
}: {
  entry: DirEntry;
  depth: number;
  onOpen: (path: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [children, setChildren] = useState<DirEntry[]>(entry.children ?? []);
  const activeFile = useEditorStore((s) => s.activeFile);
  const isActive = activeFile === entry.path;

  async function toggle() {
    if (!entry.is_dir) {
      onOpen(entry.path);
      return;
    }
    if (!open) {
      const loaded = await invoke<DirEntry[]>("fs_list", { path: entry.path });
      setChildren(loaded);
    }
    setOpen((o) => !o);
  }

  return (
    <>
      <div
        onClick={toggle}
        style={{
          paddingLeft: depth * 12 + 8,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 4,
          height: 22,
          background: isActive ? "#094771" : "transparent",
          color: isActive ? "#fff" : "#ccc",
          userSelect: "none",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
        onMouseEnter={(e) => {
          if (!isActive) (e.currentTarget as HTMLDivElement).style.background = "#2a2d2e";
        }}
        onMouseLeave={(e) => {
          if (!isActive) (e.currentTarget as HTMLDivElement).style.background = "transparent";
        }}
      >
        <span style={{ width: 14, flexShrink: 0, fontSize: 10 }}>
          {entry.is_dir ? (open ? "▾" : "▸") : ""}
        </span>
        <span style={{ fontSize: 12 }}>{entry.name}</span>
      </div>
      {entry.is_dir && open &&
        children.map((child) => (
          <EntryRow key={child.path} entry={child} depth={depth + 1} onOpen={onOpen} />
        ))}
    </>
  );
}

export function FileExplorer() {
  const { workspaceRoot, openFile } = useEditorStore();
  const [entries, setEntries] = useState<DirEntry[]>([]);

  function refresh(root: string) {
    invoke<DirEntry[]>("fs_list", { path: root }).then(setEntries);
  }

  useEffect(() => {
    if (!workspaceRoot) return;
    refresh(workspaceRoot);
  }, [workspaceRoot]);

  useEffect(() => {
    if (!workspaceRoot) return;
    const unlisten = listen("fs_changed", () => refresh(workspaceRoot));
    return () => {
      unlisten.then((f) => f());
    };
  }, [workspaceRoot]);

  async function handleOpen(path: string) {
    const content = await invoke<string>("fs_read", { path });
    openFile(path, content);
  }

  if (!workspaceRoot) {
    return (
      <div style={{ padding: 12, color: "#666", fontSize: 12 }}>
        No folder open
      </div>
    );
  }

  return (
    <div style={{ overflowY: "auto", flex: 1 }}>
      {entries.map((e) => (
        <EntryRow key={e.path} entry={e} depth={0} onOpen={handleOpen} />
      ))}
    </div>
  );
}
