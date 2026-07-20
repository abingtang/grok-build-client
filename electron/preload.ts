import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";

type Handler = (payload: unknown) => void;

function on(channel: string, handler: Handler): () => void {
  const listener = (_event: IpcRendererEvent, payload: unknown) =>
    handler(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const api = {
  getInfo: () => ipcRenderer.invoke("app:getInfo"),

  projects: {
    list: () => ipcRenderer.invoke("projects:list"),
    open: (projectPath: string) =>
      ipcRenderer.invoke("projects:open", projectPath),
    pickFolder: () => ipcRenderer.invoke("projects:pickFolder"),
    pin: (projectPath: string, pinned: boolean) =>
      ipcRenderer.invoke("projects:pin", projectPath, pinned),
    remove: (projectPath: string) =>
      ipcRenderer.invoke("projects:remove", projectPath),
  },

  sessions: {
    list: (projectPath?: string, limit?: number) =>
      ipcRenderer.invoke("sessions:list", projectPath, limit),
    transcript: (sessionId: string, cwd: string) =>
      ipcRenderer.invoke("sessions:transcript", sessionId, cwd),
    search: (query: string, limit?: number) =>
      ipcRenderer.invoke("sessions:search", query, limit),
    delete: (sessionId: string, cwd?: string) =>
      ipcRenderer.invoke("sessions:delete", sessionId, cwd),
    saveSnapshot: (
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
    ) => ipcRenderer.invoke("sessions:saveSnapshot", sessionId, cwd, snapshot),
    readSnapshot: (sessionId: string, cwd?: string) =>
      ipcRenderer.invoke("sessions:readSnapshot", sessionId, cwd),
  },

  acp: {
    start: (options?: {
      cwd?: string;
      model?: string;
      alwaysApprove?: boolean;
    }) => ipcRenderer.invoke("acp:start", options),
    stop: () => ipcRenderer.invoke("acp:stop"),
    status: () => ipcRenderer.invoke("acp:status"),
    newSession: (
      cwd?: string,
      meta?: {
        rules?: string;
        systemPromptOverride?: string;
        agentProfile?: string | Record<string, unknown>;
      },
    ) => ipcRenderer.invoke("acp:newSession", cwd, meta),
    loadSession: (sessionId: string, cwd?: string) =>
      ipcRenderer.invoke("acp:loadSession", sessionId, cwd),
    prompt: (
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
    ) => ipcRenderer.invoke("acp:prompt", prompt, sessionId),
    cancel: (sessionId?: string) =>
      ipcRenderer.invoke("acp:cancel", sessionId),
    permission: (
      requestId: string,
      optionId: string,
      rpcId?: string | number | null,
    ) => ipcRenderer.invoke("acp:permission", requestId, optionId, rpcId),
    extension: (method: string, params?: Record<string, unknown>) =>
      ipcRenderer.invoke("acp:extension", method, params),
    setMode: (modeId: string, sessionId?: string) =>
      ipcRenderer.invoke("acp:setMode", modeId, sessionId),
    onStatus: (handler: Handler) => on("acp:status", handler),
    onSessionUpdate: (handler: Handler) => on("acp:sessionUpdate", handler),
    onPermission: (handler: Handler) => on("acp:permission", handler),
    onNotification: (handler: Handler) => on("acp:notification", handler),
    onExit: (handler: Handler) => on("acp:exit", handler),
    onStderr: (handler: Handler) => on("acp:stderr", handler),
  },

  headless: {
    run: (payload: { args: string[]; prompt: string; cwd: string }) =>
      ipcRenderer.invoke("headless:run", payload),
    cancel: () => ipcRenderer.invoke("headless:cancel"),
    active: () => ipcRenderer.invoke("headless:active"),
    onEvent: (handler: Handler) => on("headless:event", handler),
    onState: (handler: Handler) => on("headless:state", handler),
    onStderr: (handler: Handler) => on("headless:stderr", handler),
  },

  slash: {
    list: (query?: string, projectPath?: string | null) =>
      ipcRenderer.invoke("slash:list", query, projectPath),
    execute: (
      input: string,
      context: {
        projectPath: string | null;
        sessionId: string | null;
        lastAssistantText?: string;
        alwaysApprove?: boolean;
        model?: string | null;
      },
    ) => ipcRenderer.invoke("slash:execute", input, context),
  },

  shell: {
    openExternal: (url: string) =>
      ipcRenderer.invoke("shell:openExternal", url),
    showItemInFolder: (targetPath: string) =>
      ipcRenderer.invoke("shell:showItemInFolder", targetPath),
  },

  clipboard: {
    write: (text: string) => ipcRenderer.invoke("clipboard:write", text),
  },

  dialog: {
    saveText: (defaultName: string, text: string) =>
      ipcRenderer.invoke("dialog:saveText", defaultName, text),
    pickFiles: (options?: {
      multiSelections?: boolean;
      imagesOnly?: boolean;
    }) => ipcRenderer.invoke("dialog:pickFiles", options),
  },

  grok: {
    login: () => ipcRenderer.invoke("grok:login"),
    logout: () => ipcRenderer.invoke("grok:logout"),
    version: () => ipcRenderer.invoke("grok:version"),
    models: () => ipcRenderer.invoke("grok:models"),
    inspect: (cwd: string) => ipcRenderer.invoke("grok:inspect", cwd),
    inspectJson: (cwd: string) =>
      ipcRenderer.invoke("grok:inspectJson", cwd),
    exportSession: (sessionId: string, outputPath?: string | null) =>
      ipcRenderer.invoke("grok:exportSession", sessionId, outputPath),
    worktrees: (projectPath?: string | null) =>
      ipcRenderer.invoke("grok:worktrees", projectPath),
  },

  sessionMeta: {
    context: (sessionId: string, cwd?: string) =>
      ipcRenderer.invoke("session:context", sessionId, cwd),
    rewindList: (sessionId: string, cwd?: string) =>
      ipcRenderer.invoke("session:rewindList", sessionId, cwd),
    rewindApply: (sessionId: string, promptIndex: number, cwd?: string) =>
      ipcRenderer.invoke("session:rewindApply", sessionId, promptIndex, cwd),
  },

  extensions: {
    mcpList: () => ipcRenderer.invoke("mcp:list"),
    mcpDoctor: (name?: string | null) =>
      ipcRenderer.invoke("mcp:doctor", name),
    pluginsList: () => ipcRenderer.invoke("plugins:list"),
    pluginsInstall: (source: string, trust?: boolean) =>
      ipcRenderer.invoke("plugins:install", source, trust),
    pluginsUninstall: (name: string, keepData?: boolean) =>
      ipcRenderer.invoke("plugins:uninstall", name, keepData),
    pluginsEnable: (name: string) =>
      ipcRenderer.invoke("plugins:enable", name),
    pluginsDisable: (name: string) =>
      ipcRenderer.invoke("plugins:disable", name),
    pluginsDetails: (name: string) =>
      ipcRenderer.invoke("plugins:details", name),
    pluginsUpdate: (name?: string | null) =>
      ipcRenderer.invoke("plugins:update", name),
    hooksList: (projectPath?: string | null) =>
      ipcRenderer.invoke("hooks:list", projectPath),
    skillsList: (projectPath?: string | null) =>
      ipcRenderer.invoke("skills:list", projectPath),
    worktrees: (projectPath: string) =>
      ipcRenderer.invoke("git:worktrees", projectPath),
    worktreeCreate: (
      projectPath: string,
      label?: string | null,
      gitRef?: string | null,
    ) =>
      ipcRenderer.invoke("worktree:create", projectPath, label, gitRef),
  },

  fs: {
    listDir: (dirPath: string, max?: number) =>
      ipcRenderer.invoke("fs:listDir", dirPath, max),
    saveAttachment: (payload: {
      dataBase64: string;
      name?: string;
      mimeType?: string;
      projectPath?: string | null;
    }) => ipcRenderer.invoke("fs:saveAttachment", payload),
    readFileBase64: (filePath: string, maxBytes?: number) =>
      ipcRenderer.invoke("fs:readFileBase64", filePath, maxBytes),
  },
};

contextBridge.exposeInMainWorld("grokDesktop", api);

export type GrokDesktopApi = typeof api;
