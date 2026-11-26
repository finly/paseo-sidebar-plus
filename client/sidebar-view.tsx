import type { PluginWorkspaceSnapshot, WorkspaceIndicator } from "@getpaseo/plugin";
import type { PluginSidebarViewProps } from "@getpaseo/plugin/client";
import { type WorkspaceRef, useHosts, useProjects, useWorkspaces } from "@getpaseo/plugin/client";
import { type ReactNode, useMemo, useRef, useState } from "react";
import { Icon } from "@getpaseo/plugin/client/ui";
import { Platform, Pressable, ScrollView, Text, View } from "react-native";
import { type DisplaySettings, LIST_INSET, type SortOrder, densityMetrics, displaySettings } from "../shared/display-settings";
import {
  type Filters,
  hasActiveFilters,
  labelKey,
  matchesFilters,
  matchesSearch,
  mergeVisibleOrder,
  normalizeQuery,
  resolveFilters,
} from "../shared/filters";
import {
  type Group,
  groupOfProject,
  parentOf,
  sortByProjectOrder,
  subgroupsOf,
  topGroupOfProject,
  topLevelGroups,
} from "../shared/groups";
import { useCollapse, useViewCollapse } from "./collapse";
import { CountChip, CountColumn } from "./count-chip";
import { DragBlock, DragHandle, type DragItem, type DropTarget, DropIndicator, dragPressProps, useDragController } from "./drag";
import { useDisplaySettings } from "./display-settings";
import type { Appearance } from "../shared/appearance";
import { useAppearance } from "./appearance";
import {
  AppearanceEditorModal,
  GroupEditorModal,
  GroupHeader,
  HeadingMark,
  headingNameColor,
  hostColorValue,
} from "./group-editor";
import { type MessageKey, useT } from "./i18n";
import { useGroups } from "./groups";
import { GroupMenuModal } from "./group-menu";
import { MoveGroupModal, MoveProjectModal, type ProjectTarget } from "./move-project";
import { ProjectMenuModal, type ProjectMenuTarget } from "./project-menu";
import { BulkArchiveModal } from "./bulk-archive";
import { applyStoredOrder, moveKey } from "../shared/pinned-order";
import { usePinnedOrder } from "./pinned-order";
import { useWorkspaceOrder } from "./workspace-order";
import { UrgentDot, mostUrgent, useWorkspaceIndicators } from "./urgent-status";
import { indicatorColor } from "./status-indicator";
import { type FilterOptions, ViewOptionsHeader } from "./view-options";
import { WorkspaceActionsModal } from "./workspace-actions";
import { WorkspaceDescriptorFeed } from "./workspace-descriptors";
import { WorkspaceRow } from "./workspace-row";
import { SearchBox } from "./search-box";
import { type JumpTracker, JumpPills, useJumpToRow } from "./jump-to-active";
import { stickyStyle, useSurfaceBehind } from "./web";

const DEFAULT_SETTINGS: DisplaySettings = displaySettings.schema.parse({});

type Snapshot = PluginWorkspaceSnapshot;

/** Where a workspace's row renders: the Pinned section, a project (inside its groups), or a status/label section. */
type WorkspaceSpot =
  | { kind: "pinned" }
  | { kind: "project"; projectKey: string; groupIds: string[] }
  | { kind: "section"; sectionKey: string };

/** Collapsed parents hiding a spot's row; the shape `expand` takes. */
interface CollapsedParents {
  groups?: string[];
  projects?: string[];
  sections?: string[];
  pinned?: boolean;
}

function workspaceLabel(workspace: Snapshot): string {
  return workspace.title ?? workspace.name;
}

/** Newest first; workspaces without the timestamp sort last. */
function byTimeDesc(a: string | null, b: string | null): number {
  const left = a ? Date.parse(a) : Number.NaN;
  const right = b ? Date.parse(b) : Number.NaN;
  if (Number.isNaN(left)) return Number.isNaN(right) ? 0 : 1;
  if (Number.isNaN(right)) return -1;
  return right - left;
}

const SORTERS: Record<SortOrder, (a: Snapshot, b: Snapshot) => number> = {
  name: (a, b) => workspaceLabel(a).localeCompare(workspaceLabel(b)),
  lastActivity: (a, b) => byTimeDesc(a.lastPromptAt, b.lastPromptAt) || SORTERS.name(a, b),
  created: (a, b) => byTimeDesc(a.createdAt, b.createdAt) || SORTERS.name(a, b),
};

/**
 * Status section order and names, as in Paseo's sidebar (`STATUS_BUCKET_ORDER`, `sidebar.statusBucket.*`):
 * "Ready to review" ranks above "Working".
 */
const STATUS_SECTIONS: readonly { readonly indicator: WorkspaceIndicator; readonly title: MessageKey }[] = [
  { indicator: "needs_input", title: "statusSection.needsInput" },
  { indicator: "failed", title: "statusSection.failed" },
  { indicator: "attention", title: "statusSection.readyToReview" },
  { indicator: "running", title: "statusSection.working" },
  { indicator: "done", title: "statusSection.done" },
];

/** Paseo's status section row order: longest-standing status last, then project, then name. */
const byStatusTime = (a: Snapshot, b: Snapshot) =>
  byTimeDesc(a.statusEnteredAt, b.statusEnteredAt) ||
  a.projectDisplayName.localeCompare(b.projectDisplayName) ||
  a.name.localeCompare(b.name) ||
  a.id.localeCompare(b.id);

/** Section key for workspaces with no labels; real label keys are trimmed and never empty. */
const UNLABELLED_SECTION = "unlabelled";
const byStatusSection = (workspace: Snapshot) => workspace.indicator;
/** One section per label (deduplicated by label key), or Unlabelled. */
const byLabelSection = (workspace: Snapshot) => {
  const sections = new Map<string, string>();
  for (const name of workspace.labels) {
    const key = labelKey(name);
    if (key && !sections.has(key)) sections.set(key, name.trim());
  }
  // The view names this section at render time, in the app language.
  if (sections.size === 0) return { key: UNLABELLED_SECTION, title: "" };
  return [...sections].map(([key, title]) => ({ key: `label:${key}`, title }));
};

const groupByProject = (workspace: Snapshot) => ({
  key: workspace.project.key,
  title: workspace.projectDisplayName,
});
const hideBackground = (workspace: Snapshot) => !workspace.background;
const matchNone = () => false;
const byLabel = (workspace: Snapshot) => workspace.labels;
const isPinned = (workspace: Snapshot) => workspace.pinnedAt != null;
const isPinnedForeground = (workspace: Snapshot) => isPinned(workspace) && hideBackground(workspace);
/** Pinned section order, as in Paseo's sidebar: most recently pinned first. */
const byPinnedAt = (a: Snapshot, b: Snapshot) => byTimeDesc(a.pinnedAt, b.pinnedAt) || SORTERS.name(a, b);

/** Heading + and ⋯ buttons always show, on every platform. */
const SHOW_ACTIONS_ALWAYS = true;
/** Gap between a heading's chevron and the next element. */
const HEADING_GAP = 6;
/** Stacking of stuck headings: a group (or Pinned, or a section) heading covers a project heading sliding under it. */
const STICKY_SECTION_Z = 3;
const STICKY_PROJECT_Z = 2;
/** Left padding of every heading, before its chevron: the chevron starts under the search icon. */
const HEADING_INSET = LIST_INSET;

