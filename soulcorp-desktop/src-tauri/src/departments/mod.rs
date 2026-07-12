pub mod cascade;
pub mod defaults;
pub mod generate;
pub mod org_assign;
pub mod org_chart;

pub use cascade::{
    clear_department_head_references, member_count_by_department, rename_department_references,
    transfer_department_members,
};
pub use defaults::{department_exists, department_names, ensure_default_departments, max_departments};
pub use generate::{
    apply_department_specs, build_generation_context, heuristic_department_specs,
    normalize_specs, try_llm_department_specs, GenerateDepartmentsResult, GeneratedDepartmentSpec,
};
pub use org_assign::{run_assign_org, run_assign_org_heuristic, AssignOrgResult};
pub use org_chart::{build_org_chart, would_create_reporting_cycle, OrgChartSnapshot};

use crate::state::{AppState, CompanyDepartment};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DepartmentBuildingSnapshot {
    pub id: String,
    pub name: String,
    pub department: String,
    pub position: [f32; 3],
    pub size: [f32; 3],
    pub color: String,
    pub roof_color: String,
    pub accent_color: String,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DepartmentListEntry {
    pub id: String,
    pub name: String,
    pub display_name: String,
    pub sop: String,
    pub brand_color: String,
    pub accent_color: String,
    pub building_id: String,
    pub created_at: String,
    pub parent_department_id: Option<String>,
    pub head_agent_id: Option<String>,
    pub member_count: u32,
    pub head_agent_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DepartmentsSnapshot {
    pub departments: Vec<DepartmentListEntry>,
    pub buildings: Vec<DepartmentBuildingSnapshot>,
}

pub fn building_for_department(department: &CompanyDepartment, index: usize) -> DepartmentBuildingSnapshot {
    let x = -10.0 + (index as f32 * 3.6);
    DepartmentBuildingSnapshot {
        id: department.building_id.clone(),
        name: department.display_name.clone(),
        department: department.name.clone(),
        position: [x, 0.0, -10.0 - (index as f32 * 0.8)],
        size: [3.0, 2.4, 3.0],
        color: department.brand_color.clone(),
        roof_color: department.accent_color.clone(),
        accent_color: department.accent_color.clone(),
        description: department.sop.clone(),
    }
}

pub fn list_departments_snapshot(state: &AppState) -> DepartmentsSnapshot {
    let member_counts = member_count_by_department(state);
    let departments = state
        .departments
        .iter()
        .map(|department| {
            let head_agent_name = department
                .head_agent_id
                .as_ref()
                .and_then(|id| state.agents.get(id))
                .map(|agent| agent.name.clone());
            DepartmentListEntry {
                id: department.id.clone(),
                name: department.name.clone(),
                display_name: department.display_name.clone(),
                sop: department.sop.clone(),
                brand_color: department.brand_color.clone(),
                accent_color: department.accent_color.clone(),
                building_id: department.building_id.clone(),
                created_at: department.created_at.clone(),
                parent_department_id: department.parent_department_id.clone(),
                head_agent_id: department.head_agent_id.clone(),
                member_count: *member_counts.get(&department.name).unwrap_or(&0),
                head_agent_name,
            }
        })
        .collect();
    let buildings = state
        .departments
        .iter()
        .enumerate()
        .map(|(index, department)| building_for_department(department, index))
        .collect();
    DepartmentsSnapshot {
        departments,
        buildings,
    }
}

/// Normalize to a browser-safe `#RRGGBB` (HTML `input[type=color]` requires this form).
pub fn normalize_hex_color(value: &str, fallback: &str) -> String {
    let fallback = if is_valid_hex6(fallback) {
        fallback.to_string()
    } else {
        "#6d7f9b".to_string()
    };
    let raw = value.trim();
    let hex = raw.strip_prefix('#').unwrap_or(raw);
    let hex = hex
        .chars()
        .filter(|ch| ch.is_ascii_hexdigit())
        .collect::<String>()
        .to_lowercase();

    match hex.len() {
        6 => format!("#{hex}"),
        3 => {
            // #rgb → #rrggbb
            let expanded: String = hex
                .chars()
                .flat_map(|ch| [ch, ch])
                .collect();
            format!("#{expanded}")
        }
        8 => {
            // #rrggbbaa → drop alpha
            format!("#{}", &hex[..6])
        }
        _ => fallback,
    }
}

fn is_valid_hex6(value: &str) -> bool {
    let hex = value.trim().strip_prefix('#').unwrap_or(value.trim());
    hex.len() == 6 && hex.chars().all(|ch| ch.is_ascii_hexdigit())
}

pub fn create_department_record(
    name: &str,
    display_name: &str,
    sop: &str,
    brand_color: &str,
    accent_color: &str,
) -> CompanyDepartment {
    CompanyDepartment {
        id: Uuid::new_v4().to_string(),
        name: name.to_string(),
        display_name: display_name.to_string(),
        sop: sop.trim().to_string(),
        brand_color: normalize_hex_color(brand_color, "#6d7f9b"),
        accent_color: normalize_hex_color(accent_color, "#5ec8ff"),
        building_id: format!("dept-{}", Uuid::new_v4()),
        created_at: Utc::now().to_rfc3339(),
        parent_department_id: None,
        head_agent_id: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::{AgentRecord, AppState};

    #[test]
    fn normalize_hex_color_expands_and_rejects_junk() {
        assert_eq!(normalize_hex_color("#abc", "#112233"), "#aabbcc");
        assert_eq!(normalize_hex_color("6d7f9b", "#000000"), "#6d7f9b");
        assert_eq!(normalize_hex_color("#ff0000aa", "#000000"), "#ff0000");
        assert_eq!(normalize_hex_color("not-a-color", "#6d7f9b"), "#6d7f9b");
        assert_eq!(normalize_hex_color("", "#5ec8ff"), "#5ec8ff");
    }

    #[test]
    fn ensure_default_departments_does_not_seed_entries() {
        let mut state = AppState::default();
        ensure_default_departments(&mut state);
        assert!(state.departments.is_empty());
    }

    fn seed_engineering_department(state: &mut AppState) {
        state.departments.push(crate::state::CompanyDepartment {
            id: "dept-eng".into(),
            name: "Engineering".into(),
            display_name: "Engineering".into(),
            sop: String::new(),
            brand_color: "#6d7f9b".into(),
            accent_color: "#5ec8ff".into(),
            building_id: "engineering".into(),
            created_at: "2026-01-01T00:00:00Z".into(),
            parent_department_id: None,
            head_agent_id: None,
        });
    }

    #[test]
    fn rename_cascades_agent_and_project_references() {
        let mut state = AppState::default();
        seed_engineering_department(&mut state);
        state.agents.insert(
            "agent-1".into(),
            AgentRecord {
                id: "agent-1".into(),
                name: "Mira".into(),
                role: "Engineer".into(),
                department: "Engineering".into(),
                morale: 0.8,
                energy: 0.8,
                salary: 3000.0,
                status: "working".into(),
                soul: None,
                soul_id: None,
                ai_provider: None,
            agent_runtime_mode: None,
                agent_kind: None,
                skills: crate::state::skills_for_role("Engineer"),
                reports_to: None,
                manages_department: Some("Engineering".into()),
            },
        );
        state.projects.push(crate::state::InternalProject {
            id: "proj-1".into(),
            title: "Core".into(),
            progress: 0.1,
            priority: 1,
            owner_department: "Engineering".into(),
            description: String::new(),
            pm_agent_id: None,
            active_sprint_id: None,
            default_cycle_days: 14,
        });

        rename_department_references(&mut state, "Engineering", "R&D");
        assert_eq!(state.agents.get("agent-1").unwrap().department, "R&D");
        assert_eq!(state.projects[0].owner_department, "R&D");
        assert!(state.departments.iter().any(|dept| dept.name == "R&D"));
    }
}