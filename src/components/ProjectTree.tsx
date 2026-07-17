import {
  useEffect,
  useMemo,
  useState,
} from "react";
import { useI18n, type TranslateFn } from "../i18n";
import type { ProjectInfo, SessionSummary } from "../lib/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ArchiveIcon,
  ChevronRightIcon,
  ComponentInstanceIcon,
  Cross2Icon,
  DotsHorizontalIcon,
  DrawingPinFilledIcon,
  DrawingPinIcon,
  ExternalLinkIcon,
  FilePlusIcon,
  FileTextIcon,
  GearIcon,
  LinkBreak2Icon,
  MagicWandIcon,
  MixerHorizontalIcon,
  MoonIcon,
  PlusIcon,
  Share1Icon,
  SunIcon,
  TrashIcon,
  UpdateIcon,
  MagnifyingGlassIcon,
} from "@radix-ui/react-icons";

interface Props {
  projects: ProjectInfo[];
  sessionsByProject: Record<string, SessionSummary[]>;
  expanded: Set<string>;
  activeProjectPath: string | null;
  activeSessionId: string | null;
  loadingPath?: string | null;
  loadingSessionId?: string | null;
  onToggleProject: (project: ProjectInfo) => void;
  onSelectSession: (project: ProjectInfo, session: SessionSummary) => void;
  onDeleteSession: (project: ProjectInfo | null, session: SessionSummary) => void;
  onOpenFolder: () => void;
  onRefresh: () => void;
  onNewChat: () => void;
  /** 在指定项目下进入草稿新会话（发送后才真正创建） */
  onNewChatInProject?: (project: ProjectInfo) => void;
  onPinProject?: (project: ProjectInfo, pinned: boolean) => void;
  onRemoveProject?: (project: ProjectInfo) => void;
  onRevealInFinder?: (project: ProjectInfo) => void;
  /** Open full-page global config (MCP / Skills / Hooks) */
  onOpenGlobalPage?: (tab: "mcp" | "skills" | "hooks") => void;
  /** Open command palette (session search lives there) */
  onOpenSearch?: () => void;
  /** Open session-scoped inspector for a session */
  onOpenSessionInspector?: (
    project: ProjectInfo,
    session: SessionSummary,
    tab?: "context" | "plan" | "rewind" | "subagents",
  ) => void;
  onOpenSettings?: () => void;
  /** true = light theme */
  themeLight?: boolean;
  onToggleTheme?: () => void;
}

function FolderIcon({ open }: { open: boolean }) {
  return (
    <span className={`tree-icon folder ${open ? "open" : ""}`} aria-hidden>
      <ArchiveIcon width={14} height={14} />
    </span>
  );
}

function sessionRowIcon(s: SessionSummary, nested: boolean, loading: boolean) {
  if (loading) {
    return <span className="tree-mini-spinner" aria-hidden />;
  }
  const kind = String(s.sessionKind || "").toLowerCase();
  if (kind === "fork") {
    return (
      <span className="tree-icon session fork" aria-hidden>
        <Share1Icon width={12} height={12} />
      </span>
    );
  }
  if (nested || isSubagentSession(s)) {
    return (
      <span className="tree-icon session subagent" aria-hidden>
        <ComponentInstanceIcon width={12} height={12} />
      </span>
    );
  }
  return (
    <span className="tree-icon session" aria-hidden>
      <FileTextIcon width={12} height={12} />
    </span>
  );
}

function ChevronSessionIcon({ open }: { open: boolean }) {
  return (
    <ChevronRightIcon
      width={12}
      height={12}
      aria-hidden
      className={open ? "session-chevron open" : "session-chevron"}
    />
  );
}

function GlobalMcpIcon() {
  return (
    <span className="sidebar-global-icon" aria-hidden>
      <MixerHorizontalIcon width={14} height={14} />
    </span>
  );
}

function GlobalSkillsIcon() {
  return (
    <span className="sidebar-global-icon" aria-hidden>
      <MagicWandIcon width={14} height={14} />
    </span>
  );
}

function GlobalHooksIcon() {
  return (
    <span className="sidebar-global-icon" aria-hidden>
      <LinkBreak2Icon width={14} height={14} />
    </span>
  );
}

function PinIcon({ filled }: { filled?: boolean }) {
  const Icon = filled ? DrawingPinFilledIcon : DrawingPinIcon;
  return <Icon width={14} height={14} aria-hidden />;
}

