import type { PluginTheme } from "@getpaseo/plugin";
import { Icon } from "@getpaseo/plugin/client/ui";
import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, type ScrollView, Text, View } from "react-native";

/** Where a tracked row is relative to the viewport; null while it is in view or not measured. */
export type Offscreen = "above" | "below" | null;

/** One row's jump state: its measuring handle, measured position, and scroll action. */
export interface JumpTracker {
  readonly rowRef: RefObject<View | null>;
  readonly offscreen: Offscreen;
  /** Layout of the tracked row, the viewport, or the content changed. */
  remeasure(): void;
  onScroll(y: number): void;
  /** Scrolls to the row now, or once it mounts when `afterExpand` (its parents are being expanded). */
  jump(afterExpand: boolean): void;
}

/**
 * Tracks whether one workspace row is scrolled out of view, and scrolls it into view (centered).
 * Positions come from `measureInWindow` on the shared viewport and the row, cached as a content offset so
 * scrolling only does arithmetic; the cache refreshes on row, viewport, and content size changes.
 */
export function useJumpToRow(
  scrollRef: RefObject<ScrollView | null>,
  viewportRef: RefObject<View | null>,
  rowKey: string | null,
) {
  const rowRef = useRef<View>(null);
  const scrollY = useRef(0);
  /** Tracked row top in content coordinates, its height, and the viewport height; null until measured. */
  const cache = useRef<{ top: number; height: number; viewport: number } | null>(null);
  /** Set by a jump that first expands collapsed parents: scroll once the row mounts. */
  const pending = useRef(false);
  const [offscreen, setOffscreen] = useState<Offscreen>(null);

  const evaluate = useCallback(() => {
    const spot = cache.current;
    if (!spot) {
      setOffscreen(null);
      return;
    }
    const center = spot.top + spot.height / 2;
    setOffscreen(center < scrollY.current ? "above" : center > scrollY.current + spot.viewport ? "below" : null);
  }, []);

  const scrollToRow = useCallback(() => {
    const spot = cache.current;
    if (!spot) return;
    const y = Math.max(0, spot.top - (spot.viewport - spot.height) / 2);
    scrollRef.current?.scrollTo({ y, animated: true });
  }, [scrollRef]);

  const measure = useCallback(() => {
    const viewport = viewportRef.current;
    const row = rowRef.current;
    if (!viewport || !row) {
      cache.current = null;
      evaluate();
      return;
    }
    viewport.measureInWindow((_vx, vy, _vw, vh) => {
      row.measureInWindow((_rx, ry, _rw, rh) => {
        if (vh <= 0 || rh <= 0) return;
        cache.current = { top: scrollY.current + ry - vy, height: rh, viewport: vh };
        evaluate();
        if (pending.current) {
          pending.current = false;
          scrollToRow();
        }
      });
    });
  }, [evaluate, scrollToRow, viewportRef]);

  // A new tracked row: drop the old position until its row reports layout.
  useEffect(() => {
    cache.current = null;
    pending.current = false;
    measure();
  }, [rowKey, measure]);

  return useMemo((): JumpTracker => ({
    rowRef,
    offscreen,
    remeasure: measure,
    onScroll(y: number) {
      scrollY.current = y;
      evaluate();
    },
    jump(afterExpand: boolean) {
      pending.current = true;
      if (!afterExpand) measure();
    },
  }), [offscreen, measure, evaluate]);
}

/** One action in the bottom pill: where to scroll and what to call it. */
export interface JumpAction {
  readonly id: string;
  readonly label: string;
  readonly accessibilityLabel: string;
  /** Arrow toward the row; null (row inside a collapsed parent) shows a locate icon. */
  readonly direction: Offscreen;
  onPress(): void;
}

function JumpPill({
  action,
  theme,
  fontSize,
  lineHeight,
}: {
  action: JumpAction;
  theme: PluginTheme;
  fontSize: number;
  lineHeight: number;
}) {
  const [hovered, setHovered] = useState(false);
  const color = hovered ? theme.colors.foreground : theme.colors.foregroundMuted;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={action.accessibilityLabel}
      onPress={action.onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: pressed || hovered ? theme.colors.foregroundMuted : theme.colors.border,
        backgroundColor: theme.colors.surface2,
      })}
    >
      <Icon
        name={action.direction === "above" ? "ArrowUp" : action.direction === "below" ? "ArrowDown" : "LocateFixed"}
        color={color}
        size={fontSize}
      />
      <Text style={{ color, fontSize, lineHeight }}>{action.label}</Text>
    </Pressable>
  );
}

/** Pills at the bottom of the view that jump to the open workspace or to the latest one. */
export function JumpPills({
  actions,
  theme,
  fontSize,
  lineHeight,
}: {
  actions: readonly JumpAction[];
  theme: PluginTheme;
  fontSize: number;
  lineHeight: number;
}) {
  if (actions.length === 0) return null;
  return (
    <View
      pointerEvents="box-none"
      style={{ position: "absolute", left: 0, right: 0, bottom: 8, alignItems: "center", zIndex: 2 }}
    >
      <View style={{ flexDirection: "row", gap: 8 }}>
        {actions.map((action) => (
          <JumpPill
            key={action.id}
            action={action}
            theme={theme}
            fontSize={fontSize}
            lineHeight={lineHeight}
          />
        ))}
      </View>
    </View>
  );
}
