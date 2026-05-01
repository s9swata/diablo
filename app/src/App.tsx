import { useState, useRef, useEffect } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { FileExplorer } from "./panels/FileExplorer";
import { SearchPanel } from "./panels/SearchPanel";
import { GitPanel } from "./panels/GitPanel";
import { TerminalPane } from "./panels/TerminalPane";
import { MonacoEditor } from "./editor/MonacoEditor";
import { useEditorStore } from "./store/editor";
import { useGitStore } from "./store/git";

interface InstallProgress {
  language: string;
  message: string;
  progress?: number;
}

interface MenuItem {
  label: string;
  action?: () => void;
  shortcut?: string;
  checked?: boolean;
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
                minWidth: 220,
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
                  onMouseEnter={(e) => { if (item.action) e.currentTarget.style.background = "#094771"; }}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  style={{
                    padding: "6px 12px",
                    fontSize: 12,
                    color: item.action ? "#ccc" : "#666",
                    cursor: item.action ? "pointer" : "default",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {item.checked !== undefined && (
                      <span style={{ width: 10, fontSize: 10 }}>{item.checked ? "✓" : ""}</span>
                    )}
                    {item.label}
                  </span>
                  {item.shortcut && (
                    <span style={{ color: "#888", flexShrink: 0 }}>{item.shortcut}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
      <div style={{ flex: 1 }} />
    </div>
  );
}

function StatusBar({
  cursorPos,
  language,
}: {
  cursorPos: { line: number; col: number } | null;
  language: string | null;
}) {
  const { status: gitStatus } = useGitStore();
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
        gap: 12,
      }}
    >
      <span style={{ opacity: 0.7 }}>Diablo</span>
      {gitStatus?.is_repo && (
        <span style={{ opacity: 0.9 }}>
          ⎇ {gitStatus.branch}
          {gitStatus.ahead > 0 && ` ↑${gitStatus.ahead}`}
          {gitStatus.behind > 0 && ` ↓${gitStatus.behind}`}
        </span>
      )}
      {lspStatus && <span style={{ opacity: 0.9 }}>● {lspStatus}</span>}
      <div style={{ flex: 1 }} />
      {language && <span style={{ opacity: 0.85 }}>{language}</span>}
      {cursorPos && (
        <span style={{ opacity: 0.85 }}>
          Ln {cursorPos.line}, Col {cursorPos.col}
        </span>
      )}
    </div>
  );
}

function Breadcrumb({ path, root }: { path: string | null; root: string | null }) {
  if (!path) return null;
  const relative = root && path.startsWith(root) ? path.slice(root.length + 1) : path;
  const parts = relative.split("/");

  return (
    <div
      style={{
        height: 22,
        background: "#1e1e1e",
        borderBottom: "1px solid #333",
        display: "flex",
        alignItems: "center",
        padding: "0 10px",
        fontSize: 11,
        color: "#888",
        flexShrink: 0,
        overflow: "hidden",
        whiteSpace: "nowrap",
      }}
    >
      {parts.map((part, i) => (
        <span key={i} style={{ display: "flex", alignItems: "center" }}>
          {i > 0 && <span style={{ margin: "0 4px", opacity: 0.5 }}>›</span>}
          <span style={{ color: i === parts.length - 1 ? "#ccc" : "#666" }}>{part}</span>
        </span>
      ))}
    </div>
  );
}