/**
 * Size of a heading's trailing icon buttons (+ and ⋯). Matches the view header buttons, so with the
 * same right padding the ⋯ lines up under the view options button and is easy to tap on touch.
 */
const HEADING_BUTTON = 28;
/** Pulls the buttons into the heading's padding so the larger target keeps the heading height. */
const HEADING_BUTTON_INSET = -3;

/** A heading's trailing icon button. Reports its own hover, since hovering it fires the heading's hover-out on web. */
function HeadingButton({
  icon,
  label,
  visible,
  onPress,
  onHoverChange,
  theme,
  marginLeft,
}: {
  icon: string;
  label: string;
  visible: boolean;
  /** Overrides the heading gap before this button. */
  marginLeft?: number;
  onPress(): void;
  onHoverChange(hovered: boolean): void;
  theme: PluginSidebarViewProps["theme"];
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onHoverIn={() => {
        setHovered(true);
        onHoverChange(true);
      }}
      onHoverOut={() => {
        setHovered(false);
        onHoverChange(false);
      }}
      onPress={onPress}
      style={({ pressed }) => ({
        width: HEADING_BUTTON,
        height: HEADING_BUTTON,
        marginVertical: HEADING_BUTTON_INSET,
        marginLeft,
        borderRadius: 6,
        alignItems: "center",
        justifyContent: "center",
        opacity: visible ? 1 : 0,
        backgroundColor: pressed || hovered ? theme.colors.surface2 : "transparent",
      })}
    >
      <Icon name={icon} color={hovered ? theme.colors.foreground : theme.colors.foregroundMuted} size={14} />
    </Pressable>
  );
}

/**
 * A project heading: collapse chevron, Sidebar+ icon, name (tinted by its color), optional host tag, workspace count, then + (new workspace)
 * and ⋯ (menu) buttons, always shown.
 */
function ProjectHeader({
  title,
  appearance,
  hostTag,
  hostColor,
  hostFill,
  collapsed,
  count,
  status,
  tight,
  onToggle,
  onNewWorkspace,
  onMenu,
  pressProps,
  theme,
  fontSize,
  lineHeight,
}: {
  title: string;
  /** Sidebar+ icon and color for the project; none keeps the muted default. */
  appearance: Appearance;
  /** Host label shown after the name when projects span several hosts; null hides it. */
  hostTag: string | null;
  /** Host tag text, icon, and faded fill color. */
  hostColor: string;
  /** Draw the faded fill behind the host tag; off for the "none" color. */
  hostFill: boolean;
  /** Directly under a group heading: less space above. */
  tight: boolean;
  collapsed: boolean;
  count: number;
  /** Shown while collapsed: the most urgent workspace status in the project. */
  status: WorkspaceIndicator | null;
  onToggle(): void;
  /** Starts Paseo's new workspace flow for the project; null hides the + button. */
  onNewWorkspace: (() => void) | null;
  onMenu(): void;
  /** Long-press handling for the heading (drag arming on touch). */
  pressProps?: { onLongPress?(): void; onPressOut?(): void; delayLongPress?: number };
  theme: PluginSidebarViewProps["theme"];
  fontSize: number;
  lineHeight: number;
}) {
  const t = useT();
  const [hovered, setHovered] = useState(false);
  const [buttonHovered, setButtonHovered] = useState(false);
  const showActions = SHOW_ACTIONS_ALWAYS || hovered || buttonHovered;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t(collapsed ? "a11y.expandProject" : "a11y.collapseProject", { name: title })}
      accessibilityState={{ expanded: !collapsed }}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onPress={onToggle}
      {...pressProps}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: HEADING_GAP,
        paddingLeft: HEADING_INSET,
        paddingRight: 8,
        paddingTop: tight ? 4 : 16,
        paddingBottom: 4,
      }}
    >
      <Icon name={collapsed ? "ChevronRight" : "ChevronDown"} color={theme.colors.foregroundMuted} size={fontSize} />
      <HeadingMark appearance={appearance} theme={theme} fontSize={fontSize} />
      <Text
        numberOfLines={1}
        style={{
          flex: 1,
          minWidth: 0,
          color: headingNameColor(appearance, theme, theme.colors.foregroundMuted),
          fontSize,
          lineHeight,
          fontWeight: "600",
        }}
      >
        {title}
      </Text>
      {hostTag ? (
        <View
          style={{
            flexShrink: 1,
            maxWidth: "45%",
            flexDirection: "row",
            alignItems: "center",
            gap: 3,
            paddingHorizontal: 5,
            borderRadius: 4,
            overflow: "hidden",
          }}
        >
          {/* Faded fill: the host color at low opacity, behind the content. */}
          {hostFill ? (
            <View
              style={{
                position: "absolute",
                top: 0,
                right: 0,
                bottom: 0,
                left: 0,
                backgroundColor: hostColor,
                opacity: 0.15,
              }}
            />
          ) : null}
          <Icon name="Server" color={hostColor} size={fontSize - 3} />
          <Text numberOfLines={1} style={{ flexShrink: 1, color: hostColor, fontSize: fontSize - 2, lineHeight }}>
            {hostTag}
          </Text>
        </View>
      ) : null}
      {collapsed ? <UrgentDot indicator={status} theme={theme} /> : null}
      <CountChip count={count} theme={theme} />
      {onNewWorkspace ? (
        <HeadingButton
          icon="Plus"
          label={t("a11y.newWorkspaceIn", { name: title })}
          visible={showActions}
          // Tight cluster: 2px after the count.
          marginLeft={2 - HEADING_GAP}
          onPress={onNewWorkspace}
          onHoverChange={setButtonHovered}
          theme={theme}
        />
      ) : null}
      <HeadingButton
        icon="Ellipsis"
        label={t("a11y.projectActions", { name: title })}
        visible={showActions}
        // 2px after +, as between the view header buttons: the + sits under the new group button.
        marginLeft={onNewWorkspace ? 2 - HEADING_GAP : undefined}
        onPress={onMenu}
        onHoverChange={setButtonHovered}
        theme={theme}
      />
    </Pressable>
  );
}

/** Fills a project with no rows (for example, all its workspaces are pinned): a muted "New workspace" row. */
function NewWorkspaceRow({
  onPress,
  theme,
  metrics,
}: {
  onPress(): void;
  theme: PluginSidebarViewProps["theme"];
  metrics: ReturnType<typeof densityMetrics>;
}) {
  const t = useT();
  const [hovered, setHovered] = useState(false);
  const color = hovered ? theme.colors.foreground : theme.colors.foregroundMuted;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("common.newWorkspace")}
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={{
        minHeight: metrics.rowMinHeight,
        paddingVertical: metrics.rowPaddingVertical,
        paddingRight: 12,
        paddingLeft: metrics.rowIndent,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
      }}
    >
      <Icon name="Plus" color={color} size={metrics.secondaryFontSize} />
      <Text style={{ color, fontSize: metrics.secondaryFontSize, lineHeight: metrics.secondaryLineHeight }}>
        {t("common.newWorkspace")}
      </Text>
    </Pressable>
  );
}

/**
 * The Pinned section heading: collapse chevron, Sidebar+ icon, title (tinted by its color), count, and a
 * ⋯ button that opens the Pinned icon and color editor (always shown).
 */
