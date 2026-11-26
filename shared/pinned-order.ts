import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

const pinnedOrderSchema = z.object({
  order: z.array(z.string()).default([]),
});

/** Host-scoped (shared across devices) manual order of the Pinned section, as workspace ref keys. Unlisted pins keep pinned-at order. */
export const pinnedOrderSettings = defineSettings({
  id: "pinned-order",
  scope: "host",
  version: 1,
  schema: pinnedOrderSchema,
});

/** The device-scoped document this order was stored in before it moved to the host; read only to copy it there once. */
export const devicePinnedOrderSettings = defineSettings({
  id: "pinned-order",
  scope: "device",
  version: 1,
  schema: pinnedOrderSchema,
});

export type PinnedOrderState = z.output<typeof pinnedOrderSettings.schema>;

export const EMPTY_PINNED_ORDER: PinnedOrderState = pinnedOrderSettings.schema.parse({});

/**
 * Applies a stored order the way Paseo's sidebar does: items named in `stored` swap into the
 * slots those items already hold, in stored order; every other item keeps its place.
 */
export function applyStoredOrder<T>(items: readonly T[], stored: readonly string[], keyOf: (item: T) => string): readonly T[] {
  if (items.length <= 1 || stored.length === 0) return items;
  const byKey = new Map(items.map((item) => [keyOf(item), item]));
  const ordered = [...new Set(stored)].filter((key) => byKey.has(key));
  if (ordered.length === 0) return items;
  const listed = new Set(ordered);
  let next = 0;
  return items.map((item) => (listed.has(keyOf(item)) ? (byKey.get(ordered[next++]) as T) : item));
}

/** `keys` with `key` moved to `index` (an index among the other keys). */
export function moveKey(keys: readonly string[], key: string, index: number): string[] {
  const others = keys.filter((entry) => entry !== key);
  others.splice(Math.max(0, Math.min(index, others.length)), 0, key);
  return others;
}
