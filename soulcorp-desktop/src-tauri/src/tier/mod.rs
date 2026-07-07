use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum UserTier {
    Free,
    Pro,
    Vip,
    Local,
}

impl UserTier {
    pub fn from_label(label: &str) -> Self {
        match label.to_lowercase().as_str() {
            "pro" => UserTier::Pro,
            "vip" => UserTier::Vip,
            "local" => UserTier::Local,
            _ => UserTier::Free,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TierBenefits {
    pub tier: String,
    pub platform_fee_percent: f32,
    pub max_agents: Option<u32>,
    pub cloud_sync_enabled: bool,
    pub priority_gig_matching: bool,
    pub event_foresight_days: u32,
    pub white_label_export: bool,
    pub executive_lounge: bool,
    pub custom_departments: bool,
    pub ai_co_ceo: bool,
}

fn platform_fee_for_tier(tier: UserTier) -> f32 {
    match tier {
        UserTier::Pro => 8.0,
        UserTier::Vip => 5.0,
        UserTier::Local => 0.0,
        UserTier::Free => 10.0,
    }
}

fn tier_label(tier: UserTier) -> &'static str {
    match tier {
        UserTier::Pro => "pro",
        UserTier::Vip => "vip",
        UserTier::Local => "local",
        UserTier::Free => "free",
    }
}

/// All product features are unlocked on every tier; only platform fee differs.
fn full_feature_benefits(tier: UserTier) -> TierBenefits {
    TierBenefits {
        tier: tier_label(tier).to_string(),
        platform_fee_percent: platform_fee_for_tier(tier),
        max_agents: None,
        cloud_sync_enabled: true,
        priority_gig_matching: true,
        event_foresight_days: 3,
        white_label_export: true,
        executive_lounge: true,
        custom_departments: true,
        ai_co_ceo: true,
    }
}

pub fn benefits_for_tier(tier: &str) -> TierBenefits {
    full_feature_benefits(UserTier::from_label(tier))
}

pub fn can_use_feature(_tier: &str, feature: &str) -> bool {
    matches!(
        feature,
        "cloud_sync"
            | "priority_gigs"
            | "white_label_export"
            | "executive_lounge"
            | "custom_departments"
            | "ai_co_ceo"
    )
}

pub fn agent_limit_reached(_tier: &str, _current_agents: usize) -> bool {
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn all_tiers_unlock_features() {
        for tier in ["free", "pro", "vip", "local"] {
            assert!(can_use_feature(tier, "cloud_sync"));
            assert!(can_use_feature(tier, "executive_lounge"));
            assert!(can_use_feature(tier, "custom_departments"));
            assert!(can_use_feature(tier, "ai_co_ceo"));
            assert!(can_use_feature(tier, "white_label_export"));
            let benefits = benefits_for_tier(tier);
            assert!(benefits.cloud_sync_enabled);
            assert!(benefits.ai_co_ceo);
            assert_eq!(benefits.max_agents, None);
        }
    }

    #[test]
    fn platform_fee_still_varies_by_tier() {
        assert_eq!(benefits_for_tier("free").platform_fee_percent, 10.0);
        assert_eq!(benefits_for_tier("pro").platform_fee_percent, 8.0);
        assert_eq!(benefits_for_tier("vip").platform_fee_percent, 5.0);
    }

    #[test]
    fn agent_limit_never_reached() {
        assert!(!agent_limit_reached("free", 10_000));
    }
}