import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Platform, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';


import { ActionButton } from '../components/studio/ActionButton';
import { AddDeviceDialog, type NewDevice } from '../components/studio/AddDeviceDialog';
import { AssignProjectDialog } from '../components/studio/AssignProjectDialog';
import { ConfirmDialog } from '../components/studio/ConfirmDialog';
import { ContextMenu, type ContextMenuState, type ContextMenuTarget } from '../components/studio/ContextMenu';
import { CreateFolderDialog, type NewFolder } from '../components/studio/CreateFolderDialog';
import { CreateProjectDialog, type NewProject } from '../components/studio/CreateProjectDialog';
import { DeviceDetail } from '../components/studio/DeviceDetail';
import { DeviceMenu, type DeviceMenuState } from '../components/studio/DeviceMenu';
import { DevicesTable } from '../components/studio/DevicesTable';
import { EmptyState } from '../components/studio/EmptyState';
import { GatewayDetail } from '../components/studio/GatewayDetail';
import { HierarchyContents } from '../components/studio/HierarchyContents';
import { LeftPanel } from '../components/studio/LeftPanel';
import { AddMachineDialog, type NewMachine } from '../components/studio/machine/AddMachineDialog';
import { MachineWorkspace } from '../components/studio/machine/MachineWorkspace';
import { MoveDialog } from '../components/studio/MoveDialog';
import { PanelToggle } from '../components/studio/PanelToggle';
import { RenameDialog } from '../components/studio/RenameDialog';
import { RackDetail } from '../components/studio/rack/RackDetail';
import { TopBar } from '../components/studio/TopBar';
import { useAppTheme } from '../hooks/useAppTheme';
import { useLiveTelemetry } from '../hooks/useLiveTelemetry';
import { useStudioStore } from '../hooks/useStudioStore';
import { cn } from '../lib/cn';
import { composeIp, defaultRealGatewayId, deviceWithGatewayConnectionState, hostOctetFor, ipPrefixFor, racksForGateway, type DeviceNode } from '../lib/devices';
import { applyLiveStatus } from '../lib/liveTelemetry';
import {
  duplicateFolderSubtree,
  duplicateProject,
  folderPath,
  folderSubtreeIds,
  type FolderNode,
  type ProjectNode,
  type SelectedNode,
} from '../lib/hierarchy';
import { componentsForTemplate, type MachineNode } from '../lib/machines';
import { PERMISSIONS } from '../lib/permissions';
import type { CardConfig, CardNode, CardType } from '../lib/rack';
import { createSeedData } from '../lib/seedData';
import { USER_PERMISSIONS, userHasPermission, type PublicUser } from '../src/lib/roles';

const LEFT_PANEL_WIDTH = 256;

let demoId = 0;
const DEMO_SEED = createSeedData(() => `demo-${demoId++}`);

function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

const HISTORY_STATE_KEY = 'ultronSelected';

function selectedToHash(selected: SelectedNode): string {
  switch (selected.kind) {
    case 'none':
      return '#home';
    case 'devices':
      return '#devices';
    case 'project':
    case 'folder':
    case 'machine':
    case 'device':
      return `#${selected.kind}=${encodeURIComponent(selected.id)}`;
  }
}

function selectedFromHash(hash: string): SelectedNode {
  const normalized = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!normalized || normalized === 'home') return { kind: 'none' };
  if (normalized === 'devices') return { kind: 'devices' };
  const [kind, encodedId = ''] = normalized.split('=');
  const id = decodeURIComponent(encodedId);
  if (!id) return { kind: 'none' };
  if (kind === 'project' || kind === 'folder' || kind === 'machine' || kind === 'device') return { kind, id };
  return { kind: 'none' };
}

function initialSelected(): SelectedNode {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return { kind: 'none' };
  return selectedFromHash(window.location.hash);
}

function sameSelected(a: SelectedNode, b: SelectedNode): boolean {
  return a.kind === b.kind && ('id' in a ? a.id : '') === ('id' in b ? b.id : '');
}

function rackGatewayGroupKey(rack: DeviceNode, devices: DeviceNode[]): string {
  if (rack.gatewayId) return `gateway:${rack.gatewayId}`;
  if (rack.realGatewayId) return `real:${rack.realGatewayId}`;
  const prefix = ipPrefixFor(rack.ip);
  if (prefix) {
    const gateway = devices.find((device) => device.type === 'Gateway' && !device.archived && ipPrefixFor(device.ip) === prefix);
    if (gateway) return `gateway:${gateway.id}`;
    return `prefix:${prefix}`;
  }
  return 'gateway:unassigned';
}

function rackSortValue(rack: DeviceNode): string {
  const rackId = rack.realRackId !== undefined && rack.realRackId !== null ? String(rack.realRackId) : 'zzzzzz';
  const sortId = Number.isInteger(Number(rackId)) ? String(Number(rackId)).padStart(6, '0') : rackId;
  return `${sortId}|${rack.name.toLowerCase()}|${rack.id}`;
}

function nextRackIdForGateway(
  gatewayId: string | null | undefined,
  devices: DeviceNode[],
  exceptDeviceId?: string | null,
  preferredRackId?: string | number | null,
): string {
  const gateway = gatewayId ? devices.find((device) => device.id === gatewayId && device.type === 'Gateway' && !device.archived) : undefined;
  const racks = gateway
    ? racksForGateway(gateway, devices)
    : devices.filter((device) => device.type === 'Rack' && !device.archived && device.gatewayId === gatewayId);
  const used = new Set(
    racks
      .filter((rack) => rack.id !== exceptDeviceId && rack.realRackId !== undefined && rack.realRackId !== null && Number.isInteger(Number(rack.realRackId)))
      .map((rack) => Number(rack.realRackId)),
  );
  if (preferredRackId !== undefined && preferredRackId !== null && String(preferredRackId) !== '') {
    const numeric = Number(preferredRackId);
    if (!Number.isInteger(numeric) || numeric <= 0 || !used.has(numeric)) return String(preferredRackId);
  }
  let id = 1;
  while (used.has(id)) id += 1;
  return String(id);
}

