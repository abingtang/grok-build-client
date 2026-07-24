/**
 * Custom theme configuration for Grok Build Client (Codex-style appearance).
 *
 * User-facing "accent" maps to --brand (CTA/brand), NOT shadcn --accent
 * (which remains a hover/highlight surface derived from background steps).
 */

export const THEME_CUSTOM_LS_KEY = "gbd-theme-custom";

export type ThemeMode = "dark" | "light";

export type ThemeCustomConfig = {
  /**
   * Legacy flag (always treated as true). Kept for localStorage compat.
   * Palette is always applied; light/dark each persist their own colors.
   */
  enabled: boolean;
  /** Brand / CTA color → --brand */
  accent: string;
  background: string;
  foreground: string;
  uiFont: string;
  codeFont: string;
  translucentSidebar: boolean;
  /** 0–100; default 85 */
  contrast: number;
};

export type ThemeCustomStore = {
  dark: ThemeCustomConfig;
  light: ThemeCustomConfig;
};

/** CSS vars we set/clear when applying custom themes */
const CUSTOM_CSS_VARS = [
  "--bg-0",
  "--bg-1",
  "--bg-2",
  "--bg-3",
  "--bg-4",
  "--text-1",
  "--text-2",
  "--text-3",
  "--text-4",
  "--border",
  "--border-2",
  "--border-strong",
  "--brand",
  "--accent-soft",
  "--accent-line",
  "--accent-ink",
  "--accent",
  "--accent-foreground",
  "--popover",
  "--popover-foreground",
  "--primary",
  "--primary-foreground",
  "--muted",
  "--muted-foreground",
  "--secondary",
  "--secondary-foreground",
  "--background",
  "--foreground",
  "--card",
  "--card-foreground",
  "--input",
  "--ring",
  "--bg",
  "--bg-elevated",
  "--bg-panel",
  "--bg-hover",
  "--bg-active",
  "--text",
  "--text-muted",
  "--text-dim",
  "--sidebar-bg",
  "--font",
  "--mono",
  /* Tailwind theme bridges (set so utilities track custom fonts) */
  "--font-sans",
  "--font-mono",
] as const;

/** System UI stack — always used (font pickers removed from settings). */
export const DEFAULT_UI_FONT =
  'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Helvetica Neue", sans-serif';
export const DEFAULT_CODE_FONT =
  'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Monaco, Consolas, monospace';

/** Default dark palette = Graphite (first preset). Always applied. */
export const DEFAULT_THEME_DARK: ThemeCustomConfig = {
  enabled: true,
  accent: "#ECE9E2",
  background: "#0A0A0A",
  foreground: "#ECE9E2",
  uiFont: DEFAULT_UI_FONT,
  codeFont: DEFAULT_CODE_FONT,
  translucentSidebar: false,
  contrast: 85,
};

/** Default light palette = Graphite Light (first light preset). Always applied. */
export const DEFAULT_THEME_LIGHT: ThemeCustomConfig = {
  enabled: true,
  accent: "#20201D",
  background: "#F4F4F1",
  foreground: "#20201D",
  uiFont: DEFAULT_UI_FONT,
  codeFont: DEFAULT_CODE_FONT,
  translucentSidebar: false,
  contrast: 85,
};

export const DEFAULT_THEME_STORE: ThemeCustomStore = {
  dark: { ...DEFAULT_THEME_DARK },
  light: { ...DEFAULT_THEME_LIGHT },
};

/**
 * Curated UI presets from popular open-source / VS Code themes
 * (colors sourced via @shikijs/themes already in this project).
 * Maps to accent / background / foreground only; fonts stay user-controlled.
 */
export type ThemePreset = {
  id: string;
  label: string;
  mode: ThemeMode | "both";
  accent: string;
  background: string;
  foreground: string;
  contrast?: number;
};

