import type { PluginTheme, WorkspaceIndicator } from "@getpaseo/plugin";
import { Icon, Modal, TextInput } from "@getpaseo/plugin/client/ui";
import { useEffect, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import type { HostColor } from "../shared/display-settings";
import type { Appearance } from "../shared/appearance";
import { GROUP_COLORS, type Group, type GroupColor, type GroupIcon } from "../shared/groups";
import { type GroupDraft, useGroups } from "./groups";
import { CountColumn } from "./count-chip";
import { LIST_INSET } from "../shared/display-settings";
import { UrgentDot } from "./urgent-status";
import { useT } from "./i18n";

/**
 * Display colors for named group colors, matching the Tailwind-named palette Paseo uses for labels.
 * Gray follows the theme so it stays legible in light and dark mode.
 */
const GROUP_COLOR_VALUES: Record<Exclude<GroupColor, "gray">, string> = {
  red: "#ef4444",
  orange: "#f97316",
  yellow: "#eab308",
  green: "#22c55e",
  teal: "#14b8a6",
  blue: "#3b82f6",
  purple: "#a855f7",
  pink: "#ec4899",
};

/** Display color of a host tag: muted for none, the theme accent, or a group color. */
export function hostColorValue(color: HostColor, theme: PluginTheme): string {
  if (color === "none") return theme.colors.foregroundMuted;
  return color === "accent" ? theme.colors.accent : groupColorValue(color, theme);
}

export function groupColorValue(color: GroupColor | null, theme: PluginTheme): string {
  if (!color || color === "gray") return theme.colors.foregroundMuted;
  return GROUP_COLOR_VALUES[color];
}

/** Curated Lucide icons offered in the picker (PascalCase export names). */
const LUCIDE_CHOICES = [
  "Folder",
  "FolderGit2",
  "FolderOpen",
  "FolderCode",
  "FolderKanban",
  "FolderTree",
  "FolderArchive",
  "FolderLock",
  "FolderHeart",
  "FolderCog",
  "Folders",
  "File",
  "FileText",
  "FileCode",
  "Files",
  "Notebook",
  "NotebookPen",
  "BookMarked",
  "Library",
  "ScrollText",
  "ClipboardList",
  "Briefcase",
  "Building2",
  "Code",
  "Terminal",
  "Rocket",
  "Star",
  "Pin",
  "Heart",
  "Flame",
  "Zap",
  "Bug",
  "Wrench",
  "FlaskConical",
  "BookOpen",
  "Globe",
  "Server",
  "Database",
  "Cloud",
  "Smartphone",
  "Layers",
  "Package",
  "Shield",
  "Users",
  "ShoppingCart",
  "CreditCard",
  "ChartColumn",
  "MessageSquare",
  "Mail",
  "Bot",
  "Sparkles",
  "Palette",
  "Image",
  "Video",
  "GraduationCap",
  "House",
  "Calendar",
  "Gamepad2",
  "GitBranch",
] as const;

/** A group's icon: Lucide in the group color, or an emoji. Renders nothing when the group has no icon. */
export function GroupIconView({ icon, color, size }: { icon: GroupIcon | null; color: string; size: number }) {
  if (!icon) return null;
  if (icon.kind === "lucide") return <Icon name={icon.name} color={color} size={size} />;
  return <Text style={{ fontSize: size, lineHeight: size + 4 }}>{icon.value}</Text>;
}

const EMPTY_DRAFT: GroupDraft = { name: "", color: null, icon: null };
const SWATCH = 24;
const ICON_CELL = 32;

function FieldLabel({ title, theme }: { title: string; theme: PluginTheme }) {
  return (
    <Text
      style={{
        color: theme.colors.foregroundMuted,
        fontSize: 11,
        lineHeight: 16,
        fontWeight: "600",
        letterSpacing: 0.6,
        textTransform: "uppercase",
        marginBottom: 6,
      }}
    >
      {title}
    </Text>
  );
}

export function Button({
  label,
  onPress,
  theme,
  tone = "default",
  disabled = false,
}: {
  label: string;
  onPress(): void;
  theme: PluginTheme;
  tone?: "default" | "primary" | "danger";
  disabled?: boolean;
}) {
  const background =
    tone === "primary" ? theme.colors.accent : tone === "danger" ? theme.colors.statusDanger : theme.colors.surface2;
  const foreground = tone === "default" ? theme.colors.foreground : theme.colors.accentForeground;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 32,
        paddingHorizontal: 14,
        borderRadius: 8,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: background,
        opacity: disabled ? 0.5 : pressed ? 0.8 : 1,
      })}
    >
      <Text style={{ color: foreground, fontSize: 13, lineHeight: 18, fontWeight: "600" }}>{label}</Text>
    </Pressable>
  );
}

