import type { PluginTheme } from "@getpaseo/plugin";
import { Icon, Modal, TextInput } from "@getpaseo/plugin/client/ui";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Animated, Easing, Platform, Pressable, Text, View } from "react-native";
import {
  type ChecksDisplay,
  type DisplaySettings,
  type FieldPlacement,
  type Grouping,
  type HostColor,
  type Indentation,
  type RowField,
  type RowHeight,
  type SortOrder,
  type TextSize,
  type TitleSource,
  HOST_COLORS,
  ROW_FIELDS,
} from "../shared/display-settings";
import { useHosts } from "@getpaseo/plugin/client";
import { type FilterKind, type Filters, UNLABELLED_KEY } from "../shared/filters";
import { useDisplaySettings } from "./display-settings";
import { hostColorValue } from "./group-editor";
import { type MessageKey, type Translate, useT } from "./i18n";

const FIELD_LABELS: Record<RowField, MessageKey> = {
  branch: "fields.branch",
  project: "fields.project",
  pullRequest: "fields.pullRequest",
  checks: "fields.checks",
  services: "fields.services",
  labels: "fields.labels",
  diffStats: "fields.diffStats",
};

interface Option<Value extends string> {
  readonly label: MessageKey;
  readonly value: Value;
}

const PLACEMENT_OPTIONS: readonly Option<FieldPlacement>[] = [
  { label: "options.line2", value: "line2" },
  { label: "options.line3", value: "line3" },
  { label: "options.off", value: "hidden" },
];

const CHECKS_DISPLAY_OPTIONS: readonly Option<ChecksDisplay>[] = [
  { label: "options.iconAndText", value: "iconAndText" },
  { label: "options.iconOnly", value: "icon" },
  { label: "options.hidden", value: "none" },
];

const TITLE_OPTIONS: readonly Option<TitleSource>[] = [
  { label: "options.title", value: "title" },
  { label: "options.name", value: "name" },
  { label: "options.branch", value: "branch" },
];

const GROUPING_OPTIONS: readonly Option<Grouping>[] = [
  { label: "options.project", value: "project" },
  { label: "options.status", value: "status" },
  { label: "options.labels", value: "label" },
];

const SORT_OPTIONS: readonly Option<SortOrder>[] = [
  { label: "options.name", value: "name" },
  { label: "options.activity", value: "lastActivity" },
  { label: "options.created", value: "created" },
];

const TEXT_SIZE_OPTIONS: readonly Option<TextSize>[] = [
  { label: "options.small", value: "small" },
  { label: "options.default", value: "default" },
  { label: "options.large", value: "large" },
];

const ROW_HEIGHT_OPTIONS: readonly Option<RowHeight>[] = [
  { label: "options.compact", value: "compact" },
  { label: "options.default", value: "default" },
  { label: "options.roomy", value: "comfortable" },
];

const INDENT_OPTIONS: readonly Option<Indentation>[] = [
  { label: "options.small", value: "small" },
  { label: "options.medium", value: "medium" },
  { label: "options.large", value: "large" },
];

const ROW_HEIGHT = 34;
/** Every segmented control has the same width, split evenly between its segments. */
const SEGMENTED_WIDTH = 228;
/** Child rows sit under their section heading. */
const SECTION_INDENT = 12;

