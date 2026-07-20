import { useEffect, useRef } from "react";
import { useI18n } from "../i18n";
import type { SlashCommandDef } from "../lib/types";

interface Props {
  items: SlashCommandDef[];
  activeIndex: number;
  onSelect: (item: SlashCommandDef) => void;
  onHover: (index: number) => void;
}

export function SlashMenu({ items, activeIndex, onSelect, onHover }: Props) {
  const { t } = useI18n();
  const listRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, items]);

  if (items.length === 0) {
    return (
      <div className="slash-menu">
        <div className="empty-hint">{t("slash.noMatch")}</div>
      </div>
    );
  }

  return (
    <div className="slash-menu" role="listbox" ref={listRef}>
      {items.slice(0, 40).map((item, index) => {
        const active = index === activeIndex;
        return (
          <button
            key={item.name}
            type="button"
            role="option"
            aria-selected={active}
            ref={active ? activeRef : undefined}
            className={`slash-item${active ? " active" : ""}`}
            onMouseEnter={() => onHover(index)}
            onMouseDown={(e) => {
              e.preventDefault();
              onSelect(item);
            }}
          >
            <span className="cmd">
              <span className="cmd-name">/{item.name}</span>
              {item.argumentHint ? (
                <span className="cmd-args" title={item.argumentHint}>
                  {item.argumentHint}
                </span>
              ) : null}
            </span>
            <span className="desc">{item.description}</span>
            {item.note ? (
              <span className="hint" title={item.note}>
                {item.note}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
