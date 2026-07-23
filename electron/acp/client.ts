import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";
import { createInterface, type Interface } from "node:readline";
import { grokSpawnEnv, resolveGrokBinary } from "../env";
import { handleReadTextFile, handleWriteTextFile } from "./fs-handlers";
import {
  RpcHandlerError,
  TerminalHost,
  invalidParams,
} from "./terminal-host";
import type {
  AcpContentBlock,
  AcpStatus,
  JsonRpcId,
  JsonRpcMessage,
  PermissionRequest,
  SessionUpdateEvent,
} from "./types";

type Pending = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer?: ReturnType<typeof setTimeout>;
};

/**
 * Long-lived ACP client wrapping `grok agent stdio`.
 * This is the Codex-Desktop-style primary runtime: one agent process,
 * multi-turn session/prompt, live session/update + interactive permissions.
 */
export class AcpClient extends EventEmitter {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private rl: Interface | null = null;
  private nextId = 1;
  private pending = new Map<JsonRpcId, Pending>();
  private sessionId: string | null = null;
  private cwd: string | null = null;
  private model: string | null = null;
  private alwaysApprove = false;
  private connected = false;
  private lastError: string | null = null;
  private stderrBuf = "";
  private binPath: string | null = null;
  private promptInFlight = false;
  /** Client-side ACP terminals (terminal/* methods). */
  private terminals = new TerminalHost();

  getStatus(): AcpStatus {
    return {
      connected: this.connected,
      sessionId: this.sessionId,
      cwd: this.cwd,
      model: this.model,
      error: this.lastError,
      bin: this.binPath,
    };
  }

  isPrompting(): boolean {
    return this.promptInFlight;
  }

  async start(options?: {
    cwd?: string;
    model?: string;
    alwaysApprove?: boolean;
    /** `--reasoning-effort` / `--effort` on `grok agent` */
    reasoningEffort?: string | null;
  }): Promise<AcpStatus> {
    const targetCwd = options?.cwd || this.cwd || process.cwd();
    const sameProc =
      this.connected &&
      this.proc &&
      this.cwd === targetCwd &&
      (options?.model == null || options.model === this.model) &&
      (options?.alwaysApprove == null ||
        options.alwaysApprove === this.alwaysApprove);

    if (sameProc) {
      return this.getStatus();
    }

    await this.stop();
    this.lastError = null;
    this.alwaysApprove = Boolean(options?.alwaysApprove);

    const bin = resolveGrokBinary();
    this.binPath = bin;
    // Flags for `grok agent` must come before the subcommand (`agent stdio`).
    const args: string[] = [];
    if (options?.model) {
      args.push("--model", options.model);
    }
    if (this.alwaysApprove) {
      args.push("--always-approve");
    }
    const effort = options?.reasoningEffort?.trim();
    if (effort && effort !== "off") {
      args.push("--reasoning-effort", effort);
    }
    args.push("agent", "stdio");

    this.cwd = targetCwd;
    this.model = options?.model || null;

    let spawnError: Error | null = null;
    this.proc = spawn(bin, args, {
      cwd: this.cwd,
      env: grokSpawnEnv(),
      stdio: ["pipe", "pipe", "pipe"],
    });

    this.proc.on("error", (err) => {
      spawnError = err;
      this.lastError = `无法启动 grok (${bin}): ${err.message}`;
      this.connected = false;
      this.emit("status", this.getStatus());
      this.emit("exit", { code: null, signal: null, stderr: this.lastError });
    });

    this.rl = createInterface({ input: this.proc.stdout });
    this.rl.on("line", (line) => this.onLine(line));

    this.proc.stderr.on("data", (chunk: Buffer) => {
      this.stderrBuf += chunk.toString("utf8");
      if (this.stderrBuf.length > 20_000) {
        this.stderrBuf = this.stderrBuf.slice(-10_000);
      }
      this.emit("stderr", chunk.toString("utf8"));
    });

    this.proc.on("exit", (code, signal) => {
      this.connected = false;
      this.promptInFlight = false;
      if (code && code !== 0 && !this.lastError) {
        this.lastError =
          this.stderrBuf.trim().slice(0, 500) ||
          `ACP 进程退出 (code=${code}, signal=${signal})`;
      }
      this.emit("exit", { code, signal, stderr: this.stderrBuf });
      this.emit("status", this.getStatus());
      for (const [, p] of this.pending) {
        if (p.timer) clearTimeout(p.timer);
        p.reject(
          new Error(
            this.lastError ||
              `ACP process exited (code=${code}, signal=${signal})`,
          ),
        );
      }
      this.pending.clear();
    });

    await new Promise((r) => setTimeout(r, 40));
    if (spawnError) throw spawnError;

    try {
      await this.request(
        "initialize",
        {
          protocolVersion: 1,
          clientInfo: {
            name: "grok-build-desktop",
            version: "0.2.0",
          },
          clientCapabilities: {
            fs: { readTextFile: true, writeTextFile: true },
            terminal: true,
          },
        },
        30_000,
      );
      this.notify("notifications/initialized", {});
      this.connected = true;
      this.lastError = null;
      this.emit("status", this.getStatus());
      return this.getStatus();
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.lastError =
        msg +
        (this.stderrBuf.trim()
          ? `\nstderr: ${this.stderrBuf.trim().slice(0, 400)}`
          : "");
      await this.stop();
      this.emit("status", this.getStatus());
      throw new Error(this.lastError);
    }
  }

