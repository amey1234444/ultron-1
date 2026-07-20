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
import { composeIp, hostOctetFor, ipPrefixFor, racksForGateway, type DeviceNode } from '../lib/devices';
import { applyLiveStatus, isDeviceLive } from '../lib/liveTelemetry';
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
import { USER_PERMISSIONS, userHasPermission, type PublicUser } from '../src/lib/roles';

const LEFT_PANEL_WIDTH = 256;

function makeId() {
  return Math.random().toString(36).slice(2, 10);
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

  const [selected, setSelected] = useState<SelectedNode>({ kind: 'none' });
  const [leftCollapsed, setLeftCollapsed] = useState(isNarrow);

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
    saveLayout,
  } = useStudioStore();

  // Real gateway/rack connectivity from the MQTT ingestion pipeline overlays
  // the stored device statuses, so the devices strip shows Online the moment a
  // bound gateway starts publishing.
  const liveState = useLiveTelemetry();
  const liveDevices = useMemo(() => applyLiveStatus(storedDevices, liveState), [storedDevices, liveState]);
  const devices = useMemo(
    () => (realMode ? liveDevices.filter((device) => !device.archived && isDeviceLive(device, liveState)) : storedDevices),
    [liveDevices, liveState, realMode, storedDevices],
  );
  const visibleDeviceIds = useMemo(() => new Set(devices.map((device) => device.id)), [devices]);
  const visibleCards = useMemo(
    () => (realMode ? cards.filter((card) => visibleDeviceIds.has(card.deviceId)) : cards),
    [cards, realMode, visibleDeviceIds],
  );
  const gateways = useMemo(() => devices.filter((device) => device.type === 'Gateway' && !device.archived), [devices]);
  const configuredGateways = useMemo(() => storedDevices.filter((device) => device.type === 'Gateway' && !device.archived), [storedDevices]);

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
        ip: prefix,
        port: '503',
        protocol: group[0]?.protocol ?? 'Modbus TCP',
        description: 'Auto-created gateway for existing racks',
        status: group.some((rack) => rack.status === 'Online') ? 'Online' as const : 'Not Connected' as const,
        projectId: group[0]?.projectId ?? null,
        archived: false,
      }));
      const gatewayIdByPrefix = new Map(generatedGateways.map((gateway) => [gateway.ip, gateway.id]));
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
      setDevices((prev) => {
        const previous = prev.find((d) => d.id === editingDeviceId);
        const nextGatewayPrefix = device.type === 'Gateway' ? ipPrefixFor(device.ip) : '';
        return prev.map((d) => {
          if (d.id === editingDeviceId) return { ...d, ...device };
          if (previous?.type === 'Gateway' && nextGatewayPrefix && d.type === 'Rack' && d.gatewayId === editingDeviceId) {
            const host = hostOctetFor(d.ip);
            return host ? { ...d, ip: composeIp(nextGatewayPrefix, host) } : d;
          }
          return d;
        });
      });
      setEditingDeviceId(null);
    } else {
      const gateway = device.gatewayId ? storedDevices.find((d) => d.id === device.gatewayId && d.type === 'Gateway') : undefined;
      setDevices((prev) => [...prev, { id: makeId(), projectId: gateway?.projectId ?? null, archived: false, ...device }]);
    }
    setAddDeviceVisible(false);
    setAddDeviceGatewayId(null);
  };

  const handleTestConnectionFromMenu = (device: DeviceNode) => {
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
    const deleted = storedDevices.find((d) => d.id === deleteDeviceId);
    const removedIds = new Set([deleteDeviceId, ...(deleted?.type === 'Gateway' ? racksForGateway(deleted, storedDevices).map((rack) => rack.id) : [])]);
    setDevices((prev) => prev.filter((d) => !removedIds.has(d.id)));
    setCards((prev) => prev.filter((card) => !removedIds.has(card.deviceId)));
    if (selected.kind === 'device' && selected.id === deleteDeviceId) setSelected({ kind: 'devices' });
    setDeleteDeviceId(null);
  };

  const handleInstallCard = (deviceId: string, slot: number, type: CardType, config: CardConfig, enabled: boolean) => {
    setCards((prev) => [...prev, { id: makeId(), deviceId, slot, type, config, enabled }]);
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
  const selectedDevice = selected.kind === 'device' ? devices.find((d) => d.id === selected.id) : undefined;
  const selectedMachine = selected.kind === 'machine' ? machines.find((m) => m.id === selected.id) : undefined;
  const editingDevice = editingDeviceId ? (storedDevices.find((d) => d.id === editingDeviceId) ?? devices.find((d) => d.id === editingDeviceId)) : null;
  const deleteDeviceInfo = deleteDeviceId ? (storedDevices.find((d) => d.id === deleteDeviceId) ?? devices.find((d) => d.id === deleteDeviceId)) : null;
  const topBarProjectName = selectedProject?.name ?? (selectedFolder ? projects.find((p) => p.id === selectedFolder.projectId)?.name : undefined);

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
      />

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
              onOpenMenu={canEditDeleteSchema ? (x, y, target, canAddMachine) => setMenu({ x, y, target, canAddMachine }) : undefined}
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

        <View className="relative flex-1">
          {selected.kind === 'machine' && selectedMachine ? (
            <MachineWorkspace
              key={selectedMachine.id}
              machine={selectedMachine}
              devices={devices}
              cards={visibleCards}
              live={liveState}
              layout={getLayout(selectedMachine.id)}
              onSaveLayout={saveLayout}
              onBack={() => setSelected({ kind: 'folder', id: selectedMachine.folderId })}
              onModeChange={setMachineWorkspaceMode}
              canConfigure={canEditDeleteSchema}
            />
          ) : selected.kind === 'device' && selectedDevice && selectedDevice.type === 'Gateway' ? (
            <GatewayDetail
              gateway={selectedDevice}
              devices={devices}
              projects={projects}
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
              cards={visibleCards.filter((c) => c.deviceId === selectedDevice.id)}
              live={liveState}
              canEditDeleteSchema={canEditDeleteSchema}
              onBack={() => setSelected({ kind: 'devices' })}
              onInstallCard={(slot, type, config, enabled) => handleInstallCard(selectedDevice.id, slot, type, config, enabled)}
              onUpdateCard={handleUpdateCard}
              onRemoveCard={handleRemoveCard}
            />
          ) : selected.kind === 'device' && selectedDevice ? (
            <DeviceDetail device={selectedDevice} live={liveState} onBack={() => setSelected({ kind: 'devices' })} />
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
