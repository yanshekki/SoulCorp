use crate::scrum::types::WorkNode;
use crate::state::AgentRecord;
use std::fs;
use std::path::{Path, PathBuf};

/// How an agent should work a task — drives prompt instructions.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TaskWorkMode {
    /// Write/edit real source under the company workspace project (code, tests, configs).
    ImplementCode,
    /// Research / scope / design notes in markdown are OK.
    ResearchDoc,
    /// Review package / handoff notes.
    ReviewHandoff,
    /// Standup / meeting follow-up — short status only, not a mini essay.
    ProcessNote,
}

fn apply_language_block(body: String, language_block: Option<&str>) -> String {
    match language_block.map(str::trim).filter(|s| !s.is_empty()) {
        Some(block) => format!("{block}\n\n{body}"),
        None => body,
    }
}

/// Infer work mode from task title/description + department.
pub fn infer_task_work_mode(task: &WorkNode, department: &str) -> TaskWorkMode {
    let title = task.title.to_ascii_lowercase();
    let desc = task.description.to_ascii_lowercase();
    let dept = department.to_ascii_lowercase();
    let blob = format!("{title}\n{desc}");

    // Explicit phase prefixes (scheduler templates) win.
    if title.contains("research") || title.contains("scope") || title.contains("brief") {
        return TaskWorkMode::ResearchDoc;
    }
    if title.contains("review") || title.contains("handoff") || title.contains("qc") {
        return TaskWorkMode::ReviewHandoff;
    }

    // Pure process / meeting work — even if mis-titled "Implementation: … Standup"
    let processy = title.contains("standup")
        || title.contains("stand-up")
        || title.contains("daily stand")
        || title.contains("meeting notes")
        || title.contains("kickoff") && !blob.contains("implement")
        || desc.contains("pm review and workspace publish")
            && !title.contains("implementation");
    if processy
        && !title.contains("implementation")
        && !title.contains("build ")
        && !blob.contains("source code")
        && !blob.contains("api")
    {
        return TaskWorkMode::ProcessNote;
    }

    // Implementation / build / code keywords
    if title.contains("implementation")
        || title.contains("implement")
        || title.contains("build ")
        || title.contains("coding")
        || title.contains("refactor")
        || title.contains("deploy")
        || blob.contains("source code")
        || blob.contains("write code")
        || blob.contains("unit test")
        || blob.contains("build the core")
    {
        // Mis-routed standup "Implementation: Follow-up: Daily Standup" → process note
        if (title.contains("standup") || title.contains("daily stand") || title.contains("meeting"))
            && !blob.contains("api")
            && !blob.contains("module")
            && !blob.contains("source")
            && !blob.contains("code")
        {
            return TaskWorkMode::ProcessNote;
        }
        return TaskWorkMode::ImplementCode;
    }

    // Engineering / product departments default implementation for non-doc tasks
    let eng = dept.contains("engineer")
        || dept.contains("engineering")
        || dept.contains("dev")
        || dept.contains("product eng")
        || dept.contains("技術")
        || dept.contains("工程");
    if eng
        && !title.contains("research")
        && !title.contains("review")
        && !title.contains("handoff")
        && !processy
    {
        return TaskWorkMode::ImplementCode;
    }

    TaskWorkMode::ResearchDoc
}

pub fn work_mode_instructions(mode: TaskWorkMode, has_tools: bool) -> String {
    output_instructions(mode, has_tools)
}

