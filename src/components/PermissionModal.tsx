import { useEffect, useRef } from "react";
import { useI18n } from "../i18n";
import type { PermissionRequest } from "../lib/types";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface Props {
  request: PermissionRequest;
  onRespond: (optionId: string) => void;
}

/**
 * Tool-permission gate. Blocks the agent turn until the user chooses
 * allow-once / allow-always / reject.
 */
export function PermissionModal({ request, onRespond }: Props) {
  const { t } = useI18n();
  const primaryRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Radix focuses content; ensure primary action is preferred after mount
    const id = window.setTimeout(() => primaryRef.current?.focus(), 0);
    return () => clearTimeout(id);
  }, [request.requestId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const el = e.target as HTMLElement | null;
        if (el?.closest?.("button")) return;
        e.preventDefault();
        onRespond("allow-once");
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onRespond, request.requestId]);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onRespond("reject");
      }}
    >
      <DialogContent
        className="w-[min(480px,calc(100vw-32px))] p-0 sm:max-w-md"
        showClose={false}
        onEscapeKeyDown={(e) => {
          e.preventDefault();
          onRespond("reject");
        }}
        onPointerDownOutside={(e) => {
          // Permission must be explicit — don't dismiss on outside click
          e.preventDefault();
          primaryRef.current?.focus();
        }}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <div className="flex items-center justify-between gap-2 pr-0">
            <DialogTitle>{t("permission.title")}</DialogTitle>
            <span className="rounded-full border border-[color-mix(in_srgb,var(--warn)_40%,transparent)] bg-[color-mix(in_srgb,var(--warn)_12%,transparent)] px-2 py-0.5 text-[11px] font-semibold text-[var(--warn)]">
              {t("permission.waiting")}
            </span>
          </div>
        </DialogHeader>
        <DialogBody>
          <strong className="block break-words text-[14px] text-foreground">
            {request.title}
          </strong>
          {request.description ? (
            <DialogDescription className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed">
              {request.description}
            </DialogDescription>
          ) : (
            <DialogDescription className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
              {t("permission.defaultDesc")}
            </DialogDescription>
          )}
        </DialogBody>
        <DialogFooter className="flex-row flex-wrap gap-2 sm:justify-start">
          <Button
            ref={primaryRef}
            type="button"
            onClick={() => onRespond("allow-once")}
            title="Enter"
          >
            {t("permission.allowOnce")}
            <kbd className="ml-1.5 rounded border border-current/25 px-1 font-mono text-[10px] opacity-75">
              ↵
            </kbd>
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => onRespond("allow-always")}
          >
            {t("permission.allowAlways")}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="text-destructive border-destructive/40 hover:bg-destructive/10"
            onClick={() => onRespond("reject")}
            title="Esc"
          >
            {t("permission.reject")}
            <kbd className="ml-1.5 rounded border border-current/25 px-1 font-mono text-[10px] opacity-75">
              Esc
            </kbd>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
