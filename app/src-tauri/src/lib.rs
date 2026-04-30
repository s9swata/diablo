mod commands;
mod lsp;
#[cfg(feature = "test-lsp")]
mod test_lsp;

use commands::fs::{fs_list, fs_read, fs_watch, fs_write};
use commands::install::lsp_ensure;
use commands::lsp::{lsp_send, lsp_start, lsp_stop};
use lsp::manager::LspManagerState;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(LspManagerState(Arc::new(Mutex::new(HashMap::new()))))
        .invoke_handler(tauri::generate_handler![
            fs_read, fs_write, fs_list, fs_watch,
            lsp_start, lsp_send, lsp_stop, lsp_ensure,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
