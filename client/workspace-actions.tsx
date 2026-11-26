import type { PluginTheme, PluginWorkspaceSnapshot } from "@getpaseo/plugin";
import type { WorkspaceRef } from "@getpaseo/plugin/client";
import { usePaseo, useWorkspace, useWorkspaces } from "@getpaseo/plugin/client";
import { Icon, Modal, TextInput, copyText, useToast } from "@getpaseo/plugin/client/ui";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Button } from "./group-editor";
import { useT } from "./i18n";

type Page = "menu" | "rename" | "labels" | "archive";

interface MenuTarget {
  title: string;
  name: string;
  directory: string;
  branch: string | null;
  hostId: string;
  pinned: boolean;
  labels: readonly string[];
}

function selectTarget(workspace: PluginWorkspaceSnapshot): MenuTarget {
  return {
    title: workspace.title ?? workspace.name,
    name: workspace.name,
    directory: workspace.directory,
    branch: workspace.branch,
    hostId: workspace.hostId,
    pinned: workspace.pinnedAt !== null,
    labels: workspace.labels,
  };
}

function sameTarget(left: MenuTarget | null, right: MenuTarget | null): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return (
    left.title === right.title &&
    left.name === right.name &&
    left.directory === right.directory &&
    left.branch === right.branch &&
    left.hostId === right.hostId &&
    left.pinned === right.pinned &&
    left.labels.join("\n") === right.labels.join("\n")
  );
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const byLabel = (workspace: PluginWorkspaceSnapshot) => workspace.labels;

export function MenuItem({
  label,
  icon,
  onPress,
  theme,
  disabled = false,
  trailing,
  role = "button",
  checked,
  danger = false,
  iconColor,
}: {
  label: string;
  icon: string | null;
  onPress(): void;
  theme: PluginTheme;
  disabled?: boolean;
  trailing?: ReactNode;
  role?: "button" | "checkbox";
  checked?: boolean;
  /** Danger color for destructive actions. */
  danger?: boolean;
  /** Overrides the leading icon color. */
  iconColor?: string;
}) {
  const color = danger ? theme.colors.statusDanger : theme.colors.foreground;
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityLabel={label}
      accessibilityState={role === "checkbox" ? { checked, disabled } : { disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({
        minHeight: 36,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingHorizontal: 10,
        borderRadius: 8,
        backgroundColor: pressed || hovered ? theme.colors.surface2 : "transparent",
        opacity: disabled ? 0.5 : 1,
      })}
    >
      {icon ? (
        <View style={{ width: 18, alignItems: "center" }}>
          <Icon name={icon} color={iconColor ?? (danger ? color : theme.colors.foregroundMuted)} size={14} />
        </View>
      ) : null}
      <Text numberOfLines={1} style={{ flex: 1, minWidth: 0, color, fontSize: 13, lineHeight: 18 }}>
        {label}
      </Text>
      {trailing}
    </Pressable>
  );
}

/** Modal title back button (‹), as on the labels page. */
export function BackButton({ onPress, theme }: { onPress(): void; theme: PluginTheme }) {
  const t = useT();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("common.back")}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({
        width: 24,
        height: 24,
        borderRadius: 6,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: pressed || hovered ? theme.colors.surface2 : "transparent",
      })}
    >
      <Icon name="ChevronLeft" color={theme.colors.foreground} size={16} />
    </Pressable>
  );
}

const inputStyle = (theme: PluginTheme) => ({
  flex: 1,
  minHeight: 34,
  paddingHorizontal: 10,
  borderRadius: 8,
  borderWidth: 1,
  borderColor: theme.colors.border,
  backgroundColor: theme.colors.surface1,
  color: theme.colors.foreground,
  fontSize: 13,
});

/**
 * A workspace's ⋯ actions: copy path, copy branch name, rename, pin, labels, archive.
 * Rename, labels, and the archive confirmation open as pages inside the same modal.
 */
