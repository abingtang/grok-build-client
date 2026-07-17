# AGENT.md — Grok Build Desktop

面向在本仓库内工作的编码代理(agent)与协作者。先读本文，再改代码。

---

## 项目是什么

**Grok Build Desktop** 是**非官方** macOS 桌面客户端：用 Electron + React 包装本机官方 **Grok Build CLI**（`grok`），提供项目切换、会话树、流式对话、斜杠命令与能力检查器。

- **不**托管模型 API；模型列表来自 `grok models`
- **不**另造第三方工作流 / 自定义 mode；能力对齐官方 CLI + ACP
- 会话数据在 `~/.grok/`；应用本地数据在 `~/.grok-build-desktop/`（如 `projects.json`）
- 与 xAI / Grok **无官方关联**

主运行时：`grok agent stdio`（ACP 长会话）  
兜底：`grok -p … --output-format streaming-json`

---

## 技术栈

| 层 | 技术 |
|----|------|
| 壳 | Electron 35 |
| UI | React 19 + Vite 6 + TypeScript |
| 样式 | Tailwind CSS 4 + `src/styles/app.css`（主题变量）+ `globals.css` |
| 组件底座 | Radix UI + shadcn 风格封装（`src/components/ui/*`） |
| 图标 | **优先** `@radix-ui/react-icons`；业务区可继续用 `lucide-react`（已有依赖） |
| 对话 UI | `@ai-sdk/react` / `ai` + `src/components/ai-elements/*` + Streamdown |
| i18n | `src/i18n`（`zh` / `en`） |
| 主进程 | `electron/`：IPC、ACP client、CLI services |

---

## 架构（必守）

```text
React UI  ──preload (contextBridge: window.grokDesktop)──►  Electron main
                                                              │
                                                              ▼
                                                         本机 grok CLI
                                              (ACP stdio / headless / inspect)
```

1. **渲染进程不得直接 spawn `grok`**，只能通过 `window.grokDesktop`（preload 暴露的 API）。
2. 新增系统能力：先加 **main IPC handler** → **preload 类型与桥接** → 再改 React。
3. 会话目录、配置路径、CLI 参数以官方 CLI 为准；不要发明与 TUI 不兼容的存储格式。
4. 项目侧栏列表来自本地缓存 `~/.grok-build-desktop/projects.json`（用户显式打开/添加），**不要**再把「扫描全部 `~/.grok/sessions` 并合并」当成唯一列表源——删除项目会形同虚设。`sessionCount` 可从 sessions 盘上补齐展示。

---

## 常用命令

```bash
npm install
npm run electron:dev    # 推荐：清理残留 + Vite(5175) + Electron
npm run typecheck       # 三份 tsconfig 全量检查
npm run build
npm run pack:mac        # 打包 Mac 应用目录
```

环境变量：`GROK_BIN`、`GROK_HOME`、`VITE_PORT`、`ELECTRON_OPEN_DEVTOOLS=1`。

改完相关代码后至少跑：`npm run typecheck`。涉及 UI 时本地用 `npm run electron:dev` 手测。

---

## 目录速查

```text
electron/
  main.ts, preload.ts, env.ts
  acp/                 # ACP 协议客户端与类型
  services/            # projects, sessions, grok-cli, headless-run,
                       # mcp-cli, skills-scan, slash-commands, transcript…
src/
  App.tsx              # 布局与全局状态枢纽
  components/
    ui/                # ★ 通用基础组件（优先复用）
    ai-elements/       # 对话消息 / 工具 / Plan / 输入框等
    ProjectTree.tsx, GlobalConfigPage.tsx, InspectorDrawer.tsx,
    SettingsModal.tsx, CommandPalette.tsx, PermissionModal.tsx, …
  hooks/useGrokChat.ts
  i18n/locales/{zh,en}.ts
  lib/                 # types, transport, markdown, streamBuffer, utils(cn)…
  styles/app.css, globals.css
```

`grok-build/` 为上游 CLI 源码参考树，**默认不要改**；本产品只消费本机已安装的 `grok` 二进制。

---

## ★ UI：优先复用已有组件（硬规则）

**后续 UI 工作默认走「找现成 → 组合 → 微调」**，禁止为了单次需求手写一整套按钮、弹层、开关、下拉、滚动区或图标 SVG。

### 选用顺序

1. **`src/components/ui/*`**（shadcn/new-york 风格，基于 Radix）  
   已有：`button`、`dialog`、`dropdown-menu`、`switch`、`select`、`tabs`、`scroll-area`、`tooltip`、`toggle-group`、`collapsible`、`label`、`separator`、`skeleton`、`spinner` 等。  
2. **`src/components/ai-elements/*`** — 对话时间线、消息、工具块、Plan、prompt 输入相关。  
3. **业务组件** — `ProjectTree`、`SettingsModal`、`CommandPalette`、`InspectorDrawer`、`GlobalConfigPage`、`PermissionModal`、`TurnNavigator` 等，先扩展再复制。  
4. **仍不够时**：用已安装的 **Radix 原语** 按现有 `ui/*` 模式封装进 `src/components/ui/`，再被业务引用。  
5. **最后才**写裸 HTML + 一次性 class；且不得引入第二套组件体系。

### 图标

- 导航 / 设置 / 侧栏等 chrome：**`@radix-ui/react-icons`**（与现有 `ProjectTree` 一致）。  
- 不要手写 path 的 SVG 图标（除非极特殊且现有库没有）。  
- `lucide-react` 已在对话区使用，可保留一致性；**新增 chrome 图标优先 Radix Icons**。

