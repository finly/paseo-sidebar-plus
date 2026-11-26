import type { PluginTheme } from "@getpaseo/plugin";
import { Icon } from "@getpaseo/plugin/client/ui";
import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, type ScrollView, Text, View } from "react-native";
import { useT } from "./i18n";

/** Where the active row is relative to the viewport; null while it is in view or not measured. */
export type Offscreen = "above" | "below" | null;

/**
 * Tracks whether the active workspace row is scrolled out of view, and scrolls it into view (centered).
 * Positions come from `measureInWindow` on the viewport and the row, cached as a content offset so
 * scrolling only does arithmetic; the cache refreshes on row, viewport, and content size changes.
 */
export function useJumpToActive(scrollRef: RefObject<ScrollView | null>, activeKey: string | null) {
  const viewportRef = useRef<View>(null);
  const rowRef = useRef<View>(null);
  const scrollY = useRef(0);
  /** Active row top in content coordinates, its height, and the viewport height; null until measured. */
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
  }, [evaluate, scrollToRow]);

  // A new active workspace: drop the old position until its row reports layout.
  useEffect(() => {
    cache.current = null;
    pending.current = false;
    measure();
  }, [activeKey, measure]);

  return useMemo(
    () => ({
      viewportRef,
      rowRef,
      offscreen,
      /** Layout of the active row, the viewport, or the content changed. */
      remeasure: measure,
      onScroll(y: number) {
        scrollY.current = y;
        evaluate();
      },
      /** Scrolls to the row now, or once it mounts when `afterExpand` (its parents are being expanded). */
      jump(afterExpand: boolean) {
        pending.current = true;
        if (!afterExpand) measure();
      },
    }),
    [offscreen, measure, evaluate],
  );
}

/** Small pill at the bottom of the view that jumps to the open workspace. */
export function JumpToActiveButton({
  direction,
  onPress,
  theme,
  fontSize,
  lineHeight,
}: {
  /** Arrow toward the row; null (row inside a collapsed parent) shows a locate icon. */
  direction: Offscreen;
  onPress(): void;
  theme: PluginTheme;
  fontSize: number;
  lineHeight: number;
}) {
  const t = useT();
  const [hovered, setHovered] = useState(false);
  const color = hovered ? theme.colors.foreground : theme.colors.foregroundMuted;
  return (
    <View pointerEvents="box-none" style={{ position: "absolute", left: 0, right: 0, bottom: 8, alignItems: "center" }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("jump.a11y")}
        onPress={onPress}
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
          name={direction === "above" ? "ArrowUp" : direction === "below" ? "ArrowDown" : "LocateFixed"}
          color={color}
          size={fontSize}
        />
        <Text style={{ color, fontSize, lineHeight }}>{t("jump.label")}</Text>
      </Pressable>
    </View>
  );
}
