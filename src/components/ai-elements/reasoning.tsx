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
      className={cn("not-prose mb-0", className)}
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
      <Shimmer as="span" className="text-sm font-normal leading-snug" duration={1.6}>
        思考中…
      </Shimmer>
    ) : (
      <span className="text-sm font-normal leading-snug text-muted-foreground">
        {title}
        {typeof duration === "number" && duration > 0
          ? ` · ${Math.round(duration)}s`
          : ""}
      </span>
    ));

  return (
    <CollapsibleTrigger
      className={cn(
        // 与执行过程内「读取文件 / 已运行」行统一：text-sm + 略放宽行距
        "flex w-full items-center gap-2.5 rounded-md py-1.5 text-left text-sm font-normal leading-snug text-muted-foreground transition-colors hover:text-foreground",
        className,
      )}
      {...props}
    >
      {children ?? (
        <>
          {label}
          <ChevronDownIcon className="ml-auto size-3.5 shrink-0 opacity-60 transition-transform [[data-state=open]_&]:rotate-180" />
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
        "mt-1 max-h-60 overflow-auto whitespace-pre-wrap rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-sm text-muted-foreground",
        className,
      )}
      {...props}
    >
      {children}
    </CollapsibleContent>
  );
}
