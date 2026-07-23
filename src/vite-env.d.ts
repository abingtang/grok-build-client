/// <reference types="vite/client" />

interface GrokDesktopApi {
  getInfo: () => Promise<{
    version: string;
    grokHome: string;
    grokBin: string;
    platform: string;
  }>;
  projects: {
    list: () => Promise<unknown>;
    open: (projectPath: string) => Promise<unknown>;
    pickFolder: () => Promise<unknown>;
    pin: (projectPath: string, pinned: boolean) => Promise<unknown>;
    remove: (projectPath: string) => Promise<unknown>;
  };
  sessions: {
    list: (projectPath?: string, limit?: number) => Promise<unknown>;
    transcript: (sessionId: string, cwd: string) => Promise<unknown>;
    search: (query: string, limit?: number) => Promise<unknown>;
    delete: (sessionId: string, cwd?: string) => Promise<unknown>;
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
    ) => Promise<{ ok: true; path: string } | { ok: false; error: string }>;
    readSnapshot: (
      sessionId: string,
      cwd?: string,
    ) => Promise<{
      version: 1;
      kind: "fork" | "draft";
      title?: string;
      parentSessionId?: string;
      seed?: string;
      seedConsumed?: boolean;
      savedAt: string;
      messages: Array<{
        id: string;
        role: string;
        content: string;
        toolName?: string;
        status?: string;
        createdAt?: string;
        meta?: Record<string, unknown>;
      }>;
    } | null>;
  };
  acp: {
    start: (options?: {
      cwd?: string;
      model?: string;
      alwaysApprove?: boolean;
      reasoningEffort?: string | null;
    }) => Promise<unknown>;
    stop: () => Promise<unknown>;
    status: () => Promise<unknown>;
    newSession: (
      cwd?: string,
      meta?: {
        rules?: string;
        systemPromptOverride?: string;
        agentProfile?: string | Record<string, unknown>;
      },
    ) => Promise<unknown>;
    loadSession: (sessionId: string, cwd?: string) => Promise<unknown>;
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
    ) => Promise<unknown>;
    cancel: (sessionId?: string) => Promise<unknown>;
    permission: (
      requestId: string,
      optionId: string,
      rpcId?: string | number | null,
    ) => Promise<unknown>;
    extension: (
      method: string,
      params?: Record<string, unknown>,
    ) => Promise<unknown>;
    setMode: (modeId: string, sessionId?: string) => Promise<unknown>;
    onStatus: (handler: (payload: unknown) => void) => () => void;
    onSessionUpdate: (handler: (payload: unknown) => void) => () => void;
    onPermission: (handler: (payload: unknown) => void) => () => void;
    onNotification: (handler: (payload: unknown) => void) => () => void;
    onExit: (handler: (payload: unknown) => void) => () => void;
    onStderr: (handler: (payload: unknown) => void) => () => void;
  };
  headless: {
    run: (payload: {
      args: string[];
      prompt: string;
      cwd: string;
    }) => Promise<unknown>;
    cancel: () => Promise<unknown>;
    active: () => Promise<unknown>;
    onEvent: (handler: (payload: unknown) => void) => () => void;
    onState: (handler: (payload: unknown) => void) => () => void;
    onStderr: (handler: (payload: unknown) => void) => () => void;
  };
  slash: {
    list: (query?: string, projectPath?: string | null) => Promise<unknown>;
    execute: (
      input: string,
      context: {
        projectPath: string | null;
        sessionId: string | null;
        lastAssistantText?: string;
        alwaysApprove?: boolean;
        model?: string | null;
      },
    ) => Promise<unknown>;
  };
  shell: {
    openExternal: (url: string) => Promise<unknown>;
    showItemInFolder: (targetPath: string) => Promise<unknown>;
  };
  clipboard: {
    write: (text: string) => Promise<unknown>;
  };
  dialog: {
    saveText: (defaultName: string, text: string) => Promise<unknown>;
    pickFiles: (options?: {
      multiSelections?: boolean;
      imagesOnly?: boolean;
    }) => Promise<
      Array<{
        id: string;
        name: string;
        path: string;
        mimeType: string;
        size: number;
        isImage: boolean;
      }>
    >;
  };
  grok: {
    login: () => Promise<unknown>;
    logout: () => Promise<unknown>;
    version: () => Promise<unknown>;
    models: () => Promise<unknown>;
    inspect: (cwd: string) => Promise<unknown>;
    inspectJson: (cwd: string) => Promise<{
      ok: boolean;
      data: unknown;
      raw: string;
    }>;
    exportSession: (
      sessionId: string,
      outputPath?: string | null,
    ) => Promise<{ ok: boolean; output: string }>;
    worktrees: (projectPath?: string | null) => Promise<string>;
    doctor: (options?: {
      json?: boolean;
      fix?: string | null;
      cwd?: string | null;
    }) => Promise<{ ok: boolean; raw: string; data: unknown | null }>;
  };
  sessionMeta: {
    context: (sessionId: string, cwd?: string) => Promise<unknown>;
    rewindList: (sessionId: string, cwd?: string) => Promise<unknown>;
    rewindApply: (
      sessionId: string,
      promptIndex: number,
      cwd?: string,
    ) => Promise<unknown>;
  };
  extensions: {
    mcpList: () => Promise<unknown>;
    mcpDoctor: (name?: string | null) => Promise<string>;
    pluginsList: () => Promise<{
      plugins: Array<{
        name: string;
        version?: string;
        enabled?: boolean;
        source?: string;
        path?: string;
        description?: string;
      }>;
      raw: string;
    }>;
    pluginsInstall: (
      source: string,
      trust?: boolean,
    ) => Promise<{ ok: boolean; output: string }>;
    pluginsUninstall: (
      name: string,
      keepData?: boolean,
    ) => Promise<{ ok: boolean; output: string }>;
    pluginsEnable: (
      name: string,
    ) => Promise<{ ok: boolean; output: string }>;
    pluginsDisable: (
      name: string,
    ) => Promise<{ ok: boolean; output: string }>;
    pluginsDetails: (
      name: string,
    ) => Promise<{ ok: boolean; output: string }>;
    pluginsUpdate: (
      name?: string | null,
    ) => Promise<{ ok: boolean; output: string }>;
    marketplaceList: () => Promise<{ ok: boolean; output: string }>;
    marketplaceAdd: (source: string) => Promise<{ ok: boolean; output: string }>;
    marketplaceRemove: (
      sourceOrName: string,
    ) => Promise<{ ok: boolean; output: string }>;
    hooksList: (projectPath?: string | null) => Promise<unknown>;
    skillsList: (projectPath?: string | null) => Promise<unknown>;
    worktrees: (projectPath: string) => Promise<unknown>;
    worktreeCreate: (
      projectPath: string,
      label?: string | null,
      gitRef?: string | null,
    ) => Promise<{ ok: boolean; path?: string; output: string }>;
  };
  fs: {
    listDir: (
      dirPath: string,
      max?: number,
    ) => Promise<
      | Array<{ name: string; path: string; isDir: boolean }>
      | { error: string; entries: unknown[] }
    >;
    saveAttachment: (payload: {
      dataBase64: string;
      name?: string;
      mimeType?: string;
      projectPath?: string | null;
    }) => Promise<{
      id: string;
      name: string;
      path: string;
      mimeType: string;
      size: number;
      isImage: boolean;
    }>;
    readFileBase64: (
      filePath: string,
      maxBytes?: number,
    ) => Promise<
      | { dataBase64: string; mimeType: string; size: number }
      | { error: string }
    >;
  };
}

declare global {
  interface Window {
    grokDesktop: GrokDesktopApi;
  }
}

export {};