/**
 * Color swatches and Lucide/emoji icon picker shared by the group, project, and Pinned editors.
 * `emoji` is the emoji input text, kept by the editor so it can reset on open.
 */
export function AppearanceFields({
  value,
  onChange,
  emoji,
  onEmojiChange,
  theme,
}: {
  value: Appearance;
  onChange(next: Appearance): void;
  emoji: string;
  onEmojiChange(text: string): void;
  theme: PluginTheme;
}) {
  const t = useT();
  const accent = groupColorValue(value.color, theme);
  return (
    <>
      <View>
        <FieldLabel title={t("editor.color")} theme={theme} />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {[null, ...GROUP_COLORS].map((color) => {
            const selected = value.color === color;
            const label = color ?? "none";
            return (
              <Pressable
                key={label}
                accessibilityRole="radio"
                accessibilityLabel={t("a11y.color", { color: t(`colors.${label}`) })}
                accessibilityState={{ selected }}
                onPress={() => onChange({ ...value, color })}
                style={{
                  width: SWATCH + 6,
                  height: SWATCH + 6,
                  borderRadius: (SWATCH + 6) / 2,
                  borderWidth: 2,
                  borderColor: selected ? (color ? groupColorValue(color, theme) : theme.colors.foregroundMuted) : "transparent",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <View
                  style={{
                    width: SWATCH,
                    height: SWATCH,
                    borderRadius: SWATCH / 2,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: color ? groupColorValue(color, theme) : "transparent",
                    borderWidth: color ? 0 : 1,
                    borderColor: theme.colors.border,
                  }}
                >
                  {color ? null : <Icon name="Ban" color={theme.colors.foregroundMuted} size={14} />}
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View>
        <FieldLabel title={t("editor.icon")} theme={theme} />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
          {[null, ...LUCIDE_CHOICES].map((iconName) => {
            const selected = iconName ? value.icon?.kind === "lucide" && value.icon.name === iconName : !value.icon;
            const label = iconName ?? "none";
            return (
              <Pressable
                key={label}
                accessibilityRole="radio"
                accessibilityLabel={t("a11y.icon", { icon: iconName ?? t("editor.noIcon") })}
                accessibilityState={{ selected }}
                onPress={() => {
                  onEmojiChange("");
                  onChange({ ...value, icon: iconName ? { kind: "lucide", name: iconName } : null });
                }}
                style={({ pressed }) => ({
                  width: ICON_CELL,
                  height: ICON_CELL,
                  borderRadius: 8,
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: 1,
                  borderColor: selected ? (iconName ? accent : theme.colors.foregroundMuted) : "transparent",
                  backgroundColor: pressed ? theme.colors.surface2 : "transparent",
                })}
              >
                <Icon
                  name={iconName ?? "Ban"}
                  color={iconName ? accent : theme.colors.foregroundMuted}
                  size={16}
                />
              </Pressable>
            );
          })}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10 }}>
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 13 }}>{t("editor.orEmoji")}</Text>
          <TextInput
            value={emoji}
            onChangeText={(text) => {
              onEmojiChange(text);
              const typed = text.trim();
              onChange({
                ...value,
                icon: typed ? { kind: "emoji", value: typed } : value.icon?.kind === "emoji" ? null : value.icon,
              });
            }}
            placeholder="🚀"
            placeholderTextColor={theme.colors.foregroundMuted}
            maxLength={16}
            accessibilityLabel={t("editor.emojiIcon")}
            style={{
              width: 64,
              minHeight: 34,
              paddingHorizontal: 10,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: value.icon?.kind === "emoji" ? theme.colors.foreground : theme.colors.border,
              backgroundColor: theme.colors.surface1,
              color: theme.colors.foreground,
              fontSize: 16,
              textAlign: "center",
            }}
          />
        </View>
      </View>
    </>
  );
}

/**
 * Create or edit a group: name, color, and a Lucide icon or emoji. Delete lives in the group ⋯ menu.
 * `group` null with `open` true creates a new group.
 */
export function GroupEditorModal({
  open,
  group,
  parentId = null,
  onClose,
  theme,
}: {
  open: boolean;
  group: Group | null;
  /** When creating: the top-level group the new group goes under as a subgroup; null creates a top-level group. */
  parentId?: string | null;
  onClose(): void;
  theme: PluginTheme;
}) {
  const t = useT();
  const { state, createGroup, updateGroup } = useGroups();
  const [draft, setDraft] = useState<GroupDraft>(EMPTY_DRAFT);
  const [emoji, setEmoji] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const initial = group ? { name: group.name, color: group.color, icon: group.icon } : EMPTY_DRAFT;
    setDraft(initial);
    setEmoji(initial.icon?.kind === "emoji" ? initial.icon.value : "");
    setBusy(false);
  }, [open, group]);

  const ready = state.status === "ready";
  const name = draft.name.trim();
  const canSave = ready && !busy && name.length > 0;

  const run = async (action: () => Promise<boolean>) => {
    setBusy(true);
    const ok = await action();
    setBusy(false);
    if (ok) onClose();
  };
  const save = () => {
    if (!canSave) return;
    const next = { ...draft, name };
    void run(() => (group ? updateGroup(group.id, next) : createGroup(next, parentId)));
  };

  return (
    <Modal
      title={
        group
          ? group.parentId
            ? t("editor.editSubgroup")
            : t("editor.editGroup")
          : parentId
            ? t("editor.newSubgroup")
            : t("editor.newGroup")
      }
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <Modal.Content contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 16, gap: 16 }}>
        <View>
          <FieldLabel title={t("editor.name")} theme={theme} />
          <TextInput
            value={draft.name}
            onChangeText={(text) => setDraft((current) => ({ ...current, name: text }))}
            onSubmitEditing={save}
            placeholder={t("editor.groupName")}
            placeholderTextColor={theme.colors.foregroundMuted}
            maxLength={80}
            autoFocus
            accessibilityLabel={t("editor.groupName")}
            style={{
              minHeight: 34,
              paddingHorizontal: 10,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.surface1,
              color: theme.colors.foreground,
              fontSize: 13,
            }}
          />
        </View>

        <AppearanceFields
          value={draft}
          onChange={(next) => setDraft((current) => ({ ...current, color: next.color, icon: next.icon }))}
          emoji={emoji}
          onEmojiChange={setEmoji}
          theme={theme}
        />

        {state.saveError ? (
          <Text style={{ color: theme.colors.statusDanger, fontSize: 12 }}>{state.saveError}</Text>
        ) : null}

        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 }}>
          <View style={{ flex: 1 }} />
          <Button label={t("common.cancel")} onPress={onClose} theme={theme} />
          <Button label={group ? t("common.save") : t("common.create")} tone="primary" disabled={!canSave} onPress={save} theme={theme} />
        </View>
      </Modal.Content>
    </Modal>
  );
}

