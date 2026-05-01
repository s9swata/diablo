use ignore::WalkBuilder;
use serde::Serialize;

#[derive(Serialize)]
pub struct SearchMatch {
    pub file: String,
    pub line: u32,
    pub text: String,
    pub match_start: usize,
    pub match_end: usize,
}

#[tauri::command]
pub async fn search_in_files(
    root: String,
    query: String,
    case_sensitive: bool,
) -> Result<Vec<SearchMatch>, String> {
    if query.is_empty() {
        return Ok(vec![]);
    }

    tokio::task::spawn_blocking(move || {
        let mut results = Vec::new();
        let query_lower = query.to_lowercase();

        for entry in WalkBuilder::new(&root).build().flatten() {
            if results.len() >= 1000 {
                break;
            }
            let path = entry.path();
            if !path.is_file() {
                continue;
            }
            // Skip likely-binary extensions
            if let Some(ext) = path.extension() {
                let e = ext.to_string_lossy().to_lowercase();
                if matches!(
                    e.as_str(),
                    "png" | "jpg" | "jpeg" | "gif" | "svg" | "ico" | "wasm"
                        | "bin" | "lock" | "ttf" | "otf" | "woff" | "woff2"
                ) {
                    continue;
                }
            }

            let Ok(content) = std::fs::read_to_string(path) else {
                continue;
            };
            let file_path = path.to_string_lossy().to_string();

            for (idx, line_text) in content.lines().enumerate() {
                if results.len() >= 1000 {
                    break;
                }
                let haystack = if case_sensitive {
                    line_text.to_string()
                } else {
                    line_text.to_lowercase()
                };
                let needle = if case_sensitive { &query } else { &query_lower };

                if let Some(match_start) = haystack.find(needle.as_str()) {
                    results.push(SearchMatch {
                        file: file_path.clone(),
                        line: (idx + 1) as u32,
                        text: line_text.to_string(),
                        match_start,
                        match_end: match_start + query.len(),
                    });
                }
            }
        }

        Ok(results)
    })
    .await
    .map_err(|e| e.to_string())?
}
