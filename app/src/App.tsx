import { useState, useRef, useEffect } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { FileExplorer } from "./panels/FileExplorer";
import { MonacoEditor } from "./editor/MonacoEditor";
import { useEditorStore } from "./store/editor";

interface InstallProgress {
  language: string;
  message: string;
  progress?: number;
}

interface MenuItem {
  label: string;
  action?: () => void;
  shortcut?: string;
}

function MenuBar({
  menus,
}: {
  menus: { label: string; items: MenuItem[] }[];
}) {
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  return (
    <div
      style={{
        height: 28,
        background: "#323233",
        display: "flex",
        alignItems: "center",
        flexShrink: 0,
        borderBottom: "1px solid #222",
        padding: "0 8px",
        gap: 2,
      }}
    >
      <span style={{ fontWeight: 600, color: "#e07b53", fontSize: 13, marginRight: 8 }}>
        Diablo
      </span>
      {menus.map((menu) => (
        <div
          key={menu.label}
          style={{ position: "relative" }}
          onMouseEnter={() => setOpenMenu(menu.label)}
          onMouseLeave={() => setOpenMenu(null)}
        >
          <div
            style={{
              padding: "4px 10px",
              fontSize: 12,
              color: openMenu === menu.label ? "#fff" : "#ccc",
              background: openMenu === menu.label ? "#094771" : "transparent",
              cursor: "pointer",
              borderRadius: 3,
            }}
          >
            {menu.label}
          </div>
          {openMenu === menu.label && (
            <div
              style={{
                position: "absolute",
                top: "100%",
                left: 0,
                minWidth: 200,
                background: "#3c3c3c",
                border: "1px solid #555",
                boxShadow: "0 2px 8px rgba(0,0,0,0.5)",
                zIndex: 1000,
              }}
            >
              {menu.items.map((item, i) => (
                <div
                  key={i}
                  onClick={() => {
                    item.action?.();
                    setOpenMenu(null);
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#094771")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  style={{
                    padding: "6px 12px",
                    fontSize: 12,
                    color: "#ccc",
                    cursor: "pointer",
                    display: "flex",
                    justifyContent: "space-between",
                  }}
                >
                  <span>{item.label}</span>
                  {item.shortcut && (
                    <span style={{ color: "#888", marginLeft: 20 }}>
                      {item.shortcut}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
      <div style={{ flex: 1 }} />
      <button onClick={openFolder} style={btnStyle}>
        Open Folder
      </button>
    </div>
  );
}

function StatusBar() {
  const [lspStatus, setLspStatus] = useState<string | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unlisten = listen<InstallProgress>("lsp_install_progress", (e) => {
      setLspStatus(`[${e.payload.language}] ${e.payload.message}`);
      if (timer) clearTimeout(timer);
      if (e.payload.message.includes("ready") || e.payload.message.includes("found")) {
        timer = setTimeout(() => setLspStatus(null), 3000);
      }
    });
    return () => {
      unlisten.then((f) => f());
      if (timer) clearTimeout(timer);
    };
  }, []);

  return (
    <div
      style={{
        height: 22,
        background: "#007acc",
        display: "flex",
        alignItems: "center",
        padding: "0 10px",
        fontSize: 11,
        color: "#fff",
        flexShrink: 0,
        gap: 8,
      }}
    >
      <span style={{ opacity: 0.7 }}>Diablo</span>
      {lspStatus && <span style={{ opacity: 0.9 }}>● {lspStatus}</span>}
    </div>
  );
}

function TabBar() {
  const { openFiles, activeFile, setActiveFile, closeFile, settings, updateSettings } =
    useEditorStore();

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        height: 35,
        background: "#252526",
        borderBottom: "1px solid #333",
        overflowX: "auto",
        flexShrink: 0,
      }}
    >
      {openFiles.map((f) => {
        const name = f.path.split("/").pop() ?? f.path;
        const isActive = f.path === activeFile;
        return (
          <div
            key={f.path}
            onClick={() => setActiveFile(f.path)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              height: "100%",
              padding: "0 12px",
              cursor: "pointer",
              background: isActive ? "#1e1e1e" : "transparent",
              borderRight: "1px solid #333",
              color: isActive ? "#fff" : "#888",
              fontSize: 12,
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            <span>
              {name}
              {f.dirty ? " ●" : ""}
            </span>
            <span
              onClick={(e) => {
                e.stopPropagation();
                closeFile(f.path);
              }}
              style={{ fontSize: 10, color: "#666", lineHeight: 1 }}
              title="Close"
            >
              ✕
            </span>
          </div>
        );
      })}
      <div style={{ flex: 1 }} />
      <div style={{ display: "flex", gap: 6, padding: "0 10px", alignItems: "center" }}>
        <select
          value={settings.theme}
          onChange={(e) =>
            updateSettings({ theme: e.target.value as "vs-dark" | "light" })
          }
          style={selectStyle}
        >
          <option value="vs-dark">Dark</option>
          <option value="light">Light</option>
        </select>
        <select
          value={settings.fontSize}
          onChange={(e) => updateSettings({ fontSize: Number(e.target.value) })}
          style={selectStyle}
        >
          {[11, 12, 13, 14, 15, 16, 18].map((s) => (
            <option key={s} value={s}>
              {s}px
            </option>
          ))}
        </select>
        <select
          value={settings.tabSize}
          onChange={(e) => updateSettings({ tabSize: Number(e.target.value) })}
          style={selectStyle}
        >
          {[2, 4].map((s) => (
            <option key={s} value={s}>
              {s} spaces
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  background: "#3c3c3c",
  color: "#ccc",
  border: "1px solid #555",
  borderRadius: 3,
  padding: "2px 4px",
  fontSize: 11,
  cursor: "pointer",
};

const btnStyle: React.CSSProperties = {
  background: "#0e639c",
  color: "#fff",
  border: "none",
  borderRadius: 3,
  padding: "3px 8px",
  fontSize: 12,
  cursor: "pointer",
};

async function openFolder() {
  const selected = await open({ directory: true, multiple: false });
  if (typeof selected === "string") {
    useEditorStore.getState().setWorkspaceRoot(selected);
    await invoke("fs_watch", { path: selected });
  }
}

function NewFileModal({
  onConfirm,
  onCancel,
}: {
  onConfirm: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function submit() {
    const trimmed = name.trim();
    if (trimmed) onConfirm(trimmed);
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
      }}
      onClick={onCancel}
    >
      <div
        style={{
          background: "#252526",
          border: "1px solid #555",
          borderRadius: 6,
          padding: "16px 20px",
          minWidth: 320,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: 13, color: "#ccc" }}>New File</div>
        <input
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
            if (e.key === "Escape") onCancel();
          }}
          placeholder="filename.ts"
          style={{
            background: "#3c3c3c",
            border: "1px solid #555",
            borderRadius: 3,
            color: "#fff",
            fontSize: 13,
            padding: "4px 8px",
            outline: "none",
          }}
        />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onCancel} style={{ ...btnStyle, background: "#555" }}>
            Cancel
          </button>
          <button onClick={submit} style={btnStyle}>
            Create
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const { setWorkspaceRoot, addFile, activeFile, closeFile } = useEditorStore();
  const [sidebarWidth] = useState(220);
  const [showNewFileModal, setShowNewFileModal] = useState(false);

  async function handleNewFile() {
    setShowNewFileModal(true);
  }

  async function confirmNewFile(name: string) {
    setShowNewFileModal(false);
    let root = useEditorStore.getState().workspaceRoot;
    if (!root) {
      const selected = await open({ directory: true, multiple: false });
      if (typeof selected !== "string") return;
      setWorkspaceRoot(selected);
      await invoke("fs_watch", { path: selected });
      root = selected;
    }
    const filePath = `${root}/${name}`;
    await invoke("fs_write", { path: filePath, content: "" });
    addFile(filePath);
  }

  async function handleSave() {
    const { openFiles, activeFile: path, markSaved } = useEditorStore.getState();
    if (!path) return;
    const file = openFiles.find((f) => f.path === path);
    if (!file) return;
    await invoke("fs_write", { path, content: file.content });
    markSaved(path);
  }

  async function handleOpenFolder() {
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected === "string") {
      setWorkspaceRoot(selected);
      await invoke("fs_watch", { path: selected });
    }
  }

  function handleCloseFile() {
    if (activeFile) {
      closeFile(activeFile);
    }
  }

  const menus = [
    {
      label: "File",
      items: [
        { label: "New File", action: handleNewFile, shortcut: "⌘N" },
        { label: "Open Folder...", action: handleOpenFolder, shortcut: "⌘O" },
        { label: "Save", action: handleSave, shortcut: "⌘S" },
        { label: "Close File", action: handleCloseFile, shortcut: "⌘W" },
      ],
    },
    {
      label: "Edit",
      items: [
        { label: "Undo", shortcut: "⌘Z" },
        { label: "Redo", shortcut: "⌘⇧Z" },
        { label: "Cut", shortcut: "⌘X" },
        { label: "Copy", shortcut: "⌘C" },
        { label: "Paste", shortcut: "⌘V" },
        { label: "Select All", shortcut: "⌘A" },
        { label: "Find", shortcut: "⌘F" },
        { label: "Replace", shortcut: "⌘H" },
      ],
    },
    {
      label: "View",
      items: [
        { label: "Toggle Sidebar", shortcut: "⌘B" },
        { label: "Toggle Status Bar" },
        { label: "Zoom In", shortcut: "⌘=" },
        { label: "Zoom Out", shortcut: "⌘-" },
        { label: "Reset Zoom", shortcut: "⌘0" },
      ],
    },
    {
      label: "Window",
      items: [
        { label: "Minimize", shortcut: "⌘M" },
        { label: "Zoom" },
        { label: "Close Window", shortcut: "⌘⇧W" },
      ],
    },
    {
      label: "Help",
      items: [{ label: "About Diablo" }, { label: "Documentation" }],
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {showNewFileModal && (
        <NewFileModal
          onConfirm={confirmNewFile}
          onCancel={() => setShowNewFileModal(false)}
        />
      )}
      <MenuBar menus={menus} />

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <div
          style={{
            width: sidebarWidth,
            background: "#252526",
            borderRight: "1px solid #333",
            display: "flex",
            flexDirection: "column",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              padding: "6px 8px",
              fontSize: 11,
              color: "#bbb",
              textTransform: "uppercase",
              letterSpacing: 1,
              borderBottom: "1px solid #333",
            }}
          >
            Explorer
          </div>
          <FileExplorer />
        </div>

        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <TabBar />
          <div style={{ flex: 1, overflow: "hidden" }}>
            <MonacoEditor />
          </div>
        </div>
      </div>
      <StatusBar />
    </div>
  );
}