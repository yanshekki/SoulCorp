import { en } from "./catalogs/en";
import { zhHans } from "./catalogs/zh-Hans";
import { zhHant } from "./catalogs/zh-Hant";
import type { AppLanguage, MessageCatalog, TranslationParams } from "./types";
import { parseAppLanguage } from "./types";

export type { AppLanguage, TranslationParams } from "./types";
export {
  APP_LANGUAGES,
  dateLocaleForLanguage,
  parseAppLanguage,
} from "./types";

const CATALOGS: Record<AppLanguage, MessageCatalog> = {
  en,
  "zh-Hant": zhHant,
  "zh-Hans": zhHans,
};

export function catalogFor(language: AppLanguage): MessageCatalog {
  return CATALOGS[language] ?? en;
}

export function translate(
  language: AppLanguage,
  key: string,
  params?: TranslationParams,
): string {
  const catalog = catalogFor(language);
  let text = catalog[key] ?? en[key] ?? key;
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      if (value == null) {
        continue;
      }
      text = text.split(`{${name}}`).join(String(value));
    }
  }
  return text;
}

export function languageFromSettings(settings: { app_language?: string } | null | undefined): AppLanguage {
  return parseAppLanguage(settings?.app_language);
}
