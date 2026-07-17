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

  if (items.length === 0) {
    return (
      <div className="slash-menu">
        <div className="empty-hint">{t("slash.noMatch")}</div>
      </div>
    );
  }

  return (
    <div className="slash-menu" role="listbox">
      {items.slice(0, 40).map((item, index) => (
        <button
          key={item.name}
          type="button"
          className={`slash-item ${index === activeIndex ? "active" : ""}`}
          onMouseEnter={() => onHover(index)}
          onMouseDown={(e) => {
            e.preventDefault();
            onSelect(item);
          }}
        >
          <span className="cmd">
            /{item.name}
            {item.argumentHint ? ` ${item.argumentHint}` : ""}
          </span>
          <span className="desc">{item.description}</span>
          {item.note ? <span className="hint">{item.note}</span> : null}
        </button>
      ))}
    </div>
  );
}
