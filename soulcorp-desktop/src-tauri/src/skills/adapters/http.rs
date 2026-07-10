use super::super::security::SkillPolicy;
use super::super::types::SkillDispatchResult;
use std::time::Duration;

const FETCH_TIMEOUT: Duration = Duration::from_secs(12);
const MAX_FETCH_CHARS: usize = 12_000;

fn arg_str(args: &serde_json::Value, key: &str) -> String {
    args.get(key)
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string()
}

fn arg_usize(args: &serde_json::Value, key: &str, default: usize) -> usize {
    args.get(key)
        .and_then(|v| v.as_u64())
        .map(|n| n as usize)
        .unwrap_or(default)
}

pub fn web_search(args: &serde_json::Value, dry_run: bool) -> SkillDispatchResult {
    let query = arg_str(args, "query");
    if query.is_empty() {
        return SkillDispatchResult {
            tool: "web_search".into(),
            ok: false,
            message: "Missing query.".into(),
            data: serde_json::Value::Null,
            dry_run,
        };
    }
    let max_results = arg_usize(args, "max_results", 5).clamp(1, 10);
    if dry_run {
        return SkillDispatchResult {
            tool: "web_search".into(),
            ok: true,
            message: format!("Dry-run: would search for '{query}'."),
            data: serde_json::json!({ "query": query }),
            dry_run: true,
        };
    }

    match duckduckgo_instant_answer(&query) {
        Ok(mut results) => {
            results.truncate(max_results);
            SkillDispatchResult {
                tool: "web_search".into(),
                ok: true,
                message: format!("Search returned {} result(s).", results.len()),
                data: serde_json::json!({ "query": query, "results": results }),
                dry_run: false,
            }
        }
        Err(err) => SkillDispatchResult {
            tool: "web_search".into(),
            ok: false,
            message: err,
            data: serde_json::Value::Null,
            dry_run: false,
        },
    }
}

pub fn fetch_url(
    args: &serde_json::Value,
    dry_run: bool,
    policy: &SkillPolicy,
) -> SkillDispatchResult {
    let url = arg_str(args, "url");
    if url.is_empty() {
        return SkillDispatchResult {
            tool: "fetch_url".into(),
            ok: false,
            message: "Missing url.".into(),
            data: serde_json::Value::Null,
            dry_run,
        };
    }
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return SkillDispatchResult {
            tool: "fetch_url".into(),
            ok: false,
            message: "Only http/https URLs are allowed.".into(),
            data: serde_json::Value::Null,
            dry_run,
        };
    }
    // Domain firewall (mode-aware).
    if policy.require_domain_for_fetch
        || policy.domain_mode.eq_ignore_ascii_case("allowlist")
        || policy.domain_mode.eq_ignore_ascii_case("blocklist")
    {
        if let Some(host) = extract_host(&url) {
            if !policy.host_allowed(&host) {
                return SkillDispatchResult {
                    tool: "fetch_url".into(),
                    ok: false,
                    message: format!(
                        "Skills Firewall: host '{host}' blocked (domain mode={}).",
                        policy.domain_mode
                    ),
                    data: serde_json::Value::Null,
                    dry_run,
                };
            }
        } else if policy.require_domain_for_fetch {
            return SkillDispatchResult {
                tool: "fetch_url".into(),
                ok: false,
                message: "Skills Firewall: could not parse host for domain check.".into(),
                data: serde_json::Value::Null,
                dry_run,
            };
        }
    }
    let max_chars = arg_usize(args, "max_chars", MAX_FETCH_CHARS).clamp(500, 50_000);
    if dry_run {
        return SkillDispatchResult {
            tool: "fetch_url".into(),
            ok: true,
            message: format!("Dry-run: would fetch {url}."),
            data: serde_json::json!({ "url": url }),
            dry_run: true,
        };
    }

    match fetch_url_text(&url, max_chars) {
        Ok(text) => SkillDispatchResult {
            tool: "fetch_url".into(),
            ok: true,
            message: format!("Fetched {} characters from URL.", text.len()),
            data: serde_json::json!({ "url": url, "text": text }),
            dry_run: false,
        },
        Err(err) => SkillDispatchResult {
            tool: "fetch_url".into(),
            ok: false,
            message: err,
            data: serde_json::Value::Null,
            dry_run: false,
        },
    }
}

