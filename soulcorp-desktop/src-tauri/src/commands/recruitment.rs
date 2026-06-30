use crate::commands::tier::ensure_agent_capacity;
use crate::db::persistence::commit;
use crate::finance::total_monthly_salary;
use crate::hub::{mock_gigs, HubClient};
use crate::soul::parse_soul_content;
use crate::state::{AgentRecord, AppState, MeetingState};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::Mutex;
use tauri::{AppHandle, State};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecruitmentCandidate {
    pub id: String,
    pub soul_id: Option<u64>,
    pub name: String,
    pub headline: String,
    pub skills: Vec<String>,
    pub vibe: String,
    pub verified: bool,
    pub hourly_rate_usdt: f64,
    pub soul_md_content: Option<String>,
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
}

fn mock_candidates() -> Vec<RecruitmentCandidate> {
    vec![
        RecruitmentCandidate {
            id: "cand-1".into(),
            soul_id: None,
            name: "Lena Park".into(),
            headline: "Full-stack builder with calm leadership vibe".into(),
            skills: vec!["react".into(), "rust".into(), "product".into()],
            vibe: "steady".into(),
            verified: true,
            hourly_rate_usdt: 48.0,
            soul_md_content: None,
        },
        RecruitmentCandidate {
            id: "cand-2".into(),
            soul_id: None,
            name: "Theo Alvarez".into(),
            headline: "Growth marketer who writes like a founder".into(),
            skills: vec!["copywriting".into(), "seo".into(), "analytics".into()],
            vibe: "bold".into(),
            verified: true,
            hourly_rate_usdt: 36.0,
            soul_md_content: None,
        },
        RecruitmentCandidate {
            id: "cand-3".into(),
            soul_id: None,
            name: "Sora Iwata".into(),
            headline: "Design systems + pixel-perfect UI craft".into(),
            skills: vec!["figma".into(), "tailwind".into(), "motion".into()],
            vibe: "creative".into(),
            verified: false,
            hourly_rate_usdt: 42.0,
            soul_md_content: None,
        },
    ]
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

    Some(RecruitmentCandidate {
        id: format!("hub-soul-{id}"),
        soul_id: Some(id),
        name: title.to_string(),
        headline: description.to_string(),
        skills: if skills.is_empty() {
            vec![role.to_lowercase()]
        } else {
            skills
        },
        vibe: role.to_lowercase(),
        verified,
        hourly_rate_usdt: price.max(10.0),
        soul_md_content: None,
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
            skills: recruit.skills.clone(),
            vibe: recruit.vibe.clone(),
            verified: true,
            hourly_rate_usdt: recruit.hourly_rate_usdt,
            soul_md_content: None,
        })
        .collect()
}

fn merge_bonus_candidates(mut base: Vec<RecruitmentCandidate>, state: &AppState) -> Vec<RecruitmentCandidate> {
    let bonus = bonus_recruits_from_state(state);
    if bonus.is_empty() {
        return base;
    }
    let existing_ids: std::collections::HashSet<String> =
        base.iter().map(|candidate| candidate.id.clone()).collect();
    for candidate in bonus.into_iter().rev() {
        if !existing_ids.contains(&candidate.id) {
            base.insert(0, candidate);
        }
    }
    base
}

#[tauri::command]
pub fn get_morale_heatmap(state: State<'_, Mutex<AppState>>) -> Result<Vec<MoraleHeatmapEntry>, String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    let mut entries: Vec<MoraleHeatmapEntry> = state
        .agents
        .values()
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
        .unwrap_or_else(|| "agent-2".to_string());

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
        },
    );

    for agent_id in [hr_id.as_str(), new_agent_id] {
        if let Some(agent) = state.agents.get_mut(agent_id) {
            agent.status = "meeting".to_string();
        }
    }
}

#[tauri::command]
pub async fn list_recruitment_candidates(
    query: Option<String>,
    app_state: State<'_, Mutex<AppState>>,
) -> Result<Vec<RecruitmentCandidate>, String> {
    let client = {
        let state = app_state.lock().map_err(|e| e.to_string())?;
        if state.settings.pure_local_mode {
            return Ok(merge_bonus_candidates(mock_candidates(), &state));
        }
        HubClient::new(state.hub.base_url.clone(), state.hub.api_key.clone())
    };

    match client.list_souls(query.as_deref(), 20).await {
        Ok(listings) if !listings.is_empty() => {
            let candidates = listings
                .iter()
                .filter_map(|item| listing_to_candidate(item))
                .collect::<Vec<_>>();
            let state = app_state.lock().map_err(|e| e.to_string())?;
            if candidates.is_empty() {
                Ok(merge_bonus_candidates(mock_candidates(), &state))
            } else {
                Ok(merge_bonus_candidates(candidates, &state))
            }
        }
        _ => {
            let _ = mock_gigs();
            let state = app_state.lock().map_err(|e| e.to_string())?;
            Ok(merge_bonus_candidates(mock_candidates(), &state))
        }
    }
}

#[tauri::command]
pub async fn hire_candidate(
    request: HireCandidateRequest,
    app_state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<AgentRecord, String> {
    let (client, offered_salary) = {
        let state = app_state.lock().map_err(|e| e.to_string())?;
        if state.finance.cash_balance < request.offered_salary as f64 * 0.5 {
            return Err("Insufficient cash for onboarding package.".to_string());
        }
        (
            HubClient::new(state.hub.base_url.clone(), state.hub.api_key.clone()),
            request.offered_salary,
        )
    };

    let soul_content = if let Some(content) = request.soul_md_content.clone() {
        content
    } else if let Some(soul_id) = request
        .candidate_id
        .strip_prefix("hub-soul-")
        .and_then(|id| id.parse::<u64>().ok())
    {
        client.fetch_soul_content(soul_id).await.unwrap_or_default()
    } else {
        String::new()
    };

    let soul = if soul_content.trim().is_empty() {
        None
    } else {
        parse_soul_content(&soul_content).ok()
    };

    let mut state = app_state.lock().map_err(|e| e.to_string())?;
    ensure_agent_capacity(&state)?;
    let agent_id = format!("agent-{}", Uuid::new_v4());
    let name = soul
        .as_ref()
        .map(|profile| profile.name.clone())
        .unwrap_or_else(|| request.candidate_id.replace("hub-soul-", "Candidate "));

    let record = AgentRecord {
        id: agent_id.clone(),
        name,
        role: request.role,
        department: request.department,
        morale: 0.78,
        energy: 0.95,
        salary: offered_salary,
        status: "idle".to_string(),
        soul,
    };

    state.finance.cash_balance -= offered_salary as f64 * 0.5;
    state.agents.insert(agent_id.clone(), record.clone());
    state.finance.monthly_burn =
        total_monthly_salary(&state.agents) + state.agents.len() as f64 * 75.0;
    spawn_onboarding_meeting(&mut state, &agent_id);

    commit(app, &state)?;
    Ok(record)
}