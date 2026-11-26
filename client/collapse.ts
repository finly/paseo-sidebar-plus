import { useSettings } from "@getpaseo/plugin/client";
import { useCallback, useMemo, useState } from "react";
import { type CollapseKind, EMPTY_COLLAPSE, collapseSettings } from "../shared/collapse";

/** Device-scoped collapsed groups, projects, status and label sections, and Pinned section, with lookups and toggles. */
export function useCollapse() {
  const state = useSettings(collapseSettings);
  const values = state.status === "ready" ? state.values : EMPTY_COLLAPSE;
  const collapsed = useMemo(
    () => ({ groups: new Set(values.groups), projects: new Set(values.projects), sections: new Set(values.sections) }),
    [values],
  );
  const isCollapsed = useCallback((kind: CollapseKind, id: string) => collapsed[kind].has(id), [collapsed]);
  const toggle = useCallback(
    (kind: CollapseKind, id: string): Promise<boolean> => {
      if (state.status !== "ready") return Promise.resolve(false);
      const current = state.values[kind];
      const next = current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id];
      return state.save({ ...state.values, [kind]: next }, state.revision);
    },
    [state],
  );
  /** Collapses or expands every id in `ids` in one save. */
  const setCollapsed = useCallback(
    (kind: CollapseKind, ids: readonly string[], value: boolean): Promise<boolean> => {
      if (state.status !== "ready") return Promise.resolve(false);
      const targets = new Set(ids);
      const rest = state.values[kind].filter((entry) => !targets.has(entry));
      return state.save({ ...state.values, [kind]: value ? [...rest, ...targets] : rest }, state.revision);
    },
    [state],
  );
  const togglePinned = useCallback((): Promise<boolean> => {
    if (state.status !== "ready") return Promise.resolve(false);
    return state.save({ ...state.values, pinned: !state.values.pinned }, state.revision);
  }, [state]);
  /** Expands the given groups, projects, sections, and (when `pinned`) the Pinned section in one save. */
  const expand = useCallback(
    (targets: { groups?: readonly string[]; projects?: readonly string[]; sections?: readonly string[]; pinned?: boolean }): Promise<boolean> => {
      if (state.status !== "ready") return Promise.resolve(false);
      const keep = (kind: CollapseKind) => {
        const ids = new Set(targets[kind] ?? []);
        return state.values[kind].filter((entry) => !ids.has(entry));
      };
      return state.save(
        {
          ...state.values,
          groups: keep("groups"),
          projects: keep("projects"),
          sections: keep("sections"),
          pinned: targets.pinned ? false : state.values.pinned,
        },
        state.revision,
      );
    },
    [state],
  );
  return { isCollapsed, toggle, setCollapsed, expand, pinnedCollapsed: values.pinned, togglePinned };
}

type Collapse = ReturnType<typeof useCollapse>;
interface TemporaryCollapse {
  narrowed: boolean;
  groups: ReadonlySet<string>;
  projects: ReadonlySet<string>;
  sections: ReadonlySet<string>;
  pinned: boolean;
}
const freshTemporary = (narrowed: boolean): TemporaryCollapse => ({
  narrowed,
  groups: new Set(),
  projects: new Set(),
  sections: new Set(),
  pinned: false,
});

/**
 * Collapse state as the view uses it. While `narrowed` (a search or filter is active), everything starts
 * expanded and collapse changes are kept in memory only; when narrowing ends, the stored state applies again,
 * untouched. Same shape as `useCollapse`.
 */
export function useViewCollapse(collapse: Collapse, narrowed: boolean): Collapse {
  const [temporary, setTemporary] = useState<TemporaryCollapse>(() => freshTemporary(narrowed));
  // Starting or ending narrowing resets the in-memory layer (derived state, set during render).
  const current = temporary.narrowed === narrowed ? temporary : freshTemporary(narrowed);
  if (current !== temporary) setTemporary(current);
  return useMemo((): Collapse => {
    if (!narrowed) return collapse;
    const apply = (next: (state: TemporaryCollapse) => TemporaryCollapse) => {
      setTemporary((state) => next(state));
      return Promise.resolve(true);
    };
    const withIds = (ids: ReadonlySet<string>, targets: readonly string[], value: boolean) => {
      const next = new Set(ids);
      for (const id of targets) {
        if (value) next.add(id);
        else next.delete(id);
      }
      return next;
    };
    return {
      isCollapsed: (kind, id) => current[kind].has(id),
      toggle: (kind, id) => apply((state) => ({ ...state, [kind]: withIds(state[kind], [id], !state[kind].has(id)) })),
      setCollapsed: (kind, ids, value) => apply((state) => ({ ...state, [kind]: withIds(state[kind], ids, value) })),
      expand: (targets) =>
        apply((state) => ({
          ...state,
          groups: withIds(state.groups, targets.groups ?? [], false),
          projects: withIds(state.projects, targets.projects ?? [], false),
          sections: withIds(state.sections, targets.sections ?? [], false),
          pinned: targets.pinned ? false : state.pinned,
        })),
      pinnedCollapsed: current.pinned,
      togglePinned: () => apply((state) => ({ ...state, pinned: !state.pinned })),
    };
  }, [collapse, narrowed, current]);
}
