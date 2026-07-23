import {
  spawn,
  type ChildProcess,
  type SpawnOptions,
} from "node:child_process";
import { randomUUID } from "node:crypto";

/** Matches Grok shell default (`DEFAULT_OUTPUT_BYTE_LIMIT`). */
export const DEFAULT_OUTPUT_BYTE_LIMIT = 30_000;

export type TerminalExitStatus = {
  exitCode: number | null;
  signal: string | null;
};

export type TerminalOutputSnapshot = {
  output: string;
  truncated: boolean;
  exitStatus: TerminalExitStatus | null;
};

export type CreateTerminalParams = {
  sessionId: string;
  command: string;
  args?: string[];
  env?: Array<{ name: string; value: string }>;
  cwd?: string | null;
  outputByteLimit?: number | null;
  /** Fallback cwd when params.cwd is omitted. */
  defaultCwd?: string | null;
};

type ManagedTerminal = {
  id: string;
  sessionId: string;
  child: ChildProcess;
  chunks: Buffer[];
  byteLength: number;
  truncated: boolean;
  byteLimit: number;
  exitStatus: TerminalExitStatus | null;
  waiters: Array<(status: TerminalExitStatus) => void>;
  killed: boolean;
};

/**
 * In-process ACP terminal host for Desktop.
 * Implements terminal/create|output|wait_for_exit|kill|release.
 */
export class TerminalHost {
  private terminals = new Map<string, ManagedTerminal>();

  create(params: CreateTerminalParams): { terminalId: string } {
    const command = String(params.command || "").trim();
    if (!command) {
      throw invalidParams("command is required");
    }

    const args = Array.isArray(params.args) ? params.args.map(String) : [];
    const cwd =
      (params.cwd && String(params.cwd).trim()) ||
      (params.defaultCwd && String(params.defaultCwd).trim()) ||
      process.cwd();
    const byteLimit =
      typeof params.outputByteLimit === "number" && params.outputByteLimit > 0
        ? Math.floor(params.outputByteLimit)
        : DEFAULT_OUTPUT_BYTE_LIMIT;

    const env: NodeJS.ProcessEnv = { ...process.env };
    if (Array.isArray(params.env)) {
      for (const item of params.env) {
        if (item && typeof item.name === "string") {
          env[item.name] = String(item.value ?? "");
        }
      }
    }

    const child = spawnCommand(command, args, cwd, env);
    const terminalId = randomUUID();
    const entry: ManagedTerminal = {
      id: terminalId,
      sessionId: String(params.sessionId || ""),
      child,
      chunks: [],
      byteLength: 0,
      truncated: false,
      byteLimit,
      exitStatus: null,
      waiters: [],
      killed: false,
    };

    const onChunk = (buf: Buffer) => {
      this.appendOutput(entry, buf);
    };
    child.stdout?.on("data", onChunk);
    child.stderr?.on("data", onChunk);

    child.on("error", (err) => {
      this.appendOutput(
        entry,
        Buffer.from(`\n[spawn error] ${err.message}\n`, "utf8"),
      );
      this.finish(entry, { exitCode: 1, signal: null });
    });

    child.on("close", (code, signal) => {
      this.finish(entry, {
        exitCode: typeof code === "number" ? code : null,
        signal: signal ? String(signal) : null,
      });
    });

    this.terminals.set(terminalId, entry);
    return { terminalId };
  }

  output(terminalId: string): TerminalOutputSnapshot {
    const entry = this.require(terminalId);
    return {
      output: Buffer.concat(entry.chunks).toString("utf8"),
      truncated: entry.truncated,
      exitStatus: entry.exitStatus,
    };
  }

  async waitForExit(terminalId: string): Promise<TerminalExitStatus> {
    const entry = this.require(terminalId);
    if (entry.exitStatus) {
      return entry.exitStatus;
    }
    return new Promise<TerminalExitStatus>((resolve) => {
      entry.waiters.push(resolve);
    });
  }

  kill(terminalId: string): Record<string, never> {
    const entry = this.require(terminalId);
    if (entry.exitStatus) {
      return {};
    }
    entry.killed = true;
    try {
      entry.child.kill("SIGTERM");
    } catch {
      /* ignore */
    }
    // Escalate if still alive shortly after.
    setTimeout(() => {
      if (!entry.exitStatus) {
        try {
          entry.child.kill("SIGKILL");
        } catch {
          /* ignore */
        }
      }
    }, 1500).unref?.();
    return {};
  }

  release(terminalId: string): Record<string, never> {
    const entry = this.terminals.get(terminalId);
    if (!entry) {
      // Idempotent: already gone is OK.
      return {};
    }
    if (!entry.exitStatus) {
      entry.killed = true;
      try {
        entry.child.kill("SIGKILL");
      } catch {
        /* ignore */
      }
      this.finish(entry, { exitCode: null, signal: "SIGKILL" });
    }
    this.terminals.delete(terminalId);
    return {};
  }

  /** Tear down every terminal (ACP process stop / app quit). */
  releaseAll(): void {
    for (const id of [...this.terminals.keys()]) {
      this.release(id);
    }
  }

  private require(terminalId: string): ManagedTerminal {
    const entry = this.terminals.get(terminalId);
    if (!entry) {
      throw resourceNotFound(`terminal not found: ${terminalId}`);
    }
    return entry;
  }

  private appendOutput(entry: ManagedTerminal, buf: Buffer): void {
    if (!buf.length) return;
    entry.chunks.push(buf);
    entry.byteLength += buf.length;
    if (entry.byteLength <= entry.byteLimit) return;

    // Truncate from the beginning at a UTF-8 character boundary.
    let combined = Buffer.concat(entry.chunks);
    const overflow = combined.length - entry.byteLimit;
    let start = Math.max(0, overflow);
    // Skip continuation bytes (10xxxxxx) so we land on a code-point start.
    while (start < combined.length && (combined[start]! & 0xc0) === 0x80) {
      start += 1;
    }
    combined = combined.subarray(start);
    entry.chunks = [combined];
    entry.byteLength = combined.length;
    entry.truncated = true;
  }

  private finish(entry: ManagedTerminal, status: TerminalExitStatus): void {
    if (entry.exitStatus) return;
    entry.exitStatus = status;
    const waiters = entry.waiters.splice(0, entry.waiters.length);
    for (const w of waiters) w(status);
  }
}

export class RpcHandlerError extends Error {
  code: number;
  data?: unknown;

  constructor(code: number, message: string, data?: unknown) {
    super(message);
    this.name = "RpcHandlerError";
    this.code = code;
    this.data = data;
  }
}

export function invalidParams(message: string): RpcHandlerError {
  return new RpcHandlerError(-32602, message);
}

export function resourceNotFound(message: string): RpcHandlerError {
  return new RpcHandlerError(-32002, message);
}

export function internalError(message: string): RpcHandlerError {
  return new RpcHandlerError(-32603, message);
}

function spawnCommand(
  command: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
): ChildProcess {
  const opts: SpawnOptions = {
    cwd,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  };

  // Non-empty args → spawn program with argv preserved.
  // Empty args → treat command as a shell snippet (matches Grok shell).
  if (args.length > 0) {
    return spawn(command, args, opts);
  }

  if (process.platform === "win32") {
    return spawn("cmd.exe", ["/d", "/s", "/c", command], opts);
  }

  const shell = process.env.SHELL || "/bin/bash";
  return spawn(shell, ["-c", command], opts);
}
