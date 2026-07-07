import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';
import { cn } from '../../lib/cn';
import { folderSubtreeIds, type FolderNode, type ProjectNode } from '../../lib/hierarchy';
import { ActionButton } from './ActionButton';
import { Dialog } from './Dialog';

type MoveDialogProps = {
  visible: boolean;
  folderId: string;
  project: ProjectNode | undefined;
  folders: FolderNode[];
  onCancel: () => void;
  onMove: (newParentId: string | null) => void;
};

export function MoveDialog({ visible, folderId, project, folders, onCancel, onMove }: MoveDialogProps) {
  const { isDark } = useAppTheme();
  const [destination, setDestination] = useState<string | null>(null);

  const folder = folders.find((f) => f.id === folderId);
  const blocked = folderSubtreeIds(folders, folderId);
  const options = folders.filter((f) => f.projectId === folder?.projectId && !blocked.has(f.id));

  useEffect(() => {
    if (visible) setDestination(null);
  }, [visible]);

  const isCurrentLocation = destination === (folder?.parentId ?? null);

  return (
    <Dialog
      visible={visible}
      title="Move Folder"
      onRequestClose={onCancel}
      footer={
        <>
          <ActionButton label="Cancel" variant="secondary" onPress={onCancel} />
          <ActionButton label="Move" onPress={() => onMove(destination)} disabled={isCurrentLocation} />
        </>
      }
    >
      <Text className={cn('font-body-medium text-xs', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
        Destination
      </Text>
      <View className="max-h-64 gap-1">
        <DestinationRow
          label={project?.name ?? 'Project root'}
          selected={destination === null}
          onPress={() => setDestination(null)}
        />
        {options.map((f) => (
          <DestinationRow key={f.id} label={f.name} selected={destination === f.id} onPress={() => setDestination(f.id)} />
        ))}
      </View>
    </Dialog>
  );
}

function DestinationRow({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const { isDark } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      className={cn('rounded-lg px-3 py-2', selected && (isDark ? 'bg-surface-dark' : 'bg-surface-light'))}
    >
      <Text className={cn('font-body-medium text-sm', selected ? (isDark ? 'text-ink' : 'text-ink-inverse') : isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
        {label}
      </Text>
    </Pressable>
  );
}
