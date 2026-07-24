import { useEffect, useState, type ReactNode } from "react";
import { useI18n } from "../i18n";
import {
  applyThemePreset,
  exportThemeJson,
  matchThemePresetId,
  normalizeHex,
  parseThemeImport,
  presetsForMode,
  resetThemeConfig,
  type ThemeCustomConfig,
  type ThemeMode,
  type ThemePreset,
} from "../lib/theme-custom";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

function ThemeRow({
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

function ThemeCard({
  title,
  actions,
  children,
}: {
  title?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="mb-5">
      {(title || actions) && (
        <div className="mb-2 flex items-center justify-between gap-2 px-0.5">
          {title ? (
            <h3 className="text-[13px] font-medium text-muted-foreground">{title}</h3>
          ) : (
            <span />
          )}
          {actions}
        </div>
      )}
      <div className="overflow-hidden rounded-xl border border-border/70 bg-card/50 px-4">
        {children}
      </div>
    </section>
  );
}

function ThemeSwatch({
  accent,
  background,
  className,
}: {
  accent: string;
  background: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex size-4 shrink-0 overflow-hidden rounded-full border border-black/15 shadow-sm",
        className,
      )}
      aria-hidden
    >
      <span className="h-full w-1/2" style={{ background }} />
      <span className="h-full w-1/2" style={{ background: accent }} />
    </span>
  );
}

function ColorPill({
  value,
  onChange,
  ariaLabel,
}: {
  value: string;
  onChange: (hex: string) => void;
  ariaLabel: string;
}) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const commit = (raw: string) => {
    const n = normalizeHex(raw);
    if (n) {
      onChange(n);
      setDraft(n);
    } else {
      setDraft(value);
    }
  };

  const bg = normalizeHex(value) || "#888888";
  const isLight = (() => {
    const h = bg.slice(1);
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.55;
  })();

  return (
    <div
      className="relative flex h-8 min-w-[7.5rem] items-center gap-1.5 rounded-full border border-border/80 px-2.5 shadow-sm"
      style={{ background: bg, color: isLight ? "#1a1a1a" : "#f5f5f5" }}
    >
      <label className="relative size-3.5 shrink-0 cursor-pointer overflow-hidden rounded-full border border-black/15 bg-white/20">
        <span className="sr-only">{ariaLabel}</span>
        <input
          type="color"
          value={bg}
          onChange={(e) => {
            const n = normalizeHex(e.target.value);
            if (n) {
              onChange(n);
              setDraft(n);
            }
          }}
          className="absolute inset-0 cursor-pointer opacity-0"
          aria-label={ariaLabel}
        />
      </label>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => commit(draft)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit(draft);
            (e.target as HTMLInputElement).blur();
          }
        }}
        spellCheck={false}
        className="w-[5.5rem] border-0 bg-transparent text-[12px] font-medium tracking-wide outline-none"
        aria-label={ariaLabel}
      />
    </div>
  );
}

function PresetSelect({
  mode,
  value,
  onChange,
}: {
  mode: ThemeMode;
  value: ThemeCustomConfig;
  onChange: (next: ThemeCustomConfig) => void;
}) {
  const { t } = useI18n();
  const palettePresets = presetsForMode(mode);
  const activePresetId = matchThemePresetId(value, mode);
  const activePreset: ThemePreset | undefined =
    activePresetId === "custom"
      ? undefined
      : palettePresets.find((p) => p.id === activePresetId);

  const triggerLabel =
    activePresetId === "custom"
      ? t("themeCustom.presetCustom")
      : activePreset?.label ?? t("themeCustom.preset");
  const triggerAccent = activePreset?.accent ?? value.accent;
  const triggerBg = activePreset?.background ?? value.background;

  return (
    <Select
      value={activePresetId}
      onValueChange={(id) => {
        if (id === "custom") return;
        const preset = palettePresets.find((p) => p.id === id);
        if (!preset) return;
        onChange(applyThemePreset(preset, value));
      }}
    >
      <SelectTrigger
        className={cn(
          "h-9 w-[min(100%,240px)] min-w-[200px] gap-2 rounded-full border-border/80 bg-muted/50 px-3",
          "text-[12.5px] shadow-none",
          "[&>span]:min-w-0 [&>span]:flex-1 [&>span]:truncate [&>span]:text-left",
        )}
        title={triggerLabel}
        aria-label={t("themeCustom.preset")}
      >
        {/*
          Only render our face — do NOT also mount SelectValue, or Radix
          mirrors the selected item text and you get a double swatch/label.
        */}
        <span className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
          <ThemeSwatch accent={triggerAccent} background={triggerBg} />
          <span className="truncate font-medium">{triggerLabel}</span>
        </span>
      </SelectTrigger>
      <SelectContent className="max-h-[min(320px,50vh)] min-w-[240px] w-[var(--radix-select-trigger-width)]">
        {palettePresets.map((p) => (
          <SelectItem
            key={p.id}
            value={p.id}
            className="py-2 pl-2.5 pr-8"
            textValue={p.label}
          >
            <span className="flex min-w-0 items-center gap-2.5">
              <ThemeSwatch accent={p.accent} background={p.background} />
              <span className="truncate whitespace-nowrap">{p.label}</span>
            </span>
          </SelectItem>
        ))}
        {activePresetId === "custom" ? (
          <SelectItem value="custom" textValue={t("themeCustom.presetCustom")}>
            <span className="flex min-w-0 items-center gap-2.5">
              <ThemeSwatch accent={value.accent} background={value.background} />
              <span className="truncate whitespace-nowrap">
                {t("themeCustom.presetCustom")}
              </span>
            </span>
          </SelectItem>
        ) : null}
      </SelectContent>
    </Select>
  );
}

