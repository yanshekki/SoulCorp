use super::SkillExecContext;
use super::super::security::SkillPolicy;
use super::super::types::SkillDispatchResult;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;

const FETCH_TIMEOUT: Duration = Duration::from_secs(15);
const MAX_HTML_BYTES: usize = 1_500_000;

fn arg_str(args: &serde_json::Value, key: &str) -> String {
    args.get(key)
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct BrowserSession {
    url: String,
    title: String,
    text: String,
    links: Vec<BrowserLink>,
    forms: Vec<BrowserForm>,
    filled: BTreeMap<String, String>,
    last_action: String,
    history: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct BrowserLink {
    text: String,
    href: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct BrowserForm {
    action: String,
    method: String,
    fields: Vec<String>,
}

fn session_path(workspace_root: &Path) -> PathBuf {
    workspace_root.join(".skill-browser").join("session.json")
}

fn load_session(workspace_root: Option<&Path>) -> BrowserSession {
    let Some(root) = workspace_root else {
        return BrowserSession::default();
    };
    let path = session_path(root);
    fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save_session(workspace_root: Option<&Path>, session: &BrowserSession) -> Result<(), String> {
    let root = workspace_root.ok_or_else(|| "Workspace root required for browser session.".to_string())?;
    let path = session_path(root);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(session).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| e.to_string())
}

fn extract_host(url: &str) -> Option<String> {
    let rest = url
        .strip_prefix("https://")
        .or_else(|| url.strip_prefix("http://"))?;
    let host = rest.split('/').next()?.split('@').next_back()?;
    let host = host.split(':').next()?.trim();
    if host.is_empty() {
        None
    } else {
        Some(host.to_string())
    }
}

fn resolve_url(base: &str, href: &str) -> String {
    let href = href.trim();
    if href.starts_with("http://") || href.starts_with("https://") {
        return href.to_string();
    }
    if href.starts_with("//") {
        return format!("https:{href}");
    }
    if let Some(rest) = base
        .strip_prefix("https://")
        .or_else(|| base.strip_prefix("http://"))
    {
        let scheme = if base.starts_with("https") { "https" } else { "http" };
        let host = rest.split('/').next().unwrap_or("");
        if href.starts_with('/') {
            return format!("{scheme}://{host}{href}");
        }
        let mut parts: Vec<&str> = rest.split('/').collect();
        if parts.len() > 1 {
            parts.pop();
        }
        let dir = parts.join("/");
        return format!("{scheme}://{dir}/{href}");
    }
    href.to_string()
}

fn fetch_html(url: &str) -> Result<(String, String), String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(FETCH_TIMEOUT)
        .user_agent("SoulCorpDesktop/1.0 (agent skill browser)")
        .redirect(reqwest::redirect::Policy::limited(8))
        .build()
        .map_err(|e| e.to_string())?;
    let response = client
        .get(url)
        .send()
        .map_err(|e| format!("Navigation failed: {e}"))?
        .error_for_status()
        .map_err(|e| format!("HTTP error: {e}"))?;
    let final_url = response.url().to_string();
    let bytes = response.bytes().map_err(|e| e.to_string())?;
    if bytes.len() > MAX_HTML_BYTES {
        return Err("Page exceeds size limit (1.5MB).".into());
    }
    Ok((final_url, String::from_utf8_lossy(&bytes).to_string()))
}

fn parse_page(url: &str, html: &str) -> BrowserSession {
    let title = extract_title(html).unwrap_or_else(|| url.to_string());
    let text = strip_html(html)
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .chars()
        .take(12_000)
        .collect();
    let links = extract_links(url, html);
    let forms = extract_forms(url, html);
    BrowserSession {
        url: url.to_string(),
        title,
        text,
        links,
        forms,
        filled: BTreeMap::new(),
        last_action: format!("goto {url}"),
        history: vec![url.to_string()],
    }
}

fn extract_title(html: &str) -> Option<String> {
    let lower = html.to_lowercase();
    let start = lower.find("<title")?;
    let after = &html[start..];
    let gt = after.find('>')?;
    let rest = &after[gt + 1..];
    let end = rest.to_lowercase().find("</title>")?;
    Some(rest[..end].trim().to_string())
}

fn extract_links(base: &str, html: &str) -> Vec<BrowserLink> {
    let mut out = Vec::new();
    let lower = html.to_lowercase();
    let mut search_from = 0usize;
    while let Some(rel) = lower[search_from..].find("<a ") {
        let i = search_from + rel;
        let slice = &html[i..];
        let end_tag = slice.find('>').unwrap_or(0);
        let tag = &slice[..=end_tag];
        let href = attr_value(tag, "href").unwrap_or_default();
        if href.is_empty() || href.starts_with('#') || href.starts_with("javascript:") {
            search_from = i + 2;
            continue;
        }
        let after = &slice[end_tag + 1..];
        let close = after.to_lowercase().find("</a>").unwrap_or(0);
        let text = strip_html(&after[..close])
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ")
            .chars()
            .take(80)
            .collect::<String>();
        out.push(BrowserLink {
            text: if text.is_empty() { href.clone() } else { text },
            href: resolve_url(base, &href),
        });
        search_from = i + 2;
        if out.len() >= 40 {
            break;
        }
    }
    out
}

fn extract_forms(base: &str, html: &str) -> Vec<BrowserForm> {
    let mut out = Vec::new();
    let lower = html.to_lowercase();
    let mut search_from = 0usize;
    while let Some(rel) = lower[search_from..].find("<form") {
        let i = search_from + rel;
        let slice = &html[i..];
        let end_open = slice.find('>').unwrap_or(0);
        let open_tag = &slice[..=end_open];
        let action = attr_value(open_tag, "action")
            .map(|a| resolve_url(base, &a))
            .unwrap_or_else(|| base.to_string());
        let method = attr_value(open_tag, "method")
            .unwrap_or_else(|| "get".into())
            .to_lowercase();
        let close = slice.to_lowercase().find("</form>").unwrap_or(slice.len().min(8000));
        let body = &slice[..=close.min(slice.len().saturating_sub(1))];
        let fields = extract_input_names(body);
        out.push(BrowserForm {
            action,
            method,
            fields,
        });
        search_from = i + 5;
        if out.len() >= 10 {
            break;
        }
    }
    out
}

fn extract_input_names(form_html: &str) -> Vec<String> {
    let mut fields = Vec::new();
    let lower = form_html.to_lowercase();
    for tag_name in ["input", "textarea", "select"] {
        let needle = format!("<{tag_name}");
        let mut from = 0usize;
        while let Some(rel) = lower[from..].find(&needle) {
            let i = from + rel;
            let slice = &form_html[i..];
            let end = slice.find('>').unwrap_or(0);
            let tag = &slice[..=end];
            if let Some(name) = attr_value(tag, "name") {
                if !name.is_empty() && !fields.iter().any(|f| f == &name) {
                    fields.push(name);
                }
            }
            from = i + 1;
            if fields.len() >= 40 {
                return fields;
            }
        }
    }
    fields
}

fn attr_value(tag: &str, name: &str) -> Option<String> {
    let lower = tag.to_lowercase();
    let key = format!("{name}=");
    let idx = lower.find(&key)?;
    let rest = tag[idx + key.len()..].trim_start();
    if rest.starts_with('"') {
        let end = rest[1..].find('"')?;
        return Some(rest[1..1 + end].to_string());
    }
    if rest.starts_with('\'') {
        let end = rest[1..].find('\'')?;
        return Some(rest[1..1 + end].to_string());
    }
    Some(
        rest.split(|c: char| c.is_whitespace() || c == '>')
            .next()
            .unwrap_or("")
            .to_string(),
    )
}

fn strip_html(html: &str) -> String {
    let mut out = String::with_capacity(html.len() / 2);
    let mut in_tag = false;
    let mut in_script = false;
    let lower = html.to_lowercase();
    let mut i = 0;
    let bytes = html.as_bytes();
    while i < bytes.len() {
        if !in_script && lower[i..].starts_with("<script") {
            in_script = true;
            in_tag = true;
            i += 1;
            continue;
        }
        if in_script && lower[i..].starts_with("</script") {
            in_script = false;
            while i < bytes.len() && bytes[i] != b'>' {
                i += 1;
            }
            i += 1;
            continue;
        }
        if lower[i..].starts_with("<style") {
            // skip style blocks
            if let Some(end) = lower[i..].find("</style>") {
                i += end + 8;
                continue;
            }
        }
        if in_script {
            i += 1;
            continue;
        }
        let c = html[i..].chars().next().unwrap_or(' ');
        if c == '<' {
            in_tag = true;
        } else if c == '>' {
            in_tag = false;
            out.push(' ');
        } else if !in_tag {
            out.push(c);
        }
        i += c.len_utf8();
    }
    out
}

fn check_policy(tool: &str, policy: &SkillPolicy, dry_run: bool) -> Option<SkillDispatchResult> {
    let critical = matches!(tool, "browser_fill" | "browser_click");
    if critical && !policy.allow_critical {
        return Some(SkillDispatchResult {
            tool: tool.into(),
            ok: false,
            message: "Critical browser tools disabled. Enable critical risk in Safety policy.".into(),
            data: serde_json::Value::Null,
            dry_run,
        });
    }
    if !critical && !policy.allow_high_risk {
        return Some(SkillDispatchResult {
            tool: tool.into(),
            ok: false,
            message: "Browser tools require high-risk skills enabled in Safety policy.".into(),
            data: serde_json::Value::Null,
            dry_run,
        });
    }
    None
}

fn enforce_domain(url: &str, policy: &SkillPolicy, tool: &str, dry_run: bool) -> Option<SkillDispatchResult> {
    if policy.domain_allowlist.is_empty() {
        return None;
    }
    if let Some(host) = extract_host(url) {
        if !policy.host_allowed(&host) {
            return Some(SkillDispatchResult {
                tool: tool.into(),
                ok: false,
                message: format!("Host '{host}' is not on the domain allowlist."),
                data: serde_json::Value::Null,
                dry_run,
            });
        }
    }
    None
}

/// HTTP-based browser tools with persistent session (real navigation + snapshots).
pub fn browser_tool(
    ctx: &SkillExecContext<'_>,
    tool: &str,
    args: &serde_json::Value,
    dry_run: bool,
    policy: &SkillPolicy,
) -> SkillDispatchResult {
    if let Some(err) = check_policy(tool, policy, dry_run) {
        return err;
    }

    match tool {
        "browser_goto" => browser_goto(ctx, args, dry_run, policy),
        "browser_snapshot" => browser_snapshot(ctx, dry_run),
        "browser_fill" => browser_fill(ctx, args, dry_run, policy),
        "browser_click" => browser_click(ctx, args, dry_run, policy),
        _ => SkillDispatchResult {
            tool: tool.into(),
            ok: false,
            message: format!("Unknown browser tool '{tool}'."),
            data: serde_json::Value::Null,
            dry_run,
        },
    }
}

fn browser_goto(
    ctx: &SkillExecContext<'_>,
    args: &serde_json::Value,
    dry_run: bool,
    policy: &SkillPolicy,
) -> SkillDispatchResult {
    let url = arg_str(args, "url");
    if url.is_empty() {
        return fail("browser_goto", "Missing url.", dry_run);
    }
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return fail("browser_goto", "Only http/https URLs allowed.", dry_run);
    }
    if let Some(err) = enforce_domain(&url, policy, "browser_goto", dry_run) {
        return err;
    }
    if dry_run {
        return ok(
            "browser_goto",
            format!("Dry-run: would navigate to {url}."),
            serde_json::json!({ "url": url }),
            true,
        );
    }
    match fetch_html(&url) {
        Ok((final_url, html)) => {
            let mut session = parse_page(&final_url, &html);
            let mut prev = load_session(ctx.workspace_root);
            prev.history.push(final_url.clone());
            if prev.history.len() > 20 {
                let skip = prev.history.len() - 20;
                prev.history = prev.history.into_iter().skip(skip).collect();
            }
            session.history = prev.history;
            if let Err(e) = save_session(ctx.workspace_root, &session) {
                return fail("browser_goto", e, false);
            }
            ok(
                "browser_goto",
                format!("Loaded '{}' ({} links, {} forms).", session.title, session.links.len(), session.forms.len()),
                serde_json::json!({
                    "url": session.url,
                    "title": session.title,
                    "link_count": session.links.len(),
                    "form_count": session.forms.len(),
                    "text_preview": session.text.chars().take(500).collect::<String>(),
                }),
                false,
            )
        }
        Err(e) => fail("browser_goto", e, false),
    }
}

fn browser_snapshot(ctx: &SkillExecContext<'_>, dry_run: bool) -> SkillDispatchResult {
    if dry_run {
        return ok(
            "browser_snapshot",
            "Dry-run: would return accessibility/text snapshot.",
            serde_json::json!({}),
            true,
        );
    }
    let session = load_session(ctx.workspace_root);
    if session.url.is_empty() {
        return fail(
            "browser_snapshot",
            "No browser session. Call browser_goto first.",
            false,
        );
    }
    ok(
        "browser_snapshot",
        format!("Snapshot of {}.", session.title),
        serde_json::json!({
            "url": session.url,
            "title": session.title,
            "text": session.text.chars().take(6000).collect::<String>(),
            "links": session.links.iter().take(25).collect::<Vec<_>>(),
            "forms": session.forms,
            "filled": session.filled,
            "last_action": session.last_action,
        }),
        false,
    )
}

fn browser_fill(
    ctx: &SkillExecContext<'_>,
    args: &serde_json::Value,
    dry_run: bool,
    policy: &SkillPolicy,
) -> SkillDispatchResult {
    let selector = arg_str(args, "selector");
    let value = arg_str(args, "value");
    let field = if selector.is_empty() {
        arg_str(args, "name")
    } else {
        selector
    };
    if field.is_empty() {
        return fail("browser_fill", "Missing selector/name for field.", dry_run);
    }

    // Resolve secret references like secret:login_password
    let resolved = if let Some(secret_id) = value.strip_prefix("secret:") {
        match resolve_secret(ctx, secret_id.trim()) {
            Ok(v) => v,
            Err(e) => return fail("browser_fill", e, dry_run),
        }
    } else {
        value
    };

    if dry_run || policy.dry_run_critical {
        return ok(
            "browser_fill",
            format!("Dry-run: would fill '{field}' (value redacted in log)."),
            serde_json::json!({ "field": field, "filled": true, "dry_run": true }),
            true,
        );
    }

    let mut session = load_session(ctx.workspace_root);
    if session.url.is_empty() {
        return fail("browser_fill", "No browser session. Call browser_goto first.", false);
    }
    session.filled.insert(field.clone(), resolved);
    session.last_action = format!("fill {field}");
    if let Err(e) = save_session(ctx.workspace_root, &session) {
        return fail("browser_fill", e, false);
    }
    ok(
        "browser_fill",
        format!("Filled field '{field}' in session."),
        serde_json::json!({
            "field": field,
            "filled_fields": session.filled.keys().cloned().collect::<Vec<_>>(),
            "url": session.url,
        }),
        false,
    )
}

fn browser_click(
    ctx: &SkillExecContext<'_>,
    args: &serde_json::Value,
    dry_run: bool,
    policy: &SkillPolicy,
) -> SkillDispatchResult {
    let selector = arg_str(args, "selector");
    let target = if selector.is_empty() {
        arg_str(args, "text")
    } else {
        selector
    };
    if target.is_empty() {
        return fail("browser_click", "Missing selector/text to click.", dry_run);
    }

    if dry_run || policy.dry_run_critical {
        return ok(
            "browser_click",
            format!("Dry-run: would click '{target}' (critical actions default dry-run)."),
            serde_json::json!({ "target": target, "dry_run": true }),
            true,
        );
    }

    let mut session = load_session(ctx.workspace_root);
    if session.url.is_empty() {
        return fail("browser_click", "No browser session. Call browser_goto first.", false);
    }

    let target_l = target.to_lowercase();
    // Prefer form submit when target looks like submit / button
    let is_submit = target_l.contains("submit")
        || target_l.contains("sign in")
        || target_l.contains("register")
        || target_l.contains("login")
        || target_l.contains("comment")
        || target_l.contains("post")
        || target_l == "button";

    if is_submit {
        if let Some(form) = session.forms.first().cloned() {
            if let Some(err) = enforce_domain(&form.action, policy, "browser_click", false) {
                return err;
            }
            match submit_form(&form, &session.filled) {
                Ok((final_url, html)) => {
                    let filled = session.filled.clone();
                    let history = {
                        let mut h = session.history.clone();
                        h.push(final_url.clone());
                        h
                    };
                    session = parse_page(&final_url, &html);
                    session.filled = filled;
                    session.history = history;
                    session.last_action = format!("submit form → {final_url}");
                    let _ = save_session(ctx.workspace_root, &session);
                    return ok(
                        "browser_click",
                        format!("Submitted form to {}.", final_url),
                        serde_json::json!({
                            "action": "form_submit",
                            "url": session.url,
                            "title": session.title,
                            "text_preview": session.text.chars().take(500).collect::<String>(),
                        }),
                        false,
                    );
                }
                Err(e) => return fail("browser_click", format!("Form submit failed: {e}"), false),
            }
        }
    }

    // Link click
    if let Some(link) = session
        .links
        .iter()
        .find(|l| {
            l.text.to_lowercase().contains(&target_l)
                || l.href.to_lowercase().contains(&target_l)
                || target_l.contains(&l.href.to_lowercase())
        })
        .cloned()
    {
        if let Some(err) = enforce_domain(&link.href, policy, "browser_click", false) {
            return err;
        }
        match fetch_html(&link.href) {
            Ok((final_url, html)) => {
                let mut history = session.history.clone();
                history.push(final_url.clone());
                session = parse_page(&final_url, &html);
                session.history = history;
                session.last_action = format!("click link {}", link.href);
                let _ = save_session(ctx.workspace_root, &session);
                return ok(
                    "browser_click",
                    format!("Followed link to '{}'.", session.title),
                    serde_json::json!({
                        "action": "link_nav",
                        "url": session.url,
                        "title": session.title,
                    }),
                    false,
                );
            }
            Err(e) => return fail("browser_click", e, false),
        }
    }

    session.last_action = format!("click {target} (no matching control — recorded only)");
    let _ = save_session(ctx.workspace_root, &session);
    ok(
        "browser_click",
        format!(
            "No matching link/form control for '{target}'. Action recorded. Use browser_snapshot to inspect controls."
        ),
        serde_json::json!({
            "action": "recorded",
            "target": target,
            "available_links": session.links.iter().take(10).map(|l| &l.text).collect::<Vec<_>>(),
            "forms": session.forms,
        }),
        false,
    )
}

fn submit_form(form: &BrowserForm, filled: &BTreeMap<String, String>) -> Result<(String, String), String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(FETCH_TIMEOUT)
        .user_agent("SoulCorpDesktop/1.0 (agent skill browser form)")
        .redirect(reqwest::redirect::Policy::limited(8))
        .build()
        .map_err(|e| e.to_string())?;

    let mut form_map = BTreeMap::new();
    for field in &form.fields {
        if let Some(v) = filled.get(field) {
            form_map.insert(field.clone(), v.clone());
        }
    }
    // include any filled keys even if not discovered
    for (k, v) in filled {
        form_map.entry(k.clone()).or_insert_with(|| v.clone());
    }

    let response = if form.method == "get" {
        client.get(&form.action).query(&form_map).send()
    } else {
        client.post(&form.action).form(&form_map).send()
    }
    .map_err(|e| e.to_string())?
    .error_for_status()
    .map_err(|e| e.to_string())?;

    let final_url = response.url().to_string();
    let bytes = response.bytes().map_err(|e| e.to_string())?;
    if bytes.len() > MAX_HTML_BYTES {
        return Err("Response too large.".into());
    }
    Ok((final_url, String::from_utf8_lossy(&bytes).to_string()))
}

