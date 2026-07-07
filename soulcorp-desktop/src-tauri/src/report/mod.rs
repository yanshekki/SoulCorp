use crate::achievements::Achievement;
use crate::state::{AgentRecord, AppState, GameEvent, InternalProject, TokenEconomy};
use crate::workspace::WorkspaceTree;

pub fn company_name_for(state: &AppState) -> String {
    let base = if state.company_name.trim().is_empty() {
        "SoulCorp".to_string()
    } else {
        state.company_name.trim().to_string()
    };
    format!("{base} (White-label)")
}

pub fn build_markdown(
    state: &AppState,
    workspace: Option<&WorkspaceTree>,
    company_name: &str,
) -> String {
    let mut lines = vec![
        format!("# {company_name}"),
        String::new(),
        format!("- Exported at: Day {}", state.day_number),
        format!("- Simulation tick: {}", state.tick),
        format!(
            "- Agents: {} · Meetings completed: {} · Exports created: {}",
            state.agents.len(),
            state.stats.meetings_completed,
            state.stats.exports_created
        ),
        String::new(),
        "## Executive Summary".to_string(),
        executive_summary(state),
        String::new(),
        "## Profit & Loss".to_string(),
        finance_section(&state.token_economy),
        String::new(),
        "## Agent Roster".to_string(),
        agent_table(state.agents.values().collect()),
        String::new(),
        "## Active Projects".to_string(),
        projects_section(&state.projects),
        String::new(),
        "## Recent Events".to_string(),
        events_section(&state.events),
        String::new(),
        "## Achievements".to_string(),
        achievements_section(&state.achievements),
    ];

    if let Some(tree) = workspace {
        lines.push(String::new());
        lines.push("## Workspace Inventory".to_string());
        lines.push(workspace_section(tree));
    }

    lines.join("\n")
}

