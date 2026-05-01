use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, State};

static PTY_COUNTER: AtomicU32 = AtomicU32::new(1);

pub(crate) struct PtyHandle {
    master: Box<dyn portable_pty::MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn portable_pty::Child + Send + Sync>,
}

pub struct PtyState(pub Arc<Mutex<HashMap<u32, PtyHandle>>>);

#[tauri::command]
pub async fn pty_spawn(
    app: AppHandle,
    cwd: Option<String>,
    state: State<'_, PtyState>,
) -> Result<u32, String> {
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize { rows: 24, cols: 80, pixel_width: 0, pixel_height: 0 })
        .map_err(|e| e.to_string())?;

    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
    let mut cmd = CommandBuilder::new(&shell);
    cmd.arg("-l");
    if let Some(dir) = &cwd {
        cmd.cwd(dir);
    }

    let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    drop(pair.slave);

    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;

    let id = PTY_COUNTER.fetch_add(1, Ordering::SeqCst);

    let app_clone = app.clone();
    tokio::task::spawn_blocking(move || {
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buf[..n]).to_string();
                    let _ = app_clone.emit(&format!("pty_output_{}", id), data);
                }
            }
        }
        let _ = app_clone.emit(&format!("pty_closed_{}", id), ());
    });

    state.0.lock().unwrap().insert(id, PtyHandle { master: pair.master, writer, child });

    Ok(id)
}

#[tauri::command]
pub async fn pty_write(
    id: u32,
    data: String,
    state: State<'_, PtyState>,
) -> Result<(), String> {
    let mut map = state.0.lock().unwrap();
    if let Some(handle) = map.get_mut(&id) {
        handle.writer.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn pty_resize(
    id: u32,
    rows: u16,
    cols: u16,
    state: State<'_, PtyState>,
) -> Result<(), String> {
    let map = state.0.lock().unwrap();
    if let Some(handle) = map.get(&id) {
        handle
            .master
            .resize(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn pty_kill(
    id: u32,
    state: State<'_, PtyState>,
) -> Result<(), String> {
    let mut map = state.0.lock().unwrap();
    if let Some(mut handle) = map.remove(&id) {
        let _ = handle.child.kill();
    }
    Ok(())
}
