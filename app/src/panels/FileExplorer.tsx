import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEditorStore } from "../store/editor";
import { useGitStore } from "../store/git";
import {
  Folder,
  FolderOpen,
  FileTs,
  FileTsx,
  FileJs,
  FileJsx,
  FileCss,
  FileHtml,
  FileMd,
  FileRs,
  FilePy,
  File,
} from "@phosphor-icons/react";

function FileIcon({ name, isDir, open }: { name: string; isDir: boolean; open: boolean }) {
  const size = 14;
  const style = { flexShrink: 0 };
  if (isDir) {
    return open
      ? <FolderOpen size={size} weight="fill" color="#dcb67a" style={style} />
      : <Folder size={size} weight="fill" color="#dcb67a" style={style} />;
  }
  const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  switch (ext) {
    case "ts":  return <FileTs  size={size} color="#3178c6" style={style} />;
    case "tsx": return <FileTsx size={size} color="#3178c6" style={style} />;
    case "js":  return <FileJs  size={size} color="#f7df1e" style={style} />;
    case "jsx": return <FileJsx size={size} color="#f7df1e" style={style} />;
    case "css": return <FileCss size={size} color="#42a5f5" style={style} />;
    case "html": return <FileHtml size={size} color="#e34c26" style={style} />;
    case "md":  return <FileMd  size={size} color="#83a598" style={style} />;
    case "rs":  return <FileRs  size={size} color="#ce412b" style={style} />;
    case "py":  return <FilePy  size={size} color="#3572a5" style={style} />;
    default:    return <File    size={size} color="#8b8b8b" style={style} />;
  }
}

interface DirEntry {
  name: string;
  path: string;
  is_dir: boolean;
  children?: DirEntry[];
}

const GIT_STATUS_COLOR: Record<string, string> = {
  M: "#e2c08d",
  A: "#73c991",
  D: "#f48771",
  R: "#4ec9b0",
  C: "#4ec9b0",
  "?": "#73c991",
};

function GitDecoratedName({ name, path, isDir }: { name: string; path: string; isDir: boolean }) {
  const { status } = useGitStore();

  let badge: string | null = null;
  let badgeColor = "#888";

  if (status?.is_repo) {
    const rel = path.startsWith(status.git_root + "/")
      ? path.slice(status.git_root.length + 1)
      : path;

    if (isDir) {
      // Dir is dirty if any child file matches
      const anyMatch = status.files.some((f) => f.path.startsWith(rel + "/") || f.path === rel);
      if (anyMatch) {
        badge = "M";
        badgeColor = "#e2c08d";
      }
    } else {
      const f = status.files.find((sf) => sf.path === rel);
      if (f) {
        const char = f.index_status !== " " ? f.index_status : f.work_status;
        badge = char === "?" ? "U" : char;
        badgeColor = GIT_STATUS_COLOR[char] ?? "#888";
      }
    }
  }

  return (
    <span style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", display: "flex", alignItems: "center", gap: 4, flex: 1, minWidth: 0 }}>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", color: badge ? badgeColor : undefined }}>
        {name}
      </span>
      {badge && (
        <span style={{ color: badgeColor, fontSize: 10, fontWeight: 600, flexShrink: 0 }}>
          {badge}
        </span>
      )}
    </span>
  );
}

interface CtxMenu {
  x: number;
  y: number;
  entry: DirEntry | null; // null = background (root)
}

interface RenameState {
  path: string;
  name: string;
}

