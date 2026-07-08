import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { RuntimeCatalog } from "../types/game";
import {
  apiProviderIdForMeetingRegistry,
  effectiveApiProviderForSettings,
  filterCatalogByLayer,
  legacyMeetingLabel,
  legacyMeetingProviderToRegistryId,
  meetingBrainLabel,
  transportForEntry,
} from "../utils/agentRuntimeCatalog";
import type { AcceptanceResult } from "./acceptanceTests";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const registryPath = join(repoRoot, "src-tauri/resources/agent_runtimes.json");

function loadRegistry(): RuntimeCatalog {
  return JSON.parse(readFileSync(registryPath, "utf8")) as RuntimeCatalog;
}

export function runBrainAcceptanceTests(): AcceptanceResult[] {
  const results: AcceptanceResult[] = [];
  const registry = loadRegistry();
  const meetingCatalog = filterCatalogByLayer(registry, "meeting");
  const executionCatalog = filterCatalogByLayer(registry, "execution");

  results.push({
    name: "Brain legacy openai maps to openai_api",
    passed: legacyMeetingProviderToRegistryId("openai") === "openai_api",
  });

  results.push({
    name: "Brain legacy grok maps to grok_api",
    passed: legacyMeetingProviderToRegistryId("grok") === "grok_api",
  });

  results.push({
    name: "Brain legacy soulmd-hub maps to soulmd_hub",
    passed: legacyMeetingProviderToRegistryId("soulmd-hub") === "soulmd_hub",
  });

  results.push({
    name: "Brain meeting catalog has six API brains",
    passed: meetingCatalog.runtimes.length >= 6,
    detail: String(meetingCatalog.runtimes.length),
  });

  results.push({
    name: "Brain execution catalog includes llm_only",
    passed: executionCatalog.runtimes.some((entry) => entry.id === "llm_only"),
  });

  results.push({
    name: "Brain apiProviderIdForMeetingRegistry resolves openai",
    passed: apiProviderIdForMeetingRegistry("openai_api", registry) === "openai",
  });

  results.push({
    name: "Brain effectiveApiProviderForSettings maps legacy values",
    passed: effectiveApiProviderForSettings("grok", registry) === "grok",
  });

  results.push({
    name: "Brain meetingBrainLabel resolves catalog entry",
    passed: meetingBrainLabel("ollama", registry) === "Ollama (local)",
  });

  results.push({
    name: "Brain meetingBrainLabel falls back to legacy label",
    passed: meetingBrainLabel("openai", null) === legacyMeetingLabel("openai"),
  });

  const openaiEntry = registry.runtimes.find((entry) => entry.id === "openai_api");
  const llmOnlyEntry = registry.runtimes.find((entry) => entry.id === "llm_only");
  const openclawEntry = registry.runtimes.find((entry) => entry.id === "openclaw");

  results.push({
    name: "Brain transportForEntry maps API meeting brain",
    passed: transportForEntry(openaiEntry) === "api",
  });

  results.push({
    name: "Brain transportForEntry maps builtin runtime",
    passed: transportForEntry(llmOnlyEntry) === "builtin",
  });

  results.push({
    name: "Brain transportForEntry maps subprocess runtime",
    passed: transportForEntry(openclawEntry) === "subprocess",
  });

  const passedCount = results.filter((result) => result.passed).length;
  results.push({
    name: "Brain complete gate",
    passed: passedCount === results.length,
    detail: `${passedCount}/${results.length}`,
  });

  return results;
}