export const THEME_PRESETS: ThemePreset[] = [
  // Built-in defaults — always first in each mode list
  {
    id: "graphite-dark",
    label: "Default",
    mode: "dark",
    accent: "#ECE9E2",
    background: "#0A0A0A",
    foreground: "#ECE9E2",
  },
  {
    id: "graphite-light",
    label: "Default",
    mode: "light",
    accent: "#20201D",
    background: "#F4F4F1",
    foreground: "#20201D",
  },
  // Catppuccin — https://github.com/catppuccin/catppuccin
  {
    id: "catppuccin-mocha",
    label: "Catppuccin Mocha",
    mode: "dark",
    accent: "#CBA6F7",
    background: "#1E1E2E",
    foreground: "#CDD6F4",
  },
  {
    id: "catppuccin-macchiato",
    label: "Catppuccin Macchiato",
    mode: "dark",
    accent: "#C6A0F6",
    background: "#24273A",
    foreground: "#CAD3F5",
  },
  {
    id: "catppuccin-frappe",
    label: "Catppuccin Frappé",
    mode: "dark",
    accent: "#CA9EE6",
    background: "#303446",
    foreground: "#C6D0F5",
  },
  {
    id: "catppuccin-latte",
    label: "Catppuccin Latte",
    mode: "light",
    accent: "#8839EF",
    background: "#EFF1F5",
    foreground: "#4C4F69",
  },
  // Dracula — https://github.com/dracula/dracula-theme
  {
    id: "dracula",
    label: "Dracula",
    mode: "dark",
    accent: "#FF79C6",
    background: "#282A36",
    foreground: "#F8F8F2",
  },
  // Nord — https://github.com/nordtheme/nord
  {
    id: "nord",
    label: "Nord",
    mode: "dark",
    accent: "#88C0D0",
    background: "#2E3440",
    foreground: "#D8DEE9",
  },
  // One Dark Pro / Atom
  {
    id: "one-dark-pro",
    label: "One Dark Pro",
    mode: "dark",
    accent: "#4D78CC",
    background: "#282C34",
    foreground: "#ABB2BF",
  },
  // Tokyo Night
  {
    id: "tokyo-night",
    label: "Tokyo Night",
    mode: "dark",
    accent: "#7AA2F7",
    background: "#1A1B26",
    foreground: "#A9B1D6",
  },
  // GitHub
  {
    id: "github-dark",
    label: "GitHub Dark",
    mode: "dark",
    accent: "#2F81F7",
    background: "#0D1117",
    foreground: "#E6EDF3",
  },
  {
    id: "github-light",
    label: "GitHub Light",
    mode: "light",
    accent: "#0969DA",
    background: "#FFFFFF",
    foreground: "#1F2328",
  },
  // Solarized
  {
    id: "solarized-dark",
    label: "Solarized Dark",
    mode: "dark",
    accent: "#2AA198",
    background: "#002B36",
    foreground: "#839496",
  },
  {
    id: "solarized-light",
    label: "Solarized Light",
    mode: "light",
    accent: "#B58900",
    background: "#FDF6E3",
    foreground: "#657B83",
  },
  // Gruvbox
  {
    id: "gruvbox-dark",
    label: "Gruvbox Dark",
    mode: "dark",
    accent: "#FE8019",
    background: "#282828",
    foreground: "#EBDBB2",
  },
  {
    id: "gruvbox-light",
    label: "Gruvbox Light",
    mode: "light",
    accent: "#AF3A03",
    background: "#FBF1C7",
    foreground: "#3C3836",
  },
  // Rosé Pine
  {
    id: "rose-pine",
    label: "Rosé Pine",
    mode: "dark",
    accent: "#EBBCBA",
    background: "#191724",
    foreground: "#E0DEF4",
  },
  {
    id: "rose-pine-dawn",
    label: "Rosé Pine Dawn",
    mode: "light",
    accent: "#D7827E",
    background: "#FAF4ED",
    foreground: "#575279",
  },
  // Everforest
  {
    id: "everforest-dark",
    label: "Everforest Dark",
    mode: "dark",
    accent: "#A7C080",
    background: "#2D353B",
    foreground: "#D3C6AA",
  },
  {
    id: "everforest-light",
    label: "Everforest Light",
    mode: "light",
    accent: "#8DA101",
    background: "#FDF6E3",
    foreground: "#5C6A72",
  },
  // Ayu
  {
    id: "ayu-dark",
    label: "Ayu Dark",
    mode: "dark",
    accent: "#E6B450",
    background: "#0B0E14",
    foreground: "#BFBDB6",
  },
  {
    id: "ayu-light",
    label: "Ayu Light",
    mode: "light",
    accent: "#F29718",
    background: "#FCFCFC",
    foreground: "#5C6166",
  },
  // Vitesse (Anthony Fu)
  {
    id: "vitesse-dark",
    label: "Vitesse Dark",
    mode: "dark",
    accent: "#4D9375",
    background: "#121212",
    foreground: "#DBD7CA",
  },
  {
    id: "vitesse-light",
    label: "Vitesse Light",
    mode: "light",
    accent: "#1C6B48",
    background: "#FFFFFF",
    foreground: "#393A34",
  },
  // Kanagawa
  {
    id: "kanagawa-wave",
    label: "Kanagawa Wave",
    mode: "dark",
    accent: "#7E9CD8",
    background: "#1F1F28",
    foreground: "#DCD7BA",
  },
  {
    id: "kanagawa-lotus",
    label: "Kanagawa Lotus",
    mode: "light",
    accent: "#5A7785",
    background: "#F2ECBC",
    foreground: "#545464",
  },
  // Material
  {
    id: "material-darker",
    label: "Material Darker",
    mode: "dark",
    accent: "#80CBC4",
    background: "#212121",
    foreground: "#EEFFFF",
  },
  {
    id: "material-lighter",
    label: "Material Lighter",
    mode: "light",
    accent: "#39ADB5",
    background: "#FAFAFA",
    foreground: "#546E7A",
  },
];

