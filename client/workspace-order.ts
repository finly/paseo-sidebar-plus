import { useSettings } from "@getpaseo/plugin/client";
import { useCallback } from "react";
import { EMPTY_WORKSPACE_ORDER, deviceWorkspaceOrderSettings, workspaceOrderSettings } from "../shared/workspace-order";
import { useCopyDeviceToHost } from "./copy-to-host";

/** Host-scoped manual workspace order per project (shared across devices), with a setter for one project's full order. */
export function useWorkspaceOrder() {
  const state = useSettings(workspaceOrderSettings);
  useCopyDeviceToHost(workspaceOrderSettings, state, useSettings(deviceWorkspaceOrderSettings));
  const orders = state.status === "ready" ? state.values.projects : EMPTY_WORKSPACE_ORDER.projects;
  const setProjectOrder = useCallback(
    (projectKey: string, next: string[]): Promise<boolean> => {
      if (state.status !== "ready") return Promise.resolve(false);
      return state.save(
        { ...state.values, projects: { ...state.values.projects, [projectKey]: next } },
        state.revision,
      );
    },
    [state],
  );
  return { orders, setProjectOrder };
}
