import type { PluginWorkspaceSnapshot } from "@getpaseo/plugin";
import { useWorkspaces } from "@getpaseo/plugin/client";
import { useMemo } from "react";
import type { WorkspaceActivity } from "../shared/section-cap";

/**
 * Last prompt and creation time per workspace key, for the same workspaces the view lists. One query
 * grouped by the two stamps, so the pairs come back without reading snapshots during render.
 */
export function useWorkspaceActivity(where?: (workspace: PluginWorkspaceSnapshot) => boolean) {
  const buckets = useWorkspaces({
    where,
    groupBy: (workspace) => JSON.stringify([workspace.lastPromptAt, workspace.createdAt]),
  });
  return useMemo(() => {
    const activity = new Map<string, WorkspaceActivity>();
    for (const bucket of buckets) {
      const [lastPromptAt, createdAt] = JSON.parse(String(bucket.key)) as [string | null, string | null];
      for (const reference of bucket.items) activity.set(reference.key, { lastPromptAt, createdAt });
    }
    return activity;
  }, [buckets]);
}
