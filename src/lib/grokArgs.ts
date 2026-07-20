/**
 * Official Grok Build CLI flags for headless streaming.
 * Only maps real `grok` options — no custom workflow/presets.
 */
export type EffortLevel = "low" | "medium" | "high" | "xhigh" | "max";
export type ReasoningEffort =
  | "off"
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
  effortLevel: EffortLevel;
  reasoningEffort: ReasoningEffort;
  /** Maps to --always-approve */
  alwaysApprove: boolean;
  permissionMode: PermissionMode;
  bestOfN: number;
  experimentalMemory: boolean;
  webSearchEnabled: boolean;
  subagentsEnabled: boolean;
  selfCheck: boolean;
  /** Project working directory → --cwd */
  cwd: string;
  continueConversation: boolean;
  /** Resume a specific session → --resume */
  resumeSessionId?: string | null;
  /**
   * Max agent turns (`--max-turns`). Official default is unlimited-ish;
   * desktop default 48 (was hard-coded 12, too low for real tasks).
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
}

/** Build CLI args for headless `--output-format streaming-json`. */
export function buildGrokArgs(config: GrokRunConfig): string[] {
  const args: string[] = [
    "--no-alt-screen",
    "--output-format",
    "streaming-json",
  ];
  if (config.activeModel) args.push("--model", config.activeModel);
  if (config.effortLevel) args.push("--effort", config.effortLevel);
  if (config.reasoningEffort && config.reasoningEffort !== "off") {
    // Official max for --reasoning-effort is xhigh
    const r =
      config.reasoningEffort === "max" ? "xhigh" : config.reasoningEffort;
    args.push("--reasoning-effort", r);
  }
  if (config.alwaysApprove) {
    args.push("--always-approve");
  } else if (config.permissionMode && config.permissionMode !== "default") {
    args.push("--permission-mode", config.permissionMode);
  }
  if (config.bestOfN > 1) args.push("--best-of-n", String(config.bestOfN));
  if (config.experimentalMemory) {
    args.push("--experimental-memory");
  } else if (config.noMemory) {
    args.push("--no-memory");
  }
  if (!config.webSearchEnabled) args.push("--disable-web-search");
  // Official: --no-subagents cannot combine with --best-of-n
  if (!config.subagentsEnabled && config.bestOfN <= 1) {
    args.push("--no-subagents");
  }
  if (config.selfCheck) args.push("--check");
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
