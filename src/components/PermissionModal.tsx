import { useEffect, useRef } from "react";
import { useI18n } from "../i18n";
import type { PermissionRequest } from "../lib/types";

interface Props {
  request: PermissionRequest;
  onRespond: (optionId: string) => void;
}

/**
 * Tool-permission gate. Blocks the agent turn until the user chooses
 * allow-once / allow-always / reject. Keyboard: Enter = allow once, Esc = reject.
 */
export function PermissionModal({ request, onRespond }: Props) {
  const { t } = useI18n();
  const primaryRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    primaryRef.current?.focus();
  }, [request.requestId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onRespond("reject");
        return;
      }
      // Enter only when focus is not already on another action button
      if (e.key === "Enter" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const el = e.target as HTMLElement | null;
        if (el?.closest?.(".permission-actions button")) return;
        e.preventDefault();
        onRespond("allow-once");
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onRespond, request.requestId]);

  // Simple focus trap within the dialog
  useEffect(() => {
    const root = dialogRef.current;
    if (!root) return;
    const onTab = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const focusable = root.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (active === first || !root.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    root.addEventListener("keydown", onTab);
    return () => root.removeEventListener("keydown", onTab);
  }, [request.requestId]);

  return (
    <div
      className="overlay"
      role="presentation"
      onMouseDown={(e) => {
        // Click outside does not dismiss — permission must be explicit
        if (e.target === e.currentTarget) {
          primaryRef.current?.focus();
        }
      }}
    >
      <div
        ref={dialogRef}
        className="modal permission-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="permission-title"
        aria-describedby="permission-desc"
      >
        <header>
          <h3 id="permission-title">{t("permission.title")}</h3>
          <span className="permission-badge" aria-hidden>
            {t("permission.waiting")}
          </span>
        </header>
        <div className="body" id="permission-desc">
          <strong className="permission-tool-title">{request.title}</strong>
          {request.description ? (
            <p className="permission-desc-text">{request.description}</p>
          ) : (
            <p className="permission-desc-text muted">
              {t("permission.defaultDesc")}
            </p>
          )}
        </div>
        <div className="permission-actions">
          <button
            ref={primaryRef}
            type="button"
            className="btn btn-primary"
            onClick={() => onRespond("allow-once")}
            title="Enter"
          >
            {t("permission.allowOnce")}
            <kbd className="permission-kbd">↵</kbd>
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => onRespond("allow-always")}
          >
            {t("permission.allowAlways")}
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => onRespond("reject")}
            title="Esc"
          >
            {t("permission.reject")}
            <kbd className="permission-kbd">Esc</kbd>
          </button>
        </div>
      </div>
    </div>
  );
}
