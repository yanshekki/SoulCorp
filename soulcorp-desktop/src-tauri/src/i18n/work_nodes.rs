//! Localized work-node templates (stories / tasks / revisions / orchestrator).

use super::AppLanguage;

#[derive(Debug, Clone)]
pub struct TaskPhaseTemplate {
    pub phase: String,
    pub points: u8,
    pub description: String,
    pub acceptance: Vec<String>,
}

/// Default story acceptance criteria for rule-based routing.
pub fn story_acceptance_criteria(lang: AppLanguage) -> Vec<String> {
    match lang {
        AppLanguage::En => vec![
            "Deliverable documented in Workspace.".into(),
            "Acceptance criteria reviewed by PM.".into(),
        ],
        AppLanguage::ZhHant => vec![
            "交付物已記錄於工作區。".into(),
            "驗收條件已由 PM 審核。".into(),
        ],
        AppLanguage::ZhHans => vec![
            "交付物已记录于工作区。".into(),
            "验收条件已由 PM 审核。".into(),
        ],
    }
}

/// Phase label used as `"Phase: {directive title}"`.
pub fn revision_prefix(lang: AppLanguage) -> &'static str {
    match lang {
        AppLanguage::En => "Revision",
        AppLanguage::ZhHant => "修訂",
        AppLanguage::ZhHans => "修订",
    }
}

pub fn address_pm_feedback_line(lang: AppLanguage, feedback: &str) -> String {
    match lang {
        AppLanguage::En => format!("Address PM feedback: {feedback}"),
        AppLanguage::ZhHant => format!("處理 PM 回饋：{feedback}"),
        AppLanguage::ZhHans => format!("处理 PM 反馈：{feedback}"),
    }
}

pub fn updated_deliverable_criterion(lang: AppLanguage) -> String {
    match lang {
        AppLanguage::En => "Updated deliverable in Workspace.".into(),
        AppLanguage::ZhHant => "已於工作區更新交付物。".into(),
        AppLanguage::ZhHans => "已于工作区更新交付物。".into(),
    }
}

pub fn pm_revision_description(lang: AppLanguage, attempt: u8, feedback: &str) -> String {
    match lang {
        AppLanguage::En => format!("PM requested revisions (attempt {attempt}).\n\n{feedback}"),
        AppLanguage::ZhHant => format!("PM 要求修訂（第 {attempt} 次）。\n\n{feedback}"),
        AppLanguage::ZhHans => format!("PM 要求修订（第 {attempt} 次）。\n\n{feedback}"),
    }
}

