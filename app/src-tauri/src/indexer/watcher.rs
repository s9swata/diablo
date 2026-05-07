use crate::indexer::{chunker, store::IndexDb};
use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use std::collections::HashMap;
use tauri::{AppHandle, Emitter};

const GATEWAY_URL: &str = "https://diablo-gateway.s4swata2024.workers.dev";
const DEBOUNCE_MS: u64 = 500;

#[derive(Clone)]
enum PendingOp {
    Reindex(String), // path to re-chunk + embed
    Delete(String),  // path to remove
}

pub struct FileWatcher {
    _watcher: RecommendedWatcher,
}

impl FileWatcher {
    pub fn start(app: AppHandle, root: String, db_path: String) -> notify::Result<Self> {
        // pending ops debounced: path → (op, deadline)
        let pending: Arc<Mutex<HashMap<String, (PendingOp, Instant)>>> =
            Arc::new(Mutex::new(HashMap::new()));

        // Background flush task
        let pending_flush = pending.clone();
        let app_flush = app.clone();
        let db_path_flush = db_path.clone();
        let root_flush = root.clone();
        tokio::spawn(async move {
            loop {
                tokio::time::sleep(Duration::from_millis(100)).await;

                let due: Vec<(String, PendingOp)> = {
                    let mut map = pending_flush.lock().unwrap();
                    let now = Instant::now();
                    let ready: Vec<String> = map
                        .iter()
                        .filter(|(_, (_, deadline))| now >= *deadline)
                        .map(|(k, _)| k.clone())
                        .collect();
                    ready
                        .into_iter()
                        .filter_map(|k| map.remove(&k).map(|(op, _)| (k, op)))
                        .collect()
                };

                for (path, op) in due {
                    match op {
                        PendingOp::Delete(p) => {
                            if let Ok(db) = IndexDb::open(&db_path_flush) {
                                let _ = db.delete_by_path(&p);
                            }
                        }
                        PendingOp::Reindex(p) => {
                            let source = match std::fs::read_to_string(&p) {
                                Ok(s) => s,
                                Err(_) => continue,
                            };
                            let ext = std::path::Path::new(&p)
                                .extension()
                                .and_then(|e| e.to_str())
                                .unwrap_or("")
                                .to_string();
                            let lang = chunker::get_language(&ext);
                            let chunks = chunker::chunk_file(&p, &source, lang);
                            if chunks.is_empty() {
                                continue;
                            }

                            let rel = relative_path(&root_flush, &p);
                            let texts: Vec<String> = chunks
                                .iter()
                                .map(|c| {
                                    let scope = if c.parent_scope.is_empty() {
                                        String::new()
                                    } else {
                                        format!(" | {}", c.parent_scope)
                                    };
                                    let imports = if c.imports.is_empty() {
                                        String::new()
                                    } else {
                                        format!("\n// imports:\n{}\n", c.imports)
                                    };
                                    format!("// file: {}{}{}\n{}", rel, scope, imports, c.content)
                                })
                                .collect();

                            let client = reqwest::Client::new();
                            let embeddings = match embed_batch(&client, &texts).await {
                                Ok(e) => e,
                                Err(err) => {
                                    eprintln!("[watcher] embed error for {}: {}", p, err);
                                    continue;
                                }
                            };

                            let db = match IndexDb::open(&db_path_flush) {
                                Ok(d) => d,
                                Err(_) => continue,
                            };
                            let _ = db.delete_by_path(&p);
                            let mtime = std::fs::metadata(&p)
                                .ok()
                                .and_then(|m| m.modified().ok())
                                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                                .map(|d| d.as_secs())
                                .unwrap_or(0);
                            for (i, chunk) in chunks.iter().enumerate() {
                                if i < embeddings.len() {
                                    let _ = db.insert_chunk(
                                        &chunk.path,
                                        chunk.start_line,
                                        chunk.end_line,
                                        &chunk.content,
                                        &chunk.lang,
                                        mtime,
                                        &embeddings[i],
                                    );
                                }
                            }
                            let _ = app_flush.emit("index_file_updated", &path);
                        }
                    }
                }
            }
        });

        let pending_ev = pending.clone();
        let root_ev = root.clone();

        let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
            let event = match res {
                Ok(e) => e,
                Err(_) => return,
            };

            let deadline = Instant::now() + Duration::from_millis(DEBOUNCE_MS);

            match event.kind {
                EventKind::Create(_) | EventKind::Modify(_) => {
                    for path_buf in &event.paths {
                        let path = path_buf.to_string_lossy().to_string();
                        if !chunker::is_indexable(&path) {
                            continue;
                        }
                        if is_ignored(&path, &root_ev) {
                            continue;
                        }
                        let mut map = pending_ev.lock().unwrap();
                        map.insert(path.clone(), (PendingOp::Reindex(path), deadline));
                    }
                }
                EventKind::Remove(_) => {
                    for path_buf in &event.paths {
                        let path = path_buf.to_string_lossy().to_string();
                        let mut map = pending_ev.lock().unwrap();
                        map.insert(path.clone(), (PendingOp::Delete(path), deadline));
                    }
                }
                _ => {}
            }
        })?;

        watcher.watch(std::path::Path::new(&root), RecursiveMode::Recursive)?;

        Ok(Self { _watcher: watcher })
    }
}

fn is_ignored(path: &str, root: &str) -> bool {
    path.split(std::path::MAIN_SEPARATOR)
        .any(|c| c.starts_with('.') || c == "node_modules" || c == "target")
        || !path.starts_with(root)
}

fn relative_path(root: &str, path: &str) -> String {
    let root2 = if root.ends_with('/') {
        root.to_string()
    } else {
        format!("{}/", root)
    };
    path.strip_prefix(&root2).unwrap_or(path).to_string()
}

async fn embed_batch(client: &reqwest::Client, texts: &[String]) -> Result<Vec<Vec<f32>>, String> {
    if texts.len() == 1 {
        let resp = client
            .post(format!("{}/embed", GATEWAY_URL))
            .json(&serde_json::json!({ "text": &texts[0] }))
            .send()
            .await
            .map_err(|e| e.to_string())?;
        let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
        let emb: Vec<f32> = json["embedding"]
            .as_array()
            .ok_or("no embedding")?
            .iter()
            .map(|v| v.as_f64().unwrap_or(0.0) as f32)
            .collect();
        return Ok(vec![emb]);
    }

    let resp = client
        .post(format!("{}/embed", GATEWAY_URL))
        .json(&serde_json::json!({ "texts": texts }))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let embeddings: Vec<Vec<f32>> = json["embeddings"]
        .as_array()
        .unwrap_or(&vec![])
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
