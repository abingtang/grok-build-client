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
  if (config.experimentalMemory) args.push("--experimental-memory");
  if (!config.webSearchEnabled) args.push("--disable-web-search");
  // Official: --no-subagents cannot combine with --best-of-n
  if (!config.subagentsEnabled && config.bestOfN <= 1) {
    args.push("--no-subagents");
  }
  if (config.selfCheck) args.push("--check");
  args.push("--max-turns", "12");
  if (config.cwd.trim()) {
    args.push("--cwd", config.cwd.trim());
  }
  if (config.resumeSessionId) {
    args.push("--resume", config.resumeSessionId);
  } else if (config.continueConversation) {
    args.push("-c");
  }
  return args;
}