function EntryRow({
  entry,
  depth,
  onOpen,
  onContextMenu,
  renamingPath,
  onRenameCommit,
  onRenameCancel,
  onRenameChange,
  renameValue,
}: {
  entry: DirEntry;
  depth: number;
  onOpen: (path: string) => void;
  onContextMenu: (e: React.MouseEvent, entry: DirEntry) => void;
  renamingPath: string | null;
  onRenameCommit: () => void;
  onRenameCancel: () => void;
  onRenameChange: (v: string) => void;
  renameValue: string;
}) {
  const [open, setOpen] = useState(false);
  const [children, setChildren] = useState<DirEntry[]>(entry.children ?? []);
  const activeFile = useEditorStore((s) => s.activeFile);
  const isActive = activeFile === entry.path;
  const renameRef = useRef<HTMLInputElement>(null);
  const isRenaming = renamingPath === entry.path;

  useEffect(() => {
    if (isRenaming) renameRef.current?.select();
  }, [isRenaming]);

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
        onClick={isRenaming ? undefined : toggle}
        onContextMenu={(e) => { e.preventDefault(); onContextMenu(e, entry); }}
        style={{
          paddingLeft: depth * 12 + 10,
          paddingRight: 8,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 5,
          height: 24,
          background: isActive ? "#094771" : "transparent",
          color: isActive ? "#fff" : "#ccc",
          userSelect: "none",
          whiteSpace: "nowrap",
          overflow: "hidden",
        }}
        onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLDivElement).style.background = "#2a2d2e"; }}
        onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
      >
        <span style={{ width: 10, flexShrink: 0, fontSize: 9, color: "#666", display: "flex", alignItems: "center" }}>
          {entry.is_dir ? (open ? "▾" : "▸") : ""}
        </span>
        <FileIcon name={entry.name} isDir={entry.is_dir} open={open} />
        {isRenaming ? (
          <input
            ref={renameRef}
            value={renameValue}
            onChange={(e) => onRenameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onRenameCommit();
              if (e.key === "Escape") onRenameCancel();
              e.stopPropagation();
            }}
            onBlur={onRenameCommit}
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#3c3c3c",
              border: "1px solid #094771",
              borderRadius: 2,
              color: "#fff",
              fontSize: 12,
              padding: "1px 4px",
              outline: "none",
              width: "85%",
            }}
          />
        ) : (
          <GitDecoratedName name={entry.name} path={entry.path} isDir={entry.is_dir} />
        )}
      </div>
      {entry.is_dir && open &&
        children.map((child) => (
          <EntryRow
            key={child.path}
            entry={child}
            depth={depth + 1}
            onOpen={onOpen}
            onContextMenu={onContextMenu}
            renamingPath={renamingPath}
            onRenameCommit={onRenameCommit}
            onRenameCancel={onRenameCancel}
            onRenameChange={onRenameChange}
            renameValue={renameValue}
          />
        ))}
    </>
  );
}