export function presetsForMode(mode: ThemeMode): ThemePreset[] {
  return THEME_PRESETS.filter((p) => p.mode === mode || p.mode === "both");
}

export function applyThemePreset(
  preset: ThemePreset,
  base: ThemeCustomConfig,
): ThemeCustomConfig {
  return {
    ...base,
    enabled: true,
    accent: normalizeHex(preset.accent) || base.accent,
    background: normalizeHex(preset.background) || base.background,
    foreground: normalizeHex(preset.foreground) || base.foreground,
    contrast: preset.contrast ?? base.contrast ?? 85,
  };
}

/** Match current colors to a known preset; "custom" if user tweaked colors. */
export function matchThemePresetId(
  config: ThemeCustomConfig,
  mode: ThemeMode,
): string {
  const a = normalizeHex(config.accent);
  const b = normalizeHex(config.background);
  const f = normalizeHex(config.foreground);
  if (!a || !b || !f) {
    return mode === "light" ? "graphite-light" : "graphite-dark";
  }
  const hit = presetsForMode(mode).find((p) => {
    const pa = normalizeHex(p.accent);
    const pb = normalizeHex(p.background);
    const pf = normalizeHex(p.foreground);
    return pa === a && pb === b && pf === f;
  });
  return hit?.id ?? "custom";
}

export function normalizeHex(input: string): string | null {
  const raw = input.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(raw)) {
    const expanded = raw
      .split("")
      .map((c) => c + c)
      .join("");
    return `#${expanded.toUpperCase()}`;
  }
  // 8-digit with alpha → keep RGB only
  if (/^[0-9a-fA-F]{8}$/.test(raw)) {
    return `#${raw.slice(0, 6).toUpperCase()}`;
  }
  if (/^[0-9a-fA-F]{6}$/.test(raw)) {
    return `#${raw.toUpperCase()}`;
  }
  return null;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function parseRgb(hex: string): { r: number; g: number; b: number } | null {
  const n = normalizeHex(hex);
  if (!n) return null;
  const v = n.slice(1);
  return {
    r: parseInt(v.slice(0, 2), 16),
    g: parseInt(v.slice(2, 4), 16),
    b: parseInt(v.slice(4, 6), 16),
  };
}

