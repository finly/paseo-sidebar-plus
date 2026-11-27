const DAY_MS = 86_400_000;

/** Last activity of a workspace: when it was last prompted, or when it was created. */
export interface WorkspaceActivity {
  readonly lastPromptAt: string | null;
  readonly createdAt: string | null;
}

/** Age cutoff in epoch ms for a limit of `days`; null when the limit is off. */
export function cutoffOf(days: number, now: number): number | null {
  return days > 0 ? now - days * DAY_MS : null;
}

export interface SectionCapOptions {
  /** Most rows to show; 0 shows every row that passes the age limit. */
  readonly count: number;
  /** Age cutoff in epoch ms, or null to keep every age. */
  readonly cutoff: number | null;
  readonly activity: ReadonlyMap<string, WorkspaceActivity>;
  /** Keys that always show, even past the count and the age limit (the open workspace). */
  readonly alwaysVisible: ReadonlySet<string>;
  /** The section is revealed past its cap. */
  readonly revealed: boolean;
}

export interface CappedSection<T> {
  readonly visible: readonly T[];
  /** How many rows the cap hides; 0 means nothing is behind "Show more". */
  readonly hidden: number;
}

/** A workspace's last activity in epoch ms; null when neither stamp is stored or parseable. */
function activityTime(activity: WorkspaceActivity | undefined): number | null {
  const value = activity?.lastPromptAt ?? activity?.createdAt ?? null;
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : time;
}

/**
 * The rows of one section the view renders, given the count and age limits. A row shows when it is
 * always visible or passes the age limit, and within the count; always-visible rows past the count are
 * appended in order. An unparseable or missing stamp keeps the row visible rather than hiding it.
 */
export function capSectionItems<T>(
  items: readonly T[],
  keyOf: (item: T) => string,
  options: SectionCapOptions,
): CappedSection<T> {
  const { count, cutoff, activity, alwaysVisible, revealed } = options;
  if (revealed || (count <= 0 && cutoff === null)) return { visible: items, hidden: 0 };
  const survivors = items.filter((item) => {
    const key = keyOf(item);
    if (alwaysVisible.has(key)) return true;
    if (cutoff === null) return true;
    const time = activityTime(activity.get(key));
    return time === null || time >= cutoff;
  });
  const head = count > 0 ? survivors.slice(0, count) : [];
  const tail = count > 0 ? survivors.slice(count).filter((item) => alwaysVisible.has(keyOf(item))) : survivors;
  const visible = tail.length > 0 ? [...head, ...tail] : head;
  return { visible, hidden: items.length - visible.length };
}
