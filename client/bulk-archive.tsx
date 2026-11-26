import type { PluginTheme, PluginWorkspaceSnapshot, WorkspaceIndicator } from "@getpaseo/plugin";
import { type WorkspaceRef, usePaseo, useWorkspace, useWorkspaces } from "@getpaseo/plugin/client";
import { FlatList, Icon, Modal, TextInput, useToast } from "@getpaseo/plugin/client/ui";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Button } from "./group-editor";
import { type MessageKey, useT } from "./i18n";
import type { ProjectTarget } from "./move-project";
import { selectPullRequestFields } from "./pull-request-fields";
import { useMinuteNow } from "./snapshot-fields";
import { StatusIndicator } from "./status-indicator";
import { BackButton } from "./workspace-actions";
import { descriptorKey, useDescriptorLookup } from "./workspace-descriptors";

type Snapshot = PluginWorkspaceSnapshot;

/** Workspaces archived at the same time. */
const CONCURRENCY = 3;
const IDLE_MS = 7 * 24 * 60 * 60 * 1000;
const ROW_LINE_HEIGHT = 18;
/** Height of the list body; the header and footer stay fixed around it. */

/** Sections selected by default, in Paseo's status order. Running and needs input are never selected by default. */
const SELECTABLE_SECTIONS: readonly { indicator: WorkspaceIndicator; title: MessageKey }[] = [
  { indicator: "failed", title: "statusSection.failed" },
  { indicator: "attention", title: "statusSection.readyToReview" },
  { indicator: "done", title: "statusSection.done" },
];
const STATUS_ORDER: readonly WorkspaceIndicator[] = ["needs_input", "failed", "attention", "running", "done"];

type Reason = "running" | "needsInput" | "pinned" | "open" | "openPr";
type Chip = "done" | "merged" | "idle" | "all" | "none";
const CHIPS: readonly Chip[] = ["done", "merged", "idle", "all", "none"];

function byTimeDesc(a: string | null, b: string | null): number {
  const left = a ? Date.parse(a) : Number.NaN;
  const right = b ? Date.parse(b) : Number.NaN;
  if (Number.isNaN(left)) return Number.isNaN(right) ? 0 : 1;
  if (Number.isNaN(right)) return -1;
  return right - left;
}

const byStatusTime = (a: Snapshot, b: Snapshot) =>
  byTimeDesc(a.statusEnteredAt, b.statusEnteredAt) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
const perWorkspace = (workspace: Snapshot) => ({ key: workspace.ref.key, title: workspace.title ?? workspace.name });
const byIndicator = (workspace: Snapshot) => workspace.indicator;

function isIdle(workspace: Snapshot, now: number): boolean {
  const last = workspace.lastPromptAt ?? workspace.createdAt;
  if (!last) return false;
  const time = Date.parse(last);
  return !Number.isNaN(time) && now - time > IDLE_MS;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

type ListItem =
  | { type: "header"; id: string; title: string; keys: readonly string[] }
  | { type: "row"; id: string; ref: WorkspaceRef; reasons: readonly Reason[] };

interface RowData {
  title: string;
  branch: string | null;
  indicator: WorkspaceIndicator;
  kind: Snapshot["kind"];
}
const selectRow = (workspace: Snapshot): RowData => ({
  title: workspace.title ?? workspace.name,
  branch: workspace.branch,
  indicator: workspace.indicator,
  kind: workspace.kind,
});
const sameRow = (left: RowData | null, right: RowData | null) =>
  left === right ||
  (!!left &&
    !!right &&
    left.title === right.title &&
    left.branch === right.branch &&
    left.indicator === right.indicator &&
    left.kind === right.kind);

function Checkbox({ checked, mixed = false, theme }: { checked: boolean; mixed?: boolean; theme: PluginTheme }) {
  return (
    <Icon
      name={checked ? "SquareCheck" : mixed ? "SquareMinus" : "Square"}
      color={checked || mixed ? theme.colors.foreground : theme.colors.foregroundMuted}
      size={14}
    />
  );
}

const WorkspaceChoice = memo(function WorkspaceChoice({
  reference,
  reasons,
  checked,
  onToggle,
  theme,
}: {
  reference: WorkspaceRef;
  reasons: readonly Reason[];
  checked: boolean;
  onToggle(key: string): void;
  theme: PluginTheme;
}) {
  const t = useT();
  const row = useWorkspace(reference, selectRow, sameRow);
  if (!row) return null;
  const note = reasons.map((reason) => t(`bulkArchive.reason.${reason}`)).join(", ");
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={row.title}
      accessibilityState={{ checked }}
      onPress={() => onToggle(reference.key)}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 8,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 8,
        backgroundColor: pressed || hovered ? theme.colors.surface2 : "transparent",
      })}
    >
      <View style={{ height: ROW_LINE_HEIGHT, justifyContent: "center" }}>
        <Checkbox checked={checked} theme={theme} />
      </View>
      <StatusIndicator indicator={row.indicator} kind={row.kind} theme={theme} height={ROW_LINE_HEIGHT} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ color: theme.colors.foreground, fontSize: 13, lineHeight: ROW_LINE_HEIGHT }}>
          {row.title}
        </Text>
        {row.branch || note ? (
          <Text numberOfLines={1} style={{ color: theme.colors.foregroundMuted, fontSize: 12, lineHeight: 16 }}>
            {[row.branch ? `⎇ ${row.branch}` : null, note || null].filter(Boolean).join(" · ")}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
});

