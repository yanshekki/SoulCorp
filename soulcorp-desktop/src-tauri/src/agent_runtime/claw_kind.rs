#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ClawRuntimeKind {
    OpenClaw,
    Hermes,
    IronClaw,
    NanoClaw,
}

impl ClawRuntimeKind {
    pub fn from_setting(value: &str) -> Option<Self> {
        match value.trim().to_lowercase().as_str() {
            "openclaw" => Some(Self::OpenClaw),
            "hermes" => Some(Self::Hermes),
            "ironclaw" => Some(Self::IronClaw),
            "nanoclaw" => Some(Self::NanoClaw),
            _ => None,
        }
    }

    pub fn id(self) -> &'static str {
        match self {
            Self::OpenClaw => "openclaw",
            Self::Hermes => "hermes",
            Self::IronClaw => "ironclaw",
            Self::NanoClaw => "nanoclaw",
        }
    }

    pub fn display_name(self) -> &'static str {
        match self {
            Self::OpenClaw => "OpenClaw",
            Self::Hermes => "Hermes",
            Self::IronClaw => "IronClaw",
            Self::NanoClaw => "NanoClaw",
        }
    }

    pub fn default_binary(self) -> &'static str {
        self.id()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_claw_runtime_modes() {
        assert_eq!(
            ClawRuntimeKind::from_setting("hermes"),
            Some(ClawRuntimeKind::Hermes)
        );
        assert_eq!(
            ClawRuntimeKind::from_setting("IRONCLAW"),
            Some(ClawRuntimeKind::IronClaw)
        );
        assert_eq!(ClawRuntimeKind::from_setting("llm_only"), None);
    }
}