use super::SkillExecContext;
use super::super::types::SkillDispatchResult;
use crate::report::slugify;
use crate::workspace::agent_service::{AgentContext, AgentWorkspaceService};
use crate::workspace::WorkspaceStorage;
use chrono::Utc;
use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};
use zip::write::SimpleFileOptions;
use zip::ZipWriter;

fn open_service<'a>(
    ctx: &'a SkillExecContext<'_>,
) -> Result<(WorkspaceStorage, AgentContext), String> {
    let root = ctx
        .workspace_root
        .ok_or_else(|| "Workspace root not available for this company.".to_string())?;
    let storage = WorkspaceStorage::new(root.to_path_buf())?;
    storage.ensure_seed()?;
    Ok((storage, AgentContext::from_record(ctx.agent)))
}

fn arg_str(args: &serde_json::Value, key: &str) -> String {
    args.get(key)
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string()
}

fn arg_u64(args: &serde_json::Value, key: &str, default: u64) -> u64 {
    args.get(key)
        .and_then(|v| v.as_u64())
        .or_else(|| args.get(key).and_then(|v| v.as_str()?.parse().ok()))
        .unwrap_or(default)
}

pub fn workspace_search(
    ctx: &SkillExecContext<'_>,
    args: &serde_json::Value,
    dry_run: bool,
) -> SkillDispatchResult {
    let query = arg_str(args, "query");
    if query.is_empty() {
        return fail("workspace_search", "Missing query.", dry_run);
    }
    if dry_run {
        return ok(
            "workspace_search",
            format!("Dry-run: would search workspace for '{query}'."),
            serde_json::json!({ "query": query }),
            true,
        );
    }
    match open_service(ctx) {
        Ok((storage, agent_ctx)) => {
            let service = AgentWorkspaceService::new(&storage);
            let max = arg_u64(args, "max_results", 5).clamp(1, 20) as usize;
            match service.search(&agent_ctx, &query, max) {
                Ok(results) => {
                    let items: Vec<serde_json::Value> = results
                        .iter()
                        .map(|r| {
                            serde_json::json!({
                                "page_id": r.page_id,
                                "title": r.title,
                                "snippet": r.snippet,
                            })
                        })
                        .collect();
                    ok(
                        "workspace_search",
                        format!("Found {} workspace hit(s).", items.len()),
                        serde_json::json!({ "results": items }),
                        false,
                    )
                }
                Err(e) => fail("workspace_search", e, false),
            }
        }
        Err(e) => fail("workspace_search", e, false),
    }
}

pub fn workspace_read_page(
    ctx: &SkillExecContext<'_>,
    args: &serde_json::Value,
    dry_run: bool,
) -> SkillDispatchResult {
    let page_id = arg_str(args, "page_id");
    if page_id.is_empty() {
        return fail("workspace_read_page", "Missing page_id.", dry_run);
    }
    if dry_run {
        return ok(
            "workspace_read_page",
            format!("Dry-run: would read page {page_id}."),
            serde_json::json!({ "page_id": page_id }),
            true,
        );
    }
    match open_service(ctx) {
        Ok((storage, agent_ctx)) => {
            let service = AgentWorkspaceService::new(&storage);
            match service.read_page(&agent_ctx, &page_id) {
                Ok(page) => {
                    let text = page.text.chars().take(4000).collect::<String>();
                    ok(
                        "workspace_read_page",
                        format!("Read page '{}'.", page.title),
                        serde_json::json!({
                            "page_id": page.page_id,
                            "title": page.title,
                            "text": text,
                        }),
                        false,
                    )
                }
                Err(e) => fail("workspace_read_page", e, false),
            }
        }
        Err(e) => fail("workspace_read_page", e, false),
    }
}

pub fn write_summary_page(
    ctx: &SkillExecContext<'_>,
    args: &serde_json::Value,
    dry_run: bool,
) -> SkillDispatchResult {
    let title = arg_str(args, "title");
    let content = arg_str(args, "content");
    if title.is_empty() || content.is_empty() {
        return fail("write_summary_page", "Missing title or content.", dry_run);
    }
    if dry_run {
        return ok(
            "write_summary_page",
            format!("Dry-run: would write page '{title}' ({} chars).", content.len()),
            serde_json::json!({ "title": title }),
            true,
        );
    }
    match open_service(ctx) {
        Ok((storage, agent_ctx)) => {
            let service = AgentWorkspaceService::new(&storage);
            let lines: Vec<String> = content.lines().map(|l| l.to_string()).collect();
            match service.append_journal(&agent_ctx, &title, "Skill summary", &lines) {
                Ok(page) => ok(
                    "write_summary_page",
                    format!("Wrote journal/summary '{title}'."),
                    serde_json::json!({ "title": title, "page_id": page.id }),
                    false,
                ),
                Err(e) => fail("write_summary_page", e, false),
            }
        }
        Err(e) => fail("write_summary_page", e, false),
    }
}