function SectionHeader({
  title,
  keys,
  selected,
  onSetMany,
  theme,
}: {
  title: string;
  keys: readonly string[];
  selected: ReadonlySet<string>;
  onSetMany(keys: readonly string[], checked: boolean): void;
  theme: PluginTheme;
}) {
  const t = useT();
  const count = keys.filter((key) => selected.has(key)).length;
  const all = keys.length > 0 && count === keys.length;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 10, paddingTop: 10, paddingBottom: 4 }}>
      <Text numberOfLines={1} style={{ flex: 1, minWidth: 0, color: theme.colors.foregroundMuted, fontSize: 12, fontWeight: "600" }}>
        {title} · {keys.length}
      </Text>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityLabel={t("bulkArchive.selectAllIn", { name: title })}
        accessibilityState={{ checked: all ? true : count > 0 ? "mixed" : false }}
        onPress={() => onSetMany(keys, !all)}
        hitSlop={6}
        style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
      >
        <Checkbox checked={all} mixed={count > 0} theme={theme} />
        <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>{t("bulkArchive.selectAll")}</Text>
      </Pressable>
    </View>
  );
}

function ChipButton({ label, onPress, theme }: { label: string; onPress(): void; theme: PluginTheme }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({
        height: 24,
        paddingHorizontal: 10,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: theme.colors.border,
        justifyContent: "center",
        backgroundColor: pressed || hovered ? theme.colors.surface2 : theme.colors.surface1,
      })}
    >
      <Text style={{ color: theme.colors.foreground, fontSize: 12 }}>{label}</Text>
    </Pressable>
  );
}

interface Target {
  ref: WorkspaceRef;
  title: string;
}
type Run =
  | { phase: "running"; total: number; finished: number; cancelling: boolean }
  | { phase: "summary"; total: number; archived: number; cancelled: number; failures: readonly { title: string; error: string }[] };