/// Three default phases under a story (engineering vs general).
pub fn default_task_phases(lang: AppLanguage, engineering: bool) -> Vec<TaskPhaseTemplate> {
    match (lang, engineering) {
        (AppLanguage::En, true) => vec![
            TaskPhaseTemplate {
                phase: "Research & scope".into(),
                points: 2,
                description:
                    "Survey existing code under the company workspace project and capture constraints."
                        .into(),
                acceptance: vec![
                    "List relevant source paths under the workspace project tree.".into(),
                    "State scope, constraints, and proposed code changes (not only a narrative)."
                        .into(),
                ],
            },
            TaskPhaseTemplate {
                phase: "Implementation".into(),
                points: 3,
                description:
                    "Implement real source code under the company workspace project (not docs-only)."
                        .into(),
                acceptance: vec![
                    "Create or edit source files under the project tree (e.g. src/, apps/, ysk-restaurant/)."
                        .into(),
                    "Include tests or a clear run command when applicable.".into(),
                    "Deliverable must list concrete file paths changed — markdown-only essays fail review."
                        .into(),
                ],
            },
            TaskPhaseTemplate {
                phase: "Review & handoff".into(),
                points: 1,
                description: "Verify code artifacts, summarize changes, and hand off with paths."
                    .into(),
                acceptance: vec![
                    "Confirm implementation files exist and match acceptance.".into(),
                    "Handoff notes with paths + how to run/test.".into(),
                ],
            },
        ],
        (AppLanguage::ZhHant, true) => vec![
            TaskPhaseTemplate {
                phase: "研究與範圍".into(),
                points: 2,
                description: "檢視公司工作區既有程式碼並整理限制與範圍。".into(),
                acceptance: vec![
                    "列出工作區專案樹中相關原始碼路徑。".into(),
                    "說明範圍、限制與擬議程式變更（不能只寫敘事）。".into(),
                ],
            },
            TaskPhaseTemplate {
                phase: "實作".into(),
                points: 3,
                description: "在公司工作區專案內實作真實原始碼（不可只交文件）。".into(),
                acceptance: vec![
                    "在專案樹建立或修改原始碼（例如 src/、apps/、ysk-restaurant/）。".into(),
                    "盡量附測試或明確執行／驗證指令。".into(),
                    "交付物須列出實際變更的檔案路徑 — 純 markdown 敘事審核不通過。".into(),
                ],
            },
            TaskPhaseTemplate {
                phase: "審核與交接".into(),
                points: 1,
                description: "核實程式產物、摘要變更並附路徑交接。".into(),
                acceptance: vec![
                    "確認實作檔案存在且符合驗收。".into(),
                    "交接說明含路徑與如何執行／測試。".into(),
                ],
            },
        ],
        (AppLanguage::ZhHans, true) => vec![
            TaskPhaseTemplate {
                phase: "研究与范围".into(),
                points: 2,
                description: "检视公司工作区既有代码并整理约束与范围。".into(),
                acceptance: vec![
                    "列出工作区项目树中相关源码路径。".into(),
                    "说明范围、约束与拟议代码变更（不能只写叙事）。".into(),
                ],
            },
            TaskPhaseTemplate {
                phase: "实现".into(),
                points: 3,
                description: "在公司工作区项目内实现真实源码（不可只交文档）。".into(),
                acceptance: vec![
                    "在项目树创建或修改源码（例如 src/、apps/、ysk-restaurant/）。".into(),
                    "尽量附测试或明确运行/验证命令。".into(),
                    "交付物须列出实际变更的文件路径 — 纯 markdown 叙事审核不通过。".into(),
                ],
            },
            TaskPhaseTemplate {
                phase: "审核与交接".into(),
                points: 1,
                description: "核实代码产物、摘要变更并附路径交接。".into(),
                acceptance: vec![
                    "确认实现文件存在且符合验收。".into(),
                    "交接说明含路径与如何运行/测试。".into(),
                ],
            },
        ],
        (AppLanguage::En, false) => vec![
            TaskPhaseTemplate {
                phase: "Research & scope".into(),
                points: 2,
                description: "Gather context and constraints.".into(),
                acceptance: vec!["Document context, constraints, and recommendation.".into()],
            },
            TaskPhaseTemplate {
                phase: "Implementation".into(),
                points: 3,
                description: "Produce the core work product for this story.".into(),
                acceptance: vec!["Ship the concrete work product (not empty placeholders).".into()],
            },
            TaskPhaseTemplate {
                phase: "Review & handoff".into(),
                points: 1,
                description: "PM review and Workspace publish.".into(),
                acceptance: vec!["Publish review notes and handoff steps.".into()],
            },
        ],
        (AppLanguage::ZhHant, false) => vec![
            TaskPhaseTemplate {
                phase: "研究與範圍".into(),
                points: 2,
                description: "蒐集背景與限制條件。".into(),
                acceptance: vec!["記錄背景、限制與建議。".into()],
            },
            TaskPhaseTemplate {
                phase: "執行".into(),
                points: 3,
                description: "產出此故事的核心工作成果。".into(),
                acceptance: vec!["交付具體工作成果（不可空白佔位）。".into()],
            },
            TaskPhaseTemplate {
                phase: "審核與交接".into(),
                points: 1,
                description: "PM 審核並發佈至工作區。".into(),
                acceptance: vec!["發佈審核說明與交接步驟。".into()],
            },
        ],
        (AppLanguage::ZhHans, false) => vec![
            TaskPhaseTemplate {
                phase: "研究与范围".into(),
                points: 2,
                description: "收集背景与约束条件。".into(),
                acceptance: vec!["记录背景、约束与建议。".into()],
            },
            TaskPhaseTemplate {
                phase: "执行".into(),
                points: 3,
                description: "产出此故事的核心工作成果。".into(),
                acceptance: vec!["交付具体工作成果（不可空白占位）。".into()],
            },
            TaskPhaseTemplate {
                phase: "审核与交接".into(),
                points: 1,
                description: "PM 审核并发布至工作区。".into(),
                acceptance: vec!["发布审核说明与交接步骤。".into()],
            },
        ],
    }
}

