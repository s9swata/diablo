import { useState, useRef, useEffect } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { FileExplorer } from "./panels/FileExplorer";
import { SearchPanel } from "./panels/SearchPanel";
import { GitPanel } from "./panels/GitPanel";
import { TerminalPane } from "./panels/TerminalPane";
import { MonacoEditor } from "./editor/MonacoEditor";
import { useEditorStore } from "./store/editor";
import { useGitStore } from "./store/git";
import { MenuBar } from "./layout/MenuBar";
import { StatusBar } from "./layout/StatusBar";
import { Breadcrumb } from "./layout/Breadcrumb";
import { TabBar } from "./layout/TabBar";

type SidebarMode = "explorer" | "search" | "git";

const btnClass = "bg-primary text-white border-none rounded-sm px-2.5 py-1 text-xs cursor-pointer hover:opacity-90 transition-opacity";

function WelcomeScreen({ onOpenFolder, onNewFile }: { onOpenFolder: () => void; onNewFile: () => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-text-muted gap-8 select-none h-full bg-bg-app">
      <div className="text-center">
        <div className="text-4xl font-bold text-accent tracking-tight">Diablo</div>
        <div className="text-xs text-text-muted mt-1 opacity-80">Code Editor</div>
      </div>
      <div className="flex gap-3">
        <button onClick={onOpenFolder} className={`${btnClass} px-4 py-2 text-[13px]`}>Open Folder</button>
        <button onClick={onNewFile} className={`${btnClass} px-4 py-2 text-[13px] !bg-bg-sidebar !text-text-main hover:!bg-hover border border-border-subtle`}>New File</button>
      </div>
      <div className="grid grid-cols-[auto_auto] gap-x-6 gap-y-1.5 text-xs text-text-muted">
        {[
          ["Open Folder", "⌘O"], ["New File", "⌘N"], ["Save", "⌘S"], ["Close Tab", "⌘W"],
          ["Toggle Sidebar", "⌘B"], ["Find", "⌘F"], ["Zoom In / Out", "⌘= / ⌘-"], ["Word Wrap", "⌥Z"],
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

function NewFileModal({ onConfirm, onCancel }: { onConfirm: (name: string) => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);
  function submit() { const trimmed = name.trim(); if (trimmed) onConfirm(trimmed); }
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]" onClick={onCancel}>
      <div className="bg-bg-app border border-border-subtle rounded-md p-4 min-w-[320px] flex flex-col gap-2.5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="text-[13px] text-text-main">New File</div>
        <input ref={inputRef} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submit(); if (e.key === "Escape") onCancel(); }} placeholder="filename.ts" className="bg-bg-sidebar border border-border-subtle rounded-sm text-white text-[13px] px-2 py-1 outline-none focus:border-text-muted" />
        <div className="flex gap-2 justify-end mt-1">
          <button onClick={onCancel} className={`${btnClass} !bg-bg-sidebar hover:!bg-hover border border-border-subtle !text-text-main`}>Cancel</button>
          <button onClick={submit} className={btnClass}>Create</button>
        </div>
      </div>
    </div>
  );
}

function DirtyCloseModal({ fileName, onSaveAndClose, onDiscardAndClose, onCancel }: { fileName: string; onSaveAndClose: () => void; onDiscardAndClose: () => void; onCancel: () => void; }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]" onClick={onCancel}>
      <div className="bg-bg-app border border-border-subtle rounded-md p-5 min-w-[360px] flex flex-col gap-3.5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="text-[13px] text-text-main font-semibold">Unsaved Changes</div>
        <div className="text-xs text-text-muted">
          <strong className="text-text-main">{fileName}</strong> has unsaved changes. Save before closing?
        </div>
        <div className="flex gap-2 justify-end mt-1">
          <button onClick={onCancel} className={`${btnClass} !bg-bg-sidebar hover:!bg-hover border border-border-subtle !text-text-main`}>Cancel</button>
          <button onClick={onDiscardAndClose} className={`${btnClass} !bg-red-900/80 hover:!bg-red-800`}>Don't Save</button>
          <button onClick={onSaveAndClose} className={btnClass}>Save</button>
        </div>
      </div>
    </div>
  );
}

function AboutModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]" onClick={onClose}>
      <div className="bg-bg-app border border-border-subtle rounded-md p-7 min-w-[280px] flex flex-col gap-2.5 items-center shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="text-3xl font-bold text-accent">Diablo</div>
        <div className="text-xs text-text-muted">Version 0.1.0</div>
        <div className="text-[11px] text-text-muted text-center leading-relaxed">A fast, minimal code editor<br />built with Tauri + Monaco</div>
        <button onClick={onClose} className={`${btnClass} mt-2 px-4`}>Close</button>
      </div>
    </div>
  );
}

