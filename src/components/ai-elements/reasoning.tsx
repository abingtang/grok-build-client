import { cn } from "@/lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDownIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { useEffect, useState } from "react";
import { Shimmer } from "./shimmer";

export type ReasoningProps = ComponentProps<typeof Collapsible> & {
  isStreaming?: boolean;
  defaultOpen?: boolean;
};

export function Reasoning({
  className,
  isStreaming,
  defaultOpen,
  open: openProp,
  onOpenChange,
  children,
  ...props
}: ReasoningProps) {
  const [internalOpen, setInternalOpen] = useState(
    defaultOpen ?? !!isStreaming,
  );
  const open = openProp ?? internalOpen;

  useEffect(() => {
    if (isStreaming) {
      setInternalOpen(true);
    }
  }, [isStreaming]);

  return (
    <Collapsible
      open={open}
      onOpenChange={(v) => {
        setInternalOpen(v);
        onOpenChange?.(v);
      }}
      data-live={isStreaming ? "true" : "false"}
      className={cn(
        /* 与执行过程面板同一套浅底 / hover（globals.css .chat-process*） */
        "chat-process chat-process--thought not-prose mb-0 w-full",
        className,
      )}
      {...props}
    >
      {children}
    </Collapsible>
  );
}

export type ReasoningTriggerProps = ComponentProps<typeof CollapsibleTrigger> & {
  isStreaming?: boolean;
  title?: string;
  getThinkingMessage?: (isStreaming: boolean, duration?: number) => ReactNode;
  duration?: number;
};

export function ReasoningTrigger({
  className,
  isStreaming,
  title = "思考过程",
  getThinkingMessage,
  duration,
  children,
  ...props
}: ReasoningTriggerProps) {
  const label =
    getThinkingMessage?.(!!isStreaming, duration) ??
    (isStreaming ? (
      <Shimmer as="span" className="font-medium" duration={1.6}>
        思考中…
      </Shimmer>
    ) : (
      <span className="min-w-0 flex-1 truncate font-medium">
        {title}
        {typeof duration === "number" && duration > 0
          ? ` · ${Math.round(duration)}s`
          : ""}
      </span>
    ));

  return (
    <CollapsibleTrigger
      className={cn("chat-process-trigger group/thought", className)}
      {...props}
    >
      {children ?? (
        <>
          {label}
          <ChevronDownIcon
            className={cn(
              "ml-auto size-3.5 shrink-0 opacity-60 transition-transform",
              /* 与执行过程一致：收起时指向右 */
              "group-data-[state=closed]/thought:-rotate-90",
            )}
          />
        </>
      )}
    </CollapsibleTrigger>
  );
}

export type ReasoningContentProps = ComponentProps<typeof CollapsibleContent> & {
  children: string;
};

export function ReasoningContent({
  className,
  children,
  ...props
}: ReasoningContentProps) {
  return (
    <CollapsibleContent
      className={cn(
        "chat-process-body chat-process-thought-body max-h-60 overflow-auto whitespace-pre-wrap text-muted-foreground",
        className,
      )}
      {...props}
    >
      {children}
    </CollapsibleContent>
  );
}
