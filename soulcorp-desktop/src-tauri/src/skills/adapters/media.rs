use super::SkillExecContext;
use super::super::security::SkillPolicy;
use super::super::types::SkillDispatchResult;
use crate::workspace::agent_service::{AgentContext, AgentWorkspaceService};
use crate::workspace::WorkspaceStorage;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::Duration;
use uuid::Uuid;

fn arg_str(args: &serde_json::Value, key: &str) -> String {
    args.get(key)
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string()
}

fn media_dir(ctx: &SkillExecContext<'_>, sub: &str) -> Result<PathBuf, String> {
    let root = ctx
        .workspace_root
        .ok_or_else(|| "Workspace root required for media skills.".to_string())?;
    let dir = root.join("files").join("media").join(sub);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn journal_note(ctx: &SkillExecContext<'_>, title: &str, body: &str) {
    let Some(root) = ctx.workspace_root else {
        return;
    };
    if let Ok(storage) = WorkspaceStorage::new(root.to_path_buf()) {
        let _ = storage.ensure_seed();
        let service = AgentWorkspaceService::new(&storage);
        let agent_ctx = AgentContext::from_record(ctx.agent);
        let lines: Vec<String> = body.lines().map(|l| l.to_string()).collect();
        let _ = service.append_journal(&agent_ctx, title, "Media skill", &lines);
    }
}

pub fn generate_or_edit_image(
    ctx: &SkillExecContext<'_>,
    tool: &str,
    args: &serde_json::Value,
    dry_run: bool,
) -> SkillDispatchResult {
    let prompt = arg_str(args, "prompt");
    if prompt.is_empty() {
        return fail(tool, "Missing prompt.", dry_run);
    }
    if dry_run {
        return ok(
            tool,
            format!("Dry-run: would generate/edit image for prompt ({prompt})."),
            serde_json::json!({ "prompt": prompt }),
            true,
        );
    }

    let dir = match media_dir(ctx, "images") {
        Ok(d) => d,
        Err(e) => return fail(tool, e, false),
    };
    let id = Uuid::new_v4().to_string();

    // 1) OpenAI Images API when key present
    if let Some((base, key)) = openai_image_creds(ctx) {
        match openai_generate_image(&base, &key, &prompt, &dir, &id) {
            Ok(path) => {
                journal_note(
                    ctx,
                    &format!("Image — {id}"),
                    &format!("Generated via OpenAI Images API.\n\nPrompt: {prompt}\n\nFile: {}", path.display()),
                );
                return ok(
                    tool,
                    format!("Generated image at {}.", path.display()),
                    serde_json::json!({
                        "path": path.display().to_string(),
                        "prompt": prompt,
                        "status": "generated",
                        "provider": "openai_images",
                    }),
                    false,
                );
            }
            Err(e) => {
                // fall through to local SVG with note
                let _ = e;
            }
        }
    }

    // 2) Local useful SVG (always works offline)
    let svg_path = dir.join(format!("{id}.svg"));
    let svg = render_prompt_svg(&prompt, tool);
    if let Err(e) = fs::write(&svg_path, &svg) {
        return fail(tool, e.to_string(), false);
    }
    let md_path = dir.join(format!("{id}.prompt.md"));
    let _ = fs::write(
        &md_path,
        format!(
            "# Image asset\n\n- tool: {tool}\n- agent: {}\n- file: {}\n\n## Prompt\n\n{prompt}\n\nTip: set OpenAI API key in Settings for DALL·E generation.\n",
            ctx.agent.name,
            svg_path.display()
        ),
    );
    journal_note(
        ctx,
        &format!("Image SVG — {id}"),
        &format!("Local SVG placeholder with prompt branding.\n\n{}", svg_path.display()),
    );
    ok(
        tool,
        format!("Created image asset at {} (SVG). Add OpenAI key for photoreal generation.", svg_path.display()),
        serde_json::json!({
            "path": svg_path.display().to_string(),
            "prompt_path": md_path.display().to_string(),
            "prompt": prompt,
            "status": "svg_generated",
            "provider": "local_svg",
        }),
        false,
    )
}

fn openai_image_creds(ctx: &SkillExecContext<'_>) -> Option<(String, String)> {
    let key = ctx.state.settings.openai_api_key.trim();
    if key.is_empty() {
        return None;
    }
    let base = ctx.state.settings.openai_base_url.trim();
    let base = if base.is_empty() {
        "https://api.openai.com/v1".to_string()
    } else {
        base.trim_end_matches('/').to_string()
    };
    Some((base, key.to_string()))
}

fn openai_generate_image(
    base: &str,
    key: &str,
    prompt: &str,
    dir: &Path,
    id: &str,
) -> Result<PathBuf, String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(90))
        .build()
        .map_err(|e| e.to_string())?;
    let url = format!("{base}/images/generations");
    let response = client
        .post(&url)
        .bearer_auth(key)
        .json(&serde_json::json!({
            "model": "dall-e-3",
            "prompt": prompt,
            "n": 1,
            "size": "1024x1024",
            "response_format": "url"
        }))
        .send()
        .map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().unwrap_or_default();
        return Err(format!("Images API {status}: {body}"));
    }
    let body: serde_json::Value = response.json().map_err(|e| e.to_string())?;
    let image_url = body
        .pointer("/data/0/url")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "Images API response missing url".to_string())?;

    let bytes = client
        .get(image_url)
        .send()
        .map_err(|e| e.to_string())?
        .bytes()
        .map_err(|e| e.to_string())?;
    let path = dir.join(format!("{id}.png"));
    fs::write(&path, &bytes).map_err(|e| e.to_string())?;
    Ok(path)
}

