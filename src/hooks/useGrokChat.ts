/**
 * AI SDK–shaped chat view model for Grok Build Desktop.
 *
 * Desktop keeps ChatMessage[] as source of truth (ACP / headless / session restore).
 * This hook exposes the same surface AI Elements demos expect from useChat:
 * messages (UIMessage[]), status (ChatStatus), isStreaming, stop.
 */
import { useMemo } from "react";
import type { ChatStatus } from "ai";
import type { ChatMessage } from "@/lib/types";
import {
  chatMessagesToUIMessages,
  phaseLabel,
  toChatStatus,
  type GrokUIMessage,
} from "@/lib/grok-ui";

export type UseGrokChatOptions = {
  messages: ChatMessage[];
  busy: boolean;
  streamPhase?: string;
  streamElapsedMs?: number;
  error?: boolean;
  onStop?: () => void;
};

export type UseGrokChatResult = {
  messages: GrokUIMessage[];
  /** Original desktop messages (for tool meta / attachments not fully in UIMessage). */
  desktopMessages: ChatMessage[];
  status: ChatStatus;
  isStreaming: boolean;
  phase: string | undefined;
  phaseLabel: string | null;
  elapsedSec: number;
  stop?: () => void;
};

export function useGrokChat(options: UseGrokChatOptions): UseGrokChatResult {
  const {
    messages,
    busy,
    streamPhase,
    streamElapsedMs = 0,
    error,
    onStop,
  } = options;

  const uiMessages = useMemo(
    () => chatMessagesToUIMessages(messages),
    [messages],
  );

  const status = useMemo(
    () => toChatStatus(busy, streamPhase, error),
    [busy, streamPhase, error],
  );

  const elapsedSec =
    streamElapsedMs > 0 ? Math.floor(streamElapsedMs / 1000) : 0;

  return {
    messages: uiMessages,
    desktopMessages: messages,
    status,
    isStreaming: busy,
    phase: streamPhase,
    phaseLabel: phaseLabel(streamPhase),
    elapsedSec,
    stop: onStop,
  };
}

/** Re-export status type for components. */
export type { ChatStatus, GrokUIMessage };