function TabBar({ onCloseRequest }: { onCloseRequest: (path: string) => void }) {
  const { openFiles, activeFile, setActiveFile, settings, updateSettings } = useEditorStore();
  const tabsRef = useRef<HTMLDivElement>(null);

  // Scroll active tab into view when it changes
  useEffect(() => {
    if (!tabsRef.current || !activeFile) return;
    const el = tabsRef.current.querySelector(`[data-path="${CSS.escape(activeFile)}"]`);
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeFile]);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        height: 35,
        background: "#252526",
        borderBottom: "1px solid #333",
        flexShrink: 0,
      }}
    >
      <div
        ref={tabsRef}
        style={{
          display: "flex",
          alignItems: "center",
          flex: 1,
          height: "100%",
          overflowX: "auto",
          scrollbarWidth: "none",
        }}
      >
        {openFiles.map((f) => {
          const name = f.path.split("/").pop() ?? f.path;
          const isActive = f.path === activeFile;
          return (
            <div
              key={f.path}
              data-path={f.path}
              onClick={() => setActiveFile(f.path)}
              onAuxClick={(e) => { if (e.button === 1) onCloseRequest(f.path); }}
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
              <span title={f.path}>
                {name}
                {f.dirty ? " ●" : ""}
              </span>
              <span
                onClick={(e) => { e.stopPropagation(); onCloseRequest(f.path); }}
                style={{ fontSize: 10, color: "#666", lineHeight: 1 }}
                title="Close"
              >
                ✕
              </span>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 6, padding: "0 10px", alignItems: "center", flexShrink: 0 }}>
        <select
          value={settings.theme}
          onChange={(e) => updateSettings({ theme: e.target.value as "vs-dark" | "light" })}
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
            <option key={s} value={s}>{s}px</option>
          ))}
        </select>
        <select
          value={settings.tabSize}
          onChange={(e) => updateSettings({ tabSize: Number(e.target.value) })}
          style={selectStyle}
        >
          {[2, 4].map((s) => (
            <option key={s} value={s}>{s} spaces</option>
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

function WelcomeScreen({ onOpenFolder, onNewFile }: { onOpenFolder: () => void; onNewFile: () => void }) {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        color: "#555",
        gap: 32,
        userSelect: "none",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 36, fontWeight: 700, color: "#e07b53", letterSpacing: -1 }}>
          Diablo
        </div>
        <div style={{ fontSize: 12, color: "#444", marginTop: 4 }}>Code Editor</div>
      </div>

      <div style={{ display: "flex", gap: 12 }}>
        <button
          onClick={onOpenFolder}
          style={{ ...btnStyle, padding: "8px 16px", fontSize: 13 }}
        >
          Open Folder
        </button>
        <button
          onClick={onNewFile}
          style={{ ...btnStyle, padding: "8px 16px", fontSize: 13, background: "#3c3c3c" }}
        >
          New File
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "auto auto",
          gap: "6px 24px",
          fontSize: 12,
          color: "#555",
        }}
      >
        {[
          ["Open Folder", "⌘O"],
          ["New File", "⌘N"],
          ["Save", "⌘S"],
          ["Close Tab", "⌘W"],
          ["Toggle Sidebar", "⌘B"],
          ["Find", "⌘F"],
          ["Zoom In / Out", "⌘= / ⌘-"],
          ["Word Wrap", "⌥Z"],
        ].map(([label, key]) => (
          <>
            <span key={label} style={{ textAlign: "right", color: "#444" }}>{label}</span>
            <span key={key} style={{ color: "#666", fontFamily: "monospace" }}>{key}</span>
          </>
        ))}
      </div>
    </div>
  );
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

  useEffect(() => { inputRef.current?.focus(); }, []);

  function submit() {
    const trimmed = name.trim();
    if (trimmed) onConfirm(trimmed);
  }

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999,
      }}
      onClick={onCancel}
    >
      <div
        style={{
          background: "#252526", border: "1px solid #555", borderRadius: 6,
          padding: "16px 20px", minWidth: 320, display: "flex", flexDirection: "column", gap: 10,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: 13, color: "#ccc" }}>New File</div>
        <input
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); if (e.key === "Escape") onCancel(); }}
          placeholder="filename.ts"
          style={{
            background: "#3c3c3c", border: "1px solid #555", borderRadius: 3,
            color: "#fff", fontSize: 13, padding: "4px 8px", outline: "none",
          }}
        />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onCancel} style={{ ...btnStyle, background: "#555" }}>Cancel</button>
          <button onClick={submit} style={btnStyle}>Create</button>
        </div>
      </div>
    </div>
  );
}