export function FileExplorer() {
  const { workspaceRoot, openFile } = useEditorStore();
  const [entries, setEntries] = useState<DirEntry[]>([]);
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null);
  const [rename, setRename] = useState<RenameState | null>(null);
  const [newItemState, setNewItemState] = useState<{ parentPath: string; isDir: boolean } | null>(null);
  const [newItemName, setNewItemName] = useState("");
  const newItemRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (newItemState) newItemRef.current?.focus();
  }, [newItemState]);

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
    return () => { unlisten.then((f) => f()); };
  }, [workspaceRoot]);

  useEffect(() => {
    function close() { setCtxMenu(null); }
    window.addEventListener("click", close);
    window.addEventListener("contextmenu", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("contextmenu", close);
    };
  }, []);

  async function handleOpen(path: string) {
    const content = await invoke<string>("fs_read", { path });
    openFile(path, content);
  }

  function handleContextMenu(e: React.MouseEvent, entry: DirEntry | null) {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY, entry });
  }

  function startRename(entry: DirEntry) {
    setRename({ path: entry.path, name: entry.name });
    setCtxMenu(null);
  }

  async function commitRename() {
    if (!rename || !workspaceRoot) return;
    const trimmed = rename.name.trim();
    if (!trimmed) { setRename(null); return; }
    const dir = rename.path.substring(0, rename.path.lastIndexOf("/"));
    const newPath = `${dir}/${trimmed}`;
    if (newPath !== rename.path) {
      await invoke("fs_rename", { oldPath: rename.path, newPath });
      refresh(workspaceRoot);
    }
    setRename(null);
  }

  async function handleDelete(entry: DirEntry) {
    if (!workspaceRoot) return;
    setCtxMenu(null);
    if (!window.confirm(`Delete "${entry.name}"?`)) return;
    await invoke("fs_delete", { path: entry.path });
    refresh(workspaceRoot);
  }

  function startNewItem(parentPath: string, isDir: boolean) {
    setCtxMenu(null);
    setNewItemState({ parentPath, isDir });
    setNewItemName("");
  }

  async function commitNewItem() {
    if (!newItemState || !workspaceRoot) return;
    const trimmed = newItemName.trim();
    if (!trimmed) { setNewItemState(null); return; }
    const fullPath = `${newItemState.parentPath}/${trimmed}`;
    if (newItemState.isDir) {
      await invoke("fs_mkdir", { path: fullPath });
    } else {
      await invoke("fs_write", { path: fullPath, content: "" });
    }
    refresh(workspaceRoot);
    setNewItemState(null);
    if (!newItemState.isDir) {
      const content = await invoke<string>("fs_read", { path: fullPath }).catch(() => "");
      openFile(fullPath, content);
    }
  }

  const ctxTarget = ctxMenu?.entry;
  const ctxParentPath = ctxTarget
    ? (ctxTarget.is_dir ? ctxTarget.path : ctxTarget.path.substring(0, ctxTarget.path.lastIndexOf("/")))
    : workspaceRoot ?? "";

  if (!workspaceRoot) {
    return <div style={{ padding: "16px 12px", color: "#666", fontSize: 12 }}>No folder open</div>;
  }

  return (
    <div
      style={{ overflowY: "auto", flex: 1, position: "relative" }}
      onContextMenu={(e) => { if (e.target === e.currentTarget) handleContextMenu(e, null); }}
    >
      {entries.map((e) => (
        <EntryRow
          key={e.path}
          entry={e}
          depth={0}
          onOpen={handleOpen}
          onContextMenu={handleContextMenu}
          renamingPath={rename?.path ?? null}
          renameValue={rename?.name ?? ""}
          onRenameCommit={commitRename}
          onRenameCancel={() => setRename(null)}
          onRenameChange={(v) => setRename((r) => r ? { ...r, name: v } : r)}
        />
      ))}

      {/* Inline new item input */}
      {newItemState && (
        <div style={{ paddingLeft: 22, paddingTop: 4, paddingBottom: 4 }}>
          <input
            ref={newItemRef}
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitNewItem();
              if (e.key === "Escape") setNewItemState(null);
              e.stopPropagation();
            }}
            onBlur={commitNewItem}
            placeholder={newItemState.isDir ? "folder name" : "file name"}
            style={{
              background: "#3c3c3c",
              border: "1px solid #094771",
              borderRadius: 2,
              color: "#fff",
              fontSize: 12,
              padding: "2px 6px",
              outline: "none",
              width: "85%",
            }}
          />
        </div>
      )}

      {/* Context menu */}
      {ctxMenu && (
        <div
          style={{
            position: "fixed",
            top: ctxMenu.y,
            left: ctxMenu.x,
            background: "#2d2d2d",
            border: "1px solid #555",
            borderRadius: 4,
            boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
            zIndex: 9999,
            minWidth: 160,
            fontSize: 12,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {[
            {
              label: "New File",
              action: () => startNewItem(ctxParentPath, false),
            },
            {
              label: "New Folder",
              action: () => startNewItem(ctxParentPath, true),
            },
            ...(ctxTarget ? [
              { label: "─────────", action: null },
              { label: "Rename", action: () => startRename(ctxTarget) },
              { label: "Delete", action: () => handleDelete(ctxTarget), danger: true },
            ] : []),
          ].map((item, i) =>
            item.action === null ? (
              <div key={i} style={{ padding: "3px 14px", color: "#555", cursor: "default", fontSize: 10 }}>
                {item.label}
              </div>
            ) : (
              <div
                key={i}
                onClick={item.action}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#094771")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                style={{
                  padding: "7px 14px",
                  cursor: "pointer",
                  color: (item as { danger?: boolean }).danger ? "#f48771" : "#ccc",
                }}
              >
                {item.label}
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
