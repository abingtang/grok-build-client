import { useEffect, useMemo, useState } from "react";
import { useI18n } from "../i18n";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import * as VisuallyHidden from "@radix-ui/react-visually-hidden";

export interface PaletteItem {
  id: string;
  label: string;
  hint?: string;
  /** Optional group header key */
  group?: "command" | "session";
  run: () => void;
}

interface Props {
  open: boolean;
  items: PaletteItem[];
  onClose: () => void;
  /** Live query for parent (e.g. session search) */
  onQueryChange?: (q: string) => void;
  placeholder?: string;
}

export function CommandPalette({
  open,
  items,
  onClose,
  onQueryChange,
  placeholder,
}: Props) {
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) {
      return items.filter((it) => it.group !== "session");
    }
    return items.filter(
      (it) =>
        it.label.toLowerCase().includes(needle) ||
        (it.hint || "").toLowerCase().includes(needle) ||
        it.group === "session",
    );
  }, [items, q]);

  const commands = filtered.filter((it) => it.group !== "session");
  const sessions = filtered.filter((it) => it.group === "session");
  const flat = useMemo(
    () => [...commands, ...sessions],
    [commands, sessions],
  );

  useEffect(() => {
    if (open) {
      setQ("");
      setIdx(0);
      onQueryChange?.("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    setIdx(0);
  }, [q, flat.length]);

  const runAt = (i: number) => {
    const it = flat[i];
    if (!it) return;
    it.run();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className="flex w-[min(560px,calc(100vw-32px))] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl"
        showClose={false}
        onOpenAutoFocus={(e) => {
          // keep focus on input
          e.preventDefault();
          (
            document.querySelector(
              ".palette-radix-input",
            ) as HTMLInputElement | null
          )?.focus();
        }}
      >
        <VisuallyHidden.Root>
          <DialogTitle>{t("palette.search")}</DialogTitle>
        </VisuallyHidden.Root>
        <input
          autoFocus
          className="palette-radix-input w-full border-0 border-b border-border bg-transparent px-4 py-3.5 text-[14px] outline-none placeholder:text-muted-foreground"
          placeholder={placeholder || t("palette.searchWithSessions")}
          value={q}
          onChange={(e) => {
            const v = e.target.value;
            setQ(v);
            onQueryChange?.(v);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setIdx((i) => Math.min(i + 1, Math.max(0, flat.length - 1)));
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setIdx((i) => Math.max(i - 1, 0));
            }
            if (e.key === "Enter" && flat[idx]) {
              e.preventDefault();
              runAt(idx);
            }
          }}
        />
        <ScrollArea className="max-h-[min(50vh,360px)]">
          <div className="p-1.5 pb-2">
            {flat.length === 0 ? (
              <div className="px-3 py-6 text-center text-[12.5px] text-muted-foreground">
                {t("palette.empty")}
              </div>
            ) : (
              <>
                {commands.length > 0 ? (
                  <>
                    <div className="px-2.5 pb-1 pt-2 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                      {t("palette.sectionCommands")}
                    </div>
                    {commands.map((it) => {
                      const i = flat.indexOf(it);
                      return (
                        <button
                          key={it.id}
                          type="button"
                          className={cn(
                            "flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-[13px]",
                            i === idx
                              ? "bg-accent text-accent-foreground"
                              : "text-foreground hover:bg-muted/60",
                          )}
                          onMouseEnter={() => setIdx(i)}
                          onClick={() => runAt(i)}
                        >
                          <span>{it.label}</span>
                          {it.hint ? (
                            <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                              {it.hint}
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </>
                ) : null}
                {sessions.length > 0 ? (
                  <>
                    <div className="px-2.5 pb-1 pt-2 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                      {t("palette.sectionSessions")}
                    </div>
                    {sessions.map((it) => {
                      const i = flat.indexOf(it);
                      return (
                        <button
                          key={it.id}
                          type="button"
                          className={cn(
                            "flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-[13px]",
                            i === idx
                              ? "bg-accent text-accent-foreground"
                              : "text-foreground hover:bg-muted/60",
                          )}
                          onMouseEnter={() => setIdx(i)}
                          onClick={() => runAt(i)}
                        >
                          <span className="min-w-0 truncate">{it.label}</span>
                          {it.hint ? (
                            <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                              {it.hint}
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </>
                ) : null}
              </>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
