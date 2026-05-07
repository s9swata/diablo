import { useState, useRef, useEffect } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { FileExplorer } from "./panels/FileExplorer";
import { SearchPanel } from "./panels/SearchPanel";
import { GitPanel } from "./panels/GitPanel";
import { TerminalPane } from "./panels/TerminalPane";
import { ChatPanel } from "./panels/ChatPanel";
import { DiffReview } from "./panels/DiffReview";
import { CodeMirrorEditor } from "./editor/CodeMirrorEditor";
import { useEditorStore } from "./store/editor";
import { useGitStore } from "./store/git";
import { useAgentStore } from "./store/agent";
import { useIndexStore } from "./store/index";
import { MenuBar } from "./layout/MenuBar";
import { StatusBar } from "./layout/StatusBar";
import { Breadcrumb } from "./layout/Breadcrumb";
import { TabBar } from "./layout/TabBar";
import { Button, Modal } from "./ui/primitives";

function WelcomeScreen({
  onOpenFolder,
  onNewFile,
}: {
  onOpenFolder: () => void;
  onNewFile: () => void;
}) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-text-muted select-none bg-bg-app" style={{ gap: 32, height: "100%" }}>
      <div className="text-center">
        <div className="text-4xl font-bold text-accent tracking-tight">
          Diablo
        </div>
        <div className="text-xs text-text-muted opacity-80" style={{ marginTop: 4 }}>
          Code Editor
        </div>
      </div>
      <div className="flex" style={{ gap: 12 }}>
        <Button onClick={onOpenFolder} style={{ padding: "4px 16px", fontSize: 13 }}>
          Open Folder
        </Button>
        <Button variant="ghost" onClick={onNewFile} style={{ padding: "4px 16px", fontSize: 13 }}>
          New File
        </Button>
      </div>
      <div className="grid grid-cols-[auto_auto] text-sm text-text-muted" style={{ columnGap: 24, rowGap: 6 }}>
        {[
          ["Open Folder", "⌘ + O"],
          ["New File", "⌘ + N"],
          ["Save", "⌘ + S"],
          ["Close Tab", "⌘ + W"],
          ["Toggle Sidebar", "⌘ + B"],
          ["Find", "⌘ + F"],
          ["Zoom In / Out", "⌘ + = / ⌘ + -"],
          ["Word Wrap", "⌥ + Z"],
        ].map(([label, key]) => (
          <div className="contents" key={label}>
            <span className="text-right opacity-80">{label}</span>
            <span className="font-mono opacity-60">{key}</span>
          </div>
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
  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  function submit() {
    const trimmed = name.trim();
    if (trimmed) onConfirm(trimmed);
  }
  return (
    <Modal onClose={onCancel}>
      <div
        className="bg-bg-app border border-border-subtle rounded-md flex flex-col shadow-xl"
        style={{ padding: 16, minWidth: 320, gap: 10 }}
      >
        <div className="text-[13px] text-text-main">New File</div>
        <input
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
            if (e.key === "Escape") onCancel();
          }}
          placeholder="filename.ts"
          className="bg-bg-sidebar border border-border-subtle rounded-sm text-white text-[13px] outline-none focus:border-text-muted"
          style={{ padding: "4px 8px" }}
        />
        <div className="flex justify-end" style={{ gap: 8, marginTop: 4 }}>
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button onClick={submit}>Create</Button>
        </div>
      </div>
    </Modal>
  );
}

function DirtyCloseModal({
  fileName,
  onSaveAndClose,
  onDiscardAndClose,
  onCancel,
}: {
  fileName: string;
  onSaveAndClose: () => void;
  onDiscardAndClose: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal onClose={onCancel}>
      <div
        className="bg-bg-app border border-border-subtle rounded-md flex flex-col shadow-xl"
        style={{ padding: 20, minWidth: 360, gap: 14 }}
      >
        <div className="text-[13px] text-text-main font-semibold">
          Unsaved Changes
        </div>
        <div className="text-xs text-text-muted">
          <strong className="text-text-main">{fileName}</strong> has unsaved
          changes. Save before closing?
        </div>
        <div className="flex justify-end" style={{ gap: 8, marginTop: 4 }}>
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button variant="danger" onClick={onDiscardAndClose}>Don't Save</Button>
          <Button onClick={onSaveAndClose}>Save</Button>
        </div>
      </div>
    </Modal>
  );
}

function AboutModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal onClose={onClose}>
      <div
        className="bg-bg-app border border-border-subtle rounded-md flex flex-col items-center shadow-xl"
        style={{ padding: 28, minWidth: 280, gap: 10 }}
      >
        <div className="text-3xl font-bold text-accent">Diablo</div>
        <div className="text-xs text-text-muted">Version 0.1.0</div>
        <div className="text-[11px] text-text-muted text-center leading-relaxed">
          A fast, minimal code editor
          <br />
          built with Tauri + Monaco
        </div>
        <Button onClick={onClose} style={{ marginTop: 8, padding: "4px 16px" }}>
          Close
        </Button>
      </div>
    </Modal>
  );
}