fn render_prompt_svg(prompt: &str, tool: &str) -> String {
    let escaped = prompt
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;");
    let short: String = escaped.chars().take(180).collect();
    let lines = wrap_text(&short, 42);
    let mut text_nodes = String::new();
    for (i, line) in lines.iter().enumerate() {
        let y = 200 + i as i32 * 28;
        text_nodes.push_str(&format!(
            "<text x=\"48\" y=\"{y}\" fill=\"#eef1f7\" font-family=\"sans-serif\" font-size=\"22\">{line}</text>\n"
        ));
    }
    format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n\
<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"1024\" height=\"1024\" viewBox=\"0 0 1024 1024\">\n\
  <defs>\n\
    <linearGradient id=\"g\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\">\n\
      <stop offset=\"0%\" stop-color=\"#12151c\"/>\n\
      <stop offset=\"100%\" stop-color=\"#1f2430\"/>\n\
    </linearGradient>\n\
  </defs>\n\
  <rect width=\"1024\" height=\"1024\" fill=\"url(#g)\"/>\n\
  <rect x=\"32\" y=\"32\" width=\"960\" height=\"960\" rx=\"24\" fill=\"none\" stroke=\"#d9a441\" stroke-opacity=\"0.45\" stroke-width=\"2\"/>\n\
  <text x=\"48\" y=\"90\" fill=\"#d9a441\" font-family=\"sans-serif\" font-size=\"28\" font-weight=\"700\">SoulCorp · {tool}</text>\n\
  <text x=\"48\" y=\"140\" fill=\"#6b758c\" font-family=\"sans-serif\" font-size=\"16\">Local image asset (set OpenAI key for DALL-E)</text>\n\
  {text_nodes}\
</svg>\n"
    )
}

fn wrap_text(s: &str, width: usize) -> Vec<String> {
    let mut lines = Vec::new();
    let mut current = String::new();
    for word in s.split_whitespace() {
        if current.is_empty() {
            current = word.to_string();
        } else if current.len() + 1 + word.len() <= width {
            current.push(' ');
            current.push_str(word);
        } else {
            lines.push(current);
            current = word.to_string();
        }
        if lines.len() >= 8 {
            break;
        }
    }
    if !current.is_empty() && lines.len() < 8 {
        lines.push(current);
    }
    lines
}

