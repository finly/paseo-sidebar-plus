import type { PluginTheme } from "@getpaseo/plugin";
import type { WorkspaceRef } from "@getpaseo/plugin/client";
import { type ReactNode, useMemo } from "react";
import { openExternalUrl } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/ui";
import { Pressable, Text, View } from "react-native";
import type { ChecksDisplay, RowField } from "../shared/display-settings";
import { type Translate, useT } from "./i18n";
import { type WorkspaceDescriptor, useWorkspaceDescriptor } from "./workspace-descriptors";

export type PullRequestState = "open" | "draft" | "merged" | "closed";
export type ChecksState = "success" | "pending" | "failure";

/** Pull request summary for a row. Primitives only. */
export interface PullRequestFieldData {
  readonly number: number | null;
  readonly url: string | null;
  readonly state: PullRequestState;
  readonly checks: ChecksState | null;
  readonly failedChecks: number;
}

type PullRequest = NonNullable<NonNullable<WorkspaceDescriptor["githubRuntime"]>["pullRequest"]>;

function pullRequestState(pr: PullRequest): PullRequestState {
  if (pr.isMerged) return "merged";
  const state = pr.state.toLowerCase();
  if (state === "merged") return "merged";
  if (state === "closed") return "closed";
  return pr.isDraft ? "draft" : "open";
}

function checksState(pr: PullRequest): ChecksState | null {
  if (pr.checksStatus === "success" || pr.checksStatus === "pending" || pr.checksStatus === "failure") {
    return pr.checksStatus;
  }
  if (pr.checksStatus === "none") return null;
  // Older hosts may send only the per-check list.
  const checks = pr.checks ?? [];
  if (checks.length === 0) return null;
  if (checks.some((check) => check.status === "failure")) return "failure";
  if (checks.some((check) => check.status === "pending")) return "pending";
  return "success";
}

export function selectPullRequestFields(descriptor: WorkspaceDescriptor | null): PullRequestFieldData | null {
  const pr = descriptor?.githubRuntime?.pullRequest;
  if (!pr) return null;
  return {
    number: pr.number ?? null,
    url: pr.url || null,
    state: pullRequestState(pr),
    checks: checksState(pr),
    failedChecks: (pr.checks ?? []).filter((check) => check.status === "failure").length,
  };
}

/** Paseo's sidebar merged purple; the plugin theme has no merged color, so pick by surface brightness. */
function mergedColor(theme: PluginTheme): string {
  const hex = theme.colors.surface0.replace("#", "");
  const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex.slice(0, 6);
  const value = Number.parseInt(full, 16);
  if (Number.isNaN(value)) return "#a890d5";
  const luminance = 0.299 * (value >> 16) + 0.587 * ((value >> 8) & 255) + 0.114 * (value & 255);
  return luminance > 128 ? "#7347af" : "#a890d5";
}

function stateColor(theme: PluginTheme, state: PullRequestState): string {
  switch (state) {
    case "open":
      return theme.colors.statusWarning;
    case "merged":
      return mergedColor(theme);
    case "closed":
      return theme.colors.statusDanger;
    default:
      return theme.colors.foregroundMuted;
  }
}

/** PR number as #N, followed by "Merged" once merged, as in Paseo's sidebar. */
function pullRequestLabel(number: number | null, state: PullRequestState, t: Translate): string | null {
  const merged = state === "merged" ? t("pullRequest.merged") : null;
  if (number === null) return merged;
  return merged ? `#${number} ${merged}` : `#${number}`;
}

const STATE_ICONS: Record<PullRequestState, string> = {
  open: "GitPullRequest",
  draft: "GitPullRequestDraft",
  merged: "GitMerge",
  closed: "GitPullRequestClosed",
};

/** Secondary line font, so labels inside an icon group match the surrounding line text. */
export interface FieldFont {
  readonly fontSize: number;
  readonly lineHeight: number;
}

/** Icon plus label, vertically centered on the label's line box. */
function IconLabel({
  icon,
  label,
  color,
  font,
}: {
  icon: ReactNode;
  label: string | null;
  color: string;
  font: FieldFont;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      {icon}
      {label !== null ? <Text style={{ color, fontSize: font.fontSize, lineHeight: font.lineHeight }}>{label}</Text> : null}
    </View>
  );
}

interface ChecksBadgeSpec {
  readonly icon: "CircleCheck" | "CircleDashed" | "CircleX";
  readonly text: string;
  readonly color: string;
}

function checksBadgeSpec(theme: PluginTheme, data: PullRequestFieldData, t: Translate): ChecksBadgeSpec | null {
  switch (data.checks) {
    case "success":
      return { icon: "CircleCheck", text: t("checks.passed"), color: theme.colors.statusSuccess };
    case "pending":
      return { icon: "CircleDashed", text: t("checks.pending"), color: theme.colors.statusWarning };
    case "failure":
      return {
        icon: "CircleX",
        text: data.failedChecks > 0 ? t("checks.failedCount", { count: data.failedChecks }) : t("checks.failed"),
        color: theme.colors.statusDanger,
      };
    default:
      return null;
  }
}

/** Checks badge in the chosen display mode; null when hidden or there are no checks. */
function checksBadge(
  theme: PluginTheme,
  data: PullRequestFieldData,
  font: FieldFont,
  display: ChecksDisplay,
  t: Translate,
): ReactNode {
  if (display === "none") return null;
  const spec = checksBadgeSpec(theme, data, t);
  if (!spec) return null;
  return (
    <View accessible accessibilityLabel={t("a11y.checks", { status: spec.text })}>
      <IconLabel
        icon={<Icon name={spec.icon} color={spec.color} size={font.fontSize} />}
        label={display === "icon" ? null : spec.text}
        color={spec.color}
        font={font}
      />
    </View>
  );
}

/** Pull request and checks field content for a row, from the live descriptor feed. */
export function usePullRequestFieldValues(
  reference: WorkspaceRef,
  theme: PluginTheme,
  /** Secondary line font; icons are sized to its font size. */
  font: FieldFont,
  checksDisplay: ChecksDisplay,
): Partial<Record<RowField, ReactNode>> | null {
  const t = useT();
  const descriptor = useWorkspaceDescriptor(reference);
  const data = selectPullRequestFields(descriptor);
  const number = data?.number ?? null;
  const url = data?.url ?? null;
  const state = data?.state ?? null;
  const checks = data?.checks ?? null;
  const failedChecks = data?.failedChecks ?? 0;
  return useMemo(() => {
    if (state === null) return null;
    const summary: PullRequestFieldData = { number, url, state, checks, failedChecks };
    const badge = checksBadge(theme, summary, font, checksDisplay, t);
    return {
      pullRequest: (
        // Own press target, so pressing the badge opens the PR and not the workspace.
        <Pressable
          accessibilityRole={url !== null ? "link" : undefined}
          accessibilityLabel={
            number !== null
              ? t("a11y.pullRequestNumber", { number, state: t(`pullRequest.state.${state}`) })
              : t("a11y.pullRequest", { state: t(`pullRequest.state.${state}`) })
          }
          disabled={url === null}
          hitSlop={4}
          onPress={() => {
            if (url !== null) void openExternalUrl(url);
          }}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
        >
          <IconLabel
            icon={<Icon name={STATE_ICONS[state]} color={stateColor(theme, state)} size={font.fontSize} />}
            label={pullRequestLabel(number, state, t)}
            color={stateColor(theme, state)}
            font={font}
          />
        </Pressable>
      ),
      checks: badge,
    };
  }, [theme, font, number, url, state, checks, failedChecks, checksDisplay, t]);
}
