/**
 * Right-side turn rail: jump to a user / agent-turn anchor in the transcript.
 * Must render inside <Conversation> (StickToBottom context).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useStickToBottomContext } from "use-stick-to-bottom";
import type { Segment } from "@/lib/chat-segments";
import { useI18n } from "../i18n";
import { cn } from "@/lib/utils";

export type TurnNavItem = {
  /** Matches data-turn-id on transcript anchors */
  id: string;
  index: number;
  kind: "user" | "agent" | "system";
  label: string;
  live?: boolean;
};

const LABEL_MAX = 42;

function shorten(text: string, max = LABEL_MAX): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return "";
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

/** Build navigable turns from transcript segments (user + agent-turn). */
export function buildTurnNavItems(segments: Segment[]): TurnNavItem[] {
  const items: TurnNavItem[] = [];
  let n = 0;
  for (const seg of segments) {
    if (seg.type === "user") {
      n += 1;
      const raw = seg.message.content || "";
      items.push({
        id: seg.message.id,
        index: n,
        kind: "user",
        label: shorten(raw) || `User #${n}`,
      });
      continue;
    }
    if (seg.type === "agent-turn") {
      n += 1;
      const last =
        seg.results.length > 0
          ? seg.results[seg.results.length - 1]?.content || ""
          : "";
      const thought = seg.thoughts[0]?.content || "";
      items.push({
        id: seg.id,
        index: n,
        kind: "agent",
        label: shorten(last || thought) || `Grok #${n}`,
        live: seg.live,
      });
    }
  }
  return items;
}

type Props = {
  items: TurnNavItem[];
  className?: string;
  onJump?: (item: TurnNavItem) => void;
};

export function TurnNavigator({ items, className, onJump }: Props) {
  const { t } = useI18n();
  const { scrollRef, stopScroll } = useStickToBottomContext();
  const [activeId, setActiveId] = useState<string | null>(
    items.length ? items[items.length - 1]!.id : null,
  );
  const [expanded, setExpanded] = useState(false);

  const idList = useMemo(() => items.map((i) => i.id).join("|"), [items]);

  // Track which turn is in view
  useEffect(() => {
    if (!items.length) return;
    const root = scrollRef.current;
    if (!root) return;

    const els = items
      .map((it) => root.querySelector<HTMLElement>(`[data-turn-id="${CSS.escape(it.id)}"]`))
      .filter((el): el is HTMLElement => !!el);

    if (!els.length) return;

    const visible = new Map<string, number>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const id = (e.target as HTMLElement).dataset.turnId;
          if (!id) continue;
          if (e.isIntersecting) {
            visible.set(id, e.intersectionRatio);
          } else {
            visible.delete(id);
          }
        }
        if (!visible.size) return;
        // Prefer the topmost visible (highest position in list order among visible)
        let best: string | null = null;
        let bestRatio = -1;
        for (const it of items) {
          const r = visible.get(it.id);
          if (r == null) continue;
          if (r >= bestRatio) {
            bestRatio = r;
            best = it.id;
          }
        }
        if (best) setActiveId(best);
      },
      {
        root,
        rootMargin: "-12% 0px -45% 0px",
        threshold: [0, 0.15, 0.35, 0.6, 1],
      },
    );

    for (const el of els) io.observe(el);
    return () => io.disconnect();
  }, [idList, items, scrollRef]);

  const jumpTo = useCallback(
    (item: TurnNavItem) => {
      if (onJump) {
        stopScroll();
        setActiveId(item.id);
        onJump(item);
        return;
      }
      const root = scrollRef.current;
      if (!root) return;
      const el = root.querySelector<HTMLElement>(
        `[data-turn-id="${CSS.escape(item.id)}"]`,
      );
      if (!el) return;
      stopScroll();
      setActiveId(item.id);
      el.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
        block: "start",
      });
    },
    [onJump, scrollRef, stopScroll],
  );

  if (items.length < 2) return null;

  return (
    <nav
      className={cn(
        "turn-nav",
        expanded && "turn-nav-expanded",
        className,
      )}
      aria-label={t("chat.turnNavLabel")}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      onFocus={() => setExpanded(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setExpanded(false);
        }
      }}
    >
      <div className="turn-nav-track" aria-hidden>
        <div className="turn-nav-line" />
      </div>
      <ul className="turn-nav-list">
        {items.map((it) => {
          const active = it.id === activeId;
          return (
            <li key={it.id}>
              <button
                type="button"
                className={cn(
                  "turn-nav-item",
                  `turn-nav-item--${it.kind}`,
                  active && "is-active",
                  it.live && "is-live",
                )}
                title={`${it.index}. ${it.label}`}
                aria-label={t("chat.turnNavJump", {
                  n: it.index,
                  label: it.label,
                })}
                aria-current={active ? "true" : undefined}
                onClick={() => jumpTo(it)}
              >
                <span className="turn-nav-dot" aria-hidden />
                <span className="turn-nav-meta">
                  <span className="turn-nav-index">
                    {it.kind === "user"
                      ? t("chat.turnNavUser", { n: it.index })
                      : t("chat.turnNavAgent", { n: it.index })}
                    {it.live ? (
                      <span className="turn-nav-live"> · {t("chat.turnNavLive")}</span>
                    ) : null}
                  </span>
                  <span className="turn-nav-label">{it.label}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