fn output_instructions(mode: TaskWorkMode, has_tools: bool) -> String {
    match mode {
        TaskWorkMode::ImplementCode if has_tools => {
            "## Work mode: IMPLEMENT CODE (mandatory)\n\
- This is a **coding task**, not a documentation task.\n\
- Use your tools to **create/edit real source files** under the company workspace (look for project dirs like `ysk-restaurant/`, `src/`, `apps/`, `code/`).\n\
- Prefer existing project structure; do not invent a second parallel stack without reason.\n\
- Write working code + tests when applicable. Update README only if needed.\n\
- **Do not** spend the run only writing Workspace markdown essays, standups, or “I'll review…” notes.\n\
- Final reply (after tools): short changelog in markdown:\n\
  1) What changed (bullet list)\n\
  2) Files created/modified (paths)\n\
  3) How to run/test\n\
- Tool use is expected. Silent tool work is fine; the final message must list real file paths."
                .into()
        }
        TaskWorkMode::ImplementCode => {
            "## Work mode: IMPLEMENT CODE (no file tools — emit code for extraction)\n\
- This is a **coding task**. Produce real source, not a plan-only essay.\n\
- For each file, use a fenced block with the path on the info line, e.g.:\n\
  ```python path=ysk-restaurant/src/ysk_restaurant/foo.py\n\
  # code here\n\
  ```\n\
- Or start the fence line with the relative path: ```ysk-restaurant/src/foo.py\n\
- Include at least one real source file (not only docs).\n\
- After code blocks, a short changelog is OK.\n\
- Reject style: pure process chatter (“I'll review the workspace…”)."
                .into()
        }
        TaskWorkMode::ResearchDoc => {
            "## Work mode: RESEARCH / SCOPE\n\
- Deliver a clear research or scope document in markdown.\n\
- Cover context, constraints, options, recommendation, and open questions.\n\
- Keep it actionable — not empty placeholders."
                .into()
        }
        TaskWorkMode::ReviewHandoff => {
            "## Work mode: REVIEW & HANDOFF\n\
- Summarize what was built, acceptance status, risks, and handoff steps.\n\
- Link to concrete files/paths when they exist.\n\
- Do not invent fake green builds."
                .into()
        }
        TaskWorkMode::ProcessNote => {
            "## Work mode: PROCESS / STATUS NOTE\n\
- Short status note only (blockers, decisions, next actions).\n\
- Max ~1 page. Do not spawn a long essay or revision novel.\n\
- No fake “implementation” of product code for pure standup follow-ups."
                .into()
        }
    }
}

pub fn build_task_message(
    task: &WorkNode,
    agent: &AgentRecord,
    project_title: &str,
    soul_path: Option<&Path>,
    workspace_addon: Option<&str>,
) -> String {
    build_task_message_lang(task, agent, project_title, soul_path, workspace_addon, None)
}

pub fn build_task_message_lang(
    task: &WorkNode,
    agent: &AgentRecord,
    project_title: &str,
    soul_path: Option<&Path>,
    workspace_addon: Option<&str>,
    language_block: Option<&str>,
) -> String {
    let acceptance = if task.acceptance_criteria.is_empty() {
        "- Meet the task objective with clear, actionable output.".to_string()
    } else {
        task.acceptance_criteria
            .iter()
            .map(|item| format!("- {item}"))
            .collect::<Vec<_>>()
            .join("\n")
    };

    let soul_section = match agent.soul.as_ref() {
        Some(soul) if !soul.raw_content.trim().is_empty() => soul.raw_content.trim().to_string(),
        _ => "No soul profile defined.".to_string(),
    };

    let soul_file_note = soul_path
        .map(|path| format!("\nSoul file path: {}\n", path.display()))
        .unwrap_or_default();
    let workspace_section = workspace_addon
        .map(|body| format!("\n\n## Workspace context\n{body}\n"))
        .unwrap_or_default();

    let skills_section = {
        let policy = crate::skills::SkillPolicy::default();
        let enabled = crate::skills::enabled_packs(&policy);
        if enabled.is_empty() {
            String::new()
        } else {
            let summaries: Vec<_> = enabled.iter().map(|p| p.summary(true)).collect();
            format!(
                "\n\n## SoulCorp skills (prefer using equivalent tools if available)\n{}\n",
                crate::skills::format_skill_catalog_prompt(&summaries)
            )
        }
    };

    let mode = infer_task_work_mode(task, &agent.department);
    // Full prompt is used for tool-capable runtimes (CLI / skill loop).
    let instructions = output_instructions(mode, true);

    let body = format!(
        "# SoulCorp task execution\n\n\
## Agent\n- Name: {name}\n- Role: {role}\n- Department: {department}\n\n\
## Project\n{project_title}\n\n\
## Task\n**{title}**\n\n{description}\n\n\
## Acceptance criteria\n{acceptance}\n\n\
## Agent soul\n{soul_section}{soul_file_note}{workspace_section}{skills_section}\n\
{instructions}\n\n\
## Hard rules\n\
- Never return only “I'll review… / 先檢視…” process chatter as the deliverable.\n\
- Prefer shipping concrete artifacts over meta-documentation.\n\
- Company language rules above still apply to user-facing text.",
        name = agent.name,
        role = agent.role,
        department = agent.department,
        title = task.title,
        description = if task.description.trim().is_empty() {
            "No additional details.".to_string()
        } else {
            task.description.clone()
        },
    );
    apply_language_block(body, language_block)
}

pub fn build_compact_prompt(
    task: &WorkNode,
    agent: &AgentRecord,
    project_title: &str,
    workspace_addon: Option<&str>,
) -> String {
    build_compact_prompt_lang(task, agent, project_title, workspace_addon, None)
}

