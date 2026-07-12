use crate::agent_activity::{
    emit_deliverable_ready, emit_error, end_session, resolve_brain_labels, start_session,
    ActivityRunContext, ActivitySource, BrainLayer, NewSessionParams, SessionStatus,
};
use crate::agent_runtime::detached::{execute_for_task_detached, DetachedRuntimeContext};
use super::org::resolve_pm_agent_id;
use super::tree::{mark_story_done_if_tasks_complete, now_iso, recompute_project_progress};
use super::types::{
    DirectiveStatus, ExecutionRun, ExecutionStatus, ExecutionWorkspaceInfo,
    ExecutionWorkspacePagePath, WorkNode, WorkNodeKind, WorkNodeStatus,
};
use crate::ai::provider::ChatRequest;
use crate::ai::{self, BilledChatRequest};
use crate::ai::token_estimate;
use crate::db::persistence::commit;
use crate::lock_util::MutexExt;
use crate::soul::build_chat_parts_for_agent;
use crate::state::{AgentRecord, AppState};
use crate::token_budget::charge_tokens;
use crate::workspace::{
    agent_service::{AgentContext, AgentWorkspaceService},
    storage::{company_workspace_root, WorkspaceStorage},
};
use std::sync::Mutex;
use tauri::{AppHandle, Manager};
use uuid::Uuid;

pub struct WorkExecutionEstimate {
    pub estimated_tokens: u64,
    pub affordable: bool,
    pub message: String,
}

/// Dual-address workspace info for UI + Grok (logical folder id + absolute paths).
pub fn build_execution_workspace_info(
    state: &AppState,
    agent: &crate::state::AgentRecord,
    workspace_root: Option<&std::path::Path>,
) -> ExecutionWorkspaceInfo {
    let folder_id = AgentWorkspaceService::agent_folder_id(&agent.id);
    let root_str = workspace_root
        .map(|p| p.display().to_string())
        .unwrap_or_default();
    let mut info = ExecutionWorkspaceInfo {
        company_id: state.company_id.clone(),
        company_workspace_root: root_str.clone(),
        agent_folder_id: folder_id.clone(),
        agent_folder_name: agent.name.clone(),
        agent_memory_page_id: None,
        agent_memory_md_path: None,
        page_paths: Vec::new(),
        cwd: root_str.clone(),
        access_notes: vec![
            "CLI cwd is the company workspace root (not chrooted to the agent folder).".into(),
            "Agent folder id is for SoulCorp Workspace UI; page files live under pages/.".into(),
            "Prefer absolute .md paths below if your tools can open local files.".into(),
        ],
    };

    let Some(root) = workspace_root else {
        info.access_notes
            .push("No company workspace root resolved for this run.".into());
        return info;
    };

    let Ok(storage) = WorkspaceStorage::new(root.to_path_buf()) else {
        return info;
    };
    let agent_ctx = AgentContext::from_record(agent);
    let service = AgentWorkspaceService::new(&storage);
    let _ = service.ensure_agent_folder(&agent_ctx);

    if let Ok(( _text, page_id, _)) =
        crate::workspace::agent_memory::read_memory_text(&storage, &agent_ctx)
    {
        info.agent_memory_page_id = page_id.clone();
        if let Some(pid) = page_id {
            let md = root.join("pages").join(format!("{pid}.md"));
            info.agent_memory_md_path = Some(md.display().to_string());
        }
    }

    if let Ok(folder) = service.list_folder(&agent_ctx) {
        if !folder.folder_id.is_empty() {
            info.agent_folder_id = folder.folder_id;
        }
        for page in folder.pages.into_iter().take(12) {
            let md = root.join("pages").join(format!("{}.md", page.id));
            info.page_paths.push(ExecutionWorkspacePagePath {
                title: page.title,
                page_id: page.id,
                md_path: md.display().to_string(),
            });
        }
    }

    info
}

/// Prompt body shown to the user as "CLI input" (same builder Grok compact path uses).
pub fn build_execution_cli_input(
    task: &WorkNode,
    agent: &crate::state::AgentRecord,
    project_title: &str,
    workspace_root: Option<&std::path::Path>,
) -> String {
    build_execution_cli_input_lang(task, agent, project_title, workspace_root, None)
}

pub fn build_execution_cli_input_lang(
    task: &WorkNode,
    agent: &crate::state::AgentRecord,
    project_title: &str,
    workspace_root: Option<&std::path::Path>,
    language_block: Option<&str>,
) -> String {
    let workspace_addon = crate::scrum::agent_tools::workspace_prompt_addon(
        workspace_root,
        agent,
        project_title,
        task,
        false,
    );
    crate::agent_runtime::task_prompt::build_compact_prompt_lang(
        task,
        agent,
        project_title,
        workspace_addon.as_deref(),
        language_block,
    )
}

