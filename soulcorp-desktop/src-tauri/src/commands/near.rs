use crate::db::persistence::commit;
use crate::hub::HubClient;
use crate::state::AppState;
use crate::tier::benefits_for_tier;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, State};
use tauri_plugin_opener::OpenerExt;

#[derive(Debug, Serialize, Deserialize)]
pub struct NearTxPayload {
    pub receiver_id: String,
    pub amount: String,
    pub memo: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NearUpgradeConfig {
    pub soul_contract_id: String,
    pub usdt_contract_id: String,
    pub usdc_contract_id: String,
    pub vip_amount_raw: String,
    pub pro_amount_raw: String,
    pub vip_amount_usd: String,
    pub pro_amount_usd: String,
    pub upgrade_page_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaimNearUpgradeRequest {
    pub tier: String,
    pub token: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaimNearUpgradeResult {
    pub tier: String,
    pub message: String,
    pub benefits: crate::tier::TierBenefits,
}

#[tauri::command]
pub fn get_near_upgrade_config(
    state: State<'_, Mutex<AppState>>,
) -> Result<NearUpgradeConfig, String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    let base = state.hub.base_url.trim_end_matches('/');
    Ok(NearUpgradeConfig {
        soul_contract_id: "soulmd-hub.near".to_string(),
        usdt_contract_id: "usdt.tether-token.near".to_string(),
        usdc_contract_id:
            "17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1".to_string(),
        vip_amount_raw: "4990000".to_string(),
        pro_amount_raw: "14990000".to_string(),
        vip_amount_usd: "4.99".to_string(),
        pro_amount_usd: "14.99".to_string(),
        upgrade_page_url: format!("{base}/upgrade.php"),
    })
}

#[tauri::command]
pub fn open_hub_upgrade_page(app: AppHandle, state: State<'_, Mutex<AppState>>) -> Result<String, String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    let url = format!("{}/upgrade.php", state.hub.base_url.trim_end_matches('/'));
    app.opener()
        .open_url(&url, None::<&str>)
        .map_err(|e| e.to_string())?;
    Ok(url)
}

#[tauri::command]
pub async fn claim_near_tier_upgrade(
    request: ClaimNearUpgradeRequest,
    app_state: State<'_, Mutex<AppState>>,
    app: AppHandle,
) -> Result<ClaimNearUpgradeResult, String> {
    let client = {
        let state = app_state.lock().map_err(|e| e.to_string())?;
        if state.settings.pure_local_mode {
            return Err("NEAR tier upgrades require soulmd-hub connection.".to_string());
        }
        if state.hub.api_key.is_none() {
            return Err("Hub API key required. Add it in Settings before claiming NEAR upgrades.".to_string());
        }
        if state.hub.near_wallet_address.is_none() {
            return Err(
                "Bind a NEAR wallet on soulmd-hub first (Settings → Web3 Wallet on the hub site)."
                    .to_string(),
            );
        }
        HubClient::new(state.hub.base_url.clone(), state.hub.api_key.clone())
    };

    let tier = request.tier.to_lowercase();
    if tier != "pro" && tier != "vip" {
        return Err("Tier must be 'pro' or 'vip'.".to_string());
    }

    let token = request.token.to_lowercase();
    let body = client
        .claim_near_upgrade(&tier, &token)
        .await
        .map_err(|error| format!("NEAR upgrade claim failed: {error}"))?;

    if body.get("success").and_then(|value| value.as_bool()) != Some(true) {
        return Err(body
            .get("error")
            .and_then(|value| value.as_str())
            .unwrap_or("NEAR upgrade claim rejected by hub.")
            .to_string());
    }

    let mut state = app_state.lock().map_err(|e| e.to_string())?;
    state.hub.user_tier = tier.clone();
    state.hub.connected = true;
    let message = body
        .get("message")
        .and_then(|value| value.as_str())
        .unwrap_or("NEAR on-chain upgrade verified and applied.")
        .to_string();

    let result = ClaimNearUpgradeResult {
        tier: tier.clone(),
        message,
        benefits: benefits_for_tier(&tier),
    };
    commit(app, &state)?;
    Ok(result)
}

#[tauri::command]
pub fn sign_near_transaction(_tx_payload: NearTxPayload) -> Result<String, String> {
    Err(
        "NEAR transactions must be signed through the in-app wallet selector on the Tier panel."
            .to_string(),
    )
}