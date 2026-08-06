import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { FOLDER_TYPES, type FolderType } from '../../lib/hierarchy';
import { PERMISSIONS } from '../../lib/permissions';
import { useAppTheme } from '../../hooks/useAppTheme';
import { cn } from '../../lib/cn';
import { ActionButton } from './ActionButton';
import { Dialog } from './Dialog';
import { FormField } from './FormField';
import { FolderTypeIcon } from './tree/FolderTypeIcon';

export type NewFolder = {
  name: string;
  type: FolderType;
  code: string;
  description: string;
};

type CreateFolderDialogProps = {
  visible: boolean;
  parentLabel: string;
  onCancel: () => void;
  onCreate: (folder: NewFolder) => void;
};

function TypeChip({ label, selected, onPress }: { label: FolderType; selected: boolean; onPress: () => void }) {
  const { isDark } = useAppTheme();
  const iconColor = selected ? (isDark ? '#0A0A0A' : '#F5F5F5') : isDark ? '#A1A3A0' : '#5F625F';

  return (
    <Pressable
      onPress={onPress}
      className={cn(
        'flex-row items-center gap-1.5 rounded-full border px-3 py-1.5',
        selected
          ? isDark
            ? 'border-ink bg-ink'
            : 'border-ink-inverse bg-ink-inverse'
          : isDark
            ? 'border-line-dark'
            : 'border-line-light',
      )}
    >
      <FolderTypeIcon type={label} color={iconColor} />
      <Text
        className={cn(
          'font-body-medium text-xs',
          selected ? (isDark ? 'text-ink-inverse' : 'text-ink') : isDark ? 'text-ink-muted' : 'text-ink-inverse-muted',
        )}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function CreateFolderDialog({ visible, parentLabel, onCancel, onCreate }: CreateFolderDialogProps) {
  const { isDark } = useAppTheme();
  const [name, setName] = useState('');
  const [type, setType] = useState<FolderType | null>(null);
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');

  // Dialog is remounted-in-place (not unmounted) between opens, so reset on each open.
  useEffect(() => {
    if (visible) {
      setName('');
      setType(null);
      setCode('');
      setDescription('');
    }
  }, [visible]);

  const canCreate = name.trim().length > 0 && type !== null;

  const handleCreate = () => {
    if (!canCreate || !type) return;
    onCreate({ name: name.trim(), type, code: code.trim(), description: description.trim() });
  };

  return (
    <Dialog
      visible={visible}
      title="Create Folder"
      onRequestClose={onCancel}
      footer={
        <>
          <ActionButton label="Cancel" variant="secondary" onPress={onCancel} />
          <ActionButton
            label="Create"
            permission={PERMISSIONS.HIERARCHY_FOLDER_CREATE}
            onPress={handleCreate}
            disabled={!canCreate}
          />
        </>
      }
    >
      <FormField label="Folder Name" required value={name} onChangeText={setName} placeholder="e.g. Pump House" />

      <View className="gap-1.5">
        <Text className={cn('font-body-medium text-xs', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
          Folder Type *
        </Text>
        <View className="flex-row flex-wrap gap-2">
          {FOLDER_TYPES.map((t) => (
            <TypeChip key={t} label={t} selected={type === t} onPress={() => setType(t)} />
          ))}
        </View>
      </View>

      <View className="gap-1.5">
        <Text className={cn('font-body-medium text-xs', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
          Parent Location
        </Text>
        <Text className={cn('font-body text-sm', isDark ? 'text-ink' : 'text-ink-inverse')}>{parentLabel}</Text>
      </View>

      <FormField label="Folder Code" value={code} onChangeText={setCode} placeholder="Optional" />
      <FormField label="Description" value={description} onChangeText={setDescription} placeholder="Optional" multiline />
    </Dialog>
  );
}