/// Prompt + command + prompt-file path + workspace info for observability (View CLI input).
pub fn build_execution_cli_bundle(
    state: &AppState,
    task: &WorkNode,
    agent: &crate::state::AgentRecord,
    project_title: &str,
    workspace_root: Option<&std::path::Path>,
) -> (String, String, Option<String>, ExecutionWorkspaceInfo) {
    let workspace_info = build_execution_workspace_info(state, agent, workspace_root);
    let lang_block = crate::i18n::language_instruction(crate::i18n::language_from_settings(
        &state.settings,
    ));
    let prompt = build_execution_cli_input_lang(
        task,
        agent,
        project_title,
        workspace_root,
        Some(&lang_block),
    );
    let (command, prompt_path) =
        format_execution_cli_command(state, agent, &prompt, workspace_root, &workspace_info);
    (prompt, command, prompt_path, workspace_info)
}

/// Returns (display command, absolute prompt file path if materialized).
fn format_execution_cli_command(
    state: &AppState,
    agent: &crate::state::AgentRecord,
    prompt: &str,
    workspace_root: Option<&std::path::Path>,
    workspace_info: &ExecutionWorkspaceInfo,
) -> (String, Option<String>) {
    let runtime_id = crate::brain::resolve_execution_runtime(
        &state.settings,
        &state.department_agent_runtimes,
        &agent.department,
        agent,
    );
    let timeout = state.settings.openclaw_timeout_secs.max(30).min(3600);
    let cwd = workspace_root
        .map(|p| p.display().to_string())
        .unwrap_or_else(|| "(process default cwd)".into());

    let key_set = !state.settings.grok_api_key.trim().is_empty();
    let key_allowed = state.settings.agent_runtime_allow_cli_env_keys;
    let key_note = match (key_set, key_allowed) {
        (true, true) => "XAI_API_KEY=injected from Settings → AI (Grok)".to_string(),
        (true, false) => {
            "XAI_API_KEY=NOT injected — enable Agent Brains → “Allow CLI to read API keys”"
                .to_string()
        }
        (false, _) => {
            "XAI_API_KEY=missing — set Grok key in Settings → AI providers".to_string()
        }
    };

    let memory_line = workspace_info
        .agent_memory_md_path
        .as_deref()
        .unwrap_or("(none)");

    // Materialize a real absolute prompt.md so View CLI never shows a fake `*` path.
    let prompt_path = crate::agent_runtime::PromptFile::write_kept(
        &format!("view-{}", runtime_id.replace(['/', ' '], "-")),
        prompt,
    )
    .map(|f| f.path_str())
    .ok();

    let meta = format!(
        "# --- metadata (not part of argv) ---\n\
         # cwd: {cwd}\n\
         # timeout: {timeout}s\n\
         # env: {key_note}\n\
         # runtime_id: {runtime_id}\n\
         # agent: {} · {}\n\
         # agent_folder_id: {}\n\
         # agent_folder_name: {}\n\
         # memory_md: {memory_line}\n\
         # company_workspace_root: {}\n\
         # prompt_file: {}\n\
         # Full prompt body is in the “Prompt body” section below (never on argv).",
        agent.name,
        agent.department,
        workspace_info.agent_folder_id,
        workspace_info.agent_folder_name,
        workspace_info.company_workspace_root,
        prompt_path
            .as_deref()
            .unwrap_or("(failed to write temp prompt file)")
    );

    if runtime_id == "llm_only" || runtime_id.is_empty() {
        return (
            format!(
                "# In-app LLM (no subprocess)\n# agent={}\n# department={}\n{meta}",
                agent.name, agent.department
            ),
            None,
        );
    }

    let binary = resolve_cli_binary_label(state, &runtime_id);
    let delivery = crate::agent_runtime::registry::prompt_delivery_for_runtime_id(&runtime_id);
    let path_for_argv = prompt_path
        .clone()
        .unwrap_or_else(|| "(prompt-file path unavailable)".into());

    let cmdline = match delivery {
        crate::agent_runtime::PromptDelivery::PromptFile { flag: _ }
        | crate::agent_runtime::PromptDelivery::MessageFile { flag: _ }
        | crate::agent_runtime::PromptDelivery::FileFlag { flag: _ }
            if runtime_id == "grok"
                || binary.ends_with("grok")
                || binary.contains("/grok")
                || matches!(
                    crate::agent_runtime::runtime_by_id(&runtime_id).map(|e| e.adapter.as_str()),
                    Some("grok_headless")
                ) =>
        {
            crate::agent_runtime::adapters::grok::headless_command_preview(
                &binary,
                &path_for_argv,
                workspace_root,
                true,
            )
        }
        crate::agent_runtime::PromptDelivery::PromptFile { flag }
        | crate::agent_runtime::PromptDelivery::MessageFile { flag }
        | crate::agent_runtime::PromptDelivery::FileFlag { flag } => {
            if matches!(
                crate::agent_runtime::runtime_by_id(&runtime_id).map(|e| e.adapter.as_str()),
                Some("claw_agent_cli")
            ) {
                format!(
                    "{binary} agent --agent <id> {flag} {path_for_argv} --json --timeout {timeout} --no-color"
                )
            } else {
                format!("{binary} {flag} {path_for_argv}")
            }
        }
        crate::agent_runtime::PromptDelivery::Stdin => {
            format!("{binary}   # prompt via stdin; file also at {path_for_argv}")
        }
    };

    (
        format!(
            "{cmdline}\n\
             {meta}"
        ),
        prompt_path,
    )
}

