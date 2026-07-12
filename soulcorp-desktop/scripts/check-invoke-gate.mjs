#!/usr/bin/env node
/**
 * Fail if any source file imports `invoke` from @tauri-apps/api/core.
 * All command calls must go through src/utils/tauriInvoke.ts so failures hit app_logs.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const ALLOW = new Set([
  "utils/tauriInvoke.ts",
]);

const FORBIDDEN = [
  /import\s*\{[^}]*\binvoke\b[^}]*\}\s*from\s*["']@tauri-apps\/api\/core["']/,
  /import\s+invoke\s+from\s*["']@tauri-apps\/api\/core["']/,
];

const hits = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (name === "node_modules" || name === "dist") continue;
      walk(full);
      continue;
    }
    if (!/\.(ts|tsx|js|jsx|mjs)$/.test(name)) continue;
    const rel = relative(ROOT, full).replaceAll("\\", "/");
    if (ALLOW.has(rel)) continue;
    const text = readFileSync(full, "utf8");
    for (const re of FORBIDDEN) {
      if (re.test(text)) {
        hits.push(rel);
        break;
      }
    }
  }
}

walk(ROOT);

if (hits.length > 0) {
  console.error(
    "invoke gate failed: import invoke only via src/utils/tauriInvoke.ts\n" +
      hits.map((h) => `  - ${h}`).join("\n"),
  );
  process.exit(1);
}

console.log("invoke gate ok — no direct @tauri-apps/api/core invoke imports");
