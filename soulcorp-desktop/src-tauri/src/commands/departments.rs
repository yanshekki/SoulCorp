use crate::db::persistence::commit;
use crate::departments::{
    apply_department_specs, build_org_chart, clear_department_head_references,
    create_department_record, department_exists, ensure_default_departments,
    heuristic_department_specs, list_departments_snapshot, max_departments, normalize_specs,
    rename_department_references, transfer_department_members, try_llm_department_specs,
    would_create_reporting_cycle, AssignOrgResult, DepartmentsSnapshot, GenerateDepartmentsResult,
    OrgChartSnapshot,
};
use crate::fate::is_system_agent;
use crate::state::{AgentRecord, AppState};
use crate::token_budget::ensure_department_wallet;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

use crate::lock_util::MutexExt;
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateDepartmentRequest {
    pub name: String,
    pub display_name: String,
    pub sop: String,
    pub brand_color: String,
    pub accent_color: String,
    #[serde(default)]
    pub parent_department_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateDepartmentRequest {
    pub department_id: String,
    pub display_name: Option<String>,
    pub sop: Option<String>,
    pub brand_color: Option<String>,
    pub accent_color: Option<String>,
    pub parent_department_id: Option<Option<String>>,
    pub head_agent_id: Option<Option<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RenameDepartmentRequest {
    pub department_id: String,
    pub new_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeleteDepartmentRequest {
    pub department_id: String,
    pub transfer_to: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateAgentOrgRequest {
    pub agent_id: String,
    pub department: Option<String>,
    pub reports_to: Option<Option<String>>,
    pub manages_department: Option<Option<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct GenerateDepartmentsRequest {
    /// When true (default), only add missing department names (never delete).
    #[serde(default = "default_true")]
    pub merge: bool,
}

fn default_true() -> bool {
    true
}

fn prepare_department_state(state: &mut AppState) {
    ensure_default_departments(state);
}

fn find_department_index(state: &AppState, department_id: &str) -> Option<usize> {
    state
        .departments
        .iter()
        .position(|department| department.id == department_id)
}

#[tauri::command]
pub fn list_departments(state: State<'_, Mutex<AppState>>) -> Result<DepartmentsSnapshot, String> {
    let mut state = state.lock_or_recover()?;
    prepare_department_state(&mut state);
    Ok(list_departments_snapshot(&state))
}

/// Bulk-assign agents to departments + reporting lines.
///
/// Uses smart role/department heuristics under a **short** AppState lock.
/// Does **not** call LLM while holding the global mutex (that froze the desktop).
/// Optional unlocked LLM refine: set `SOULCORP_ORG_ASSIGN_LLM=1`.
#[tauri::command]
pub async fn assign_org_with_ai(app: AppHandle) -> Result<AssignOrgResult, String> {
    let progress =
        crate::progress::ProgressReporter::new(app.clone(), "assign_org_with_ai");
    progress.emit_indeterminate(
        "Assigning agents to departments and reporting lines…",
        Some("llm"),
    );

    let use_llm = matches!(
        std::env::var("SOULCORP_ORG_ASSIGN_LLM")
            .ok()
            .as_deref()
            .map(str::trim),
        Some("1") | Some("true") | Some("yes")
    );

    let app_for_blocking = app.clone();
    let outcome = tokio::task::spawn_blocking(move || {
        // --- Phase 1: short lock — prepare + heuristic (always) ---
        let (heuristic_raw, llm_ctx) = {
            let state_mutex = app_for_blocking.state::<Mutex<AppState>>();
            let mut state = state_mutex.lock_or_recover()?;
            prepare_department_state(&mut state);
            let heuristic = crate::departments::org_assign::heuristic_assignments(&state)?;
            if !use_llm {
                let sanitized =
                    crate::departments::org_assign::sanitize_assignments(&state, heuristic)?;
                if sanitized.is_empty() {
                    return Err::<AssignOrgResult, String>(
                        "No valid assignments produced.".into(),
                    );
                }
                let mut result =
                    crate::departments::org_assign::apply_assignments(&mut state, &sanitized);
                result.source = "heuristic".into();
                result.message = format!("{} (smart rules)", result.message);
                commit(app_for_blocking.clone(), &state)?;
                return Ok::<AssignOrgResult, String>(result);
            }
            // Snapshot everything needed for unlocked LLM, then drop the lock.
            let context = crate::departments::org_assign::build_assign_context(&state);
            let (agent_id, department) = {
                let (a, d) = crate::departments::org_assign::pick_billing_agent_public(&state);
                (a, d)
            };
            let settings = state.settings.clone();
            let hub = state.hub.clone();
            let providers = state.department_ai_providers.clone();
            (
                heuristic,
                Some((context, agent_id, department, settings, hub, providers)),
            )
        }; // AppState unlocked here

        // --- Phase 2: optional LLM without holding AppState ---
        let raw = if let Some((context, agent_id, department, settings, hub, providers)) = llm_ctx {
            let (tx, rx) = std::sync::mpsc::channel();
            let ctx = context.clone();
            std::thread::spawn(move || {
                let out = crate::departments::org_assign::try_llm_assignments_detached(
                    &settings,
                    &hub,
                    &providers,
                    &ctx,
                    agent_id,
                    department,
                );
                let _ = tx.send(out);
            });
            match rx.recv_timeout(std::time::Duration::from_secs(15)) {
                Ok(Some((list, _charge))) => list,
                _ => heuristic_raw,
            }
        } else {
            heuristic_raw
        };

        // --- Phase 3: short lock — sanitize + apply ---
        let state_mutex = app_for_blocking.state::<Mutex<AppState>>();
        let mut state = state_mutex.lock_or_recover()?;
        prepare_department_state(&mut state);
        let sanitized = crate::departments::org_assign::sanitize_assignments(&state, raw)?;
        if sanitized.is_empty() {
            return Err::<AssignOrgResult, String>("No valid assignments produced.".into());
        }
        let mut result =
            crate::departments::org_assign::apply_assignments(&mut state, &sanitized);
        result.source = if use_llm {
            "llm-or-heuristic".into()
        } else {
            "heuristic".into()
        };
        result.message = format!("{} ({})", result.message, result.source);
        commit(app_for_blocking.clone(), &state)?;
        Ok::<AssignOrgResult, String>(result)
    })
    .await
    .map_err(|e| e.to_string())??;

    progress.finish(&outcome.message);
    progress.clear();
    Ok(outcome)
}

/// LLM (or heuristic) generation of a full department org from current projects.
#[tauri::command]
pub async fn generate_departments_from_projects(
    request: GenerateDepartmentsRequest,
    _app_state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<GenerateDepartmentsResult, String> {
    let _ = request.merge; // v1 always merges; reserved for future replace mode

    let progress = crate::progress::ProgressReporter::new(
        app.clone(),
        "generate_departments_from_projects",
    );
    progress.emit_indeterminate("Designing company departments from projects…", Some("llm"));

    let app_for_blocking = app.clone();
    let outcome = tokio::task::spawn_blocking(move || {
        let state_mutex = app_for_blocking.state::<Mutex<AppState>>();
        let mut state = state_mutex.lock_or_recover()?;
        prepare_department_state(&mut state);

        if state.departments.len() >= max_departments() {
            return Err(format!(
                "Company already has the maximum of {} departments.",
                max_departments()
            ));
        }

        let (raw_specs, source) = match try_llm_department_specs(&mut state) {
            Some(specs) => (specs, "llm"),
            None => (heuristic_department_specs(&state), "heuristic"),
        };

        let (normalized, skipped_existing) = normalize_specs(raw_specs, &state);
        if normalized.is_empty() {
            let snapshot = list_departments_snapshot(&state);
            return Ok(GenerateDepartmentsResult {
                snapshot,
                created: Vec::new(),
                skipped_existing,
                source: source.to_string(),
                message: "No new departments to add — org already covers project hints.".into(),
            });
        }

        let created = apply_department_specs(&mut state, &normalized);
        let snapshot = list_departments_snapshot(&state);
        commit(app_for_blocking.clone(), &state)?;
        let message = if created.is_empty() {
            "No new departments created.".into()
        } else {
            format!(
                "Created {} department(s) from project portfolio ({source}): {}.",
                created.len(),
                created.join(", ")
            )
        };
        Ok(GenerateDepartmentsResult {
            snapshot,
            created,
            skipped_existing,
            source: source.to_string(),
            message,
        })
    })
    .await
    .map_err(|e| e.to_string())??;

    progress.finish(&outcome.message);
    progress.clear();
    Ok(outcome)
}

#[tauri::command]
pub fn get_org_chart(state: State<'_, Mutex<AppState>>) -> Result<OrgChartSnapshot, String> {
    let mut state = state.lock_or_recover()?;
    prepare_department_state(&mut state);
    Ok(build_org_chart(&state))
}

#[tauri::command]
pub fn create_department(
    request: CreateDepartmentRequest,
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<DepartmentsSnapshot, String> {
    let mut state = state.lock_or_recover()?;
    prepare_department_state(&mut state);

    let name = request.name.trim();
    let display_name = request.display_name.trim();
    if name.is_empty() || display_name.is_empty() {
        return Err("Department name and display name are required.".to_string());
    }
    if state.departments.len() >= max_departments() {
        return Err(format!("Companies can maintain up to {} departments.", max_departments()));
    }
    if state
        .departments
        .iter()
        .any(|department| department.name.eq_ignore_ascii_case(name))
    {
        return Err(format!("Department '{name}' already exists."));
    }

    let mut department = create_department_record(
        name,
        display_name,
        &request.sop,
        &request.brand_color,
        &request.accent_color,
    );
    department.parent_department_id = request.parent_department_id;
    ensure_department_wallet(&mut state.token_economy, &department.name);
    state.departments.push(department);

    let snapshot = list_departments_snapshot(&state);
    commit(app, &state)?;
    Ok(snapshot)
}

#[tauri::command]
pub fn update_department(
    request: UpdateDepartmentRequest,
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<DepartmentsSnapshot, String> {
    let mut state = state.lock_or_recover()?;
    prepare_department_state(&mut state);

    let index = find_department_index(&state, &request.department_id)
        .ok_or_else(|| "Department not found.".to_string())?;

    if let Some(display_name) = request.display_name {
        let trimmed = display_name.trim();
        if trimmed.is_empty() {
            return Err("Display name cannot be empty.".to_string());
        }
        state.departments[index].display_name = trimmed.to_string();
    }
    if let Some(sop) = request.sop {
        state.departments[index].sop = sop.trim().to_string();
    }
    if let Some(brand_color) = request.brand_color {
        state.departments[index].brand_color =
            crate::departments::normalize_hex_color(&brand_color, "#6d7f9b");
    }
    if let Some(accent_color) = request.accent_color {
        state.departments[index].accent_color =
            crate::departments::normalize_hex_color(&accent_color, "#5ec8ff");
    }
    if let Some(parent_department_id) = request.parent_department_id {
        state.departments[index].parent_department_id = parent_department_id;
    }
    if let Some(head_agent_id) = request.head_agent_id {
        if let Some(ref agent_id) = head_agent_id {
            let agent = state
                .agents
                .get(agent_id)
                .ok_or_else(|| format!("Agent {agent_id} not found."))?;
            if is_system_agent(agent) {
                return Err("System agents cannot lead departments.".to_string());
            }
        }
        state.departments[index].head_agent_id = head_agent_id;
    }

    let snapshot = list_departments_snapshot(&state);
    commit(app, &state)?;
    Ok(snapshot)
}

#[tauri::command]
pub fn rename_department(
    request: RenameDepartmentRequest,
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<DepartmentsSnapshot, String> {
    let mut state = state.lock_or_recover()?;
    prepare_department_state(&mut state);

    let new_name = request.new_name.trim();
    if new_name.is_empty() {
        return Err("New department name is required.".to_string());
    }

    let index = find_department_index(&state, &request.department_id)
        .ok_or_else(|| "Department not found.".to_string())?;
    let old_name = state.departments[index].name.clone();
    if old_name == new_name {
        return Ok(list_departments_snapshot(&state));
    }
    if state
        .departments
        .iter()
        .any(|department| department.name.eq_ignore_ascii_case(new_name))
    {
        return Err(format!("Department '{new_name}' already exists."));
    }

    rename_department_references(&mut state, &old_name, new_name);
    let snapshot = list_departments_snapshot(&state);
    commit(app, &state)?;
    Ok(snapshot)
}

#[tauri::command]
pub fn delete_department(
    request: DeleteDepartmentRequest,
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<DepartmentsSnapshot, String> {
    let mut state = state.lock_or_recover()?;
    prepare_department_state(&mut state);

    if state.departments.len() <= 1 {
        return Err("At least one department must remain.".to_string());
    }

    let transfer_to = request.transfer_to.trim();
    if transfer_to.is_empty() {
        return Err("Transfer target department is required.".to_string());
    }

    let index = find_department_index(&state, &request.department_id)
        .ok_or_else(|| "Department not found.".to_string())?;
    let removed = state.departments[index].clone();
    if removed.name == transfer_to {
        return Err("Transfer target must differ from the department being deleted.".to_string());
    }
    if !department_exists(&state, transfer_to) {
        return Err(format!("Unknown transfer target '{transfer_to}'."));
    }

    transfer_department_members(&mut state, &removed.name, transfer_to);
    clear_department_head_references(&mut state, &removed.id);
    state.departments.retain(|department| department.id != removed.id);
    state.department_ai_providers.remove(&removed.name);
    state.department_agent_runtimes.remove(&removed.name);

    let snapshot = list_departments_snapshot(&state);
    commit(app, &state)?;
    Ok(snapshot)
}

#[tauri::command]
pub fn update_agent_org(
    request: UpdateAgentOrgRequest,
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<AgentRecord, String> {
    let mut state = state.lock_or_recover()?;
    prepare_department_state(&mut state);

    let agent = state
        .agents
        .get(&request.agent_id)
        .cloned()
        .ok_or_else(|| format!("Agent {} not found.", request.agent_id))?;
    if is_system_agent(&agent) {
        return Err("System agents cannot be reassigned.".to_string());
    }

    if let Some(department) = request.department.as_deref() {
        let trimmed = department.trim();
        if trimmed.is_empty() {
            return Err("Department cannot be empty.".to_string());
        }
        if !department_exists(&state, trimmed) {
            return Err(format!("Unknown department '{trimmed}'."));
        }
    }

    if let Some(reports_to) = request.reports_to.as_ref() {
        if let Some(manager_id) = reports_to.as_deref() {
            if !state.agents.contains_key(manager_id) {
                return Err(format!("Manager {manager_id} not found."));
            }
            if would_create_reporting_cycle(&state, &request.agent_id, Some(manager_id)) {
                return Err("Reporting change would create a cycle.".to_string());
            }
        }
    }

    if let Some(department) = request.department.as_deref() {
        let trimmed = department.trim().to_string();
        let agent_mut = state
            .agents
            .get_mut(&request.agent_id)
            .ok_or_else(|| format!("Agent {} not found.", request.agent_id))?;
        agent_mut.department = trimmed;
        agent_mut.status = "idle".to_string();
        let wallet_agent = agent_mut.clone();
        crate::token_budget::ensure_agent_wallet(&mut state.token_economy, &wallet_agent);
    }
    let agent_mut = state
        .agents
        .get_mut(&request.agent_id)
        .ok_or_else(|| format!("Agent {} not found.", request.agent_id))?;
    if let Some(reports_to) = request.reports_to {
        agent_mut.reports_to = reports_to;
    }
    if let Some(manages_department) = request.manages_department {
        agent_mut.manages_department = manages_department;
    }

    let snapshot = agent_mut.clone();
    commit(app, &state)?;
    Ok(snapshot)
}

