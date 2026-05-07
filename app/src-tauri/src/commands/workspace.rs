use std::path::Path;

#[tauri::command]
pub async fn resolve_workspace_root(file_path: String, language: String) -> String {
    // manifest files that define a project root per language
    let manifests: &[&str] = match language.as_str() {
        "rust"                       => &["Cargo.toml"],
        "go"                         => &["go.mod"],
        "python"                     => &["pyproject.toml", "setup.py", "setup.cfg", "requirements.txt"],
        "typescript" | "javascript"  => &["package.json", "tsconfig.json"],
        "cpp" | "c"                  => &["CMakeLists.txt", "compile_commands.json", "Makefile"],
        _                            => &[],
    };

    let path = Path::new(&file_path);
    let start = path.parent().unwrap_or(path);

    if !manifests.is_empty() {
        let mut current = start;
        loop {
            for manifest in manifests {
                if current.join(manifest).exists() {
                    return current.to_string_lossy().into_owned();
                }
            }
            match current.parent() {
                Some(p) if p != current => current = p,
                _ => break,
            }
        }
    }

    // fallback: the file's own directory
    start.to_string_lossy().into_owned()
}
