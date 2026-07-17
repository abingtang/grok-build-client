import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  shell,
} from "electron";
import path from "node:path";
import fs from "node:fs";
import { spawn } from "node:child_process";
import { AcpClient } from "./acp/client";
import {
  getMergedProjects,
  pinProject,
  removeProject,
  touchProject,
} from "./services/projects";
import {
  deleteSessionDir,
  listAllRecentSessions,
  listSessionsForProject,
  readSessionTranscript,
  searchSessionsLocal,
} from "./services/sessions";
import {
  filterSlashCommands,
  parseSlashInput,
  resolveSlashCommand,
  SLASH_COMMANDS,
  type SlashCommandDef,
} from "./services/slash-commands";
import { getGrokHome, grokSpawnEnv, resolveGrokBinary } from "./env";
import { HeadlessRunner } from "./services/headless-run";
import {
  grokInspect,
  grokVersion,
  listGrokModels,
} from "./services/grok-cli";
import { listInvocableSkills } from "./services/skills-scan";
import {
  applyRewindPoint,
  listRewindPoints,
  readContextStats,
} from "./services/session-meta";
import {
  listHooks,
  listMcpServers,
  listPlugins,
  listWorktrees,
} from "./services/mcp-cli";

let mainWindow: BrowserWindow | null = null;
const acp = new AcpClient();
const headless = new HeadlessRunner();

const isDev =
  process.env.ELECTRON_DEV === "1" ||
  Boolean(process.env.VITE_DEV_SERVER_URL);

