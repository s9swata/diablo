use serde::{Deserialize, Serialize};
use tokio::process::Command;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct GitFileStatus {
    pub path: String,
    pub index_status: String,
    pub work_status: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct GitStatus {
    pub branch: String,
    pub ahead: u32,
    pub behind: u32,
    pub files: Vec<GitFileStatus>,
    pub is_repo: bool,
    pub git_root: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct GitCommit {
    pub hash: String,
    pub author: String,
    pub date: String,
    pub message: String,
}

async fn run_git(cwd: &str, args: &[&str]) -> Result<String, String> {
    let output = Command::new("git")
        .args(args)
        .current_dir(cwd)
        .output()
        .await
        .map_err(|e| e.to_string())?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).into_owned())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).into_owned())
    }
}

#[tauri::command]
pub async fn git_status(cwd: String) -> Result<GitStatus, String> {
    let is_repo = Command::new("git")
        .args(["rev-parse", "--git-dir"])
        .current_dir(&cwd)
        .output()
        .await
        .map(|o| o.status.success())
        .unwrap_or(false);

    if !is_repo {
        return Ok(GitStatus {
            branch: String::new(),
            ahead: 0,
            behind: 0,
            files: vec![],
            is_repo: false,
            git_root: String::new(),
        });
    }

    let branch = run_git(&cwd, &["rev-parse", "--abbrev-ref", "HEAD"])
        .await
        .unwrap_or_default()
        .trim()
        .to_string();

    let git_root = run_git(&cwd, &["rev-parse", "--show-toplevel"])
        .await
        .unwrap_or_default()
        .trim()
        .to_string();

    let ahead = run_git(&cwd, &["rev-list", "--count", "@{u}..HEAD"])
        .await
        .ok()
        .and_then(|s| s.trim().parse().ok())
        .unwrap_or(0u32);

    let behind = run_git(&cwd, &["rev-list", "--count", "HEAD..@{u}"])
        .await
        .ok()
        .and_then(|s| s.trim().parse().ok())
        .unwrap_or(0u32);

    let raw = run_git(&cwd, &["status", "--porcelain=v1", "-uall"]).await?;

    let mut files = Vec::new();
    for line in raw.lines() {
        if line.len() < 3 {
            continue;
        }
        let index_status = line[0..1].to_string();
        let work_status = line[1..2].to_string();
        let rest = &line[3..];
        // Renames: "old -> new" — take the new path
        let path = if rest.contains(" -> ") {
            rest.split(" -> ").last().unwrap_or(rest).to_string()
        } else {
            rest.to_string()
        };
        files.push(GitFileStatus {
            path,
            index_status,
            work_status,
        });
    }

    Ok(GitStatus {
        branch,
        ahead,
        behind,
        files,
        is_repo: true,
        git_root,
    })
}

#[tauri::command]
pub async fn git_diff_file(cwd: String, path: String, staged: bool) -> Result<String, String> {
    if staged {
        run_git(&cwd, &["diff", "--unified=3", "--cached", "--", &path]).await
    } else {
        run_git(&cwd, &["diff", "--unified=3", "--", &path]).await
    }
}

#[tauri::command]
pub async fn git_stage(cwd: String, path: String) -> Result<(), String> {
    run_git(&cwd, &["add", "--", &path]).await.map(|_| ())
}

#[tauri::command]
pub async fn git_unstage(cwd: String, path: String) -> Result<(), String> {
    run_git(&cwd, &["restore", "--staged", "--", &path]).await.map(|_| ())
}

#[tauri::command]
pub async fn git_discard(cwd: String, path: String) -> Result<(), String> {
    if run_git(&cwd, &["restore", "--", &path]).await.is_ok() {
        return Ok(());
    }
    // Fallback for untracked files
    run_git(&cwd, &["clean", "-f", "--", &path]).await.map(|_| ())
}

#[tauri::command]
pub async fn git_commit(cwd: String, message: String) -> Result<(), String> {
    run_git(&cwd, &["commit", "-m", &message]).await.map(|_| ())
}

#[tauri::command]
pub async fn git_push(cwd: String) -> Result<String, String> {
    run_git(&cwd, &["push"]).await
}

#[tauri::command]
pub async fn git_pull(cwd: String) -> Result<String, String> {
    run_git(&cwd, &["pull"]).await
}

#[tauri::command]
pub async fn git_log(cwd: String, limit: Option<u32>) -> Result<Vec<GitCommit>, String> {
    let n = limit.unwrap_or(20);
    let limit_arg = format!("-{}", n);
    let output = run_git(&cwd, &["log", &limit_arg, "--format=%H|%an|%ar|%s"]).await?;

    let commits = output
        .lines()
        .filter_map(|line| {
            let mut parts = line.splitn(4, '|');
            Some(GitCommit {
                hash: parts.next()?.chars().take(7).collect(),
                author: parts.next()?.to_string(),
                date: parts.next()?.to_string(),
                message: parts.next()?.to_string(),
            })
        })
        .collect();

    Ok(commits)
}
