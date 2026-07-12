//! Company app language + mandatory agent output-language instructions.

pub mod content_translate;
pub mod work_nodes;

use crate::state::GameSettings;

pub use content_translate::{
    snapshot_translate_runtime, text_to_blocks, translate_document,
    translate_document_with_runtime, translate_workspace_page,
    translate_workspace_page_detached, translate_workspace_pages_batch, TranslatedDocument,
    TranslateRuntime,
};
pub use work_nodes::{
    address_pm_feedback_line, default_task_phases, decompose_language_requirement,
    meeting_action_acceptance, meeting_action_items_heading, meeting_action_task_description,
    meeting_canned_outcome, meeting_default_follow_up_summary, meeting_follow_up_title,
    meeting_spawn_title, minutes_decided_next_actions, minutes_from_discussion, minutes_highlights,
    minutes_title, new_initiative_from_strategy, orchestrator_advance_description,
    orchestrator_advance_title, orchestrator_define_roadmap_body, orchestrator_define_roadmap_title,
    pm_revision_description, revision_prefix, story_acceptance_criteria,
    updated_deliverable_criterion, vision_hint_suffix, TaskPhaseTemplate,
};

/// Supported UI + agent document languages.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum AppLanguage {
    En,
    ZhHant,
    ZhHans,
}

impl AppLanguage {
    pub fn code(self) -> &'static str {
        match self {
            Self::En => "en",
            Self::ZhHant => "zh-Hant",
            Self::ZhHans => "zh-Hans",
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Self::En => "English",
            Self::ZhHant => "繁體中文",
            Self::ZhHans => "简体中文",
        }
    }

    pub fn english_name(self) -> &'static str {
        match self {
            Self::En => "English",
            Self::ZhHant => "Traditional Chinese",
            Self::ZhHans => "Simplified Chinese",
        }
    }

    /// BCP 47-ish locale for date formatting.
    pub fn date_locale(self) -> &'static str {
        match self {
            Self::En => "en-US",
            Self::ZhHant => "zh-TW",
            Self::ZhHans => "zh-CN",
        }
    }
}

pub fn parse_language(raw: &str) -> AppLanguage {
    let key = raw.trim().to_lowercase().replace('_', "-");
    match key.as_str() {
        "zh-hant" | "zh-tw" | "zh-hk" | "zh-mo" | "zh-cht" | "trad" | "traditional" => {
            AppLanguage::ZhHant
        }
        "zh-hans" | "zh-cn" | "zh-sg" | "zh-chs" | "zh" | "cn" | "simplified" => {
            AppLanguage::ZhHans
        }
        "en" | "en-us" | "en-gb" | "english" => AppLanguage::En,
        _ => AppLanguage::En,
    }
}

pub fn language_from_settings(settings: &GameSettings) -> AppLanguage {
    parse_language(&settings.app_language)
}

/// Mandatory block injected into agent / LLM prompts that produce user-facing documents.
pub fn language_instruction(lang: AppLanguage) -> String {
    match lang {
        AppLanguage::En => "\
## Output language (mandatory)
Company language: English (en).
Write the entire deliverable, titles, headings, summaries, and user-facing prose in English.
Do not switch language unless quoting code identifiers, file paths, or proper nouns."
            .to_string(),
        AppLanguage::ZhHant => "\
## Output language (mandatory)
Company language: Traditional Chinese (zh-Hant).
所有用戶可見內容（標題、章節、摘要、交付文件正文）必須使用繁體中文。
除非引用程式識別名、檔案路徑或專有名詞，否則不要改用英文或其他語言。"
            .to_string(),
        AppLanguage::ZhHans => "\
## Output language (mandatory)
Company language: Simplified Chinese (zh-Hans).
所有用户可见内容（标题、章节、摘要、交付文档正文）必须使用简体中文。
除非引用代码标识符、文件路径或专有名词，否则不要改用英文或其他语言。"
            .to_string(),
    }
}

/// Extra block for live meeting turns (spoken lines in the transcript).
pub fn meeting_language_instruction(lang: AppLanguage) -> String {
    match lang {
        AppLanguage::En => "\
## Meeting speech language (mandatory)
Speak your entire turn in English.
Do not narrate meta-planning in another language. Output only what you would say in the meeting (2–5 short paragraphs or bullets).
No chain-of-thought, no “we should structure it as…”, no English if company language is not English."
            .to_string(),
        AppLanguage::ZhHant => "\
## 會議發言語言（強制）
Company language: Traditional Chinese (zh-Hant).
你喺會議入面嘅**每一句發言、更新、建議、下一步**都必須用**繁體中文**。
唔好輸出英文內心獨白、英文規劃步驟，或「I'll structure it as…」之類後台思考。
只輸出會上會講出口嘅內容（2–5 段短句或要點即可）。
專有名詞／API／檔名可保留英文。"
            .to_string(),
        AppLanguage::ZhHans => "\
## 会议发言语言（强制）
Company language: Simplified Chinese (zh-Hans).
你在会议里的**每一句发言、更新、建议、下一步**都必须用**简体中文**。
不要输出英文内心独白、英文规划步骤，或 “I'll structure it as…” 之类后台思考。
只输出会上会说出口的内容（2–5 段短句或要点即可）。
专有名词／API／文件名可保留英文。"
            .to_string(),
    }
}

pub fn with_language_instruction(settings: &GameSettings, body: &str) -> String {
    let block = language_instruction(language_from_settings(settings));
    let body = body.trim();
    if body.is_empty() {
        block
    } else {
        format!("{block}\n\n{body}")
    }
}

/// Append language block after an existing prompt body.
pub fn append_language_instruction(settings: &GameSettings, body: &str) -> String {
    let block = language_instruction(language_from_settings(settings));
    let body = body.trim_end();
    if body.is_empty() {
        block
    } else {
        format!("{body}\n\n{block}")
    }
}

pub fn default_app_language() -> String {
    "en".to_string()
}

pub fn normalize_app_language(raw: &str) -> String {
    parse_language(raw).code().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_variants() {
        assert_eq!(parse_language("en"), AppLanguage::En);
        assert_eq!(parse_language("zh-Hant"), AppLanguage::ZhHant);
        assert_eq!(parse_language("zh_TW"), AppLanguage::ZhHant);
        assert_eq!(parse_language("zh-Hans"), AppLanguage::ZhHans);
        assert_eq!(parse_language("zh-CN"), AppLanguage::ZhHans);
        assert_eq!(parse_language("unknown"), AppLanguage::En);
    }

    #[test]
    fn instructions_mention_language() {
        assert!(language_instruction(AppLanguage::En).contains("English"));
        assert!(language_instruction(AppLanguage::ZhHant).contains("繁體"));
        assert!(language_instruction(AppLanguage::ZhHans).contains("简体"));
    }

    #[test]
    fn with_language_prefixes_body() {
        let mut settings = GameSettings::default();
        settings.app_language = "zh-Hant".into();
        let out = with_language_instruction(&settings, "Do the task.");
        assert!(out.contains("繁體"));
        assert!(out.contains("Do the task."));
        assert!(out.find("Output language").unwrap() < out.find("Do the task.").unwrap());
    }
}
