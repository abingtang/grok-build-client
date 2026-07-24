import { useMemo, useState, type ReactNode } from "react";
import {
  GearIcon,
  MagnifyingGlassIcon,
  SunIcon,
} from "@radix-ui/react-icons";
import { useI18n, type Locale } from "../i18n";
import type {
  EffortLevel,
  PermissionMode,
  ReasoningEffort,
} from "../lib/grokArgs";
import type { ThemeCustomConfig, ThemeCustomStore } from "../lib/theme-custom";
import { ThemeCustomPanel } from "./ThemeCustomPanel";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

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
  maxTurns: number;
  noPlan: boolean;
  sandbox: string;
  themeLight: boolean;
  themeCustom: ThemeCustomStore;
  locale: Locale;
}

type SettingsSection = "general" | "appearance";

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
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 border-b border-border/60 py-3.5 last:border-b-0",
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-medium text-foreground">{title}</div>
        {description ? (
          <div className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
            {description}
          </div>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center justify-end">{children}</div>
    </div>
  );
}

function SettingsCard({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <section className="mb-5">
      {title ? (
        <h3 className="mb-2 px-0.5 text-[13px] font-medium text-muted-foreground">
          {title}
        </h3>
      ) : null}
      <div className="overflow-hidden rounded-xl border border-border/70 bg-card/50 px-4">
        {children}
      </div>
    </section>
  );
}