fn resolve_cli_binary_label(state: &AppState, runtime_id: &str) -> String {
    let configured = state.settings.openclaw_binary_path.trim();
    if !configured.is_empty() {
        return configured.to_string();
    }
    let default_binary = crate::agent_runtime::runtime_by_id(runtime_id)
        .map(|entry| {
            if entry.default_binary.is_empty() {
                runtime_id.to_string()
            } else {
                entry.default_binary.clone()
            }
        })
        .unwrap_or_else(|| {
            if runtime_id == "grok" || runtime_id.contains("grok") {
                "grok".to_string()
            } else {
                runtime_id.to_string()
            }
        });

    // Prefer absolute path so the preview / spawn match (GUI apps often lack ~/.local/bin on PATH).
    crate::agent_runtime::security::resolve_binary("", &default_binary, runtime_id)
        .unwrap_or(default_binary)
}

pub fn estimate_execution(state: &AppState, work_node_id: &str) -> Result<WorkExecutionEstimate, String> {
    let task = state
        .work_nodes
        .iter()
        .find(|n| n.id == work_node_id)
        .ok_or_else(|| "Work item not found.".to_string())?;
    if task.kind != WorkNodeKind::Task {
        return Err("Only tasks can be executed.".to_string());
    }
    let agent_id = task
        .assignee_agent_id
        .clone()
        .ok_or_else(|| "Assign an agent before executing.".to_string())?;
    let agent = state
        .agents
        .get(&agent_id)
        .ok_or_else(|| "Assignee not found.".to_string())?;

    let request = build_execution_request(state, task, agent)?;
    let estimate = token_estimate::estimate_request(&request) as u64;
    let affordable = crate::token_budget::can_afford(state, &agent_id, estimate as u32).is_ok();
    let agent_bal = state
        .token_economy
        .agents
        .get(&agent_id)
        .map(|w| w.balance)
        .unwrap_or(0);
    Ok(WorkExecutionEstimate {
        estimated_tokens: estimate,
        affordable,
        message: if affordable {
            format!("Execution will use about {estimate} tokens.")
        } else {
            format!(
                "Insufficient token budget for this execution \
                 (~{estimate} needed, agent has {agent_bal}). \
                 Open Tokens → Overview (set company pool) or Agents → Allocate (0 = unlimited pack), then retry."
            )
        },
    })
}

/// Prepared job for one task execution (LLM/CLI runs **without** holding AppState).
struct PreparedExecution {
    run_id: String,
    session_id: String,
    task: WorkNode,
    agent: AgentRecord,
    project_title: String,
    estimated_tokens: u64,
    runtime: DetachedRuntimeContext,
    /// When set, execution was skipped (throttled) and this run is already final.
    early_run: Option<ExecutionRun>,
}

/// Execute a work task without holding AppState across LLM/CLI.
///
/// Holding the global mutex during network/subprocess freezes the entire UI
/// (every other command also needs AppState). Always use this path for UI/worker.
pub fn execute_task(app: &AppHandle, work_node_id: &str) -> Result<ExecutionRun, String> {
    let result = execute_task_unlocked(app, work_node_id);
    if let Err(ref err) = result {
        let msg = format!("Task {work_node_id} failed: {err}");
        // Queue order / paused / assign — expected UX, not a crash.
        let lower = err.to_ascii_lowercase();
        let expected = lower.contains("not at the head of the agent's queue")
            || lower.contains("paused")
            || lower.contains("assign an agent")
            || lower.contains("already completed")
            || lower.contains("awaiting review");
        if expected {
            crate::app_log::log_warn(
                app,
                crate::app_log::LogCategory::Execution,
                "execute_task",
                msg,
            );
        } else {
            crate::app_log::log_error(
                app,
                crate::app_log::LogCategory::Execution,
                "execute_task",
                msg,
            );
        }
    }
    result
}

fn execute_task_unlocked(app: &AppHandle, work_node_id: &str) -> Result<ExecutionRun, String> {
    let prepared = {
        let state_mutex = app.state::<Mutex<AppState>>();
        let mut state = state_mutex.lock_or_recover()?;
        prepare_execution(&mut state, app, work_node_id)?
    };

    if let Some(run) = prepared.early_run {
        let state_mutex = app.state::<Mutex<AppState>>();
        if let Ok(state) = state_mutex.lock_or_recover() {
            let _ = commit(app.clone(), &state);
        }
        return Ok(run);
    }

    let activity = ActivityRunContext {
        session_id: prepared.session_id.clone(),
        app: app.clone(),
    };

    // CRITICAL: no AppState lock here — Grok CLI / HTTP can take minutes.
    let llm_result = execute_for_task_detached(
        &prepared.runtime,
        &prepared.task,
        &prepared.agent,
        &prepared.project_title,
        Some(activity),
    );

    let state_mutex = app.state::<Mutex<AppState>>();
    let mut state = state_mutex.lock_or_recover()?;
    let run = apply_execution_result(&mut state, app, &prepared, llm_result)?;
    let _ = commit(app.clone(), &state);
    Ok(run)
}