pub fn orchestrator_advance_title(lang: AppLanguage, project_title: &str) -> String {
    match lang {
        AppLanguage::En => format!("Advance {project_title}"),
        AppLanguage::ZhHant => format!("推進 {project_title}"),
        AppLanguage::ZhHans => format!("推进 {project_title}"),
    }
}

pub fn orchestrator_advance_description(
    lang: AppLanguage,
    project_title: &str,
    progress_pct: f32,
    department: &str,
    vision_hint: &str,
) -> String {
    match lang {
        AppLanguage::En => format!(
            "Push {project_title} toward delivery. Current progress {progress_pct:.0}%. Owner department: {department}.{vision_hint}"
        ),
        AppLanguage::ZhHant => format!(
            "推動「{project_title}」邁向交付。目前進度 {progress_pct:.0}%。負責部門：{department}。{vision_hint}"
        ),
        AppLanguage::ZhHans => format!(
            "推动「{project_title}」迈向交付。目前进度 {progress_pct:.0}%。负责部门：{department}。{vision_hint}"
        ),
    }
}

pub fn orchestrator_define_roadmap_title(lang: AppLanguage) -> String {
    match lang {
        AppLanguage::En => "Define company roadmap".into(),
        AppLanguage::ZhHant => "訂定公司路線圖".into(),
        AppLanguage::ZhHans => "制定公司路线图".into(),
    }
}

pub fn orchestrator_define_roadmap_body(lang: AppLanguage, vision_hint: &str) -> String {
    match lang {
        AppLanguage::En => format!("Create the first internal project and assign a PM.{vision_hint}"),
        AppLanguage::ZhHant => format!("建立第一個內部專案並指派 PM。{vision_hint}"),
        AppLanguage::ZhHans => format!("建立第一个内部项目并指派 PM。{vision_hint}"),
    }
}

pub fn vision_hint_suffix(lang: AppLanguage, vision: &str) -> String {
    let vision = vision.trim();
    if vision.is_empty() {
        return String::new();
    }
    match lang {
        AppLanguage::En => format!(" Align with company vision: {vision}."),
        AppLanguage::ZhHant => format!(" 須符合公司願景：{vision}。"),
        AppLanguage::ZhHans => format!(" 须符合公司愿景：{vision}。"),
    }
}

/// Language block for PM LLM decomposition of directives into stories/tasks.
pub fn decompose_language_requirement(lang: AppLanguage) -> String {
    match lang {
        AppLanguage::En => {
            "Write all story/task titles, descriptions, and acceptance_criteria in English.".into()
        }
        AppLanguage::ZhHant => {
            "所有 story／task 的 title、description、acceptance_criteria 必須使用繁體中文（專有名詞與路徑可保留原文）。"
                .into()
        }
        AppLanguage::ZhHans => {
            "所有 story／task 的 title、description、acceptance_criteria 必须使用简体中文（专有名词与路径可保留原文）。"
                .into()
        }
    }
}

// ── Meeting minutes / follow-up spawn ──────────────────────────────────────

