import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { Platform } from 'react-native';

import type { DeviceNode } from '../lib/devices';
import type { FolderNode, ProjectNode } from '../lib/hierarchy';
import type { MachineNode } from '../lib/machines';
import type { CardNode } from '../lib/rack';
import { createSeedData } from '../lib/seedData';
import { apiFetch } from '../lib/apiClient';
import type { SavedLayout } from '../components/console/machine/TrailBoard';

function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

const SEED = createSeedData(makeId);

type Hierarchy = {
  projects: ProjectNode[];
  folders: FolderNode[];
  machines: MachineNode[];
  devices: DeviceNode[];
  cards: CardNode[];
};

export type WorkspaceStore = Hierarchy & {
  ready: boolean;
  persisted: boolean;
  /** Why the last hierarchy write was refused, or null. */
  saveError: string | null;
  dismissSaveError: () => void;
  setProjects: Dispatch<SetStateAction<ProjectNode[]>>;
  setFolders: Dispatch<SetStateAction<FolderNode[]>>;
  setMachines: Dispatch<SetStateAction<MachineNode[]>>;
  setDevices: Dispatch<SetStateAction<DeviceNode[]>>;
  setCards: Dispatch<SetStateAction<CardNode[]>>;
  getLayout: (machineId: string) => SavedLayout | null;
  getTemplateLayout: (machineTemplate: string) => SavedLayout | null;
  saveLayout: (machineId: string, layout: SavedLayout) => void;
  saveTemplateLayout: (machineTemplate: string, layout: SavedLayout) => void;
};

const SAVE_DEBOUNCE_MS = 700;
const POLL_INTERVAL_MS = 5000;

