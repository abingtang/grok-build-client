/**
 * Full-page global config: MCP / Skills / Hooks (not a right drawer).
 * Title + refresh/close live in the app titlebar (App.tsx).
 */
import { useI18n } from "../i18n";
import type {
  HookView,
  McpServerView,
  SkillView,
} from "./InspectorDrawer";

export type GlobalConfigKind = "mcp" | "skills" | "hooks";

interface Props {
  kind: GlobalConfigKind;
  mcpServers: McpServerView[];
  skills: SkillView[];
  hooks: HookView[];
}

export function GlobalConfigPage({
  kind,
  mcpServers,
  skills,
  hooks,
}: Props) {
  const { t } = useI18n();

  const title =
    kind === "mcp"
      ? t("tree.navMcpTitle")
      : kind === "skills"
        ? t("tree.navSkillsTitle")
        : t("tree.navHooksTitle");

  return (
    <div className="global-config-page" role="region" aria-label={title}>
      <div className="global-config-body">
        {kind === "mcp" &&
          (mcpServers.length === 0 ? (
            <p className="muted global-config-empty">{t("inspector.noMcp")}</p>
          ) : (
            <ul className="global-config-list">
              {mcpServers.map((s) => (
                <li
                  key={s.name}
                  className={`global-config-card${s.disabled ? " disabled" : ""}`}
                >
                  <div className="global-config-card-head">
                    <strong>{s.name}</strong>
                    {s.disabled ? (
                      <span className="badge">disabled</span>
                    ) : null}
                  </div>
                  {s.detail ? (
                    <pre className="global-config-pre">{s.detail}</pre>
                  ) : null}
                </li>
              ))}
            </ul>
          ))}

        {kind === "skills" &&
          (skills.length === 0 ? (
            <p className="muted global-config-empty">{t("inspector.noSkills")}</p>
          ) : (
            <ul className="global-config-list">
              {skills.map((s) => (
                <li key={`${s.scope}-${s.name}`} className="global-config-card">
                  <div className="global-config-card-head">
                    <strong>{s.name}</strong>
                    <span className="badge">{s.scope}</span>
                  </div>
                  {s.description ? (
                    <p className="global-config-desc">{s.description}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          ))}

        {kind === "hooks" &&
          (hooks.length === 0 ? (
            <p className="muted global-config-empty">{t("inspector.noHooks")}</p>
          ) : (
            <ul className="global-config-list">
              {hooks.map((h, i) => (
                <li
                  key={`${h.source}-${h.name}-${i}`}
                  className="global-config-card"
                >
                  <div className="global-config-card-head">
                    <strong>
                      {h.source} · {h.name}
                    </strong>
                  </div>
                  {h.detail ? (
                    <pre className="global-config-pre">{h.detail}</pre>
                  ) : null}
                </li>
              ))}
            </ul>
          ))}
      </div>
    </div>
  );
}
