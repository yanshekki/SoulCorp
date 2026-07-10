//! Seed 10 agent-useful global skills per language: .sh .php .js .py .rs (50 total).
//! v2 replaces toy demos (greet/upper/reverse) with real agent tools.

use super::custom::global_skills_root;
use super::runtimes::RuntimeId;
use std::fs;
use std::path::Path;

const SEED_MARKER: &str = ".starter-skills-v2";
const SEED_MARKER_V1: &str = ".starter-skills-v1";

const V1_TOY_IDS: &[&str] = &[
    "py-greet",
    "py-wordcount",
    "py-slugify",
    "py-sum",
    "py-json-wrap",
    "py-reverse",
    "py-now",
    "py-base64",
    "py-upper",
    "py-lines",
    "php-greet",
    "php-wordcount",
    "php-slugify",
    "php-sum",
    "php-json-wrap",
    "php-reverse",
    "php-now",
    "php-base64",
    "php-upper",
    "php-mail-check",
    "js-greet",
    "js-wordcount",
    "js-slugify",
    "js-sum",
    "js-json-wrap",
    "js-reverse",
    "js-now",
    "js-base64",
    "js-upper",
    "js-parse-flags",
    "sh-greet",
    "sh-wordcount",
    "sh-slugify",
    "sh-sum",
    "sh-json-wrap",
    "sh-reverse",
    "sh-now",
    "sh-upper",
    "sh-whoami",
    "sh-join",
    "rs-greet",
    "rs-wordcount",
    "rs-slugify",
    "rs-sum",
    "rs-json-wrap",
    "rs-reverse",
    "rs-now",
    "rs-upper",
    "rs-len",
    "rs-calc",
];

/// Ensure 50 agent-useful script skills exist under `{app_data}/skills/`.
pub fn ensure_starter_skills(app_data: &Path) -> Result<usize, String> {
    let root = global_skills_root(app_data);
    fs::create_dir_all(&root).map_err(|e| e.to_string())?;

    // Migrate from v1 toys → v2 agent tools
    let v1 = root.join(SEED_MARKER_V1);
    let v2 = root.join(SEED_MARKER);
    if v1.is_file() && !v2.is_file() {
        for id in V1_TOY_IDS {
            let dir = root.join(id);
            if dir.is_dir() {
                let _ = fs::remove_dir_all(&dir);
            }
        }
        let _ = fs::remove_file(&v1);
    }

    // Always refresh v2 pack contents (force write) so upgrades ship new scripts
    let n = seed_all(&root, true)?;
    fs::write(&v2, "seeded\n").map_err(|e| e.to_string())?;
    let _ = fs::remove_file(root.join(SEED_MARKER_V1));
    Ok(n)
}

fn seed_all(root: &Path, force_overwrite: bool) -> Result<usize, String> {
    let mut count = 0usize;
    for def in ALL_STARTERS {
        if write_skill(root, def, force_overwrite)? {
            count += 1;
        }
    }
    Ok(count)
}

struct StarterDef {
    id: &'static str,
    name: &'static str,
    runtime: RuntimeId,
    entry: &'static str,
    when: &'static str,
    body: &'static str,
}

fn write_skill(root: &Path, def: &StarterDef, force: bool) -> Result<bool, String> {
    let dir = root.join(def.id);
    let skill_md = dir.join("SKILL.md");
    let entry_path = dir.join(def.entry);
    if !force && skill_md.is_file() && entry_path.is_file() {
        return Ok(false);
    }
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let md = format!(
        r#"---
id: {id}
name: {name}
version: 2
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
    description: Run {entry} with argv; prints JSON for agents
    parameters:
      args: string[]
      skill_id: string
when_to_use: |
  {when}
---

# {name}

Runtime: **{runtime}** · Entry: `{entry}`

Agent tool. Stdout is always JSON (`ok`, `skill`, ...).

## Lab

```
{entry} <args...>
```
"#,
        id = def.id,
        name = def.name,
        entry = def.entry,
        runtime = def.runtime.as_str(),
        when = def.when,
    );
    fs::write(&skill_md, md).map_err(|e| e.to_string())?;
    fs::write(&entry_path, def.body).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    if def.runtime == RuntimeId::Sh {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&entry_path, fs::Permissions::from_mode(0o755));
    }
    Ok(true)
}

