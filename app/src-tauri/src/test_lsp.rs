use std::process::Stdio;
use tokio::io::{AsyncWriteExt, BufReader};
use tokio::process::Command;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("=== Phase 1: Test Backend LSP ===\n");

    // Step 1: Find rust-analyzer
    println!("[1.1] Finding rust-analyzer...");
    let output = Command::new("which")
        .arg("rust-analyzer")
        .output()
        .await?;
    let path = String::from_utf8(output.stdout).trim().to_string();
    if path.is_empty() {
        println!("[FAIL] rust-analyzer not found in PATH");
        return Ok(());
    }
    println!("[OK] Found: {}", path);

    // Step 2: Check binary works
    println!("\n[1.2] Testing binary with --version...");
    let output = Command::new(&path)
        .arg("--version")
        .output()
        .await?;
    println!("[OK] {}", String::from_utf8(output.stdout).trim());

    // Step 3: Start the LSP server
    println!("\n[1.3] Starting LSP server...");
    let workspace = "/Users/s4swata/cwo/rimuruAI/diablo/app";
    let mut child = Command::new(&path)
        .current_dir(workspace)
        .env("PATH", std::env::var("PATH").unwrap_or_default())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn?;

    let mut stdin = child.stdin.take().unwrap();
    let stdout = child.stdout.take().unwrap();
    let mut reader = BufReader::new(stdout);

    println!("[OK] Process spawned with PID");

    // Step 4: Send initialize request
    println!("\n[1.4] Sending initialize request...");
    let initialize = r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"processId":null,"rootUri":"file:///Users/s4swata/cwo/rimuruAI/diablo/app","capabilities":{}}}"#;
    let msg = format!("Content-Length: {}\r\n\r\n{}", initialize.len(), initialize);
    stdin.write_all(msg.as_bytes()).await?;
    stdin.flush().await?;
    println!("[OK] Sent: {}", initialize);

    // Step 5: Read response
    println!("\n[1.5] Reading response...");
    let mut content_length = 0usize;
    loop {
        let mut line = String::new();
        let n = reader.read_line(&mut line).await?;
        if n == 0 {
            println!("[FAIL] Server closed connection");
            break;
        }
        let trimmed = line.trim_end_matches(['\r', '\n']);
        if trimmed.is_empty() {
            break;
        }
        if let Some(val) = trimmed.strip_prefix("Content-Length: ") {
            content_length = val.trim().parse()?;
        }
    }
    if content_length > 0 {
        let mut buf = vec![0u8; content_length];
        reader.read_exact(&mut buf).await?;
        let response = String::from_utf8(buf)?;
        println!("[OK] Received: {}", &response[..response.len().min(200)]);
    }

    // Step 6: Send initialized notification
    println!("\n[1.6] Sending initialized notification...");
    let initialized = r#"{"jsonrpc":"2.0","method":"initialized","params":{}}"#;
    let msg = format!("Content-Length: {}\r\n\r\n{}", initialized.len(), initialized);
    stdin.write_all(msg.as_bytes()).await?;
    stdin.flush().await?;
    println!("[OK] Sent: {}", initialized);

    // Step 7: Send didOpen notification
    println!("\n[1.7] Sending textDocument/didOpen...");
    let did_open = r#"{"jsonrpc":"2.0","method":"textDocument/didOpen","params":{"textDocument":{"uri":"file:///Users/s4swata/cwo/rimuruAI/diablo/app/src/main.rs","languageId":"rust","version":1,"text":"fn main() { println!(\"hello\"); }"}}}"#;
    let msg = format!("Content-Length: {}\r\n\r\n{}", did_open.len(), did_open);
    stdin.write_all(msg.as_bytes()).await?;
    stdin.flush().await?;
    println!("[OK] Sent textDocument/didOpen");

    // Step 8: Wait for diagnostics
    println!("\n[1.8] Waiting for diagnostics...");
    tokio::select! {
        _ = tokio::time::sleep(std::time::Duration::from_secs(5)) => {
            println!("[TIMEOUT] No diagnostics received after 5s");
        }
        Ok(_) = async {
            let mut buf = [0u8; 4096];
            loop {
                let n = reader.read(&mut buf).await?;
                if n == 0 { break; }
                let response = String::from_utf8_lossy(&buf[..n]);
                println!("[DIAG] {}", response.trim());
            }
            Ok::<_, std::io::Error>(())
        } => {}
    }

    // Cleanup
    println!("\n[1.9] Stopping server...");
    drop(stdin);
    let _ = child.wait().await;
    println!("[OK] Server stopped");

    println!("\n=== Phase 1 Complete ===");
    Ok(())
}