export const AI_PROVIDER_DEFAULT = "default";

export const AI_PROVIDER_OPTIONS = [
  { value: AI_PROVIDER_DEFAULT, label: "Company default" },
  { value: "mock", label: "Mock (offline)" },
  { value: "ollama", label: "Ollama (local)" },
  { value: "openai", label: "OpenAI-compatible" },
  { value: "grok", label: "Grok (xAI)" },
  { value: "claude", label: "Claude-compatible" },
  { value: "soulmd-hub", label: "soulmd-hub API" },
] as const;

export const AGENT_AI_PROVIDER_OPTIONS = [
  { value: AI_PROVIDER_DEFAULT, label: "Department default" },
  ...AI_PROVIDER_OPTIONS.filter((option) => option.value !== AI_PROVIDER_DEFAULT),
] as const;

export type AiProviderId = (typeof AI_PROVIDER_OPTIONS)[number]["value"];

export interface DepartmentAiConfig {
  department: string;
  ai_provider?: string | null;
}

function providerOptionLabel(provider: string): string {
  return AI_PROVIDER_OPTIONS.find((option) => option.value === provider)?.label ?? provider;
}

export function aiProviderLabel(
  provider: string | null | undefined,
  companyDefault: string,
): string {
  if (!provider || provider === AI_PROVIDER_DEFAULT) {
    return `Company default · ${providerOptionLabel(companyDefault)}`;
  }
  return providerOptionLabel(provider);
}

export function resolveEffectiveAiProviderLabel(
  agentProvider: string | null | undefined,
  departmentProvider: string | null | undefined,
  companyDefault: string,
): string {
  if (agentProvider && agentProvider !== AI_PROVIDER_DEFAULT) {
    return providerOptionLabel(agentProvider);
  }
  if (departmentProvider && departmentProvider !== AI_PROVIDER_DEFAULT) {
    return `${providerOptionLabel(departmentProvider)} (dept)`;
  }
  return aiProviderLabel(null, companyDefault);
}