pub fn meeting_spawn_title(lang: AppLanguage, meeting_type: &str) -> String {
    match (lang, meeting_type) {
        (AppLanguage::En, "Daily Standup") => "Standup follow-ups".into(),
        (AppLanguage::En, "Crisis Meeting") => "Crisis response actions".into(),
        (AppLanguage::En, "Team Building") => "Team follow-ups".into(),
        (AppLanguage::En, other) => format!("{other} outcome"),
        (AppLanguage::ZhHant, "Daily Standup") => "站會跟進事項".into(),
        (AppLanguage::ZhHant, "Crisis Meeting") => "危機應對行動".into(),
        (AppLanguage::ZhHant, "Team Building") => "團隊建設跟進".into(),
        (AppLanguage::ZhHant, "Project Kickoff") => "專案啟動跟進".into(),
        (AppLanguage::ZhHant, "Strategy Discussion") => "策略討論成果".into(),
        (AppLanguage::ZhHant, "Sprint Planning") => "衝刺規劃跟進".into(),
        (AppLanguage::ZhHant, "Retrospective") => "回顧跟進".into(),
        (AppLanguage::ZhHant, "1:1") => "一對一跟進".into(),
        (AppLanguage::ZhHant, other) => format!("{other} 成果跟進"),
        (AppLanguage::ZhHans, "Daily Standup") => "站会跟进事项".into(),
        (AppLanguage::ZhHans, "Crisis Meeting") => "危机应对行动".into(),
        (AppLanguage::ZhHans, "Team Building") => "团队建设跟进".into(),
        (AppLanguage::ZhHans, "Project Kickoff") => "项目启动跟进".into(),
        (AppLanguage::ZhHans, "Strategy Discussion") => "策略讨论成果".into(),
        (AppLanguage::ZhHans, "Sprint Planning") => "冲刺规划跟进".into(),
        (AppLanguage::ZhHans, "Retrospective") => "回顾跟进".into(),
        (AppLanguage::ZhHans, "1:1") => "一对一跟进".into(),
        (AppLanguage::ZhHans, other) => format!("{other} 成果跟进"),
    }
}

pub fn meeting_follow_up_title(lang: AppLanguage, meeting_type: &str) -> String {
    match lang {
        AppLanguage::En => format!("Follow-up: {meeting_type}"),
        AppLanguage::ZhHant => format!("跟進：{meeting_type}"),
        AppLanguage::ZhHans => format!("跟进：{meeting_type}"),
    }
}

pub fn meeting_action_items_heading(lang: AppLanguage) -> &'static str {
    match lang {
        AppLanguage::En => "Action items",
        AppLanguage::ZhHant => "行動項目",
        AppLanguage::ZhHans => "行动项目",
    }
}

pub fn meeting_action_task_description(lang: AppLanguage, item: &str) -> String {
    match lang {
        AppLanguage::En => format!("From meeting action item:\n{item}"),
        AppLanguage::ZhHant => format!("來自會議行動項目：\n{item}"),
        AppLanguage::ZhHans => format!("来自会议行动项目：\n{item}"),
    }
}

pub fn meeting_action_acceptance(lang: AppLanguage) -> String {
    match lang {
        AppLanguage::En => {
            "Done when the action item is completed and noted in Workspace.".into()
        }
        AppLanguage::ZhHant => "完成並在工作區記錄後即可標為完成。".into(),
        AppLanguage::ZhHans => "完成并在工作区记录后即可标为完成。".into(),
    }
}

pub fn meeting_default_follow_up_summary(lang: AppLanguage) -> String {
    match lang {
        AppLanguage::En => "Follow up on meeting action items.".into(),
        AppLanguage::ZhHant => "跟進會議行動項目。".into(),
        AppLanguage::ZhHans => "跟进会议行动项目。".into(),
    }
}