function send(channel: string, payload: unknown): void {
  mainWindow?.webContents.send(channel, payload);
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 700,
    titleBarStyle: "hiddenInset",
    // Vertically center in 52px unified titlebar
    trafficLightPosition: { x: 16, y: 18 },
    backgroundColor: "#0b0d10",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  const devUrl =
    process.env.VITE_DEV_SERVER_URL || "http://127.0.0.1:5175";

  if (isDev) {
    mainWindow.loadURL(devUrl);
    if (process.env.ELECTRON_OPEN_DEVTOOLS === "1") {
      mainWindow.webContents.openDevTools({ mode: "detach" });
    }
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function wireAcpEvents(): void {
  acp.on("status", (status) => send("acp:status", status));
  acp.on("sessionUpdate", (event) => send("acp:sessionUpdate", event));
  acp.on("permission", (req) => send("acp:permission", req));
  acp.on("notification", (n) => send("acp:notification", n));
  acp.on("exit", (info) => send("acp:exit", info));
  acp.on("stderr", (chunk) => send("acp:stderr", chunk));

  headless.on("event", (payload) => send("headless:event", payload));
  headless.on("state", (payload) => send("headless:state", payload));
  headless.on("stderr", (payload) => send("headless:stderr", payload));
}

function registerIpc(): void {
  ipcMain.handle("app:getInfo", async () => ({
    version: app.getVersion(),
    grokHome: getGrokHome(),
    grokBin: resolveGrokBinary(),
    platform: process.platform,
  }));

  ipcMain.handle("projects:list", async () => getMergedProjects());

  ipcMain.handle("projects:open", async (_e, projectPath: string) => {
    return touchProject(projectPath);
  });

  ipcMain.handle("projects:pickFolder", async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ["openDirectory", "createDirectory"],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    return touchProject(result.filePaths[0]);
  });

  ipcMain.handle(
    "projects:pin",
    async (_e, projectPath: string, pinned: boolean) => {
      pinProject(projectPath, pinned);
      return getMergedProjects();
    },
  );

  ipcMain.handle("projects:remove", async (_e, projectPath: string) => {
    removeProject(projectPath);
    return getMergedProjects();
  });

  ipcMain.handle(
    "sessions:list",
    async (_e, projectPath?: string, limit?: number) => {
      if (projectPath) return listSessionsForProject(projectPath, limit || 100);
      return listAllRecentSessions(limit || 50);
    },
  );

  ipcMain.handle(
    "sessions:transcript",
    async (_e, sessionId: string, cwd: string) => {
      return readSessionTranscript(sessionId, cwd);
    },
  );

  ipcMain.handle(
    "sessions:search",
    async (_e, query: string, limit?: number) => {
      const q = (query || "").trim();
      if (!q) return [];
      const cap = limit || 40;

      // 1) Local title/summary search first (reliable, Chinese OK)
      const local = searchSessionsLocal(q, cap);
      const byId = new Map(local.map((s) => [s.id, s]));

      // 2) Merge official CLI FTS hits (content search) when available
      try {
        const cli = await runGrokSubcommand([
          "sessions",
          "search",
          q,
          "--limit",
          String(cap),
        ]);
        const parsed = parseSessionsSearchOutput(cli.stdout || cli.stderr || "");
        for (const row of parsed) {
          if (byId.has(row.id)) continue;
          byId.set(row.id, {
            id: row.id,
            cwd: row.cwd || "",
            title: row.title || row.id.slice(0, 8),
            summary: row.snippet || "",
            createdAt: "",
            updatedAt: row.date || "",
          });
        }
      } catch {
        /* local-only is fine */
      }

      return Array.from(byId.values()).slice(0, cap);
    },
  );

  ipcMain.handle(
    "sessions:delete",
    async (_e, sessionId: string, cwd?: string) => {
      if (!sessionId || typeof sessionId !== "string") {
        throw new Error("sessionId required");
      }
      // Official path
      const result = await runGrokSubcommand([
        "sessions",
        "delete",
        sessionId,
      ]);
      const okCli = result.code === 0;
      // Ensure local dir is gone even if CLI partially fails
      const okDir = deleteSessionDir(sessionId, cwd);
      if (!okCli && !okDir) {
        throw new Error(
          result.stderr ||
            result.stdout ||
            `删除失败 (exit ${result.code})`,
        );
      }
      return {
        ok: true,
        via: okCli ? "cli" : "filesystem",
        stdout: result.stdout,
        stderr: result.stderr,
      };
    },
  );

  ipcMain.handle(
    "acp:start",
    async (
      _e,
      options?: { cwd?: string; model?: string; alwaysApprove?: boolean },
    ) => {
      try {
        return await acp.start(options);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        send("acp:status", {
          connected: false,
          sessionId: null,
          cwd: options?.cwd || null,
          model: options?.model || null,
          error: message,
          bin: resolveGrokBinary(),
        });
        // Re-throw so renderer ensureAgent catch path still runs
        throw new Error(message);
      }
    },
  );

  ipcMain.handle("acp:stop", async () => {
    await acp.stop();
    return acp.getStatus();
  });

  ipcMain.handle("acp:status", async () => acp.getStatus());

  ipcMain.handle(
    "acp:newSession",
    async (
      _e,
      cwd?: string,
      meta?: {
        rules?: string;
        systemPromptOverride?: string;
        agentProfile?: string | Record<string, unknown>;
      },
    ) => {
      return acp.newSession(cwd, meta);
    },
  );

  ipcMain.handle(
    "acp:loadSession",
    async (_e, sessionId: string, cwd?: string) => {
      return acp.loadSession(sessionId, cwd);
    },
  );

  ipcMain.handle(
    "acp:prompt",
    async (
      _e,
      prompt:
        | string
        | Array<
            | { type: "text"; text: string }
            | { type: "image"; data: string; mimeType: string; uri?: string }
            | {
                type: "resource_link";
                uri: string;
                name?: string;
                mimeType?: string;
              }
          >,
      sessionId?: string,
    ) => {
      return acp.prompt(prompt, sessionId);
    },
  );

  ipcMain.handle("acp:cancel", async (_e, sessionId?: string) => {
    return acp.cancel(sessionId);
  });

  ipcMain.handle(
    "acp:permission",
    async (
      _e,
      requestId: string,
      optionId: string,
      rpcId?: string | number | null,
    ) => {
      return acp.respondPermission(requestId, optionId, rpcId);
    },
  );

  ipcMain.handle(
    "acp:extension",
    async (_e, method: string, params?: Record<string, unknown>) => {
      return acp.extension(method, params || {});
    },
  );

  ipcMain.handle(
    "acp:setMode",
    async (_e, modeId: string, sessionId?: string) => {
      return acp.setMode(modeId, sessionId);
    },
  );

  ipcMain.handle(
    "session:context",
    async (_e, sessionId: string, cwd?: string) => {
      return readContextStats(sessionId, cwd);
    },
  );

  ipcMain.handle(
    "session:rewindList",
    async (_e, sessionId: string, cwd?: string) => {
      return listRewindPoints(sessionId, cwd);
    },
  );

  ipcMain.handle(
    "session:rewindApply",
    async (_e, sessionId: string, promptIndex: number, cwd?: string) => {
      return applyRewindPoint(sessionId, promptIndex, cwd);
    },
  );

  ipcMain.handle("mcp:list", async () => listMcpServers());
  ipcMain.handle("plugins:list", async () => listPlugins());
  ipcMain.handle("hooks:list", async (_e, projectPath?: string | null) =>
    listHooks(projectPath),
  );
  ipcMain.handle("skills:list", async (_e, projectPath?: string | null) =>
    listInvocableSkills(projectPath),
  );
  ipcMain.handle("git:worktrees", async (_e, projectPath: string) =>
    listWorktrees(projectPath),
  );

  ipcMain.handle(
    "fs:listDir",
    async (_e, dirPath: string, max = 200) => {
      try {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        return entries.slice(0, max).map((e) => ({
          name: e.name,
          path: path.join(dirPath, e.name),
          isDir: e.isDirectory(),
        }));
      } catch (e) {
        return {
          error: e instanceof Error ? e.message : String(e),
          entries: [],
        };
      }
    },
  );

  /** Save paste/upload bytes under project .grok/uploads or app userData. */
  ipcMain.handle(
    "fs:saveAttachment",
    async (
      _e,
      payload: {
        dataBase64: string;
        name?: string;
        mimeType?: string;
        projectPath?: string | null;
      },
    ) => {
      const mime = payload.mimeType || "application/octet-stream";
      const extFromMime: Record<string, string> = {
        "image/png": ".png",
        "image/jpeg": ".jpg",
        "image/jpg": ".jpg",
        "image/gif": ".gif",
        "image/webp": ".webp",
        "image/svg+xml": ".svg",
        "application/pdf": ".pdf",
        "text/plain": ".txt",
        "text/markdown": ".md",
      };
      let name = (payload.name || "").trim();
      if (!name) {
        const ext = extFromMime[mime] || ".bin";
        name = `paste-${Date.now()}${ext}`;
      } else if (!path.extname(name) && extFromMime[mime]) {
        name = `${name}${extFromMime[mime]}`;
      }
      // sanitize basename
      name = name.replace(/[/\\?%*:|"<>]/g, "_");
      const baseDir = payload.projectPath
        ? path.join(payload.projectPath, ".grok", "uploads")
        : path.join(app.getPath("userData"), "uploads");
      fs.mkdirSync(baseDir, { recursive: true });
      const stamp = Date.now().toString(36);
      const safeName = `${stamp}-${name}`;
      const filePath = path.join(baseDir, safeName);
      const buf = Buffer.from(payload.dataBase64, "base64");
      fs.writeFileSync(filePath, buf);
      const isImage = mime.startsWith("image/");
      return {
        id: stamp,
        name,
        path: filePath,
        mimeType: mime,
        size: buf.length,
        isImage,
      };
    },
  );

  ipcMain.handle(
    "dialog:pickFiles",
    async (
      _e,
      options?: {
        multiSelections?: boolean;
        imagesOnly?: boolean;
      },
    ) => {
      const filters = options?.imagesOnly
        ? [
            {
              name: "Images",
              extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"],
            },
          ]
        : [
            {
              name: "Images",
              extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"],
            },
            { name: "Documents", extensions: ["pdf", "md", "txt", "json", "csv"] },
            { name: "All Files", extensions: ["*"] },
          ];
      const result = await dialog.showOpenDialog(mainWindow!, {
        properties: [
          "openFile",
          ...(options?.multiSelections !== false
            ? (["multiSelections"] as const)
            : []),
        ],
        filters,
      });
      if (result.canceled || !result.filePaths.length) return [];
      return result.filePaths.map((fp) => {
        const name = path.basename(fp);
        const ext = path.extname(name).toLowerCase();
        const mimeMap: Record<string, string> = {
          ".png": "image/png",
          ".jpg": "image/jpeg",
          ".jpeg": "image/jpeg",
          ".gif": "image/gif",
          ".webp": "image/webp",
          ".svg": "image/svg+xml",
          ".bmp": "image/bmp",
          ".pdf": "application/pdf",
          ".md": "text/markdown",
          ".txt": "text/plain",
          ".json": "application/json",
          ".csv": "text/csv",
        };
        const mimeType = mimeMap[ext] || "application/octet-stream";
        let size = 0;
        try {
          size = fs.statSync(fp).size;
        } catch {
          /* ignore */
        }
        return {
          id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
          name,
          path: fp,
          mimeType,
          size,
          isImage: mimeType.startsWith("image/"),
        };
      });
    },
  );

  ipcMain.handle(
    "fs:readFileBase64",
    async (_e, filePath: string, maxBytes = 12 * 1024 * 1024) => {
      try {
        const st = fs.statSync(filePath);
        if (st.size > maxBytes) {
          return { error: `文件过大（${st.size} > ${maxBytes}）` };
        }
        const buf = fs.readFileSync(filePath);
        const ext = path.extname(filePath).toLowerCase();
        const mimeMap: Record<string, string> = {
          ".png": "image/png",
          ".jpg": "image/jpeg",
          ".jpeg": "image/jpeg",
          ".gif": "image/gif",
          ".webp": "image/webp",
          ".svg": "image/svg+xml",
        };
        return {
          dataBase64: buf.toString("base64"),
          mimeType: mimeMap[ext] || "application/octet-stream",
          size: st.size,
        };
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
    },
  );

  ipcMain.handle(
    "slash:list",
    async (_e, query?: string, projectPath?: string | null) => {
      const skills = listInvocableSkills(projectPath);
      const skillCmds: SlashCommandDef[] = skills.map((s) => ({
        name: s.name,
        description: s.description || `Skill (${s.scope})`,
        category: "skill" as const,
        kind: "prompt" as const,
        note: s.path,
      }));
      const all = [...SLASH_COMMANDS, ...skillCmds];
      if (typeof query === "string" && query) {
        const q = query.replace(/^\//, "").toLowerCase();
        return all
          .filter(
            (cmd) =>
              cmd.name.includes(q) ||
              cmd.description.toLowerCase().includes(q) ||
              (cmd.aliases || []).some((a) => a.includes(q)),
          )
          .sort((a, b) => {
            const as = a.name.startsWith(q) ? 0 : 1;
            const bs = b.name.startsWith(q) ? 0 : 1;
            if (as !== bs) return as - bs;
            return a.name.localeCompare(b.name);
          });
      }
      return all;
    },
  );

  ipcMain.handle(
    "slash:execute",
    async (
      _e,
      input: string,
      context: {
        projectPath: string | null;
        sessionId: string | null;
        lastAssistantText?: string;
        alwaysApprove?: boolean;
        model?: string | null;
      },
    ) => {
      return executeSlash(input, context);
    },
  );

  ipcMain.handle("shell:openExternal", async (_e, url: string) => {
    await shell.openExternal(url);
    return true;
  });

  ipcMain.handle("shell:showItemInFolder", async (_e, targetPath: string) => {
    if (!targetPath || !fs.existsSync(targetPath)) {
      throw new Error(`路径不存在: ${targetPath}`);
    }
    shell.showItemInFolder(path.resolve(targetPath));
    return true;
  });

  ipcMain.handle("clipboard:write", async (_e, text: string) => {
    clipboard.writeText(text);
    return true;
  });

  ipcMain.handle("dialog:saveText", async (_e, defaultName: string, text: string) => {
    const result = await dialog.showSaveDialog(mainWindow!, {
      defaultPath: defaultName,
      filters: [{ name: "Markdown", extensions: ["md"] }, { name: "Text", extensions: ["txt"] }],
    });
    if (result.canceled || !result.filePath) return null;
    fs.writeFileSync(result.filePath, text, "utf8");
    return result.filePath;
  });

  ipcMain.handle("grok:login", async () => {
    return runGrokSubcommand(["login"]);
  });

  ipcMain.handle("grok:logout", async () => {
    return runGrokSubcommand(["logout"]);
  });

  ipcMain.handle("grok:version", async () => {
    return grokVersion();
  });

  ipcMain.handle("grok:models", async () => listGrokModels());

  ipcMain.handle("grok:inspect", async (_e, cwd: string) => {
    return grokInspect(cwd);
  });

  // Headless streaming-json runs (JaydenCJ-compatible primary path)
  ipcMain.handle(
    "headless:run",
    async (
      _e,
      payload: { args: string[]; prompt: string; cwd: string },
    ) => {
      if (headless.active) {
        throw new Error("A headless run is already in progress");
      }
      return headless.run(payload);
    },
  );

  ipcMain.handle("headless:cancel", async () => {
    return headless.cancel();
  });

  ipcMain.handle("headless:active", async () => ({
    active: headless.active,
    runId: headless.runId,
  }));
}

/**
 * Parse `grok sessions search` human-readable output into rows.
 * Format example:
 *   019f… (score: 2.91)  Jul 16,  4:41pm
 *     Title line
 *     snippet…
 */
function parseSessionsSearchOutput(text: string): Array<{
  id: string;
  title: string;
  snippet: string;
  date?: string;
  cwd?: string;
}> {
  const lines = text.split("\n");
  const rows: Array<{
    id: string;
    title: string;
    snippet: string;
    date?: string;
    cwd?: string;
  }> = [];
  let current: {
    id: string;
    title: string;
    snippet: string;
    date?: string;
  } | null = null;

  const flush = () => {
    if (current) {
      rows.push(current);
      current = null;
    }
  };

  for (const line of lines) {
    const header = line.match(
      /^([0-9a-f]{8}-[0-9a-f-]{27,})\s*(?:\(score:\s*[\d.]+\))?\s*(.*)$/i,
    );
    if (header) {
      flush();
      current = {
        id: header[1],
        title: "",
        snippet: "",
        date: header[2]?.trim() || undefined,
      };
      continue;
    }
    if (!current) continue;
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (!current.title) {
      current.title = trimmed;
    } else {
      current.snippet = current.snippet
        ? `${current.snippet}\n${trimmed}`
        : trimmed;
    }
  }
  flush();
  return rows;
}

async function runGrokSubcommand(args: string[]): Promise<{
  code: number | null;
  stdout: string;
  stderr: string;
}> {
  const bin = resolveGrokBinary();
  return new Promise((resolve) => {
    const proc = spawn(bin, args, { env: grokSpawnEnv() });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => {
      stdout += d.toString("utf8");
    });
    proc.stderr.on("data", (d) => {
      stderr += d.toString("utf8");
    });
    proc.on("close", (code) => resolve({ code, stdout, stderr }));
    proc.on("error", (err) =>
      resolve({ code: 1, stdout: "", stderr: err.message }),
    );
  });
}

async function executeSlash(
  input: string,
  context: {
    projectPath: string | null;
    sessionId: string | null;
    lastAssistantText?: string;
    alwaysApprove?: boolean;
    model?: string | null;
  },
): Promise<{
  handled: boolean;
  action?: string;
  message?: string;
  openPanel?: string;
  promptText?: string;
  data?: unknown;
}> {
  const parsed = parseSlashInput(input);
  if (!parsed.isSlash) {
    return { handled: false };
  }

  const cmd = resolveSlashCommand(parsed.name);
  // Unknown slash: treat as skill/prompt passthrough
  if (!cmd) {
    return {
      handled: true,
      action: "prompt",
      promptText: input,
      message: `未识别内置命令 /${parsed.name}，将作为提示/Skill 发送给 Grok`,
    };
  }

  if (cmd.argsRequired && !parsed.args) {
    return {
      handled: true,
      action: "error",
      message: `/${cmd.name} 需要参数：${cmd.argumentHint || ""}`,
    };
  }

  switch (cmd.name) {
    case "new":
    case "clear":
      return { handled: true, action: "new-session" };

    case "resume":
      return { handled: true, action: "open-panel", openPanel: "sessions" };

    case "dashboard":
    case "sessions":
      return { handled: true, action: "open-panel", openPanel: "sessions" };

    case "home":
    case "welcome":
      return { handled: true, action: "home" };

    case "quit":
    case "exit":
      app.quit();
      return { handled: true, action: "quit" };

    case "session-info": {
      const status = acp.getStatus();
      return {
        handled: true,
        action: "system-message",
        message: [
          `Session ID: ${status.sessionId || context.sessionId || "(none)"}`,
          `CWD: ${status.cwd || context.projectPath || "(none)"}`,
          `Model: ${status.model || context.model || "(default)"}`,
          `Connected: ${status.connected}`,
          `Grok home: ${getGrokHome()}`,
          `Grok bin: ${resolveGrokBinary()}`,
        ].join("\n"),
      };
    }

    case "context": {
      const status = acp.getStatus();
      // Try extension; fall back to system message.
      try {
        const result = await acp.extension("x.ai/session/context", {
          sessionId: status.sessionId || context.sessionId,
        });
        return {
          handled: true,
          action: "system-message",
          message: typeof result === "string" ? result : JSON.stringify(result, null, 2),
          data: result,
        };
      } catch {
        return {
          handled: true,
          action: "system-message",
          message:
            "上下文详情扩展不可用。可用 /session-info 查看基础信息，或在 TUI 中使用 /context。",
        };
      }
    }

    case "compact": {
      try {
        const result = await acp.extension("x.ai/compact_conversation", {
          sessionId: context.sessionId || acp.getStatus().sessionId,
          context: parsed.args || undefined,
        });
        return {
          handled: true,
          action: "system-message",
          message: "已请求压缩会话上下文。",
          data: result,
        };
      } catch {
        return {
          handled: true,
          action: "prompt",
          promptText: `/compact${parsed.args ? " " + parsed.args : ""}`,
          message: "ACP compact 扩展不可用，已作为提示发送。",
        };
      }
    }

    case "fork": {
      try {
        const result = await acp.extension("x.ai/session/fork", {
          sessionId: context.sessionId || acp.getStatus().sessionId,
          directive: parsed.args || undefined,
        });
        return {
          handled: true,
          action: "system-message",
          message: "已请求 fork 会话。",
          data: result,
        };
      } catch {
        return {
          handled: true,
          action: "prompt",
          promptText: `/fork${parsed.args ? " " + parsed.args : ""}`,
          message: "ACP fork 扩展不可用，已作为提示发送。",
        };
      }
    }

    case "rewind": {
      try {
        const result = await acp.extension("x.ai/rewind/list", {
          sessionId: context.sessionId || acp.getStatus().sessionId,
        });
        return {
          handled: true,
          action: "open-panel",
          openPanel: "rewind",
          data: result,
          message: "已加载 rewind 点列表。",
        };
      } catch {
        return {
          handled: true,
          action: "prompt",
          promptText: "/rewind",
          message: "ACP rewind 扩展不可用，已作为提示发送。",
        };
      }
    }

    case "copy": {
      const text = context.lastAssistantText || "";
      if (!text) {
        return { handled: true, action: "error", message: "没有可复制的回复。" };
      }
      clipboard.writeText(text);
      return { handled: true, action: "system-message", message: "已复制最近回复到剪贴板。" };
    }

    case "export": {
      return {
        handled: true,
        action: "export",
        message: "请在 UI 中确认导出内容。",
      };
    }

    case "rename":
    case "title":
      return {
        handled: true,
        action: "rename-session",
        message: parsed.args,
        data: { title: parsed.args },
      };

    case "model":
    case "m":
      return {
        handled: true,
        action: "set-model",
        data: { model: parsed.args },
        message: parsed.args
          ? `将切换模型为：${parsed.args}（下次启动 ACP 时生效，或重启会话）`
          : "请指定模型名称，例如 /model grok-build",
      };

    case "effort":
      return {
        handled: true,
        action: "set-effort",
        data: { effort: parsed.args },
        message: `推理力度设为：${parsed.args}`,
      };

    case "always-approve":
      return { handled: true, action: "toggle-always-approve" };

    case "auto":
      return { handled: true, action: "toggle-auto-permission" };

    case "multiline":
    case "ml":
      return { handled: true, action: "toggle-multiline" };

    case "history":
      return { handled: true, action: "open-panel", openPanel: "history" };

    case "compact-mode":
      return { handled: true, action: "toggle-compact-mode" };

    case "vim-mode":
      return { handled: true, action: "toggle-vim-mode" };

    case "minimal":
      return { handled: true, action: "set-layout", data: { layout: "minimal" } };

    case "fullscreen":
    case "full":
      return { handled: true, action: "set-layout", data: { layout: "fullscreen" } };

    case "theme":
    case "t":
      return { handled: true, action: "toggle-theme" };

    case "timestamps":
      return { handled: true, action: "toggle-timestamps" };

    case "settings":
    case "config":
    case "preferences":
    case "prefs":
      return { handled: true, action: "open-panel", openPanel: "settings" };

    case "hooks":
      return { handled: true, action: "open-panel", openPanel: "hooks" };

    case "plugins":
      return { handled: true, action: "open-panel", openPanel: "plugins" };

    case "marketplace":
      return { handled: true, action: "open-panel", openPanel: "marketplace" };

    case "skills":
      return { handled: true, action: "open-panel", openPanel: "skills" };

    case "mcps":
      return { handled: true, action: "open-panel", openPanel: "mcps" };

    case "config-agents":
    case "agents":
      return { handled: true, action: "open-panel", openPanel: "agents" };

    case "personas":
      return { handled: true, action: "open-panel", openPanel: "personas" };

    case "docs":
    case "howto":
    case "guides": {
      if (parsed.args === "web" || !parsed.args) {
        if (parsed.args === "web") {
          await shell.openExternal("https://docs.x.ai/build/overview");
          return { handled: true, action: "system-message", message: "已在浏览器打开 Grok Build 文档。" };
        }
        return { handled: true, action: "open-panel", openPanel: "docs" };
      }
      await shell.openExternal("https://docs.x.ai/build/overview");
      return {
        handled: true,
        action: "system-message",
        message: `已打开文档（查询：${parsed.args}）`,
      };
    }

    case "release-notes":
    case "changelog": {
      const notesPath = path.join(getGrokHome(), "CHANGELOG.md");
      if (fs.existsSync(notesPath)) {
        const text = fs.readFileSync(notesPath, "utf8").slice(0, 8000);
        return { handled: true, action: "system-message", message: text };
      }
      return {
        handled: true,
        action: "system-message",
        message: "未找到 ~/.grok/CHANGELOG.md",
      };
    }

    case "terminal-setup":
    case "terminal-check":
    case "terminal-info":
      return {
        handled: true,
        action: "system-message",
        message: [
          "Grok Build Desktop 使用图形界面，不依赖终端能力。",
          `平台: ${process.platform}`,
          `Grok: ${resolveGrokBinary()}`,
          `GROK_HOME: ${getGrokHome()}`,
          "完整终端检测请在终端运行: grok（TUI）后执行 /terminal-setup",
        ].join("\n"),
      };

    case "login": {
      const result = await runGrokSubcommand(["login"]);
      return {
        handled: true,
        action: "system-message",
        message: result.stdout || result.stderr || `login exit ${result.code}`,
        data: result,
      };
    }

    case "logout": {
      const result = await runGrokSubcommand(["logout"]);
      return {
        handled: true,
        action: "system-message",
        message: result.stdout || result.stderr || `logout exit ${result.code}`,
        data: result,
      };
    }

    default: {
      // prompt / hybrid remaining
      if (cmd.kind === "prompt" || cmd.kind === "hybrid" || cmd.kind === "acp") {
        return {
          handled: true,
          action: "prompt",
          promptText: `/${cmd.name}${parsed.args ? " " + parsed.args : ""}`,
          message: cmd.note,
        };
      }
      return {
        handled: true,
        action: "system-message",
        message: `命令 /${cmd.name} 已识别，但当前版本尚未映射 UI 动作。`,
      };
    }
  }
}

app.whenReady().then(() => {
  wireAcpEvents();
  registerIpc();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  void acp.stop();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  void acp.stop();
});
