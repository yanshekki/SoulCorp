export interface SoulMdValidation {
  valid: boolean;
  name: string | null;
  error: string | null;
}

export function validateSoulMd(content: string): SoulMdValidation {
  const trimmed = content.trim();
  if (trimmed.length < 8) {
    return { valid: false, name: null, error: "soul.md is too short." };
  }

  const titleLine = trimmed
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.startsWith("# "));
  if (!titleLine) {
    return { valid: false, name: null, error: "Add a title line starting with # Name." };
  }

  const name = titleLine.slice(2).trim();
  if (!name) {
    return { valid: false, name: null, error: "Agent name after # is required." };
  }

  const requiredSections = ["## Personality", "## Values", "## Communication Style"];
  for (const section of requiredSections) {
    if (!trimmed.includes(section)) {
      return { valid: false, name, error: `Missing section: ${section}` };
    }
  }

  return { valid: true, name, error: null };
}