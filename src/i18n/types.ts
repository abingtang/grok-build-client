export type Locale = "zh" | "en";

export type MessageParams = Record<string, string | number>;

export type TranslateFn = (key: string, params?: MessageParams) => string;

/** Nested string dictionary; leaves are message templates. */
export type MessageTree = {
  [key: string]: string | MessageTree;
};
