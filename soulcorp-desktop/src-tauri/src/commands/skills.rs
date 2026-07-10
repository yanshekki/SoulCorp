use crate::db::persistence::commit;
use crate::skills::adapters::script::{parse_command_line, run_script_file, ScriptRunResult};
use crate::skills::custom::{self, CustomSkillSummary, SkillScope};
use crate::skills::runtimes::{self, InstallResult, RuntimeStatus};
use crate::skills::{
    builtin_catalog, catalog_view_with_packs, dispatch_tool_with_context, enabled_packs,
    format_skill_catalog_prompt, full_catalog, get_pack, get_pack_from, SkillCatalogView,
    SkillDispatchRequest, SkillDispatchResult, SkillPack, SkillPolicy, SkillSummary,
};
use crate::state::{AgentRecord, AppState, SkillPreferences};
use crate::workspace::storage::company_workspace_root;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

fn policy_from_state(state: &AppState) -> SkillPolicy {
    SkillPolicy::from_preferences(&state.skill_preferences)
}

fn app_data(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map_err(|e| e.to_string())
}

fn workspace_for(app: &AppHandle, state: &AppState) -> Option<PathBuf> {
    if state.company_id.is_empty() {
        None
    } else {
        app_data(app)
            .ok()
            .map(|dir| company_workspace_root(&dir, &state.company_id))
    }
}

#[tauri::command]
pub fn list_skill_catalog(
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<SkillCatalogView, String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    let policy = policy_from_state(&state);
    let ad = app_data(&app)?;
    let _ = crate::skills::starter_skills::ensure_starter_skills(&ad);
    let ws = workspace_for(&app, &state);
    let packs = full_catalog(&ad, ws.as_deref());
    Ok(catalog_view_with_packs(&packs, &policy))
}

#[tauri::command]
pub fn get_skill_pack(
    skill_id: String,
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<SkillPack, String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    let ad = app_data(&app)?;
    let ws = workspace_for(&app, &state);
    let packs = full_catalog(&ad, ws.as_deref());
    get_pack_from(&packs, &skill_id)
        .or_else(|| get_pack(&skill_id))
        .ok_or_else(|| format!("Skill pack '{skill_id}' not found."))
}

#[tauri::command]
pub fn list_enabled_skills(
    state: State<'_, Mutex<AppState>>,
) -> Result<Vec<SkillSummary>, String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    let policy = policy_from_state(&state);
    Ok(enabled_packs(&policy)
        .into_iter()
        .map(|p| p.summary(true))
        .collect())
}

#[tauri::command]
pub fn get_skills_prompt_fragment(
    state: State<'_, Mutex<AppState>>,
) -> Result<String, String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    let policy = policy_from_state(&state);
    let enabled: Vec<SkillSummary> = enabled_packs(&policy)
        .into_iter()
        .map(|p| p.summary(true))
        .collect();
    Ok(format_skill_catalog_prompt(&enabled))
}

