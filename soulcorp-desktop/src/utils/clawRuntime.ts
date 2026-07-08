export const CLAW_RUNTIME_MODES = [
  { id: "openclaw", label: "OpenClaw" },
  { id: "hermes", label: "Hermes" },
  { id: "ironclaw", label: "IronClaw" },
  { id: "nanoclaw", label: "NanoClaw" },
] as const;

export type ClawRuntimeId = (typeof CLAW_RUNTIME_MODES)[number]["id"];

export function isClawRuntimeMode(mode?: string | null): mode is ClawRuntimeId {
  if (!mode) {
    return false;
  }
  return CLAW_RUNTIME_MODES.some((entry) => entry.id === mode);
}

export function clawRuntimeLabel(mode?: string | null): string {
  const match = CLAW_RUNTIME_MODES.find((entry) => entry.id === mode);
  return match?.label ?? "Claw runtime";
}

export function clawBinaryPlaceholder(mode?: string | null): string {
  const binary = isClawRuntimeMode(mode) ? mode : "openclaw";
  return `${binary} (PATH) or /usr/local/bin/${binary}`;
}