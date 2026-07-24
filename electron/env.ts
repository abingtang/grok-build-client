import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function getGrokHome(): string {
  return process.env.GROK_HOME || path.join(os.homedir(), ".grok");
}

export function getGrokBinaryCandidates(
  platform: NodeJS.Platform = process.platform,
  home = os.homedir(),
  grokHome = getGrokHome(),
): string[] {
  if (platform === "win32") {
    return [
      path.win32.join(grokHome, "bin", "grok.exe"),
      path.win32.join(grokHome, "bin", "grok.cmd"),
    ];
  }

  return [
    path.join(grokHome, "bin", "grok"),
    path.join(home, ".local", "bin", "grok"),
    "/usr/local/bin/grok",
    "/opt/homebrew/bin/grok",
  ];
}

export function grokBinaryFallback(
  platform: NodeJS.Platform = process.platform,
): string {
  return platform === "win32" ? "grok.exe" : "grok";
}

export function resolveGrokBinary(): string {
  if (process.env.GROK_BIN && fs.existsSync(process.env.GROK_BIN)) {
    return process.env.GROK_BIN;
  }

  for (const candidate of getGrokBinaryCandidates()) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  // Fall back to PATH lookup at spawn time.
  return grokBinaryFallback();
}

/** Electron GUI apps may inherit a stripped PATH; enrich before spawn. */
export function grokSpawnEnv(
  extra: NodeJS.ProcessEnv = {},
): NodeJS.ProcessEnv {
  const extras =
    process.platform === "win32"
      ? [path.join(getGrokHome(), "bin")]
      : [
          path.join(getGrokHome(), "bin"),
          path.join(os.homedir(), ".local", "bin"),
          "/opt/homebrew/bin",
          "/usr/local/bin",
        ];
  const current = process.env.PATH || "";
  const parts = [...extras, ...current.split(path.delimiter)].filter(Boolean);
  const seen = new Set<string>();
  const pathValue = parts
    .filter((p) => {
      if (seen.has(p)) return false;
      seen.add(p);
      return true;
    })
    .join(path.delimiter);

  return {
    ...process.env,
    ...extra,
    PATH: pathValue,
    // Prefer home install for nested tools
    GROK_HOME: process.env.GROK_HOME || getGrokHome(),
  };
}

/** Product data dir (projects list, etc.). Not the same as GROK_HOME sessions. */
export const APP_DATA_DIR_NAME = ".grok-build-client";
/** Pre-rename data dir — migrated once on first launch after rebrand. */
export const APP_DATA_DIR_NAME_LEGACY = ".grok-build-desktop";

/**
 * Migrate ~/.grok-build-desktop → ~/.grok-build-client when the new dir
 * does not exist yet. Best-effort; failures fall through to creating empty dir.
 */
function migrateLegacyAppDataDir(preferred: string, legacy: string): void {
  if (fs.existsSync(preferred) || !fs.existsSync(legacy)) return;
  try {
    fs.renameSync(legacy, preferred);
    return;
  } catch {
    /* fall through to copy */
  }
  try {
    fs.mkdirSync(preferred, { recursive: true });
    for (const name of fs.readdirSync(legacy)) {
      const from = path.join(legacy, name);
      const to = path.join(preferred, name);
      if (!fs.existsSync(to)) {
        fs.copyFileSync(from, to);
      }
    }
  } catch {
    /* ignore — app can start with empty store */
  }
}

export function getAppDataDir(): string {
  const preferred = path.join(os.homedir(), APP_DATA_DIR_NAME);
  const legacy = path.join(os.homedir(), APP_DATA_DIR_NAME_LEGACY);
  migrateLegacyAppDataDir(preferred, legacy);
  fs.mkdirSync(preferred, { recursive: true });
  return preferred;
}

export function getProjectsStorePath(): string {
  return path.join(getAppDataDir(), "projects.json");
}
