import type { Budget } from "../../github/client";
import { dateLocale, t } from "../i18n";

/**
 * GitHub's GraphQL budget as a bar with its numbers: points left of the hourly limit, when it is
 * full again, what the last refresh cost and what the refresh interval adds up to per hour.
 *
 * @param usage           From `useInbox().usage`.
 * @param refreshMinutes  The interval setting, for the hourly estimate; 0 is off.
 *
 * @example
 *   <UsageMeter usage={inbox.usage} refreshMinutes={settings.refreshMinutes} />
 */
/** The meter's lines as plain text, for the ring's tooltip. */
function usageText({ budget, lastCost }: Usage, refreshMinutes: number): string[] {
  if (!budget) return [t("usage.unknown")];
  const time = budget.resetAt.toLocaleTimeString(dateLocale(), { hour: "2-digit", minute: "2-digit" });
  const lines = [t("usage.title"), t("usage.remaining", { remaining: budget.remaining, limit: budget.limit, time })];
  if (lastCost !== null) {
    lines.push(
      refreshMinutes > 0
        ? t("usage.lastCost", { cost: lastCost, minutes: refreshMinutes, perHour: Math.round((lastCost * 60) / refreshMinutes) })
        : t("usage.lastCostManual", { cost: lastCost }),
    );
  }
  return lines;
}

type Usage = { budget: Budget | null; lastCost: number | null };

/**
 * The budget left as a small ring for the sidebar footer: full while all points are left, green,
 * turning amber below half and red below a fifth. The numbers show in its tooltip; a click opens
 * the settings, where `UsageMeter` shows them in full.
 *
 * @example
 *   <UsageRing usage={inbox.usage} refreshMinutes={settings.refreshMinutes} onClick={openSettings} />
 */
export function UsageRing({ usage, refreshMinutes, onClick }: { usage: Usage; refreshMinutes: number; onClick: () => void }) {
  const share = usage.budget ? usage.budget.remaining / usage.budget.limit : 1;
  const tone = share < 0.2 ? "low" : share < 0.5 ? "mid" : "ok";
  const text = usageText(usage, refreshMinutes).join("\n");
  const r = 6.5;
  const length = 2 * Math.PI * r;
  return (
    <button className={`icon-btn usage-ring ${tone}`} onClick={onClick} title={text} aria-label={text}>
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
        <circle cx="8" cy="8" r={r} className="usage-track" />
        <circle cx="8" cy="8" r={r} className="usage-left" strokeDasharray={`${length * share} ${length}`} transform="rotate(-90 8 8)" />
      </svg>
    </button>
  );
}

export function UsageMeter({ usage, refreshMinutes }: { usage: Usage; refreshMinutes: number }) {
  const { budget, lastCost } = usage;
  if (!budget) return <small>{t("usage.unknown")}</small>;
  const time = budget.resetAt.toLocaleTimeString(dateLocale(), { hour: "2-digit", minute: "2-digit" });
  return (
    <div className="usage">
      <meter min={0} max={budget.limit} low={budget.limit * 0.2} optimum={budget.limit} value={budget.remaining} />
      <small>{t("usage.remaining", { remaining: budget.remaining, limit: budget.limit, time })}</small>
      {lastCost !== null && (
        <small>
          {refreshMinutes > 0
            ? t("usage.lastCost", { cost: lastCost, minutes: refreshMinutes, perHour: Math.round((lastCost * 60) / refreshMinutes) })
            : t("usage.lastCostManual", { cost: lastCost })}
        </small>
      )}
    </div>
  );
}