fn duckduckgo_instant_answer(query: &str) -> Result<Vec<serde_json::Value>, String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(FETCH_TIMEOUT)
        .user_agent("SoulCorpDesktop/1.0 (agent skill web-search)")
        .build()
        .map_err(|e| e.to_string())?;
    let url = format!(
        "https://api.duckduckgo.com/?q={}&format=json&no_html=1&skip_disambig=1",
        urlencoding_encode(query)
    );
    let value: serde_json::Value = client
        .get(&url)
        .send()
        .map_err(|e| format!("Search request failed: {e}"))?
        .error_for_status()
        .map_err(|e| format!("Search HTTP error: {e}"))?
        .json()
        .map_err(|e| format!("Search JSON error: {e}"))?;

    let mut results = Vec::new();
    if let Some(abs) = value.get("AbstractText").and_then(|v| v.as_str()) {
        if !abs.is_empty() {
            results.push(serde_json::json!({
                "title": value.get("Heading").and_then(|v| v.as_str()).unwrap_or("Summary"),
                "url": value.get("AbstractURL").and_then(|v| v.as_str()).unwrap_or(""),
                "snippet": abs,
            }));
        }
    }
    if let Some(related) = value.get("RelatedTopics").and_then(|v| v.as_array()) {
        for item in related {
            push_related(item, &mut results);
            if results.len() >= 10 {
                break;
            }
        }
    }
    if results.is_empty() {
        // Fallback: Wikipedia opensearch
        return wikipedia_search(query);
    }
    Ok(results)
}

fn push_related(item: &serde_json::Value, out: &mut Vec<serde_json::Value>) {
    if let Some(text) = item.get("Text").and_then(|v| v.as_str()) {
        let url = item
            .get("FirstURL")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        out.push(serde_json::json!({
            "title": text.chars().take(80).collect::<String>(),
            "url": url,
            "snippet": text,
        }));
        return;
    }
    if let Some(topics) = item.get("Topics").and_then(|v| v.as_array()) {
        for t in topics {
            push_related(t, out);
        }
    }
}

fn wikipedia_search(query: &str) -> Result<Vec<serde_json::Value>, String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(FETCH_TIMEOUT)
        .user_agent("SoulCorpDesktop/1.0 (agent skill web-search)")
        .build()
        .map_err(|e| e.to_string())?;
    let url = format!(
        "https://en.wikipedia.org/w/api.php?action=opensearch&search={}&limit=5&namespace=0&format=json",
        urlencoding_encode(query)
    );
    let value: serde_json::Value = client
        .get(&url)
        .send()
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .json()
        .map_err(|e| e.to_string())?;
    let titles = value
        .get(1)
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    let descs = value
        .get(2)
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    let urls = value
        .get(3)
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    let mut results = Vec::new();
    for i in 0..titles.len() {
        results.push(serde_json::json!({
            "title": titles.get(i).and_then(|v| v.as_str()).unwrap_or(""),
            "snippet": descs.get(i).and_then(|v| v.as_str()).unwrap_or(""),
            "url": urls.get(i).and_then(|v| v.as_str()).unwrap_or(""),
        }));
    }
    if results.is_empty() {
        return Err("No search results found.".into());
    }
    Ok(results)
}

fn fetch_url_text(url: &str, max_chars: usize) -> Result<String, String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(FETCH_TIMEOUT)
        .user_agent("SoulCorpDesktop/1.0 (agent skill fetch_url)")
        .redirect(reqwest::redirect::Policy::limited(5))
        .build()
        .map_err(|e| e.to_string())?;
    let response = client
        .get(url)
        .send()
        .map_err(|e| format!("Fetch failed: {e}"))?
        .error_for_status()
        .map_err(|e| format!("HTTP error: {e}"))?;
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();
    let bytes = response
        .bytes()
        .map_err(|e| e.to_string())?
        .to_vec();
    if bytes.len() > 2 * 1024 * 1024 {
        return Err("Response exceeds 2MB limit.".into());
    }
    let raw = String::from_utf8_lossy(&bytes);
    let text = if content_type.contains("html") {
        strip_html(&raw)
    } else {
        raw.to_string()
    };
    let collapsed = text.split_whitespace().collect::<Vec<_>>().join(" ");
    Ok(collapsed.chars().take(max_chars).collect())
}

fn strip_html(html: &str) -> String {
    let mut out = String::with_capacity(html.len() / 2);
    let mut in_tag = false;
    let mut in_script = false;
    let lower = html.to_lowercase();
    // crude script/style strip
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
            // skip until >
            while i < bytes.len() && bytes[i] != b'>' {
                i += 1;
            }
            i += 1;
            continue;
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

fn urlencoding_encode(s: &str) -> String {
    let mut out = String::new();
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char)
            }
            b' ' => out.push_str("%20"),
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
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
