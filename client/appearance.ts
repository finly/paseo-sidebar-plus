import { useSettings } from "@getpaseo/plugin/client";
import { useCallback } from "react";
import {
  type Appearance,
  EMPTY_APPEARANCE,
  NO_APPEARANCE,
  appearanceSettings,
  isEmptyAppearance,
} from "../shared/appearance";

/** Host-scoped project and Pinned heading appearance (shared across devices), with lookups and setters. */
export function useAppearance() {
  const state = useSettings(appearanceSettings);
  const doc = state.status === "ready" ? state.values : EMPTY_APPEARANCE;
  const projectAppearance = useCallback(
    (projectKey: string): Appearance => doc.projects[projectKey] ?? NO_APPEARANCE,
    [doc],
  );
  /** Saves a project's appearance; none removes its entry. */
  const setProjectAppearance = useCallback(
    (projectKey: string, value: Appearance): Promise<boolean> => {
      if (state.status !== "ready") return Promise.resolve(false);
      const { [projectKey]: _previous, ...rest } = state.values.projects;
      const projects = isEmptyAppearance(value) ? rest : { ...rest, [projectKey]: value };
      return state.save({ ...state.values, projects }, state.revision);
    },
    [state],
  );
  const setPinnedAppearance = useCallback(
    (value: Appearance): Promise<boolean> => {
      if (state.status !== "ready") return Promise.resolve(false);
      return state.save({ ...state.values, pinned: value }, state.revision);
    },
    [state],
  );
  return { state, projectAppearance, pinnedAppearance: doc.pinned, setProjectAppearance, setPinnedAppearance };
}
