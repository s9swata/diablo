use tree_sitter::{Language, Node, Parser};
use walkdir::WalkDir;

const TOKEN_BUDGET: usize = 512;
const EXTENSIONS: &[&str] = &["rs", "ts", "tsx", "js", "jsx", "py", "go", "java", "kt", "c", "cpp", "h", "md"];

pub struct ChunkOutput {
    pub path: String,
    pub start_line: usize,
    pub end_line: usize,
    pub content: String,
    pub lang: String,
    pub parent_scope: String,
    pub imports: String,
}

fn token_estimate(text: &str) -> usize {
    text.len() / 4
}

pub fn get_language(ext: &str) -> Option<Language> {
    match ext {
        "rs" => Some(tree_sitter_rust::LANGUAGE.into()),
        "ts" | "tsx" => Some(tree_sitter_typescript::LANGUAGE_TYPESCRIPT.into()),
        "js" | "jsx" => Some(tree_sitter_javascript::LANGUAGE.into()),
        "py" => Some(tree_sitter_python::LANGUAGE.into()),
        "go" => Some(tree_sitter_go::LANGUAGE.into()),
        _ => None,
    }
}

fn resolve_language(lang: &Language, path: &str) -> Language {
    let ext = std::path::Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("");
    if ext == "tsx" {
        tree_sitter_typescript::LANGUAGE_TSX.into()
    } else {
        lang.clone()
    }
}

pub fn is_indexable(path: &str) -> bool {
    if let Some(ext) = std::path::Path::new(path).extension() {
        EXTENSIONS.contains(&ext.to_string_lossy().to_lowercase().as_str())
    } else {
        false
    }
}

pub fn count_files(root: &str) -> u64 {
    WalkDir::new(root)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| {
            let path = e.path();
            path.is_file()
                && !path
                    .to_string_lossy()
                    .split(std::path::MAIN_SEPARATOR)
                    .any(|c| c.starts_with('.') || c == "node_modules" || c == "target")
                && is_indexable(&path.to_string_lossy())
        })
        .count() as u64
}

pub fn iter_files(root: &str) -> impl Iterator<Item = String> {
    WalkDir::new(root)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| {
            let path = e.path();
            path.is_file()
                && !path
                    .to_string_lossy()
                    .split(std::path::MAIN_SEPARATOR)
                    .any(|c| c.starts_with('.') || c == "node_modules" || c == "target")
                && is_indexable(&path.to_string_lossy())
        })
        .map(|e| e.path().to_string_lossy().to_string())
        .collect::<Vec<_>>()
        .into_iter()
}

pub fn chunk_file(path: &str, source: &str, lang: Option<Language>) -> Vec<ChunkOutput> {
    let ext = std::path::Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("");

    if token_estimate(source) <= TOKEN_BUDGET {
        return vec![ChunkOutput {
            path: path.to_string(),
            start_line: 1,
            end_line: source.lines().count().max(1),
            content: source.to_string(),
            lang: ext.to_string(),
            parent_scope: String::new(),
            imports: String::new(),
        }];
    }

    let lang2 = match lang {
        Some(l) => resolve_language(&l, path),
        None => return sliding_window(path, source, ext),
    };

    let mut parser = Parser::new();
    let lang_lang = lang2;
    let lang_ref = &lang_lang;
    parser.set_language(lang_ref).ok();
    let Some(tree) = parser.parse(source, None) else {
        return sliding_window(path, source, ext);
    };
    let root = tree.root_node();

    let children: Vec<Node<'_>> = root
        .children(&mut root.walk())
        .filter(|n| n.is_named())
        .collect();

    if children.len() <= 2 || source.lines().count() <= 80 {
        return vec![ChunkOutput {
            path: path.to_string(),
            start_line: 1,
            end_line: source.lines().count().max(1),
            content: source.to_string(),
            lang: ext.to_string(),
            parent_scope: String::new(),
            imports: String::new(),
        }];
    }

    let imports = extract_imports(source);
    let node_types = node_types_for(ext);
    let mut chunks = Vec::new();

    for child in &children {
        if !node_types.contains(&child.kind()) {
            if let Some(chunks_from) = chunk_node_recursive(child, path, ext, source, &imports, &node_types) {
                chunks.extend(chunks_from);
            }
            continue;
        }

        let start = child.start_position().row + 1;
        let end = child.end_position().row + 1;
        let text = source
            .lines()
            .skip(start.saturating_sub(1))
            .take(end.saturating_sub(start.saturating_sub(1)))
            .collect::<Vec<_>>()
            .join("\n");
            let text = text;
            if token_estimate(&text) <= TOKEN_BUDGET {
                let parent = parent_scope_name(child, source.as_bytes());
                chunks.push(ChunkOutput {
                    path: path.to_string(),
                    start_line: start,
                    end_line: end,
                    content: text,
                    lang: ext.to_string(),
                    parent_scope: parent,
                    imports: imports.clone(),
                });
            } else {
                if let Some(mut sub) = chunk_node_recursive(child, path, ext, source, &imports, &node_types) {
                    chunks.append(&mut sub);
                }
            }
        }

    if chunks.is_empty() {
        sliding_window(path, source, ext)
    } else {
        chunks
    }
}

