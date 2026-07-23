/**
 * Official Grok Build CLI flags for headless streaming.
 * Only maps real `grok` options — no custom workflow/presets.
 *
 * Aligned with grok-build docs (14-headless-mode.md) and installed CLI help.
 * `--effort` is a visible alias of `--reasoning-effort` (same field).
 */
export type EffortLevel = "low" | "medium" | "high" | "xhigh" | "max";

/** Canonical reasoning-effort tiers from official headless docs. */
export type ReasoningEffort =
  | "off"
  | "none"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max";

export type PermissionMode =
  | "default"
  | "acceptEdits"
  | "auto"
  | "dontAsk"
  | "plan"
  | "bypassPermissions";

export interface GrokRunConfig {
  activeModel: string;
  /**
   * Primary effort control (composer UI).
   * Maps to a single `--reasoning-effort` / `--effort` flag.
   */
  effortLevel: EffortLevel;
  /**
   * Optional override when not `"off"`.
   * Prefer this over `effortLevel` when set (legacy dual-control).
   */
  reasoningEffort: ReasoningEffort;
  /** Maps to --always-approve */
  alwaysApprove: boolean;
  permissionMode: PermissionMode;
  /**
   * @deprecated Removed from CLI (was `--best-of-n`). Use skill `/best-of-n` instead.
   * Kept optional so older settings blobs don't break; ignored by `buildGrokArgs`.
   */
  bestOfN?: number;
  experimentalMemory: boolean;
  webSearchEnabled: boolean;
  subagentsEnabled: boolean;
  /**
   * @deprecated Removed from CLI (was `--check`). Use skill `/check` instead.
   * Ignored by `buildGrokArgs`.
   */
  selfCheck?: boolean;
  /** Project working directory → --cwd */
  cwd: string;
  continueConversation: boolean;
  /** Resume a specific session → --resume */
  resumeSessionId?: string | null;
  /**
   * Max agent turns (`--max-turns`). Headless-only.
   * Desktop default 48.
   */
  maxTurns?: number;
  /** `--sandbox <profile>` e.g. read-only / workspace-write */
  sandbox?: string | null;
  /** `--no-plan` */
  noPlan?: boolean;
  /** `--no-memory` when memory explicitly off */
  noMemory?: boolean;
  /**
   * Start in a git worktree: true → bare `--worktree`,
   * string → `--worktree <name>`.
   */
  worktree?: boolean | string | null;
  /** `--worktree-ref` */
  worktreeRef?: string | null;
  /** With resume/continue: `--fork-session` */
  forkSession?: boolean;
  /** With resume: `--restore-code` */
  restoreCode?: boolean;
  /** `--tools` allowlist (headless-only, comma-separated internal tool ids) */
  tools?: string | null;
  /** `--disallowed-tools` denylist (headless-only) */
  disallowedTools?: string | null;
  /** Repeatable `--allow` permission rules */
  allowRules?: string[];
  /** Repeatable `--deny` permission rules */
  denyRules?: string[];
}

/** Build CLI args for headless `--output-format streaming-json`. */
export function buildGrokArgs(config: GrokRunConfig): string[] {
  const args: string[] = [
    "--no-alt-screen",
    "--output-format",
    "streaming-json",
  ];
  if (config.activeModel) args.push("--model", config.activeModel);

  // One effort flag only (`--effort` aliases `--reasoning-effort`).
  // Official tiers: none | minimal | low | medium | high | xhigh | max
  // (model menu may accept a subset; do not silently remap max → xhigh).
  const effort =
    config.reasoningEffort && config.reasoningEffort !== "off"
      ? config.reasoningEffort
      : config.effortLevel;
  if (effort) {
    args.push("--reasoning-effort", effort);
  }

  if (config.alwaysApprove) {
    args.push("--always-approve");
  } else if (config.permissionMode && config.permissionMode !== "default") {
    args.push("--permission-mode", config.permissionMode);
  }

  if (config.experimentalMemory) {
    args.push("--experimental-memory");
  } else if (config.noMemory) {
    args.push("--no-memory");
  }
  if (!config.webSearchEnabled) args.push("--disable-web-search");
  if (!config.subagentsEnabled) {
    args.push("--no-subagents");
  }
  if (config.noPlan) args.push("--no-plan");
  if (config.sandbox && config.sandbox.trim()) {
    args.push("--sandbox", config.sandbox.trim());
  }
  const turns =
    typeof config.maxTurns === "number" && config.maxTurns > 0
      ? Math.min(Math.floor(config.maxTurns), 500)
      : 48;
  args.push("--max-turns", String(turns));
  if (config.cwd.trim()) {
    args.push("--cwd", config.cwd.trim());
  }
  if (config.worktree === true) {
    args.push("--worktree");
  } else if (typeof config.worktree === "string" && config.worktree.trim()) {
    args.push("--worktree", config.worktree.trim());
  }
  if (config.worktreeRef && config.worktreeRef.trim()) {
    args.push("--worktree-ref", config.worktreeRef.trim());
  }
  if (config.tools && config.tools.trim()) {
    args.push("--tools", config.tools.trim());
  }
  if (config.disallowedTools && config.disallowedTools.trim()) {
    args.push("--disallowed-tools", config.disallowedTools.trim());
  }
  for (const rule of config.allowRules || []) {
    if (rule.trim()) args.push("--allow", rule.trim());
  }
  for (const rule of config.denyRules || []) {
    if (rule.trim()) args.push("--deny", rule.trim());
  }
  if (config.resumeSessionId) {
    args.push("--resume", config.resumeSessionId);
    if (config.forkSession) args.push("--fork-session");
    if (config.restoreCode) args.push("--restore-code");
  } else if (config.continueConversation) {
    args.push("-c");
    if (config.forkSession) args.push("--fork-session");
  }
  return args;
}
