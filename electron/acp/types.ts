export type JsonRpcId = string | number;

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: JsonRpcId;
  method: string;
  params?: unknown;
}

export interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
}

export interface JsonRpcSuccess {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result: unknown;
}

export interface JsonRpcError {
  jsonrpc: "2.0";
  id: JsonRpcId | null;
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export type JsonRpcMessage =
  | JsonRpcRequest
  | JsonRpcNotification
  | JsonRpcSuccess
  | JsonRpcError;

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

export interface ProjectInfo {
  path: string;
  name: string;
  lastOpenedAt?: string;
  sessionCount?: number;
  pinned?: boolean;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system" | "tool" | "thought";
  content: string;
  createdAt: string;
  toolName?: string;
  status?: string;
  streaming?: boolean;
}

export interface PermissionRequest {
  requestId: string;
  sessionId: string;
  toolCallId?: string;
  title: string;
  description?: string;
  raw: unknown;
  /** Present when agent sent permission as JSON-RPC request (must reply with id). */
  rpcId?: string | number;
}

export interface SessionUpdateEvent {
  sessionId?: string;
  update: Record<string, unknown>;
}

export interface AcpStatus {
  connected: boolean;
  sessionId: string | null;
  cwd: string | null;
  model?: string | null;
  error?: string | null;
  bin?: string | null;
}

/** ACP session/prompt content block (text / image / resource_link). */
export type AcpContentBlock =
  | { type: "text"; text: string }
  | {
      type: "image";
      data: string;
      mimeType: string;
      uri?: string;
    }
  | {
      type: "resource_link";
      uri: string;
      name?: string;
      mimeType?: string;
      description?: string;
    }
  | {
      type: "resource";
      resource: {
        uri: string;
        text?: string;
        mimeType?: string;
        blob?: string;
      };
    };

export interface SavedAttachment {
  id: string;
  name: string;
  path: string;
  mimeType: string;
  size: number;
  isImage: boolean;
}
