import type { SettingsDefinition } from "@getpaseo/plugin";
import type { SettingsState } from "@getpaseo/plugin/client";
import { useEffect, useRef } from "react";
import type { ZodType, z } from "zod";

/** Paseo 0.17.3's revision for a settings document that was never saved, on the host and on a device. */
const NEVER_SAVED = "missing";

/**
 * Copies this device's saved value of a setting that moved from device to host scope, once: only while
 * the host document was never saved and this device has a saved value, so nothing resets after the move.
 * A device that loses the race to another device's copy gets a conflict and keeps the host value.
 */
export function useCopyDeviceToHost<Schema extends ZodType>(
  definition: SettingsDefinition<Schema>,
  host: SettingsState<Schema>,
  device: SettingsState<ZodType>,
): void {
  const tried = useRef(false);
  useEffect(() => {
    if (tried.current || host.status !== "ready" || device.status !== "ready") return;
    if (host.revision !== NEVER_SAVED || device.revision === NEVER_SAVED) return;
    tried.current = true;
    // Device copies hold version 1 values: migrate them like a stored host value before parsing.
    void Promise.resolve(definition.migrate ? definition.migrate(device.values, 1) : device.values).then((values) => {
      const parsed = definition.schema.safeParse(values);
      if (parsed.success) void host.save(parsed.data as z.output<Schema>, NEVER_SAVED);
    });
  }, [definition, host, device]);
}
