import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";
import { filtersSchema } from "./filters";
import { GROUP_COLORS } from "./groups";

/** Where a row field renders. Line 1 (status dot, title, last activity) is fixed. */
export const FIELD_PLACEMENTS = ["line2", "line3", "hidden"] as const;
export type FieldPlacement = (typeof FIELD_PLACEMENTS)[number];

/** Configurable row fields, in render order within a line. */
export const ROW_FIELDS = [
  "branch",
  "project",
  "pullRequest",
  "checks",
  "diffStats",
  "services",
  "labels",
] as const;
export type RowField = (typeof ROW_FIELDS)[number];

export const DEFAULT_FIELD_PLACEMENTS: Readonly<Record<RowField, FieldPlacement>> = {
  branch: "line2",
  project: "hidden",
  pullRequest: "line3",
  checks: "line3",
  services: "line3",
  labels: "line3",
  diffStats: "line3",
};

/** Host tag color: none (muted text, no fill), the theme accent, or one of the named group colors. */
export const HOST_COLORS = ["none", "accent", ...GROUP_COLORS] as const;
export type HostColor = (typeof HOST_COLORS)[number];

/** Line 1 text: the workspace title (falling back to its name), its name, or its branch. */
export const TITLE_SOURCES = ["title", "name", "branch"] as const;
export type TitleSource = (typeof TITLE_SOURCES)[number];

/** Checks badge: icon plus text ("passed", "2 failed"), icon only, or hidden. */
export const CHECKS_DISPLAYS = ["iconAndText", "icon", "none"] as const;
export type ChecksDisplay = (typeof CHECKS_DISPLAYS)[number];

/**
 * Sidebar sections, as in Paseo's sidebar grouping: by project (with Sidebar+ groups), by status bucket,
 * or one section per label (plus Unlabelled). Pinned workspaces keep their own section in every mode.
 */
export const GROUPINGS = ["project", "status", "label"] as const;
export type Grouping = (typeof GROUPINGS)[number];

/** Workspace order within a project. */
export const SORT_ORDERS = ["name", "lastActivity", "created"] as const;
export type SortOrder = (typeof SORT_ORDERS)[number];

/** Density: text size, row height, and workspace indentation. "default" matches the dense layout. */
export const TEXT_SIZES = ["small", "default", "large"] as const;
export type TextSize = (typeof TEXT_SIZES)[number];

export const ROW_HEIGHTS = ["compact", "default", "comfortable"] as const;
export type RowHeight = (typeof ROW_HEIGHTS)[number];

export const INDENTATIONS = ["small", "medium", "large"] as const;
export type Indentation = (typeof INDENTATIONS)[number];

export interface DensityMetrics {
  /** Title and group heading font size and line height. */
  readonly primaryFontSize: number;
  readonly primaryLineHeight: number;
  /** Secondary lines and diff stats font size and line height. */
  readonly secondaryFontSize: number;
  readonly secondaryLineHeight: number;
  readonly rowMinHeight: number;
  readonly rowPaddingVertical: number;
  readonly lineGap: number;
  /** Left padding of a workspace row. */
  readonly rowIndent: number;
  /** Indentation relative to the largest option (1 at large), for nesting inside groups and subgroups. */
  readonly indentScale: number;
}

const TEXT_METRICS: Record<TextSize, Pick<DensityMetrics, "primaryFontSize" | "primaryLineHeight" | "secondaryFontSize" | "secondaryLineHeight">> = {
  small: { primaryFontSize: 12, primaryLineHeight: 16, secondaryFontSize: 11, secondaryLineHeight: 15 },
  default: { primaryFontSize: 13, primaryLineHeight: 18, secondaryFontSize: 12, secondaryLineHeight: 17 },
  large: { primaryFontSize: 15, primaryLineHeight: 20, secondaryFontSize: 13, secondaryLineHeight: 18 },
};

const ROW_METRICS: Record<RowHeight, Pick<DensityMetrics, "rowMinHeight" | "rowPaddingVertical" | "lineGap">> = {
  compact: { rowMinHeight: 24, rowPaddingVertical: 3, lineGap: 1 },
  default: { rowMinHeight: 28, rowPaddingVertical: 6, lineGap: 2 },
  comfortable: { rowMinHeight: 36, rowPaddingVertical: 10, lineGap: 4 },
};

