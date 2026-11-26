import type { PluginTheme } from "@getpaseo/plugin";
import { Modal } from "@getpaseo/plugin/client/ui";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import type { Group } from "../shared/groups";
import type { CollapseControls } from "./collapse";
import { Button } from "./group-editor";
import { useGroups } from "./groups";
import { useT } from "./i18n";
import { MenuItem } from "./workspace-actions";

type Page = "menu" | "delete";

/**
 * A group's ⋯ actions. Top-level group: edit, new subgroup, collapse or expand all its projects
 * (device-scoped, subgroups included), and delete with a confirm page. Subgroup: edit, move to group,
 * and delete with a confirm page. `projectKeys` are the group's projects as shown in the view.
 */
export function GroupMenuModal({
  group,
  parent,
  subgroupCount,
  projectKeys,
  collapse,
  onEdit,
  onNewSubgroup,
  onMove,
  onClose,
  theme,
}: {
  group: Group | null;
  /** The parent group when `group` is a subgroup; null for a top-level group. */
  parent: Group | null;
  /** Number of subgroups of a top-level group. */
  subgroupCount: number;
  projectKeys: readonly string[];
  /** The view's collapse state (in memory while searching or filtered). */
  collapse: CollapseControls;
  onEdit(group: Group): void;
  onNewSubgroup(group: Group): void;
  onMove(group: Group): void;
  onClose(): void;
  theme: PluginTheme;
}) {
  const t = useT();
  const { state, deleteGroup } = useGroups();
  const { isCollapsed, setCollapsed } = collapse;
  const [page, setPage] = useState<Page>("menu");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setPage("menu");
    setBusy(false);
  }, [group?.id]);

  const run = async (action: () => Promise<boolean>) => {
    setBusy(true);
    const ok = await action();
    setBusy(false);
    if (ok) onClose();
  };

  const anyExpanded = projectKeys.some((key) => !isCollapsed("projects", key));
  const anyCollapsed = projectKeys.some((key) => isCollapsed("projects", key));
  const ready = state.status === "ready";

  return (
    <Modal
      title={
        page === "delete"
          ? parent
            ? t("groupMenu.deleteSubgroupTitle")
            : t("groupMenu.deleteGroupTitle")
          : (group?.name ?? t("groupMenu.fallbackTitle"))
      }
      open={group !== null}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <Modal.Content contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 12, gap: 2 }}>
        {group && page === "menu" && parent ? (
          <>
            <MenuItem label={t("groupMenu.editSubgroup")} icon="Pencil" disabled={busy} onPress={() => onEdit(group)} theme={theme} />
            <MenuItem label={t("common.moveToGroup")} icon="FolderInput" disabled={busy} onPress={() => onMove(group)} theme={theme} />
            <View style={{ height: 1, backgroundColor: theme.colors.border, marginVertical: 6 }} />
            <MenuItem
              label={t("groupMenu.deleteSubgroup")}
              icon="Trash2"
              danger
              disabled={busy || !ready}
              onPress={() => setPage("delete")}
              theme={theme}
            />
          </>
        ) : null}

        {group && page === "menu" && !parent ? (
          <>
            <MenuItem label={t("groupMenu.editGroup")} icon="Pencil" disabled={busy} onPress={() => onEdit(group)} theme={theme} />
            <MenuItem
              label={t("groupMenu.newSubgroup")}
              icon="FolderPlus"
              disabled={busy}
              onPress={() => onNewSubgroup(group)}
              theme={theme}
            />
            <MenuItem
              label={t("groupMenu.collapseAll")}
              icon="ChevronsDownUp"
              disabled={busy || !anyExpanded}
              onPress={() => void run(() => setCollapsed("projects", projectKeys, true))}
              theme={theme}
            />
            <MenuItem
              label={t("groupMenu.expandAll")}
              icon="ChevronsUpDown"
              disabled={busy || !anyCollapsed}
              onPress={() => void run(() => setCollapsed("projects", projectKeys, false))}
              theme={theme}
            />
            <View style={{ height: 1, backgroundColor: theme.colors.border, marginVertical: 6 }} />
            <MenuItem
              label={t("groupMenu.deleteGroup")}
              icon="Trash2"
              danger
              disabled={busy || !ready}
              onPress={() => setPage("delete")}
              theme={theme}
            />
          </>
        ) : null}

        {group && page === "delete" ? (
          <View style={{ gap: 12, paddingHorizontal: 8, paddingVertical: 4 }}>
            <Text style={{ color: theme.colors.foreground, fontSize: 13, lineHeight: 18 }}>
              {parent
                ? t("groupMenu.deleteSubgroupConfirm", { name: group.name, parent: parent.name })
                : subgroupCount > 0
                  ? t("groupMenu.deleteGroupWithSubgroupsConfirm", { name: group.name })
                  : t("groupMenu.deleteGroupConfirm", { name: group.name })}
            </Text>
            <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
              <Button label={t("common.cancel")} onPress={() => setPage("menu")} theme={theme} />
              <Button
                label={t("common.delete")}
                tone="danger"
                disabled={busy || !ready}
                onPress={() => void run(() => deleteGroup(group.id))}
                theme={theme}
              />
            </View>
          </View>
        ) : null}

        {state.saveError ? (
          <Text style={{ color: theme.colors.statusDanger, fontSize: 12, marginTop: 6, paddingHorizontal: 10 }}>
            {state.saveError}
          </Text>
        ) : null}
      </Modal.Content>
    </Modal>
  );
}
