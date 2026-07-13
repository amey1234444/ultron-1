import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, Text, useWindowDimensions, View } from 'react-native';
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
import { cn } from '../lib/cn';
import type { DeviceNode } from '../lib/devices';
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

function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

const SEED = createSeedData(makeId);

export default function Home({ sidebarFooter, currentUser }: { sidebarFooter?: ReactNode; currentUser?: PublicUser | null } = {}) {
  const { isDark } = useAppTheme();
  const hasConfigureAccess = currentUser
    ? userHasPermission(currentUser, USER_PERMISSIONS.SCHEMA_EDIT_DELETE)
    : true;
  const [configureMode, setConfigureMode] = useState(false);
  const canEditDeleteSchema = hasConfigureAccess && configureMode;

  useEffect(() => {
    if (!hasConfigureAccess && configureMode) setConfigureMode(false);
  }, [hasConfigureAccess, configureMode]);

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
  // In machine Actual View the hierarchy stays available for navigation, but
  // the workspace can fold it away with one click.
  const [machineWorkspaceMode, setMachineWorkspaceMode] = useState<'design' | 'actual'>('design');
  const workspaceCollapsesSidebar = selected.kind === 'machine' && machineWorkspaceMode === 'actual';

  const [projects, setProjects] = useState<ProjectNode[]>(SEED.projects);
  const [folders, setFolders] = useState<FolderNode[]>(SEED.folders);
  const [devices, setDevices] = useState<DeviceNode[]>(SEED.devices);
  const [cards, setCards] = useState<CardNode[]>(SEED.cards);
  const [machines, setMachines] = useState<MachineNode[]>(SEED.machines);

  const [createProjectVisible, setCreateProjectVisible] = useState(false);
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const [createFolderTarget, setCreateFolderTarget] = useState<{ projectId: string; parentId: string | null } | null>(null);
  const [createMachineTarget, setCreateMachineTarget] = useState<{ projectId: string; folderId: string } | null>(null);
  const [renameTarget, setRenameTarget] = useState<ContextMenuTarget | null>(null);
  const [moveFolderId, setMoveFolderId] = useState<string | null>(null);
  const [moveMachineId, setMoveMachineId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ContextMenuTarget | null>(null);

  const [addDeviceVisible, setAddDeviceVisible] = useState(false);
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
      setDevices((prev) => prev.map((d) => (d.id === editingDeviceId ? { ...d, ...device } : d)));
      setEditingDeviceId(null);
    } else {
      setDevices((prev) => [...prev, { id: makeId(), projectId: null, archived: false, ...device }]);
    }
    setAddDeviceVisible(false);
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
    setDevices((prev) => prev.map((d) => (d.id === device.id ? { ...d, archived: true } : d)));
  };

  const handleDeleteDevice = () => {
    if (!deleteDeviceId) return;
    setDevices((prev) => prev.filter((d) => d.id !== deleteDeviceId));
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
  const editingDevice = editingDeviceId ? devices.find((d) => d.id === editingDeviceId) : null;
  const deleteDeviceInfo = deleteDeviceId ? devices.find((d) => d.id === deleteDeviceId) : null;
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
          footer={sidebarFooter}
        />

        <PanelToggle
          collapsed={leftCollapsed}
          onPress={() => setLeftCollapsed((v) => !v)}
          left={leftCollapsed ? 8 : LEFT_PANEL_WIDTH - 12}
        />

        <View className="relative flex-1">
          {workspaceCollapsesSidebar && !leftCollapsed && (
            <Pressable
              onPress={() => setLeftCollapsed(true)}
              className="absolute inset-0 z-20"
              accessibilityRole="button"
              accessibilityLabel="Collapse sidebar"
            />
          )}
          {selected.kind === 'machine' && selectedMachine ? (
            <MachineWorkspace
              key={selectedMachine.id}
              machine={selectedMachine}
              devices={devices}
              cards={cards}
              onBack={() => setSelected({ kind: 'folder', id: selectedMachine.folderId })}
              onModeChange={setMachineWorkspaceMode}
              canConfigure={canEditDeleteSchema}
            />
          ) : selected.kind === 'device' && selectedDevice && selectedDevice.type === 'Rack' ? (
            <RackDetail
              device={selectedDevice}
              cards={cards.filter((c) => c.deviceId === selectedDevice.id)}
              canEditDeleteSchema={canEditDeleteSchema}
              onBack={() => setSelected({ kind: 'devices' })}
              onInstallCard={(slot, type, config, enabled) => handleInstallCard(selectedDevice.id, slot, type, config, enabled)}
              onUpdateCard={handleUpdateCard}
              onRemoveCard={handleRemoveCard}
            />
          ) : selected.kind === 'device' && selectedDevice ? (
            <DeviceDetail device={selectedDevice} onBack={() => setSelected({ kind: 'devices' })} />
          ) : selected.kind === 'devices' ? (
            devices.length === 0 ? (
              <EmptyState title="DEVICES" description="No devices added.">
                {canEditDeleteSchema && <ActionButton label="Add Device" permission={PERMISSIONS.DEVICE_CREATE} onPress={() => setAddDeviceVisible(true)} />}
              </EmptyState>
            ) : (
              <View className="flex-1">
                {/* Extra clearance when the sidebar is collapsed — the floating
                    Hierarchy/Devices toggle then sits right over this corner. */}
                <View className="flex-row items-center justify-between px-6 pt-5" style={leftCollapsed ? { paddingTop: 56 } : undefined}>
                  <Text className={cn('font-body-bold text-lg', isDark ? 'text-ink' : 'text-ink-inverse')}>Devices</Text>
                  {canEditDeleteSchema && <ActionButton label="Add Device" permission={PERMISSIONS.DEVICE_CREATE} onPress={() => setAddDeviceVisible(true)} />}
                </View>
                <DevicesTable
                  devices={devices}
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
        onCancel={() => {
          setAddDeviceVisible(false);
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