pub fn x_post(
    ctx: &SkillExecContext<'_>,
    args: &serde_json::Value,
    dry_run: bool,
    policy: &SkillPolicy,
) -> SkillDispatchResult {
    if !policy.allow_high_risk {
        return fail("x_post", "post-to-x requires high-risk skills enabled.", dry_run);
    }
    let text = arg_str(args, "text");
    if text.is_empty() {
        return fail("x_post", "Missing text.", dry_run);
    }
    if text.chars().count() > 280 {
        return fail("x_post", "Text exceeds 280 characters.", dry_run);
    }

    // Always persist draft to workspace for audit / reuse
    if let Some(root) = ctx.workspace_root {
        let dir = root.join("files").join("social");
        let _ = fs::create_dir_all(&dir);
        let path = dir.join(format!(
            "x-draft-{}.md",
            chrono::Utc::now().format("%Y%m%d-%H%M%S")
        ));
        let body = format!(
            "# X post draft\n\n- agent: {}\n- created: {}\n\n## Text\n\n{text}\n",
            ctx.agent.name,
            chrono::Utc::now().to_rfc3339()
        );
        let _ = fs::write(&path, body);
    }

    if dry_run {
        return ok(
            "x_post",
            format!("Dry-run: drafted post ({text})."),
            serde_json::json!({ "text": text, "posted": false, "drafted": true }),
            true,
        );
    }

    // Live post when bearer token available (env or secrets)
    let token = resolve_secret(ctx, "x_bearer_token")
        .or_else(|_| resolve_secret(ctx, "X_BEARER_TOKEN"))
        .or_else(|_| {
            std::env::var("X_BEARER_TOKEN")
                .or_else(|_| std::env::var("TWITTER_BEARER_TOKEN"))
                .map_err(|e| e.to_string())
        });

    match token {
        Ok(bearer) if !bearer.trim().is_empty() => match post_to_x_api(&bearer, &text) {
            Ok(id) => ok(
                "x_post",
                format!("Posted to X (id={id})."),
                serde_json::json!({ "text": text, "posted": true, "id": id }),
                false,
            ),
            Err(e) => {
                // Draft still saved
                fail("x_post", format!("X API error (draft saved): {e}"), false)
            }
        },
        _ => ok(
            "x_post",
            "Draft saved under files/social/. Set secret x_bearer_token or env X_BEARER_TOKEN for live posts.",
            serde_json::json!({ "text": text, "posted": false, "drafted": true }),
            false,
        ),
    }
}

