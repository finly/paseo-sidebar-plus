import type { PluginTheme } from "@getpaseo/plugin";
import { type ReactNode, useMemo, useRef, useState } from "react";
import {
  Animated,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  PanResponder,
  type PanResponderGestureState,
  Platform,
  type ScrollView,
  View,
  type ViewStyle,
} from "react-native";
import { swallowNextClick } from "./web";

// This plugin typechecks without the DOM library. Declare only what this module uses.
interface DomNode {
  isConnected: boolean;
  offsetHeight: number;
  parentElement: DomNode | null;
  getBoundingClientRect(): { top: number };
}
const isDomNode = (value: unknown): value is DomNode =>
  typeof value === "object" && value !== null && typeof (value as DomNode).getBoundingClientRect === "function";

/**
 * What is being dragged: a group (reorder), a subgroup (reorder among its parent's subgroups), a project
 * (reorder within its group, subgroup, or ungrouped, or move to another group or subgroup), a pinned
 * workspace (reorder), or a workspace within its project (reorder, "Manual order" only).
 * A project's or workspace's `groupId` is the group or subgroup the project sits in directly.
 */
export type DragItem =
  | { kind: "group"; id: string }
  | { kind: "subgroup"; id: string; parentId: string }
  | { kind: "project"; key: string; groupId: string | null }
  | { kind: "pinned"; key: string }
  | { kind: "workspace"; key: string; projectKey: string; groupId: string | null };

/**
 * Where a drop lands: a new index for a group, subgroup, pinned workspace, workspace within its project, or
 * project within its group (or ungrouped), or a destination group or subgroup (null: ungrouped) for a project.
 */
export type DropTarget = { kind: "position"; index: number } | { kind: "group"; groupId: string | null };

interface Span {
  y: number;
  height: number;
}

interface Session {
  item: DragItem;
  startScroll: number;
  startPointer: number;
  /** How far a stuck (sticky) heading sat below its layout slot when the drag started. */
  stuck: number;
  dy: number;
  target: DropTarget | null;
  timer: ReturnType<typeof setInterval>;
}

const IS_WEB = Platform.OS === "web";
/** Web: pointer travel that turns a press into a drag. */
const MOVE_THRESHOLD = 4;
/** Touch: hold time that arms a drag. */
export const DRAG_LONG_PRESS_MS = 350;
/** Auto-scroll band at the viewport edges, and top speed per tick. */
const EDGE = 48;
const MAX_SPEED = 14;

const itemKey = (item: DragItem) =>
  item.kind === "group"
    ? `g:${item.id}`
    : item.kind === "subgroup"
      ? `s:${item.id}`
      : item.kind === "project"
        ? `p:${item.key}`
        : item.kind === "pinned"
          ? `w:${item.key}`
          : `r:${item.key}`;
const sameTarget = (a: DropTarget | null, b: DropTarget | null) =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.kind === b.kind &&
    (a.kind === "position" ? a.index === (b as typeof a).index : a.groupId === (b as typeof a).groupId));

/**
 * Drag state for the sidebar list. Positions come from `onLayout` (content coordinates of the ScrollView),
 * so the pointer is tracked as start position + drag distance + scroll since start.
 */
