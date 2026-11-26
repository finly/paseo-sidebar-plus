import type { PluginWorkspaceSnapshot } from "@getpaseo/plugin";
import { z } from "zod";

/**
 * Sidebar filters, as in Paseo's sidebar (`stores/sidebar-view-store.ts`). Each list is an allowlist;
 * empty means "all". Hosts are server ids, projects are project ref keys, labels are label keys.
 */
export const filtersSchema = z
  .object({
    hosts: z.array(z.string()).default([]),
    projects: z.array(z.string()).default([]),
    labels: z.array(z.string()).default([]),
  })
  .default({ hosts: [], projects: [], labels: [] });

export type Filters = z.output<typeof filtersSchema>;
export type FilterKind = keyof Filters;

/**
 * The label key for "carries no labels". Label keys are trimmed, so no real label maps to it
 * (Paseo's `SIDEBAR_UNLABELLED_LABEL_KEY`).
 */
export const UNLABELLED_KEY = "";

/** Paseo's `workspaceLabelKey`: collapse whitespace, trim, lower-case. */
export function labelKey(name: string): string {
  return name.replace(/\s+/g, " ").trim().toLowerCase();
}

/** Adds the key when absent, removes it when present. */
export function toggleEntry(list: readonly string[], key: string): string[] {
  return list.includes(key) ? list.filter((entry) => entry !== key) : [...list, key];
}

/**
 * The filters as applied: stored keys that name nothing available are ignored, so a filter goes
 * inert while its host, project, or label is away and comes back with it (Paseo's
 * `resolveActiveProjectFilters`). As in Paseo, a host filter whose hosts are all gone shows every host.
 */
export function resolveFilters(
  filters: Filters,
  available: {
    readonly hosts: ReadonlySet<string>;
    readonly projects: ReadonlySet<string>;
    readonly labels: ReadonlySet<string>;
  },
): Filters {
  return {
    hosts: filters.hosts.filter((id) => available.hosts.has(id)),
    projects: filters.projects.filter((key) => available.projects.has(key)),
    labels: filters.labels.filter((key) => key === UNLABELLED_KEY || available.labels.has(key)),
  };
}

export function hasActiveFilters(filters: Filters): boolean {
  return filters.hosts.length > 0 || filters.projects.length > 0 || filters.labels.length > 0;
}

/** Host, project, and label match; several selected labels include a workspace carrying any of them. */
export function matchesFilters(workspace: PluginWorkspaceSnapshot, filters: Filters): boolean {
  if (filters.hosts.length > 0 && !filters.hosts.includes(workspace.hostId)) return false;
  if (filters.projects.length > 0 && !filters.projects.includes(workspace.project.key)) return false;
  if (filters.labels.length === 0) return true;
  const keys = new Set(workspace.labels.map(labelKey).filter(Boolean));
  return filters.labels.some((key) => (key === UNLABELLED_KEY ? keys.size === 0 : keys.has(key)));
}

/**
 * Saves a drag made in a filtered list without losing hidden items' order: the visible items' slots in
 * the full order take the new visible order; hidden items keep theirs. Unfiltered, this is `visibleOrder`.
 */
export function mergeVisibleOrder(fullOrder: readonly string[], visibleOrder: readonly string[]): string[] {
  const visible = new Set(visibleOrder);
  let next = 0;
  const merged = fullOrder.map((key) => (visible.has(key) ? visibleOrder[next++] : key));
  // Visible keys missing from the full order (should not happen) go last rather than vanish.
  return next < visibleOrder.length ? [...merged, ...visibleOrder.slice(next)] : merged;
}

/** The search query as matched: trimmed and lower-cased; empty means no search. */
export function normalizeQuery(query: string): string {
  return query.trim().toLowerCase();
}

/**
 * Case-insensitive substring match of a normalized query on title, name, branch, project, labels,
 * and host label. An empty query matches everything.
 */
export function matchesSearch(workspace: PluginWorkspaceSnapshot, query: string, hostLabel: string): boolean {
  if (!query) return true;
  const fields = [workspace.title, workspace.name, workspace.branch, workspace.projectDisplayName, hostLabel, ...workspace.labels];
  return fields.some((field) => field != null && field.toLowerCase().includes(query));
}
