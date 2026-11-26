import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";
import { GROUP_COLORS, groupIcon } from "./groups";

/** A heading's color and icon, as on groups. Both default to none. */
const appearance = z.object({
  color: z.enum(GROUP_COLORS).nullable().default(null),
  icon: groupIcon.nullable().default(null),
});
export type Appearance = z.output<typeof appearance>;

export const NO_APPEARANCE: Appearance = { color: null, icon: null };

/**
 * Host-scoped (shared across devices) Sidebar+ heading appearance for projects and the Pinned section.
 * `projects` maps a project key (`ProjectRef.key`, host-qualified) to its appearance; unmapped projects have none.
 * Paseo's own project icon is not readable or settable from plugins (SDK 0.17.3).
 */
export const appearanceSettings = defineSettings({
  id: "appearance",
  scope: "host",
  version: 1,
  schema: z.object({
    projects: z.record(z.string(), appearance).default({}),
    pinned: appearance.default(NO_APPEARANCE),
  }),
});

export type AppearanceDocument = z.output<typeof appearanceSettings.schema>;

export const EMPTY_APPEARANCE: AppearanceDocument = appearanceSettings.schema.parse({});

/** True when the appearance sets neither a color nor an icon. */
export function isEmptyAppearance(value: Appearance): boolean {
  return value.color === null && value.icon === null;
}
