import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import { useGameStore } from "../stores/gameStore";
import {
  dateLocaleForLanguage,
  languageFromSettings,
  translate,
  type AppLanguage,
  type TranslationParams,
} from "./index";

interface I18nContextValue {
  language: AppLanguage;
  locale: string;
  t: (key: string, params?: TranslationParams) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const appLanguage = useGameStore((state) => state.settings.app_language);
  const language = useMemo(() => languageFromSettings({ app_language: appLanguage }), [appLanguage]);
  const locale = useMemo(() => dateLocaleForLanguage(language), [language]);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const t = useCallback(
    (key: string, params?: TranslationParams) => translate(language, key, params),
    [language],
  );

  const value = useMemo(() => ({ language, locale, t }), [language, locale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    // Safe fallback when used outside provider (tests / early boot).
    const language = parseFallbackLanguage();
    return {
      language,
      locale: dateLocaleForLanguage(language),
      t: (key, params) => translate(language, key, params),
    };
  }
  return ctx;
}

function parseFallbackLanguage(): AppLanguage {
  try {
    return languageFromSettings({
      app_language: useGameStore.getState().settings.app_language,
    });
  } catch {
    return "en";
  }
}
