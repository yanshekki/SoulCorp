use crate::hub::{filter_gigs_for_tier, HubClient, HubSyncPull};
use crate::state::AppState;
use chrono::{DateTime, Utc};
use serde_json::{json, Value};
use std::sync::OnceLock;
use tokio::runtime::Runtime;

pub const GIG_QC_SUBMIT_TYPE: &str = "gig_qc_submit";
pub const GIG_ASSIGN_TYPE: &str = "gig_assign";
pub const GIG_START_TYPE: &str = "gig_start";
pub const GIG_COMPLETE_TYPE: &str = "gig_complete";

fn hub_runtime() -> &'static Runtime {
    static RT: OnceLock<Runtime> = OnceLock::new();
    RT.get_or_init(|| Runtime::new().expect("hub async runtime"))
}

pub fn hub_client_from_state(state: &AppState) -> HubClient {
    HubClient::new(state.hub.base_url.clone(), state.hub.api_key.clone())
}

pub fn enqueue_gig_qc_submit(state: &mut AppState, gig_id: u64, qc_score: f32, contract_id: &str) {
    if state
        .sync_queue
        .iter()
        .any(|item| queue_item_contract_id(item) == Some(contract_id))
    {
        return;
    }
    state.sync_queue.push(json!({
        "type": GIG_QC_SUBMIT_TYPE,
        "gig_id": gig_id,
        "qc_score": qc_score,
        "contract_id": contract_id,
    }));
}

pub fn enqueue_gig_start(state: &mut AppState, gig_id: u64) {
    if state
        .sync_queue
        .iter()
        .any(|item| item.get("type") == Some(&json!(GIG_START_TYPE)) && item.get("gig_id") == Some(&json!(gig_id)))
    {
        return;
    }
    state.sync_queue.push(json!({
        "type": GIG_START_TYPE,
        "gig_id": gig_id,
    }));
}

pub fn enqueue_gig_assign(state: &mut AppState, gig_id: u64) {
    if state
        .sync_queue
        .iter()
        .any(|item| item.get("type") == Some(&json!(GIG_ASSIGN_TYPE)) && item.get("gig_id") == Some(&json!(gig_id)))
    {
        return;
    }
    state.sync_queue.push(json!({
        "type": GIG_ASSIGN_TYPE,
        "gig_id": gig_id,
    }));
}

pub fn blocking_submit_gig_qc(client: &HubClient, gig_id: u64, qc_score: f32) -> Result<Value, String> {
    hub_runtime().block_on(client.submit_gig_for_qc(gig_id, qc_score))
}

pub fn blocking_assign_gig(client: &HubClient, gig_id: u64) -> Result<Value, String> {
    hub_runtime().block_on(client.assign_gig(gig_id))
}

pub fn blocking_start_gig(client: &HubClient, gig_id: u64) -> Result<Value, String> {
    hub_runtime().block_on(client.start_gig(gig_id))
}

pub fn blocking_complete_gig(client: &HubClient, gig_id: u64) -> Result<Value, String> {
    hub_runtime().block_on(client.complete_gig(gig_id))
}

pub fn blocking_pull_sync(client: &HubClient) -> Result<HubSyncPull, String> {
    hub_runtime().block_on(client.pull_sync())
}

pub fn blocking_push_sync(client: &HubClient, payload: Value) -> Result<Value, String> {
    hub_runtime().block_on(client.push_sync(payload))
}

pub fn enqueue_gig_complete(state: &mut AppState, gig_id: u64, contract_id: &str) {
    if state
        .sync_queue
        .iter()
        .any(|item| queue_item_contract_id(item) == Some(contract_id))
    {
        return;
    }
    state.sync_queue.push(json!({
        "type": GIG_COMPLETE_TYPE,
        "gig_id": gig_id,
        "contract_id": contract_id,
    }));
}

pub fn apply_hub_pull(state: &mut AppState, pull: HubSyncPull) {
    state.hub.connected = true;
    state.hub.user_tier = pull.tier.clone();
    state.hub.soul_balance = pull.soul_balance;
    let tier = state.hub.user_tier.clone();
    state.hub.cached_open_gigs = filter_gigs_for_tier(pull.open_gigs, &tier);
    state.hub.last_sync_at = Some(Utc::now().to_rfc3339());
}

pub struct HubPullReport {
    pub pulled: bool,
    pub open_gigs: u32,
    pub messages: Vec<String>,
}

