use super::adapters::{self, SkillExecContext};
use super::security::{push_audit, tool_belongs_to_pack, FirewallEvent, SkillPolicy};
use super::types::{SkillDispatchRequest, SkillDispatchResult, SkillPack};
use crate::state::{AgentRecord, AppState};
use chrono::Utc;
use std::path::Path;

/// Dispatch a skill tool with full execution context (workspace, agent, policy).
pub fn dispatch_tool_with_context(
    state: &mut AppState,
    agent: &AgentRecord,
    workspace_root: Option<&Path>,
    packs: &[SkillPack],
    policy: &SkillPolicy,
    request: &SkillDispatchRequest,
) -> SkillDispatchResult {
    let tool = request.tool.trim();
    if tool.is_empty() {
        return SkillDispatchResult {
            tool: request.tool.clone(),
            ok: false,
            message: "Tool id is empty.".into(),
            data: serde_json::Value::Null,
            dry_run: request.dry_run,
        };
    }

    let Some(pack) = tool_belongs_to_pack(packs, tool) else {
        return SkillDispatchResult {
            tool: tool.to_string(),
            ok: false,
            message: format!("Unknown tool '{tool}'. Not registered in skill catalog."),
            data: serde_json::Value::Null,
            dry_run: request.dry_run,
        };
    };

    let decision = policy.evaluate(pack, tool, &request.args);
    push_audit(FirewallEvent {
        at: Utc::now().to_rfc3339(),
        tool: tool.to_string(),
        pack_id: decision.pack_id.clone(),
        allow: decision.allow,
        dry_run: decision.dry_run || request.dry_run,
        layer: decision.layer.clone(),
        reason: decision.reason.clone(),
    });

    if !decision.allow {
        return SkillDispatchResult {
            tool: tool.to_string(),
            ok: false,
            message: format!(
                "Skills Firewall blocked: {} [{}]",
                decision.reason,
                decision.layer.as_deref().unwrap_or("policy")
            ),
            data: serde_json::json!({
                "pack_id": pack.id,
                "risk": pack.risk.as_str(),
                "firewall": decision,
            }),
            dry_run: false,
        };
    }

    let force_dry = request.dry_run || decision.dry_run;

    let mut ctx = SkillExecContext {
        state,
        agent,
        workspace_root,
        policy,
        dry_run: force_dry,
    };
    adapters::run_tool(&mut ctx, tool, &request.args)
}

/// Catalog-only dispatch (no workspace) — used by Tauri command / tests.
pub fn dispatch_tool(
    packs: &[SkillPack],
    policy: &SkillPolicy,
    request: &SkillDispatchRequest,
) -> SkillDispatchResult {
    let agent = AgentRecord {
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
    };
    let mut state = AppState::default();
    dispatch_tool_with_context(&mut state, &agent, None, packs, policy, request)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::skills::catalog::builtin_catalog;
    use crate::skills::security::SkillPolicy;

    #[test]
    fn rejects_unknown_tool() {
        let packs = builtin_catalog();
        let policy = SkillPolicy::default();
        let result = dispatch_tool(
            &packs,
            &policy,
            &SkillDispatchRequest {
                tool: "nope".into(),
                args: serde_json::json!({}),
                dry_run: true,
            },
        );
        assert!(!result.ok);
    }

    #[test]
    fn allows_low_risk_stub() {
        let packs = builtin_catalog();
        let policy = SkillPolicy::default();
        let result = dispatch_tool(
            &packs,
            &policy,
            &SkillDispatchRequest {
                tool: "web_search".into(),
                args: serde_json::json!({"query": "test"}),
                dry_run: true,
            },
        );
        assert!(result.ok);
        assert!(result.dry_run);
    }

    #[test]
    fn blocks_critical_by_default() {
        let packs = builtin_catalog();
        let policy = SkillPolicy::default();
        let result = dispatch_tool(
            &packs,
            &policy,
            &SkillDispatchRequest {
                tool: "browser_fill".into(),
                args: serde_json::json!({}),
                dry_run: false,
            },
        );
        assert!(!result.ok);
    }
}