### 反模式（避免）

| 不要 | 原因 |
|------|------|
| 手写 `<button>` + 内联样式复刻 Switch/Dialog | 与全局 `button { background: none }` 等规则冲突，难维护 |
| 新做一套 Modal/Drawer 而不用 `ui/dialog` | 焦点陷阱、滚动、a11y 会反复修 |
| 复制粘贴大块 JSX 改三五个字成「新组件」 | 分叉后样式与行为漂移 |
| 为一点差异 fork 整个 `ui/button` | 用 `variant` / `className` / `asChild` |
| 引入 Ant Design / MUI 等第二 UI 库 | 体积与主题双轨 |

### 样式约定

- 组合 class 用 `cn()`（`src/lib/utils.ts`）。  
- 主题色与布局令牌在 `src/styles/app.css`（`--bg-*`、`--text-*`、`--chat-col-*` 等）；亮暗色靠 `data-theme`。  
- **Token 命名（勿再踩坑）**  
  - shadcn / Tailwind：`--accent` = 悬停/高亮底（深色约 `#2a2a2a`），`bg-accent` / `data-[highlighted]:bg-accent`  
  - 品牌实心色：`--brand` + `--accent-ink`（CTA 填充），**禁止**再把品牌色写成 `--accent`，否则 Select/菜单高亮会变成浅条 + 浅字  
  - 语义色定义见 `globals.css`，并在 `app.css` 的 `:root` / `[data-theme=light]` 末尾再保护一遍（因为 app 后于 globals 导入）  
- **CSS 层叠（曾踩坑，必读）**  
  - `app.css` 是**无层(unlayered)** 样式；Tailwind utilities 在 `@layer utilities` 内。无层规则**永远压过** layer 内的 `bg-*` / `border-*`。  
  - **禁止**再写全局 `button { background: none; border: none; opacity: … }`。全局 button 只保留 `cursor`。  
  - 需要强对比的 Radix 控件：在 `globals.css` 用 `ui-*` 类写 plain CSS（见 Switch / Toggle / Tabs / Select trigger）。  
  - 标记类：`ui-button`、`ui-switch`、`ui-toggle-item`、`ui-tabs-trigger`、`ui-select-trigger`、`ui-dialog-close`。  
- **主对话列与 composer 同宽**：共享 `chat-col` / CSS 变量 `--chat-col-min|max|pad-x`，改一处对齐，勿各写一套 max-width。  
- Tailwind 与现有 token 混用时，优先贴近邻近组件，不要新造色板。  
- 下拉/菜单项高亮务必写 `data-[highlighted]:…`（Radix 用 highlighted，不只是 `:focus`）；`globals.css` 另有 `[data-highlighted]` 兜底。

### 文案

- 用户可见字符串进 **`src/i18n/locales/zh.ts` 与 `en.ts`**，禁止只写死中文或只写死英文。  
- 键名与现有命名风格保持一致。

---

## 信息架构（IA）要点

- **全局配置**（MCP / Skills / Hooks 等）：整页 `GlobalConfigPage`，不是会话级抽屉堆叠。  
- **会话检查器**：`InspectorDrawer` 会话范围能力；不要把全局能力塞回抽屉。  
- **会话搜索**：进命令面板 `⌘K`，不要再在侧栏单独造一套重搜索 UI（除非产品明确要求）。  
- **会话树**：支持多级 fork / subagent；子会话挂在父节点下，缩进与展开方向跟现有 `ProjectTree` 一致。  
- **Worktree**：会话详情标题栏侧已弱化/移除相关入口时，勿擅自加回，除非需求明确。

---

## 改代码原则

1. **最小改动**；不做无关重构。  
2. 先定位调用链（preload API → service → UI），再改。  
3. 类型与 IPC 通道名保持同步；`preload` 的 API 形状是渲染层契约。  
4. 不确定 CLI 是否支持某 flag / ACP 方法时：**查本机 `grok --help` / 现有 `electron/services`，不要猜**。  
5. 高风险操作（删会话、改 `~/.grok` 结构、升依赖、改打包配置）先说明再动。  
6. 商标与品牌：开源界面**不要**嵌入可能侵权的 Grok 官方 logo 资源。

---

## 验证清单

- [ ] `npm run typecheck` 通过  
- [ ] UI 改动优先复用了 `ui/*` 或现有业务组件，无新增手搓控件套件  
- [ ] 中英文案都有（若暴露了新字符串）  
- [ ] 深色 / 浅色下控件仍可读（尤其 Switch、Dialog 滚动）  
- [ ] 未让渲染进程直接调 CLI  
- [ ] 项目列表增删仍只写本地 `projects.json` 语义  

---

## 给代理的最短决策树

```text
要改 UI？
  ├─ 已有 ui/* 或业务组件能覆盖？ → 复用 / 加 variant / className
  ├─ Radix 有原语但无封装？ → 按 ui/* 模式封装后再用
  └─ 全新交互？ → 先搜仓库同类实现，再最小新增

要接 CLI / 会话？
  ├─ 已有 electron/services + IPC？ → 扩展现有 handler
  └─ 全新能力？ → main → preload → React，保持会话与 ~/.grok 兼容

拿不准？
  → 读 README.md + 邻近参考文件，再问用户；不要发明工作流
```

---

## 相关文档

- 产品说明与排错：`README.md`  
- shadcn 配置：`components.json`  
- 上游 CLI 参考（勿当本应用业务代码乱改）：`grok-build/`
