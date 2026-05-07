use anyhow::{anyhow, Result};
use serde::Serialize;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter, Manager};
use tokio::process::Command;

#[derive(Serialize, Clone)]
pub struct ServerSpec {
    pub command: String,
    pub args: Vec<String>,
}

#[derive(Serialize, Clone)]
struct InstallProgress {
    language: String,
    message: String,
    progress: Option<f32>,
}

fn emit(app: &AppHandle, lang: &str, msg: &str, progress: Option<f32>) {
    let _ = app.emit(
        "lsp_install_progress",
        InstallProgress { language: lang.to_string(), message: msg.to_string(), progress },
    );
}

#[allow(dead_code)]
fn home_dir(app: &AppHandle) -> Option<PathBuf> {
    app.path().home_dir().ok()
}

fn servers_dir(app: &AppHandle) -> PathBuf {
    app.path()
        .app_local_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("servers")
}

fn extended_path_custom(extra: &str) -> String {
    let base = std::env::var("PATH").unwrap_or_default();
    format!("{extra}:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:{base}")
}

async fn find_binary(name: &str) -> Option<String> {
    if let Ok(out) = Command::new("which").arg(name).output().await {
        if out.status.success() {
            if let Ok(s) = String::from_utf8(out.stdout) {
                let trimmed = s.trim().to_string();
                if !trimmed.is_empty() {
                    return Some(trimmed);
                }
            }
        }
    }
    let candidates = [
        "/usr/local/bin",
        "/opt/homebrew/bin",
        "/opt/homebrew/sbin",
        "/usr/bin",
        "/bin",
    ];
    for dir in candidates {
        let p = PathBuf::from(dir).join(name);
        if p.exists() {
            return Some(p.to_string_lossy().into());
        }
    }
    None
}

async fn find_binary_in_dir(name: &str, dir: &Path) -> Option<String> {
    let candidates = ["bin", ".cargo/bin", "node_modules/.bin"];
    for subdir in candidates {
        let p = dir.join(subdir).join(name);
        if p.exists() {
            return Some(p.to_string_lossy().into());
        }
    }
    None
}

// ── Node.js Installation ───────────────────────────────────────────────────────────

async fn ensure_node(app: &AppHandle, servers_dir: &Path) -> Result<PathBuf> {
    if let Some(p) = find_binary("node").await {
        return Ok(PathBuf::from(p));
    }

    if let Some(p) = find_binary_in_dir("node", servers_dir).await {
        return Ok(p.into());
    }

    emit(app, "node", "Installing Node.js...", None);

    let (url, _archive_type) = if cfg!(target_os = "macos") {
        ("https://nodejs.org/dist/v20.18.0/node-v20.18.0-darwin-arm64.tar.gz", "tar")
    } else {
        ("https://nodejs.org/dist/v20.18.0/node-v20.18.0-linux-x64.tar.gz", "tar")
    };

    let archive = servers_dir.join("node.tar.gz");
    let extract_dir = servers_dir.join("node-extract");

    tokio::fs::create_dir_all(&extract_dir).await?;

    let mut child = Command::new("curl")
        .args(["-L", url, "-o", &archive.to_string_lossy()])
        .spawn()?;

    let _ = child.wait().await?;

    let status = Command::new("tar")
        .args(["-xf", &archive.to_string_lossy(), "-C", &extract_dir.to_string_lossy()])
        .status()
        .await?;

    if !status.success() {
        return Err(anyhow!("Failed to extract Node.js"));
    }

    let node_path = extract_dir.join("node-v20.18.0-darwin-arm64/bin/node");
    if node_path.exists() {
        let bin_dir = servers_dir.join("bin");
        tokio::fs::create_dir_all(&bin_dir).await?;
        tokio::fs::copy(&node_path, bin_dir.join("node")).await?;
        tokio::fs::remove_file(&archive).await?;
        emit(app, "node", "Node.js installed", None);
        Ok(bin_dir.join("node"))
    } else {
        Err(anyhow!("Node.js extraction failed"))
    }
}

// ── Rust Installation ─────────────────────────────────────────────────────────