/// Compact prompt for Grok/CLI. `has_tools` defaults true for CLI path.
pub fn build_compact_prompt_lang(
    task: &WorkNode,
    agent: &AgentRecord,
    project_title: &str,
    workspace_addon: Option<&str>,
    language_block: Option<&str>,
) -> String {
    build_compact_prompt_lang_with_tools(
        task,
        agent,
        project_title,
        workspace_addon,
        language_block,
        true,
    )
}

pub fn build_compact_prompt_lang_with_tools(
    task: &WorkNode,
    agent: &AgentRecord,
    project_title: &str,
    workspace_addon: Option<&str>,
    language_block: Option<&str>,
    has_tools: bool,
) -> String {
    // Hard cap — huge workspace dumps freeze Grok CLI + desktop.
    const MAX_PROMPT_CHARS: usize = 7_500;
    const MAX_DETAILS_CHARS: usize = 800;
    const MAX_WS_CHARS: usize = 2_800;

    let details = {
        let d = task.description.trim();
        if d.chars().count() <= MAX_DETAILS_CHARS {
            d.to_string()
        } else {
            format!(
                "{}…",
                d.chars().take(MAX_DETAILS_CHARS).collect::<String>()
            )
        }
    };
    let acceptance = if task.acceptance_criteria.is_empty() {
        "Meet the task objective.".to_string()
    } else {
        task.acceptance_criteria
            .iter()
            .take(6)
            .cloned()
            .collect::<Vec<_>>()
            .join("\n- ")
    };
    let workspace_section = workspace_addon
        .map(|body| {
            let trimmed = body.trim();
            let short = if trimmed.chars().count() <= MAX_WS_CHARS {
                trimmed.to_string()
            } else {
                format!(
                    "{}…",
                    trimmed.chars().take(MAX_WS_CHARS).collect::<String>()
                )
            };
            format!("\n\nWorkspace context (truncated):\n{short}")
        })
        .unwrap_or_default();

    let task_title = task
        .title
        .replace("**", "")
        .replace('*', "")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");

    let mode = infer_task_work_mode(task, &agent.department);
    let instructions = output_instructions(mode, has_tools);

    let mut prompt = format!(
        "## SoulCorp task\n\
Project: {project_title}\n\
Agent: {name} ({role})\n\
Department: {department}\n\
\n\
## Task\n{task_title}\n\
\n\
## Details\n{details}\n\
\n\
## Acceptance criteria\n- {acceptance}{workspace_section}\n\
\n\
{instructions}\n\
\n\
## Hard rules\n\
- Do **not** return only process chatter (“I'll review…”, “先檢視工作區…”).\n\
- For IMPLEMENT CODE: ship real files under the project tree; markdown-only essays fail review.\n\
- Final message: concrete artifacts + short summary.",
        name = agent.name,
        role = agent.role,
        department = agent.department,
    );
    prompt = apply_language_block(prompt, language_block);
    if prompt.chars().count() > MAX_PROMPT_CHARS {
        let block = language_block.map(str::trim).filter(|s| !s.is_empty());
        if let Some(block) = block {
            let budget = MAX_PROMPT_CHARS.saturating_sub(block.chars().count() + 2);
            let rest = prompt
                .strip_prefix(block)
                .unwrap_or(prompt.as_str())
                .trim_start();
            let rest_trimmed: String = rest.chars().take(budget).collect();
            prompt = format!("{block}\n\n{rest_trimmed}…");
        } else {
            prompt = format!(
                "{}…",
                prompt.chars().take(MAX_PROMPT_CHARS).collect::<String>()
            );
        }
    }
    prompt
}

/// Detect process-only chatter that should fail PM / auto-approve gates.
pub fn looks_like_process_chatter(text: &str) -> bool {
    let t = text.trim();
    if t.is_empty() {
        return true;
    }
    let lower = t.to_ascii_lowercase();
    let chars = t.chars().count();
    // Very short status without substance
    if chars < 80 {
        return true;
    }
    let chatter_markers = [
        "i'll review",
        "i will review",
        "i'll check",
        "i will check",
        "let me review",
        "let me check",
        "looking at the workspace",
        "checking the workspace",
        "先檢視",
        "先查看",
        "我先查看",
        "我先讀取",
        "先釐清",
        "繼續讀取",
        "next i'll read",
        "i'll load the",
        "i'll search for",
    ];
    let marker_hits = chatter_markers
        .iter()
        .filter(|m| lower.contains(*m) || t.contains(*m))
        .count();
    // Mostly process narrative with no code/path evidence
    let has_code_fence = t.contains("```");
    let has_pathish = lower.contains("src/")
        || lower.contains(".py")
        || lower.contains(".rs")
        || lower.contains(".ts")
        || lower.contains(".tsx")
        || lower.contains(".js")
        || lower.contains("ysk-restaurant/");
    if marker_hits >= 1 && !has_code_fence && !has_pathish && chars < 1200 {
        return true;
    }
    if marker_hits >= 2 && !has_code_fence {
        return true;
    }
    false
}