function PinnedHeader({
  appearance,
  collapsed,
  count,
  onToggle,
  onMenu,
  theme,
  fontSize,
  lineHeight,
}: {
  appearance: Appearance;
  collapsed: boolean;
  count: number;
  onToggle(): void;
  onMenu(): void;
  theme: PluginSidebarViewProps["theme"];
  fontSize: number;
  lineHeight: number;
}) {
  const t = useT();
  const [hovered, setHovered] = useState(false);
  const [buttonHovered, setButtonHovered] = useState(false);
  const showActions = SHOW_ACTIONS_ALWAYS || hovered || buttonHovered;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t(collapsed ? "a11y.expandPinned" : "a11y.collapsePinned")}
      accessibilityState={{ expanded: !collapsed }}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onPress={onToggle}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: HEADING_GAP,
        paddingLeft: HEADING_INSET,
        paddingRight: 8,
        paddingTop: 8,
        paddingBottom: 4,
      }}
    >
      <Icon name={collapsed ? "ChevronRight" : "ChevronDown"} color={theme.colors.foregroundMuted} size={fontSize} />
      <HeadingMark appearance={appearance} theme={theme} fontSize={fontSize} />
      <Text
        numberOfLines={1}
        style={{
          flex: 1,
          minWidth: 0,
          color: headingNameColor(appearance, theme, theme.colors.foregroundMuted),
          fontSize,
          lineHeight,
          fontWeight: "600",
        }}
      >
        {t("pinned.title")}
      </Text>
      {/* Same column as group counts: centered under the new group button. */}
      <CountColumn count={count} theme={theme} marginRight={2 - HEADING_GAP} />
      <HeadingButton
        icon="Ellipsis"
        label={t("pinned.edit")}
        visible={showActions}
        onPress={onMenu}
        onHoverChange={setButtonHovered}
        theme={theme}
      />
    </Pressable>
  );
}

/** A status or label section heading: chevron, status dot or tag icon, title, and count. */
function SectionHeader({
  title,
  indicator,
  collapsed,
  count,
  onToggle,
  theme,
  fontSize,
  lineHeight,
}: {
  title: string;
  /** Status sections lead with their status dot; label sections with a tag icon. */
  indicator: WorkspaceIndicator | null;
  collapsed: boolean;
  count: number;
  onToggle(): void;
  theme: PluginSidebarViewProps["theme"];
  fontSize: number;
  lineHeight: number;
}) {
  const t = useT();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t(collapsed ? "a11y.expandSection" : "a11y.collapseSection", { name: title })}
      accessibilityState={{ expanded: !collapsed }}
      onPress={onToggle}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: HEADING_GAP,
        paddingLeft: HEADING_INSET,
        // Leaves the ⋯ column of other headings empty, so counts line up with group and Pinned counts.
        paddingRight: 8 + HEADING_BUTTON + 2,
        paddingTop: 8,
        paddingBottom: 4,
      }}
    >
      <Icon name={collapsed ? "ChevronRight" : "ChevronDown"} color={theme.colors.foregroundMuted} size={fontSize} />
      {indicator ? (
        <View style={{ width: fontSize, alignItems: "center" }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: indicatorColor(theme, indicator) }} />
        </View>
      ) : (
        <Icon name="Tag" color={theme.colors.foregroundMuted} size={fontSize} />
      )}
      <Text
        numberOfLines={1}
        style={{ flex: 1, minWidth: 0, color: theme.colors.foregroundMuted, fontSize, lineHeight, fontWeight: "600" }}
      >
        {title}
      </Text>
      <CountColumn count={count} theme={theme} />
    </Pressable>
  );
}

