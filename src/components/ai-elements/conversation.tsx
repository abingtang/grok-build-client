import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";
import { ArrowDownIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { StickToBottom, useStickToBottomContext } from "use-stick-to-bottom";

export type ConversationProps = ComponentProps<typeof StickToBottom>;

export function Conversation({ className, ...props }: ConversationProps) {
  return (
    <StickToBottom
      // Outer shell: only layout + clip. Scroll lives on StickToBottom.Content's
      // scrollRef — putting overflow-y-auto here creates a second scrollbar.
      className={cn("relative flex min-h-0 flex-1 flex-col overflow-hidden", className)}
      initial="instant"
      resize="instant"
      role="log"
      {...props}
    />
  );
}

export type ConversationContentProps = ComponentProps<
  typeof StickToBottom.Content
>;

export function ConversationContent({
  className,
  scrollClassName,
  ...props
}: ConversationContentProps) {
  return (
    <StickToBottom.Content
      // Actual scroll container (library attaches scrollRef here)
      scrollClassName={cn(
        "min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain",
        scrollClassName,
      )}
      className={cn("flex flex-col gap-4 p-4", className)}
      {...props}
    />
  );
}

export type ConversationEmptyStateProps = ComponentProps<"div"> & {
  title?: string;
  description?: string;
};

export function ConversationEmptyState({
  className,
  title = "开始对话",
  description = "选择左侧会话，或新建对话后发送消息。",
  children,
  ...props
}: ConversationEmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center",
        className,
      )}
      {...props}
    >
      {children ?? (
        <>
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
        </>
      )}
    </div>
  );
}

export type ConversationScrollButtonProps = ComponentProps<"button">;

export function ConversationScrollButton({
  className,
  ...props
}: ConversationScrollButtonProps) {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();
  if (isAtBottom) return null;
  return (
    <button
      type="button"
      className={cn(
        "absolute bottom-4 right-4 z-20 flex size-9 items-center justify-center rounded-full",
        "border border-border bg-card text-foreground shadow-lg",
        "hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        className,
      )}
      onClick={() => scrollToBottom()}
      aria-label="回到底部"
      title="回到底部"
      {...props}
    >
      <ArrowDownIcon className="size-4" aria-hidden />
    </button>
  );
}

/** Imperative stick-to-bottom when external stream ticks. */
export function ConversationAutoScroll({ tick }: { tick: unknown }) {
  const { scrollToBottom, isAtBottom } = useStickToBottomContext();
  const prev = useRef(tick);
  useEffect(() => {
    if (prev.current === tick) return;
    prev.current = tick;
    if (isAtBottom) scrollToBottom();
  }, [tick, isAtBottom, scrollToBottom]);
  return null;
}