/// Extract ```path=… / ```lang path=… / ```relative/path.ext fenced blocks → (path, body).
pub fn extract_code_files_from_markdown(content: &str) -> Vec<(String, String)> {
    let mut out = Vec::new();
    let mut lines = content.lines().peekable();
    while let Some(line) = lines.next() {
        let trimmed = line.trim_start();
        if !trimmed.starts_with("```") {
            continue;
        }
        let info = trimmed.trim_start_matches('`').trim();
        let path = parse_fence_path(info);
        let mut body_lines = Vec::new();
        while let Some(body_line) = lines.next() {
            if body_line.trim_start().starts_with("```") {
                break;
            }
            body_lines.push(body_line);
        }
        let Some(path) = path else {
            continue;
        };
        let body = body_lines.join("\n");
        if body.trim().is_empty() {
            continue;
        }
        // Skip pure markdown doc dumps as "code"
        if path.ends_with(".md") && body.chars().count() < 40 {
            continue;
        }
        out.push((path, body));
    }
    out
}

fn parse_fence_path(info: &str) -> Option<String> {
    let info = info.trim();
    if info.is_empty() {
        return None;
    }
    // path=foo/file.py
    for part in info.split_whitespace() {
        if let Some(p) = part.strip_prefix("path=") {
            let p = p.trim_matches('"').trim_matches('\'');
            if looks_like_rel_path(p) {
                return Some(p.to_string());
            }
        }
        if let Some(p) = part.strip_prefix("file=") {
            let p = p.trim_matches('"').trim_matches('\'');
            if looks_like_rel_path(p) {
                return Some(p.to_string());
            }
        }
    }
    // ```ysk-restaurant/src/foo.py
    if looks_like_rel_path(info) {
        return Some(info.to_string());
    }
    // ```python:ysk-restaurant/src/foo.py
    if let Some((_, rest)) = info.split_once(':') {
        let rest = rest.trim();
        if looks_like_rel_path(rest) {
            return Some(rest.to_string());
        }
    }
    None
}

fn looks_like_rel_path(s: &str) -> bool {
    if s.is_empty() || s.contains("://") || s.starts_with('/') {
        return false;
    }
    if s.contains("..") {
        return false;
    }
    s.contains('/')
        || s.ends_with(".py")
        || s.ends_with(".rs")
        || s.ends_with(".ts")
        || s.ends_with(".tsx")
        || s.ends_with(".js")
        || s.ends_with(".jsx")
        || s.ends_with(".go")
        || s.ends_with(".java")
        || s.ends_with(".kt")
        || s.ends_with(".swift")
        || s.ends_with(".css")
        || s.ends_with(".html")
        || s.ends_with(".sql")
        || s.ends_with(".toml")
        || s.ends_with(".json")
        || s.ends_with(".yml")
        || s.ends_with(".yaml")
        || s.ends_with(".sh")
}

/// Write extracted code fences under workspace_root. Returns written relative paths.
pub fn materialize_code_files(workspace_root: &Path, content: &str) -> Vec<String> {
    let mut written = Vec::new();
    for (rel, body) in extract_code_files_from_markdown(content) {
        let rel = rel.trim_start_matches("./");
        if rel.is_empty() || rel.contains("..") {
            continue;
        }
        let path = workspace_root.join(rel);
        if let Some(parent) = path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        if fs::write(&path, body.as_bytes()).is_ok() {
            written.push(rel.to_string());
        }
    }
    written
}