export function useDragController({
  groupIds,
  subgroupIds,
  parentOf,
  pinnedKeys,
  projectKeys,
  workspaceKeys,
  onDrop,
}: {
  /** Top-level group ids in display order. */
  groupIds: string[];
  /** Subgroup ids of a top-level group as rendered, in display order (empty while the group is collapsed). */
  subgroupIds(groupId: string): string[];
  /** The parent group id of a subgroup; null for a top-level group. */
  parentOf(groupId: string): string | null;
  /** Draggable pinned workspace keys in display order. */
  pinnedKeys: string[];
  /** Project keys directly in a group or subgroup (null: ungrouped) in display order. */
  projectKeys(groupId: string | null): string[];
  /** Workspace keys of a project in display order (rows outside the Pinned section). */
  workspaceKeys(projectKey: string): string[];
  onDrop(item: DragItem, target: DropTarget): void;
}) {
  const scrollRef = useRef<ScrollView>(null);
  const translate = useRef(new Animated.Value(0)).current;
  const [dragging, setDragging] = useState<DragItem | null>(null);
  const [armed, setArmed] = useState(false);
  const [target, setTarget] = useState<DropTarget | null>(null);
  const live = useRef({ groupIds, subgroupIds, parentOf, pinnedKeys, projectKeys, workspaceKeys, onDrop });
  live.current = { groupIds, subgroupIds, parentOf, pinnedKeys, projectKeys, workspaceKeys, onDrop };
  const session = useRef<Session | null>(null);
  const armedRef = useRef(false);
  const layout = useRef({
    groups: new Map<string, Span>(),
    /** Group body offset inside its section. */
    bodies: new Map<string, number>(),
    /** Subgroup offset inside its parent group body. */
    subgroups: new Map<string, Span>(),
    /** Subgroup body offset inside the subgroup block. */
    subgroupBodies: new Map<string, number>(),
    /** Project offset inside its parent (a group or subgroup body, or the ungrouped zone). */
    projects: new Map<string, Span>(),
    /** Handle (heading) height per item key. */
    headers: new Map<string, number>(),
    ungrouped: { y: 0, height: 0 } as Span,
    /** Pinned section, in content coordinates, and its rows container offset inside it. */
    pinnedSection: 0,
    pinnedList: 0,
    /** Pinned row offset inside the rows container. */
    pinned: new Map<string, Span>(),
    /** Workspace row offset inside its project block. */
    rows: new Map<string, Span>(),
    viewport: 0,
    content: 0,
    scrollY: 0,
  }).current;
  /**
   * Web: react-native-web fires `onLayout` only when an element resizes (ResizeObserver), not when it moves,
   * so offsets go stale after a reorder, a collapse, or a change above. Each element's node is kept to
   * re-measure all offsets when a drag starts.
   */
  const nodes = useRef(new Map<string, { node: DomNode; apply(y: number, height: number): void }>()).current;

  return useMemo(() => {
    /** Applies a layout event and, on web, keeps the node for `remeasure`. */
    const track = (key: string, event: LayoutChangeEvent, apply: (y: number, height: number) => void) => {
      const { y, height } = event.nativeEvent.layout;
      apply(y, height);
      const node = (event.nativeEvent as unknown as { target?: unknown }).target;
      if (IS_WEB && isDomNode(node)) nodes.set(key, { node, apply });
    };

    /** Web: measures every tracked element against its parent node, as react-native-web's `onLayout` does. */
    const remeasure = () => {
      if (!IS_WEB) return;
      for (const [key, { node, apply }] of nodes) {
        const parent = node.parentElement;
        if (!node.isConnected || !parent) {
          nodes.delete(key);
          continue;
        }
        apply(node.getBoundingClientRect().top - parent.getBoundingClientRect().top, node.offsetHeight);
      }
    };

    const groupBodyTop = (groupId: string): number =>
      (layout.groups.get(groupId)?.y ?? 0) + (layout.bodies.get(groupId) ?? 0);

    /** A subgroup's top in content coordinates. */
    const subgroupTop = (id: string, parentId: string): number =>
      groupBodyTop(parentId) + (layout.subgroups.get(id)?.y ?? 0);

    /** Top of the body holding a group's or subgroup's direct projects, in content coordinates. */
    const containerTop = (groupId: string): number => {
      const parentId = live.current.parentOf(groupId);
      if (!parentId) return groupBodyTop(groupId);
      return subgroupTop(groupId, parentId) + (layout.subgroupBodies.get(groupId) ?? 0);
    };

    const projectTop = (key: string, groupId: string | null): number => {
      const own = layout.projects.get(key)?.y ?? 0;
      if (!groupId) return layout.ungrouped.y + own;
      return containerTop(groupId) + own;
    };

    /**
     * Ungrouped drop zone. When no ungrouped project is rendered, the bottom of the last group is
     * still a valid place to drop a project to ungroup it; a small band there keeps that target
     * reachable instead of leaving a gap where no drop is detected at all.
     */
    const ungroupedBounds = (): Span | null => {
      if (layout.ungrouped.height > 0) return layout.ungrouped;
      const ids = live.current.groupIds;
      const last = ids.length > 0 ? layout.groups.get(ids[ids.length - 1]) : null;
      return last ? { y: last.y + last.height, height: 64 } : null;
    };

    const itemTop = (item: DragItem): number => {
      if (item.kind === "group") return layout.groups.get(item.id)?.y ?? 0;
      if (item.kind === "subgroup") return subgroupTop(item.id, item.parentId);
      if (item.kind === "pinned") return layout.pinnedSection + layout.pinnedList + (layout.pinned.get(item.key)?.y ?? 0);
      if (item.kind === "workspace")
        return projectTop(item.projectKey, item.groupId) + (layout.rows.get(item.key)?.y ?? 0);
      return projectTop(item.key, item.groupId);
    };

    const computeTarget = (item: DragItem, pointer: number): DropTarget | null => {
      if (item.kind === "workspace") {
        const keys = live.current.workspaceKeys(item.projectKey);
        const top = projectTop(item.projectKey, item.groupId);
        const index = keys.filter((key) => {
          if (key === item.key) return false;
          const span = layout.rows.get(key);
          return span ? top + span.y + span.height / 2 < pointer : false;
        }).length;
        return index === keys.indexOf(item.key) ? null : { kind: "position", index };
      }
      if (item.kind === "pinned") {
        const keys = live.current.pinnedKeys;
        const index = keys.filter((key) => {
          if (key === item.key) return false;
          const span = layout.pinned.get(key);
          return span ? layout.pinnedSection + layout.pinnedList + span.y + span.height / 2 < pointer : false;
        }).length;
        return index === keys.indexOf(item.key) ? null : { kind: "position", index };
      }
      if (item.kind === "subgroup") {
        // Only among the parent's subgroups: moving to another group stays in the menu.
        const keys = live.current.subgroupIds(item.parentId);
        const index = keys.filter((id) => {
          if (id === item.id) return false;
          const span = layout.subgroups.get(id);
          return span ? subgroupTop(id, item.parentId) + span.height / 2 < pointer : false;
        }).length;
        return index === keys.indexOf(item.id) ? null : { kind: "position", index };
      }
      const ids = live.current.groupIds;
      if (item.kind === "group") {
        const others = ids.filter((id) => id !== item.id);
        const index = others.filter((id) => {
          const span = layout.groups.get(id);
          return span ? span.y + span.height / 2 < pointer : false;
        }).length;
        return index === ids.indexOf(item.id) ? null : { kind: "position", index };
      }
      // Nearest zone wins. Keying only on "pointer inside a group span" leaves dead gaps between
      // groups, above the first group, and in the ungrouped area, where a drop silently does nothing.
      const zones: { id: string | null; span: Span }[] = [];
      for (const id of ids) {
        const span = layout.groups.get(id);
        if (span) zones.push({ id, span });
      }
      const ungrouped = ungroupedBounds();
      if (ungrouped) zones.push({ id: null, span: ungrouped });
      if (zones.length === 0) return null;
      const distance = (span: Span) =>
        pointer < span.y ? span.y - pointer : pointer > span.y + span.height ? pointer - span.y - span.height : 0;
      let nearest = zones[0];
      let nearestDistance = distance(nearest.span);
      for (const zone of zones) {
        const candidate = distance(zone.span);
        if (candidate < nearestDistance) {
          nearest = zone;
          nearestDistance = candidate;
        }
      }
      let destination: string | null = nearest.id;
      if (destination !== null) {
        // Over one of the group's subgroups (heading or body): that subgroup is the destination.
        const parentId = destination;
        for (const id of live.current.subgroupIds(parentId)) {
          const span = layout.subgroups.get(id);
          const top = subgroupTop(id, parentId);
          if (span && pointer >= top && pointer < top + span.height) destination = id;
        }
      }
      if (destination === item.groupId) {
        // Within its own group (or ungrouped): reorder among the sibling projects.
        const keys = live.current.projectKeys(item.groupId);
        const index = keys.filter((key) => {
          if (key === item.key) return false;
          const span = layout.projects.get(key);
          return span ? projectTop(key, item.groupId) + span.height / 2 < pointer : false;
        }).length;
        return index === keys.indexOf(item.key) ? null : { kind: "position", index };
      }
      return { kind: "group", groupId: destination };
    };

    const update = () => {
      const s = session.current;
      if (!s) return;
      const delta = layout.scrollY - s.startScroll;
      translate.setValue(s.stuck + s.dy + delta);
      const next = computeTarget(s.item, s.startPointer + s.dy + delta);
      if (!sameTarget(next, s.target)) {
        s.target = next;
        setTarget(next);
      }
    };

    const autoScroll = () => {
      const s = session.current;
      if (!s || layout.viewport <= 0) return;
      // Pointer in viewport coordinates: content position minus scroll offset.
      const pointer = s.startPointer + s.dy - s.startScroll;
      let speed = 0;
      if (pointer < EDGE) speed = -MAX_SPEED * Math.min(1, (EDGE - pointer) / EDGE);
      else if (pointer > layout.viewport - EDGE)
        speed = MAX_SPEED * Math.min(1, (pointer - (layout.viewport - EDGE)) / EDGE);
      if (speed === 0) return;
      const max = Math.max(0, layout.content - layout.viewport);
      const next = Math.min(max, Math.max(0, layout.scrollY + speed));
      if (next === layout.scrollY) return;
      layout.scrollY = next;
      scrollRef.current?.scrollTo({ y: next, animated: false });
      update();
    };

    const start = (item: DragItem, pageY?: number) => {
      if (session.current) return;
      remeasure();
      const key = itemKey(item);
      const header = layout.headers.get(key) ?? 24;
      // Where inside the heading the pointer was actually grabbed. Assuming the middle of the
      // heading offset every drop target by up to half a heading (a whole row on touch), so a drag
      // that looked centered on a boundary landed on the wrong side of it.
      let grab = header / 2;
      const rect = nodes.get(`header:${key}`)?.node.getBoundingClientRect();
      if (rect && typeof pageY === "number" && Number.isFinite(pageY)) {
        grab = Math.min(Math.max(pageY - rect.top, 0), header);
      }
      // Web: a stuck group or project heading sits below its layout slot (the top of its block), so the
      // grab point is measured from where it shows, not from `itemTop`. The drag turns sticking off, so
      // the lifted block starts shifted by the same amount to stay under the pointer.
      let stuck = 0;
      const blockKey = item.kind === "group" ? `group:${item.id}` : item.kind === "project" ? `project:${item.key}` : null;
      const block = blockKey ? nodes.get(blockKey)?.node.getBoundingClientRect() : undefined;
      if (rect && block) stuck = Math.max(0, rect.top - block.top);
      session.current = {
        item,
        startScroll: layout.scrollY,
        startPointer: itemTop(item) + stuck + grab,
        stuck,
        dy: 0,
        target: null,
        timer: setInterval(autoScroll, 16),
      };
      translate.setValue(stuck);
      setTarget(null);
      setDragging(item);
    };

    const end = (commit: boolean) => {
      const s = session.current;
      armedRef.current = false;
      setArmed(false);
      if (!s) return;
      clearInterval(s.timer);
      session.current = null;
      swallowNextClick();
      translate.setValue(0);
      setDragging(null);
      setTarget(null);
      if (commit && s.target) live.current.onDrop(s.item, s.target);
    };

    return {
      scrollRef,
      translate,
      dragging,
      target,
      /** Lock scrolling while a touch drag is armed or running. */
      locked: armed || dragging !== null,
      canStart(gesture: PanResponderGestureState): boolean {
        if (session.current) return false;
        if (IS_WEB) return Math.abs(gesture.dy) > MOVE_THRESHOLD || Math.abs(gesture.dx) > MOVE_THRESHOLD;
        return armedRef.current;
      },
      arm() {
        armedRef.current = true;
        setArmed(true);
      },
      disarm() {
        if (session.current) return;
        armedRef.current = false;
        setArmed(false);
      },
      start,
      move(dy: number) {
        if (!session.current) return;
        session.current.dy = dy;
        update();
      },
      end,
      isDragging(item: DragItem): boolean {
        return dragging !== null && itemKey(dragging) === itemKey(item);
      },
      /**
       * A group or subgroup holding the dragged project, workspace, or subgroup (directly, or for a top-level
       * group through a subgroup) must stack above its siblings too.
       */
      containsDragged(groupId: string | null): boolean {
        if (dragging?.kind === "subgroup") return dragging.parentId === groupId;
        if (dragging?.kind !== "project" && dragging?.kind !== "workspace") return false;
        if (dragging.groupId === groupId) return true;
        return groupId !== null && dragging.groupId !== null && live.current.parentOf(dragging.groupId) === groupId;
      },
      /** A project whose workspace is being dragged must stack above its siblings too. */
      containsDraggedWorkspace(projectKey: string): boolean {
        return dragging?.kind === "workspace" && dragging.projectKey === projectKey;
      },
      /** Top of the insertion line for a group drop, in content coordinates. */
      insertionY(index: number, draggedId: string): number | null {
        const others = live.current.groupIds.filter((id) => id !== draggedId);
        const before = others[index];
        if (before) return (layout.groups.get(before)?.y ?? 0) + 6;
        const last = layout.groups.get(others[others.length - 1] ?? "");
        return last ? last.y + last.height : null;
      },
      /** Top of the insertion line for a subgroup drop among its parent's subgroups, in content coordinates. */
      subgroupInsertionY(index: number, item: Extract<DragItem, { kind: "subgroup" }>): number | null {
        const others = live.current.subgroupIds(item.parentId).filter((id) => id !== item.id);
        const before = others[index];
        if (before !== undefined && layout.subgroups.has(before)) return subgroupTop(before, item.parentId);
        const last = others[others.length - 1];
        const span = last === undefined ? undefined : layout.subgroups.get(last);
        return span && last !== undefined ? subgroupTop(last, item.parentId) + span.height : null;
      },
      /** Top of the insertion line for a pinned workspace drop, in content coordinates. */
      pinnedInsertionY(index: number, draggedKey: string): number | null {
        const others = live.current.pinnedKeys.filter((key) => key !== draggedKey);
        const before = layout.pinned.get(others[index] ?? "");
        if (before) return layout.pinnedSection + layout.pinnedList + before.y;
        const last = layout.pinned.get(others[others.length - 1] ?? "");
        return last ? layout.pinnedSection + layout.pinnedList + last.y + last.height : null;
      },
      /** Top of the insertion line for a project drop within its group (or ungrouped), in content coordinates. */
      projectInsertionY(index: number, item: Extract<DragItem, { kind: "project" }>): number | null {
        const others = live.current.projectKeys(item.groupId).filter((key) => key !== item.key);
        const before = others[index];
        if (before !== undefined && layout.projects.has(before)) return projectTop(before, item.groupId);
        const last = others[others.length - 1];
        const span = last === undefined ? undefined : layout.projects.get(last);
        return span && last !== undefined ? projectTop(last, item.groupId) + span.height : null;
      },
      /** Top of the insertion line for a workspace drop within its project, in content coordinates. */
      workspaceInsertionY(index: number, item: Extract<DragItem, { kind: "workspace" }>): number | null {
        const top = projectTop(item.projectKey, item.groupId);
        const others = live.current.workspaceKeys(item.projectKey).filter((key) => key !== item.key);
        const before = layout.rows.get(others[index] ?? "");
        if (before) return top + before.y;
        const last = layout.rows.get(others[others.length - 1] ?? "");
        return last ? top + last.y + last.height : null;
      },
      /** Bounds to highlight for a project drop, in content coordinates. */
      dropBounds(groupId: string | null): Span | null {
        if (groupId === null) return ungroupedBounds();
        const parentId = live.current.parentOf(groupId);
        if (!parentId) return layout.groups.get(groupId) ?? null;
        const span = layout.subgroups.get(groupId);
        return span ? { y: subgroupTop(groupId, parentId), height: span.height } : null;
      },
      onGroupLayout: (id: string) => (event: LayoutChangeEvent) =>
        track(`group:${id}`, event, (y, height) => layout.groups.set(id, { y, height })),
      onGroupBodyLayout: (id: string) => (event: LayoutChangeEvent) =>
        track(`body:${id}`, event, (y) => layout.bodies.set(id, y)),
      onSubgroupLayout: (id: string) => (event: LayoutChangeEvent) =>
        track(`subgroup:${id}`, event, (y, height) => layout.subgroups.set(id, { y, height })),
      onSubgroupBodyLayout: (id: string) => (event: LayoutChangeEvent) =>
        track(`subgroupBody:${id}`, event, (y) => layout.subgroupBodies.set(id, y)),
      onProjectLayout: (key: string) => (event: LayoutChangeEvent) =>
        track(`project:${key}`, event, (y, height) => layout.projects.set(key, { y, height })),
      onHeaderLayout: (item: DragItem) => (event: LayoutChangeEvent) =>
        track(`header:${itemKey(item)}`, event, (_y, height) => layout.headers.set(itemKey(item), height)),
      onPinnedSectionLayout(event: LayoutChangeEvent) {
        track("pinnedSection", event, (y) => {
          layout.pinnedSection = y;
        });
      },
      onPinnedListLayout(event: LayoutChangeEvent) {
        track("pinnedList", event, (y) => {
          layout.pinnedList = y;
        });
      },
      onPinnedLayout: (key: string) => (event: LayoutChangeEvent) =>
        track(`pinned:${key}`, event, (y, height) => layout.pinned.set(key, { y, height })),
      onWorkspaceLayout: (key: string) => (event: LayoutChangeEvent) =>
        track(`row:${key}`, event, (y, height) => layout.rows.set(key, { y, height })),
      onUngroupedLayout(event: LayoutChangeEvent) {
        track("ungrouped", event, (y, height) => {
          layout.ungrouped = { y, height };
        });
      },
      onViewportLayout(event: LayoutChangeEvent) {
        layout.viewport = event.nativeEvent.layout.height;
      },
      onContentSizeChange(_width: number, height: number) {
        layout.content = height;
      },
      onScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
        layout.scrollY = event.nativeEvent.contentOffset.y;
        update();
      },
    };
  }, [armed, dragging, target, layout, nodes, translate]);
}

