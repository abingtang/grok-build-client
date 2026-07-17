import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  createTranslator,
  detectLocale,
  persistLocale,
} from "./translate";
import { setRuntimeTranslator } from "./runtime";
import type { Locale, MessageParams, TranslateFn } from "./types";

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: TranslateFn;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => detectLocale());

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    persistLocale(next);
  }, []);

  const t = useMemo(() => createTranslator(locale), [locale]);

  useEffect(() => {
    setRuntimeTranslator(t);
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
  }, [locale, t]);

  const value = useMemo(
    () => ({ locale, setLocale, t }),
    [locale, setLocale, t],
  );

  return (
    <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
  );
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useI18n must be used within I18nProvider");
  }
  return ctx;
}

/** Safe t for modules that may render outside provider (tests). */
export function useT(): TranslateFn {
  return useI18n().t;
}

export type { Locale, MessageParams, TranslateFn };
