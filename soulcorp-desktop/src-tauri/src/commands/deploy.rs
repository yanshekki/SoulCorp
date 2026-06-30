use crate::commands::export::{
    deploy_staging_dir, prepare_static_site_bundle, write_static_site_to_dir,
};
use crate::db::persistence::commit;
use crate::report::{company_name_for, slugify};
use crate::state::AppState;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::Command;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeployStatus {
    pub git_available: bool,
    pub git_version: Option<String>,
    pub gh_available: bool,
    pub gh_version: Option<String>,
    pub gh_authenticated: bool,
    pub npx_available: bool,
    pub vercel_cli_available: bool,
    pub vercel_version: Option<String>,
    pub netlify_cli_available: bool,
    pub message: String,
    pub last_deploy_url: Option<String>,
    pub last_deploy_at: Option<String>,
    pub last_deploy_provider: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeployResult {
    pub url: Option<String>,
    pub path: String,
    pub format: String,
    pub message: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct PushGithubRequest {
    pub repo_url: Option<String>,
    pub repo_name: Option<String>,
    #[serde(default)]
    pub private_repo: bool,
}

fn command_output(cmd: &str, args: &[&str], cwd: Option<&PathBuf>) -> Result<String, String> {
    let mut command = Command::new(cmd);
    command.args(args);
    if let Some(dir) = cwd {
        command.current_dir(dir);
    }
    let output = command.output().map_err(|e| format!("Failed to run {cmd}: {e}"))?;
    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        if stdout.is_empty() {
            Ok(stderr)
        } else {
            Ok(stdout)
        }
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        Err(if stderr.is_empty() { stdout } else { stderr })
    }
}

fn command_available(cmd: &str, args: &[&str]) -> (bool, Option<String>) {
    match Command::new(cmd).args(args).output() {
        Ok(output) if output.status.success() => {
            let version = String::from_utf8_lossy(&output.stdout)
                .trim()
                .lines()
                .next()
                .unwrap_or_default()
                .to_string();
            (true, Some(version))
        }
        _ => (false, None),
    }
}

fn gh_authenticated() -> bool {
    Command::new("gh")
        .args(["auth", "status"])
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false)
}

fn extract_url_from_output(output: &str) -> Option<String> {
    output
        .lines()
        .find_map(|line| {
            let trimmed = line.trim();
            if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
                Some(trimmed.to_string())
            } else if trimmed.contains("https://") {
                trimmed
                    .split_whitespace()
                    .find(|token| token.starts_with("https://"))
                    .map(|token| token.trim_matches(|c| c == ')' || c == ']').to_string())
            } else {
                None
            }
        })
}

fn stage_static_site(app: &AppHandle, state: &AppState) -> Result<PathBuf, String> {
    let staging_dir = deploy_staging_dir(app)?;
    let app_data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let pages_dir = app_data.join("workspaces/pages");
    let archive_name = format!(
        "soulcorp-static-site-{}",
        Utc::now().format("%Y%m%d-%H%M%S")
    );
    let (bundle, tree) = prepare_static_site_bundle(app, state, &archive_name)?;
    write_static_site_to_dir(&staging_dir, &bundle, &tree, &pages_dir)?;
    Ok(staging_dir)
}

fn run_git_publish(
    staging_dir: &PathBuf,
    repo_url: Option<String>,
    repo_name: Option<String>,
    private_repo: bool,
    company_name: &str,
) -> Result<DeployResult, String> {
    command_output("git", &["init"], Some(staging_dir))?;
    command_output("git", &["add", "."], Some(staging_dir))?;
    command_output(
        "git",
        &[
            "-c",
            "user.email=soulcorp@local",
            "-c",
            "user.name=SoulCorp",
            "commit",
            "-m",
            &format!("SoulCorp static site export for {company_name}"),
        ],
        Some(staging_dir),
    )?;
    command_output("git", &["branch", "-M", "main"], Some(staging_dir))?;

    let url = if let Some(repo_url) = repo_url.filter(|value| !value.trim().is_empty()) {
        let remote = repo_url.trim().to_string();
        command_output("git", &["remote", "add", "origin", &remote], Some(staging_dir))?;
        command_output("git", &["push", "-u", "origin", "main"], Some(staging_dir))?;
        Some(remote)
    } else {
        let default_name = slugify(company_name);
        let name = repo_name
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| default_name.clone());
        let visibility = if private_repo { "--private" } else { "--public" };
        let output = command_output(
            "gh",
            &[
                "repo",
                "create",
                &name,
                visibility,
                "--source=.",
                "--remote=origin",
                "--push",
            ],
            Some(staging_dir),
        )?;
        extract_url_from_output(&output).or(Some(format!("https://github.com/{name}")))
    };

    Ok(DeployResult {
        url,
        path: staging_dir.to_string_lossy().to_string(),
        format: "github".to_string(),
        message: "Static site pushed to GitHub.".to_string(),
    })
}

fn record_deploy(state: &mut AppState, result: &DeployResult, provider: &str) {
    state.last_deploy_url = result.url.clone();
    state.last_deploy_at = Some(Utc::now().to_rfc3339());
    state.last_deploy_provider = Some(provider.to_string());
}