/** Recursive: fork → subagent → … all levels nested. */
type SessionTreeNode = {
  session: SessionSummary;
  children: SessionTreeNode[];
};

function projectNameForSession(
  s: SessionSummary,
  projects: ProjectInfo[],
): string {
  const hit = projects.find((p) => p.path === s.cwd);
  if (hit) return hit.name;
  if (s.cwd) {
    const parts = s.cwd.replace(/\\/g, "/").split("/");
    return parts[parts.length - 1] || s.cwd;
  }
  return "";
}

const sortSessionsByUpdated = (a: SessionSummary, b: SessionSummary) =>
  (b.updatedAt || "").localeCompare(a.updatedAt || "");

/**
 * Nest subagent/fork under parent (multi-level).
 * Backend often links subagents → fork → root; one-level UI would drop grandchildren.
 */
function buildSessionTree(sessions: SessionSummary[]): SessionTreeNode[] {
  const byId = new Map(sessions.map((s) => [s.id, s]));
  const childrenMap = new Map<string, SessionSummary[]>();
  const roots: SessionSummary[] = [];

  for (const s of sessions) {
    const parentId = s.parentSessionId;
    if (parentId && byId.has(parentId) && parentId !== s.id) {
      const list = childrenMap.get(parentId) || [];
      list.push(s);
      childrenMap.set(parentId, list);
    } else {
      roots.push(s);
    }
  }

  for (const kids of childrenMap.values()) kids.sort(sortSessionsByUpdated);
  roots.sort(sortSessionsByUpdated);

  const toNode = (
    session: SessionSummary,
    stack: Set<string>,
  ): SessionTreeNode => {
    if (stack.has(session.id)) {
      return { session, children: [] };
    }
    const nextStack = new Set(stack);
    nextStack.add(session.id);
    const kids = childrenMap.get(session.id) || [];
    return {
      session,
      children: kids.map((k) => toNode(k, nextStack)),
    };
  };

  return roots.map((s) => toNode(s, new Set()));
}

/** Whether node or any descendant matches activeSessionId. */
function treeContainsActive(
  node: SessionTreeNode,
  activeId: string | null,
): boolean {
  if (!activeId) return false;
  if (node.session.id === activeId) return true;
  return node.children.some((c) => treeContainsActive(c, activeId));
}

function isSubagentSession(s: SessionSummary): boolean {
  const kind = String(s.sessionKind || "").toLowerCase();
  return kind === "subagent" || kind === "fork" || !!s.parentSessionId;
}

function sessionKindLabel(s: SessionSummary, t: TranslateFn): string {
  const kind = String(s.sessionKind || "").toLowerCase();
  if (kind === "fork") return t("tree.branchPrefix");
  if (s.agentName && s.agentName !== "grok-build-plan") {
    return `${s.agentName} · `;
  }
  if (kind === "subagent" || s.parentSessionId) return t("tree.childPrefix");
  return "";
}

/** Walk parent_session_id chain for expand-on-select. */
function collectAncestorIds(
  sessionId: string,
  sessions: SessionSummary[],
): string[] {
  const byId = new Map(sessions.map((s) => [s.id, s]));
  const out: string[] = [];
  let cur = byId.get(sessionId);
  const seen = new Set<string>();
  while (cur?.parentSessionId && !seen.has(cur.id)) {
    seen.add(cur.id);
    const parentId = cur.parentSessionId;
    if (!byId.has(parentId)) break;
    out.push(parentId);
    cur = byId.get(parentId);
  }
  return out;
}

type SessionTreeBranchProps = {
  node: SessionTreeNode;
  depth: number;
  project: ProjectInfo;
  activeSessionId: string | null;
  loadingSessionId?: string | null;
  confirmId: string | null;
  expandedSessionIds: Set<string>;
  onToggleExpand: (id: string) => void;
  onSelectSession: (project: ProjectInfo, session: SessionSummary) => void;
  onDeleteSession: (project: ProjectInfo | null, session: SessionSummary) => void;
  onConfirmDelete: (id: string | null) => void;
  onOpenSessionInspector?: (
    project: ProjectInfo,
    session: SessionSummary,
  ) => void;
};

