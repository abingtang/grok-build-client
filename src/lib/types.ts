export interface ProjectInfo {
  path: string;
  name: string;
  lastOpenedAt?: string;
  sessionCount?: number;
  pinned?: boolean;
}

export interface SessionSummary {
  id: string;
  cwd: string;
  title: string;
  summary: string;
  createdAt: string;
  updatedAt: string;
  modelId?: string;
  numMessages?: number;
  agentName?: string;
  parentSessionId?: string;
  sessionKind?: string;
}

export type ChatRole =
  | "user"
  | "assistant"
  | "system"
  | "tool"
  | "thought"
  | "plan"
  | "subagent";

export type ToolKind =
  | "read"
  | "edit"
  | "write"
  | "execute"
  | "search"
  | "think"
  | "other"
  | string;

export interface ToolMeta {
  toolKind?: ToolKind;
  filePath?: string;
  diffPath?: string;
  oldText?: string;
  newText?: string;
  added?: number;
  removed?: number;
  rawInput?: unknown;
  [key: string]: unknown;
}

/** Composer / message file attachment (image or generic file). */
export interface MessageAttachment {
  id: string;
  name: string;
  path: string;
  mimeType: string;
  size?: number;
  isImage?: boolean;
  /** Local preview for UI only (data URL or blob URL) */
  previewUrl?: string;
}

/** One TUI-visible turn / block (from updates.jsonl replay or live stream). */
export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
  /** Tool / plan / subagent title (matches TUI label) */
  toolName?: string;
  status?: string;
  streaming?: boolean;
  collapsed?: boolean;
  meta?: ToolMeta;
  /** User-message attachments shown as chips / thumbnails */
  attachments?: MessageAttachment[];
}

export interface SlashCommandDef {
  name: string;
  aliases?: string[];
  description: string;
  argumentHint?: string;
  category: string;
  kind: string;
  argsRequired?: boolean;
  note?: string;
}

export interface PermissionRequest {
  requestId: string;
  sessionId: string;
  toolCallId?: string;
  title: string;
  description?: string;
  raw: unknown;
  rpcId?: string | number;
}

export interface AcpStatus {
  connected: boolean;
  sessionId: string | null;
  cwd: string | null;
  model?: string | null;
  error?: string | null;
  bin?: string | null;
}

export type PanelId =
  | "sessions"
  | "settings"
  | "history"
  | "docs"
  | "hooks"
  | "plugins"
  | "marketplace"
  | "skills"
  | "mcps"
  | "agents"
  | "personas"
  | "rewind"
  | null;
