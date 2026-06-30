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
    pub tier: String,
    pub soul_balance: f64,
    pub open_gigs: Vec<HubGig>,
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
            "{}/api/market/gigs?status=open",
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
        let url = format!("{}/api/market/gigs", self.base_url.trim_end_matches('/'));
        self.post_json(&url, payload).await
    }

    pub async fn pull_sync(&self) -> Result<HubSyncPull, String> {
        let url = format!("{}/api/sync/pull", self.base_url.trim_end_matches('/'));
        let response = self.get_json(&url, true).await?;
        let data = response.get("data").cloned().unwrap_or(response);
        serde_json::from_value(data).map_err(|e| e.to_string())
    }

    pub async fn push_sync(&self, payload: Value) -> Result<Value, String> {
        let url = format!("{}/api/sync/push", self.base_url.trim_end_matches('/'));
        self.post_json(&url, payload).await
    }

    pub async fn soul_balance(&self) -> Result<Value, String> {
        let url = format!(
            "{}/api/user/soul-balance",
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