interface Props {
  mode: ThemeMode;
  value: ThemeCustomConfig;
  onChange: (next: ThemeCustomConfig) => void;
}

export function ThemeCustomPanel({ mode, value, onChange }: Props) {
  const { t } = useI18n();
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [flash, setFlash] = useState<string | null>(null);

  const set = <K extends keyof ThemeCustomConfig>(key: K, v: ThemeCustomConfig[K]) => {
    onChange({
      ...value,
      [key]: v,
      enabled: true,
    });
  };

  const showFlash = (msg: string) => {
    setFlash(msg);
    window.setTimeout(() => setFlash(null), 1800);
  };

  const copyTheme = async () => {
    try {
      await navigator.clipboard.writeText(exportThemeJson(value));
      showFlash(t("themeCustom.copied"));
    } catch {
      showFlash(t("themeCustom.copyFailed"));
    }
  };

  const doImport = () => {
    const result = parseThemeImport(importText, value);
    if (!result.ok) {
      showFlash(t("themeCustom.importInvalid"));
      return;
    }
    onChange(result.config);
    setImportOpen(false);
    setImportText("");
    showFlash(t("themeCustom.imported"));
  };

  const doReset = () => {
    onChange(resetThemeConfig(mode));
    showFlash(t("themeCustom.resetDone"));
  };

  const headerActions = (
    <div className="flex items-center gap-0.5">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-[12px] text-muted-foreground"
        onClick={() => {
          setImportOpen((v) => !v);
          setImportText("");
        }}
      >
        {t("themeCustom.import")}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-[12px] text-muted-foreground"
        onClick={() => void copyTheme()}
      >
        {t("themeCustom.copy")}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-[12px] text-muted-foreground"
        onClick={doReset}
      >
        {t("themeCustom.reset")}
      </Button>
    </div>
  );

  return (
    <div>
      <ThemeCard
        title={
          mode === "light" ? t("themeCustom.sectionLight") : t("themeCustom.sectionDark")
        }
        actions={headerActions}
      >
        {flash ? (
          <div className="border-b border-border/60 py-2 text-[12px] text-muted-foreground">
            {flash}
          </div>
        ) : null}

        {importOpen ? (
          <div className="space-y-2 border-b border-border/60 py-3">
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder={t("themeCustom.importPlaceholder")}
              rows={5}
              spellCheck={false}
              className="w-full resize-y rounded-md border border-border bg-background px-2.5 py-2 font-mono text-[11.5px] text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setImportOpen(false);
                  setImportText("");
                }}
              >
                {t("common.cancel")}
              </Button>
              <Button type="button" size="sm" onClick={doImport}>
                {t("themeCustom.applyImport")}
              </Button>
            </div>
          </div>
        ) : null}

        <ThemeRow
          title={t("themeCustom.preset")}
          description={t("themeCustom.presetDesc")}
        >
          <PresetSelect mode={mode} value={value} onChange={onChange} />
        </ThemeRow>

        <ThemeRow title={t("themeCustom.accent")}>
          <ColorPill
            value={value.accent}
            onChange={(hex) => set("accent", hex)}
            ariaLabel={t("themeCustom.accent")}
          />
        </ThemeRow>

        <ThemeRow title={t("themeCustom.background")}>
          <ColorPill
            value={value.background}
            onChange={(hex) => set("background", hex)}
            ariaLabel={t("themeCustom.background")}
          />
        </ThemeRow>

        <ThemeRow title={t("themeCustom.foreground")}>
          <ColorPill
            value={value.foreground}
            onChange={(hex) => set("foreground", hex)}
            ariaLabel={t("themeCustom.foreground")}
          />
        </ThemeRow>
      </ThemeCard>

      <ThemeCard title={t("themeCustom.sectionLayout")}>
        <ThemeRow
          title={t("themeCustom.translucentSidebar")}
          description={t("themeCustom.translucentSidebarDesc")}
        >
          <Switch
            checked={value.translucentSidebar}
            onCheckedChange={(v) => set("translucentSidebar", v)}
            aria-label={t("themeCustom.translucentSidebar")}
          />
        </ThemeRow>

        <ThemeRow title={t("themeCustom.contrast")} className="items-center">
          <div className="flex w-[180px] items-center gap-3">
            <Slider
              min={40}
              max={100}
              step={1}
              value={[value.contrast]}
              onValueChange={(v) => set("contrast", v[0] ?? 85)}
              aria-label={t("themeCustom.contrast")}
              className="w-[120px]"
            />
            <span className="w-7 tabular-nums text-right text-[12.5px] text-muted-foreground">
              {value.contrast}
            </span>
          </div>
        </ThemeRow>
      </ThemeCard>
    </div>
  );
}
