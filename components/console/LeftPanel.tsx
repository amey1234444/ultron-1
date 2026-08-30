import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';
import { cn } from '../../lib/cn';
import { racksForGateway, type DeviceNode } from '../../lib/devices';
import type { FolderNode, ProjectNode, SelectedNode } from '../../lib/hierarchy';
import type { MachineNode } from '../../lib/machines';
import { PERMISSIONS } from '../../lib/permissions';
import type { ContextMenuTarget } from './ContextMenu';
import { TreeNode } from './tree/TreeNode';

type LeftPanelProps = {
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  selected: SelectedNode;
  onSelect: (node: SelectedNode) => void;
  projects: ProjectNode[];
  folders: FolderNode[];
  machines: MachineNode[];
  devices?: DeviceNode[];
  onOpenMenu?: (x: number, y: number, target: ContextMenuTarget, canAddMachine: boolean) => void;
  onOpenDeviceMenu?: (x: number, y: number, deviceId: string) => void;
  onCreateProject?: () => void;
  canConfigure?: boolean;
  // Optional block pinned to the bottom of the sidebar (e.g. the web account
  // strip). Expo never passes it, so the shared tree stays untouched there.
  footer?: ReactNode;
};

function FolderBranch({
  folder,
  depth,
  folders,
  machines,
  selected,
  onSelect,
  onOpenMenu,
  canConfigure,
  collapsedIds,
  onToggleExpand,
}: {
  folder: FolderNode;
  depth: number;
  folders: FolderNode[];
  machines: MachineNode[];
  selected: SelectedNode;
  onSelect: (node: SelectedNode) => void;
  onOpenMenu: LeftPanelProps['onOpenMenu'];
  canConfigure: boolean;
  collapsedIds: Set<string>;
  onToggleExpand: (id: string) => void;
}) {
  const childFolders = folders.filter((f) => f.parentId === folder.id);
  const childMachines = machines.filter((m) => m.folderId === folder.id);
  const expanded = !collapsedIds.has(folder.id);

  return (
    <>
      <TreeNode
        label={folder.name}
        depth={depth}
        kind="folder"
        folderType={folder.type}
        hasChildren={childFolders.length > 0 || childMachines.length > 0}
        expanded={expanded}
        onToggleExpand={() => onToggleExpand(folder.id)}
        selected={selected.kind === 'folder' && selected.id === folder.id}
        onPress={() => onSelect({ kind: 'folder', id: folder.id })}
        onOpenMenu={canConfigure && onOpenMenu ? (x, y) => onOpenMenu(x, y, { kind: 'folder', id: folder.id, projectId: folder.projectId }, true) : undefined}
        testID={`tree-node:folder:${folder.id}`}
      />
      {expanded && (
        <>
          {childMachines.map((machine) => (
            <TreeNode
              key={machine.id}
              label={machine.name}
              depth={depth + 1}
              kind="machine"
              selected={selected.kind === 'machine' && selected.id === machine.id}
              onPress={() => onSelect({ kind: 'machine', id: machine.id })}
              onOpenMenu={
                canConfigure && onOpenMenu
                  ? (x, y) => onOpenMenu(x, y, { kind: 'machine', id: machine.id, folderId: machine.folderId, projectId: machine.projectId }, false)
                  : undefined
              }
              testID={`tree-node:machine:${machine.id}`}
            />
          ))}
          {childFolders.map((child) => (
            <FolderBranch
              key={child.id}
              folder={child}
              depth={depth + 1}
              folders={folders}
              machines={machines}
              selected={selected}
              onSelect={onSelect}
              onOpenMenu={onOpenMenu}
              canConfigure={canConfigure}
              collapsedIds={collapsedIds}
              onToggleExpand={onToggleExpand}
            />
          ))}
        </>
      )}
    </>
  );
}

