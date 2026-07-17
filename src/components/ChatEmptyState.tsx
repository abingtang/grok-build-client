import { useI18n } from "../i18n";

type Props = {
  modelLabel?: string;
};

/**
 * New-session / empty transcript welcome — text + shortcuts, no brand mark.
 */
export function ChatEmptyState({ modelLabel }: Props) {
  const { t } = useI18n();
  const model = modelLabel || "grok";
  const isMac =
    typeof navigator !== "undefined" &&
    /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);

  const mod = isMac ? "⌘" : "Ctrl+";

  const hints: Array<{ keys: string; label: string }> = [
    { keys: "Enter", label: t("chat.emptyHintSend") },
    { keys: "Shift+Enter", label: t("chat.emptyHintNewline") },
    { keys: "/", label: t("chat.emptyHintSlash") },
    { keys: `${mod}K`, label: t("chat.emptyHintPalette") },
    { keys: `${mod}N`, label: t("chat.emptyHintNew") },
  ];

  return (
    <div className="chat-empty" role="status">
      <div className="chat-empty-inner">
        <div className="chat-empty-copy">
          <h2 className="chat-empty-title">{t("chat.emptyTitle")}</h2>
          <p className="chat-empty-desc">{t("chat.emptyDesc")}</p>
        </div>

        <div className="chat-empty-model" title={model}>
          <span className="chat-empty-model-dot" aria-hidden />
          <span className="chat-empty-model-label">{t("common.model")}</span>
          <span className="chat-empty-model-id">{model}</span>
        </div>

        <ul className="chat-empty-hints">
          {hints.map((h) => (
            <li key={h.keys} className="chat-empty-hint">
              <kbd className="chat-empty-kbd">{h.keys}</kbd>
              <span>{h.label}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
