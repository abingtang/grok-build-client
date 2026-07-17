import { useI18n } from "../i18n";
import type { PanelId } from "../lib/types";

interface Props {
  panel: Exclude<PanelId, null>;
  body: string;
  onClose: () => void;
}

export function PanelModal({ panel, body, onClose }: Props) {
  const { t } = useI18n();

  const titles: Record<Exclude<PanelId, null>, string> = {
    sessions: t("panel.sessions"),
    settings: t("panel.settings"),
    history: t("panel.history"),
    docs: t("panel.docs"),
    hooks: "Hooks",
    plugins: "Plugins",
    marketplace: "Marketplace",
    skills: "Skills",
    mcps: "MCP Servers",
    agents: "Agents",
    personas: "Personas",
    rewind: "Rewind",
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header>
          <h3>{titles[panel]}</h3>
          <button type="button" className="btn btn-sm" onClick={onClose}>
            {t("common.close")}
          </button>
        </header>
        <div className="body">{body}</div>
      </div>
    </div>
  );
}