/// List top-level project-ish directories under company workspace for prompt context.
pub fn list_code_project_hints(workspace_root: &Path) -> String {
    let Ok(entries) = fs::read_dir(workspace_root) else {
        return String::new();
    };
    let mut projects = Vec::new();
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') || name == "pages" || name == "versions" || name == "agent-souls" {
            continue;
        }
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        // Prefer dirs that look like code projects
        let markers = ["src", "package.json", "Cargo.toml", "pyproject.toml", "go.mod", "README.md"];
        let looks_code = markers.iter().any(|m| path.join(m).exists());
        if looks_code || name.contains("restaurant") || name.contains("app") || name == "scripts" {
            projects.push(name);
        }
    }
    projects.sort();
    if projects.is_empty() {
        String::new()
    } else {
        format!(
            "## Code projects under workspace root\n\
Write code inside these (not only under pages/):\n- {}\n\
cwd for CLI is this workspace root.",
            projects.join("\n- ")
        )
    }
}

pub fn materialize_soul_file(
    temp_dir: &Path,
    agent: &AgentRecord,
    workspace_root: Option<&Path>,
) -> Result<Option<PathBuf>, String> {
    let Some(soul) = agent.soul.as_ref() else {
        return Ok(None);
    };
    if soul.raw_content.trim().is_empty() {
        return Ok(None);
    }

    if let Some(root) = workspace_root {
        let company_soul = root
            .join("agent-souls")
            .join(format!("{}.md", agent.id));
        if company_soul.exists() {
            return Ok(Some(company_soul));
        }
    }

    let path = temp_dir.join(format!("{}.soul.md", agent.id));
    fs::write(&path, &soul.raw_content).map_err(|e| e.to_string())?;
    Ok(Some(path))
}

pub fn resolve_agent_id(settings_default: &str, agent: &AgentRecord) -> String {
    if !settings_default.trim().is_empty() {
        return settings_default.trim().to_string();
    }

    let slug = agent
        .id
        .trim_start_matches("agent-")
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
                ch
            } else {
                '-'
            }
        })
        .collect::<String>();

    if slug.is_empty() {
        "main".to_string()
    } else {
        slug
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scrum::types::{WorkNodeKind, WorkNodeStatus};

    fn sample_task(title: &str, desc: &str) -> WorkNode {
        WorkNode {
            id: "t1".into(),
            parent_id: None,
            project_id: "p1".into(),
            kind: WorkNodeKind::Task,
            title: title.into(),
            description: desc.into(),
            status: WorkNodeStatus::Ready,
            priority: 1,
            story_points: 1,
            backlog_rank: 0,
            assignee_agent_id: None,
            assigned_by_manager_id: None,
            owner_pm_agent_id: None,
            retry_count: 0,
            department: "Engineering".into(),
            sprint_id: None,
            depends_on: vec![],
            acceptance_criteria: vec![],
            linked_workspace_page_id: None,
            linked_gig_contract_id: None,
            awaiting_ceo_gate: false,
            created_at: String::new(),
            updated_at: String::new(),
            completed_at: None,
            queued_at: None,
        }
    }

    #[test]
    fn mode_implementation_is_code() {
        let t = sample_task("Implementation: Order API", "Build the core deliverable.");
        assert_eq!(
            infer_task_work_mode(&t, "Engineering"),
            TaskWorkMode::ImplementCode
        );
    }

    #[test]
    fn mode_research_is_doc() {
        let t = sample_task("Research & scope: Foo", "Gather context.");
        assert_eq!(
            infer_task_work_mode(&t, "Engineering"),
            TaskWorkMode::ResearchDoc
        );
    }

    #[test]
    fn mode_standup_implementation_is_process() {
        let t = sample_task(
            "Implementation: Follow-up: Daily Standup",
            "Build the core deliverable.",
        );
        assert_eq!(
            infer_task_work_mode(&t, "Engineering"),
            TaskWorkMode::ProcessNote
        );
    }

    #[test]
    fn extract_path_fences() {
        let md = r#"
changelog
```python path=ysk-restaurant/src/ysk_restaurant/foo.py
def hi():
    return 1
```
"#;
        let files = extract_code_files_from_markdown(md);
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].0, "ysk-restaurant/src/ysk_restaurant/foo.py");
        assert!(files[0].1.contains("def hi"));
    }

    #[test]
    fn chatter_detection() {
        assert!(looks_like_process_chatter(
            "I'll review the workspace and PM feedback so we can revise the deliverable."
        ));
        assert!(looks_like_process_chatter(
            "先檢視工作區現況、PM 回饋與既有交付物，再依回饋更新修訂版交付內容。"
        ));
        assert!(!looks_like_process_chatter(
            "Added order state machine.\n\nFiles:\n- ysk-restaurant/src/ysk_restaurant/domain/order_state.py\n\n```python path=ysk-restaurant/src/ysk_restaurant/domain/order_state.py\nclass Order:\n    pass\n```\n"
        ));
    }
}
