import type { TranslationParams } from "./types";

type TFn = (key: string, params?: TranslationParams) => string;

/** Translate a section id with optional fallback English label. */
export function sectionLabel(
  t: TFn,
  prefix: string,
  id: string,
  fallback?: string,
): string {
  const key = `${prefix}.section.${id}`;
  const value = t(key);
  return value === key ? (fallback ?? id) : value;
}

export function sectionHint(
  t: TFn,
  prefix: string,
  id: string,
  fallback?: string,
): string | undefined {
  const key = `${prefix}.section.${id}.hint`;
  const value = t(key);
  if (value !== key) {
    return value;
  }
  const alt = t(`${prefix}.hint.${id}`);
  if (alt !== `${prefix}.hint.${id}`) {
    return alt;
  }
  return fallback;
}

export function mapSections<T extends { id: string; label: string; hint?: string }>(
  t: TFn,
  prefix: string,
  sections: readonly T[],
): Array<{ id: string; label: string; hint?: string }> {
  return sections.map((section) => ({
    id: section.id,
    label: sectionLabel(t, prefix, section.id, section.label),
    hint: sectionHint(t, prefix, section.id, section.hint),
  }));
}
