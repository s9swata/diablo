import { create } from "zustand";

export type ChatMode = "ask" | "edit" | "agent";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export interface PendingDiff {
  path: string;
  original: string;
  patched: string;
}

interface AgentStore {
  messages: ChatMessage[];
  mode: ChatMode;
  streaming: boolean;
  pendingDiffs: PendingDiff[];

  setMode: (mode: ChatMode) => void;
  addMessage: (msg: ChatMessage) => void;
  appendToLastAssistant: (text: string) => void;
  finalizeAssistant: () => void;
  setStreaming: (v: boolean) => void;
  clearMessages: () => void;
  setPendingDiffs: (diffs: PendingDiff[]) => void;
  removePendingDiff: (path: string) => void;
  clearPendingDiffs: () => void;
}

export const useAgentStore = create<AgentStore>((set) => ({
  messages: [],
  mode: "ask",
  streaming: false,
  pendingDiffs: [],

  setMode: (mode) => set({ mode }),

  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),

  appendToLastAssistant: (text) =>
    set((s) => {
      const msgs = [...s.messages];
      const last = msgs[msgs.length - 1];
      if (last?.role === "assistant") {
        msgs[msgs.length - 1] = { ...last, content: last.content + text };
      } else {
        msgs.push({ id: crypto.randomUUID(), role: "assistant", content: text });
      }
      return { messages: msgs };
    }),

  finalizeAssistant: () => set((s) => s),

  setStreaming: (v) => set({ streaming: v }),

  clearMessages: () => set({ messages: [] }),

  setPendingDiffs: (diffs) => set({ pendingDiffs: diffs }),

  removePendingDiff: (path) =>
    set((s) => ({ pendingDiffs: s.pendingDiffs.filter((d) => d.path !== path) })),

  clearPendingDiffs: () => set({ pendingDiffs: [] }),
}));
