# Grok Build Desktop

非官方 macOS 桌面客户端，用 **Electron + React** 包装官方 **Grok Build CLI**。

只保留官方能力的桌面入口，不堆第三方桌面端自创的工作流/模式。

## 能力（对应官方 CLI）

- **对话运行时**
  - 主路径：`grok agent stdio`（ACP 长会话）
  - 兜底：`grok -p … --output-format streaming-json`
- **项目 / 会话**：读取 `~/.grok/sessions`，内容来自 `updates.jsonl`
- **官方参数**：`--model` / `--effort` / `--reasoning-effort` / `--always-approve` / `--permission-mode` / `--best-of-n` / `--cwd` / `-c` / `--resume` 等
- **官方 slash**：输入 `/` 触发 TUI 同款命令目录
- **Plan**：`session/set_mode plan`（官方 ACP）
- **检查器**：`grok inspect`、MCP / Skills / Hooks 等状态查看

## 前置

1. 已安装并登录 [Grok CLI](https://x.ai/cli)：`grok login`
2. Node.js 20+

## 开发

```bash
cd grok-build-desktop
npm install
npm run electron:dev   # 会先关掉旧进程再启动（Vite :5175 + Electron）
```

## 快捷键

| 快捷键 | 作用 |
|--------|------|
| ⌘K | 命令面板 |
| ⌘, | 设置 |
| ⌘I | 能力检查器 |
| Enter | 发送 |
| Shift+Enter | 换行 |
| / | 官方 slash 命令 |

## License

MIT
