use crate::indexer::chunker;
use crate::indexer::store::{self, IndexDb};
use crate::indexer::watcher::FileWatcher;

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};

pub struct WatcherState(pub Arc<Mutex<Option<FileWatcher>>>);

const GATEWAY_URL: &str = "https://diablo-gateway.s4swata2024.workers.dev";

#[derive(Serialize, Deserialize, Clone)]
pub struct IndexStatus {
    pub indexed: u64,
    pub total: u64,
}
#[derive(Serialize, Clone)]
pub struct ChunkResult {
    pub path: String,
    pub start_line: usize,
    pub end_line: usize,
    pub content: String,
    pub lang: String,
}

fn workspace_hash(root: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(root.as_bytes());
    format!("{:x}", hasher.finalize())
}

fn db_dir() -> String {
    let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
    format!("{}/.local/share/diablo/index", home)
}

fn db_path(root: &str) -> String {
    format!("{}/{}.db", db_dir(), workspace_hash(root))
}

async fn embed_text(client: &reqwest::Client, text: &str) -> Result<Vec<f32>, String> {
    let resp = client
        .post(format!("{}/embed", GATEWAY_URL))
        .json(&serde_json::json!({ "text": text }))
        .send()
        .await
        .map_err(|e| format!("Embed failed: {}", e))?;

    let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let embedding: Vec<f32> = json["embedding"]
        .as_array()
        .ok_or_else(|| "No embedding in response".to_string())?
        .iter()
        .map(|v| v.as_f64().unwrap_or(0.0) as f32)
        .collect();
    Ok(embedding)
}

async fn embed_batch(
    client: &reqwest::Client,
    texts: &[String],
) -> Result<Vec<Vec<f32>>, String> {
    if texts.len() == 1 {
        let emb = embed_text(client, &texts[0]).await?;
        return Ok(vec![emb]);
    }

    let resp = client
        .post(format!("{}/embed", GATEWAY_URL))
        .json(&serde_json::json!({ "texts": texts }))
        .send()
        .await
        .map_err(|e| format!("Batch embed failed: {}", e))?;

    let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let embeddings: Vec<Vec<f32>> = json["embeddings"]
        .as_array()
        .unwrap_or(&serde_json::Value::Null.as_array().unwrap_or(&vec![]))
        .iter()
        .map(|arr| {
            arr.as_array()
                .unwrap_or(&vec![])
                .iter()
                .map(|v| v.as_f64().unwrap_or(0.0) as f32)
                .collect()
        })
        .collect();

    Ok(embeddings)
}

fn contextual_prefix(rel_path: &str, parent_scope: &str, imports: &str) -> String {
    let scope_line = if parent_scope.is_empty() {
        String::new()
    } else {
        format!(" | {}", parent_scope)
    };
    let imports_line = if imports.is_empty() {
        String::new()
    } else {
        format!("\n// imports:\n{}\n", imports)
    };
    format!(
        "// file: {}{}{}",
        rel_path, scope_line, imports_line
    )
}

fn relative_path(root: &str, path: &str) -> String {
    let root2 = if root.ends_with('/') {
        root.to_string()
    } else {
        format!("{}/", root)
    };
    path.strip_prefix(&root2)
        .unwrap_or(path)
        .to_string()
}

#[tauri::command]
pub async fn index_start(
    app: AppHandle,
    root: String,
    watcher_state: tauri::State<'_, WatcherState>,
) -> Result<(), String> {
    let db_path_str = db_path(&root);
    let root_clone = root.clone();
    let watcher_arc = watcher_state.0.clone();

    tauri::async_runtime::spawn(async move {
        if let Err(e) = run_initial_index(&app, &root_clone, &db_path_str).await {
            eprintln!("Index error: {}", e);
            let _ = app.emit("index_progress", IndexStatus { indexed: 0, total: 0 });
            return;
        }
        // Start file watcher after initial index completes
        match FileWatcher::start(app.clone(), root_clone.clone(), db_path_str.clone()) {
            Ok(fw) => {
                let mut guard = watcher_arc.lock().unwrap();
                *guard = Some(fw);
            }
            Err(e) => eprintln!("Watcher start error: {}", e),
        }
    });

    Ok(())
}

