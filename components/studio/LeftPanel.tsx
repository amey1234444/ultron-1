import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';
import { cn } from '../../lib/cn';
import type { FolderNode, ProjectNode, SelectedNode } from '../../lib/hierarchy';
import type { MachineNode } from '../../lib/machines';
import { PERMISSIONS } from '../../lib/permissions';
import type { ContextMenuTarget } from './ContextMenu';
import { SectionLabel } from './SectionLabel';
import { TreeNode } from './tree/TreeNode';

type LeftPanelProps = {
  collapsed: boolean;
  // Lets the Hierarchy/Devices toggle drive the panel's own collapse state:
  // picking Devices collapses the tree out of the way (there's nothing to
  // browse under it), picking Hierarchy brings the panel back.
  onCollapsedChange: (collapsed: boolean) => void;
  selected: SelectedNode;
  onSelect: (node: SelectedNode) => void;
  projects: ProjectNode[];
  folders: FolderNode[];
  machines: MachineNode[];
  onOpenMenu: (x: number, y: number, target: ContextMenuTarget, canAddMachine: boolean) => void;
  onCreateProject: () => void;
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
        onOpenMenu={(x, y) => onOpenMenu(x, y, { kind: 'folder', id: folder.id, projectId: folder.projectId }, true)}
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
              collapsedIds={collapsedIds}
              onToggleExpand={onToggleExpand}
            />
          ))}
        </>
      )}
    </>
  );
}

export function LeftPanel({
  collapsed,
  onCollapsedChange,
  selected,
  onSelect,
  projects,
  folders,
  machines,
  onOpenMenu,
  onCreateProject,
  footer,
}: LeftPanelProps) {
  const { isDark } = useAppTheme();
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const firstProjectId = projects[0]?.id;
  const activeTab: 'hierarchy' | 'devices' = selected.kind === 'devices' || selected.kind === 'device' ? 'devices' : 'hierarchy';
  const lineClass = isDark ? 'border-line-dark' : 'border-line-light';

  const goHierarchy = () => {
    onSelect(firstProjectId ? { kind: 'project', id: firstProjectId } : { kind: 'none' });
    onCollapsedChange(false);
  };
  const goDevices = () => {
    onSelect({ kind: 'devices' });
    onCollapsedChange(true);
  };

  return (
    <>
      {/* Floats above the collapsible tree, in the same spot whether the panel
          is expanded or collapsed — picking Devices collapses the (now empty)
          tree area out of the way without losing the way back to Hierarchy. */}
      <View pointerEvents="box-none" className="absolute left-3 top-4 flex-row items-center gap-2" style={{ zIndex: 20 }}>
        <View className={cn('flex-row rounded-full border p-0.5', lineClass, isDark ? 'bg-surface-dark' : 'bg-surface-light')}>
          <Pressable
            onPress={goHierarchy}
            className={cn('rounded-full px-2.5 py-1', activeTab === 'hierarchy' && (isDark ? 'bg-surface-darkpanel' : 'bg-surface-lightpanel'))}
          >
            <SectionLabel active={activeTab === 'hierarchy'}>Hierarchy</SectionLabel>
          </Pressable>
          <Pressable
            onPress={goDevices}
            className={cn('rounded-full px-2.5 py-1', activeTab === 'devices' && (isDark ? 'bg-surface-darkpanel' : 'bg-surface-lightpanel'))}
          >
            <SectionLabel active={activeTab === 'devices'}>Devices</SectionLabel>
          </Pressable>
        </View>
        {!collapsed && activeTab === 'hierarchy' && (
          <Pressable
            onPress={onCreateProject}
            testID={`permission:${PERMISSIONS.PROJECT_CREATE}`}
            className={cn('h-4 w-4 items-center justify-center rounded', isDark ? 'bg-surface-darkpanel' : 'bg-surface-lightpanel')}
          >
            <Text className={cn('font-body-medium text-xs leading-none', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>+</Text>
          </Pressable>
        )}
      </View>

      {collapsed ? (
        <View className={cn('w-0 border-r', lineClass)} />
      ) : (
        <View
          className={cn('w-64 border-r', isDark ? 'border-line-dark bg-surface-dark' : 'border-line-light bg-surface-light')}
        >
          <ScrollView
            className="flex-1"
            contentContainerStyle={{ paddingTop: 56, paddingBottom: 16 }}
            showsVerticalScrollIndicator={false}
          >
          {activeTab === 'hierarchy' && (
            <View className="mb-5">
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
                        onOpenMenu={(x, y) => onOpenMenu(x, y, { kind: 'project', id: project.id }, false)}
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
          </ScrollView>

          {footer ? (
            <View className={cn('border-t', isDark ? 'border-line-dark' : 'border-line-light')}>{footer}</View>
          ) : null}
        </View>
      )}
    </>
  );
}
