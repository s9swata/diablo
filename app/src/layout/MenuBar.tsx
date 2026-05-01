import { useState, useRef, useEffect } from "react";

interface MenuItem {
  label: string;
  action?: () => void;
  shortcut?: string;
  checked?: boolean;
  separator?: boolean;
}

interface Menu {
  label: string;
  items: MenuItem[];
}

interface PanelState {
  sidebarVisible: boolean;
  terminalVisible: boolean;
  minimapVisible: boolean;
  onToggleSidebar: () => void;
  onToggleTerminal: () => void;
  onToggleMinimap: () => void;
}

interface MenuBarProps {
  menus: Menu[];
  activeFileName?: string | null;
  panels: PanelState;
}

// SVG icon components
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

export function MenuBar({ menus, activeFileName, panels }: MenuBarProps) {
  const [openMenu, setOpenMenu] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div
      ref={containerRef}
      data-tauri-drag-region
      className="relative flex items-center h-9 bg-bg-app border-b border-border-subtle shrink-0 select-none"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      {/* ── Left: traffic lights safe zone + menus ── */}
      <div className="flex items-center h-full z-10" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
        {/* Traffic light spacer */}
        <div className="w-[80px] h-full shrink-0" style={{ WebkitAppRegion: "drag" } as React.CSSProperties} />

        {/* Menu items */}
        {menus.map((menu, i) => {
          const isOpen = openMenu === i;
          return (
            <div key={menu.label} className="relative h-full">
              <button
                className={`px-2.5 h-full flex items-center text-[13px] font-medium rounded-sm transition-colors cursor-default ${
                  isOpen
                    ? "bg-hover text-text-main"
                    : "text-text-main hover:bg-hover"
                }`}
                onClick={(e) => { e.stopPropagation(); setOpenMenu(isOpen ? null : i); }}
                onMouseEnter={() => { if (openMenu !== null) setOpenMenu(i); }}
              >
                {menu.label}
              </button>

              {isOpen && (
                <div className="absolute top-full left-0 mt-0.5 min-w-[220px] bg-bg-sidebar border border-border-subtle rounded-md shadow-2xl py-1 z-50">
                  {menu.items.map((item, j) =>
                    item.separator ? (
                      <div key={j} className="my-1 mx-2 border-t border-border-subtle" />
                    ) : (
                      <button
                        key={j}
                        onClick={() => { item.action?.(); setOpenMenu(null); }}
                        className="w-full px-4 py-1.5 flex items-center justify-between text-[13px] text-text-main cursor-default hover:bg-hover hover:text-white text-left"
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-4 flex justify-center text-accent text-xs">
                            {item.checked && "✓"}
                          </span>
                          {item.label}
                        </div>
                        {item.shortcut && (
                          <span className="text-text-muted text-[11px] tracking-wider ml-8">{item.shortcut}</span>
                        )}
                      </button>
                    )
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Center: Diablo — filename (absolutely centered) ── */}
      <div
        className="absolute inset-0 flex items-center justify-center pointer-events-none"
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      >
        <span className="text-[13px] font-medium text-text-muted tracking-tight">
          <span className="text-text-main font-semibold">Diablo</span>
          {activeFileName && (
            <>
              <span className="mx-1.5 opacity-40">—</span>
              <span className="opacity-70">{activeFileName}</span>
            </>
          )}
        </span>
      </div>

      {/* ── Right: panel toggles ── */}
      <div
        className="flex items-center gap-0.5 px-2 ml-auto z-10"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <PanelBtn
          title="Toggle Sidebar (⌘B)"
          active={panels.sidebarVisible}
          onClick={panels.onToggleSidebar}
        >
          <IconSidebar active={panels.sidebarVisible} />
        </PanelBtn>
        <PanelBtn
          title="Toggle Minimap"
          active={panels.minimapVisible}
          onClick={panels.onToggleMinimap}
        >
          <IconMinimap active={panels.minimapVisible} />
        </PanelBtn>
        <PanelBtn
          title="Toggle Terminal (⌃`)"
          active={panels.terminalVisible}
          onClick={panels.onToggleTerminal}
        >
          <IconTerminal active={panels.terminalVisible} />
        </PanelBtn>
      </div>
    </div>
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
      className={`w-7 h-7 flex items-center justify-center rounded-sm transition-colors cursor-default ${
        active
          ? "text-accent bg-hover"
          : "text-text-muted hover:bg-hover hover:text-text-main"
      }`}
    >
      {children}
    </button>
  );
}
