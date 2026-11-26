import type { PluginTheme, PluginWorkspaceSnapshot, WorkspaceIndicator } from "@getpaseo/plugin";
import type { WorkspaceRef } from "@getpaseo/plugin/client";
import { useWorkspaces } from "@getpaseo/plugin/client";
import { useMemo } from "react";
import { View } from "react-native";
import { useT } from "./i18n";
import { indicatorColor } from "./status-indicator";

/** Paseo's workspace status priority: lower is more urgent. */
const URGENCY: Record<WorkspaceIndicator, number> = {
  needs_input: 0,
  failed: 1,
  running: 2,
  attention: 3,
  done: 4,
};

const byIndicator = (workspace: PluginWorkspaceSnapshot) => workspace.indicator;

/** Live status per workspace key, for the same workspaces the view lists. */
export function useWorkspaceIndicators(where?: (workspace: PluginWorkspaceSnapshot) => boolean) {
  const buckets = useWorkspaces({ where, groupBy: byIndicator });
  return useMemo(() => {
    const indicators = new Map<string, WorkspaceIndicator>();
    for (const bucket of buckets) {
      for (const reference of bucket.items) indicators.set(reference.key, bucket.key as WorkspaceIndicator);
    }
    return indicators;
  }, [buckets]);
}

/** The most urgent status among the workspaces; null when none is more than "done". */
export function mostUrgent(
  references: readonly WorkspaceRef[],
  indicators: ReadonlyMap<string, WorkspaceIndicator>,
): WorkspaceIndicator | null {
  let best: WorkspaceIndicator | null = null;
  for (const reference of references) {
    const indicator = indicators.get(reference.key);
    if (indicator && indicator !== "done" && (best === null || URGENCY[indicator] < URGENCY[best])) best = indicator;
  }
  return best;
}

/** Status dot shown on a collapsed heading. */
export function UrgentDot({ indicator, theme }: { indicator: WorkspaceIndicator | null; theme: PluginTheme }) {
  const t = useT();
  if (!indicator) return null;
  return (
    <View
      accessibilityLabel={t("a11y.status", { status: t(`status.${indicator}`) })}
      style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: indicatorColor(theme, indicator) }}
    />
  );
}
