import { useEffect, useRef } from "react";
import { useEditorStore } from "../store/editor";

export function TabBar({ onCloseRequest }: { onCloseRequest: (path: string) => void }) {
  const { openFiles, activeFile, setActiveFile, settings, updateSettings } = useEditorStore();
  const tabsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!tabsRef.current || !activeFile) return;
    const el = tabsRef.current.querySelector(`[data-path="${CSS.escape(activeFile)}"]`);
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeFile]);

  return (
    <div data-tauri-drag-region className="flex items-center h-9 bg-bg-app border-b border-border-subtle shrink-0">
      <div
        ref={tabsRef}
        className="flex items-center flex-1 h-full overflow-x-auto overflow-y-hidden select-none"
        style={{ scrollbarWidth: "none" }}
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
              className={`group flex items-center gap-2 h-full px-3.5 cursor-pointer border-r border-border-subtle text-xs whitespace-nowrap shrink-0 transition-colors ${
                isActive ? "bg-bg-sidebar text-text-main border-t border-t-primary" : "bg-transparent text-text-muted hover:bg-hover border-t border-t-transparent"
              }`}
            >
              <span title={f.path}>
                {name}
                {f.dirty ? " ●" : ""}
              </span>
              <span
                onClick={(e) => { e.stopPropagation(); onCloseRequest(f.path); }}
                className={`text-[10px] leading-none p-1.5 rounded-sm ${isActive ? "text-text-muted hover:bg-hover hover:text-text-main" : "text-transparent hover:text-text-main hover:bg-hover group-hover:text-text-muted"}`}
                title="Close"
              >
                ✕
              </span>
            </div>
          );
        })}
      </div>
      <div className="flex gap-3 px-3 items-center shrink-0">
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
