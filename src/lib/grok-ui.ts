/**
 * Bridge Grok Desktop ChatMessage model ↔ AI SDK UIMessage / ChatStatus.
 * Source of truth remains ACP / headless streams; AI SDK shapes drive AI Elements.
 */
import type { ChatStatus, UIMessage } from "ai";
import { rt, type TranslateFn } from "../i18n";
import type { ChatMessage, MessageAttachment, ToolMeta } from "./types";

export type GrokUIMetadata = {
  /** Original desktop role when not user/assistant/system */
  grokRole?: ChatMessage["role"];
  toolName?: string;
  status?: string;
  streaming?: boolean;
  toolKind?: string;
  attachments?: MessageAttachment[];
  meta?: ToolMeta;
};

export type GrokUIMessage = UIMessage<GrokUIMetadata>;

export function toChatStatus(
  busy: boolean,
  streamPhase?: string,
  error?: boolean,
): ChatStatus {
  if (error) return "error";
  if (!busy) return "ready";
  if (streamPhase === "waiting" || streamPhase === "thinking") {
    return "submitted";
  }
  return "streaming";
}

export function phaseLabel(
  phase?: string | null,
  t?: TranslateFn,
): string | null {
  const tr = t || ((k: string) => k);
  switch (phase) {
    case "waiting":
      return tr("status.connectingGrok");
    case "thinking":
      return tr("status.grokThinking");
    case "writing":
      return tr("status.grokWriting");
    case "permission":
      return tr("status.waitToolApprove");
    case "stopping":
      return tr("status.stoppingEllipsis");
    default:
      return null;
  }
}

/** Compact titlebar / status-pill label for agent turn phases. */
export function runStatusLabel(
  busy: boolean,
  opts?: {
    runLabel?: string | null;
    streamPhase?: string | null;
    permissionPending?: boolean;
    connected?: boolean;
    grokReady?: boolean;
    elapsedSec?: number;
  },
  t?: TranslateFn,
): { text: string; tone: "ok" | "pending" | "bad" | "warn" } {
  const tr = t || ((k: string) => k);
  if (opts?.permissionPending) {
    return { text: tr("status.waitingApprove"), tone: "warn" };
  }
  if (busy) {
    const base =
      opts?.runLabel ||
      (opts?.streamPhase === "thinking"
        ? tr("status.thinking")
        : opts?.streamPhase === "writing"
          ? tr("status.writing")
          : opts?.streamPhase === "waiting"
            ? tr("status.connecting")
            : opts?.streamPhase === "stopping"
              ? tr("status.stopping")
              : tr("status.running"));
    const sec =
      opts?.elapsedSec && opts.elapsedSec > 0 ? ` ${opts.elapsedSec}s` : "";
    return { text: `${base}${sec}`, tone: "pending" };
  }
  if (opts?.connected) {
    return { text: tr("status.agentConnected"), tone: "ok" };
  }
  if (opts?.grokReady) {
    return { text: tr("status.grokReadyNoAgent"), tone: "pending" };
  }
  return { text: tr("status.grokNotReady"), tone: "bad" };
}

function toolState(
  m: ChatMessage,
): "input-streaming" | "input-available" | "output-available" | "output-error" {
  if (m.streaming) return "input-streaming";
  if (m.status === "failed" || m.status === "error") return "output-error";
  if (m.status === "in_progress" || m.status === "running") {
    return "input-available";
  }
  return "output-available";
}

/**
 * Map one desktop ChatMessage to an AI SDK UIMessage (one part or multi-part).
 */
export function chatMessageToUIMessage(m: ChatMessage): GrokUIMessage {
  if (m.role === "user") {
    return {
      id: m.id,
      role: "user",
      metadata: {
        grokRole: "user",
        attachments: m.attachments,
        streaming: m.streaming,
      },
      parts: [{ type: "text", text: m.content }],
    };
  }

  if (m.role === "thought") {
    return {
      id: m.id,
      role: "assistant",
      metadata: {
        grokRole: "thought",
        streaming: m.streaming,
        status: m.status,
      },
      parts: [
        {
          type: "reasoning",
          text: m.content,
          state: m.streaming ? "streaming" : "done",
        } as GrokUIMessage["parts"][number],
      ],
    };
  }

  if (m.role === "tool") {
    const toolName = m.toolName || String(m.meta?.toolKind || "tool");
    const state = toolState(m);
    const base = {
      type: "dynamic-tool" as const,
      toolName,
      toolCallId: m.id,
      input: m.meta?.rawInput ?? m.content ?? undefined,
    };
    let toolPart: GrokUIMessage["parts"][number];
    if (state === "input-streaming") {
      toolPart = { ...base, state: "input-streaming" };
    } else if (state === "input-available") {
      toolPart = { ...base, state: "input-available", input: base.input ?? {} };
    } else if (state === "output-error") {
      toolPart = {
        ...base,
        state: "output-error",
        input: base.input,
        errorText: m.content || rt("chat.toolFailed"),
      };
    } else {
      toolPart = {
        ...base,
        state: "output-available",
        input: base.input ?? {},
        output: m.content ?? "",
      };
    }
    return {
      id: m.id,
      role: "assistant",
      metadata: {
        grokRole: "tool",
        toolName,
        toolKind: String(m.meta?.toolKind || ""),
        status: m.status,
        streaming: m.streaming,
        meta: m.meta,
      },
      parts: [toolPart],
    };
  }

  if (m.role === "plan") {
    return {
      id: m.id,
      role: "assistant",
      metadata: {
        grokRole: "plan",
        streaming: m.streaming,
        status: m.status,
      },
      parts: [{ type: "text", text: m.content }],
    };
  }

  if (m.role === "system" || m.role === "subagent") {
    return {
      id: m.id,
      role: "system",
      metadata: {
        grokRole: m.role,
        toolName: m.toolName,
        status: m.status,
      },
      parts: [{ type: "text", text: m.content }],
    };
  }

  // assistant
  return {
    id: m.id,
    role: "assistant",
    metadata: {
      grokRole: "assistant",
      streaming: m.streaming,
      status: m.status,
    },
    parts: [{ type: "text", text: m.content }],
  };
}

export function chatMessagesToUIMessages(
  messages: ChatMessage[],
): GrokUIMessage[] {
  return messages.map(chatMessageToUIMessage);
}

/** Extract plain text from a UIMessage (for copy). */
export function uiMessagePlainText(message: GrokUIMessage): string {
  return message.parts
    .map((p) => {
      if (p.type === "text") return p.text;
      if (p.type === "reasoning") return (p as { text?: string }).text || "";
      return "";
    })
    .filter(Boolean)
    .join("\n");
}
