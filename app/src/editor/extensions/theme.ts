import { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { tokyoNight } from "@uiw/codemirror-theme-tokyo-night";

const lightTheme = EditorView.theme({
  "&": {
    backgroundColor: "var(--color-bg-editor, #ffffff)",
    color: "var(--color-text-main, #1e1e1e)",
  },
  ".cm-content": { caretColor: "#000" },
  ".cm-cursor": { borderLeftColor: "#000" },
  ".cm-gutters": {
    backgroundColor: "var(--color-bg-sidebar, #f5f5f5)",
    color: "var(--color-text-muted, #999)",
    borderRight: "1px solid var(--color-border-subtle, #e0e0e0)",
  },
  ".cm-activeLineGutter": { backgroundColor: "rgba(0,0,0,0.04)" },
  ".cm-activeLine": { backgroundColor: "rgba(0,0,0,0.03)" },
  ".cm-selectionBackground, ::selection": { backgroundColor: "#b3d4fc !important" },
  ".cm-searchMatch": { backgroundColor: "#ffdd0033", outline: "1px solid #ffdd00" },
  ".cm-searchMatch.cm-searchMatch-selected": { backgroundColor: "#ff6a0033" },
  ".cm-tooltip": {
    backgroundColor: "#fff",
    border: "1px solid #e0e0e0",
    boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
  },
}, { dark: false });

export function themeExtension(theme: string): Extension {
  return theme === "vs-dark" ? tokyoNight : lightTheme;
}
