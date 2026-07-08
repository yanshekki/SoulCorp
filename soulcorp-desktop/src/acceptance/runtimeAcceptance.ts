import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { RuntimeCatalog } from "../types/game";
import {
  groupCatalogEntries,
  isSubprocessRuntime,
  runtimeBinaryPlaceholder,
  runtimeModeLabel,
  RUNTIME_CATEGORY_LABELS,
} from "../utils/agentRuntimeCatalog";
import type { AcceptanceResult } from "./acceptanceTests";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const registryPath = join(repoRoot, "src-tauri/resources/agent_runtimes.json");

function loadRegistry(): RuntimeCatalog {
  return JSON.parse(readFileSync(registryPath, "utf8")) as RuntimeCatalog;
}

export function runRuntimeAcceptanceTests(): AcceptanceResult[] {
  const results: AcceptanceResult[] = [];
  const registry = loadRegistry();

  results.push({
    name: "Runtime registry v2 has at least 29 entries",
    passed: registry.version >= 2 && registry.runtimes.length >= 29,
    detail: String(registry.runtimes.length),
  });

  results.push({
    name: "Runtime registry includes llm_only builtin",
    passed: registry.runtimes.some((entry) => entry.id === "llm_only" && entry.adapter === "builtin"),
  });

  results.push({
    name: "Runtime registry includes custom runtime",
    passed: registry.runtimes.some((entry) => entry.id === "custom"),
  });

  results.push({
    name: "Runtime registry grok uses grok_headless adapter",
    passed: registry.runtimes.find((entry) => entry.id === "grok")?.adapter === "grok_headless",
  });

  results.push({
    name: "Runtime registry has six adapter families",
    passed: registry.adapters.length >= 6,
    detail: String(registry.adapters.length),
  });

  results.push({
    name: "Runtime isSubprocessRuntime excludes llm_only",
    passed: !isSubprocessRuntime("llm_only") && isSubprocessRuntime("openclaw"),
  });

  results.push({
    name: "Runtime runtimeModeLabel maps openclaw",
    passed: runtimeModeLabel("openclaw") === "OpenClaw",
  });

  results.push({
    name: "Runtime runtimeBinaryPlaceholder includes binary name",
    passed: runtimeBinaryPlaceholder("grok", "grok").includes("grok"),
  });

  const grouped = groupCatalogEntries(registry);
  results.push({
    name: "Runtime groupCatalogEntries preserves all runtimes",
    passed: grouped.reduce((sum, group) => sum + group.runtimes.length, 0) === registry.runtimes.length,
    detail: String(grouped.length),
  });

  results.push({
    name: "Runtime category labels cover claw and platform",
    passed: RUNTIME_CATEGORY_LABELS.claw === "Claw ecosystem"
      && RUNTIME_CATEGORY_LABELS.platform === "Platform agents",
  });

  const clawCount = registry.runtimes.filter((entry) => entry.category === "claw").length;
  results.push({
    name: "Runtime registry has eight claw ecosystem entries",
    passed: clawCount >= 8,
    detail: String(clawCount),
  });

  const passedCount = results.filter((result) => result.passed).length;
  results.push({
    name: "Runtime complete gate",
    passed: passedCount === results.length,
    detail: `${passedCount}/${results.length}`,
  });

  return results;
}