import type { RuntimeCatalog, RuntimeCatalogEntry } from "../types/game";

export const RUNTIME_CATEGORY_LABELS: Record<string, string> = {
  builtin: "Built-in",
  claw: "Claw ecosystem",
  platform: "Platform agents",
  opensource: "Open source",
  custom: "Custom",
};

export type BrainLayer = "meeting" | "execution";

export function filterCatalogByLayer(catalog: RuntimeCatalog, layer: BrainLayer): RuntimeCatalog {
  return {
    ...catalog,
    runtimes: catalog.runtimes.filter((entry) => entry.layers?.includes(layer) ?? layer === "execution"),
  };
}

export function isSubprocessRuntime(mode?: string | null): boolean {
  return !!mode && mode !== "llm_only";
}

export function meetingBrainLabel(id?: string | null, catalog?: RuntimeCatalog | null): string {
  if (!id || id === "default") return "Inherit default";
  const entry = catalog?.runtimes.find((r) => r.id === id);
  if (entry) return entry.label;
  return legacyMeetingLabel(id);
}

export function legacyMeetingLabel(id: string): string {
  const map: Record<string, string> = {
    mock: "Mock (offline)",
    ollama: "Ollama (local)",
    openai: "OpenAI API",
    openai_api: "OpenAI API",
    grok: "Grok API",
    grok_api: "Grok API (xAI)",
    claude: "Claude API",
    claude_api: "Claude API",
    "soulmd-hub": "soulmd-hub API",
    soulmd_hub: "soulmd-hub API",
  };
  return map[id] ?? id.replace(/_/g, " ");
}

/** Maps legacy `settings.ai_provider` values to runtime catalog meeting brain ids. */
export function legacyMeetingProviderToRegistryId(provider: string): string {
  const key = provider.trim().toLowerCase();
  switch (key) {
    case "mock":
    case "ollama":
    case "openai_api":
    case "grok_api":
    case "claude_api":
    case "soulmd_hub":
      return key;
    case "openai":
      return "openai_api";
    case "grok":
      return "grok_api";
    case "claude":
      return "claude_api";
    case "soulmd-hub":
      return "soulmd_hub";
    default:
      return key;
  }
}

export function apiProviderIdForMeetingRegistry(
  registryId: string,
  catalog?: RuntimeCatalog | null,
): string {
  const normalized = legacyMeetingProviderToRegistryId(registryId);
  const entry = catalog?.runtimes.find((runtime) => runtime.id === normalized);
  if (entry?.api_provider_id) {
    return entry.api_provider_id;
  }
  const legacy = legacyMeetingLabel(normalized);
  const reverse: Record<string, string> = {
    "Mock (offline)": "mock",
    "Ollama (local)": "ollama",
    "OpenAI API": "openai",
    "Grok API (xAI)": "grok",
    "Grok API": "grok",
    "Claude API": "claude",
    "soulmd-hub API": "soulmd-hub",
  };
  return reverse[legacy] ?? normalized;
}

export function effectiveApiProviderForSettings(
  aiProvider: string,
  catalog?: RuntimeCatalog | null,
): string {
  return apiProviderIdForMeetingRegistry(legacyMeetingProviderToRegistryId(aiProvider), catalog);
}

export function transportForEntry(entry?: RuntimeCatalogEntry | null): "api" | "subprocess" | "builtin" | undefined {
  if (!entry) return undefined;
  if (entry.transport === "api") return "api";
  if (entry.transport === "builtin" || entry.id === "llm_only") return "builtin";
  if (entry.transport === "subprocess") return "subprocess";
  return undefined;
}

export function runtimeBinaryPlaceholder(runtimeId?: string, defaultBinary?: string): string {
  const binary = defaultBinary || runtimeId || "agent";
  return `${binary} (PATH) or /usr/local/bin/${binary}`;
}

const KNOWN_RUNTIME_LABELS: Record<string, string> = {
  llm_only: "In-app LLM only",
  openclaw: "OpenClaw",
  hermes: "Hermes",
  ironclaw: "IronClaw",
  nanoclaw: "NanoClaw",
  zeroclaw: "ZeroClaw",
  nullclaw: "NullClaw",
  picoclaw: "PicoClaw",
  nanobot: "Nanobot",
  grok: "Grok",
  claude: "Claude Code",
  codex: "Codex",
  gemini: "Gemini CLI",
  amazon_q: "Amazon Q",
  kimi: "Kimi",
  qwen: "Qwen Code",
  mistral_vibe: "Mistral Vibe",
  opencode: "OpenCode",
  aider: "Aider",
  goose: "Goose",
  pi: "Pi",
  cline: "Cline",
  custom: "Custom CLI",
};

export function runtimeModeLabel(mode?: string | null): string {
  if (!mode || mode === "llm_only") {
    return KNOWN_RUNTIME_LABELS.llm_only;
  }
  return KNOWN_RUNTIME_LABELS[mode] ?? mode.replace(/_/g, " ");
}

export function resolveEffectiveExecutionRuntimeLabel(
  agentRuntime: string | null | undefined,
  departmentRuntime: string | null | undefined,
  companyDefault: string,
): string {
  if (agentRuntime && agentRuntime !== "default") {
    return runtimeModeLabel(agentRuntime);
  }
  if (departmentRuntime && departmentRuntime !== "default") {
    return `${runtimeModeLabel(departmentRuntime)} (dept)`;
  }
  return runtimeModeLabel(companyDefault);
}

export function groupCatalogEntries(catalog: RuntimeCatalog) {
  const groups = new Map<string, RuntimeCatalog["runtimes"]>();
  for (const entry of catalog.runtimes) {
    const bucket = groups.get(entry.category) ?? [];
    bucket.push(entry);
    groups.set(entry.category, bucket);
  }
  return Array.from(groups.entries()).map(([category, runtimes]) => ({
    category,
    label: RUNTIME_CATEGORY_LABELS[category] ?? category,
    runtimes,
  }));
}