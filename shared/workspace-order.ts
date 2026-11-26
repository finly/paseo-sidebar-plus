import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

const workspaceOrderSchema = z.object({
  projects: z.record(z.string(), z.array(z.string())).default({}),
});

/**
 * Host-scoped (shared across devices) manual workspace order for "Manual order", keyed by project key
 * (`ProjectRef.key`), as workspace ref keys. Unlisted workspaces keep their sort-order slot (see `applyStoredOrder`).
 */
export const workspaceOrderSettings = defineSettings({
  id: "workspace-order",
  scope: "host",
  version: 1,
  schema: workspaceOrderSchema,
});

/** The device-scoped document this order was stored in before it moved to the host; read only to copy it there once. */
export const deviceWorkspaceOrderSettings = defineSettings({
  id: "workspace-order",
  scope: "device",
  version: 1,
  schema: workspaceOrderSchema,
});

export type WorkspaceOrderState = z.output<typeof workspaceOrderSettings.schema>;

export const EMPTY_WORKSPACE_ORDER: WorkspaceOrderState = workspaceOrderSettings.schema.parse({});