export default function Home({ sidebarFooter, currentUser }: { sidebarFooter?: ReactNode; currentUser?: PublicUser | null } = {}) {
  const { isDark } = useAppTheme();
  const hasConfigureAccess = currentUser
    ? userHasPermission(currentUser, USER_PERMISSIONS.SCHEMA_EDIT_DELETE)
    : true;
  const [configureMode, setConfigureMode] = useState(false);
  const [realMode, setRealMode] = useState(false);
  const canEditDeleteSchema = hasConfigureAccess && configureMode;

  useEffect(() => {
    if (!hasConfigureAccess && configureMode) setConfigureMode(false);
  }, [hasConfigureAccess, configureMode]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    setRealMode(window.localStorage.getItem('ultron.realMode') === '1');
  }, []);

  const handleRealModeChange = (enabled: boolean) => {
    setRealMode(enabled);
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.localStorage.setItem('ultron.realMode', enabled ? '1' : '0');
    }
  };

  // Auto-collapse the hierarchy sidebar on narrow (mobile/tablet) viewports so the
  // workspace stays usable; users can still toggle it back open via PanelToggle.
  const { width } = useWindowDimensions();
  const isNarrow = width > 0 && width < 768;

  const [selected, setSelected] = useState<SelectedNode>(initialSelected);
  const skipNextHistoryPush = useRef(false);
  const [leftCollapsed, setLeftCollapsed] = useState(isNarrow);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    const applyLocationSelection = () => {
      const next = selectedFromHash(window.location.hash);
      setSelected((current) => {
        if (sameSelected(current, next)) return current;
        skipNextHistoryPush.current = true;
        return next;
      });
    };

    if (!window.history.state?.[HISTORY_STATE_KEY]) {
      window.history.replaceState({ ...(window.history.state ?? {}), [HISTORY_STATE_KEY]: true }, '', selectedToHash(selected));
    }

    window.addEventListener('popstate', applyLocationSelection);
    window.addEventListener('hashchange', applyLocationSelection);
    return () => {
      window.removeEventListener('popstate', applyLocationSelection);
      window.removeEventListener('hashchange', applyLocationSelection);
    };
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const hash = selectedToHash(selected);
    if (skipNextHistoryPush.current) {
      skipNextHistoryPush.current = false;
      return;
    }
    if (window.location.hash === hash) return;
    window.history.pushState({ ...(window.history.state ?? {}), [HISTORY_STATE_KEY]: true }, '', hash);
  }, [selected]);

  const prevNarrow = useRef<boolean | null>(null);
  useEffect(() => {
    if (prevNarrow.current !== isNarrow) {
      prevNarrow.current = isNarrow;
      setLeftCollapsed(isNarrow);
    }
  }, [isNarrow]);
  // Machine Actual View is a deployed dashboard preview, so the hierarchy rail
  // is hidden entirely instead of leaving floating navigation labels over it.
  const [machineWorkspaceMode, setMachineWorkspaceMode] = useState<'design' | 'actual'>('design');
  const workspaceCollapsesSidebar = selected.kind === 'machine' && machineWorkspaceMode === 'actual';

  // Shared, durable workspace (Supabase-backed on web): hierarchy + canvas
  // layouts loaded from the server, persisted on edit, and polled so changes by
  // other authenticated users appear here too.
  const {
    projects,
    folders,
    devices: storedDevices,
    cards,
    machines,
    setProjects,
    setFolders,
    setDevices,
    setCards,
    setMachines,
    getLayout,
    getTemplateLayout,
    saveLayout,
    saveTemplateLayout,
  } = useStudioStore();

  // Real gateway/rack connectivity from the MQTT ingestion pipeline overlays
  // the stored device statuses, so the devices strip shows Online the moment a
  // bound gateway starts publishing.
  const liveState = useLiveTelemetry();
  const [ipChangeNotice, setIpChangeNotice] = useState<{ gatewayName: string; oldIp: string; newIp: string } | null>(null);
  const [ipConflictNotice, setIpConflictNotice] = useState<{
    ip: string;
    conflictDeviceName?: string;
    conflictDeviceType?: string;
  } | null>(null);
  const seenIpChanges = useRef<Set<string>>(new Set());
  const seenIpConflictAlerts = useRef<Set<number>>(new Set());
  const ipNoticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ipConflictNoticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const configuredGateways = useMemo(() => storedDevices.filter((device) => device.type === 'Gateway' && !device.archived), [storedDevices]);
  const demoDevices = useMemo<DeviceNode[]>(() => {
    const merged = new Map<string, DeviceNode>();
    for (const device of storedDevices) merged.set(device.id, device);

    const seedGateway = DEMO_SEED.devices.find((device) => device.type === 'Gateway');
    const firstGateway = configuredGateways[0] ?? (seedGateway && merged.has(seedGateway.id) ? seedGateway : undefined);
    if (!firstGateway) return storedDevices;
    if (!merged.has(firstGateway.id)) merged.set(firstGateway.id, firstGateway);

    const prefix = ipPrefixFor(firstGateway.ip) || '192.168.10';
    const hostOctets = ['11', '12', '13', '14'];
    DEMO_SEED.devices
      .filter((device) => device.type === 'Rack')
      .forEach((rack, index) => {
        const existing = merged.get(rack.id);
        if (!existing) return;
        merged.set(rack.id, {
          ...rack,
          ...existing,
          type: 'Rack',
          model: existing?.model ?? rack.model,
          ip: composeIp(prefix, hostOctets[index] ?? String(11 + index)) || rack.ip,
          gatewayId: firstGateway.id,
          realGatewayId: firstGateway.realGatewayId ?? defaultRealGatewayId(firstGateway.id),
          projectId: firstGateway.projectId ?? existing?.projectId ?? rack.projectId,
          archived: false,
          status: realMode ? (existing?.status ?? rack.status) : 'Online' as const,
          realRackId: existing?.realRackId ?? rack.realRackId ?? index + 1,
        });
      });

    return Array.from(merged.values());
  }, [configuredGateways, realMode, storedDevices]);
  const demoCards = useMemo(() => {
    const merged = new Map<string, CardNode>();
    for (const card of DEMO_SEED.cards) merged.set(card.id, card);
    for (const card of cards) merged.set(card.id, card);
    return Array.from(merged.values());
  }, [cards]);
  const devices = useMemo<DeviceNode[]>(
    () => {
      if (!realMode) return demoDevices.map((device) => (device.archived ? device : { ...device, status: 'Online' as const }));
      return applyLiveStatus(demoDevices.map((device) => (device.archived ? device : { ...device, status: 'Not Connected' as const })), liveState);
    },
    [demoDevices, liveState, realMode],
  );
  const visibleDeviceIds = useMemo(() => new Set(devices.map((device) => device.id)), [devices]);
  const visibleCards = useMemo(
    () => demoCards.filter((card) => visibleDeviceIds.has(card.deviceId)),
    [demoCards, visibleDeviceIds],
  );
  const gateways = useMemo(() => devices.filter((device) => device.type === 'Gateway' && !device.archived), [devices]);
  const configuredIpConflict = (ip: string, exceptDeviceId?: string | null) => {
    const normalizedIp = ip.trim();
    if (!normalizedIp) return undefined;
    return storedDevices.find(
      (d) =>
        !d.archived &&
        (d.type === 'Gateway' || d.type === 'Rack') &&
        d.id !== exceptDeviceId &&
        d.ip.trim() === normalizedIp,
    );
  };
  const findDuplicateIpInDevices = (candidateDevices: DeviceNode[]) => {
    const byIp = new Map<string, DeviceNode>();
    for (const device of candidateDevices) {
      if (device.archived || (device.type !== 'Gateway' && device.type !== 'Rack')) continue;
      const ip = device.ip.trim();
      if (!ip) continue;
      const existing = byIp.get(ip);
      if (existing && existing.id !== device.id) return { ip, device: existing };
      byIp.set(ip, device);
    }
    return null;
  };
  const showIpConflictNotice = (notice: { ip: string; conflictDeviceName?: string; conflictDeviceType?: string }) => {
    if (ipConflictNoticeTimer.current) clearTimeout(ipConflictNoticeTimer.current);
    if (ipNoticeTimer.current) clearTimeout(ipNoticeTimer.current);
    setIpChangeNotice(null);
    setIpConflictNotice(notice);
  };

  useEffect(() => {
    if (!realMode) return;
    for (const liveGateway of liveState.gateways) {
      const storedGateway = configuredGateways.find((device) => device.realGatewayId === liveGateway.gatewayId);
      if (!storedGateway) continue;
      const oldIp = storedGateway.ip.trim();
      const newIp = liveGateway.currentIp.trim();
      if (!oldIp || !newIp || oldIp === newIp) continue;
      const key = `${liveGateway.gatewayId}:${oldIp}->${newIp}`;
      if (seenIpChanges.current.has(key)) continue;
      seenIpChanges.current.add(key);
      const conflict = configuredIpConflict(newIp, storedGateway.id);
      if (conflict) {
        showIpConflictNotice({
          ip: newIp,
          conflictDeviceName: currentUser?.role === 'super_admin' ? conflict.name : undefined,
          conflictDeviceType: currentUser?.role === 'super_admin' ? conflict.type : undefined,
        });
        break;
      }
      setIpChangeNotice({ gatewayName: storedGateway.name, oldIp, newIp });
      if (ipNoticeTimer.current) clearTimeout(ipNoticeTimer.current);
      ipNoticeTimer.current = setTimeout(() => setIpChangeNotice(null), 6000);
      break;
    }
  }, [configuredGateways, currentUser?.role, liveState.gateways, realMode, storedDevices]);

  useEffect(() => {
    if (!realMode) return;
    const alert = liveState.alerts.find((item) => item.type === 'IP_CONFLICT' && !seenIpConflictAlerts.current.has(item.id));
    if (!alert) return;
    seenIpConflictAlerts.current.add(alert.id);
    showIpConflictNotice({
      ip: alert.gatewayIp,
      conflictDeviceName: currentUser?.role === 'super_admin' ? alert.conflictDeviceName : undefined,
      conflictDeviceType: currentUser?.role === 'super_admin' ? alert.conflictDeviceType : undefined,
    });
  }, [currentUser?.role, liveState.alerts, realMode]);

  useEffect(() => () => {
    if (ipNoticeTimer.current) clearTimeout(ipNoticeTimer.current);
    if (ipConflictNoticeTimer.current) clearTimeout(ipConflictNoticeTimer.current);
  }, []);

  useEffect(() => {
    if (storedDevices.length === 0) return;
    const needsGatewayIds = storedDevices.some((device) => device.type === 'Gateway' && !device.realGatewayId);
    const racksByGateway = new Map<string, DeviceNode[]>();
    for (const device of storedDevices) {
      if (device.type !== 'Rack' || device.archived) continue;
      const key = rackGatewayGroupKey(device, storedDevices);
      racksByGateway.set(key, [...(racksByGateway.get(key) ?? []), device]);
    }
    const needsRackRepair = Array.from(racksByGateway.values()).some((racks) => {
      const ids = racks.map((rack) => (rack.realRackId === undefined || rack.realRackId === null ? '' : String(rack.realRackId))).filter(Boolean);
      if (ids.length !== racks.length) return true;
      const unique = new Set(ids);
      return unique.size !== ids.length;
    });
    if (!needsGatewayIds && !needsRackRepair) return;

    setDevices((prev) => {
      let changed = false;
      let next = prev.map((device) => {
        if (device.type === 'Gateway' && !device.realGatewayId) {
          changed = true;
          return { ...device, realGatewayId: defaultRealGatewayId(device.id) };
        }
        return device;
      });
      const currentRacksByGateway = new Map<string, DeviceNode[]>();
      for (const device of next) {
        if (device.type !== 'Rack' || device.archived) continue;
        const key = rackGatewayGroupKey(device, next);
        currentRacksByGateway.set(key, [...(currentRacksByGateway.get(key) ?? []), device]);
      }
      const nextRackIdByDeviceId = new Map<string, string>();
      for (const racks of currentRacksByGateway.values()) {
        const used = new Set(racks.map((rack) => (rack.realRackId === undefined || rack.realRackId === null ? '' : String(rack.realRackId))).filter(Boolean));
        let nextNumeric = 1;
        [...racks].sort((a, b) => rackSortValue(a).localeCompare(rackSortValue(b))).forEach((rack) => {
          if (rack.realRackId !== undefined && rack.realRackId !== null && String(rack.realRackId) !== '') return;
          while (used.has(String(nextNumeric))) nextNumeric += 1;
          const assigned = String(nextNumeric);
          used.add(assigned);
          nextRackIdByDeviceId.set(rack.id, assigned);
        });
      }
      next = next.map((device) => {
        const nextRackId = nextRackIdByDeviceId.get(device.id);
        if (!nextRackId || device.realRackId === nextRackId) return device;
        changed = true;
        return { ...device, realRackId: nextRackId };
      });
      return changed ? next : prev;
    });
  }, [setDevices, storedDevices]);

  useEffect(() => {
    if (storedDevices.some((device) => device.type === 'Gateway')) return;
    const racks = storedDevices.filter((device) => device.type === 'Rack' && ipPrefixFor(device.ip));
    if (racks.length === 0) return;
    setDevices((prev) => {
      if (prev.some((device) => device.type === 'Gateway')) return prev;
      const byPrefix = new Map<string, DeviceNode[]>();
      for (const rack of racks) {
        const prefix = ipPrefixFor(rack.ip);
        if (!prefix) continue;
        byPrefix.set(prefix, [...(byPrefix.get(prefix) ?? []), rack]);
      }
      const generatedGateways: DeviceNode[] = Array.from(byPrefix.entries()).map(([prefix, group]) => ({
        id: `gateway-${prefix.replace(/\./g, '-')}`,
        name: `Gateway-${prefix.replace(/\./g, '-')}`,
        type: 'Gateway' as const,
        model: 'GW-100',
        ip: composeIp(prefix, '10') || `${prefix}.10`,
        port: '503',
        protocol: group[0]?.protocol ?? 'Modbus TCP',
        description: 'Auto-created gateway for existing racks',
        status: group.some((rack) => rack.status === 'Online') ? 'Online' as const : 'Not Connected' as const,
        projectId: group[0]?.projectId ?? null,
        archived: false,
      }));
      const gatewayIdByPrefix = new Map(generatedGateways.map((gateway) => [ipPrefixFor(gateway.ip), gateway.id]));
      return [
        ...generatedGateways,
        ...prev.map((device) => {
          if (device.type !== 'Rack') return device;
          const gatewayId = gatewayIdByPrefix.get(ipPrefixFor(device.ip));
          return gatewayId ? { ...device, gatewayId } : device;
        }),
      ];
    });
  }, [setDevices, storedDevices]);

  const [createProjectVisible, setCreateProjectVisible] = useState(false);
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const [createFolderTarget, setCreateFolderTarget] = useState<{ projectId: string; parentId: string | null } | null>(null);
  const [createMachineTarget, setCreateMachineTarget] = useState<{ projectId: string; folderId: string } | null>(null);
  const [renameTarget, setRenameTarget] = useState<ContextMenuTarget | null>(null);
  const [moveFolderId, setMoveFolderId] = useState<string | null>(null);
  const [moveMachineId, setMoveMachineId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ContextMenuTarget | null>(null);

  const [addDeviceVisible, setAddDeviceVisible] = useState(false);
  const [addDeviceGatewayId, setAddDeviceGatewayId] = useState<string | null>(null);
  const [editingDeviceId, setEditingDeviceId] = useState<string | null>(null);
  const [deviceMenu, setDeviceMenu] = useState<DeviceMenuState | null>(null);
  const [assignDeviceId, setAssignDeviceId] = useState<string | null>(null);
  const [deleteDeviceId, setDeleteDeviceId] = useState<string | null>(null);

  const handleCreateProject = (newProject: NewProject) => {
    // spec §4.2: add under Hierarchy, auto-select, show name in top bar.
    const id = makeId();
    setProjects((prev) => [...prev, { id, ...newProject }]);
    setSelected({ kind: 'project', id });
    setCreateProjectVisible(false);
  };

  const openCreateFolder = (target: ContextMenuTarget) => {
    setMenu(null);
    setCreateFolderTarget(target.kind === 'project' ? { projectId: target.id, parentId: null } : { projectId: target.projectId, parentId: target.id });
  };

  const handleCreateFolder = (newFolder: NewFolder) => {
    if (!createFolderTarget) return;
    const id = makeId();
    setFolders((prev) => [...prev, { id, projectId: createFolderTarget.projectId, parentId: createFolderTarget.parentId, ...newFolder }]);
    setSelected({ kind: 'folder', id });
    setCreateFolderTarget(null);
  };

  const openCreateMachine = (target: ContextMenuTarget) => {
    if (target.kind !== 'folder') return;
    setMenu(null);
    setCreateMachineTarget({ projectId: target.projectId, folderId: target.id });
  };

  const handleCreateMachine = (newMachine: NewMachine) => {
    if (!createMachineTarget) return;
    const id = makeId();
    const components = componentsForTemplate(newMachine.template, makeId);
    setMachines((prev) => [
      ...prev,
      { id, projectId: createMachineTarget.projectId, folderId: createMachineTarget.folderId, name: newMachine.name, template: newMachine.template, components },
    ]);
    setSelected({ kind: 'machine', id });
    setCreateMachineTarget(null);
  };

  const handleRename = (name: string) => {
    if (!renameTarget) return;
    if (renameTarget.kind === 'project') {
      setProjects((prev) => prev.map((p) => (p.id === renameTarget.id ? { ...p, name } : p)));
    } else if (renameTarget.kind === 'machine') {
      setMachines((prev) => prev.map((m) => (m.id === renameTarget.id ? { ...m, name } : m)));
    } else {
      setFolders((prev) => prev.map((f) => (f.id === renameTarget.id ? { ...f, name } : f)));
    }
    setRenameTarget(null);
  };

  const handleDuplicate = (target: ContextMenuTarget) => {
    if (target.kind === 'project') {
      const project = projects.find((p) => p.id === target.id);
      if (!project) return;
      const { project: newProject, folders: newFolders } = duplicateProject(project, folders, makeId);
      setProjects((prev) => [...prev, newProject]);
      setFolders((prev) => [...prev, ...newFolders]);
      setSelected({ kind: 'project', id: newProject.id });
    } else {
      const folder = folders.find((f) => f.id === target.id);
      if (!folder) return;
      const clones = duplicateFolderSubtree(folders, folder.id, folder.parentId, makeId);
      setFolders((prev) => [...prev, ...clones]);
      setSelected({ kind: 'folder', id: clones[0].id });
    }
  };

  const handleMove = (newParentId: string | null) => {
    if (!moveFolderId) return;
    setFolders((prev) => prev.map((f) => (f.id === moveFolderId ? { ...f, parentId: newParentId } : f)));
    setMoveFolderId(null);
  };

  // Machines always live inside a folder, so the project-root option is a no-op.
  const handleMoveMachine = (destFolderId: string | null) => {
    if (!moveMachineId) return;
    if (destFolderId) {
      setMachines((prev) => prev.map((m) => (m.id === moveMachineId ? { ...m, folderId: destFolderId } : m)));
    }
    setMoveMachineId(null);
  };

  const viewDetails = (target: ContextMenuTarget) => {
    if (target.kind === 'project') setSelected({ kind: 'project', id: target.id });
    else if (target.kind === 'folder') setSelected({ kind: 'folder', id: target.id });
    else setSelected({ kind: 'machine', id: target.id });
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    if (deleteTarget.kind === 'project') {
      setProjects((prev) => prev.filter((p) => p.id !== deleteTarget.id));
      setFolders((prev) => prev.filter((f) => f.projectId !== deleteTarget.id));
      setMachines((prev) => prev.filter((m) => m.projectId !== deleteTarget.id));
      setDevices((prev) => prev.map((d) => (d.projectId === deleteTarget.id ? { ...d, projectId: null } : d)));
      if (selected.kind === 'project' && selected.id === deleteTarget.id) setSelected({ kind: 'none' });
      if (selected.kind === 'folder' && folders.find((f) => f.id === selected.id)?.projectId === deleteTarget.id) {
        setSelected({ kind: 'none' });
      }
      if (selected.kind === 'machine' && machines.find((m) => m.id === selected.id)?.projectId === deleteTarget.id) {
        setSelected({ kind: 'none' });
      }
    } else if (deleteTarget.kind === 'machine') {
      const folderId = deleteTarget.folderId;
      setMachines((prev) => prev.filter((m) => m.id !== deleteTarget.id));
      if (selected.kind === 'machine' && selected.id === deleteTarget.id) setSelected({ kind: 'folder', id: folderId });
    } else {
      const removedIds = folderSubtreeIds(folders, deleteTarget.id);
      setFolders((prev) => prev.filter((f) => !removedIds.has(f.id)));
      setMachines((prev) => prev.filter((m) => !removedIds.has(m.folderId)));
      if (selected.kind === 'folder' && removedIds.has(selected.id)) setSelected({ kind: 'project', id: deleteTarget.projectId });
      if (selected.kind === 'machine' && removedIds.has(machines.find((m) => m.id === selected.id)?.folderId ?? '')) {
        setSelected({ kind: 'project', id: deleteTarget.projectId });
      }
    }
    setDeleteTarget(null);
  };

  const handleSaveDevice = (device: NewDevice) => {
    if (editingDeviceId) {
      const previous = storedDevices.find((d) => d.id === editingDeviceId);
      const nextGatewayPrefix = device.type === 'Gateway' ? ipPrefixFor(device.ip) : '';
      const savedDevice: NewDevice = {
        ...device,
        realGatewayId: device.type === 'Gateway' ? (device.realGatewayId ?? previous?.realGatewayId ?? defaultRealGatewayId(editingDeviceId)) : (device.realGatewayId ?? previous?.realGatewayId ?? null),
        realRackId:
          device.type === 'Rack'
            ? nextRackIdForGateway(device.gatewayId, devices, editingDeviceId, device.realRackId ?? previous?.realRackId ?? null)
            : null,
      };
      const updated = storedDevices.map((d) => {
        if (d.id === editingDeviceId) return { ...d, ...savedDevice };
        if (previous?.type === 'Gateway' && nextGatewayPrefix && d.type === 'Rack' && d.gatewayId === editingDeviceId) {
          const host = hostOctetFor(d.ip);
          return host ? { ...d, ip: composeIp(nextGatewayPrefix, host) } : d;
        }
        return d;
      });
      const candidate: DeviceNode[] = previous
        ? updated
        : [...updated, { id: editingDeviceId, projectId: device.gatewayId ? (storedDevices.find((d) => d.id === device.gatewayId)?.projectId ?? null) : null, archived: false, ...savedDevice }];
      const duplicate = findDuplicateIpInDevices(candidate);
      if (duplicate) {
        showIpConflictNotice({
          ip: duplicate.ip,
          conflictDeviceName: currentUser?.role === 'super_admin' ? duplicate.device.name : undefined,
          conflictDeviceType: currentUser?.role === 'super_admin' ? duplicate.device.type : undefined,
        });
        return;
      }
      setDevices(candidate);
      setEditingDeviceId(null);
    } else {
      const gateway = device.gatewayId ? storedDevices.find((d) => d.id === device.gatewayId && d.type === 'Gateway') : undefined;
      const id = makeId();
      const newDevice: DeviceNode = {
        id,
        projectId: gateway?.projectId ?? null,
        archived: false,
        ...device,
        realGatewayId: device.type === 'Gateway' ? (device.realGatewayId ?? defaultRealGatewayId(id)) : (gateway?.realGatewayId ?? null),
        realRackId: device.type === 'Rack' ? nextRackIdForGateway(device.gatewayId, devices, null, device.realRackId ?? null) : null,
      };
      const candidate: DeviceNode[] = [...storedDevices, newDevice];
      const duplicate = findDuplicateIpInDevices(candidate);
      if (duplicate) {
        showIpConflictNotice({
          ip: duplicate.ip,
          conflictDeviceName: currentUser?.role === 'super_admin' ? duplicate.device.name : undefined,
          conflictDeviceType: currentUser?.role === 'super_admin' ? duplicate.device.type : undefined,
        });
        return;
      }
      setDevices(candidate);
    }
    setAddDeviceVisible(false);
    setAddDeviceGatewayId(null);
  };

  const handleTestConnectionFromMenu = (device: DeviceNode) => {
    const duplicateIpDevice = configuredIpConflict(device.ip, device.id);
    if (duplicateIpDevice) {
      showIpConflictNotice({
        ip: device.ip.trim(),
        conflictDeviceName: currentUser?.role === 'super_admin' ? duplicateIpDevice.name : undefined,
        conflictDeviceType: currentUser?.role === 'super_admin' ? duplicateIpDevice.type : undefined,
      });
      return;
    }
    // Same simulated test as the Add/Edit dialog, applied in place.
    setDevices((prev) => prev.map((d) => (d.id === device.id ? { ...d, status: Math.random() > 0.3 ? 'Online' : 'Not Connected' } : d)));
  };

  const handleAssignDevice = (projectId: string) => {
    if (!assignDeviceId) return;
    setDevices((prev) => prev.map((d) => (d.id === assignDeviceId ? { ...d, projectId } : d)));
    setAssignDeviceId(null);
  };

  const handleUnassignDevice = (device: DeviceNode) => {
    setDevices((prev) => prev.map((d) => (d.id === device.id ? { ...d, projectId: null, archived: false } : d)));
  };

  const handleArchiveDevice = (device: DeviceNode) => {
    setDevices((prev) => {
      const childIds = device.type === 'Gateway' ? new Set(racksForGateway(device, prev).map((rack) => rack.id)) : new Set<string>();
      return prev.map((d) => (d.id === device.id || childIds.has(d.id) ? { ...d, archived: true } : d));
    });
  };

  const handleDeleteDevice = () => {
    if (!deleteDeviceId) return;
    const deleted = devices.find((d) => d.id === deleteDeviceId);
    const removedIds = new Set([deleteDeviceId, ...(deleted?.type === 'Gateway' ? racksForGateway(deleted, devices).map((rack) => rack.id) : [])]);
    setDevices((prev) => prev.filter((d) => !removedIds.has(d.id)));
    setCards((prev) => prev.filter((card) => !removedIds.has(card.deviceId)));
    if (selected.kind === 'device' && selected.id === deleteDeviceId) setSelected({ kind: 'devices' });
    setDeleteDeviceId(null);
  };

  const handleInstallCard = (deviceId: string, slot: number, type: CardType, config: CardConfig, enabled: boolean) => {
    setCards((prev) => {
      const existing = prev.find((card) => card.deviceId === deviceId && card.slot === slot);
      if (existing) {
        return prev.map((card) => (card.id === existing.id ? { ...card, type, config, enabled } : card)).filter((card) => card.id === existing.id || card.deviceId !== deviceId || card.slot !== slot);
      }
      return [...prev, { id: makeId(), deviceId, slot, type, config, enabled }];
    });
  };

  const handleUpdateCard = (cardId: string, config: CardConfig, enabled: boolean) => {
    setCards((prev) => prev.map((c) => (c.id === cardId ? { ...c, config, enabled } : c)));
  };

  const handleRemoveCard = (cardId: string) => {
    setCards((prev) => prev.filter((c) => c.id !== cardId));
  };

  const parentLabel = (() => {
    if (!createFolderTarget) return '';
    const project = projects.find((p) => p.id === createFolderTarget.projectId);
    if (createFolderTarget.parentId === null) return project?.name ?? '';
    const path = folderPath(folders, createFolderTarget.parentId);
    return [project?.name, ...path.map((f) => f.name)].filter(Boolean).join(' / ');
  })();

  const machineParentLabel = (() => {
    if (!createMachineTarget) return '';
    const project = projects.find((p) => p.id === createMachineTarget.projectId);
    const path = folderPath(folders, createMachineTarget.folderId);
    return [project?.name, ...path.map((f) => f.name)].filter(Boolean).join(' / ');
  })();

  const selectedProject = selected.kind === 'project' ? projects.find((p) => p.id === selected.id) : undefined;
  const selectedFolder = selected.kind === 'folder' ? folders.find((f) => f.id === selected.id) : undefined;
  const selectedDeviceRaw = selected.kind === 'device' ? devices.find((d) => d.id === selected.id) : undefined;
  const selectedDevice = selectedDeviceRaw ? deviceWithGatewayConnectionState(selectedDeviceRaw, devices) : undefined;
  const selectedMachine = selected.kind === 'machine' ? machines.find((m) => m.id === selected.id) : undefined;
  const editingDevice = editingDeviceId ? (storedDevices.find((d) => d.id === editingDeviceId) ?? devices.find((d) => d.id === editingDeviceId)) : null;
  const deleteDeviceInfo = deleteDeviceId ? (storedDevices.find((d) => d.id === deleteDeviceId) ?? devices.find((d) => d.id === deleteDeviceId)) : null;
  const topBarProjectName = selectedProject?.name ?? (selectedFolder ? projects.find((p) => p.id === selectedFolder.projectId)?.name : undefined);
  const detailTopClearance = leftCollapsed && !workspaceCollapsesSidebar && (selected.kind === 'machine' || selected.kind === 'device') ? 44 : 0;

  const renameCurrentName =
    renameTarget?.kind === 'project'
      ? (projects.find((p) => p.id === renameTarget.id)?.name ?? '')
      : renameTarget?.kind === 'machine'
        ? (machines.find((m) => m.id === renameTarget.id)?.name ?? '')
        : renameTarget
          ? (folders.find((f) => f.id === renameTarget.id)?.name ?? '')
          : '';

  const deleteInfo = (() => {
    if (!deleteTarget) return null;
    if (deleteTarget.kind === 'project') {
      const project = projects.find((p) => p.id === deleteTarget.id);
      const count = folders.filter((f) => f.projectId === deleteTarget.id).length;
      return {
        title: 'Delete Project',
        message: `Delete "${project?.name}"${count > 0 ? ` and its ${count} folder(s)` : ''}? This cannot be undone.`,
      };
    }
    if (deleteTarget.kind === 'machine') {
      const machine = machines.find((m) => m.id === deleteTarget.id);
      return { title: 'Delete Machine', message: `Delete "${machine?.name}"? This cannot be undone.` };
    }
    const folder = folders.find((f) => f.id === deleteTarget.id);
    const count = folderSubtreeIds(folders, deleteTarget.id).size - 1;
    return {
      title: 'Delete Folder',
      message: `Delete "${folder?.name}"${count > 0 ? ` and its ${count} subfolder(s)` : ''}? This cannot be undone.`,
    };
  })();

  return (
    <SafeAreaView className={cn('flex-1', isDark ? 'bg-surface-dark' : 'bg-surface-light')} edges={['top', 'bottom']}>
      <TopBar
        projectName={topBarProjectName}
        devices={devices}
        canConfigure={hasConfigureAccess}
        configureMode={configureMode}
        onConfigureModeChange={setConfigureMode}
        onLogoPress={() => setSelected({ kind: 'none' })}
      />

      {ipChangeNotice && (
        <View
          className={cn(
            'absolute right-4 top-16 z-50 max-w-[360px] rounded-lg border px-4 py-3 shadow-lg',
            isDark ? 'border-status-warning/50 bg-surface-darkpanel' : 'border-status-warning/60 bg-surface-lightpanel',
          )}
        >
          <Text className={cn('font-body-bold text-sm', isDark ? 'text-ink' : 'text-ink-inverse')}>Gateway IP updated</Text>
          <Text className={cn('mt-1 font-body text-xs', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
            {ipChangeNotice.gatewayName}: {ipChangeNotice.oldIp} to {ipChangeNotice.newIp}
          </Text>
        </View>
      )}

      {ipConflictNotice && (
        <View
          className="absolute inset-0 z-50 items-center justify-center px-6"
          style={{ backgroundColor: 'rgba(0,0,0,0.28)' }}
        >
          <View
            className={cn(
              'w-full max-w-[420px] rounded-xl border px-5 py-4 shadow-xl',
              isDark ? 'border-status-critical/50 bg-surface-darkpanel' : 'border-status-critical/60 bg-surface-lightpanel',
            )}
          >
            <Text className={cn('font-body-bold text-base', isDark ? 'text-ink' : 'text-ink-inverse')}>IP address already exists</Text>
            <Text className={cn('mt-2 font-body text-sm', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
              {ipConflictNotice.conflictDeviceName
                ? `${ipConflictNotice.ip} is already configured on ${ipConflictNotice.conflictDeviceName} (${ipConflictNotice.conflictDeviceType ?? 'Device'}). This IP cannot be used for another gateway or rack.`
                : `${ipConflictNotice.ip} is already configured and cannot be used for another gateway or rack.`}
            </Text>
            <View className="mt-4 items-end">
              <ActionButton label="OK" onPress={() => setIpConflictNotice(null)} />
            </View>
          </View>
        </View>
      )}

      <View className="flex-1 flex-row">
        {!workspaceCollapsesSidebar && (
          <>
            <LeftPanel
              collapsed={leftCollapsed}
              onCollapsedChange={setLeftCollapsed}
              selected={selected}
              onSelect={setSelected}
              projects={projects}
              folders={folders}
              machines={machines}
              devices={devices}
              onOpenMenu={canEditDeleteSchema ? (x, y, target, canAddMachine) => setMenu({ x, y, target, canAddMachine }) : undefined}
              onOpenDeviceMenu={canEditDeleteSchema ? (x, y, deviceId) => {
                const device = devices.find((d) => d.id === deviceId);
                if (device) setDeviceMenu({ x, y, device });
              } : undefined}
              onCreateProject={canEditDeleteSchema ? () => setCreateProjectVisible(true) : undefined}
              canConfigure={canEditDeleteSchema}
              showRealModeToggle={currentUser?.role === 'super_admin'}
              realMode={realMode}
              onRealModeChange={handleRealModeChange}
              footer={sidebarFooter}
            />

            <PanelToggle
              collapsed={leftCollapsed}
              onPress={() => setLeftCollapsed((v) => !v)}
              left={leftCollapsed ? 8 : LEFT_PANEL_WIDTH - 12}
            />
          </>
        )}

        <View className="relative flex-1" style={detailTopClearance ? { paddingTop: detailTopClearance } : undefined}>
          {selected.kind === 'machine' && selectedMachine ? (
            <MachineWorkspace
              key={selectedMachine.id}
              machine={selectedMachine}
              devices={devices}
              cards={visibleCards}
              live={realMode ? liveState : undefined}
              layout={getLayout(selectedMachine.id)}
              templateLayout={getTemplateLayout(selectedMachine.template)}
              onSaveLayout={saveLayout}
              onSaveTemplate={saveTemplateLayout}
              onBack={() => setSelected({ kind: 'folder', id: selectedMachine.folderId })}
              onModeChange={setMachineWorkspaceMode}
              canConfigure={canEditDeleteSchema}
              canSaveTemplate={currentUser?.role === 'super_admin'}
            />
          ) : selected.kind === 'device' && selectedDevice && selectedDevice.type === 'Gateway' ? (
            <GatewayDetail
              gateway={selectedDevice}
              devices={devices}
              projects={projects}
              live={realMode ? liveState : undefined}
              canConfigure={canEditDeleteSchema}
              onBack={() => setSelected({ kind: 'devices' })}
              onAddRack={() => {
                setAddDeviceGatewayId(selectedDevice.id);
                setAddDeviceVisible(true);
              }}
              onOpenRack={(id) => setSelected({ kind: 'device', id })}
              onOpenMenu={canEditDeleteSchema ? (x, y, deviceId) => {
                const device = devices.find((d) => d.id === deviceId);
                if (device) setDeviceMenu({ x, y, device });
              } : undefined}
            />
          ) : selected.kind === 'device' && selectedDevice && selectedDevice.type === 'Rack' ? (
            <RackDetail
              device={selectedDevice}
              devices={devices}
              cards={visibleCards.filter((c) => c.deviceId === selectedDevice.id)}
              live={realMode ? liveState : undefined}
              canEditDeleteSchema={canEditDeleteSchema}
              backLabel={selectedDevice.gatewayId ? 'Back to Gateway' : 'Back to Devices'}
              onBack={() => {
                const gateway = selectedDevice.gatewayId ? devices.find((device) => device.id === selectedDevice.gatewayId && device.type === 'Gateway') : undefined;
                setSelected(gateway ? { kind: 'device', id: gateway.id } : { kind: 'devices' });
              }}
              onInstallCard={(slot, type, config, enabled) => handleInstallCard(selectedDevice.id, slot, type, config, enabled)}
              onUpdateCard={handleUpdateCard}
              onRemoveCard={handleRemoveCard}
            />
          ) : selected.kind === 'device' && selectedDevice ? (
            <DeviceDetail device={selectedDevice} live={realMode ? liveState : undefined} onBack={() => setSelected({ kind: 'devices' })} />
          ) : selected.kind === 'devices' ? (
            gateways.length === 0 ? (
              <EmptyState title="DEVICES" description="No devices added.">
                {canEditDeleteSchema && (
                  <ActionButton
                    label="Add Device"
                    permission={PERMISSIONS.DEVICE_CREATE}
                    onPress={() => {
                      setAddDeviceGatewayId(null);
                      setAddDeviceVisible(true);
                    }}
                  />
                )}
              </EmptyState>
            ) : (
              <View className="flex-1">
                {/* Extra clearance when the sidebar is collapsed — the floating
                    Hierarchy/Devices toggle then sits right over this corner. */}
                <View className="flex-row items-center justify-between px-6 pt-5" style={leftCollapsed ? { paddingTop: 56 } : undefined}>
                  <Text className={cn('font-body-bold text-lg', isDark ? 'text-ink' : 'text-ink-inverse')}>Devices</Text>
                  {canEditDeleteSchema && (
                    <ActionButton
                      label="Add Device"
                      permission={PERMISSIONS.DEVICE_CREATE}
                      onPress={() => {
                        setAddDeviceGatewayId(null);
                        setAddDeviceVisible(true);
                      }}
                    />
                  )}
                </View>
                <DevicesTable
                  devices={gateways}
                  allDevices={devices}
                  projects={projects}
                  live={realMode ? liveState : undefined}
                  onOpenDevice={(id) => setSelected({ kind: 'device', id })}
                  onOpenMenu={canEditDeleteSchema ? (x, y, deviceId) => {
                    const device = devices.find((d) => d.id === deviceId);
                    if (device) setDeviceMenu({ x, y, device });
                  } : undefined}
                />
              </View>
            )
          ) : selected.kind === 'none' || projects.length === 0 ? (
            <EmptyState title="NO PROJECT CREATED" description="Create your first project to begin.">
              {canEditDeleteSchema && (
                <ActionButton
                  label="Create Project"
                  permission={PERMISSIONS.PROJECT_CREATE}
                  onPress={() => setCreateProjectVisible(true)}
                />
              )}
            </EmptyState>
          ) : selectedProject ? (
            <HierarchyContents
              title={selectedProject.name}
              breadcrumb=""
              childFolders={folders.filter((f) => f.projectId === selectedProject.id && f.parentId === null)}
              childMachines={[]}
              folders={folders}
              machines={machines}
              onOpenFolder={(id) => setSelected({ kind: 'folder', id })}
              onOpenMachine={(id) => setSelected({ kind: 'machine', id })}
              onAddFolder={() => openCreateFolder({ kind: 'project', id: selectedProject.id })}
              onOpenMenu={canEditDeleteSchema ? (x, y, target, canAddMachine) => setMenu({ x, y, target, canAddMachine }) : undefined}
              canConfigure={canEditDeleteSchema}
              topPad={leftCollapsed}
            />
          ) : selectedFolder ? (
            <HierarchyContents
              title={selectedFolder.name}
              breadcrumb={[projects.find((p) => p.id === selectedFolder.projectId)?.name, ...folderPath(folders, selectedFolder.id).map((f) => f.name)]
                .filter(Boolean)
                .join(' / ')}
              childFolders={folders.filter((f) => f.parentId === selectedFolder.id)}
              childMachines={machines.filter((m) => m.folderId === selectedFolder.id)}
              folders={folders}
              machines={machines}
              onOpenFolder={(id) => setSelected({ kind: 'folder', id })}
              onOpenMachine={(id) => setSelected({ kind: 'machine', id })}
              onAddFolder={() => openCreateFolder({ kind: 'folder', id: selectedFolder.id, projectId: selectedFolder.projectId })}
              onAddMachine={() => openCreateMachine({ kind: 'folder', id: selectedFolder.id, projectId: selectedFolder.projectId })}
              onOpenMenu={canEditDeleteSchema ? (x, y, target, canAddMachine) => setMenu({ x, y, target, canAddMachine }) : undefined}
              canConfigure={canEditDeleteSchema}
              topPad={leftCollapsed}
            />
          ) : null}
        </View>
      </View>

      <CreateProjectDialog
        visible={createProjectVisible}
        onCancel={() => setCreateProjectVisible(false)}
        onCreate={handleCreateProject}
      />

      <CreateFolderDialog
        visible={createFolderTarget !== null}
        parentLabel={parentLabel}
        onCancel={() => setCreateFolderTarget(null)}
        onCreate={handleCreateFolder}
      />

      <AddMachineDialog
        visible={createMachineTarget !== null}
        parentLabel={machineParentLabel}
        onCancel={() => setCreateMachineTarget(null)}
        onCreate={handleCreateMachine}
      />

      <RenameDialog
        visible={renameTarget !== null}
        currentName={renameCurrentName}
        onCancel={() => setRenameTarget(null)}
        onRename={handleRename}
      />

      <MoveDialog
        visible={moveFolderId !== null}
        folderId={moveFolderId ?? ''}
        project={moveFolderId ? projects.find((p) => p.id === folders.find((f) => f.id === moveFolderId)?.projectId) : undefined}
        folders={folders}
        onCancel={() => setMoveFolderId(null)}
        onMove={handleMove}
      />

      <MoveDialog
        visible={moveMachineId !== null}
        title="Move Machine"
        folderId={moveMachineId ? (machines.find((m) => m.id === moveMachineId)?.folderId ?? '') : ''}
        project={moveMachineId ? projects.find((p) => p.id === machines.find((m) => m.id === moveMachineId)?.projectId) : undefined}
        folders={folders}
        onCancel={() => setMoveMachineId(null)}
        onMove={handleMoveMachine}
      />

      {deleteInfo && (
        <ConfirmDialog
          visible={deleteTarget !== null}
          title={deleteInfo.title}
          message={deleteInfo.message}
          confirmLabel="Delete"
          onCancel={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
        />
      )}

      <ContextMenu
        state={menu}
        onClose={() => setMenu(null)}
        onAddFolder={openCreateFolder}
        onAddMachine={openCreateMachine}
        onRename={(target) => setRenameTarget(target)}
        onDuplicate={handleDuplicate}
        onMove={(target) => {
          if (target.kind === 'folder') setMoveFolderId(target.id);
          else if (target.kind === 'machine') setMoveMachineId(target.id);
        }}
        onDelete={(target) => setDeleteTarget(target)}
        onViewDetails={viewDetails}
        canEditDeleteSchema={canEditDeleteSchema}
      />

      <AddDeviceDialog
        visible={addDeviceVisible || editingDeviceId !== null}
        editingDevice={editingDevice}
        gateways={configuredGateways}
        initialGatewayId={addDeviceGatewayId}
        onCancel={() => {
          setAddDeviceVisible(false);
          setAddDeviceGatewayId(null);
          setEditingDeviceId(null);
        }}
        onCreate={handleSaveDevice}
      />

      <AssignProjectDialog
        visible={assignDeviceId !== null}
        deviceName={assignDeviceId ? (devices.find((d) => d.id === assignDeviceId)?.name ?? '') : ''}
        projects={projects}
        onCancel={() => setAssignDeviceId(null)}
        onAssign={handleAssignDevice}
      />

      {deleteDeviceInfo && (
        <ConfirmDialog
          visible={deleteDeviceId !== null}
          title="Delete Device"
          message={`Delete "${deleteDeviceInfo.name}"? This cannot be undone.`}
          confirmLabel="Delete"
          onCancel={() => setDeleteDeviceId(null)}
          onConfirm={handleDeleteDevice}
        />
      )}

      <DeviceMenu
        state={deviceMenu}
        onClose={() => setDeviceMenu(null)}
        onOpen={(d) => setSelected({ kind: 'device', id: d.id })}
        onEdit={(d) => setEditingDeviceId(d.id)}
        onTestConnection={handleTestConnectionFromMenu}
        onAssign={(d) => setAssignDeviceId(d.id)}
        onUnassign={handleUnassignDevice}
        onDelete={(d) => setDeleteDeviceId(d.id)}
        onArchive={handleArchiveDevice}
      />
    </SafeAreaView>
  );
}
