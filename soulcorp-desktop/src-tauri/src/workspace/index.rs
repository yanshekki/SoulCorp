use super::models::{
    SearchResult, WorkspaceFile, WorkspaceFileKind, WorkspaceFileSummary, WorkspacePage,
    WorkspacePageSummary,
};
use rusqlite::{params, Connection};
use std::path::{Path, PathBuf};

const INDEX_VERSION: i32 = 1;

pub struct WorkspaceIndex {
    path: PathBuf,
}

impl WorkspaceIndex {
    pub fn new(root: &Path) -> Self {
        Self {
            path: root.join("workspace-index.db"),
        }
    }

    pub fn ensure_schema(&self) -> Result<(), String> {
        let conn = self.open()?;
        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS index_meta (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS page_summaries (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                folder_id TEXT NOT NULL,
                last_edited_at TEXT NOT NULL,
                last_edited_by TEXT NOT NULL,
                sort_order INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS file_summaries (
                id TEXT PRIMARY KEY,
                folder_id TEXT NOT NULL,
                name TEXT NOT NULL,
                extension TEXT NOT NULL,
                mime_type TEXT NOT NULL,
                file_kind TEXT NOT NULL,
                size_bytes INTEGER NOT NULL,
                uploaded_at TEXT NOT NULL,
                uploaded_by TEXT NOT NULL,
                sort_order INTEGER NOT NULL DEFAULT 0
            );

            CREATE VIRTUAL TABLE IF NOT EXISTS workspace_fts USING fts5(
                item_id UNINDEXED,
                item_type UNINDEXED,
                folder_id UNINDEXED,
                title,
                body,
                tokenize = 'porter unicode61'
            );
            "#,
        )
        .map_err(|e| e.to_string())?;
        self.set_meta(&conn, "version", &INDEX_VERSION.to_string())?;
        Ok(())
    }

    pub fn is_empty(&self) -> Result<bool, String> {
        let conn = self.open()?;
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM page_summaries",
                [],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;
        Ok(count == 0)
    }

    pub fn rebuild(
        &self,
        pages: &[WorkspacePage],
        files: &[WorkspaceFile],
    ) -> Result<(), String> {
        let conn = self.open()?;
        let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
        tx.execute("DELETE FROM workspace_fts", [])
            .map_err(|e| e.to_string())?;
        tx.execute("DELETE FROM page_summaries", [])
            .map_err(|e| e.to_string())?;
        tx.execute("DELETE FROM file_summaries", [])
            .map_err(|e| e.to_string())?;

        for page in pages {
            Self::insert_page_tx(&tx, page)?;
        }
        for file in files {
            Self::insert_file_tx(&tx, file)?;
        }

        tx.commit().map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn upsert_page(&self, page: &WorkspacePage) -> Result<(), String> {
        let conn = self.open()?;
        let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
        tx.execute(
            "DELETE FROM workspace_fts WHERE item_id = ?1",
            params![page.id],
        )
        .map_err(|e| e.to_string())?;
        tx.execute("DELETE FROM page_summaries WHERE id = ?1", params![page.id])
            .map_err(|e| e.to_string())?;
        Self::insert_page_tx(&tx, page)?;
        tx.commit().map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn delete_page(&self, page_id: &str) -> Result<(), String> {
        let conn = self.open()?;
        conn.execute(
            "DELETE FROM workspace_fts WHERE item_id = ?1",
            params![page_id],
        )
        .map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM page_summaries WHERE id = ?1", params![page_id])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn upsert_file(&self, file: &WorkspaceFile) -> Result<(), String> {
        let conn = self.open()?;
        let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
        tx.execute(
            "DELETE FROM workspace_fts WHERE item_id = ?1",
            params![file.id],
        )
        .map_err(|e| e.to_string())?;
        tx.execute("DELETE FROM file_summaries WHERE id = ?1", params![file.id])
            .map_err(|e| e.to_string())?;
        Self::insert_file_tx(&tx, file)?;
        tx.commit().map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn delete_file(&self, file_id: &str) -> Result<(), String> {
        let conn = self.open()?;
        conn.execute(
            "DELETE FROM workspace_fts WHERE item_id = ?1",
            params![file_id],
        )
        .map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM file_summaries WHERE id = ?1", params![file_id])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn list_page_summaries(&self) -> Result<Vec<WorkspacePageSummary>, String> {
        let conn = self.open()?;
        let mut stmt = conn
            .prepare(
                "SELECT id, title, folder_id, last_edited_at, last_edited_by, sort_order
                 FROM page_summaries
                 ORDER BY folder_id ASC, sort_order ASC, title ASC",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                Ok(WorkspacePageSummary {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    folder_id: row.get(2)?,
                    last_edited_at: row.get(3)?,
                    last_edited_by: row.get(4)?,
                    sort_order: row.get::<_, i64>(5)? as u32,
                })
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())
    }

    pub fn list_file_summaries(&self) -> Result<Vec<WorkspaceFileSummary>, String> {
        let conn = self.open()?;
        let mut stmt = conn
            .prepare(
                "SELECT id, folder_id, name, extension, mime_type, file_kind, size_bytes, uploaded_at, uploaded_by, sort_order
                 FROM file_summaries
                 ORDER BY folder_id ASC, sort_order ASC, name ASC",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                let kind_raw: String = row.get(5)?;
                Ok(WorkspaceFileSummary {
                    id: row.get(0)?,
                    folder_id: row.get(1)?,
                    name: row.get(2)?,
                    extension: row.get(3)?,
                    mime_type: row.get(4)?,
                    file_kind: parse_file_kind(&kind_raw),
                    size_bytes: row.get::<_, i64>(6)? as u64,
                    uploaded_at: row.get(7)?,
                    uploaded_by: row.get(8)?,
                    sort_order: row.get::<_, i64>(9)? as u32,
                })
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())
    }

    pub fn list_folder_children(
        &self,
        folder_id: &str,
    ) -> Result<(Vec<WorkspacePageSummary>, Vec<WorkspaceFileSummary>), String> {
        let conn = self.open()?;
        let mut pages_stmt = conn
            .prepare(
                "SELECT id, title, folder_id, last_edited_at, last_edited_by, sort_order
                 FROM page_summaries
                 WHERE folder_id = ?1
                 ORDER BY sort_order ASC, title ASC",
            )
            .map_err(|e| e.to_string())?;
        let pages = pages_stmt
            .query_map(params![folder_id], |row| {
                Ok(WorkspacePageSummary {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    folder_id: row.get(2)?,
                    last_edited_at: row.get(3)?,
                    last_edited_by: row.get(4)?,
                    sort_order: row.get::<_, i64>(5)? as u32,
                })
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;

        let mut files_stmt = conn
            .prepare(
                "SELECT id, folder_id, name, extension, mime_type, file_kind, size_bytes, uploaded_at, uploaded_by, sort_order
                 FROM file_summaries
                 WHERE folder_id = ?1
                 ORDER BY sort_order ASC, name ASC",
            )
            .map_err(|e| e.to_string())?;
        let files = files_stmt
            .query_map(params![folder_id], |row| {
                let kind_raw: String = row.get(5)?;
                Ok(WorkspaceFileSummary {
                    id: row.get(0)?,
                    folder_id: row.get(1)?,
                    name: row.get(2)?,
                    extension: row.get(3)?,
                    mime_type: row.get(4)?,
                    file_kind: parse_file_kind(&kind_raw),
                    size_bytes: row.get::<_, i64>(6)? as u64,
                    uploaded_at: row.get(7)?,
                    uploaded_by: row.get(8)?,
                    sort_order: row.get::<_, i64>(9)? as u32,
                })
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;

        Ok((pages, files))
    }

    pub fn resolve_items(
        &self,
        item_ids: &[String],
    ) -> Result<(Vec<WorkspacePageSummary>, Vec<WorkspaceFileSummary>), String> {
        if item_ids.is_empty() {
            return Ok((vec![], vec![]));
        }
        let conn = self.open()?;
        let mut pages = Vec::new();
        let mut files = Vec::new();
        for item_id in item_ids {
            if item_id.starts_with("file-") {
                if let Ok(file) = conn.query_row(
                    "SELECT id, folder_id, name, extension, mime_type, file_kind, size_bytes, uploaded_at, uploaded_by, sort_order
                     FROM file_summaries WHERE id = ?1",
                    params![item_id],
                    |row| {
                        let kind_raw: String = row.get(5)?;
                        Ok(WorkspaceFileSummary {
                            id: row.get(0)?,
                            folder_id: row.get(1)?,
                            name: row.get(2)?,
                            extension: row.get(3)?,
                            mime_type: row.get(4)?,
                            file_kind: parse_file_kind(&kind_raw),
                            size_bytes: row.get::<_, i64>(6)? as u64,
                            uploaded_at: row.get(7)?,
                            uploaded_by: row.get(8)?,
                            sort_order: row.get::<_, i64>(9)? as u32,
                        })
                    },
                ) {
                    files.push(file);
                }
            } else if let Ok(page) = conn.query_row(
                "SELECT id, title, folder_id, last_edited_at, last_edited_by, sort_order
                 FROM page_summaries WHERE id = ?1",
                params![item_id],
                |row| {
                    Ok(WorkspacePageSummary {
                        id: row.get(0)?,
                        title: row.get(1)?,
                        folder_id: row.get(2)?,
                        last_edited_at: row.get(3)?,
                        last_edited_by: row.get(4)?,
                        sort_order: row.get::<_, i64>(5)? as u32,
                    })
                },
            ) {
                pages.push(page);
            }
        }
        Ok((pages, files))
    }

    pub fn counts(&self) -> Result<(u32, u32), String> {
        let conn = self.open()?;
        let page_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM page_summaries", [], |row| row.get(0))
            .map_err(|e| e.to_string())?;
        let file_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM file_summaries", [], |row| row.get(0))
            .map_err(|e| e.to_string())?;
        Ok((page_count as u32, file_count as u32))
    }

    pub fn search(&self, query: &str, limit: usize) -> Result<Vec<SearchResult>, String> {
        let needle = query.trim();
        if needle.is_empty() {
            return Ok(vec![]);
        }
        let fts_query = build_fts_query(needle);
        if fts_query.is_empty() {
            return Ok(vec![]);
        }

        let conn = self.open()?;
        let mut stmt = conn
            .prepare(
                "SELECT item_id, item_type, folder_id, title,
                        snippet(workspace_fts, 4, '', '', '…', 24) AS snippet,
                        bm25(workspace_fts) AS rank
                 FROM workspace_fts
                 WHERE workspace_fts MATCH ?1
                 ORDER BY rank
                 LIMIT ?2",
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map(params![fts_query, limit as i64], |row| {
                let item_id: String = row.get(0)?;
                let item_type: String = row.get(1)?;
                let folder_id: String = row.get(2)?;
                let title: String = row.get(3)?;
                let snippet: String = row.get(4)?;
                let rank: f64 = row.get(5)?;
                let score = (-rank as f32).max(0.1);
                Ok(SearchResult {
                    page_id: item_id,
                    title,
                    folder_id,
                    snippet: if snippet.trim().is_empty() {
                        if item_type == "file" {
                            "File match".to_string()
                        } else {
                            "Page match".to_string()
                        }
                    } else {
                        snippet
                    },
                    score,
                })
            })
            .map_err(|e| e.to_string())?;

        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())
    }

    fn open(&self) -> Result<Connection, String> {
        let conn = Connection::open(&self.path).map_err(|e| e.to_string())?;
        conn.execute_batch("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;")
            .map_err(|e| e.to_string())?;
        Ok(conn)
    }

    fn set_meta(&self, conn: &Connection, key: &str, value: &str) -> Result<(), String> {
        conn.execute(
            "INSERT INTO index_meta(key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, value],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    fn insert_page_tx(tx: &rusqlite::Transaction<'_>, page: &WorkspacePage) -> Result<(), String> {
        tx.execute(
            "INSERT INTO page_summaries (id, title, folder_id, last_edited_at, last_edited_by, sort_order)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                page.id,
                page.title,
                page.folder_id,
                page.last_edited_at,
                page.last_edited_by,
                page.sort_order as i64
            ],
        )
        .map_err(|e| e.to_string())?;
        tx.execute(
            "INSERT INTO workspace_fts (item_id, item_type, folder_id, title, body)
             VALUES (?1, 'page', ?2, ?3, ?4)",
            params![
                page.id,
                page.folder_id,
                page.title,
                page_index_body(page)
            ],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    fn insert_file_tx(tx: &rusqlite::Transaction<'_>, file: &WorkspaceFile) -> Result<(), String> {
        let kind = file_kind_key(&file.file_kind);
        tx.execute(
            "INSERT INTO file_summaries (id, folder_id, name, extension, mime_type, file_kind, size_bytes, uploaded_at, uploaded_by, sort_order)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                file.id,
                file.folder_id,
                file.name,
                file.extension,
                file.mime_type,
                kind,
                file.size_bytes as i64,
                file.uploaded_at,
                file.uploaded_by,
                file.sort_order as i64
            ],
        )
        .map_err(|e| e.to_string())?;
        tx.execute(
            "INSERT INTO workspace_fts (item_id, item_type, folder_id, title, body)
             VALUES (?1, 'file', ?2, ?3, ?4)",
            params![
                file.id,
                file.folder_id,
                file.name,
                format!(
                    "{} {} {} {}",
                    file.extension, file.mime_type, kind, file.name
                )
            ],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }
}

pub fn page_index_body(page: &WorkspacePage) -> String {
    let rich_text = page
        .rich_doc
        .as_ref()
        .map(extract_text_from_rich_doc)
        .unwrap_or_default();
    let blocks = page
        .blocks
        .iter()
        .map(|block| block.content.as_str())
        .collect::<Vec<_>>()
        .join(" ");
    let links = page
        .linked_entities
        .iter()
        .map(|link| format!("{} {}", link.entity_type, link.title))
        .collect::<Vec<_>>()
        .join(" ");
    format!("{blocks} {rich_text} {links}")
}

fn extract_text_from_rich_doc(doc: &serde_json::Value) -> String {
    doc.get("content")
        .and_then(|value| value.as_array())
        .map(|nodes| {
            nodes
                .iter()
                .map(extract_node_text)
                .filter(|text| !text.trim().is_empty())
                .collect::<Vec<_>>()
                .join(" ")
        })
        .unwrap_or_default()
}

fn extract_node_text(node: &serde_json::Value) -> String {
    if let Some(text) = node.get("text").and_then(|value| value.as_str()) {
        return text.to_string();
    }

    node.get("content")
        .and_then(|value| value.as_array())
        .map(|children| {
            children
                .iter()
                .map(extract_node_text)
                .collect::<Vec<_>>()
                .join(" ")
        })
        .unwrap_or_default()
}

fn build_fts_query(raw: &str) -> String {
    raw.split_whitespace()
        .filter(|token| !token.is_empty())
        .map(|token| {
            let cleaned = token.replace('"', "");
            if cleaned.is_empty() {
                String::new()
            } else {
                format!("\"{cleaned}\"*")
            }
        })
        .filter(|token| !token.is_empty())
        .collect::<Vec<_>>()
        .join(" ")
}

fn file_kind_key(kind: &WorkspaceFileKind) -> &'static str {
    match kind {
        WorkspaceFileKind::Image => "image",
        WorkspaceFileKind::Document => "document",
        WorkspaceFileKind::Pdf => "pdf",
        WorkspaceFileKind::Spreadsheet => "spreadsheet",
        WorkspaceFileKind::Presentation => "presentation",
        WorkspaceFileKind::Archive => "archive",
        WorkspaceFileKind::Video => "video",
        WorkspaceFileKind::Audio => "audio",
        WorkspaceFileKind::Text => "text",
        WorkspaceFileKind::Other => "other",
    }
}

fn parse_file_kind(raw: &str) -> WorkspaceFileKind {
    match raw {
        "image" => WorkspaceFileKind::Image,
        "document" => WorkspaceFileKind::Document,
        "pdf" => WorkspaceFileKind::Pdf,
        "spreadsheet" => WorkspaceFileKind::Spreadsheet,
        "presentation" => WorkspaceFileKind::Presentation,
        "archive" => WorkspaceFileKind::Archive,
        "video" => WorkspaceFileKind::Video,
        "audio" => WorkspaceFileKind::Audio,
        "text" => WorkspaceFileKind::Text,
        _ => WorkspaceFileKind::Other,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workspace::models::Block;

    #[test]
    fn fts_search_finds_page_title() {
        let dir = std::env::temp_dir().join(format!("ws-index-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).expect("create temp dir");
        let index = WorkspaceIndex::new(&dir);
        index.ensure_schema().expect("schema");

        let page = WorkspacePage {
            id: "page-test".to_string(),
            title: "Quarterly Revenue Plan".to_string(),
            folder_id: "folder-company".to_string(),
            icon: None,
            blocks: vec![Block {
                id: "b1".to_string(),
                block_type: "text".to_string(),
                content: "Focus on enterprise upsell".to_string(),
                checked: None,
            }],
            rich_doc: None,
            linked_entities: vec![],
            last_edited_at: "2026-01-01T00:00:00Z".to_string(),
            last_edited_by: "player".to_string(),
            version: 1,
            dirty: false,
            sort_order: 0,
        };
        index.upsert_page(&page).expect("upsert");
        let results = index.search("revenue", 10).expect("search");
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].page_id, "page-test");
        let _ = std::fs::remove_dir_all(dir);
    }
}