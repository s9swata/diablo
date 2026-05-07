# Phase 5 — RAG + Indexer: Implementation Spec

Validated against current (2025) research. Supersedes the Phase 5 section in PLAN.md where they conflict.

---

## Architecture

```
query
  ├─→ sqlite-vec KNN (k=25)   ──────────┐
  └─→ SQLite FTS5 BM25 (top 25) ────────┤
                                         └─→ RRF merge (k=60) → top 50 → return top 8
```

Both retrievers run in parallel. Results merged via Reciprocal Rank Fusion:
`score = Σ 1 / (60 + rank_i)`

No separate reranking step. No tantivy. Everything in one SQLite file.

---

## SQLite Schema

```sql
CREATE TABLE chunks (
  id         INTEGER PRIMARY KEY,
  path       TEXT    NOT NULL,
  start_line INTEGER NOT NULL,
  end_line   INTEGER NOT NULL,
  content    TEXT    NOT NULL,
  lang       TEXT    NOT NULL,
  mtime      INTEGER NOT NULL
);

-- Vector search (cosine similarity declared at table level)
CREATE VIRTUAL TABLE vec_chunks USING vec0(
  chunk_id   INTEGER PRIMARY KEY,
  embedding  FLOAT[768] distance_metric=cosine
);

-- BM25 full-text search (content-backed FTS5, stays in sync with chunks table)
CREATE VIRTUAL TABLE fts_chunks USING fts5(
  content,
  content=chunks,
  content_rowid=id
);
```

Incremental update on file change: `DELETE FROM chunks WHERE path = ?` (cascades via triggers to vec_chunks + fts_chunks), then re-chunk and re-insert.

---

## Vector Query

```sql
-- KNN via MATCH syntax (preferred over vec_distance_cosine scalar function)
SELECT chunk_id, distance
FROM vec_chunks
WHERE embedding MATCH ?
  AND k = 25;
```

Then JOIN with `chunks` table on `chunk_id`.

## BM25 Query

```sql
SELECT rowid, rank
FROM fts_chunks
WHERE fts_chunks MATCH ?
ORDER BY rank
LIMIT 25;
```

---

## Rust Setup (rusqlite)

**Do NOT use `tauri-plugin-sql`** — it cannot call `sqlite3_auto_extension`, making sqlite-vec registration impossible without shipping platform-specific `.dylib` files.

Use `rusqlite` directly. Register sqlite-vec before opening any connection:

```rust
unsafe {
    rusqlite::ffi::sqlite3_auto_extension(Some(
        sqlite_vec::sqlite3_vec_init
    ));
}
let conn = Connection::open(&db_path)?;
```

DB path: `~/.local/share/diablo/index/{workspace_hash}.db`

---

## Chunker

### Strategy (Continue.dev pattern)

1. File fits in token budget (≤ 512 tokens) → emit as one chunk
2. File has ≤ 2 top-level AST nodes OR ≤ 80 lines → emit as one chunk
3. Otherwise → extract top-level AST nodes
4. Node exceeds budget → recurse into children, stub out method bodies
5. No AST support for language → sliding window fallback (see below)

### Token budget

**Hard limit: 512 tokens.** bge-base-en-v1.5 silently truncates beyond 512 tokens. Size all chunks by token count, not line count. Use a simple whitespace tokenizer estimate: `chars / 4` is close enough for budget checks without a full tokenizer.

### Contextual prefix (prepend to chunk content before embedding — highest ROI change)

Every chunk gets a prefix prepended to its text before embedding:

```
// file: src/parser/lexer.rs | impl Lexer
<actual chunk content>
```

Format: `// file: {relative_path} | {parent_scope}\n`

Where `parent_scope` is the enclosing `impl`/`class`/`module` name, or empty if top-level. This is the single highest-ROI improvement in code RAG — improves embedding quality at zero query-time cost. Store the raw content in the DB; prepend the prefix only when calling the embed endpoint.

Also prepend the file's `use`/`import` block (top ≤ 10 lines) for method-level chunks. Class method chunks include the class signature line.

### AST node types to capture

**Rust**
- `function_item`
- `impl_item` (whole impl unless > budget, then recurse into `function_item` children)
- `struct_item`
- `trait_item`
- `enum_item`
- `mod_item`
- `macro_definition`

**TypeScript / JavaScript**
- `function_declaration`
- `arrow_function` (only when assigned via `lexical_declaration`)
- `class_declaration`
- `method_definition`
- `interface_declaration`
- `type_alias_declaration`
- `export_statement` wrapping any of the above

**Python**
- `function_definition`
- `class_definition`
- `decorated_definition`

**Go**
- `function_declaration`
- `method_declaration`
- `type_declaration`
- `interface_type`