pub fn propose_patch(
    ctx: &SkillExecContext<'_>,
    args: &serde_json::Value,
    dry_run: bool,
) -> SkillDispatchResult {
    let path = arg_str(args, "path");
    let diff = arg_str(args, "diff");
    let rationale = arg_str(args, "rationale");
    if path.is_empty() || diff.is_empty() {
        return fail("propose_patch", "Missing path or diff.", dry_run);
    }
    if dry_run {
        return ok(
            "propose_patch",
            format!("Dry-run: would propose patch for {path}."),
            serde_json::json!({ "path": path }),
            true,
        );
    }

    let Some(root) = ctx.workspace_root else {
        return fail("propose_patch", "Workspace root required.", false);
    };

    let patches_dir = root.join("files").join("patches");
    if let Err(e) = fs::create_dir_all(&patches_dir) {
        return fail("propose_patch", e.to_string(), false);
    }

    let stamp = Utc::now().format("%Y%m%d-%H%M%S");
    let slug = slugify(&path);
    let patch_name = format!("{stamp}-{slug}.diff");
    let patch_path = patches_dir.join(&patch_name);
    let file_body = format!(
        "--- path: {path}\n--- agent: {}\n--- rationale: {}\n\n{diff}\n",
        ctx.agent.name,
        if rationale.is_empty() {
            "(none)"
        } else {
            &rationale
        }
    );
    if let Err(e) = fs::write(&patch_path, &file_body) {
        return fail("propose_patch", e.to_string(), false);
    }

    // Also journal for visibility in the agent workspace UI.
    let title = format!("Patch proposal — {path}");
    let content = format!(
        "## Rationale\n{rationale}\n\n## Diff file\n`{}`\n\n```diff\n{diff}\n```\n",
        patch_path.display()
    );
    let journal = write_summary_page(
        ctx,
        &serde_json::json!({ "title": title, "content": content }),
        false,
    );

    ok(
        "propose_patch",
        format!("Saved patch proposal to {}.", patch_path.display()),
        serde_json::json!({
            "path": path,
            "patch_file": patch_path.display().to_string(),
            "journal_page_id": journal.data.get("page_id").cloned().unwrap_or(serde_json::Value::Null),
        }),
        false,
    )
}

/// Real workspace/export zip under `files/exports/`.
pub fn export_zip(
    ctx: &SkillExecContext<'_>,
    args: &serde_json::Value,
    dry_run: bool,
) -> SkillDispatchResult {
    let scope = arg_str(args, "scope");
    let scope = if scope.is_empty() {
        "workspace".to_string()
    } else {
        scope
    };

    if dry_run {
        return ok(
            "export_zip",
            format!("Dry-run: would export scope '{scope}' to zip."),
            serde_json::json!({ "scope": scope }),
            true,
        );
    }

    let Some(root) = ctx.workspace_root else {
        return fail("export_zip", "Workspace root required for export.", false);
    };

    let exports_dir = root.join("files").join("exports");
    if let Err(e) = fs::create_dir_all(&exports_dir) {
        return fail("export_zip", e.to_string(), false);
    }

    let stamp = Utc::now().format("%Y%m%d-%H%M%S");
    let zip_name = format!("soulcorp-{scope}-{stamp}.zip");
    let zip_path = exports_dir.join(&zip_name);

    match scope.as_str() {
        "workspace" | "markdown" | "pages" => match pack_workspace_zip(root, &zip_path) {
            Ok(count) => ok(
                "export_zip",
                format!("Exported {count} workspace file(s) to {}.", zip_path.display()),
                serde_json::json!({
                    "scope": scope,
                    "path": zip_path.display().to_string(),
                    "files": count,
                }),
                false,
            ),
            Err(e) => fail("export_zip", e, false),
        },
        "media" => match pack_dir_zip(&root.join("files").join("media"), &zip_path, "media") {
            Ok(count) => ok(
                "export_zip",
                format!("Exported {count} media file(s) to {}.", zip_path.display()),
                serde_json::json!({
                    "scope": scope,
                    "path": zip_path.display().to_string(),
                    "files": count,
                }),
                false,
            ),
            Err(e) => fail("export_zip", e, false),
        },
        "patches" => match pack_dir_zip(&root.join("files").join("patches"), &zip_path, "patches") {
            Ok(count) => ok(
                "export_zip",
                format!("Exported {count} patch file(s) to {}.", zip_path.display()),
                serde_json::json!({
                    "scope": scope,
                    "path": zip_path.display().to_string(),
                    "files": count,
                }),
                false,
            ),
            Err(e) => fail("export_zip", e, false),
        },
        "all" => match pack_all_zip(root, &zip_path) {
            Ok(count) => ok(
                "export_zip",
                format!("Exported {count} file(s) to {}.", zip_path.display()),
                serde_json::json!({
                    "scope": scope,
                    "path": zip_path.display().to_string(),
                    "files": count,
                }),
                false,
            ),
            Err(e) => fail("export_zip", e, false),
        },
        other => fail(
            "export_zip",
            format!("Unknown scope '{other}'. Use workspace, media, patches, or all."),
            false,
        ),
    }
}

