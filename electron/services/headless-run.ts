import { spawn, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";
import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { grokSpawnEnv, resolveGrokBinary } from "../env";

export type HeadlessEvent =
  | { type: "text"; data: string }
  | { type: "thought"; data: string }
  | { type: "end"; stopReason?: string; sessionId?: string; requestId?: string }
  | { type: "error"; message: string }
  | { type: "raw"; line: string };

export interface RunState {
  runId: string;
  state: "running" | "done" | "failed" | "cancelled";
  pid?: number;
  error?: string;
  sessionId?: string;
}

/**
 * One-shot headless grok run using --output-format streaming-json.
 * Headless streaming-json runner for Grok Build Client (no Tauri/SQLite).
 */
export class HeadlessRunner extends EventEmitter {
  private proc: ChildProcess | null = null;
  private activeRunId: string | null = null;
  private killed = false;

  get active(): boolean {
    return this.proc != null && this.activeRunId != null;
  }

  get runId(): string | null {
    return this.activeRunId;
  }

  async run(options: {
    args: string[];
    prompt: string;
    cwd: string;
  }): Promise<RunState> {
    if (this.proc) {
      throw new Error("A run is already in progress");
    }

    const runId = randomUUID();
    this.activeRunId = runId;
    this.killed = false;

    const bin = resolveGrokBinary();
    // Ensure -p prompt is last so flags stay valid.
    const args = [...options.args, "-p", options.prompt];

    const proc = spawn(bin, args, {
      cwd: options.cwd,
      env: grokSpawnEnv(),
      stdio: ["ignore", "pipe", "pipe"],
    });
    this.proc = proc;

    const pid = proc.pid;
    this.emit("state", {
      runId,
      state: "running",
      pid,
    } satisfies RunState);

    let stderr = "";
    proc.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
      if (stderr.length > 12_000) stderr = stderr.slice(-8_000);
      this.emit("stderr", { runId, data: chunk.toString("utf8") });
    });

    if (!proc.stdout) {
      const state: RunState = {
        runId,
        state: "failed",
        error: "Failed to open grok stdout pipe",
      };
      this.cleanup();
      this.emit("state", state);
      return state;
    }

    const rl = createInterface({ input: proc.stdout });
    rl.on("line", (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      try {
        const event = JSON.parse(trimmed) as HeadlessEvent & {
          type: string;
        };
        this.emit("event", { runId, event });
      } catch {
        this.emit("event", {
          runId,
          event: { type: "raw", line: trimmed } as HeadlessEvent,
        });
      }
    });

    return new Promise<RunState>((resolve) => {
      proc.on("error", (err) => {
        const state: RunState = {
          runId,
          state: "failed",
          error: err.message,
        };
        this.cleanup();
        this.emit("state", state);
        resolve(state);
      });

      proc.on("close", (code) => {
        rl.close();
        let state: RunState;
        if (this.killed) {
          state = { runId, state: "cancelled" };
        } else if (code === 0) {
          state = { runId, state: "done" };
        } else {
          const errLine =
            stderr
              .split("\n")
              .map((l) => l.trim())
              .filter(Boolean)
              .slice(-3)
              .join(" | ") || `grok exited with code ${code}`;
          state = {
            runId,
            state: "failed",
            error: errLine,
          };
        }
        this.cleanup();
        this.emit("state", state);
        resolve(state);
      });
    });
  }

  cancel(): boolean {
    if (!this.proc) return false;
    this.killed = true;
    try {
      this.proc.kill("SIGTERM");
      setTimeout(() => {
        try {
          this.proc?.kill("SIGKILL");
        } catch {
          /* ignore */
        }
      }, 1200).unref?.();
    } catch {
      /* ignore */
    }
    return true;
  }

  private cleanup(): void {
    this.proc = null;
    this.activeRunId = null;
  }
}
