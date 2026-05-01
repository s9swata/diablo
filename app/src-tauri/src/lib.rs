mod commands;
mod lsp;
#[cfg(feature = "test-lsp")]
mod test_lsp;

use commands::fs::{fs_delete, fs_list, fs_mkdir, fs_read, fs_rename, fs_watch, fs_write};
use commands::git::{
    git_commit, git_diff_file, git_discard, git_log, git_pull, git_push, git_stage, git_status,
    git_unstage,
};
use commands::install::lsp_ensure;
use commands::lsp::{lsp_send, lsp_start, lsp_stop};
use commands::pty::{pty_kill, pty_resize, pty_spawn, pty_write, PtyState};
use commands::search::search_in_files;
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
        .manage(PtyState(Arc::new(Mutex::new(HashMap::new()))))
        .invoke_handler(tauri::generate_handler![
            fs_read, fs_write, fs_list, fs_watch, fs_rename, fs_delete, fs_mkdir,
            lsp_start, lsp_send, lsp_stop, lsp_ensure,
            pty_spawn, pty_write, pty_resize, pty_kill,
            search_in_files,
            git_status, git_diff_file, git_stage, git_unstage, git_discard,
            git_commit, git_push, git_pull, git_log,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
