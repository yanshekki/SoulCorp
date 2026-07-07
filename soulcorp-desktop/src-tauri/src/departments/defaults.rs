use crate::state::{AppState, CompanyDepartment};
use chrono::Utc;
use uuid::Uuid;

const MAX_DEPARTMENTS: usize = 20;

pub fn max_departments() -> usize {
    MAX_DEPARTMENTS
}

struct DefaultDepartmentSeed {
    name: &'static str,
    display_name: &'static str,
    building_id: &'static str,
    brand_color: &'static str,
    accent_color: &'static str,
    sop: &'static str,
}

const DEFAULT_DEPARTMENT_SEEDS: &[DefaultDepartmentSeed] = &[
    DefaultDepartmentSeed {
        name: "Executive",
        display_name: "Company HQ",
        building_id: "hq",
        brand_color: "#8b6f5c",
        accent_color: "#ffd166",
        sop: "Strategy, leadership, and company-wide decisions.",
    },
    DefaultDepartmentSeed {
        name: "Engineering",
        display_name: "Engineering Lab",
        building_id: "engineering",
        brand_color: "#6d7f9b",
        accent_color: "#5ec8ff",
        sop: "Ship code, prototypes, and technical experiments.",
    },
    DefaultDepartmentSeed {
        name: "Human Resources",
        display_name: "HR Lounge",
        building_id: "hr",
        brand_color: "#9b7a8d",
        accent_color: "#ff9bd5",
        sop: "Recruitment, morale, and team operations.",
    },
    DefaultDepartmentSeed {
        name: "Marketplace",
        display_name: "Hub Plaza",
        building_id: "plaza",
        brand_color: "#a6896b",
        accent_color: "#f2c879",
        sop: "Gig board and cross-company marketplace activity.",
    },
    DefaultDepartmentSeed {
        name: "Recreation",
        display_name: "Agent Park",
        building_id: "park",
        brand_color: "#6f9b7a",
        accent_color: "#b8e6c8",
        sop: "Break area for idle agents and morale events.",
    },
];

pub fn ensure_default_departments(state: &mut AppState) {
    if !state.departments.is_empty() {
        return;
    }
    let now = Utc::now().to_rfc3339();
    state.departments = DEFAULT_DEPARTMENT_SEEDS
        .iter()
        .map(|seed| CompanyDepartment {
            id: Uuid::new_v4().to_string(),
            name: seed.name.to_string(),
            display_name: seed.display_name.to_string(),
            sop: seed.sop.to_string(),
            brand_color: seed.brand_color.to_string(),
            accent_color: seed.accent_color.to_string(),
            building_id: seed.building_id.to_string(),
            created_at: now.clone(),
            parent_department_id: None,
            head_agent_id: None,
        })
        .collect();
}

pub fn department_names(state: &AppState) -> Vec<String> {
    let mut names: Vec<String> = state.departments.iter().map(|dept| dept.name.clone()).collect();
    for agent in state.agents.values() {
        if !names.iter().any(|name| name == &agent.department) {
            names.push(agent.department.clone());
        }
    }
    names.sort();
    names.dedup();
    names
}

pub fn department_exists(state: &AppState, name: &str) -> bool {
    department_names(state).iter().any(|dept| dept == name)
}