import { useEffect, useState } from "react";
import { useI18n } from "../i18n";

export type InspectorTab =
  | "context"
  | "plan"
  | "rewind"
  | "mcp"
  | "skills"
  | "hooks"
  | "worktree"
  | "subagents";

export interface ContextStatsView {
  sessionId: string;
  cwd?: string;
  modelId?: string;
  turnCount?: number;
  userMessageCount?: number;
  assistantMessageCount?: number;
  toolCallCount?: number;
  contextTokensUsed?: number;
  contextWindowTokens?: number;
  contextWindowUsage?: number;
  compactionCount?: number;
  errorCount?: number;
}

export interface RewindPointView {
  promptIndex: number;
  createdAt: string;
  label?: string;
  files: Array<{ path: string; content: string }>;
}

export interface McpServerView {
  name: string;
  detail: string;
  disabled?: boolean;
}

export interface SkillView {
  name: string;
  description: string;
  scope: string;
}

export interface HookView {
  source: string;
  name: string;
  detail: string;
}

export interface SubagentView {
  id: string;
  title: string;
  status: string;
  detail?: string;
}

interface Props {
  open: boolean;
  tab: InspectorTab;
  onTab: (t: InspectorTab) => void;
  onClose: () => void;
  // data
  context: ContextStatsView | null;
  contextLoading?: boolean;
  onRefreshContext: () => void;
  onCompact: () => void;
  onSessionInfo: () => void;
  planMode: boolean;
  onTogglePlan: (on: boolean) => void;
  planText?: string;
  rewindPoints: RewindPointView[];
  rewindLoading?: boolean;
  onRefreshRewind: () => void;
  onApplyRewind: (promptIndex: number) => void;
  mcpServers: McpServerView[];
  onRefreshMcp: () => void;
  skills: SkillView[];
  hooks: HookView[];
  worktreeText: string;
  onRefreshWorktree: () => void;
  subagents: SubagentView[];
  onFork: () => void;
}

