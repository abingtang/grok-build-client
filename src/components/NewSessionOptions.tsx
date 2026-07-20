/**
 * Draft-session options: worktree + fork-session (applied on first message).
 */
import { useI18n } from "../i18n";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export type NewSessionOptionsValue = {
  useWorktree: boolean;
  worktreeLabel: string;
  forkFromCurrent: boolean;
};

type Props = {
  value: NewSessionOptionsValue;
  onChange: (next: NewSessionOptionsValue) => void;
  /** Fork only available when there is a parent session */
  canFork: boolean;
  className?: string;
};

export function NewSessionOptions({
  value,
  onChange,
  canFork,
  className,
}: Props) {
  const { t } = useI18n();

  return (
    <div
      className={cn("new-session-options", className)}
      role="group"
      aria-label={t("newSession.optionsTitle")}
    >
      <div className="new-session-options-title">
        {t("newSession.optionsTitle")}
      </div>
      <div className="new-session-options-row">
        <div className="new-session-options-label">
          <span className="new-session-options-name">
            {t("newSession.worktree")}
          </span>
          <span className="new-session-options-desc">
            {t("newSession.worktreeDesc")}
          </span>
        </div>
        <Switch
          checked={value.useWorktree}
          onCheckedChange={(on) =>
            onChange({ ...value, useWorktree: on })
          }
          aria-label={t("newSession.worktree")}
        />
      </div>
      {value.useWorktree ? (
        <div className="new-session-options-field">
          <label htmlFor="wt-label">{t("newSession.worktreeLabel")}</label>
          <input
            id="wt-label"
            className="new-session-options-input"
            value={value.worktreeLabel}
            placeholder={t("newSession.worktreeLabelPh")}
            onChange={(e) =>
              onChange({ ...value, worktreeLabel: e.target.value })
            }
          />
        </div>
      ) : null}
      <div className="new-session-options-row">
        <div className="new-session-options-label">
          <span className="new-session-options-name">
            {t("newSession.forkSession")}
          </span>
          <span className="new-session-options-desc">
            {canFork
              ? t("newSession.forkSessionDesc")
              : t("newSession.forkSessionNeedParent")}
          </span>
        </div>
        <Switch
          checked={value.forkFromCurrent && canFork}
          disabled={!canFork}
          onCheckedChange={(on) =>
            onChange({ ...value, forkFromCurrent: on })
          }
          aria-label={t("newSession.forkSession")}
        />
      </div>
    </div>
  );
}