fn run_netlify_publish(staging_dir: &PathBuf) -> Result<DeployResult, String> {
    let output = command_output(
        "npx",
        &["netlify", "deploy", "--prod", "--dir", "."],
        Some(staging_dir),
    )?;
    let url = extract_url_from_output(&output);
    Ok(DeployResult {
        url: url.clone(),
        path: staging_dir.to_string_lossy().to_string(),
        format: "netlify".to_string(),
        message: match url {
            Some(deployed) => format!("Static site deployed to Netlify: {deployed}"),
            None => "Static site deployed to Netlify.".to_string(),
        },
    })
}

fn run_vercel_publish(staging_dir: &PathBuf) -> Result<DeployResult, String> {
    let output = command_output(
        "npx",
        &["vercel", "deploy", "--prod", "--yes"],
        Some(staging_dir),
    )?;
    let url = extract_url_from_output(&output);
    Ok(DeployResult {
        url: url.clone(),
        path: staging_dir.to_string_lossy().to_string(),
        format: "vercel".to_string(),
        message: match url {
            Some(deployed) => format!("Static site deployed to Vercel: {deployed}"),
            None => "Static site deployed to Vercel.".to_string(),
        },
    })
}

#[tauri::command]
pub fn get_deploy_status(state: State<'_, Mutex<AppState>>) -> Result<DeployStatus, String> {
    let locked = state.lock().map_err(|e| e.to_string())?;
    let (git_available, git_version) = command_available("git", &["--version"]);
    let (gh_available, gh_version) = command_available("gh", &["--version"]);
    let gh_authenticated = gh_available && gh_authenticated();
    let (npx_available, _) = command_available("npx", &["--version"]);
    let (vercel_cli_available, vercel_version) = if npx_available {
        command_available("npx", &["vercel", "--version"])
    } else {
        (false, None)
    };
    let (netlify_cli_available, _) = if npx_available {
        command_available("npx", &["netlify", "--version"])
    } else {
        (false, None)
    };

    let message = if git_available && gh_available && gh_authenticated && vercel_cli_available {
        "GitHub and Vercel tooling ready for one-click deploy.".to_string()
    } else if git_available && vercel_cli_available {
        "Git and Vercel ready. Install and authenticate GitHub CLI (gh) for one-click repo creation."
            .to_string()
    } else {
        "Install git, GitHub CLI (gh), and Node.js/npx with Vercel CLI for one-click deploy."
            .to_string()
    };

    Ok(DeployStatus {
        git_available,
        git_version,
        gh_available,
        gh_version,
        gh_authenticated,
        npx_available,
        vercel_cli_available,
        vercel_version,
        netlify_cli_available,
        message,
        last_deploy_url: locked.last_deploy_url.clone(),
        last_deploy_at: locked.last_deploy_at.clone(),
        last_deploy_provider: locked.last_deploy_provider.clone(),
    })
}

#[tauri::command]
pub async fn push_static_site_to_github(
    app: AppHandle,
    state: State<'_, Mutex<AppState>>,
    request: PushGithubRequest,
) -> Result<DeployResult, String> {
    let (staging_dir, company_name) = {
        let locked = state.lock().map_err(|e| e.to_string())?;
        let staging_dir = stage_static_site(&app, &locked)?;
        (staging_dir, company_name_for(&locked))
    };

    let repo_url = request.repo_url.clone();
    let repo_name = request.repo_name.clone();
    let private_repo = request.private_repo;
    let result = tokio::task::spawn_blocking(move || {
        run_git_publish(
            &staging_dir,
            repo_url,
            repo_name,
            private_repo,
            &company_name,
        )
    })
    .await
    .map_err(|e| e.to_string())??;

    let mut locked = state.lock().map_err(|e| e.to_string())?;
    record_deploy(&mut locked, &result, "github");
    locked.stats.exports_created += 1;
    commit(app, &locked)?;
    Ok(result)
}

#[tauri::command]
pub async fn push_static_site_to_vercel(
    app: AppHandle,
    state: State<'_, Mutex<AppState>>,
) -> Result<DeployResult, String> {
    let staging_dir = {
        let locked = state.lock().map_err(|e| e.to_string())?;
        stage_static_site(&app, &locked)?
    };

    let result = tokio::task::spawn_blocking(move || run_vercel_publish(&staging_dir))
        .await
        .map_err(|e| e.to_string())??;

    let mut locked = state.lock().map_err(|e| e.to_string())?;
    record_deploy(&mut locked, &result, "vercel");
    locked.stats.exports_created += 1;
    commit(app, &locked)?;
    Ok(result)
}

#[tauri::command]
pub async fn push_static_site_to_netlify(
    app: AppHandle,
    state: State<'_, Mutex<AppState>>,
) -> Result<DeployResult, String> {
    let staging_dir = {
        let locked = state.lock().map_err(|e| e.to_string())?;
        stage_static_site(&app, &locked)?
    };

    let result = tokio::task::spawn_blocking(move || run_netlify_publish(&staging_dir))
        .await
        .map_err(|e| e.to_string())??;

    let mut locked = state.lock().map_err(|e| e.to_string())?;
    record_deploy(&mut locked, &result, "netlify");
    locked.stats.exports_created += 1;
    commit(app, &locked)?;
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extract_url_finds_https_line() {
        let output = "Deploy complete\nhttps://soulcorp-demo.netlify.app\nDone";
        assert_eq!(
            extract_url_from_output(output),
            Some("https://soulcorp-demo.netlify.app".to_string())
        );
    }
}