function DirtyCloseModal({
  fileName, onSaveAndClose, onDiscardAndClose, onCancel,
}: {
  fileName: string;
  onSaveAndClose: () => void;
  onDiscardAndClose: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999,
      }}
      onClick={onCancel}
    >
      <div
        style={{
          background: "#252526", border: "1px solid #555", borderRadius: 6,
          padding: "20px 24px", minWidth: 360, display: "flex", flexDirection: "column", gap: 14,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: 13, color: "#ccc", fontWeight: 600 }}>Unsaved Changes</div>
        <div style={{ fontSize: 12, color: "#aaa" }}>
          <strong style={{ color: "#ddd" }}>{fileName}</strong> has unsaved changes. Save before closing?
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onCancel} style={{ ...btnStyle, background: "#555" }}>Cancel</button>
          <button onClick={onDiscardAndClose} style={{ ...btnStyle, background: "#8b1a1a" }}>Don't Save</button>
          <button onClick={onSaveAndClose} style={btnStyle}>Save</button>
        </div>
      </div>
    </div>
  );
}

function AboutModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}
      onClick={onClose}
    >
      <div
        style={{ background: "#252526", border: "1px solid #555", borderRadius: 6, padding: "28px 32px", minWidth: 280, display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: 30, fontWeight: 700, color: "#e07b53" }}>Diablo</div>
        <div style={{ fontSize: 12, color: "#888" }}>Version 0.1.0</div>
        <div style={{ fontSize: 11, color: "#666", textAlign: "center", lineHeight: 1.6 }}>
          A fast, minimal code editor<br />built with Tauri + Monaco
        </div>
        <button onClick={onClose} style={{ ...btnStyle, marginTop: 8 }}>Close</button>
      </div>
    </div>
  );
}

