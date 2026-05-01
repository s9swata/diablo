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

use tauri::menu::{
    AboutMetadata, Menu, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder,
};
use tauri::Emitter;

fn build_menu(app: &tauri::AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    // ── File ──────────────────────────────────────────────────────────────
    let file_new = MenuItemBuilder::with_id("file_new", "New File")
        .accelerator("CmdOrCtrl+N")
        .build(app)?;
    let file_open = MenuItemBuilder::with_id("file_open", "Open Folder…")
        .accelerator("CmdOrCtrl+O")
        .build(app)?;
    let file_save = MenuItemBuilder::with_id("file_save", "Save")
        .accelerator("CmdOrCtrl+S")
        .build(app)?;
    let file_close = MenuItemBuilder::with_id("file_close", "Close File")
        .accelerator("CmdOrCtrl+W")
        .build(app)?;

    let file_menu = SubmenuBuilder::new(app, "File")
        .item(&file_new)
        .item(&file_open)
        .separator()
        .item(&file_save)
        .item(&file_close)
        .build()?;

    // ── Edit ──────────────────────────────────────────────────────────────
    let edit_find = MenuItemBuilder::with_id("edit_find", "Find")
        .accelerator("CmdOrCtrl+F")
        .build(app)?;
    let edit_replace = MenuItemBuilder::with_id("edit_replace", "Replace")
        .accelerator("CmdOrCtrl+H")
        .build(app)?;
    let edit_find_in_files = MenuItemBuilder::with_id("edit_find_files", "Find in Files")
        .accelerator("CmdOrCtrl+Shift+F")
        .build(app)?;

    let edit_menu = SubmenuBuilder::new(app, "Edit")
        .item(&PredefinedMenuItem::undo(app, None)?)
        .item(&PredefinedMenuItem::redo(app, None)?)
        .separator()
        .item(&PredefinedMenuItem::cut(app, None)?)
        .item(&PredefinedMenuItem::copy(app, None)?)
        .item(&PredefinedMenuItem::paste(app, None)?)
        .item(&PredefinedMenuItem::select_all(app, None)?)
        .separator()
        .item(&edit_find)
        .item(&edit_replace)
        .item(&edit_find_in_files)
        .build()?;

    // ── View ──────────────────────────────────────────────────────────────
    let view_sidebar = MenuItemBuilder::with_id("view_sidebar", "Toggle Sidebar")
        .accelerator("CmdOrCtrl+B")
        .build(app)?;
    let view_terminal = MenuItemBuilder::with_id("view_terminal", "Toggle Terminal")
        .accelerator("Ctrl+`")
        .build(app)?;
    let view_minimap = MenuItemBuilder::with_id("view_minimap", "Toggle Minimap")
        .build(app)?;
    let view_wordwrap = MenuItemBuilder::with_id("view_wordwrap", "Toggle Word Wrap")
        .accelerator("Alt+Z")
        .build(app)?;
    let view_zoom_in = MenuItemBuilder::with_id("view_zoom_in", "Zoom In")
        .accelerator("CmdOrCtrl+=")
        .build(app)?;
    let view_zoom_out = MenuItemBuilder::with_id("view_zoom_out", "Zoom Out")
        .accelerator("CmdOrCtrl+-")
        .build(app)?;
    let view_zoom_reset = MenuItemBuilder::with_id("view_zoom_reset", "Reset Zoom")
        .accelerator("CmdOrCtrl+0")
        .build(app)?;

    let view_menu = SubmenuBuilder::new(app, "View")
        .item(&view_sidebar)
        .item(&view_terminal)
        .item(&view_minimap)
        .item(&view_wordwrap)
        .separator()
        .item(&view_zoom_in)
        .item(&view_zoom_out)
        .item(&view_zoom_reset)
        .build()?;

    // ── Window ────────────────────────────────────────────────────────────
    let window_menu = SubmenuBuilder::new(app, "Window")
        .item(&PredefinedMenuItem::minimize(app, None)?)
        .item(&PredefinedMenuItem::maximize(app, None)?)
        .separator()
        .item(&PredefinedMenuItem::close_window(app, None)?)
        .build()?;

    // ── Help ──────────────────────────────────────────────────────────────
    let help_about = MenuItemBuilder::with_id("help_about", "About Diablo")
        .build(app)?;

    let help_menu = SubmenuBuilder::new(app, "Help")
        .item(&help_about)
        .build()?;

    // ── App menu (macOS: app name) ─────────────────────────────────────
    let app_menu = SubmenuBuilder::new(app, "Diablo")
        .item(&PredefinedMenuItem::about(
            app,
            None,
            Some(AboutMetadata {
                name: Some("Diablo".to_string()),
                version: Some("0.1.0".to_string()),
                short_version: Some("0.1.0".to_string()),
                copyright: Some("© 2025 Diablo".to_string()),
                ..Default::default()
            }),
        )?)
        .separator()
        .item(&PredefinedMenuItem::hide(app, None)?)
        .item(&PredefinedMenuItem::hide_others(app, None)?)
        .separator()
        .item(&PredefinedMenuItem::quit(app, None)?)
        .build()?;

    let menu = Menu::new(app)?;
    menu.append(&app_menu)?;
    menu.append(&file_menu)?;
    menu.append(&edit_menu)?;
    menu.append(&view_menu)?;
    menu.append(&window_menu)?;
    menu.append(&help_menu)?;

    Ok(menu)
}

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
        .setup(|app| {
            let menu = build_menu(app.handle())?;
            app.set_menu(menu)?;
            Ok(())
        })
        .on_menu_event(|app, event| {
            // Forward every menu event id to the frontend
            let _ = app.emit("menu-action", event.id().0.clone());
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