### Sliding window fallback (unsupported languages)

- Window: **40–50 lines**
- Overlap: **10 lines** (≤ 25% overlap ratio — higher overlap degrades precision without recall gains)

### Tree-sitter crate note

Consider `tree-sitter-language-pack` crate instead of individual grammar crates (`tree-sitter-rust`, `tree-sitter-typescript`, etc.). It bundles 306 grammars under one versioned ABI, eliminating per-grammar ABI drift. If using individual crates, ensure all grammar crates are post-Feb 2024 releases to avoid `Language` type mismatch compile errors with tree-sitter 0.22.

---

## RRF Merge

```rust
use std::collections::HashMap;

const K: f64 = 60.0;

fn rrf_merge(
    vec_results: &[(i64, f32)],   // (chunk_id, distance) — lower is better
    bm25_results: &[(i64, f32)],  // (chunk_id, rank) — lower is better (fts5 rank is negative)
    top_n: usize,
) -> Vec<i64> {
    let mut scores: HashMap<i64, f64> = HashMap::new();

    for (rank, (chunk_id, _)) in vec_results.iter().enumerate() {
        *scores.entry(*chunk_id).or_default() += 1.0 / (K + rank as f64 + 1.0);
    }
    for (rank, (chunk_id, _)) in bm25_results.iter().enumerate() {
        *scores.entry(*chunk_id).or_default() += 1.0 / (K + rank as f64 + 1.0);
    }

    let mut ranked: Vec<(i64, f64)> = scores.into_iter().collect();
    ranked.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap());
    ranked.into_iter().take(top_n).map(|(id, _)| id).collect()
}
```

Input: top-25 from vec, top-25 from FTS5. Output: top-8 chunk IDs.

---

## Tauri Command: `index_search`

```rust
#[tauri::command]
async fn index_search(
    query: String,
    k: Option<usize>,
    state: tauri::State<'_, IndexState>,
) -> Result<Vec<ChunkResult>, String> {
    let k = k.unwrap_or(8);
    let embedding = embed(&query).await?;          // POST /embed to CF gateway
    let vec_hits = state.db.knn_search(&embedding, 25)?;
    let bm25_hits = state.db.fts_search(&query, 25)?;
    let top_ids = rrf_merge(&vec_hits, &bm25_hits, k);
    state.db.fetch_chunks(&top_ids)
}
```

---

## File Watcher (notify)

```
notify::Watcher (FsEventWatcher on macOS)
  → debounce 500ms
  → on Create/Modify: re-chunk file → embed chunks → DELETE old rows → INSERT new rows
  → on Delete: DELETE FROM chunks WHERE path = ?
  → emit Tauri event "index_progress" { indexed: N, total: M }
```

Use `ignore` crate to respect `.gitignore` / `.diabloignore`. Skip binary files (check magic bytes or extension allowlist).

Extension allowlist: `.rs`, `.ts`, `.tsx`, `.js`, `.jsx`, `.py`, `.go`, `.java`, `.kt`, `.c`, `.cpp`, `.h`, `.md`

---

## Embed Call

```
POST {GATEWAY_URL}/embed
{ "text": "{contextual_prefix}\n{chunk_content}" }
→ { "embedding": [768 floats] }
```

Batch up to 100 chunks per request during initial index. Single chunk per request during incremental update.

---

## Frontend: `rag_search` Tool

```typescript
// agent/tools/rag.ts
async function rag_search({ query, k = 8 }: { query: string; k?: number }) {
  const results: ChunkResult[] = await invoke("index_search", { query, k });
  return results
    .map(r => `// ${r.path}:${r.start_line}-${r.end_line}\n${r.content}`)
    .join("\n\n---\n\n");
}
```

## Frontend: `@codebase` Mention

In `buildContext()`, when query contains `@codebase`:
```typescript
if (hasChatMention(query, "codebase")) {
  parts.push(await rag_search({ query: stripMention(query), k: 8 }));
}
```

---

## Status Bar Progress

Emit `index_progress` event from Rust during initial indexing:
```typescript
// store/index.ts
listen("index_progress", ({ payload }) => {
  useIndexStore.setState({ indexed: payload.indexed, total: payload.total });
});
```

Show in StatusBar: `Indexing 1,240 / 4,832` while in progress, `Index ready` when done.

---

## Verify Checklist

- [ ] Open large project, status bar shows indexing progress
- [ ] Index completes, status shows "Index ready"
- [ ] Ask `@codebase how does auth work?` → relevant chunks appear in context
- [ ] Edit a file → watcher triggers re-index for that file only
- [ ] Delete a file → chunks removed from DB
- [ ] KNN query returns correct cosine neighbors
- [ ] FTS5 query returns exact identifier matches
- [ ] RRF correctly merges both result sets
