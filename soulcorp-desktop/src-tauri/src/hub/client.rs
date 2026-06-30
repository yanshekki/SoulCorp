use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HubGig {
    pub gig_id: u64,
    pub title: String,
    pub description: String,
    pub budget_usdt: f64,
    pub status: String,
    pub required_skills: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HubSyncPull {
    #[serde(deserialize_with = "deserialize_tier_field")]
    pub tier: String,
    pub soul_balance: f64,
    #[serde(default)]
    pub open_gigs: Vec<HubGig>,
}

fn deserialize_tier_field<'de, D>(deserializer: D) -> Result<String, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let value = Value::deserialize(deserializer)?;
    if let Some(tier) = value.as_str() {
        return Ok(tier.to_string());
    }
    if let Some(tier) = value
        .as_object()
        .and_then(|object| object.get("tier"))
        .and_then(|tier| tier.as_str())
    {
        return Ok(tier.to_string());
    }
    Ok("free".to_string())
}

#[derive(Debug, Clone)]
pub struct HubClient {
    pub base_url: String,
    pub api_key: Option<String>,
}

impl HubClient {
    pub fn new(base_url: String, api_key: Option<String>) -> Self {
        Self { base_url, api_key }
    }

    fn auth_header(&self) -> Option<String> {
        self.api_key.as_ref().map(|key| format!("Bearer {key}"))
    }

    pub async fn list_open_gigs(&self) -> Result<Vec<HubGig>, String> {
        let url = format!(
            "{}/api/market-gigs.php?status=open",
            self.base_url.trim_end_matches('/')
        );
        let response = self.get_json(&url, false).await?;
        let gigs = response
            .get("gigs")
            .and_then(|value| serde_json::from_value::<Vec<HubGig>>(value.clone()).ok())
            .unwrap_or_default();
        Ok(gigs)
    }

    pub async fn create_gig(&self, payload: Value) -> Result<Value, String> {
        let url = format!(
            "{}/api/market-gigs.php",
            self.base_url.trim_end_matches('/')
        );
        self.post_json(&url, payload).await
    }

    pub async fn pull_sync(&self) -> Result<HubSyncPull, String> {
        let url = format!("{}/api/sync-pull.php", self.base_url.trim_end_matches('/'));
        let response = self.get_json(&url, true).await?;
        let data = response.get("data").cloned().unwrap_or(response);
        serde_json::from_value(data).map_err(|e| e.to_string())
    }

    pub async fn push_sync(&self, payload: Value) -> Result<Value, String> {
        let url = format!("{}/api/sync-push.php", self.base_url.trim_end_matches('/'));
        self.post_json(&url, payload).await
    }

    pub async fn soul_balance(&self) -> Result<Value, String> {
        let url = format!(
            "{}/api/user-soul-balance.php",
            self.base_url.trim_end_matches('/')
        );
        self.get_json(&url, true).await
    }

    async fn get_json(&self, url: &str, require_auth: bool) -> Result<Value, String> {
        if require_auth && self.api_key.is_none() {
            return Err("Hub API key is required.".to_string());
        }

        let client = reqwest::Client::new();
        let mut request = client.get(url);
        if let Some(auth) = self.auth_header() {
            request = request.header("Authorization", auth);
        }

        let response = request.send().await.map_err(|e| e.to_string())?;
        let status = response.status();
        let body: Value = response.json().await.map_err(|e| e.to_string())?;
        if !status.is_success() {
            return Err(body
                .get("error")
                .and_then(|v| v.as_str())
                .unwrap_or("Hub request failed")
                .to_string());
        }
        Ok(body)
    }

    async fn post_json(&self, url: &str, payload: Value) -> Result<Value, String> {
        if self.api_key.is_none() {
            return Err("Hub API key is required.".to_string());
        }

        let client = reqwest::Client::new();
        let response = client
            .post(url)
            .header("Content-Type", "application/json")
            .header("Authorization", self.auth_header().unwrap_or_default())
            .json(&payload)
            .send()
            .await
            .map_err(|e| e.to_string())?;

        let status = response.status();
        let body: Value = response.json().await.map_err(|e| e.to_string())?;
        if !status.is_success() {
            return Err(body
                .get("error")
                .and_then(|v| v.as_str())
                .unwrap_or("Hub request failed")
                .to_string());
        }
        Ok(body)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deserializes_tier_object_from_hub_pull_sync() {
        let payload = serde_json::json!({
            "tier": {
                "tier": "pro",
                "soul_balance": 42.5
            },
            "soul_balance": 42.5,
            "open_gigs": []
        });

        let pull: HubSyncPull = serde_json::from_value(payload).expect("pull sync payload");
        assert_eq!(pull.tier, "pro");
        assert_eq!(pull.soul_balance, 42.5);
    }
}

pub fn mock_gigs() -> Vec<HubGig> {
    vec![
        HubGig {
            gig_id: 1001,
            title: "Landing page for AI startup".into(),
            description: "React + Tailwind marketing page".into(),
            budget_usdt: 450.0,
            status: "open".into(),
            required_skills: vec!["react".into(), "tailwind".into()],
        },
        HubGig {
            gig_id: 1002,
            title: "HR onboarding SOUL.md pack".into(),
            description: "Create 3 verified HR personas".into(),
            budget_usdt: 220.0,
            status: "open".into(),
            required_skills: vec!["copywriting".into(), "hr".into()],
        },
    ]
}
