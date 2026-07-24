import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  CommandPalette,
  type PaletteItem,
} from "./components/CommandPalette";
import {
  InspectorDrawer,
  type InspectorScope,
  type InspectorTab,
  type ContextStatsView,
  type HookView,
  type McpServerView,
  type RewindPointView,
  type SkillView,
  type SubagentView,
  isGlobalInspectorTab,
  isSessionInspectorTab,
} from "./components/InspectorDrawer";
import { AiMessageList } from "./components/AiMessageList";
import { ChatSessionSkeleton } from "./components/ChatSessionSkeleton";
import { PromptInputSubmit } from "./components/ai-elements/prompt-input";
import { PanelModal } from "./components/PanelModal";
import {
  GlobalConfigPage,
  type GlobalConfigKind,
} from "./components/GlobalConfigPage";
import {
  PluginsPage,
  type PluginsToolbar,
} from "./components/PluginsPage";
import { PermissionModal } from "./components/PermissionModal";
import { ProjectTree } from "./components/ProjectTree";
import {
  SettingsModal,
  type SettingsState,
} from "./components/SettingsModal";
import { SlashMenu } from "./components/SlashMenu";
import {
  applyThemeCustom,
  loadThemeCustomStore,
  saveThemeCustomStore,
  type ThemeCustomStore,
} from "./lib/theme-custom";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  HamburgerMenuIcon,
  Pencil2Icon,
  UploadIcon,
} from "@radix-ui/react-icons";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  buildGrokArgs,
  type EffortLevel,
  type PermissionMode,
  type ReasoningEffort,
} from "./lib/grokArgs";
import { runStatusLabel, toChatStatus } from "./lib/grok-ui";
import type {
  AcpStatus,
  ChatMessage,
  MessageAttachment,
  PanelId,
  PermissionRequest,
  ProjectInfo,
  SessionSummary,
  SlashCommandDef,
} from "./lib/types";
import { streamBuffer } from "./lib/streamBuffer";
import { cn } from "./lib/utils";
import { rt, useI18n } from "./i18n";

const MAX_ATTACHMENTS = 8;
const MAX_IMAGE_INLINE_BYTES = 4 * 1024 * 1024;
const SIDEBAR_AUTO_COLLAPSE_QUERY = "(max-width: 1250px)";
const SIDEBAR_DEFAULT_WIDTH = 280;
const SIDEBAR_MIN_WIDTH = 220;
const SIDEBAR_MAX_WIDTH = 480;
const SIDEBAR_COLLAPSE_THRESHOLD = 180;
const SIDEBAR_KEYBOARD_STEP = 10;

function clampSidebarWidth(width: number): number {
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, width));
}

function isImageMime(mime: string | undefined): boolean {
  return !!mime && mime.startsWith("image/");
}