function toHex(r: number, g: number, b: number): string {
  const h = (n: number) =>
    clamp(Math.round(n), 0, 255).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`.toUpperCase();
}

function mix(
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number },
  t: number,
): { r: number; g: number; b: number } {
  const u = clamp(t, 0, 1);
  return {
    r: a.r + (b.r - a.r) * u,
    g: a.g + (b.g - a.g) * u,
    b: a.b + (b.b - a.b) * u,
  };
}

function relativeLuminance(c: { r: number; g: number; b: number }): number {
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const r = lin(c.r);
  const g = lin(c.g);
  const b = lin(c.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function inkFor(c: { r: number; g: number; b: number }): string {
  return relativeLuminance(c) > 0.45 ? "#131313" : "#FFFFFF";
}

function sanitizeConfig(
  partial: Partial<ThemeCustomConfig> | null | undefined,
  fallback: ThemeCustomConfig,
): ThemeCustomConfig {
  const base = { ...fallback, ...(partial || {}) };
  const accent = normalizeHex(String(base.accent || "")) || fallback.accent;
  const background =
    normalizeHex(String(base.background || "")) || fallback.background;
  const foreground =
    normalizeHex(String(base.foreground || "")) || fallback.foreground;
  const contrast = clamp(Number(base.contrast) || fallback.contrast, 40, 100);
  return {
    // Always on — selecting a palette always applies & persists per mode.
    enabled: true,
    accent,
    background,
    foreground,
    // Always system fonts — UI no longer exposes font pickers.
    uiFont: DEFAULT_UI_FONT,
    codeFont: DEFAULT_CODE_FONT,
    translucentSidebar: Boolean(base.translucentSidebar),
    contrast,
  };
}

export function loadThemeCustomStore(): ThemeCustomStore {
  try {
    const raw = localStorage.getItem(THEME_CUSTOM_LS_KEY);
    if (!raw) return {
      dark: { ...DEFAULT_THEME_DARK },
      light: { ...DEFAULT_THEME_LIGHT },
    };
    const parsed = JSON.parse(raw) as Partial<ThemeCustomStore> &
      Partial<ThemeCustomConfig>;
    // Support legacy flat config (single object without dark/light)
    if (parsed && (parsed.dark || parsed.light)) {
      return {
        dark: sanitizeConfig(parsed.dark, DEFAULT_THEME_DARK),
        light: sanitizeConfig(parsed.light, DEFAULT_THEME_LIGHT),
      };
    }
    if (parsed && ("accent" in parsed || "background" in parsed)) {
      const one = sanitizeConfig(parsed as Partial<ThemeCustomConfig>, DEFAULT_THEME_DARK);
      return {
        dark: { ...one },
        light: sanitizeConfig(parsed as Partial<ThemeCustomConfig>, DEFAULT_THEME_LIGHT),
      };
    }
  } catch {
    /* ignore */
  }
  return {
    dark: { ...DEFAULT_THEME_DARK },
    light: { ...DEFAULT_THEME_LIGHT },
  };
}

export function saveThemeCustomStore(store: ThemeCustomStore): void {
  try {
    localStorage.setItem(
      THEME_CUSTOM_LS_KEY,
      JSON.stringify({
        dark: sanitizeConfig(store.dark, DEFAULT_THEME_DARK),
        light: sanitizeConfig(store.light, DEFAULT_THEME_LIGHT),
      }),
    );
  } catch {
    /* ignore quota */
  }
}

export function deriveTokenMap(
  config: ThemeCustomConfig,
  _mode: ThemeMode,
): Record<string, string> {
  const bg = parseRgb(config.background) || parseRgb(DEFAULT_THEME_DARK.background)!;
  const fg = parseRgb(config.foreground) || parseRgb(DEFAULT_THEME_DARK.foreground)!;
  const ac = parseRgb(config.accent) || parseRgb(DEFAULT_THEME_DARK.accent)!;
  // contrast 40–100 → scale 0.55–1.15 for step size
  const c = clamp(config.contrast, 40, 100) / 100;
  const step = 0.035 + c * 0.07;

  const bg0 = bg;
  const bg1 = mix(bg, fg, step * 0.9);
  const bg2 = mix(bg, fg, step * 1.5);
  const bg3 = mix(bg, fg, step * 2.2);
  const bg4 = mix(bg, fg, step * 3.0);

  const textFade = 0.28 + (1 - c) * 0.22;
  const text1 = fg;
  const text2 = mix(fg, bg, textFade);
  const text3 = mix(fg, bg, textFade + 0.12);
  const text4 = mix(fg, bg, textFade + 0.2);

  const border = mix(bg, fg, step * 2.4);
  const border2 = mix(bg, fg, step * 3.2);
  const borderStrong = mix(bg, fg, step * 4.2);
  const ring = mix(fg, bg, 0.45);

  const brand = ac;
  const brandInk = inkFor(ac);
  const brandSoft = `rgba(${Math.round(ac.r)}, ${Math.round(ac.g)}, ${Math.round(ac.b)}, 0.1)`;
  const brandLine = `rgba(${Math.round(ac.r)}, ${Math.round(ac.g)}, ${Math.round(ac.b)}, 0.22)`;

  const h = (x: { r: number; g: number; b: number }) => toHex(x.r, x.g, x.b);

  return {
    "--bg-0": h(bg0),
    "--bg-1": h(bg1),
    "--bg-2": h(bg2),
    "--bg-3": h(bg3),
    "--bg-4": h(bg4),
    "--text-1": h(text1),
    "--text-2": h(text2),
    "--text-3": h(text3),
    "--text-4": h(text4),
    "--border": h(border),
    "--border-2": h(border2),
    "--border-strong": h(borderStrong),
    "--brand": h(brand),
    "--accent-soft": brandSoft,
    "--accent-line": brandLine,
    "--accent-ink": brandInk,
    // shadcn hover surface — NOT brand
    "--accent": h(bg4),
    "--accent-foreground": h(text1),
    "--popover": h(bg2),
    "--popover-foreground": h(text1),
    "--primary": h(brand),
    "--primary-foreground": brandInk,
    "--muted": h(bg3),
    "--muted-foreground": h(text2),
    "--secondary": h(bg3),
    "--secondary-foreground": h(text1),
    "--background": h(bg0),
    "--foreground": h(text1),
    "--card": h(bg1),
    "--card-foreground": h(text1),
    "--input": h(border2),
    "--ring": h(ring),
    "--bg": h(bg0),
    "--bg-elevated": h(bg2),
    "--bg-panel": h(bg1),
    "--bg-hover": h(bg3),
    "--bg-active": h(bg4),
    "--text": h(text1),
    "--text-muted": h(text2),
    "--text-dim": h(text3),
    "--sidebar-bg": h(bg1),
    // Fonts always come from app.css system defaults — do not override here.
  };
}

const FONT_CSS_VARS = ["--font", "--mono", "--font-sans", "--font-mono"] as const;

export function clearCustomThemeVars(root: HTMLElement = document.documentElement): void {
  for (const key of CUSTOM_CSS_VARS) {
    root.style.removeProperty(key);
  }
  root.removeAttribute("data-sidebar-glass");
}

function clearInlineFonts(root: HTMLElement): void {
  for (const key of FONT_CSS_VARS) {
    root.style.removeProperty(key);
  }
}

function applyGlass(config: ThemeCustomConfig, root: HTMLElement): void {
  if (config.translucentSidebar) {
    root.setAttribute("data-sidebar-glass", "1");
  } else {
    root.removeAttribute("data-sidebar-glass");
  }
}

export function applyThemeCustom(
  config: ThemeCustomConfig,
  mode: ThemeMode,
  root: HTMLElement = document.documentElement,
): void {
  // Always use CSS-defined system fonts (strip any legacy inline overrides).
  clearInlineFonts(root);

  // Always apply palette for the active mode (light/dark each store their own).
  const tokens = deriveTokenMap(config, mode);
  for (const [key, value] of Object.entries(tokens)) {
    root.style.setProperty(key, value);
  }
  applyGlass(config, root);
}

export function exportThemeJson(config: ThemeCustomConfig): string {
  const clean = sanitizeConfig(config, DEFAULT_THEME_DARK);
  return JSON.stringify(
    {
      accent: clean.accent,
      background: clean.background,
      foreground: clean.foreground,
      translucentSidebar: clean.translucentSidebar,
      contrast: clean.contrast,
    },
    null,
    2,
  );
}

export function parseThemeImport(
  raw: string,
  fallback: ThemeCustomConfig,
): { ok: true; config: ThemeCustomConfig } | { ok: false; error: string } {
  try {
    const parsed = JSON.parse(raw) as Partial<ThemeCustomConfig>;
    if (!parsed || typeof parsed !== "object") {
      return { ok: false, error: "invalid" };
    }
    const config = sanitizeConfig({ ...parsed, enabled: true }, fallback);
    return { ok: true, config };
  } catch {
    return { ok: false, error: "invalid" };
  }
}

export function resetThemeConfig(mode: ThemeMode): ThemeCustomConfig {
  return mode === "light"
    ? { ...DEFAULT_THEME_LIGHT }
    : { ...DEFAULT_THEME_DARK };
}
