use anyhow::{anyhow, Result};
use tokio::io::{AsyncBufReadExt, AsyncReadExt, BufReader};
use tokio::process::ChildStdout;

pub fn encode_message(msg: &str) -> Vec<u8> {
    let header = format!("Content-Length: {}\r\n\r\n", msg.len());
    let mut out = header.into_bytes();
    out.extend_from_slice(msg.as_bytes());
    out
}

pub async fn read_message(reader: &mut BufReader<ChildStdout>) -> Result<String> {
    let mut content_length = 0usize;
    loop {
        let mut line = String::new();
        let n = reader.read_line(&mut line).await?;
        if n == 0 {
            return Err(anyhow!("LSP server closed stdout"));
        }
        let trimmed = line.trim_end_matches(['\r', '\n']);
        if trimmed.is_empty() {
            break;
        }
        if let Some(val) = trimmed.strip_prefix("Content-Length: ") {
            content_length = val.trim().parse()?;
        }
    }
    if content_length == 0 {
        return Err(anyhow!("zero content-length"));
    }
    let mut buf = vec![0u8; content_length];
    reader.read_exact(&mut buf).await?;
    Ok(String::from_utf8(buf)?)
}
