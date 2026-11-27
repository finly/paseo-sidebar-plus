import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

/** Named group colors. Stored by name; the client maps each to a display color. */
export const GROUP_COLORS = ["gray", "red", "orange", "yellow", "green", "teal", "blue", "purple", "pink"] as const;
export type GroupColor = (typeof GROUP_COLORS)[number];

/** A group icon: a Lucide export name (PascalCase, e.g. "FolderGit2") or a single emoji. */
export const groupIcon = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("lucide"), name: z.string().regex(/^[A-Z][A-Za-z0-9]*$/) }),
  z.object({ kind: z.literal("emoji"), value: z.string().min(1).max(16) }),
]);
export type GroupIcon = z.output<typeof groupIcon>;

const group = z.object({
  /** Stable id, never reused; membership references it. */
  id: z.string().min(1),
  name: z.string().trim().min(1).max(80),
  color: z.enum(GROUP_COLORS).nullable().default(null),
  icon: groupIcon.nullable().default(null),
  /**
   * Parent group id: set on a subgroup (one level only). The parent must be a top-level group;
   * otherwise (missing, itself a subgroup, or this group) the group shows as top-level.
   */
  parentId: z.string().min(1).nullable().default(null),
});
export type Group = z.output<typeof group>;

/**
 * Host-scoped (shared across devices) groups document.
 * `groups` array order is the display order (top-level groups, and each group's subgroups among themselves). `membership` maps a project key
 * (`ProjectRef.key`, host-qualified) to a group id; unmapped projects are ungrouped.
 * `projectOrder` is the Sidebar+ project display order (project keys) inside every group and ungrouped;
 * unlisted projects follow, in their natural order.
 */
export const groupsSettings = defineSettings({
  id: "groups",
  scope: "host",
  version: 1,
  schema: z
    .object({
      groups: z.array(group).default([]),
      membership: z.record(z.string(), z.string()).default({}),
      projectOrder: z.array(z.string()).default([]),
    })
    .refine((doc) => new Set(doc.groups.map((entry) => entry.id)).size === doc.groups.length, {
      message: "Group ids must be unique",
      path: ["groups"],
    }),
});

export type GroupsDocument = z.output<typeof groupsSettings.schema>;

export const EMPTY_GROUPS: GroupsDocument = groupsSettings.schema.parse({});

/** The group a project belongs to, or null when ungrouped or its group no longer exists. */
export function groupOfProject(doc: GroupsDocument, projectKey: string): Group | null {
  const groupId = doc.membership[projectKey];
  if (!groupId) return null;
  return doc.groups.find((entry) => entry.id === groupId) ?? null;
}

/** The group's parent when it is a valid subgroup (the parent exists and is top-level); otherwise null. */
export function parentOf(doc: GroupsDocument, group: Group): Group | null {
  if (!group.parentId || group.parentId === group.id) return null;
  const parent = doc.groups.find((entry) => entry.id === group.parentId);
  return parent && parent.parentId === null ? parent : null;
}

/** Groups shown at the top level, in display order: groups without a valid parent. */
export function topLevelGroups(doc: GroupsDocument): Group[] {
  return doc.groups.filter((entry) => parentOf(doc, entry) === null);
}

/** A top-level group's subgroups, in display order. */
export function subgroupsOf(doc: GroupsDocument, groupId: string): Group[] {
  return doc.groups.filter((entry) => entry.parentId === groupId && parentOf(doc, entry)?.id === groupId);
}

/** The top-level group a project shows under (its group, or that group's parent), or null when ungrouped. */
export function topGroupOfProject(doc: GroupsDocument, projectKey: string): Group | null {
  const group = groupOfProject(doc, projectKey);
  return group ? (parentOf(doc, group) ?? group) : null;
}

/** `items` in the stored project order; unlisted projects go last, keeping their order (stable). */
export function sortByProjectOrder<T>(items: readonly T[], order: readonly string[], keyOf: (item: T) => string): T[] {
  if (order.length === 0) return [...items];
  const rank = new Map(order.map((key, index) => [key, index]));
  const at = (item: T) => rank.get(keyOf(item)) ?? Number.MAX_SAFE_INTEGER;
  return [...items].sort((a, b) => at(a) - at(b));
}

/** `keys` with each key mapped through `resolve`, dropping duplicates but keeping first-seen order. */
export function translateKeys(keys: readonly string[], resolve: (key: string) => string): string[] {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const key of keys) {
    const mapped = resolve(key);
    if (seen.has(mapped)) continue;
    seen.add(mapped);
    next.push(mapped);
  }
  return next;
}

/**
 * Reads a stored groups document through a project-key translation (a host-qualified ref key to
 * the shared project key Paseo uses to join a project across hosts). Exact keys win over older
 * keys that translate to them, so data saved with the new key takes precedence while old settings
 * keep working until they are rewritten.
 */
export function translateGroupsDocument(doc: GroupsDocument, resolve: (key: string) => string): GroupsDocument {
  const membership: Record<string, string> = {};
  for (const [key, groupId] of Object.entries(doc.membership)) {
    const mapped = resolve(key);
    if (mapped !== key && membership[mapped] === undefined) membership[mapped] = groupId;
  }
  for (const [key, groupId] of Object.entries(doc.membership)) {
    if (resolve(key) === key) membership[key] = groupId;
  }
  return { ...doc, membership, projectOrder: translateKeys(doc.projectOrder, resolve) };
}
