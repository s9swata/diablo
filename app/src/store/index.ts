import { create } from "zustand";

interface IndexStore {
  indexed: number;
  total: number;
  status: "idle" | "indexing" | "ready" | "error";
  setProgress: (indexed: number, total: number) => void;
  setError: () => void;
}

export const useIndexStore = create<IndexStore>((set) => ({
  indexed: 0,
  total: 0,
  status: "idle",

  setProgress: (indexed, total) =>
    set({
      indexed,
      total,
      status: indexed >= total && total > 0 ? "ready" : "indexing",
    }),

  setError: () => set({ status: "error" }),
}));