fn chunk_node_recursive<'a>(
    node: &Node<'a>,
    path: &str,
    ext: &str,
    source: &'a str,
    imports: &str,
    node_types: &[&str],
) -> Option<Vec<ChunkOutput>> {
    let mut output = Vec::new();
    let mut cursor = node.walk();

    let parent =
        if matches!(node.kind(), "impl_item" | "class_declaration" | "class_definition") {
            Some(parent_scope_name(node, source.as_bytes()))
        } else {
            None
        };
    let parent2 = parent
        .as_ref()
        .map(|p| p.as_str())
        .unwrap_or("");

    for child in node.children(&mut cursor) {
        if !child.is_named() {
            continue;
        }
        if !node_types.contains(&child.kind()) {
            if child.child_count() > 0 {
                if let Some(mut nested) =
                    chunk_node_recursive(&child, path, ext, source, imports, node_types)
                {
                    output.append(&mut nested);
                }
            }
            continue;
        }

        let start = child.start_position().row + 1;
        let end = child.end_position().row + 1;
        let text_slice: String = source
            .lines()
            .skip(start - 1)
            .take(end - start + 1)
            .collect::<Vec<&str>>()
            .join("\n");

        let scope = if parent2.is_empty() {
            String::new()
        } else {
            format!("{}|{}", parent2, child.kind())
        };

        if token_estimate(&text_slice) <= TOKEN_BUDGET {
            output.push(ChunkOutput {
                path: path.to_string(),
                start_line: start,
                end_line: end,
                content: text_slice,
                lang: ext.to_string(),
                parent_scope: scope,
                imports: imports.to_string(),
            });
        } else {
            let stubbed = stub_method_body(&text_slice);
            output.push(ChunkOutput {
                path: path.to_string(),
                start_line: start,
                end_line: end,
                content: stubbed,
                lang: ext.to_string(),
                parent_scope: scope,
                imports: imports.to_string(),
            });
        }
    }

    if output.is_empty() { None } else { Some(output) }
}

fn parent_scope_name(node: &Node, source: &[u8]) -> String {
    for child in node.children(&mut node.walk()) {
        if child.is_named()
            && matches!(
                child.kind(),
                "type_identifier"
                    | "identifier"
                    | "name"
                    | "class_name"
                    | "function_name"
                    | "struct_name"
            )
        {
            if let Ok(name) = child.utf8_text(source) {
                return format!("{} {}", node.kind(), name);
            }
        }
    }
    node.kind().to_string()
}

fn node_types_for(ext: &str) -> &[&str] {
    match ext {
        "rs" => &[
            "function_item",
            "impl_item",
            "struct_item",
            "trait_item",
            "enum_item",
            "mod_item",
            "macro_definition",
        ],
        "ts" | "tsx" | "js" | "jsx" => &[
            "function_declaration",
            "class_declaration",
            "method_definition",
            "interface_declaration",
            "type_alias_declaration",
            "lexical_declaration",
            "export_statement",
        ],
        "py" => &["function_definition", "class_definition", "decorated_definition"],
        "go" => &[
            "function_declaration",
            "method_declaration",
            "type_declaration",
            "interface_type",
        ],
        _ => &[],
    }
}

fn extract_imports(source: &str) -> String {
    let lines: Vec<&str> = source.lines().collect();
    let count = lines.len().min(20);
    let first20: Vec<&str> = lines[..count].to_vec();
    let imports: Vec<&str> = first20
        .iter()
        .filter(|l| {
            let t = l.trim();
            t.starts_with("use ") || t.starts_with("import ") || t.starts_with("from ")
        })
        .take(10)
        .map(|s| *s)
        .collect();
    imports.join("\n")
}

fn stub_method_body(text: &str) -> String {
    let lines: Vec<&str> = text.lines().collect();
    if lines.is_empty() {
        return text.to_string();
    }
    let mut out = Vec::new();
    out.push(lines[0].to_string());
    let mut depth = 0;
    let mut in_body = false;
    for line in &lines[1..] {
        let trimmed = line.trim();
        if trimmed.contains('{') {
            depth += trimmed.matches('{').count() as i32;
            in_body = true;
        }
        if trimmed.contains('}') {
            depth -= trimmed.matches('}').count() as i32;
        }
        if in_body && depth == 0 {
            out.push("    // ...".to_string());
            out.push(line.to_string());
            in_body = false;
        } else if !in_body {
            out.push(line.to_string());
        }
    }
    out.join("\n")
}

fn sliding_window(path: &str, source: &str, ext: &str) -> Vec<ChunkOutput> {
    let lines: Vec<&str> = source.lines().collect();
    let window = 50;
    let overlap = 10;

    if lines.len() <= window {
        return vec![ChunkOutput {
            path: path.to_string(),
            start_line: 1,
            end_line: lines.len().max(1),
            content: source.to_string(),
            lang: ext.to_string(),
            parent_scope: String::new(),
            imports: String::new(),
        }];
    }

    let mut chunks = Vec::new();
    let mut start = 0usize;
    while start < lines.len() {
        let end = (start + window).min(lines.len());
        let content = lines[start..end].join("\n");
        chunks.push(ChunkOutput {
            path: path.to_string(),
            start_line: start + 1,
            end_line: end,
            content,
            lang: ext.to_string(),
            parent_scope: String::new(),
            imports: String::new(),
        });
        if end >= lines.len() {
            break;
        }
        start = end.saturating_sub(overlap);
    }
    chunks
}