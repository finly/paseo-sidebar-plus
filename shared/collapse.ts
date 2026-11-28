import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

/**
 * Device-scoped collapse state. The lists hold the ids whose state differs from `collapsedByDefault`:
 * when sections start expanded they are the collapsed ids; when sections start collapsed they are the
 * expanded ids. `groups` holds group ids; `projects` holds project keys (`ProjectRef.key`, host-qualified);
 * `sections` holds status and label section keys (`status:<bucket>`, `label:<label key>`, `unlabelled`);
 * `pinned` is the Pinned section's differing-state flag.
 */
export const collapseSettings = defineSettings({
  id: "collapse",
  scope: "device",
  version: 1,
  schema: z.object({
    groups: z.array(z.string()).default([]),
    projects: z.array(z.string()).default([]),
    sections: z.array(z.string()).default([]),
    pinned: z.boolean().default(false),
    collapsedByDefault: z.boolean().default(false),
  }),
});

export type CollapseState = z.output<typeof collapseSettings.schema>;
export type CollapseKind = "groups" | "projects" | "sections";

export const EMPTY_COLLAPSE: CollapseState = collapseSettings.schema.parse({});
