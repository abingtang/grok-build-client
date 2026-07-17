import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
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

type SessionTreeNode = {
  session: SessionSummary;
  children: SessionSummary[];
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

/** Nest subagent/fork sessions under parent; only roots appear at top level. */
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

  const sortByUpdated = (a: SessionSummary, b: SessionSummary) =>
    (b.updatedAt || "").localeCompare(a.updatedAt || "");

  roots.sort(sortByUpdated);
  for (const kids of childrenMap.values()) kids.sort(sortByUpdated);

  return roots.map((session) => ({
    session,
    children: childrenMap.get(session.id) || [],
  }));
}

function isSubagentSession(s: SessionSummary): boolean {
  const kind = String(s.sessionKind || "").toLowerCase();
  return kind === "subagent" || kind === "fork" || !!s.parentSessionId;
}

export function ProjectTree({
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

  // 当前选中的是子会话时，自动展开其根会话
  useEffect(() => {
    if (!activeSessionId) return;
    for (const list of Object.values(sessionsByProject)) {
      const hit = list.find((s) => s.id === activeSessionId);
      if (hit?.parentSessionId) {
        setExpandedSessionIds((prev) => {
          if (prev.has(hit.parentSessionId!)) return prev;
          const next = new Set(prev);
          next.add(hit.parentSessionId!);
          return next;
        });
        break;
      }
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
          title="新建会话"
        >
          <NewTaskIcon />
          <span>新建任务</span>
        </button>
      </div>

      <div className="sidebar-search titlebar-no-drag">
        <div className="sidebar-search-field">
          <input
            type="text"
            className="sidebar-search-input"
            placeholder="搜索会话…"
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            aria-label="搜索会话"
            autoComplete="off"
            spellCheck={false}
          />
          {searchQuery ? (
            <button
              type="button"
              className="sidebar-search-clear"
              title="清除"
              aria-label="清除搜索"
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
          {isSearch ? `搜索${searchLoading ? "…" : ""}` : "项目"}
        </span>
        {!isSearch ? (
          <span className="section-head-actions">
            <button
              type="button"
              className="icon-btn"
              title="打开项目"
              aria-label="打开项目"
              onClick={onOpenFolder}
            >
              <PlusIcon />
            </button>
            <button
              type="button"
              className="icon-btn"
              title="刷新列表"
              aria-label="刷新列表"
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
            <div className="empty-hint">搜索中…</div>
          ) : !searchResults || searchResults.length === 0 ? (
            <div className="empty-hint">无匹配会话</div>
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
                        确认
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => setConfirmId(null)}
                      >
                        取消
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="session-del-btn"
                      title="删除会话"
                      aria-label="删除会话"
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
            暂无项目。点击上方 <strong>+</strong> 打开目录。
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
                      <span className="tree-pin-mark" title="已置顶">
                        <PinIcon />
                      </span>
                    ) : null}
                    {typeof p.sessionCount === "number" &&
                    p.sessionCount > 0 ? (
                      <span className="tree-count">{p.sessionCount}</span>
                    ) : null}
                  </button>
                  <span className="project-row-actions">
                    <button
                      type="button"
                      className="icon-btn project-more"
                      title="项目操作"
                      aria-label="项目操作"
                      onClick={(e) => openMenu(e, "project", p.path)}
                    >
                      <MoreIcon />
                    </button>
                    <button
                      type="button"
                      className="icon-btn project-new-session"
                      title="在此项目下新建会话"
                      aria-label="在此项目下新建会话"
                      onClick={(e) => {
                        e.stopPropagation();
                        onNewChatInProject?.(p);
                      }}
                    >
                      <PlusIcon />
                    </button>
                  </span>
                </div>

                {isOpen ? (
                  <div className="tree-children">
                    {isLoading ? (
                      <div className="tree-row muted">
                        <span className="tree-mini-spinner" aria-hidden />
                        加载会话…
                      </div>
                    ) : sessions.length === 0 ? (
                      <div className="tree-row muted">暂无会话</div>
                    ) : (
                      buildSessionTree(sessions).map((node) => {
                        const s = node.session;
                        const kids = node.children;
                        const hasKids = kids.length > 0;
                        const kidsOpen = expandedSessionIds.has(s.id);
                        const active = activeSessionId === s.id;
                        const loading = loadingSessionId === s.id;
                        const confirming = confirmId === s.id;
                        const childActive = kids.some(
                          (c) => c.id === activeSessionId,
                        );

                        return (
                          <div key={s.id} className="session-tree-node">
                            <div
                              className={`tree-row session-row ${active ? "active" : ""} ${loading ? "loading" : ""} ${childActive && !active ? "has-active-child" : ""}`}
                            >
                              {hasKids ? (
                                <button
                                  type="button"
                                  className={`session-expand-btn ${kidsOpen ? "open" : ""}`}
                                  title={kidsOpen ? "收起子会话" : "展开子会话"}
                                  aria-label={
                                    kidsOpen ? "收起子会话" : "展开子会话"
                                  }
                                  aria-expanded={kidsOpen}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleSessionExpand(s.id);
                                  }}
                                >
                                  <ChevronSessionIcon open={kidsOpen} />
                                </button>
                              ) : (
                                <span className="session-expand-spacer" />
                              )}
                              <button
                                type="button"
                                className="session-row-main"
                                title={s.summary || s.id}
                                disabled={!!loadingSessionId}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onSelectSession(p, s);
                                }}
                              >
                                {loading ? (
                                  <span
                                    className="tree-mini-spinner"
                                    aria-hidden
                                  />
                                ) : (
                                  <SessionIcon />
                                )}
                                <span className="tree-label">
                                  {s.title || s.id.slice(0, 8)}
                                </span>
                                {hasKids ? (
                                  <span
                                    className="tree-count session-child-count"
                                    title={`${kids.length} 个子会话`}
                                  >
                                    {kids.length}
                                  </span>
                                ) : null}
                                {active && !loading ? (
                                  <span
                                    className="tree-active-dot"
                                    aria-hidden
                                  />
                                ) : null}
                              </button>
                              {confirming ? (
                                <span className="session-del-confirm">
                                  <button
                                    type="button"
                                    className="btn btn-sm btn-danger"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setConfirmId(null);
                                      onDeleteSession(p, s);
                                    }}
                                  >
                                    确认
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setConfirmId(null);
                                    }}
                                  >
                                    取消
                                  </button>
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  className="session-del-btn"
                                  title="删除会话"
                                  aria-label="删除会话"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setConfirmId(s.id);
                                  }}
                                >
                                  <TrashIcon />
                                </button>
                              )}
                            </div>

                            {hasKids && kidsOpen ? (
                              <div className="session-children">
                                {kids.map((c) => {
                                  const cActive = activeSessionId === c.id;
                                  const cLoading = loadingSessionId === c.id;
                                  const cConfirm = confirmId === c.id;
                                  return (
                                    <div
                                      key={c.id}
                                      className={`tree-row session-row session-row-child ${cActive ? "active" : ""} ${cLoading ? "loading" : ""}`}
                                    >
                                      <button
                                        type="button"
                                        className="session-row-main"
                                        title={
                                          [
                                            c.agentName,
                                            c.sessionKind,
                                            c.summary || c.id,
                                          ]
                                            .filter(Boolean)
                                            .join(" · ")
                                        }
                                        disabled={!!loadingSessionId}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          onSelectSession(p, c);
                                        }}
                                      >
                                        {cLoading ? (
                                          <span
                                            className="tree-mini-spinner"
                                            aria-hidden
                                          />
                                        ) : (
                                          <SubagentSessionIcon />
                                        )}
                                        <span className="tree-label">
                                          {c.agentName &&
                                          c.agentName !== "grok-build-plan"
                                            ? `${c.agentName} · `
                                            : isSubagentSession(c)
                                              ? "子会话 · "
                                              : ""}
                                          {c.title || c.id.slice(0, 8)}
                                        </span>
                                        {cActive && !cLoading ? (
                                          <span
                                            className="tree-active-dot"
                                            aria-hidden
                                          />
                                        ) : null}
                                      </button>
                                      {cConfirm ? (
                                        <span className="session-del-confirm">
                                          <button
                                            type="button"
                                            className="btn btn-sm btn-danger"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setConfirmId(null);
                                              onDeleteSession(p, c);
                                            }}
                                          >
                                            确认
                                          </button>
                                          <button
                                            type="button"
                                            className="btn btn-sm"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setConfirmId(null);
                                            }}
                                          >
                                            取消
                                          </button>
                                        </span>
                                      ) : (
                                        <button
                                          type="button"
                                          className="session-del-btn"
                                          title="删除子会话"
                                          aria-label="删除子会话"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setConfirmId(c.id);
                                          }}
                                        >
                                          <TrashIcon />
                                        </button>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            ) : null}
                          </div>
                        );
                      })
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
          title="能力检查器 ⌘I"
        >
          检查器
        </button>
        <button
          type="button"
          className="btn btn-sm sidebar-footer-btn"
          onClick={() => onOpenSettings?.()}
          title="设置"
        >
          设置
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
                <span>{menuProject.pinned ? "取消置顶" : "置顶项目"}</span>
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
                <span>在 Finder 中显示</span>
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
                <span>移除</span>
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </aside>
  );
}
