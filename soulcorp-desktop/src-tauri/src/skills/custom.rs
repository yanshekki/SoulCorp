//! Company + global custom skill packs on disk.

use super::catalog::parse_skill_md;
use super::types::{SkillPack, SkillSource};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SkillScope {
    Company,
    Global,
}

impl SkillScope {
    pub fn parse(raw: &str) -> Option<Self> {
        match raw.trim().to_lowercase().as_str() {
            "company" => Some(Self::Company),
            "global" => Some(Self::Global),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CustomSkillSummary {
    pub id: String,
    pub name: String,
    pub scope: SkillScope,
    pub runtime: Option<String>,
    pub entry: Option<String>,
    pub path: String,
    pub risk: String,
}

pub fn global_skills_root(app_data: &Path) -> PathBuf {
    app_data.join("skills")
}

pub fn company_skills_root(workspace_root: &Path) -> PathBuf {
    workspace_root.join("skills")
}

pub fn scripts_dir(workspace_root: &Path) -> PathBuf {
    workspace_root.join("skills").join("scripts")
}

pub fn pack_dir(app_data: &Path, workspace: Option<&Path>, scope: SkillScope, id: &str) -> PathBuf {
    match scope {
        SkillScope::Global => global_skills_root(app_data).join(id),
        SkillScope::Company => {
            let ws = workspace.expect("company scope needs workspace");
            company_skills_root(ws).join(id)
        }
    }
}

pub fn load_dir(dir: &Path, source: SkillSource) -> Vec<SkillPack> {
    let mut packs = Vec::new();
    if !dir.is_dir() {
        return packs;
    }
    let Ok(rd) = fs::read_dir(dir) else {
        return packs;
    };
    for entry in rd.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        // skip scripts sandbox folder
        if path.file_name().and_then(|s| s.to_str()) == Some("scripts") {
            continue;
        }
        let skill_md = path.join("SKILL.md");
        if !skill_md.is_file() {
            continue;
        }
        let Ok(raw) = fs::read_to_string(&skill_md) else {
            continue;
        };
        match parse_skill_md(&raw, source) {
            Ok(mut pack) => {
                // Default entry from runtime files if missing
                if pack.entry.is_none() {
                    pack.entry = detect_entry(&path);
                }
                if pack.runtime.is_none() {
                    if let Some(ref e) = pack.entry {
                        if let Some(ext) = Path::new(e).extension().and_then(|x| x.to_str()) {
                            pack.runtime = super::runtimes::RuntimeId::from_extension(ext)
                                .map(|r| r.as_str().to_string());
                        }
                    }
                }
                // Ensure run_script tool present for script skills
                if pack.entry.is_some()
                    && !pack.tools.iter().any(|t| t.id == "run_script")
                {
                    pack.tools.push(super::types::ToolSpec {
                        id: "run_script".into(),
                        description: format!("Run entry script for skill {}", pack.id),
                        parameters: vec![
                            super::types::ToolParameterSpec {
                                name: "args".into(),
                                kind: "string[]".into(),
                            },
                            super::types::ToolParameterSpec {
                                name: "skill_id".into(),
                                kind: "string".into(),
                            },
                        ],
                    });
                }
                packs.push(pack);
            }
            Err(e) => crate::app_log::log_global(crate::app_log::LogLevel::Warn, crate::app_log::LogCategory::System, "custom_skill", format!("Skip skill at {}: {e}", path.display()), None),
        }
    }
    packs
}

fn detect_entry(dir: &Path) -> Option<String> {
    for name in [
        "main.py",
        "test.php",
        "index.js",
        "main.js",
        "main.rs",
        "main.sh",
        "run.sh",
    ] {
        if dir.join(name).is_file() {
            return Some(name.into());
        }
    }
    // first matching extension
    let rd = fs::read_dir(dir).ok()?;
    for e in rd.flatten() {
        let p = e.path();
        if !p.is_file() {
            continue;
        }
        if let Some(ext) = p.extension().and_then(|x| x.to_str()) {
            if super::runtimes::RuntimeId::from_extension(ext).is_some() {
                return p.file_name()?.to_str().map(|s| s.to_string());
            }
        }
    }
    None
}

pub fn list_custom(
    app_data: &Path,
    workspace: Option<&Path>,
) -> Vec<CustomSkillSummary> {
    let mut out = Vec::new();
    for pack in load_dir(&global_skills_root(app_data), SkillSource::Global) {
        out.push(to_summary(
            &pack,
            SkillScope::Global,
            &global_skills_root(app_data).join(&pack.id),
        ));
    }
    if let Some(ws) = workspace {
        for pack in load_dir(&company_skills_root(ws), SkillSource::Company) {
            out.push(to_summary(
                &pack,
                SkillScope::Company,
                &company_skills_root(ws).join(&pack.id),
            ));
        }
    }
    out.sort_by(|a, b| a.id.cmp(&b.id));
    out
}

fn to_summary(pack: &SkillPack, scope: SkillScope, path: &Path) -> CustomSkillSummary {
    CustomSkillSummary {
        id: pack.id.clone(),
        name: pack.name.clone(),
        scope,
        runtime: pack.runtime.clone(),
        entry: pack.entry.clone(),
        path: path.display().to_string(),
        risk: pack.risk.as_str().to_string(),
    }
}

pub fn create_skill(
    app_data: &Path,
    workspace: Option<&Path>,
    scope: SkillScope,
    id: &str,
    name: &str,
    runtime: &str,
) -> Result<CustomSkillSummary, String> {
    let id = sanitize_id(id)?;
    let rt = super::runtimes::RuntimeId::parse(runtime)
        .ok_or_else(|| format!("Unknown runtime '{runtime}'"))?;
    if matches!(scope, SkillScope::Company) && workspace.is_none() {
        return Err("Company scope requires an active company workspace.".into());
    }
    let dir = pack_dir(app_data, workspace, scope, &id);
    if dir.exists() {
        return Err(format!("Skill '{id}' already exists at {}.", dir.display()));
    }
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let entry = default_entry(rt);
    let skill_md = template_skill_md(&id, name, rt, &entry);
    fs::write(dir.join("SKILL.md"), skill_md).map_err(|e| e.to_string())?;
    fs::write(dir.join(&entry), default_script_body(rt, &id)).map_err(|e| e.to_string())?;

    // Ensure scripts sandbox exists for company
    if let Some(ws) = workspace {
        let _ = fs::create_dir_all(scripts_dir(ws));
    }

    Ok(CustomSkillSummary {
        id: id.clone(),
        name: name.to_string(),
        scope,
        runtime: Some(rt.as_str().to_string()),
        entry: Some(entry),
        path: dir.display().to_string(),
        risk: "high".into(),
    })
}

pub fn read_skill_files(
    app_data: &Path,
    workspace: Option<&Path>,
    scope: SkillScope,
    id: &str,
) -> Result<serde_json::Value, String> {
    let dir = pack_dir(app_data, workspace, scope, id);
    if !dir.is_dir() {
        return Err(format!("Skill not found: {id}"));
    }
    let skill_md = fs::read_to_string(dir.join("SKILL.md")).unwrap_or_default();
    let entry = detect_entry(&dir);
    let entry_content = entry
        .as_ref()
        .and_then(|e| fs::read_to_string(dir.join(e)).ok())
        .unwrap_or_default();
    Ok(serde_json::json!({
        "id": id,
        "path": dir.display().to_string(),
        "skill_md": skill_md,
        "entry": entry,
        "entry_content": entry_content,
    }))
}

pub fn save_skill_files(
    app_data: &Path,
    workspace: Option<&Path>,
    scope: SkillScope,
    id: &str,
    skill_md: Option<&str>,
    entry: Option<&str>,
    entry_content: Option<&str>,
) -> Result<(), String> {
    let dir = pack_dir(app_data, workspace, scope, id);
    if !dir.is_dir() {
        return Err(format!("Skill not found: {id}"));
    }
    if let Some(md) = skill_md {
        fs::write(dir.join("SKILL.md"), md).map_err(|e| e.to_string())?;
    }
    if let (Some(name), Some(body)) = (entry, entry_content) {
        let name = name.trim();
        if name.contains("..") || name.contains('/') || name.contains('\\') {
            return Err("Invalid entry file name.".into());
        }
        fs::write(dir.join(name), body).map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn delete_skill(
    app_data: &Path,
    workspace: Option<&Path>,
    scope: SkillScope,
    id: &str,
) -> Result<(), String> {
    let dir = pack_dir(app_data, workspace, scope, id);
    if !dir.is_dir() {
        return Err(format!("Skill not found: {id}"));
    }
    fs::remove_dir_all(&dir).map_err(|e| e.to_string())
}

fn sanitize_id(id: &str) -> Result<String, String> {
    let id = id.trim().to_lowercase();
    if id.is_empty() {
        return Err("Skill id required.".into());
    }
    if !id
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err("Skill id must be alphanumeric, dash, or underscore.".into());
    }
    Ok(id)
}

fn default_entry(rt: super::runtimes::RuntimeId) -> String {
    match rt {
        super::runtimes::RuntimeId::Sh => "main.sh".into(),
        super::runtimes::RuntimeId::Php => "test.php".into(),
        super::runtimes::RuntimeId::Node => "index.js".into(),
        super::runtimes::RuntimeId::Python => "main.py".into(),
        super::runtimes::RuntimeId::Rust => "main.rs".into(),
    }
}

fn template_skill_md(id: &str, name: &str, rt: super::runtimes::RuntimeId, entry: &str) -> String {
    format!(
        r#"---
id: {id}
name: {name}
version: 1
category: engineering
risk: high
requires_approval: true
token_cost_class: light
entry: {entry}
runtime: {runtime}
permissions:
  - script.exec
tools:
  - id: run_script
    description: Run {entry} with argv
    parameters:
      args: string[]
      skill_id: string
when_to_use: |
  When the task needs the custom script skill `{id}`.
---

# {name}

Entry: `{entry}` ({runtime})

## Lab test

```
{entry} arg1 arg2
```

Stdout should preferably be JSON for structured agent use.
"#,
        runtime = rt.as_str(),
    )
}

fn default_script_body(rt: super::runtimes::RuntimeId, id: &str) -> String {
    match rt {
        super::runtimes::RuntimeId::Sh => format!(
            "#!/usr/bin/env bash\nset -euo pipefail\nprintf '%s\\n' '{{\"ok\":true,\"skill\":\"{id}\",\"argv\":' \"$@\" '}}'\n"
        ),
        super::runtimes::RuntimeId::Php => format!(
            "<?php\necho json_encode([\n  'ok' => true,\n  'skill' => '{id}',\n  'argv' => array_slice($argv, 1),\n], JSON_PRETTY_PRINT), PHP_EOL;\n"
        ),
        super::runtimes::RuntimeId::Node => format!(
            "const argv = process.argv.slice(2);\nconsole.log(JSON.stringify({{ ok: true, skill: '{id}', argv }}, null, 2));\n"
        ),
        super::runtimes::RuntimeId::Python => format!(
            "import json, sys\nprint(json.dumps({{\"ok\": True, \"skill\": \"{id}\", \"argv\": sys.argv[1:]}}, indent=2))\n"
        ),
        super::runtimes::RuntimeId::Rust => format!(
            "fn main() {{\n    let args: Vec<String> = std::env::args().skip(1).collect();\n    print!(r#\"{{\"ok\":true,\"skill\":\"{id}\",\"argv\":[\"#);\n    for (i, a) in args.iter().enumerate() {{\n        if i > 0 {{ print!(\",\"); }}\n        print!(\"\\\"{{}}\\\"\", a.replace('\\\\', \"\\\\\\\\\").replace('\"', \"\\\\\\\"\"));\n    }}\n    println!(\"]}}\");\n}}\n"
        ),
    }
}
