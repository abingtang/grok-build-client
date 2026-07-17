import { cn } from "@/lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  CheckCircle2Icon,
  ChevronDownIcon,
  CircleIcon,
  Loader2Icon,
  XCircleIcon,
} from "lucide-react";
import type { ComponentProps } from "react";

export type ToolProps = ComponentProps<typeof Collapsible>;

export function Tool({ className, ...props }: ToolProps) {
  return (
    <Collapsible
      className={cn(
        "not-prose mb-2 w-full overflow-hidden rounded-lg border border-border bg-card/40",
        className,
      )}
      {...props}
    />
  );
}

export type ToolHeaderProps = ComponentProps<typeof CollapsibleTrigger> & {
  title: string;
  toolType?: string;
  state?: string;
};

function StateIcon({ state }: { state?: string }) {
  const s = (state || "").toLowerCase();
  if (s === "completed" || s === "done" || s === "output-available") {
    return <CheckCircle2Icon className="size-3.5 text-emerald-500" />;
  }
  if (s === "failed" || s === "error" || s === "output-error") {
    return <XCircleIcon className="size-3.5 text-destructive" />;
  }
  if (
    s === "in_progress" ||
    s === "running" ||
    s === "input-streaming" ||
    s === "input-available"
  ) {
    return <Loader2Icon className="size-3.5 animate-spin text-amber-500" />;
  }
  return <CircleIcon className="size-3.5 text-muted-foreground" />;
}

export function ToolHeader({
  className,
  title,
  toolType,
  state,
  ...props
}: ToolHeaderProps) {
  return (
    <CollapsibleTrigger
      className={cn(
        "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/40",
        className,
      )}
      {...props}
    >
      <StateIcon state={state} />
      <span className="min-w-0 flex-1 truncate font-medium">{title}</span>
      {toolType ? (
        <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
          {toolType}
        </span>
      ) : null}
      {state ? (
        <span className="text-[11px] text-muted-foreground lowercase">
          {state}
        </span>
      ) : null}
      <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground transition-transform [[data-state=open]_&]:rotate-180" />
    </CollapsibleTrigger>
  );
}

export type ToolContentProps = ComponentProps<typeof CollapsibleContent>;

export function ToolContent({ className, ...props }: ToolContentProps) {
  return (
    <CollapsibleContent
      className={cn(
        "border-t border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

export type ToolInputProps = ComponentProps<"div"> & {
  input?: unknown;
};

export function ToolInput({ className, input, ...props }: ToolInputProps) {
  if (input == null || input === "") return null;
  const text =
    typeof input === "string" ? input : JSON.stringify(input, null, 2);
  return (
    <div className={cn("space-y-1", className)} {...props}>
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Input
      </div>
      <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-md bg-background/60 p-2 font-mono text-[11px] leading-relaxed">
        {text}
      </pre>
    </div>
  );
}

export type ToolOutputProps = ComponentProps<"div"> & {
  output?: unknown;
  errorText?: string;
};

export function ToolOutput({
  className,
  output,
  errorText,
  ...props
}: ToolOutputProps) {
  if (!output && !errorText) return null;
  const text =
    typeof output === "string"
      ? output
      : output != null
        ? JSON.stringify(output, null, 2)
        : "";
  return (
    <div className={cn("mt-2 space-y-1", className)} {...props}>
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {errorText ? "Error" : "Output"}
      </div>
      <pre
        className={cn(
          "max-h-64 overflow-auto whitespace-pre-wrap rounded-md p-2 font-mono text-[11px] leading-relaxed",
          errorText
            ? "bg-destructive/10 text-destructive"
            : "bg-background/60",
        )}
      >
        {errorText || text}
      </pre>
    </div>
  );
}
