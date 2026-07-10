pub mod browser;
pub mod http;
pub mod media;
pub mod script;
pub mod workspace;

use super::security::SkillPolicy;
use super::types::SkillDispatchResult;
use crate::state::{AgentRecord, AppState};
use std::path::Path;

/// Runtime context for skill tool execution.
pub struct SkillExecContext<'a> {
    pub state: &'a mut AppState,
    pub agent: &'a AgentRecord,
    pub workspace_root: Option<&'a Path>,
    pub policy: &'a SkillPolicy,
    pub dry_run: bool,
}

pub fn run_tool(
    ctx: &mut SkillExecContext<'_>,
    tool: &str,
    args: &serde_json::Value,
) -> SkillDispatchResult {
    let tool = tool.trim();
    let dry = ctx.dry_run;
    match tool {
        // Workspace / research
        "workspace_search" => workspace::workspace_search(ctx, args, dry),
        "workspace_read_page" => workspace::workspace_read_page(ctx, args, dry),
        "write_summary_page" => workspace::write_summary_page(ctx, args, dry),
        "propose_patch" => workspace::propose_patch(ctx, args, dry),
        "export_zip" => workspace::export_zip(ctx, args, dry),

        // HTTP research
        "web_search" => http::web_search(args, dry),
        "fetch_url" => http::fetch_url(args, dry, ctx.policy),

        // Media
        "generate_image" | "edit_image" => media::generate_or_edit_image(ctx, tool, args, dry),
        "generate_audio" | "text_to_speech" => media::generate_audio(ctx, args, dry),
        "generate_video" => media::generate_video(ctx, args, dry),
        "video_job_status" => media::video_job_status(ctx, args, dry),
        "transcribe" => media::transcribe(ctx, args, dry),
        "render_mermaid" => media::render_mermaid(ctx, args, dry),

        // Engineering sandbox
        "run_python" => media::run_python_sandbox(args, dry, ctx.policy),
        "run_script" => script::run_script_tool(ctx, args, dry),
        "list_script_skills" => {
            let Some(workspace) = ctx.workspace_root else {
                return SkillDispatchResult {
                    tool: "list_script_skills".into(),
                    ok: false,
                    message: "Workspace required.".into(),
                    data: serde_json::Value::Null,
                    dry_run: dry,
                };
            };
            let app_data = workspace
                .parent()
                .and_then(|p| p.parent())
                .and_then(|p| p.parent())
                .unwrap_or(workspace);
            let list = crate::skills::custom::list_custom(app_data, Some(workspace));
            SkillDispatchResult {
                tool: "list_script_skills".into(),
                ok: true,
                message: format!("{} custom skill(s).", list.len()),
                data: serde_json::json!({ "skills": list }),
                dry_run: dry,
            }
        }

        // Browser / growth
        "browser_goto" | "browser_snapshot" | "browser_fill" | "browser_click" => {
            browser::browser_tool(ctx, tool, args, dry, ctx.policy)
        }
        "x_post" => browser::x_post(ctx, args, dry, ctx.policy),
        "secrets_get" => browser::secrets_get(ctx, args, dry),

        _ => SkillDispatchResult {
            tool: tool.to_string(),
            ok: false,
            message: format!("No adapter registered for tool '{tool}'."),
            data: serde_json::Value::Null,
            dry_run: dry,
        },
    }
}
