import { invoke } from "@tauri-apps/api/core";

/** How much the app writes to its log file: nothing, one line per step, or every detail. */
export type LogLevel = "off" | "debug" | "verbose";

const RANK: Record<LogLevel, number> = { off: 0, debug: 1, verbose: 2 };

let level: LogLevel = "off";

/** Sets the level for all later calls; the settings do this whenever they change. */
export function setLogLevel(next: LogLevel): void {
  level = next;
}

let context: Record<string, unknown> = {};

/** Sets what the UI adds to status-change lines, e.g. the view and whether the pop-up is open. */
export function setLogContext(next: Record<string, unknown>): void {
  context = next;
}

export function logContext(): Record<string, unknown> {
  return context;
}

/** One line: `2026-10-25T14:03:01.123Z debug refresh kind=delta items=12`. */
export function formatLine(at: Date, lvl: Exclude<LogLevel, "off">, message: string, fields: Record<string, unknown> = {}): string {
  const pairs = Object.entries(fields)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${typeof value === "string" && /\s/.test(value) ? JSON.stringify(value) : String(value)}`);
  return [at.toISOString(), lvl, message, ...pairs].join(" ");
}

function write(lvl: Exclude<LogLevel, "off">, message: string, fields?: Record<string, unknown>): void {
  if (RANK[level] < RANK[lvl]) return;
  void invoke("log_write", { line: formatLine(new Date(), lvl, message, fields) }).catch(() => undefined);
}

/**
 * Writes to `~/Library/Logs/<bundle id>/inbox.log`, rotated by size, when the level in the
 * settings allows; otherwise a call costs one comparison. Never pass the token, comment bodies or
 * issue texts; name items by id or `repo#number`, and titles only at verbose.
 *
 * @example
 *   log.debug("refresh", { kind: "delta", items: 12, ms: 840 });
 *   log.verbose("graphql", { op: "Search", status: 200, remaining: 4310 });
 */
export const log = {
  debug: (message: string, fields?: Record<string, unknown>) => write("debug", message, fields),
  verbose: (message: string, fields?: Record<string, unknown>) => write("verbose", message, fields),
};

/** Opens the log folder in the Finder. */
export function revealLog(): Promise<void> {
  return invoke("log_reveal");
}