pub fn generate_audio(
    ctx: &SkillExecContext<'_>,
    args: &serde_json::Value,
    dry_run: bool,
) -> SkillDispatchResult {
    let text = arg_str(args, "text");
    if text.is_empty() {
        return fail("generate_audio", "Missing text.", dry_run);
    }
    if dry_run {
        return ok(
            "generate_audio",
            "Dry-run: would synthesize audio.".to_string(),
            serde_json::json!({ "text": text }),
            true,
        );
    }
    let dir = match media_dir(ctx, "audio") {
        Ok(d) => d,
        Err(e) => return fail("generate_audio", e, false),
    };
    let id = Uuid::new_v4().to_string();
    let voice = arg_str(args, "voice");

    // Try local TTS CLIs
    let wav_path = dir.join(format!("{id}.wav"));
    if try_espeak(&text, &voice, &wav_path) || try_pico2wave(&text, &wav_path) {
        journal_note(
            ctx,
            &format!("Audio — {id}"),
            &format!("TTS wav: {}\n\nScript:\n{text}", wav_path.display()),
        );
        return ok(
            "generate_audio",
            format!("Synthesized audio at {}.", wav_path.display()),
            serde_json::json!({
                "path": wav_path.display().to_string(),
                "status": "synthesized",
                "provider": "local_tts",
            }),
            false,
        );
    }

    // Script + SSML-ish file still useful for downstream tools
    let script_path = dir.join(format!("{id}.script.md"));
    let body = format!(
        "# Audio / TTS\n\n- agent: {}\n- voice: {voice}\n- status: script_only (install espeak-ng or pico2wave for wav)\n\n## Script\n\n{text}\n",
        ctx.agent.name
    );
    if let Err(e) = fs::write(&script_path, &body) {
        return fail("generate_audio", e.to_string(), false);
    }
    journal_note(ctx, &format!("Audio script — {id}"), &body);
    ok(
        "generate_audio",
        format!(
            "Saved TTS script to {}. Install espeak-ng for local wav synthesis.",
            script_path.display()
        ),
        serde_json::json!({
            "path": script_path.display().to_string(),
            "status": "script_saved",
            "provider": "script",
        }),
        false,
    )
}

fn try_espeak(text: &str, voice: &str, out: &Path) -> bool {
    for bin in ["espeak-ng", "espeak"] {
        let mut cmd = Command::new(bin);
        cmd.arg("-w").arg(out);
        if !voice.is_empty() {
            cmd.arg("-v").arg(voice);
        }
        cmd.arg(text)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        if let Ok(status) = cmd.status() {
            if status.success() && out.is_file() {
                return true;
            }
        }
    }
    false
}

fn try_pico2wave(text: &str, out: &Path) -> bool {
    let status = Command::new("pico2wave")
        .arg("-w")
        .arg(out)
        .arg(text)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();
    matches!(status, Ok(s) if s.success() && out.is_file())
}

pub fn generate_video(
    ctx: &SkillExecContext<'_>,
    args: &serde_json::Value,
    dry_run: bool,
) -> SkillDispatchResult {
    let prompt = arg_str(args, "prompt");
    if prompt.is_empty() {
        return fail("generate_video", "Missing prompt.", dry_run);
    }
    if dry_run {
        return ok(
            "generate_video",
            "Dry-run: would enqueue video job.".to_string(),
            serde_json::json!({ "prompt": prompt }),
            true,
        );
    }
    let dir = match media_dir(ctx, "video") {
        Ok(d) => d,
        Err(e) => return fail("generate_video", e, false),
    };
    let job_id = Uuid::new_v4().to_string();
    let path = dir.join(format!("{job_id}.job.json"));
    let storyboard = dir.join(format!("{job_id}.storyboard.md"));
    let duration = args
        .get("duration_secs")
        .and_then(|v| v.as_u64())
        .unwrap_or(6)
        .clamp(2, 30);

    let job = serde_json::json!({
        "job_id": job_id,
        "status": "storyboard_ready",
        "prompt": prompt,
        "duration_secs": duration,
        "agent": ctx.agent.name,
        "created_at": chrono::Utc::now().to_rfc3339(),
        "storyboard_path": storyboard.display().to_string(),
        "note": "Storyboard written. Wire a video provider or render offline from this brief.",
    });
    if let Err(e) = fs::write(&path, serde_json::to_string_pretty(&job).unwrap_or_default()) {
        return fail("generate_video", e.to_string(), false);
    }
    let board = format!(
        "# Video storyboard — {job_id}\n\n**Duration:** {duration}s\n\n## Prompt\n\n{prompt}\n\n## Beats\n\n1. Hook (0–20%)\n2. Core visual (20–70%)\n3. CTA / brand (70–100%)\n\n## Shot list\n\n- Wide establishing\n- Detail insert\n- End card\n"
    );
    let _ = fs::write(&storyboard, &board);
    journal_note(ctx, &format!("Video job — {job_id}"), &board);
    ok(
        "generate_video",
        format!("Created video job {job_id} with storyboard."),
        job,
        false,
    )
}

