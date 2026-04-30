# Diablo — Project Summary

## What Is Diablo

Diablo is an AI-native code editor (ADE) built as a fork of [Lapce](https://github.com/lapce/lapce). Goal: ship something like Cursor — fast, AI-first, not Electron — using Cloudflare Workers AI for free inference.

---

## Why Lapce

| Requirement | Lapce |
|---|---|
| No Electron | Rust + Floem (GPU-accelerated, native) |
| Forkable license | Apache 2.0 — full commercial freedom |
| LSP built-in | Yes, first-class |
| Tree-sitter built-in | Yes, used for syntax + chunking |
| Plugin system | Volt/WASI — kept intact |
| Remote dev | SSH/WSL proxy — kept intact |

Rejected: Zed (AGPL forces open-source derivatives), Void (Electron, development paused).

---

## Architecture

```
lapce fork (Rust)
  ├── lapce-app        — UI, editor core, panels, config
  ├── lapce-core       — language, syntax, rope, LSP types
  ├── lapce-rpc        — RPC types for proxy communication
  ├── lapce-proxy      — background process (LSP, file watching, git)
  └── lapce-ai         — NEW: all AI features (see below)

         ↕ HTTP (blocking reqwest + crossbeam-channel)

diablo-gateway (Cloudflare Worker)
  ├── POST /completions  — FIM via qwen2.5-coder-32b
  ├── POST /chat         — streaming agent via kimi-k2.6 (262k ctx)
  ├── POST /apply        — file reconstruction via llama-3.3-70b-fast
  └── POST /embed        — BGE embeddings for codebase indexing
```

### Inference model assignment

| Task | Model | Why |
|---|---|---|
| FIM inline completion | `@cf/qwen/qwen2.5-coder-32b-instruct` | Trained for FIM, code-native |
| Agent / chat / planner | `@cf/moonshotai/kimi-k2.6` | 262k context, fits whole repo |
| Apply model | `@cf/meta/llama-3.3-70b-instruct-fp8-fast` | Fastest model, simple task |
| Embeddings | `@cf/baai/bge-base-en-v1.5` | Codebase indexing |

All models covered by CF Workers AI free tier (10k neurons/day).

---

## What Has Been Built

### 1. `diablo/gateway/` — Cloudflare Worker inference gateway

- `src/index.ts` — router
- `src/types.ts` — shared request/response types, CORS helpers
- `src/routes/completions.ts` — FIM with Qwen FIM tokens (`<|fim_prefix|>`, `<|fim_suffix|>`, `<|fim_middle|>`)
- `src/routes/chat.ts` — SSE streaming chat, injects search/replace block format into system prompt
- `src/routes/apply.ts` — deterministic apply first (no LLM), LLM fallback only on mismatch
- `src/routes/embed.ts` — batched BGE embeddings (100 texts/batch, max 500/request)

### 2. `diablo/lapce/lapce-ai/` — Rust AI crate

- `src/config.rs` — `DiabloAiConfig` (gateway URL, debounce, token limits)
- `src/client.rs` — `GatewayClient` wrapping blocking reqwest; `complete()`, `chat_stream()`, `apply()`, `embed()`
- `src/completion.rs` — `CompletionEngine` with debounce + per-keystroke cancel
- `src/chat.rs` — `ChatSession` with message history; SSE stream → `ChatEvent` crossbeam channel
- `src/apply.rs` — `<<<SEARCH>>><<<REPLACE>>><<<END>>>` block parser (3 unit tests, all passing)
- `src/indexer.rs` — `chunk_file()`, `embed_chunks()`, in-memory `Index` with cosine similarity search
- `src/rules.rs` — loads `.diablo/rules.md` project rules, injects into system prompt

All compiles clean. `cargo test -p lapce-ai` → 3/3 pass.

---

## Cursor Features We Replicate

| Cursor feature | Diablo approach |
|---|---|
| FIM inline completion | `CompletionEngine` → `/completions` → Qwen FIM |
| Apply model (fast file rewrite) | `/apply` → deterministic first, Llama fallback |
| Codebase context (262k) | Kimi K2.6 fits whole repo without RAG for mid-size projects |
| RAG for large repos | `indexer.rs` chunks + embeds + cosine search |
| Search/replace diff format | `<<<SEARCH>>><<<REPLACE>>><<<END>>>` in chat system prompt + `apply.rs` parser |
| LSP error loop | Native in Lapce — wire diagnostics into re-prompt flow |
| .cursorrules equivalent | `.diablo/rules.md` via `rules.rs` |
| Plugin ecosystem | Lapce's Volt/WASI system kept intact |

**Not replicating (v1):** Cursor's Tab edit-prediction model (requires fine-tuning on edit sequences at scale — deferred).

---

## What Is NOT Done Yet

- [ ] Wire `lapce-ai` into `lapce-app` — add `DiabloAiConfig` to `LapceConfig`
- [ ] AI panel UI in Floem (chat panel, inline ghost text rendering)
- [ ] LSP diagnostic → re-prompt loop (self-correction)
- [ ] sqlite-vec backend for `indexer.rs` (currently in-memory only)
- [ ] Tree-sitter semantic chunking in `indexer.rs` (currently line-based)
- [ ] Parallel agent / git worktree support
- [ ] Diablo branding (rename from Lapce)
- [ ] Deploy gateway to Cloudflare (`wrangler deploy`)
- [ ] `.diablo/rules.md` UI (create/edit from within editor)

---

## Repo Layout

```
diablo/
  SUMMARY.md          — this file
  gateway/            — Cloudflare Worker (TypeScript)
  lapce/              — Lapce fork (Rust) — Diablo editor
    lapce-ai/         — AI crate (new)
    lapce-app/        — editor UI (to be wired)
    lapce-core/       — core utilities
    lapce-proxy/      — background proxy process
    lapce-rpc/        — RPC types
```