fn prepare_execution(
    state: &mut AppState,
    app: &AppHandle,
    work_node_id: &str,
) -> Result<PreparedExecution, String> {
    super::queue::assert_can_execute_now(state, work_node_id)?;

    let task = state
        .work_nodes
        .iter()
        .find(|n| n.id == work_node_id)
        .cloned()
        .ok_or_else(|| "Work item not found.".to_string())?;
    if task.kind != WorkNodeKind::Task {
        return Err("Only tasks can be executed.".to_string());
    }
    if matches!(task.status, WorkNodeStatus::Done | WorkNodeStatus::InReview) {
        return Err("Task is already completed or awaiting review.".to_string());
    }
    let agent_id = task
        .assignee_agent_id
        .clone()
        .ok_or_else(|| "Assign an agent before executing.".to_string())?;
    let agent = state
        .agents
        .get(&agent_id)
        .cloned()
        .ok_or_else(|| "Assignee not found.".to_string())?;

    crate::token_budget::fund_agent_for_execution(state, &agent_id, 50_000);
    let estimate = estimate_execution(state, work_node_id)?;
    let project_title = state
        .projects
        .iter()
        .find(|p| p.id == task.project_id)
        .map(|p| p.title.clone())
        .unwrap_or_else(|| "Company project".to_string());
    let workspace_root = if state.company_id.is_empty() {
        None
    } else {
        app.path()
            .app_data_dir()
            .ok()
            .map(|dir| company_workspace_root(&dir, &state.company_id))
    };
    let runtime = DetachedRuntimeContext {
        settings: state.settings.clone(),
        hub: state.hub.clone(),
        department_providers: state.department_ai_providers.clone(),
        department_runtimes: state.department_agent_runtimes.clone(),
        company_id: state.company_id.clone(),
        workspace_root: workspace_root.clone(),
    };
    let (cli_prompt, cli_command, cli_prompt_path, workspace_info) = build_execution_cli_bundle(
        state,
        &task,
        &agent,
        &project_title,
        workspace_root.as_deref(),
    );

    if !estimate.affordable {
        let run = ExecutionRun {
            id: format!("exec-{}", Uuid::new_v4()),
            work_node_id: work_node_id.to_string(),
            agent_id: agent_id.clone(),
            status: ExecutionStatus::Throttled,
            provider: String::new(),
            estimated_tokens: estimate.estimated_tokens,
            actual_tokens: 0,
            deliverable_page_id: None,
            summary: String::new(),
            error: Some(estimate.message.clone()),
            started_at: now_iso(),
            finished_at: Some(now_iso()),
            cli_input: Some(cli_prompt),
            cli_command: Some(cli_command),
            cli_prompt_path,
            workspace_info: Some(workspace_info),
        };
        state.execution_runs.push(run.clone());
        return Ok(PreparedExecution {
            run_id: run.id.clone(),
            session_id: String::new(),
            task,
            agent,
            project_title,
            estimated_tokens: estimate.estimated_tokens,
            runtime,
            early_run: Some(run),
        });
    }

    let run_id = format!("exec-{}", Uuid::new_v4());
    state.execution_runs.push(ExecutionRun {
        id: run_id.clone(),
        work_node_id: work_node_id.to_string(),
        agent_id: agent_id.clone(),
        status: ExecutionStatus::Running,
        provider: String::new(),
        estimated_tokens: estimate.estimated_tokens,
        actual_tokens: 0,
        deliverable_page_id: None,
        summary: String::new(),
        error: None,
        started_at: now_iso(),
        finished_at: None,
        cli_input: Some(cli_prompt),
        cli_command: Some(cli_command),
        cli_prompt_path,
        workspace_info: Some(workspace_info),
    });

    if let Some(node) = state.work_nodes.iter_mut().find(|n| n.id == work_node_id) {
        node.status = WorkNodeStatus::InProgress;
        node.updated_at = now_iso();
    }
    if let Some(agent_mut) = state.agents.get_mut(&agent_id) {
        agent_mut.status = "working".to_string();
    }

    let (brain_label, transport) = resolve_brain_labels(state, &agent, BrainLayer::Execution);
    let session_id = start_session(
        state,
        Some(app),
        NewSessionParams {
            agent_id: agent_id.clone(),
            agent_name: agent.name.clone(),
            source: ActivitySource::Execution,
            brain_layer: BrainLayer::Execution,
            brain_label,
            transport,
            work_node_id: Some(work_node_id.to_string()),
            work_node_title: Some(task.title.clone()),
            meeting_id: None,
            run_id: Some(run_id.clone()),
        },
    );

    Ok(PreparedExecution {
        run_id,
        session_id,
        task,
        agent,
        project_title,
        estimated_tokens: estimate.estimated_tokens,
        runtime,
        early_run: None,
    })
}

