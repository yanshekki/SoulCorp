import { languageFromSettings, translate } from "../i18n";
import { useGameStore } from "../stores/gameStore";
import { legacyMeetingLabel } from "../utils/agentRuntimeCatalog";

export const AI_PROVIDER_DEFAULT = "default";

const PROVIDER_LABEL_KEYS: Record<string, string> = {
  [AI_PROVIDER_DEFAULT]: "provider.companyDefault",
  mock: "provider.mock",
  ollama: "provider.ollama",
  openai: "provider.openai",
  grok: "provider.grok",
  claude: "provider.claude",
  deepseek: "provider.deepseek",
  "soulmd-hub": "provider.soulmdHub",
};

export const AI_PROVIDER_OPTIONS = [
  { value: AI_PROVIDER_DEFAULT, label: "Company default", labelKey: "provider.companyDefault" },
  { value: "mock", label: "Mock (offline)", labelKey: "provider.mock" },
  { value: "ollama", label: "Ollama (local)", labelKey: "provider.ollama" },
  { value: "openai", label: "OpenAI-compatible", labelKey: "provider.openai" },
  { value: "grok", label: "Grok (xAI)", labelKey: "provider.grok" },
  { value: "claude", label: "Claude-compatible", labelKey: "provider.claude" },
  { value: "deepseek", label: "DeepSeek", labelKey: "provider.deepseek" },
  { value: "soulmd-hub", label: "soulmd-hub API", labelKey: "provider.soulmdHub" },
] as const;

export const AGENT_AI_PROVIDER_OPTIONS = [
  { value: AI_PROVIDER_DEFAULT, label: "Department default", labelKey: "provider.deptDefault" },
  ...AI_PROVIDER_OPTIONS.filter((option) => option.value !== AI_PROVIDER_DEFAULT),
] as const;

export type AiProviderId = (typeof AI_PROVIDER_OPTIONS)[number]["value"];

export interface DepartmentAiConfig {
  department: string;
  ai_provider?: string | null;
  agent_runtime_mode?: string | null;
}

function tProvider(key: string, params?: Record<string, string | number>): string {
  const language = languageFromSettings(useGameStore.getState().settings);
  return translate(language, key, params);
}

function providerOptionLabel(provider: string): string {
  const key = PROVIDER_LABEL_KEYS[provider];
  if (key) {
    return tProvider(key);
  }
  const option = AI_PROVIDER_OPTIONS.find((entry) => entry.value === provider);
  if (option) {
    return tProvider(option.labelKey);
  }
  return legacyMeetingLabel(provider);
}

export function aiProviderLabel(
  provider: string | null | undefined,
  companyDefault: string,
): string {
  if (!provider || provider === AI_PROVIDER_DEFAULT) {
    return tProvider("provider.companyDefaultWith", {
      label: providerOptionLabel(companyDefault),
    });
  }
  return providerOptionLabel(provider);
}

export function resolveEffectiveAiProviderLabel(
  agentProvider: string | null | undefined,
  departmentProvider: string | null | undefined,
  companyDefault: string,
  pureLocalMode = false,
): string {
  if (pureLocalMode) {
    return tProvider("provider.mock");
  }
  if (agentProvider && agentProvider !== AI_PROVIDER_DEFAULT) {
    return providerOptionLabel(agentProvider);
  }
  if (departmentProvider && departmentProvider !== AI_PROVIDER_DEFAULT) {
    return tProvider("provider.deptSuffix", {
      label: providerOptionLabel(departmentProvider),
    });
  }
  return aiProviderLabel(null, companyDefault);
}