export default function App() {
  const { setWorkspaceRoot, addFile, closeFile, openFiles, markSaved, activeFile, workspaceRoot, updateSettings, settings } =
    useEditorStore();
  const [showNewFileModal, setShowNewFileModal] = useState(false);
  const [dirtyCloseTarget, setDirtyCloseTarget] = useState<string | null>(null);
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(220);
  const [sidebarMode, setSidebarMode] = useState<"explorer" | "search" | "git">("explorer");
  const { refresh: refreshGit, status: gitStatus } = useGitStore();
  const [terminalVisible, setTerminalVisible] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const [cursorPos, setCursorPos] = useState<{ line: number; col: number } | null>(null);
  const [language, setLanguage] = useState<string | null>(null);

  // Keyboard shortcuts
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;

      // ⌃` — toggle terminal
      if (e.ctrlKey && !meta && e.key === "`") {
        e.preventDefault();
        setTerminalVisible((v) => !v);
        return;
      }

      // ⌥Z — word wrap (no meta needed)
      if (e.altKey && !meta && e.key === "z") {
        e.preventDefault();
        useEditorStore.getState().updateSettings({
          wordWrap: useEditorStore.getState().settings.wordWrap === "on" ? "off" : "on",
        });
        return;
      }

      if (!meta) return;

      if (e.shiftKey && e.key === "F") {
        e.preventDefault();
        setSidebarVisible(true);
        setSidebarMode("search");
        return;
      }

      if (e.key === "s") {
        e.preventDefault();
        handleSave();
      } else if (e.key === "w") {
        e.preventDefault();
        const path = useEditorStore.getState().activeFile;
        if (path) handleCloseRequest(path);
      } else if (e.key === "n") {
        e.preventDefault();
        setShowNewFileModal(true);
      } else if (e.key === "b") {
        e.preventDefault();
        setSidebarVisible((v) => !v);
      } else if (e.key === "=" || e.key === "+") {
        e.preventDefault();
        const { fontSize } = useEditorStore.getState().settings;
        updateSettings({ fontSize: Math.min(fontSize + 1, 32) });
      } else if (e.key === "-") {
        e.preventDefault();
        const { fontSize } = useEditorStore.getState().settings;
        updateSettings({ fontSize: Math.max(fontSize - 1, 8) });
      } else if (e.key === "0") {
        e.preventDefault();
        updateSettings({ fontSize: 14 });
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sidebar resize drag
  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!dragRef.current) return;
      const delta = e.clientX - dragRef.current.startX;
      const next = Math.max(120, Math.min(500, dragRef.current.startWidth + delta));
      setSidebarWidth(next);
    }
    function onMouseUp() {
      dragRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  function startDrag(e: React.MouseEvent) {
    dragRef.current = { startX: e.clientX, startWidth: sidebarWidth };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  async function handleSave() {
    const { openFiles: files, activeFile: path, markSaved: ms } = useEditorStore.getState();
    if (!path) return;
    const file = files.find((f) => f.path === path);
    if (!file) return;
    await invoke("fs_write", { path, content: file.content });
    ms(path);
    window.dispatchEvent(new CustomEvent("git-refresh"));
    const root = useEditorStore.getState().workspaceRoot;
    if (root) refreshGit(root);
  }

  function handleCloseRequest(path: string) {
    const file = useEditorStore.getState().openFiles.find((f) => f.path === path);
    if (file?.dirty) {
      setDirtyCloseTarget(path);
    } else {
      closeFile(path);
    }
  }

  async function handleSaveAndClose() {
    if (!dirtyCloseTarget) return;
    const path = dirtyCloseTarget;
    setDirtyCloseTarget(null);
    const file = useEditorStore.getState().openFiles.find((f) => f.path === path);
    if (file) {
      await invoke("fs_write", { path, content: file.content });
      markSaved(path);
    }
    closeFile(path);
  }

  function handleDiscardAndClose() {
    if (!dirtyCloseTarget) return;
    const path = dirtyCloseTarget;
    setDirtyCloseTarget(null);
    closeFile(path);
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

  async function handleOpenFolder() {
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected === "string") {
      setWorkspaceRoot(selected);
      await invoke("fs_watch", { path: selected });
      refreshGit(selected);
    }
  }

  const dirtyCloseFile = dirtyCloseTarget
    ? openFiles.find((f) => f.path === dirtyCloseTarget)
    : null;

  const menus = [
    {
      label: "File",
      items: [
        { label: "New File", action: () => setShowNewFileModal(true), shortcut: "⌘N" },
        { label: "Open Folder...", action: handleOpenFolder, shortcut: "⌘O" },
        { label: "Save", action: handleSave, shortcut: "⌘S" },
        {
          label: "Close File",
          action: () => { const p = useEditorStore.getState().activeFile; if (p) handleCloseRequest(p); },
          shortcut: "⌘W",
        },
      ],
    },
    {
      label: "Edit",
      items: [
        { label: "Undo", action: () => window.dispatchEvent(new CustomEvent("editor-cmd", { detail: "undo" })), shortcut: "⌘Z" },
        { label: "Redo", action: () => window.dispatchEvent(new CustomEvent("editor-cmd", { detail: "redo" })), shortcut: "⌘⇧Z" },
        { label: "Find", action: () => window.dispatchEvent(new CustomEvent("editor-cmd", { detail: "actions.find" })), shortcut: "⌘F" },
        { label: "Replace", action: () => window.dispatchEvent(new CustomEvent("editor-cmd", { detail: "editor.action.startFindReplaceAction" })), shortcut: "⌘H" },
        { label: "Find in Files", action: () => { setSidebarVisible(true); setSidebarMode("search"); }, shortcut: "⌘⇧F" },
      ],
    },
    {
      label: "View",
      items: [
        {
          label: "Toggle Sidebar",
          action: () => setSidebarVisible((v) => !v),
          shortcut: "⌘B",
          checked: sidebarVisible,
        },
        {
          label: "Toggle Word Wrap",
          action: () => updateSettings({ wordWrap: settings.wordWrap === "on" ? "off" : "on" }),
          shortcut: "⌥Z",
          checked: settings.wordWrap === "on",
        },
        {
          label: "Toggle Minimap",
          action: () => updateSettings({ minimap: !settings.minimap }),
          checked: settings.minimap,
        },
        {
          label: "Zoom In",
          action: () => updateSettings({ fontSize: Math.min(settings.fontSize + 1, 32) }),
          shortcut: "⌘=",
        },
        {
          label: "Zoom Out",
          action: () => updateSettings({ fontSize: Math.max(settings.fontSize - 1, 8) }),
          shortcut: "⌘-",
        },
        {
          label: "Reset Zoom",
          action: () => updateSettings({ fontSize: 14 }),
          shortcut: "⌘0",
        },
      ],
    },
    {
      label: "Window",
      items: [
        {
          label: "Minimize",
          action: () => getCurrentWindow().minimize(),
          shortcut: "⌘M",
        },
        {
          label: "Close Window",
          action: () => getCurrentWindow().close(),
          shortcut: "⌘⇧W",
        },
      ],
    },
    {
      label: "Terminal",
      items: [
        {
          label: "New Terminal",
          action: () => setTerminalVisible((v) => !v),
          shortcut: "⌃`",
          checked: terminalVisible,
        },
      ],
    },
    {
      label: "Help",
      items: [{ label: "About Diablo", action: () => setShowAbout(true) }],
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
      {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}
      {dirtyCloseFile && (
        <DirtyCloseModal
          fileName={dirtyCloseFile.path.split("/").pop() ?? dirtyCloseFile.path}
          onSaveAndClose={handleSaveAndClose}
          onDiscardAndClose={handleDiscardAndClose}
          onCancel={() => setDirtyCloseTarget(null)}
        />
      )}
      <MenuBar menus={menus} />

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {sidebarVisible && (
          <>
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
                  padding: "4px 8px",
                  fontSize: 11,
                  color: "#bbb",
                  textTransform: "uppercase",
                  letterSpacing: 1,
                  borderBottom: "1px solid #333",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span
                  onClick={() => setSidebarMode("explorer")}
                  style={{ cursor: "pointer", opacity: sidebarMode === "explorer" ? 1 : 0.4 }}
                >
                  Explorer
                </span>
                <span style={{ opacity: 0.3 }}>|</span>
                <span
                  onClick={() => setSidebarMode("search")}
                  style={{ cursor: "pointer", opacity: sidebarMode === "search" ? 1 : 0.4 }}
                >
                  Search
                </span>
                <span style={{ opacity: 0.3 }}>|</span>
                <span
                  onClick={() => { setSidebarMode("git"); if (workspaceRoot) refreshGit(workspaceRoot); }}
                  style={{ cursor: "pointer", opacity: sidebarMode === "git" ? 1 : 0.4, position: "relative" }}
                >
                  Git
                  {gitStatus?.is_repo && gitStatus.files.length > 0 && (
                    <span
                      style={{
                        position: "absolute",
                        top: -4,
                        right: -8,
                        background: "#0e639c",
                        color: "#fff",
                        fontSize: 9,
                        borderRadius: 8,
                        padding: "0 3px",
                        minWidth: 14,
                        textAlign: "center",
                      }}
                    >
                      {gitStatus.files.length}
                    </span>
                  )}
                </span>
              </div>
              {sidebarMode === "explorer" ? (
                <FileExplorer />
              ) : sidebarMode === "search" ? (
                <SearchPanel autoFocus />
              ) : (
                <GitPanel />
              )}
            </div>
            <div
              onMouseDown={startDrag}
              style={{
                width: 4, cursor: "col-resize", background: "transparent",
                flexShrink: 0, zIndex: 10,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#094771")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            />
          </>
        )}

        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", borderLeft: sidebarVisible ? "none" : "2px solid #333" }}>
          <TabBar onCloseRequest={handleCloseRequest} />
          <Breadcrumb path={activeFile} root={workspaceRoot} />
          <div style={{ flex: 1, overflow: "hidden" }}>
            {activeFile ? (
              <MonacoEditor onCursorChange={setCursorPos} onLanguageChange={setLanguage} />
            ) : (
              <WelcomeScreen
                onOpenFolder={handleOpenFolder}
                onNewFile={() => setShowNewFileModal(true)}
              />
            )}
          </div>
          {terminalVisible && (
            <div style={{ height: 220, flexShrink: 0 }}>
              <TerminalPane onClose={() => setTerminalVisible(false)} />
            </div>
          )}
        </div>
      </div>
      <StatusBar cursorPos={cursorPos} language={language} />
    </div>
  );
}
