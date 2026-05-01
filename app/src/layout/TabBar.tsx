import { useEffect, useRef } from "react";
import { useEditorStore } from "../store/editor";
import {
  FileTs, FileTsx, FileJs, FileJsx, FileCss, FileHtml, FileMd, FileRs, FilePy, File,
  MagnifyingGlass,
} from "@phosphor-icons/react";

function TabIcon({ name }: { name: string }) {
  const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  const size = 13;
  const style: React.CSSProperties = { flexShrink: 0 };
  switch (ext) {
    case "ts":   return <FileTs   size={size} color="#3178c6" style={style} />;
    case "tsx":  return <FileTsx  size={size} color="#3178c6" style={style} />;
    case "js":   return <FileJs   size={size} color="#f7df1e" style={style} />;
    case "jsx":  return <FileJsx  size={size} color="#f7df1e" style={style} />;
    case "css":  return <FileCss  size={size} color="#42a5f5" style={style} />;
    case "html": return <FileHtml size={size} color="#e34c26" style={style} />;
    case "md":   return <FileMd   size={size} color="#83a598" style={style} />;
    case "rs":   return <FileRs   size={size} color="#ce412b" style={style} />;
    case "py":   return <FilePy   size={size} color="#3572a5" style={style} />;
    default:     return <File     size={size} color="#8b8b8b" style={style} />;
  }
}

interface TabBarProps {
  onCloseRequest: (path: string) => void;
  searchTabOpen?: boolean;
  searchActive?: boolean;
  onSearchTabActivate?: () => void;
  onSearchTabClose?: () => void;
  /** Called when a file tab is clicked — used to deactivate search view */
  onFileTabClick?: () => void;
}

export function TabBar({ onCloseRequest, searchTabOpen, searchActive, onSearchTabActivate, onSearchTabClose, onFileTabClick }: TabBarProps) {
  const { openFiles, activeFile, setActiveFile, settings, updateSettings } = useEditorStore();
  const tabsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!tabsRef.current || !activeFile || searchActive) return;
    const el = tabsRef.current.querySelector(`[data-path="${CSS.escape(activeFile)}"]`);
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeFile, searchActive]);

  // Shared tab styles
  const activeTabStyle = "bg-bg-sidebar text-text-main border-t border-t-primary";
  const inactiveTabStyle = "bg-transparent text-text-muted hover:bg-hover border-t border-t-transparent";

  return (
    <div data-tauri-drag-region className="flex items-center h-9 bg-bg-app border-b border-border-subtle shrink-0">
      <div
        ref={tabsRef}
        className="flex items-center flex-1 h-full overflow-x-auto overflow-y-hidden select-none"
        style={{ scrollbarWidth: "none" }}
      >
        {/* Search virtual tab — shown when searchTabOpen, highlighted when searchActive */}
        {searchTabOpen && (
          <div
            onClick={onSearchTabActivate}
            style={{ padding: "0 10px", gap: 8 }}
            className={`group flex items-center h-full cursor-pointer border-r border-border-subtle whitespace-nowrap shrink-0 ${
              searchActive ? activeTabStyle : inactiveTabStyle
            }`}
          >
            <MagnifyingGlass size={13} style={{ flexShrink: 0 }} />
            <span style={{ fontSize: 13 }}>Search</span>
            <span
              onClick={(e) => { e.stopPropagation(); onSearchTabClose?.(); }}
              style={{ padding: 6, borderRadius: 3, fontSize: 10, lineHeight: 1 }}
              className={searchActive
                ? "text-text-muted hover:bg-hover hover:text-text-main"
                : "text-transparent hover:text-text-main hover:bg-hover group-hover:text-text-muted"
              }
              title="Close"
            >
              ✕
            </span>
          </div>
        )}

        {/* File tabs */}
        {openFiles.map((f) => {
          const name = f.path.split("/").pop() ?? f.path;
          // When search is active, no file tab is highlighted as active
          const isActive = !searchActive && f.path === activeFile;
          return (
            <div
              key={f.path}
              data-path={f.path}
              onClick={() => { onFileTabClick?.(); setActiveFile(f.path); }}
              onAuxClick={(e) => { if (e.button === 1) onCloseRequest(f.path); }}
              style={{ padding: "0 6px", gap: 4 }}
              className={`group flex items-center h-full cursor-pointer border-r border-border-subtle whitespace-nowrap shrink-0 transition-colors ${
                isActive ? activeTabStyle : inactiveTabStyle
              }`}
            >
              <TabIcon name={name} />
              <span style={{ fontSize: 13 }} title={f.path}>
                {name}
                {f.dirty ? " ●" : ""}
              </span>
              <span
                onClick={(e) => { e.stopPropagation(); onCloseRequest(f.path); }}
                style={{ padding: 6, borderRadius: 3, fontSize: 10, lineHeight: 1 }}
                className={`${isActive
                  ? "text-text-muted hover:bg-hover hover:text-text-main"
                  : "text-transparent hover:text-text-main hover:bg-hover group-hover:text-text-muted"
                }`}
                title="Close"
              >
                ✕
              </span>
            </div>
          );
        })}
      </div>
      <div style={{ gap: 12, padding: "0 12px" }} className="flex items-center shrink-0">
        <select
          value={settings.theme}
          onChange={(e) => updateSettings({ theme: e.target.value as "vs-dark" | "light" })}
          className="bg-bg-sidebar text-text-muted border border-border-subtle rounded-sm px-1.5 py-0.5 text-[11px] cursor-pointer outline-none focus:border-text-muted"
        >
          <option value="vs-dark">Dark</option>
          <option value="light">Light</option>
        </select>
        <select
          value={settings.fontSize}
          onChange={(e) => updateSettings({ fontSize: Number(e.target.value) })}
          className="bg-bg-sidebar text-text-muted border border-border-subtle rounded-sm px-1.5 py-0.5 text-[11px] cursor-pointer outline-none focus:border-text-muted"
        >
          {[11, 12, 13, 14, 15, 16, 18].map((s) => (
            <option key={s} value={s}>{s}px</option>
          ))}
        </select>
        <select
          value={settings.tabSize}
          onChange={(e) => updateSettings({ tabSize: Number(e.target.value) })}
          className="bg-bg-sidebar text-text-muted border border-border-subtle rounded-sm px-1.5 py-0.5 text-[11px] cursor-pointer outline-none focus:border-text-muted"
        >
          {[2, 4].map((s) => (
            <option key={s} value={s}>{s} spaces</option>
          ))}
        </select>
      </div>
    </div>
  );
}
