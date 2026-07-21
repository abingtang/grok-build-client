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
  grokExportSession,
  grokInspect,
  grokInspectJson,
  grokVersion,
  grokWorktreeList,
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
  listWorktrees,
  mcpDoctor,
} from "./services/mcp-cli";
import {
  disablePlugin,
  enablePlugin,
  installPlugin,
  listPluginsDetailed,
  pluginDetails,
  uninstallPlugin,
  updatePlugins,
} from "./services/plugins-cli";
import { createProjectWorktree } from "./services/worktree-ops";

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
    minWidth: 820,
    minHeight: 700,
    icon: path.join(__dirname, "../electron/assets/image/icon.png"),
    ...(process.platform === "darwin"
      ? {
          titleBarStyle: "hiddenInset" as const,
          // Vertically center in 52px unified titlebar
          trafficLightPosition: { x: 16, y: 18 },
        }
      : {}),
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
    "sessions:saveSnapshot",
    async (
      _e,
      sessionId: string,
      cwd: string,
      snapshot: {
        kind: "fork" | "draft";
        title?: string;
        parentSessionId?: string;
        seed?: string;
        seedConsumed?: boolean;
        messages: Array<{
          id: string;
          role: string;
          content: string;
          toolName?: string;
          status?: string;
          createdAt?: string;
          meta?: Record<string, unknown>;
        }>;
      },
    ) => {
      const {
        writeDesktopSessionSnapshot,
      } = await import("./services/session-desktop-snapshot");
      return writeDesktopSessionSnapshot(sessionId, cwd, snapshot);
    },
  );

  ipcMain.handle(
    "sessions:readSnapshot",
    async (_e, sessionId: string, cwd?: string) => {
      const {
        readDesktopSessionSnapshot,
      } = await import("./services/session-desktop-snapshot");
      return readDesktopSessionSnapshot(sessionId, cwd);
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
  ipcMain.handle("mcp:doctor", async (_e, name?: string | null) =>
    mcpDoctor(name),
  );
  ipcMain.handle("plugins:list", async () => listPluginsDetailed());
  ipcMain.handle(
    "plugins:install",
    async (_e, source: string, trust?: boolean) =>
      installPlugin(source, trust !== false),
  );
  ipcMain.handle(
    "plugins:uninstall",
    async (_e, name: string, keepData?: boolean) =>
      uninstallPlugin(name, { keepData: !!keepData }),
  );
  ipcMain.handle("plugins:enable", async (_e, name: string) =>
    enablePlugin(name),
  );
  ipcMain.handle("plugins:disable", async (_e, name: string) =>
    disablePlugin(name),
  );
  ipcMain.handle("plugins:details", async (_e, name: string) =>
    pluginDetails(name),
  );
  ipcMain.handle("plugins:update", async (_e, name?: string | null) =>
    updatePlugins(name),
  );
  ipcMain.handle(
    "worktree:create",
    async (
      _e,
      projectPath: string,
      label?: string | null,
      gitRef?: string | null,
    ) => createProjectWorktree(projectPath, label, gitRef),
  );
  ipcMain.handle("hooks:list", async (_e, projectPath?: string | null) =>
    listHooks(projectPath),
  );
  ipcMain.handle("skills:list", async (_e, projectPath?: string | null) =>
    listInvocableSkills(projectPath),
  );
  ipcMain.handle("git:worktrees", async (_e, projectPath: string) =>
    listWorktrees(projectPath),
  );
  ipcMain.handle("grok:worktrees", async (_e, projectPath?: string | null) =>
    grokWorktreeList(projectPath),
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

  ipcMain.handle("grok:inspectJson", async (_e, cwd: string) => {
    return grokInspectJson(cwd);
  });

  ipcMain.handle(
    "grok:exportSession",
    async (_e, sessionId: string, outputPath?: string | null) => {
      return grokExportSession(sessionId, outputPath);
    },
  );

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

function buildDocsPanelBody(query: string): string {
  const guideDir = path.join(getGrokHome(), "docs", "user-guide");
  const lines: string[] = [
    "Grok Build 用户指南",
    `目录: ${guideDir}`,
    "",
  ];
  if (!fs.existsSync(guideDir)) {
    lines.push(
      "未找到本地文档目录。可执行：",
      "  · /docs web  — 打开在线文档",
      "  · 确认 ~/.grok/docs/user-guide 存在",
    );
    return lines.join("\n");
  }
  let files: string[] = [];
  try {
    files = fs
      .readdirSync(guideDir)
      .filter((f) => f.endsWith(".md"))
      .sort();
  } catch (e) {
    return `读取文档失败：${e instanceof Error ? e.message : String(e)}`;
  }
  lines.push("可用章节：");
  for (const f of files) {
    lines.push(`  · ${f.replace(/\.md$/, "")}`);
  }
  lines.push("");
  const q = query.trim().toLowerCase();
  let pick =
    files.find((f) => f.toLowerCase().includes(q) && q.length > 0) ||
    files.find((f) => f.startsWith("01-")) ||
    files[0];
  if (pick) {
    try {
      const raw = fs.readFileSync(path.join(guideDir, pick), "utf8");
      lines.push(`── ${pick} ──`);
      lines.push(raw.slice(0, 6000));
      if (raw.length > 6000) lines.push("\n…(已截断，完整内容见本地文件)");
    } catch {
      lines.push(`无法读取 ${pick}`);
    }
  }
  lines.push("", "提示：/docs web 打开在线文档站。");
  return lines.join("\n");
}

function buildAgentsPanelBody(): string {
  const dir = path.join(getGrokHome(), "agents");
  const lines = ["自定义 Agents（~/.grok/agents）", ""];
  if (!fs.existsSync(dir)) {
    lines.push("目录不存在。可在 ~/.grok/agents 放置 agent 定义。");
    return lines.join("\n");
  }
  try {
    const files = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".md") || f.endsWith(".toml"))
      .sort();
    if (!files.length) {
      lines.push("（空）");
    } else {
      for (const f of files) {
        lines.push(`· ${f.replace(/\.(md|toml)$/, "")}`);
      }
    }
  } catch (e) {
    lines.push(e instanceof Error ? e.message : String(e));
  }
  lines.push("", "TUI 中用 /config-agents 管理；桌面端当前为只读列表。");
  return lines.join("\n");
}

function buildPersonasPanelBody(): string {
  const candidates = [
    path.join(getGrokHome(), "personas"),
    path.join(getGrokHome(), "agents", "personas"),
  ];
  const lines = ["Personas", ""];
  let found = false;
  for (const dir of candidates) {
    if (!fs.existsSync(dir)) continue;
    found = true;
    lines.push(`目录: ${dir}`);
    try {
      const files = fs.readdirSync(dir).sort();
      if (!files.length) lines.push("（空）");
      else for (const f of files) lines.push(`· ${f}`);
    } catch (e) {
      lines.push(e instanceof Error ? e.message : String(e));
    }
  }
  if (!found) {
    lines.push("未找到 personas 目录（~/.grok/personas）。");
  }
  return lines.join("\n");
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
  openTab?: string;
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
    case "dashboard":
    case "sessions":
    case "history":
      // 会话选择：打开命令面板搜索（比空 Panel 有用）
      return {
        handled: true,
        action: "open-palette",
        message: "在命令面板中搜索并打开会话。",
      };

    case "home":
    case "welcome":
      return { handled: true, action: "home" };

    case "quit":
    case "exit":
      app.quit();
      return { handled: true, action: "quit" };

    case "session-info":
    case "context":
      return {
        handled: true,
        action: "open-inspector",
        openTab: "context",
        message: "已打开会话详情 · 上下文",
      };

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
        const sourceSessionId =
          context.sessionId || acp.getStatus().sessionId || "";
        const sourceCwd = context.projectPath || acp.getStatus().cwd || "";
        if (!sourceSessionId || !sourceCwd) {
          return {
            handled: true,
            action: "system-message",
            message: "Fork 需要当前会话与项目路径。",
          };
        }
        // Parse optional --worktree / --no-worktree from args
        const rawArgs = (parsed.args || "").trim();
        const wantWt = /\b--worktree\b/.test(rawArgs);
        const noWt = /\b--no-worktree\b/.test(rawArgs);
        const directive = rawArgs
          .replace(/--worktree(?:=\S+)?/g, "")
          .replace(/--no-worktree/g, "")
          .trim();
        let newCwd = sourceCwd;
        if (wantWt && !noWt) {
          const wt = await createProjectWorktree(
            sourceCwd,
            directive.slice(0, 40) || null,
          );
          if (wt.ok && wt.path) newCwd = wt.path;
        }
        const result = await acp.extension("x.ai/session/fork", {
          sourceSessionId,
          sourceCwd,
          newCwd,
          sessionKind: wantWt && !noWt ? "worktree" : "fork",
          sourceWorkspaceDir:
            wantWt && !noWt ? sourceCwd : undefined,
          newModelId: context.model || undefined,
        });
        return {
          handled: true,
          action: "fork-session",
          message: "已 fork 会话。",
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

    case "rewind":
      return {
        handled: true,
        action: "open-inspector",
        openTab: "rewind",
        message: "已打开会话详情 · Rewind",
      };

    case "view-plan":
    case "show-plan":
    case "plan-view":
      return {
        handled: true,
        action: "open-inspector",
        openTab: "plan",
        message: "已打开会话详情 · Plan",
      };

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

    case "rename": {
      const sessionId = context.sessionId || acp.getStatus().sessionId;
      const cwd = context.projectPath || acp.getStatus().cwd;
      if (!sessionId || !cwd) {
        return { handled: true, action: "error", message: "重命名需要当前会话。" };
      }
      try {
        await acp.extension("x.ai/session/rename", {
          sessionId,
          title: parsed.args,
          cwd,
        });
        return {
          handled: true,
          action: "rename-session",
          message: `会话已重命名为：${parsed.args}`,
          data: { sessionId, title: parsed.args },
        };
      } catch (error) {
        return {
          handled: true,
          action: "error",
          message: `重命名失败：${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }

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

    case "compact-mode":
      return { handled: true, action: "toggle-compact-mode" };

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
      return {
        handled: true,
        action: "open-panel",
        openPanel: "agents",
        message: buildAgentsPanelBody(),
        data: buildAgentsPanelBody(),
      };

    case "personas":
      return {
        handled: true,
        action: "open-panel",
        openPanel: "personas",
        message: buildPersonasPanelBody(),
        data: buildPersonasPanelBody(),
      };

    case "docs":
    case "howto":
    case "guides": {
      if (parsed.args === "web") {
        await shell.openExternal("https://docs.x.ai/build/overview");
        return {
          handled: true,
          action: "system-message",
          message: "已在浏览器打开 Grok Build 文档。",
        };
      }
      const docsBody = buildDocsPanelBody(parsed.args || "");
      return {
        handled: true,
        action: "open-panel",
        openPanel: "docs",
        message: docsBody,
        data: docsBody,
      };
    }

    case "release-notes":
    case "changelog": {
      const notesPath = path.join(getGrokHome(), "CHANGELOG.md");
      if (fs.existsSync(notesPath)) {
        const text = fs.readFileSync(notesPath, "utf8").slice(0, 12000);
        return {
          handled: true,
          action: "open-panel",
          openPanel: "docs",
          message: text,
          data: text,
        };
      }
      return {
        handled: true,
        action: "open-panel",
        openPanel: "docs",
        message: "未找到 ~/.grok/CHANGELOG.md",
        data: "未找到 ~/.grok/CHANGELOG.md",
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
  if (process.platform === "darwin") {
    app.dock?.setIcon(
      path.join(__dirname, "../electron/assets/image/icon.png"),
    );
  }
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
