import { useState } from "react";
import { Terminal } from "./Terminal";

interface Tab {
  id: number;
  label: string;
}

let counter = 1;
function nextId() { return counter++; }

export function TerminalPane({ onClose }: { onClose: () => void }) {
  const [tabs, setTabs] = useState<Tab[]>(() => [{ id: nextId(), label: "zsh" }]);
  const [activeId, setActiveId] = useState<number>(tabs[0].id);

  function addTab() {
    const id = nextId();
    setTabs((t) => [...t, { id, label: "zsh" }]);
    setActiveId(id);
  }

  function closeTab(id: number) {
    const remaining = tabs.filter((t) => t.id !== id);
    if (remaining.length === 0) { onClose(); return; }
    setTabs(remaining);
    if (activeId === id) setActiveId(remaining[remaining.length - 1].id);
  }

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "#1e1e1e", borderTop: "1px solid #333" }}>
      {/* Tab bar */}
      <div style={{ display: "flex", alignItems: "center", background: "#252526", borderBottom: "1px solid #333", flexShrink: 0, height: 28 }}>
        {tabs.map((tab) => {
          const isActive = tab.id === activeId;
          return (
            <div
              key={tab.id}
              onClick={() => setActiveId(tab.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                height: "100%",
                padding: "0 10px",
                cursor: "pointer",
                background: isActive ? "#1e1e1e" : "transparent",
                borderRight: "1px solid #333",
                color: isActive ? "#ccc" : "#666",
                fontSize: 11,
                flexShrink: 0,
              }}
            >
              <span>{tab.label}</span>
              <span
                onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                style={{ fontSize: 10, color: "#555", lineHeight: 1, padding: "1px 2px" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "#ccc")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "#555")}
              >
                ✕
              </span>
            </div>
          );
        })}
        <span
          onClick={addTab}
          title="New Terminal"
          style={{ padding: "0 10px", fontSize: 16, color: "#666", cursor: "pointer", lineHeight: "28px", userSelect: "none" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#ccc")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "#666")}
        >
          +
        </span>
        <div style={{ flex: 1 }} />
        <span
          onClick={onClose}
          title="Close Terminal"
          style={{ padding: "0 10px", fontSize: 11, color: "#666", cursor: "pointer", lineHeight: "28px" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#ccc")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "#666")}
        >
          ✕
        </span>
      </div>

      {/* Terminal instances — keep all mounted, show only active */}
      <div style={{ flex: 1, position: "relative" }}>
        {tabs.map((tab) => (
          <div
            key={tab.id}
            style={{
              position: "absolute",
              inset: 0,
              display: tab.id === activeId ? "block" : "none",
            }}
          >
            <Terminal />
          </div>
        ))}
      </div>
    </div>
  );
}
