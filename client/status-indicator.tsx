import type { PluginTheme, PluginWorkspaceSnapshot, WorkspaceIndicator } from "@getpaseo/plugin";
import { Icon } from "@getpaseo/plugin/client/ui";
import { memo, useEffect } from "react";
import { Animated, Easing, Platform, View } from "react-native";
import { useT } from "./i18n";

/** Width of the leading status slot on a workspace row; secondary lines indent by it. */
export const STATUS_SLOT_SIZE = 16;

// Geometry from Paseo's row indicator.
const FILLED_DOT_SIZE = 6;
const OVERLAY_DOT_SIZE = FILLED_DOT_SIZE + 2;
const ALERT_SIZE = 12;
const KIND_ICON_SIZE = 14;
const RING_GAP = 1.5;
const RING_STROKE = 1.5;
const RING_SIZE = FILLED_DOT_SIZE + (RING_GAP + RING_STROKE) * 2;
const RING_FRAME_SIZE = RING_SIZE + 2;
const RING_TRACK_OPACITY = 0.3;
const RING_HEAD_OPACITY = 0.9;
const RING_PERIOD_MS = 900;
const DONE_OPACITY = 0.3;

export function indicatorColor(theme: PluginTheme, indicator: string): string {
  switch (indicator) {
    case "needs_input":
      return theme.colors.statusWarning;
    case "attention":
      return theme.colors.statusSuccess;
    case "failed":
      return theme.colors.statusDanger;
    case "running":
      return theme.colors.accent;
    default:
      return theme.colors.border;
  }
}

// One rotation shared by every ring, so rings that mount mid-turn stay in phase.
const rotation = new Animated.Value(0);
let ringCount = 0;
let ringLoop: Animated.CompositeAnimation | null = null;

function acquireRing() {
  ringCount += 1;
  if (ringCount > 1) return;
  rotation.setValue(0);
  ringLoop = Animated.loop(
    Animated.timing(rotation, {
      toValue: 1,
      duration: RING_PERIOD_MS,
      easing: Easing.linear,
      useNativeDriver: Platform.OS !== "web",
    }),
  );
  ringLoop.start();
}

function releaseRing() {
  ringCount -= 1;
  if (ringCount > 0) return;
  ringLoop?.stop();
  ringLoop = null;
}

const spin = rotation.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });

const circle = {
  position: "absolute",
  width: RING_SIZE,
  height: RING_SIZE,
  borderRadius: RING_SIZE / 2,
  borderWidth: RING_STROKE,
} as const;

/** Running: a dot inside a track with a rotating quarter arc. */
function StatusRing({ color }: { color: string }) {
  useEffect(() => {
    acquireRing();
    return releaseRing;
  }, []);
  return (
    <View style={{ width: RING_FRAME_SIZE, height: RING_FRAME_SIZE, alignItems: "center", justifyContent: "center" }}>
      <View style={[circle, { borderColor: color, opacity: RING_TRACK_OPACITY }]} />
      <Animated.View
        style={[
          circle,
          { borderColor: "transparent", borderTopColor: color, opacity: RING_HEAD_OPACITY, transform: [{ rotate: spin }] },
        ]}
      />
      <View style={{ width: FILLED_DOT_SIZE, height: FILLED_DOT_SIZE, borderRadius: FILLED_DOT_SIZE / 2, backgroundColor: color }} />
    </View>
  );
}

/** Needs input: a filled CircleAlert. The plugin Icon has no fill, so a disc sits under the glyph. */
function NeedsInputAlert({ theme }: { theme: PluginTheme }) {
  const disc = ALERT_SIZE - 2;
  return (
    <View style={{ width: ALERT_SIZE, height: ALERT_SIZE, alignItems: "center", justifyContent: "center" }}>
      <View
        style={{
          position: "absolute",
          width: disc,
          height: disc,
          borderRadius: disc / 2,
          backgroundColor: indicatorColor(theme, "needs_input"),
        }}
      />
      <Icon name="CircleAlert" size={ALERT_SIZE} color={theme.colors.surface0} />
    </View>
  );
}

function kindIconName(kind: PluginWorkspaceSnapshot["kind"]): string {
  if (kind === "local_checkout") return "Monitor";
  if (kind === "worktree") return "FolderGit2";
  return "Folder";
}

/** The leading status mark of a workspace row, per state as in Paseo's row. */
export const StatusIndicator = memo(function StatusIndicator({
  indicator,
  kind,
  theme,
  height,
}: {
  indicator: WorkspaceIndicator;
  kind: PluginWorkspaceSnapshot["kind"];
  theme: PluginTheme;
  /** Slot height, so the mark centres on the title's first line. */
  height: number;
}) {
  const t = useT();
  let content;
  if (indicator === "running") {
    content = <StatusRing color={indicatorColor(theme, "running")} />;
  } else if (indicator === "needs_input") {
    content = <NeedsInputAlert theme={theme} />;
  } else if (indicator === "attention" || indicator === "done") {
    content = (
      <View
        style={{
          width: FILLED_DOT_SIZE,
          height: FILLED_DOT_SIZE,
          borderRadius: FILLED_DOT_SIZE / 2,
          backgroundColor: indicator === "attention" ? indicatorColor(theme, "attention") : theme.colors.foregroundMuted,
          opacity: indicator === "done" ? DONE_OPACITY : 1,
        }}
      />
    );
  } else {
    content = (
      <>
        <Icon name={kindIconName(kind)} size={KIND_ICON_SIZE} color={theme.colors.foregroundMuted} />
        <View
          style={{
            position: "absolute",
            right: 0,
            bottom: (height - STATUS_SLOT_SIZE) / 2,
            width: OVERLAY_DOT_SIZE,
            height: OVERLAY_DOT_SIZE,
            borderRadius: OVERLAY_DOT_SIZE / 2,
            borderWidth: 1,
            borderColor: theme.colors.surface0,
            backgroundColor: indicatorColor(theme, indicator),
          }}
        />
      </>
    );
  }
  return (
    <View
      accessibilityLabel={t("a11y.status", { status: t(`status.${indicator}`) })}
      style={{ width: STATUS_SLOT_SIZE, height, flexShrink: 0, alignItems: "center", justifyContent: "center" }}
    >
      {content}
    </View>
  );
});
