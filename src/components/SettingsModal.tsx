import type { ReactNode } from "react";
import { useI18n, type Locale } from "../i18n";
import type {
  EffortLevel,
  PermissionMode,
  ReasoningEffort,
} from "../lib/grokArgs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
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
        "flex items-center justify-between gap-4 border-b border-border/70 py-3.5 last:border-b-0",
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

  const set = <K extends keyof SettingsState>(key: K, v: SettingsState[K]) =>
    onChange({ ...value, [key]: v });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className="w-[min(520px,calc(100vw-32px))] overflow-hidden p-0 sm:max-w-lg"
        showClose
      >
        <DialogHeader className="shrink-0">
          <DialogTitle>{t("settings.title")}</DialogTitle>
        </DialogHeader>

        {/* 原生滚动：ScrollArea 需明确高度，在 flex 弹窗里容易失效 */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-5 pt-2">
            
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
            
        </div>
      </DialogContent>
    </Dialog>
  );
}
