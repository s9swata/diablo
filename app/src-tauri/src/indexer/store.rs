use anyhow::Result;
use rusqlite::Connection;
use serde::Serialize;
use std::collections::HashMap;
use std::path::Path;

#[derive(Serialize, Clone)]
pub struct ChunkResult {
    pub id: i64,
    pub path: String,
    pub start_line: usize,
    pub end_line: usize,
    pub content: String,
    pub lang: String,
    pub score: f64,
}

pub struct IndexDb {
    conn: Connection,
}

impl IndexDb {
    pub fn open(db_path: &str) -> Result<Self> {
        unsafe {
            rusqlite::ffi::sqlite3_auto_extension(Some(std::mem::transmute(
                sqlite_vec::sqlite3_vec_init as *const (),
            )));
        }

        // Create parent dirs
        if let Some(parent) = Path::new(db_path).parent() {
            std::fs::create_dir_all(parent)?;
        }

        let conn = Connection::open(db_path)?;
        conn.execute_batch("PRAGMA journal_mode=WAL;")?;

        Ok(Self { conn })
    }

    pub fn init_schema(&self) -> Result<()> {
        self.conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS chunks (
                id         INTEGER PRIMARY KEY,
                path       TEXT    NOT NULL,
                start_line INTEGER NOT NULL,
                end_line   INTEGER NOT NULL,
                content    TEXT    NOT NULL,
                lang       TEXT    NOT NULL,
                mtime      INTEGER NOT NULL
            );

            CREATE VIRTUAL TABLE IF NOT EXISTS vec_chunks USING vec0(
                chunk_id   INTEGER PRIMARY KEY,
                embedding  FLOAT[768] distance_metric=cosine
            );

            CREATE VIRTUAL TABLE IF NOT EXISTS fts_chunks USING fts5(
                content,
                content=chunks,
                content_rowid=id
            );
            ",
        )?;
        Ok(())
    }

    pub fn insert_chunk(
        &self,
        path: &str,
        start_line: usize,
        end_line: usize,
        content: &str,
        lang: &str,
        mtime: u64,
        embedding: &[f32],
    ) -> Result<i64> {
        self.conn.execute(
            "INSERT INTO chunks (path, start_line, end_line, content, lang, mtime) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![path, start_line as i64, end_line as i64, content, lang, mtime as i64],
        )?;
        let id = self.conn.last_insert_rowid();

        // Insert embedding
        let blob: Vec<u8> = embedding
            .iter()
            .flat_map(|f| f.to_le_bytes())
            .collect();
        self.conn.execute(
            "INSERT INTO vec_chunks (chunk_id, embedding) VALUES (?1, ?2)",
            rusqlite::params![id, blob],
        )?;

        Ok(id)
    }

    pub fn delete_by_path(&self, path: &str) -> Result<()> {
        self.conn.execute(
            "DELETE FROM vec_chunks WHERE chunk_id IN (SELECT id FROM chunks WHERE path = ?1)",
            rusqlite::params![path],
        )?;
        self.conn.execute("DELETE FROM chunks WHERE path = ?1", rusqlite::params![path])?;
        Ok(())
    }

    pub fn knn_search(&self, embedding: &[f32], k: usize) -> Result<Vec<(i64, f32)>> {
        let blob: Vec<u8> = embedding.iter().flat_map(|f| f.to_le_bytes()).collect();

        let mut stmt = self.conn.prepare(
            "SELECT chunk_id, distance FROM vec_chunks WHERE embedding MATCH ?1 AND k = ?2",
        )?;

        let rows: Vec<(i64, f32)> = stmt
            .query_map(rusqlite::params![blob, k as i64], |row| {
                Ok((row.get(0)?, row.get::<_, f64>(1)? as f32))
            })?
            .filter_map(|r| r.ok())
            .collect();

        Ok(rows)
    }

    pub fn fts_search(&self, query: &str, limit: usize) -> Result<Vec<(i64, f32)>> {
        // Escape FTS5 special chars
        let escaped = query
            .replace('"', "\"\"")
            .replace('\'', "''")
            .replace('*', "")
            .replace('^', "")
            .replace('(', "")
            .replace(')', "");

        let mut stmt = self.conn.prepare(
            "SELECT rowid, rank FROM fts_chunks WHERE fts_chunks MATCH ?1 ORDER BY rank LIMIT ?2",
        )?;

        let rows: Vec<(i64, f32)> = stmt
            .query_map(rusqlite::params![escaped, limit as i64], |row| {
                Ok((row.get(0)?, row.get::<_, f64>(1)? as f32))
            })?
            .filter_map(|r| r.ok())
            .collect();

        Ok(rows)
    }

    pub fn fetch_chunks(&self, ids: &[i64]) -> Result<Vec<ChunkResult>> {
        if ids.is_empty() {
            return Ok(vec![]);
        }

        let placeholders: Vec<String> = ids.iter().enumerate().map(|_| "?".to_string()).collect();
        let sql = format!(
            "SELECT id, path, start_line, end_line, content, lang FROM chunks WHERE id IN ({})",
            placeholders.join(",")
        );

        let params: Vec<rusqlite::types::Value> = ids
            .iter()
            .map(|id| rusqlite::types::Value::from(*id))
            .collect();

        let mut stmt = self.conn.prepare(&sql)?;
        let rows: Vec<ChunkResult> = stmt
            .query_map(rusqlite::params_from_iter(params.iter()), |row| {
                Ok(ChunkResult {
                    id: row.get(0)?,
                    path: row.get(1)?,
                    start_line: row.get::<_, i64>(2)? as usize,
                    end_line: row.get::<_, i64>(3)? as usize,
                    content: row.get(4)?,
                    lang: row.get(5)?,
                    score: 0.0,
                })
            })?
            .filter_map(|r| r.ok())
            .collect();

        Ok(rows)
    }
}

// RRF Merge
const RRF_K: f64 = 60.0;

pub fn rrf_merge(
    vec_results: &[(i64, f32)],
    bm25_results: &[(i64, f32)],
    top_n: usize,
) -> Vec<i64> {
    let mut scores: HashMap<i64, f64> = HashMap::new();

    for (rank, (chunk_id, _)) in vec_results.iter().enumerate() {
        *scores.entry(*chunk_id).or_default() += 1.0 / (RRF_K + rank as f64 + 1.0);
    }
    for (rank, (chunk_id, _)) in bm25_results.iter().enumerate() {
        *scores.entry(*chunk_id).or_default() += 1.0 / (RRF_K + rank as f64 + 1.0);
    }

    let mut ranked: Vec<(i64, f64)> = scores.into_iter().collect();
    ranked.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    ranked.into_iter().take(top_n).map(|(id, _)| id).collect()
}