function SessionTreeBranch({
  node,
  depth,
  project,
  activeSessionId,
  loadingSessionId,
  confirmId,
  expandedSessionIds,
  onToggleExpand,
  onSelectSession,
  onDeleteSession,
  onConfirmDelete,
  onOpenSessionInspector,
}: SessionTreeBranchProps) {
  const { t } = useI18n();
  const s = node.session;
  const kids = node.children;
  const hasKids = kids.length > 0;
  const kidsOpen = expandedSessionIds.has(s.id);
  const active = activeSessionId === s.id;
  const loading = loadingSessionId === s.id;
  const confirming = confirmId === s.id;
  const childActive = treeContainsActive(node, activeSessionId) && !active;
  const nested = depth > 0;
  const kind = String(s.sessionKind || "").toLowerCase();

  return (
    <div
      className={`session-tree-node${nested ? " session-tree-node-nested" : ""}`}
      style={nested ? undefined : undefined}
    >
      <div
        className={[
          "tree-row",
          "session-row",
          active ? "active" : "",
          loading ? "loading" : "",
          childActive ? "has-active-child" : "",
          hasKids ? "has-children" : "",
          nested ? "session-row-child" : "",
          kind === "fork" ? "session-row-fork" : "",
          kind === "subagent" ? "session-row-subagent" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        style={nested ? { paddingLeft: 0 } : undefined}
      >
        <button
          type="button"
          className="session-row-main"
          title={
            [s.agentName, s.sessionKind, s.summary || s.id]
              .filter(Boolean)
              .join(" · ") || s.id
          }
          disabled={!!loadingSessionId}
          onClick={(e) => {
            e.stopPropagation();
            onSelectSession(project, s);
          }}
        >
          {sessionRowIcon(s, nested, loading)}
          <span className="tree-label">
            {nested || isSubagentSession(s) ? sessionKindLabel(s, t) : null}
            {s.title || s.id.slice(0, 8)}
          </span>
          {active && !loading ? (
            <span className="tree-active-dot" aria-hidden />
          ) : null}
        </button>
        <span className="session-row-trailing">
          {hasKids ? (
            <span
              className="tree-count session-child-count"
              title={t("tree.childrenCount", { n: kids.length })}
            >
              {kids.length}
            </span>
          ) : null}
          {hasKids ? (
            <button
              type="button"
              className={`session-expand-btn ${kidsOpen ? "open" : ""}`}
              title={kidsOpen ? t("tree.collapseChildren") : t("tree.expandChildren")}
              aria-label={kidsOpen ? t("tree.collapseChildren") : t("tree.expandChildren")}
              aria-expanded={kidsOpen}
              onClick={(e) => {
                e.stopPropagation();
                onToggleExpand(s.id);
              }}
            >
              <ChevronSessionIcon open={kidsOpen} />
            </button>
          ) : null}
          {confirming ? (
            <span className="session-del-confirm">
              <button
                type="button"
                className="btn btn-sm btn-danger"
                onClick={(e) => {
                  e.stopPropagation();
                  onConfirmDelete(null);
                  onDeleteSession(project, s);
                }}
              >
                {t("common.confirm")}
              </button>
              <button
                type="button"
                className="btn btn-sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onConfirmDelete(null);
                }}
              >
                {t("common.cancel")}
              </button>
            </span>
          ) : (
            <button
              type="button"
              className="session-del-btn"
              title={nested ? t("tree.deleteChildSession") : t("tree.deleteSession")}
              aria-label={nested ? t("tree.deleteChildSession") : t("tree.deleteSession")}
              onClick={(e) => {
                e.stopPropagation();
                onConfirmDelete(s.id);
              }}
            >
              <TrashIcon width={14} height={14} />
            </button>
          )}
        </span>
      </div>

      {hasKids && kidsOpen ? (
        <div className="session-children" data-depth={depth}>
          {kids.map((child) => (
            <SessionTreeBranch
              key={child.session.id}
              node={child}
              depth={depth + 1}
              project={project}
              activeSessionId={activeSessionId}
              loadingSessionId={loadingSessionId}
              confirmId={confirmId}
              expandedSessionIds={expandedSessionIds}
              onToggleExpand={onToggleExpand}
              onSelectSession={onSelectSession}
              onDeleteSession={onDeleteSession}
              onConfirmDelete={onConfirmDelete}
              onOpenSessionInspector={onOpenSessionInspector}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function ProjectTree({
  // i18n via hook below

  projects,
  sessionsByProject,
  expanded,
  activeProjectPath,
  activeSessionId,
  loadingPath,
  loadingSessionId,
  onToggleProject,
  onSelectSession,
  onDeleteSession,
  onOpenFolder,
  onRefresh,
  onNewChat,
  onNewChatInProject,
  onPinProject,
  onRemoveProject,
  onRevealInFinder,
  onOpenGlobalPage,
  onOpenSearch,
  onOpenSessionInspector,
  onOpenSettings,
  themeLight = false,
  onToggleTheme,
}: Props) {
  const { t } = useI18n();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  /** Expanded root sessions that show nested subagents */
  const [expandedSessionIds, setExpandedSessionIds] = useState<Set<string>>(
    () => new Set(),
  );

  // 选中嵌套会话时，展开整条祖先链（fork → 根）
  useEffect(() => {
    if (!activeSessionId) return;
    for (const list of Object.values(sessionsByProject)) {
      const hit = list.find((s) => s.id === activeSessionId);
      if (!hit) continue;
      const ancestors = collectAncestorIds(activeSessionId, list);
      if (!ancestors.length) break;
      setExpandedSessionIds((prev) => {
        let changed = false;
        const next = new Set(prev);
        for (const id of ancestors) {
          if (!next.has(id)) {
            next.add(id);
            changed = true;
          }
        }
        return changed ? next : prev;
      });
      break;
    }
  }, [activeSessionId, sessionsByProject]);

  function toggleSessionExpand(sessionId: string): void {
    setExpandedSessionIds((prev) => {
      const next = new Set(prev);
      if (next.has(sessionId)) next.delete(sessionId);
      else next.add(sessionId);
      return next;
    });
  }

  return (
    <aside className="sidebar codex-sidebar">
      {/* 顶部导航：新建 + 全局配置，统一行样式 */}
      <nav className="sidebar-global-nav titlebar-no-drag" aria-label={t("tree.globalNav")}>
        <button
          type="button"
          className="sidebar-global-item"
          title={t("tree.newSession")}
          onClick={onNewChat}
        >
          <span className="sidebar-global-icon" aria-hidden>
            <FilePlusIcon width={14} height={14} />
          </span>
          <span>{t("tree.newTask")}</span>
        </button>
        <button
          type="button"
          className="sidebar-global-item"
          title={t("tree.navMcpTitle")}
          onClick={() => onOpenGlobalPage?.("mcp")}
        >
          <GlobalMcpIcon />
          <span>{t("tree.navMcp")}</span>
        </button>
        <button
          type="button"
          className="sidebar-global-item"
          title={t("tree.navSkillsTitle")}
          onClick={() => onOpenGlobalPage?.("skills")}
        >
          <GlobalSkillsIcon />
          <span>{t("tree.navSkills")}</span>
        </button>
        <button
          type="button"
          className="sidebar-global-item"
          title={t("tree.navHooksTitle")}
          onClick={() => onOpenGlobalPage?.("hooks")}
        >
          <GlobalHooksIcon />
          <span>{t("tree.navHooks")}</span>
        </button>
      </nav>

      {/* 项目 | 搜索(⌘K) · 打开 · 刷新 */}
      <div className="section-head titlebar-no-drag">
        <span className="section-head-label">{t("tree.projects")}</span>
        <span className="section-head-actions">
          <button
            type="button"
            className="icon-btn"
            title={`${t("tree.searchSessions")} (⌘K)`}
            aria-label={t("tree.searchSessions")}
            onClick={() => onOpenSearch?.()}
          >
            <MagnifyingGlassIcon width={14} height={14} />
          </button>
          <button
            type="button"
            className="icon-btn"
            title={t("tree.openProject")}
            aria-label={t("tree.openProject")}
            onClick={onOpenFolder}
          >
            <PlusIcon width={14} height={14} />
          </button>
          <button
            type="button"
            className="icon-btn"
            title={t("tree.refreshList")}
            aria-label={t("tree.refreshList")}
            onClick={onRefresh}
          >
            <UpdateIcon width={14} height={14} />
          </button>
        </span>
      </div>

      <div className="project-tree">
        {projects.length === 0 ? (
          <div className="empty-hint">{t("tree.noProjects")}</div>
        ) : (
          projects.map((p) => {
            const isOpen = expanded.has(p.path);
            const isActiveProject = activeProjectPath === p.path;
            const sessions = sessionsByProject[p.path] || [];
            const isLoading = loadingPath === p.path;

            return (
              <div key={p.path} className="tree-group">
                <div
                  className={`tree-row project-row ${isActiveProject && !activeSessionId ? "active" : ""} ${isOpen ? "expanded" : ""} ${p.pinned ? "pinned" : ""}`}
                >
                  <button
                    type="button"
                    className="project-row-main"
                    title={p.path}
                    onClick={() => onToggleProject(p)}
                  >
                    <FolderIcon open={isOpen} />
                    <span className="tree-label">{p.name}</span>
                    {p.pinned ? (
                      <span className="tree-pin-mark" title={t("tree.pinned")}>
                        <PinIcon filled />
                      </span>
                    ) : null}
                  </button>
                  {/* 最右侧：默认会话数；hover 时换成 ··· / + */}
                  <span className="project-row-trailing">
                    {typeof p.sessionCount === "number" &&
                    p.sessionCount > 0 ? (
                      <span className="tree-count" aria-label={t("tree.sessionCount", { n: p.sessionCount })}>
                        {p.sessionCount}
                      </span>
                    ) : (
                      <span className="tree-count tree-count-empty" aria-hidden />
                    )}
                    <span className="project-row-actions">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className="icon-btn project-more"
                            title={t("tree.projectActions")}
                            aria-label={t("tree.projectActions")}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <DotsHorizontalIcon width={14} height={14} />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" sideOffset={4}>
                          <DropdownMenuItem
                            onSelect={() =>
                              onPinProject?.(p, !p.pinned)
                            }
                          >
                            <PinIcon filled={!!p.pinned} />
                            <span>
                              {p.pinned ? t("tree.unpin") : t("tree.pin")}
                            </span>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() => onRevealInFinder?.(p)}
                          >
                            <ExternalLinkIcon width={14} height={14} />
                            <span>{t("tree.revealFinder")}</span>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            destructive
                            onSelect={() => onRemoveProject?.(p)}
                          >
                            <Cross2Icon width={14} height={14} />
                            <span>{t("tree.remove")}</span>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <button
                        type="button"
                        className="icon-btn project-new-session"
                        title={t("tree.newSessionInProject")}
                        aria-label={t("tree.newSessionInProject")}
                        onClick={(e) => {
                          e.stopPropagation();
                          onNewChatInProject?.(p);
                        }}
                      >
                        <PlusIcon width={14} height={14} />
                      </button>
                    </span>
                  </span>
                </div>

                {isOpen ? (
                  <div className="tree-children">
                    {isLoading ? (
                      <div className="tree-row muted">
                        <span className="tree-mini-spinner" aria-hidden />
                        {t("tree.loadingSessions")}
                      </div>
                    ) : sessions.length === 0 ? (
                      <div className="tree-row muted">{t("tree.noSessions")}</div>
                    ) : (
                      buildSessionTree(sessions).map((node) => (
                        <SessionTreeBranch
                          key={node.session.id}
                          node={node}
                          depth={0}
                          project={p}
                          activeSessionId={activeSessionId}
                          loadingSessionId={loadingSessionId}
                          confirmId={confirmId}
                          expandedSessionIds={expandedSessionIds}
                          onToggleExpand={toggleSessionExpand}
                          onSelectSession={onSelectSession}
                          onDeleteSession={onDeleteSession}
                          onConfirmDelete={setConfirmId}
                          onOpenSessionInspector={onOpenSessionInspector}
                        />
                      ))
                    )}
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      <div className="sidebar-footer titlebar-no-drag">
        <button
          type="button"
          className="sidebar-footer-icon-btn"
          onClick={() => onToggleTheme?.()}
          title={
            themeLight ? t("palette.themeDark") : t("palette.themeLight")
          }
          aria-label={
            themeLight ? t("palette.themeDark") : t("palette.themeLight")
          }
          aria-pressed={themeLight}
        >
          {themeLight ? (
            <MoonIcon width={16} height={16} />
          ) : (
            <SunIcon width={16} height={16} />
          )}
        </button>
        <button
          type="button"
          className="sidebar-footer-icon-btn"
          onClick={() => onOpenSettings?.()}
          title={t("tree.settings")}
          aria-label={t("tree.settings")}
        >
          <GearIcon width={16} height={16} />
        </button>
      </div>
    </aside>
  );
}