export function WorkspaceActionsModal({
  reference,
  onClose,
  theme,
}: {
  reference: WorkspaceRef | null;
  onClose(): void;
  theme: PluginTheme;
}) {
  const t = useT();
  const paseo = usePaseo();
  const toast = useToast();
  // A hook needs a ref every render; the snapshot of an unknown ref is null.
  const target = useWorkspace(reference ?? "", selectTarget, sameTarget);
  const [page, setPage] = useState<Page>("menu");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    setPage("menu");
    setBusy(false);
    setError(null);
    setQuery("");
  }, [reference]);

  // Labels already in use on this workspace's host; the SDK has no label catalog.
  const labelGroups = useWorkspaces({
    where: (workspace) => workspace.hostId === target?.hostId,
    groupBy: byLabel,
  });
  const knownLabels = useMemo(() => {
    const names = new Set(labelGroups.map((group) => group.key));
    for (const label of target?.labels ?? []) names.add(label);
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [labelGroups, target?.labels]);

  const open = reference !== null && target !== null;
  const handle = () => paseo.workspaces.ref(reference!);
  const goTo = (next: Page) => {
    setError(null);
    setPage(next);
  };

  const run = async (action: () => Promise<unknown>, closeAfter: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      if (closeAfter) onClose();
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setBusy(false);
    }
  };

  const copy = (text: string, message: string) =>
    void run(async () => {
      await copyText(text);
      toast.show(message, { variant: "success" });
    }, true);

  const saveTitle = () => {
    if (busy) return;
    const title = draft.trim();
    void run(() => handle().setTitle(title.length > 0 ? title : null), true);
  };

  const toggleLabel = (label: string) => {
    if (busy || !target) return;
    void run(() => handle().setLabel(label, { assigned: !target.labels.includes(label) }), false);
  };

  const createLabel = (name: string) => {
    if (busy) return;
    void run(async () => {
      await handle().setLabel(name, { assigned: true });
      setQuery("");
    }, false);
  };

  // Search filters the labels; a name with no exact (case-insensitive) match can be created.
  const search = query.trim();
  const needle = search.toLowerCase();
  const matches = needle ? knownLabels.filter((label) => label.toLowerCase().includes(needle)) : knownLabels;
  const exact = knownLabels.find((label) => label.toLowerCase() === needle) ?? null;
  const canCreate = search.length > 0 && exact === null;
  const submitQuery = () => {
    if (exact) toggleLabel(exact);
    else if (canCreate) createLabel(search);
  };

  const title =
    page === "rename"
      ? t("workspaceMenu.renameTitle")
      : page === "labels"
        ? t("workspaceMenu.labels")
        : page === "archive"
          ? t("workspaceMenu.archiveTitle")
          : (target?.title ?? t("workspaceMenu.fallbackTitle"));

  return (
    <Modal
      title={title}
      icon={
        page === "labels" ? (
          <BackButton onPress={() => goTo("menu")} theme={theme} />
        ) : undefined
      }
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <Modal.Content contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 12, gap: 2 }}>
        {target && page === "menu" ? (
          <>
            <MenuItem
              label={t("common.copyPath")}
              icon="Copy"
              disabled={busy}
              onPress={() => copy(target.directory, t("common.copiedPath"))}
              theme={theme}
            />
            {target.branch ? (
              <MenuItem
                label={t("workspaceMenu.copyBranch")}
                icon="Copy"
                disabled={busy}
                onPress={() => copy(target.branch!, t("workspaceMenu.copiedBranch"))}
                theme={theme}
              />
            ) : null}
            <MenuItem
              label={t("workspaceMenu.rename")}
              icon="Pencil"
              disabled={busy}
              onPress={() => {
                setDraft(target.title);
                goTo("rename");
              }}
              theme={theme}
            />
            <MenuItem
              label={target.pinned ? t("workspaceMenu.unpin") : t("workspaceMenu.pin")}
              icon={target.pinned ? "PinOff" : "Pin"}
              disabled={busy}
              onPress={() => void run(() => handle().setPinned(!target.pinned), true)}
              theme={theme}
            />
            <MenuItem
              label={t("workspaceMenu.labels")}
              icon="Tag"
              disabled={busy}
              onPress={() => goTo("labels")}
              trailing={<Icon name="ChevronRight" color={theme.colors.foregroundMuted} size={14} />}
              theme={theme}
            />
            <MenuItem label={t("workspaceMenu.archiveEllipsis")} icon="Archive" danger disabled={busy} onPress={() => goTo("archive")} theme={theme} />
          </>
        ) : null}

        {target && page === "rename" ? (
          <View style={{ gap: 12, paddingHorizontal: 8, paddingVertical: 4 }}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              onSubmitEditing={saveTitle}
              placeholder={target.name}
              placeholderTextColor={theme.colors.foregroundMuted}
              maxLength={200}
              autoFocus
              selectTextOnFocus
              accessibilityLabel={t("workspaceMenu.titleInput")}
              style={inputStyle(theme)}
            />
            <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12, lineHeight: 16 }}>
              {t("workspaceMenu.renameHint")}
            </Text>
            <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
              <Button label={t("common.back")} onPress={() => goTo("menu")} theme={theme} />
              <Button label={t("common.save")} tone="primary" disabled={busy} onPress={saveTitle} theme={theme} />
            </View>
          </View>
        ) : null}

        {target && page === "labels" ? (
          <>
            <View style={{ paddingBottom: 6 }}>
              <TextInput
                value={query}
                onChangeText={setQuery}
                onSubmitEditing={submitQuery}
                placeholder={t("workspaceMenu.labelSearch")}
                placeholderTextColor={theme.colors.foregroundMuted}
                maxLength={64}
                autoFocus
                accessibilityLabel={t("workspaceMenu.labelSearch")}
                // 1px border + 9px padding puts the text where row content starts (10px).
                style={{ ...inputStyle(theme), paddingHorizontal: 9 }}
              />
            </View>
            {knownLabels.length === 0 && !canCreate ? (
              <Text
                style={{ color: theme.colors.foregroundMuted, fontSize: 13, lineHeight: 18, paddingHorizontal: 10, paddingVertical: 8 }}
              >
                {t("workspaceMenu.noLabels")}
              </Text>
            ) : null}
            {matches.map((label) => {
              const assigned = target.labels.includes(label);
              return (
                <MenuItem
                  key={label}
                  label={label}
                  icon={assigned ? "SquareCheck" : "Square"}
                  iconColor={assigned ? theme.colors.foreground : theme.colors.foregroundMuted}
                  role="checkbox"
                  checked={assigned}
                  disabled={busy}
                  onPress={() => toggleLabel(label)}
                  theme={theme}
                />
              );
            })}
            {canCreate ? (
              <MenuItem
                label={t("workspaceMenu.createLabel", { name: search })}
                icon="Plus"
                disabled={busy}
                onPress={() => createLabel(search)}
                theme={theme}
              />
            ) : null}
          </>
        ) : null}

        {target && page === "archive" ? (
          <View style={{ gap: 12, paddingHorizontal: 8, paddingVertical: 4 }}>
            <Text style={{ color: theme.colors.foreground, fontSize: 13, lineHeight: 18 }}>
              {t("workspaceMenu.archiveConfirm", { name: target.title })}
            </Text>
            <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
              <Button label={t("common.cancel")} onPress={() => goTo("menu")} theme={theme} />
              <Button
                label={t("workspaceMenu.archive")}
                tone="danger"
                disabled={busy}
                onPress={() => void run(() => handle().archive(), true)}
                theme={theme}
              />
            </View>
          </View>
        ) : null}

        {error ? (
          <Text style={{ color: theme.colors.statusDanger, fontSize: 12, marginTop: 6, paddingHorizontal: 10 }}>{error}</Text>
        ) : null}
      </Modal.Content>
    </Modal>
  );
}
