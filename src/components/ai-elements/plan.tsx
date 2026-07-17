import { cn } from "@/lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  CheckIcon,
  ChevronDownIcon,
  CircleDotIcon,
  CircleIcon,
  ListTodoIcon,
} from "lucide-react";
import type { ComponentProps } from "react";
import { useMemo } from "react";
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
        "plan-card not-prose w-full overflow-hidden",
        isStreaming && "plan-card-live",
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
    <div className={cn("plan-card-header", className)} {...props} />
  );
}

export type PlanTitleProps = ComponentProps<"div"> & {
  isStreaming?: boolean;
  children: string;
  /** e.g. "3/7" when counts known */
  progress?: string | null;
};

export function PlanTitle({
  className,
  isStreaming,
  children,
  progress,
  ...props
}: PlanTitleProps) {
  return (
    <div className={cn("plan-card-title", className)} {...props}>
      <span className="plan-card-mark" aria-hidden>
        <ListTodoIcon className="size-3.5" />
      </span>
      <div className="plan-card-title-text min-w-0 flex-1">
        {isStreaming ? (
          <Shimmer as="span" className="plan-card-heading" duration={1.6}>
            {children}
          </Shimmer>
        ) : (
          <span className="plan-card-heading truncate">{children}</span>
        )}
        {isStreaming ? (
          <span className="plan-card-badge plan-card-badge-live">LIVE</span>
        ) : null}
        {progress ? (
          <span className="plan-card-badge plan-card-badge-muted">{progress}</span>
        ) : null}
      </div>
    </div>
  );
}

export type PlanTriggerProps = ComponentProps<typeof CollapsibleTrigger>;

export function PlanTrigger({ className, ...props }: PlanTriggerProps) {
  return (
    <CollapsibleTrigger
      className={cn("plan-card-trigger", className)}
      {...props}
    >
      <ChevronDownIcon className="size-3.5 transition-transform duration-150 [[data-state=open]_&]:rotate-180" />
    </CollapsibleTrigger>
  );
}

export type PlanContentProps = ComponentProps<typeof CollapsibleContent>;

export function PlanContent({ className, ...props }: PlanContentProps) {
  return (
    <CollapsibleContent className={cn("plan-card-body", className)} {...props} />
  );
}

export type PlanEntryStatus = "done" | "active" | "todo";

export type PlanEntry = {
  status: PlanEntryStatus;
  text: string;
};

/** Parse TUI-style plan lines: ✓ / … / ○ */
export function parsePlanEntries(text: string): PlanEntry[] {
  const lines = String(text || "")
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0);

  return lines.map((line) => {
    const t = line.trim();
    if (/^[✓✔√]\s*/.test(t)) {
      return { status: "done" as const, text: t.replace(/^[✓✔√]\s*/, "") };
    }
    if (/^[…⋯·•]\s*/.test(t) || /^in[_ ]?progress[:\s]/i.test(t)) {
      return {
        status: "active" as const,
        text: t
          .replace(/^[…⋯·•]\s*/, "")
          .replace(/^in[_ ]?progress[:\s]*/i, ""),
      };
    }
    if (/^[○◯oO\-]\s+/.test(t) || /^todo[:\s]/i.test(t)) {
      return {
        status: "todo" as const,
        text: t.replace(/^[○◯oO\-]\s+/, "").replace(/^todo[:\s]*/i, ""),
      };
    }
    // Numbered list → todo
    if (/^\d+[\.)]\s+/.test(t)) {
      return { status: "todo" as const, text: t.replace(/^\d+[\.)]\s+/, "") };
    }
    return { status: "todo" as const, text: t };
  });
}

export function planProgressLabel(entries: PlanEntry[]): string | null {
  if (!entries.length) return null;
  const done = entries.filter((e) => e.status === "done").length;
  if (done === 0 && !entries.some((e) => e.status === "active")) return null;
  return `${done}/${entries.length}`;
}

function StatusIcon({ status }: { status: PlanEntryStatus }) {
  if (status === "done") {
    return (
      <span className="plan-entry-icon plan-entry-done" aria-hidden>
        <CheckIcon className="size-3" strokeWidth={2.5} />
      </span>
    );
  }
  if (status === "active") {
    return (
      <span className="plan-entry-icon plan-entry-active" aria-hidden>
        <CircleDotIcon className="size-3.5" />
      </span>
    );
  }
  return (
    <span className="plan-entry-icon plan-entry-todo" aria-hidden>
      <CircleIcon className="size-3.5" />
    </span>
  );
}

export type PlanDescriptionProps = {
  className?: string;
  isStreaming?: boolean;
  children: string;
  emptyLabel?: string;
};

export function PlanDescription({
  className,
  isStreaming,
  children,
  emptyLabel = "正在规划…",
}: PlanDescriptionProps) {
  const entries = useMemo(
    () => parsePlanEntries(children || ""),
    [children],
  );

  if (isStreaming && !children?.trim()) {
    return (
      <div className={cn("plan-card-empty", className)}>
        <Shimmer as="span" className="text-sm" duration={1.6}>
          {emptyLabel}
        </Shimmer>
      </div>
    );
  }

  if (!entries.length) {
    return (
      <pre
        className={cn(
          "plan-card-fallback whitespace-pre-wrap font-sans text-sm leading-relaxed",
          className,
        )}
      >
        {children}
      </pre>
    );
  }

  // Prefer checklist when most lines look like plan steps
  const structured = entries.some(
    (e, i) =>
      e.status !== "todo" ||
      /^[✓✔…○◯]/.test(String(children).split("\n")[i]?.trim() || ""),
  );

  if (!structured && entries.length <= 1) {
    return (
      <pre
        className={cn(
          "plan-card-fallback whitespace-pre-wrap font-sans text-sm leading-relaxed",
          className,
        )}
      >
        {children}
      </pre>
    );
  }

  return (
    <ol className={cn("plan-entry-list", className)}>
      {entries.map((e, i) => (
        <li
          key={`${i}-${e.text.slice(0, 24)}`}
          className={cn("plan-entry", `plan-entry--${e.status}`)}
        >
          <StatusIcon status={e.status} />
          <span className="plan-entry-text">{e.text}</span>
        </li>
      ))}
    </ol>
  );
}
