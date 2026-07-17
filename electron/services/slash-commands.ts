/**
 * Full slash-command catalog from Grok Build TUI docs (04-slash-commands.md).
 * Categories:
 * - client: handled entirely in the desktop app
 * - acp: mapped to ACP / x.ai extension methods when possible
 * - prompt: sent as a session prompt (agent/skill style)
 * - hybrid: UI action + optional agent call
 */

export type SlashKind = "client" | "acp" | "prompt" | "hybrid";

export interface SlashCommandDef {
  name: string;
  aliases?: string[];
  description: string;
  argumentHint?: string;
  category:
    | "session"
    | "model"
    | "memory"
    | "extensions"
    | "media"
    | "schedule"
    | "agents"
    | "account"
    | "config"
    | "other"
    | "skill";
  kind: SlashKind;
  /** When true, requires trailing args */
  argsRequired?: boolean;
  /** Feature flag note shown in UI */
  note?: string;
}

export const SLASH_COMMANDS: SlashCommandDef[] = [
  // Session Management
  {
    name: "new",
    aliases: ["clear"],
    description: "开始新会话，清空当前对话",
    category: "session",
    kind: "client",
  },
  {
    name: "resume",
    description: "打开会话选择器，加载历史会话",
    category: "session",
    kind: "client",
  },
  {
    name: "compact",
    description: "压缩会话历史以节省上下文",
    argumentHint: "[context]",
    category: "session",
    kind: "acp",
  },
  {
    name: "context",
    description: "显示上下文窗口使用情况与会话统计",
    category: "session",
    kind: "hybrid",
  },
  {
    name: "session-info",
    description: "显示会话详情（模型、轮次、上下文）",
    category: "session",
    kind: "client",
  },
  {
    name: "fork",
    description: "从当前点分叉新会话",
    argumentHint: "[--worktree|--no-worktree] [directive]",
    category: "session",
    kind: "acp",
  },
  {
    name: "rewind",
    description: "回退到更早的对话轮次并恢复文件快照",
    category: "session",
    kind: "acp",
  },
  {
    name: "copy",
    description: "复制最近一条回复到剪贴板",
    argumentHint: "[n]",
    category: "session",
    kind: "client",
  },
  {
    name: "export",
    description: "导出当前对话到文件或剪贴板",
    category: "session",
    kind: "client",
  },
  {
    name: "quit",
    aliases: ["exit"],
    description: "退出应用",
    category: "session",
    kind: "client",
  },
  {
    name: "home",
    aliases: ["welcome"],
    description: "退出当前会话，返回欢迎页",
    category: "session",
    kind: "client",
  },
  {
    name: "rename",
    aliases: ["title"],
    description: "重命名当前会话",
    argumentHint: "<title>",
    argsRequired: true,
    category: "session",
    kind: "client",
  },
  {
    name: "dashboard",
    aliases: ["sessions"],
    description: "打开活跃会话面板（切换/重命名/关闭）",
    category: "session",
    kind: "client",
  },

  // Model and Mode
  {
    name: "model",
    aliases: ["m"],
    description: "切换模型（可选 effort）",
    argumentHint: "<name> [effort]",
    category: "model",
    kind: "hybrid",
  },
  {
    name: "effort",
    description: "设置当前模型的推理力度",
    argumentHint: "<low|medium|high|xhigh>",
    argsRequired: true,
    category: "model",
    kind: "hybrid",
  },
  {
    name: "always-approve",
    description: "切换始终批准工具执行",
    category: "model",
    kind: "client",
  },
  {
    name: "auto",
    description: "切换自动权限模式（安全工具自动批准）",
    category: "model",
    kind: "client",
  },
  {
    name: "multiline",
    aliases: ["ml"],
    description: "切换多行输入模式",
    category: "model",
    kind: "client",
  },
  {
    name: "history",
    description: "搜索本会话历史提示词",
    category: "model",
    kind: "client",
  },
  {
    name: "compact-mode",
    description: "切换紧凑显示模式",
    category: "model",
    kind: "client",
  },
  {
    name: "vim-mode",
    description: "切换 vim 风格滚动快捷键",
    category: "model",
    kind: "client",
  },
  {
    name: "minimal",
    description: "切换到 minimal 渲染模式（桌面端映射为简洁布局）",
    category: "model",
    kind: "client",
  },
  {
    name: "fullscreen",
    aliases: ["full"],
    description: "切换到全屏聊天布局",
    category: "model",
    kind: "client",
  },
  {
    name: "plan",
    description: "进入计划模式",
    argumentHint: "[description]",
    category: "model",
    kind: "prompt",
  },
  {
    name: "view-plan",
    aliases: ["show-plan", "plan-view"],
    description: "查看当前保存的计划",
    category: "model",
    kind: "prompt",
  },

  // Memory
  {
    name: "memory",
    aliases: ["mem"],
    description: "浏览/管理记忆（需 experimental memory）",
    argumentHint: "[on|off]",
    category: "memory",
    kind: "prompt",
    note: "需要 --experimental-memory 或 GROK_MEMORY=1",
  },
  {
    name: "flush",
    description: "立即将当前会话知识写入记忆",
    category: "memory",
    kind: "prompt",
    note: "需要 experimental memory",
  },
  {
    name: "dream",
    description: "运行记忆整合",
    category: "memory",
    kind: "prompt",
    note: "需要 experimental memory",
  },
  {
    name: "remember",
    description: "立即保存一条笔记到记忆",
    argumentHint: "<note>",
    argsRequired: true,
    category: "memory",
    kind: "prompt",
  },

  // Hooks and Plugins
  {
    name: "hooks",
    description: "打开 Hooks 管理",
    category: "extensions",
    kind: "client",
  },
  {
    name: "plugins",
    description: "打开 Plugins 管理",
    category: "extensions",
    kind: "client",
  },
  {
    name: "marketplace",
    description: "打开插件市场",
    category: "extensions",
    kind: "client",
  },
  {
    name: "skills",
    description: "查看已安装 Skills",
    category: "extensions",
    kind: "client",
  },

  // Media
  {
    name: "imagine",
    description: "根据文字描述生成图片",
    argumentHint: "<description>",
    argsRequired: true,
    category: "media",
    kind: "prompt",
  },
  {
    name: "imagine-video",
    description: "生成视频",
    argumentHint: "<description>",
    argsRequired: true,
    category: "media",
    kind: "prompt",
  },

  // Scheduling
  {
    name: "loop",
    description: "按间隔循环执行提示",
    argumentHint: "[interval] <prompt>",
    argsRequired: true,
    category: "schedule",
    kind: "prompt",
  },

  // Other
  {
    name: "goal",
    description: "设置/管理自主目标",
    argumentHint: "<objective|status|pause|resume|clear>",
    category: "other",
    kind: "prompt",
  },
  {
    name: "theme",
    aliases: ["t"],
    description: "切换主题",
    category: "config",
    kind: "client",
  },
  {
    name: "feedback",
    description: "发送反馈",
    argumentHint: "[message]",
    category: "other",
    kind: "prompt",
  },
  {
    name: "btw",
    description: "旁路补充，不打断当前任务",
    argumentHint: "<message>",
    argsRequired: true,
    category: "other",
    kind: "prompt",
  },
  {
    name: "mcps",
    description: "打开 MCP 服务器管理",
    category: "extensions",
    kind: "client",
  },
  {
    name: "terminal-setup",
    aliases: ["terminal-check", "terminal-info"],
    description: "终端能力检测与设置说明",
    category: "config",
    kind: "client",
  },
  {
    name: "release-notes",
    aliases: ["changelog"],
    description: "查看版本更新说明",
    category: "other",
    kind: "client",
  },
  {
    name: "docs",
    aliases: ["howto", "guides"],
    description: "打开文档/指南",
    argumentHint: "[web|title]",
    category: "other",
    kind: "client",
  },
  {
    name: "import-claude",
    description: "从 Claude 设置导入配置",
    category: "config",
    kind: "prompt",
  },

  // Agents
  {
    name: "config-agents",
    aliases: ["agents"],
    description: "管理 Agent 定义",
    category: "agents",
    kind: "client",
  },
  {
    name: "personas",
    description: "管理 Personas",
    category: "agents",
    kind: "client",
  },

  // Account
  {
    name: "login",
    description: "登录 / 重新认证",
    category: "account",
    kind: "client",
  },
  {
    name: "logout",
    description: "退出登录",
    category: "account",
    kind: "client",
  },
  {
    name: "usage",
    description: "查看用量 / 账单",
    category: "account",
    kind: "prompt",
  },
  {
    name: "privacy",
    description: "隐私与数据保留状态",
    category: "account",
    kind: "prompt",
  },

  // Config UI
  {
    name: "settings",
    aliases: ["config", "preferences", "prefs"],
    description: "打开设置",
    category: "config",
    kind: "client",
  },
  {
    name: "timestamps",
    description: "切换消息时间戳显示",
    category: "config",
    kind: "client",
  },
];

