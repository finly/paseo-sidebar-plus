import type { PluginTheme } from "@getpaseo/plugin";
import type { PluginSidebarViewProps, WorkspaceRef } from "@getpaseo/plugin/client";
import { useWorkspace } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/ui";
import { Fragment, memo, type ReactNode, useMemo, useState } from "react";
import { ActivityIndicator, Platform, Pressable, Text, View } from "react-native";
import { type DensityMetrics, type DisplaySettings, LIST_INSET, ROW_FIELDS, type RowField, densityMetrics, fieldsOnLine } from "../shared/display-settings";
import { HostTag } from "./host-tag";
import { useT } from "./i18n";
import { useLabelFieldValues } from "./label-fields";
import { usePullRequestFieldValues } from "./pull-request-fields";
import { useServiceFieldValues } from "./service-fields";
import { STATUS_SLOT_SIZE, StatusIndicator } from "./status-indicator";
import { lastActivityText, selectSnapshotFields, snapshotFieldText, useMinuteNow } from "./snapshot-fields";

type Navigation = PluginSidebarViewProps["navigation"];

/**
 * Rendered content per field. A missing or null entry means the field has nothing to show.
 * Strings render as muted line text; components render as-is and must style their own text.
 */
export type RowFieldValues = Partial<Record<RowField, ReactNode | null>>;

const EMPTY_VALUES: RowFieldValues = {};
const DOT_GAP = 8;
const PADDING = 12;
/** The row ⋯ button always shows, on every platform. */
const SHOW_MENU_ALWAYS = true;

function formatCount(value: number): string {
  if (value < 1000) return String(value);
  const thousands = value / 1000;
  return `${thousands < 10 ? thousands.toFixed(1).replace(/\.0$/, "") : Math.round(thousands)}k`;
}

/** Diff stats field content; the caller skips it when there are no changes, so its line can collapse. */
function DiffStats({
  additions,
  deletions,
  theme,
  metrics,
}: {
  additions: number;
  deletions: number;
  theme: PluginTheme;
  metrics: DensityMetrics;
}) {
  const text = { fontSize: metrics.secondaryFontSize, lineHeight: metrics.secondaryLineHeight };
  return (
    <View style={{ flexDirection: "row", gap: 4, flexShrink: 0 }}>
      {additions > 0 ? (
        <Text style={{ color: theme.colors.statusSuccess, ...text }}>+{formatCount(additions)}</Text>
      ) : null}
      {deletions > 0 ? (
        <Text style={{ color: theme.colors.statusDanger, ...text }}>−{formatCount(deletions)}</Text>
      ) : null}
    </View>
  );
}

/**
 * A secondary line. Renders nothing when none of its fields has a value, so the row collapses.
 * A flex row with centered items (not one Text), so icon fields line up with text fields on every platform.
 * Only the last field shrinks (with an ellipsis when it is text); anything still too wide is clipped,
 * so the line is cut from the end like a single truncated Text. Weighted shrinking would ellipsize
 * earlier fields by fractions of a pixel.
 */
function FieldLine({
  fields,
  values,
  theme,
  metrics,
}: {
  fields: RowField[];
  values: RowFieldValues;
  theme: PluginTheme;
  metrics: DensityMetrics;
}) {
  const present = fields.filter((field) => values[field] != null && values[field] !== false && values[field] !== "");
  if (present.length === 0) return null;
  const text = {
    color: theme.colors.foregroundMuted,
    fontSize: metrics.secondaryFontSize,
    lineHeight: metrics.secondaryLineHeight,
  };
  return (
    <View style={{ flexDirection: "row", alignItems: "center", overflow: "hidden", paddingLeft: STATUS_SLOT_SIZE + DOT_GAP }}>
      {present.map((field, index) => {
        const value = values[field];
        const shrink = index === present.length - 1 ? 1 : 0;
        return (
          <Fragment key={field}>
            {index > 0 ? <Text style={[text, { flexShrink: 0 }]}>{" · "}</Text> : null}
            {typeof value === "string" || typeof value === "number" ? (
              <Text numberOfLines={1} style={[text, { flexShrink: shrink, minWidth: 0 }]}>
                {value}
              </Text>
            ) : (
              <View style={{ flexShrink: shrink, minWidth: 0 }}>{value}</View>
            )}
          </Fragment>
        );
      })}
    </View>
  );
}

