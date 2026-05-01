import { useState, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { Files, MagnifyingGlass, GitBranch } from "@phosphor-icons/react";

function NavBtn({
  active,
  title,
  onClick,
  children,
}: {
  active: boolean;
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 26,
        height: 26,
        borderRadius: 3,
        border: "none",
        cursor: "pointer",
        backgroundColor: active ? "var(--color-hover)" : "transparent",
        color: active ? "var(--color-text-main)" : "var(--color-text-muted)",
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  );
}

export function StatusBar({
  cursorPos,
  language,
  sidebarVisible,
  searchOpen,
  gitOpen,
  gitCount,
  onToggleExplorer,
  onToggleSearch,
  onToggleGit,
}: {
  cursorPos: { line: number; col: number } | null;
  language: string | null;
  sidebarVisible: boolean;
  searchOpen: boolean;
  gitOpen: boolean;
  gitCount: number;
  onToggleExplorer: () => void;
  onToggleSearch: () => void;
  onToggleGit: () => void;
}) {
  const [lspProgress, setLspProgress] = useState<string | null>(null);

  useEffect(() => {
    const unlisten = listen<{
      message: string;
      total?: number;
      downloaded?: number;
    }>("lsp-install-progress", (event) => {
      const { message, total, downloaded } = event.payload;
      if (total && downloaded) {
        const percent = Math.round((downloaded / total) * 100);
        setLspProgress(`${message} ${percent}%`);
      } else {
        setLspProgress(message);
      }
      if (message.toLowerCase().includes("done") || message.toLowerCase().includes("failed")) {
        setTimeout(() => setLspProgress(null), 3000);
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  return (
    <div className="border-t border-border-subtle flex items-center justify-between text-[11px] text-text-muted shrink-0 select-none" style={{ height: 32, background: "var(--color-bg-app)", paddingLeft: 6, paddingRight: 6 }}>
      {/* Left: nav buttons + lsp progress */}
      <div className="flex items-center" style={{ gap: 2 }}>
        <NavBtn active={sidebarVisible && !searchOpen} title="Explorer (⌘B)" onClick={onToggleExplorer}>
          <Files size={15} />
        </NavBtn>
        <NavBtn active={searchOpen} title="Search (⌘⇧F)" onClick={onToggleSearch}>
          <MagnifyingGlass size={15} />
        </NavBtn>
        <NavBtn active={gitOpen} title="Git (⌘⇧G)" onClick={onToggleGit}>
          <div style={{ position: "relative", display: "flex" }}>
            <GitBranch size={15} />
            {gitCount > 0 && (
              <span
                style={{
                  position: "absolute",
                  top: -4,
                  right: -5,
                  background: "var(--color-primary)",
                  color: "#fff",
                  fontSize: 8,
                  lineHeight: 1,
                  padding: "1px 3px",
                  borderRadius: 3,
                  fontWeight: 600,
                }}
              >
                {gitCount > 99 ? "99+" : gitCount}
              </span>
            )}
          </div>
        </NavBtn>

        {lspProgress && (
          <span className="flex items-center gap-2 text-accent" style={{ marginLeft: 8 }}>
            <span className="animate-spin">●</span> {lspProgress}
          </span>
        )}
      </div>

      {/* Right: cursor position, encoding, language */}
      <div className="flex items-center gap-4 whitespace-nowrap">
        {cursorPos && (
          <span className="hover:text-text-main cursor-pointer transition-colors">
            Ln {cursorPos.line}, Col {cursorPos.col}
          </span>
        )}
        <span className="hover:text-text-main cursor-pointer transition-colors">UTF-8</span>
        {language && <span className="hover:text-text-main cursor-pointer uppercase transition-colors">{language}</span>}
        {/* Spacer to clear macOS native resize handle (bottom-right corner) */}
      </div>
    </div>
  );
}
