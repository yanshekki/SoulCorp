use crate::relationships::connect_new_agent;
use crate::state::{skills_for_role, AgentRecord, AppState};
use crate::token_budget::{charge_tokens, ensure_agent_wallet, ChargeContext};
use crate::ai::provider::TokenUsageSource;
use uuid::Uuid;

pub struct AutoRecruitReport {
    pub hired: u32,
    pub messages: Vec<String>,
}

pub fn try_auto_recruit_tick(state: &mut AppState) -> AutoRecruitReport {
    let mut report = AutoRecruitReport {
        hired: 0,
        messages: Vec::new(),
    };

    if !state.settings.orchestrator_auto_recruit || state.company_id.is_empty() {
        return report;
    }

    let staffed = state
        .agents
        .values()
        .filter(|a| !crate::fate::is_system_agent(a))
        .count();
    if staffed >= 12 {
        return report;
    }

    let unassigned = state
        .work_nodes
        .iter()
        .filter(|n| {
            n.assignee_agent_id.is_none()
                && matches!(
                    n.status,
                    crate::scrum::WorkNodeStatus::InSprint | crate::scrum::WorkNodeStatus::Ready
                )
        })
        .count();

    if unassigned < 2 {
        return report;
    }

    let dept = state
        .work_nodes
        .iter()
        .find(|n| n.assignee_agent_id.is_none())
        .map(|n| n.department.clone())
        .unwrap_or_else(|| "Engineering".to_string());

    let agent_id = format!("agent-{}", Uuid::new_v4());
    let role = if dept.contains("HR") || dept.contains("Human") {
        "HR Specialist"
    } else if dept.contains("Sales") {
        "Account Executive"
    } else {
        "Software Engineer"
    };

    let name = format!("Auto-hire {}", staffed + 1);
    let record = AgentRecord {
        id: agent_id.clone(),
        name: name.clone(),
        role: role.to_string(),
        department: dept.clone(),
        morale: 0.75,
        energy: 0.9,
        salary: 3800.0,
        status: "idle".to_string(),
        soul: None,
        soul_id: None,
        ai_provider: None,
            agent_runtime_mode: None,
        agent_kind: None,
        skills: skills_for_role(role),
        reports_to: None,
        manages_department: None,
    };

    state.agents.insert(agent_id.clone(), record.clone());
    ensure_agent_wallet(&mut state.token_economy, &record);
    let _ = charge_tokens(
        state,
        ChargeContext {
            source: "auto_recruit".into(),
            agent_id: agent_id.clone(),
            department: dept.clone(),
            provider: "simulation".into(),
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 250,
            usage_source: TokenUsageSource::Estimated,
        },
    );
    connect_new_agent(state, &agent_id, &dept);
    state.stats.agents_hired += 1;
    report.hired = 1;
    report.messages.push(format!(
        "Auto-recruited {name} into {dept} ({unassigned} unassigned tasks).",
    ));

    report
}