fn apply_execution_result(
    state: &mut AppState,
    app: &AppHandle,
    prepared: &PreparedExecution,
    llm_result: Result<crate::agent_runtime::detached::DetachedExecutionResult, String>,
) -> Result<ExecutionRun, String> {
    let work_node_id = prepared.task.id.as_str();
    let agent_id = prepared.agent.id.as_str();
    let session_id = prepared.session_id.as_str();
    let run_id = prepared.run_id.as_str();
    let workspace_root = prepared.runtime.workspace_root.clone();

    match llm_result {
        Ok(detached) => {
            let content = detached.content;
            let page_id = write_deliverable(app, state, &prepared.task, &prepared.agent, &content)?;
            let summary = truncate_summary(&content);
            emit_deliverable_ready(
                state,
                Some(app),
                session_id,
                agent_id,
                &page_id,
                &summary,
            );
            end_session(
                state,
                Some(app),
                session_id,
                SessionStatus::Completed,
                Some(summary.clone()),
            );
            if let Some(charge) = detached.charge {
                let _ = charge_tokens(state, charge);
            }
            let tokens = prepared.estimated_tokens;
            let gate_deliverable = crate::autopilot::gates_deliverables(state);
            if let Some(node) = state.work_nodes.iter_mut().find(|n| n.id == work_node_id) {
                node.status = WorkNodeStatus::InReview;
                node.linked_workspace_page_id = Some(page_id.clone());
                node.awaiting_ceo_gate = gate_deliverable;
                node.updated_at = now_iso();
            }
            let parent_id = prepared.task.parent_id.clone();
            let project_id = prepared.task.project_id.clone();
            if let Some(story_id) = parent_id {
                mark_story_done_if_tasks_complete(&mut state.work_nodes, &story_id);
            }
            let nodes_snapshot = state.work_nodes.clone();
            recompute_project_progress(&mut state.projects, &nodes_snapshot, &project_id);
            if let Some(agent_mut) = state.agents.get_mut(agent_id) {
                agent_mut.status = "idle".to_string();
            }
            if let Some(run) = state.execution_runs.iter_mut().find(|r| r.id == run_id) {
                run.status = ExecutionStatus::Succeeded;
                run.provider = detached.provider;
                run.actual_tokens = tokens;
                run.deliverable_page_id = Some(page_id);
                run.summary = summary.clone();
                run.finished_at = Some(now_iso());
            }
            if let Some(root) = workspace_root.as_ref() {
                if let Ok(storage) = WorkspaceStorage::new(root.clone()) {
                    let _ = storage.ensure_seed();
                    crate::workspace::agent_memory::after_task_success(
                        state,
                        &storage,
                        &prepared.agent,
                        &prepared.task.title,
                        &summary,
                    );
                }
            }
            state
                .execution_runs
                .iter()
                .find(|r| r.id == run_id)
                .cloned()
                .ok_or_else(|| "Execution run missing.".to_string())
        }
        Err(error) => {
            emit_error(state, Some(app), session_id, agent_id, &error);
            end_session(
                state,
                Some(app),
                session_id,
                SessionStatus::Failed,
                Some(error.clone()),
            );
            if let Some(node) = state.work_nodes.iter_mut().find(|n| n.id == work_node_id) {
                node.status = WorkNodeStatus::Blocked;
                node.updated_at = now_iso();
            }
            if let Some(agent_mut) = state.agents.get_mut(agent_id) {
                agent_mut.status = "idle".to_string();
            }
            if let Some(run) = state.execution_runs.iter_mut().find(|r| r.id == run_id) {
                run.status = ExecutionStatus::Failed;
                run.error = Some(error.clone());
                run.finished_at = Some(now_iso());
            }
            // Return the failed run so UI can show it (don't Err out after state is updated).
            state
                .execution_runs
                .iter()
                .find(|r| r.id == run_id)
                .cloned()
                .ok_or(error)
        }
    }
}

pub fn build_execution_request_for_project(
    task: &WorkNode,
    agent: &crate::state::AgentRecord,
    project_title: &str,
) -> Result<ChatRequest, String> {
    let ac = if task.acceptance_criteria.is_empty() {
        "Meet the task objective with clear, actionable output.".to_string()
    } else {
        task.acceptance_criteria.join("\n- ")
    };

    let task_context = format!(
        "Project: {project_title}\nTask: {}\nDetails: {}\nAcceptance criteria:\n- {}",
        task.title, task.description, ac
    );
    let (persona, context) = build_chat_parts_for_agent(
        agent.soul.as_ref(),
        &agent.name,
        &agent.role,
        &agent.department,
        &task_context,
    );
    let mode = crate::agent_runtime::task_prompt::infer_task_work_mode(task, &agent.department);
    // In-app LLM has no shell tools — require path= fenced code for implement mode.
    let mode_block =
        crate::agent_runtime::task_prompt::work_mode_instructions(mode, /* has_tools */ false);
    let user_prompt = format!(
        "You are executing a work task for project '{project_title}'.\n\n\
Task: {}\nDetails: {}\n\nAcceptance criteria:\n- {}\n\n\
{mode_block}\n\n\
Hard rules:\n\
- Never return only process chatter (“I'll review…”, “先檢視…”).\n\
- For IMPLEMENT CODE: emit real source in fenced blocks with path=… so files can be written.\n\
- Prefer shipping code over meta-documentation.\n\n\
Follow the Output language section in the system/context instructions if present.",
        task.title, task.description, ac
    );

    Ok(ChatRequest {
        system_prompt: persona,
        context: Some(context),
        user_prompt,
        temperature: 0.55,
        soul_id: agent.soul_id,
        conversation_turns: Vec::new(),
    })
}