pub fn video_job_status(
    ctx: &SkillExecContext<'_>,
    args: &serde_json::Value,
    dry_run: bool,
) -> SkillDispatchResult {
    let job_id = arg_str(args, "job_id");
    if job_id.is_empty() {
        return fail("video_job_status", "Missing job_id.", dry_run);
    }
    if dry_run {
        return ok(
            "video_job_status",
            format!("Dry-run: would check job {job_id}."),
            serde_json::json!({ "job_id": job_id }),
            true,
        );
    }
    let Some(root) = ctx.workspace_root else {
        return fail("video_job_status", "Workspace root required.", false);
    };
    let path = root
        .join("files")
        .join("media")
        .join("video")
        .join(format!("{job_id}.job.json"));
    match fs::read_to_string(&path) {
        Ok(raw) => match serde_json::from_str::<serde_json::Value>(&raw) {
            Ok(job) => ok(
                "video_job_status",
                format!(
                    "Job {job_id} status: {}.",
                    job.get("status").and_then(|v| v.as_str()).unwrap_or("unknown")
                ),
                job,
                false,
            ),
            Err(e) => fail("video_job_status", e.to_string(), false),
        },
        Err(_) => fail(
            "video_job_status",
            format!("Job file not found: {}", path.display()),
            false,
        ),
    }
}

pub fn transcribe(
    ctx: &SkillExecContext<'_>,
    args: &serde_json::Value,
    dry_run: bool,
) -> SkillDispatchResult {
    let file_path = arg_str(args, "file_path");
    if file_path.is_empty() {
        return fail("transcribe", "Missing file_path.", dry_run);
    }
    if dry_run {
        return ok(
            "transcribe",
            format!("Dry-run: would transcribe {file_path}."),
            serde_json::json!({ "file_path": file_path }),
            true,
        );
    }

    let resolved = resolve_media_path(ctx, &file_path);
    if !resolved.is_file() {
        return fail(
            "transcribe",
            format!("File not found: {}", resolved.display()),
            false,
        );
    }

    // Subtitle / text files: just read
    if let Some(ext) = resolved.extension().and_then(|e| e.to_str()) {
        if matches!(ext.to_lowercase().as_str(), "txt" | "md" | "vtt" | "srt") {
            match fs::read_to_string(&resolved) {
                Ok(text) => {
                    let clipped: String = text.chars().take(12_000).collect();
                    journal_note(ctx, &format!("Transcript — {}", resolved.display()), &clipped);
                    return ok(
                        "transcribe",
                        "Read existing text/subtitle file as transcript.",
                        serde_json::json!({
                            "file_path": resolved.display().to_string(),
                            "text": clipped,
                            "provider": "plaintext",
                        }),
                        false,
                    );
                }
                Err(e) => return fail("transcribe", e.to_string(), false),
            }
        }
    }

    // whisper CLI
    if let Some(text) = try_whisper(&resolved) {
        journal_note(ctx, &format!("Transcript — {}", resolved.display()), &text);
        let out_dir = media_dir(ctx, "transcripts").ok();
        if let Some(dir) = out_dir {
            let out = dir.join(format!(
                "{}.txt",
                resolved.file_stem().and_then(|s| s.to_str()).unwrap_or("transcript")
            ));
            let _ = fs::write(&out, &text);
            return ok(
                "transcribe",
                format!("Transcribed with whisper → {}.", out.display()),
                serde_json::json!({
                    "file_path": resolved.display().to_string(),
                    "transcript_path": out.display().to_string(),
                    "text": text.chars().take(8000).collect::<String>(),
                    "provider": "whisper_cli",
                }),
                false,
            );
        }
        return ok(
            "transcribe",
            "Transcribed with whisper.",
            serde_json::json!({
                "file_path": resolved.display().to_string(),
                "text": text.chars().take(8000).collect::<String>(),
                "provider": "whisper_cli",
            }),
            false,
        );
    }

    // Metadata fallback still useful
    let meta = resolved.metadata().ok();
    let note = format!(
        "# Transcription\n\nSource: `{}`\nSize: {} bytes\n\nInstall OpenAI Whisper CLI (`whisper`) for automatic speech-to-text.\n",
        resolved.display(),
        meta.map(|m| m.len()).unwrap_or(0)
    );
    journal_note(ctx, &format!("Transcript pending — {}", resolved.display()), &note);
    fail(
        "transcribe",
        format!(
            "No STT provider available for {}. Install `whisper` CLI, or pass a .txt/.srt/.vtt file.",
            resolved.display()
        ),
        false,
    )
}

