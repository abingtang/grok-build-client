import type { PanelId } from "../lib/types";

const TITLES: Record<Exclude<PanelId, null>, string> = {
  sessions: "会话",
  settings: "设置",
  history: "提示历史",
  docs: "文档",
  hooks: "Hooks",
  plugins: "Plugins",
  marketplace: "Marketplace",
  skills: "Skills",
  mcps: "MCP Servers",
  agents: "Agents",
  personas: "Personas",
  rewind: "Rewind",
};

interface Props {
  panel: Exclude<PanelId, null>;
  body: string;
  onClose: () => void;
}

export function PanelModal({ panel, body, onClose }: Props) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header>
          <h3>{TITLES[panel]}</h3>
          <button type="button" className="btn btn-sm" onClick={onClose}>
            关闭
          </button>
        </header>
        <div className="body">{body}</div>
      </div>
    </div>
  );
}
