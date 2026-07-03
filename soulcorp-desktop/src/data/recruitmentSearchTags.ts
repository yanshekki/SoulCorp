export const GLOBAL_RECRUITMENT_TAGS = [
  "design",
  "marketing",
  "writer",
  "analyst",
  "verified",
  "leadership",
] as const;

export const PRESET_RECRUITMENT_TAGS: Record<string, readonly string[]> = {
  mira: ["coding", "react", "backend", "AI", "typescript", "engineer"],
  kai: ["HR", "people", "culture", "recruiting", "wellness", "facilitator"],
  ren: ["strategy", "operations", "executive", "COO", "planning", "systems"],
};

export function quickTagsForPreset(presetId: string): string[] {
  const presetTags = PRESET_RECRUITMENT_TAGS[presetId] ?? [];
  const merged = [...presetTags, ...GLOBAL_RECRUITMENT_TAGS];
  return [...new Set(merged)];
}