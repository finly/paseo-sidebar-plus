import type { PluginTheme } from "@getpaseo/plugin";
import { type ProjectRef, useProject } from "@getpaseo/plugin/client";
import { Modal, copyText, useToast } from "@getpaseo/plugin/client/ui";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import type { ProjectTarget } from "./move-project";
import { useT } from "./i18n";
import { MenuItem } from "./workspace-actions";

export interface ProjectMenuTarget extends ProjectTarget {
  /** Null when the project is not in Paseo's project list (no new workspace or path). */
  ref: ProjectRef | null;
}

function errorText(failure: unknown): string {
  return failure instanceof Error ? failure.message : String(failure);
}

/** Items that need the project snapshot; rendered only when the ref is known. */
function ProjectItems({
  reference,
  busy,
  onNewWorkspace,
  onCopyPath,
  theme,
}: {
  reference: ProjectRef;
  busy: boolean;
  onNewWorkspace(reference: ProjectRef): void;
  onCopyPath(path: string): void;
  theme: PluginTheme;
}) {
  const t = useT();
  const rootPath = useProject(reference, (project) => project.rootPath);
  return (
    <>
      <MenuItem
        label={t("common.newWorkspace")}
        icon="Plus"
        disabled={busy}
        onPress={() => onNewWorkspace(reference)}
        theme={theme}
      />
      <MenuItem
        label={t("common.copyPath")}
        icon="Copy"
        disabled={busy || !rootPath}
        onPress={() => rootPath && onCopyPath(rootPath)}
        theme={theme}
      />
    </>
  );
}

/**
 * A project's ⋯ actions: new workspace, copy path, edit (Sidebar+ icon and color), move to group, archive workspaces (bulk sheet). Project settings, open in new
 * window, open in file manager, and remove project are not available to plugins in SDK 0.17.3.
 */
export function ProjectMenuModal({
  project,
  onNewWorkspace,
  onEdit,
  onMove,
  onArchiveMany,
  onClose,
  theme,
}: {
  project: ProjectMenuTarget | null;
  onNewWorkspace(reference: ProjectRef): void;
  /** Opens the Sidebar+ project appearance editor (icon and color). */
  onEdit(project: ProjectTarget): void;
  onMove(project: ProjectTarget): void;
  /** Opens the bulk archive sheet; nothing archives from the menu itself. */
  onArchiveMany(project: ProjectTarget): void;
  onClose(): void;
  theme: PluginTheme;
}) {
  const t = useT();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setBusy(false);
    setError(null);
  }, [project?.key]);

  const copyPath = async (path: string) => {
    setBusy(true);
    setError(null);
    try {
      await copyText(path);
      toast.show(t("common.copiedPath"), { variant: "success" });
      onClose();
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={project?.title ?? t("projectMenu.fallbackTitle")}
      open={project !== null}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <Modal.Content contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 12, gap: 2 }}>
        {project ? (
          <>
            {project.ref ? (
              <ProjectItems
                reference={project.ref}
                busy={busy}
                onNewWorkspace={(reference) => {
                  onClose();
                  onNewWorkspace(reference);
                }}
                onCopyPath={(path) => void copyPath(path)}
                theme={theme}
              />
            ) : null}
            {project.ref ? (
              <View style={{ height: 1, backgroundColor: theme.colors.border, marginVertical: 6 }} />
            ) : null}
            <MenuItem
              label={t("projectMenu.editProject")}
              icon="Pencil"
              disabled={busy}
              onPress={() => onEdit({ key: project.key, title: project.title })}
              theme={theme}
            />
            <MenuItem
              label={t("common.moveToGroup")}
              icon="FolderInput"
              disabled={busy}
              onPress={() => onMove({ key: project.key, title: project.title })}
              theme={theme}
            />
            <View style={{ height: 1, backgroundColor: theme.colors.border, marginVertical: 6 }} />
            <MenuItem
              label={t("projectMenu.archiveWorkspaces")}
              icon="Archive"
              danger
              disabled={busy}
              onPress={() => onArchiveMany({ key: project.key, title: project.title })}
              theme={theme}
            />
          </>
        ) : null}
        {error ? (
          <Text style={{ color: theme.colors.statusDanger, fontSize: 12, marginTop: 6, paddingHorizontal: 10 }}>
            {error}
          </Text>
        ) : null}
      </Modal.Content>
    </Modal>
  );
}
