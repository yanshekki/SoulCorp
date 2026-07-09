use super::{apply_autopilot_runtime_defaults, gates_directives};
use crate::orchestrator::{apply_orchestrator_tick, ensure_co_ceo_spawned_public};
use crate::scrum::command_center::issue_directive_record;
use crate::scrum::types::{DirectiveSource, DirectiveStatus, DirectiveTarget};
use crate::scrum::worker::apply_scrum_worker_tick;
use crate::state::AppState;
use tauri::AppHandle;

/// Cold-start the first autopilot cycle after onboarding or company creation.
pub fn bootstrap_first_cycle(state: &mut AppState, app: &AppHandle) {
    if state.company_id.is_empty() || !state.onboarding_completed {
        return;
    }

    apply_autopilot_runtime_defaults(state);

    let mut messages = Vec::new();
    ensure_co_ceo_spawned_public(state, &mut messages);

    if state.directives.is_empty() && !state.projects.is_empty() {
        let planned = crate::orchestrator::generate_first_directive(state);
        if let Some(directive) = planned {
            let project_id = state
                .projects
                .iter()
                .find(|p| p.owner_department == directive.target_department)
                .map(|p| p.id.clone())
                .or_else(|| state.projects.first().map(|p| p.id.clone()));

            if let Some(project_id) = project_id {
                let record = issue_directive_record(
                    state,
                    directive.title,
                    directive.description,
                    DirectiveSource::CoCeo,
                    DirectiveTarget::Project,
                    project_id,
                );
                if gates_directives(state) {
                    if let Some(d) = state.directives.iter_mut().find(|d| d.id == record.id) {
                        d.awaiting_ceo_gate = true;
                    }
                }
                state.co_ceo.last_directive = Some(record.title.clone());
                state.co_ceo.directives_applied += 1;
                state.orchestrator.directives_issued_total += 1;
            }
        }
    }

    let _ = apply_scrum_worker_tick(state, app, true);
}