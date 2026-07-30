import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { Platform } from 'react-native';

import type { DeviceNode } from '../lib/devices';
import type { FolderNode, ProjectNode } from '../lib/hierarchy';
import type { MachineNode } from '../lib/machines';
import type { CardNode } from '../lib/rack';
import { createSeedData } from '../lib/seedData';
import { apiFetch } from '../src/lib/apiClient';
import type { SavedLayout } from '../components/studio/machine/TrailBoard';

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

export type StudioStore = Hierarchy & {
  ready: boolean;
  persisted: boolean;
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
export function useStudioStore(): StudioStore {
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

  const flushHierarchy = useCallback(async (retry = false) => {
    if (!persistedRef.current) return;
    try {
      const res = await apiFetch('/api/studio/state', {
        method: 'PUT',
        body: JSON.stringify({ data: latest.current, baseRevision: hierRev.current }),
      });
      if (res.status === 409) {
        const json = (await res.json()) as { hierRevision?: number };
        if (typeof json.hierRevision === 'number') hierRev.current = json.hierRevision;
        // Another user wrote concurrently — rebase on their revision and retry
        // once so the local edit still lands (last write wins).
        if (!retry) return flushHierarchy(true);
        return;
      }
      if (res.ok) {
        const json = (await res.json()) as { hierRevision?: number };
        if (typeof json.hierRevision === 'number') hierRev.current = json.hierRevision;
        hierDirty.current = false;
      }
    } catch {
      // Offline / transient — the next edit or poll reconciles.
    }
  }, []);

  const scheduleHierarchySave = useCallback(() => {
    if (!persistedRef.current) return;
    hierDirty.current = true;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void flushHierarchy();
    }, SAVE_DEBOUNCE_MS);
  }, [flushHierarchy]);

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
        const res = await apiFetch('/api/studio/layout', {
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
        const res = await apiFetch('/api/studio/template', {
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
        const res = await apiFetch('/api/studio/state');
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
        const res = await apiFetch('/api/studio/revisions');
        if (!res.ok) return;
        const rev = (await res.json()) as { hierRevision?: number; layoutRevision?: number };
        const hierChanged = typeof rev.hierRevision === 'number' && rev.hierRevision !== hierRev.current;
        const layoutChanged = typeof rev.layoutRevision === 'number' && rev.layoutRevision !== layoutRev.current;
        if (!hierChanged && !layoutChanged) return;
        if (hierChanged && hierDirty.current) return; // don't overwrite unsaved edits
        const full = await apiFetch('/api/studio/state');
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
    ready, persisted,
    projects, folders, machines, devices, cards,
    setProjects, setFolders, setMachines, setDevices, setCards,
    getLayout, getTemplateLayout, saveLayout, saveTemplateLayout,
  };
}
