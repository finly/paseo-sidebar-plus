import type { PluginWorkspaceSnapshot } from "@getpaseo/plugin";
import { useSyncExternalStore } from "react";
import type { RowField } from "../shared/display-settings";
import type { Translate } from "./i18n";

/** Snapshot-derived field text. Primitives only, so the row's shallow selector stays stable. */
export interface SnapshotFieldData {
  readonly branch: string | null;
  readonly project: string | null;
  /** Label names joined by "\n" (Paseo collapses whitespace in names, so it never occurs inside one). */
  readonly labels: string | null;
  readonly lastPromptAt: string | null;
}

export function selectSnapshotFields(workspace: PluginWorkspaceSnapshot): SnapshotFieldData {
  return {
    branch: workspace.branch,
    project: workspace.projectDisplayName || null,
    labels: workspace.labels.length > 0 ? workspace.labels.join("\n") : null,
    lastPromptAt: workspace.lastPromptAt,
  };
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Compact relative time: "now", "5m ago", "2h ago", "3d ago", "4w ago", or a date. */
export function formatRelativeTime(iso: string, now: number, t: Translate): string | null {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return null;
  const elapsed = Math.max(0, now - time);
  if (elapsed < MINUTE) return t("time.now");
  if (elapsed < HOUR) return t("time.minutesAgo", { count: Math.floor(elapsed / MINUTE) });
  if (elapsed < DAY) return t("time.hoursAgo", { count: Math.floor(elapsed / HOUR) });
  if (elapsed < 7 * DAY) return t("time.daysAgo", { count: Math.floor(elapsed / DAY) });
  if (elapsed < 30 * DAY) return t("time.weeksAgo", { count: Math.floor(elapsed / (7 * DAY)) });
  return new Date(time).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/** Text per snapshot field (labels and diff stats render separately). Fields without data are omitted so their line can collapse. */
export function snapshotFieldText(
  data: SnapshotFieldData,
  now: number,
): Partial<Record<RowField, string>> {
  const values: Partial<Record<RowField, string>> = {};
  if (data.branch) values.branch = `⎇ ${data.branch}`;
  if (data.project) values.project = data.project;
  return values;
}

/** Last activity text for line 1, or null without a prompt yet. */
export function lastActivityText(data: SnapshotFieldData, now: number, t: Translate): string | null {
  return data.lastPromptAt ? formatRelativeTime(data.lastPromptAt, now, t) : null;
}

// One shared minute clock for every row, so relative times refresh without per-row timers.
let minuteNow = Date.now();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function subscribeMinute(listener: () => void): () => void {
  listeners.add(listener);
  if (timer === null) {
    minuteNow = Date.now();
    timer = setInterval(() => {
      minuteNow = Date.now();
      for (const notify of listeners) notify();
    }, MINUTE);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
}

/** Current time, updated once a minute. */
export function useMinuteNow(): number {
  return useSyncExternalStore(subscribeMinute, () => minuteNow, () => minuteNow);
}