/**
 * Edit a heading's color and icon only (no name): projects and the Pinned section.
 * `note` shows as an info callout above the fields. `onSave` resolves true when saved; the modal then closes.
 */
export function AppearanceEditorModal({
  open,
  title,
  value,
  ready,
  saveError,
  note,
  onSave,
  onClose,
  theme,
}: {
  open: boolean;
  title: string;
  value: Appearance;
  note?: string;
  ready: boolean;
  saveError: string | null | undefined;
  onSave(next: Appearance): Promise<boolean>;
  onClose(): void;
  theme: PluginTheme;
}) {
  const t = useT();
  const [draft, setDraft] = useState<Appearance>(value);
  const [emoji, setEmoji] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraft(value);
    setEmoji(value.icon?.kind === "emoji" ? value.icon.value : "");
    setBusy(false);
    // Reset only on open, so a remote change does not discard the draft mid-edit.
  }, [open]);

  const canSave = ready && !busy;
  const save = async () => {
    if (!canSave) return;
    setBusy(true);
    const ok = await onSave(draft);
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <Modal
      title={title}
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <Modal.Content contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 16, gap: 16 }}>
        {note ? (
          <View
            accessibilityRole="text"
            style={{
              flexDirection: "row",
              alignItems: "flex-start",
              gap: 8,
              paddingHorizontal: 12,
              paddingVertical: 10,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.surface1,
            }}
          >
            <View style={{ paddingTop: 1 }}>
              <Icon name="Info" color={theme.colors.accent} size={14} />
            </View>
            <Text style={{ flex: 1, minWidth: 0, color: theme.colors.foregroundMuted, fontSize: 12, lineHeight: 17 }}>{note}</Text>
          </View>
        ) : null}

        <AppearanceFields value={draft} onChange={setDraft} emoji={emoji} onEmojiChange={setEmoji} theme={theme} />

        {saveError ? <Text style={{ color: theme.colors.statusDanger, fontSize: 12 }}>{saveError}</Text> : null}

        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 }}>
          <View style={{ flex: 1 }} />
          <Button label={t("common.cancel")} onPress={onClose} theme={theme} />
          <Button label={t("common.save")} tone="primary" disabled={!canSave} onPress={() => void save()} theme={theme} />
        </View>
      </Modal.Content>
    </Modal>
  );
}