/** Line 2 of a pinned row: the project joins it when the project field is hidden. */
function pinnedLine2(settings: DisplaySettings): RowField[] {
  if (settings.fields.project !== "hidden") return fieldsOnLine(settings, "line2");
  return ROW_FIELDS.filter((field) => field === "project" || settings.fields[field] === "line2");
}

export const WorkspaceRow = memo(function WorkspaceRow({
  reference,
  active,
  navigation,
  theme,
  settings,
  fieldValues = EMPTY_VALUES,
  pinned = false,
  hostTag = null,
  hostColor,
  hostFill = false,
  indent,
  pressProps,
  onMenu,
}: {
  reference: WorkspaceRef;
  active: boolean;
  navigation: Navigation;
  theme: PluginTheme;
  settings: DisplaySettings;
  /** Extra field content (for example from richer data feeds); overrides snapshot fields. */
  fieldValues?: RowFieldValues;
  /** In the Pinned section: no project heading above, so the row sits flush and names its project. */
  pinned?: boolean;
  /** Host badge when one project spans several hosts; replaces the old per-heading host tag. */
  hostTag?: string | null;
  /** Host badge text and faded fill color. */
  hostColor?: string;
  hostFill?: boolean;
  /** Left padding; defaults to the indentation setting, or the row padding when pinned. */
  indent?: number;
  /** Long-press handling for the row (drag arming on touch). */
  pressProps?: { onLongPress?(): void; onPressOut?(): void; delayLongPress?: number };
  /** Opens the workspace ⋯ actions menu. */
  onMenu(reference: WorkspaceRef): void;
}) {
  const t = useT();
  const [hovered, setHovered] = useState(false);
  // On web, hovering the nested button fires the row's hover-out, so the button tracks its own hover too.
  const [buttonHovered, setButtonHovered] = useState(false);
  const showMenu = SHOW_MENU_ALWAYS || hovered || buttonHovered;
  const titleSource = settings.title;
  const workspace = useWorkspace(reference, (item) => ({
    label:
      titleSource === "name"
        ? item.name
        : titleSource === "branch"
          ? (item.branch ?? item.title ?? item.name)
          : (item.title ?? item.name),
    indicator: item.indicator,
    kind: item.kind,
    additions: item.diffStat?.additions ?? 0,
    deletions: item.diffStat?.deletions ?? 0,
    archiving: item.archivingAt !== null,
  }));
  const snapshot = useWorkspace(reference, selectSnapshotFields);
  const metrics = useMemo(() => densityMetrics(settings), [settings]);
  const fieldFont = useMemo(
    () => ({ fontSize: metrics.secondaryFontSize, lineHeight: metrics.secondaryLineHeight }),
    [metrics],
  );
  const pullRequest = usePullRequestFieldValues(reference, theme, fieldFont, settings.checksDisplay);
  const services = useServiceFieldValues(reference, theme, fieldFont);
  const labels = useLabelFieldValues(snapshot?.labels ?? null, theme, fieldFont);
  const now = useMinuteNow();
  const additions = workspace?.additions ?? 0;
  const deletions = workspace?.deletions ?? 0;
  const values = useMemo<RowFieldValues>(() => {
    const text: RowFieldValues = snapshot ? snapshotFieldText(snapshot, now) : {};
    const diffStats =
      additions > 0 || deletions > 0 ? (
        <DiffStats additions={additions} deletions={deletions} theme={theme} metrics={metrics} />
      ) : null;
    return { ...text, diffStats, ...labels, ...pullRequest, ...services, ...fieldValues };
  }, [snapshot, now, additions, deletions, theme, metrics, labels, pullRequest, services, fieldValues]);
  const lastActivity = settings.showLastActivity && snapshot ? lastActivityText(snapshot, now, t) : null;
  if (!workspace) return null;
  // While the host archives the workspace: spinner for the dot, "Archiving…" for the last activity, dimmed and inert.
  const archiving = workspace.archiving;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t(archiving ? "a11y.archivingWorkspace" : "a11y.openWorkspace", { name: workspace.label })}
      accessibilityState={{ disabled: archiving, busy: archiving }}
      disabled={archiving}
      onPress={() => navigation.openWorkspace(reference)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      {...pressProps}
      style={{
        minHeight: metrics.rowMinHeight,
        paddingVertical: metrics.rowPaddingVertical,
        paddingRight: PADDING,
        paddingLeft: indent ?? (pinned ? LIST_INSET + 4 : metrics.rowIndent),
        justifyContent: "center",
        gap: metrics.lineGap,
        backgroundColor: active ? theme.colors.surface2 : "transparent",
        opacity: archiving ? 0.6 : 1,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: DOT_GAP }}>
        {archiving ? (
          <View style={{ width: STATUS_SLOT_SIZE, height: metrics.primaryLineHeight, alignItems: "center", justifyContent: "center" }}>
            {/* The smallest native spinner is 20pt; scale it to the status slot. */}
            <ActivityIndicator size="small" color={theme.colors.foregroundMuted} style={{ transform: [{ scale: 0.6 }] }} />
          </View>
        ) : (
          <StatusIndicator indicator={workspace.indicator} kind={workspace.kind} theme={theme} height={metrics.primaryLineHeight} />
        )}
        <Text
          numberOfLines={1}
          style={{
            flex: 1,
            minWidth: 0,
            color: theme.colors.foreground,
            fontSize: metrics.primaryFontSize,
            lineHeight: metrics.primaryLineHeight,
          }}
        >
          {workspace.label}
        </Text>
        {hostTag ? (
          <HostTag
            name={hostTag}
            color={hostColor ?? theme.colors.foregroundMuted}
            fill={hostFill}
            fontSize={metrics.primaryFontSize}
            lineHeight={metrics.primaryLineHeight}
            maxWidth={96}
          />
        ) : null}
        {archiving ? (
          <Text
            style={{
              flexShrink: 0,
              color: theme.colors.foregroundMuted,
              fontSize: metrics.secondaryFontSize,
              lineHeight: metrics.primaryLineHeight,
            }}
          >
            {t("row.archiving")}
          </Text>
        ) : lastActivity ? (
          <Text
            style={{
              flexShrink: 0,
              color: theme.colors.foregroundMuted,
              fontSize: metrics.secondaryFontSize,
              lineHeight: metrics.primaryLineHeight,
            }}
          >
            {lastActivity}
          </Text>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("a11y.workspaceActions", { name: workspace.label })}
          onHoverIn={() => setButtonHovered(true)}
          onHoverOut={() => setButtonHovered(false)}
          onPress={() => onMenu(reference)}
          disabled={archiving}
          hitSlop={6}
          style={({ pressed }) => ({
            // Same size and right edge as the heading and view header buttons, so every ⋯ lines up.
            width: 28,
            height: 28,
            marginRight: -4,
            marginVertical: -5,
            borderRadius: 6,
            alignItems: "center",
            justifyContent: "center",
            opacity: showMenu && !archiving ? 1 : 0,
            backgroundColor: pressed || buttonHovered ? theme.colors.border : "transparent",
          })}
        >
          <Icon name="Ellipsis" color={theme.colors.foregroundMuted} size={14} />
        </Pressable>
      </View>
      <FieldLine fields={pinned ? pinnedLine2(settings) : fieldsOnLine(settings, "line2")} values={values} theme={theme} metrics={metrics} />
      <FieldLine fields={fieldsOnLine(settings, "line3")} values={values} theme={theme} metrics={metrics} />
    </Pressable>
  );
});