fn post_to_x_api(bearer: &str, text: &str) -> Result<String, String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|e| e.to_string())?;
    let response = client
        .post("https://api.x.com/2/tweets")
        .bearer_auth(bearer.trim())
        .json(&serde_json::json!({ "text": text }))
        .send()
        .map_err(|e| e.to_string())?;
    let status = response.status();
    let body: serde_json::Value = response.json().map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("HTTP {status}: {body}"));
    }
    Ok(body
        .pointer("/data/id")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown")
        .to_string())
}

pub fn secrets_get(ctx: &SkillExecContext<'_>, args: &serde_json::Value, dry_run: bool) -> SkillDispatchResult {
    let secret_id = arg_str(args, "secret_id");
    if secret_id.is_empty() {
        return fail("secrets_get", "Missing secret_id.", dry_run);
    }
    if dry_run {
        return ok(
            "secrets_get",
            format!("Dry-run: would resolve secret '{secret_id}' (value never returned to UI logs in production)."),
            serde_json::json!({ "secret_id": secret_id, "present": true }),
            true,
        );
    }
    match resolve_secret(ctx, &secret_id) {
        Ok(value) => {
            // Return a handle, not the raw secret, to avoid leaking into LLM transcripts when possible.
            // Agents that need the value for browser_fill can use secret:id syntax instead.
            let present = !value.is_empty();
            ok(
                "secrets_get",
                if present {
                    format!("Secret '{secret_id}' is available. Use secret:{secret_id} in browser_fill value.")
                } else {
                    format!("Secret '{secret_id}' is empty.")
                },
                serde_json::json!({
                    "secret_id": secret_id,
                    "present": present,
                    "ref": format!("secret:{secret_id}"),
                    // Provide value only for tool-internal chaining; skill loop may still see data —
                    // keep short and discourage logging.
                    "value": value,
                }),
                false,
            )
        }
        Err(e) => fail("secrets_get", e, false),
    }
}