function BulkArchiveBody({
  project,
  activeKey,
  includeBackground,
  onClose,
  cancelRef,
  theme,
}: {
  project: ProjectTarget;
  activeKey: string | null;
  includeBackground: boolean;
  onClose(): void;
  /** Set to true to stop starting new archives (sheet closed or Cancel pressed). */
  cancelRef: { current: boolean };
  theme: PluginTheme;
}) {
  const t = useT();
  const paseo = usePaseo();
  const toast = useToast();
  const now = useMinuteNow();
  const lookup = useDescriptorLookup();
  const [query, setQuery] = useState("");
  const [manual, setManual] = useState<Set<string> | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const needle = query.trim().toLowerCase();

  const inProject = useCallback(
    (workspace: Snapshot) =>
      workspace.project.key === project.key && workspace.archivingAt === null && (includeBackground || !workspace.background),
    [project.key, includeBackground],
  );
  const workspaces = useWorkspaces({ where: inProject, orderBy: byStatusTime, groupBy: perWorkspace });
  const byStatus = useWorkspaces({ where: inProject, orderBy: byStatusTime, groupBy: byIndicator });
  const pinned = useWorkspaces({ where: useCallback((w: Snapshot) => inProject(w) && w.pinnedAt !== null, [inProject]) });
  const idle = useWorkspaces({ where: useCallback((w: Snapshot) => inProject(w) && isIdle(w, now), [inProject, now]) });
  const matching = useWorkspaces({
    where: useCallback(
      (w: Snapshot) =>
        inProject(w) &&
        (!needle || (w.title ?? w.name).toLowerCase().includes(needle) || (w.branch ?? "").toLowerCase().includes(needle)),
      [inProject, needle],
    ),
  });

  const model = useMemo(() => {
    const refs = new Map<string, WorkspaceRef>();
    const titles = new Map<string, string>();
    for (const group of workspaces) {
      const ref = group.items[0];
      if (!ref) continue;
      refs.set(ref.key, ref);
      titles.set(ref.key, group.title ?? ref.key);
    }
    const indicatorOf = new Map<string, WorkspaceIndicator>();
    const statusKeys = new Map<WorkspaceIndicator, string[]>();
    for (const group of byStatus) {
      const keys = group.items.map((ref) => ref.key);
      statusKeys.set(group.key as WorkspaceIndicator, keys);
      for (const key of keys) indicatorOf.set(key, group.key as WorkspaceIndicator);
    }
    const pinnedKeys = new Set(pinned.map((ref) => ref.key));
    const prState = new Map<string, string>();
    for (const ref of refs.values()) {
      const state = selectPullRequestFields(lookup(descriptorKey(ref.hostId, ref.id)))?.state;
      if (state) prState.set(ref.key, state);
    }
    const reasons = new Map<string, Reason[]>();
    for (const key of refs.keys()) {
      const list: Reason[] = [];
      const indicator = indicatorOf.get(key);
      if (indicator === "running") list.push("running");
      if (indicator === "needs_input") list.push("needsInput");
      if (pinnedKeys.has(key)) list.push("pinned");
      if (key === activeKey) list.push("open");
      const pr = prState.get(key);
      if (pr === "open" || pr === "draft") list.push("openPr");
      if (list.length > 0) reasons.set(key, list);
    }
    const eligible = [...refs.keys()].filter((key) => !reasons.has(key));
    return { refs, titles, indicatorOf, statusKeys, prState, reasons, eligible };
  }, [workspaces, byStatus, pinned, lookup, activeKey]);

  const visible = useMemo(() => new Set(matching.map((ref) => ref.key)), [matching]);
  const idleKeys = useMemo(() => new Set(idle.map((ref) => ref.key)), [idle]);

  // Until the user changes the selection, every eligible workspace is selected (and follows live updates).
  const selected = useMemo(() => {
    const base = manual ?? new Set(model.eligible);
    return new Set([...base].filter((key) => model.refs.has(key)));
  }, [manual, model]);

  const items = useMemo(() => {
    const list: ListItem[] = [];
    for (const section of SELECTABLE_SECTIONS) {
      const keys = (model.statusKeys.get(section.indicator) ?? []).filter((key) => visible.has(key) && !model.reasons.has(key));
      if (keys.length === 0) continue;
      list.push({ type: "header", id: `h:${section.indicator}`, title: t(section.title), keys });
      for (const key of keys) list.push({ type: "row", id: key, ref: model.refs.get(key)!, reasons: [] });
    }
    const held = STATUS_ORDER.flatMap((indicator) =>
      (model.statusKeys.get(indicator) ?? []).filter((key) => visible.has(key) && model.reasons.has(key)),
    );
    if (held.length > 0) {
      list.push({ type: "header", id: "h:held", title: t("bulkArchive.notSelectedByDefault"), keys: held });
      for (const key of held) list.push({ type: "row", id: key, ref: model.refs.get(key)!, reasons: model.reasons.get(key)! });
    }
    return list;
  }, [model, visible, t]);

  const toggle = useCallback(
    (key: string) =>
      setManual((current) => {
        const next = new Set(current ?? selected);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      }),
    [selected],
  );
  const setMany = (keys: readonly string[], checked: boolean) =>
    setManual((current) => {
      const next = new Set(current ?? selected);
      for (const key of keys) {
        if (checked) next.add(key);
        else next.delete(key);
      }
      return next;
    });

  // Quick-select chips replace the selection with the matching visible workspaces; never ones held back by default.
  const applyChip = (chip: Chip) => {
    if (chip === "none") return setManual(new Set());
    const keys = model.eligible.filter((key) => {
      if (!visible.has(key)) return false;
      if (chip === "done") return model.indicatorOf.get(key) === "done";
      if (chip === "merged") return model.prState.get(key) === "merged";
      if (chip === "idle") return idleKeys.has(key);
      return true;
    });
    setManual(new Set(keys));
  };

  const archive = async () => {
    const targets: Target[] = [...selected].map((key) => ({ ref: model.refs.get(key)!, title: model.titles.get(key) ?? key }));
    if (targets.length === 0) return;
    cancelRef.current = false;
    const total = targets.length;
    let next = 0;
    let finished = 0;
    let archived = 0;
    const failures: { title: string; error: string }[] = [];
    setRun({ phase: "running", total, finished: 0, cancelling: false });
    const worker = async () => {
      while (!cancelRef.current && next < targets.length) {
        const target = targets[next++]!;
        try {
          const result = await paseo.workspaces.ref(target.ref).archive();
          if (result.error) failures.push({ title: target.title, error: result.error });
          else archived += 1;
        } catch (failure) {
          failures.push({ title: target.title, error: errorText(failure) });
        }
        finished += 1;
        setRun((current) => (current?.phase === "running" ? { ...current, finished } : current));
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, total) }, worker));
    const cancelled = total - finished;
    if (failures.length === 0 && cancelled === 0) {
      toast.show(t("bulkArchive.archivedToast", { count: archived }), { variant: "success" });
      onClose();
      return;
    }
    setRun({ phase: "summary", total, archived, cancelled, failures });
  };

  if (run?.phase === "running") {
    return (
      <View style={{ gap: 12, padding: 16 }}>
        <Text style={{ color: theme.colors.foreground, fontSize: 13, lineHeight: 18 }}>
          {run.cancelling
            ? t("bulkArchive.cancelling")
            : t("bulkArchive.progress", { done: Math.min(run.finished + 1, run.total), total: run.total })}
        </Text>
        <View style={{ height: 4, borderRadius: 2, backgroundColor: theme.colors.surface2, overflow: "hidden" }}>
          <View
            style={{ width: `${(run.finished / run.total) * 100}%`, height: 4, backgroundColor: theme.colors.statusDanger }}
          />
        </View>
        <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
          <Button
            label={t("bulkArchive.cancelRest")}
            disabled={run.cancelling}
            onPress={() => {
              cancelRef.current = true;
              setRun({ ...run, cancelling: true });
            }}
            theme={theme}
          />
        </View>
      </View>
    );
  }

  if (run?.phase === "summary") {
    return (
      <View style={{ gap: 10, padding: 16 }}>
        <Text style={{ color: theme.colors.foreground, fontSize: 13, lineHeight: 18 }}>
          {t("bulkArchive.summary", { done: run.archived, total: run.total })}
        </Text>
        {run.cancelled > 0 ? (
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>
            {t("bulkArchive.summaryCancelled", { count: run.cancelled })}
          </Text>
        ) : null}
        {run.failures.length > 0 ? (
          <View style={{ gap: 4 }}>
            <Text style={{ color: theme.colors.statusDanger, fontSize: 12, fontWeight: "600" }}>
              {t("bulkArchive.summaryFailed", { count: run.failures.length })}
            </Text>
            {run.failures.map((failure, index) => (
              <Text key={index} style={{ color: theme.colors.foregroundMuted, fontSize: 12, lineHeight: 16 }}>
                {failure.title}: {failure.error}
              </Text>
            ))}
          </View>
        ) : null}
        <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
          <Button label={t("bulkArchive.close")} onPress={onClose} theme={theme} />
        </View>
      </View>
    );
  }

  const count = selected.size;
  return (
    <View style={{ flex: 1, minHeight: 0 }}>
      <View style={{ gap: 8, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 8, borderBottomWidth: 1, borderColor: theme.colors.border }}>
        <View style={{ justifyContent: "center" }}>
          <View pointerEvents="none" style={{ position: "absolute", left: 10, zIndex: 1 }}>
            <Icon name="Search" color={theme.colors.foregroundMuted} size={14} />
          </View>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t("bulkArchive.filter")}
            placeholderTextColor={theme.colors.foregroundMuted}
            accessibilityLabel={t("bulkArchive.filter")}
            autoCapitalize="none"
            autoCorrect={false}
            style={{
              minHeight: 32,
              paddingLeft: 30,
              paddingRight: query ? 36 : 10,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.surface1,
              color: theme.colors.foreground,
              fontSize: 13,
            }}
          />
          {query ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("filter.clear")}
              onPress={() => setQuery("")}
              style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({
                position: "absolute",
                right: 6,
                width: 24,
                height: 24,
                borderRadius: 4,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: pressed || hovered ? theme.colors.surface2 : "transparent",
              })}
            >
              <Icon name="X" color={theme.colors.foregroundMuted} size={14} />
            </Pressable>
          ) : null}
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {CHIPS.map((chip) => (
            <ChipButton key={chip} label={t(`bulkArchive.chip.${chip}`)} onPress={() => applyChip(chip)} theme={theme} />
          ))}
        </View>
      </View>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        style={{ flex: 1, minHeight: 0 }}
        contentContainerStyle={{ paddingHorizontal: 2, paddingBottom: 8 }}
        initialNumToRender={20}
        windowSize={7}
        extraData={selected}
        ListEmptyComponent={
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 13, padding: 16 }}>
            {model.refs.size === 0 ? t("bulkArchive.empty") : t("bulkArchive.noMatches")}
          </Text>
        }
        renderItem={({ item }) =>
          item.type === "header" ? (
            <SectionHeader title={item.title} keys={item.keys} selected={selected} onSetMany={setMany} theme={theme} />
          ) : (
            <WorkspaceChoice
              reference={item.ref}
              reasons={item.reasons}
              checked={selected.has(item.ref.key)}
              onToggle={toggle}
              theme={theme}
            />
          )
        }
      />
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          paddingHorizontal: 12,
          paddingVertical: 10,
          borderTopWidth: 1,
          borderColor: theme.colors.border,
        }}
      >
        <Text numberOfLines={1} style={{ flex: 1, minWidth: 0, color: theme.colors.foregroundMuted, fontSize: 12 }}>
          {t("bulkArchive.selectedCount", { count })}
        </Text>
        <Button label={t("common.cancel")} onPress={onClose} theme={theme} />
        <Button
          label={t("bulkArchive.archiveCount", { count })}
          tone="danger"
          disabled={count === 0}
          onPress={() => void archive()}
          theme={theme}
        />
      </View>
    </View>
  );
}

