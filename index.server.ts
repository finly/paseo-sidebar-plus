import type { PluginServerContext } from "@getpaseo/plugin/server";
import { appearanceSettings } from "./shared/appearance";
import { displaySettings } from "./shared/display-settings";
import { groupsSettings } from "./shared/groups";
import { pinnedOrderSettings } from "./shared/pinned-order";
import { workspaceOrderSettings } from "./shared/workspace-order";

export default function contribute(server: PluginServerContext) {
  server.registerSettings(groupsSettings);
  server.registerSettings(appearanceSettings);
  server.registerSettings(displaySettings);
  server.registerSettings(workspaceOrderSettings);
  server.registerSettings(pinnedOrderSettings);
  return () => {};
}