const ALL_STARTERS: &[StarterDef] = &[
    StarterDef {
        id: "py-json-path",
        name: "JSON Path Extract",
        runtime: RuntimeId::Python,
        entry: "main.py",
        when: "Extract a dotted path from a JSON file or JSON string (e.g. users.0.email). Use when agents need a field from API/config JSON without loading the whole blob into the prompt.",
        body: r#####"import json, sys, pathlib

def load(arg):
    p = pathlib.Path(arg)
    if p.is_file():
        return json.loads(p.read_text(encoding="utf-8", errors="replace"))
    return json.loads(arg)

def get_path(obj, path):
    cur = obj
    for part in path.split("."):
        if part == "":
            continue
        if isinstance(cur, list):
            cur = cur[int(part)]
        elif isinstance(cur, dict):
            cur = cur[part]
        else:
            raise KeyError(part)
    return cur

args = sys.argv[1:]
if len(args) < 2:
    print(json.dumps({"ok": False, "skill": "py-json-path", "error": "Usage: main.py <file|json> <dotted.path>"}))
    sys.exit(1)
try:
    data = load(args[0])
    val = get_path(data, args[1])
    print(json.dumps({"ok": True, "skill": "py-json-path", "path": args[1], "value": val}, ensure_ascii=False))
except Exception as e:
    print(json.dumps({"ok": False, "skill": "py-json-path", "error": str(e)}))
    sys.exit(1)
"#####,
    },
    StarterDef {
        id: "py-csv-to-json",
        name: "CSV to JSON",
        runtime: RuntimeId::Python,
        entry: "main.py",
        when: "Convert a CSV file to a JSON array of row objects for analysis or import.",
        body: r#####"import csv, json, sys, pathlib
if len(sys.argv) < 2:
    print(json.dumps({"ok": False, "skill": "py-csv-to-json", "error": "Usage: main.py <file.csv>"}))
    sys.exit(1)
path = pathlib.Path(sys.argv[1])
if not path.is_file():
    print(json.dumps({"ok": False, "skill": "py-csv-to-json", "error": f"Not found: {path}"}))
    sys.exit(1)
with path.open(newline="", encoding="utf-8", errors="replace") as f:
    rows = list(csv.DictReader(f))
print(json.dumps({"ok": True, "skill": "py-csv-to-json", "path": str(path), "count": len(rows), "rows": rows[:500]}, ensure_ascii=False))
"#####,
    },
    StarterDef {
        id: "py-extract-urls",
        name: "Extract URLs",
        runtime: RuntimeId::Python,
        entry: "main.py",
        when: "Extract http(s) URLs from a text file or raw string for research follow-up and link audits.",
        body: r#####"import json, re, sys, pathlib
if len(sys.argv) < 2:
    print(json.dumps({"ok": False, "skill": "py-extract-urls", "error": "Usage: main.py <file|text>"}))
    sys.exit(1)
arg = sys.argv[1]
p = pathlib.Path(arg)
text = p.read_text(encoding="utf-8", errors="replace") if p.is_file() else " ".join(sys.argv[1:])
urls = sorted(set(re.findall(r"https?://[^\s<>\]\)\"']+", text)))
print(json.dumps({"ok": True, "skill": "py-extract-urls", "count": len(urls), "urls": urls[:200]}, ensure_ascii=False))
"#####,
    },
    StarterDef {
        id: "py-diff-text",
        name: "Text Diff",
        runtime: RuntimeId::Python,
        entry: "main.py",
        when: "Produce a unified diff between two files for code review and change summaries.",
        body: r#####"import difflib, json, sys, pathlib
if len(sys.argv) < 3:
    print(json.dumps({"ok": False, "skill": "py-diff-text", "error": "Usage: main.py <a> <b>"}))
    sys.exit(1)
a, b = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
la = a.read_text(encoding="utf-8", errors="replace").splitlines(keepends=True) if a.is_file() else [sys.argv[1]+"\n"]
lb = b.read_text(encoding="utf-8", errors="replace").splitlines(keepends=True) if b.is_file() else [sys.argv[2]+"\n"]
diff = "".join(difflib.unified_diff(la, lb, fromfile=str(a), tofile=str(b)))
print(json.dumps({"ok": True, "skill": "py-diff-text", "a": str(a), "b": str(b), "diff": diff[:50000], "changed": bool(diff)}, ensure_ascii=False))
"#####,
    },
    StarterDef {
        id: "py-sha256",
        name: "SHA-256 Hash",
        runtime: RuntimeId::Python,
        entry: "main.py",
        when: "Compute SHA-256 of a file or string for integrity checks and cache keys.",
        body: r#####"import hashlib, json, sys, pathlib
if len(sys.argv) < 2:
    print(json.dumps({"ok": False, "skill": "py-sha256", "error": "Usage: main.py <file|string>"}))
    sys.exit(1)
arg = sys.argv[1]
p = pathlib.Path(arg)
if p.is_file():
    h = hashlib.sha256(p.read_bytes()).hexdigest()
    print(json.dumps({"ok": True, "skill": "py-sha256", "source": "file", "path": str(p), "sha256": h, "bytes": p.stat().st_size}))
else:
    data = " ".join(sys.argv[1:]).encode()
    h = hashlib.sha256(data).hexdigest()
    print(json.dumps({"ok": True, "skill": "py-sha256", "source": "string", "sha256": h, "bytes": len(data)}))
"#####,
    },
    StarterDef {
        id: "py-frontmatter",
        name: "Markdown Frontmatter",
        runtime: RuntimeId::Python,
        entry: "main.py",
        when: "Split Markdown YAML frontmatter from body for CMS/workspace page processing.",
        body: r#####"import json, sys, pathlib, re
if len(sys.argv) < 2:
    print(json.dumps({"ok": False, "skill": "py-frontmatter", "error": "Usage: main.py <file.md>"}))
    sys.exit(1)
text = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8", errors="replace")
meta = {}
body = text
m = re.match(r"^---\s*\n(.*?)\n---\s*\n?(.*)$", text, re.S)
if m:
    for line in m.group(1).splitlines():
        if ":" in line:
            k, v = line.split(":", 1)
            meta[k.strip()] = v.strip().strip('"').strip("'")
    body = m.group(2)
print(json.dumps({"ok": True, "skill": "py-frontmatter", "meta": meta, "body": body[:20000], "body_chars": len(body)}, ensure_ascii=False))
"#####,
    },
    StarterDef {
        id: "py-template",
        name: "Template Fill",
        runtime: RuntimeId::Python,
        entry: "main.py",
        when: "Fill {{key}} placeholders in a template file using a JSON object argument.",
        body: r#####"import json, sys, pathlib, re
if len(sys.argv) < 3:
    print(json.dumps({"ok": False, "skill": "py-template", "error": "Usage: main.py <template> <json-object>"}))
    sys.exit(1)
tmpl_path = pathlib.Path(sys.argv[1])
tmpl = tmpl_path.read_text(encoding="utf-8", errors="replace") if tmpl_path.is_file() else sys.argv[1]
data = json.loads(sys.argv[2])
def repl(m):
    key = m.group(1).strip()
    return str(data.get(key, m.group(0)))
out = re.sub(r"\{\{\s*([\w.-]+)\s*\}\}", repl, tmpl)
print(json.dumps({"ok": True, "skill": "py-template", "result": out, "keys": list(data.keys())}, ensure_ascii=False))
"#####,
    },
    StarterDef {
        id: "py-semver-bump",
        name: "Semver Bump",
        runtime: RuntimeId::Python,
        entry: "main.py",
        when: "Bump a semantic version major/minor/patch for releases and changelogs.",
        body: r#####"import json, sys, re
if len(sys.argv) < 3:
    print(json.dumps({"ok": False, "skill": "py-semver-bump", "error": "Usage: main.py <x.y.z> <major|minor|patch>"}))
    sys.exit(1)
m = re.match(r"(\d+)\.(\d+)\.(\d+)", sys.argv[1])
if not m:
    print(json.dumps({"ok": False, "skill": "py-semver-bump", "error": "Invalid semver"}))
    sys.exit(1)
maj, mi, pa = map(int, m.groups())
which = sys.argv[2].lower()
if which == "major":
    maj, mi, pa = maj + 1, 0, 0
elif which == "minor":
    mi, pa = mi + 1, 0
else:
    pa += 1
print(json.dumps({"ok": True, "skill": "py-semver-bump", "from": sys.argv[1], "bump": which, "to": f"{maj}.{mi}.{pa}"}))
"#####,
    },
    StarterDef {
        id: "py-toc-md",
        name: "Markdown TOC",
        runtime: RuntimeId::Python,
        entry: "main.py",
        when: "Generate a Markdown table of contents from headings for long deliverables.",
        body: r#####"import json, sys, pathlib, re
if len(sys.argv) < 2:
    print(json.dumps({"ok": False, "skill": "py-toc-md", "error": "Usage: main.py <file.md>"}))
    sys.exit(1)
text = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8", errors="replace")
items = []
for line in text.splitlines():
    m = re.match(r"^(#{1,6})\s+(.+)$", line)
    if m:
        level = len(m.group(1))
        title = m.group(2).strip()
        slug = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")
        items.append({"level": level, "title": title, "slug": slug})
lines = ["- " * 0 + f"{'  ' * (it['level']-1)}- [{it['title']}](#{it['slug']})" for it in items]
print(json.dumps({"ok": True, "skill": "py-toc-md", "count": len(items), "toc_markdown": "\n".join(lines), "headings": items[:200]}, ensure_ascii=False))
"#####,
    },
    StarterDef {
        id: "py-http-head",
        name: "HTTP Status Check",
        runtime: RuntimeId::Python,
        entry: "main.py",
        when: "Check HTTP status and final URL for a link (deploy/health/link validation).",
        body: r#####"import json, sys, urllib.request
if len(sys.argv) < 2:
    print(json.dumps({"ok": False, "skill": "py-http-head", "error": "Usage: main.py <url>"}))
    sys.exit(1)
url = sys.argv[1]
req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": "SoulCorp-Agent/1.0"})
try:
    with urllib.request.urlopen(req, timeout=12) as resp:
        print(json.dumps({"ok": True, "skill": "py-http-head", "url": url, "final_url": resp.geturl(), "status": resp.status, "headers": {k: v for k, v in list(resp.headers.items())[:20]}}))
except Exception as e:
    # fallback GET
    try:
        req = urllib.request.Request(url, method="GET", headers={"User-Agent": "SoulCorp-Agent/1.0"})
        with urllib.request.urlopen(req, timeout=12) as resp:
            print(json.dumps({"ok": True, "skill": "py-http-head", "url": url, "final_url": resp.geturl(), "status": resp.status, "method": "GET"}))
    except Exception as e2:
        print(json.dumps({"ok": False, "skill": "py-http-head", "url": url, "error": str(e2)}))
        sys.exit(1)
"#####,
    },
    StarterDef {
        id: "php-json-validate",
        name: "JSON Validate",
        runtime: RuntimeId::Php,
        entry: "main.php",
        when: "Validate JSON syntax and report size/depth for API payloads and config files.",
        body: r#####"<?php
$path = $argv[1] ?? '';
if ($path === '') { echo json_encode(['ok'=>false,'skill'=>'php-json-validate','error'=>'Usage: main.php <file|json>']), PHP_EOL; exit(1); }
$raw = is_file($path) ? file_get_contents($path) : $path;
json_decode($raw);
$err = json_last_error();
$ok = $err === JSON_ERROR_NONE;
$data = $ok ? json_decode($raw, true) : null;
$depth = 0;
$walk = function($v, $d) use (&$walk, &$depth) { $depth = max($depth, $d); if (is_array($v)) foreach ($v as $x) $walk($x, $d+1); };
if (is_array($data)) $walk($data, 1);
echo json_encode(['ok'=>$ok,'skill'=>'php-json-validate','bytes'=>strlen($raw),'depth'=>$depth,'error'=>$ok?null:json_last_error_msg()], JSON_PRETTY_PRINT), PHP_EOL;
if (!$ok) exit(1);
"#####,
    },
    StarterDef {
        id: "php-html-to-text",
        name: "HTML to Text",
        runtime: RuntimeId::Php,
        entry: "main.php",
        when: "Strip HTML to plain text for summarization and meeting notes.",
        body: r#####"<?php
$path = $argv[1] ?? '';
if ($path === '') { echo json_encode(['ok'=>false,'skill'=>'php-html-to-text','error'=>'Usage: main.php <file.html|html>']); exit(1);} 
$html = is_file($path) ? file_get_contents($path) : implode(' ', array_slice($argv, 1));
$text = trim(html_entity_decode(strip_tags($html)));
$text = preg_replace('/\s+/', ' ', $text);
echo json_encode(['ok'=>true,'skill'=>'php-html-to-text','chars'=>strlen($text),'text'=>mb_substr($text,0,20000)], JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE), PHP_EOL;
"#####,
    },
    StarterDef {
        id: "php-url-parse",
        name: "URL Parse",
        runtime: RuntimeId::Php,
        entry: "main.php",
        when: "Parse a URL into scheme/host/path/query for routing and allowlist checks.",
        body: r#####"<?php
$url = $argv[1] ?? '';
if ($url === '') { echo json_encode(['ok'=>false,'skill'=>'php-url-parse','error'=>'Usage: main.php <url>']); exit(1);} 
$p = parse_url($url);
echo json_encode(['ok'=>true,'skill'=>'php-url-parse','url'=>$url,'parts'=>$p ?: new stdClass()], JSON_PRETTY_PRINT), PHP_EOL;
"#####,
    },
    StarterDef {
        id: "php-query-parse",
        name: "Query String Parse",
        runtime: RuntimeId::Php,
        entry: "main.php",
        when: "Parse a query string into key/value pairs for request debugging.",
        body: r#####"<?php
$q = $argv[1] ?? '';
if ($q === '') { echo json_encode(['ok'=>false,'skill'=>'php-query-parse','error'=>'Usage: main.php <query>']); exit(1);} 
if ($q[0] === '?') $q = substr($q, 1);
parse_str($q, $out);
echo json_encode(['ok'=>true,'skill'=>'php-query-parse','params'=>$out], JSON_PRETTY_PRINT), PHP_EOL;
"#####,
    },
    StarterDef {
        id: "php-csv-to-json",
        name: "CSV to JSON",
        runtime: RuntimeId::Php,
        entry: "main.php",
        when: "Convert CSV to JSON rows for imports and reports.",
        body: r#####"<?php
$path = $argv[1] ?? '';
if ($path === '' || !is_file($path)) { echo json_encode(['ok'=>false,'skill'=>'php-csv-to-json','error'=>'Usage: main.php <file.csv>']); exit(1);} 
$fh = fopen($path, 'r');
$header = fgetcsv($fh);
$rows = [];
while (($r = fgetcsv($fh)) !== false) {
  $row = [];
  foreach ($header as $i => $h) $row[$h] = $r[$i] ?? null;
  $rows[] = $row;
  if (count($rows) >= 500) break;
}
fclose($fh);
echo json_encode(['ok'=>true,'skill'=>'php-csv-to-json','count'=>count($rows),'rows'=>$rows], JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE), PHP_EOL;
"#####,
    },
    StarterDef {
        id: "php-mime-sniff",
        name: "MIME Sniff",
        runtime: RuntimeId::Php,
        entry: "main.php",
        when: "Guess MIME type from file extension/content for uploads and exports.",
        body: r#####"<?php
$path = $argv[1] ?? '';
if ($path === '' || !is_file($path)) { echo json_encode(['ok'=>false,'skill'=>'php-mime-sniff','error'=>'Usage: main.php <file>']); exit(1);} 
$mime = function_exists('mime_content_type') ? mime_content_type($path) : null;
$ext = pathinfo($path, PATHINFO_EXTENSION);
$map = ['json'=>'application/json','md'=>'text/markdown','csv'=>'text/csv','html'=>'text/html','png'=>'image/png','jpg'=>'image/jpeg','zip'=>'application/zip'];
if (!$mime) $mime = $map[strtolower($ext)] ?? 'application/octet-stream';
echo json_encode(['ok'=>true,'skill'=>'php-mime-sniff','path'=>$path,'ext'=>$ext,'mime'=>$mime,'bytes'=>filesize($path)], JSON_PRETTY_PRINT), PHP_EOL;
"#####,
    },
    StarterDef {
        id: "php-env-required",
        name: "Env Required Check",
        runtime: RuntimeId::Php,
        entry: "main.php",
        when: "Verify required environment variables are set before deploy/runtime tasks.",
        body: r#####"<?php
$keys = array_slice($argv, 1);
if (!$keys) { echo json_encode(['ok'=>false,'skill'=>'php-env-required','error'=>'Usage: main.php KEY1 KEY2 ...']); exit(1);} 
$present = []; $missing = [];
foreach ($keys as $k) {
  $v = getenv($k);
  if ($v === false || $v === '') $missing[] = $k; else $present[$k] = true;
}
echo json_encode(['ok'=>count($missing)===0,'skill'=>'php-env-required','present'=>array_keys($present),'missing'=>$missing], JSON_PRETTY_PRINT), PHP_EOL;
if ($missing) exit(1);
"#####,
    },
    StarterDef {
        id: "php-xml-to-json",
        name: "XML to JSON",
        runtime: RuntimeId::Php,
        entry: "main.php",
        when: "Convert simple XML (feeds/config) to JSON for agent processing.",
        body: r#####"<?php
$path = $argv[1] ?? '';
if ($path === '' || !is_file($path)) { echo json_encode(['ok'=>false,'skill'=>'php-xml-to-json','error'=>'Usage: main.php <file.xml>']); exit(1);} 
$xml = @simplexml_load_file($path);
if ($xml === false) { echo json_encode(['ok'=>false,'skill'=>'php-xml-to-json','error'=>'Invalid XML']); exit(1);} 
$json = json_decode(json_encode($xml), true);
echo json_encode(['ok'=>true,'skill'=>'php-xml-to-json','path'=>$path,'data'=>$json], JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE), PHP_EOL;
"#####,
    },
    StarterDef {
        id: "php-email-validate",
        name: "Email Validate",
        runtime: RuntimeId::Php,
        entry: "main.php",
        when: "Validate one or more email addresses for outreach lists.",
        body: r#####"<?php
$emails = array_slice($argv, 1);
if (!$emails) { echo json_encode(['ok'=>false,'skill'=>'php-email-validate','error'=>'Usage: main.php email...']); exit(1);} 
$valid=[]; $invalid=[];
foreach ($emails as $e) {
  if (filter_var($e, FILTER_VALIDATE_EMAIL)) $valid[]=$e; else $invalid[]=$e;
}
echo json_encode(['ok'=>count($invalid)===0,'skill'=>'php-email-validate','valid'=>$valid,'invalid'=>$invalid], JSON_PRETTY_PRINT), PHP_EOL;
"#####,
    },
    StarterDef {
        id: "php-slug-path",
        name: "Safe Path Slug",
        runtime: RuntimeId::Php,
        entry: "main.php",
        when: "Turn a title into a filesystem-safe slug for exports and page paths.",
        body: r#####"<?php
$title = implode(' ', array_slice($argv, 1));
if ($title === '') { echo json_encode(['ok'=>false,'skill'=>'php-slug-path','error'=>'Usage: main.php <title>']); exit(1);} 
$slug = strtolower(trim(preg_replace('/[^a-z0-9]+/i', '-', $title), '-'));
echo json_encode(['ok'=>true,'skill'=>'php-slug-path','input'=>$title,'slug'=>$slug], JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE), PHP_EOL;
"#####,
    },
    StarterDef {
        id: "js-package-info",
        name: "Package.json Info",
        runtime: RuntimeId::Node,
        entry: "main.js",
        when: "Read package.json name, version, scripts, and dependency counts for engineering agents.",
        body: r#####"const fs = require("fs");
const path = process.argv[2] || "package.json";
if (!fs.existsSync(path)) {
  console.log(JSON.stringify({ ok: false, skill: "js-package-info", error: `Not found: ${path}` }));
  process.exit(1);
}
const pkg = JSON.parse(fs.readFileSync(path, "utf8"));
console.log(JSON.stringify({
  ok: true, skill: "js-package-info", path,
  name: pkg.name || null, version: pkg.version || null,
  scripts: Object.keys(pkg.scripts || {}),
  dependencies: Object.keys(pkg.dependencies || {}).length,
  devDependencies: Object.keys(pkg.devDependencies || {}).length,
  dependencyNames: Object.keys(pkg.dependencies || {}).slice(0, 100)
}, null, 2));
"#####,
    },
    StarterDef {
        id: "js-json-merge",
        name: "JSON Deep Merge",
        runtime: RuntimeId::Node,
        entry: "main.js",
        when: "Deep-merge two JSON files (config overlays, locale files).",
        body: r#####"const fs = require("fs");
function merge(a, b) {
  if (Array.isArray(a) && Array.isArray(b)) return b;
  if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) {
    const out = { ...a };
    for (const k of Object.keys(b)) out[k] = k in a ? merge(a[k], b[k]) : b[k];
    return out;
  }
  return b;
}
const [,, aPath, bPath] = process.argv;
if (!aPath || !bPath) {
  console.log(JSON.stringify({ ok: false, skill: "js-json-merge", error: "Usage: main.js <a.json> <b.json>" }));
  process.exit(1);
}
const a = JSON.parse(fs.readFileSync(aPath, "utf8"));
const b = JSON.parse(fs.readFileSync(bPath, "utf8"));
console.log(JSON.stringify({ ok: true, skill: "js-json-merge", result: merge(a, b) }, null, 2));
"#####,
    },
    StarterDef {
        id: "js-md-links",
        name: "Markdown Links",
        runtime: RuntimeId::Node,
        entry: "main.js",
        when: "Extract Markdown links for link checks and research graphs.",
        body: r#####"const fs = require("fs");
const path = process.argv[2];
if (!path || !fs.existsSync(path)) {
  console.log(JSON.stringify({ ok: false, skill: "js-md-links", error: "Usage: main.js <file.md>" }));
  process.exit(1);
}
const text = fs.readFileSync(path, "utf8");
const links = [];
const re = /\[([^\]]+)\]\(([^)]+)\)/g;
let m;
while ((m = re.exec(text))) links.push({ text: m[1], href: m[2] });
console.log(JSON.stringify({ ok: true, skill: "js-md-links", count: links.length, links: links.slice(0, 300) }, null, 2));
"#####,
    },
    StarterDef {
        id: "js-frontmatter",
        name: "Markdown Frontmatter",
        runtime: RuntimeId::Node,
        entry: "main.js",
        when: "Parse simple YAML frontmatter from Markdown pages.",
        body: r#####"const fs = require("fs");
const path = process.argv[2];
if (!path || !fs.existsSync(path)) {
  console.log(JSON.stringify({ ok: false, skill: "js-frontmatter", error: "Usage: main.js <file.md>" }));
  process.exit(1);
}
const text = fs.readFileSync(path, "utf8");
const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
const meta = {};
let body = text;
if (m) {
  for (const line of m[1].split(/\r?\n/)) {
    const i = line.indexOf(":");
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  body = m[2];
}
console.log(JSON.stringify({ ok: true, skill: "js-frontmatter", meta, body_chars: body.length, body: body.slice(0, 20000) }, null, 2));
"#####,
    },
    StarterDef {
        id: "js-glob-list",
        name: "Glob File List",
        runtime: RuntimeId::Node,
        entry: "main.js",
        when: "List files matching a simple glob under the working directory (repo inventory).",
        body: r#####"const fs = require("fs");
const path = require("path");
const pattern = process.argv[2] || "**/*";
function walk(dir, acc=[]) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === "node_modules" || ent.name === ".git") continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
}
function match(glob, file) {
  // very small glob: ** / * 
  const re = new RegExp("^" + glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*/g, ":::").replace(/\*/g, "[^/]*").replace(/:::/g, ".*") + "$");
  return re.test(file.replace(/\\/g, "/"));
}
const root = process.cwd();
const files = walk(root).map(f => path.relative(root, f)).filter(f => match(pattern, f.replace(/\\/g, "/")));
console.log(JSON.stringify({ ok: true, skill: "js-glob-list", pattern, count: files.length, files: files.slice(0, 500) }, null, 2));
"#####,
    },
    StarterDef {
        id: "js-csv-parse",
        name: "CSV Parse",
        runtime: RuntimeId::Node,
        entry: "main.js",
        when: "Parse CSV into JSON rows without external deps.",
        body: r#####"const fs = require("fs");
const path = process.argv[2];
if (!path || !fs.existsSync(path)) {
  console.log(JSON.stringify({ ok: false, skill: "js-csv-parse", error: "Usage: main.js <file.csv>" }));
  process.exit(1);
}
const lines = fs.readFileSync(path, "utf8").trim().split(/\r?\n/);
const headers = lines[0].split(",").map(s => s.trim());
const rows = lines.slice(1, 501).map(line => {
  const cols = line.split(",");
  const o = {};
  headers.forEach((h, i) => o[h] = (cols[i] || "").trim());
  return o;
});
console.log(JSON.stringify({ ok: true, skill: "js-csv-parse", count: rows.length, rows }, null, 2));
"#####,
    },
    StarterDef {
        id: "js-line-diff",
        name: "Line Diff Stats",
        runtime: RuntimeId::Node,
        entry: "main.js",
        when: "Compute added/removed line stats between two files for PR summaries.",
        body: r#####"const fs = require("fs");
const [,, a, b] = process.argv;
if (!a || !b || !fs.existsSync(a) || !fs.existsSync(b)) {
  console.log(JSON.stringify({ ok: false, skill: "js-line-diff", error: "Usage: main.js <old> <new>" }));
  process.exit(1);
}
const A = new Set(fs.readFileSync(a, "utf8").split(/\r?\n/));
const B = fs.readFileSync(b, "utf8").split(/\r?\n/);
const Bset = new Set(B);
let added = 0, removed = 0;
for (const line of B) if (!A.has(line)) added++;
for (const line of A) if (!Bset.has(line)) removed++;
console.log(JSON.stringify({ ok: true, skill: "js-line-diff", a, b, added, removed, new_lines: B.length }, null, 2));
"#####,
    },
    StarterDef {
        id: "js-url-normalize",
        name: "URL Normalize",
        runtime: RuntimeId::Node,
        entry: "main.js",
        when: "Normalize a URL (lowercase host, strip default ports, resolve dots) for deduping links.",
        body: r#####"const raw = process.argv[2];
if (!raw) {
  console.log(JSON.stringify({ ok: false, skill: "js-url-normalize", error: "Usage: main.js <url>" }));
  process.exit(1);
}
try {
  const u = new URL(raw);
  u.hash = "";
  u.hostname = u.hostname.toLowerCase();
  if ((u.protocol === "http:" && u.port === "80") || (u.protocol === "https:" && u.port === "443")) u.port = "";
  let path = u.pathname.replace(/\/+/g, "/");
  const parts = [];
  for (const p of path.split("/")) {
    if (p === "..") parts.pop();
    else if (p !== ".") parts.push(p);
  }
  u.pathname = parts.join("/") || "/";
  console.log(JSON.stringify({ ok: true, skill: "js-url-normalize", input: raw, normalized: u.toString() }, null, 2));
} catch (e) {
  console.log(JSON.stringify({ ok: false, skill: "js-url-normalize", error: String(e.message || e) }));
  process.exit(1);
}
"#####,
    },
    StarterDef {
        id: "js-semver-check",
        name: "Semver Satisfies",
        runtime: RuntimeId::Node,
        entry: "main.js",
        when: "Check whether a version satisfies a simple range (^x.y.z or >=x.y.z).",
        body: r#####"const [,, ver, range] = process.argv;
if (!ver || !range) {
  console.log(JSON.stringify({ ok: false, skill: "js-semver-check", error: "Usage: main.js <version> <range>" }));
  process.exit(1);
}
function parse(v) {
  const m = String(v).replace(/^v/, "").match(/^(\d+)\.(\d+)\.(\d+)/);
  return m ? [+m[1], +m[2], +m[3]] : null;
}
const v = parse(ver);
if (!v) {
  console.log(JSON.stringify({ ok: false, skill: "js-semver-check", error: "Invalid version" }));
  process.exit(1);
}
let ok = false;
if (range.startsWith("^")) {
  const b = parse(range.slice(1));
  ok = b && v[0] === b[0] && (v[1] > b[1] || (v[1] === b[1] && v[2] >= b[2]));
} else if (range.startsWith(">=")) {
  const b = parse(range.slice(2));
  ok = b && (v[0] > b[0] || (v[0] === b[0] && (v[1] > b[1] || (v[1] === b[1] && v[2] >= b[2]))));
} else {
  const b = parse(range);
  ok = b && v[0] === b[0] && v[1] === b[1] && v[2] === b[2];
}
console.log(JSON.stringify({ ok: true, skill: "js-semver-check", version: ver, range, satisfies: !!ok }, null, 2));
"#####,
    },
    StarterDef {
        id: "js-token-estimate",
        name: "Token Estimate",
        runtime: RuntimeId::Node,
        entry: "main.js",
        when: "Rough token estimate for prompt/budget planning (~4 chars/token English).",
        body: r#####"const text = process.argv.slice(2).join(" ");
if (!text) {
  console.log(JSON.stringify({ ok: false, skill: "js-token-estimate", error: "Usage: main.js <text...>" }));
  process.exit(1);
}
const chars = text.length;
const words = text.trim() ? text.trim().split(/\s+/).length : 0;
const tokens_est = Math.ceil(chars / 4);
console.log(JSON.stringify({ ok: true, skill: "js-token-estimate", chars, words, tokens_est, method: "chars/4" }, null, 2));
"#####,
    },
    StarterDef {
        id: "sh-git-status",
        name: "Git Status JSON",
        runtime: RuntimeId::Sh,
        entry: "main.sh",
        when: "List git working tree changes as JSON for agents preparing commits or reviews.",
        body: r#####"#!/usr/bin/env bash
set -euo pipefail
if ! command -v git >/dev/null 2>&1; then
  printf '%s\n' '{"ok":false,"skill":"sh-git-status","error":"git not found"}'
  exit 1
fi
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  printf '%s\n' '{"ok":false,"skill":"sh-git-status","error":"not a git repository"}'
  exit 1
fi
mapfile -t lines < <(git status --porcelain=v1 2>/dev/null || true)
printf '{"ok":true,"skill":"sh-git-status","branch":"%s","count":%s,"files":[' "$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)" "${#lines[@]}"
first=1
for line in "${lines[@]}"; do
  code="${line:0:2}"
  file="${line:3}"
  file=${file//\\/\\\\}; file=${file//\"/\\\"}
  code=${code//\\/\\\\}; code=${code//\"/\\\"}
  if [[ $first -eq 1 ]]; then first=0; else printf ','; fi
  printf '{"status":"%s","path":"%s"}' "$code" "$file"
done
printf ']}\n'
"#####,
    },
    StarterDef {
        id: "sh-git-log",
        name: "Git Log JSON",
        runtime: RuntimeId::Sh,
        entry: "main.sh",
        when: "Recent commits as JSON for changelogs and context.",
        body: r#####"#!/usr/bin/env bash
set -euo pipefail
n="${1:-10}"
if ! command -v git >/dev/null 2>&1 || ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  printf '%s\n' '{"ok":false,"skill":"sh-git-log","error":"git repo required"}'
  exit 1
fi
printf '{"ok":true,"skill":"sh-git-log","limit":%s,"commits":[' "$n"
first=1
while IFS= read -r line; do
  [[ -z "$line" ]] && continue
  hash="${line%%|*}"; rest="${line#*|}"
  author="${rest%%|*}"; rest="${rest#*|}"
  subj="${rest}"
  hash=${hash//\"/\\\"}; author=${author//\"/\\\"}; subj=${subj//\"/\\\"}
  if [[ $first -eq 1 ]]; then first=0; else printf ','; fi
  printf '{"hash":"%s","author":"%s","subject":"%s"}' "$hash" "$author" "$subj"
done < <(git log -n "$n" --pretty=format:'%h|%an|%s')
printf ']}\n'
"#####,
    },
    StarterDef {
        id: "sh-find-name",
        name: "Find Files by Name",
        runtime: RuntimeId::Sh,
        entry: "main.sh",
        when: "Find files by name pattern under cwd for codebase navigation.",
        body: r#####"#!/usr/bin/env bash
set -euo pipefail
pat="${1:-*}"
printf '{"ok":true,"skill":"sh-find-name","pattern":"%s","files":[' "${pat//\"/\\\"}"
first=1
count=0
while IFS= read -r -d '' f; do
  f=${f#./}
  e=${f//\\/\\\\}; e=${e//\"/\\\"}
  if [[ $first -eq 1 ]]; then first=0; else printf ','; fi
  printf '"%s"' "$e"
  count=$((count+1))
  [[ $count -ge 400 ]] && break
done < <(find . -type f -name "$pat" -not -path '*/.git/*' -not -path '*/node_modules/*' -print0 2>/dev/null)
printf '],"count":%s}\n' "$count"
"#####,
    },
    StarterDef {
        id: "sh-disk-usage",
        name: "Disk Usage Summary",
        runtime: RuntimeId::Sh,
        entry: "main.sh",
        when: "Top-level disk usage for cleanup and deploy size checks.",
        body: r#####"#!/usr/bin/env bash
set -euo pipefail
root="${1:-.}"
printf '{"ok":true,"skill":"sh-disk-usage","root":"%s","entries":[' "${root//\"/\\\"}"
first=1
while IFS= read -r line; do
  size="${line%%$'\t'*}"; path="${line#*$'\t'}"
  size=${size//\"/\\\"}; path=${path//\"/\\\"}
  if [[ $first -eq 1 ]]; then first=0; else printf ','; fi
  printf '{"size":"%s","path":"%s"}' "$size" "$path"
done < <(du -sh "$root"/* 2>/dev/null | head -n 40)
printf ']}\n'
"#####,
    },
    StarterDef {
        id: "sh-which-tools",
        name: "Which Tools",
        runtime: RuntimeId::Sh,
        entry: "main.sh",
        when: "Check which CLI tools exist on PATH (runtime/deploy readiness).",
        body: r#####"#!/usr/bin/env bash
set -euo pipefail
if [[ $# -lt 1 ]]; then
  printf '%s\n' '{"ok":false,"skill":"sh-which-tools","error":"Usage: main.sh cmd1 cmd2 ..."}'
  exit 1
fi
printf '{"ok":true,"skill":"sh-which-tools","tools":{'
first=1
for c in "$@"; do
  path=$(command -v "$c" 2>/dev/null || true)
  if [[ $first -eq 1 ]]; then first=0; else printf ','; fi
  if [[ -n "$path" ]]; then
    printf '"%s":{"available":true,"path":"%s"}' "$c" "${path//\"/\\\"}"
  else
    printf '"%s":{"available":false,"path":null}' "$c"
  fi
done
printf '}}\n'
"#####,
    },
    StarterDef {
        id: "sh-file-stat",
        name: "File Stat",
        runtime: RuntimeId::Sh,
        entry: "main.sh",
        when: "Stat size/mtime for files (artifact checks).",
        body: r#####"#!/usr/bin/env bash
set -euo pipefail
if [[ $# -lt 1 ]]; then
  printf '%s\n' '{"ok":false,"skill":"sh-file-stat","error":"Usage: main.sh <path>..."}'
  exit 1
fi
printf '{"ok":true,"skill":"sh-file-stat","files":['
first=1
for f in "$@"; do
  if [[ -e "$f" ]]; then
    size=$(stat -c '%s' "$f" 2>/dev/null || stat -f '%z' "$f")
    mtime=$(stat -c '%y' "$f" 2>/dev/null || stat -f '%Sm' "$f")
    fe=${f//\"/\\\"}; me=${mtime//\"/\\\"}
    if [[ $first -eq 1 ]]; then first=0; else printf ','; fi
    printf '{"path":"%s","exists":true,"bytes":%s,"mtime":"%s"}' "$fe" "$size" "$me"
  else
    fe=${f//\"/\\\"}
    if [[ $first -eq 1 ]]; then first=0; else printf ','; fi
    printf '{"path":"%s","exists":false}' "$fe"
  fi
done
printf ']}\n'
"#####,
    },
    StarterDef {
        id: "sh-wc-files",
        name: "Word/Line Counts",
        runtime: RuntimeId::Sh,
        entry: "main.sh",
        when: "Line/word/byte counts for files (deliverable sizing).",
        body: r#####"#!/usr/bin/env bash
set -euo pipefail
if [[ $# -lt 1 ]]; then
  printf '%s\n' '{"ok":false,"skill":"sh-wc-files","error":"Usage: main.sh <files>..."}'
  exit 1
fi
printf '{"ok":true,"skill":"sh-wc-files","files":['
first=1
for f in "$@"; do
  [[ -f "$f" ]] || continue
  read -r lines words bytes _ < <(wc -l -w -c < "$f")
  fe=${f//\"/\\\"}
  if [[ $first -eq 1 ]]; then first=0; else printf ','; fi
  printf '{"path":"%s","lines":%s,"words":%s,"bytes":%s}' "$fe" "$lines" "$words" "$bytes"
done
printf ']}\n'
"#####,
    },
    StarterDef {
        id: "sh-grep-count",
        name: "Grep Match Counts",
        runtime: RuntimeId::Sh,
        entry: "main.sh",
        when: "Count pattern matches under a path (TODO/FIXME audits).",
        body: r#####"#!/usr/bin/env bash
set -euo pipefail
pat="${1:-}"
root="${2:-.}"
if [[ -z "$pat" ]]; then
  printf '%s\n' '{"ok":false,"skill":"sh-grep-count","error":"Usage: main.sh <pattern> [path]"}'
  exit 1
fi
if command -v rg >/dev/null 2>&1; then
  count=$(rg -n --no-messages -c "$pat" "$root" 2>/dev/null | awk -F: '{s+=$NF} END{print s+0}')
else
  count=$(grep -RIn --exclude-dir=.git --exclude-dir=node_modules -c "$pat" "$root" 2>/dev/null | awk -F: '{s+=$NF} END{print s+0}')
fi
printf '{"ok":true,"skill":"sh-grep-count","pattern":"%s","path":"%s","matches":%s}\n' "${pat//\"/\\\"}" "${root//\"/\\\"}" "${count:-0}"
"#####,
    },
    StarterDef {
        id: "sh-env-keys",
        name: "Env Keys Dump",
        runtime: RuntimeId::Sh,
        entry: "main.sh",
        when: "Read selected environment keys (never dumps entire env).",
        body: r#####"#!/usr/bin/env bash
set -euo pipefail
if [[ $# -lt 1 ]]; then
  printf '%s\n' '{"ok":false,"skill":"sh-env-keys","error":"Usage: main.sh KEY1 KEY2 ..."}'
  exit 1
fi
printf '{"ok":true,"skill":"sh-env-keys","values":{'
first=1
for k in "$@"; do
  v="${!k-}"
  if [[ $first -eq 1 ]]; then first=0; else printf ','; fi
  if [[ -n "${v}" ]]; then
    ve=${v//\\/\\\\}; ve=${ve//\"/\\\"}
    printf '"%s":"%s"' "$k" "$ve"
  else
    printf '"%s":null' "$k"
  fi
done
printf '}}\n'
"#####,
    },
    StarterDef {
        id: "sh-tar-list",
        name: "Archive List",
        runtime: RuntimeId::Sh,
        entry: "main.sh",
        when: "List members of tar/zip archives for export verification.",
        body: r#####"#!/usr/bin/env bash
set -euo pipefail
file="${1:-}"
if [[ -z "$file" || ! -f "$file" ]]; then
  printf '%s\n' '{"ok":false,"skill":"sh-tar-list","error":"Usage: main.sh <archive>"}'
  exit 1
fi
printf '{"ok":true,"skill":"sh-tar-list","archive":"%s","members":[' "${file//\"/\\\"}"
first=1
count=0
if [[ "$file" == *.zip ]]; then
  list_cmd=(unzip -Z1 "$file")
else
  list_cmd=(tar -tf "$file")
fi
while IFS= read -r m; do
  [[ -z "$m" ]] && continue
  e=${m//\\/\\\\}; e=${e//\"/\\\"}
  if [[ $first -eq 1 ]]; then first=0; else printf ','; fi
  printf '"%s"' "$e"
  count=$((count+1))
  [[ $count -ge 300 ]] && break
done < <("${list_cmd[@]}" 2>/dev/null)
printf '],"count":%s}\n' "$count"
"#####,
    },
    StarterDef {
        id: "rs-sha256",
        name: "SHA-256 Fast Hash",
        runtime: RuntimeId::Rust,
        entry: "main.rs",
        when: "Fast SHA-256 of a file or string for integrity (pure Rust, no crates).",
        body: r#####"// Minimal SHA-256 (public domain style compact impl) + CLI
use std::env;
use std::fs;
use std::io::Read;

fn main() {
    let args: Vec<String> = env::args().skip(1).collect();
    if args.is_empty() {
        println!(r#"{{"ok":false,"skill":"rs-sha256","error":"Usage: main.rs <file|string>"}}"#);
        return;
    }
    let path = std::path::Path::new(&args[0]);
    let (source, bytes) = if path.is_file() {
        ("file", fs::read(path).unwrap_or_default())
    } else {
        ("string", args.join(" ").into_bytes())
    };
    let dig = sha256(&bytes);
    let hex = dig.iter().map(|b| format!("{:02x}", b)).collect::<String>();
    println!(
        r#"{{"ok":true,"skill":"rs-sha256","source":"{}","bytes":{},"sha256":"{}"}}"#,
        source,
        bytes.len(),
        hex
    );
}

fn sha256(msg: &[u8]) -> [u8; 32] {
    // Compact SHA-256 implementation
    let mut h: [u32; 8] = [
        0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab,
        0x5be0cd19,
    ];
    const K: [u32; 64] = [
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4,
        0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe,
        0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f,
        0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
        0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc,
        0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
        0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116,
        0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
        0xc67178f2,
    ];
    let bit_len = (msg.len() as u64) * 8;
    let mut data = msg.to_vec();
    data.push(0x80);
    while (data.len() % 64) != 56 {
        data.push(0);
    }
    data.extend_from_slice(&bit_len.to_be_bytes());
    for chunk in data.chunks(64) {
        let mut w = [0u32; 64];
        for i in 0..16 {
            w[i] = u32::from_be_bytes([chunk[i * 4], chunk[i * 4 + 1], chunk[i * 4 + 2], chunk[i * 4 + 3]]);
        }
        for i in 16..64 {
            let s0 = w[i - 15].rotate_right(7) ^ w[i - 15].rotate_right(18) ^ (w[i - 15] >> 3);
            let s1 = w[i - 2].rotate_right(17) ^ w[i - 2].rotate_right(19) ^ (w[i - 2] >> 10);
            w[i] = w[i - 16]
                .wrapping_add(s0)
                .wrapping_add(w[i - 7])
                .wrapping_add(s1);
        }
        let mut a = h[0];
        let mut b = h[1];
        let mut c = h[2];
        let mut d = h[3];
        let mut e = h[4];
        let mut f = h[5];
        let mut g = h[6];
        let mut hh = h[7];
        for i in 0..64 {
            let s1 = e.rotate_right(6) ^ e.rotate_right(11) ^ e.rotate_right(25);
            let ch = (e & f) ^ ((!e) & g);
            let t1 = hh
                .wrapping_add(s1)
                .wrapping_add(ch)
                .wrapping_add(K[i])
                .wrapping_add(w[i]);
            let s0 = a.rotate_right(2) ^ a.rotate_right(13) ^ a.rotate_right(22);
            let maj = (a & b) ^ (a & c) ^ (b & c);
            let t2 = s0.wrapping_add(maj);
            hh = g;
            g = f;
            f = e;
            e = d.wrapping_add(t1);
            d = c;
            c = b;
            b = a;
            a = t1.wrapping_add(t2);
        }
        h[0] = h[0].wrapping_add(a);
        h[1] = h[1].wrapping_add(b);
        h[2] = h[2].wrapping_add(c);
        h[3] = h[3].wrapping_add(d);
        h[4] = h[4].wrapping_add(e);
        h[5] = h[5].wrapping_add(f);
        h[6] = h[6].wrapping_add(g);
        h[7] = h[7].wrapping_add(hh);
    }
    let mut out = [0u8; 32];
    for (i, v) in h.iter().enumerate() {
        out[i * 4..(i + 1) * 4].copy_from_slice(&v.to_be_bytes());
    }
    out
}
"#####,
    },
    StarterDef {
        id: "rs-line-count",
        name: "Line Count",
        runtime: RuntimeId::Rust,
        entry: "main.rs",
        when: "Fast multi-file line counts for sizing deliverables and logs.",
        body: r#####"use std::env;
use std::fs;
fn main() {
    let files: Vec<String> = env::args().skip(1).collect();
    if files.is_empty() {
        println!(r#"{{"ok":false,"skill":"rs-line-count","error":"Usage: main.rs <files>...}}"#);
        return;
    }
    let mut total = 0usize;
    let mut parts = Vec::new();
    for f in &files {
        match fs::read_to_string(f) {
            Ok(t) => {
                let n = t.lines().count();
                total += n;
                parts.push(format!(r#"{{"path":"{}","lines":{}}}"#, esc(f), n));
            }
            Err(_) => parts.push(format!(r#"{{"path":"{}","error":"read_failed"}}"#, esc(f))),
        }
    }
    println!(r#"{{"ok":true,"skill":"rs-line-count","total_lines":{},"files":[{}]}}"#, total, parts.join(","));
}
fn esc(s: &str) -> String { s.replace('\\', "\\\\").replace('"', "\\\"") }
"#####,
    },
    StarterDef {
        id: "rs-unique-lines",
        name: "Unique Lines",
        runtime: RuntimeId::Rust,
        entry: "main.rs",
        when: "Deduplicate lines from a file (lists, logs, inventories).",
        body: r#####"use std::collections::BTreeSet;
use std::env;
use std::fs;
fn main() {
    let path = env::args().nth(1).unwrap_or_default();
    if path.is_empty() {
        println!(r#"{{"ok":false,"skill":"rs-unique-lines","error":"Usage: main.rs <file>"}}"#);
        return;
    }
    let text = fs::read_to_string(&path).unwrap_or_default();
    let mut set = BTreeSet::new();
    for line in text.lines() { set.insert(line.to_string()); }
    let lines: Vec<_> = set.into_iter().take(2000).collect();
    let arr = lines.iter().map(|l| format!(r#""{}""#, esc(l))).collect::<Vec<_>>().join(",");
    println!(r#"{{"ok":true,"skill":"rs-unique-lines","path":"{}","unique":{},"lines":[{}]}}"#, esc(&path), lines.len(), arr);
}
fn esc(s: &str) -> String { s.replace('\\', "\\\\").replace('"', "\\\"") }
"#####,
    },
    StarterDef {
        id: "rs-json-pretty",
        name: "JSON Pretty / Validate",
        runtime: RuntimeId::Rust,
        entry: "main.rs",
        when: "Validate and pretty-print JSON files (lightweight, no serde).",
        body: r#####"use std::env;
use std::fs;
fn main() {
    let path = env::args().nth(1).unwrap_or_default();
    if path.is_empty() {
        println!(r#"{{"ok":false,"skill":"rs-json-pretty","error":"Usage: main.rs <file.json>"}}"#);
        return;
    }
    let raw = match fs::read_to_string(&path) {
        Ok(s) => s,
        Err(e) => {
            println!(r#"{{"ok":false,"skill":"rs-json-pretty","error":"{}"}}"#, esc(&e.to_string()));
            return;
        }
    };
    match minify_check(&raw) {
        Ok(()) => println!(r#"{{"ok":true,"skill":"rs-json-pretty","path":"{}","bytes":{},"valid":true}}"#, esc(&path), raw.len()),
        Err(e) => println!(r#"{{"ok":false,"skill":"rs-json-pretty","path":"{}","valid":false,"error":"{}"}}"#, esc(&path), esc(&e)),
    }
}
fn minify_check(s: &str) -> Result<(), String> {
    // balanced braces/brackets + quotes heuristic validator
    let mut stack = Vec::new();
    let mut in_str = false;
    let mut esc = false;
    for c in s.chars() {
        if in_str {
            if esc { esc = false; continue; }
            if c == '\\' { esc = true; continue; }
            if c == '"' { in_str = false; }
            continue;
        }
        match c {
            '"' => in_str = true,
            '{' | '[' => stack.push(c),
            '}' => { if stack.pop() != Some('{') { return Err("unbalanced }".into()); } }
            ']' => { if stack.pop() != Some('[') { return Err("unbalanced ]".into()); } }
            _ => {}
        }
    }
    if in_str { return Err("unterminated string".into()); }
    if !stack.is_empty() { return Err("unbalanced brackets".into()); }
    Ok(())
}
fn esc(s: &str) -> String { s.replace('\\', "\\\\").replace('"', "\\\"") }
"#####,
    },
    StarterDef {
        id: "rs-byte-size",
        name: "Byte Size",
        runtime: RuntimeId::Rust,
        entry: "main.rs",
        when: "Report file/directory total bytes for artifact size gates.",
        body: r#####"use std::env;
use std::fs;
use std::path::Path;
fn main() {
    let path = env::args().nth(1).unwrap_or_else(|| ".".into());
    let p = Path::new(&path);
    let bytes = size_of(p);
    let human = human(bytes);
    println!(r#"{{"ok":true,"skill":"rs-byte-size","path":"{}","bytes":{},"human":"{}"}}"#, esc(&path), bytes, human);
}
fn size_of(p: &Path) -> u64 {
    if p.is_file() { return p.metadata().map(|m| m.len()).unwrap_or(0); }
    let mut total = 0u64;
    if let Ok(rd) = fs::read_dir(p) {
        for e in rd.flatten() {
            let path = e.path();
            if path.is_dir() { total += size_of(&path); }
            else { total += path.metadata().map(|m| m.len()).unwrap_or(0); }
        }
    }
    total
}
fn human(n: u64) -> String {
    let mut v = n as f64;
    for unit in ["B","KB","MB","GB","TB"] {
        if v < 1024.0 || unit == "TB" { return format!("{:.1} {}", v, unit); }
        v /= 1024.0;
    }
    format!("{} B", n)
}
fn esc(s: &str) -> String { s.replace('\\', "\\\\").replace('"', "\\\"") }
"#####,
    },
    StarterDef {
        id: "rs-csv-stats",
        name: "CSV Stats",
        runtime: RuntimeId::Rust,
        entry: "main.rs",
        when: "Row/column counts for CSV files before import.",
        body: r#####"use std::env;
use std::fs;
fn main() {
    let path = env::args().nth(1).unwrap_or_default();
    if path.is_empty() {
        println!(r#"{{"ok":false,"skill":"rs-csv-stats","error":"Usage: main.rs <file.csv>"}}"#);
        return;
    }
    let text = fs::read_to_string(&path).unwrap_or_default();
    let mut lines = text.lines().filter(|l| !l.trim().is_empty());
    let header = lines.next().unwrap_or("");
    let cols = if header.is_empty() { 0 } else { header.split(',').count() };
    let rows = lines.count();
    println!(r#"{{"ok":true,"skill":"rs-csv-stats","path":"{}","columns":{},"data_rows":{},"header":"{}"}}"#, esc(&path), cols, rows, esc(header));
}
fn esc(s: &str) -> String { s.replace('\\', "\\\\").replace('"', "\\\"") }
"#####,
    },
    StarterDef {
        id: "rs-freq",
        name: "Word Frequency",
        runtime: RuntimeId::Rust,
        entry: "main.rs",
        when: "Top-N word frequencies from a text file for research clustering.",
        body: r#####"use std::collections::HashMap;
use std::env;
use std::fs;
fn main() {
    let path = env::args().nth(1).unwrap_or_default();
    let n: usize = env::args().nth(2).and_then(|s| s.parse().ok()).unwrap_or(20);
    if path.is_empty() {
        println!(r#"{{"ok":false,"skill":"rs-freq","error":"Usage: main.rs <file> [topN]"}}"#);
        return;
    }
    let text = fs::read_to_string(&path).unwrap_or_default().to_lowercase();
    let mut map: HashMap<String, usize> = HashMap::new();
    for w in text.split(|c: char| !c.is_alphanumeric()) {
        if w.len() < 2 { continue; }
        *map.entry(w.to_string()).or_insert(0) += 1;
    }
    let mut v: Vec<_> = map.into_iter().collect();
    v.sort_by(|a, b| b.1.cmp(&a.1));
    v.truncate(n);
    let items = v.iter().map(|(w,c)| format!(r#"{{"word":"{}","count":{}}}"#, esc(w), c)).collect::<Vec<_>>().join(",");
    println!(r#"{{"ok":true,"skill":"rs-freq","path":"{}","top":[{}]}}"#, esc(&path), items);
}
fn esc(s: &str) -> String { s.replace('\\', "\\\\").replace('"', "\\\"") }
"#####,
    },
    StarterDef {
        id: "rs-diff-stats",
        name: "Diff Size Stats",
        runtime: RuntimeId::Rust,
        entry: "main.rs",
        when: "Compare two files by line/char counts for quick change magnitude.",
        body: r#####"use std::env;
use std::fs;
fn main() {
    let a = env::args().nth(1).unwrap_or_default();
    let b = env::args().nth(2).unwrap_or_default();
    if a.is_empty() || b.is_empty() {
        println!(r#"{{"ok":false,"skill":"rs-diff-stats","error":"Usage: main.rs <a> <b>"}}"#);
        return;
    }
    let ta = fs::read_to_string(&a).unwrap_or_default();
    let tb = fs::read_to_string(&b).unwrap_or_default();
    println!(
        r#"{{"ok":true,"skill":"rs-diff-stats","a":{{"path":"{}","lines":{},"chars":{}}},"b":{{"path":"{}","lines":{},"chars":{}}},"line_delta":{},"char_delta":{}}}"#,
        esc(&a), ta.lines().count(), ta.chars().count(),
        esc(&b), tb.lines().count(), tb.chars().count(),
        tb.lines().count() as i64 - ta.lines().count() as i64,
        tb.chars().count() as i64 - ta.chars().count() as i64
    );
}
fn esc(s: &str) -> String { s.replace('\\', "\\\\").replace('"', "\\\"") }
"#####,
    },
    StarterDef {
        id: "rs-is-utf8",
        name: "UTF-8 Validate",
        runtime: RuntimeId::Rust,
        entry: "main.rs",
        when: "Validate a file is valid UTF-8 before text processing.",
        body: r#####"use std::env;
use std::fs;
fn main() {
    let path = env::args().nth(1).unwrap_or_default();
    if path.is_empty() {
        println!(r#"{{"ok":false,"skill":"rs-is-utf8","error":"Usage: main.rs <file>"}}"#);
        return;
    }
    let bytes = fs::read(&path).unwrap_or_default();
    let valid = std::str::from_utf8(&bytes).is_ok();
    println!(r#"{{"ok":true,"skill":"rs-is-utf8","path":"{}","bytes":{},"valid_utf8":{}}}"#, esc(&path), bytes.len(), valid);
}
fn esc(s: &str) -> String { s.replace('\\', "\\\\").replace('"', "\\\"") }
"#####,
    },
    StarterDef {
        id: "rs-join-lines",
        name: "Join Lines",
        runtime: RuntimeId::Rust,
        entry: "main.rs",
        when: "Join file lines with a separator for CSV/tag lists.",
        body: r#####"use std::env;
use std::fs;
fn main() {
    let path = env::args().nth(1).unwrap_or_default();
    let sep = env::args().nth(2).unwrap_or_else(|| ",".into());
    if path.is_empty() {
        println!(r#"{{"ok":false,"skill":"rs-join-lines","error":"Usage: main.rs <file> [sep]"}}"#);
        return;
    }
    let text = fs::read_to_string(&path).unwrap_or_default();
    let lines: Vec<_> = text.lines().filter(|l| !l.trim().is_empty()).collect();
    let joined = lines.join(&sep);
    println!(r#"{{"ok":true,"skill":"rs-join-lines","path":"{}","count":{},"joined":"{}"}}"#, esc(&path), lines.len(), esc(&joined));
}
fn esc(s: &str) -> String { s.replace('\\', "\\\\").replace('"', "\\\"") }
"#####,
    },
];

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::{HashMap, HashSet};

    #[test]
    fn has_fifty_starters() {
        assert_eq!(ALL_STARTERS.len(), 50);
    }

    #[test]
    fn ten_per_runtime() {
        let mut counts: HashMap<RuntimeId, usize> = HashMap::new();
        for s in ALL_STARTERS {
            *counts.entry(s.runtime).or_insert(0) += 1;
        }
        assert_eq!(counts.get(&RuntimeId::Python), Some(&10));
        assert_eq!(counts.get(&RuntimeId::Php), Some(&10));
        assert_eq!(counts.get(&RuntimeId::Node), Some(&10));
        assert_eq!(counts.get(&RuntimeId::Sh), Some(&10));
        assert_eq!(counts.get(&RuntimeId::Rust), Some(&10));
    }

    #[test]
    fn unique_ids() {
        let set: HashSet<_> = ALL_STARTERS.iter().map(|s| s.id).collect();
        assert_eq!(set.len(), 50);
    }

    #[test]
    fn no_toy_ids() {
        let set: HashSet<_> = ALL_STARTERS.iter().map(|s| s.id).collect();
        for toy in V1_TOY_IDS {
            assert!(!set.contains(toy), "toy skill still present: {toy}");
        }
    }
}
