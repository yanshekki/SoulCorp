//! Skills Firewall — multi-layer policy evaluation for every tool dispatch.

use super::types::{RiskTier, SkillPack};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;

/// Policy snapshot for resolving which packs/tools may run.
#[derive(Debug, Clone)]
pub struct SkillPolicy {
    pub enabled: bool,
    pub enabled_packs: Vec<String>,
    pub disabled_packs: Vec<String>,
    pub allow_high_risk: bool,
    pub allow_critical: bool,
    pub domain_allowlist: Vec<String>,
    pub domain_blocklist: Vec<String>,
    pub domain_mode: String,
    pub dry_run_high: bool,
    pub dry_run_critical: bool,
    pub allow_network: bool,
    pub allow_browser: bool,
    pub allow_scripts: bool,
    pub allow_media_generate: bool,
    pub allow_social_post: bool,
    pub allowed_script_runtimes: Vec<String>,
    pub blocked_tools: Vec<String>,
    pub blocked_permissions: Vec<String>,
    pub require_domain_for_fetch: bool,
}

impl Default for SkillPolicy {
    fn default() -> Self {
        Self {
            enabled: true,
            enabled_packs: Vec::new(),
            disabled_packs: Vec::new(),
            allow_high_risk: false,
            allow_critical: false,
            domain_allowlist: Vec::new(),
            domain_blocklist: Vec::new(),
            domain_mode: "open".into(),
            dry_run_high: false,
            dry_run_critical: true,
            allow_network: true,
            allow_browser: false,
            allow_scripts: true,
            allow_media_generate: true,
            allow_social_post: false,
            allowed_script_runtimes: Vec::new(),
            blocked_tools: Vec::new(),
            blocked_permissions: Vec::new(),
            require_domain_for_fetch: false,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FirewallLayer {
    Master,
    PackDeny,
    Risk,
    Capability,
    Permission,
    ToolDeny,
    Domain,
    ScriptRuntime,
    DryRun,
}

impl FirewallLayer {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Master => "master",
            Self::PackDeny => "pack_deny",
            Self::Risk => "risk",
            Self::Capability => "capability",
            Self::Permission => "permission",
            Self::ToolDeny => "tool_deny",
            Self::Domain => "domain",
            Self::ScriptRuntime => "script_runtime",
            Self::DryRun => "dry_run",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FirewallDecision {
    pub allow: bool,
    pub dry_run: bool,
    pub layer: Option<String>,
    pub reason: String,
    pub pack_id: Option<String>,
    pub tool: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FirewallEvent {
    pub at: String,
    pub tool: String,
    pub pack_id: Option<String>,
    pub allow: bool,
    pub dry_run: bool,
    pub layer: Option<String>,
    pub reason: String,
}

static AUDIT: Mutex<Vec<FirewallEvent>> = Mutex::new(Vec::new());
const AUDIT_CAP: usize = 50;

pub fn push_audit(event: FirewallEvent) {
    if let Ok(mut log) = AUDIT.lock() {
        log.push(event);
        let len = log.len();
        if len > AUDIT_CAP {
            log.drain(0..len - AUDIT_CAP);
        }
    }
}

pub fn audit_snapshot() -> Vec<FirewallEvent> {
    AUDIT.lock().map(|g| g.clone()).unwrap_or_default()
}

pub fn clear_audit() {
    if let Ok(mut log) = AUDIT.lock() {
        log.clear();
    }
}

impl SkillPolicy {
    /// Build policy from persisted company preferences.
    pub fn from_preferences(prefs: &crate::state::SkillPreferences) -> Self {
        Self {
            enabled: prefs.firewall_enabled,
            enabled_packs: prefs.force_enabled_packs.clone(),
            disabled_packs: prefs.disabled_packs.clone(),
            allow_high_risk: prefs.allow_high_risk,
            allow_critical: prefs.allow_critical,
            domain_allowlist: prefs.domain_allowlist.clone(),
            domain_blocklist: prefs.domain_blocklist.clone(),
            domain_mode: prefs.domain_mode.clone(),
            dry_run_high: prefs.dry_run_high,
            dry_run_critical: prefs.dry_run_critical,
            allow_network: prefs.allow_network,
            allow_browser: prefs.allow_browser,
            allow_scripts: prefs.allow_scripts,
            allow_media_generate: prefs.allow_media_generate,
            allow_social_post: prefs.allow_social_post,
            allowed_script_runtimes: prefs.allowed_script_runtimes.clone(),
            blocked_tools: prefs.blocked_tools.clone(),
            blocked_permissions: prefs.blocked_permissions.clone(),
            require_domain_for_fetch: prefs.require_domain_for_fetch,
        }
    }

    /// Catalog / toggle enablement: risk + pack deny (capabilities checked at dispatch).
    pub fn pack_enabled(&self, pack: &SkillPack) -> bool {
        self.pack_runnable(pack)
    }

    /// Whether a pack passes risk + denylist under current firewall.
    pub fn pack_runnable(&self, pack: &SkillPack) -> bool {
        if !self.enabled {
            return false;
        }
        if Self::list_has(&self.disabled_packs, &pack.id) {
            return false;
        }
        let forced = Self::list_has(&self.enabled_packs, &pack.id);
        if forced {
            return true;
        }
        match pack.risk {
            RiskTier::Low | RiskTier::Medium => true,
            RiskTier::High => self.allow_high_risk,
            RiskTier::Critical => self.allow_critical,
        }
    }

    fn list_has(list: &[String], id: &str) -> bool {
        list.iter().any(|x| x.eq_ignore_ascii_case(id))
    }

    fn tool_needs_network(tool: &str) -> bool {
        matches!(
            tool,
            "web_search"
                | "fetch_url"
                | "browser_goto"
                | "browser_snapshot"
                | "browser_fill"
                | "browser_click"
                | "x_post"
        ) || tool.contains("http")
    }

    fn tool_needs_browser(tool: &str) -> bool {
        matches!(
            tool,
            "browser_goto" | "browser_snapshot" | "browser_fill" | "browser_click"
        )
    }

    fn tool_needs_scripts(tool: &str) -> bool {
        matches!(tool, "run_script" | "run_python" | "list_script_skills")
    }

    fn tool_needs_media(tool: &str) -> bool {
        matches!(
            tool,
            "generate_image"
                | "edit_image"
                | "generate_audio"
                | "text_to_speech"
                | "generate_video"
                | "video_job_status"
                | "transcribe"
        )
    }

    fn tool_needs_social(tool: &str) -> bool {
        tool == "x_post"
    }

    /// Extract host from common arg shapes.
    pub fn extract_host_from_args(args: &serde_json::Value) -> Option<String> {
        for key in ["url", "href", "host", "endpoint"] {
            if let Some(s) = args.get(key).and_then(|v| v.as_str()) {
                if let Some(h) = extract_host(s) {
                    return Some(h);
                }
            }
        }
        // first string arg that looks like URL
        if let Some(arr) = args.as_array() {
            for v in arr {
                if let Some(s) = v.as_str() {
                    if let Some(h) = extract_host(s) {
                        return Some(h);
                    }
                }
            }
        }
        None
    }

    pub fn host_allowed(&self, host: &str) -> bool {
        let host = host.trim().to_lowercase();
        if host.is_empty() {
            return false;
        }
        let mode = self.domain_mode.to_lowercase();
        match mode.as_str() {
            "blocklist" => !self.host_matches_list(host, &self.domain_blocklist),
            "allowlist" => {
                if self.domain_allowlist.is_empty() {
                    false
                } else {
                    self.host_matches_list(host, &self.domain_allowlist)
                }
            }
            _ => true, // open
        }
    }

    fn host_matches_list(&self, host: String, list: &[String]) -> bool {
        list.iter().any(|entry| {
            let e = entry.trim().to_lowercase();
            !e.is_empty() && (host == e || host.ends_with(&format!(".{e}")))
        })
    }

    fn script_runtime_allowed(&self, runtime: &str) -> bool {
        if self.allowed_script_runtimes.is_empty() {
            return true;
        }
        self.allowed_script_runtimes
            .iter()
            .any(|r| r.eq_ignore_ascii_case(runtime))
    }

    /// Full multi-layer firewall evaluation.
    pub fn evaluate(
        &self,
        pack: &SkillPack,
        tool: &str,
        args: &serde_json::Value,
    ) -> FirewallDecision {
        let tool = tool.trim();
        let pack_id = pack.id.clone();

        // 1. Master
        if !self.enabled {
            return deny(
                tool,
                Some(pack_id),
                FirewallLayer::Master,
                "Skills Firewall is disabled (master switch off).",
            );
        }

        // 2. Pack denylist (wins over force-enable)
        if Self::list_has(&self.disabled_packs, &pack.id) {
            return deny(
                tool,
                Some(pack_id),
                FirewallLayer::PackDeny,
                format!("Pack '{}' is on the deny list.", pack.id),
            );
        }

        // 3. Risk tier
        let forced = Self::list_has(&self.enabled_packs, &pack.id);
        if !forced {
            match pack.risk {
                RiskTier::Low | RiskTier::Medium => {}
                RiskTier::High if !self.allow_high_risk => {
                    return deny(
                        tool,
                        Some(pack_id),
                        FirewallLayer::Risk,
                        "High-risk skills are blocked. Enable High risk in Skills Firewall.",
                    );
                }
                RiskTier::Critical if !self.allow_critical => {
                    return deny(
                        tool,
                        Some(pack_id),
                        FirewallLayer::Risk,
                        "Critical-risk skills are blocked. Enable Critical risk in Skills Firewall.",
                    );
                }
                _ => {}
            }
        }

        // 4. Capabilities
        if Self::tool_needs_network(tool) && !self.allow_network {
            return deny(
                tool,
                Some(pack_id),
                FirewallLayer::Capability,
                "Network capability is disabled in Skills Firewall.",
            );
        }
        if Self::tool_needs_browser(tool) {
            if !self.allow_browser {
                return deny(
                    tool,
                    Some(pack_id),
                    FirewallLayer::Capability,
                    "Browser capability is disabled in Skills Firewall.",
                );
            }
            if !self.allow_high_risk && !forced {
                return deny(
                    tool,
                    Some(pack_id),
                    FirewallLayer::Risk,
                    "Browser tools require High risk.",
                );
            }
        }
        if Self::tool_needs_scripts(tool) {
            if !self.allow_scripts {
                return deny(
                    tool,
                    Some(pack_id),
                    FirewallLayer::Capability,
                    "Script execution is disabled in Skills Firewall.",
                );
            }
            // Scripts are high-risk by product default for custom packs
            if pack.risk.rank() >= RiskTier::High.rank() && !self.allow_high_risk && !forced {
                return deny(
                    tool,
                    Some(pack_id),
                    FirewallLayer::Risk,
                    "Script tools require High risk (or force-enable the pack).",
                );
            }
        }
        if Self::tool_needs_media(tool) && !self.allow_media_generate {
            return deny(
                tool,
                Some(pack_id),
                FirewallLayer::Capability,
                "Media generation is disabled in Skills Firewall.",
            );
        }
        if Self::tool_needs_social(tool) {
            if !self.allow_social_post {
                return deny(
                    tool,
                    Some(pack_id),
                    FirewallLayer::Capability,
                    "Social post is disabled in Skills Firewall.",
                );
            }
            if !self.allow_high_risk && !forced {
                return deny(
                    tool,
                    Some(pack_id),
                    FirewallLayer::Risk,
                    "Social post requires High risk.",
                );
            }
        }

        // 5. Permission denylist
        for perm in &pack.permissions {
            if Self::list_has(&self.blocked_permissions, perm) {
                return deny(
                    tool,
                    Some(pack_id),
                    FirewallLayer::Permission,
                    format!("Permission '{perm}' is blocked by Skills Firewall."),
                );
            }
        }

        // 6. Tool denylist
        if Self::list_has(&self.blocked_tools, tool) {
            return deny(
                tool,
                Some(pack_id),
                FirewallLayer::ToolDeny,
                format!("Tool '{tool}' is on the firewall tool blocklist."),
            );
        }

        // 7. Domain policy (when URL present or strict network tools)
        let host = Self::extract_host_from_args(args);
        let needs_domain_check = Self::tool_needs_browser(tool)
            || (Self::tool_needs_network(tool)
                && (self.require_domain_for_fetch
                    || matches!(self.domain_mode.to_lowercase().as_str(), "allowlist" | "blocklist")
                        && Self::tool_needs_browser(tool)))
            || (self.require_domain_for_fetch && matches!(tool, "fetch_url" | "web_search"));

        // For browser always check domain mode
        let domain_check = Self::tool_needs_browser(tool)
            || (matches!(tool, "fetch_url")
                && (self.require_domain_for_fetch
                    || self.domain_mode.eq_ignore_ascii_case("allowlist")
                        && !self.domain_allowlist.is_empty()))
            || (matches!(tool, "fetch_url" | "browser_goto") && host.is_some());

        if domain_check || (needs_domain_check && host.is_some()) {
            if let Some(ref h) = host {
                if !self.host_allowed(h) {
                    return deny(
                        tool,
                        Some(pack_id),
                        FirewallLayer::Domain,
                        format!(
                            "Host '{h}' blocked by domain policy (mode={}).",
                            self.domain_mode
                        ),
                    );
                }
            } else if Self::tool_needs_browser(tool)
                && self.domain_mode.eq_ignore_ascii_case("allowlist")
            {
                // browser without url (snapshot) ok; goto without url fails in adapter
            } else if matches!(tool, "browser_goto")
                && self.domain_mode.eq_ignore_ascii_case("allowlist")
                && self.domain_allowlist.is_empty()
            {
                return deny(
                    tool,
                    Some(pack_id),
                    FirewallLayer::Domain,
                    "Allowlist mode with empty domain allowlist blocks browser navigation.",
                );
            }
        }

        // Strict: allowlist mode + browser + empty list
        if Self::tool_needs_browser(tool)
            && self.domain_mode.eq_ignore_ascii_case("allowlist")
            && self.domain_allowlist.is_empty()
        {
            return deny(
                tool,
                Some(pack_id),
                FirewallLayer::Domain,
                "Browser blocked: domain mode is allowlist but allowlist is empty. Add domains or switch to Open.",
            );
        }

        // 8. Script runtime allowlist
        if Self::tool_needs_scripts(tool) {
            if let Some(rt) = args
                .get("runtime")
                .and_then(|v| v.as_str())
                .or_else(|| pack.runtime.as_deref())
            {
                if !self.script_runtime_allowed(rt) {
                    return deny(
                        tool,
                        Some(pack_id),
                        FirewallLayer::ScriptRuntime,
                        format!("Script runtime '{rt}' is not in the firewall allowlist."),
                    );
                }
            }
            // Infer from entry extension when present
            if let Some(entry) = args.get("entry").and_then(|v| v.as_str()).or_else(|| {
                args.get("command")
                    .and_then(|v| v.as_str())
                    .and_then(|c| c.split_whitespace().next())
            }) {
                if let Some(ext) = std::path::Path::new(entry)
                    .extension()
                    .and_then(|e| e.to_str())
                {
                    if let Some(rt) = crate::skills::runtimes::RuntimeId::from_extension(ext) {
                        if !self.script_runtime_allowed(rt.as_str()) {
                            return deny(
                                tool,
                                Some(pack_id),
                                FirewallLayer::ScriptRuntime,
                                format!(
                                    "Script runtime '{}' (from .{ext}) is not allowed by firewall.",
                                    rt.as_str()
                                ),
                            );
                        }
                    }
                }
            }
        }

        // 9. Dry-run force
        let mut dry_run = false;
        if pack.risk == RiskTier::Critical && self.dry_run_critical {
            dry_run = true;
        }
        if pack.risk == RiskTier::High && self.dry_run_high {
            dry_run = true;
        }

        FirewallDecision {
            allow: true,
            dry_run,
            layer: if dry_run {
                Some(FirewallLayer::DryRun.as_str().into())
            } else {
                None
            },
            reason: if dry_run {
                "Allowed in dry-run mode by Skills Firewall.".into()
            } else {
                "Allowed by Skills Firewall.".into()
            },
            pack_id: Some(pack_id),
            tool: tool.into(),
        }
    }
}

fn deny(tool: &str, pack_id: Option<String>, layer: FirewallLayer, reason: impl Into<String>) -> FirewallDecision {
    FirewallDecision {
        allow: false,
        dry_run: false,
        layer: Some(layer.as_str().into()),
        reason: reason.into(),
        pack_id,
        tool: tool.into(),
    }
}

fn extract_host(url: &str) -> Option<String> {
    let rest = url
        .strip_prefix("https://")
        .or_else(|| url.strip_prefix("http://"))?;
    let host = rest.split('/').next()?.split('@').next_back()?;
    let host = host.split(':').next()?.trim().to_lowercase();
    if host.is_empty() {
        None
    } else {
        Some(host)
    }
}

pub fn tool_belongs_to_pack<'a>(
    packs: &'a [SkillPack],
    tool_id: &str,
) -> Option<&'a SkillPack> {
    packs
        .iter()
        .find(|p| p.tools.iter().any(|t| t.id == tool_id))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::skills::types::{SkillSource, TokenCostClass, ToolSpec};

    fn sample_pack(id: &str, risk: RiskTier) -> SkillPack {
        SkillPack {
            id: id.to_string(),
            name: id.to_string(),
            version: 1,
            category: "test".into(),
            risk,
            requires_approval: risk.rank() >= RiskTier::High.rank(),
            token_cost_class: TokenCostClass::Light,
            permissions: vec![],
            tools: vec![ToolSpec {
                id: "web_search".into(),
                description: "t".into(),
                parameters: vec![],
            }],
            when_to_use: "test".into(),
            body: String::new(),
            source: SkillSource::Builtin,
            entry: None,
            runtime: None,
        }
    }

    fn browser_pack() -> SkillPack {
        let mut p = sample_pack("browser-assist", RiskTier::High);
        p.tools = vec![ToolSpec {
            id: "browser_goto".into(),
            description: "t".into(),
            parameters: vec![],
        }];
        p
    }

    #[test]
    fn default_blocks_high_and_critical() {
        let policy = SkillPolicy::default();
        assert!(policy.pack_runnable(&sample_pack("web-search", RiskTier::Low)));
        assert!(!policy.pack_runnable(&sample_pack("generate-video", RiskTier::High)));
        assert!(!policy.pack_runnable(&sample_pack("web-comment", RiskTier::Critical)));
    }

    #[test]
    fn denylist_wins() {
        let mut policy = SkillPolicy::default();
        policy.disabled_packs = vec!["web-search".into()];
        let d = policy.evaluate(
            &sample_pack("web-search", RiskTier::Low),
            "web_search",
            &serde_json::json!({}),
        );
        assert!(!d.allow);
        assert_eq!(d.layer.as_deref(), Some("pack_deny"));
    }

    #[test]
    fn browser_needs_capability() {
        let mut policy = SkillPolicy::default();
        policy.allow_high_risk = true;
        policy.allow_browser = false;
        let d = policy.evaluate(&browser_pack(), "browser_goto", &serde_json::json!({"url":"https://a.com"}));
        assert!(!d.allow);
        assert_eq!(d.layer.as_deref(), Some("capability"));
    }

    #[test]
    fn allowlist_empty_blocks_browser() {
        let mut policy = SkillPolicy::default();
        policy.allow_high_risk = true;
        policy.allow_browser = true;
        policy.allow_network = true;
        policy.domain_mode = "allowlist".into();
        policy.domain_allowlist.clear();
        let d = policy.evaluate(
            &browser_pack(),
            "browser_goto",
            &serde_json::json!({"url": "https://example.com"}),
        );
        assert!(!d.allow);
        assert_eq!(d.layer.as_deref(), Some("domain"));
    }

    #[test]
    fn dry_run_critical_default() {
        let mut policy = SkillPolicy::default();
        policy.allow_high_risk = true;
        policy.allow_critical = true;
        policy.allow_browser = true;
        policy.allow_network = true;
        policy.domain_mode = "open".into();
        let mut pack = sample_pack("form-submit", RiskTier::Critical);
        pack.tools = vec![ToolSpec {
            id: "browser_click".into(),
            description: "t".into(),
            parameters: vec![],
        }];
        let d = policy.evaluate(&pack, "browser_click", &serde_json::json!({}));
        assert!(d.allow);
        assert!(d.dry_run);
    }

    #[test]
    fn scripts_blocked_when_capability_off() {
        let mut policy = SkillPolicy::default();
        policy.allow_high_risk = true;
        policy.allow_scripts = false;
        let mut pack = sample_pack("script-runner", RiskTier::High);
        pack.tools = vec![ToolSpec {
            id: "run_script".into(),
            description: "t".into(),
            parameters: vec![],
        }];
        let d = policy.evaluate(&pack, "run_script", &serde_json::json!({"entry":"main.py"}));
        assert!(!d.allow);
        assert_eq!(d.layer.as_deref(), Some("capability"));
    }
}
