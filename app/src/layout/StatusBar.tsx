import { useState, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";

export function StatusBar({
  cursorPos,
  language,
}: {
  cursorPos: { line: number; col: number } | null;
  language: string | null;
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
    <div className="h-6 bg-bg-app border-t border-border-subtle flex items-center justify-between px-3 text-[11px] text-text-muted shrink-0 select-none">
      <div className="flex items-center gap-4">
        {lspProgress && (
          <span className="flex items-center gap-2 text-accent">
            <span className="animate-spin">●</span> {lspProgress}
          </span>
        )}
      </div>
      <div className="flex items-center gap-4">
        {cursorPos && (
          <span className="hover:text-text-main cursor-pointer transition-colors">
            Ln {cursorPos.line}, Col {cursorPos.col}
          </span>
        )}
        <span className="hover:text-text-main cursor-pointer transition-colors">UTF-8</span>
        {language && <span className="hover:text-text-main cursor-pointer uppercase transition-colors">{language}</span>}
      </div>
    </div>
  );
}
