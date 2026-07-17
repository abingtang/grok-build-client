import { cn } from "@/lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDownIcon, ListTodoIcon } from "lucide-react";
import type { ComponentProps } from "react";
import { Shimmer } from "./shimmer";

export type PlanProps = ComponentProps<typeof Collapsible> & {
  isStreaming?: boolean;
};

export function Plan({
  className,
  isStreaming,
  defaultOpen = true,
  ...props
}: PlanProps) {
  return (
    <Collapsible
      defaultOpen={defaultOpen}
      className={cn(
        "not-prose w-full overflow-hidden rounded-lg border border-border bg-card/50",
        className,
      )}
      data-streaming={isStreaming ? "true" : undefined}
      {...props}
    />
  );
}

export type PlanHeaderProps = ComponentProps<"div">;

export function PlanHeader({ className, ...props }: PlanHeaderProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 border-b border-border/60 px-3 py-2",
        className,
      )}
      {...props}
    />
  );
}

export type PlanTitleProps = ComponentProps<"div"> & {
  isStreaming?: boolean;
  children: string;
};

export function PlanTitle({
  className,
  isStreaming,
  children,
  ...props
}: PlanTitleProps) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-1 items-center gap-2 text-sm font-medium",
        className,
      )}
      {...props}
    >
      <ListTodoIcon className="size-3.5 shrink-0 text-muted-foreground" />
      {isStreaming ? (
        <Shimmer as="span" duration={1.6}>
          {children}
        </Shimmer>
      ) : (
        <span className="truncate">{children}</span>
      )}
    </div>
  );
}

export type PlanTriggerProps = ComponentProps<typeof CollapsibleTrigger>;

export function PlanTrigger({ className, ...props }: PlanTriggerProps) {
  return (
    <CollapsibleTrigger
      className={cn(
        "rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        className,
      )}
      {...props}
    >
      <ChevronDownIcon className="size-4 transition-transform [[data-state=open]_&]:rotate-180" />
    </CollapsibleTrigger>
  );
}

export type PlanContentProps = ComponentProps<typeof CollapsibleContent>;

export function PlanContent({ className, ...props }: PlanContentProps) {
  return (
    <CollapsibleContent
      className={cn("px-3 py-2 text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export type PlanDescriptionProps = ComponentProps<"pre"> & {
  isStreaming?: boolean;
  children: string;
};

export function PlanDescription({
  className,
  isStreaming,
  children,
  ...props
}: PlanDescriptionProps) {
  if (isStreaming && !children) {
    return (
      <Shimmer as="p" className="text-sm" duration={1.6}>
        正在规划…
      </Shimmer>
    );
  }
  return (
    <pre
      className={cn(
        "whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground/90",
        className,
      )}
      {...props}
    >
      {children}
    </pre>
  );
}
