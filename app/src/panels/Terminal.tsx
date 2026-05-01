import { useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEditorStore } from "../store/editor";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

const THEME = {
  background: "#1e1e1e",
  foreground: "#cccccc",
  cursor: "#aeafad",
  cursorAccent: "#000000",
  selectionBackground: "#264f78",
  black: "#1e1e1e",
  red: "#cd3131",
  green: "#0dbc79",
  yellow: "#e5e510",
  blue: "#2472c8",
  magenta: "#bc3fbc",
  cyan: "#11a8cd",
  white: "#e5e5e5",
  brightBlack: "#666666",
  brightRed: "#f14c4c",
  brightGreen: "#23d18b",
  brightYellow: "#f5f543",
  brightBlue: "#3b8eea",
  brightMagenta: "#d670d6",
  brightCyan: "#29b8db",
  brightWhite: "#e5e5e5",
};

// Pure xterm container — no header. TerminalPane owns the chrome.
export function Terminal() {
  const workspaceRoot = useEditorStore((s) => s.workspaceRoot);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const xterm = new XTerm({
      theme: THEME,
      fontFamily: '"Cascadia Code", "Fira Code", "JetBrains Mono", monospace',
      fontSize: 13,
      lineHeight: 1.2,
      cursorBlink: true,
    });

    const fitAddon = new FitAddon();
    xterm.loadAddon(fitAddon);
    xterm.open(containerRef.current);
    fitAddon.fit();

    let ptyId: number | null = null;
    const cleanups: Array<() => void> = [];

    async function init() {
      ptyId = await invoke<number>("pty_spawn", { cwd: workspaceRoot ?? undefined });
      const id = ptyId;

      const unlistenOutput = await listen<string>(`pty_output_${id}`, (e) =>
        xterm.write(e.payload)
      );
      const unlistenClosed = await listen<null>(`pty_closed_${id}`, () =>
        xterm.write("\r\n\x1b[2m[process exited]\x1b[0m\r\n")
      );
      cleanups.push(unlistenOutput, unlistenClosed);

      xterm.onData((data) => invoke("pty_write", { id, data }));
      xterm.onResize(({ rows, cols }) => invoke("pty_resize", { id, rows, cols }));
    }

    init().catch(console.error);

    const observer = new ResizeObserver(() => fitAddon.fit());
    observer.observe(containerRef.current);

    return () => {
      cleanups.forEach((f) => f());
      observer.disconnect();
      if (ptyId !== null) invoke("pty_kill", { id: ptyId }).catch(() => {});
      xterm.dispose();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "100%", overflow: "hidden", padding: "4px 8px", boxSizing: "border-box" }}
    />
  );
}
