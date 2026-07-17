/**
 * AI SDK ChatTransport for Grok Build Desktop.
 *
 * Desktop does not talk to a Vercel HTTP `/api/chat` endpoint. Instead, the
 * main process drives ACP / headless streams. This transport implements the
 * ChatTransport contract so `useChat({ transport })` can be wired when desired:
 * it emits a UIMessageChunk ReadableStream bridged from an external callback.
 *
 * Primary path today remains App.tsx message state + useGrokChat → AI Elements.
 * This file is the official AI SDK extension point for a future full useChat cutover.
 */
import type { ChatTransport, UIMessage, UIMessageChunk } from "ai";

export type GrokStreamHandlers = {
  /**
   * Called when useChat wants to send. Implement by calling your existing
   * headless/ACP prompt path. Push chunks via `emit` (or resolve when done).
   */
  onSend: (ctx: {
    messages: UIMessage[];
    abortSignal: AbortSignal | undefined;
    emit: (chunk: UIMessageChunk) => void;
    close: () => void;
    error: (err: unknown) => void;
  }) => void | Promise<void>;
};

/**
 * Minimal ChatTransport that turns Grok ACP-style async events into
 * AI SDK UIMessageChunk streams (text-start / text-delta / text-end / reasoning-*).
 */
export class GrokChatTransport<UI_MESSAGE extends UIMessage = UIMessage>
  implements ChatTransport<UI_MESSAGE>
{
  constructor(private readonly handlers: GrokStreamHandlers) {}

  async sendMessages({
    messages,
    abortSignal,
  }: Parameters<ChatTransport<UI_MESSAGE>["sendMessages"]>[0]): Promise<
    ReadableStream<UIMessageChunk>
  > {
    let controller: ReadableStreamDefaultController<UIMessageChunk> | null =
      null;

    const stream = new ReadableStream<UIMessageChunk>({
      start: (c) => {
        controller = c;
      },
      cancel: () => {
        controller = null;
      },
    });

    const emit = (chunk: UIMessageChunk) => {
      try {
        controller?.enqueue(chunk);
      } catch {
        /* stream closed */
      }
    };
    const close = () => {
      try {
        controller?.close();
      } catch {
        /* already closed */
      }
      controller = null;
    };
    const error = (err: unknown) => {
      try {
        controller?.error(err);
      } catch {
        /* already closed */
      }
      controller = null;
    };

    if (abortSignal) {
      abortSignal.addEventListener(
        "abort",
        () => {
          emit({ type: "error", errorText: "aborted" });
          close();
        },
        { once: true },
      );
    }

    // Fire-and-forget; stream consumers read as events arrive
    void Promise.resolve(
      this.handlers.onSend({
        messages: messages as UIMessage[],
        abortSignal,
        emit,
        close,
        error,
      }),
    ).catch(error);

    return stream;
  }

  async reconnectToStream(): Promise<ReadableStream<UIMessageChunk> | null> {
    // Desktop sessions are process-local; no HTTP reconnect.
    return null;
  }
}

/** Helpers to emit standard AI SDK stream chunks for text / reasoning. */
export const grokUiChunks = {
  textStart(id: string): UIMessageChunk {
    return { type: "text-start", id };
  },
  textDelta(id: string, delta: string): UIMessageChunk {
    return { type: "text-delta", id, delta };
  },
  textEnd(id: string): UIMessageChunk {
    return { type: "text-end", id };
  },
  reasoningStart(id: string): UIMessageChunk {
    return { type: "reasoning-start", id };
  },
  reasoningDelta(id: string, delta: string): UIMessageChunk {
    return { type: "reasoning-delta", id, delta };
  },
  reasoningEnd(id: string): UIMessageChunk {
    return { type: "reasoning-end", id };
  },
  error(errorText: string): UIMessageChunk {
    return { type: "error", errorText };
  },
};
