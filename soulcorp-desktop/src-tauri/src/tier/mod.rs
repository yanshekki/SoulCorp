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

pub fn benefits_for_tier(tier: &str) -> TierBenefits {
    match UserTier::from_label(tier) {
        UserTier::Pro => TierBenefits {
            tier: "pro".to_string(),
            platform_fee_percent: 8.0,
            max_agents: None,
            cloud_sync_enabled: true,
            priority_gig_matching: true,
            event_foresight_days: 1,
            white_label_export: false,
            executive_lounge: false,
            custom_departments: false,
            ai_co_ceo: false,
        },
        UserTier::Vip => TierBenefits {
            tier: "vip".to_string(),
            platform_fee_percent: 5.0,
            max_agents: None,
            cloud_sync_enabled: true,
            priority_gig_matching: true,
            event_foresight_days: 3,
            white_label_export: true,
            executive_lounge: true,
            custom_departments: true,
            ai_co_ceo: true,
        },
        UserTier::Local => TierBenefits {
            tier: "local".to_string(),
            platform_fee_percent: 0.0,
            max_agents: None,
            cloud_sync_enabled: false,
            priority_gig_matching: false,
            event_foresight_days: 0,
            white_label_export: false,
            executive_lounge: false,
            custom_departments: false,
            ai_co_ceo: false,
        },
        UserTier::Free => TierBenefits {
            tier: "free".to_string(),
            platform_fee_percent: 10.0,
            max_agents: Some(50),
            cloud_sync_enabled: false,
            priority_gig_matching: false,
            event_foresight_days: 0,
            white_label_export: false,
            executive_lounge: false,
            custom_departments: false,
            ai_co_ceo: false,
        },
    }
}

pub fn can_use_feature(tier: &str, feature: &str) -> bool {
    let benefits = benefits_for_tier(tier);
    match feature {
        "cloud_sync" => benefits.cloud_sync_enabled,
        "priority_gigs" => benefits.priority_gig_matching,
        "white_label_export" => benefits.white_label_export,
        "executive_lounge" => benefits.executive_lounge,
        "custom_departments" => benefits.custom_departments,
        "ai_co_ceo" => benefits.ai_co_ceo,
        _ => false,
    }
}

pub fn agent_limit_reached(tier: &str, current_agents: usize) -> bool {
    if let Some(limit) = benefits_for_tier(tier).max_agents {
        current_agents >= limit as usize
    } else {
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pro_tier_enables_cloud_sync() {
        assert!(can_use_feature("pro", "cloud_sync"));
        assert!(benefits_for_tier("pro").event_foresight_days >= 1);
    }

    #[test]
    fn vip_unlocks_executive_features() {
        assert!(can_use_feature("vip", "executive_lounge"));
        assert!(can_use_feature("vip", "custom_departments"));
        assert!(can_use_feature("vip", "ai_co_ceo"));
    }

    #[test]
    fn free_tier_caps_agents_at_fifty() {
        assert!(!agent_limit_reached("free", 49));
        assert!(agent_limit_reached("free", 50));
    }
}