export type DragController = ReturnType<typeof useDragController>;

/** Wraps a heading so pressing and moving it (web) or long-pressing then moving it (touch) drags `item`. */
export function DragHandle({
  drag,
  item,
  style,
  onLayout,
  children,
}: {
  drag: DragController;
  item: DragItem;
  /** Extra style (a sticky heading). */
  style?: ViewStyle;
  /** Also reports the heading's layout. */
  onLayout?(event: LayoutChangeEvent): void;
  children: ReactNode;
}) {
  const live = useRef({ drag, item });
  live.current = { drag, item };
  const responder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_event, gesture) => live.current.drag.canStart(gesture),
        onPanResponderGrant: (event) => live.current.drag.start(live.current.item, event.nativeEvent.pageY),
        onPanResponderMove: (_event, gesture) => live.current.drag.move(gesture.dy),
        onPanResponderRelease: () => live.current.drag.end(true),
        onPanResponderTerminate: () => live.current.drag.end(false),
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
      }),
    [],
  );
  return (
    <View
      {...responder.panHandlers}
      onLayout={(event) => {
        drag.onHeaderLayout(item)(event);
        onLayout?.(event);
      }}
      // Web: keep a mouse drag from selecting heading text.
      style={IS_WEB ? [{ userSelect: "none" } as ViewStyle, style] : style}
    >
      {children}
    </View>
  );
}