/** Paseo's filter empty state: shown when the filters hide every workspace, with a Clear filters button. */
function FilterEmptyState({ onClear, theme }: { onClear(): void; theme: PluginSidebarViewProps["theme"] }) {
  const t = useT();
  const [hovered, setHovered] = useState(false);
  return (
    <View
      style={{
        marginTop: 12,
        marginHorizontal: 8,
        padding: 16,
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: 8,
      }}
    >
      <View style={{ gap: 4 }}>
        <Text style={{ color: theme.colors.foreground, fontSize: 13, lineHeight: 18 }}>{t("empty.title")}</Text>
        <Text style={{ color: theme.colors.foregroundMuted, fontSize: 13, lineHeight: 18 }}>
          {t("empty.hint")}
        </Text>
      </View>
      <View style={{ flexDirection: "row", marginTop: 16 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("empty.clear")}
          onPress={onClear}
          onHoverIn={() => setHovered(true)}
          onHoverOut={() => setHovered(false)}
          style={({ pressed }) => ({
            paddingHorizontal: 10,
            paddingVertical: 5,
            borderRadius: 6,
            backgroundColor: theme.colors.surface2,
            borderWidth: 1,
            borderColor: pressed || hovered ? theme.colors.foregroundMuted : theme.colors.border,
          })}
        >
          <Text style={{ color: theme.colors.foreground, fontSize: 13, lineHeight: 18 }}>{t("empty.clear")}</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function SidebarPlusView({ active, navigation, theme }: PluginSidebarViewProps) {
  const t = useT();
  const { state, filters: storedFilters, clearFilters } = useDisplaySettings();
  const settings = state.status === "ready" ? state.values : DEFAULT_SETTINGS;
  const { groups: groupsDoc, moveProject, reorderGroup, setProjectOrder: setProjectsOrder } = useGroups();
  const collapse = useCollapse();
  /** Search query, kept in memory only (not saved). */
  const [query, setQuery] = useState("");
  const search = normalizeQuery(query);
  const searching = search !== "";
  /** undefined: editor closed; null: creating; a group: editing it. */
  const [editing, setEditing] = useState<Group | null | undefined>(undefined);
  /** When creating (`editing` null): the top-level group the new group goes under, or null for a top-level group. */
  const [newGroupParentId, setNewGroupParentId] = useState<string | null>(null);
  const newGroup = (parentId: string | null = null) => {
    setNewGroupParentId(parentId);
    setEditing(null);
  };
  const [movingGroup, setMovingGroup] = useState<Group | null>(null);
  const [moving, setMoving] = useState<ProjectTarget | null>(null);
  const [archivingMany, setArchivingMany] = useState<ProjectTarget | null>(null);
  const [projectMenu, setProjectMenu] = useState<ProjectMenuTarget | null>(null);
  const [groupMenuId, setGroupMenuId] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<WorkspaceRef | null>(null);
  /** The heading whose Sidebar+ icon and color are being edited, or null when the editor is closed. */
  const [editingAppearance, setEditingAppearance] = useState<{ kind: "project"; project: ProjectTarget } | { kind: "pinned" } | null>(null);
  const {
    state: appearanceState,
    projectAppearance,
    pinnedAppearance,
    setProjectAppearance,
    setPinnedAppearance,
  } = useAppearance();
  const hosts = useHosts();
  const backgroundWhere = settings.showBackground ? undefined : hideBackground;
  const pinnedBackgroundWhere = settings.showBackground ? isPinned : isPinnedForeground;
  /** Before filters: the filter options, "were there workspaces at all", and full orders for drags made while filtered. */
  const unfiltered = useWorkspaces({ where: backgroundWhere, orderBy: SORTERS[settings.sort], groupBy: groupByProject });
  const unfilteredPinned = useWorkspaces({ where: pinnedBackgroundWhere, orderBy: byPinnedAt });
  const labelGroups = useWorkspaces({ where: backgroundWhere, groupBy: byLabel });
  /** Labels in use, deduplicated across hosts by label key. */
  const labelOptions = useMemo(() => {
    const byKey = new Map<string, string>();
    for (const group of labelGroups) {
      const key = labelKey(group.key);
      if (key && !byKey.has(key)) byKey.set(key, group.title ?? group.key);
    }
    return [...byKey].map(([key, name]) => ({ key, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [labelGroups]);
  const { filters, projectOptions } = useMemo(() => {
    const hostIds = new Set(hosts.map((host) => host.serverId));
    const activeHosts = storedFilters.hosts.filter((id) => hostIds.has(id));
    // As in Paseo, the project choices are narrowed by the host filter.
    const projectOptions: FilterOptions["projects"] = unfiltered
      .map((project) => ({ key: String(project.key), title: project.title ?? String(project.key), hostId: project.items[0]?.hostId ?? "" }))
      .filter((project) => activeHosts.length === 0 || activeHosts.includes(project.hostId))
      .sort((a, b) => a.title.localeCompare(b.title));
    const filters: Filters = resolveFilters(storedFilters, {
      hosts: hostIds,
      projects: new Set(projectOptions.map((project) => project.key)),
      labels: new Set(labelOptions.map((label) => label.key)),
    });
    return { filters, projectOptions };
  }, [hosts, storedFilters, unfiltered, labelOptions]);
  const hostLabels = useMemo(() => new Map(hosts.map((host) => [host.serverId, host.label])), [hosts]);
  const filtersActive = hasActiveFilters(filters);
  /** Filters or a search narrow the list. */
  const filtered = filtersActive || searching;
  // While searching, every section with matches starts expanded; collapsing then is in memory only, and the
  // stored collapse state applies again, untouched, once the query is cleared. Filters keep the configured
  // collapse state: a saved host or project filter is a view, not a search, so it must not reset the layout.
  const viewCollapse = useViewCollapse(collapse, searching);
  const { isCollapsed, toggle, pinnedCollapsed, togglePinned } = viewCollapse;
  const matches = useMemo(
    () =>
      filtered
        ? (workspace: Snapshot) =>
            (!filtersActive || matchesFilters(workspace, filters)) &&
            matchesSearch(workspace, search, hostLabels.get(workspace.hostId) ?? workspace.hostId)
        : null,
    [filtered, filtersActive, filters, search, hostLabels],
  );
  const where = useMemo(
    () => (matches ? (workspace: Snapshot) => (!backgroundWhere || backgroundWhere(workspace)) && matches(workspace) : backgroundWhere),
    [matches, backgroundWhere],
  );
  const pinnedWhere = useMemo(
    () => (matches ? (workspace: Snapshot) => pinnedBackgroundWhere(workspace) && matches(workspace) : pinnedBackgroundWhere),
    [matches, pinnedBackgroundWhere],
  );
  const grouped = useWorkspaces({ where, orderBy: SORTERS[settings.sort], groupBy: groupByProject });
  const pinnedByTime = useWorkspaces({ where: pinnedWhere, orderBy: byPinnedAt });
  /** Visible workspaces by last activity; the first item is the latest one. */
  const latestOrder = useWorkspaces({ where, orderBy: SORTERS.lastActivity, groupBy: () => "latest" });
  const grouping = settings.grouping;
  /** Status or label sections; matches nothing in project grouping. */
  const sectionGroups = useWorkspaces({
    where: grouping === "project" ? matchNone : where,
    orderBy: grouping === "status" ? byStatusTime : SORTERS[settings.sort],
    groupBy: grouping === "status" ? byStatusSection : byLabelSection,
  });
  const indicators = useWorkspaceIndicators(settings.showBackground ? undefined : hideBackground);
  const { order: pinnedOrder, setOrder: setPinnedOrder } = usePinnedOrder();
  const pinned = useMemo(
    () => applyStoredOrder(pinnedByTime, pinnedOrder, (reference) => reference.key),
    [pinnedByTime, pinnedOrder],
  );
  const manualSort = settings.manualOrder && grouping === "project";
  const { orders: workspaceOrders, setProjectOrder } = useWorkspaceOrder();
  /**
   * As in Paseo's sidebar, pinned workspaces move to the Pinned section and leave their project.
   * The project stays even when all its workspaces are pinned. With "Manual order", each project's
   * stored drag order applies first. While searching, projects whose matches are all pinned hide.
   * Projects follow the stored project order (shared across devices); unlisted ones go last.
   */
  const projects = useMemo(() => {
    const pinnedKeys = new Set(pinned.map((reference) => reference.key));
    const ordered = sortByProjectOrder(grouped, groupsDoc.projectOrder, (project) => String(project.key));
    if (pinnedKeys.size === 0 && !manualSort) return ordered;
    const all = ordered.map((project) => {
      const stored = manualSort ? workspaceOrders[String(project.key)] : undefined;
      const ordered = stored ? applyStoredOrder(project.items, stored, (reference) => reference.key) : project.items;
      const items = pinnedKeys.size > 0 ? ordered.filter((reference) => !pinnedKeys.has(reference.key)) : ordered;
      return items === project.items ? project : { ...project, items: [...items] };
    });
    return searching ? all.filter((project) => project.items.length > 0) : all;
  }, [grouped, groupsDoc.projectOrder, pinned, manualSort, workspaceOrders, searching]);
  /**
   * As in Paseo, pinned workspaces stay in the Pinned section. Status sections follow Paseo's order;
   * label sections are alphabetical with Unlabelled last. Empty sections are left out.
   */
  const flatSections = useMemo(() => {
    if (grouping === "project") return [];
    const pinnedKeys = new Set(pinned.map((reference) => reference.key));
    const withItems = sectionGroups
      .map((group) => ({ ...group, items: group.items.filter((reference) => !pinnedKeys.has(reference.key)) }))
      .filter((group) => group.items.length > 0);
    if (grouping === "status") {
      return STATUS_SECTIONS.flatMap(({ indicator, title }) => {
        const group = withItems.find((entry) => entry.key === indicator);
        return group ? [{ key: `status:${indicator}`, title: t(title), indicator, items: group.items }] : [];
      });
    }
    return withItems
      .map((group) => ({
        key: group.key,
        title: group.key === UNLABELLED_SECTION ? t("common.unlabelled") : (group.title ?? group.key),
        indicator: null,
        items: group.items,
      }))
      .sort((a, b) =>
        a.key === UNLABELLED_SECTION ? 1 : b.key === UNLABELLED_SECTION ? -1 : a.title.localeCompare(b.title),
      );
  }, [grouping, sectionGroups, pinned, t]);
  const projectItems = useMemo(
    () => new Map(projects.map((project) => [String(project.key), project.items.map((reference) => reference.key)])),
    [projects],
  );
  /** Full orders, before filters, so a drag made while filtered keeps the hidden items' places. */
  const fullProjectOrder = (projectKey: string): string[] => {
    const project = unfiltered.find((entry) => String(entry.key) === projectKey);
    if (!project) return [];
    const pinnedKeys = new Set(unfilteredPinned.map((reference) => reference.key));
    const stored = workspaceOrders[projectKey];
    const ordered = stored ? applyStoredOrder(project.items, stored, (reference) => reference.key) : project.items;
    return ordered.map((reference) => reference.key).filter((key) => !pinnedKeys.has(key));
  };
  const fullPinnedOrder = () =>
    applyStoredOrder(unfilteredPinned, pinnedOrder, (reference) => reference.key).map((reference) => reference.key);
  /**
   * Top-level groups show in project grouping only; while filtered or searching, groups without a matching
   * project (directly or in a subgroup) are hidden.
   */
  const visibleGroups =
    grouping !== "project"
      ? []
      : filtered
        ? topLevelGroups(groupsDoc).filter((group) =>
            projects.some((project) => topGroupOfProject(groupsDoc, String(project.key))?.id === group.id),
          )
        : topLevelGroups(groupsDoc);
  /** A top-level group's subgroups as shown; while filtered or searching, subgroups without a matching project are hidden. */
  const visibleSubgroups = (groupId: string): Group[] =>
    filtered
      ? subgroupsOf(groupsDoc, groupId).filter((subgroup) =>
          projects.some((project) => groupOfProject(groupsDoc, String(project.key))?.id === subgroup.id),
        )
      : subgroupsOf(groupsDoc, groupId);
  /** Displayed projects of a group, directly in it (not in its subgroups). */
  const membersOf = (groupId: string) =>
    projects.filter((project) => groupOfProject(groupsDoc, String(project.key))?.id === groupId);
  /** Displayed projects of a top-level group, its subgroups included. */
  const allMembersOf = (groupId: string) =>
    projects.filter((project) => topGroupOfProject(groupsDoc, String(project.key))?.id === groupId);
  /** Project keys are host-qualified, so every workspace in a project shares one host. */
  const projectHost = (project: (typeof projects)[number]) => project.items[0]?.hostId ?? "";
  const multiHost = settings.showHosts && new Set(projects.map(projectHost)).size > 1;
  const ungrouped =
    grouping === "project" ? projects.filter((project) => !groupOfProject(groupsDoc, String(project.key))) : [];
  /** With several hosts, ungrouped projects cluster by host in configured order (unknown hosts last); sort is stable. */
  if (multiHost) {
    const order = new Map(hosts.map((host, index) => [host.serverId, index]));
    const rank = (project: (typeof projects)[number]) => order.get(projectHost(project)) ?? Number.MAX_SAFE_INTEGER;
    ungrouped.sort((a, b) => rank(a) - rank(b));
  }
  /** Displayed project keys of a group (null: ungrouped). */
  const containerProjectKeys = (groupId: string | null): string[] =>
    groupId === null
      ? ungrouped.map((project) => String(project.key))
      : projects
          .map((project) => String(project.key))
          .filter((key) => groupOfProject(groupsDoc, key)?.id === groupId);
  /** Full project order, before filters, keeping stored keys of projects not listed now (an offline host). */
  const fullProjectsOrder = (): string[] => {
    const stored = new Set(groupsDoc.projectOrder);
    const fresh = sortByProjectOrder(unfiltered, groupsDoc.projectOrder, (project) => String(project.key))
      .map((project) => String(project.key))
      .filter((key) => !stored.has(key));
    return [...groupsDoc.projectOrder, ...fresh];
  };
  const drag = useDragController({
    groupIds: visibleGroups.map((group) => group.id),
    subgroupIds: (groupId) =>
      isCollapsed("groups", groupId) ? [] : visibleSubgroups(groupId).map((subgroup) => subgroup.id),
    parentOf: (groupId) => {
      const group = groupsDoc.groups.find((entry) => entry.id === groupId);
      return group ? (parentOf(groupsDoc, group)?.id ?? null) : null;
    },
    pinnedKeys: pinned.map((reference) => reference.key),
    projectKeys: containerProjectKeys,
    workspaceKeys: (projectKey) => projectItems.get(projectKey) ?? [],
    onDrop: (item: DragItem, target: DropTarget) => {
      if (item.kind === "workspace" && target.kind === "position") {
        // Saves the displayed order (pinned rows excluded), which also drops archived workspaces.
        const keys = projectItems.get(item.projectKey) ?? [];
        void setProjectOrder(
          item.projectKey,
          mergeVisibleOrder(fullProjectOrder(item.projectKey), moveKey(keys, item.key, target.index)),
        );
      }
      if (item.kind === "pinned" && target.kind === "position") {
        const keys = pinned.map((reference) => reference.key);
        void setPinnedOrder(mergeVisibleOrder(fullPinnedOrder(), moveKey(keys, item.key, target.index)));
      }
      if (item.kind === "group" && target.kind === "position") {
        // The index is among visible groups; place the group among all groups, hidden ones keeping their places.
        const visibleIds = visibleGroups.map((group) => group.id);
        const merged = mergeVisibleOrder(
          groupsDoc.groups.map((group) => group.id),
          moveKey(visibleIds, item.id, target.index),
        );
        void reorderGroup(item.id, merged.indexOf(item.id));
      }
      if (item.kind === "subgroup" && target.kind === "position") {
        // The index is among the parent's visible subgroups; hidden groups keep their places.
        const visibleIds = visibleSubgroups(item.parentId).map((group) => group.id);
        const merged = mergeVisibleOrder(
          groupsDoc.groups.map((group) => group.id),
          moveKey(visibleIds, item.id, target.index),
        );
        void reorderGroup(item.id, merged.indexOf(item.id));
      }
      if (item.kind === "project" && target.kind === "position") {
        // The index is among the displayed siblings; their slots in the full order take the new order.
        const keys = containerProjectKeys(item.groupId);
        void setProjectsOrder(mergeVisibleOrder(fullProjectsOrder(), moveKey(keys, item.key, target.index)));
      }
      if (item.kind === "project" && target.kind === "group") void moveProject(item.key, target.groupId);
    },
  });
  const pressProps = dragPressProps(drag);
  const activeKey = active.workspace?.key ?? null;
  /**
   * Where a workspace's row renders (the first label section in label grouping); null when it is not listed.
   * Used for the open workspace and for the latest one.
   */
  const spotOf = useMemo(
    () =>
      (key: string | null): WorkspaceSpot | null => {
        if (!key) return null;
        if (pinned.some((reference) => reference.key === key)) return { kind: "pinned" };
        if (grouping === "project") {
          const project = projects.find((entry) => entry.items.some((reference) => reference.key === key));
          if (!project) return null;
          const projectKey = String(project.key);
          // The project's group and, for a subgroup, its parent group.
          const group = groupOfProject(groupsDoc, projectKey);
          const parent = group ? parentOf(groupsDoc, group) : null;
          return { kind: "project", projectKey, groupIds: [group, parent].flatMap((entry) => (entry ? [entry.id] : [])) };
        }
        const section = flatSections.find((entry) => entry.items.some((reference) => reference.key === key));
        return section ? { kind: "section", sectionKey: section.key } : null;
      },
    [pinned, grouping, projects, groupsDoc, flatSections],
  );
  const activeSpot = spotOf(activeKey);
  /** The most recently prompted workspace on display. */
  const latestRef = latestOrder[0]?.items[0] ?? null;
  const latestKey = latestRef?.key ?? null;
  const latestSpot = spotOf(latestKey);
  /** Collapsed parents hiding a spot's row. */
  const collapsedParents = (spot: WorkspaceSpot | null): CollapsedParents | null => {
    if (!spot) return null;
    if (spot.kind === "pinned") return pinnedCollapsed ? { pinned: true } : null;
    if (spot.kind === "section")
      return isCollapsed("sections", spot.sectionKey) ? { sections: [spot.sectionKey] } : null;
    const groups = spot.groupIds.filter((id) => isCollapsed("groups", id));
    const projectIds = isCollapsed("projects", spot.projectKey) ? [spot.projectKey] : [];
    return groups.length > 0 || projectIds.length > 0 ? { groups, projects: projectIds } : null;
  };
  const activeCollapsed = collapsedParents(activeSpot);
  const latestCollapsed = collapsedParents(latestSpot);
  const viewportRef = useRef<View>(null);
  const jump = useJumpToRow(drag.scrollRef, viewportRef, activeKey);
  const latestJump = useJumpToRow(drag.scrollRef, viewportRef, latestKey);
  /** Stuck headings take the sidebar's own background so rows scroll out of sight under them. */
  const surface = useSurfaceBehind(viewportRef, theme);
  /** Project headings inside a group stick just below the stuck group heading. */
  const [groupHeadingHeight, setGroupHeadingHeight] = useState(0);
  /** Scroll view and content widths; the difference is the scrollbar gutter (web, when scrollbars take space). */
  const [listWidths, setListWidths] = useState({ view: 0, content: 0 });
  const scrollbarGutter = listWidths.content > 0 ? Math.max(0, listWidths.view - listWidths.content) : 0;
  const showActiveJump =
    activeSpot !== null && drag.dragging === null && (activeCollapsed !== null || jump.offscreen !== null);
  const showLatestJump =
    latestKey !== null &&
    latestKey !== activeKey &&
    latestSpot !== null &&
    drag.dragging === null &&
    (latestCollapsed !== null || latestJump.offscreen !== null);
  const jumpTo = (tracker: JumpTracker, collapsed: CollapsedParents | null) => {
    if (collapsed) {
      tracker.jump(true);
      void viewCollapse.expand(collapsed);
    } else tracker.jump(false);
  };
  /** Wraps a tracked workspace row so its position can be measured for a jump. */
  const trackRow = (node: ReactNode, key: string, tracked: { active: boolean; latest: boolean }) => {
    if (!tracked.active && !tracked.latest) return node;
    let content: ReactNode = node;
    if (tracked.latest)
      content = (
        <View ref={latestJump.rowRef} collapsable={false} onLayout={latestJump.remeasure}>
          {content}
        </View>
      );
    if (tracked.active)
      content = (
        <View ref={jump.rowRef} collapsable={false} onLayout={jump.remeasure}>
          {content}
        </View>
      );
    return <View key={key}>{content}</View>;
  };
  const allProjects = useProjects();
  /** Workspace groups are keyed by the project ref key. */
  const projectRefs = useMemo(() => new Map(allProjects.map((reference) => [reference.key, reference])), [allProjects]);
  const metrics = useMemo(() => densityMetrics(settings), [settings]);
  const hostLabel = (hostId: string) => hostLabels.get(hostId) ?? hostId;
  const renderProject = (
    project: (typeof projects)[number],
    index: number,
    groupId: string | null,
    showHost = false,
  ) => {
    const key = String(project.key);
    const title = project.title ?? key;
    const collapsed = isCollapsed("projects", key);
    const item: DragItem = { kind: "project", key, groupId };
    const projectRef = projectRefs.get(key) ?? null;
    const rowDrag = manualSort;
    const header = (
      <ProjectHeader
        title={title}
        appearance={projectAppearance(key)}
        hostTag={showHost ? hostLabel(projectHost(project)) : null}
        hostColor={hostColorValue(settings.hostColors[projectHost(project)] ?? "accent", theme)}
        hostFill={(settings.hostColors[projectHost(project)] ?? "accent") !== "none"}
        collapsed={collapsed}
        count={project.items.length}
        status={collapsed ? mostUrgent(project.items, indicators) : null}
        tight={groupId !== null && index === 0}
        onToggle={() => void toggle("projects", key)}
        onNewWorkspace={projectRef ? () => navigation.openProject(projectRef) : null}
        onMenu={() => setProjectMenu({ key, title, ref: projectRef })}
        pressProps={pressProps}
        theme={theme}
        fontSize={metrics.primaryFontSize}
        lineHeight={metrics.primaryLineHeight}
      />
    );
    const body = collapsed ? null : project.items.length === 0 ? (
      projectRef ? (
        <NewWorkspaceRow onPress={() => navigation.openProject(projectRef)} theme={theme} metrics={metrics} />
      ) : null
    ) : (
      project.items.map((reference) => {
          const row = (
            <WorkspaceRow
              key={reference.key}
              reference={reference}
              active={active.workspace?.key === reference.key}
              navigation={navigation}
              theme={theme}
              settings={settings}
              pressProps={rowDrag ? pressProps : undefined}
              onMenu={setMenuFor}
            />
          );
          const tracked = {
            active: activeSpot?.kind === "project" && activeSpot.projectKey === key && reference.key === activeKey,
            latest: latestSpot?.kind === "project" && latestSpot.projectKey === key && reference.key === latestKey,
          };
          if (!rowDrag) return trackRow(row, reference.key, tracked);
          const rowItem: DragItem = { kind: "workspace", key: reference.key, projectKey: key, groupId };
          return (
            <DragBlock
              key={reference.key}
              drag={drag}
              lifted={drag.isDragging(rowItem)}
              onLayout={drag.onWorkspaceLayout(reference.key)}
              theme={theme}
            >
              <DragHandle drag={drag} item={rowItem}>
                {trackRow(row, reference.key, tracked)}
              </DragHandle>
            </DragBlock>
          );
        })
    );
    const sticky = stickyStyle(groupId ? groupHeadingHeight : 0, surface, STICKY_PROJECT_Z);
    return (
      <DragBlock
        key={project.key}
        drag={drag}
        lifted={drag.isDragging(item)}
        raised={drag.containsDraggedWorkspace(key)}
        onLayout={drag.onProjectLayout(key)}
        theme={theme}
      >
        <DragHandle drag={drag} item={item} style={drag.isDragging(item) ? undefined : sticky}>
          {header}
        </DragHandle>
        {body}
      </DragBlock>
    );
  };
  /** Dashed placeholder for a group or subgroup with nothing to show. */
  const emptyGroup = (
    <View
      style={{
        minHeight: metrics.rowMinHeight,
        marginLeft: metrics.rowIndent,
        marginRight: 12,
        marginVertical: 4,
        borderRadius: 6,
        borderWidth: 1,
        borderStyle: "dashed",
        borderColor: theme.colors.border,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text
        numberOfLines={1}
        style={{
          color: theme.colors.foregroundMuted,
          fontSize: metrics.secondaryFontSize,
          lineHeight: metrics.secondaryLineHeight,
        }}
      >
        {t("empty.group")}
      </Text>
    </View>
  );
  /**
   * Nested content shift. At large indentation a child's chevron lines up with its group's icon (after the
   * group's chevron and gap); smaller indentation options shrink the step in proportion.
   */
  const nestIndent = Math.round((metrics.primaryFontSize + HEADING_GAP) * metrics.indentScale);
  /** A subgroup inside its group body: heading (draggable among its siblings, not sticky yet), then its projects. */
  const renderSubgroup = (subgroup: Group, parentId: string, index: number) => {
    const members = membersOf(subgroup.id);
    const collapsed = isCollapsed("groups", subgroup.id);
    const item: DragItem = { kind: "subgroup", id: subgroup.id, parentId };
    return (
      <DragBlock
        key={`subgroup:${subgroup.id}`}
        drag={drag}
        lifted={drag.isDragging(item)}
        raised={drag.containsDragged(subgroup.id)}
        onLayout={drag.onSubgroupLayout(subgroup.id)}
        theme={theme}
      >
        <DragHandle drag={drag} item={item}>
          <GroupHeader
            group={subgroup}
            collapsed={collapsed}
            count={members.length}
            status={collapsed ? mostUrgent(members.flatMap((project) => project.items), indicators) : null}
            tight={index === 0}
            onToggle={() => void toggle("groups", subgroup.id)}
            onMenu={() => setGroupMenuId(subgroup.id)}
            pressProps={pressProps}
            theme={theme}
            fontSize={metrics.primaryFontSize}
            lineHeight={metrics.primaryLineHeight}
          />
        </DragHandle>
        {collapsed ? null : members.length > 0 ? (
          <View onLayout={drag.onSubgroupBodyLayout(subgroup.id)} style={{ paddingLeft: nestIndent }}>
            {members.map((project, memberIndex) => renderProject(project, memberIndex, subgroup.id, multiHost))}
          </View>
        ) : (
          emptyGroup
        )}
      </DragBlock>
    );
  };
  const sections: ReactNode[] = visibleGroups.map((group) => {
    const members = membersOf(group.id);
    const subgroups = visibleSubgroups(group.id);
    /** Counts and the status dot roll up through subgroups. */
    const allMembers = allMembersOf(group.id);
    const collapsed = isCollapsed("groups", group.id);
    const item: DragItem = { kind: "group", id: group.id };
    return (
      <DragBlock
        key={`group:${group.id}`}
        drag={drag}
        lifted={drag.isDragging(item)}
        raised={drag.containsDragged(group.id)}
        onLayout={drag.onGroupLayout(group.id)}
        theme={theme}
      >
        <DragHandle
          drag={drag}
          item={item}
          style={drag.isDragging(item) ? undefined : stickyStyle(0, surface, STICKY_SECTION_Z)}
          onLayout={(event) => setGroupHeadingHeight(event.nativeEvent.layout.height)}
        >
          <GroupHeader
            group={group}
            collapsed={collapsed}
            count={allMembers.length}
            status={collapsed ? mostUrgent(allMembers.flatMap((project) => project.items), indicators) : null}
            onToggle={() => void toggle("groups", group.id)}
            onMenu={() => setGroupMenuId(group.id)}
            pressProps={pressProps}
            theme={theme}
            fontSize={metrics.primaryFontSize}
            lineHeight={metrics.primaryLineHeight}
          />
        </DragHandle>
        {collapsed ? null : members.length > 0 || subgroups.length > 0 ? (
          // Shift nested subgroups and projects so their chevron lines up with the group icon.
          <View onLayout={drag.onGroupBodyLayout(group.id)} style={{ paddingLeft: nestIndent }}>
            {subgroups.map((subgroup, index) => renderSubgroup(subgroup, group.id, index))}
            {members.map((project, index) => renderProject(project, subgroups.length + index, group.id, multiHost))}
          </View>
        ) : (
          emptyGroup
        )}
      </DragBlock>
    );
  });
  const menuGroup = groupsDoc.groups.find((group) => group.id === groupMenuId) ?? null;
  const menuGroupParent = menuGroup ? parentOf(groupsDoc, menuGroup) : null;
  const menuGroupProjects = menuGroup
    ? (menuGroupParent ? membersOf(menuGroup.id) : allMembersOf(menuGroup.id)).map((project) => String(project.key))
    : [];
  return (
    <WorkspaceDescriptorFeed hosts={hosts}>
      <View style={{ flex: 1 }}>
        <ViewOptionsHeader
          theme={theme}
          settings={settings}
          filters={filters}
          filterOptions={{ projects: projectOptions, labels: labelOptions }}
          onNewGroup={() => newGroup()}
          search={<SearchBox value={query} onChange={setQuery} theme={theme} />}
          rightInset={scrollbarGutter}
          collapseByDefault={collapse.collapsedByDefault}
          onCollapseByDefaultChange={(value) => void collapse.setDefaultCollapsed(value)}
        />
        <View ref={viewportRef} collapsable={false} style={{ flex: 1 }}>
          <ScrollView
            ref={drag.scrollRef}
            style={{ flex: 1 }}
            scrollEnabled={!drag.locked}
            scrollEventThrottle={16}
            onScroll={(event) => {
              drag.onScroll(event);
              const offset = event.nativeEvent.contentOffset.y;
              jump.onScroll(offset);
              latestJump.onScroll(offset);
            }}
            onLayout={(event) => {
              drag.onViewportLayout(event);
              jump.remeasure();
              latestJump.remeasure();
              const view = event.nativeEvent.layout.width;
              setListWidths((current) => (current.view === view ? current : { ...current, view }));
            }}
            onContentSizeChange={(width, height) => {
              drag.onContentSizeChange(width, height);
              jump.remeasure();
              latestJump.remeasure();
            }}
          >
            {/* Measures the content width, which excludes the scrollbar gutter. */}
            <View
              onLayout={(event) => {
                const content = event.nativeEvent.layout.width;
                setListWidths((current) => (current.content === content ? current : { ...current, content }));
              }}
            />
            {filtered && unfiltered.length > 0 && grouped.length === 0 ? (
              <FilterEmptyState
                onClear={() => {
                  setQuery("");
                  if (filtersActive) void clearFilters();
                }}
                theme={theme}
              />
            ) : null}
            {pinned.length > 0 ? (
              <View
                onLayout={drag.onPinnedSectionLayout}
                style={drag.dragging?.kind === "pinned" ? { paddingBottom: 4, zIndex: 10 } : { paddingBottom: 4 }}
              >
                <View style={stickyStyle(0, surface, STICKY_SECTION_Z)}>
                  <PinnedHeader
                    appearance={pinnedAppearance}
                    collapsed={pinnedCollapsed}
                    count={pinned.length}
                    onToggle={() => void togglePinned()}
                    onMenu={() => setEditingAppearance({ kind: "pinned" })}
                    theme={theme}
                    fontSize={metrics.primaryFontSize}
                    lineHeight={metrics.primaryLineHeight}
                  />
                </View>
                {pinnedCollapsed ? null : (
                  <>
                    <View onLayout={drag.onPinnedListLayout}>
                      {pinned.map((reference) => {
                        const item: DragItem = { kind: "pinned", key: reference.key };
                        return (
                          <DragBlock
                            key={reference.key}
                            drag={drag}
                            lifted={drag.isDragging(item)}
                            onLayout={drag.onPinnedLayout(reference.key)}
                            theme={theme}
                          >
                            <DragHandle drag={drag} item={item}>
                              {trackRow(
                                <WorkspaceRow
                                  reference={reference}
                                  active={active.workspace?.key === reference.key}
                                  navigation={navigation}
                                  theme={theme}
                                  settings={settings}
                                  pinned
                                  // Lines up with the chevrons of projects nested under a group.
                                  indent={HEADING_INSET + nestIndent}
                                  pressProps={pressProps}
                                  onMenu={setMenuFor}
                                />,
                                reference.key,
                                {
                                  active: activeSpot?.kind === "pinned" && reference.key === activeKey,
                                  latest: latestSpot?.kind === "pinned" && reference.key === latestKey,
                                },
                              )}
                            </DragHandle>
                          </DragBlock>
                        );
                      })}
                    </View>
                  </>
                )}
              </View>
            ) : null}
            {sections}
            {flatSections.map((section) => {
              const collapsed = isCollapsed("sections", section.key);
              return (
                <View key={section.key}>
                  <View style={stickyStyle(0, surface, STICKY_SECTION_Z)}>
                    <SectionHeader
                      title={section.title}
                      indicator={section.indicator}
                      collapsed={collapsed}
                      count={section.items.length}
                      onToggle={() => void toggle("sections", section.key)}
                      theme={theme}
                      fontSize={metrics.primaryFontSize}
                      lineHeight={metrics.primaryLineHeight}
                    />
                  </View>
                  {collapsed
                    ? null
                    : section.items.map((reference) =>
                        trackRow(
                          <WorkspaceRow
                            key={reference.key}
                            reference={reference}
                            active={active.workspace?.key === reference.key}
                            navigation={navigation}
                            theme={theme}
                            settings={settings}
                            onMenu={setMenuFor}
                          />,
                          reference.key,
                          {
                            active:
                              activeSpot?.kind === "section" &&
                              activeSpot.sectionKey === section.key &&
                              reference.key === activeKey,
                            latest:
                              latestSpot?.kind === "section" &&
                              latestSpot.sectionKey === section.key &&
                              reference.key === latestKey,
                          },
                        ),
                      )}
                </View>
              );
            })}
            <View onLayout={drag.onUngroupedLayout} style={drag.containsDragged(null) ? { zIndex: 10 } : undefined}>
              {ungrouped.map((project, index) => renderProject(project, index, null, multiHost))}
              {drag.dragging?.kind === "project" && drag.dragging.groupId !== null && ungrouped.length === 0 ? (
                // Drop zone for ungrouping when no project is ungrouped yet.
                <View
                  style={{
                    minHeight: metrics.rowMinHeight,
                    marginLeft: metrics.rowIndent,
                    marginRight: 12,
                    marginTop: 16,
                    marginBottom: 4,
                    borderRadius: 6,
                    borderWidth: 1,
                    borderStyle: "dashed",
                    borderColor: theme.colors.border,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ color: theme.colors.foregroundMuted, fontSize: metrics.secondaryFontSize, lineHeight: metrics.secondaryLineHeight }}>
                    {t("common.ungrouped")}
                  </Text>
                </View>
              ) : null}
            </View>
            <DropIndicator drag={drag} theme={theme} />
          </ScrollView>
          {showActiveJump || showLatestJump ? (
            <JumpPills
              actions={[
                ...(showActiveJump
                  ? [
                      {
                        id: "active",
                        label: t("jump.label"),
                        accessibilityLabel: t("jump.a11y"),
                        direction: activeCollapsed ? null : jump.offscreen,
                        onPress: () => jumpTo(jump, activeCollapsed),
                      },
                    ]
                  : []),
                ...(showLatestJump
                  ? [
                      {
                        id: "latest",
                        label: t("jump.latestLabel"),
                        accessibilityLabel: t("jump.latestA11y"),
                        direction: latestCollapsed ? null : latestJump.offscreen,
                        onPress: () => {
                          jumpTo(latestJump, latestCollapsed);
                          if (latestRef) navigation.openWorkspace(latestRef);
                        },
                      },
                    ]
                  : []),
              ]}
              theme={theme}
              fontSize={metrics.secondaryFontSize}
              lineHeight={metrics.secondaryLineHeight}
            />
          ) : null}
        </View>
        <GroupEditorModal
          open={editing !== undefined}
          group={editing ?? null}
          parentId={newGroupParentId}
          onClose={() => setEditing(undefined)}
          theme={theme}
        />
        <GroupMenuModal
          group={menuGroup}
          parent={menuGroupParent}
          subgroupCount={menuGroup && !menuGroupParent ? subgroupsOf(groupsDoc, menuGroup.id).length : 0}
          projectKeys={menuGroupProjects}
          collapse={viewCollapse}
          onEdit={(group) => {
            setGroupMenuId(null);
            setEditing(group);
          }}
          onNewSubgroup={(group) => {
            setGroupMenuId(null);
            newGroup(group.id);
          }}
          onMove={(group) => {
            setGroupMenuId(null);
            setMovingGroup(group);
          }}
          onClose={() => setGroupMenuId(null)}
          theme={theme}
        />
        <ProjectMenuModal
          project={projectMenu}
          onNewWorkspace={(reference) => navigation.openProject(reference)}
          onEdit={(target) => {
            setProjectMenu(null);
            setEditingAppearance({ kind: "project", project: target });
          }}
          onMove={(target) => {
            setProjectMenu(null);
            setMoving(target);
          }}
          onArchiveMany={(target) => {
            setProjectMenu(null);
            setArchivingMany(target);
          }}
          onClose={() => setProjectMenu(null)}
          theme={theme}
        />
        <MoveProjectModal
          project={moving}
          onBack={(target) => {
            setMoving(null);
            setProjectMenu({ ...target, ref: projectRefs.get(target.key) ?? null });
          }}
          onClose={() => setMoving(null)}
          onNewGroup={() => {
            setMoving(null);
            newGroup();
          }}
          theme={theme}
        />
        <BulkArchiveModal
          project={archivingMany}
          activeKey={activeKey}
          includeBackground={settings.showBackground}
          onBack={(target) => {
            setArchivingMany(null);
            setProjectMenu({ ...target, ref: projectRefs.get(target.key) ?? null });
          }}
          onClose={() => setArchivingMany(null)}
          theme={theme}
        />
        <MoveGroupModal
          group={movingGroup}
          onBack={(group) => {
            setMovingGroup(null);
            setGroupMenuId(group.id);
          }}
          onClose={() => setMovingGroup(null)}
          theme={theme}
        />
        <AppearanceEditorModal
          open={editingAppearance !== null}
          title={
            editingAppearance?.kind === "project"
              ? t("projectMenu.editTitle", { name: editingAppearance.project.title })
              : t("pinned.edit")
          }
          value={
            editingAppearance?.kind === "project" ? projectAppearance(editingAppearance.project.key) : pinnedAppearance
          }
          ready={appearanceState.status === "ready"}
          saveError={appearanceState.saveError}
          note={editingAppearance?.kind === "project" ? t("editor.projectNote") : undefined}
          onSave={(next) =>
            editingAppearance?.kind === "project"
              ? setProjectAppearance(editingAppearance.project.key, next)
              : setPinnedAppearance(next)
          }
          onClose={() => setEditingAppearance(null)}
          theme={theme}
        />
        <WorkspaceActionsModal reference={menuFor} onClose={() => setMenuFor(null)} theme={theme} />
      </View>
    </WorkspaceDescriptorFeed>
  );
}
