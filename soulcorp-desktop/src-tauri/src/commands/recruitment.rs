use crate::commands::onboarding::persist_single_agent_soul;
use crate::commands::tier::ensure_agent_capacity;
use crate::db::persistence::{commit, commit_if_company_ready};
use crate::token_budget::{ensure_agent_wallet, ChargeContext};
use crate::ai::provider::TokenUsageSource;
use crate::hub::HubClient;
use crate::relationships::{
    build_relationship_graph, connect_new_agent, ensure_relationship_backfill, RelationshipGraph,
};
use crate::soul::{
    import_hub_soul, import_hub_soul_result, soul_profile_from_editor_content, HubSoulImportResult,
    SoulProfile,
};
use crate::state::{AgentRecord, AppState, MeetingState};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::Mutex;
use tauri::{AppHandle, State};
use uuid::Uuid;

use crate::lock_util::MutexExt;
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecruitmentListResult {
    pub candidates: Vec<RecruitmentCandidate>,
    pub from_cache: bool,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecruitmentCandidate {
    pub id: String,
    pub soul_id: Option<u64>,
    pub name: String,
    pub headline: String,
    /// Job title from soulmd-hub listing (stored on AgentRecord.role when hired).
    pub job_role: String,
    pub skills: Vec<String>,
    pub vibe: String,
    pub verified: bool,
    pub hourly_rate_usdt: f64,
    pub soul_md_content: Option<String>,
    #[serde(default)]
    pub file_type: Option<String>,
    #[serde(default)]
    pub compatibility_score: Option<f32>,
    #[serde(default)]
    pub skill_overlap: Option<Vec<String>>,
    #[serde(default)]
    pub department_fit: Option<String>,
    #[serde(default)]
    pub projected_morale_delta: Option<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CandidateCompatibility {
    pub candidate_id: String,
    pub name: String,
    pub compatibility_score: f32,
    pub department_fit: String,
    pub skill_overlap: Vec<String>,
    pub projected_morale_delta: f32,
    pub risk_band: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecruitmentAnalytics {
    pub team_size: u32,
    pub average_morale: f32,
    pub average_energy: f32,
    pub skill_gaps: Vec<String>,
    pub agents_hired: u32,
    pub interviews_started: u32,
    pub priority_matching: bool,
    pub candidate_scores: Vec<CandidateCompatibility>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MoraleHeatmapEntry {
    pub agent_id: String,
    pub name: String,
    pub department: String,
    pub morale: f32,
    pub energy: f32,
    pub risk_band: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HireCandidateRequest {
    pub candidate_id: String,
    pub role: String,
    pub department: String,
    pub offered_salary: f32,
    pub soul_md_content: Option<String>,
    #[serde(default)]
    pub system_prompt_source: Option<String>,
    /// Preferred agent display name (custom hire / seed). Falls back to soul.md title.
    #[serde(default)]
    pub display_name: Option<String>,
}

fn listings_to_candidates(listings: &[Value]) -> Vec<RecruitmentCandidate> {
    listings
        .iter()
        .filter_map(listing_to_candidate)
        .collect()
}

fn listing_to_candidate(item: &Value) -> Option<RecruitmentCandidate> {
    let id = item.get("id")?.as_u64()?;
    let title = item.get("title")?.as_str()?.trim();
    if title.is_empty() {
        return None;
    }

    let description = item
        .get("description")
        .and_then(|value| value.as_str())
        .unwrap_or("SOUL.md persona from soulmd-hub");
    let role = item
        .get("role")
        .and_then(|value| value.as_str())
        .unwrap_or("Generalist");
    let tags = item
        .get("tags")
        .and_then(|value| value.as_str())
        .unwrap_or("");
    let skills: Vec<String> = tags
        .split(',')
        .map(|tag| tag.trim().to_lowercase())
        .filter(|tag| !tag.is_empty())
        .take(6)
        .collect();

    let price = item
        .get("price")
        .and_then(|value| value.as_f64().or_else(|| value.as_str()?.parse().ok()))
        .unwrap_or(35.0);
    let verified = item
        .get("is_nft")
        .and_then(|value| value.as_bool().or_else(|| value.as_i64().map(|n| n == 1)))
        .unwrap_or(false);
    let file_type = item
        .get("file_type")
        .and_then(|value| value.as_str())
        .map(|value| value.to_string());

    Some(RecruitmentCandidate {
        id: format!("hub-soul-{id}"),
        soul_id: Some(id),
        name: title.to_string(),
        headline: description.to_string(),
        job_role: role.to_string(),
        skills: if skills.is_empty() {
            vec![role.to_lowercase()]
        } else {
            skills
        },
        vibe: role.to_lowercase(),
        verified,
        hourly_rate_usdt: price.max(10.0),
        soul_md_content: None,
        file_type,
        compatibility_score: None,
        skill_overlap: None,
        department_fit: None,
        projected_morale_delta: None,
    })
}

fn bonus_recruits_from_state(state: &AppState) -> Vec<RecruitmentCandidate> {
    state
        .god_mode_bonus_recruits
        .iter()
        .map(|recruit| RecruitmentCandidate {
            id: recruit.id.clone(),
            soul_id: None,
            name: recruit.name.clone(),
            headline: recruit.headline.clone(),
            job_role: recruit.vibe.clone(),
            skills: recruit.skills.clone(),
            vibe: recruit.vibe.clone(),
            verified: true,
            hourly_rate_usdt: recruit.hourly_rate_usdt,
            soul_md_content: None,
            file_type: None,
            compatibility_score: None,
            skill_overlap: None,
            department_fit: None,
            projected_morale_delta: None,
        })
        .collect()
}

/// Offline / pure-local starter pool (not God Mode). Mirrors frontend preset souls.
fn local_seed_candidates() -> Vec<RecruitmentCandidate> {
    vec![
        RecruitmentCandidate {
            id: "local-seed-mira".into(),
            soul_id: None,
            name: "Mira".into(),
            headline: "Ships quality code and protects team focus.".into(),
            job_role: "Senior Dev".into(),
            skills: vec![
                "engineering".into(),
                "typescript".into(),
                "code-review".into(),
            ],
            vibe: "focused".into(),
            verified: true,
            hourly_rate_usdt: 45.0,
            soul_md_content: Some(
                "# Mira\n\n## Personality\nFocused, analytical, dry humor, prefers clean abstractions.\n\n## Values\nShip quality code, protect team focus, document decisions.\n\n## Communication Style\nDirect and concise with occasional sarcasm.\n"
                    .into(),
            ),
            file_type: Some("single_md".into()),
            compatibility_score: None,
            skill_overlap: None,
            department_fit: Some("Engineering".into()),
            projected_morale_delta: None,
        },
        RecruitmentCandidate {
            id: "local-seed-kai".into(),
            soul_id: None,
            name: "Kai".into(),
            headline: "Builds healthy teams with honest feedback.".into(),
            job_role: "HR Lead".into(),
            skills: vec![
                "hr".into(),
                "culture".into(),
                "recruiting".into(),
                "facilitation".into(),
            ],
            vibe: "warm".into(),
            verified: true,
            hourly_rate_usdt: 38.0,
            soul_md_content: Some(
                "# Kai\n\n## Personality\nWarm, observant, emotionally intelligent facilitator.\n\n## Values\nHealthy teams, honest feedback, sustainable pace.\n\n## Communication Style\nSupportive and structured, asks clarifying questions.\n"
                    .into(),
            ),
            file_type: Some("single_md".into()),
            compatibility_score: None,
            skill_overlap: None,
            department_fit: Some("Human Resources".into()),
            projected_morale_delta: None,
        },
        RecruitmentCandidate {
            id: "local-seed-ren".into(),
            soul_id: None,
            name: "Ren".into(),
            headline: "Keeps priorities clear and execution accountable.".into(),
            job_role: "COO".into(),
            skills: vec![
                "operations".into(),
                "planning".into(),
                "leadership".into(),
            ],
            vibe: "strategic".into(),
            verified: true,
            hourly_rate_usdt: 55.0,
            soul_md_content: Some(
                "# Ren\n\n## Personality\nStrategic, calm under pressure, systems thinker.\n\n## Values\nLong-term company health, clear priorities, accountable execution.\n\n## Communication Style\nExecutive summaries first, then supporting detail.\n"
                    .into(),
            ),
            file_type: Some("single_md".into()),
            compatibility_score: None,
            skill_overlap: None,
            department_fit: Some("Executive".into()),
            projected_morale_delta: None,
        },
    ]
}

fn merge_candidate_lists(
    mut base: Vec<RecruitmentCandidate>,
    extras: Vec<RecruitmentCandidate>,
) -> Vec<RecruitmentCandidate> {
    if extras.is_empty() {
        return base;
    }
    let existing_ids: std::collections::HashSet<String> =
        base.iter().map(|candidate| candidate.id.clone()).collect();
    for candidate in extras.into_iter().rev() {
        if !existing_ids.contains(&candidate.id) {
            base.insert(0, candidate);
        }
    }
    base
}

fn merge_bonus_candidates(base: Vec<RecruitmentCandidate>, state: &AppState) -> Vec<RecruitmentCandidate> {
    merge_candidate_lists(base, bonus_recruits_from_state(state))
}

/// When hub/local pool is empty, surface starter candidates + god-mode bonuses.
fn fill_empty_candidate_pool(
    base: Vec<RecruitmentCandidate>,
    state: &AppState,
) -> Vec<RecruitmentCandidate> {
    let with_bonus = merge_bonus_candidates(base, state);
    if with_bonus.is_empty() {
        merge_bonus_candidates(local_seed_candidates(), state)
    } else {
        with_bonus
    }
}

fn resolve_hire_display_name(
    request: &HireCandidateRequest,
    soul: &Option<SoulProfile>,
) -> String {
    if let Some(name) = request
        .display_name
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        return name.to_string();
    }
    if let Some(profile) = soul {
        let name = profile.name.trim();
        if !name.is_empty() {
            return name.to_string();
        }
    }
    if let Some(seed_id) = request.candidate_id.strip_prefix("local-seed-") {
        return match seed_id {
            "mira" => "Mira".into(),
            "kai" => "Kai".into(),
            "ren" => "Ren".into(),
            other => {
                let mut chars = other.chars();
                match chars.next() {
                    Some(first) => format!(
                        "{}{}",
                        first.to_uppercase(),
                        chars.as_str()
                    ),
                    None => "Local Hire".into(),
                }
            }
        };
    }
    if request.candidate_id.starts_with("custom-") {
        return "New Hire".into();
    }
    if let Some(hub_id) = request.candidate_id.strip_prefix("hub-soul-") {
        return format!("Candidate {hub_id}");
    }
    request.candidate_id.clone()
}

fn team_skill_tokens(state: &AppState) -> Vec<String> {
    let mut tokens = Vec::new();
    for agent in state.agents.values() {
        tokens.push(agent.role.to_lowercase());
        tokens.push(agent.department.to_lowercase());
        if let Some(soul) = &agent.soul {
            tokens.push(soul.name.to_lowercase());
            for word in soul.raw_content.split_whitespace() {
                let cleaned = word
                    .trim_matches(|ch: char| !ch.is_alphanumeric())
                    .to_lowercase();
                if cleaned.len() >= 4 {
                    tokens.push(cleaned);
                }
            }
        }
    }
    tokens
}

fn department_morale(state: &AppState, department: &str) -> f32 {
    let agents: Vec<f32> = state
        .agents
        .values()
        .filter(|agent| agent.department == department)
        .map(|agent| agent.morale)
        .collect();
    if agents.is_empty() {
        return 0.7;
    }
    agents.iter().sum::<f32>() / agents.len() as f32
}

fn recommended_department(state: &AppState, candidate: &RecruitmentCandidate) -> String {
    let departments: [(&str, f32); 4] = [
        ("Engineering", department_morale(state, "Engineering")),
        ("Human Resources", department_morale(state, "Human Resources")),
        ("Executive", department_morale(state, "Executive")),
        ("Marketing", department_morale(state, "Marketing")),
    ];

    let skill_hint = candidate
        .skills
        .first()
        .map(|skill| skill.to_lowercase())
        .unwrap_or_default();

    if skill_hint.contains("react")
        || skill_hint.contains("rust")
        || skill_hint.contains("figma")
        || skill_hint.contains("tailwind")
    {
        return "Engineering".to_string();
    }
    if skill_hint.contains("copy")
        || skill_hint.contains("seo")
        || skill_hint.contains("analytics")
    {
        return "Marketing".to_string();
    }
    if skill_hint.contains("hr") || candidate.vibe.contains("hr") {
        return "Human Resources".to_string();
    }

    departments
        .iter()
        .min_by(|left, right| left.1.partial_cmp(&right.1).unwrap_or(std::cmp::Ordering::Equal))
        .map(|(name, _)| name.to_string())
        .unwrap_or_else(|| "Engineering".to_string())
}

fn compute_skill_gaps(state: &AppState, candidates: &[RecruitmentCandidate]) -> Vec<String> {
    let covered: std::collections::HashSet<String> = team_skill_tokens(state).into_iter().collect();
    let mut gaps = Vec::new();
    for candidate in candidates {
        for skill in &candidate.skills {
            if !covered.contains(skill) && !gaps.contains(skill) {
                gaps.push(skill.clone());
            }
        }
    }
    gaps.truncate(6);
    gaps
}

fn compute_candidate_compatibility(
    state: &AppState,
    candidate: &RecruitmentCandidate,
) -> (f32, Vec<String>, String, f32) {
    let department_fit = recommended_department(state, candidate);
    let team_tokens = team_skill_tokens(state);
    let overlap: Vec<String> = candidate
        .skills
        .iter()
        .filter(|skill| {
            team_tokens.iter().any(|token| {
                token.contains(skill.as_str()) || skill.contains(token.as_str())
            })
        })
        .take(4)
        .cloned()
        .collect();

    let gap_fill = candidate
        .skills
        .iter()
        .filter(|skill| !team_tokens.iter().any(|token| token.contains(skill.as_str())))
        .count() as f32
        * 0.08;

    let overlap_score = if candidate.skills.is_empty() {
        0.35
    } else {
        (overlap.len() as f32 / candidate.skills.len() as f32) * 0.35
    };

    let dept_morale = department_morale(state, &department_fit);
    let morale_room = (0.85 - dept_morale).max(0.0) * 0.25;
    let vibe_bonus = if candidate.vibe == "steady" || candidate.vibe == "creative" {
        0.08
    } else {
        0.04
    };
    let verified_bonus = if candidate.verified { 0.06 } else { 0.0 };
    let relationship_bonus = if state.agent_relationships.iter().any(|edge| edge.score < 0.3) {
        0.05
    } else {
        0.0
    };

    let mut score = (0.32 + overlap_score + gap_fill + morale_room + vibe_bonus + verified_bonus
        + relationship_bonus)
        .clamp(0.35, 0.98);
    score = (score + 0.04).min(0.99);

    let projected_morale_delta = ((gap_fill + vibe_bonus) * 0.35 - 0.02).clamp(-0.05, 0.12);
    (score, overlap, department_fit, projected_morale_delta)
}

fn enrich_candidate(state: &AppState, mut candidate: RecruitmentCandidate) -> RecruitmentCandidate {
    let (score, overlap, department_fit, morale_delta) =
        compute_candidate_compatibility(state, &candidate);
    candidate.compatibility_score = Some(score);
    candidate.skill_overlap = Some(overlap);
    candidate.department_fit = Some(department_fit);
    candidate.projected_morale_delta = Some(morale_delta);
    candidate
}

fn enrich_candidates(state: &AppState, candidates: Vec<RecruitmentCandidate>) -> Vec<RecruitmentCandidate> {
    candidates
        .into_iter()
        .map(|candidate| enrich_candidate(state, candidate))
        .collect()
}

#[tauri::command]
pub fn get_agent_relationship_graph(
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<RelationshipGraph, String> {
    let mut state = state.lock_or_recover()?;
    let before = state.agent_relationships.len();
    ensure_relationship_backfill(&mut state);
    if state.agent_relationships.len() != before {
        commit(app, &state)?;
    }
    Ok(build_relationship_graph(&state))
}

#[tauri::command]
pub async fn get_recruitment_analytics(
    query: Option<String>,
    app_state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<RecruitmentAnalytics, String> {
    let candidate_result = load_recruitment_candidates(&app_state, &app, query).await?;
    let candidates = candidate_result.candidates;
    let state = app_state.lock_or_recover()?;

    let morale_values: Vec<f32> = state.agents.values().map(|agent| agent.morale).collect();
    let energy_values: Vec<f32> = state.agents.values().map(|agent| agent.energy).collect();
    let average_morale = if morale_values.is_empty() {
        0.0
    } else {
        morale_values.iter().sum::<f32>() / morale_values.len() as f32
    };
    let average_energy = if energy_values.is_empty() {
        0.0
    } else {
        energy_values.iter().sum::<f32>() / energy_values.len() as f32
    };

    let candidate_scores = candidates
        .iter()
        .map(|candidate| {
            let score = candidate.compatibility_score.unwrap_or(0.5);
            CandidateCompatibility {
                candidate_id: candidate.id.clone(),
                name: candidate.name.clone(),
                compatibility_score: score,
                department_fit: candidate
                    .department_fit
                    .clone()
                    .unwrap_or_else(|| "Engineering".to_string()),
                skill_overlap: candidate.skill_overlap.clone().unwrap_or_default(),
                projected_morale_delta: candidate.projected_morale_delta.unwrap_or(0.0),
                risk_band: if score >= 0.75 {
                    "strong_fit"
                } else if score >= 0.55 {
                    "balanced"
                } else {
                    "stretch"
                }
                .to_string(),
            }
        })
        .collect();

    Ok(RecruitmentAnalytics {
        team_size: state.agents.len() as u32,
        average_morale,
        average_energy,
        skill_gaps: compute_skill_gaps(&state, &candidates),
        agents_hired: state.stats.agents_hired,
        interviews_started: state.stats.interviews_started,
        // Legacy field: product no longer gates recruitment on Pro/VIP.
        priority_matching: false,
        candidate_scores,
    })
}

#[tauri::command]
pub fn record_recruitment_interview(
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<u32, String> {
    let mut state = state.lock_or_recover()?;
    state.stats.interviews_started += 1;
    let count = state.stats.interviews_started;
    commit(app, &state)?;
    Ok(count)
}

#[tauri::command]
pub fn get_morale_heatmap(state: State<'_, Mutex<AppState>>) -> Result<Vec<MoraleHeatmapEntry>, String> {
    let state = state.lock_or_recover()?;
    let mut entries: Vec<MoraleHeatmapEntry> = state
        .agents
        .values()
        .filter(|agent| !crate::fate::is_system_agent(agent))
        .map(|agent| MoraleHeatmapEntry {
            agent_id: agent.id.clone(),
            name: agent.name.clone(),
            department: agent.department.clone(),
            morale: agent.morale,
            energy: agent.energy,
            risk_band: morale_risk_band(agent.morale, agent.energy).to_string(),
        })
        .collect();
    entries.sort_by(|left, right| {
        left.morale
            .partial_cmp(&right.morale)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    Ok(entries)
}

fn morale_risk_band(morale: f32, energy: f32) -> &'static str {
    if morale < 0.45 || energy < 0.4 {
        "critical"
    } else if morale < 0.65 || energy < 0.6 {
        "watch"
    } else {
        "healthy"
    }
}

fn spawn_onboarding_meeting(state: &mut AppState, new_agent_id: &str) {
    let hr_id = state
        .agents
        .iter()
        .find(|(_, agent)| {
            agent.department.to_lowercase().contains("human")
                || agent.role.to_lowercase().contains("hr")
        })
        .map(|(id, _)| id.clone())
        .or_else(|| state.agents.keys().next().cloned())
        .unwrap_or_else(|| new_agent_id.to_string());

    let meeting_id = Uuid::new_v4().to_string();
    state.meetings.insert(
        meeting_id.clone(),
        MeetingState {
            id: meeting_id,
            meeting_type: "Onboarding".to_string(),
            participant_ids: vec![hr_id.clone(), new_agent_id.to_string()],
            messages: Vec::new(),
            turn: 0,
            completed: false,
            morale_delta: 0.06,
            outcome_summary: None,
            project_progress_delta: 0.02,
            revenue_delta: 0.0,
            notes_generated: false,
            notes_page_id: None,
            key_points: Vec::new(),
            decisions: Vec::new(),
            action_items: Vec::new(),
            risks_blockers: Vec::new(),
            notes_write_error: None,
            started_at: None,
            completed_at: None,
            story_id: None,
            task_ids: Vec::new(),
            directive_id: None,
        },
    );

}

async fn load_recruitment_candidates(
    app_state: &Mutex<AppState>,
    app: &AppHandle,
    query: Option<String>,
) -> Result<RecruitmentListResult, String> {
    let (pure_local, cached_listings) = {
        let state = app_state.lock_or_recover()?;
        (
            state.settings.pure_local_mode,
            state.hub.cached_hub_soul_listings.clone(),
        )
    };

    if pure_local {
        let state = app_state.lock_or_recover()?;
        return Ok(RecruitmentListResult {
            candidates: enrich_candidates(
                &state,
                fill_empty_candidate_pool(Vec::new(), &state),
            ),
            from_cache: true,
            message: Some(
                "Pure Local Mode — showing local starter candidates. Custom hire is also available."
                    .to_string(),
            ),
        });
    }

    let client = {
        let state = app_state.lock_or_recover()?;
        HubClient::new(state.hub.base_url.clone(), state.hub.api_key.clone())
    };

    match client.list_souls(query.as_deref(), 50).await {
        Ok(listings) if !listings.is_empty() => {
            {
                let mut state = app_state.lock_or_recover()?;
                state.hub.cached_hub_soul_listings = listings.clone();
                commit_if_company_ready(app.clone(), &state)?;
            }
            let candidates = listings_to_candidates(&listings);
            let state = app_state.lock_or_recover()?;
            Ok(RecruitmentListResult {
                candidates: enrich_candidates(
                    &state,
                    merge_bonus_candidates(candidates, &state),
                ),
                from_cache: false,
                message: None,
            })
        }
        Ok(_) => {
            let candidates = listings_to_candidates(&cached_listings);
            let state = app_state.lock_or_recover()?;
            let used_cache = !cached_listings.is_empty();
            let filled = fill_empty_candidate_pool(candidates, &state);
            let used_seeds = !used_cache && filled.iter().any(|c| c.id.starts_with("local-seed-"));
            Ok(RecruitmentListResult {
                candidates: enrich_candidates(&state, filled),
                from_cache: used_cache || used_seeds,
                message: if used_cache {
                    Some("Hub returned no new candidates — showing cached listings.".to_string())
                } else if used_seeds {
                    Some(
                        "Hub returned no candidates — showing local starter candidates. Custom hire is also available."
                            .to_string(),
                    )
                } else {
                    Some("Hub returned no candidates. Sync with the hub when online.".to_string())
                },
            })
        }
        Err(error) => {
            if cached_listings.is_empty() {
                let state = app_state.lock_or_recover()?;
                return Ok(RecruitmentListResult {
                    candidates: enrich_candidates(
                        &state,
                        fill_empty_candidate_pool(Vec::new(), &state),
                    ),
                    from_cache: true,
                    message: Some(format!(
                        "Hub offline — showing local starter candidates. Last error: {error}"
                    )),
                });
            }
            let candidates = listings_to_candidates(&cached_listings);
            let state = app_state.lock_or_recover()?;
            Ok(RecruitmentListResult {
                candidates: enrich_candidates(
                    &state,
                    merge_bonus_candidates(candidates, &state),
                ),
                from_cache: true,
                message: Some(format!(
                    "Hub offline — showing cached candidates. Last error: {error}"
                )),
            })
        }
    }
}

#[tauri::command]
pub async fn list_recruitment_candidates(
    query: Option<String>,
    app_state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<RecruitmentListResult, String> {
    load_recruitment_candidates(&app_state, &app, query).await
}

#[tauri::command]
pub async fn fetch_recruitment_candidate_soul(
    candidate_id: String,
    app_state: State<'_, Mutex<AppState>>,
) -> Result<HubSoulImportResult, String> {
    let soul_id = candidate_id
        .strip_prefix("hub-soul-")
        .and_then(|id| id.parse::<u64>().ok())
        .ok_or_else(|| "Only hub candidates include downloadable soul.md content.".to_string())?;

    let client = {
        let state = app_state.lock_or_recover()?;
        HubClient::new(state.hub.base_url.clone(), state.hub.api_key.clone())
    };

    client
        .fetch_soul_detail(soul_id)
        .await
        .map(import_hub_soul_result)
        .map_err(|error| format!("Failed to fetch SOUL.md for candidate: {error}"))
}

fn soul_profile_from_hire_request(
    soul_content: &str,
    system_prompt_source: Option<String>,
) -> Option<SoulProfile> {
    if soul_content.trim().is_empty() {
        return None;
    }

    let mut profile = soul_profile_from_editor_content(soul_content).ok()?;
    if let Some(source) = system_prompt_source
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        profile.system_prompt_source = Some(source.to_string());
    }
    Some(profile)
}

/// Cap monthly salary (token units) so hub price mis-labels cannot demand tens of millions.
fn normalize_offered_salary(raw: f32) -> f32 {
    // Hub sometimes stores list prices as huge "hourly" numbers; clamp to a sane monthly band.
    if !raw.is_finite() || raw <= 0.0 {
        return 4_000.0;
    }
    raw.clamp(500.0, 50_000.0)
}

#[tauri::command]
pub async fn hire_candidate(
    request: HireCandidateRequest,
    app_state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<AgentRecord, String> {
    let offered_salary = normalize_offered_salary(request.offered_salary);
    let onboarding_tokens = ((offered_salary as f64) * 0.5).round() as u32;
    let client = {
        let state = app_state.lock_or_recover()?;
        let total = crate::token_budget::total_company_tokens(&state.token_economy);
        if onboarding_tokens > 0 && total < onboarding_tokens as u64 {
            return Err(format!(
                "公司代幣不足：入職約需 {onboarding_tokens} tokens（目前約 {total}）。請到「代幣」頁注資，或降低開出的月薪。"
            ));
        }
        HubClient::new(state.hub.base_url.clone(), state.hub.api_key.clone())
    };

    let soul = if let Some(content) = request.soul_md_content.clone() {
        soul_profile_from_hire_request(&content, request.system_prompt_source.clone())
    } else if let Some(soul_id) = request
        .candidate_id
        .strip_prefix("hub-soul-")
        .and_then(|id| id.parse::<u64>().ok())
    {
        let record = client
            .fetch_soul_detail(soul_id)
            .await
            .map_err(|error| format!("Failed to fetch SOUL.md for candidate: {error}"))?;
        Some(import_hub_soul(record))
    } else {
        None
    };

    let hired_agent = {
    let mut state = app_state.lock_or_recover()?;
    ensure_agent_capacity(&state)?;
    let agent_id = format!("agent-{}", Uuid::new_v4());
    let name = resolve_hire_display_name(&request, &soul);

    let department = request.department.clone();
    let soul_id = request
        .candidate_id
        .strip_prefix("hub-soul-")
        .and_then(|id| id.parse::<u64>().ok());
    let role = request.role.clone();
    let record = AgentRecord {
        id: agent_id.clone(),
        name,
        role: role.clone(),
        department: department.clone(),
        morale: 0.78,
        energy: 0.95,
        salary: offered_salary,
        status: "idle".to_string(),
        soul,
        soul_id,
        ai_provider: None,
            agent_runtime_mode: None,
        agent_kind: None,
        skills: crate::state::skills_for_role(&role),
        reports_to: None,
        manages_department: None,
    };

    state.agents.insert(agent_id.clone(), record.clone());
    ensure_agent_wallet(&mut state.token_economy, &record);
    // Company pays onboarding — never charge the empty new-hire leaf wallet.
    if onboarding_tokens > 0 {
        crate::token_budget::charge_company_pool(
            &mut state,
            onboarding_tokens,
            ChargeContext {
                source: "hire_onboarding".into(),
                agent_id: agent_id.clone(),
                department: department.clone(),
                provider: "simulation".into(),
                prompt_tokens: 0,
                completion_tokens: 0,
                total_tokens: onboarding_tokens,
                usage_source: TokenUsageSource::Estimated,
            },
        )?;
    }
    // Seed working budget so the hire can run tasks immediately.
    crate::token_budget::fund_agent_for_execution(&mut state, &agent_id, 25_000);
    connect_new_agent(&mut state, &agent_id, &department);
    state.stats.agents_hired += 1;
    spawn_onboarding_meeting(&mut state, &agent_id);

    let hired = state
        .agents
        .get(&agent_id)
        .cloned()
        .unwrap_or(record);
    persist_single_agent_soul(&app, &state, &hired)?;
    commit(app.clone(), &state)?;
    hired
    };
    let _ = crate::commands::workspace::sync_workspace_organization_cmd(app, app_state).await;
    Ok(hired_agent)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn local_seed_candidates_cover_core_roles() {
        let seeds = local_seed_candidates();
        assert_eq!(seeds.len(), 3);
        assert!(seeds.iter().all(|c| c.id.starts_with("local-seed-")));
        assert!(seeds.iter().all(|c| {
            c.soul_md_content
                .as_ref()
                .map(|s| s.contains("## Personality"))
                .unwrap_or(false)
        }));
        assert!(seeds.iter().any(|c| c.department_fit.as_deref() == Some("Engineering")));
        assert!(seeds.iter().any(|c| c.department_fit.as_deref() == Some("Human Resources")));
        assert!(seeds.iter().any(|c| c.department_fit.as_deref() == Some("Executive")));
    }

    #[test]
    fn resolve_hire_name_prefers_display_name() {
        let request = HireCandidateRequest {
            candidate_id: "custom-abc".into(),
            role: "Engineer".into(),
            department: "Engineering".into(),
            offered_salary: 4000.0,
            soul_md_content: None,
            system_prompt_source: None,
            display_name: Some("  Ada  ".into()),
        };
        assert_eq!(resolve_hire_display_name(&request, &None), "Ada");
    }

    #[test]
    fn resolve_hire_name_local_seed_fallback() {
        let request = HireCandidateRequest {
            candidate_id: "local-seed-kai".into(),
            role: "HR Lead".into(),
            department: "Human Resources".into(),
            offered_salary: 4000.0,
            soul_md_content: None,
            system_prompt_source: None,
            display_name: None,
        };
        assert_eq!(resolve_hire_display_name(&request, &None), "Kai");
    }
}