/** Long-press props for a heading: on touch, long-press arms a drag; on web, drag starts on move. */
export function dragPressProps(drag: DragController) {
  if (IS_WEB) return {};
  return { onLongPress: () => drag.arm(), onPressOut: () => drag.disarm(), delayLongPress: DRAG_LONG_PRESS_MS };
}

/** A draggable block (group section, subgroup, or project): follows the pointer and stacks above siblings while dragged. */
export function DragBlock({
  drag,
  lifted,
  raised,
  onLayout,
  theme,
  children,
}: {
  drag: DragController;
  /** This block is the one being dragged. */
  lifted: boolean;
  /** Stack above siblings (a group holding the dragged project). */
  raised?: boolean;
  onLayout(event: LayoutChangeEvent): void;
  theme: PluginTheme;
  children: ReactNode;
}) {
  return (
    <Animated.View
      onLayout={onLayout}
      style={
        lifted
          ? {
              zIndex: 10,
              opacity: 0.9,
              borderRadius: 6,
              backgroundColor: theme.colors.surface1,
              transform: [{ translateY: drag.translate }],
            }
          : raised
            ? { zIndex: 10 }
            : undefined
      }
    >
      {children}
    </Animated.View>
  );
}

/** Drop indicator inside the ScrollView content: insertion line for reorders, highlight for a project moving to another group. */
export function DropIndicator({ drag, theme }: { drag: DragController; theme: PluginTheme }) {
  const { dragging, target } = drag;
  if (!dragging || !target) return null;
  if (target.kind === "position") {
    const y =
      dragging.kind === "group"
        ? drag.insertionY(target.index, dragging.id)
        : dragging.kind === "subgroup"
          ? drag.subgroupInsertionY(target.index, dragging)
          : dragging.kind === "workspace"
            ? drag.workspaceInsertionY(target.index, dragging)
            : dragging.kind === "project"
              ? drag.projectInsertionY(target.index, dragging)
              : drag.pinnedInsertionY(target.index, dragging.key);
    if (y === null) return null;
    return (
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: y - 1,
          left: 8,
          right: 8,
          height: 2,
          borderRadius: 1,
          backgroundColor: theme.colors.accent,
        }}
      />
    );
  }
  if (target.kind !== "group") return null;
  const bounds = drag.dropBounds(target.groupId);
  if (!bounds) return null;
  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        top: bounds.y,
        height: bounds.height,
        left: 4,
        right: 4,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: theme.colors.accent,
        overflow: "hidden",
      }}
    >
      <View style={{ flex: 1, backgroundColor: theme.colors.accent, opacity: 0.1 }} />
    </View>
  );
}
