import { useSettings } from "@getpaseo/plugin/client";
import { useCallback } from "react";
import {
  type DisplaySettings,
  type FieldPlacement,
  type HostColor,
  type RowField,
  deviceDisplaySettings,
  displaySettings,
} from "../shared/display-settings";
import { type FilterKind, type Filters, filtersSchema, toggleEntry } from "../shared/filters";
import { useCopyDeviceToHost } from "./copy-to-host";

const NO_FILTERS: Filters = filtersSchema.parse(undefined);

/**
 * Host-scoped display settings (shared across devices) plus setters for a field's placement and the view
 * options, and the device-scoped filters with their setters.
 */
export function useDisplaySettings() {
  const state = useSettings(displaySettings);
  const device = useSettings(deviceDisplaySettings);
  useCopyDeviceToHost(displaySettings, state, device);
  const filters = device.status === "ready" ? device.values.filters : NO_FILTERS;
  const update = useCallback(
    (patch: (values: DisplaySettings) => DisplaySettings): Promise<boolean> => {
      if (state.status !== "ready") return Promise.resolve(false);
      return state.save(patch(state.values), state.revision);
    },
    [state],
  );
  const setFieldPlacement = useCallback(
    (field: RowField, placement: FieldPlacement): Promise<boolean> =>
      update((values) => ({ ...values, fields: { ...values.fields, [field]: placement } })),
    [update],
  );
  const setOption = useCallback(
    <Key extends Exclude<keyof DisplaySettings, "fields">>(key: Key, value: DisplaySettings[Key]): Promise<boolean> =>
      update((values) => ({ ...values, [key]: value })),
    [update],
  );
  const setHostColor = useCallback(
    (serverId: string, color: HostColor): Promise<boolean> =>
      update((values) => ({ ...values, hostColors: { ...values.hostColors, [serverId]: color } })),
    [update],
  );
  const updateFilters = useCallback(
    (patch: (current: Filters) => Filters): Promise<boolean> => {
      if (device.status !== "ready") return Promise.resolve(false);
      return device.save({ ...device.values, filters: patch(device.values.filters) }, device.revision);
    },
    [device],
  );
  /** Toggles one key in a filter's stored list (stale keys stay, as in Paseo). */
  const toggleFilter = useCallback(
    (kind: FilterKind, key: string): Promise<boolean> =>
      updateFilters((current) => ({ ...current, [kind]: toggleEntry(current[kind], key) })),
    [updateFilters],
  );
  /** Clears one filter, or every filter when no kind is given. */
  const clearFilters = useCallback(
    (kind?: FilterKind): Promise<boolean> =>
      updateFilters((current) => (kind ? { ...current, [kind]: [] } : { hosts: [], projects: [], labels: [] })),
    [updateFilters],
  );
  return { state, filters, setFieldPlacement, setOption, setHostColor, toggleFilter, clearFilters };
}