/// Resolve secret from workspace secrets.json, then environment.
pub fn resolve_secret(ctx: &SkillExecContext<'_>, secret_id: &str) -> Result<String, String> {
    let id = secret_id.trim();
    if id.is_empty() {
        return Err("Empty secret id.".into());
    }

    if let Some(root) = ctx.workspace_root {
        for name in ["secrets.json", ".secrets.json", "files/secrets.json"] {
            let path = root.join(name);
            if let Ok(raw) = fs::read_to_string(&path) {
                if let Ok(map) = serde_json::from_str::<serde_json::Value>(&raw) {
                    if let Some(v) = map.get(id).and_then(|x| x.as_str()) {
                        return Ok(v.to_string());
                    }
                    // nested { "secrets": { id: ... } }
                    if let Some(v) = map
                        .get("secrets")
                        .and_then(|s| s.get(id))
                        .and_then(|x| x.as_str())
                    {
                        return Ok(v.to_string());
                    }
                }
            }
        }
    }

    // Environment: exact, SOULCORP_SECRET_<ID>, uppercased
    if let Ok(v) = std::env::var(id) {
        if !v.is_empty() {
            return Ok(v);
        }
    }
    let env_key = format!(
        "SOULCORP_SECRET_{}",
        id.to_uppercase().replace('-', "_").replace('.', "_")
    );
    if let Ok(v) = std::env::var(&env_key) {
        if !v.is_empty() {
            return Ok(v);
        }
    }
    if let Ok(v) = std::env::var(id.to_uppercase()) {
        if !v.is_empty() {
            return Ok(v);
        }
    }

    Err(format!(
        "Secret '{id}' not found. Add it to workspace secrets.json or set env {env_key}."
    ))
}

fn ok(tool: &str, message: impl Into<String>, data: serde_json::Value, dry: bool) -> SkillDispatchResult {
    SkillDispatchResult {
        tool: tool.to_string(),
        ok: true,
        message: message.into(),
        data,
        dry_run: dry,
    }
}

fn fail(tool: &str, message: impl Into<String>, dry: bool) -> SkillDispatchResult {
    SkillDispatchResult {
        tool: tool.to_string(),
        ok: false,
        message: message.into(),
        data: serde_json::Value::Null,
        dry_run: dry,
    }
}
