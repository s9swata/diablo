/**
 * TitleBar — macOS-style window chrome.
 *
 * Layout: [80px traffic-light zone | drag region | centered title | panel toggles]
 *
 * The actual File/Edit/View/… menus live in the native macOS system menu bar
 * (built in Rust via tauri::menu). This component only renders the window title
 * and the three panel-toggle buttons on the right.
 */

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

// ── Icon components ────────────────────────────────────────────────────────

function IconSidebar({ active }: { active: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <rect x="1" y="1" width="13" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
      <line x1="5" y1="1.6" x2="5" y2="13.4" stroke="currentColor" strokeWidth="1.2" opacity={active ? 1 : 0.5} />
    </svg>
  );
}

function IconTerminal({ active }: { active: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" opacity={active ? 1 : 0.6}>
      <rect x="1" y="1" width="13" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
      <polyline points="3.5,5 6.5,7.5 3.5,10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="7.5" y1="10" x2="11.5" y2="10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function IconMinimap({ active }: { active: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" opacity={active ? 1 : 0.6}>
      <rect x="1" y="1" width="9" height="13" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <rect x="11" y="1" width="3" height="13" rx="0.8" stroke="currentColor" strokeWidth="1.1" />
      <line x1="3" y1="4" x2="8" y2="4" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.6" />
      <line x1="3" y1="6.5" x2="7" y2="6.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.6" />
      <line x1="3" y1="9" x2="8" y2="9" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.6" />
    </svg>
  );
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
      className={`w-7 h-7 flex items-center justify-center rounded-sm transition-colors cursor-default ${active
        ? "text-accent bg-hover"
        : "text-text-muted hover:bg-hover hover:text-text-main"
        }`}
    >
      {children}
    </button>
  );
}

// ── MenuBar (now just a TitleBar) ─────────────────────────────────────────
// Kept as "MenuBar" export so App.tsx import stays the same.

export function MenuBar({ activeFileName, panels }: TitleBarProps) {
  return (
    <div
      data-tauri-drag-region
      className="relative flex items-center h-9 bg-bg-app border-b border-border-subtle shrink-0 select-none"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      {/* Traffic-light safe zone — must be draggable and empty */}
      <div
        className="w-[80px] h-full shrink-0"
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      />

      {/* Flex spacer so panel buttons get pushed to the right */}
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

      {/* Right: panel toggles */}
      <div
        className="flex items-center gap-0.5 px-2 ml-auto z-10"
        style={{ WebkitAppRegion: "no-drag", padding: "0 4px" } as React.CSSProperties}
      >
        <PanelBtn title="Toggle Sidebar (⌘B)" active={panels.sidebarVisible} onClick={panels.onToggleSidebar}>
          <IconSidebar active={panels.sidebarVisible} />
        </PanelBtn>
        <PanelBtn title="Toggle Minimap" active={panels.minimapVisible} onClick={panels.onToggleMinimap}>
          <IconMinimap active={panels.minimapVisible} />
        </PanelBtn>
        <PanelBtn title="Toggle Terminal (⌃`)" active={panels.terminalVisible} onClick={panels.onToggleTerminal}>
          <IconTerminal active={panels.terminalVisible} />
        </PanelBtn>
      </div>
    </div>
  );
}