  async stop(): Promise<void> {
    this.promptInFlight = false;
    this.terminals.releaseAll();
    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }
    if (this.proc) {
      const proc = this.proc;
      this.proc = null;
      try {
        proc.kill("SIGTERM");
      } catch {
        /* ignore */
      }
      setTimeout(() => {
        try {
          proc.kill("SIGKILL");
        } catch {
          /* ignore */
        }
      }, 1500).unref?.();
    }
    this.connected = false;
    this.sessionId = null;
    this.emit("status", this.getStatus());
  }

  async newSession(
    cwd?: string,
    meta?: {
      rules?: string;
      systemPromptOverride?: string;
      agentProfile?: string | Record<string, unknown>;
    },
  ): Promise<{ sessionId: string }> {
    const targetCwd = cwd || this.cwd || process.cwd();
    this.cwd = targetCwd;
    const params: Record<string, unknown> = {
      cwd: targetCwd,
      mcpServers: [],
    };
    if (meta && Object.keys(meta).length) {
      params._meta = meta;
    }
    const result = (await this.request("session/new", params, 60_000)) as {
      sessionId: string;
    };
    this.sessionId = result.sessionId;
    this.emit("status", this.getStatus());
    return result;
  }

  async loadSession(sessionId: string, cwd?: string): Promise<unknown> {
    const targetCwd = cwd || this.cwd || process.cwd();
    this.cwd = targetCwd;
    const result = await this.request(
      "session/load",
      {
        sessionId,
        cwd: targetCwd,
        mcpServers: [],
      },
      60_000,
    );
    this.sessionId = sessionId;
    this.emit("status", this.getStatus());
    return result;
  }

  /**
   * Send a user prompt. Resolves when the agent returns the RPC result
   * (end of turn). Live chunks arrive via `sessionUpdate` events meanwhile.
   *
   * `prompt` may be a plain string or ACP ContentBlock[].
   * Images: prefer file paths in text when agent reports image:false;
   * image blocks are still sent when provided (best-effort).
   */
  async prompt(
    prompt: string | AcpContentBlock[],
    sessionId?: string,
  ): Promise<unknown> {
    const sid = sessionId || this.sessionId;
    if (!sid) {
      throw new Error("No active session. Create or load a session first.");
    }
    const blocks: AcpContentBlock[] =
      typeof prompt === "string"
        ? [{ type: "text", text: prompt }]
        : prompt.length > 0
          ? prompt
          : [{ type: "text", text: "" }];
    this.promptInFlight = true;
    this.emit("promptStart", { sessionId: sid });
    try {
      const result = await this.request(
        "session/prompt",
        {
          sessionId: sid,
          prompt: blocks,
        },
        0, // no timeout — long agent turns
      );
      return result;
    } finally {
      this.promptInFlight = false;
      this.emit("promptEnd", { sessionId: sid });
    }
  }

  async cancel(sessionId?: string): Promise<unknown> {
    const sid = sessionId || this.sessionId;
    if (!sid) return null;
    try {
      return await this.request("session/cancel", { sessionId: sid }, 10_000);
    } catch {
      this.notify("session/cancel", { sessionId: sid });
      return null;
    }
  }

  /**
   * Respond to a permission request.
   * Supports both: (a) JSON-RPC reply to server request id, and
   * (b) dedicated response methods / notifications.
   */
  async respondPermission(
    requestId: string,
    optionId: string,
    rpcId?: JsonRpcId | null,
  ): Promise<unknown> {
    // Common ACP shapes
    const resultBodies = [
      { outcome: { outcome: "selected", optionId } },
      { behavior: optionId.startsWith("allow") ? "allow" : "deny", optionId },
      { optionId },
      { selected: optionId },
    ];

    if (rpcId != null) {
      for (const body of resultBodies) {
        try {
          this.writeRaw({ jsonrpc: "2.0", id: rpcId, result: body });
          return { ok: true, via: "rpc-result", body };
        } catch {
          /* try next */
        }
      }
    }

    const attempts: Array<[string, unknown]> = [
      [
        "session/request_permission/response",
        { requestId, optionId, outcome: { outcome: "selected", optionId } },
      ],
      [
        "session/requestPermission/response",
        { requestId, optionId, outcome: { outcome: "selected", optionId } },
      ],
    ];

    for (const [method, params] of attempts) {
      try {
        return await this.request(method, params, 15_000);
      } catch {
        /* try notify */
      }
    }

    this.notify("session/request_permission/response", {
      requestId,
      optionId,
      outcome: { outcome: "selected", optionId },
    });
    return { ok: true, via: "notify" };
  }

  async extension(
    method: string,
    params: Record<string, unknown> = {},
    timeoutMs = 60_000,
  ): Promise<unknown> {
    return this.request(method, params, timeoutMs);
  }

  /** TUI-aligned mode switch: plan | default | ask | code | agent */
  async setMode(modeId: string, sessionId?: string): Promise<unknown> {
    const sid = sessionId || this.sessionId;
    if (!sid) throw new Error("No session for set_mode");
    return this.request(
      "session/set_mode",
      { sessionId: sid, modeId },
      15_000,
    );
  }

  private request(
    method: string,
    params?: unknown,
    timeoutMs = 120_000,
  ): Promise<unknown> {
    if (!this.proc?.stdin.writable) {
      return Promise.reject(new Error("ACP process is not running"));
    }
    const id = this.nextId++;
    const payload = {
      jsonrpc: "2.0" as const,
      id,
      method,
      params,
    };
    return new Promise((resolve, reject) => {
      const entry: Pending = { resolve, reject };
      if (timeoutMs > 0) {
        entry.timer = setTimeout(() => {
          if (this.pending.has(id)) {
            this.pending.delete(id);
            reject(new Error(`ACP request timeout: ${method}`));
          }
        }, timeoutMs);
        entry.timer.unref?.();
      }
      this.pending.set(id, entry);
      this.proc!.stdin.write(JSON.stringify(payload) + "\n", (err) => {
        if (err) {
          if (entry.timer) clearTimeout(entry.timer);
          this.pending.delete(id);
          reject(err);
        }
      });
    });
  }

  private notify(method: string, params?: unknown): void {
    this.writeRaw({ jsonrpc: "2.0", method, params });
  }

  private writeRaw(payload: unknown): void {
    if (!this.proc?.stdin.writable) {
      throw new Error("ACP process is not running");
    }
    this.proc.stdin.write(JSON.stringify(payload) + "\n");
  }

  private onLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed) return;
    let msg: JsonRpcMessage;
    try {
      msg = JSON.parse(trimmed) as JsonRpcMessage;
    } catch {
      this.emit("raw", trimmed);
      return;
    }

    // Response to our request
    if ("id" in msg && msg.id != null && ("result" in msg || "error" in msg)) {
      const pending = this.pending.get(msg.id);
      if (!pending) return;
      this.pending.delete(msg.id);
      if (pending.timer) clearTimeout(pending.timer);
      if ("error" in msg && msg.error) {
        pending.reject(
          new Error(msg.error.message || `RPC error ${msg.error.code}`),
        );
      } else {
        pending.resolve((msg as { result: unknown }).result);
      }
      return;
    }

    // Server → client request (has method + id, no result)
    if (
      "method" in msg &&
      msg.method &&
      "id" in msg &&
      (msg as { id?: JsonRpcId }).id != null &&
      !("result" in msg) &&
      !("error" in msg)
    ) {
      this.handleServerRequest(
        msg.method,
        (msg as { params?: unknown }).params,
        (msg as { id: JsonRpcId }).id,
      );
      return;
    }

    // Notification
    if ("method" in msg && msg.method) {
      this.handleNotification(msg.method, (msg as { params?: unknown }).params);
    }
  }

  private handleServerRequest(
    method: string,
    params: unknown,
    rpcId: JsonRpcId,
  ): void {
    if (
      method === "session/request_permission" ||
      method === "session/requestPermission" ||
      method.endsWith("request_permission") ||
      method.endsWith("requestPermission")
    ) {
      if (this.alwaysApprove) {
        void this.respondPermission(String(rpcId), "allow-always", rpcId);
        return;
      }
      const p = (params || {}) as Record<string, unknown>;
      const toolCall = p.toolCall as Record<string, unknown> | undefined;
      const permission: PermissionRequest & { rpcId?: JsonRpcId } = {
        requestId: String(p.requestId ?? p.id ?? rpcId),
        sessionId: String(p.sessionId ?? this.sessionId ?? ""),
        toolCallId: toolCall?.toolCallId
          ? String(toolCall.toolCallId)
          : p.toolCallId
            ? String(p.toolCallId)
            : undefined,
        title: String(
          toolCall?.title || p.title || "需要批准工具执行",
        ),
        description: this.formatPermissionDescription(p),
        raw: params,
      };
      (permission as { rpcId?: JsonRpcId }).rpcId = rpcId;
      this.emit("permission", permission);
      return;
    }

    // Client capability methods advertised in initialize (fs + terminal).
    // These are async (esp. terminal/wait_for_exit) — reply when done.
    void this.dispatchClientCapability(method, params, rpcId);
  }

  /**
   * Handle agent → client requests that Desktop advertised in
   * `clientCapabilities` during initialize.
   *
   * Without these handlers, tools fail with:
   * `Method not supported: fs/read_text_file` / `terminal/create` / …
   */
  private async dispatchClientCapability(
    method: string,
    params: unknown,
    rpcId: JsonRpcId,
  ): Promise<void> {
    try {
      const result = await this.runClientCapability(method, params);
      this.writeRaw({
        jsonrpc: "2.0",
        id: rpcId,
        result,
      });
    } catch (err) {
      if (err instanceof RpcHandlerError) {
        this.writeRaw({
          jsonrpc: "2.0",
          id: rpcId,
          error: {
            code: err.code,
            message: err.message,
            ...(err.data !== undefined ? { data: err.data } : {}),
          },
        });
        return;
      }
      // Unknown method → method not found; other errors → internal.
      const isUnknown =
        err instanceof Error && err.message.startsWith("Method not supported:");
      const message =
        err instanceof Error ? err.message : `Client handler error: ${String(err)}`;
      this.writeRaw({
        jsonrpc: "2.0",
        id: rpcId,
        error: {
          code: isUnknown ? -32601 : -32603,
          message,
        },
      });
    }
  }

  private async runClientCapability(
    method: string,
    params: unknown,
  ): Promise<unknown> {
    const p = (params || {}) as Record<string, unknown>;
    const defaultCwd = this.cwd;

    switch (method) {
      case "fs/read_text_file":
        return handleReadTextFile({
          sessionId: p.sessionId as string | undefined,
          path: p.path as string | undefined,
          line: p.line as number | null | undefined,
          limit: p.limit as number | null | undefined,
          defaultCwd,
        });

      case "fs/write_text_file":
        return handleWriteTextFile({
          sessionId: p.sessionId as string | undefined,
          path: p.path as string | undefined,
          content: p.content as string | undefined,
          defaultCwd,
        });

      case "terminal/create": {
        const command = p.command;
        if (typeof command !== "string" || !command.trim()) {
          throw invalidParams("command is required");
        }
        return this.terminals.create({
          sessionId: String(p.sessionId ?? this.sessionId ?? ""),
          command,
          args: Array.isArray(p.args) ? (p.args as string[]) : [],
          env: Array.isArray(p.env)
            ? (p.env as Array<{ name: string; value: string }>)
            : [],
          cwd: typeof p.cwd === "string" ? p.cwd : null,
          outputByteLimit:
            typeof p.outputByteLimit === "number" ? p.outputByteLimit : null,
          defaultCwd,
        });
      }

      case "terminal/output": {
        const terminalId = String(p.terminalId ?? "");
        if (!terminalId) throw invalidParams("terminalId is required");
        const snap = this.terminals.output(terminalId);
        return {
          output: snap.output,
          truncated: snap.truncated,
          exitStatus: snap.exitStatus,
        };
      }

      case "terminal/wait_for_exit": {
        const terminalId = String(p.terminalId ?? "");
        if (!terminalId) throw invalidParams("terminalId is required");
        const status = await this.terminals.waitForExit(terminalId);
        return {
          exitCode: status.exitCode,
          signal: status.signal,
        };
      }

      case "terminal/kill": {
        const terminalId = String(p.terminalId ?? "");
        if (!terminalId) throw invalidParams("terminalId is required");
        return this.terminals.kill(terminalId);
      }

      case "terminal/release": {
        const terminalId = String(p.terminalId ?? "");
        if (!terminalId) throw invalidParams("terminalId is required");
        return this.terminals.release(terminalId);
      }

      default:
        throw new Error(`Method not supported: ${method}`);
    }
  }

  private formatPermissionDescription(p: Record<string, unknown>): string {
    const parts: string[] = [];
    if (typeof p.description === "string") parts.push(p.description);
    const toolCall = p.toolCall as Record<string, unknown> | undefined;
    if (toolCall) {
      if (toolCall.kind) parts.push(`kind: ${toolCall.kind}`);
      if (toolCall.rawInput) {
        try {
          parts.push(JSON.stringify(toolCall.rawInput, null, 2).slice(0, 2000));
        } catch {
          /* ignore */
        }
      }
    }
    if (p.options && Array.isArray(p.options)) {
      parts.push(
        "options: " +
          (p.options as Array<{ optionId?: string; name?: string }>)
            .map((o) => o.optionId || o.name)
            .join(", "),
      );
    }
    return parts.join("\n\n");
  }

  private handleNotification(method: string, params: unknown): void {
    if (
      method === "session/update" ||
      method === "x.ai/session/update" ||
      method === "x.ai/session_notification"
    ) {
      const event = params as SessionUpdateEvent;
      // Normalize nested shapes
      const raw = params as Record<string, unknown>;
      const update =
        (raw?.update as Record<string, unknown>) ||
        (raw?.sessionUpdate
          ? raw
          : (event as { update?: Record<string, unknown> }).update);
      this.emit("sessionUpdate", {
        sessionId:
          (raw?.sessionId as string) ||
          (event as { sessionId?: string }).sessionId ||
          this.sessionId,
        update: update || raw,
      });
      return;
    }

    if (
      method === "session/request_permission" ||
      method === "session/requestPermission"
    ) {
      // Notification-style permission (no rpc id)
      if (this.alwaysApprove) {
        const p = (params || {}) as Record<string, unknown>;
        void this.respondPermission(
          String(p.requestId ?? p.id ?? ""),
          "allow-always",
        );
        return;
      }
      const p = (params || {}) as Record<string, unknown>;
      const toolCall = p.toolCall as Record<string, unknown> | undefined;
      this.emit("permission", {
        requestId: String(p.requestId ?? p.id ?? ""),
        sessionId: String(p.sessionId ?? this.sessionId ?? ""),
        toolCallId: toolCall?.toolCallId
          ? String(toolCall.toolCallId)
          : undefined,
        title: String(toolCall?.title || p.title || "需要批准工具执行"),
        description: this.formatPermissionDescription(p),
        raw: params,
      } satisfies PermissionRequest);
      return;
    }

    this.emit("notification", { method, params });
  }
}