function DeviceBranch({
  gateway,
  devices,
  selected,
  onSelect,
  onOpenDeviceMenu,
  canConfigure,
  collapsedIds,
  onToggleExpand,
}: {
  gateway: DeviceNode;
  devices: DeviceNode[];
  selected: SelectedNode;
  onSelect: (node: SelectedNode) => void;
  onOpenDeviceMenu?: (x: number, y: number, deviceId: string) => void;
  canConfigure: boolean;
  collapsedIds: Set<string>;
  onToggleExpand: (id: string) => void;
}) {
  const racks = racksForGateway(gateway, devices);
  const expanded = !collapsedIds.has(gateway.id);

  return (
    <>
      <TreeNode
        label={gateway.name}
        depth={0}
        kind="leaf"
        hasChildren={racks.length > 0}
        expanded={expanded}
        onToggleExpand={() => onToggleExpand(gateway.id)}
        selected={selected.kind === 'device' && selected.id === gateway.id}
        onPress={() => onSelect({ kind: 'device', id: gateway.id })}
        onOpenMenu={canConfigure && onOpenDeviceMenu ? (x, y) => onOpenDeviceMenu(x, y, gateway.id) : undefined}
        testID={`tree-node:device:${gateway.id}`}
      />
      {expanded &&
        racks.map((rack) => (
          <TreeNode
            key={rack.id}
            label={rack.name}
            depth={1}
            kind="leaf"
            selected={selected.kind === 'device' && selected.id === rack.id}
            onPress={() => onSelect({ kind: 'device', id: rack.id })}
            onOpenMenu={canConfigure && onOpenDeviceMenu ? (x, y) => onOpenDeviceMenu(x, y, rack.id) : undefined}
            testID={`tree-node:device:${rack.id}`}
          />
        ))}
    </>
  );
}

/**
 * Where each tree was last scrolled to.
 *
 * Deliberately module-level rather than component state, and deliberately not
 * lifted into the console screen either. The panel does not stay mounted: open
 * a machine and the workspace takes the full width, which unmounts the sidebar
 * outright (see `showSidebar` in app/index.tsx). Any state inside this
 * component — or any ref inside its parent's render tree — dies with it, so
 * coming back from a machine always dropped the engineer at the top of a tree
 * they may have scrolled a long way down. A plant hierarchy is hundreds of rows
 * on a real site, and re-finding your place in it after every machine visit is
 * the kind of small tax that makes a console feel hostile.
 *
 * Keyed by tree, because the hierarchy and the devices list are different
 * lengths and restoring one's offset onto the other would be worse than not
 * restoring at all. Session-lived on purpose: a fresh page load should start at
 * the top.
 */
const scrollMemory: Record<'hierarchy' | 'devices', number> = { hierarchy: 0, devices: 0 };

