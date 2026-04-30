use crate::lsp::{bridge, manager::{LspHandle, LspManagerState}};
use serde::Serialize;
use std::process::Stdio;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::io::{AsyncWriteExt, BufReader};
use tokio::process::Command;
use tokio::sync::mpsc;

/// Build a PATH that includes cargo/bin and common locations stripped from GUI app environments.
fn lsp_path(app: &AppHandle) -> String {
    let home = app.path().home_dir().ok()
        .map(|h| h.to_string_lossy().into_owned())
        .unwrap_or_default();
    let system = std::env::var("PATH").unwrap_or_default();
    let path = format!(
        "{home}/.cargo/bin:/usr/local/bin:/opt/homebrew/bin:/opt/homebrew/sbin:/usr/bin:/bin:{system}"
    );
    eprintln!("[lsp_path] PATH={}", path);
    path
}

#[derive(Serialize, Clone)]
struct LspMsg {
    server_id: String,
    msg: String,
}

#[tauri::command]
pub async fn lsp_start(
    state: State<'_, LspManagerState>,
    app: AppHandle,
    server_id: String,
    command: String,
    args: Vec<String>,
    workspace_root: String,
) -> Result<(), String> {
    {
        let map = state.0.lock().unwrap();
        if map.contains_key(&server_id) {
            return Ok(());
        }
    }

    let home = app.path().home_dir().ok()
        .map(|h| h.to_string_lossy().into_owned())
        .unwrap_or_default();

    eprintln!("[lsp_start] command={} args={:?} workspace={}", command, args, workspace_root);
    eprintln!("[lsp_start] PATH env={}", lsp_path(&app));

    let mut child = Command::new(&command)
        .args(&args)
        .current_dir(&workspace_root)
        .env("PATH", lsp_path(&app))
        .env("HOME", &home)
        .env("CARGO_HOME", format!("{home}/.cargo"))
        .env("RUSTUP_HOME", format!("{home}/.rustup"))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("Failed to spawn {command}: {e}"))?;

    let mut stdin = child.stdin.take().expect("stdin");
    let stdout = child.stdout.take().expect("stdout");

    let (tx, mut rx) = mpsc::unbounded_channel::<String>();

    tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            let frame = bridge::encode_message(&msg);
            if stdin.write_all(&frame).await.is_err() {
                break;
            }
            let _ = stdin.flush().await;
        }
    });

    let sid = server_id.clone();
    tokio::spawn(async move {
        let mut reader = BufReader::new(stdout);
        loop {
            match bridge::read_message(&mut reader).await {
                Ok(msg) => {
                    let _ = app.emit("lsp_msg", LspMsg { server_id: sid.clone(), msg });
                }
                Err(_) => break,
            }
        }
        let _ = child.wait().await;
    });

    state.0.lock().unwrap().insert(server_id, LspHandle { stdin_tx: tx });
    Ok(())
}

#[tauri::command]
pub async fn lsp_send(
    state: State<'_, LspManagerState>,
    server_id: String,
    message: String,
) -> Result<(), String> {
    let map = state.0.lock().unwrap();
    let handle = map
        .get(&server_id)
        .ok_or_else(|| format!("No LSP server: {server_id}"))?;
    handle.stdin_tx.send(message).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn lsp_stop(
    state: State<'_, LspManagerState>,
    server_id: String,
) -> Result<(), String> {
    state.0.lock().unwrap().remove(&server_id);
    Ok(())
}