export function InspectorDrawer(props: Props) {
  const { open, tab, onTab, onClose } = props;
  const { t } = useI18n();
  const [selectedRewind, setSelectedRewind] = useState<number | null>(null);

  const TABS: { id: InspectorTab; label: string }[] = [
    { id: "context", label: t("inspector.tabContext") },
    { id: "plan", label: t("inspector.tabPlan") },
    { id: "rewind", label: t("inspector.tabRewind") },
    { id: "mcp", label: t("inspector.tabMcp") },
    { id: "skills", label: t("inspector.tabSkills") },
    { id: "hooks", label: t("inspector.tabHooks") },
    { id: "worktree", label: t("inspector.tabWorktree") },
    { id: "subagents", label: t("inspector.tabSubagents") },
  ];

  useEffect(() => {
    if (open && tab === "context") props.onRefreshContext();
    if (open && tab === "rewind") props.onRefreshRewind();
    if (open && tab === "mcp") props.onRefreshMcp();
    if (open && tab === "worktree") props.onRefreshWorktree();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tab]);

  if (!open) return null;

  const usage = props.context?.contextWindowUsage;
  const used = props.context?.contextTokensUsed;
  const total = props.context?.contextWindowTokens;
  const pct =
    typeof usage === "number"
      ? Math.round(usage * (usage <= 1 ? 100 : 1))
      : used && total
        ? Math.round((used / total) * 100)
        : null;

  return (
    <div className="inspector-overlay" onClick={onClose}>
      <aside
        className="inspector-drawer"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={t("inspector.aria")}
      >
        <header className="inspector-header">
          <h3>{t("inspector.title")}</h3>
          <button type="button" className="btn btn-sm" onClick={onClose}>
            {t("common.close")}
          </button>
        </header>
        <div className="inspector-tabs">
          {TABS.map((tabItem) => (
            <button
              key={tabItem.id}
              type="button"
              className={tab === tabItem.id ? "on" : ""}
              onClick={() => onTab(tabItem.id)}
            >
              {tabItem.label}
            </button>
          ))}
        </div>
        <div className="inspector-body">
          {tab === "context" && (
            <div className="insp-section">
              <div className="insp-actions">
                <button type="button" className="btn btn-sm" onClick={props.onRefreshContext}>
                  {t("common.refresh")}
                </button>
                <button type="button" className="btn btn-sm" onClick={props.onSessionInfo}>
                  /session-info
                </button>
                <button type="button" className="btn btn-sm btn-primary" onClick={props.onCompact}>
                  /compact
                </button>
              </div>
              {props.contextLoading ? (
                <p className="muted">{t("common.loading")}</p>
              ) : props.context ? (
                <>
                  <div className="context-meter">
                    <div className="context-meter-bar">
                      <div
                        className="context-meter-fill"
                        style={{ width: `${Math.min(100, pct ?? 0)}%` }}
                      />
                    </div>
                    <div className="context-meter-label">
                      {t("inspector.contextUsage", { pct: pct != null ? `${pct}%` : t("common.empty") })}
                      {used != null && total != null
                        ? ` · ${used.toLocaleString()} / ${total.toLocaleString()} tokens`
                        : ""}
                    </div>
                  </div>
                  <dl className="insp-dl">
                    <dt>Session</dt>
                    <dd className="mono">{props.context.sessionId}</dd>
                    <dt>Model</dt>
                    <dd>{props.context.modelId || "—"}</dd>
                    <dt>Turns</dt>
                    <dd>{props.context.turnCount ?? "—"}</dd>
                    <dt>User / Assistant</dt>
                    <dd>
                      {props.context.userMessageCount ?? "—"} /{" "}
                      {props.context.assistantMessageCount ?? "—"}
                    </dd>
                    <dt>Tools</dt>
                    <dd>{props.context.toolCallCount ?? "—"}</dd>
                    <dt>Compactions</dt>
                    <dd>{props.context.compactionCount ?? 0}</dd>
                    <dt>CWD</dt>
                    <dd className="mono">{props.context.cwd || "—"}</dd>
                  </dl>
                </>
              ) : (
                <p className="muted">{t("inspector.noSessionData")}</p>
              )}
            </div>
          )}

          {tab === "plan" && (
            <div className="insp-section">
              <label className="insp-toggle">
                <input
                  type="checkbox"
                  checked={props.planMode}
                  onChange={(e) => props.onTogglePlan(e.target.checked)}
                />
                {t("inspector.planModeLabel")}
              </label>
              <p className="muted">
                {t("inspector.planModeHint")}
              </p>
              {props.planText ? (
                <pre className="insp-pre">{props.planText}</pre>
              ) : (
                <p className="muted">{t("inspector.noPlan")}</p>
              )}
              <button type="button" className="btn btn-sm" onClick={props.onFork}>
                {t("inspector.forkSession")}
              </button>
            </div>
          )}

          {tab === "rewind" && (
            <div className="insp-section">
              <div className="insp-actions">
                <button type="button" className="btn btn-sm" onClick={props.onRefreshRewind}>
                  {t("inspector.refreshRewind")}
                </button>
              </div>
              {props.rewindLoading ? (
                <p className="muted">{t("common.loading")}</p>
              ) : props.rewindPoints.length === 0 ? (
                <p className="muted">
                  {t("inspector.noRewind")}
                </p>
              ) : (
                <ul className="rewind-list">
                  {props.rewindPoints.map((p) => (
                    <li key={p.promptIndex}>
                      <button
                        type="button"
                        className={
                          selectedRewind === p.promptIndex ? "rewind-item on" : "rewind-item"
                        }
                        onClick={() => setSelectedRewind(p.promptIndex)}
                      >
                        <strong>#{p.promptIndex}</strong>
                        <span className="muted">
                          {p.createdAt
                            ? new Date(p.createdAt).toLocaleString()
                            : ""}
                        </span>
                        <span className="rewind-label">
                          {p.label || t("inspector.fileSnapshots", { n: p.files.length })}
                        </span>
                        <span className="muted">{p.files.length} files</span>
                      </button>
                      {selectedRewind === p.promptIndex ? (
                        <div className="rewind-detail">
                          <ul>
                            {p.files.slice(0, 20).map((f) => (
                              <li key={f.path} className="mono">
                                {f.path}
                              </li>
                            ))}
                          </ul>
                          <button
                            type="button"
                            className="btn btn-sm btn-danger"
                            onClick={() => props.onApplyRewind(p.promptIndex)}
                          >
                            {t("inspector.restorePoint")}
                          </button>
                          <p className="muted">
                            {t("inspector.restoreHint")}
                          </p>
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {tab === "mcp" && (
            <div className="insp-section">
              <div className="insp-actions">
                <button type="button" className="btn btn-sm" onClick={props.onRefreshMcp}>
                  {t("inspector.refreshMcp")}
                </button>
              </div>
              {props.mcpServers.length === 0 ? (
                <p className="muted">{t("inspector.noMcp")}</p>
              ) : (
                <ul className="mcp-list">
                  {props.mcpServers.map((s) => (
                    <li key={s.name} className={s.disabled ? "disabled" : ""}>
                      <strong>{s.name}</strong>
                      {s.disabled ? <span className="badge">disabled</span> : null}
                      <div className="mono muted">{s.detail}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {tab === "skills" && (
            <div className="insp-section">
              {props.skills.length === 0 ? (
                <p className="muted">{t("inspector.noSkills")}</p>
              ) : (
                <ul className="mcp-list">
                  {props.skills.map((s) => (
                    <li key={s.name + s.scope}>
                      <strong>/{s.name}</strong>
                      <span className="badge">{s.scope}</span>
                      <div className="muted">{s.description}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {tab === "hooks" && (
            <div className="insp-section">
              {props.hooks.map((h, i) => (
                <div key={i} className="hook-card">
                  <strong>
                    {h.source} · {h.name}
                  </strong>
                  <pre className="insp-pre">{h.detail}</pre>
                </div>
              ))}
            </div>
          )}

          {tab === "worktree" && (
            <div className="insp-section">
              <div className="insp-actions">
                <button type="button" className="btn btn-sm" onClick={props.onRefreshWorktree}>
                  {t("common.refresh")}
                </button>
                <button type="button" className="btn btn-sm" onClick={props.onFork}>
                  {t("inspector.forkSession")}
                </button>
              </div>
              <pre className="insp-pre">{props.worktreeText || "(empty)"}</pre>
            </div>
          )}

          {tab === "subagents" && (
            <div className="insp-section">
              {props.subagents.length === 0 ? (
                <p className="muted">
                  {t("inspector.noSubagents")}
                </p>
              ) : (
                <ul className="mcp-list">
                  {props.subagents.map((s) => (
                    <li key={s.id}>
                      <strong>{s.title}</strong>
                      <span className="badge">{s.status}</span>
                      {s.detail ? <div className="muted">{s.detail}</div> : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
