export type AppLanguage = "en" | "zh-Hant" | "zh-Hans";

export const APP_LANGUAGES: { code: AppLanguage; label: string }[] = [
  { code: "en", label: "English" },
  { code: "zh-Hant", label: "繁體中文" },
  { code: "zh-Hans", label: "简体中文" },
];

export function parseAppLanguage(raw: string | null | undefined): AppLanguage {
  const key = (raw ?? "en").trim().toLowerCase().replace(/_/g, "-");
  if (key === "zh-hant" || key === "zh-tw" || key === "zh-hk" || key === "zh-mo") {
    return "zh-Hant";
  }
  if (key === "zh-hans" || key === "zh-cn" || key === "zh-sg" || key === "zh") {
    return "zh-Hans";
  }
  return "en";
}

export function dateLocaleForLanguage(lang: AppLanguage): string {
  switch (lang) {
    case "zh-Hant":
      return "zh-TW";
    case "zh-Hans":
      return "zh-CN";
    default:
      return "en-US";
  }
}

export type TranslationParams = Record<string, string | number | undefined | null>;

export type MessageCatalog = Record<string, string>;
