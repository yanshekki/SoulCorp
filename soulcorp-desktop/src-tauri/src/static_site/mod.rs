use crate::report::{build_html, slugify, workspace_index};
use crate::state::AppState;
use crate::workspace::WorkspaceTree;
use chrono::Utc;

pub fn build_site_css() -> &'static str {
    r#":root {
  color-scheme: light;
  --bg: #f8f4ef;
  --card: #ffffff;
  --ink: #1f2937;
  --muted: #6b7280;
  --accent: #4f6ef7;
  --accent-soft: #e8edff;
  --border: #e5e7eb;
  --success: #2f7d4b;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: "Segoe UI", system-ui, sans-serif;
  color: var(--ink);
  background: linear-gradient(180deg, #f3efe8 0%, var(--bg) 220px);
  line-height: 1.55;
}
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
.site-shell {
  max-width: 960px;
  margin: 0 auto;
  padding: 2rem 1.25rem 3rem;
}
.site-header {
  margin-bottom: 1.5rem;
}
.site-eyebrow {
  margin: 0;
  color: var(--muted);
  font-size: 0.78rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.site-header h1 {
  margin: 0.35rem 0 0.5rem;
  font-size: clamp(1.8rem, 4vw, 2.6rem);
  line-height: 1.1;
}
.site-lead { margin: 0; color: var(--muted); max-width: 52ch; }
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 0.75rem;
  margin: 1.5rem 0;
}
.kpi-card, .panel-card, .link-card {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 1rem;
  box-shadow: 0 8px 24px rgba(17, 24, 39, 0.05);
}
.kpi-card span {
  display: block;
  color: var(--muted);
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.kpi-card strong {
  display: block;
  margin-top: 0.35rem;
  font-size: 1.35rem;
}
.panel-card h2, .panel-card h3 { margin-top: 0; color: #312e81; }
.link-grid {
  display: grid;
  gap: 0.65rem;
  margin-top: 0.75rem;
}
.link-card strong { display: block; margin-bottom: 0.2rem; }
.link-card span { color: var(--muted); font-size: 0.9rem; }
.agent-list, .project-list, .page-list {
  margin: 0.5rem 0 0;
  padding-left: 1.1rem;
}
.site-footer {
  margin-top: 2rem;
  padding-top: 1rem;
  border-top: 1px solid var(--border);
  color: var(--muted);
  font-size: 0.85rem;
}
.report-body h1 {
  color: #111827;
  border-bottom: 2px solid var(--accent);
  padding-bottom: 0.4rem;
}
.report-body h2 { color: #4338ca; margin-top: 2rem; }
.report-body li { margin: 0.25rem 0; }
.report-body .mono {
  font-family: ui-monospace, monospace;
  font-size: 0.92rem;
}
.workspace-body h1 { margin-top: 0; }
.workspace-body pre, .workspace-body code {
  font-family: ui-monospace, monospace;
  background: #f3f4f6;
}
@media print {
  body { background: #fff; }
  .site-shell { max-width: none; padding: 0; }
}"#
}

pub fn build_deploy_readme(company_name: &str) -> String {
    format!(
        r#"# Deploy {company_name} static site

This ZIP is a self-contained static website. You can host it on any static file host.

## Quick start (local)
1. Unzip the archive.
2. Open `index.html` in your browser.

## Netlify
1. Go to https://app.netlify.com/drop
2. Drag the unzipped folder onto the page.

## Vercel
```bash
npx vercel --prod
```
Run inside the unzipped folder.

## GitHub Pages
1. Create a repository and push the unzipped contents.
2. Enable GitHub Pages for the `main` branch root.

## Contents
- `index.html` — company landing page
- `report.html` — full company report
- `workspace/` — exported workspace pages as HTML
- `assets/site.css` — shared styles
- `manifest.json` — export metadata
"#
    )
}

pub fn build_index_html(
    state: &AppState,
    tree: &WorkspaceTree,
    company_name: &str,
    white_label: bool,
) -> String {
    let exported_at = Utc::now().format("%Y-%m-%d %H:%M UTC");
    let agent_rows = {
        let mut agents: Vec<_> = state.agents.values().collect();
        agents.sort_by(|a, b| a.name.cmp(&b.name));
        agents
            .iter()
            .map(|agent| {
                format!(
                    "<li><strong>{}</strong> — {} · {} · morale {:.0}%</li>",
                    agent.name,
                    agent.role,
                    agent.department,
                    agent.morale * 100.0
                )
            })
            .collect::<Vec<_>>()
            .join("\n")
    };

    let project_rows = if state.projects.is_empty() {
        "<li>No active projects.</li>".to_string()
    } else {
        state
            .projects
            .iter()
            .map(|project| {
                format!(
                    "<li><strong>{}</strong> — {:.0}% complete</li>",
                    project.title,
                    project.progress * 100.0
                )
            })
            .collect::<Vec<_>>()
            .join("\n")
    };

    let workspace_links = if tree.pages.is_empty() {
        "<li>No workspace pages exported yet.</li>".to_string()
    } else {
        let folder_names: std::collections::HashMap<String, String> = tree
            .folders
            .iter()
            .map(|folder| (folder.id.clone(), slugify(&folder.name)))
            .collect();
        tree.pages
            .iter()
            .map(|page| {
                let folder_slug = folder_names
                    .get(&page.folder_id)
                    .cloned()
                    .unwrap_or_else(|| "uncategorized".to_string());
                let page_slug = slugify(&page.title);
                format!(
                    r#"<li><a href="workspace/{folder_slug}/{page_slug}.html">{title}</a> <span class="muted">({folder_slug})</span></li>"#,
                    title = html_escape(&page.title),
                    folder_slug = folder_slug,
                    page_slug = page_slug
                )
            })
            .collect::<Vec<_>>()
            .join("\n")
    };

    let footer = if white_label {
        format!("Exported {exported_at}.")
    } else {
        format!("Generated by SoulCorp · Exported {exported_at}.")
    };

    format!(
        r#"<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{company_name}</title>
  <link rel="stylesheet" href="assets/site.css" />
</head>
<body>
  <main class="site-shell">
    <header class="site-header">
      <p class="site-eyebrow">Company site export</p>
      <h1>{company_name}</h1>
      <p class="site-lead">Day {day} snapshot with live finance, team roster, and workspace deliverables.</p>
    </header>

    <section class="kpi-grid">
      <article class="kpi-card"><span>Cash</span><strong>${cash:.0}</strong></article>
      <article class="kpi-card"><span>Agents</span><strong>{agents}</strong></article>
      <article class="kpi-card"><span>Day</span><strong>{day}</strong></article>
      <article class="kpi-card"><span>Revenue / Burn</span><strong>${revenue:.0} / ${burn:.0}</strong></article>
    </section>

    <section class="panel-card">
      <h2>Deliverables</h2>
      <div class="link-grid">
        <a class="link-card" href="report.html">
          <strong>Company report</strong>
          <span>Finance, roster, projects, achievements, and events.</span>
        </a>
        <a class="link-card" href="workspace/index.html">
          <strong>Workspace pages</strong>
          <span>{page_count} exported pages from your SoulCorp workspace.</span>
        </a>
      </div>
    </section>

    <section class="panel-card">
      <h3>Team</h3>
      <ul class="agent-list">{agent_rows}</ul>
    </section>

    <section class="panel-card">
      <h3>Projects</h3>
      <ul class="project-list">{project_rows}</ul>
    </section>

    <section class="panel-card">
      <h3>Workspace</h3>
      <ul class="page-list">{workspace_links}</ul>
    </section>

    <footer class="site-footer">{footer}</footer>
  </main>
</body>
</html>"#,
        company_name = html_escape(company_name),
        day = state.day_number,
        cash = state.finance.cash_balance,
        agents = state.agents.len(),
        revenue = state.finance.monthly_revenue,
        burn = state.finance.monthly_burn,
        page_count = tree.pages.len(),
        agent_rows = agent_rows,
        project_rows = project_rows,
        workspace_links = workspace_links,
        footer = footer,
    )
}

pub fn build_report_page_html(
    state: &AppState,
    tree: Option<&WorkspaceTree>,
    company_name: &str,
    white_label: bool,
) -> String {
    let inner = build_html(state, tree, company_name);
    let body = inner
        .split("<body>")
        .nth(1)
        .and_then(|chunk| chunk.split("</body>").next())
        .unwrap_or("")
        .trim()
        .to_string();
    let footer = if white_label {
        String::new()
    } else {
        r#"<footer class="site-footer"><a href="index.html">← Back to company site</a> · Generated by SoulCorp</footer>"#
            .to_string()
    };

    format!(
        r#"<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{company_name} — Report</title>
  <link rel="stylesheet" href="assets/site.css" />
</head>
<body>
  <main class="site-shell report-body">
    <p><a href="index.html">← Back to company site</a></p>
    {body}
    {footer}
  </main>
</body>
</html>"#,
        company_name = html_escape(company_name),
        body = body,
        footer = footer,
    )
}

pub fn build_workspace_index_html(tree: &WorkspaceTree, company_name: &str) -> String {
    let index_md = workspace_index(tree);
    let body = markdown_lines_to_html(&index_md);
    format!(
        r#"<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{company_name} — Workspace</title>
  <link rel="stylesheet" href="../assets/site.css" />
</head>
<body>
  <main class="site-shell workspace-body">
    <p><a href="../index.html">← Back to company site</a></p>
    {body}
  </main>
</body>
</html>"#,
        company_name = html_escape(company_name),
        body = body,
    )
}

pub fn build_workspace_page_html(
    title: &str,
    folder_name: &str,
    markdown: &str,
    company_name: &str,
) -> String {
    let body = markdown_lines_to_html(markdown);
    format!(
        r#"<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{title} — {company_name}</title>
  <link rel="stylesheet" href="../../assets/site.css" />
</head>
<body>
  <main class="site-shell workspace-body">
    <p><a href="../../workspace/index.html">← Workspace index</a> · <a href="../../index.html">Company site</a></p>
    <p class="site-eyebrow">{folder_name}</p>
    <h1>{title}</h1>
    {body}
  </main>
</body>
</html>"#,
        title = html_escape(title),
        company_name = html_escape(company_name),
        folder_name = html_escape(folder_name),
        body = body,
    )
}

pub fn build_manifest_json(
    state: &AppState,
    tree: &WorkspaceTree,
    company_name: &str,
    zip_name: &str,
) -> String {
    serde_json::json!({
        "exported_at": Utc::now().to_rfc3339(),
        "company_name": company_name,
        "archive": zip_name,
        "day_number": state.day_number,
        "tick": state.tick,
        "agents": state.agents.len(),
        "workspace_pages": tree.pages.len(),
        "formats": ["html", "css"],
        "entrypoint": "index.html",
    })
    .to_string()
}

fn markdown_lines_to_html(markdown: &str) -> String {
    markdown
        .lines()
        .map(|line| match line.strip_prefix("# ") {
            Some(title) => format!("<h1>{}</h1>", html_escape(title)),
            None => match line.strip_prefix("## ") {
                Some(title) => format!("<h2>{}</h2>", html_escape(title)),
                None if line.starts_with("- ") => format!("<li>{}</li>", html_escape(&line[2..])),
                None if line.trim().is_empty() => String::new(),
                None => format!("<p>{}</p>", html_escape(line)),
            },
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn html_escape(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::AppState;

    #[test]
    fn index_html_includes_company_and_report_link() {
        let state = AppState::default();
        let tree = WorkspaceTree {
            folders: vec![],
            pages: vec![],
        };
        let html = build_index_html(&state, &tree, "Acme AI Labs", false);
        assert!(html.contains("Acme AI Labs"));
        assert!(html.contains("report.html"));
        assert!(html.contains("assets/site.css"));
    }

    #[test]
    fn report_page_wraps_existing_report_body() {
        let state = AppState::default();
        let html = build_report_page_html(&state, None, "Acme AI Labs", false);
        assert!(html.contains("Profit & Loss"));
        assert!(html.contains("../assets/site.css") || html.contains("assets/site.css"));
    }
}