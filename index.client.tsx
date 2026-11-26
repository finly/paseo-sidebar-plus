import type { PluginClientContext } from "@getpaseo/plugin/client";
import { messages } from "./client/i18n";
import { SidebarPlusView } from "./client/sidebar-view";

export default function contribute(client: PluginClientContext) {
  return client.addSidebarView({
    id: "sidebar-plus",
    title: messages.message("view.title"),
    description: messages.message("view.description"),
    Component: SidebarPlusView,
  });
}