pub(crate) fn build_execution_request(
    state: &AppState,
    task: &WorkNode,
    agent: &crate::state::AgentRecord,
) -> Result<ChatRequest, String> {
    let project = state
        .projects
        .iter()
        .find(|p| p.id == task.project_id)
        .map(|p| p.title.clone())
        .unwrap_or_else(|| "Company project".to_string());
    let mut request = build_execution_request_for_project(task, agent, &project)?;
    let lang = crate::i18n::language_instruction(crate::i18n::language_from_settings(
        &state.settings,
    ));
    request.system_prompt = format!("{lang}\n\n{}", request.system_prompt);
    request.user_prompt = format!(
        "{}\n\n{}",
        request.user_prompt.trim_end(),
        "Write the deliverable fully in the company language specified above."
    );
    Ok(request)
}

pub(crate) fn write_deliverable(
    app: &AppHandle,
    state: &AppState,
    task: &WorkNode,
    agent: &crate::state::AgentRecord,
    content: &str,
) -> Result<String, String> {
    if state.company_id.is_empty() {
        return Err("Company not loaded.".to_string());
    }
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let root = company_workspace_root(&dir, &state.company_id);
    let storage = WorkspaceStorage::new(root.clone())?;
    storage.ensure_seed()?;

    // Materialize fenced code blocks (path=…) into real files under the company workspace.
    let written_files =
        crate::agent_runtime::task_prompt::materialize_code_files(&root, content);
    let mut page_body = content.to_string();
    if !written_files.is_empty() {
        page_body.push_str("\n\n## Files written to workspace\n");
        for path in &written_files {
            page_body.push_str(&format!("- `{path}`\n"));
        }
    }

    let service = AgentWorkspaceService::new(&storage);
    let agent_ctx = AgentContext::from_record(agent);
    let page_title = format!(
        "Deliverable — {}",
        super::tree::collapse_revision_prefixes(&task.title)
    );
    let page = service.write_deliverable(&agent_ctx, &page_title, &page_body)?;
    Ok(page.id)
}

pub(crate) fn truncate_summary(content: &str) -> String {
    let trimmed = content.trim();
    if trimmed.chars().count() <= 240 {
        trimmed.to_string()
    } else {
        format!("{}…", trimmed.chars().take(240).collect::<String>())
    }
}

/// Pick one task and execute it **without** holding a caller-owned AppState lock.
/// Callers that currently hold `AppState` must drop it first (or use this only).
pub fn apply_scrum_execution_tick(app: &AppHandle) -> Option<String> {
    let candidate = {
        let state_mutex = app.state::<Mutex<AppState>>();
        let Ok(mut state) = state_mutex.lock_or_recover() else {
            return None;
        };
        if !state.settings.scrum_auto_execute || state.settings.scrum_execution_paused {
            return None;
        }
        if !crate::ai::auto_work_should_run(&state.settings) {
            return None;
        }
        if crate::token_budget::total_company_tokens(&state.token_economy)
            < state.settings.scrum_min_tokens_guard
        {
            return None;
        }
        super::queue::pick_serial_candidate(&mut state)
    }?;

    match execute_task(app, &candidate) {
        Ok(run) => Some(format!(
            "Work execution {} for task {}.",
            match run.status {
                ExecutionStatus::Succeeded => "completed",
                ExecutionStatus::Throttled => "throttled (tokens)",
                _ => "finished",
            },
            run.work_node_id
        )),
        Err(err) => Some(format!("Work execution failed: {err}")),
    }
}

pub fn retry_blocked_tasks(state: &mut AppState) -> u32 {
    let max_retries = state.settings.scrum_max_blocked_retries.max(1);
    let mut count = 0u32;
    for node in state.work_nodes.iter_mut() {
        if node.status != WorkNodeStatus::Blocked {
            continue;
        }
        if node.retry_count >= max_retries {
            continue;
        }
        node.status = WorkNodeStatus::Ready;
        node.retry_count = node.retry_count.saturating_add(1);
        node.updated_at = now_iso();
        count += 1;
    }
    count
}