function fileToBase64(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const i = result.indexOf(",");
      resolve(i >= 0 ? result.slice(i + 1) : result);
    };
    reader.onerror = () => reject(reader.error || new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

function fileToDataUrl(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

/** Build ACP prompt text + optional image blocks from attachments. */
function buildPromptWithAttachments(
  text: string,
  attachments: MessageAttachment[],
): {
  textPrompt: string;
  blocks: Array<
    | { type: "text"; text: string }
    | { type: "image"; data: string; mimeType: string; uri?: string }
    | { type: "resource_link"; uri: string; name?: string; mimeType?: string }
  >;
} {
  if (!attachments.length) {
    return {
      textPrompt: text,
      blocks: [{ type: "text", text }],
    };
  }
  const pathLines = attachments.map(
    (a) => `- ${a.name}: ${a.path}${a.isImage ? " (image)" : ""}`,
  );
  const suffix = rt("msg.attachSuffix", { paths: pathLines.join("\n") });
  const textPrompt = (text || rt("msg.attachPromptFallback")) + suffix;
  const blocks: Array<
    | { type: "text"; text: string }
    | { type: "image"; data: string; mimeType: string; uri?: string }
    | { type: "resource_link"; uri: string; name?: string; mimeType?: string }
  > = [{ type: "text", text: textPrompt }];
  for (const a of attachments) {
    const uri = a.path.startsWith("file://") ? a.path : `file://${a.path}`;
    blocks.push({
      type: "resource_link",
      uri,
      name: a.name,
      mimeType: a.mimeType,
    });
  }
  return { textPrompt, blocks };
}

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function systemMessage(content: string): ChatMessage {
  return {
    id: uid(),
    role: "system",
    content,
    createdAt: new Date().toISOString(),
  };
}

function isIncompleteToolStatus(status?: string): boolean {
  const s = String(status || "").toLowerCase();
  return s === "pending" || s === "in_progress" || s === "running";
}

const LS = {
  effort: "gbd-effort",
  reasoning: "gbd-reasoning",
  alwaysApprove: "gbd-always-approve",
  model: "gbd-model",
  theme: "gbd-theme-light",
};

function loadLS(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

function loadThemeLight(): boolean {
  const saved = loadLS(LS.theme, "");
  if (saved === "1") return true;
  if (saved === "0") return false;
  return window.matchMedia?.("(prefers-color-scheme: light)").matches ?? false;
}

function shouldAutoCollapseSidebar(): boolean {
  return window.matchMedia?.(SIDEBAR_AUTO_COLLAPSE_QUERY).matches ?? false;
}

export default function App() {
  const { t, locale, setLocale } = useI18n();
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  /** Codex-style: sessions nested under each project path */
  const [sessionsByProject, setSessionsByProject] = useState<
    Record<string, SessionSummary[]>
  >({});
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(
    () => new Set(),
  );
  const [loadingSessionsPath, setLoadingSessionsPath] = useState<string | null>(
    null,
  );
  const [project, setProjectState] = useState<ProjectInfo | null>(null);
  const setProject = useCallback((p: ProjectInfo | null) => {
    projectPathRef.current = p?.path || null;
    setProjectState(p);
  }, []);
  const [session, setSession] = useState<SessionSummary | null>(null);
  const [sessionSearch, setSessionSearch] = useState("");
  const [sessionSearchResults, setSessionSearchResults] = useState<
    SessionSummary[] | null
  >(null);
  const [sessionSearchLoading, setSessionSearchLoading] = useState(false);
  const sessionSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  /** Pending composer attachments (upload / paste) */
  const [attachments, setAttachments] = useState<MessageAttachment[]>([]);
  const [slashItems, setSlashItems] = useState<SlashCommandDef[]>([]);
  const [slashIndex, setSlashIndex] = useState(0);
  const [showSlash, setShowSlash] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [runLabel, setRunLabel] = useState<string | null>(null);
  const [queue, setQueue] = useState<string[]>([]);
  const [status, setStatus] = useState<AcpStatus>({
    connected: false,
    sessionId: null,
    cwd: null,
  });
  const [permission, setPermission] = useState<PermissionRequest | null>(null);
  const cancelForceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const [panel, setPanel] = useState<PanelId>(null);
  const [panelBody, setPanelBody] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [showTimestamps, setShowTimestamps] = useState(false);
  const [compactMode, setCompactMode] = useState(false);
  /** false: Enter 发送, Shift+Enter 换行（默认，符合常见聊天习惯） */
  const [multiline, setMultiline] = useState(false);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [inspectorScope, setInspectorScope] =
    useState<InspectorScope>("session");
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("context");
  const [globalPage, setGlobalPage] = useState<GlobalConfigKind | null>(null);
  const [planMode, setPlanMode] = useState(false);
  const [planText, setPlanText] = useState("");
  const [contextStats, setContextStats] = useState<ContextStatsView | null>(
    null,
  );
  const [contextLoading, setContextLoading] = useState(false);
  const [rewindPoints, setRewindPoints] = useState<RewindPointView[]>([]);
  const [rewindLoading, setRewindLoading] = useState(false);
  const [mcpServers, setMcpServers] = useState<McpServerView[]>([]);
  const [skillsList, setSkillsList] = useState<SkillView[]>([]);
  const [hooksList, setHooksList] = useState<HookView[]>([]);
  const [worktreeText, setWorktreeText] = useState("");
  const [subagentViews, setSubagentViews] = useState<SubagentView[]>([]);
  const [fileMentions, setFileMentions] = useState<
    Array<{ name: string; path: string; isDir: boolean }>
  >([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [themeLight, setThemeLight] = useState(loadThemeLight);
  const [themeCustom, setThemeCustom] = useState<ThemeCustomStore>(
    loadThemeCustomStore,
  );
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    shouldAutoCollapseSidebar,
  );
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH);

  const [model, setModel] = useState<string>(
    () => loadLS(LS.model, "grok-4.5"),
  );
  const [models, setModels] = useState<string[]>(["grok-4.5"]);
  const [effort, setEffort] = useState<EffortLevel>(
    () => loadLS(LS.effort, "medium") as EffortLevel,
  );
  const [reasoning, setReasoning] = useState<ReasoningEffort>(
    () => loadLS(LS.reasoning, "off") as ReasoningEffort,
  );
  const [alwaysApprove, setAlwaysApprove] = useState(
    () => loadLS(LS.alwaysApprove, "0") === "1",
  );
  const [permissionMode, setPermissionMode] =
    useState<PermissionMode>("default");
  const [bestOfN, setBestOfN] = useState(1);
  const [maxTurns, setMaxTurns] = useState(48);
  const [noPlan, setNoPlan] = useState(false);
  const [sandbox, setSandbox] = useState("");
  const [webSearch, setWebSearch] = useState(true);
  const [subagents, setSubagents] = useState(true);
  const [memory, setMemory] = useState(false);
  const [selfCheck, setSelfCheck] = useState(false);
  const [pluginsPageOpen, setPluginsPageOpen] = useState(false);
  const [pluginsToolbar, setPluginsToolbar] = useState<PluginsToolbar | null>(
    null,
  );
  const [appInfo, setAppInfo] = useState<{
    version: string;
    grokHome: string;
    grokBin: string;
  } | null>(null);
  const [grokReady, setGrokReady] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameDraft, setRenameDraft] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
  /** Target for rename dialog (titlebar or sidebar session row). */
  const [renameTarget, setRenameTarget] = useState<{
    sessionId: string;
    cwd: string;
    title: string;
  } | null>(null);

  const streamingIdRef = useRef<string | null>(null);
  const thoughtIdRef = useRef<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const continueRef = useRef(false);
  const headlessSessionIdRef = useRef<string | null>(null);
  /** Active ACP session id (primary runtime, Codex-style) */
  const acpSessionIdRef = useRef<string | null>(null);
  /** 草稿新会话：仅 UI 清空，首次发消息时才 acp.newSession */
  const draftNewSessionRef = useRef(false);
  /** toolCallId → message id for live ACP tool cards */
  const toolMsgByCallIdRef = useRef(new Map<string, string>());
  const queueProcessing = useRef(false);
  const projectPathRef = useRef<string | null>(null);
  /** Prefer ACP; headless only as fallback */
  const runtimeModeRef = useRef<"acp" | "headless">("acp");
  /**
   * 当前是否有「进行中」的 agent 回合（含 ACP prompt await / headless run）。
   * 打断后立即置 false，避免迟到的 sessionUpdate 继续改写 transcript。
   */
  const turnActiveRef = useRef(false);
  /** Context seed prepended once after message-level fork */
  const forkContextSeedRef = useRef<string | null>(null);
  const streamStartedAtRef = useRef<number>(0);
  const [streamPhase, setStreamPhase] = useState<
    "idle" | "waiting" | "thinking" | "writing" | "done"
  >("idle");
  const [streamElapsed, setStreamElapsed] = useState(0);

  const lastAssistantText = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant" && messages[i].content) {
        return messages[i].content;
      }
    }
    return "";
  }, [messages]);

  const refreshProjects = useCallback(async () => {
    const list = (await window.grokDesktop.projects.list()) as ProjectInfo[];
    setProjects(list);
  }, []);

  const sessionsCacheRef = useRef<Record<string, SessionSummary[]>>({});
  const transcriptCacheRef = useRef<Record<string, ChatMessage[]>>({});
  const sessionLoadSeqRef = useRef(0);

  const clearTranscriptCache = (sessionId: string | null) => {
    if (!sessionId) return;
    for (const key of Object.keys(transcriptCacheRef.current)) {
      if (key.startsWith(`${sessionId}:`)) delete transcriptCacheRef.current[key];
    }
  };

  const loadSessionsForProject = useCallback(
    async (projectPath: string, opts?: { force?: boolean }) => {
      if (
        !opts?.force &&
        Object.prototype.hasOwnProperty.call(sessionsCacheRef.current, projectPath)
      ) {
        return sessionsCacheRef.current[projectPath];
      }
      setLoadingSessionsPath(projectPath);
      try {
        const list = (await window.grokDesktop.sessions.list(
          projectPath,
          100,
        )) as SessionSummary[];
        sessionsCacheRef.current = {
          ...sessionsCacheRef.current,
          [projectPath]: list,
        };
        setSessionsByProject((prev) => ({ ...prev, [projectPath]: list }));
        return list;
      } finally {
        setLoadingSessionsPath((cur) => (cur === projectPath ? null : cur));
      }
    },
    [],
  );

  const expandProject = useCallback((path: string) => {
    setExpandedProjects((prev) => {
      if (prev.has(path)) return prev;
      const next = new Set(prev);
      next.add(path);
      return next;
    });
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(LS.effort, effort);
      localStorage.setItem(LS.reasoning, reasoning);
      localStorage.setItem(LS.alwaysApprove, alwaysApprove ? "1" : "0");
      localStorage.setItem(LS.model, model);
      localStorage.setItem(LS.theme, themeLight ? "1" : "0");
      saveThemeCustomStore(themeCustom);
    } catch {
      /* ignore */
    }
  }, [effort, reasoning, alwaysApprove, model, themeLight, themeCustom]);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = themeLight ? "light" : "dark";
    // Tailwind `dark:` + Shiki dual-theme (AI Elements / Streamdown)
    root.classList.toggle("dark", !themeLight);
  }, [themeLight]);

  useEffect(() => {
    const mode = themeLight ? "light" : "dark";
    applyThemeCustom(themeCustom[mode], mode);
  }, [themeLight, themeCustom]);

  useEffect(() => {
    const media = window.matchMedia(SIDEBAR_AUTO_COLLAPSE_QUERY);
    const onChange = (event: MediaQueryListEvent) => {
      setSidebarCollapsed(event.matches);
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const startSidebarResize = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();

      const handle = event.currentTarget;
      let nextWidth = event.clientX;
      handle.setPointerCapture(event.pointerId);
      document.body.classList.add("is-resizing-sidebar");

      const onMove = (moveEvent: PointerEvent) => {
        nextWidth = moveEvent.clientX;
        if (nextWidth >= SIDEBAR_COLLAPSE_THRESHOLD) {
          setSidebarWidth(clampSidebarWidth(nextWidth));
        }
      };

      const stop = () => {
        handle.removeEventListener("pointermove", onMove);
        handle.removeEventListener("pointerup", stop);
        handle.removeEventListener("pointercancel", stop);
        document.body.classList.remove("is-resizing-sidebar");

        if (nextWidth < SIDEBAR_COLLAPSE_THRESHOLD) {
          setSidebarCollapsed(true);
        } else {
          setSidebarWidth(clampSidebarWidth(nextWidth));
        }
      };

      handle.addEventListener("pointermove", onMove);
      handle.addEventListener("pointerup", stop);
      handle.addEventListener("pointercancel", stop);
    },
    [],
  );

  const resizeSidebarWithKeyboard = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key === "ArrowLeft" && sidebarWidth <= SIDEBAR_MIN_WIDTH) {
        event.preventDefault();
        setSidebarCollapsed(true);
        return;
      }

      const nextWidth =
        event.key === "ArrowLeft"
          ? sidebarWidth - SIDEBAR_KEYBOARD_STEP
          : event.key === "ArrowRight"
            ? sidebarWidth + SIDEBAR_KEYBOARD_STEP
            : event.key === "Home"
              ? SIDEBAR_MIN_WIDTH
              : event.key === "End"
                ? SIDEBAR_MAX_WIDTH
                : null;
      if (nextWidth == null) return;
      event.preventDefault();
      setSidebarWidth(clampSidebarWidth(nextWidth));
    },
    [sidebarWidth],
  );

  // rAF-coalesced stream buffer → React messages
  useEffect(() => {
    const applySnapshot = () => {
      const snap = streamBuffer.snapshot();
      setStreamPhase(snap.phase);
      if (snap.startedAt) {
        setStreamElapsed(Date.now() - snap.startedAt);
      }

      // 回合已结束后忽略缓冲回调，避免打断 finalize 后又写回空 assistant / streaming
      if (!turnActiveRef.current) return;

      setMessages((prev) => {
        let next = prev;
        const upsert = (
          id: string | null,
          role: ChatMessage["role"],
          content: string,
          streaming: boolean,
          insertBeforeId?: string | null,
        ) => {
          if (!id) return;
          const idx = next.findIndex((m) => m.id === id);
          if (idx === -1) {
            // 勿在非 streaming 时插入空 assistant（打断收束后会被 finalize 删掉又被回写）
            if (!content && !(role === "assistant" && streaming)) return;
            const row: ChatMessage = {
              id,
              role,
              content,
              createdAt: new Date().toISOString(),
              streaming,
              collapsed: role === "thought" ? !streaming : undefined,
            };
            if (next === prev) next = prev.slice();
            if (insertBeforeId) {
              const bi = next.findIndex((m) => m.id === insertBeforeId);
              if (bi >= 0) {
                next.splice(bi, 0, row);
                return;
              }
            }
            next.push(row);
            return;
          }
          const cur = next[idx];
          if (cur.content === content && !!cur.streaming === streaming) return;
          if (next === prev) next = prev.slice();
          next[idx] = {
            ...cur,
            content,
            streaming,
            collapsed: role === "thought" ? !streaming : cur.collapsed,
          };
        };

        // Thought appears above the assistant bubble
        if (snap.thoughtId && (snap.thought || snap.phase === "thinking")) {
          upsert(
            snap.thoughtId,
            "thought",
            snap.thought,
            snap.phase === "thinking" || snap.phase === "writing",
            snap.textId,
          );
        }
        if (snap.textId) {
          upsert(
            snap.textId,
            "assistant",
            snap.text,
            snap.phase === "waiting" ||
              snap.phase === "thinking" ||
              snap.phase === "writing",
          );
        }
        return next;
      });
    };

    return streamBuffer.subscribe(applySnapshot);
  }, []);

  // Keep ref in sync for keyboard / cancel force-unlock
  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  // Elapsed timer while busy
  useEffect(() => {
    if (!busy) {
      setStreamElapsed(0);
      return;
    }
    const t = window.setInterval(() => {
      if (streamStartedAtRef.current) {
        setStreamElapsed(Date.now() - streamStartedAtRef.current);
      }
    }, 200);
    return () => clearInterval(t);
  }, [busy]);

  useEffect(() => {
    const offs = [
      window.grokDesktop.acp.onStatus((s) => {
        const st = s as AcpStatus;
        setStatus(st);
        // 草稿新会话时不要被 agent 旧 sessionId 写回
        if (st.sessionId && !draftNewSessionRef.current) {
          acpSessionIdRef.current = st.sessionId;
        }
        setGrokReady(Boolean(st.connected || st.bin));
      }),
      window.grokDesktop.acp.onPermission((p) => {
        setPermission(p as PermissionRequest);
        setRunLabel(t("status.waitingApprove"));
      }),
      window.grokDesktop.acp.onExit(() => {
        acpSessionIdRef.current = null;
        turnActiveRef.current = false;
        setStatus((prev) => ({ ...prev, connected: false, sessionId: null }));
        setBusy(false);
        setRunLabel(null);
        setStreamPhase("idle");
        setPermission(null);
        if (cancelForceTimerRef.current) {
          clearTimeout(cancelForceTimerRef.current);
          cancelForceTimerRef.current = null;
        }
      }),
      window.grokDesktop.acp.onSessionUpdate((raw) => {
        handleAcpSessionUpdate(raw);
      }),
      window.grokDesktop.headless.onEvent((raw) => {
        const { event } = raw as {
          runId: string;
          event: {
            type: string;
            data?: string;
            sessionId?: string;
            message?: string;
          };
        };
        if (event.type === "text" && event.data) {
          streamBuffer.appendText(event.data);
          setRunLabel(t("status.writing"));
        } else if (event.type === "thought" && event.data) {
          streamBuffer.appendThought(event.data);
          setRunLabel(t("status.thinking"));
        } else if (event.type === "end" && event.sessionId) {
          headlessSessionIdRef.current = event.sessionId;
          continueRef.current = true;
        } else if (event.type === "error" && event.message) {
          setMessages((m) => [
            ...m,
            systemMessage(
              t("msg.runError", { msg: event.message || "" }),
            ),
          ]);
        }
      }),
      window.grokDesktop.headless.onState((raw) => {
        const st = raw as {
          runId: string;
          state: string;
          error?: string;
        };
        // Only finalize when this turn is on headless fallback
        if (runtimeModeRef.current !== "headless") return;
        if (st.state === "running") {
          turnActiveRef.current = true;
          setBusy(true);
          setRunLabel(t("status.connecting"));
        } else {
          // 若用户已打断，finalize 幂等；避免再塞一条 cancelled 系统消息
          const wasActive = turnActiveRef.current || busyRef.current;
          finalizeAcpTurn({
            cancelled: st.state === "cancelled" && wasActive,
          });
          if (st.state === "failed" && st.error) {
            setMessages((m) => [
              ...m,
              systemMessage(t("msg.failed", { msg: st.error || "" })),
            ]);
          }
        }
      }),
    ];
    return () => offs.forEach((off) => off());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(true);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === ",") {
        e.preventDefault();
        setSettingsOpen(true);
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "i") {
        e.preventDefault();
        if (session) {
          openSessionInspector(session, "context");
        } else {
          openGlobalPage("mcp");
        }
      }
      // ⌘N — 新建对话（与命令面板 hint 一致）
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "n") {
        e.preventDefault();
        void createNewChat();
      }
      // Esc：无弹层时停止当前回合（权限/设置/命令面板有各自 Esc）
      if (
        e.key === "Escape" &&
        !permission &&
        !settingsOpen &&
        !paletteOpen &&
        !inspectorOpen &&
        !panel &&
        busyRef.current
      ) {
        e.preventDefault();
        void cancelTurn();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permission, settingsOpen, paletteOpen, inspectorOpen, panel]);

  function appendOrUpdate(
    role: ChatMessage["role"],
    text: string,
    opts?: {
      toolName?: string;
      status?: string;
      streaming?: boolean;
      id?: string;
    },
  ): string {
    const id = opts?.id || uid();
    setMessages((prev) => {
      const existing = prev.find((m) => m.id === id);
      if (existing) {
        return prev.map((m) =>
          m.id === id
            ? {
                ...m,
                content: m.content + text,
                streaming: opts?.streaming ?? m.streaming,
                status: opts?.status ?? m.status,
              }
            : m,
        );
      }
      return [
        ...prev,
        {
          id,
          role,
          content: text,
          createdAt: new Date().toISOString(),
          toolName: opts?.toolName,
          status: opts?.status,
          streaming: opts?.streaming,
        },
      ];
    });
    return id;
  }

  async function bootstrap(): Promise<void> {
    const info = (await window.grokDesktop.getInfo()) as {
      version: string;
      grokHome: string;
      grokBin: string;
    };
    setAppInfo(info);

    try {
      const modelsRes = (await window.grokDesktop.grok.models()) as {
        models: string[];
        defaultModel: string | null;
        bin: string;
      };
      if (modelsRes.models?.length) {
        setModels(modelsRes.models);
        setGrokReady(true);
        if (
          modelsRes.defaultModel &&
          modelsRes.models.includes(modelsRes.defaultModel)
        ) {
          setModel((prev) =>
            modelsRes.models.includes(prev) ? prev : modelsRes.defaultModel!,
          );
        } else if (!modelsRes.models.includes(model)) {
          setModel(modelsRes.models[0]);
        }
      }
    } catch {
      setGrokReady(false);
    }

    const list = (await window.grokDesktop.projects.list()) as ProjectInfo[];
    setProjects(list);
    if (list[0]) {
      await selectProject(list[0], { silent: true });
    }
  }

  /**
   * Activate a project as current cwd without bumping lastOpenedAt
   * (keeps left-tree order stable when expanding folders).
   */
  async function activateProject(
    p: ProjectInfo,
    opts?: { clearChat?: boolean; connectAcp?: boolean },
  ): Promise<void> {
    setProject(p);
    expandProject(p.path);
    await loadSessionsForProject(p.path);

    if (opts?.connectAcp !== false) {
      void window.grokDesktop.acp
        .start({
          cwd: p.path,
          model,
          alwaysApprove,
        })
        .then((st) => setStatus(st as AcpStatus))
        .catch(() => {
          /* headless path still works */
        });
    }

    if (opts?.clearChat) {
      setSession(null);
      continueRef.current = false;
      headlessSessionIdRef.current = null;
      streamingIdRef.current = null;
      thoughtIdRef.current = null;
      setMessages([]);
    }
  }

  /** Open/touch project (updates recents order) — only for explicit open/bootstrap. */
  async function selectProject(
    p: ProjectInfo,
    opts?: { silent?: boolean; clearChat?: boolean; touch?: boolean },
  ): Promise<void> {
    const shouldTouch = opts?.touch !== false;
    let opened = p;
    if (shouldTouch) {
      opened = (await window.grokDesktop.projects.open(p.path)) as ProjectInfo;
      await refreshProjects();
    }
    setProject(opened);
    expandProject(opened.path);
    await loadSessionsForProject(opened.path, { force: shouldTouch });

    void window.grokDesktop.acp
      .start({
        cwd: opened.path,
        model,
        alwaysApprove,
      })
      .then((st) => setStatus(st as AcpStatus))
      .catch(() => {
        /* headless path still works */
      });

    if (opts?.clearChat !== false && !opts?.silent) {
      setSession(null);
      continueRef.current = false;
      headlessSessionIdRef.current = null;
      streamingIdRef.current = null;
      thoughtIdRef.current = null;
      setMessages([]);
    } else if (opts?.silent) {
      setSession(null);
      setMessages([]);
    }
  }

  async function toggleProject(p: ProjectInfo): Promise<void> {
    const isOpen = expandedProjects.has(p.path);
    if (isOpen) {
      setExpandedProjects((prev) => {
        const next = new Set(prev);
        next.delete(p.path);
        return next;
      });
      // Keep active project as-is; do not reorder list
      return;
    }
    // Expand only: load sessions, optionally set as active cwd, never touch/reorder
    expandProject(p.path);
    await loadSessionsForProject(p.path);
    setProject(p);
  }

  async function openProjectPicker(): Promise<void> {
    const picked = (await window.grokDesktop.projects.pickFolder()) as
      | ProjectInfo
      | null;
    if (picked) await selectProject(picked);
  }

  async function pinProject(p: ProjectInfo, pinned: boolean): Promise<void> {
    try {
      const list = (await window.grokDesktop.projects.pin(
        p.path,
        pinned,
      )) as ProjectInfo[];
      setProjects(list);
    } catch (e) {
      setMessages((m) => [
        ...m,
        systemMessage(
          t("msg.pinFailed", { msg: e instanceof Error ? e.message : String(e) }),
        ),
      ]);
    }
  }

  async function removeProjectFromList(p: ProjectInfo): Promise<void> {
    try {
      const list = (await window.grokDesktop.projects.remove(
        p.path,
      )) as ProjectInfo[];
      setProjects(list);
      setExpandedProjects((prev) => {
        const next = new Set(prev);
        next.delete(p.path);
        return next;
      });
      setSessionsByProject((prev) => {
        const next = { ...prev };
        delete next[p.path];
        return next;
      });
      if (project?.path === p.path) {
        setProject(null);
        setSession(null);
        setMessages([systemMessage(t("msg.projectRemoved"))]);
        acpSessionIdRef.current = null;
        headlessSessionIdRef.current = null;
      }
    } catch (e) {
      setMessages((m) => [
        ...m,
        systemMessage(
          t("msg.removeProjectFailed", { msg: e instanceof Error ? e.message : String(e) }),
        ),
      ]);
    }
  }

  async function revealProjectInFinder(p: ProjectInfo): Promise<void> {
    try {
      const reveal = window.grokDesktop.shell?.showItemInFolder;
      if (typeof reveal === "function") {
        await reveal(p.path);
      } else {
        // 旧 preload 兼容：用 file:// 打开目录
        await window.grokDesktop.shell.openExternal(`file://${p.path}`);
      }
    } catch (e) {
      setMessages((m) => [
        ...m,
        systemMessage(
          t("msg.revealFailed", { msg: e instanceof Error ? e.message : String(e) }),
        ),
      ]);
    }
  }

  async function loadSession(
    s: SessionSummary,
    owner?: ProjectInfo | null,
  ): Promise<void> {
    const proj = owner || project;
    if (!proj) return;
    const loadSeq = ++sessionLoadSeqRef.current;
    const sessionCwd = s.cwd || proj.path;
    const cacheKey = [
      s.id,
      sessionCwd,
      s.updatedAt || "",
      s.numMessages || "",
    ].join(":");
    const cached = transcriptCacheRef.current[cacheKey];
    const isCurrentLoad = () => loadSeq === sessionLoadSeqRef.current;

    setSessionLoading(true);
    setSession(s);
    setMessages(cached ? cached.map((m) => ({ ...m })) : []);
    setAttachments([]);
    draftNewSessionRef.current = false;
    setPluginsPageOpen(false);
    streamingIdRef.current = null;
    thoughtIdRef.current = null;
    // 仅清除与「当前会话无关」的 seed；同会话 fork seed 由下方 snapshot 恢复
    forkContextSeedRef.current = null;

    try {
      const transcriptPromise = cached
        ? Promise.resolve(null)
        : window.grokDesktop.sessions.transcript(s.id, sessionCwd);

      // Switch project context without reordering the tree
      if (!project || project.path !== proj.path) {
        await activateProject(proj, { clearChat: false, connectAcp: false });
      } else {
        setProject(proj);
        expandProject(proj.path);
      }

      headlessSessionIdRef.current = s.id;
      acpSessionIdRef.current = s.id;
      continueRef.current = true;
      void (async () => {
        try {
          await ensureAcpAgent(proj.path);
          await window.grokDesktop.acp.loadSession(s.id, proj.path);
          if (!isCurrentLoad()) return;
          setStatus((st) => ({
            ...st,
            connected: true,
            sessionId: s.id,
            cwd: proj.path,
          }));
        } catch {
          /* disk transcript still loads; next prompt will create ACP session */
        }
      })();

      if (!isCurrentLoad()) return;
      if (!cached) {
        // TUI source of truth: ~/.grok/sessions/.../updates.jsonl
        // 若尚无真实回合，会回退 desktop_snapshot.json（fork 消息）
        const transcript = (await transcriptPromise) as Array<{
          id: string;
          kind: string;
          content: string;
          title?: string;
          status?: string;
          timestamp?: number;
          meta?: ChatMessage["meta"];
          attachments?: Array<{
            id: string;
            name: string;
            path: string;
            isImage?: boolean;
          }>;
        }>;
        if (!isCurrentLoad()) return;

        const kindToRole = (kind: string): ChatMessage["role"] => {
          switch (kind) {
            case "user":
            case "assistant":
            case "thought":
            case "tool":
            case "plan":
            case "subagent":
            case "system":
              return kind;
            default:
              return "system";
          }
        };

        const restored: ChatMessage[] = transcript
          .filter((row) => {
            const text = String(row.content || "").trim();
            const hasAtt = (row.attachments?.length || 0) > 0;
            // 双保险：transcript 侧已过滤，这里再挡一层历史/边界数据
            // 允许「仅附件」用户消息
            if (!text && row.kind !== "tool" && !(row.kind === "user" && hasAtt)) {
              return false;
            }
            if (
              text.startsWith("<system-reminder>") ||
              text.includes("<system-reminder>")
            ) {
              return false;
            }
            if (text.startsWith("<user_info>") || text.includes("<user_info>")) {
              return false;
            }
            return true;
          })
          .map((row) => {
            // Do NOT set file:// as previewUrl — renderer cannot load it.
            // AttachmentStrip resolves path → data URL via fs.readFileBase64.
            const atts = row.attachments?.map((a) => {
              const abs = a.path || "";
              return {
                id: a.id || uid(),
                name: a.name,
                path: abs,
                mimeType: a.isImage ? "image/*" : "application/octet-stream",
                isImage: !!a.isImage,
              };
            });
            return {
              id: row.id || uid(),
              role: kindToRole(row.kind),
              content: row.content || "",
              toolName: row.title,
              status: row.status,
              createdAt: row.timestamp
                ? new Date(
                    row.timestamp > 1e12 ? row.timestamp : row.timestamp * 1000,
                  ).toISOString()
                : new Date().toISOString(),
              collapsed: row.kind === "thought",
              meta: (row as { meta?: ChatMessage["meta"] }).meta,
              attachments: atts?.length ? atts : undefined,
            };
          });

        transcriptCacheRef.current[cacheKey] = restored;
        setMessages(restored);
      }

      // fork 且尚未消耗 seed：恢复分支上下文，供下次发送注入
      try {
        const snap = await window.grokDesktop.sessions.readSnapshot(
          s.id,
          sessionCwd,
        );
        if (!isCurrentLoad()) return;
        if (snap?.kind === "fork" && snap.seed && !snap.seedConsumed) {
          forkContextSeedRef.current = snap.seed;
        }
      } catch {
        /* ignore */
      }
    } catch (error) {
      setMessages([
        systemMessage(
          t("msg.loadSessionFailed", { msg: error instanceof Error ? error.message : String(error) }),
        ),
      ]);
    } finally {
      if (isCurrentLoad()) setSessionLoading(false);
    }
  }

  function buildArgs(): string[] {
    return buildGrokArgs({
      activeModel: model,
      effortLevel: effort,
      reasoningEffort: reasoning,
      alwaysApprove,
      permissionMode,
      bestOfN,
      experimentalMemory: memory,
      noMemory: !memory,
      webSearchEnabled: webSearch,
      subagentsEnabled: subagents,
      selfCheck,
      maxTurns,
      noPlan,
      sandbox: sandbox || null,
      cwd: project?.path || "",
      continueConversation:
        continueRef.current ||
        messages.some((m) => m.role === "user" || m.role === "assistant"),
      resumeSessionId: headlessSessionIdRef.current,
    });
  }

  function extractUpdateText(content: unknown): string {
    if (!content) return "";
    if (typeof content === "string") return content;
    if (typeof content === "object") {
      const c = content as Record<string, unknown>;
      if (typeof c.text === "string") return c.text;
      if (c.content != null) return extractUpdateText(c.content);
    }
    if (Array.isArray(content)) {
      return content.map((p) => extractUpdateText(p)).join("");
    }
    return "";
  }

  /** Live ACP session/update → UI (tools + text/thought stream). */
  function handleAcpSessionUpdate(raw: unknown): void {
    const event = raw as {
      sessionId?: string;
      update?: Record<string, unknown>;
    };
    const update = (event.update || raw) as Record<string, unknown>;
    if (!update || typeof update !== "object") return;
    const su = String(update.sessionUpdate || update.session_update || "");
    if (!su) return;

    // 打断/收束后忽略流式与工具事件，防止 transcript 被迟到更新打乱
    const turnLive = turnActiveRef.current;
    const isStreamOrTool =
      su === "agent_message_chunk" ||
      su === "agent_message" ||
      su === "agent_thought_chunk" ||
      su === "agent_thought" ||
      su === "tool_call" ||
      su === "tool_call_update";
    if (!turnLive && isStreamOrTool) return;

    if (su === "agent_message_chunk" || su === "agent_message") {
      const chunk = extractUpdateText(update.content);
      if (chunk) {
        streamBuffer.appendText(chunk);
        setRunLabel(t("status.writing"));
        setStreamPhase("writing");
      }
      return;
    }
    if (su === "agent_thought_chunk" || su === "agent_thought") {
      const chunk = extractUpdateText(update.content);
      if (chunk) {
        streamBuffer.appendThought(chunk);
        setRunLabel(t("status.thinking"));
        setStreamPhase("thinking");
      }
      return;
    }
    if (su === "tool_call") {
      const toolCallId = String(
        update.toolCallId || update.tool_call_id || uid(),
      );
      const title = String(update.title || "tool");
      const msgId = uid();
      toolMsgByCallIdRef.current.set(toolCallId, msgId);
      const kind =
        (update.kind as string) ||
        ((update._meta as { "x.ai/tool"?: { kind?: string } } | undefined)?.[
          "x.ai/tool"
        ]?.kind as string) ||
        "other";
      const rawIn = update.rawInput as
        | {
            target_file?: string;
            file_path?: string;
            old_string?: string;
            new_string?: string;
            content?: string;
            variant?: string;
          }
        | undefined;
      const isEdit =
        kind === "edit" ||
        kind === "write" ||
        !!rawIn?.old_string ||
        !!rawIn?.new_string ||
        /search_replace|str_replace|write/i.test(title);
      setMessages((m) => [
        ...m,
        {
          id: msgId,
          role: "tool",
          content: "",
          toolName: title,
          status: "pending",
          createdAt: new Date().toISOString(),
          meta: {
            toolKind: isEdit ? "edit" : kind,
            rawInput: update.rawInput,
            filePath: rawIn?.target_file || rawIn?.file_path,
            diffPath: rawIn?.file_path || rawIn?.target_file,
            oldText: rawIn?.old_string,
            newText:
              rawIn?.new_string ||
              (isEdit && typeof rawIn?.content === "string"
                ? rawIn.content
                : undefined),
          },
        },
      ]);
      setRunLabel(t("status.toolPrefix", { title }));
      return;
    }
    if (su === "tool_call_update") {
      const toolCallId = String(
        update.toolCallId || update.tool_call_id || "",
      );
      const msgId = toolMsgByCallIdRef.current.get(toolCallId);
      if (!msgId) return;
      const title =
        update.title != null ? String(update.title) : undefined;
      const status =
        update.status != null ? String(update.status) : undefined;
      // Prefer diff meta for edits (+/- 高亮依赖 oldText/newText)
      let content = "";
      let metaPatch: ChatMessage["meta"] = {};
      if (Array.isArray(update.content)) {
        for (const part of update.content as Array<Record<string, unknown>>) {
          if (part?.type === "diff") {
            const oldT = String(
              part.oldText ?? part.old_text ?? "",
            );
            const newT = String(
              part.newText ?? part.new_text ?? "",
            );
            metaPatch = {
              toolKind: "edit",
              diffPath: String(part.path || ""),
              filePath: String(part.path || ""),
              oldText: oldT,
              newText: newT,
            };
            content = newT.slice(0, 8000) || oldT.slice(0, 8000);
          } else {
            content += extractUpdateText(part);
          }
        }
      } else {
        content = extractUpdateText(update.content);
      }
      // Fallback: search_replace rawInput carries old_string / new_string
      const rawIn = update.rawInput as
        | {
            old_string?: string;
            new_string?: string;
            file_path?: string;
            path?: string;
          }
        | undefined;
      if (rawIn) {
        const os =
          typeof rawIn.old_string === "string" ? rawIn.old_string : "";
        const ns =
          typeof rawIn.new_string === "string" ? rawIn.new_string : "";
        if (os || ns) {
          metaPatch = {
            ...metaPatch,
            toolKind: "edit",
            oldText:
              (metaPatch?.oldText as string | undefined) || os || undefined,
            newText:
              (metaPatch?.newText as string | undefined) || ns || undefined,
            filePath:
              (metaPatch?.filePath as string | undefined) ||
              rawIn.file_path ||
              rawIn.path ||
              undefined,
            diffPath:
              (metaPatch?.diffPath as string | undefined) ||
              rawIn.file_path ||
              rawIn.path ||
              undefined,
          };
          if (!content) content = (ns || os).slice(0, 8000);
        }
      }
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId
            ? {
                ...m,
                toolName: title || m.toolName,
                status: status || m.status,
                content: content || m.content,
                meta: { ...(m.meta || {}), ...metaPatch },
              }
            : m,
        ),
      );
      return;
    }
    if (su === "plan" && Array.isArray(update.entries)) {
      // Codex 风格：计划内容进检查器 Plan 面板，不刷到聊天列表
      const body = (update.entries as Array<{ content?: string; status?: string }>)
        .map((e) => {
          const mark =
            e.status === "completed"
              ? "✓"
              : e.status === "in_progress"
                ? "…"
                : "○";
          return `${mark} ${e.content || ""}`;
        })
        .join("\n");
      if (body) setPlanText(body);
    }
    if (su === "subagent_spawned") {
      const id = String(update.subagent_id || update.child_session_id || uid());
      setSubagentViews((prev) => [
        {
          id,
          title: String(
            update.description || update.subagent_type || "subagent",
          ),
          status: "running",
          detail: [update.model, update.capability_mode]
            .filter(Boolean)
            .join(" · "),
        },
        ...prev.filter((s) => s.id !== id).slice(0, 19),
      ]);
    }
    if (su === "subagent_finished") {
      const id = String(update.subagent_id || update.child_session_id || "");
      setSubagentViews((prev) =>
        prev.map((s) =>
          s.id === id
            ? {
                ...s,
                status: String(update.status || "completed"),
                detail: `turns=${update.turns ?? "?"} tools=${update.tool_calls ?? "?"}`,
              }
            : s,
        ),
      );
    }
  }

  async function refreshContext(): Promise<void> {
    const sid =
      session?.id || acpSessionIdRef.current || headlessSessionIdRef.current;
    if (!sid) {
      setContextStats(null);
      return;
    }
    setContextLoading(true);
    try {
      const stats = (await window.grokDesktop.sessionMeta.context(
        sid,
        project?.path,
      )) as ContextStatsView | null;
      setContextStats(stats);
    } finally {
      setContextLoading(false);
    }
  }

  async function refreshRewind(): Promise<void> {
    const sid =
      session?.id || acpSessionIdRef.current || headlessSessionIdRef.current;
    if (!sid) {
      setRewindPoints([]);
      return;
    }
    setRewindLoading(true);
    try {
      const points = (await window.grokDesktop.sessionMeta.rewindList(
        sid,
        project?.path,
      )) as RewindPointView[];
      setRewindPoints(points || []);
    } finally {
      setRewindLoading(false);
    }
  }

  async function refreshMcp(): Promise<void> {
    const list = (await window.grokDesktop.extensions.mcpList()) as McpServerView[];
    setMcpServers(list || []);
  }

  async function refreshSkillsAndHooks(): Promise<void> {
    const [sk, hk] = await Promise.all([
      window.grokDesktop.extensions.skillsList(project?.path),
      window.grokDesktop.extensions.hooksList(project?.path),
    ]);
    setSkillsList((sk as SkillView[]) || []);
    setHooksList((hk as HookView[]) || []);
  }

  function openGlobalPage(tab: GlobalConfigKind = "mcp"): void {
    setInspectorOpen(false);
    setGlobalPage(tab);
    void refreshMcp();
    void refreshSkillsAndHooks();
  }

  function openSessionInspector(
    target?: SessionSummary | null,
    tab: "context" | "plan" | "rewind" | "subagents" = "context",
    owner?: ProjectInfo | null,
  ): void {
    const s = target || session;
    if (!s) {
      setMessages((m) => [
        ...m,
        systemMessage(t("msg.needSessionForInspector")),
      ]);
      return;
    }
    setGlobalPage(null);
    setPluginsPageOpen(false);
    // 仅在切换到另一会话时加载；合成摘要且已是当前 id 则跳过
    if (owner && (!project || project.path !== owner.path)) {
      void loadSession(s, owner);
    } else if (session && session.id !== s.id) {
      const proj =
        owner ||
        project ||
        ({
          path: s.cwd,
          name: s.cwd.split("/").pop() || s.cwd,
        } as ProjectInfo);
      void loadSession(s, proj);
    } else if (!session) {
      setSession(s);
    }
    setInspectorScope("session");
    setInspectorTab(tab);
    setInspectorOpen(true);
    void refreshContext();
    void refreshRewind();
  }

  async function refreshWorktree(): Promise<void> {
    if (!project) {
      setWorktreeText("(no project)");
      return;
    }
    const t = (await window.grokDesktop.extensions.worktrees(
      project.path,
    )) as string;
    setWorktreeText(t || "(empty)");
  }

  function openRenameSession(
    target?: { session: SessionSummary; project: ProjectInfo } | null,
  ): void {
    const s = target?.session || session;
    const p = target?.project || project;
    if (!s) return;
    const cwd = p?.path || s.cwd || "";
    if (!cwd) return;
    setRenameTarget({
      sessionId: s.id,
      cwd,
      title: s.title?.trim() || "",
    });
    setRenameDraft(s.title?.trim() || "");
    setRenameError(null);
    setRenameOpen(true);
  }

  async function submitRenameSession(): Promise<void> {
    const title = renameDraft.trim();
    if (!renameTarget) return;
    if (!title) {
      setRenameError(t("app.renameEmpty"));
      return;
    }
    if (title === (renameTarget.title || "").trim()) {
      setRenameOpen(false);
      setRenameTarget(null);
      return;
    }
    setRenameBusy(true);
    setRenameError(null);
    try {
      const result = (await window.grokDesktop.slash.execute(
        `/rename ${title}`,
        {
          projectPath: renameTarget.cwd,
          sessionId: renameTarget.sessionId,
          model: model || null,
        },
      )) as {
        handled?: boolean;
        action?: string;
        message?: string;
        data?: { sessionId?: string; title?: string };
      };
      if (result.action === "rename-session" && result.data?.sessionId) {
        await applySlashResult(result as Parameters<typeof applySlashResult>[0]);
        setRenameOpen(false);
        setRenameTarget(null);
        return;
      }
      setRenameError(result.message || t("app.renameFailed"));
      if (result.message && result.action === "error") {
        setMessages((m) => [...m, systemMessage(result.message!)]);
      }
    } catch (e) {
      setRenameError(e instanceof Error ? e.message : String(e));
    } finally {
      setRenameBusy(false);
    }
  }

  async function runSlashCommand(cmd: string): Promise<void> {
    if (!project) return;
    const result = (await window.grokDesktop.slash.execute(cmd, {
      projectPath: project.path,
      sessionId:
        session?.id ||
        acpSessionIdRef.current ||
        headlessSessionIdRef.current,
      lastAssistantText,
      alwaysApprove,
      model,
    })) as Parameters<typeof applySlashResult>[0];
    await applySlashResult(result);
  }

  async function applyRewind(promptIndex: number): Promise<void> {
    const sid =
      session?.id || acpSessionIdRef.current || headlessSessionIdRef.current;
    if (!sid || !project) return;
    const result = (await window.grokDesktop.sessionMeta.rewindApply(
      sid,
      promptIndex,
      project.path,
    )) as { written: string[]; errors: string[] };
    // Truncate UI to include user message at promptIndex, drop everything after
    setMessages((prev) => {
      let u = 0;
      const kept: ChatMessage[] = [];
      for (const m of prev) {
        kept.push(m);
        if (m.role === "user") {
          if (u === promptIndex) break;
          u += 1;
        }
      }
      return [
        ...kept,
        systemMessage(
          t("msg.rewindRestored", {
            index: promptIndex,
            n: result.written?.length || 0,
          }) +
            (result.errors?.length
              ? t("msg.rewindErrors", {
                  errors: result.errors.join("; "),
                })
              : ""),
        ),
      ];
    });
  }

  async function togglePlanMode(on: boolean): Promise<void> {
    setPlanMode(on);
    if (!project) return;
    try {
      const sid = await ensureAcpSession(project.path, false);
      await window.grokDesktop.acp.setMode(on ? "plan" : "default", sid);
      // 状态只体现在 composer 的 Plan 按钮上，不往聊天列表灌 system 消息
    } catch {
      // 回滚 UI 状态；错误可在检查器 / 控制台排查
      setPlanMode(!on);
    }
  }

  async function forkSession(): Promise<void> {
    await runSlashCommand("/fork");
  }

  /**
   * Codex-style message fork: new ACP session + context through chosen message.
   * Agent gets a one-shot seed on the next user send.
   */
  async function forkFromMessage(messageId: string): Promise<void> {
    if (!project) {
      setMessages((m) => [...m, systemMessage(t("msg.selectProjectFirst"))]);
      return;
    }
    if (busy) {
      setMessages((m) => [
        ...m,
        systemMessage(t("msg.waitBeforeFork")),
      ]);
      return;
    }
    const idx = messages.findIndex((m) => m.id === messageId);
    if (idx < 0) return;

    const slice = messages
      .slice(0, idx + 1)
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({
        ...m,
        id: uid(),
        streaming: false,
        collapsed: m.role === "thought" ? true : m.collapsed,
      }));

    if (!slice.length) {
      setMessages((m) => [
        ...m,
        systemMessage(t("msg.noForkContext")),
      ]);
      return;
    }

    const seed = slice
      .map((m) => {
        const who = m.role === "user" ? "User" : "Assistant";
        const attachNote =
          m.attachments?.length
            ? `\n[attachments: ${m.attachments.map((a) => a.path || a.name).join(", ")}]`
            : "";
        return `${who}:\n${m.content || "(empty)"}${attachNote}`;
      })
      .join("\n\n");

    try {
      setSessionLoading(true);
      const parentId = session?.id;
      const sid = await ensureAcpSession(project.path, true);
      forkContextSeedRef.current = seed;
      setAttachments([]);
      setInput("");

      const forkTitle = `Fork · ${
        (slice[slice.length - 1]?.content || "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 40) || "branch"
      }`;
      const nextMessages: ChatMessage[] = [
        ...slice,
        systemMessage(t("msg.forkedContinue", { sid })),
      ];

      setSession({
        id: sid,
        cwd: project.path,
        title: forkTitle,
        summary: "forked from message",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        parentSessionId: parentId,
        sessionKind: "fork",
      });
      setMessages(nextMessages);

      // 持久化到会话目录，避免切换会话后 transcript 为空导致内容消失
      try {
        await window.grokDesktop.sessions.saveSnapshot(sid, project.path, {
          kind: "fork",
          title: forkTitle,
          parentSessionId: parentId,
          seed,
          messages: nextMessages.map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content || "",
            toolName: m.toolName,
            status: m.status,
            createdAt: m.createdAt,
            meta: m.meta as Record<string, unknown> | undefined,
            attachments: m.attachments?.map((a) => ({
              id: a.id,
              name: a.name,
              path: a.path,
              mimeType: a.mimeType,
              isImage: a.isImage,
            })),
          })),
        });
      } catch {
        /* snapshot best-effort */
      }

      if (projectPathRef.current) {
        void loadSessionsForProject(projectPathRef.current, { force: true });
      }
      textareaRef.current?.focus();
    } catch (error) {
      setMessages((m) => [
        ...m,
        systemMessage(
          t("msg.forkFailed", { msg: error instanceof Error ? error.message : String(error) }),
        ),
      ]);
    } finally {
      setSessionLoading(false);
    }
  }

  /** 最后一条用户消息（用于编辑 / 重试）。 */
  function findLastUserMessage(
    list: ChatMessage[] = messages,
  ): ChatMessage | null {
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i].role === "user") return list[i];
    }
    return null;
  }

  /**
   * 编辑用户消息：填入输入框，并截断该消息及之后内容。
   * 用户改完后正常发送。
   */
  function editUserMessage(messageId: string): void {
    if (busy) {
      setMessages((m) => [...m, systemMessage(t("msg.waitBeforeEdit"))]);
      return;
    }
    const idx = messages.findIndex((m) => m.id === messageId);
    if (idx < 0) return;
    const m = messages[idx];
    if (m.role !== "user") return;

    const attachmentOnly = t("msg.attachmentOnly");
    const text =
      m.content === attachmentOnly && m.attachments?.length
        ? ""
        : m.content || "";
    setInput(text);
    setAttachments(
      (m.attachments || []).map((a) => ({
        id: a.id,
        name: a.name,
        path: a.path,
        mimeType: a.mimeType,
        size: a.size,
        isImage: a.isImage,
        previewUrl: a.previewUrl,
      })),
    );
    setShowSlash(false);
    // 去掉该用户消息及之后的 assistant / tool 等
    setMessages((prev) => prev.slice(0, idx));
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      const len = el.value.length;
      el.setSelectionRange(len, len);
    });
  }

  /** 重试：保留用户气泡，去掉其后回复并重新跑一轮。 */
  async function retryFromUserMessage(messageId: string): Promise<void> {
    if (busy) {
      setMessages((m) => [...m, systemMessage(t("msg.waitBeforeRetry"))]);
      return;
    }
    if (!project) {
      setMessages((m) => [...m, systemMessage(t("msg.selectProjectFirst"))]);
      return;
    }
    const m = messages.find((x) => x.id === messageId);
    if (!m || m.role !== "user") return;

    const attachmentOnly = t("msg.attachmentOnly");
    const prompt =
      m.content === attachmentOnly && m.attachments?.length
        ? ""
        : m.content || "";
    const pending = (m.attachments || []).map((a) => ({
      id: a.id,
      name: a.name,
      path: a.path,
      mimeType: a.mimeType,
      size: a.size,
      isImage: a.isImage,
      previewUrl: a.previewUrl,
    }));
    if (!prompt.trim() && !pending.length) return;

    await runAgent(prompt, pending, { retryFromUserId: messageId });
  }

  async function retryLastTurn(): Promise<void> {
    const last = findLastUserMessage();
    if (!last) {
      setMessages((m) => [...m, systemMessage(t("msg.noRetryTarget"))]);
      return;
    }
    await retryFromUserMessage(last.id);
  }

  function removeAttachment(id: string): void {
    setAttachments((prev) => {
      const next = prev.filter((a) => a.id !== id);
      const removed = prev.find((a) => a.id === id);
      if (removed?.previewUrl?.startsWith("blob:")) {
        try {
          URL.revokeObjectURL(removed.previewUrl);
        } catch {
          /* ignore */
        }
      }
      return next;
    });
  }

  async function addFilesFromPicker(): Promise<void> {
    try {
      const picked = await window.grokDesktop.dialog.pickFiles({
        multiSelections: true,
      });
      if (!picked?.length) return;
      setAttachments((prev) => {
        const room = Math.max(0, MAX_ATTACHMENTS - prev.length);
        const extra = picked.slice(0, room).map((p) => ({
          id: p.id,
          name: p.name,
          path: p.path,
          mimeType: p.mimeType,
          size: p.size,
          isImage: p.isImage,
          previewUrl: p.isImage ? undefined : undefined,
        }));
        return [...prev, ...extra];
      });
      // Load image previews via base64 for file paths
      for (const p of picked) {
        if (!p.isImage) continue;
        void window.grokDesktop.fs
          .readFileBase64(p.path, MAX_IMAGE_INLINE_BYTES)
          .then((r) => {
            if ("error" in r) return;
            const url = `data:${r.mimeType};base64,${r.dataBase64}`;
            setAttachments((prev) =>
              prev.map((a) =>
                a.path === p.path ? { ...a, previewUrl: url } : a,
              ),
            );
          });
      }
    } catch (e) {
      setMessages((m) => [
        ...m,
        systemMessage(
          t("msg.pickFilesFailed", { msg: e instanceof Error ? e.message : String(e) }),
        ),
      ]);
    }
  }

  async function addBlobAsAttachment(
    blob: Blob,
    nameHint?: string,
  ): Promise<void> {
    if (attachments.length >= MAX_ATTACHMENTS) {
      setMessages((m) => [
        ...m,
        systemMessage(t("msg.maxAttachments", { n: MAX_ATTACHMENTS })),
      ]);
      return;
    }
    const mime = blob.type || "application/octet-stream";
    const isImage = isImageMime(mime);
    const ext =
      mime === "image/png"
        ? ".png"
        : mime === "image/jpeg"
          ? ".jpg"
          : mime === "image/gif"
            ? ".gif"
            : mime === "image/webp"
              ? ".webp"
              : isImage
                ? ".img"
                : ".bin";
    const name =
      nameHint ||
      (blob instanceof File && blob.name
        ? blob.name
        : `paste-${Date.now()}${ext}`);
    try {
      const dataBase64 = await fileToBase64(blob);
      const previewUrl = isImage ? await fileToDataUrl(blob) : undefined;
      const saved = await window.grokDesktop.fs.saveAttachment({
        dataBase64,
        name,
        mimeType: mime,
        projectPath: project?.path || null,
      });
      setAttachments((prev) => {
        if (prev.length >= MAX_ATTACHMENTS) return prev;
        return [
          ...prev,
          {
            id: saved.id,
            name: saved.name,
            path: saved.path,
            mimeType: saved.mimeType,
            size: saved.size,
            isImage: saved.isImage,
            previewUrl,
          },
        ];
      });
    } catch (e) {
      setMessages((m) => [
        ...m,
        systemMessage(
          t("msg.addAttachmentFailed", { msg: e instanceof Error ? e.message : String(e) }),
        ),
      ]);
    }
  }

  async function handleComposerPaste(
    e: ClipboardEvent<HTMLTextAreaElement>,
  ): Promise<void> {
    const items = e.clipboardData?.items;
    if (!items?.length) return;
    const imageItems: DataTransferItem[] = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.kind === "file" && it.type.startsWith("image/")) {
        imageItems.push(it);
      }
    }
    if (!imageItems.length) return;
    e.preventDefault();
    for (const it of imageItems) {
      const file = it.getAsFile();
      if (file) await addBlobAsAttachment(file, file.name || undefined);
    }
  }

  async function handleFileInputChange(
    e: ChangeEvent<HTMLInputElement>,
  ): Promise<void> {
    const files = e.target.files;
    if (!files?.length) return;
    for (const file of Array.from(files)) {
      await addBlobAsAttachment(file, file.name);
    }
    e.target.value = "";
  }

  async function ensureAcpAgent(cwd: string): Promise<void> {
    const effortArg =
      reasoning && reasoning !== "off" ? reasoning : effort || undefined;
    await window.grokDesktop.acp.start({
      cwd,
      model: model || undefined,
      alwaysApprove,
      reasoningEffort: effortArg,
    });
  }

  async function ensureAcpSession(cwd: string, forceNew = false): Promise<string> {
    await ensureAcpAgent(cwd);
    const wantNew = forceNew || draftNewSessionRef.current;
    if (!wantNew && acpSessionIdRef.current) {
      return acpSessionIdRef.current;
    }

    const result = (await window.grokDesktop.acp.newSession(cwd, {
      // pass-through hints when agent supports them
    })) as { sessionId: string };
    draftNewSessionRef.current = false;
    acpSessionIdRef.current = result.sessionId;
    headlessSessionIdRef.current = result.sessionId;
    continueRef.current = true;
    setStatus((s) => ({
      ...s,
      sessionId: result.sessionId,
      connected: true,
      cwd,
    }));
    return result.sessionId;
  }

  /**
   * Primary runtime: ACP long session (same agent as TUI via grok agent stdio).
   * Falls back to headless if ACP fails to start/prompt.
   *
   * @param opts.retryFromUserId 重试：截断该用户消息之后的回合，并复用该气泡（不再插入新 user 消息）
   */
  async function runAgent(
    prompt: string,
    pendingAttachments: MessageAttachment[] = [],
    opts?: { retryFromUserId?: string },
  ): Promise<void> {
    if (!project) {
      setMessages((m) => [...m, systemMessage(t("msg.selectProjectFirst"))]);
      return;
    }
    if (!prompt.trim() && !pendingAttachments.length) return;

    if (busy) {
      // 重试/编辑重发不进队列，避免静默叠任务
      if (opts?.retryFromUserId) {
        setMessages((m) => [...m, systemMessage(t("msg.waitBeforeRetry"))]);
        return;
      }
      setQueue((q) => [...q, prompt]);
      setMessages((m) => [
        ...m,
        systemMessage(t("msg.queued", { n: queue.length + 1 })),
      ]);
      return;
    }

    // One-shot fork seed so agent has parent context
    let effectivePrompt = prompt;
    const seed = forkContextSeedRef.current;
    if (seed) {
      effectivePrompt =
        t("msg.forkSeed", { seed, prompt: prompt || t("msg.userMsgAttachmentOnly") });
      forkContextSeedRef.current = null;
      // 标记 seed 已消耗，避免切换会话后再次注入
      if (acpSessionIdRef.current && project) {
        void window.grokDesktop.sessions
          .readSnapshot(acpSessionIdRef.current, project.path)
          .then((snap) => {
            if (!snap || !acpSessionIdRef.current || !project) return;
            return window.grokDesktop.sessions.saveSnapshot(
              acpSessionIdRef.current,
              project.path,
              {
                kind: snap.kind,
                title: snap.title,
                parentSessionId: snap.parentSessionId,
                seed: snap.seed,
                seedConsumed: true,
                messages: snap.messages,
              },
            );
          })
          .catch(() => {
            /* ignore */
          });
      }
    }

    const { textPrompt, blocks } = buildPromptWithAttachments(
      effectivePrompt,
      pendingAttachments,
    );

    const userId = opts?.retryFromUserId || uid();
    const thoughtId = uid();
    const textId = uid();
    thoughtIdRef.current = thoughtId;
    streamingIdRef.current = textId;
    streamStartedAtRef.current = Date.now();
    setStreamElapsed(0);
    setStreamPhase("waiting");
    toolMsgByCallIdRef.current.clear();

    setMessages((m) => {
      let base = m;
      if (opts?.retryFromUserId) {
        const idx = m.findIndex((x) => x.id === opts.retryFromUserId);
        if (idx >= 0) base = m.slice(0, idx + 1);
      }
      const next = base.slice();
      if (!opts?.retryFromUserId) {
        next.push({
          id: userId,
          role: "user",
          content:
            prompt ||
            (pendingAttachments.length ? t("msg.attachmentOnly") : ""),
          createdAt: new Date().toISOString(),
          attachments: pendingAttachments.length
            ? pendingAttachments.map((a) => ({
                id: a.id,
                name: a.name,
                path: a.path,
                mimeType: a.mimeType,
                size: a.size,
                isImage: a.isImage,
                previewUrl: a.previewUrl,
              }))
            : undefined,
        });
      }
      next.push({
        id: textId,
        role: "assistant",
        content: "",
        createdAt: new Date().toISOString(),
        streaming: true,
      });
      return next;
    });
    // 先标记回合活跃，再 begin，否则 streamBuffer 首次 emit 会被 applySnapshot 丢弃
    turnActiveRef.current = true;
    streamBuffer.begin({ thoughtId, textId });
    setBusy(true);
    setRunLabel(t("status.agentConnecting"));
    runtimeModeRef.current = "acp";

    try {
      const sid = await ensureAcpSession(project.path, false);
      if (planMode) {
        try {
          await window.grokDesktop.acp.setMode("plan", sid);
        } catch {
          /* mode optional */
        }
      }
      setRunLabel(t("status.agentRunning"));
      setSession((prev) =>
        prev
          ? prev
          : {
              id: sid,
              cwd: project.path,
              title: (prompt || t("msg.attachmentOnly")).slice(0, 48),
              summary: "",
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
      );
      // Enrich with image base64 when small enough (best-effort multimodal)
      const richBlocks = [...blocks];
      for (const a of pendingAttachments) {
        if (!a.isImage && !isImageMime(a.mimeType)) continue;
        if ((a.size || 0) > MAX_IMAGE_INLINE_BYTES) continue;
        try {
          const r = await window.grokDesktop.fs.readFileBase64(
            a.path,
            MAX_IMAGE_INLINE_BYTES,
          );
          if ("error" in r) continue;
          richBlocks.push({
            type: "image",
            data: r.dataBase64,
            mimeType: r.mimeType || a.mimeType,
            uri: a.path.startsWith("file://") ? a.path : `file://${a.path}`,
          });
        } catch {
          /* path-only is enough */
        }
      }
      // Prefer rich blocks; fall back to text+paths if agent rejects schema
      try {
        await window.grokDesktop.acp.prompt(richBlocks, sid);
      } catch {
        await window.grokDesktop.acp.prompt(textPrompt, sid);
      }
      // Turn finished
      finalizeAcpTurn();
    } catch (error) {
      // Fallback to headless for this turn
      const msg = error instanceof Error ? error.message : String(error);
      setMessages((m) => [
        ...m,
        systemMessage(t("msg.acpFallback", { msg })),
      ]);
      runtimeModeRef.current = "headless";
      try {
        const args = buildArgs();
        await window.grokDesktop.headless.run({
          args,
          prompt: textPrompt,
          cwd: project.path,
        });
      } catch (e2) {
        turnActiveRef.current = false;
        streamBuffer.reset();
        setBusy(false);
        setRunLabel(null);
        setStreamPhase("idle");
        setMessages((m) => [
          ...m.filter((x) => x.id !== textId && x.id !== thoughtId),
          systemMessage(
            t("msg.startFailed", { msg: e2 instanceof Error ? e2.message : String(e2) }),
          ),
        ]);
      }
    }
  }

  function finalizeAcpTurn(opts?: { cancelled?: boolean }): void {
    // 幂等：打断后 prompt 返回会再次 finalize，忽略第二次
    if (!turnActiveRef.current && !busyRef.current) return;
    turnActiveRef.current = false;

    if (cancelForceTimerRef.current) {
      clearTimeout(cancelForceTimerRef.current);
      cancelForceTimerRef.current = null;
    }
    const final = streamBuffer.end();
    setMessages((prev) => {
      let next = prev.slice();
      const finalize = (id: string | null, content: string, role: ChatMessage["role"]) => {
        if (!id) return;
        const idx = next.findIndex((m) => m.id === id);
        if (idx === -1) {
          if (!content) return;
          next.push({
            id,
            role,
            content,
            createdAt: new Date().toISOString(),
            streaming: false,
            collapsed: role === "thought",
          });
          return;
        }
        next[idx] = {
          ...next[idx],
          content: content || next[idx].content,
          streaming: false,
          collapsed: role === "thought" ? true : next[idx].collapsed,
        };
      };
      finalize(final.thoughtId, final.thought, "thought");
      finalize(final.textId, final.text, "assistant");
      // 收束整轮：清掉工具/子代理/思考上卡住的 streaming 与 running 状态，避免 UI 一直「处理中」
      next = next.map((m) => {
        if (!m.streaming && !isIncompleteToolStatus(m.status)) return m;
        let status = m.status;
        if (isIncompleteToolStatus(m.status)) {
          if (opts?.cancelled) {
            status = "cancelled";
          } else if (
            m.status === "running" ||
            m.status === "in_progress" ||
            m.status === "pending"
          ) {
            status = "completed";
          }
        }
        return {
          ...m,
          streaming: false,
          status,
          collapsed: m.role === "thought" ? true : m.collapsed,
        };
      });
      // 仅去掉「空的」占位 assistant；有正文的半截回复要保留
      next = next.filter(
        (m) =>
          !(m.id === final.textId && !m.content && m.role === "assistant"),
      );
      if (opts?.cancelled) {
        // 避免重复堆叠「已停止」
        const last = next[next.length - 1];
        const stopped = t("msg.stopped");
        if (!(last?.role === "system" && last.content === stopped)) {
          next.push(systemMessage(stopped));
        }
      }
      return next;
    });
    streamBuffer.reset();
    setBusy(false);
    setRunLabel(null);
    setStreamPhase("idle");
    setPermission(null);
    streamingIdRef.current = null;
    thoughtIdRef.current = null;
    toolMsgByCallIdRef.current.clear();
    continueRef.current = true;
    clearTranscriptCache(acpSessionIdRef.current || headlessSessionIdRef.current);
    if (projectPathRef.current) {
      void loadSessionsForProject(projectPathRef.current, { force: true });
    }
    void drainQueue();
  }

  /** @deprecated Prefer runAgent — kept for fallback path naming */
  async function runHeadless(prompt: string): Promise<void> {
    return runAgent(prompt);
  }

  async function drainQueue(): Promise<void> {
    if (queueProcessing.current) return;
    queueProcessing.current = true;
    try {
      setQueue((q) => {
        if (q.length === 0) return q;
        const [next, ...rest] = q;
        void runAgent(next);
        return rest;
      });
    } finally {
      queueProcessing.current = false;
    }
  }

  /**
   * 进入「草稿新会话」UI：不立即 acp.newSession。
   * 真正的会话在用户首次发送消息时由 ensureAcpSession 创建。
   */
  async function createNewChat(owner?: ProjectInfo | null): Promise<void> {
    // 先标记草稿，避免 acp status 把旧 sessionId 写回
    draftNewSessionRef.current = true;
    headlessSessionIdRef.current = null;
    acpSessionIdRef.current = null;
    continueRef.current = false;
    forkContextSeedRef.current = null;
    turnActiveRef.current = false;
    toolMsgByCallIdRef.current.clear();
    setSession(null);
    setAttachments([]);
    setInput("");
    setShowSlash(false);
    setBusy(false);
    setRunLabel(null);
    setStreamPhase("idle");
    streamBuffer.reset();
    setPluginsPageOpen(false);
    setGlobalPage(null);

    const target = owner || project;
    if (owner && (!project || project.path !== owner.path)) {
      await activateProject(owner, { clearChat: false, connectAcp: true });
      // activate 后可能被 status 污染，再清一次
      acpSessionIdRef.current = null;
      draftNewSessionRef.current = true;
    }
    if (!target && !owner) {
      setMessages([systemMessage(t("msg.selectProjectForNew"))]);
      return;
    }
    // 空会话界面：不立即 acp.newSession，首条消息再创建
    setMessages([]);
    const path = (owner || project)?.path;
    if (path) expandProject(path);
    textareaRef.current?.focus();
  }

  async function handleSubmit(): Promise<void> {
    const text = input.trim();
    const pending = attachments.slice();
    if (!text && !pending.length) return;

    // Slash commands ignore attachments unless text alone
    if (text.startsWith("/") && !pending.length) {
      setInput("");
      setShowSlash(false);
      await runSlashCommand(text);
      return;
    }

    setInput("");
    setAttachments([]);
    setShowSlash(false);
    await runAgent(text, pending);
  }

  async function applySlashResult(result: {
    handled: boolean;
    action?: string;
    message?: string;
    openPanel?: string;
    openTab?: string;
    promptText?: string;
    data?: unknown;
  }): Promise<void> {
    // 打开面板/检查器时不再往聊天里灌冗长 body；其它动作仍提示
    const skipChatToast =
      result.action === "open-panel" ||
      result.action === "open-inspector" ||
      result.action === "open-palette" ||
      result.action === "prompt";
    if (result.message && !skipChatToast) {
      setMessages((m) => [...m, systemMessage(result.message!)]);
    }
    switch (result.action) {
      case "new-session":
        await createNewChat();
        break;
      case "home":
        setSession(null);
        setMessages([systemMessage(t("msg.backHome"))]);
        break;
      case "open-palette":
        setPaletteOpen(true);
        break;
      case "open-inspector": {
        const tab = (result.openTab || "context") as
          | "context"
          | "plan"
          | "rewind"
          | "subagents";
        const sid =
          session?.id ||
          acpSessionIdRef.current ||
          headlessSessionIdRef.current;
        if (!sid || !project) {
          setMessages((m) => [
            ...m,
            systemMessage(t("msg.needSessionForInspector")),
          ]);
          break;
        }
        // 草稿/仅有 id 时构造最小 SessionSummary
        const target =
          session ||
          ({
            id: sid,
            cwd: project.path,
            title: sid.slice(0, 8),
            updatedAt: new Date().toISOString(),
          } as SessionSummary);
        openSessionInspector(target, tab, project);
        break;
      }
      case "open-panel":
        if (result.openPanel === "settings") {
          setSettingsOpen(true);
        } else if (
          result.openPanel === "mcps" ||
          result.openPanel === "mcp"
        ) {
          openGlobalPage("mcp");
        } else if (result.openPanel === "skills") {
          openGlobalPage("skills");
        } else if (result.openPanel === "hooks") {
          openGlobalPage("hooks");
        } else if (
          result.openPanel === "plugins" ||
          result.openPanel === "marketplace"
        ) {
          setGlobalPage(null);
          setPluginsPageOpen(true);
        } else {
          const body =
            (typeof result.data === "string"
              ? result.data
              : result.data != null
                ? JSON.stringify(result.data, null, 2)
                : "") ||
            result.message ||
            t("panel.emptyBody");
          setPanel((result.openPanel || "docs") as Exclude<PanelId, null>);
          setPanelBody(body);
        }
        break;
      case "fork-session": {
        const data = result.data as
          | {
              newSessionId?: string;
              new_session_id?: string;
              newCwd?: string;
              new_cwd?: string;
            }
          | undefined;
        const sid = data?.newSessionId || data?.new_session_id;
        const newCwd = data?.newCwd || data?.new_cwd || project?.path;
        if (sid && newCwd) {
          try {
            await window.grokDesktop.acp.loadSession(sid, newCwd);
          } catch {
            /* ignore */
          }
          acpSessionIdRef.current = sid;
          headlessSessionIdRef.current = sid;
          continueRef.current = true;
          draftNewSessionRef.current = false;
          setStatus((s) => ({
            ...s,
            sessionId: sid,
            connected: true,
            cwd: newCwd,
          }));
          setMessages((m) => [
            ...m,
            systemMessage(t("newSession.forked", { sid })),
          ]);
        }
        break;
      }
      case "prompt":
        if (result.promptText) await runAgent(result.promptText);
        break;
      case "export": {
        const text = messages
          .map((m) => `## ${m.role}\n\n${m.content}`)
          .join("\n\n");
        const saved = await window.grokDesktop.dialog.saveText(
          `grok-session.md`,
          text,
        );
        setMessages((m) => [
          ...m,
          systemMessage(
            saved
              ? t("msg.exported", { path: String(saved) })
              : t("msg.exportCancelled"),
          ),
        ]);
        break;
      }
      case "rename-session": {
        const { sessionId, title } = (result.data || {}) as {
          sessionId?: string;
          title?: string;
        };
        if (!sessionId || !title) break;
        setSession((current) =>
          current?.id === sessionId ? { ...current, title } : current,
        );
        setSessionsByProject((current) =>
          Object.fromEntries(
            Object.entries(current).map(([cwd, sessions]) => [
              cwd,
              sessions.map((item) =>
                item.id === sessionId ? { ...item, title } : item,
              ),
            ]),
          ),
        );
        setSessionSearchResults((current) =>
          current?.map((item) =>
            item.id === sessionId ? { ...item, title } : item,
          ) || current,
        );
        break;
      }
      case "toggle-theme":
        setThemeLight((v) => !v);
        break;
      case "toggle-timestamps":
        setShowTimestamps((v) => !v);
        break;
      case "toggle-multiline":
        setMultiline((v) => !v);
        break;
      case "toggle-compact-mode":
        setCompactMode((v) => !v);
        break;
      case "toggle-always-approve":
        setAlwaysApprove((v) => !v);
        break;
      case "toggle-auto-permission":
        setPermissionMode((v) => (v === "auto" ? "default" : "auto"));
        break;
      case "set-effort": {
        const next = String(
          (result.data as { effort?: string } | undefined)?.effort || "",
        )
          .trim()
          .toLowerCase();
        // Canonical CLI tiers; UI select only exposes low…max.
        if (["none", "minimal"].includes(next)) {
          setReasoning(next as ReasoningEffort);
        } else if (
          ["low", "medium", "high", "xhigh", "max"].includes(next)
        ) {
          setEffort(next as EffortLevel);
          setReasoning("off");
        }
        break;
      }
      case "set-model": {
        const next = String(
          (result.data as { model?: string } | undefined)?.model || "",
        )
          .trim()
          .split(/\s+/)[0];
        if (next) setModel(next);
        break;
      }
      default:
        break;
    }
  }

  async function onInputChange(value: string): Promise<void> {
    setInput(value);
    // @file mention autocomplete
    const at = value.match(/(?:^|\s)@([^\s@]*)$/);
    if (at && project) {
      const q = at[1].toLowerCase();
      setMentionQuery(q);
      try {
        const res = await window.grokDesktop.fs.listDir(project.path, 300);
        const entries = Array.isArray(res)
          ? res
          : (res as { entries?: typeof fileMentions }).entries || [];
        const list = (entries as Array<{ name: string; path: string; isDir: boolean }>)
          .filter((e) => !e.name.startsWith("."))
          .filter((e) => !q || e.name.toLowerCase().includes(q))
          .slice(0, 30);
        setFileMentions(list);
      } catch {
        setFileMentions([]);
      }
    } else {
      setMentionQuery(null);
      setFileMentions([]);
    }

    if (value.startsWith("/") && !value.includes(" ")) {
      const q = value.slice(1);
      const items = (await window.grokDesktop.slash.list(
        q,
        project?.path,
      )) as SlashCommandDef[];
      setSlashItems(items);
      setSlashIndex(0);
      setShowSlash(true);
      return;
    }
    setShowSlash(false);
  }

  function insertMention(entry: { name: string; path: string }): void {
    setInput((prev) =>
      prev.replace(/(?:^|\s)@[^\s@]*$/, (seg) => {
        const lead = /^\s/.test(seg) ? seg[0] : "";
        return `${lead}@${entry.path} `;
      }),
    );
    setMentionQuery(null);
    setFileMentions([]);
    textareaRef.current?.focus();
  }

  function selectSlash(item: SlashCommandDef): void {
    setInput(`/${item.name}${item.argumentHint ? " " : ""}`);
    setShowSlash(false);
    textareaRef.current?.focus();
  }

  function onSessionSearchQueryChange(q: string): void {
    setSessionSearch(q);
    if (sessionSearchTimer.current) clearTimeout(sessionSearchTimer.current);
    const trimmed = q.trim();
    if (!trimmed) {
      setSessionSearchResults(null);
      setSessionSearchLoading(false);
      return;
    }
    setSessionSearchLoading(true);
    sessionSearchTimer.current = setTimeout(() => {
      void (async () => {
        try {
          const rows = (await window.grokDesktop.sessions.search(
            trimmed,
            40,
          )) as SessionSummary[];
          setSessionSearchResults(rows);
        } catch {
          setSessionSearchResults([]);
        } finally {
          setSessionSearchLoading(false);
        }
      })();
    }, 280);
  }

  async function deleteSession(
    proj: ProjectInfo | null,
    s: SessionSummary,
  ): Promise<void> {
    try {
      await window.grokDesktop.sessions.delete(s.id, s.cwd || proj?.path);
      // Update tree cache
      const cwd = s.cwd || proj?.path;
      if (cwd) {
        setSessionsByProject((prev) => {
          const list = (prev[cwd] || []).filter((x) => x.id !== s.id);
          return { ...prev, [cwd]: list };
        });
        sessionsCacheRef.current = {
          ...sessionsCacheRef.current,
          [cwd]: (sessionsCacheRef.current[cwd] || []).filter(
            (x) => x.id !== s.id,
          ),
        };
      }
      setSessionSearchResults((prev) =>
        prev ? prev.filter((x) => x.id !== s.id) : prev,
      );
      if (session?.id === s.id) {
        setSession(null);
        headlessSessionIdRef.current = null;
        acpSessionIdRef.current = null;
        continueRef.current = false;
        setMessages([
          systemMessage(t("msg.sessionDeleted", { title: s.title || s.id.slice(0, 8) })),
        ]);
      }
      void refreshProjects();
    } catch (error) {
      setMessages((m) => [
        ...m,
        systemMessage(
          t("msg.deleteFailed", { msg: error instanceof Error ? error.message : String(error) }),
        ),
      ]);
    }
  }

  async function cancelTurn(): Promise<void> {
    if (!busyRef.current && !permission && !turnActiveRef.current) return;
    setRunLabel(t("status.stoppingEllipsis"));
    // 若卡在权限审批，先拒绝再 cancel，避免 agent 悬挂在 request_permission
    const pendingPermission = permission;
    if (pendingPermission) {
      setPermission(null);
      try {
        await window.grokDesktop.acp.permission(
          pendingPermission.requestId,
          "reject",
          pendingPermission.rpcId,
        );
      } catch {
        /* best-effort */
      }
    }
    // 立刻收束 UI（保留已有工具/半截回复），再发 cancel RPC。
    // 否则要等 prompt 返回或 1.2s 定时器，期间迟到的 update 会把分段打乱。
    if (turnActiveRef.current || busyRef.current) {
      finalizeAcpTurn({ cancelled: true });
    }
    try {
      await Promise.allSettled([
        window.grokDesktop.headless.cancel(),
        window.grokDesktop.acp.cancel(),
      ]);
    } catch {
      /* cancel is best-effort */
    }
  }

  const settingsValue: SettingsState = {
    model,
    models,
    effort,
    reasoning,
    alwaysApprove,
    permissionMode,
    bestOfN,
    webSearch,
    subagents,
    memory,
    selfCheck,
    maxTurns,
    noPlan,
    sandbox,
    themeLight,
    themeCustom,
    locale,
  };

  const paletteItems: PaletteItem[] = useMemo(
    () => {
      const commands: PaletteItem[] = [
        {
          id: "new",
          label: t("palette.newChat"),
          hint: "⌘N",
          group: "command",
          run: () => void createNewChat(),
        },
        {
          id: "open-project",
          label: t("palette.openProject"),
          group: "command",
          run: () => void openProjectPicker(),
        },
        {
          id: "settings",
          label: t("palette.settings"),
          hint: "⌘,",
          group: "command",
          run: () => setSettingsOpen(true),
        },
        {
          id: "plugins",
          label: t("plugins.title"),
          group: "command",
          run: () => {
            setGlobalPage(null);
            setPluginsPageOpen(true);
          },
        },
        {
          id: "inspector",
          label: t("palette.inspector"),
          hint: "⌘I",
          group: "command",
          run: () => {
            if (session) openSessionInspector(session, "context");
            else openGlobalPage("mcp");
          },
        },
        {
          id: "global-mcp",
          label: t("tree.navMcpTitle"),
          group: "command",
          run: () => openGlobalPage("mcp"),
        },
        {
          id: "global-skills",
          label: t("tree.navSkillsTitle"),
          group: "command",
          run: () => openGlobalPage("skills"),
        },
        {
          id: "global-hooks",
          label: t("tree.navHooksTitle"),
          group: "command",
          run: () => openGlobalPage("hooks"),
        },
        {
          id: "plan-on",
          label: t("palette.planOn"),
          group: "command",
          run: () => void togglePlanMode(true),
        },
        {
          id: "plan-off",
          label: t("palette.planOff"),
          group: "command",
          run: () => void togglePlanMode(false),
        },
        {
          id: "context",
          label: t("palette.context"),
          group: "command",
          run: () => void runSlashCommand("/context"),
        },
        {
          id: "compact",
          label: t("palette.compact"),
          group: "command",
          run: () => void runSlashCommand("/compact"),
        },
        {
          id: "fork",
          label: t("palette.fork"),
          group: "command",
          run: () => void forkSession(),
        },
        {
          id: "theme",
          label: themeLight ? t("palette.themeDark") : t("palette.themeLight"),
          group: "command",
          run: () => setThemeLight((v) => !v),
        },
      ];
      const sessions: PaletteItem[] = (sessionSearchResults || []).map((s) => ({
        id: `session-${s.id}`,
        label: s.title || s.id.slice(0, 8),
        hint: s.cwd.split("/").pop() || s.cwd,
        group: "session" as const,
        run: () => {
          const proj =
            projects.find((p) => p.path === s.cwd) ||
            ({
              path: s.cwd,
              name: s.cwd.split("/").pop() || s.cwd,
            } as ProjectInfo);
          void loadSession(s, proj);
          setGlobalPage(null);
        },
      }));
      return [...commands, ...sessions];
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [themeLight, project, model, t, locale, session, sessionSearchResults, projects],
  );

  const shortPath = (p?: string | null) => {
    if (!p) return t("app.noProject");
    return p.length > 52 ? `…${p.slice(-50)}` : p;
  };

  const connectionStatus = runStatusLabel(busy, {
    runLabel,
    streamPhase,
    permissionPending: !!permission,
    connected: status.connected,
    grokReady,
    elapsedSec: streamElapsed > 0 ? Math.floor(streamElapsed / 1000) : 0,
  }, t);

  const composerPlaceholder = !project
    ? t("app.placeholderNoProject")
    : sessionLoading
      ? t("app.placeholderLoading")
      : busy
        ? permission
          ? t("app.placeholderWaitApprove")
          : t("app.placeholderBusy")
        : t("app.placeholderReady");

  /** Global feature pages (MCP / Skills / Hooks / Plugins) — no project/session chrome. */
  const isGlobalFeaturePage = !!(globalPage || pluginsPageOpen);
  const featurePageTitle = pluginsPageOpen
    ? t("plugins.title")
    : globalPage === "mcp"
      ? t("tree.navMcpTitle")
      : globalPage === "skills"
        ? t("tree.navSkillsTitle")
        : globalPage === "hooks"
          ? t("tree.navHooksTitle")
          : null;

  /** Resolve relative chat images (e.g. images/1.jpg) against project + session dirs. */
  const mediaBaseDirs = useMemo(() => {
    const dirs: string[] = [];
    const cwd = project?.path || session?.cwd || null;
    if (cwd) dirs.push(cwd);
    const sid =
      session?.id || status.sessionId || acpSessionIdRef.current || null;
    const home = appInfo?.grokHome;
    if (home && cwd && sid) {
      dirs.push(
        `${home}/sessions/${encodeURIComponent(cwd)}/${sid}`,
      );
    }
    return dirs;
  }, [
    project?.path,
    session?.cwd,
    session?.id,
    status.sessionId,
    appInfo?.grokHome,
  ]);

  return (
    <div
      className={cn(
        "app layout-codex",
        themeLight ? "light" : "dark",
        sidebarCollapsed && "sidebar-collapsed",
      )}
      style={{ "--sidebar-w": `${sidebarWidth}px` } as CSSProperties}
    >
      <header className="titlebar titlebar-codex">
        <div className="titlebar-brand">
          <div className="brand-text">
            <h1>Grok Build</h1>
            <span>Client</span>
          </div>
        </div>

        <div className="titlebar-chat">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="sidebar-toggle titlebar-no-drag"
            aria-controls="project-sidebar"
            aria-expanded={!sidebarCollapsed}
            aria-label={
              sidebarCollapsed
                ? t("app.expandSidebar")
                : t("app.collapseSidebar")
            }
            title={
              sidebarCollapsed
                ? t("app.expandSidebar")
                : t("app.collapseSidebar")
            }
            onClick={() => setSidebarCollapsed((value) => !value)}
          >
            <HamburgerMenuIcon />
          </Button>
          {isGlobalFeaturePage ? (
            <div className="title-block">
              <h2>{featurePageTitle}</h2>
              <p>{t("inspector.scopeGlobal")}</p>
            </div>
          ) : (
            <div className="title-block">
              <h2>
                {session?.title ||
                  (project
                    ? draftNewSessionRef.current
                      ? t("app.newChat")
                      : project.name
                    : t("app.selectProject"))}
              </h2>
              <p title={project?.path || ""}>
                {shortPath(project?.path)}
                {alwaysApprove ? t("app.alwaysApproveSuffix") : ""}
                {" · "}
                {model}
              </p>
            </div>
          )}
          <div className="titlebar-actions titlebar-no-drag">
            {isGlobalFeaturePage ? (
              <>
                {pluginsPageOpen ? (
                  <>
                    <button
                      type="button"
                      className="btn btn-sm"
                      disabled={
                        !pluginsToolbar ||
                        pluginsToolbar.loading ||
                        !!pluginsToolbar.busy
                      }
                      onClick={() => pluginsToolbar?.refresh()}
                    >
                      {t("common.refresh")}
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm"
                      disabled={!pluginsToolbar || !!pluginsToolbar.busy}
                      onClick={() => pluginsToolbar?.updateAll()}
                    >
                      {pluginsToolbar?.busy === "update-all"
                        ? t("plugins.updating")
                        : t("plugins.updateAll")}
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => setPluginsPageOpen(false)}
                    >
                      {t("common.close")}
                    </button>
                  </>
                ) : globalPage ? (
                  <>
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => {
                        if (globalPage === "mcp") void refreshMcp();
                        else void refreshSkillsAndHooks();
                      }}
                    >
                      {t("common.refresh")}
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => setGlobalPage(null)}
                    >
                      {t("common.close")}
                    </button>
                  </>
                ) : null}
              </>
            ) : (
              <>
                {planMode ? (
                  <span
                    className="status-pill plan-mode-pill"
                    title={t("app.planOnTitle")}
                  >
                    <span className="plan-mode-pill-icon" aria-hidden>
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                        <path
                          d="M3.5 4h9M3.5 8h9M3.5 12h6"
                          stroke="currentColor"
                          strokeWidth="1.4"
                          strokeLinecap="round"
                        />
                        <circle cx="12.5" cy="12" r="1.6" fill="currentColor" />
                      </svg>
                    </span>
                    {t("common.plan")}
                  </span>
                ) : null}
                <span
                  className={`status-pill ${connectionStatus.tone === "warn" ? "warn" : connectionStatus.tone}`}
                  title={
                    permission
                      ? t("app.waitApproveTitle", { title: permission.title })
                      : status.connected
                        ? t("app.acpConnectedTitle", {
                            session: status.sessionId || "no session",
                            bin: appInfo?.grokBin || "",
                          })
                        : grokReady
                          ? t("app.grokCliReadyTitle", {
                              bin: appInfo?.grokBin || "",
                            })
                          : appInfo?.grokBin || t("app.noGrokCli")
                  }
                >
                  <span className="dot" />
                  {connectionStatus.text}
                </span>
                {queue.length > 0 ? (
                  <span
                    className="status-pill pending"
                    title={t("app.queueTitle")}
                  >
                    {t("app.queue", { n: queue.length })}
                  </span>
                ) : null}
                {busy || permission ? (
                  <button
                    type="button"
                    className="btn btn-sm btn-stop"
                    onClick={() => void cancelTurn()}
                    title={t("app.stopTitle")}
                  >
                    {t("common.stop")}
                  </button>
                ) : null}
                {session ? (
                  <>
                    <button
                      type="button"
                      className="btn btn-sm titlebar-session-rename"
                      title={t("app.renameSessionTitle")}
                      aria-label={t("app.renameSession")}
                      onClick={() => openRenameSession()}
                    >
                      <Pencil2Icon className="titlebar-session-rename-icon" />
                      <span>{t("app.renameSession")}</span>
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm titlebar-session-detail"
                      title={t("tree.openSessionInspectorTitle")}
                      onClick={() => openSessionInspector(session, "context")}
                    >
                      {t("tree.openSessionInspector")}
                    </button>
                  </>
                ) : null}
              </>
            )}
          </div>
        </div>
      </header>

      <div className="body body-codex">
        <div
          id="project-sidebar"
          className="sidebar-shell"
          aria-hidden={sidebarCollapsed || undefined}
          inert={sidebarCollapsed || undefined}
        >
          <ProjectTree
            projects={projects}
            sessionsByProject={sessionsByProject}
            expanded={expandedProjects}
            activeProjectPath={project?.path || null}
            activeSessionId={session?.id || null}
            loadingPath={loadingSessionsPath}
            loadingSessionId={sessionLoading ? session?.id || null : null}
            onToggleProject={(p) => void toggleProject(p)}
            onSelectSession={(p, s) => {
              setGlobalPage(null);
              void loadSession(s, p);
            }}
            onDeleteSession={(p, s) => void deleteSession(p, s)}
            onRenameSession={(p, s) => openRenameSession({ project: p, session: s })}
            onOpenFolder={() => void openProjectPicker()}
            onRefresh={() => {
              void refreshProjects();
              if (project)
                void loadSessionsForProject(project.path, { force: true });
            }}
            onNewChat={() => {
              setGlobalPage(null);
              void createNewChat();
            }}
            onNewChatInProject={(p) => {
              setGlobalPage(null);
              void createNewChat(p);
            }}
            onPinProject={(p, pinned) => void pinProject(p, pinned)}
            onRemoveProject={(p) => void removeProjectFromList(p)}
            onRevealInFinder={(p) => void revealProjectInFinder(p)}
            onOpenGlobalPage={(tab) => openGlobalPage(tab)}
            onOpenPlugins={() => {
              setGlobalPage(null);
              setPluginsPageOpen(true);
            }}
            onOpenSearch={() => setPaletteOpen(true)}
            onOpenSessionInspector={(proj, s, tab) =>
              openSessionInspector(s, tab || "context", proj)
            }
            onOpenSettings={() => setSettingsOpen(true)}
            themeLight={themeLight}
            onToggleTheme={() => setThemeLight((v) => !v)}
          />
        </div>

        {!sidebarCollapsed ? (
          <div
            className="sidebar-resize-handle"
            role="separator"
            tabIndex={0}
            aria-label={t("app.resizeSidebar")}
            aria-orientation="vertical"
            aria-valuemin={SIDEBAR_MIN_WIDTH}
            aria-valuemax={SIDEBAR_MAX_WIDTH}
            aria-valuenow={sidebarWidth}
            onPointerDown={startSidebarResize}
            onKeyDown={resizeSidebarWithKeyboard}
          />
        ) : null}

        <main className="chat">
          {pluginsPageOpen ? (
            <PluginsPage onToolbar={setPluginsToolbar} />
          ) : globalPage ? (
            <GlobalConfigPage
              kind={globalPage}
              mcpServers={mcpServers}
              skills={skillsList}
              hooks={hooksList}
            />
          ) : sessionLoading ? (
            <ChatSessionSkeleton />
          ) : (
          <AiMessageList
            messages={messages}
            modelLabel={model}
            onForkMessage={(id) => void forkFromMessage(id)}
            forkDisabled={busy || sessionLoading || !project}
            onEditUserMessage={(id) => editUserMessage(id)}
            onRetryUserMessage={(id) => void retryFromUserMessage(id)}
            onRetryLastTurn={() => void retryLastTurn()}
            actionsDisabled={busy || sessionLoading || !project}
            onStop={() => void cancelTurn()}
            mediaBaseDirs={mediaBaseDirs}
            streamStatus={
              busy
                ? { phase: streamPhase, elapsedMs: streamElapsed }
                : null
            }
          />
          )}

          {!globalPage && !pluginsPageOpen ? (
          <div className="composer-wrap">
            <div className="chat-col">
            {showSlash ? (
              <SlashMenu
                items={slashItems}
                activeIndex={slashIndex}
                onHover={setSlashIndex}
                onSelect={selectSlash}
              />
            ) : null}

            {queue.length > 0 ? (
              <div className="composer-queue-banner" role="status">
                <span>{t("app.queueBanner", { n: queue.length })}</span>
                <button
                  type="button"
                  className="btn btn-sm"
                  title={t("app.clearQueue")}
                  onClick={() => setQueue([])}
                >
                  {t("app.clearQueue")}
                </button>
              </div>
            ) : null}

            <div className={`composer${busy ? " is-busy" : ""}${!project ? " is-disabled" : ""}`}>
              {attachments.length > 0 ? (
                <div className="attach-strip">
                  {attachments.map((a) => (
                    <div key={a.id} className="attach-chip">
                      {a.isImage && a.previewUrl ? (
                        <img
                          className="attach-thumb"
                          src={a.previewUrl}
                          alt={a.name}
                        />
                      ) : (
                        <span className="attach-icon">📎</span>
                      )}
                      <span className="attach-name" title={a.path}>
                        {a.name}
                      </span>
                      <button
                        type="button"
                        className="attach-remove"
                        title={t("app.removeAttachment")}
                        onClick={() => removeAttachment(a.id)}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
              {mentionQuery != null && fileMentions.length > 0 ? (
                <div className="mention-menu">
                  {fileMentions.map((e) => (
                    <button
                      key={e.path}
                      type="button"
                      className="mention-item"
                      onMouseDown={(ev) => {
                        ev.preventDefault();
                        insertMention(e);
                      }}
                    >
                      <span className="mono">{e.isDir ? "📁" : "📄"}</span>
                      <span>{e.name}</span>
                    </button>
                  ))}
                </div>
              ) : null}
              <textarea
                ref={textareaRef}
                value={input}
                placeholder={composerPlaceholder}
                disabled={!project || sessionLoading}
                aria-label={t("app.messageInput")}
                onChange={(e) => void onInputChange(e.target.value)}
                onPaste={(e) => void handleComposerPaste(e)}
                onKeyDown={(e) => {
                  if (showSlash && slashItems.length) {
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      setSlashIndex((i) =>
                        Math.min(i + 1, slashItems.length - 1),
                      );
                      return;
                    }
                    if (e.key === "ArrowUp") {
                      e.preventDefault();
                      setSlashIndex((i) => Math.max(i - 1, 0));
                      return;
                    }
                    // Only Tab / Enter-without-args completes slash pick
                    if (e.key === "Tab") {
                      e.preventDefault();
                      selectSlash(slashItems[slashIndex]);
                      return;
                    }
                    if (
                      e.key === "Enter" &&
                      !e.shiftKey &&
                      !input.includes(" ")
                    ) {
                      e.preventDefault();
                      const selected = slashItems[slashIndex];
                      const typed = input.slice(1).toLowerCase();
                      const exact =
                        selected.name === typed ||
                        selected.aliases?.some(
                          (alias) => alias.toLowerCase() === typed,
                        );
                      if (exact && !selected.argsRequired) {
                        void handleSubmit();
                      } else {
                        selectSlash(selected);
                      }
                      return;
                    }
                    if (e.key === "Escape") {
                      setShowSlash(false);
                      return;
                    }
                  }
                  // Enter 发送；Shift+Enter 换行（multiline 开启时改为 Cmd/Ctrl+Enter 发送）
                  if (e.key === "Enter" && !e.shiftKey) {
                    if (multiline) {
                      if (e.metaKey || e.ctrlKey) {
                        e.preventDefault();
                        void handleSubmit();
                      }
                      return;
                    }
                    e.preventDefault();
                    void handleSubmit();
                  }
                }}
              />
              <div className="composer-bar">
                <div className="composer-hints">
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/*,.pdf,.md,.txt,.json,.csv"
                    style={{ display: "none" }}
                    onChange={(e) => void handleFileInputChange(e)}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="ui-composer-tool ui-composer-tool--icon"
                    disabled={!project || sessionLoading}
                    title={t("app.addFiles")}
                    aria-label={t("app.addFiles")}
                    onClick={() => {
                      void addFilesFromPicker().catch(() =>
                        fileInputRef.current?.click(),
                      );
                    }}
                  >
                    <UploadIcon className="size-3.5" />
                  </Button>
                  <button
                    type="button"
                    className={`chip plan-chip ${planMode ? "on" : ""}`}
                    onClick={() => void togglePlanMode(!planMode)}
                    title={
                      planMode
                        ? t("app.planOnTitle")
                        : t("app.planOffTitle")
                    }
                    aria-pressed={planMode}
                    disabled={!project || sessionLoading}
                  >
                    <span className="plan-chip-icon" aria-hidden>
                      <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                        <path
                          d="M3.5 4h9M3.5 8h9M3.5 12h5.5"
                          stroke="currentColor"
                          strokeWidth="1.35"
                          strokeLinecap="round"
                        />
                        <path
                          d="M11 10.5v3M9.5 12h3"
                          stroke="currentColor"
                          strokeWidth="1.35"
                          strokeLinecap="round"
                        />
                      </svg>
                    </span>
                    <span className="plan-chip-label">{t("common.plan")}</span>
                    {planMode ? (
                      <span className="plan-chip-state">{t("app.planActive")}</span>
                    ) : null}
                  </button>
                  <Select
                    value={model}
                    onValueChange={setModel}
                    disabled={!models.length}
                  >
                    <SelectTrigger
                      className="w-auto max-w-[9.5rem]"
                      title={t("common.model")}
                      aria-label={t("common.model")}
                    >
                      <SelectValue placeholder={t("common.model")} />
                    </SelectTrigger>
                    <SelectContent>
                      {models.map((m) => (
                        <SelectItem key={m} value={m}>
                          {m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div
                    className="composer-control"
                    title={t("app.effortTitle")}
                  >
                    <span className="composer-control-label">
                      {t("settings.effort")}
                    </span>
                    <Select
                      value={effort}
                      onValueChange={(v) => setEffort(v as EffortLevel)}
                    >
                      <SelectTrigger
                        className="composer-effort-radix w-[5.5rem] max-w-[5.5rem] border-0 bg-transparent shadow-none"
                        aria-label={t("app.effortTitle")}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">
                          {t("settings.effortLow")}
                        </SelectItem>
                        <SelectItem value="medium">
                          {t("settings.effortMedium")}
                        </SelectItem>
                        <SelectItem value="high">
                          {t("settings.effortHigh")}
                        </SelectItem>
                        <SelectItem value="xhigh">
                          {t("settings.effortXhigh")}
                        </SelectItem>
                        <SelectItem value="max">
                          {t("settings.effortMax")}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <label
                    className={`inline-check composer-approve${alwaysApprove ? " danger-on" : ""}`}
                    title={t("app.alwaysApproveRisk")}
                  >
                    <input
                      type="checkbox"
                      checked={alwaysApprove}
                      onChange={(e) => setAlwaysApprove(e.target.checked)}
                    />
                    <span>{t("app.alwaysApproveShort")}</span>
                  </label>
                </div>
                <div className="composer-actions">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="ui-composer-tool px-2 text-[11.5px] font-medium"
                    onClick={() => setPaletteOpen(true)}
                    title={t("app.commandPalette")}
                  >
                    ⌘K
                  </Button>
                  <PromptInputSubmit
                    status={toChatStatus(busy, streamPhase)}
                    disabled={
                      !project ||
                      (!input.trim() && attachments.length === 0 && !busy)
                    }
                    onStop={() => void cancelTurn()}
                    onClick={(e) => {
                      if (busy) return;
                      e.preventDefault();
                      void handleSubmit();
                    }}
                    title={busy ? t("app.stopEsc") : t("app.sendEnter")}
                  />
                </div>
              </div>
            </div>
            </div>
          </div>
          ) : null}
        </main>
      </div>

      {permission ? (
        <PermissionModal
          request={permission}
          onRespond={(optionId) => {
            const req = permission;
            setPermission(null);
            if (busyRef.current) {
              setRunLabel(
                optionId === "reject" ? t("status.rejectedContinue") : t("status.agentRunning"),
              );
            }
            void window.grokDesktop.acp.permission(
              req.requestId,
              optionId,
              req.rpcId,
            );
          }}
        />
      ) : null}

      {panel ? (
        <PanelModal
          panel={panel}
          body={panelBody}
          onClose={() => setPanel(null)}
        />
      ) : null}

      <SettingsModal
        open={settingsOpen}
        value={settingsValue}
        onChange={(next) => {
          setModel(next.model);
          setEffort(next.effort);
          setReasoning(next.reasoning);
          setAlwaysApprove(next.alwaysApprove);
          setPermissionMode(next.permissionMode);
          setBestOfN(next.bestOfN);
          setWebSearch(next.webSearch);
          setSubagents(next.subagents);
          setMemory(next.memory);
          setSelfCheck(next.selfCheck);
          setMaxTurns(next.maxTurns);
          setNoPlan(next.noPlan);
          setSandbox(next.sandbox);
          setThemeLight(next.themeLight);
          setThemeCustom(next.themeCustom);
          if (next.locale !== locale) setLocale(next.locale);
        }}
        onClose={() => setSettingsOpen(false)}
      />

      <Dialog
        open={renameOpen}
        onOpenChange={(open) => {
          if (renameBusy) return;
          setRenameOpen(open);
          if (!open) {
            setRenameError(null);
            setRenameTarget(null);
          }
        }}
      >
        <DialogContent
          className="w-[min(420px,calc(100vw-32px))] overflow-hidden p-0 sm:max-w-md"
          showClose={!renameBusy}
        >
          <DialogHeader>
            <DialogTitle>{t("app.renameSession")}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <label className="session-rename-label" htmlFor="session-rename-input">
              {t("app.renameSessionLabel")}
            </label>
            <input
              id="session-rename-input"
              className="session-rename-input"
              value={renameDraft}
              autoFocus
              disabled={renameBusy}
              placeholder={t("app.renameSessionPlaceholder")}
              onChange={(e) => {
                setRenameDraft(e.target.value);
                if (renameError) setRenameError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void submitRenameSession();
                }
              }}
            />
            {renameError ? (
              <p className="session-rename-error" role="alert">
                {renameError}
              </p>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <button
              type="button"
              className="btn btn-sm"
              disabled={renameBusy}
              onClick={() => setRenameOpen(false)}
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              className="btn btn-sm btn-primary"
              disabled={renameBusy || !renameDraft.trim()}
              onClick={() => void submitRenameSession()}
            >
              {renameBusy ? t("app.renaming") : t("common.confirm")}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CommandPalette
        open={paletteOpen}
        items={paletteItems}
        onClose={() => {
          setPaletteOpen(false);
          onSessionSearchQueryChange("");
        }}
        onQueryChange={(q) => onSessionSearchQueryChange(q)}
      />

      <InspectorDrawer
        open={inspectorOpen}
        scope="session"
        tab={isSessionInspectorTab(inspectorTab) ? inspectorTab : "context"}
        onTab={(tab) => {
          if (isGlobalInspectorTab(tab)) {
            setInspectorOpen(false);
            openGlobalPage(tab as GlobalConfigKind);
            return;
          }
          setInspectorScope("session");
          setInspectorTab(tab);
        }}
        onClose={() => setInspectorOpen(false)}
        sessionTitle={session?.title || session?.id || null}
        context={contextStats}
        contextLoading={contextLoading}
        onRefreshContext={() => void refreshContext()}
        onCompact={() => void runSlashCommand("/compact")}
        onSessionInfo={() => void runSlashCommand("/session-info")}
        planMode={planMode}
        onTogglePlan={(on) => void togglePlanMode(on)}
        planText={planText}
        rewindPoints={rewindPoints}
        rewindLoading={rewindLoading}
        onRefreshRewind={() => void refreshRewind()}
        onApplyRewind={(idx) => void applyRewind(idx)}
        mcpServers={mcpServers}
        onRefreshMcp={() => void refreshMcp()}
        skills={skillsList}
        hooks={hooksList}
        worktreeText={worktreeText}
        onRefreshWorktree={() => void refreshWorktree()}
        subagents={subagentViews}
        onFork={() => void forkSession()}
      />
    </div>
  );
}