pub fn meeting_canned_outcome(lang: AppLanguage, meeting_type: &str) -> String {
    match (lang, meeting_type) {
        (AppLanguage::En, "Daily Standup") => {
            "Standup aligned blockers and next actions.".into()
        }
        (AppLanguage::En, "Project Kickoff") => "Kickoff boosted project momentum.".into(),
        (AppLanguage::En, "Crisis Meeting") => "Crisis response plan agreed.".into(),
        (AppLanguage::En, "Team Building") => "Team alignment improved.".into(),
        (AppLanguage::En, "Strategy Discussion") => "Strategy discussion captured.".into(),
        (AppLanguage::En, "Sprint Planning") => "Sprint plan refined.".into(),
        (AppLanguage::En, "Retrospective") => "Retro insights recorded.".into(),
        (AppLanguage::En, _) => "Meeting action items recorded.".into(),
        (AppLanguage::ZhHant, "Daily Standup") => "站會已對齊阻礙與下一步。".into(),
        (AppLanguage::ZhHant, "Project Kickoff") => "專案啟動提升推進動能。".into(),
        (AppLanguage::ZhHant, "Crisis Meeting") => "危機應對方案已達成共識。".into(),
        (AppLanguage::ZhHant, "Team Building") => "團隊對齊有所改善。".into(),
        (AppLanguage::ZhHant, "Strategy Discussion") => "策略討論重點已記錄。".into(),
        (AppLanguage::ZhHant, "Sprint Planning") => "衝刺計畫已調整。".into(),
        (AppLanguage::ZhHant, "Retrospective") => "回顧洞見已記錄。".into(),
        (AppLanguage::ZhHant, _) => "會議行動項目已記錄。".into(),
        (AppLanguage::ZhHans, "Daily Standup") => "站会已对齐阻碍与下一步。".into(),
        (AppLanguage::ZhHans, "Project Kickoff") => "项目启动提升推进动能。".into(),
        (AppLanguage::ZhHans, "Crisis Meeting") => "危机应对方案已达成共识。".into(),
        (AppLanguage::ZhHans, "Team Building") => "团队对齐有所改善。".into(),
        (AppLanguage::ZhHans, "Strategy Discussion") => "策略讨论重点已记录。".into(),
        (AppLanguage::ZhHans, "Sprint Planning") => "冲刺计划已调整。".into(),
        (AppLanguage::ZhHans, "Retrospective") => "回顾洞见已记录。".into(),
        (AppLanguage::ZhHans, _) => "会议行动项目已记录。".into(),
    }
}

pub fn minutes_title(lang: AppLanguage, meeting_type: &str) -> String {
    match lang {
        AppLanguage::En => format!("{meeting_type} — Meeting Minutes"),
        AppLanguage::ZhHant => format!("{meeting_type} — 會議紀要"),
        AppLanguage::ZhHans => format!("{meeting_type} — 会议纪要"),
    }
}

pub fn minutes_decided_next_actions(lang: AppLanguage) -> &'static str {
    match lang {
        AppLanguage::En => "Decided next actions",
        AppLanguage::ZhHant => "已決定的下一步",
        AppLanguage::ZhHans => "已决定的下一步",
    }
}

pub fn minutes_highlights(lang: AppLanguage) -> &'static str {
    match lang {
        AppLanguage::En => "Highlights",
        AppLanguage::ZhHant => "重點",
        AppLanguage::ZhHans => "重点",
    }
}

pub fn minutes_from_discussion(lang: AppLanguage) -> &'static str {
    match lang {
        AppLanguage::En => "From discussion",
        AppLanguage::ZhHant => "討論摘錄",
        AppLanguage::ZhHans => "讨论摘录",
    }
}

pub fn new_initiative_from_strategy(lang: AppLanguage) -> (String, String) {
    match lang {
        AppLanguage::En => (
            "New initiative from strategy meeting".into(),
            "Spawned from a strategy meeting.".into(),
        ),
        AppLanguage::ZhHant => (
            "策略會議衍生新計劃".into(),
            "由策略會議產生。".into(),
        ),
        AppLanguage::ZhHans => (
            "策略会议衍生新计划".into(),
            "由策略会议产生。".into(),
        ),
    }
}