/** Archive many of a project's workspaces at once. Nothing archives until the footer button is pressed. */
export function BulkArchiveModal({
  project,
  activeKey,
  includeBackground,
  onBack,
  onClose,
  theme,
}: {
  project: ProjectTarget | null;
  /** The open workspace's key; it is never selected by default. */
  activeKey: string | null;
  /** Lists background workspaces too (the view's "Show background workspaces" setting). */
  includeBackground: boolean;
  /** Shows a back button in the title that returns to the project menu. */
  onBack?(project: ProjectTarget): void;
  onClose(): void;
  theme: PluginTheme;
}) {
  const t = useT();
  const cancelRef = useRef(false);
  // Closing the sheet stops starting new archives; ones already sent finish on the host.
  useEffect(() => {
    if (project === null) cancelRef.current = true;
  }, [project]);
  return (
    <Modal
      title={project ? t("bulkArchive.title", { name: project.title }) : t("bulkArchive.fallbackTitle")}
      icon={project && onBack ? <BackButton onPress={() => onBack(project)} theme={theme} /> : undefined}
      open={project !== null}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <Modal.Content scrollable={false} contentContainerStyle={{ padding: 0, gap: 0 }}>
        {project ? (
          <BulkArchiveBody
            key={project.key}
            project={project}
            activeKey={activeKey}
            includeBackground={includeBackground}
            onClose={onClose}
            cancelRef={cancelRef}
            theme={theme}
          />
        ) : null}
      </Modal.Content>
    </Modal>
  );
}