pub fn build_html(
    state: &AppState,
    workspace: Option<&WorkspaceTree>,
    company_name: &str,
) -> String {
    let markdown = build_markdown(state, workspace, company_name);
    let body = markdown
        .lines()
        .map(|line| match line.strip_prefix("# ") {
            Some(title) => format!("<h1>{title}</h1>"),
            None => match line.strip_prefix("## ") {
                Some(title) => format!("<h2>{title}</h2>"),
                None if line.starts_with("- ") => format!("<li>{}</li>", &line[2..]),
                None if line.starts_with("| ") => format!("<p class=\"mono\">{line}</p>"),
                None if line.trim().is_empty() => String::new(),
                None => format!("<p>{line}</p>"),
            },
        })
        .collect::<Vec<_>>()
        .join("\n");

    format!(
        r#"<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>{company_name}</title>
  <style>
    body {{
      font-family: "Segoe UI", system-ui, sans-serif;
      color: #1f2937;
      max-width: 900px;
      margin: 2rem auto;
      padding: 0 1.5rem 3rem;
      line-height: 1.55;
    }}
    h1 {{ color: #111827; border-bottom: 2px solid #6366f1; padding-bottom: 0.4rem; }}
    h2 {{ color: #4338ca; margin-top: 2rem; }}
    li {{ margin: 0.25rem 0; }}
    .mono {{ font-family: ui-monospace, monospace; font-size: 0.92rem; }}
    @media print {{
      body {{ margin: 0; max-width: none; }}
      h2 {{ page-break-after: avoid; }}
    }}
  </style>
</head>
<body>
{body}
</body>
</html>"#
    )
}

pub fn build_pdf_lines(
    state: &AppState,
    workspace: Option<&WorkspaceTree>,
    company_name: &str,
) -> Vec<String> {
    let mut lines = vec![
        company_name.to_string(),
        format!("Day {} · Tick {}", state.day_number, state.tick),
        String::new(),
        "EXECUTIVE SUMMARY".to_string(),
        executive_summary(state),
        String::new(),
        "PROFIT & LOSS".to_string(),
        finance_section(&state.token_economy),
        String::new(),
        "AGENT ROSTER".to_string(),
    ];

    for agent in state.agents.values() {
        lines.push(format!(
            "- {} ({}) · {} · morale {:.0}% · ${:.0}/mo",
            agent.name,
            agent.role,
            agent.department,
            agent.morale * 100.0,
            agent.salary
        ));
    }

    lines.push(String::new());
    lines.push("PROJECTS".to_string());
    lines.extend(projects_section(&state.projects).lines().map(str::to_string));

    if let Some(tree) = workspace {
        lines.push(String::new());
        lines.push("WORKSPACE".to_string());
        lines.extend(workspace_section(tree).lines().map(str::to_string));
    }

    lines
}

fn executive_summary(state: &AppState) -> String {
    let health = if state.token_economy.company_starved {
        "Token balance depleted — allocate tokens to resume operations."
    } else {
        "Operations stable with active project delivery."
    };
    let total = crate::token_budget::total_company_tokens(&state.token_economy);

    format!(
        "SoulCorp is operating on day {} with {} total tokens (company pool {}), {} monthly inflow against {} burn. {}",
        state.day_number,
        total,
        state.token_economy.company_balance,
        state.token_economy.monthly_inflow_tokens,
        state.token_economy.monthly_burn_tokens,
        health
    )
}

fn finance_section(finance: &TokenEconomy) -> String {
    format!(
        "- Company pool: {} tokens\n- Monthly inflow: {} tokens\n- Monthly burn: {} tokens\n- Company starved: {}\n- Budget mix: compute {:.0}% · salaries {:.0}% · marketing {:.0}% · R&D {:.0}%",
        finance.company_balance,
        finance.monthly_inflow_tokens,
        finance.monthly_burn_tokens,
        finance.company_starved,
        finance.allocations.compute_pct,
        finance.allocations.salaries_pct,
        finance.allocations.marketing_pct,
        finance.allocations.rnd_pct,
    )
}

fn agent_table(agents: Vec<&AgentRecord>) -> String {
    let mut rows = vec![
        "| Name | Role | Department | Status | Morale | Salary |".to_string(),
        "| --- | --- | --- | --- | --- | --- |".to_string(),
    ];

    let mut agents = agents;
    agents.sort_by(|a, b| a.name.cmp(&b.name));

    for agent in agents {
        rows.push(format!(
            "| {} | {} | {} | {} | {:.0}% | ${:.0} |",
            agent.name,
            agent.role,
            agent.department,
            agent.status,
            agent.morale * 100.0,
            agent.salary
        ));
    }

    rows.join("\n")
}

fn projects_section(projects: &[InternalProject]) -> String {
    if projects.is_empty() {
        return "- No active projects.".to_string();
    }

    projects
        .iter()
        .map(|project| {
            format!(
                "- {} — {:.0}% complete (priority {}, {})",
                project.title,
                project.progress * 100.0,
                project.priority,
                project.owner_department
            )
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn events_section(events: &[GameEvent]) -> String {
    if events.is_empty() {
        return "- No events recorded yet.".to_string();
    }

    events
        .iter()
        .rev()
        .take(8)
        .map(|event| {
            format!(
                "- {} — {} (cash {:+.0}, morale {:+.0}%)",
                event.title,
                event.description,
                event.cash_delta,
                event.morale_delta * 100.0
            )
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn achievements_section(achievements: &[Achievement]) -> String {
    let unlocked: Vec<_> = achievements.iter().filter(|item| item.unlocked).collect();
    if unlocked.is_empty() {
        return "- No achievements unlocked yet.".to_string();
    }

    unlocked
        .iter()
        .map(|item| format!("- {} — {}", item.title, item.description))
        .collect::<Vec<_>>()
        .join("\n")
}

pub fn workspace_index(tree: &WorkspaceTree) -> String {
    let mut lines = vec![
        "# SoulCorp Workspace Export".to_string(),
        String::new(),
        format!("- Folders: {}", tree.folders.len()),
        format!("- Pages: {}", tree.pages.len()),
        String::new(),
        "## Pages".to_string(),
    ];

    for page in &tree.pages {
        let folder = tree
            .folders
            .iter()
            .find(|folder| folder.id == page.folder_id)
            .map(|folder| folder.name.as_str())
            .unwrap_or("Uncategorized");
        lines.push(format!(
            "- [{}] {} (edited by {}, {})",
            folder, page.title, page.last_edited_by, page.last_edited_at
        ));
    }

    lines.join("\n")
}

fn workspace_section(tree: &WorkspaceTree) -> String {
    let mut lines = vec![
        format!("- Folders: {}", tree.folders.len()),
        format!("- Pages: {}", tree.pages.len()),
    ];

    for folder in &tree.folders {
        let page_count = tree
            .pages
            .iter()
            .filter(|page| page.folder_id == folder.id)
            .count();
        lines.push(format!("- {}: {page_count} pages", folder.name));
    }

    lines.join("\n")
}

pub fn slugify(value: &str) -> String {
    let slug: String = value
        .to_lowercase()
        .chars()
        .map(|ch| if ch.is_alphanumeric() { ch } else { '-' })
        .collect();
    slug.trim_matches('-').to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn markdown_report_includes_finance_section() {
        let state = AppState::default();
        let markdown = build_markdown(&state, None, "SoulCorp Company Report");
        assert!(markdown.contains("Profit & Loss"));
        assert!(markdown.contains("Company pool"));
    }
}