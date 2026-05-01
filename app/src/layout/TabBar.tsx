import { useEffect, useRef } from "react";
import { useEditorStore } from "../store/editor";
import { MagnifyingGlass } from "@phosphor-icons/react";
import {
  TypeScript, Reactts, Js, Reactjs, Rust, Python, Go, Markdown, Yaml, Shell,
  SVG as SvgIcon, XML, Lua, Ruby, Swift, Kotlin, Java, PHP, Csharp, Dart, Scala,
  CLang, Cplus, H, Nim, Zig, Julia, Haskell, Elixir, Erlang, Clojure, Fsharp,
  Document, Text, CodeBlue, CodeOrange,
} from "@react-symbols/icons";

function TabIcon({ name }: { name: string }) {
  const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  const p = { width: 14, height: 14, style: { flexShrink: 0 } as React.CSSProperties };
  switch (ext) {
    case "ts":                    return <TypeScript {...p} />;
    case "tsx":                   return <Reactts {...p} />;
    case "js":   case "mjs":      return <Js {...p} />;
    case "jsx":                   return <Reactjs {...p} />;
    case "rs":                    return <Rust {...p} />;
    case "py":                    return <Python {...p} />;
    case "go":                    return <Go {...p} />;
    case "md":   case "mdx":      return <Markdown {...p} />;
    case "yaml": case "yml":      return <Yaml {...p} />;
    case "sh":   case "bash": case "zsh": return <Shell {...p} />;
    case "svg":                   return <SvgIcon {...p} />;
    case "xml":                   return <XML {...p} />;
    case "lua":                   return <Lua {...p} />;
    case "rb":                    return <Ruby {...p} />;
    case "swift":                 return <Swift {...p} />;
    case "kt":                    return <Kotlin {...p} />;
    case "java":                  return <Java {...p} />;
    case "php":                   return <PHP {...p} />;
    case "cs":                    return <Csharp {...p} />;
    case "dart":                  return <Dart {...p} />;
    case "scala":                 return <Scala {...p} />;
    case "c":                     return <CLang {...p} />;
    case "cpp":  case "cc":       return <Cplus {...p} />;
    case "h":    case "hpp":      return <H {...p} />;
    case "nim":                   return <Nim {...p} />;
    case "zig":                   return <Zig {...p} />;
    case "jl":                    return <Julia {...p} />;
    case "hs":                    return <Haskell {...p} />;
    case "ex":   case "exs":      return <Elixir {...p} />;
    case "erl":                   return <Erlang {...p} />;
    case "clj":                   return <Clojure {...p} />;
    case "fs":   case "fsx":      return <Fsharp {...p} />;
    case "css":  case "scss": case "less": return <CodeBlue {...p} />;
    case "html": case "htm":      return <CodeOrange {...p} />;
    case "txt":                   return <Text {...p} />;
    default:                      return <Document {...p} />;
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
