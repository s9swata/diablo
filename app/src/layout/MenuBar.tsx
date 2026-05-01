import { SidebarSimple, TerminalWindow, Rows } from "@phosphor-icons/react";

interface PanelState {
  sidebarVisible: boolean;
  terminalVisible: boolean;
  minimapVisible: boolean;
  onToggleSidebar: () => void;
  onToggleTerminal: () => void;
  onToggleMinimap: () => void;
}

interface TitleBarProps {
  activeFileName?: string | null;
  panels: PanelState;
}

function PanelBtn({
  children,
  title,
  active,
  onClick,
}: {
  children: React.ReactNode;
  title: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      style={{ WebkitAppRegion: "no-drag", width: 28, height: 28 } as React.CSSProperties}
      className={`flex items-center justify-center rounded-sm transition-colors cursor-default ${
        active
          ? "text-accent bg-hover"
          : "text-text-muted hover:bg-hover hover:text-text-main"
      }`}
    >
      {children}
    </button>
  );
}

// Kept as "MenuBar" export so App.tsx import stays the same.
export function MenuBar({ activeFileName, panels }: TitleBarProps) {
  return (
    <div
      data-tauri-drag-region
      className="relative flex items-center bg-bg-app border-b border-border-subtle shrink-0 select-none"
      style={{ height: 36, WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      {/* Traffic-light safe zone */}
      <div
        className="shrink-0 h-full"
        style={{ width: 80, WebkitAppRegion: "drag" } as React.CSSProperties}
      />

      {/* Drag spacer */}
      <div className="flex-1" style={{ WebkitAppRegion: "drag" } as React.CSSProperties} />

      {/* Centered title */}
      <div
        className="absolute inset-0 flex items-center justify-center pointer-events-none"
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      >
        <span className="text-[13px] tracking-tight">
          <span className="font-semibold text-text-main">Diablo</span>
          {activeFileName && (
            <>
              <span className="text-text-muted opacity-50" style={{ padding: "0 4px" }}>—</span>
              <span className="text-text-muted opacity-80">{activeFileName}</span>
            </>
          )}
        </span>
      </div>

      {/* Right: panel toggles — fill weight when active, regular when inactive */}
      <div
        className="flex items-center z-10"
        style={{ gap: 2, padding: "0 6px", WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <PanelBtn title="Toggle Sidebar (⌘B)" active={panels.sidebarVisible} onClick={panels.onToggleSidebar}>
          <SidebarSimple size={15} weight={panels.sidebarVisible ? "fill" : "regular"} />
        </PanelBtn>
        <PanelBtn title="Toggle Minimap" active={panels.minimapVisible} onClick={panels.onToggleMinimap}>
          <Rows size={15} weight={panels.minimapVisible ? "fill" : "regular"} />
        </PanelBtn>
        <PanelBtn title="Toggle Terminal (⌃`)" active={panels.terminalVisible} onClick={panels.onToggleTerminal}>
          <TerminalWindow size={15} weight={panels.terminalVisible ? "fill" : "regular"} />
        </PanelBtn>
      </div>
    </div>
  );
}