/**
 * Left edge of the list: heading chevrons start here, under the view header's search icon
 * (header padding 8 + search border 1 + search padding 8).
 */
export const LIST_INSET = 17;

/** Row indentation past a top-level heading's left padding. */
const INDENT_METRICS: Record<Indentation, number> = { small: 4, medium: 10, large: 16 };

/** Version 1 indentation values, mapped to the renamed option with the same spacing. */
const V1_INDENTATIONS: Record<string, Indentation> = { none: "small", small: "medium", default: "large" };

export function densityMetrics(settings: DisplaySettings): DensityMetrics {
  return {
    ...TEXT_METRICS[settings.textSize],
    ...ROW_METRICS[settings.rowHeight],
    rowIndent: LIST_INSET + INDENT_METRICS[settings.indentation],
    indentScale: INDENT_METRICS[settings.indentation] / INDENT_METRICS.large,
  };
}

const placement = z.enum(FIELD_PLACEMENTS);

/** Host-scoped (shared across devices) display preferences. Filters stay per device (`deviceDisplaySettings`). */
export const displaySettings = defineSettings({
  id: "display",
  scope: "host",
  version: 2,
  migrate: (values, fromVersion) => {
    if (fromVersion >= 2 || typeof values !== "object" || values === null) return values;
    const { indentation } = values as { indentation?: unknown };
    if (typeof indentation !== "string" || !(indentation in V1_INDENTATIONS)) return values;
    return { ...values, indentation: V1_INDENTATIONS[indentation] };
  },
  schema: z.object({
    fields: z
      .object({
        branch: placement.default(DEFAULT_FIELD_PLACEMENTS.branch),
        project: placement.default(DEFAULT_FIELD_PLACEMENTS.project),
        pullRequest: placement.default(DEFAULT_FIELD_PLACEMENTS.pullRequest),
        checks: placement.default(DEFAULT_FIELD_PLACEMENTS.checks),
        services: placement.default(DEFAULT_FIELD_PLACEMENTS.services),
        labels: placement.default(DEFAULT_FIELD_PLACEMENTS.labels),
        diffStats: placement.default(DEFAULT_FIELD_PLACEMENTS.diffStats),
      })
      .default({ ...DEFAULT_FIELD_PLACEMENTS }),
    title: z.enum(TITLE_SOURCES).default("title"),
    grouping: z.enum(GROUPINGS).default("project").catch("project"),
    checksDisplay: z.enum(CHECKS_DISPLAYS).default("iconAndText"),
    // `catch`: a stored "manual" value from before the Manual order switch falls back to the default.
    sort: z.enum(SORT_ORDERS).default("created").catch("created"),
    /** Drag workspaces into a saved order per project; workspaces not yet dragged keep their `sort` slot. */
    manualOrder: z.boolean().default(false),
    /** With projects on several hosts: split ungrouped projects by host and tag grouped projects with their host. */
    showHosts: z.boolean().default(true),
    /** Host tag color per host, keyed by server id; unset hosts use the accent. */
    hostColors: z.record(z.string(), z.enum(HOST_COLORS)).default({}),
    /** Show workspaces marked as background. */
    showBackground: z.boolean().default(false),
    /** Show the last activity time on the right of line 1. */
    showLastActivity: z.boolean().default(true),
    textSize: z.enum(TEXT_SIZES).default("default"),
    rowHeight: z.enum(ROW_HEIGHTS).default("default"),
    indentation: z.enum(INDENTATIONS).default("small"),
  }),
});

/**
 * Device-scoped document under the same id, where display preferences were stored before they moved to
 * the host. It now holds the host, project, and label filters (empty lists mean "all"); its older display
 * fields are kept (loose object) so they can be copied to the host once (see `useCopyDeviceToHost`).
 */
export const deviceDisplaySettings = defineSettings({
  id: "display",
  scope: "device",
  version: 1,
  schema: z.looseObject({
    filters: filtersSchema,
  }),
});

export type DisplaySettings = z.output<typeof displaySettings.schema>;

/** Fields placed on the given line, in render order. */
export function fieldsOnLine(settings: DisplaySettings, line: "line2" | "line3"): RowField[] {
  return ROW_FIELDS.filter((field) => settings.fields[field] === line);
}
