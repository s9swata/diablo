# Diablo — Agentic IDE Build Plan

  ## What Is Diablo

  Diablo is a full Cursor-parity agentic development environment built from scratch.
  **Not a fork.** Do not use or reference any Lapce code.

  The `gateway/` directory (Cloudflare Workers AI inference) is **kept and reused**.

  ---

  ## Tech Stack

  | Layer | Technology |
  |---|---|
  | App shell | Tauri v2 |
  | Editor | Monaco Editor |
  | UI framework | React + Zustand |
  | Agent runtime | TypeScript |
  | File / Git / Process / LSP | Rust (Tauri commands) |
  | Vector store | sqlite-vec via rusqlite |
  | Semantic chunker | tree-sitter Rust crate |
  | File watcher | notify Rust crate |
  | Terminal PTY | portable-pty Rust crate |
  | Git operations | git2 Rust crate |
  | BM25 reranker | tantivy Rust crate |
  | AI inference | Cloudflare Workers (existing gateway) |

  ---

  ## Repository Layout (target state)

  diablo/
    PLAN.md               ← this file
    gateway/              ← CF Workers AI gateway (KEEP, do not modify)
    app/                  ← NEW: the Diablo IDE (Tauri v2)
      src-tauri/          ← Rust backend
        src/
          commands/
            fs.rs         ← read_file, write_file, list_dir, fs_watch
            git.rs        ← status, diff, commit, branch, worktree
            lsp.rs        ← LspManager: spawn, send, receive, stop
            process.rs    ← run_command, pty_create, pty_write, pty_kill
            index.rs      ← IndexService: chunk, embed, search
          indexer/
            chunker.rs    ← tree-sitter semantic chunker
            store.rs      ← sqlite-vec HNSW store
            watcher.rs    ← notify-based incremental re-indexer
          lsp/
            manager.rs    ← per-language server lifecycle
            bridge.rs     ← JSON-RPC stdio ↔ Tauri events
          lib.rs
          main.rs
        Cargo.toml
        tauri.conf.json
      src/                ← React frontend
        editor/
          MonacoEditor.tsx
          providers/
            completions.ts       ← InlineCompletionsProvider → /completions
            hover.ts             ← HoverProvider → LSP
            diagnostics.ts       ← publishDiagnostics → setModelMarkers
            definitions.ts       ← DefinitionProvider → LSP
        agent/
          orchestrator.ts        ← turn loop: orchestrate → execute → respond
          registry.ts            ← ToolRegistry
          tools/
            fs.ts                ← read_file, write_file, list_dir, search_code
            editor.ts            ← get_open_file, get_selection, apply_edit
            process.ts           ← run_command, open_terminal
            rag.ts               ← rag_search, list_symbols
            git.ts               ← git_status, git_diff, git_commit, git_worktree
            context.ts           ← get_rules, get_recent_files, get_diagnostics
          context.ts             ← buildContext() — assembles LLM context per turn
        panels/
          ChatPanel.tsx
          TerminalPanel.tsx
          FileExplorer.tsx
          DiffReview.tsx         ← Monaco diff editor + accept/reject
        store/
          editor.ts              ← open files, active file, diagnostics cache
          agent.ts               ← conversation history, mode, status
          index.ts               ← indexing progress, last indexed
        App.tsx
        main.tsx

  ---

  ## System Architecture

  ┌─────────────────────────────────────────────────────────────────┐
  │                        DIABLO  (Tauri v2)                       │
  │                                                                  │
  │  ┌──────────────────────────────────────────────────────────┐   │
  │  │                    FRONTEND  (React)                      │   │
  │  │                                                           │   │
  │  │  Monaco Editor   Chat Panel    Terminal (xterm.js)        │   │
  │  │  • ghost text    • Ask mode    • PTY bridge               │   │
  │  │  • diff view     • Edit mode   • agent output             │   │
  │  │  • LSP markers   • Agent mode                             │   │
  │  │         │              │              │                   │   │
  │  │  ┌──────▼──────────────▼──────────────▼────────────────┐  │   │
  │  │  │                 AGENT RUNTIME                        │  │   │
  │  │  │  Orchestrator → ToolRegistry → Executor              │  │   │
  │  │  │                                                      │  │   │
  │  │  │  read_file  write_file  list_dir  search_code        │  │   │
  │  │  │  run_command  apply_edit  git_*  rag_search          │  │   │
  │  │  │  get_diagnostics  get_open_file  get_selection       │  │   │
  │  │  └───────────────────────┬──────────────────────────────┘  │   │
  │  │                          │  invoke() / listen()            │   │
  │  └──────────────────────────┼─────────────────────────────────┘   │
  │                             │                                      │
  │  ┌──────────────────────────▼──────────────────────────────────┐  │
  │  │                   TAURI CORE  (Rust)                         │  │
  │  │                                                              │  │
  │  │  IndexService      LspManager       ProcessManager          │  │
  │  │  tree-sitter       spawn/pipe        portable-pty           │  │
  │  │  sqlite-vec        json-rpc          run_command            │  │
  │  │  notify watcher    per-language      stdout capture         │  │
  │  │                                                              │  │
  │  │  GitService (git2)                                           │  │
  │  │  status  diff  commit  branch  worktree                      │  │
  │  └─────────────────────────────────────────────────────────────┘  │
  └─────────────────────────────────────────────────────────────────┘
                                │
           ┌────────────────────┼────────────────────┐
           ▼                    ▼                    ▼
     CF Workers AI          LSP Servers          OS / Shell
     /completions           rust-analyzer
     /chat                  typescript-language-server
     /apply                 pyright
     /embed                 clangd

  ---

  ## Cloudflare Gateway (existing — do not rewrite)

  `gateway/` handles all AI inference.

  | Route | Model | Purpose |
  |---|---|---|
  | `POST /completions` | qwen2.5-coder-32b | FIM inline completions |
  | `POST /chat` | kimi-k2.6 (262k ctx) | Streaming agent chat |
  | `POST /apply` | llama-3.3-70b-fast | File rewrite from diff |
  | `POST /embed` | bge-base-en-v1.5 | 768-dim chunk embeddings |

  All on Cloudflare Workers AI free tier.

  ---

  ## Subsystem Specs

  ### 1. Codebase Indexer (RAG Engine)

  **Indexing pipeline:**
  notify::Watcher → file changed
    → tree-sitter parse → extract functions/classes/blocks
    → fallback: sliding window 60 lines, 15-line overlap
    → batch 100 chunks → POST /embed → 768-dim vectors
    → write to sqlite-vec at ~/.local/share/diablo/index/{workspace_hash}.db

  **Search pipeline:**
  query string
    → POST /embed { text: query }
    → sqlite-vec: SELECT ... ORDER BY vec_distance_cosine(embedding, ?) LIMIT 20
    → BM25 rerank (tantivy) on keyword overlap
    → return top 8 chunks with path + line range

  **Store schema:**
  ```sql
  CREATE TABLE chunks (
    id INTEGER PRIMARY KEY,
    path TEXT NOT NULL,
    start_line INTEGER NOT NULL,
    end_line INTEGER NOT NULL,
    content TEXT NOT NULL,
    lang TEXT NOT NULL,
    mtime INTEGER NOT NULL
  );
  CREATE VIRTUAL TABLE vec_chunks USING vec0(embedding float[768]);

  Incremental strategy: on file change, DELETE WHERE path = ? then re-chunk and re-embed.

  ---
  2. LSP Bridge

  Rust: LspManager
    - spawn language server as child process
    - pipe stdin/stdout
    - emit Tauri event: "lsp_msg" { server_id, msg }
    - Tauri commands: lsp_start, lsp_send, lsp_stop

  TypeScript: Monaco providers
    - HoverProvider → invoke("lsp_send") → await response event
    - CompletionItemProvider → same pattern
    - DefinitionProvider → same pattern
    - listen("lsp_msg") → filter publishDiagnostics → setModelMarkers()

  One LspManager instance per language server, keyed by {workspace_root}:{language}.
  Auto-start on first file open for that language. Auto-stop on workspace close.

  ---
  3. Agent Tools

  // File
  read_file({ path })                         → invoke("fs_read")
  write_file({ path, content })               → invoke("fs_write")
  list_dir({ path, recursive? })              → invoke("fs_list")
  search_code({ query, path? })               → invoke("rg_search")   // ripgrep

  // Editor (direct Monaco API, no IPC)
  get_open_file()                             → monacoModel.getValue()
  get_selection()                             → monacoEditor.getSelection()
  get_diagnostics({ path? })                  → Zustand diagnostics store

  // Apply (requires user confirmation)
  apply_edit({ path, blocks })
    → parse SEARCH/REPLACE blocks
    → Monaco diff editor (original vs patched)
    → on Accept → invoke("fs_write")
    → on Reject → discard

  // Process
  run_command({ cmd, cwd? })                  → invoke("pty_exec")
  open_terminal({ cwd? })                     → invoke("pty_create")

  // RAG
  rag_search({ query, k? })                   → invoke("index_search", { k: 8 })
  list_symbols({ path })                      → LSP textDocument/documentSymbol

  // Git
  git_status()                                → invoke("git_status")
  git_diff({ path? })                         → invoke("git_diff")
  git_commit({ message, paths })              → invoke("git_commit")
  git_create_worktree({ branch })             → invoke("git_worktree")

  // Context
  get_rules()                                 → read .diablo/rules.md (cached)
  get_recent_files(n?)                        → Zustand editor history

  ---
  4. Context Assembly

  Every LLM call assembles context in this priority order. Truncate from bottom if over token budget (120k).

  async function buildContext(query: string, mode: "ask" | "edit" | "agent"): Promise<string> {
    const parts: string[] = [];

    // 1. Rules (always)
    parts.push(await getProjectRules());

    // 2. Explicit @mentions (highest priority)
    for (const ref of parseMentions(query)) {
      if (ref.type === "file")     parts.push(await readFile(ref.path));
      if (ref.type === "folder")   parts.push(await listDir(ref.path));
      if (ref.type === "codebase") parts.push(await ragSearch(query));
    }

    // 3. Current editor state
    parts.push(formatOpenFile(getOpenFile()));
    if (hasSelection()) parts.push(formatSelection(getSelection()));

    // 4. LSP diagnostics for current file
    const diags = getDiagnostics();
    if (diags.length > 0) parts.push(formatDiagnostics(diags));

    // 5. RAG results (always in agent mode)
    if (mode === "agent" && !hasChatMention(query)) {
      parts.push(await ragSearch(query, 8));
    }

    // 6. Recent files (truncated first)
    for (const f of getRecentFiles(3)) parts.push(await readFile(f));

    // 7. Git diff
    const diff = await gitDiff();
    if (diff) parts.push(diff);

    return parts.filter(Boolean).join("\n\n---\n\n");
  }

  ---
  5. Inline Completions (FIM)

  monaco.languages.registerInlineCompletionsProvider("*", {
    async provideInlineCompletions(model, position, context, token) {
      if (context.triggerKind === InlineCompletionTriggerKind.Automatic) {
        await sleep(300);
        if (token.isCancellationRequested) return { items: [] };
      }

      const fullText = model.getValue();
      const offset = model.getOffsetAt(position);
      const prefix = fullText.slice(0, offset);
      const suffix = fullText.slice(offset);

      const res = await fetch(GATEWAY_URL + "/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prefix, suffix, language: model.getLanguageId() }),
        signal: AbortSignal.timeout(5000),
      });
      const { completion } = await res.json();
      if (!completion || token.isCancellationRequested) return { items: [] };
      return { items: [{ insertText: completion }] };
    },
    freeInlineCompletions() {},
  });

  ---
  6. Chat Modes

  ┌───────┬─────────────────────────────────────────────────────────────┬───────────────────┬───────────────────┐
  │ Mode  │                           Purpose                           │  Files writable   │ Commands runnable │
  ├───────┼─────────────────────────────────────────────────────────────┼───────────────────┼───────────────────┤
  │ Ask   │ Explains code, answers questions. Read-only.                │ No                │ No                │
  ├───────┼─────────────────────────────────────────────────────────────┼───────────────────┼───────────────────┤
  │ Edit  │ Edits selection or current file. Single apply.              │ Current file only │ No                │
  ├───────┼─────────────────────────────────────────────────────────────┼───────────────────┼───────────────────┤
  │ Agent │ Multi-turn, multi-file, runs tools. Full orchestrator loop. │ All files         │ Yes               │
  └───────┴─────────────────────────────────────────────────────────────┴───────────────────┴───────────────────┘

  ---
  7. Apply + Diff Review Flow

  Agent streams response
    → StreamParser extracts SEARCH/REPLACE blocks
    → For each block:
        monaco.editor.createDiffEditor(original, patched)
    → Toolbar: "Accept All" | "Reject All" | line-level accept
    → On Accept → fs_write(path, patched)
    → On Reject → discard

  SEARCH/REPLACE block format:
  <<<SEARCH>>>
  old code here
  <<<REPLACE>>>
  new code here
  <<<END>>>

  ---
  8. Parallel Background Agents

  User triggers background agent
    → git_create_worktree({ branch: "diablo-agent/{id}" })
    → agent runs in worktree, commits changes there
    → on completion: diff worktree branch against main
    → user reviews → merge or discard

  Multiple agents = multiple worktrees = no file conflicts.

  ---
  Rust Cargo.toml

  [dependencies]
  tauri = { version = "2", features = ["protocol-asset"] }
  tauri-plugin-shell = "2"
  tokio = { version = "1", features = ["full"] }
  serde = { version = "1", features = ["derive"] }
  serde_json = "1"
  anyhow = "1"
  rusqlite = { version = "0.31", features = ["bundled"] }
  sqlite-vec = "0.1"
  tree-sitter = "0.22"
  tree-sitter-rust = "0.21"
  tree-sitter-typescript = "0.21"
  tree-sitter-python = "0.21"
  tree-sitter-javascript = "0.21"
  tree-sitter-go = "0.21"
  notify = { version = "6", features = ["macos_fsevent"] }
  git2 = "0.18"
  portable-pty = "0.8"
  reqwest = { version = "0.12", features = ["json", "stream"] }
  tantivy = "0.21"
  walkdir = "2"
  ignore = "0.4"

  ---
  Build Phases

  Phase 1 — Editor Shell ✅ COMPLETED

  Goal: Can open, edit, and save files.

  - create-tauri-app → React + TypeScript template ✅
  - Install @monaco-editor/react ✅
  - Tauri commands: fs_read, fs_write, fs_list, fs_watch ✅
  - File explorer panel ✅
  - Open file on click → Monaco tab ✅
  - Auto-save on change (500ms debounce) ✅
  - Basic settings: theme, font size, tab size ✅
  - File context menu: rename, delete, new file, new folder ✅
  - Dirty close confirmation modal ✅
  - Tab middle-click to close ✅
  - Auto-open folder picker when creating file with no workspace ✅

  Verify: open project folder, edit files, changes persist on disk. ✅

  ---
  Phase 2 — LSP ✅ COMPLETED

  Goal: Language intelligence inline.

  - LspManager in Rust — spawn/pipe/kill language servers ✅
  - Tauri commands: lsp_start, lsp_send, lsp_stop ✅
  - Tauri event: lsp_msg ✅
  - Monaco providers: hover, completion, definition, diagnostics ✅
  - Auto-detect language on file open → start server ✅
  - Server configs: rust-analyzer, typescript-language-server, pyright ✅

  Verify: open Rust file, errors appear inline, hover shows types, go-to-def works. ✅

  ---
  Phase 3 — Inline Completions ✅ COMPLETED

  Goal: Ghost text while typing.

  - registerInlineCompletionsProvider → POST /completions ✅
  - 300ms debounce + cancellation on keypress ✅
  - Tab to accept, Escape to reject ✅
  - disposeInlineCompletions implemented to satisfy Monaco runtime ✅

  Verify: type in function body, ghost text appears after 300ms pause. ✅

  ---
  Phase 4 — Chat + Apply ✅ COMPLETED

  Goal: Agent can read and edit files.

  - Chat panel UI — message list, input, mode switcher (Ask/Edit/Agent) ✅
  - SSE streaming from /chat → tokens stream into UI ✅
  - Context assembly v1: open file + rules + diagnostics ✅
  - SEARCH/REPLACE block parser ✅
  - Monaco diff editor wired to apply flow ✅
  - Accept/reject UI ✅

  Verify: ask agent to refactor function, diff appears, accept applies change.

  ---
  Phase 5 — RAG + Indexer (Week 6–7)

  Goal: Agent has semantic codebase understanding.

  - chunker.rs — tree-sitter semantic chunker
  - store.rs — sqlite-vec store with schema above
  - watcher.rs — notify watcher → incremental re-index
  - Background index on workspace open (progress in status bar)
  - Tauri command: index_search
  - rag_search tool in agent
  - @codebase mention handler

  Verify: open large project, index completes, ask "@codebase how does auth work?", get relevant chunks.

  ---
  Phase 6 — Terminal + Commands 🔄 PARTIAL

  Goal: Agent can run commands.

  - portable-pty → Tauri commands: pty_create, pty_write, pty_kill ✅
  - xterm.js terminal panel ✅ (toggle via ⌃` or View menu)
  - run_command tool — captures stdout/stderr ⬜
  - open_terminal tool — interactive terminal panel ⬜

  Verify: ask agent to run tests, agent runs cargo test, reads output, reports failures.

  ---
  Phase 7 — Full Agent Mode (Week 8)

  Goal: Cursor-parity multi-file agent.

  - Multi-file apply (SEARCH/REPLACE across multiple files)
  - @file and @folder mention injection
  - git worktree background agents
  - Background agent UI (status + diff review on completion)
  - Full context assembly (all 7 sources)

  Verify: ask agent to add feature touching 3 files, agent reads codebase, edits, runs tests, reports.

  ---
  Phase 8 — Polish 🔄 PARTIAL

  - MCP support ⬜
  - .diablo/rules.md UI ⬜
  - Git panel (status, diff, stage, commit) ✅ (status + file list + stage/unstage + commit done)
  - Global file search panel ✅ (ripgrep-backed, persistent tab)
  - Command palette ⬜
  - Keyboard shortcuts ✅ (⌘S save, ⌘W close, ⌘B sidebar, ⌘⇧F search, ⌘⇧G git, ⌃` terminal, ⌘+/- zoom)
  - Per-project workspace settings ⬜
  - Native macOS menu bar (File/Edit/View) ✅ via Tauri menu API

  ---
  Key Design Decisions (do not revisit without strong reason)

  ┌────────────────────────────────────┬───────────────────────────────────────────────────────────────────────────────────────────────────┐
  │              Decision              │                                              Reason                                               │
  ├────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ Monaco over CodeMirror             │ Ships with diff editor, inline completions API, LSP-compatible surface                            │
  ├────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ Tauri over Electron                │ 10MB vs 150MB bundle, Rust backend for safe OS ops                                                │
  ├────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ TypeScript agent runtime           │ Agent logic is HTTP + string manipulation — Rust adds friction, no perf gain                      │
  ├────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ sqlite-vec over external vector DB │ No server, single file per workspace, works offline                                               │
  ├────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ tree-sitter chunker                │ Semantic chunks = better embeddings = better RAG. Function boundaries are natural retrieval units │
  ├────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ Keep CF gateway                    │ Already deployed, correct model assignments, free tier covers dev load                            │
  ├────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ git worktrees for parallel agents  │ No file conflicts between concurrent agents                                                       │
  └────────────────────────────────────┴───────────────────────────────────────────────────────────────────────────────────────────────────┘

  ---

## Build Log

Chronological record of all committed work. Use this to understand current state and avoid re-doing done work.

---

### `48f0a2c` — first commit
Initial repo scaffold. Tauri v2 + React + Monaco skeleton wired up.

---

### `198a0ea` — fix: file editing UI
- Fixed save data-loss bug (content was not flushed on save)
- New file modal added
- File explorer refresh after create/delete

---

### `e92e86c` — fix: Rust compiler warnings
Cleaned all `#[allow(dead_code)]` / unused import warnings in `src-tauri/src/`. No behavior change.

---

### `694a9ec` — feat: auto-prompt folder picker
When user hits New File with no workspace open → folder picker opens automatically → file created in selected root.

---

### `b63cce9` — feat(phase-3): FIM inline completions
- `MonacoEditor.tsx`: registered `InlineCompletionsProvider` for all languages
- Debounced 300ms, cancels on keypress
- POST `/completions` → Cloudflare gateway → qwen2.5-coder-32b FIM
- Phase 3 complete.

---

### `325daa3` — fix: disposeInlineCompletions
Added no-op `disposeInlineCompletions()` to satisfy Monaco's provider interface contract (runtime error fix).

---

### `070e476` — feat: git integration, terminal, search, editor improvements
Large feature drop covering multiple phases:

**Git panel** (Phase 8 partial)
- `GitPanel.tsx` — shows changed files, stage/unstage toggle, commit message input, commit button
- `store/git.ts` — Zustand store: `status`, `refresh`, file list with index/work status
- Tauri commands: `git_status`, `git_stage`, `git_unstage`, `git_commit`
- Git decorations on file explorer: M/A/D/U badges per file and directory

**Terminal** (Phase 6 partial)
- `TerminalPane.tsx` — xterm.js PTY terminal, toggle via ⌃`
- Tauri commands: `pty_create`, `pty_write`, `pty_resize`, `pty_kill`
- Resizable height panel at bottom of editor area

**Search** (Phase 8 partial)
- `SearchPanel.tsx` — global ripgrep-backed search, results grouped by file with line previews
- Click result → opens file and jumps to line in Monaco
- Persistent panel state (query + results survive tab switch)

**Editor**
- Word wrap toggle (⌥Z)
- Zoom in/out (⌘=/⌘-)
- Minimap toggle
- LSP install progress displayed in StatusBar

---

### `61e8f25` — feat: macOS-style title bar
- Centered app title "Diablo — filename" in title bar
- Panel toggle buttons (sidebar, minimap, terminal) right-aligned
- `data-tauri-drag-region` on title bar; `WebkitAppRegion: no-drag` on buttons

---

### `34f56c4` — feat: native macOS system menu bar
- Moved File/Edit/View menus out of custom UI into native macOS menu bar via Tauri `Menu` API
- Rust: `src-tauri/src/menu.rs` — builds menu, emits `menu-action` events to frontend
- `App.tsx`: listens for `menu-action` events, dispatches to handlers

---

### `f80262e` — ui: padding fix pass
Systematic pass fixing padding regressions from Tailwind v4 Vite HMR issue:
- Tabs, panels, breadcrumb, terminal, rows all converted to inline `style` props
- Established rule: **never use Tailwind `px-*`/`py-*`/`gap-*`/`w-*`/`h-*` — use inline style**

---

### `8675296` — feat(ui): Zed-style nav bar + persistent search tab
- Removed custom nav/toolbar; adopted Zed-style tab bar where search is a virtual tab
- Search tab persists while open (query + results survive switching away and back)
- Git panel now lives as a vertical split at bottom of sidebar, user-resizable via drag handle
- StatusBar nav buttons (Explorer, Search, Git) toggle panels

---

### `16e35f7` — checkpoint: before ui audit
Pre-task commit capturing state before component system refactor.

---

### `4c989a3` — feat(ui): component system + tailwind spacing audit

**New file: `app/src/ui/primitives.tsx`**
- `Button` — 3 variants: `primary`, `ghost`, `danger`. Replaces fragile `btnClass` string + `!override` pattern.
- `Modal` — shared overlay backdrop. Removes 4× repeated `fixed inset-0 bg-black/50` boilerplate.
- `Select` — shared select styling. Collapses 3× identical selects in TabBar.

**FileExplorer fixes**
- Removed `▸`/`▾` chevron dot before folder/file icons (expand still works via click)
- Git status badge right-aligned: filename left, `M`/`A`/`D` pushed to right with `justifyContent: space-between`

**Tailwind spacing audit — all 6 files clean**
- `App.tsx`, `MenuBar.tsx`, `TabBar.tsx`, `StatusBar.tsx`, `Breadcrumb.tsx`, `FileExplorer.tsx`
- All `px-*`, `py-*`, `p-*`, `gap-*`, `mt-*`, `mx-*`, `w-*`, `h-*`, `min-w-*` → inline `style` props

---

## Current State Summary

| Area | Status | Notes |
|---|---|---|
| File editing | ✅ Done | Open, edit, save, tabs, dirty indicator |
| File explorer | ✅ Done | Tree, context menu, rename, delete, git decorations |
| Inline completions | ✅ Done | FIM via CF gateway, 300ms debounce |
| Terminal | ✅ Done | PTY xterm.js, ⌃` toggle, resizable |
| Git panel | ✅ Done | Status, stage/unstage, commit |
| Global search | ✅ Done | ripgrep, persistent tab, jump to line |
| Native menu bar | ✅ Done | File/Edit/View via Tauri macOS API |
| UI component system | ✅ Done | Button, Modal, Select in `ui/primitives.tsx` |
| LSP | ✅ Done | Hover, completion, definition, diagnostics via language servers |
| Chat / Agent | ✅ Done | SSE streaming, 3 modes, context assembly, API key |
| RAG / Indexer | ⬜ Not started | Phase 5 |
| Diff review UI | ✅ Done | Monaco DiffEditor, accept/reject |
| Command palette | ⬜ Not started | Phase 8 |

---