pub fn update_directive_lifecycle(state: &mut AppState) {
    let directive_ids: Vec<String> = state
        .directives
        .iter()
        .filter(|d| {
            matches!(
                d.status,
                DirectiveStatus::Routed | DirectiveStatus::Executing
            )
        })
        .map(|d| d.id.clone())
        .collect();

    for directive_id in directive_ids {
        let Some(directive) = state.directives.iter().find(|d| d.id == directive_id).cloned() else {
            continue;
        };
        if directive.spawned_node_ids.is_empty() {
            continue;
        }

        let nodes: Vec<_> = state
            .work_nodes
            .iter()
            .filter(|n| directive.spawned_node_ids.contains(&n.id))
            .collect();

        let tasks: Vec<_> = nodes
            .iter()
            .flat_map(|story| {
                state
                    .work_nodes
                    .iter()
                    .filter(|n| n.parent_id.as_deref() == Some(story.id.as_str()))
                    .collect::<Vec<_>>()
            })
            .chain(nodes.iter().filter(|n| n.kind == WorkNodeKind::Task).copied())
            .collect();

        let task_nodes: Vec<_> = if tasks.is_empty() {
            nodes
                .iter()
                .filter(|n| n.kind == WorkNodeKind::Task)
                .copied()
                .collect()
        } else {
            tasks
        };

        if task_nodes.is_empty() {
            continue;
        }

        let all_done = task_nodes
            .iter()
            .all(|n| n.status == WorkNodeStatus::Done);
        let any_active = task_nodes.iter().any(|n| {
            matches!(
                n.status,
                WorkNodeStatus::InProgress
                    | WorkNodeStatus::InReview
                    | WorkNodeStatus::InSprint
                    | WorkNodeStatus::Ready
            )
        });

        if let Some(directive) = state.directives.iter_mut().find(|d| d.id == directive_id) {
            if all_done {
                directive.status = DirectiveStatus::Done;
            } else if any_active {
                directive.status = DirectiveStatus::Executing;
            }
        }
    }
}

pub(crate) fn dependencies_satisfied(state: &AppState, node: &WorkNode) -> bool {
    node.depends_on.iter().all(|dep_id| {
        state
            .work_nodes
            .iter()
            .find(|n| n.id == *dep_id)
            .is_some_and(|n| n.status == WorkNodeStatus::Done)
    })
}

pub fn route_directive_llm(
    state: &mut AppState,
    directive_id: &str,
    project_id: &str,
) -> Result<Vec<WorkNode>, String> {
    // Fallback to rule-based when no PM / LLM unavailable
    let pm_id = resolve_pm_agent_id(state, Some(project_id));
    let directive = state
        .directives
        .iter()
        .find(|d| d.id == directive_id)
        .cloned()
        .ok_or_else(|| "Directive not found.".to_string())?;

    if pm_id.is_none() || state.settings.pure_local_mode {
        return super::scheduler::route_directive_rule_based(state, directive_id, project_id);
    }

    let pm_agent_id = pm_id.clone().unwrap();
    let pm = state
        .agents
        .get(&pm_agent_id)
        .cloned()
        .ok_or_else(|| "PM agent not found.".to_string())?;

    let team_skills: Vec<String> = state
        .agents
        .values()
        .filter(|a| !crate::fate::is_system_agent(a))
        .flat_map(|a| a.skills.clone())
        .collect();

    let departments: Vec<String> = state
        .agents
        .values()
        .filter(|a| !crate::fate::is_system_agent(a))
        .map(|a| a.department.clone())
        .collect::<std::collections::HashSet<_>>()
        .into_iter()
        .collect();

    let lang = crate::i18n::language_from_settings(&state.settings);
    let lang_req = crate::i18n::decompose_language_requirement(lang);
    let lang_block = crate::i18n::language_instruction(lang);
    let prompt = format!(
        "{lang_block}\n\n\
Break down this CEO directive into 1-2 stories with 3-6 tasks as JSON array.\n\
Directive: {}\nDetails: {}\nTeam skills: {}\nDepartments: {}\n\n\
{lang_req}\n\
Use cross-department tasks when needed. Order tasks so later items depend on earlier ones.\n\
Each story MUST include acceptance_criteria (array of at least 2 measurable strings). Each task SHOULD include acceptance_criteria when applicable.\n\
Return ONLY JSON like [{{\"kind\":\"story\",\"title\":\"...\",\"points\":5,\"department\":\"Engineering\",\"acceptance_criteria\":[\"Criterion 1\",\"Criterion 2\"],\"tasks\":[{{\"title\":\"...\",\"points\":2,\"department\":\"Engineering\",\"acceptance_criteria\":[\"Task criterion\"]}}]}}]",
        directive.title,
        directive.description,
        team_skills.join(", "),
        departments.join(", ")
    );

    let (persona, ctx) = build_chat_parts_for_agent(
        pm.soul.as_ref(),
        &pm.name,
        &pm.role,
        &pm.department,
        "PM planning and backlog decomposition",
    );
    let request = ChatRequest {
        system_prompt: format!("{lang_block}\n\n{persona}"),
        context: Some(ctx),
        user_prompt: prompt,
        temperature: 0.4,
        soul_id: pm.soul_id,
        conversation_turns: Vec::new(),
    };

    let dept_providers = state.department_ai_providers.clone();
    let billed = BilledChatRequest {
        request,
        agent_id: pm_agent_id.clone(),
        department: pm.department.clone(),
        source: "directive_decompose".to_string(),
    };

    match ai::chat_with_fallback_billed(
        state,
        billed,
        &dept_providers,
        pm.ai_provider.as_deref(),
    ) {
        Ok(resp) => parse_llm_decomposition(state, directive_id, project_id, &pm_agent_id, &resp.content),
        Err(_) => super::scheduler::route_directive_rule_based(state, directive_id, project_id),
    }
}