async fn ensure_rustup(app: &AppHandle, servers_dir: &Path) -> Result<PathBuf> {
    if let Some(p) = find_binary("rustup").await {
        return Ok(PathBuf::from(p));
    }

    if let Some(p) = find_binary_in_dir("rustup", servers_dir).await {
        return Ok(p.into());
    }

    emit(app, "rust", "Installing Rust toolchain...", None);

    let rustup_path = servers_dir.join("bin").join("rustup");
    if rustup_path.exists() {
        return Ok(rustup_path);
    }

    let rustup_url = if cfg!(target_os = "macos") {
        if cfg!(target_arch = "aarch64") {
            "https://rustup.rs/aarch64-apple-darwin/rustup-init"
        } else {
            "https://rustup.rs/x86_64-apple-darwin/rustup-init"
        }
    } else {
        "https://rustup.rs/x86_64-unknown-linux-gnu/rustup-init"
    };

    let bin_dir = servers_dir.join("bin");
    tokio::fs::create_dir_all(&bin_dir).await?;

    let rustup_exe = bin_dir.join("rustup-init");
    let mut child = Command::new("curl")
        .args(["-L", rustup_url, "-o", &rustup_exe.to_string_lossy(), "--fail"])
        .spawn()?;
    let status = child.wait().await?;
    if !status.success() {
        return Err(anyhow!("Failed to download rustup"));
    }

    #[cfg(target_os = "macos")]
    {
        let _ = Command::new("chmod")
            .args(["+x", &rustup_exe.to_string_lossy()])
            .status()
            .await?;

        let cargo_home = servers_dir.join("cargo");
        let rustup_home = servers_dir.join("rustup");

        let output = Command::new(&rustup_exe)
            .args([
                "-y",
                "--no-modify-path",
                &format!("--cargo-home={}", cargo_home.display()),
                &format!("--rustup-home={}", rustup_home.display()),
            ])
            .env("CARGO_HOME", cargo_home.clone())
            .env("RUSTUP_HOME", rustup_home.clone())
            .output()
            .await?;

        if !output.status.success() {
            return Err(anyhow!("rustup installation failed"));
        }

        let final_rustup = cargo_home.join("bin").join("rustup");
        if final_rustup.exists() {
            emit(app, "rust", "Rust toolchain installed", None);
            return Ok(final_rustup);
        }
    }

    Ok(rustup_path)
}

async fn ensure_rust_analyzer(app: &AppHandle, servers_dir: &Path) -> Result<ServerSpec> {
    emit(app, "rust", "Checking for rust-analyzer...", None);

    if let Some(p) = find_binary("rust-analyzer").await {
        emit(app, "rust", "rust-analyzer found", None);
        return Ok(ServerSpec { command: p, args: vec![] });
    }

    let app_bin_dir = servers_dir.join("bin");
    let local_ra = app_bin_dir.join("rust-analyzer");
    if local_ra.exists() {
        emit(app, "rust", "rust-analyzer found", None);
        return Ok(ServerSpec { command: local_ra.to_string_lossy().into(), args: vec![] });
    }

    emit(app, "rust", "Installing rust-analyzer...", None);

    let _ = ensure_rustup(app, servers_dir).await;

    let ra_url = if cfg!(target_os = "macos") {
        if cfg!(target_arch = "aarch64") {
            "https://github.com/rust-lang/rust-analyzer/releases/download/2026-04-20/rust-analyzer-aarch64-apple-darwin.gz"
        } else {
            "https://github.com/rust-lang/rust-analyzer/releases/download/2026-04-20/rust-analyzer-x86_64-apple-darwin.gz"
        }
    } else {
        "https://github.com/rust-lang/rust-analyzer/releases/download/2026-04-20/rust-analyzer-x86_64-unknown-linux-gnu.gz"
    };

    let archive = servers_dir.join("ra.tar.gz");
    let extract_dir = servers_dir.join("ra-extract");

    tokio::fs::create_dir_all(&extract_dir).await?;

    let mut child = Command::new("curl")
        .args(["-L", ra_url, "-o", &archive.to_string_lossy()])
        .spawn()?;
    let _ = child.wait().await?;

    let _status = Command::new("tar")
        .args(["-xzf", &archive.to_string_lossy(), "-C", &extract_dir.to_string_lossy()])
        .status()
        .await?;

    tokio::fs::create_dir_all(&app_bin_dir).await?;

    let extracted_bin = if cfg!(target_os = "macos") {
        if cfg!(target_arch = "aarch64") {
            extract_dir.join("rust-analyzer-aarch64-apple-darwin").join("rust-analyzer")
        } else {
            extract_dir.join("rust-analyzer-x86_64-apple-darwin").join("rust-analyzer")
        }
    } else {
        extract_dir.join("rust-analyzer-x86_64-unknown-linux-gnu").join("rust-analyzer")
    };

    if extracted_bin.exists() {
        tokio::fs::copy(&extracted_bin, &local_ra).await?;
    } else {
        return Err(anyhow!("rust-analyzer binary not found in archive"));
    }

    emit(app, "rust", "rust-analyzer ready", None);
    Ok(ServerSpec { command: local_ra.to_string_lossy().into(), args: vec![] })
}

