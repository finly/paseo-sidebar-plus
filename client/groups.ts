import { useSettings } from "@getpaseo/plugin/client";
import { useCallback, useMemo } from "react";
import {
  EMPTY_GROUPS,
  type Group,
  type GroupsDocument,
  groupsSettings,
  parentOf,
  translateGroupsDocument,
} from "../shared/groups";

/** Editable group fields; the id is assigned on create and never changes, the parent changes by moving. */
export type GroupDraft = Omit<Group, "id" | "parentId">;

function newGroupId(): string {
  return `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Host-scoped groups document (shared across devices) plus an atomic updater and group actions.
 * `resolveProjectKey` lets the view read old host-qualified project keys as the shared key that
 * joins one project across hosts; writes always use the keys the view passes in.
 */
export function useGroups(resolveProjectKey: (key: string) => string = (key) => key) {
  const state = useSettings(groupsSettings);
  const stored = state.status === "ready" ? state.values : EMPTY_GROUPS;
  const groups = useMemo(() => translateGroupsDocument(stored, resolveProjectKey), [stored, resolveProjectKey]);
  const update = useCallback(
    (patch: (doc: GroupsDocument) => GroupsDocument): Promise<boolean> => {
      if (state.status !== "ready") return Promise.resolve(false);
      return state.save(patch(state.values), state.revision);
    },
    [state],
  );
  /** Appends a group at the end of the display order; with `parentId`, as the last subgroup of that top-level group. */
  const createGroup = useCallback(
    (draft: GroupDraft, parentId: string | null = null): Promise<boolean> =>
      update((doc) => ({ ...doc, groups: [...doc.groups, { ...draft, id: newGroupId(), parentId }] })),
    [update],
  );
  const updateGroup = useCallback(
    (id: string, draft: GroupDraft): Promise<boolean> =>
      update((doc) => ({
        ...doc,
        groups: doc.groups.map((entry) => (entry.id === id ? { ...entry, ...draft, id } : entry)),
      })),
    [update],
  );
  /**
   * Removes the group. A subgroup's projects move up to its parent group; a top-level group's projects
   * become ungrouped and its subgroups become top-level groups.
   */
  const deleteGroup = useCallback(
    (id: string): Promise<boolean> =>
      update((doc) => {
        const target = doc.groups.find((entry) => entry.id === id);
        const parentId = target ? (parentOf(doc, target)?.id ?? null) : null;
        const membership: Record<string, string> = {};
        for (const [projectKey, groupId] of Object.entries(doc.membership)) {
          if (groupId !== id) membership[projectKey] = groupId;
          else if (parentId) membership[projectKey] = parentId;
        }
        return {
          ...doc,
          groups: doc.groups
            .filter((entry) => entry.id !== id)
            .map((entry) => (entry.parentId === id ? { ...entry, parentId: null } : entry)),
          membership,
        };
      }),
    [update],
  );
  /**
   * Makes a group a subgroup of the top-level group `parentId` (last among its subgroups), or top-level
   * (last among top-level groups) when null. Only a group without subgroups can become a subgroup.
   */
  const moveGroup = useCallback(
    (id: string, parentId: string | null): Promise<boolean> =>
      update((doc) => {
        const moved = doc.groups.find((entry) => entry.id === id);
        if (!moved || moved.parentId === parentId) return doc;
        if (parentId !== null) {
          const parent = doc.groups.find((entry) => entry.id === parentId);
          if (!parent || parent.id === id || parentOf(doc, parent) !== null) return doc;
          if (doc.groups.some((entry) => entry.parentId === id && parentOf(doc, entry)?.id === id)) return doc;
        }
        const others = doc.groups.filter((entry) => entry.id !== id);
        return { ...doc, groups: [...others, { ...moved, parentId }] };
      }),
    [update],
  );
  /** Moves a project into a group, or ungroups it when `groupId` is null. */
  const moveProject = useCallback(
    (projectKey: string, groupId: string | null): Promise<boolean> =>
      update((doc) => {
        const { [projectKey]: _previous, ...rest } = doc.membership;
        return { ...doc, membership: groupId ? { ...rest, [projectKey]: groupId } : rest };
      }),
    [update],
  );
  /** Moves a group to `index` in the display order (an index among the other groups). */
  const reorderGroup = useCallback(
    (id: string, index: number): Promise<boolean> =>
      update((doc) => {
        const moved = doc.groups.find((entry) => entry.id === id);
        if (!moved) return doc;
        const others = doc.groups.filter((entry) => entry.id !== id);
        return { ...doc, groups: [...others.slice(0, index), moved, ...others.slice(index)] };
      }),
    [update],
  );
  /** Replaces the project display order (project keys). */
  const setProjectOrder = useCallback(
    (projectOrder: string[]): Promise<boolean> => update((doc) => ({ ...doc, projectOrder })),
    [update],
  );
  return {
    state,
    groups,
    update,
    createGroup,
    updateGroup,
    deleteGroup,
    moveGroup,
    moveProject,
    reorderGroup,
    setProjectOrder,
  };
}
