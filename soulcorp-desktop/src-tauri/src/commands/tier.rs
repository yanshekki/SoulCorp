use crate::db::persistence::commit;
use crate::state::AppState;
use crate::tier::{benefits_for_tier, can_use_feature, agent_limit_reached};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, State};

const PRO_STAKE_SOUL: f64 = 100.0;
const VIP_STAKE_SOUL: f64 = 500.0;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FeatureAccessResult {
    pub feature: String,
    pub allowed: bool,
    pub tier: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpgradeTierRequest {
    pub target_tier: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpgradeTierResult {
    pub tier: String,
    pub soul_balance: f64,
    pub soul_staked: f64,
    pub message: String,
    pub benefits: crate::tier::TierBenefits,
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

#[tauri::command]
pub fn upgrade_tier(
    request: UpgradeTierRequest,
    state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<UpgradeTierResult, String> {
    let mut state = state.lock().map_err(|e| e.to_string())?;

    if state.settings.pure_local_mode {
        return Err("Tier upgrades require soulmd-hub connection. Disable Pure Local Mode.".to_string());
    }

    let target = request.target_tier.to_lowercase();
    let required_stake = match target.as_str() {
        "pro" => PRO_STAKE_SOUL,
        "vip" => VIP_STAKE_SOUL,
        _ => return Err("Target tier must be 'pro' or 'vip'.".to_string()),
    };

    let current_rank = tier_rank(&state.hub.user_tier);
    let target_rank = tier_rank(&target);
    if target_rank <= current_rank {
        return Err(format!("You are already on {} tier or higher.", state.hub.user_tier));
    }

    if state.hub.soul_balance < required_stake {
        return Err(format!(
            "Need at least {required_stake:.0} $SOUL to upgrade to {target}. Current balance: {:.2}",
            state.hub.soul_balance
        ));
    }

    state.hub.soul_balance -= required_stake;
    state.hub.user_tier = target.clone();
    state.hub.connected = true;

    let message = format!(
        "Upgraded to {target} by staking {required_stake:.0} $SOUL. Cloud sync and tier perks are now active."
    );

    let result = UpgradeTierResult {
        tier: target,
        soul_balance: state.hub.soul_balance,
        soul_staked: required_stake,
        message,
        benefits: benefits_for_tier(&state.hub.user_tier),
    };

    commit(app, &state)?;
    Ok(result)
}

pub fn ensure_agent_capacity(state: &AppState) -> Result<(), String> {
    if agent_limit_reached(&state.hub.user_tier, state.agents.len()) {
        return Err(
            "Free tier supports up to 50 agents. Upgrade to Pro for unlimited hiring.".to_string(),
        );
    }
    Ok(())
}

fn tier_rank(tier: &str) -> u8 {
    match tier.to_lowercase().as_str() {
        "vip" => 3,
        "pro" => 2,
        "local" => 2,
        _ => 1,
    }
}