// ── TypeScript/JavaScript (TLS) ─────────────────────────────────────────────

async fn ensure_typescript_server(app: &AppHandle, servers_dir: &Path) -> Result<ServerSpec> {
    emit(app, "typescript", "Checking for typescript-language-server...", None);

    if let Some(p) = find_binary("typescript-language-server").await {
        emit(app, "typescript", "typescript-language-server found", None);
        return Ok(ServerSpec { command: p, args: vec!["--stdio".into()] });
    }

    let local_bin = servers_dir.join("bin").join("typescript-language-server");
    if local_bin.exists() {
        emit(app, "typescript", "typescript-language-server found", None);
        return Ok(ServerSpec { command: local_bin.to_string_lossy().into(), args: vec!["--stdio".into()] });
    }

    emit(app, "typescript", "Installing Node.js...", None);
    let node = ensure_node(app, servers_dir).await?;

    let npm = node.parent().map(|p| p.join("npm")).unwrap_or_else(|| PathBuf::from("npm"));
    if !npm.exists() {
        return Err(anyhow!("npm not found"));
    }

    emit(app, "typescript", "Installing typescript-language-server...", None);

    let packages = ["typescript-language-server", "typescript"];
    let _npx = npm.parent().map(|p| p.join("npx")).unwrap_or_else(|| PathBuf::from("npx"));

    for pkg in &packages {
        let status = Command::new(&npm)
            .arg("install")
            .arg("-g")
            .arg(pkg)
            .env("PATH", extended_path_custom(&servers_dir.join("bin").to_string_lossy()))
            .status()
            .await?;

        if !status.success() {
            return Err(anyhow!("Failed to install {}", pkg));
        }
    }

    if let Some(p) = find_binary_in_dir("typescript-language-server", servers_dir).await {
        emit(app, "typescript", "typescript-language-server ready", None);
        return Ok(ServerSpec { command: p, args: vec!["--stdio".into()] });
    }

    let ts_bin = servers_dir.join("lib").join("node_modules").join("typescript-language-server").join("bin").join("tsserver");
    if ts_bin.exists() {
        emit(app, "typescript", "typescript-language-server ready", None);
        return Ok(ServerSpec { command: ts_bin.to_string_lossy().into(), args: vec!["--stdio".into()] });
    }

    Err(anyhow!("typescript-language-server not found"))
}

// ── Python (Pyright) ────────────────────────────────────────────────────────

async fn ensure_pyright(app: &AppHandle, servers_dir: &Path) -> Result<ServerSpec> {
    emit(app, "python", "Checking for pyright-langserver...", None);

    // pyright-langserver is the LSP binary; "pyright" is just the CLI type-checker
    if let Some(p) = find_binary("pyright-langserver").await {
        emit(app, "python", "pyright-langserver found", None);
        return Ok(ServerSpec { command: p, args: vec!["--stdio".into()] });
    }

    if let Some(p) = find_binary_in_dir("pyright-langserver", servers_dir).await {
        emit(app, "python", "pyright-langserver found", None);
        return Ok(ServerSpec { command: p, args: vec!["--stdio".into()] });
    }

    emit(app, "python", "Installing Node.js...", None);
    let node = ensure_node(app, servers_dir).await?;

    let npm = node.parent().map(|p| p.join("npm")).unwrap_or_else(|| PathBuf::from("npm"));
    if !npm.exists() {
        return Err(anyhow!("npm not found"));
    }

    emit(app, "python", "Installing pyright...", None);

    let status = Command::new(&npm)
        .arg("install")
        .arg("-g")
        .arg("pyright")
        .env("PATH", extended_path_custom(&servers_dir.join("bin").to_string_lossy()))
        .status()
        .await?;

    if !status.success() {
        return Err(anyhow!("Failed to install pyright"));
    }

    if let Some(p) = find_binary_in_dir("pyright-langserver", servers_dir).await {
        emit(app, "python", "pyright ready", None);
        return Ok(ServerSpec { command: p, args: vec!["--stdio".into()] });
    }

    Err(anyhow!("pyright-langserver not found after installation"))
}

// ── C++ (Clangd) ─────────────────────────────────────────────────────────────