function AppSelect({
  value,
  onChange,
  options,
  disabled,
  title,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
  title?: string;
  className?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className={cn("w-[148px]", className)} title={title}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function SettingsModal({ open, value, onChange, onClose }: Props) {
  const { t, setLocale } = useI18n();
  const [section, setSection] = useState<SettingsSection>("general");
  const [navQuery, setNavQuery] = useState("");

  const set = <K extends keyof SettingsState>(key: K, v: SettingsState[K]) =>
    onChange({ ...value, [key]: v });

  const mode = value.themeLight ? "light" : "dark";
  const activeCustom: ThemeCustomConfig = value.themeCustom[mode];

  const setActiveCustom = (next: ThemeCustomConfig) => {
    onChange({
      ...value,
      themeCustom: {
        ...value.themeCustom,
        [mode]: next,
      },
    });
  };

  const navGroups = useMemo(
    () => [
      {
        id: "personal",
        label: t("settings.navGroupPersonal"),
        items: [
          {
            id: "general" as const,
            label: t("settings.navGeneral"),
            icon: GearIcon,
            keywords: "general 常规 language model approve",
          },
          {
            id: "appearance" as const,
            label: t("settings.navAppearance"),
            icon: SunIcon,
            keywords: "appearance 外观 theme color font sidebar contrast",
          },
        ],
      },
    ],
    [t],
  );

  const q = navQuery.trim().toLowerCase();
  const filteredGroups = useMemo(() => {
    if (!q) return navGroups;
    return navGroups
      .map((g) => ({
        ...g,
        items: g.items.filter(
          (item) =>
            item.label.toLowerCase().includes(q) ||
            item.keywords.toLowerCase().includes(q),
        ),
      }))
      .filter((g) => g.items.length > 0);
  }, [navGroups, q]);

  const sectionTitle =
    section === "appearance"
      ? t("settings.navAppearance")
      : t("settings.navGeneral");

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          onClose();
          setNavQuery("");
        }
      }}
    >
      <DialogContent
        className="flex h-[min(720px,85vh)] w-[min(920px,calc(100vw-32px))] max-w-none flex-row gap-0 overflow-hidden p-0 sm:max-w-none"
        showClose
      >
        <DialogTitle className="sr-only">{t("settings.title")}</DialogTitle>

        {/* Left nav */}
        <aside className="flex w-[220px] shrink-0 flex-col border-r border-border bg-muted/25">
          <div className="flex items-center gap-1 border-b border-border/70 px-2 py-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-2 py-1.5 text-[12.5px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              ← {t("settings.back")}
            </button>
          </div>

          <div className="px-2.5 pb-2 pt-2.5">
            <label className="flex h-8 items-center gap-2 rounded-lg border border-border/70 bg-background/60 px-2.5">
              <MagnifyingGlassIcon className="size-3.5 shrink-0 text-muted-foreground" />
              <input
                value={navQuery}
                onChange={(e) => setNavQuery(e.target.value)}
                placeholder={t("settings.search")}
                className="min-w-0 flex-1 border-0 bg-transparent text-[12.5px] text-foreground outline-none placeholder:text-muted-foreground"
              />
            </label>
          </div>

          <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
            {filteredGroups.length === 0 ? (
              <div className="px-2 py-4 text-[12px] text-muted-foreground">
                {t("settings.searchEmpty")}
              </div>
            ) : (
              filteredGroups.map((group) => (
                <div key={group.id} className="mb-3">
                  <div className="px-2 pb-1 pt-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    {group.label}
                  </div>
                  <ul className="flex flex-col gap-0.5">
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      const active = section === item.id;
                      return (
                        <li key={item.id}>
                          <button
                            type="button"
                            onClick={() => setSection(item.id)}
                            className={cn(
                              "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors",
                              active
                                ? "bg-accent text-foreground"
                                : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                            )}
                          >
                            <Icon className="size-4 shrink-0 opacity-80" />
                            <span className="truncate font-medium">{item.label}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))
            )}
          </nav>
        </aside>

        {/* Right content */}
        <div className="flex min-w-0 flex-1 flex-col bg-popover">
          <header className="shrink-0 border-b border-border/70 px-6 py-4 pr-12">
            <h2 className="text-[18px] font-semibold tracking-tight text-foreground">
              {sectionTitle}
            </h2>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5">
            {section === "general" ? (
              <>
                <SettingsCard title={t("settings.sectionGeneral")}>
                  <SettingsRow
                    title={t("language.label")}
                    description={t("language.description")}
                  >
                    <ToggleGroup
                      type="single"
                      value={value.locale}
                      onValueChange={(v) => {
                        if (!v) return;
                        const locale = v as Locale;
                        set("locale", locale);
                        setLocale(locale);
                      }}
                    >
                      <ToggleGroupItem value="zh">{t("language.zh")}</ToggleGroupItem>
                      <ToggleGroupItem value="en">{t("language.en")}</ToggleGroupItem>
                    </ToggleGroup>
                  </SettingsRow>

                  <SettingsRow
                    title={t("common.model")}
                    description={t("settings.modelDesc")}
                  >
                    <AppSelect
                      value={value.model}
                      onChange={(v) => set("model", v)}
                      options={value.models.map((m) => ({ value: m, label: m }))}
                    />
                  </SettingsRow>
                </SettingsCard>

                <SettingsCard title={t("settings.sectionPermissions")}>
                  <SettingsRow
                    title={t("settings.alwaysApprove")}
                    description={t("settings.alwaysApproveDesc")}
                  >
                    <Switch
                      checked={value.alwaysApprove}
                      onCheckedChange={(v) => set("alwaysApprove", v)}
                      aria-label={t("settings.alwaysApprove")}
                    />
                  </SettingsRow>
                </SettingsCard>
              </>
            ) : null}

            {section === "appearance" ? (
              <>
                <SettingsCard title={t("settings.sectionThemeMode")}>
                  <SettingsRow
                    title={t("settings.themeLight")}
                    description={t("settings.themeLightDesc")}
                  >
                    <Switch
                      checked={value.themeLight}
                      onCheckedChange={(v) => set("themeLight", v)}
                      aria-label={t("settings.themeLight")}
                    />
                  </SettingsRow>
                </SettingsCard>

                <ThemeCustomPanel
                  mode={mode}
                  value={activeCustom}
                  onChange={setActiveCustom}
                />
              </>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
