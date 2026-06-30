use crate::state::AppState;
use crate::tier::{benefits_for_tier, can_use_feature};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::State;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FeatureAccessResult {
    pub feature: String,
    pub allowed: bool,
    pub tier: String,
    pub message: String,
}

#[tauri::command]
pub fn get_tier_benefits(
    state: State<'_, Mutex<AppState>>,
) -> Result<crate::tier::TierBenefits, String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    let tier = if state.settings.pure_local_mode {
        "local".to_string()
    } else {
        state.hub.user_tier.clone()
    };
    Ok(benefits_for_tier(&tier))
}

#[tauri::command]
pub fn check_feature_access(
    feature: String,
    state: State<'_, Mutex<AppState>>,
) -> Result<FeatureAccessResult, String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    let tier = if state.settings.pure_local_mode {
        "local".to_string()
    } else {
        state.hub.user_tier.clone()
    };
    let allowed = can_use_feature(&tier, &feature);
    let message = if allowed {
        format!("Feature '{feature}' is available on {tier} tier.")
    } else {
        format!("Feature '{feature}' requires Pro or VIP tier.")
    };

    Ok(FeatureAccessResult {
        feature,
        allowed,
        tier,
        message,
    })
}