export function parseSlashInput(input: string): {
  isSlash: boolean;
  name: string;
  args: string;
  raw: string;
} {
  const raw = input.trim();
  if (!raw.startsWith("/")) {
    return { isSlash: false, name: "", args: "", raw };
  }
  const body = raw.slice(1);
  const space = body.search(/\s/);
  if (space === -1) {
    return { isSlash: true, name: body.toLowerCase(), args: "", raw };
  }
  return {
    isSlash: true,
    name: body.slice(0, space).toLowerCase(),
    args: body.slice(space + 1).trim(),
    raw,
  };
}

export function resolveSlashCommand(
  name: string,
): SlashCommandDef | undefined {
  const key = name.toLowerCase();
  return SLASH_COMMANDS.find(
    (cmd) =>
      cmd.name === key ||
      (cmd.aliases || []).some((a) => a.toLowerCase() === key),
  );
}

export function filterSlashCommands(query: string): SlashCommandDef[] {
  const q = query.replace(/^\//, "").toLowerCase();
  if (!q) return SLASH_COMMANDS;
  return SLASH_COMMANDS.filter((cmd) => {
    const hay = [cmd.name, ...(cmd.aliases || []), cmd.description]
      .join(" ")
      .toLowerCase();
    return hay.includes(q) || cmd.name.startsWith(q);
  }).sort((a, b) => {
    const as = a.name.startsWith(q) ? 0 : 1;
    const bs = b.name.startsWith(q) ? 0 : 1;
    if (as !== bs) return as - bs;
    return a.name.localeCompare(b.name);
  });
}