export default function App() {
  const { setWorkspaceRoot, addFile, closeFile, openFiles, markSaved, activeFile, workspaceRoot, updateSettings, settings } = useEditorStore();
  const [showNewFileModal, setShowNewFileModal] = useState(false);
  const [dirtyCloseTarget, setDirtyCloseTarget] = useState<string | null>(null);
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(240);
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>("explorer");
  const { refresh: refreshGit, status: gitStatus } = useGitStore();
  const [terminalVisible, setTerminalVisible] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const [cursorPos, setCursorPos] = useState<{ line: number; col: number } | null>(null);
  const [language, setLanguage] = useState<string | null>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;
      if (e.ctrlKey && !meta && e.key === "`") { e.preventDefault(); setTerminalVisible((v) => !v); return; }
      if (e.altKey && !meta && e.key === "z") { e.preventDefault(); useEditorStore.getState().updateSettings({ wordWrap: useEditorStore.getState().settings.wordWrap === "on" ? "off" : "on" }); return; }
      if (!meta) return;
      if (e.shiftKey && e.key === "F") { e.preventDefault(); setSidebarVisible(true); setSidebarMode("search"); return; }
      if (e.key === "s") { e.preventDefault(); handleSave(); }
      else if (e.key === "w") { e.preventDefault(); const path = useEditorStore.getState().activeFile; if (path) handleCloseRequest(path); }
      else if (e.key === "n") { e.preventDefault(); setShowNewFileModal(true); }
      else if (e.key === "b") { e.preventDefault(); setSidebarVisible((v) => !v); }
      else if (e.key === "=" || e.key === "+") { e.preventDefault(); const { fontSize } = useEditorStore.getState().settings; updateSettings({ fontSize: Math.min(fontSize + 1, 32) }); }
      else if (e.key === "-") { e.preventDefault(); const { fontSize } = useEditorStore.getState().settings; updateSettings({ fontSize: Math.max(fontSize - 1, 8) }); }
      else if (e.key === "0") { e.preventDefault(); updateSettings({ fontSize: 14 }); }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!dragRef.current) return;
      const delta = e.clientX - dragRef.current.startX;
      const next = Math.max(120, Math.min(500, dragRef.current.startWidth + delta));
      setSidebarWidth(next);
    }
    function onMouseUp() { dragRef.current = null; document.body.style.cursor = ""; document.body.style.userSelect = ""; }
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => { window.removeEventListener("mousemove", onMouseMove); window.removeEventListener("mouseup", onMouseUp); };
  }, []);

  function startDrag(e: React.MouseEvent) { dragRef.current = { startX: e.clientX, startWidth: sidebarWidth }; document.body.style.cursor = "col-resize"; document.body.style.userSelect = "none"; }

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

  function handleCloseRequest(path: string) { const file = useEditorStore.getState().openFiles.find((f) => f.path === path); if (file?.dirty) { setDirtyCloseTarget(path); } else { closeFile(path); } }

  async function handleSaveAndClose() { if (!dirtyCloseTarget) return; const path = dirtyCloseTarget; setDirtyCloseTarget(null); const file = useEditorStore.getState().openFiles.find((f) => f.path === path); if (file) { await invoke("fs_write", { path, content: file.content }); markSaved(path); } closeFile(path); }

  function handleDiscardAndClose() { if (!dirtyCloseTarget) return; const path = dirtyCloseTarget; setDirtyCloseTarget(null); closeFile(path); }

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
    if (typeof selected === "string") { setWorkspaceRoot(selected); await invoke("fs_watch", { path: selected }); refreshGit(selected); }
  }

  const dirtyCloseFile = dirtyCloseTarget ? openFiles.find((f) => f.path === dirtyCloseTarget) : null;

  const menus = [
    { label: "File", items: [ { label: "New File", action: () => setShowNewFileModal(true), shortcut: "⌘N" }, { label: "Open Folder...", action: handleOpenFolder, shortcut: "⌘O" }, { label: "Save", action: handleSave, shortcut: "⌘S" }, { label: "Close File", action: () => { const p = useEditorStore.getState().activeFile; if (p) handleCloseRequest(p); }, shortcut: "⌘W" }, ] },
    { label: "Edit", items: [ { label: "Undo", action: () => window.dispatchEvent(new CustomEvent("editor-cmd", { detail: "undo" })), shortcut: "⌘Z" }, { label: "Redo", action: () => window.dispatchEvent(new CustomEvent("editor-cmd", { detail: "redo" })), shortcut: "⌘⇧Z" }, { label: "Find", action: () => window.dispatchEvent(new CustomEvent("editor-cmd", { detail: "actions.find" })), shortcut: "⌘F" }, { label: "Replace", action: () => window.dispatchEvent(new CustomEvent("editor-cmd", { detail: "editor.action.startFindReplaceAction" })), shortcut: "⌘H" }, { label: "Find in Files", action: () => { setSidebarVisible(true); setSidebarMode("search"); }, shortcut: "⌘⇧F" }, ] },
    { label: "View", items: [ { label: "Toggle Sidebar", action: () => setSidebarVisible((v) => !v), shortcut: "⌘B", checked: sidebarVisible }, { label: "Toggle Word Wrap", action: () => updateSettings({ wordWrap: settings.wordWrap === "on" ? "off" : "on" }), shortcut: "⌥Z", checked: settings.wordWrap === "on" }, { label: "Toggle Minimap", action: () => updateSettings({ minimap: !settings.minimap }), checked: settings.minimap }, { label: "Zoom In", action: () => updateSettings({ fontSize: Math.min(settings.fontSize + 1, 32) }), shortcut: "⌘=" }, { label: "Zoom Out", action: () => updateSettings({ fontSize: Math.max(settings.fontSize - 1, 8) }), shortcut: "⌘-" }, { label: "Reset Zoom", action: () => updateSettings({ fontSize: 14 }), shortcut: "⌘0" }, ] },
    { label: "Window", items: [ { label: "Minimize", action: () => getCurrentWindow().minimize(), shortcut: "⌘M" }, { label: "Close Window", action: () => getCurrentWindow().close(), shortcut: "⌘⇧W" }, ] },
    { label: "Terminal", items: [ { label: "New Terminal", action: () => setTerminalVisible((v) => !v), shortcut: "⌃`", checked: terminalVisible }, ] },
    { label: "Help", items: [{ label: "About Diablo", action: () => setShowAbout(true) }], },
  ];

  return (
    <div className="flex flex-col h-full w-full bg-bg-app overflow-hidden">
      {showNewFileModal && <NewFileModal onConfirm={confirmNewFile} onCancel={() => setShowNewFileModal(false)} />}
      {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}
      {dirtyCloseFile && <DirtyCloseModal fileName={dirtyCloseFile.path.split("/").pop() ?? dirtyCloseFile.path} onSaveAndClose={handleSaveAndClose} onDiscardAndClose={handleDiscardAndClose} onCancel={() => setDirtyCloseTarget(null)} />}
      
      <MenuBar
        menus={menus}
        activeFileName={activeFile ? activeFile.split("/").pop() ?? null : null}
        panels={{
          sidebarVisible,
          terminalVisible,
          minimapVisible: settings.minimap,
          onToggleSidebar: () => setSidebarVisible((v) => !v),
          onToggleTerminal: () => setTerminalVisible((v) => !v),
          onToggleMinimap: () => updateSettings({ minimap: !settings.minimap }),
        }}
      />

      <div className="flex flex-1 overflow-hidden">
        
        {sidebarVisible && (
          <>
            <div style={{ width: sidebarWidth }} className="bg-bg-sidebar border-r border-border-subtle flex flex-col shrink-0 overflow-hidden">
              <div className="px-3 text-[11px] text-text-muted uppercase tracking-wider font-semibold border-b border-border-subtle select-none flex-shrink-0 flex h-9 items-center gap-1">
                {(["explorer", "search", "git"] as SidebarMode[]).map((mode) => (
                  <span
                    key={mode}
                    onClick={() => {
                      setSidebarMode(mode);
                      if (mode === "git" && workspaceRoot) refreshGit(workspaceRoot);
                    }}
                    className={`cursor-pointer px-2 h-full flex items-center gap-1 border-b-2 transition-colors ${
                      sidebarMode === mode
                        ? "border-accent text-text-main"
                        : "border-transparent hover:text-text-main"
                    }`}
                  >
                    {mode === "explorer" ? "Explorer" : mode === "search" ? "Search" : (
                      <>
                        Git
                        {gitStatus?.files.length ? (
                          <span className="bg-primary text-white text-[9px] px-1 rounded-sm leading-none py-0.5 ml-0.5">{gitStatus.files.length}</span>
                        ) : null}
                      </>
                    )}
                  </span>
                ))}
              </div>
              <div className="flex-1 overflow-hidden relative">
                {sidebarMode === "explorer" ? <FileExplorer /> : sidebarMode === "search" ? <SearchPanel autoFocus /> : <GitPanel />}
              </div>
            </div>
            <div onMouseDown={startDrag} className="w-1 cursor-col-resize bg-transparent hover:bg-primary shrink-0 z-10 transition-colors" />
          </>
        )}

        <div className="flex flex-col flex-1 overflow-hidden">
          <TabBar onCloseRequest={handleCloseRequest} />
          <Breadcrumb path={activeFile} root={workspaceRoot} />
          <div className="flex-1 overflow-hidden bg-bg-app">
            {activeFile ? <MonacoEditor onCursorChange={setCursorPos} onLanguageChange={setLanguage} /> : <WelcomeScreen onOpenFolder={handleOpenFolder} onNewFile={() => setShowNewFileModal(true)} />}
          </div>
          {terminalVisible && (
            <div className="h-[240px] shrink-0 border-t border-border-subtle bg-bg-app">
              <TerminalPane onClose={() => setTerminalVisible(false)} />
            </div>
          )}
        </div>
      </div>
      <StatusBar cursorPos={cursorPos} language={language} />
    </div>
  );
}
