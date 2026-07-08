import type { RuntimeCatalog } from "../types/game";

export const RUNTIME_CATEGORY_LABELS: Record<string, string> = {
  builtin: "Built-in",
  claw: "Claw ecosystem",
  platform: "Platform agents",
  opensource: "Open source",
  custom: "Custom",
};

export function isSubprocessRuntime(mode?: string | null): boolean {
  return !!mode && mode !== "llm_only";
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