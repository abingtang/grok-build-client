import { useEffect, useMemo, useState } from "react";

export interface PaletteItem {
  id: string;
  label: string;
  hint?: string;
  run: () => void;
}

interface Props {
  open: boolean;
  items: PaletteItem[];
  onClose: () => void;
}

export function CommandPalette({ open, items, onClose }: Props) {
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items.filter(
      (it) =>
        it.label.toLowerCase().includes(needle) ||
        (it.hint || "").toLowerCase().includes(needle),
    );
  }, [items, q]);

  useEffect(() => {
    if (open) {
      setQ("");
      setIdx(0);
    }
  }, [open]);

  useEffect(() => {
    setIdx(0);
  }, [q]);

  if (!open) return null;

  return (
    <div className="overlay" onClick={onClose}>
      <div
        className="palette"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
      >
        <input
          autoFocus
          className="palette-input"
          placeholder="搜索命令、设置…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              onClose();
              return;
            }
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setIdx((i) => Math.min(i + 1, filtered.length - 1));
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setIdx((i) => Math.max(i - 1, 0));
            }
            if (e.key === "Enter" && filtered[idx]) {
              e.preventDefault();
              filtered[idx].run();
              onClose();
            }
          }}
        />
        <div className="palette-list">
          {filtered.length === 0 ? (
            <div className="empty-hint">无匹配项</div>
          ) : (
            filtered.map((it, i) => (
              <button
                key={it.id}
                type="button"
                className={`palette-item ${i === idx ? "active" : ""}`}
                onMouseEnter={() => setIdx(i)}
                onClick={() => {
                  it.run();
                  onClose();
                }}
              >
                <span>{it.label}</span>
                {it.hint ? <span className="hint">{it.hint}</span> : null}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
