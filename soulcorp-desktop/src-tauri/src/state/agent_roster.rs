use crate::soul::{parse_soul_content, soul_profile_from_editor_content};
use crate::state::{skills_for_role, AgentRecord, AppState, PlayMode};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

const MIRA_SOUL: &str = include_str!("../../../public/samples/mira.soul.md");
const KAI_SOUL: &str = include_str!("../../../public/samples/kai.soul.md");
const REN_SOUL: &str = include_str!("../../../public/samples/ren.soul.md");

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AgentSlotMode {
    Preset,
    Recruit,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentSlotSetup {
    pub preset_id: String,
    pub mode: AgentSlotMode,
    #[serde(default)]
    pub soul_md_content: Option<String>,
    #[serde(default)]
    pub candidate_id: Option<String>,
    #[serde(default)]
    pub role: Option<String>,
    #[serde(default)]
    pub department: Option<String>,
    #[serde(default)]
    pub offered_salary: Option<f32>,
    #[serde(default)]
    pub system_prompt_source: Option<String>,
    #[serde(default)]
    pub soul_md_edited: bool,
}

#[derive(Debug, Clone)]
pub struct PresetAgentMeta {
    pub preset_id: &'static str,
    pub agent_id: &'static str,
    #[allow(dead_code)]
    pub name: &'static str,
    pub role: &'static str,
    pub department: &'static str,
    pub morale: f32,
    pub energy: f32,
    pub salary: f32,
    pub default_soul: &'static str,
}

pub fn preset_catalog() -> [PresetAgentMeta; 3] {
    [
        PresetAgentMeta {
            preset_id: "mira",
            agent_id: "agent-1",
            name: "Mira",
            role: "Senior Dev",
            department: "Engineering",
            morale: 0.82,
            energy: 0.9,
            salary: 4200.0,
            default_soul: MIRA_SOUL,
        },
        PresetAgentMeta {
            preset_id: "kai",
            agent_id: "agent-2",
            name: "Kai",
            role: "HR Lead",
            department: "Human Resources",
            morale: 0.76,
            energy: 0.85,
            salary: 3900.0,
            default_soul: KAI_SOUL,
        },
        PresetAgentMeta {
            preset_id: "ren",
            agent_id: "agent-3",
            name: "Ren",
            role: "COO",
            department: "Executive",
            morale: 0.88,
            energy: 0.8,
            salary: 5100.0,
            default_soul: REN_SOUL,
        },
    ]
}

pub fn preset_for_id(preset_id: &str) -> Option<PresetAgentMeta> {
    preset_catalog()
        .into_iter()
        .find(|preset| preset.preset_id == preset_id)
}

pub fn default_agent_roster() -> Vec<AgentSlotSetup> {
    preset_catalog()
        .into_iter()
        .map(|preset| AgentSlotSetup {
            preset_id: preset.preset_id.to_string(),
            mode: AgentSlotMode::Preset,
            soul_md_content: Some(preset.default_soul.to_string()),
            candidate_id: None,
            role: None,
            department: None,
            offered_salary: None,
            system_prompt_source: None,
            soul_md_edited: false,
        })
        .collect()
}

pub fn validate_agent_roster(roster: &[AgentSlotSetup]) -> Result<(), String> {
    if roster.len() != 3 {
        return Err("Agent roster must include exactly 3 slots (Mira, Kai, Ren).".to_string());
    }

    let expected = ["mira", "kai", "ren"];
    for (index, slot) in roster.iter().enumerate() {
        if slot.preset_id != expected[index] {
            return Err(format!(
                "Slot {} must use preset_id '{}', got '{}'.",
                index + 1,
                expected[index],
                slot.preset_id
            ));
        }

        match slot.mode {
            AgentSlotMode::Preset => {
                let content = slot
                    .soul_md_content
                    .as_deref()
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .ok_or_else(|| {
                        format!(
                            "Preset slot '{}' requires editable soul.md content.",
                            slot.preset_id
                        )
                    })?;
                parse_soul_content(content).map_err(|error| {
                    format!("Invalid soul.md for {}: {error}", slot.preset_id)
                })?;
            }
            AgentSlotMode::Recruit => {
                let has_candidate = slot
                    .candidate_id
                    .as_deref()
                    .map(str::trim)
                    .is_some_and(|value| !value.is_empty());
                let has_custom_soul = slot
                    .soul_md_content
                    .as_deref()
                    .map(str::trim)
                    .is_some_and(|value| !value.is_empty());

                if !has_candidate && !has_custom_soul {
                    return Err(format!(
                        "Recruit slot '{}' requires a hub candidate or custom soul.md.",
                        slot.preset_id
                    ));
                }

                if has_custom_soul {
                    parse_soul_content(slot.soul_md_content.as_deref().unwrap_or_default())
                        .map_err(|error| {
                            format!("Invalid custom soul.md for {}: {error}", slot.preset_id)
                        })?;
                }

                if has_candidate && !has_custom_soul {
                    return Err(format!(
                        "Recruit slot '{}' is missing soul.md content for the selected candidate.",
                        slot.preset_id
                    ));
                }

                let role = slot.role.as_deref().map(str::trim).unwrap_or_default();
                let department = slot.department.as_deref().map(str::trim).unwrap_or_default();
                if role.is_empty() || department.is_empty() {
                    return Err(format!(
                        "Recruit slot '{}' requires role and department.",
                        slot.preset_id
                    ));
                }
            }
        }
    }

    Ok(())
}

impl AppState {
    pub fn apply_agent_roster(&mut self, roster: &[AgentSlotSetup]) -> Result<(), String> {
        validate_agent_roster(roster)?;
        self.agents.clear();

        let use_operational_defaults = crate::config::is_v1();
        for slot in roster {
            match slot.mode {
                AgentSlotMode::Preset => self.insert_preset_agent(slot, use_operational_defaults)?,
                AgentSlotMode::Recruit => self.insert_recruit_agent(slot, use_operational_defaults)?,
            }
        }

        self.finalize_agent_roster_side_effects();
        Ok(())
    }

    fn insert_preset_agent(
        &mut self,
        slot: &AgentSlotSetup,
        use_operational_defaults: bool,
    ) -> Result<(), String> {
        let preset = preset_for_id(&slot.preset_id)
            .ok_or_else(|| format!("Unknown preset '{}'.", slot.preset_id))?;
        let soul_content = slot.soul_md_content.as_deref().unwrap_or(preset.default_soul);
        let mut soul = parse_soul_content(soul_content)?;
        if let Some(source) = slot
            .system_prompt_source
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            soul.system_prompt_source = Some(source.to_string());
        }
        let (morale, energy) = if use_operational_defaults {
            (1.0_f32, 1.0_f32)
        } else {
            (preset.morale, preset.energy)
        };
        let role_string = preset.role.to_string();

        self.agents.insert(
            preset.agent_id.to_string(),
            AgentRecord {
                id: preset.agent_id.to_string(),
                name: soul.name.clone(),
                role: role_string.clone(),
                department: preset.department.to_string(),
                morale,
                energy,
                salary: preset.salary,
                status: "idle".to_string(),
                soul: Some(soul),
                soul_id: None,
                ai_provider: None,
            agent_runtime_mode: None,
                agent_kind: None,
                skills: skills_for_role(&role_string),
                reports_to: None,
                manages_department: None,
            },
        );
        Ok(())
    }

    fn insert_recruit_agent(
        &mut self,
        slot: &AgentSlotSetup,
        use_operational_defaults: bool,
    ) -> Result<(), String> {
        let soul_content = slot
            .soul_md_content
            .as_deref()
            .ok_or_else(|| format!("Recruit slot '{}' is missing soul.md content.", slot.preset_id))?;
        let mut soul = soul_profile_from_editor_content(soul_content)?;
        if !slot.soul_md_edited {
            if let Some(source) = slot
                .system_prompt_source
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
            {
                soul.system_prompt_source = Some(source.to_string());
            }
        }
        let role = slot
            .role
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .ok_or_else(|| format!("Recruit slot '{}' is missing role.", slot.preset_id))?
            .to_string();
        let department = slot
            .department
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .ok_or_else(|| format!("Recruit slot '{}' is missing department.", slot.preset_id))?
            .to_string();
        let salary = slot.offered_salary.unwrap_or(3500.0);
        let agent_id = format!("agent-{}", Uuid::new_v4());
        let soul_id = if slot.soul_md_edited {
            None
        } else {
            slot.candidate_id
                .as_deref()
                .and_then(|id| id.strip_prefix("hub-soul-"))
                .and_then(|id| id.parse::<u64>().ok())
        };
        let (morale, energy) = if use_operational_defaults {
            (1.0_f32, 1.0_f32)
        } else {
            (0.78_f32, 0.95_f32)
        };

        self.agents.insert(
            agent_id.clone(),
            AgentRecord {
                id: agent_id,
                name: soul.name.clone(),
                role: role.clone(),
                department: department.clone(),
                morale,
                energy,
                salary,
                status: "idle".to_string(),
                soul: Some(soul),
                soul_id,
                ai_provider: None,
            agent_runtime_mode: None,
                agent_kind: None,
                skills: skills_for_role(&role),
                reports_to: None,
                manages_department: None,
            },
        );
        Ok(())
    }

    fn finalize_agent_roster_side_effects(&mut self) {
        crate::scrum::seed_default_org_links(self);
        if !crate::config::is_v1() && self.settings.play_mode == PlayMode::Game {
            crate::fate::ensure_fate_agent(self);
        }

        if !crate::config::is_v1() {
            crate::relationships::seed_default_relationships(self);
        }
        crate::departments::ensure_default_departments(self);
        if self.token_economy.departments.is_empty() {
            crate::token_budget::initialize_wallets_from_agents(self);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn starter_agents(state: &AppState) -> Vec<&AgentRecord> {
        state
            .agents
            .values()
            .filter(|agent| agent.agent_kind.as_deref() != Some("fate"))
            .collect()
    }

    #[test]
    fn default_roster_creates_three_agents_with_souls() {
        let mut state = AppState::default();
        state.settings.play_mode = PlayMode::Work;
        state
            .apply_agent_roster(&default_agent_roster())
            .expect("apply default roster");
        assert_eq!(starter_agents(&state).len(), 3);
        for agent in starter_agents(&state) {
            assert!(agent.soul.is_some(), "agent {} should have soul", agent.id);
        }
    }

    #[test]
    fn roster_finalize_leaves_monthly_burn_at_zero() {
        let mut state = AppState::default();
        state.settings.play_mode = PlayMode::Work;
        state.token_economy.monthly_burn_tokens = 0;
        state
            .apply_agent_roster(&default_agent_roster())
            .expect("apply default roster");
        assert_eq!(state.token_economy.monthly_burn_tokens, 0);
        assert_eq!(
            crate::finance::projected_monthly_payroll(&state.agents),
            13_425
        );
    }

    #[test]
    fn preset_soul_edit_updates_agent_name() {
        let mut state = AppState::default();
        let mut roster = default_agent_roster();
        roster[0].soul_md_content = Some(
            "# Nova\n\n## Personality\nCurious.\n\n## Values\nLearn.\n\n## Communication Style\nBrief.\n"
                .to_string(),
        );
        state.apply_agent_roster(&roster).expect("apply edited roster");
        let mira = state.agents.get("agent-1").expect("mira");
        assert_eq!(mira.name, "Nova");
    }

    #[test]
    fn edited_recruit_skips_hub_source_and_soul_id() {
        let mut state = AppState::default();
        state.settings.play_mode = PlayMode::Work;
        let roster = vec![
            AgentSlotSetup {
                preset_id: "mira".to_string(),
                mode: AgentSlotMode::Recruit,
                soul_md_content: Some(MIRA_SOUL.to_string()),
                candidate_id: Some("hub-soul-42".to_string()),
                role: Some("Senior Dev".to_string()),
                department: Some("Engineering".to_string()),
                offered_salary: Some(4000.0),
                system_prompt_source: Some("=== MODULE: SOUL.md ===\nHub persona".to_string()),
                soul_md_edited: true,
            },
            default_agent_roster()[1].clone(),
            default_agent_roster()[2].clone(),
        ];
        state.apply_agent_roster(&roster).expect("apply edited recruit roster");

        let recruit = starter_agents(&state)
            .into_iter()
            .find(|agent| agent.id != "agent-2" && agent.id != "agent-3")
            .expect("recruit agent");
        assert_eq!(recruit.soul_id, None);
        let soul = recruit.soul.as_ref().expect("soul profile");
        assert!(soul.system_prompt_source.is_none());
    }

    #[test]
    fn unedited_recruit_keeps_hub_soul_id_and_source() {
        let mut state = AppState::default();
        state.settings.play_mode = PlayMode::Work;
        let hub_source = "=== MODULE: SOUL.md ===\nHub persona";
        let roster = vec![
            AgentSlotSetup {
                preset_id: "mira".to_string(),
                mode: AgentSlotMode::Recruit,
                soul_md_content: Some(MIRA_SOUL.to_string()),
                candidate_id: Some("hub-soul-42".to_string()),
                role: Some("Senior Dev".to_string()),
                department: Some("Engineering".to_string()),
                offered_salary: Some(4000.0),
                system_prompt_source: Some(hub_source.to_string()),
                soul_md_edited: false,
            },
            default_agent_roster()[1].clone(),
            default_agent_roster()[2].clone(),
        ];
        state.apply_agent_roster(&roster).expect("apply hub recruit roster");

        let recruit = starter_agents(&state)
            .into_iter()
            .find(|agent| agent.id != "agent-2" && agent.id != "agent-3")
            .expect("recruit agent");
        assert_eq!(recruit.soul_id, Some(42));
        assert_eq!(
            recruit.soul.as_ref().and_then(|soul| soul.system_prompt_source.as_deref()),
            Some(hub_source)
        );
    }

    #[test]
    fn recruit_slot_uses_generated_agent_id() {
        let mut state = AppState::default();
        state.settings.play_mode = PlayMode::Work;
        let roster = vec![
            AgentSlotSetup {
                preset_id: "mira".to_string(),
                mode: AgentSlotMode::Recruit,
                soul_md_content: Some(MIRA_SOUL.to_string()),
                candidate_id: Some("hub-soul-42".to_string()),
                role: Some("Senior Dev".to_string()),
                department: Some("Engineering".to_string()),
                offered_salary: Some(4000.0),
                system_prompt_source: None,
                soul_md_edited: false,
            },
            default_agent_roster()[1].clone(),
            default_agent_roster()[2].clone(),
        ];
        state.apply_agent_roster(&roster).expect("apply mixed roster");
        assert!(!state.agents.contains_key("agent-1"));
        assert_eq!(starter_agents(&state).len(), 3);
    }

    #[test]
    fn rejects_invalid_roster_length() {
        let mut state = AppState::default();
        let err = state
            .apply_agent_roster(&default_agent_roster()[..2])
            .expect_err("should reject");
        assert!(err.contains("exactly 3 slots"));
    }
}