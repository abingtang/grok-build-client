import { useEffect, useMemo, useState } from "react";
import { useI18n } from "../i18n";
import {
  parsePlanEntries,
  type PlanEntryStatus,
} from "@/components/ai-elements/plan";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import * as VisuallyHidden from "@radix-ui/react-visually-hidden";

export type InspectorTab =
  | "context"
  | "plan"
  | "rewind"
  | "mcp"
  | "skills"
  | "hooks"
  | "worktree"
  | "subagents";

/** Global config vs current-session tooling */
export type InspectorScope = "global" | "session";

export const GLOBAL_INSPECTOR_TABS: InspectorTab[] = ["mcp", "skills", "hooks"];
export const SESSION_INSPECTOR_TABS: InspectorTab[] = [
  "context",
  "plan",
  "rewind",
  "subagents",
];

export function isGlobalInspectorTab(tab: InspectorTab): boolean {
  return (GLOBAL_INSPECTOR_TABS as string[]).includes(tab);
}

export function isSessionInspectorTab(tab: InspectorTab): boolean {
  return (SESSION_INSPECTOR_TABS as string[]).includes(tab);
}

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
  /** global = MCP/Skills/Hooks；session = 上下文/Plan/Rewind 等 */
  scope: InspectorScope;
  tab: InspectorTab;
  onTab: (t: InspectorTab) => void;
  onClose: () => void;
  /** Optional label for session drawer header */
  sessionTitle?: string | null;
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
  const { open, scope, tab, onTab, onClose, sessionTitle } = props;
  const { t } = useI18n();
  const [selectedRewind, setSelectedRewind] = useState<number | null>(null);

  const allTabs: { id: InspectorTab; label: string }[] = [
    { id: "context", label: t("inspector.tabContext") },
    { id: "plan", label: t("inspector.tabPlan") },
    { id: "rewind", label: t("inspector.tabRewind") },
    { id: "mcp", label: t("inspector.tabMcp") },
    { id: "skills", label: t("inspector.tabSkills") },
    { id: "hooks", label: t("inspector.tabHooks") },
    { id: "subagents", label: t("inspector.tabSubagents") },
  ];

  const allowed =
    scope === "global" ? GLOBAL_INSPECTOR_TABS : SESSION_INSPECTOR_TABS;
  const TABS = allTabs.filter((x) => allowed.includes(x.id));

  // 切 scope 时若当前 tab 不属于该 scope，回落到首个可用 tab
  useEffect(() => {
    if (!open) return;
    if (!allowed.includes(tab) && TABS[0]) {
      onTab(TABS[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, scope]);

  useEffect(() => {
    if (!open) return;
    if (scope === "session") {
      if (tab === "context") props.onRefreshContext();
      if (tab === "rewind") props.onRefreshRewind();
    } else if (tab === "mcp") {
      props.onRefreshMcp();
    }
    // skills/hooks：打开侧栏时由 App 预取；此处不重复
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tab, scope]);

  const title =
    scope === "global"
      ? t("inspector.titleGlobal")
      : sessionTitle
        ? t("inspector.titleSessionNamed", { title: sessionTitle })
        : t("inspector.titleSession");

  const usage = props.context?.contextWindowUsage;
  const used = props.context?.contextTokensUsed;
  const total = props.context?.contextWindowTokens;
  const pct =
    typeof usage === "number"
      ? Math.round(usage * (usage <= 1 ? 100 : 1))
      : used && total
        ? Math.round((used / total) * 100)
        : null;

  const activeTab = allowed.includes(tab) ? tab : (TABS[0]?.id || "context");

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className={cn(
          "fixed inset-y-0 right-0 left-auto top-0 flex h-full max-h-none w-[min(420px,100vw)] max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-l p-0 shadow-2xl sm:max-w-[420px]",
          "data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right",
        )}
        showClose
        aria-describedby={undefined}
      >
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="border-b border-border px-4 py-3 pr-12">
            <VisuallyHidden.Root>
              <DialogTitle>{title}</DialogTitle>
            </VisuallyHidden.Root>
            <h3 className="inspector-title-one-line text-[14px] font-semibold" title={title}>
              {title}
            </h3>
            <span className="inspector-scope-tag mt-1 inline-block">
              {scope === "global"
                ? t("inspector.scopeGlobal")
                : t("inspector.scopeSession")}
            </span>
          </div>

          <Tabs
            value={activeTab}
            onValueChange={(v) => onTab(v as InspectorTab)}
            className="flex min-h-0 flex-1 flex-col"
          >
            <TabsList className="h-auto shrink-0 justify-start rounded-none px-2 py-1.5">
              {TABS.map((tabItem) => (
                <TabsTrigger key={tabItem.id} value={tabItem.id}>
                  {tabItem.label}
                </TabsTrigger>
              ))}
            </TabsList>

            <ScrollArea className="min-h-0 flex-1">
              <div className="px-4 py-3 pb-6">
          <TabsContent value="context" className="mt-0">
            <div className="insp-section">
              <div className="insp-actions">
                <Button type="button" size="sm" variant="secondary" onClick={props.onRefreshContext}>
                  {t("common.refresh")}
                </Button>
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
          </TabsContent>

          <TabsContent value="plan" className="mt-0">
            <div className="insp-section insp-plan-section">
              <div
                className={`insp-plan-mode-card ${props.planMode ? "on" : ""}`}
              >
                <div className="insp-plan-mode-head">
                  <span className="insp-plan-mode-mark" aria-hidden>
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                      <path
                        d="M3.5 4h9M3.5 8h9M3.5 12h5.5"
                        stroke="currentColor"
                        strokeWidth="1.35"
                        strokeLinecap="round"
                      />
                      <path
                        d="M11 10.5v3M9.5 12h3"
                        stroke="currentColor"
                        strokeWidth="1.35"
                        strokeLinecap="round"
                      />
                    </svg>
                  </span>
                  <div className="insp-plan-mode-copy">
                    <strong>{t("inspector.planModeLabel")}</strong>
                    <p>{t("inspector.planModeHint")}</p>
                  </div>
                  <Switch
                    checked={props.planMode}
                    onCheckedChange={(v) => props.onTogglePlan(v)}
                    aria-label={
                      props.planMode
                        ? t("app.planOnTitle")
                        : t("app.planOffTitle")
                    }
                  />
                </div>
              </div>

              <div className="insp-plan-list-head">
                <span>{t("inspector.tabPlan")}</span>
                {props.planMode ? (
                  <span className="insp-plan-live-tag">{t("app.planActive")}</span>
                ) : null}
              </div>

              {props.planText ? (
                <PlanInspectorBody text={props.planText} />
              ) : (
                <p className="muted insp-plan-empty">{t("inspector.noPlan")}</p>
              )}
              <Button type="button" size="sm" variant="secondary" onClick={props.onFork}>
                {t("inspector.forkSession")}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="rewind" className="mt-0">
            <div className="insp-section">
              <div className="insp-actions">
                <Button type="button" size="sm" variant="secondary" onClick={props.onRefreshRewind}>
                  {t("inspector.refreshRewind")}
                </Button>
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
          </TabsContent>

          <TabsContent value="mcp" className="mt-0">
            <div className="insp-section">
              <div className="insp-actions">
                <Button type="button" size="sm" variant="secondary" onClick={props.onRefreshMcp}>
                  {t("inspector.refreshMcp")}
                </Button>
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
          </TabsContent>

          <TabsContent value="skills" className="mt-0">
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
          </TabsContent>

          <TabsContent value="hooks" className="mt-0">
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
          </TabsContent>

          <TabsContent value="subagents" className="mt-0">
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
          </TabsContent>
              </div>
            </ScrollArea>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PlanInspectorBody({ text }: { text: string }) {
  const entries = useMemo(() => parsePlanEntries(text), [text]);
  if (!entries.length) {
    return <pre className="insp-pre insp-plan-pre">{text}</pre>;
  }
  return (
    <ol className="insp-plan-entries">
      {entries.map((e, i) => (
        <li
          key={`${i}-${e.text.slice(0, 20)}`}
          className={`insp-plan-entry insp-plan-entry--${e.status as PlanEntryStatus}`}
        >
          <span className="insp-plan-entry-mark" aria-hidden>
            {e.status === "done" ? "✓" : e.status === "active" ? "…" : "○"}
          </span>
          <span className="insp-plan-entry-text">{e.text}</span>
        </li>
      ))}
    </ol>
  );
}
