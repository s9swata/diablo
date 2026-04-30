# Graph Report - .  (2026-04-30)

## Corpus Check
- Corpus is ~10,980 words - fits in a single context window. You may not need a graph.

## Summary
- 125 nodes · 178 edges · 14 communities detected
- Extraction: 68% EXTRACTED · 32% INFERRED · 0% AMBIGUOUS · INFERRED: 57 edges (avg confidence: 0.61)
- Token cost: 0 input · 0 output

## God Nodes (most connected - your core abstractions)
1. `LspClient` - 11 edges
2. `emit()` - 7 edges
3. `find_binary()` - 7 edges
4. `ensure_typescript_server()` - 7 edges
5. `ensure_pyright()` - 7 edges
6. `find_binary_in_dir()` - 6 edges
7. `ensure_node()` - 6 edges
8. `lsp_ensure()` - 6 edges
9. `Gateway Entry Point` - 6 edges
10. `ensure_rustup()` - 5 edges

## Surprising Connections (you probably didn't know these)
- `Project Summary Document` --references--> `Editor State Store`  [INFERRED]
  SUMMARY.md → app/src/store/editor.ts
- `Project Summary Document` --references--> `Gateway Entry Point`  [INFERRED]
  SUMMARY.md → gateway/src/index.ts
- `Project README` --references--> `Project Summary Document`  [INFERRED]
  README.md → SUMMARY.md
- `Gateway Apply Route` --semantically_similar_to--> `Gateway Chat Route`  [INFERRED] [semantically similar]
  gateway/src/routes/apply.ts → gateway/src/routes/chat.ts
- `Gateway Apply Route` --semantically_similar_to--> `Gateway Completions Route`  [INFERRED] [semantically similar]
  gateway/src/routes/apply.ts → gateway/src/routes/completions.ts

## Hyperedges (group relationships)
- **LSP Backend Module** — lsp_mod, lsp_bridge, lsp_manager [EXTRACTED 1.00]
- **Tauri Commands Module** — commands_mod, commands_install, commands_fs, commands_lsp [EXTRACTED 1.00]
- **Monaco LSP Providers** — hover_provider, completions_provider, diagnostics_provider [EXTRACTED 1.00]
- **Gateway Routes Registration** — gateway_index, gateway_route_apply, gateway_route_chat, gateway_route_completions, gateway_route_embed, gateway_types [EXTRACTED 1.00]
- **Editor Application Components** — definitions_provider, editor_store [EXTRACTED 1.00]
- **Project Documentation Suite** — summary_doc, readme_doc, plan_doc [INFERRED 0.80]

## Communities

### Community 0 - "Frontend App Handlers"
Cohesion: 0.12
Nodes (0): 

### Community 1 - "Frontend UI Components"
Cohesion: 0.13
Nodes (0): 

### Community 2 - "Gateway AI Features"
Cohesion: 0.18
Nodes (6): applyDeterministic(), buildApplyPrompt(), extractCodeBlock(), handleApply(), corsHeaders(), err()

### Community 3 - "LSP Tool Installation"
Cohesion: 0.35
Nodes (14): emit(), ensure_clangd(), ensure_node(), ensure_pyright(), ensure_rust_analyzer(), ensure_rustup(), ensure_typescript_server(), extended_path_custom() (+6 more)

### Community 4 - "Tauri Backend Core"
Cohesion: 0.17
Nodes (3): DirEntry, fs_list(), list_dir()

### Community 5 - "LSP Client Operations"
Cohesion: 0.27
Nodes (1): LspClient

### Community 6 - "Editor State & Gateway"
Cohesion: 0.42
Nodes (10): Editor Definitions Provider, Editor State Store, Gateway Entry Point, Gateway Apply Route, Gateway Chat Route, Gateway Completions Route, Gateway Embed Route, Gateway Type Definitions (+2 more)

### Community 7 - "LSP Lifecycle"
Cohesion: 0.47
Nodes (3): lsp_path(), lsp_start(), LspMsg

### Community 8 - "LSP Message Bridge"
Cohesion: 0.67
Nodes (0): 

### Community 9 - "LSP Manager State"
Cohesion: 0.67
Nodes (2): LspHandle, LspManagerState

### Community 10 - "Planning & Documentation"
Cohesion: 0.67
Nodes (3): Project Plan Document, Tauri v2 Framework, Tauri v2 Raw Notes

### Community 11 - "Tauri App Bundle"
Cohesion: 1.0
Nodes (2): Diablo Tauri Application, Tauri Application Icon

### Community 12 - "Vite Configuration"
Cohesion: 1.0
Nodes (0): 

### Community 13 - "Module Definitions"
Cohesion: 1.0
Nodes (0): 

## Knowledge Gaps
- **11 isolated node(s):** `LspHandle`, `LspManagerState`, `ServerSpec`, `InstallProgress`, `DirEntry` (+6 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Tauri App Bundle`** (2 nodes): `Diablo Tauri Application`, `Tauri Application Icon`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Vite Configuration`** (1 nodes): `vite.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Definitions`** (1 nodes): `mod.rs`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `LspClient` connect `LSP Client Operations` to `Frontend App Handlers`?**
  _High betweenness centrality (0.081) - this node is a cross-community bridge._
- **Are the 6 inferred relationships involving `emit()` (e.g. with `ensure_node()` and `ensure_rustup()`) actually correct?**
  _`emit()` has 6 INFERRED edges - model-reasoned connections that need verification._
- **Are the 6 inferred relationships involving `find_binary()` (e.g. with `ensure_node()` and `ensure_rustup()`) actually correct?**
  _`find_binary()` has 6 INFERRED edges - model-reasoned connections that need verification._
- **Are the 6 inferred relationships involving `ensure_typescript_server()` (e.g. with `emit()` and `find_binary()`) actually correct?**
  _`ensure_typescript_server()` has 6 INFERRED edges - model-reasoned connections that need verification._
- **Are the 6 inferred relationships involving `ensure_pyright()` (e.g. with `emit()` and `find_binary()`) actually correct?**
  _`ensure_pyright()` has 6 INFERRED edges - model-reasoned connections that need verification._
- **What connects `LspHandle`, `LspManagerState`, `ServerSpec` to the rest of the system?**
  _11 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Frontend App Handlers` be split into smaller, more focused modules?**
  _Cohesion score 0.12 - nodes in this community are weakly interconnected._