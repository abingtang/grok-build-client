import type { Locale, MessageParams, MessageTree, TranslateFn } from "./types";
import zh from "./locales/zh";
import en from "./locales/en";

export const LOCALES: Locale[] = ["zh", "en"];

export const LOCALE_STORAGE_KEY = "gbd-locale";

const catalogs: Record<Locale, MessageTree> = { zh, en };

function lookup(tree: MessageTree, key: string): string | undefined {
  const parts = key.split(".");
  let cur: string | MessageTree | undefined = tree;
  for (const part of parts) {
    if (cur == null || typeof cur === "string") return undefined;
    cur = cur[part];
  }
  return typeof cur === "string" ? cur : undefined;
}

export function interpolate(
  template: string,
  params?: MessageParams,
): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => {
    const v = params[name];
    return v === undefined || v === null ? `{${name}}` : String(v);
  });
}

export function createTranslator(locale: Locale): TranslateFn {
  const primary = catalogs[locale] || catalogs.zh;
  const fallback = catalogs.zh;
  return (key: string, params?: MessageParams) => {
    const raw =
      lookup(primary, key) ?? lookup(fallback, key) ?? key;
    return interpolate(raw, params);
  };
}

export function isLocale(value: unknown): value is Locale {
  return value === "zh" || value === "en";
}

/** Browser / OS preference when no saved choice. */
export function detectLocale(): Locale {
  try {
    const saved = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (isLocale(saved)) return saved;
  } catch {
    /* ignore */
  }
  try {
    const nav = navigator.language || "";
    if (nav.toLowerCase().startsWith("zh")) return "zh";
  } catch {
    /* ignore */
  }
  return "en";
}

export function persistLocale(locale: Locale): void {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    /* ignore */
  }
}
