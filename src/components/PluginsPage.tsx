/**
 * Full plugin management: list / install / uninstall / enable / disable / update.
 * Uses official `grok plugin` CLI via IPC.
 * Title + primary actions live in the app titlebar (via onToolbar).
 *
 * Buttons use unlayered `.btn` (app.css) — shadcn Button text color loses to
 * `button { color: inherit }` and becomes unreadable on primary fill.
 */
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "../i18n";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

type PluginRow = {
  name: string;
  version?: string;
  enabled?: boolean;
  source?: string;
  path?: string;
  description?: string;
};

export type PluginsToolbar = {
  loading: boolean;
  busy: string | null;
  refresh: () => void;
  updateAll: () => void;
};

type Props = {
  /** Register titlebar actions (refresh / update-all). Pass null on unmount. */
  onToolbar?: (toolbar: PluginsToolbar | null) => void;
};

export function PluginsPage({ onToolbar }: Props) {
  const { t } = useI18n();
  const [plugins, setPlugins] = useState<PluginRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [source, setSource] = useState("");
  const [log, setLog] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await window.grokDesktop.extensions.pluginsList();
      setPlugins(r.plugins || []);
      if (!r.plugins?.length && r.raw && /error|failed|not found/i.test(r.raw)) {
        setError(r.raw.slice(0, 400));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPlugins([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = useCallback(
    async (key: string, fn: () => Promise<{ ok: boolean; output: string }>) => {
      setBusy(key);
      setLog(null);
      setError(null);
      try {
        const r = await fn();
        setLog(r.output || (r.ok ? "ok" : "failed"));
        if (!r.ok) setError(r.output || t("plugins.actionFailed"));
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(null);
      }
    },
    [refresh, t],
  );

  const updateAll = useCallback(() => {
    void run("update-all", () =>
      window.grokDesktop.extensions.pluginsUpdate(),
    );
  }, [run]);

  useEffect(() => {
    if (!onToolbar) return;
    onToolbar({
      loading,
      busy,
      refresh: () => void refresh(),
      updateAll,
    });
    return () => onToolbar(null);
  }, [onToolbar, loading, busy, refresh, updateAll]);

  return (
    <div className="global-config-page" role="region" aria-label={t("plugins.title")}>
      <div className="global-config-body plugins-body">
        <p className="global-config-desc plugins-page-desc">{t("plugins.subtitle")}</p>

        <section className="plugins-install">
          <label className="plugins-label" htmlFor="plugin-source">
            {t("plugins.installLabel")}
          </label>
          <div className="plugins-install-row">
            <input
              id="plugin-source"
              className="plugins-input"
              value={source}
              disabled={!!busy}
              placeholder={t("plugins.installPlaceholder")}
              onChange={(e) => setSource(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && source.trim()) {
                  e.preventDefault();
                  void run("install", () =>
                    window.grokDesktop.extensions.pluginsInstall(
                      source.trim(),
                      true,
                    ),
                  );
                }
              }}
            />
            <button
              type="button"
              className="btn btn-sm btn-primary"
              disabled={!source.trim() || !!busy}
              onClick={() =>
                void run("install", () =>
                  window.grokDesktop.extensions.pluginsInstall(
                    source.trim(),
                    true,
                  ),
                )
              }
            >
              {busy === "install" ? t("plugins.installing") : t("plugins.install")}
            </button>
          </div>
          <p className="plugins-hint">{t("plugins.installHint")}</p>
        </section>

        {error ? <p className="plugins-error">{error}</p> : null}
        {log ? <pre className="global-config-pre plugins-log">{log}</pre> : null}

        {loading && !plugins.length ? (
          <p className="muted global-config-empty">{t("common.loading")}</p>
        ) : plugins.length === 0 ? (
          <p className="muted global-config-empty">{t("plugins.empty")}</p>
        ) : (
          <ul className="plugins-list">
            {plugins.map((p) => {
              const enabled = p.enabled !== false;
              return (
                <li key={p.name} className="plugins-card">
                  <div className="plugins-card-head">
                    <div className="min-w-0 flex-1">
                      <div className="plugins-card-title">
                        <strong>{p.name}</strong>
                        {p.version ? (
                          <span className="badge">v{p.version}</span>
                        ) : null}
                        <span
                          className={cn(
                            "badge",
                            enabled ? "ok" : "warn",
                          )}
                        >
                          {enabled
                            ? t("plugins.enabled")
                            : t("plugins.disabled")}
                        </span>
                      </div>
                      {p.description ? (
                        <p className="plugins-desc">{p.description}</p>
                      ) : null}
                      {p.source ? (
                        <p className="plugins-meta" title={p.source}>
                          {p.source}
                        </p>
                      ) : null}
                    </div>
                    <div className="plugins-card-actions">
                      <label className="plugins-switch">
                        <span className="sr-only">
                          {enabled
                            ? t("plugins.disable")
                            : t("plugins.enable")}
                        </span>
                        <Switch
                          checked={enabled}
                          disabled={!!busy}
                          onCheckedChange={(on) => {
                            void run(
                              `${p.name}-toggle`,
                              () =>
                                on
                                  ? window.grokDesktop.extensions.pluginsEnable(
                                      p.name,
                                    )
                                  : window.grokDesktop.extensions.pluginsDisable(
                                      p.name,
                                    ),
                            );
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        className="btn btn-sm"
                        disabled={!!busy}
                        onClick={() =>
                          void run(`${p.name}-update`, () =>
                            window.grokDesktop.extensions.pluginsUpdate(p.name),
                          )
                        }
                      >
                        {t("plugins.update")}
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm"
                        disabled={!!busy}
                        onClick={() =>
                          void run(`${p.name}-details`, () =>
                            window.grokDesktop.extensions.pluginsDetails(p.name),
                          )
                        }
                      >
                        {t("plugins.details")}
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-danger"
                        disabled={!!busy}
                        onClick={() => {
                          if (
                            !window.confirm(
                              t("plugins.confirmUninstall", { name: p.name }),
                            )
                          ) {
                            return;
                          }
                          void run(`${p.name}-rm`, () =>
                            window.grokDesktop.extensions.pluginsUninstall(
                              p.name,
                            ),
                          );
                        }}
                      >
                        {t("plugins.uninstall")}
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