#[tauri::command]
pub fn dispatch_skill_tool(
    request: SkillDispatchRequest,
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<SkillDispatchResult, String> {
    let mut state = state.lock().map_err(|e| e.to_string())?;
    let policy = policy_from_state(&state);
    let ad = app_data(&app).ok();
    let ws = if state.company_id.is_empty() {
        None
    } else {
        ad.as_ref()
            .map(|dir| company_workspace_root(dir, &state.company_id))
    };
    let packs = if let Some(ref app_data) = ad {
        full_catalog(app_data, ws.as_deref())
    } else {
        builtin_catalog()
    };

    let agent = state
        .agents
        .values()
        .next()
        .cloned()
        .unwrap_or_else(|| AgentRecord {
            id: "system".into(),
            name: "System".into(),
            role: "Skill dispatcher".into(),
            department: "Engineering".into(),
            morale: 1.0,
            energy: 1.0,
            salary: 0.0,
            status: "idle".into(),
            soul: None,
            soul_id: None,
            ai_provider: None,
            agent_runtime_mode: None,
            agent_kind: None,
            skills: vec![],
            reports_to: None,
            manages_department: None,
        });

    Ok(dispatch_tool_with_context(
        &mut state,
        &agent,
        ws.as_deref(),
        &packs,
        &policy,
        &request,
    ))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SetSkillPackEnabledRequest {
    pub pack_id: String,
    pub enabled: bool,
}

#[tauri::command]
pub fn set_skill_pack_enabled(
    request: SetSkillPackEnabledRequest,
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<SkillCatalogView, String> {
    let pack_id = request.pack_id.trim().to_string();
    if pack_id.is_empty() {
        return Err("pack_id is required".into());
    }

    let mut state = state.lock().map_err(|e| e.to_string())?;
    let ad = app_data(&app)?;
    let ws = workspace_for(&app, &state);
    let packs = full_catalog(&ad, ws.as_deref());
    if get_pack_from(&packs, &pack_id).is_none() {
        return Err(format!("Unknown skill pack '{pack_id}'."));
    }

    let prefs = &mut state.skill_preferences;
    prefs.disabled_packs.retain(|id| !id.eq_ignore_ascii_case(&pack_id));
    prefs
        .force_enabled_packs
        .retain(|id| !id.eq_ignore_ascii_case(&pack_id));

    if request.enabled {
        if let Some(pack) = get_pack_from(&packs, &pack_id) {
            match pack.risk {
                crate::skills::RiskTier::High => prefs.allow_high_risk = true,
                crate::skills::RiskTier::Critical => {
                    prefs.allow_critical = true;
                    prefs.allow_high_risk = true;
                }
                _ => {}
            }
            if matches!(
                pack.risk,
                crate::skills::RiskTier::High | crate::skills::RiskTier::Critical
            ) {
                prefs.force_enabled_packs.push(pack_id.clone());
            }
        }
    } else {
        prefs.disabled_packs.push(pack_id);
    }

    let view = catalog_view_with_packs(&packs, &policy_from_state(&state));
    commit(app, &state)?;
    Ok(view)
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SkillPolicyUpdate {
    pub allow_high_risk: Option<bool>,
    pub allow_critical: Option<bool>,
    pub domain_allowlist: Option<Vec<String>>,
    pub firewall_enabled: Option<bool>,
    pub allow_network: Option<bool>,
    pub allow_browser: Option<bool>,
    pub allow_scripts: Option<bool>,
    pub allow_media_generate: Option<bool>,
    pub allow_social_post: Option<bool>,
    pub dry_run_high: Option<bool>,
    pub dry_run_critical: Option<bool>,
    pub domain_mode: Option<String>,
    pub domain_blocklist: Option<Vec<String>>,
    pub allowed_script_runtimes: Option<Vec<String>>,
    pub blocked_tools: Option<Vec<String>>,
    pub blocked_permissions: Option<Vec<String>>,
    pub require_domain_for_fetch: Option<bool>,
}

fn clean_list(list: Vec<String>) -> Vec<String> {
    list.into_iter()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect()
}

#[tauri::command]
pub fn update_skill_policy(
    update: SkillPolicyUpdate,
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<SkillPreferences, String> {
    let mut state = state.lock().map_err(|e| e.to_string())?;
    let prefs = &mut state.skill_preferences;

    if let Some(v) = update.allow_high_risk {
        prefs.allow_high_risk = v;
        if !v {
            prefs.allow_critical = false;
            let allow_critical = prefs.allow_critical;
            prefs.force_enabled_packs.retain(|id| {
                match get_pack(id).map(|p| p.risk) {
                    Some(crate::skills::RiskTier::High) => false,
                    Some(crate::skills::RiskTier::Critical) => allow_critical,
                    Some(_) => true,
                    None => true,
                }
            });
        }
    }
    if let Some(v) = update.allow_critical {
        prefs.allow_critical = v;
        if v {
            prefs.allow_high_risk = true;
        } else {
            prefs.force_enabled_packs.retain(|id| {
                get_pack(id)
                    .map(|p| p.risk != crate::skills::RiskTier::Critical)
                    .unwrap_or(true)
            });
        }
    }
    if let Some(list) = update.domain_allowlist {
        prefs.domain_allowlist = clean_list(list);
    }
    if let Some(v) = update.firewall_enabled {
        prefs.firewall_enabled = v;
    }
    if let Some(v) = update.allow_network {
        prefs.allow_network = v;
    }
    if let Some(v) = update.allow_browser {
        prefs.allow_browser = v;
        if v {
            prefs.allow_high_risk = true;
            prefs.allow_network = true;
        }
    }
    if let Some(v) = update.allow_scripts {
        prefs.allow_scripts = v;
        if v {
            prefs.allow_high_risk = true;
        }
    }
    if let Some(v) = update.allow_media_generate {
        prefs.allow_media_generate = v;
    }
    if let Some(v) = update.allow_social_post {
        prefs.allow_social_post = v;
        if v {
            prefs.allow_high_risk = true;
            prefs.allow_network = true;
        }
    }
    if let Some(v) = update.dry_run_high {
        prefs.dry_run_high = v;
    }
    if let Some(v) = update.dry_run_critical {
        prefs.dry_run_critical = v;
    }
    if let Some(mode) = update.domain_mode {
        let m = mode.trim().to_lowercase();
        if matches!(m.as_str(), "open" | "allowlist" | "blocklist") {
            prefs.domain_mode = m;
        }
    }
    if let Some(list) = update.domain_blocklist {
        prefs.domain_blocklist = clean_list(list);
    }
    if let Some(list) = update.allowed_script_runtimes {
        prefs.allowed_script_runtimes = clean_list(list);
    }
    if let Some(list) = update.blocked_tools {
        prefs.blocked_tools = clean_list(list);
    }
    if let Some(list) = update.blocked_permissions {
        prefs.blocked_permissions = clean_list(list);
    }
    if let Some(v) = update.require_domain_for_fetch {
        prefs.require_domain_for_fetch = v;
    }

    let out = prefs.clone();
    commit(app, &state)?;
    Ok(out)
}

#[tauri::command]
pub fn get_skill_preferences(
    state: State<'_, Mutex<AppState>>,
) -> Result<SkillPreferences, String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    Ok(state.skill_preferences.clone())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FirewallStatus {
    pub prefs: SkillPreferences,
    pub status_label: String,
    pub packs_total: usize,
    pub packs_runnable: usize,
    pub packs_blocked_risk: usize,
    pub recent_blocks: usize,
}

#[tauri::command]
pub fn get_firewall_status(
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<FirewallStatus, String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    let prefs = state.skill_preferences.clone();
    let policy = policy_from_state(&state);
    let ad = app_data(&app)?;
    let _ = crate::skills::starter_skills::ensure_starter_skills(&ad);
    let ws = workspace_for(&app, &state);
    let packs = full_catalog(&ad, ws.as_deref());
    let mut runnable = 0usize;
    let mut blocked_risk = 0usize;
    for p in &packs {
        if policy.pack_runnable(p) {
            runnable += 1;
        } else if matches!(
            p.risk,
            crate::skills::RiskTier::High | crate::skills::RiskTier::Critical
        ) {
            blocked_risk += 1;
        }
    }
    let audit = crate::skills::security::audit_snapshot();
    let recent_blocks = audit.iter().filter(|e| !e.allow).count();
    let status_label = if !prefs.firewall_enabled {
        "Firewall off".into()
    } else if prefs.allow_critical {
        "Critical open".into()
    } else if prefs.allow_high_risk {
        "High open".into()
    } else {
        "Protected".into()
    };
    Ok(FirewallStatus {
        prefs,
        status_label,
        packs_total: packs.len(),
        packs_runnable: runnable,
        packs_blocked_risk: blocked_risk,
        recent_blocks,
    })
}

#[tauri::command]
pub fn get_firewall_audit() -> Result<Vec<crate::skills::security::FirewallEvent>, String> {
    Ok(crate::skills::security::audit_snapshot())
}

#[tauri::command]
pub fn clear_firewall_audit() -> Result<(), String> {
    crate::skills::security::clear_audit();
    Ok(())
}

// ── Runtimes ──────────────────────────────────────────────────────────

#[tauri::command]
pub fn probe_skill_runtimes(app: AppHandle) -> Result<Vec<RuntimeStatus>, String> {
    let ad = app_data(&app)?;
    Ok(runtimes::probe_all(&ad))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstallRuntimeRequest {
    pub runtime_id: String,
}

#[tauri::command]
pub fn install_skill_runtime(
    request: InstallRuntimeRequest,
    app: AppHandle,
) -> Result<InstallResult, String> {
    let ad = app_data(&app)?;
    Ok(runtimes::install_runtime(&ad, &request.runtime_id))
}

// ── Custom skills + Lab ───────────────────────────────────────────────

#[tauri::command]
pub fn list_custom_skills(
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<Vec<CustomSkillSummary>, String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    let ad = app_data(&app)?;
    // Seed 50 starter skills (10× sh/php/js/py/rs) into global skills once.
    let _ = crate::skills::starter_skills::ensure_starter_skills(&ad);
    let ws = workspace_for(&app, &state);
    Ok(custom::list_custom(&ad, ws.as_deref()))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateCustomSkillRequest {
    pub id: String,
    pub name: String,
    pub scope: String,
    pub runtime: String,
}

#[tauri::command]
pub fn create_custom_skill(
    request: CreateCustomSkillRequest,
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<CustomSkillSummary, String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    let scope = SkillScope::parse(&request.scope).ok_or("scope must be company or global")?;
    let ad = app_data(&app)?;
    let ws = workspace_for(&app, &state);
    custom::create_skill(
        &ad,
        ws.as_deref(),
        scope,
        &request.id,
        &request.name,
        &request.runtime,
    )
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CustomSkillRef {
    pub id: String,
    pub scope: String,
}

#[tauri::command]
pub fn get_custom_skill_files(
    request: CustomSkillRef,
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<serde_json::Value, String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    let scope = SkillScope::parse(&request.scope).ok_or("scope must be company or global")?;
    let ad = app_data(&app)?;
    let ws = workspace_for(&app, &state);
    custom::read_skill_files(&ad, ws.as_deref(), scope, &request.id)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SaveCustomSkillRequest {
    pub id: String,
    pub scope: String,
    pub skill_md: Option<String>,
    pub entry: Option<String>,
    pub entry_content: Option<String>,
}

#[tauri::command]
pub fn save_custom_skill_files(
    request: SaveCustomSkillRequest,
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<(), String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    let scope = SkillScope::parse(&request.scope).ok_or("scope must be company or global")?;
    let ad = app_data(&app)?;
    let ws = workspace_for(&app, &state);
    custom::save_skill_files(
        &ad,
        ws.as_deref(),
        scope,
        &request.id,
        request.skill_md.as_deref(),
        request.entry.as_deref(),
        request.entry_content.as_deref(),
    )
}

#[tauri::command]
pub fn delete_custom_skill(
    request: CustomSkillRef,
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<(), String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    let scope = SkillScope::parse(&request.scope).ok_or("scope must be company or global")?;
    let ad = app_data(&app)?;
    let ws = workspace_for(&app, &state);
    custom::delete_skill(&ad, ws.as_deref(), scope, &request.id)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestSkillScriptRequest {
    /// Lab line: `test.php a b c`
    pub command: String,
    /// Optional skill pack id (company/global). Empty = workspace skills/scripts
    pub skill_id: Option<String>,
    pub scope: Option<String>,
    pub timeout_secs: Option<u64>,
}

#[tauri::command]
pub fn test_skill_script(
    request: TestSkillScriptRequest,
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<ScriptRunResult, String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    let ad = app_data(&app)?;
    let ws = workspace_for(&app, &state)
        .ok_or_else(|| "Create/open a company first (workspace required for Lab).".to_string())?;

    let (entry, argv) = parse_command_line(&request.command)?;

    // Skills Firewall: Lab respects the same policy as agents.
    let policy = policy_from_state(&state);
    let packs = full_catalog(&ad, Some(&ws));
    let pack = request
        .skill_id
        .as_deref()
        .and_then(|id| get_pack_from(&packs, id))
        .or_else(|| get_pack_from(&packs, "script-runner"));
    if let Some(ref pack) = pack {
        let args = serde_json::json!({
            "entry": entry,
            "args": argv,
            "command": request.command,
            "skill_id": request.skill_id,
        });
        let decision = policy.evaluate(pack, "run_script", &args);
        crate::skills::security::push_audit(crate::skills::security::FirewallEvent {
            at: chrono::Utc::now().to_rfc3339(),
            tool: "run_script".into(),
            pack_id: decision.pack_id.clone(),
            allow: decision.allow,
            dry_run: decision.dry_run,
            layer: decision.layer.clone(),
            reason: format!("[Lab] {}", decision.reason),
        });
        if !decision.allow {
            return Ok(ScriptRunResult {
                ok: false,
                runtime: String::new(),
                runtime_path: None,
                entry: entry.clone(),
                argv: argv.clone(),
                cwd: ws.display().to_string(),
                exit_code: None,
                stdout: String::new(),
                stderr: String::new(),
                duration_ms: 0,
                parsed_json: Some(serde_json::json!({ "firewall": decision })),
                error: Some(format!(
                    "Skills Firewall blocked Lab run: {} [{}]",
                    decision.reason,
                    decision.layer.as_deref().unwrap_or("policy")
                )),
            });
        }
    }

    let root = if let Some(skill_id) = request.skill_id.as_deref().map(str::trim).filter(|s| !s.is_empty())
    {
        let scope = request
            .scope
            .as_deref()
            .and_then(SkillScope::parse)
            .unwrap_or(SkillScope::Company);
        let dir = custom::pack_dir(&ad, Some(&ws), scope, skill_id);
        if !dir.is_dir() {
            let alt = if scope == SkillScope::Company {
                custom::pack_dir(&ad, Some(&ws), SkillScope::Global, skill_id)
            } else {
                custom::pack_dir(&ad, Some(&ws), SkillScope::Company, skill_id)
            };
            if alt.is_dir() {
                alt
            } else {
                return Err(format!("Skill pack '{skill_id}' not found."));
            }
        } else {
            dir
        }
    } else {
        let scripts = custom::scripts_dir(&ws);
        std::fs::create_dir_all(&scripts).map_err(|e| e.to_string())?;
        scripts
    };

    let entry_path = root.join(&entry);
    if !entry_path.exists() {
        if let Some(found) = find_entry_in_skills(&ad, &ws, &entry) {
            return Ok(run_script_file(
                &ad,
                &found,
                &entry,
                &argv,
                request.timeout_secs.unwrap_or(15),
            ));
        }
    }

    Ok(run_script_file(
        &ad,
        &root,
        &entry,
        &argv,
        request.timeout_secs.unwrap_or(15),
    ))
}

fn find_entry_in_skills(app_data: &std::path::Path, workspace: &std::path::Path, entry: &str) -> Option<PathBuf> {
    for dir in [
        custom::company_skills_root(workspace),
        custom::global_skills_root(app_data),
    ] {
        if !dir.is_dir() {
            continue;
        }
        if let Ok(rd) = std::fs::read_dir(&dir) {
            for e in rd.flatten() {
                let p = e.path();
                if p.is_dir() && p.join(entry).is_file() {
                    return Some(p);
                }
            }
        }
    }
    None
}