export function LeftPanel({
  collapsed,
  onCollapsedChange,
  selected,
  onSelect,
  projects,
  folders,
  machines,
  devices = [],
  onOpenMenu,
  onOpenDeviceMenu,
  onCreateProject,
  canConfigure = false,
  footer,
}: LeftPanelProps) {
  const { isDark } = useAppTheme();
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const gateways = devices.filter((d) => d.type === 'Gateway' && !d.archived);

  const toggleExpand = (id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Which tree the panel shows follows the selection the top-bar view switcher
  // sets — the panel no longer carries a switcher of its own.
  // Simulation Mode is reached from (and returns to) Devices, so the rail stays
  // on the devices tree while it is open.
  const activeTab: 'hierarchy' | 'devices' =
    selected.kind === 'devices' || selected.kind === 'device' || selected.kind === 'simulation' ? 'devices' : 'hierarchy';
  const lineClass = isDark ? 'border-line-dark' : 'border-line-light';

  const scrollRef = useRef<ScrollView>(null);
  const restoredRef = useRef(false);

  // Each tree restores its own offset once, on the first layout pass that has
  // content in it. Switching trees re-arms the restore for the new one.
  useEffect(() => {
    restoredRef.current = false;
  }, [activeTab]);

  const restoreScroll = useCallback(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    const y = scrollMemory[activeTab];
    if (y > 0) scrollRef.current?.scrollTo({ y, animated: false });
  }, [activeTab]);

  return (
    <>
      {collapsed ? (
        <Pressable
          onPress={() => onCollapsedChange(false)}
          className={cn('w-3 border-r', lineClass)}
          accessibilityRole="button"
          accessibilityLabel="Open sidebar"
        />
      ) : (
        <View
          className={cn('w-64 border-r', isDark ? 'border-line-dark bg-surface-dark' : 'border-line-light bg-surface-light')}
        >
          <ScrollView
            ref={scrollRef}
            className="flex-1"
            contentContainerStyle={{ paddingTop: 12, paddingBottom: 16 }}
            showsVerticalScrollIndicator={false}
            scrollEventThrottle={16}
            onScroll={(event) => {
              scrollMemory[activeTab] = event.nativeEvent.contentOffset.y;
            }}
            onContentSizeChange={restoreScroll}
          >
          {activeTab === 'hierarchy' && (
            <View className="mb-5">
              {canConfigure && onCreateProject ? (
                <View className="mb-1 flex-row items-center justify-between px-3 py-1">
                  <Text className={cn('font-mono text-[9px] uppercase tracking-[0.18em]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
                    Hierarchy
                  </Text>
                  <Pressable
                    onPress={onCreateProject}
                    testID={`permission:${PERMISSIONS.PROJECT_CREATE}`}
                    accessibilityRole="button"
                    accessibilityLabel="Create project"
                    className="h-5 w-5 items-center justify-center rounded"
                  >
                    <Text className={cn('font-body-medium text-sm leading-none', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>+</Text>
                  </Pressable>
                </View>
              ) : null}

              {projects.length === 0 ? (
                <Text className={cn('px-3 font-body text-xs italic', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
                  No project yet
                </Text>
              ) : (
                projects.map((project) => {
                  const rootFolders = folders.filter((f) => f.projectId === project.id && f.parentId === null);
                  const expanded = !collapsedIds.has(project.id);
                  return (
                    <View key={project.id}>
                      <TreeNode
                        label={project.name}
                        depth={0}
                        kind="project"
                        hasChildren={rootFolders.length > 0}
                        expanded={expanded}
                        onToggleExpand={() => toggleExpand(project.id)}
                        selected={selected.kind === 'project' && selected.id === project.id}
                        onPress={() => onSelect({ kind: 'project', id: project.id })}
                        onOpenMenu={canConfigure && onOpenMenu ? (x, y) => onOpenMenu(x, y, { kind: 'project', id: project.id }, false) : undefined}
                        testID={`tree-node:project:${project.id}`}
                      />
                      {expanded &&
                        rootFolders.map((folder) => (
                          <FolderBranch
                            key={folder.id}
                            folder={folder}
                            depth={1}
                            folders={folders}
                            machines={machines}
                            selected={selected}
                            onSelect={onSelect}
                            onOpenMenu={onOpenMenu}
                            canConfigure={canConfigure}
                            collapsedIds={collapsedIds}
                            onToggleExpand={toggleExpand}
                          />
                        ))}
                    </View>
                  );
                })
              )}
            </View>
          )}
          {activeTab === 'devices' && (
            <View className="mb-5">
              <View className="mb-1 px-3 py-1">
                <Text className={cn('font-mono text-[9px] uppercase tracking-[0.18em]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
                  Devices
                </Text>
              </View>

              {gateways.length === 0 ? (
                <Text className={cn('px-3 font-body text-xs italic', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
                  No gateway yet
                </Text>
              ) : (
                gateways.map((gateway) => (
                  <DeviceBranch
                    key={gateway.id}
                    gateway={gateway}
                    devices={devices}
                    selected={selected}
                    onSelect={onSelect}
                    onOpenDeviceMenu={onOpenDeviceMenu}
                    canConfigure={canConfigure}
                    collapsedIds={collapsedIds}
                    onToggleExpand={toggleExpand}
                  />
                ))
              )}
            </View>
          )}
          </ScrollView>

          {/* The global Real/Demo toggle used to live here. It is gone: there is
              no longer an app-wide mode. Whether a device is physical or
              simulated is a property of that device, chosen when it is created,
              and its data is treated as real either way. */}
          {footer ? (
            <View className={cn('border-t', isDark ? 'border-line-dark' : 'border-line-light')}>{footer}</View>
          ) : null}
        </View>
      )}
    </>
  );
}