export default function App() {
  const {
    setWorkspaceRoot,
    addFile,
    closeFile,
    openFiles,
    markSaved,
    activeFile,
    workspaceRoot,
    updateSettings,
  } = useEditorStore();
  const [showNewFileModal, setShowNewFileModal] = useState(false);
  const [dirtyCloseTarget, setDirtyCloseTarget] = useState<string | null>(null);
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(240);
  const [searchTabOpen, setSearchTabOpen] = useState(false); // tab exists in TabBar
  const [searchActive, setSearchActive] = useState(false); // SearchPanel is current view
  const [gitOpen, setGitOpen] = useState(false);
  const [gitPanelHeight, setGitPanelHeight] = useState(260);
  const { refresh: refreshGit, status: gitStatus } = useGitStore();
  const [terminalVisible, setTerminalVisible] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const { pendingDiffs } = useAgentStore();
  const { setProgress } = useIndexStore();
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const gitDragRef = useRef<{ startY: number; startHeight: number } | null>(
    null,
  );
  const [cursorPos, setCursorPos] = useState<{
    line: number;
    col: number;
  } | null>(null);
  const [language, setLanguage] = useState<string | null>(null);

  // Native macOS system menu events forwarded from Rust via `menu-action` event
  useEffect(() => {
    const unlisten = listen<string>("menu-action", ({ payload: id }) => {
      const store = useEditorStore.getState();
      switch (id) {
        case "file_new":
          setShowNewFileModal(true);
          break;
        case "file_open":
          handleOpenFolder();
          break;
        case "file_save":
          handleSave();
          break;
        case "file_close": {
          const p = store.activeFile;
          if (p) handleCloseRequest(p);
          break;
        }
        case "edit_find":
          window.dispatchEvent(
            new CustomEvent("editor-cmd", { detail: "actions.find" }),
          );
          break;
        case "edit_replace":
          window.dispatchEvent(
            new CustomEvent("editor-cmd", {
              detail: "editor.action.startFindReplaceAction",
            }),
          );
          break;
        case "edit_find_files":
          setSearchTabOpen(true);
          setSearchActive(true);
          break;
        case "view_sidebar":
          setSidebarVisible((v) => !v);
          break;
        case "view_terminal":
          setTerminalVisible((v) => !v);
          break;
        case "view_minimap":
          // minimap removed — no-op
          break;
        case "view_wordwrap":
          store.updateSettings({
            wordWrap: store.settings.wordWrap === "on" ? "off" : "on",
          });
          break;
        case "view_zoom_in":
          store.updateSettings({
            fontSize: Math.min(store.settings.fontSize + 1, 32),
          });
          break;
        case "view_zoom_out":
          store.updateSettings({
            fontSize: Math.max(store.settings.fontSize - 1, 8),
          });
          break;
        case "view_zoom_reset":
          store.updateSettings({ fontSize: 14 });
          break;
        case "help_about":
          setShowAbout(true);
          break;
      }
    });
    return () => {
      unlisten.then((f) => f());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Listen for index progress events
  useEffect(() => {
    const unlisten = listen<{ indexed: number; total: number }>(
      "index_progress",
      ({ payload }) => {
        setProgress(payload.indexed, payload.total);
      },
    );
    return () => {
      unlisten.then((f) => f());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keyboard shortcuts (still handled locally for responsiveness)
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;
      if (e.ctrlKey && e.key === "`") {
        e.preventDefault();
        setTerminalVisible((v) => !v);
        return;
      }
      if (e.altKey && e.key === "z") {
        e.preventDefault();
        useEditorStore.getState().updateSettings({
          wordWrap:
            useEditorStore.getState().settings.wordWrap === "on" ? "off" : "on",
        });
        return;
      }
      if (!meta) return;
      if (e.shiftKey && e.key === "F") {
        e.preventDefault();
        // If tab doesn't exist: open + activate. If exists but inactive: activate. If active: deactivate.
        setSearchTabOpen(true);
        setSearchActive((v) => !v);
        return;
      }
      if (e.shiftKey && e.key === "G") {
        e.preventDefault();
        setGitOpen((v) => {
          if (!v && workspaceRoot) refreshGit(workspaceRoot);
          return !v;
        });
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
      } else if (e.key === "i") {
        e.preventDefault();
        setChatOpen((v) => !v);
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

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      // Horizontal sidebar resize
      if (dragRef.current) {
        const delta = e.clientX - dragRef.current.startX;
        const next = Math.max(
          120,
          Math.min(500, dragRef.current.startWidth + delta),
        );
        setSidebarWidth(next);
      }
      // Vertical git panel resize (dragging up = taller panel)
      if (gitDragRef.current) {
        const delta = e.clientY - gitDragRef.current.startY;
        const next = Math.max(
          80,
          Math.min(600, gitDragRef.current.startHeight - delta),
        );
        setGitPanelHeight(next);
      }
    }
    function onMouseUp() {
      dragRef.current = null;
      gitDragRef.current = null;
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
  function startGitDrag(e: React.MouseEvent) {
    e.preventDefault();
    gitDragRef.current = { startY: e.clientY, startHeight: gitPanelHeight };
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
  }

  async function handleSave() {
    const {
      openFiles: files,
      activeFile: path,
      markSaved: ms,
    } = useEditorStore.getState();
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
    const file = useEditorStore
      .getState()
      .openFiles.find((f) => f.path === path);
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
    const file = useEditorStore
      .getState()
      .openFiles.find((f) => f.path === path);
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
      invoke("index_start", { root: selected }).catch(() => {});
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
      invoke("index_start", { root: selected }).catch(() => {});
      refreshGit(selected);
    }
  }

  const dirtyCloseFile = dirtyCloseTarget
    ? openFiles.find((f) => f.path === dirtyCloseTarget)
    : null;

  return (
    <div className="flex flex-col h-full w-full bg-bg-app overflow-hidden">
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

      <MenuBar
        activeFileName={
          activeFile ? (activeFile.split("/").pop() ?? null) : null
        }
        panels={{
          sidebarVisible,
          terminalVisible,
          minimapVisible: false,
          onToggleSidebar: () => setSidebarVisible((v) => !v),
          onToggleTerminal: () => setTerminalVisible((v) => !v),
          onToggleMinimap: () => {},
        }}
      />

      {pendingDiffs.length > 0 && <DiffReview />}
      <div className="flex flex-1 overflow-hidden">
        {sidebarVisible && (
          <>
            <div
              style={{ width: sidebarWidth }}
              className="bg-bg-sidebar border-r border-border-subtle flex flex-col shrink-0 overflow-hidden"
            >
              {/* File Explorer — always visible, grows to fill remaining space */}
              <div style={{ flex: 1, minHeight: 80, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                <FileExplorer />
              </div>

              {/* Git panel — vertical split at bottom, user-resizable */}
              {gitOpen && (
                <>
                  {/* Horizontal drag handle between explorer and git */}
                  <div
                    onMouseDown={startGitDrag}
                    style={{
                      height: 4,
                      cursor: "row-resize",
                      flexShrink: 0,
                      borderTop: "1px solid #333",
                      borderBottom: "1px solid #333",
                    }}
                    className="bg-transparent hover:bg-primary transition-colors"
                  />
                  <div
                    style={{
                      height: gitPanelHeight,
                      flexShrink: 0,
                      overflow: "hidden",
                    }}
                  >
                    <GitPanel />
                  </div>
                </>
              )}
            </div>
            <div
              onMouseDown={startDrag}
              style={{ width: 4 }}
              className="cursor-col-resize bg-transparent hover:bg-primary shrink-0 z-10 transition-colors"
            />
          </>
        )}

        <div className="flex flex-col flex-1 overflow-hidden">
          <TabBar
            onCloseRequest={handleCloseRequest}
            searchTabOpen={searchTabOpen}
            searchActive={searchActive}
            onSearchTabActivate={() => setSearchActive(true)}
            onSearchTabClose={() => {
              setSearchTabOpen(false);
              setSearchActive(false);
            }}
            onFileTabClick={() => setSearchActive(false)}
          />
          {/* Hide breadcrumb when Search is the active view */}
          <Breadcrumb
            path={searchActive ? null : activeFile}
            root={workspaceRoot}
          />
          <div
            className="flex-1 overflow-hidden bg-bg-app"
            style={{ position: "relative" }}
          >
            {/* SearchPanel stays mounted while tab is open — only hidden/shown via CSS */}
            {/* This preserves query + results when user switches away and back */}
            {searchTabOpen && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  zIndex: 10,
                  display: searchActive ? "flex" : "none",
                  flexDirection: "column",
                }}
                className="bg-bg-app"
              >
                <SearchPanel
                  mode="overlay"
                  onClose={() => setSearchActive(false)}
                  autoFocus={searchActive}
                />
              </div>
            )}
            {/* Editor / welcome screen always rendered underneath */}
            {activeFile ? (
              <CodeMirrorEditor
                onCursorChange={setCursorPos}
                onLanguageChange={setLanguage}
              />
            ) : (
              <WelcomeScreen
                onOpenFolder={handleOpenFolder}
                onNewFile={() => setShowNewFileModal(true)}
              />
            )}
          </div>
          {terminalVisible && (
            <div
              style={{ height: 240 }}
              className="shrink-0 border-t border-border-subtle bg-bg-app"
            >
              <TerminalPane onClose={() => setTerminalVisible(false)} />
            </div>
          )}
        </div>
        {chatOpen && (
          <ChatPanel onClose={() => setChatOpen(false)} />
        )}
      </div>
      <StatusBar
        cursorPos={cursorPos}
        language={language}
        sidebarVisible={sidebarVisible}
        searchOpen={searchActive}
        gitOpen={gitOpen}
        gitCount={gitStatus?.files.length ?? 0}
        onToggleExplorer={() => setSidebarVisible((v) => !v)}
        onToggleSearch={() => {
          setSearchTabOpen(true);
          setSearchActive((v) => !v);
        }}
        onToggleGit={() => {
          setGitOpen((v) => {
            if (!v && workspaceRoot) refreshGit(workspaceRoot);
            return !v;
          });
        }}
      />
    </div>
  );
}
