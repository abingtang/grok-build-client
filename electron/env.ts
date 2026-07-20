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

export function getAppDataDir(): string {
  const dir = path.join(os.homedir(), ".grok-build-desktop");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function getProjectsStorePath(): string {
  return path.join(getAppDataDir(), "projects.json");
}