/** A heading's leading mark, as on group headings: the icon, else a color dot, else nothing. */
export function HeadingMark({
  appearance,
  theme,
  fontSize,
}: {
  appearance: Appearance;
  theme: PluginTheme;
  fontSize: number;
}) {
  const color = groupColorValue(appearance.color, theme);
  if (appearance.icon) return <GroupIconView icon={appearance.icon} color={color} size={fontSize + 1} />;
  if (appearance.color) return <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />;
  return null;
}

/** A heading name's color: the set color, else `fallback`. */
export function headingNameColor(appearance: Appearance, theme: PluginTheme, fallback: string): string {
  return appearance.color ? groupColorValue(appearance.color, theme) : fallback;
}

/** Heading + and ⋯ buttons always show, on every platform. */
const SHOW_ACTIONS_ALWAYS = true;

/**
 * A group's section heading: collapse chevron, icon, name, project count, and a ⋯ menu button
 * (always shown). Press toggles collapse.
 */
export function GroupHeader({
  group,
  collapsed,
  count,
  onToggle,
  onMenu,
  status = null,
  tight = false,
  pressProps,
  theme,
  fontSize,
  lineHeight,
}: {
  group: Group;
  /** First in its parent group (a subgroup): less space above. */
  tight?: boolean;
  collapsed: boolean;
  count: number;
  /** Shown while collapsed: the most urgent workspace status inside the group. */
  status?: WorkspaceIndicator | null;
  onToggle(): void;
  onMenu(): void;
  /** Long-press handling for the heading (drag arming on touch). */
  pressProps?: { onLongPress?(): void; onPressOut?(): void; delayLongPress?: number };
  theme: PluginTheme;
  fontSize: number;
  lineHeight: number;
}) {
  const t = useT();
  const [hovered, setHovered] = useState(false);
  // On web, hovering the nested button fires the heading's hover-out, so the button tracks its own hover too.
  const [buttonHovered, setButtonHovered] = useState(false);
  const color = groupColorValue(group.color, theme);
  const showActions = SHOW_ACTIONS_ALWAYS || hovered || buttonHovered;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t(collapsed ? "a11y.expandGroup" : "a11y.collapseGroup", { name: group.name })}
      accessibilityState={{ expanded: !collapsed }}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onPress={onToggle}
      {...pressProps}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingLeft: LIST_INSET,
        paddingRight: 8,
        paddingTop: tight ? 4 : 16,
        paddingBottom: 4,
      }}
    >
      <Icon name={collapsed ? "ChevronRight" : "ChevronDown"} color={theme.colors.foregroundMuted} size={fontSize} />
      {group.icon ? (
        <GroupIconView icon={group.icon} color={color} size={fontSize + 1} />
      ) : group.color ? (
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
      ) : null}
      <Text
        numberOfLines={1}
        style={{
          flex: 1,
          minWidth: 0,
          // The group color tints the name too; no color keeps the default text color.
          color: group.color ? color : theme.colors.foreground,
          fontSize,
          lineHeight,
          fontWeight: "600",
        }}
      >
        {group.name}
      </Text>
      {collapsed ? <UrgentDot indicator={status} theme={theme} /> : null}
      {/* 2px before ⋯, as between the view header buttons: the count centers under the new group button. */}
      <CountColumn count={count} theme={theme} marginRight={2 - 6} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("a11y.groupActions", { name: group.name })}
        onHoverIn={() => setButtonHovered(true)}
        onHoverOut={() => setButtonHovered(false)}
        onPress={onMenu}
        style={({ pressed }) => ({
          // Same size and right edge as the view header buttons, so the ⋯ lines up under them.
          width: 28,
          height: 28,
          marginVertical: -3,
          borderRadius: 6,
          alignItems: "center",
          justifyContent: "center",
          opacity: showActions ? 1 : 0,
          backgroundColor: pressed || buttonHovered ? theme.colors.surface2 : "transparent",
        })}
      >
        <Icon name="Ellipsis" color={theme.colors.foregroundMuted} size={14} />
      </Pressable>
    </Pressable>
  );
}