fn parse_llm_decomposition(
    state: &mut AppState,
    directive_id: &str,
    project_id: &str,
    pm_id: &str,
    content: &str,
) -> Result<Vec<WorkNode>, String> {
    #[derive(serde::Deserialize)]
    struct LlmTask {
        title: String,
        #[serde(default)]
        points: u8,
        #[serde(default)]
        department: String,
        #[serde(default)]
        acceptance_criteria: Vec<String>,
    }
    #[derive(serde::Deserialize)]
    struct LlmStory {
        title: String,
        #[serde(default)]
        points: u8,
        #[serde(default)]
        department: String,
        #[serde(default)]
        acceptance_criteria: Vec<String>,
        #[serde(default)]
        tasks: Vec<LlmTask>,
    }

    let json_start = content.find('[').unwrap_or(0);
    let json_end = content.rfind(']').map(|i| i + 1).unwrap_or(content.len());
    let slice = &content[json_start..json_end];

    let stories: Vec<LlmStory> = serde_json::from_str(slice).unwrap_or_default();
    if stories.is_empty() {
        return super::scheduler::route_directive_rule_based(state, directive_id, project_id);
    }

    let project_dept = state
        .projects
        .iter()
        .find(|p| p.id == project_id)
        .map(|p| p.owner_department.clone())
        .unwrap_or_else(|| "Engineering".to_string());

    let mut created = Vec::new();
    let now = now_iso();
    let story_rank = super::tree::next_backlog_rank(&state.work_nodes, project_id, None);

    for (story_index, story) in stories.into_iter().take(2).enumerate() {
        let story_id = super::tree::new_node_id();
        let dept = if story.department.is_empty() {
            project_dept.clone()
        } else {
            story.department.clone()
        };
        let story_criteria = if story.acceptance_criteria.len() >= 2 {
            story.acceptance_criteria.clone()
        } else {
            vec![
                "Deliverable meets story objective.".to_string(),
                "Acceptance criteria reviewed by PM.".to_string(),
            ]
        };
        let story_node = WorkNode {
            id: story_id.clone(),
            parent_id: None,
            project_id: project_id.to_string(),
            kind: WorkNodeKind::Story,
            title: story.title,
            description: String::new(),
            status: WorkNodeStatus::Ready,
            priority: 4,
            story_points: story.points.max(1),
            backlog_rank: story_rank + story_index as u32,
            assignee_agent_id: None,
            assigned_by_manager_id: None,
            owner_pm_agent_id: Some(pm_id.to_string()),
            retry_count: 0,
            department: dept.clone(),
            sprint_id: None,
            depends_on: Vec::new(),
            acceptance_criteria: story_criteria,
            linked_workspace_page_id: None,
            linked_gig_contract_id: None,
            awaiting_ceo_gate: false,
            created_at: now.clone(),
            updated_at: now.clone(),
            completed_at: None,
            queued_at: None,
        };
        created.push(story_node.clone());
        state.work_nodes.push(story_node);

        let mut previous_task_id: Option<String> = None;
        for (task_index, task) in story.tasks.into_iter().take(6).enumerate() {
            let task_id = super::tree::new_node_id();
            let depends_on = previous_task_id.clone().into_iter().collect::<Vec<_>>();
            let task_criteria = if task.acceptance_criteria.is_empty() {
                vec!["Complete and publish deliverable.".to_string()]
            } else {
                task.acceptance_criteria.clone()
            };
            let task_node = WorkNode {
                id: task_id.clone(),
                parent_id: Some(story_id.clone()),
                project_id: project_id.to_string(),
                kind: WorkNodeKind::Task,
                title: task.title,
                description: String::new(),
                status: WorkNodeStatus::Backlog,
                priority: 4,
                story_points: task.points.max(1),
                backlog_rank: task_index as u32,
                assignee_agent_id: None,
                assigned_by_manager_id: None,
                owner_pm_agent_id: Some(pm_id.to_string()),
                retry_count: 0,
                department: if task.department.is_empty() {
                    dept.clone()
                } else {
                    task.department.clone()
                },
                sprint_id: None,
                depends_on,
                acceptance_criteria: task_criteria,
                linked_workspace_page_id: None,
                linked_gig_contract_id: None,
                awaiting_ceo_gate: false,
                created_at: now.clone(),
                updated_at: now.clone(),
                completed_at: None,
                queued_at: None,
            };
            created.push(task_node.clone());
            state.work_nodes.push(task_node);
            previous_task_id = Some(task_id);
        }
    }

    if let Some(directive) = state.directives.iter_mut().find(|d| d.id == directive_id) {
        directive.status = super::types::DirectiveStatus::Routed;
        directive.spawned_node_ids = created.iter().map(|n| n.id.clone()).collect();
    }

    Ok(created)
}