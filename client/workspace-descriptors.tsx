import type { PaseoWorkspace, PaseoWorkspaceUpdate } from "@getpaseo/client";
import type { PluginHostSummary, WorkspaceRef } from "@getpaseo/plugin/client";
import { getPaseoClient } from "@getpaseo/plugin/client";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from "react";

/** Full daemon descriptor: pull request, checks, services, forge. Not part of the plugin snapshot. */
export type WorkspaceDescriptor = PaseoWorkspace;

export function descriptorKey(hostId: string, workspaceId: string): string {
  return `${hostId}\u0000${workspaceId}`;
}

/** Live descriptors keyed by `descriptorKey(hostId, workspaceId)`. Each upsert replaces the entry object. */
class DescriptorStore {
  private readonly entries = new Map<string, WorkspaceDescriptor>();
  private readonly hostKeys = new Map<string, Set<string>>();
  private readonly listeners = new Set<() => void>();
  /** Bumped on every change, so readers of many entries can tell when to re-read. */
  version = 0;

  get(key: string): WorkspaceDescriptor | null {
    return this.entries.get(key) ?? null;
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
      this.entries.set(key, workspace);
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
      this.entries.set(key, update.workspace);
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