fn pack_workspace_zip(root: &Path, zip_path: &Path) -> Result<usize, String> {
    let file = File::create(zip_path).map_err(|e| e.to_string())?;
    let mut zip = ZipWriter::new(file);
    let options = SimpleFileOptions::default();
    let mut count = 0usize;

    // Prefer pages/ markdown tree; also include journal-ish files under pages.
    let pages_dir = root.join("pages");
    if pages_dir.is_dir() {
        count += add_dir_to_zip(&mut zip, &pages_dir, Path::new("workspace/pages"), options)?;
    }

    // Workspace tree/manifest if present
    for name in ["tree.json", "manifest.json", "INDEX.md"] {
        let p = root.join(name);
        if p.is_file() {
            add_file_to_zip(&mut zip, &p, &format!("workspace/{name}"), options)?;
            count += 1;
        }
    }

    // Fallback: pack any .md under root (limited depth)
    if count == 0 {
        count += add_dir_to_zip(&mut zip, root, Path::new("workspace"), options)?;
    }

    // Always include a small index
    let index = format!(
        "# SoulCorp workspace export\n\n- exported_at: {}\n- files: {count}\n",
        Utc::now().to_rfc3339()
    );
    zip.start_file("INDEX.md", options)
        .map_err(|e| e.to_string())?;
    zip.write_all(index.as_bytes()).map_err(|e| e.to_string())?;
    count += 1;

    zip.finish().map_err(|e| e.to_string())?;
    Ok(count)
}

fn pack_dir_zip(dir: &Path, zip_path: &Path, prefix: &str) -> Result<usize, String> {
    if !dir.is_dir() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let file = File::create(zip_path).map_err(|e| e.to_string())?;
    let mut zip = ZipWriter::new(file);
    let options = SimpleFileOptions::default();
    let count = add_dir_to_zip(&mut zip, dir, Path::new(prefix), options)?;
    if count == 0 {
        zip.start_file(format!("{prefix}/.keep"), options)
            .map_err(|e| e.to_string())?;
        zip.write_all(b"").map_err(|e| e.to_string())?;
    }
    zip.finish().map_err(|e| e.to_string())?;
    Ok(count.max(1))
}

fn pack_all_zip(root: &Path, zip_path: &Path) -> Result<usize, String> {
    let file = File::create(zip_path).map_err(|e| e.to_string())?;
    let mut zip = ZipWriter::new(file);
    let options = SimpleFileOptions::default();
    let mut count = 0usize;
    for (sub, prefix) in [
        ("pages", "workspace/pages"),
        ("files", "files"),
    ] {
        let dir = root.join(sub);
        if dir.is_dir() {
            count += add_dir_to_zip(&mut zip, &dir, Path::new(prefix), options)?;
        }
    }
    zip.finish().map_err(|e| e.to_string())?;
    Ok(count)
}

fn add_dir_to_zip(
    zip: &mut ZipWriter<File>,
    dir: &Path,
    prefix: &Path,
    options: SimpleFileOptions,
) -> Result<usize, String> {
    let mut count = 0usize;
    let mut stack = vec![dir.to_path_buf()];
    while let Some(current) = stack.pop() {
        let entries = fs::read_dir(&current).map_err(|e| e.to_string())?;
        for entry in entries.flatten() {
            let path = entry.path();
            let rel = path
                .strip_prefix(dir)
                .unwrap_or(path.as_path())
                .to_path_buf();
            // Skip heavy or private dirs
            if rel.components().any(|c| {
                matches!(
                    c.as_os_str().to_str(),
                    Some(".git" | "node_modules" | ".skill-browser" | "target")
                )
            }) {
                continue;
            }
            if path.is_dir() {
                stack.push(path);
            } else if path.is_file() {
                // Cap single file at 5MB
                if let Ok(meta) = path.metadata() {
                    if meta.len() > 5 * 1024 * 1024 {
                        continue;
                    }
                }
                let archive = prefix.join(&rel);
                let archive_str = archive.to_string_lossy().replace('\\', "/");
                add_file_to_zip(zip, &path, &archive_str, options)?;
                count += 1;
                if count >= 500 {
                    return Ok(count);
                }
            }
        }
    }
    Ok(count)
}

fn add_file_to_zip(
    zip: &mut ZipWriter<File>,
    path: &Path,
    archive_path: &str,
    options: SimpleFileOptions,
) -> Result<(), String> {
    let bytes = fs::read(path).map_err(|e| e.to_string())?;
    zip.start_file(archive_path, options)
        .map_err(|e| e.to_string())?;
    zip.write_all(&bytes).map_err(|e| e.to_string())?;
    Ok(())
}

fn ok(tool: &str, message: impl Into<String>, data: serde_json::Value, dry: bool) -> SkillDispatchResult {
    SkillDispatchResult {
        tool: tool.to_string(),
        ok: true,
        message: message.into(),
        data,
        dry_run: dry,
    }
}

fn fail(tool: &str, message: impl Into<String>, dry: bool) -> SkillDispatchResult {
    SkillDispatchResult {
        tool: tool.to_string(),
        ok: false,
        message: message.into(),
        data: serde_json::Value::Null,
        dry_run: dry,
    }
}

#[allow(dead_code)]
fn _exports_hint(root: &Path) -> PathBuf {
    root.join("files").join("exports")
}
