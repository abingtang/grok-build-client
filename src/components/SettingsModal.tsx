import type { ReactNode } from "react";
import type {
  EffortLevel,
  PermissionMode,
  ReasoningEffort,
} from "../lib/grokArgs";

export interface SettingsState {
  model: string;
  models: string[];
  effort: EffortLevel;
  reasoning: ReasoningEffort;
  alwaysApprove: boolean;
  permissionMode: PermissionMode;
  bestOfN: number;
  webSearch: boolean;
  subagents: boolean;
  memory: boolean;
  selfCheck: boolean;
  themeLight: boolean;
}

interface Props {
  open: boolean;
  value: SettingsState;
  onChange: (next: SettingsState) => void;
  onClose: () => void;
}

function SettingsRow({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="settings-row">
      <div className="settings-row-text">
        <div className="settings-row-title">{title}</div>
        {description ? (
          <div className="settings-row-desc">{description}</div>
        ) : null}
      </div>
      <div className="settings-row-control">{children}</div>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={`settings-toggle ${checked ? "on" : ""}`}
      onClick={() => onChange(!checked)}
    >
      <span className="settings-toggle-knob" />
    </button>
  );
}

function PillSelect({
  value,
  onChange,
  options,
  disabled,
  title,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <div className="settings-pill-select">
      <select
        value={value}
        disabled={disabled}
        title={title}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function Segmented({
  value,
  onChange,
  options,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
}) {
  return (
    <div className="settings-segmented" role="group">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          disabled={disabled}
          className={value === o.value ? "on" : ""}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const PERMISSION_LABELS: Record<string, string> = {
  default: "默认",
  acceptEdits: "接受编辑",
  auto: "自动",
  dontAsk: "不问",
  plan: "Plan",
  bypassPermissions: "绕过权限",
};

export function SettingsModal({ open, value, onChange, onClose }: Props) {
  if (!open) return null;

  const set = <K extends keyof SettingsState>(key: K, v: SettingsState[K]) =>
    onChange({ ...value, [key]: v });

  return (
    <div className="overlay settings-overlay" onClick={onClose}>
      <div
        className="modal settings-modal codex-settings"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="settings-title"
      >
        <header className="settings-header">
          <h3 id="settings-title">设置</h3>
          <button
            type="button"
            className="settings-close"
            onClick={onClose}
            aria-label="关闭"
          >
            ×
          </button>
        </header>

        <div className="settings-body">
          <h4 className="settings-section-label">常规</h4>
          <div className="settings-card">
            <SettingsRow
              title="模型"
              description="当前会话使用的 Grok 模型"
            >
              <PillSelect
                value={value.model}
                onChange={(v) => set("model", v)}
                options={value.models.map((m) => ({ value: m, label: m }))}
              />
            </SettingsRow>

            <SettingsRow
              title="推理力度"
              description="对应 --effort，影响思考深度与耗时"
            >
              <PillSelect
                value={value.effort}
                onChange={(v) => set("effort", v as EffortLevel)}
                options={[
                  { value: "low", label: "低" },
                  { value: "medium", label: "中" },
                  { value: "high", label: "高" },
                  { value: "xhigh", label: "很高" },
                  { value: "max", label: "最大" },
                ]}
              />
            </SettingsRow>

            <SettingsRow
              title="深度推理"
              description="对应 --reasoning-effort，关闭则不启用额外推理"
            >
              <PillSelect
                value={value.reasoning}
                onChange={(v) => set("reasoning", v as ReasoningEffort)}
                options={[
                  { value: "off", label: "关闭" },
                  { value: "low", label: "低" },
                  { value: "medium", label: "中" },
                  { value: "high", label: "高" },
                  { value: "xhigh", label: "很高" },
                  { value: "max", label: "最大" },
                ]}
              />
            </SettingsRow>

            <SettingsRow
              title="权限模式"
              description="工具调用审批策略（始终批准开启时忽略此项）"
            >
              <PillSelect
                value={value.permissionMode}
                disabled={value.alwaysApprove}
                onChange={(v) => set("permissionMode", v as PermissionMode)}
                options={[
                  "default",
                  "acceptEdits",
                  "auto",
                  "dontAsk",
                  "plan",
                  "bypassPermissions",
                ].map((x) => ({
                  value: x,
                  label: PERMISSION_LABELS[x] || x,
                }))}
              />
            </SettingsRow>

            <SettingsRow
              title="Best-of-N"
              description="并行候选数量（--best-of-n）"
            >
              <Segmented
                value={String(value.bestOfN)}
                onChange={(v) => set("bestOfN", Number(v))}
                options={[1, 2, 3, 4, 5].map((n) => ({
                  value: String(n),
                  label: String(n),
                }))}
              />
            </SettingsRow>

            <SettingsRow
              title="始终批准"
              description="自动批准工具调用（--always-approve）"
            >
              <Toggle
                label="始终批准"
                checked={value.alwaysApprove}
                onChange={(v) => set("alwaysApprove", v)}
              />
            </SettingsRow>

            <SettingsRow
              title="Web 搜索"
              description="允许代理使用网络搜索获取资料"
            >
              <Toggle
                label="Web 搜索"
                checked={value.webSearch}
                onChange={(v) => set("webSearch", v)}
              />
            </SettingsRow>

            <SettingsRow
              title="子代理"
              description="允许生成并委派子代理(subagents)"
            >
              <Toggle
                label="子代理"
                checked={value.subagents}
                onChange={(v) => set("subagents", v)}
              />
            </SettingsRow>

            <SettingsRow
              title="实验性记忆"
              description="跨回合记忆（--experimental-memory）"
            >
              <Toggle
                label="实验性记忆"
                checked={value.memory}
                onChange={(v) => set("memory", v)}
              />
            </SettingsRow>

            <SettingsRow
              title="自验证"
              description="回合后自动检查（--check）"
            >
              <Toggle
                label="自验证"
                checked={value.selfCheck}
                onChange={(v) => set("selfCheck", v)}
              />
            </SettingsRow>

            <SettingsRow
              title="浅色主题"
              description="切换界面为浅色外观"
            >
              <Toggle
                label="浅色主题"
                checked={value.themeLight}
                onChange={(v) => set("themeLight", v)}
              />
            </SettingsRow>
          </div>
        </div>
      </div>
    </div>
  );
}
