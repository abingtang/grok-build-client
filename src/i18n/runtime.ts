import { createTranslator, detectLocale } from "./translate";
import type { MessageParams, TranslateFn } from "./types";

/** Translator for non-React modules (markdown, highlight, etc.). */
let runtimeT: TranslateFn = createTranslator(detectLocale());

export function setRuntimeTranslator(t: TranslateFn): void {
  runtimeT = t;
}

export function rt(key: string, params?: MessageParams): string {
  return runtimeT(key, params);
}
