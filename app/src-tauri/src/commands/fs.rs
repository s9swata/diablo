use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::path::Path;
use tauri::{AppHandle, Emitter};

#[derive(Serialize, Deserialize, Clone)]
pub struct DirEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub children: Option<Vec<DirEntry>>,
}

#[tauri::command]
pub async fn fs_read(path: String) -> Result<String, String> {
    tokio::fs::read_to_string(&path)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn fs_write(path: String, content: String) -> Result<(), String> {
    if let Some(parent) = Path::new(&path).parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| e.to_string())?;
    }
    tokio::fs::write(&path, content)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn fs_list(path: String, recursive: Option<bool>) -> Result<Vec<DirEntry>, String> {
    let recursive = recursive.unwrap_or(false);
    list_dir(&path, recursive).map_err(|e| e.to_string())
}

fn list_dir(path: &str, recursive: bool) -> Result<Vec<DirEntry>> {
    let mut entries = Vec::new();

    let read = std::fs::read_dir(path)?;
    let mut raw: Vec<_> = read.filter_map(|e| e.ok()).collect();
    raw.sort_by_key(|e| {
        let is_file = e.file_type().map(|t| t.is_file()).unwrap_or(false);
        (is_file, e.file_name())
    });

    for entry in raw {
        let meta = entry.metadata()?;
        let name = entry.file_name().to_string_lossy().to_string();
        let entry_path = entry.path().to_string_lossy().to_string();

        // skip hidden files
        if name.starts_with('.') {
            continue;
        }

        let is_dir = meta.is_dir();
        let children = if is_dir && recursive {
            Some(list_dir(&entry_path, true)?)
        } else if is_dir {
            Some(Vec::new()) // placeholder so UI can expand
        } else {
            None
        };

        entries.push(DirEntry {
            name,
            path: entry_path,
            is_dir,
            children,
        });
    }

    Ok(entries)
}

#[tauri::command]
pub async fn fs_rename(old_path: String, new_path: String) -> Result<(), String> {
    tokio::fs::rename(&old_path, &new_path)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn fs_delete(path: String) -> Result<(), String> {
    let meta = tokio::fs::metadata(&path).await.map_err(|e| e.to_string())?;
    if meta.is_dir() {
        tokio::fs::remove_dir_all(&path).await.map_err(|e| e.to_string())
    } else {
        tokio::fs::remove_file(&path).await.map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub async fn fs_mkdir(path: String) -> Result<(), String> {
    tokio::fs::create_dir_all(&path)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn fs_watch(
    app: AppHandle,
    path: String,
) -> Result<(), String> {
    use notify::{Config, RecommendedWatcher, RecursiveMode, Watcher};
    use std::sync::mpsc;

    let (tx, rx) = mpsc::channel();
    let mut watcher = RecommendedWatcher::new(tx, Config::default()).map_err(|e| e.to_string())?;
    watcher
        .watch(Path::new(&path), RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;

    tokio::task::spawn_blocking(move || {
        let _watcher = watcher; // keep alive
        for event in rx {
            if let Ok(event) = event {
                let paths: Vec<String> = event
                    .paths
                    .iter()
                    .map(|p| p.to_string_lossy().to_string())
                    .collect();
                let _ = app.emit("fs_changed", paths);
            }
        }
    });

    Ok(())
}