/** Blend a theme color toward transparent. Non-hex colors fall back to the solid color. */
function withAlpha(color: string, alpha: number): string {
  if (!/^#[0-9a-f]{6}$/i.test(color)) return color;
  return `${color}${Math.round(alpha * 255)
    .toString(16)
    .padStart(2, "0")}`;
}

/** True when the theme is dark, judged by the luminance of its base surface. */
function isDarkTheme(theme: PluginTheme): boolean {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(theme.colors.surface0);
  if (!match) return true;
  const [r, g, b] = match.slice(1).map((part) => Number.parseInt(part, 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 128;
}

/** iOS look: a raised surface is a light gray in dark mode and white with a soft shadow in light mode. */
function raisedStyle(theme: PluginTheme, darkAlpha: number) {
  const dark = isDarkTheme(theme);
  return {
    backgroundColor: dark ? withAlpha(theme.colors.foreground, darkAlpha) : theme.colors.surface0,
    shadowColor: theme.colors.foreground,
    shadowOpacity: dark ? 0 : 0.12,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: dark ? 0 : 2,
  } as const;
}

const USE_NATIVE_DRIVER = Platform.OS !== "web";
const SLIDE = { duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: USE_NATIVE_DRIVER };

const TRACK_PADDING = 2;
const TRACK_HEIGHT = 28;

/** iOS segmented control: gray track, raised thumb that slides to the selection, equal-width segments. */
function Segmented<Value extends string>({
  options,
  value,
  onChange,
  disabled,
  theme,
  label,
}: {
  options: readonly Option<Value>[];
  value: Value;
  onChange(value: Value): void;
  disabled: boolean;
  theme: PluginTheme;
  label: string;
}) {
  const t = useT();
  const segmentWidth = (SEGMENTED_WIDTH - TRACK_PADDING * 2) / options.length;
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const position = useRef(new Animated.Value(selectedIndex)).current;
  useEffect(() => {
    Animated.timing(position, { ...SLIDE, toValue: selectedIndex }).start();
  }, [position, selectedIndex]);
  const dark = isDarkTheme(theme);
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={{
        width: SEGMENTED_WIDTH,
        height: TRACK_HEIGHT,
        flexDirection: "row",
        padding: TRACK_PADDING,
        borderRadius: 9,
        backgroundColor: withAlpha(theme.colors.foreground, dark ? 0.1 : 0.06),
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          raisedStyle(theme, 0.22),
          {
            position: "absolute",
            top: TRACK_PADDING,
            left: TRACK_PADDING,
            width: segmentWidth,
            height: TRACK_HEIGHT - TRACK_PADDING * 2,
            borderRadius: 7,
            transform: [
              {
                translateX: position.interpolate({
                  inputRange: [0, Math.max(1, options.length - 1)],
                  outputRange: [0, segmentWidth * Math.max(1, options.length - 1)],
                }),
              },
            ],
          },
        ]}
      />
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ selected, disabled }}
            accessibilityLabel={t("a11y.option", { name: label, value: t(option.label) })}
            disabled={disabled}
            onPress={() => {
              if (!selected) onChange(option.value);
            }}
            style={({ pressed }) => ({
              width: segmentWidth,
              alignItems: "center",
              justifyContent: "center",
              opacity: pressed && !selected ? 0.5 : 1,
            })}
          >
            <Text
              numberOfLines={1}
              style={{
                fontSize: 13,
                lineHeight: 18,
                fontWeight: selected ? "600" : "500",
                color: theme.colors.foreground,
              }}
            >
              {t(option.label)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function SectionTitle({ title, theme }: { title: string; theme: PluginTheme }) {
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

function OptionRow({ label, theme, children }: { label: string; theme: PluginTheme; children: ReactNode }) {
  return (
    <View style={{ minHeight: ROW_HEIGHT, marginVertical: 2, flexDirection: "row", alignItems: "center", gap: 12 }}>
      <Text numberOfLines={1} style={{ flex: 1, minWidth: 0, color: theme.colors.foreground, fontSize: 13 }}>
        {label}
      </Text>
      {children}
    </View>
  );
}

/** A number option: a small field that commits on blur or Enter and clamps to its bounds. */
function NumberRow({
  label,
  value,
  min,
  max,
  onChange,
  disabled,
  theme,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange(value: number): void;
  disabled: boolean;
  theme: PluginTheme;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    setDraft(null);
    const parsed = Number.parseInt(draft, 10);
    if (!Number.isFinite(parsed)) return;
    const next = Math.min(max, Math.max(min, parsed));
    if (next !== value) onChange(next);
  };
  return (
    <OptionRow label={label} theme={theme}>
      <TextInput
        value={draft ?? String(value)}
        onFocus={() => setDraft(String(value))}
        onChangeText={(text) => setDraft(text.replace(/\D/g, "").slice(0, 3))}
        onBlur={commit}
        onSubmitEditing={commit}
        onKeyPress={(event) => {
          if (event.nativeEvent.key === "Escape") setDraft(null);
        }}
        keyboardType="number-pad"
        accessibilityLabel={label}
        editable={!disabled}
        style={{
          width: 64,
          height: 28,
          paddingVertical: 0,
          paddingHorizontal: 8,
          textAlign: "right",
          borderRadius: 6,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface1,
          color: theme.colors.foreground,
          fontSize: 13,
          opacity: disabled ? 0.5 : 1,
          // Web: no focus ring on the input; the border already frames it.
          outlineWidth: 0,
          outlineStyle: "none" as "solid",
        }}
      />
    </OptionRow>
  );
}

const HOST_SWATCH = 14;
/** Swatch plus its selection ring. */
const HOST_SWATCH_RING = HOST_SWATCH + 6;

/** One host's tag color picker: none, then the theme accent, then the group colors. Fits the segmented control width. */
function HostColorPicker({
  value,
  onChange,
  disabled,
  theme,
}: {
  value: HostColor;
  onChange(value: HostColor): void;
  disabled: boolean;
  theme: PluginTheme;
}) {
  const t = useT();
  return (
    <View
      accessibilityRole="radiogroup"
      style={{
        width: SEGMENTED_WIDTH,
        flexDirection: "row",
        justifyContent: "space-between",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {HOST_COLORS.map((color) => {
        const selected = value === color;
        const display = hostColorValue(color, theme);
        return (
          <Pressable
            key={color}
            accessibilityRole="radio"
            accessibilityLabel={t("a11y.hostColor", { color: t(`colors.${color}`) })}
            accessibilityState={{ selected, disabled }}
            disabled={disabled}
            onPress={() => onChange(color)}
            style={{
              width: HOST_SWATCH_RING,
              height: HOST_SWATCH_RING,
              borderRadius: HOST_SWATCH_RING / 2,
              borderWidth: 2,
              borderColor: selected ? display : "transparent",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <View
              style={{
                width: HOST_SWATCH,
                height: HOST_SWATCH,
                borderRadius: HOST_SWATCH / 2,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: color === "none" ? "transparent" : display,
                borderWidth: color === "none" ? 1 : 0,
                borderColor: theme.colors.border,
              }}
            >
              {color === "none" ? <Icon name="Ban" color={theme.colors.foregroundMuted} size={HOST_SWATCH - 2} /> : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const SWITCH_WIDTH = 42;
const SWITCH_HEIGHT = 26;
const KNOB_SIZE = 22;

/** iOS switch row: label on the left, track and sliding knob on the right. */
function SwitchRow({
  label,
  value,
  onChange,
  disabled,
  theme,
}: {
  label: string;
  value: boolean;
  onChange(value: boolean): void;
  disabled: boolean;
  theme: PluginTheme;
}) {
  const progress = useRef(new Animated.Value(value ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(progress, { ...SLIDE, toValue: value ? 1 : 0 }).start();
  }, [progress, value]);
  const dark = isDarkTheme(theme);
  const travel = SWITCH_WIDTH - KNOB_SIZE - 4;
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel={label}
      disabled={disabled}
      onPress={() => onChange(!value)}
      style={{
        minHeight: ROW_HEIGHT,
        marginVertical: 2,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Text numberOfLines={1} style={{ flex: 1, minWidth: 0, color: theme.colors.foreground, fontSize: 13 }}>
        {label}
      </Text>
      <View
        style={{
          width: SWITCH_WIDTH,
          height: SWITCH_HEIGHT,
          borderRadius: SWITCH_HEIGHT / 2,
          padding: 2,
          justifyContent: "center",
          backgroundColor: value ? theme.colors.accent : withAlpha(theme.colors.foreground, dark ? 0.16 : 0.1),
        }}
      >
        <Animated.View
          style={[
            raisedStyle(theme, 1),
            {
              width: KNOB_SIZE,
              height: KNOB_SIZE,
              borderRadius: KNOB_SIZE / 2,
              transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [0, travel] }) }],
            },
          ]}
        />
      </View>
    </Pressable>
  );
}

/** Sliders icon (Lucide "settings-2") drawn with Views, since the host Icon renders nothing here. */
function SlidersIcon({ color, size = 16 }: { color: string; size?: number }) {
  const unit = size / 24;
  const stroke = Math.max(1.25, 2 * unit);
  const ring = 6 * unit + stroke;
  const line = (left: number, right: number, y: number) => (
    <View
      style={{
        position: "absolute",
        left: left * unit,
        width: (right - left) * unit,
        top: y * unit - stroke / 2,
        height: stroke,
        borderRadius: stroke / 2,
        backgroundColor: color,
      }}
    />
  );
  const circle = (cx: number, cy: number) => (
    <View
      style={{
        position: "absolute",
        left: cx * unit - ring / 2,
        top: cy * unit - ring / 2,
        width: ring,
        height: ring,
        borderRadius: ring / 2,
        borderWidth: stroke,
        borderColor: color,
      }}
    />
  );
  return (
    <View style={{ width: size, height: size }}>
      {line(5, 14, 17)}
      {line(10, 19, 7)}
      {circle(17, 17)}
      {circle(7, 7)}
    </View>
  );
}

/** Filter choices, computed by the view from its workspaces. */
export interface FilterOptions {
  /** Projects with workspaces, narrowed by the host filter. */
  readonly projects: readonly { readonly key: string; readonly title: string; readonly hostId: string }[];
  /** Labels in use, keyed by label key. */
  readonly labels: readonly { readonly key: string; readonly name: string }[];
}

/** A filter's heading row: name, current selection, and a chevron that shows or hides its choices. */
function FilterDisclosure({
  label,
  summary,
  active,
  expanded,
  onToggle,
  disabled,
  theme,
  accessibilityLabel,
}: {
  label: string;
  summary: string;
  active: boolean;
  expanded: boolean;
  onToggle(): void;
  disabled: boolean;
  theme: PluginTheme;
  accessibilityLabel?: string;
}) {
  const t = useT();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? t("a11y.filter", { name: label, value: summary })}
      accessibilityState={{ expanded, disabled }}
      disabled={disabled}
      onPress={onToggle}
      style={({ pressed }) => ({
        minHeight: ROW_HEIGHT,
        marginVertical: 2,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        opacity: disabled ? 0.5 : pressed ? 0.6 : 1,
      })}
    >
      <Text numberOfLines={1} style={{ color: theme.colors.foreground, fontSize: 13 }}>
        {label}
      </Text>
      <Text
        numberOfLines={1}
        style={{
          flex: 1,
          minWidth: 0,
          textAlign: "right",
          color: active ? theme.colors.accent : theme.colors.foregroundMuted,
          fontSize: 13,
        }}
      >
        {summary}
      </Text>
      <Icon name={expanded ? "ChevronDown" : "ChevronRight"} color={theme.colors.foregroundMuted} size={14} />
    </Pressable>
  );
}

/** One filter choice: optional leading icon, name, optional muted detail, and a check when selected. */
function FilterChoice({
  label,
  icon,
  detail,
  selected,
  onPress,
  disabled,
  theme,
}: {
  label: string;
  icon?: string;
  detail?: string;
  selected: boolean;
  onPress(): void;
  disabled: boolean;
  theme: PluginTheme;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 30,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        opacity: disabled ? 0.5 : pressed ? 0.6 : 1,
      })}
    >
      {icon ? <Icon name={icon} color={theme.colors.foregroundMuted} size={13} /> : null}
      <Text numberOfLines={1} style={{ flexShrink: 1, color: theme.colors.foreground, fontSize: 13 }}>
        {label}
      </Text>
      <Text numberOfLines={1} style={{ flex: 1, minWidth: 0, color: theme.colors.foregroundMuted, fontSize: 12 }}>
        {detail ?? ""}
      </Text>
      <View style={{ width: 16, alignItems: "center" }}>
        {selected ? <Icon name="Check" color={theme.colors.accent} size={14} /> : null}
      </View>
    </Pressable>
  );
}

/** "All", one name, or a count. */
function filterSummary(
  selected: readonly string[],
  all: string,
  nameOf: (key: string) => string,
  countOf: (count: number) => string,
): string {
  if (selected.length === 0) return all;
  if (selected.length === 1) return nameOf(selected[0]);
  return countOf(selected.length);
}

const hostCount = (t: Translate) => (count: number) => t("filter.hostCount", { count });

/** "Workspaces" header with a display preferences button, matching Paseo's own sidebar header. */
export function ViewOptionsHeader({
  theme,
  settings,
  filters,
  filterOptions,
  onNewGroup,
  search,
  rightInset = 0,
  collapseByDefault,
  onCollapseByDefaultChange,
}: {
  theme: PluginTheme;
  settings: DisplaySettings;
  /** The filters as applied (stale keys resolved away). */
  filters: Filters;
  filterOptions: FilterOptions;
  onNewGroup(): void;
  /** The search field, shown in place of a title, left of the header buttons. */
  search: ReactNode;
  /** The list's scrollbar gutter: keeps the header buttons in line with the list's + and ⋯ buttons. */
  rightInset?: number;
  /** Device-scoped: groups, projects, and sections start collapsed; their expanded ones stay expanded. */
  collapseByDefault: boolean;
  onCollapseByDefaultChange(value: boolean): void;
}) {
  const t = useT();
  const [expandedFilter, setExpandedFilter] = useState<FilterKind | null>(null);
  const toggleExpanded = (kind: FilterKind) => setExpandedFilter((current) => (current === kind ? null : kind));
  const [hostColorsExpanded, setHostColorsExpanded] = useState(false);
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [newGroupHovered, setNewGroupHovered] = useState(false);
  const { state, filters: storedFilters, setFieldPlacement, setOption, setHostColor, toggleFilter, clearFilters } = useDisplaySettings();
  const hosts = useHosts();
  const disabled = state.status !== "ready";
  const hostName = (serverId: string) => hosts.find((host) => host.serverId === serverId)?.label?.trim() || serverId;
  const projectName = (key: string) => filterOptions.projects.find((project) => project.key === key)?.title ?? key;
  const labelName = (key: string) =>
    key === UNLABELLED_KEY ? t("common.unlabelled") : (filterOptions.labels.find((label) => label.key === key)?.name ?? key);
  // As in Paseo: a filter shows only when it can narrow the list; the label filter also while it is set, so it can be cleared.
  const showHostFilter = hosts.length > 1;
  const showProjectFilter = filterOptions.projects.length > 1;
  const showLabelFilter = filterOptions.labels.length > 0 || storedFilters.labels.length > 0;
  return (
    <View
      style={{
        zIndex: 1,
        flexDirection: "row",
        alignItems: "center",
        // Space between the search box and the header buttons.
        gap: 12,
        paddingLeft: 8,
        paddingRight: 8 + rightInset,
        paddingVertical: 6,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
      }}
    >
      {search}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
        {/* Groups only exist in project grouping. */}
        {settings.grouping === "project" ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("common.newGroup")}
            onPress={() => {
              setNewGroupHovered(false);
              onNewGroup();
            }}
            onHoverIn={() => setNewGroupHovered(true)}
            onHoverOut={() => setNewGroupHovered(false)}
            style={({ pressed }) => ({
              width: 28,
              height: 28,
              borderRadius: 6,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: pressed || newGroupHovered ? theme.colors.surface2 : "transparent",
            })}
          >
            <Icon
              name="ListPlus"
              size={16}
              color={newGroupHovered ? theme.colors.foreground : theme.colors.foregroundMuted}
            />
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("options.preferences")}
          onPress={() => {
            setHovered(false);
            setOpen(true);
          }}
          onHoverIn={() => setHovered(true)}
          onHoverOut={() => setHovered(false)}
          style={({ pressed }) => ({
            width: 28,
            height: 28,
            borderRadius: 6,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: pressed || hovered ? theme.colors.surface2 : "transparent",
          })}
        >
          <SlidersIcon color={hovered ? theme.colors.foreground : theme.colors.foregroundMuted} />
        </Pressable>
      </View>
      <Modal title={t("options.preferences")} open={open} onOpenChange={setOpen}>
        <Modal.Content contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 16, gap: 16 }}>
          <View>
            <SectionTitle title={t("options.show")} theme={theme} />
            <View style={{ paddingLeft: SECTION_INDENT }}>
              {ROW_FIELDS.map((field) => (
                <OptionRow key={field} label={t(FIELD_LABELS[field])} theme={theme}>
                  <Segmented
                    label={t(FIELD_LABELS[field])}
                    options={PLACEMENT_OPTIONS}
                    value={settings.fields[field]}
                    onChange={(value) => void setFieldPlacement(field, value)}
                    disabled={disabled}
                    theme={theme}
                  />
                </OptionRow>
              ))}
            </View>
          </View>
          {showHostFilter || showProjectFilter || showLabelFilter ? (
            <View>
              <SectionTitle title={t("options.filter")} theme={theme} />
              <View style={{ paddingLeft: SECTION_INDENT }}>
                {showHostFilter ? (
                  <>
                    <FilterDisclosure
                      label={t("filter.host")}
                      summary={filterSummary(filters.hosts, t("filter.allHosts"), hostName, hostCount(t))}
                      active={filters.hosts.length > 0}
                      expanded={expandedFilter === "hosts"}
                      onToggle={() => toggleExpanded("hosts")}
                      disabled={disabled}
                      theme={theme}
                    />
                    {expandedFilter === "hosts" ? (
                      <View style={{ paddingLeft: SECTION_INDENT, paddingBottom: 4 }}>
                        <FilterChoice
                          label={t("filter.allHosts")}
                          selected={filters.hosts.length === 0}
                          onPress={() => void clearFilters("hosts")}
                          disabled={disabled}
                          theme={theme}
                        />
                        {hosts.map((host) => (
                          <FilterChoice
                            key={host.serverId}
                            label={hostName(host.serverId)}
                            icon="Server"
                            selected={filters.hosts.includes(host.serverId)}
                            onPress={() => void toggleFilter("hosts", host.serverId)}
                            disabled={disabled}
                            theme={theme}
                          />
                        ))}
                      </View>
                    ) : null}
                  </>
                ) : null}
                {showProjectFilter ? (
                  <>
                    <FilterDisclosure
                      label={t("filter.project")}
                      summary={filterSummary(filters.projects, t("filter.allProjects"), projectName, (count) =>
                        t("filter.projectCount", { count }),
                      )}
                      active={filters.projects.length > 0}
                      expanded={expandedFilter === "projects"}
                      onToggle={() => toggleExpanded("projects")}
                      disabled={disabled}
                      theme={theme}
                    />
                    {expandedFilter === "projects" ? (
                      <View style={{ paddingLeft: SECTION_INDENT, paddingBottom: 4 }}>
                        <FilterChoice
                          label={t("filter.allProjects")}
                          selected={filters.projects.length === 0}
                          onPress={() => void clearFilters("projects")}
                          disabled={disabled}
                          theme={theme}
                        />
                        {filterOptions.projects.map((project) => (
                          <FilterChoice
                            key={project.key}
                            label={project.title}
                            icon="Folder"
                            detail={showHostFilter ? hostName(project.hostId) : undefined}
                            selected={filters.projects.includes(project.key)}
                            onPress={() => void toggleFilter("projects", project.key)}
                            disabled={disabled}
                            theme={theme}
                          />
                        ))}
                      </View>
                    ) : null}
                  </>
                ) : null}
                {showLabelFilter ? (
                  <>
                    <FilterDisclosure
                      label={t("filter.labels")}
                      summary={filterSummary(filters.labels, t("filter.allLabels"), labelName, (count) =>
                        t("filter.labelCount", { count }),
                      )}
                      active={filters.labels.length > 0}
                      expanded={expandedFilter === "labels"}
                      onToggle={() => toggleExpanded("labels")}
                      disabled={disabled}
                      theme={theme}
                    />
                    {expandedFilter === "labels" ? (
                      <View style={{ paddingLeft: SECTION_INDENT, paddingBottom: 4 }}>
                        {filterOptions.labels.map((label) => (
                          <FilterChoice
                            key={label.key}
                            label={label.name}
                            icon="Tag"
                            selected={filters.labels.includes(label.key)}
                            onPress={() => void toggleFilter("labels", label.key)}
                            disabled={disabled}
                            theme={theme}
                          />
                        ))}
                        <FilterChoice
                          label={t("common.unlabelled")}
                          icon="CircleDashed"
                          selected={filters.labels.includes(UNLABELLED_KEY)}
                          onPress={() => void toggleFilter("labels", UNLABELLED_KEY)}
                          disabled={disabled}
                          theme={theme}
                        />
                        {storedFilters.labels.length > 0 ? (
                          <FilterChoice
                            label={t("filter.clear")}
                            icon="X"
                            selected={false}
                            onPress={() => void clearFilters("labels")}
                            disabled={disabled}
                            theme={theme}
                          />
                        ) : null}
                      </View>
                    ) : null}
                  </>
                ) : null}
              </View>
            </View>
          ) : null}
          <View>
            <SectionTitle title={t("options.projectSection")} theme={theme} />
            <View style={{ paddingLeft: SECTION_INDENT }}>
              <SwitchRow
                label={t("options.showHosts")}
                value={settings.showHosts}
                onChange={(value) => void setOption("showHosts", value)}
                disabled={disabled}
                theme={theme}
              />
              {hosts.length > 0 ? (
                <>
                  <FilterDisclosure
                    label={t("options.hostColors")}
                    summary={hostCount(t)(hosts.length)}
                    active={false}
                    expanded={hostColorsExpanded}
                    onToggle={() => setHostColorsExpanded((current) => !current)}
                    disabled={disabled}
                    theme={theme}
                    accessibilityLabel={t("options.hostColors")}
                  />
                  {hostColorsExpanded ? (
                    <View style={{ paddingLeft: SECTION_INDENT, paddingBottom: 4 }}>
                      {hosts.map((host) => (
                        <OptionRow key={host.serverId} label={host.label} theme={theme}>
                          <HostColorPicker
                            value={settings.hostColors[host.serverId] ?? "accent"}
                            onChange={(value) => void setHostColor(host.serverId, value)}
                            disabled={disabled || !settings.showHosts}
                            theme={theme}
                          />
                        </OptionRow>
                      ))}
                    </View>
                  ) : null}
                </>
              ) : null}
            </View>
          </View>
          <View>
            <SectionTitle title={t("options.display")} theme={theme} />
            <View style={{ paddingLeft: SECTION_INDENT }}>
              <SwitchRow
                label={t("options.showBackground")}
                value={settings.showBackground}
                onChange={(value) => void setOption("showBackground", value)}
                disabled={disabled}
                theme={theme}
              />
              <SwitchRow
                label={t("options.showLastActivity")}
                value={settings.showLastActivity}
                onChange={(value) => void setOption("showLastActivity", value)}
                disabled={disabled}
                theme={theme}
              />
              <SwitchRow
                label={t("options.collapseByDefault")}
                value={collapseByDefault}
                onChange={onCollapseByDefaultChange}
                disabled={disabled}
                theme={theme}
              />
              <SwitchRow
                label={t("options.manualOrder")}
                value={settings.manualOrder}
                onChange={(value) => void setOption("manualOrder", value)}
                // Saved orders are per project, so they apply in project grouping only.
                disabled={disabled || settings.grouping !== "project"}
                theme={theme}
              />
              {/* Manual order replaces the sort; it still places workspaces not yet dragged. Status sections sort by time in status, as in Paseo. */}
              <OptionRow label={t("options.sort")} theme={theme}>
                <Segmented
                  label={t("options.sort")}
                  options={SORT_OPTIONS}
                  value={settings.sort}
                  onChange={(value) => void setOption("sort", value)}
                  disabled={
                    disabled || settings.grouping === "status" || (settings.grouping === "project" && settings.manualOrder)
                  }
                  theme={theme}
                />
              </OptionRow>
              <OptionRow label={t("options.checks")} theme={theme}>
                <Segmented
                  label={t("options.checks")}
                  options={CHECKS_DISPLAY_OPTIONS}
                  value={settings.checksDisplay}
                  onChange={(value) => void setOption("checksDisplay", value)}
                  disabled={disabled || settings.fields.checks === "hidden"}
                  theme={theme}
                />
              </OptionRow>
              <OptionRow label={t("options.rowTitle")} theme={theme}>
                <Segmented
                  label={t("options.rowTitle")}
                  options={TITLE_OPTIONS}
                  value={settings.title}
                  onChange={(value) => void setOption("title", value)}
                  disabled={disabled}
                  theme={theme}
                />
              </OptionRow>
              <OptionRow label={t("options.groupBy")} theme={theme}>
                <Segmented
                  label={t("options.groupBy")}
                  options={GROUPING_OPTIONS}
                  value={settings.grouping}
                  onChange={(value) => void setOption("grouping", value)}
                  disabled={disabled}
                  theme={theme}
                />
              </OptionRow>
              {/* Section caps: project and label sections only; status sections are already time buckets. */}
              <NumberRow
                label={t("options.sectionRows")}
                value={settings.sectionRowLimit}
                min={1}
                max={99}
                onChange={(value) => void setOption("sectionRowLimit", value)}
                disabled={disabled || settings.grouping === "status"}
                theme={theme}
              />
              <NumberRow
                label={t("options.sectionAge")}
                value={settings.sectionAgeLimitDays}
                min={0}
                max={365}
                onChange={(value) => void setOption("sectionAgeLimitDays", value)}
                disabled={disabled || settings.grouping === "status"}
                theme={theme}
              />
            </View>
          </View>
          <View>
            <SectionTitle title={t("options.density")} theme={theme} />
            <View style={{ paddingLeft: SECTION_INDENT }}>
              <OptionRow label={t("options.textSize")} theme={theme}>
                <Segmented
                  label={t("options.textSize")}
                  options={TEXT_SIZE_OPTIONS}
                  value={settings.textSize}
                  onChange={(value) => void setOption("textSize", value)}
                  disabled={disabled}
                  theme={theme}
                />
              </OptionRow>
              <OptionRow label={t("options.rowHeight")} theme={theme}>
                <Segmented
                  label={t("options.rowHeight")}
                  options={ROW_HEIGHT_OPTIONS}
                  value={settings.rowHeight}
                  onChange={(value) => void setOption("rowHeight", value)}
                  disabled={disabled}
                  theme={theme}
                />
              </OptionRow>
              <OptionRow label={t("options.indentation")} theme={theme}>
                <Segmented
                  label={t("options.indentation")}
                  options={INDENT_OPTIONS}
                  value={settings.indentation}
                  onChange={(value) => void setOption("indentation", value)}
                  disabled={disabled}
                  theme={theme}
                />
              </OptionRow>
            </View>
          </View>
        </Modal.Content>
      </Modal>
    </View>
  );
}
