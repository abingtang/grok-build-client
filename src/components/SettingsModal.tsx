import type { ReactNode } from "react";
import { useI18n, type Locale } from "../i18n";
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
  locale: Locale;
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

export function SettingsModal({ open, value, onChange, onClose }: Props) {
  const { t, setLocale } = useI18n();

  if (!open) return null;

  const set = <K extends keyof SettingsState>(key: K, v: SettingsState[K]) =>
    onChange({ ...value, [key]: v });

  const effortOptions = [
    { value: "low", label: t("settings.effortLow") },
    { value: "medium", label: t("settings.effortMedium") },
    { value: "high", label: t("settings.effortHigh") },
    { value: "xhigh", label: t("settings.effortXhigh") },
    { value: "max", label: t("settings.effortMax") },
  ];

  const permissionLabels: Record<string, string> = {
    default: t("settings.permDefault"),
    acceptEdits: t("settings.permAcceptEdits"),
    auto: t("settings.permAuto"),
    dontAsk: t("settings.permDontAsk"),
    plan: t("settings.permPlan"),
    bypassPermissions: t("settings.permBypass"),
  };

  return (
    <div className="overlay settings-overlay" onClick={onClose}>
      <div
        className="modal settings-modal codex-settings"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="settings-title"
      >
        <header className="settings-header">
          <h3 id="settings-title">{t("settings.title")}</h3>
          <button
            type="button"
            className="settings-close"
            onClick={onClose}
            aria-label={t("common.close")}
          >
            ×
          </button>
        </header>

        <div className="settings-body">
          <h4 className="settings-section-label">{t("settings.general")}</h4>
          <div className="settings-card">
            <SettingsRow
              title={t("language.label")}
              description={t("language.description")}
            >
              <Segmented
                value={value.locale}
                onChange={(v) => {
                  const locale = v as Locale;
                  set("locale", locale);
                  setLocale(locale);
                }}
                options={[
                  { value: "zh", label: t("language.zh") },
                  { value: "en", label: t("language.en") },
                ]}
              />
            </SettingsRow>

            <SettingsRow
              title={t("common.model")}
              description={t("settings.modelDesc")}
            >
              <PillSelect
                value={value.model}
                onChange={(v) => set("model", v)}
                options={value.models.map((m) => ({ value: m, label: m }))}
              />
            </SettingsRow>

            <SettingsRow
              title={t("settings.effort")}
              description={t("settings.effortDesc")}
            >
              <PillSelect
                value={value.effort}
                onChange={(v) => set("effort", v as EffortLevel)}
                options={effortOptions}
              />
            </SettingsRow>

            <SettingsRow
              title={t("settings.reasoning")}
              description={t("settings.reasoningDesc")}
            >
              <PillSelect
                value={value.reasoning}
                onChange={(v) => set("reasoning", v as ReasoningEffort)}
                options={[
                  { value: "off", label: t("settings.reasoningOff") },
                  ...effortOptions,
                ]}
              />
            </SettingsRow>

            <SettingsRow
              title={t("settings.permissionMode")}
              description={t("settings.permissionModeDesc")}
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
                  label: permissionLabels[x] || x,
                }))}
              />
            </SettingsRow>

            <SettingsRow
              title={t("settings.bestOfN")}
              description={t("settings.bestOfNDesc")}
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
              title={t("settings.alwaysApprove")}
              description={t("settings.alwaysApproveDesc")}
            >
              <Toggle
                label={t("settings.alwaysApprove")}
                checked={value.alwaysApprove}
                onChange={(v) => set("alwaysApprove", v)}
              />
            </SettingsRow>

            <SettingsRow
              title={t("settings.webSearch")}
              description={t("settings.webSearchDesc")}
            >
              <Toggle
                label={t("settings.webSearch")}
                checked={value.webSearch}
                onChange={(v) => set("webSearch", v)}
              />
            </SettingsRow>

            <SettingsRow
              title={t("settings.subagents")}
              description={t("settings.subagentsDesc")}
            >
              <Toggle
                label={t("settings.subagents")}
                checked={value.subagents}
                onChange={(v) => set("subagents", v)}
              />
            </SettingsRow>

            <SettingsRow
              title={t("settings.memory")}
              description={t("settings.memoryDesc")}
            >
              <Toggle
                label={t("settings.memory")}
                checked={value.memory}
                onChange={(v) => set("memory", v)}
              />
            </SettingsRow>

            <SettingsRow
              title={t("settings.selfCheck")}
              description={t("settings.selfCheckDesc")}
            >
              <Toggle
                label={t("settings.selfCheck")}
                checked={value.selfCheck}
                onChange={(v) => set("selfCheck", v)}
              />
            </SettingsRow>

            <SettingsRow
              title={t("settings.themeLight")}
              description={t("settings.themeLightDesc")}
            >
              <Toggle
                label={t("settings.themeLight")}
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
