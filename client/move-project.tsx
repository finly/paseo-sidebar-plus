import type { PluginTheme } from "@getpaseo/plugin";
import { Icon, Modal } from "@getpaseo/plugin/client/ui";
import { type ReactNode, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { type Group, groupOfProject, parentOf, subgroupsOf, topLevelGroups } from "../shared/groups";
import { GroupIconView, groupColorValue } from "./group-editor";
import { useGroups } from "./groups";
import { useT } from "./i18n";
import { BackButton } from "./workspace-actions";

export interface ProjectTarget {
  key: string;
  title: string;
}

function Choice({
  label,
  selected,
  disabled,
  onPress,
  leading,
  labelColor,
  indent = 0,
  theme,
}: {
  label: string;
  /** Extra left padding: subgroups list under their group. */
  indent?: number;
  /** Overrides the label color (a group's set color). */
  labelColor?: string;
  selected: boolean;
  disabled: boolean;
  onPress(): void;
  leading: ReactNode;
  theme: PluginTheme;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({
        minHeight: 36,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingLeft: 10 + indent,
        paddingRight: 10,
        borderRadius: 8,
        backgroundColor: pressed || hovered ? theme.colors.surface2 : "transparent",
        opacity: disabled && !selected ? 0.5 : 1,
      })}
    >
      <View style={{ width: 18, alignItems: "center" }}>{leading}</View>
      <Text numberOfLines={1} style={{ flex: 1, minWidth: 0, color: labelColor ?? theme.colors.foreground, fontSize: 13, lineHeight: 18 }}>
        {label}
      </Text>
      {selected ? <Icon name="Check" color={theme.colors.foreground} size={14} /> : null}
    </Pressable>
  );
}

/** Left padding of a subgroup choice under its group: the leading icon column plus the gap. */
const SUBGROUP_INDENT = 28;

/** A group choice: its icon (or color dot) and name tinted by its color, as on the group heading. */
function GroupChoice({
  group,
  selected,
  disabled,
  indent,
  onPress,
  theme,
}: {
  group: Group;
  selected: boolean;
  disabled: boolean;
  indent?: number;
  onPress(): void;
  theme: PluginTheme;
}) {
  const color = groupColorValue(group.color, theme);
  return (
    <Choice
      label={group.name}
      // As in the group heading: a set color tints the name; no color keeps the default text color.
      labelColor={group.color ? color : undefined}
      selected={selected}
      disabled={disabled}
      indent={indent}
      onPress={onPress}
      theme={theme}
      leading={
        group.icon ? (
          <GroupIconView icon={group.icon} color={color} size={14} />
        ) : (
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
        )
      }
    />
  );
}

/** Move a project into a group or back to ungrouped. Picking an option saves and closes. */
export function MoveProjectModal({
  project,
  onBack,
  onClose,
  onNewGroup,
  theme,
}: {
  project: ProjectTarget | null;
  /** Shows a back button in the title that returns to the project menu. */
  onBack?(project: ProjectTarget): void;
  onClose(): void;
  onNewGroup(): void;
  theme: PluginTheme;
}) {
  const t = useT();
  const { state, groups, moveProject } = useGroups();
  const [busy, setBusy] = useState(false);
  useEffect(() => setBusy(false), [project]);

  const current = project ? (groupOfProject(groups, project.key)?.id ?? null) : null;
  const disabled = state.status !== "ready" || busy;
  const choose = async (groupId: string | null) => {
    if (!project) return;
    if (groupId === current) return onClose();
    setBusy(true);
    const ok = await moveProject(project.key, groupId);
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <Modal
      title={project ? t("move.title", { name: project.title }) : t("move.projectFallback")}
      icon={project && onBack ? <BackButton onPress={() => onBack(project)} theme={theme} /> : undefined}
      open={project !== null}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <Modal.Content contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 12, gap: 2 }}>
        {topLevelGroups(groups).map((group) => (
          <View key={group.id} style={{ gap: 2 }}>
            <GroupChoice
              group={group}
              selected={current === group.id}
              disabled={disabled}
              onPress={() => void choose(group.id)}
              theme={theme}
            />
            {subgroupsOf(groups, group.id).map((subgroup) => (
              <GroupChoice
                key={subgroup.id}
                group={subgroup}
                selected={current === subgroup.id}
                disabled={disabled}
                indent={SUBGROUP_INDENT}
                onPress={() => void choose(subgroup.id)}
                theme={theme}
              />
            ))}
          </View>
        ))}
        <Choice
          label={t("common.ungrouped")}
          selected={current === null}
          disabled={disabled}
          onPress={() => void choose(null)}
          theme={theme}
          leading={<Icon name="FolderMinus" color={theme.colors.foregroundMuted} size={14} />}
        />
        <View style={{ height: 1, backgroundColor: theme.colors.border, marginVertical: 6 }} />
        <Choice
          label={t("common.newGroupEllipsis")}
          selected={false}
          disabled={false}
          onPress={onNewGroup}
          theme={theme}
          leading={<Icon name="Plus" color={theme.colors.foregroundMuted} size={14} />}
        />
        {state.saveError ? (
          <Text style={{ color: theme.colors.statusDanger, fontSize: 12, marginTop: 6 }}>{state.saveError}</Text>
        ) : null}
      </Modal.Content>
    </Modal>
  );
}

/** Move a subgroup under another top-level group, or make it a top-level group. Picking an option saves and closes. */
export function MoveGroupModal({
  group,
  onBack,
  onClose,
  theme,
}: {
  group: Group | null;
  /** Shows a back button in the title that returns to the group menu. */
  onBack?(group: Group): void;
  onClose(): void;
  theme: PluginTheme;
}) {
  const t = useT();
  const { state, groups, moveGroup } = useGroups();
  const [busy, setBusy] = useState(false);
  useEffect(() => setBusy(false), [group]);

  const current = group ? (parentOf(groups, group)?.id ?? null) : null;
  const disabled = state.status !== "ready" || busy;
  const choose = async (parentId: string | null) => {
    if (!group) return;
    if (parentId === current) return onClose();
    setBusy(true);
    const ok = await moveGroup(group.id, parentId);
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <Modal
      title={group ? t("move.title", { name: group.name }) : t("move.subgroupFallback")}
      icon={group && onBack ? <BackButton onPress={() => onBack(group)} theme={theme} /> : undefined}
      open={group !== null}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <Modal.Content contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 12, gap: 2 }}>
        {topLevelGroups(groups)
          .filter((entry) => entry.id !== group?.id)
          .map((entry) => (
            <GroupChoice
              key={entry.id}
              group={entry}
              selected={current === entry.id}
              disabled={disabled}
              onPress={() => void choose(entry.id)}
              theme={theme}
            />
          ))}
        <View style={{ height: 1, backgroundColor: theme.colors.border, marginVertical: 6 }} />
        <Choice
          label={t("move.makeTopLevel")}
          selected={current === null}
          disabled={disabled}
          onPress={() => void choose(null)}
          theme={theme}
          leading={<Icon name="FolderUp" color={theme.colors.foregroundMuted} size={14} />}
        />
        {state.saveError ? (
          <Text style={{ color: theme.colors.statusDanger, fontSize: 12, marginTop: 6 }}>{state.saveError}</Text>
        ) : null}
      </Modal.Content>
    </Modal>
  );
}