fn resolve_media_path(ctx: &SkillExecContext<'_>, file_path: &str) -> PathBuf {
    let p = PathBuf::from(file_path);
    if p.is_absolute() {
        return p;
    }
    if let Some(root) = ctx.workspace_root {
        let candidate = root.join(file_path);
        if candidate.exists() {
            return candidate;
        }
        let under_files = root.join("files").join(file_path);
        if under_files.exists() {
            return under_files;
        }
        let under_media = root.join("files").join("media").join(file_path);
        if under_media.exists() {
            return under_media;
        }
        return candidate;
    }
    p
}

fn try_whisper(path: &Path) -> Option<String> {
    let out_dir = path.parent()?;
    // openai-whisper: whisper file --output_dir DIR --output_format txt
    let status = Command::new("whisper")
        .arg(path)
        .arg("--output_dir")
        .arg(out_dir)
        .arg("--output_format")
        .arg("txt")
        .arg("--fp16")
        .arg("False")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .ok()?;
    if !status.success() {
        return None;
    }
    let stem = path.file_stem()?.to_str()?;
    let txt = out_dir.join(format!("{stem}.txt"));
    fs::read_to_string(txt).ok()
}

pub fn render_mermaid(
    ctx: &SkillExecContext<'_>,
    args: &serde_json::Value,
    dry_run: bool,
) -> SkillDispatchResult {
    let source = arg_str(args, "source");
    if source.is_empty() {
        return fail("render_mermaid", "Missing source.", dry_run);
    }
    if dry_run {
        return ok(
            "render_mermaid",
            "Dry-run: would render mermaid diagram.".to_string(),
            serde_json::json!({ "source": source }),
            true,
        );
    }
    let dir = match media_dir(ctx, "diagrams") {
        Ok(d) => d,
        Err(e) => return fail("render_mermaid", e, false),
    };
    let id = Uuid::new_v4().to_string();
    let mmd_path = dir.join(format!("{id}.mmd"));
    let html_path = dir.join(format!("{id}.html"));
    if let Err(e) = fs::write(&mmd_path, &source) {
        return fail("render_mermaid", e.to_string(), false);
    }

    let html = format!(
        r#"<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>Diagram {id}</title>
  <script type="module">
    import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs";
    mermaid.initialize({{ startOnLoad: true, theme: "dark" }});
  </script>
  <style>
    body {{ margin: 0; background: #0a0c10; color: #eef1f7; font-family: system-ui, sans-serif; }}
    main {{ padding: 24px; }}
    pre.mermaid {{ background: #12151c; border-radius: 12px; padding: 24px; }}
  </style>
</head>
<body>
  <main>
    <h1>Diagram {id}</h1>
    <pre class="mermaid">
{source}
    </pre>
  </main>
</body>
</html>
"#
    );
    if let Err(e) = fs::write(&html_path, &html) {
        return fail("render_mermaid", e.to_string(), false);
    }

    // Optional: mmdc if installed
    let mut png_path: Option<PathBuf> = None;
    let try_png = dir.join(format!("{id}.png"));
    if Command::new("mmdc")
        .arg("-i")
        .arg(&mmd_path)
        .arg("-o")
        .arg(&try_png)
        .arg("-b")
        .arg("transparent")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
        && try_png.is_file()
    {
        png_path = Some(try_png);
    }

    let md = format!(
        "```mermaid\n{source}\n```\n\nHTML: `{}`\n",
        html_path.display()
    );
    journal_note(ctx, &format!("Diagram — {id}"), &md);
    ok(
        "render_mermaid",
        format!(
            "Saved mermaid source + interactive HTML{}.",
            if png_path.is_some() { " + PNG" } else { "" }
        ),
        serde_json::json!({
            "path": mmd_path.display().to_string(),
            "html_path": html_path.display().to_string(),
            "png_path": png_path.map(|p| p.display().to_string()),
            "markdown": md,
        }),
        false,
    )
}

pub fn run_python_sandbox(
    args: &serde_json::Value,
    dry_run: bool,
    policy: &SkillPolicy,
) -> SkillDispatchResult {
    if !policy.allow_high_risk {
        return fail(
            "run_python",
            "code-sandbox requires high-risk skills enabled in Safety policy.",
            dry_run,
        );
    }
    let code = arg_str(args, "code");
    if code.is_empty() {
        return fail("run_python", "Missing code.", dry_run);
    }
    // Basic deny list for obviously dangerous patterns
    let lower = code.to_lowercase();
    for banned in [
        "import socket",
        "import subprocess",
        "import ctypes",
        "__import__('os')",
        "os.system",
        "shutil.rmtree",
        "pathlib.Path('/')",
        "open('/",
        "eval(",
        "exec(",
    ] {
        if lower.contains(banned) {
            return fail(
                "run_python",
                format!("Code blocked by sandbox policy (contains '{banned}')."),
                dry_run,
            );
        }
    }
    if dry_run {
        return ok(
            "run_python",
            "Dry-run: would execute restricted Python.".to_string(),
            serde_json::json!({ "code": code }),
            true,
        );
    }
    let timeout = args
        .get("timeout_secs")
        .and_then(|v| v.as_u64())
        .unwrap_or(5)
        .clamp(1, 30);

    let mut cmd = if Command::new("timeout").arg("--version").output().is_ok() {
        let mut c = Command::new("timeout");
        c.arg(format!("{timeout}s")).arg("python3").arg("-c").arg(&code);
        c
    } else {
        let mut c = Command::new("python3");
        c.arg("-c").arg(&code);
        c
    };
    cmd.stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .env_clear()
        .env("PATH", "/usr/bin:/bin")
        .env("HOME", "/tmp")
        .env("PYTHONDONTWRITEBYTECODE", "1")
        .env("PYTHONSAFEPATH", "1");
    match cmd.output() {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout)
                .chars()
                .take(8000)
                .collect::<String>();
            let stderr = String::from_utf8_lossy(&output.stderr)
                .chars()
                .take(4000)
                .collect::<String>();
            ok(
                "run_python",
                format!("Python exited with code {:?}.", output.status.code()),
                serde_json::json!({
                    "stdout": stdout,
                    "stderr": stderr,
                    "exit_code": output.status.code(),
                }),
                false,
            )
        }
        Err(e) => fail("run_python", format!("Failed to spawn python3: {e}"), false),
    }
}

fn ok(tool: &str, message: impl AsRef<str>, data: serde_json::Value, dry: bool) -> SkillDispatchResult {
    SkillDispatchResult {
        tool: tool.to_string(),
        ok: true,
        message: message.as_ref().to_string(),
        data,
        dry_run: dry,
    }
}

fn fail(tool: &str, message: impl AsRef<str>, dry: bool) -> SkillDispatchResult {
    SkillDispatchResult {
        tool: tool.to_string(),
        ok: false,
        message: message.as_ref().to_string(),
        data: serde_json::Value::Null,
        dry_run: dry,
    }
}
