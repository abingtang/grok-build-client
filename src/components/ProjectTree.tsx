import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { useI18n, type TranslateFn } from "../i18n";
import type { ProjectInfo, SessionSummary } from "../lib/types";

interface Props {
  projects: ProjectInfo[];
  sessionsByProject: Record<string, SessionSummary[]>;
  expanded: Set<string>;
  activeProjectPath: string | null;
  activeSessionId: string | null;
  loadingPath?: string | null;
  loadingSessionId?: string | null;
  searchQuery: string;
  searchResults: SessionSummary[] | null;
  searchLoading?: boolean;
  onSearchQueryChange: (q: string) => void;
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
  onOpenInspector?: () => void;
  onOpenSettings?: () => void;
}

function FolderIcon({ open }: { open: boolean }) {
  return (
    <span className={`tree-icon folder ${open ? "open" : ""}`} aria-hidden>
      {open ? (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path
            d="M1.5 4.5A1.5 1.5 0 0 1 3 3h3.2c.3 0 .6.1.8.3L8.2 4.5H13a1.5 1.5 0 0 1 1.5 1.5v6A1.5 1.5 0 0 1 13 13.5H3A1.5 1.5 0 0 1 1.5 12V4.5Z"
            fill="currentColor"
            opacity="0.85"
          />
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path
            d="M1.5 3.5A1.5 1.5 0 0 1 3 2h3.1c.3 0 .6.1.8.3L8.1 3.5H13A1.5 1.5 0 0 1 14.5 5v7A1.5 1.5 0 0 1 13 13.5H3A1.5 1.5 0 0 1 1.5 12V3.5Z"
            stroke="currentColor"
            strokeWidth="1.2"
            fill="none"
          />
        </svg>
      )}
    </span>
  );
}

function SessionIcon() {
  return (
    <span className="tree-icon session" aria-hidden>
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
        <rect
          x="3"
          y="2.5"
          width="10"
          height="11"
          rx="1.5"
          stroke="currentColor"
          strokeWidth="1.2"
        />
        <path
          d="M5.5 6h5M5.5 8.5h5M5.5 11h3"
          stroke="currentColor"
          strokeWidth="1.1"
        />
      </svg>
    </span>
  );
}

function SubagentSessionIcon() {
  return (
    <span className="tree-icon session subagent" aria-hidden>
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
        <circle
          cx="8"
          cy="8"
          r="4.5"
          stroke="currentColor"
          strokeWidth="1.2"
        />
        <path
          d="M6 8h4M8 6v4"
          stroke="currentColor"
          strokeWidth="1.1"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

/** Git-style branch/fork mark for session_kind=fork */
function ForkSessionIcon() {
  return (
    <span className="tree-icon session fork" aria-hidden>
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
        {/* trunk */}
        <path
          d="M5 3.5v6.5"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeLinecap="round"
        />
        {/* branch arc + tip */}
        <path
          d="M5 7.2c0 2 1.6 3.3 4 3.3h0"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeLinecap="round"
        />
        <circle cx="5" cy="3.5" r="1.6" fill="currentColor" />
        <circle cx="5" cy="12" r="1.6" fill="currentColor" />
        <circle cx="11" cy="10.5" r="1.6" fill="currentColor" />
      </svg>
    </span>
  );
}

function sessionRowIcon(s: SessionSummary, nested: boolean, loading: boolean) {
  if (loading) {
    return <span className="tree-mini-spinner" aria-hidden />;
  }
  const kind = String(s.sessionKind || "").toLowerCase();
  if (kind === "fork") return <ForkSessionIcon />;
  if (nested || isSubagentSession(s)) return <SubagentSessionIcon />;
  return <SessionIcon />;
}

function ChevronSessionIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      className={open ? "session-chevron open" : "session-chevron"}
    >
      <path
        d="M6 4l4 4-4 4"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M3.5 4.5h9M6 4.5V3.2c0-.4.3-.7.7-.7h2.6c.4 0 .7.3.7.7v1.3M5.2 4.5l.4 8c0 .5.4.9.9.9h3c.5 0 .9-.4.9-.9l.4-8"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ClearIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M4 4l8 8M12 4l-8 8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="4" cy="8" r="1.2" fill="currentColor" />
      <circle cx="8" cy="8" r="1.2" fill="currentColor" />
      <circle cx="12" cy="8" r="1.2" fill="currentColor" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M8 3v10M3 8h10"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M8.5 2.5 13 7l-1.2 1.2-1.3-.2-.8 3.6-1.1 1.1-2.1-2.1-2.5 2.5-.9-.9 2.5-2.5-2.1-2.1 1.1-1.1 3.6-.8-.2-1.3L8.5 2.5Z"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FinderIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M2.5 4.5A1.5 1.5 0 0 1 4 3h2.6c.3 0 .6.1.8.3L8.6 4.5H12A1.5 1.5 0 0 1 13.5 6v5.5A1.5 1.5 0 0 1 12 13H4a1.5 1.5 0 0 1-1.5-1.5v-7Z"
        stroke="currentColor"
        strokeWidth="1.2"
      />
    </svg>
  );
}

function NewTaskIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M4 3.5h5.5L13 7v5.5A1 1 0 0 1 12 13.5H4A1 1 0 0 1 3 12.5v-8A1 1 0 0 1 4 3.5Z"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path
        d="M9.5 3.5V7H13"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function RemoveIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M4 4l8 8M12 4l-8 8"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M13 8a5 5 0 1 1-1.4-3.4"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <path
        d="M13 3.5V6.5H10"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type MenuKind = "project";

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
              <TrashIcon />
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
  searchQuery,
  searchResults,
  searchLoading,
  onSearchQueryChange,
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
  onOpenInspector,
  onOpenSettings,
}: Props) {
  const { t } = useI18n();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  /** Expanded root sessions that show nested subagents */
  const [expandedSessionIds, setExpandedSessionIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [menu, setMenu] = useState<{
    kind: MenuKind;
    projectPath?: string;
    x: number;
    y: number;
  } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const isSearch = searchQuery.trim().length > 0;

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

  const projectByPath = useMemo(() => {
    const m = new Map<string, ProjectInfo>();
    for (const p of projects) m.set(p.path, p);
    return m;
  }, [projects]);

  const menuProject = menu?.projectPath
    ? projectByPath.get(menu.projectPath) || null
    : null;

  useEffect(() => {
    if (!menu) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t)) return;
      setMenu(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(null);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  function openMenu(
    e: ReactMouseEvent,
    kind: MenuKind,
    projectPath?: string,
  ): void {
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenu({
      kind,
      projectPath,
      x: Math.min(rect.left, window.innerWidth - 220),
      y: rect.bottom + 4,
    });
  }

  return (
    <aside className="sidebar codex-sidebar">
      {/* Codex: 新建任务 */}
      <div className="sidebar-new-wrap titlebar-no-drag">
        <button
          type="button"
          className="sidebar-new-task"
          onClick={onNewChat}
          title={t("tree.newSession")}
        >
          <NewTaskIcon />
          <span>{t("tree.newTask")}</span>
        </button>
      </div>

      <div className="sidebar-search titlebar-no-drag">
        <div className="sidebar-search-field">
          <input
            type="text"
            className="sidebar-search-input"
            placeholder={t("tree.searchSessions")}
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            aria-label={t("tree.searchSessions")}
            autoComplete="off"
            spellCheck={false}
          />
          {searchQuery ? (
            <button
              type="button"
              className="sidebar-search-clear"
              title={t("tree.clear")}
              aria-label={t("tree.clearSearch")}
              onClick={() => onSearchQueryChange("")}
            >
              <ClearIcon />
            </button>
          ) : null}
        </div>
      </div>

      {/* 项目 | 打开项目 · 刷新列表 */}
      <div className="section-head titlebar-no-drag">
        <span className="section-head-label">
          {isSearch ? (searchLoading ? t("tree.searching") : t("tree.searchLabel")) : t("tree.projects")}
        </span>
        {!isSearch ? (
          <span className="section-head-actions">
            <button
              type="button"
              className="icon-btn"
              title={t("tree.openProject")}
              aria-label={t("tree.openProject")}
              onClick={onOpenFolder}
            >
              <PlusIcon />
            </button>
            <button
              type="button"
              className="icon-btn"
              title={t("tree.refreshList")}
              aria-label={t("tree.refreshList")}
              onClick={onRefresh}
            >
              <RefreshIcon />
            </button>
          </span>
        ) : null}
      </div>

      <div className="project-tree">
        {isSearch ? (
          searchLoading && (!searchResults || searchResults.length === 0) ? (
            <div className="empty-hint">{t("tree.searchingHint")}</div>
          ) : !searchResults || searchResults.length === 0 ? (
            <div className="empty-hint">{t("tree.noMatch")}</div>
          ) : (
            searchResults.map((s) => {
              const proj =
                projectByPath.get(s.cwd) ||
                ({
                  path: s.cwd,
                  name: projectNameForSession(s, projects),
                } as ProjectInfo);
              const active = activeSessionId === s.id;
              const loading = loadingSessionId === s.id;
              const confirming = confirmId === s.id;
              return (
                <div
                  key={s.id}
                  className={`tree-row session-row search-hit ${active ? "active" : ""} ${loading ? "loading" : ""}`}
                >
                  <button
                    type="button"
                    className="session-row-main"
                    title={s.summary || s.id}
                    disabled={!!loadingSessionId}
                    onClick={() => onSelectSession(proj, s)}
                  >
                    {loading ? (
                      <span className="tree-mini-spinner" aria-hidden />
                    ) : (
                      <SessionIcon />
                    )}
                    <span className="tree-label-stack">
                      <span className="tree-label">
                        {s.title || s.id.slice(0, 8)}
                      </span>
                      <span className="tree-sub">
                        {projectNameForSession(s, projects) || s.cwd || "—"}
                      </span>
                    </span>
                  </button>
                  {confirming ? (
                    <span className="session-del-confirm">
                      <button
                        type="button"
                        className="btn btn-sm btn-danger"
                        onClick={() => {
                          setConfirmId(null);
                          onDeleteSession(proj, s);
                        }}
                      >
                        {t("common.confirm")}
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => setConfirmId(null)}
                      >
                        {t("common.cancel")}
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="session-del-btn"
                      title={t("tree.deleteSession")}
                      aria-label={t("tree.deleteSession")}
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmId(s.id);
                      }}
                    >
                      <TrashIcon />
                    </button>
                  )}
                </div>
              );
            })
          )
        ) : projects.length === 0 ? (
          <div className="empty-hint">
            {t("tree.noProjects")}
          </div>
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
                        <PinIcon />
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
                      <button
                        type="button"
                        className="icon-btn project-more"
                        title={t("tree.projectActions")}
                        aria-label={t("tree.projectActions")}
                        onClick={(e) => openMenu(e, "project", p.path)}
                      >
                        <MoreIcon />
                      </button>
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
                        <PlusIcon />
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
          className="btn btn-sm sidebar-footer-btn"
          onClick={() => onOpenInspector?.()}
          title={t("tree.inspectorTitle")}
        >
          {t("tree.inspector")}
        </button>
        <button
          type="button"
          className="btn btn-sm sidebar-footer-btn"
          onClick={() => onOpenSettings?.()}
          title={t("tree.settings")}
        >
          {t("tree.settings")}
        </button>
      </div>

      {menu ? (
        <div
          ref={menuRef}
          className="sidebar-context-menu"
          style={{ left: menu.x, top: menu.y }}
          role="menu"
        >
          {menu.kind === "project" && menuProject ? (
            <>
              <button
                type="button"
                role="menuitem"
                className="ctx-item"
                onClick={() => {
                  setMenu(null);
                  onPinProject?.(menuProject, !menuProject.pinned);
                }}
              >
                <PinIcon />
                <span>{menuProject.pinned ? t("tree.unpin") : t("tree.pin")}</span>
              </button>
              <button
                type="button"
                role="menuitem"
                className="ctx-item"
                onClick={() => {
                  setMenu(null);
                  onRevealInFinder?.(menuProject);
                }}
              >
                <FinderIcon />
                <span>{t("tree.revealFinder")}</span>
              </button>
              <div className="ctx-sep" />
              <button
                type="button"
                role="menuitem"
                className="ctx-item danger"
                onClick={() => {
                  setMenu(null);
                  onRemoveProject?.(menuProject);
                }}
              >
                <RemoveIcon />
                <span>{t("tree.remove")}</span>
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </aside>
  );
}