// Central workspace store. On web (Next.js) it hydrates from the shared Supabase
// workspace, persists edits back, and polls so other users' changes appear.
// Off the web target (Expo native) or without a database it degrades to purely
// local seed state, so those environments keep working unchanged.
export function useWorkspaceStore(): WorkspaceStore {
  const [projects, setProjectsRaw] = useState<ProjectNode[]>(SEED.projects);
  const [folders, setFoldersRaw] = useState<FolderNode[]>(SEED.folders);
  const [machines, setMachinesRaw] = useState<MachineNode[]>(SEED.machines);
  const [devices, setDevicesRaw] = useState<DeviceNode[]>(SEED.devices);
  const [cards, setCardsRaw] = useState<CardNode[]>(SEED.cards);
  const [layouts, setLayoutsRaw] = useState<Record<string, SavedLayout>>({});
  const [templateLayouts, setTemplateLayoutsRaw] = useState<Record<string, SavedLayout>>({});

  const [ready, setReady] = useState(false);
  const [persisted, setPersisted] = useState(false);

  // Always-current mirror so the debounced save flushes the latest snapshot.
  const latest = useRef<Hierarchy>({ projects, folders, machines, devices, cards });
  latest.current = { projects, folders, machines, devices, cards };

  const persistedRef = useRef(false);
  const hierRev = useRef(0);
  const layoutRev = useRef(0);
  const hierDirty = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * Why the last write did not land, or null.
   *
   * A refused save is not recoverable by waiting, so it is surfaced rather
   * than retried into silence. The console shows it; the operator can fix the
   * duplicate device and edit again, and the pending work is still in memory
   * to be written when they do.
   */
  const [saveError, setSaveError] = useState<string | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryDelay = useRef(0);

  const applyWorkspace = useCallback((w: {
    projects: ProjectNode[]; folders: FolderNode[]; machines: MachineNode[];
    devices: DeviceNode[]; cards: CardNode[]; layouts?: Record<string, SavedLayout>;
    templates?: Record<string, SavedLayout>;
    hierRevision: number; layoutRevision: number;
  }) => {
    setProjectsRaw(w.projects);
    setFoldersRaw(w.folders);
    setMachinesRaw(w.machines);
    setDevicesRaw(w.devices);
    setCardsRaw(w.cards);
    setLayoutsRaw(w.layouts ?? {});
    setTemplateLayoutsRaw(w.templates ?? {});
    hierRev.current = w.hierRevision;
    layoutRev.current = w.layoutRevision;
  }, []);

  const flushRef = useRef<(options?: { rebased?: boolean; keepalive?: boolean }) => void>(() => {});

  /**
   * Try again later, backing off.
   *
   * Only for failures that waiting can fix — a dropped connection, a lost
   * race. A refused payload is not one of those and never reaches here.
   * Capped, because a tab left open overnight should not be hammering a
   * server it cannot reach.
   */
  const scheduleRetry = useCallback(() => {
    if (retryTimer.current) clearTimeout(retryTimer.current);
    retryDelay.current = Math.min(retryDelay.current === 0 ? 1000 : retryDelay.current * 2, 30_000);
    retryTimer.current = setTimeout(() => {
      if (hierDirty.current) flushRef.current();
    }, retryDelay.current);
  }, []);

  /**
   * Write the hierarchy, and say so when it does not go.
   *
   * Every failure here used to be silent. A rejected save left the edit in
   * memory, looking saved, until a reload threw it away — which is how three
   * machines created in a folder could simply not be there afterwards.
   *
   * Two different things answer 409 and they need opposite handling:
   *
   *   `{ error, hierRevision }`  somebody else wrote first. Rebase on their
   *                              revision and send again; the edit still lands.
   *   `{ error }`                the payload was refused — a duplicate device
   *                              name or IP. Sending it again produces exactly
   *                              the same refusal, so retrying is a way to
   *                              lose the work twice as fast.
   *
   * The old code treated both as the first, retried once with an identical
   * body, and gave up without a word. A workspace holding one duplicate
   * device therefore discarded *every* later hierarchy edit — creating a
   * machine, deleting one, moving one — and looked like it had worked each
   * time.
   */
  const flushHierarchy = useCallback(async (options: { rebased?: boolean; keepalive?: boolean } = {}) => {
    if (!persistedRef.current) return;
    try {
      const res = await apiFetch('/api/workspace/state', {
        method: 'PUT',
        body: JSON.stringify({ data: latest.current, baseRevision: hierRev.current }),
        // Set when the page is going away: the browser keeps the request
        // alive past unload instead of cancelling it on the spot.
        ...(options.keepalive ? { keepalive: true } : {}),
      });

      if (res.ok) {
        const json = (await res.json()) as { hierRevision?: number };
        if (typeof json.hierRevision === 'number') hierRev.current = json.hierRevision;
        hierDirty.current = false;
        retryDelay.current = 0;
        setSaveError(null);
        return;
      }

      const json = (await res.json().catch(() => ({}))) as { error?: string; hierRevision?: number };

      if (res.status === 409 && typeof json.hierRevision === 'number') {
        hierRev.current = json.hierRevision;
        // Rebase once. A second conflict on the same attempt means the other
        // writer is faster than this one, and the retry schedule below takes
        // over rather than looping here.
        if (!options.rebased) return flushHierarchy({ ...options, rebased: true });
        scheduleRetry();
        return;
      }

      // Refused, not raced. Retrying cannot help, so the operator is told —
      // with what the server actually said, because "a device name is already
      // configured" is a sentence somebody can act on and "save failed" is
      // not.
      setSaveError(json.error ?? `The workspace could not be saved (${res.status}).`);
    } catch {
      // Offline or a dropped connection. The edit is still dirty, so retry
      // rather than leave it sitting unsaved until the next keystroke.
      scheduleRetry();
    }
  }, [scheduleRetry]);
  flushRef.current = flushHierarchy;

  const scheduleHierarchySave = useCallback(() => {
    if (!persistedRef.current) return;
    hierDirty.current = true;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void flushHierarchy();
    }, SAVE_DEBOUNCE_MS);
  }, [flushHierarchy]);

  /**
   * Write anything still pending before the page goes away.
   *
   * Edits are debounced by 700 ms so a drag does not write a layout per
   * frame. That window is also long enough to create a machine and hit
   * reload, and everything in it was simply lost — the timer died with the
   * page and nothing had reached the server.
   *
   * `pagehide` is the event that actually fires on a reload, a navigation and
   * a closed tab, including on iOS Safari where `beforeunload` does not.
   * `visibilitychange` covers switching away on mobile, where a backgrounded
   * tab may be discarded without ever firing `pagehide`.
   *
   * The request is sent with `keepalive`, which is what lets it outlive the
   * document. Without it the browser cancels an in-flight fetch the moment
   * the page unloads, which is the same data loss with extra steps.
   */
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    const flushNow = () => {
      if (!persistedRef.current || !hierDirty.current) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      void flushHierarchy({ keepalive: true });
    };
    const onHidden = () => {
      if (document.visibilityState === 'hidden') flushNow();
    };

    window.addEventListener('pagehide', flushNow);
    document.addEventListener('visibilitychange', onHidden);
    return () => {
      window.removeEventListener('pagehide', flushNow);
      document.removeEventListener('visibilitychange', onHidden);
    };
  }, [flushHierarchy]);

  // Timers do not survive the hook, and a retry firing after unmount would
  // write a workspace the user has navigated away from.
  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (retryTimer.current) clearTimeout(retryTimer.current);
  }, []);

  // Exposed setters mirror useState's signature but also queue a persist, so the
  // existing Home handlers work unchanged while their edits become durable.
  const setProjects = useCallback<Dispatch<SetStateAction<ProjectNode[]>>>((a) => { setProjectsRaw(a); scheduleHierarchySave(); }, [scheduleHierarchySave]);
  const setFolders = useCallback<Dispatch<SetStateAction<FolderNode[]>>>((a) => { setFoldersRaw(a); scheduleHierarchySave(); }, [scheduleHierarchySave]);
  const setMachines = useCallback<Dispatch<SetStateAction<MachineNode[]>>>((a) => { setMachinesRaw(a); scheduleHierarchySave(); }, [scheduleHierarchySave]);
  const setDevices = useCallback<Dispatch<SetStateAction<DeviceNode[]>>>((a) => { setDevicesRaw(a); scheduleHierarchySave(); }, [scheduleHierarchySave]);
  const setCards = useCallback<Dispatch<SetStateAction<CardNode[]>>>((a) => { setCardsRaw(a); scheduleHierarchySave(); }, [scheduleHierarchySave]);

  const getLayout = useCallback((machineId: string): SavedLayout | null => layouts[machineId] ?? null, [layouts]);
  const getTemplateLayout = useCallback((machineTemplate: string): SavedLayout | null => templateLayouts[machineTemplate] ?? null, [templateLayouts]);

  const saveLayout = useCallback((machineId: string, layout: SavedLayout) => {
    setLayoutsRaw((prev) => ({ ...prev, [machineId]: layout }));
    if (!persistedRef.current) return;
    void (async () => {
      try {
        const res = await apiFetch('/api/workspace/layout', {
          method: 'PUT',
          body: JSON.stringify({ machineId, layout }),
        });
        if (res.ok) {
          const json = (await res.json()) as { layoutRevision?: number };
          if (typeof json.layoutRevision === 'number') layoutRev.current = json.layoutRevision;
        }
      } catch {
        // Offline — kept locally; will re-sync on next explicit save.
      }
    })();
  }, []);

  const saveTemplateLayout = useCallback((machineTemplate: string, layout: SavedLayout) => {
    setTemplateLayoutsRaw((prev) => ({ ...prev, [machineTemplate]: layout }));
    if (!persistedRef.current) return;
    void (async () => {
      try {
        const res = await apiFetch('/api/workspace/template', {
          method: 'PUT',
          body: JSON.stringify({ machineTemplate, layout }),
        });
        if (res.ok) {
          const json = (await res.json()) as { layoutRevision?: number };
          if (typeof json.layoutRevision === 'number') layoutRev.current = json.layoutRevision;
        }
      } catch {
        // Offline - kept locally; will re-sync on next explicit template save.
      }
    })();
  }, []);

  // Initial hydration from the shared workspace (web only).
  useEffect(() => {
    if (Platform.OS !== 'web') {
      setReady(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch('/api/workspace/state');
        if (!cancelled && res.ok) {
          const json = (await res.json()) as { persisted?: boolean; workspace?: Parameters<typeof applyWorkspace>[0] | null };
          if (json.persisted && json.workspace) {
            applyWorkspace(json.workspace);
            persistedRef.current = true;
            setPersisted(true);
          }
        }
      } catch {
        // No server / offline — keep local seed state.
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, [applyWorkspace]);

  // Poll for other users' changes and apply them when we have no pending local
  // hierarchy edit (avoids clobbering an in-progress change mid-debounce).
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    let stopped = false;
    const tick = async () => {
      if (!persistedRef.current) return;
      try {
        const res = await apiFetch('/api/workspace/revisions');
        if (!res.ok) return;
        const rev = (await res.json()) as { hierRevision?: number; layoutRevision?: number };
        const hierChanged = typeof rev.hierRevision === 'number' && rev.hierRevision !== hierRev.current;
        const layoutChanged = typeof rev.layoutRevision === 'number' && rev.layoutRevision !== layoutRev.current;
        if (!hierChanged && !layoutChanged) return;
        if (hierChanged && hierDirty.current) return; // don't overwrite unsaved edits
        const full = await apiFetch('/api/workspace/state');
        if (!full.ok || stopped) return;
        const json = (await full.json()) as { workspace?: Parameters<typeof applyWorkspace>[0] | null };
        if (json.workspace && !hierDirty.current) applyWorkspace(json.workspace);
      } catch {
        // ignore transient poll failures
      }
    };
    const interval = setInterval(() => { void tick(); }, POLL_INTERVAL_MS);
    return () => { stopped = true; clearInterval(interval); };
  }, [applyWorkspace]);

  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  return {
    ready, persisted, saveError, dismissSaveError: () => setSaveError(null),
    projects, folders, machines, devices, cards,
    setProjects, setFolders, setMachines, setDevices, setCards,
    getLayout, getTemplateLayout, saveLayout, saveTemplateLayout,
  };
}
