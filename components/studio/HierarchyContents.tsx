import { Pressable, ScrollView, Text, View } from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';
import { cn } from '../../lib/cn';
import type { FolderNode } from '../../lib/hierarchy';
import type { MachineNode } from '../../lib/machines';
import { PERMISSIONS } from '../../lib/permissions';
import { ActionButton } from './ActionButton';
import { MachineTemplateIcon } from './machine/machineIcons';
import { FolderTypeIcon } from './tree/FolderTypeIcon';

type HierarchyContentsProps = {
  title: string;
  breadcrumb: string;
  childFolders: FolderNode[];
  childMachines: MachineNode[];
  folders: FolderNode[];
  machines: MachineNode[];
  onOpenFolder: (id: string) => void;
  onOpenMachine: (id: string) => void;
  onAddFolder: () => void;
  onAddMachine?: () => void;
  topPad?: boolean;
};

function AssetCard({
  icon,
  name,
  subtitle,
  onPress,
}: {
  icon: React.ReactNode;
  name: string;
  subtitle: string;
  onPress: () => void;
}) {
  const { isDark } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      className={cn(
        'flex-row items-center gap-3 rounded-xl border px-3.5 py-3',
        isDark ? 'border-line-dark bg-surface-darkpanel' : 'border-line-light bg-surface-lightpanel',
      )}
      style={{ width: 240 }}
    >
      <View
        className={cn('h-9 w-9 items-center justify-center rounded-lg', isDark ? 'bg-white/5' : 'bg-black/5')}
      >
        {icon}
      </View>
      <View className="flex-1">
        <Text numberOfLines={1} className={cn('font-body-medium text-sm', isDark ? 'text-ink' : 'text-ink-inverse')}>
          {name}
        </Text>
        <Text numberOfLines={1} className={cn('font-body text-[11px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
          {subtitle}
        </Text>
      </View>
    </Pressable>
  );
}

// Right-hand content for a selected project or folder: a compact toolbar (title +
// breadcrumb on the left, Add Folder / Add Machine on the right) over a grid of
// the level's child folders and machines — so a level's assets are browsable
// straight from the workspace, not just the hierarchy tree.
export function HierarchyContents({
  title,
  breadcrumb,
  childFolders,
  childMachines,
  folders,
  machines,
  onOpenFolder,
  onOpenMachine,
  onAddFolder,
  onAddMachine,
  topPad,
}: HierarchyContentsProps) {
  const { isDark } = useAppTheme();
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const iconColour = isDark ? '#C9D1D9' : '#57606A';
  const sectionClass = cn('font-body-medium text-[11px] uppercase tracking-wider', mutedClass);
  const isEmpty = childFolders.length === 0 && childMachines.length === 0;

  const folderSubtitle = (folder: FolderNode) => {
    const subCount = folders.filter((f) => f.parentId === folder.id).length;
    const machineCount = machines.filter((m) => m.folderId === folder.id).length;
    const parts: string[] = [folder.type];
    if (subCount > 0) parts.push(`${subCount} folder${subCount > 1 ? 's' : ''}`);
    if (machineCount > 0) parts.push(`${machineCount} machine${machineCount > 1 ? 's' : ''}`);
    return parts.join(' · ');
  };

  return (
    <View className="flex-1">
      <View
        className="flex-row items-start justify-between gap-3 px-6 pb-3 pt-5"
        style={topPad ? { paddingTop: 56 } : undefined}
      >
        <View className="flex-1 gap-1">
          {breadcrumb ? <Text numberOfLines={1} className={cn('font-body text-xs', mutedClass)}>{breadcrumb}</Text> : null}
          <Text numberOfLines={1} className={cn('font-body-bold text-lg tracking-tight', isDark ? 'text-ink' : 'text-ink-inverse')}>
            {title}
          </Text>
        </View>
        <View className="flex-row gap-2">
          <ActionButton
            label="Add Folder"
            variant="secondary"
            permission={PERMISSIONS.HIERARCHY_FOLDER_CREATE}
            onPress={onAddFolder}
          />
          <ActionButton
            label="Add Machine"
            permission={PERMISSIONS.MACHINE_CREATE}
            disabled={!onAddMachine}
            onPress={onAddMachine}
          />
        </View>
      </View>

      {isEmpty ? (
        <View className="px-6 py-4">
          <Text className={cn('font-body text-sm', mutedClass)}>
            This level is empty — use Add Folder or Add Machine to get started.
          </Text>
        </View>
      ) : (
        <ScrollView className="flex-1" contentContainerStyle={{ padding: 24, paddingTop: 4, gap: 20 }}>
          {childFolders.length > 0 && (
            <View className="gap-3">
              <Text className={sectionClass}>Folders</Text>
              <View className="flex-row flex-wrap gap-3">
                {childFolders.map((folder) => (
                  <AssetCard
                    key={folder.id}
                    icon={<FolderTypeIcon type={folder.type} color={iconColour} size={18} />}
                    name={folder.name}
                    subtitle={folderSubtitle(folder)}
                    onPress={() => onOpenFolder(folder.id)}
                  />
                ))}
              </View>
            </View>
          )}
          {childMachines.length > 0 && (
            <View className="gap-3">
              <Text className={sectionClass}>Machines</Text>
              <View className="flex-row flex-wrap gap-3">
                {childMachines.map((machine) => (
                  <AssetCard
                    key={machine.id}
                    icon={<MachineTemplateIcon template={machine.template} color={iconColour} size={18} />}
                    name={machine.name}
                    subtitle={machine.template}
                    onPress={() => onOpenMachine(machine.id)}
                  />
                ))}
              </View>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}
