import type { PluginHostSummary, WorkspaceRef } from "@getpaseo/plugin/client";
import { getPaseoClient } from "@getpaseo/plugin/client";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from "react";

// Derived from the SDK so the plugin builds without @getpaseo/client installed.
type PaseoApi = ReturnType<typeof getPaseoClient>;
type PaseoWorkspace = Exclude<Parameters<PaseoApi["workspaces"]["ref"]>[0], string>;
type PaseoWorkspaceHandle = ReturnType<PaseoApi["workspaces"]["ref"]>;
type PaseoWorkspaceUpdate = Parameters<Parameters<PaseoWorkspaceHandle["subscribe"]>[0]>[0];

/** Full daemon descriptor: pull request, checks, services, forge. Not part of the plugin snapshot. */
export type WorkspaceDescriptor = PaseoWorkspace;
/** A descriptor together with the host it came from; descriptors themselves are host-agnostic. */
export interface DescriptorEntry {
  readonly hostId: string;
  readonly descriptor: WorkspaceDescriptor;
}

export function descriptorKey(hostId: string, workspaceId: string): string {
  return `${hostId}\u0000${workspaceId}`;
}

/** Live descriptors keyed by `descriptorKey(hostId, workspaceId)`. Each upsert replaces the entry object. */
class DescriptorStore {
  private readonly entries = new Map<string, DescriptorEntry>();
  private readonly hostKeys = new Map<string, Set<string>>();
  private readonly listeners = new Set<() => void>();
  /** Bumped on every change, so readers of many entries can tell when to re-read. */
  version = 0;
  /** Changes only when a descriptor supplies or changes a shared project key. */
  identitySignature = "";

  get(key: string): WorkspaceDescriptor | null {
    return this.entries.get(key)?.descriptor ?? null;
  }

  /** All live entries, so callers can derive project-wide facts (Paseo's shared project key). */
  all(): readonly DescriptorEntry[] {
    return [...this.entries.values()];
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  replaceHost(hostId: string, workspaces: readonly WorkspaceDescriptor[]): void {
    this.dropKeys(hostId);
    const keys = new Set<string>();
    for (const workspace of workspaces) {
      const key = descriptorKey(hostId, workspace.id);
      keys.add(key);
      this.entries.set(key, { hostId, descriptor: workspace });
    }
    this.hostKeys.set(hostId, keys);
    this.emit();
  }

  apply(hostId: string, update: PaseoWorkspaceUpdate): void {
    const keys = this.hostKeys.get(hostId) ?? new Set<string>();
    this.hostKeys.set(hostId, keys);
    if (update.kind === "upsert") {
      const key = descriptorKey(hostId, update.workspace.id);
      keys.add(key);
      this.entries.set(key, { hostId, descriptor: update.workspace });
    } else {
      const key = descriptorKey(hostId, update.id);
      keys.delete(key);
      this.entries.delete(key);
    }
    this.emit();
  }

  removeHost(hostId: string): void {
    if (!this.hostKeys.has(hostId)) return;
    this.dropKeys(hostId);
    this.hostKeys.delete(hostId);
    this.emit();
  }

  private dropKeys(hostId: string): void {
    for (const key of this.hostKeys.get(hostId) ?? []) this.entries.delete(key);
  }

  private emit(): void {
    this.version += 1;
    const identities: string[] = [];
    for (const [key, entry] of this.entries) {
      const shared = entry.descriptor.project?.projectKey;
      if (shared) identities.push(`${key}:${shared}`);
    }
    identities.sort();
    this.identitySignature = identities.join("\n");
    for (const listener of this.listeners) listener();
  }
}

/** Subscribes to one online host's workspace directory and mirrors it into the store. Returns cleanup. */
function followHost(store: DescriptorStore, hostId: string): () => void {
  let disposed = false;
  let release: (() => void) | null = null;
  getPaseoClient(hostId)
    .workspaces.list({ subscribe: {}, filter: { includeBackground: true } })
    .then((result) => {
      const { subscription } = result;
      const unsubscribe = subscription.subscribe({
        snapshot: (snapshot) => store.replaceHost(hostId, snapshot.entries),
        update: (message) => {
          if (message.type === "workspace_update") store.apply(hostId, message.payload);
        },
      });
      release = () => {
        unsubscribe();
        void subscription.release().catch((error) => console.error("[sidebar-plus] feed release failed", error));
      };
      if (disposed) release();
      else store.replaceHost(hostId, result.entries);
    })
    .catch((error) => console.error(`[sidebar-plus] workspace feed failed for host ${hostId}`, error));
  return () => {
    disposed = true;
    release?.();
    store.removeHost(hostId);
  };
}

const DescriptorContext = createContext<DescriptorStore | null>(null);

/** Keeps one live descriptor subscription per online host while mounted. */
export function WorkspaceDescriptorFeed({
  hosts,
  children,
}: {
  hosts: readonly PluginHostSummary[];
  children: ReactNode;
}) {
  const store = useMemo(() => new DescriptorStore(), []);
  const onlineIds = hosts
    .filter((host) => host.status === "online")
    .map((host) => host.serverId)
    .sort()
    .join("\n");
  useEffect(() => {
    if (!onlineIds) return;
    const cleanups = onlineIds.split("\n").map((hostId) => followHost(store, hostId));
    return () => {
      for (const cleanup of cleanups) cleanup();
    };
  }, [store, onlineIds]);
  return <DescriptorContext.Provider value={store}>{children}</DescriptorContext.Provider>;
}

const NO_STORE_SUBSCRIBE = () => () => {};

/** The live descriptor for a workspace, or null until its host's feed delivers it. */
export function useWorkspaceDescriptor(reference: WorkspaceRef): WorkspaceDescriptor | null {
  const store = useContext(DescriptorContext);
  const key = descriptorKey(reference.hostId, reference.id);
  const read = useCallback(() => store?.get(key) ?? null, [store, key]);
  return useSyncExternalStore(store?.subscribe ?? NO_STORE_SUBSCRIBE, read, read);
}

const NO_VERSION = () => 0;
const NO_VERSION_STRING = () => "";

/** Live descriptor entries from every online host, re-read only when project identities change. */
export function useAllDescriptors(): readonly DescriptorEntry[] {
  const store = useContext(DescriptorContext);
  // Only project identities matter to grouping; status churn on a descriptor must not re-render the view.
  const signature = useSyncExternalStore(
    store?.subscribe ?? NO_STORE_SUBSCRIBE,
    store ? () => store.identitySignature : NO_VERSION_STRING,
    store ? () => store.identitySignature : NO_VERSION_STRING,
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => store?.all() ?? [], [store, signature]);
}

/** Reads any workspace's live descriptor by `descriptorKey`; the function changes identity whenever a descriptor changes. */
export function useDescriptorLookup(): (key: string) => WorkspaceDescriptor | null {
  const store = useContext(DescriptorContext);
  const version = useSyncExternalStore(
    store?.subscribe ?? NO_STORE_SUBSCRIBE,
    store ? () => store.version : NO_VERSION,
    store ? () => store.version : NO_VERSION,
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useCallback((key: string) => store?.get(key) ?? null, [store, version]);
}