pub fn try_auto_hub_pull(state: &mut AppState) -> HubPullReport {
    let mut report = HubPullReport {
        pulled: false,
        open_gigs: 0,
        messages: Vec::new(),
    };

    if !state.settings.orchestrator_auto_hub_pull
        || state.company_id.is_empty()
        || state.settings.pure_local_mode
        || state.hub.base_url.trim().is_empty()
        || state.hub.api_key.is_none()
    {
        return report;
    }

    let interval = state.settings.hub_auto_pull_interval_secs.max(60) as i64;
    if let Some(last) = state.hub.last_sync_at.as_deref() {
        if let Ok(parsed) = DateTime::parse_from_rfc3339(last) {
            let elapsed = (Utc::now() - parsed.with_timezone(&Utc)).num_seconds();
            if elapsed < interval {
                return report;
            }
        }
    }

    let client = hub_client_from_state(state);
    if !state.sync_queue.is_empty() {
        let queue = state.sync_queue.clone();
        match blocking_push_sync(&client, json!({ "queue": queue })) {
            Ok(_) => {
                state.sync_queue.clear();
                report.messages.push("Pushed pending hub sync queue.".into());
            }
            Err(err) => {
                report
                    .messages
                    .push(format!("Hub sync push deferred: {err}"));
            }
        }
    }

    match blocking_pull_sync(&client) {
        Ok(pull) => {
            report.open_gigs = pull.open_gigs.len() as u32;
            apply_hub_pull(state, pull);
            report.pulled = true;
            report.messages.push(format!(
                "Auto-pulled hub listings ({open} open gigs).",
                open = report.open_gigs
            ));
        }
        Err(err) => report.messages.push(format!("Hub auto-pull failed: {err}")),
    }

    report
}

pub struct HubFlushReport {
    pub qc_submitted: u32,
    pub gigs_assigned: u32,
    pub gigs_started: u32,
    pub gigs_completed: u32,
    pub failures: Vec<String>,
}

pub fn flush_pending_hub_gig_ops(state: &mut AppState) -> HubFlushReport {
    let mut report = HubFlushReport {
        qc_submitted: 0,
        gigs_assigned: 0,
        gigs_started: 0,
        gigs_completed: 0,
        failures: Vec::new(),
    };

    if state.settings.pure_local_mode || state.hub.base_url.trim().is_empty() {
        return report;
    }

    let client = hub_client_from_state(state);
    let mut remaining = Vec::new();

    for item in state.sync_queue.drain(..) {
        let item_type = item
            .get("type")
            .and_then(|v| v.as_str())
            .unwrap_or_default();

        match item_type {
            GIG_QC_SUBMIT_TYPE => {
                let gig_id = item.get("gig_id").and_then(|v| v.as_u64()).unwrap_or(0);
                let qc_score = item
                    .get("qc_score")
                    .and_then(|v| v.as_f64())
                    .unwrap_or(0.75) as f32;
                if gig_id == 0 {
                    continue;
                }
                match blocking_submit_gig_qc(&client, gig_id, qc_score) {
                    Ok(_) => report.qc_submitted += 1,
                    Err(err) => {
                        report.failures.push(format!("QC submit gig {gig_id}: {err}"));
                        remaining.push(item);
                    }
                }
            }
            GIG_ASSIGN_TYPE => {
                let gig_id = item.get("gig_id").and_then(|v| v.as_u64()).unwrap_or(0);
                if gig_id == 0 {
                    continue;
                }
                match blocking_assign_gig(&client, gig_id) {
                    Ok(_) => report.gigs_assigned += 1,
                    Err(err) => {
                        report.failures.push(format!("Assign gig {gig_id}: {err}"));
                        remaining.push(item);
                    }
                }
            }
            GIG_START_TYPE => {
                let gig_id = item.get("gig_id").and_then(|v| v.as_u64()).unwrap_or(0);
                if gig_id == 0 {
                    continue;
                }
                match blocking_start_gig(&client, gig_id) {
                    Ok(_) => report.gigs_started += 1,
                    Err(err) => {
                        report.failures.push(format!("Start gig {gig_id}: {err}"));
                        remaining.push(item);
                    }
                }
            }
            GIG_COMPLETE_TYPE => {
                let gig_id = item.get("gig_id").and_then(|v| v.as_u64()).unwrap_or(0);
                if gig_id == 0 {
                    continue;
                }
                match blocking_complete_gig(&client, gig_id) {
                    Ok(_) => report.gigs_completed += 1,
                    Err(err) => {
                        report.failures.push(format!("Complete gig {gig_id}: {err}"));
                        remaining.push(item);
                    }
                }
            }
            _ => remaining.push(item),
        }
    }

    state.sync_queue = remaining;
    report
}

fn queue_item_contract_id(item: &Value) -> Option<&str> {
    item.get("contract_id").and_then(|v| v.as_str())
}