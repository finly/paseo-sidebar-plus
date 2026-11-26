import { useSettings } from "@getpaseo/plugin/client";
import { useCallback } from "react";
import { EMPTY_PINNED_ORDER, devicePinnedOrderSettings, pinnedOrderSettings } from "../shared/pinned-order";
import { useCopyDeviceToHost } from "./copy-to-host";

/** Host-scoped manual order of the Pinned section (shared across devices), with a setter for the full order. */
export function usePinnedOrder() {
  const state = useSettings(pinnedOrderSettings);
  useCopyDeviceToHost(pinnedOrderSettings, state, useSettings(devicePinnedOrderSettings));
  const order = state.status === "ready" ? state.values.order : EMPTY_PINNED_ORDER.order;
  const setOrder = useCallback(
    (next: string[]): Promise<boolean> => {
      if (state.status !== "ready") return Promise.resolve(false);
      return state.save({ ...state.values, order: next }, state.revision);
    },
    [state],
  );
  return { order, setOrder };
}
