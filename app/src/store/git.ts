import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

export interface GitFileStatus {
  path: string;
  index_status: string;
  work_status: string;
}

export interface GitStatus {
  branch: string;
  ahead: number;
  behind: number;
  files: GitFileStatus[];
  is_repo: boolean;
  git_root: string;
}

export interface GitCommit {
  hash: string;
  author: string;
  date: string;
  message: string;
}

interface GitStore {
  status: GitStatus | null;
  commits: GitCommit[];
  loading: boolean;
  commitMessage: string;
  opError: string | null;

  refresh: (cwd: string) => Promise<void>;
  setCommitMessage: (msg: string) => void;
  clearError: () => void;
  stage: (cwd: string, path: string) => Promise<void>;
  unstage: (cwd: string, path: string) => Promise<void>;
  discard: (cwd: string, path: string) => Promise<void>;
  stageAll: (cwd: string) => Promise<void>;
  commit: (cwd: string) => Promise<void>;
  push: (cwd: string) => Promise<void>;
  pull: (cwd: string) => Promise<void>;
}

export const useGitStore = create<GitStore>((set, get) => ({
  status: null,
  commits: [],
  loading: false,
  commitMessage: "",
  opError: null,

  refresh: async (cwd) => {
    set({ loading: true });
    try {
      const [status, commits] = await Promise.all([
        invoke<GitStatus>("git_status", { cwd }),
        invoke<GitCommit[]>("git_log", { cwd, limit: 10 }).catch(() => [] as GitCommit[]),
      ]);
      set({ status, commits });
    } catch {
      set({ status: null });
    } finally {
      set({ loading: false });
    }
  },

  setCommitMessage: (msg) => set({ commitMessage: msg }),
  clearError: () => set({ opError: null }),

  stage: async (cwd, path) => {
    try {
      await invoke("git_stage", { cwd, path });
      await get().refresh(cwd);
    } catch (e) {
      set({ opError: String(e) });
    }
  },

  unstage: async (cwd, path) => {
    try {
      await invoke("git_unstage", { cwd, path });
      await get().refresh(cwd);
    } catch (e) {
      set({ opError: String(e) });
    }
  },

  discard: async (cwd, path) => {
    try {
      await invoke("git_discard", { cwd, path });
      await get().refresh(cwd);
      window.dispatchEvent(new CustomEvent("git-refresh"));
    } catch (e) {
      set({ opError: String(e) });
    }
  },

  stageAll: async (cwd) => {
    const { status } = get();
    if (!status) return;
    const unstaged = status.files.filter((f) => f.work_status !== " ");
    try {
      await Promise.all(unstaged.map((f) => invoke("git_stage", { cwd, path: f.path })));
      await get().refresh(cwd);
    } catch (e) {
      set({ opError: String(e) });
    }
  },

  commit: async (cwd) => {
    const { commitMessage } = get();
    if (!commitMessage.trim()) return;
    try {
      await invoke("git_commit", { cwd, message: commitMessage });
      set({ commitMessage: "" });
      await get().refresh(cwd);
    } catch (e) {
      set({ opError: String(e) });
    }
  },

  push: async (cwd) => {
    try {
      await invoke("git_push", { cwd });
      await get().refresh(cwd);
    } catch (e) {
      set({ opError: String(e) });
    }
  },

  pull: async (cwd) => {
    try {
      await invoke("git_pull", { cwd });
      await get().refresh(cwd);
      window.dispatchEvent(new CustomEvent("git-refresh"));
    } catch (e) {
      set({ opError: String(e) });
    }
  },
}));
