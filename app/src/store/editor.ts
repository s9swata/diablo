import { create } from "zustand";

export interface OpenFile {
  path: string;
  content: string;
  dirty: boolean;
}

export interface Settings {
  theme: "vs-dark" | "light";
  fontSize: number;
  tabSize: number;
}

interface EditorStore {
  workspaceRoot: string | null;
  openFiles: OpenFile[];
  activeFile: string | null;
  settings: Settings;
  diagnostics: Record<string, unknown[]>;

  setWorkspaceRoot: (root: string) => void;
  openFile: (path: string, content: string) => void;
  addFile: (path: string) => void;
  setActiveFile: (path: string) => void;
  updateContent: (path: string, content: string) => void;
  markSaved: (path: string) => void;
  closeFile: (path: string) => void;
  updateSettings: (s: Partial<Settings>) => void;
  setDiagnostics: (uri: string, diags: unknown[]) => void;
}

export const useEditorStore = create<EditorStore>((set, get) => ({
  workspaceRoot: null,
  openFiles: [],
  activeFile: null,
  settings: { theme: "vs-dark", fontSize: 14, tabSize: 2 },
  diagnostics: {},

  setWorkspaceRoot: (root) => set({ workspaceRoot: root }),

  openFile: (path, content) => {
    const { openFiles } = get();
    if (!openFiles.find((f) => f.path === path)) {
      set({ openFiles: [...openFiles, { path, content, dirty: false }] });
    }
    set({ activeFile: path });
  },

  setActiveFile: (path) => set({ activeFile: path }),

  addFile: (path) => {
    const { openFiles } = get();
    if (!openFiles.find((f) => f.path === path)) {
      set({ openFiles: [...openFiles, { path, content: "", dirty: false }] });
    }
    set({ activeFile: path });
  },

  updateContent: (path, content) =>
    set((s) => ({
      openFiles: s.openFiles.map((f) =>
        f.path === path ? { ...f, content, dirty: true } : f
      ),
    })),

  markSaved: (path) =>
    set((s) => ({
      openFiles: s.openFiles.map((f) =>
        f.path === path ? { ...f, dirty: false } : f
      ),
    })),

  closeFile: (path) => {
    const { openFiles, activeFile } = get();
    const remaining = openFiles.filter((f) => f.path !== path);
    const newActive =
      activeFile === path ? (remaining[remaining.length - 1]?.path ?? null) : activeFile;
    set({ openFiles: remaining, activeFile: newActive });
  },

  updateSettings: (s) =>
    set((st) => ({ settings: { ...st.settings, ...s } })),

  setDiagnostics: (uri, diags) =>
    set((st) => ({ diagnostics: { ...st.diagnostics, [uri]: diags } })),
}));