async fn run_initial_index(app: &AppHandle, root: &str, db_path_str: &str) -> Result<(), String> {
    let db = IndexDb::open(db_path_str).map_err(|e| e.to_string())?;
    db.init_schema().map_err(|e| e.to_string())?;

    let total = chunker::count_files(root);
    let _ = app.emit("index_progress", IndexStatus { indexed: 0, total });

    let client = reqwest::Client::new();
    let mut indexed: u64 = 0;

    let files: Vec<String> = chunker::iter_files(root).collect();

    // Process files in batches for embedding
    let mut batch_chunks: Vec<chunker::ChunkOutput> = Vec::new();
    let mut batch_texts: Vec<String> = Vec::new();

    for file_path in &files {
        let source = match std::fs::read_to_string(file_path) {
            Ok(s) => s,
            Err(_) => continue,
        };

        let lang = chunker::get_language(
            std::path::Path::new(file_path)
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or(""),
        );

        let rel_path = relative_path(root, file_path);
        let chunks = chunker::chunk_file(file_path, &source, lang);

        for chunk in chunks {
            let prefix = contextual_prefix(&rel_path, &chunk.parent_scope, &chunk.imports);
            let text = format!("{}\n{}", prefix, chunk.content);
            batch_texts.push(text);
            batch_chunks.push(chunk);

            if batch_texts.len() >= 100 {
                let embeddings = match embed_batch(&client, &batch_texts).await {
                    Ok(embs) => embs,
                    Err(e) => {
                        eprintln!("Batch embed error: {}", e);
                        continue;
                    }
                };

                // Insert all chunks from this batch
                for (i, chunk) in batch_chunks.iter().enumerate() {
                    if i < embeddings.len() {
                        let _ = db.delete_by_path(&chunk.path);
                        let _ = db.insert_chunk(
                            &chunk.path,
                            chunk.start_line,
                            chunk.end_line,
                            &chunk.content,
                            &chunk.lang,
                            std::fs::metadata(&chunk.path)
                                .ok()
                                .and_then(|m| m.modified().ok())
                                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                                .map(|d| d.as_secs())
                                .unwrap_or(0),
                            &embeddings[i],
                        );
                    }
                }

                indexed += batch_chunks.len() as u64;
                let _ = app.emit("index_progress", IndexStatus { indexed, total });

                batch_chunks.clear();
                batch_texts.clear();
            }
        }
    }

    // Flush remaining batch
    if !batch_texts.is_empty() {
        let embeddings = match embed_batch(&client, &batch_texts).await {
            Ok(embs) => embs,
            Err(e) => {
                eprintln!("Final batch embed error: {}", e);
                return Err(e);
            }
        };

        for (i, chunk) in batch_chunks.iter().enumerate() {
            if i < embeddings.len() {
                let _ = db.insert_chunk(
                    &chunk.path,
                    chunk.start_line,
                    chunk.end_line,
                    &chunk.content,
                    &chunk.lang,
                    std::fs::metadata(&chunk.path)
                        .ok()
                        .and_then(|m| m.modified().ok())
                        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                        .map(|d| d.as_secs())
                        .unwrap_or(0),
                    &embeddings[i],
                );
            }
        }
        indexed += batch_chunks.len() as u64;
    }

    let _ = app.emit("index_progress", IndexStatus { indexed, total });

    Ok(())
}

#[tauri::command]
pub async fn index_search(
    query: String,
    k: Option<usize>,
    root: String,
) -> Result<Vec<ChunkResult>, String> {
    let db_path_str = db_path(&root);
    let db = IndexDb::open(&db_path_str).map_err(|e| e.to_string())?;
    db.init_schema().map_err(|e| e.to_string())?;

    let k = k.unwrap_or(8);
    let client = reqwest::Client::new();
    let embedding = embed_text(&client, &query).await?;

    let vec_hits = db.knn_search(&embedding, 25).map_err(|e| e.to_string())?;
    let bm25_hits = db.fts_search(&query, 25).map_err(|e| e.to_string())?;
    let top_ids = store::rrf_merge(&vec_hits, &bm25_hits, k);

    let raw = db.fetch_chunks(&top_ids).map_err(|e| e.to_string())?;
    let results: Vec<ChunkResult> = raw
        .into_iter()
        .map(|c| ChunkResult {
            path: c.path,
            start_line: c.start_line,
            end_line: c.end_line,
            content: c.content,
            lang: c.lang,
        })
        .collect();

    Ok(results)
}

#[tauri::command]
pub async fn index_delete(root: String) -> Result<(), String> {
    let path = db_path(&root);
    std::fs::remove_file(&path).map_err(|e| format!("Failed to delete index: {}", e))?;
    Ok(())
}