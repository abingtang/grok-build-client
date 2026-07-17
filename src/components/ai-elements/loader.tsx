import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";
import { Shimmer } from "./shimmer";

export type LoaderProps = HTMLAttributes<HTMLDivElement> & {
  /** Phase label; when set, uses AI Elements Shimmer. */
  label?: string;
  elapsedSec?: number;
};

/** Waiting / connecting indicator for AI Elements chat UIs. */
export function Loader({
  className,
  label = "Grok 正在处理…",
  elapsedSec,
  ...props
}: LoaderProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 py-1 text-sm text-muted-foreground",
        className,
      )}
      role="status"
      aria-live="polite"
      {...props}
    >
      <span
        className="size-1.5 shrink-0 rounded-full bg-muted-foreground/80 animate-pulse"
        aria-hidden
      />
      <Shimmer as="span" className="text-sm font-medium" duration={1.5}>
        {label}
      </Shimmer>
      {typeof elapsedSec === "number" && elapsedSec > 0 ? (
        <span className="font-mono text-xs tabular-nums opacity-70">
          {elapsedSec}s
        </span>
      ) : null}
    </div>
  );
}