async fn ensure_clangd(app: &AppHandle, servers_dir: &Path) -> Result<ServerSpec> {
    emit(app, "cpp", "Checking for clangd...", None);

    if let Some(p) = find_binary("clangd").await {
        emit(app, "cpp", "clangd found", None);
        return Ok(ServerSpec { command: p, args: vec![] });
    }

    if let Some(p) = find_binary_in_dir("clangd", servers_dir).await {
        emit(app, "cpp", "clangd found", None);
        return Ok(ServerSpec { command: p, args: vec![] });
    }

    emit(app, "cpp", "Installing clangd...", None);

    let (clangd_url, extract_dir) = if cfg!(target_os = "macos") {
        ("https://github.com/llvm/llvm-project/releases/download/llvmorg-18.1.8/clangd-18.1.8-x86_64-apple-darwin.tar.zst", servers_dir.join("clangd-extract"))
    } else {
        ("https://github.com/llvm/llvm-project/releases/download/llvmorg-18.1.8/clangd-18.1.8-x86_64-linux-gnu.tar.zst", servers_dir.join("clangd-extract"))
    };

    let archive = servers_dir.join("clangd.tar.zst");

    let mut child = Command::new("curl")
        .args(["-L", clangd_url, "-o", &archive.to_string_lossy()])
        .spawn()?;
    let _ = child.wait().await?;

    tokio::fs::create_dir_all(&extract_dir).await?;

    let _status = Command::new("tar")
        .args(["-xf", &archive.to_string_lossy(), "-C", &extract_dir.to_string_lossy()])
        .status()
        .await?;

    let clangd_bin = extract_dir.join("clangd-18.1.8-x86_64-apple-darwin").join("bin").join("clangd");
    if !clangd_bin.exists() {
        return Err(anyhow!("clangd not found in archive"));
    }

    let bin_dir = servers_dir.join("bin");
    tokio::fs::create_dir_all(&bin_dir).await?;
    tokio::fs::copy(&clangd_bin, bin_dir.join("clangd")).await?;

    emit(app, "cpp", "clangd ready", None);
    Ok(ServerSpec { command: bin_dir.join("clangd").to_string_lossy().into(), args: vec![] })
}

// ── Go (gopls) ───────────────────────────────────────────────────────────────

async fn ensure_gopls(app: &AppHandle, servers_dir: &Path) -> Result<ServerSpec> {
    emit(app, "go", "Checking for gopls...", None);

    if let Some(p) = find_binary("gopls").await {
        emit(app, "go", "gopls found", None);
        return Ok(ServerSpec { command: p, args: vec![] });
    }

    let local_bin = servers_dir.join("bin").join("gopls");
    if local_bin.exists() {
        emit(app, "go", "gopls found", None);
        return Ok(ServerSpec { command: local_bin.to_string_lossy().into(), args: vec![] });
    }

    // Try `go install` if go is available
    emit(app, "go", "Installing gopls via go install...", None);
    if let Some(go_bin) = find_binary("go").await {
        let bin_dir = servers_dir.join("bin");
        tokio::fs::create_dir_all(&bin_dir).await?;
        let status = Command::new(&go_bin)
            .args(["install", "golang.org/x/tools/gopls@latest"])
            .env("GOBIN", &bin_dir)
            .status()
            .await?;

        if status.success() {
            if local_bin.exists() {
                emit(app, "go", "gopls ready", None);
                return Ok(ServerSpec { command: local_bin.to_string_lossy().into(), args: vec![] });
            }
        }
    }

    Err(anyhow!("gopls not found. Install Go and run: go install golang.org/x/tools/gopls@latest"))
}

// ── Public Command ───────────────────────────────────────────────────────────

#[tauri::command]
pub async fn lsp_ensure(app: AppHandle, language: String) -> Result<ServerSpec, String> {
    let servers_dir = servers_dir(&app);

    tokio::fs::create_dir_all(&servers_dir)
        .await
        .map_err(|e| e.to_string())?;

    match language.as_str() {
        "rust" => ensure_rust_analyzer(&app, &servers_dir).await,
        "typescript" | "javascript" => ensure_typescript_server(&app, &servers_dir).await,
        "python" => ensure_pyright(&app, &servers_dir).await,
        "cpp" | "c" | "c++" => ensure_clangd(&app, &servers_dir).await,
        "go" => ensure_gopls(&app, &servers_dir).await,
        _ => Err(anyhow!("No LSP server available for language: {language}")),
    }
    .map_err(|e| e.to_string())
}