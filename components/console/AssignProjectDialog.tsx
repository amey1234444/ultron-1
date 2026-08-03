import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';
import { cn } from '../../lib/cn';
import type { ProjectNode } from '../../lib/hierarchy';
import { ActionButton } from './ActionButton';
import { Dialog } from './Dialog';

type AssignProjectDialogProps = {
  visible: boolean;
  deviceName: string;
  projects: ProjectNode[];
  onCancel: () => void;
  onAssign: (projectId: string) => void;
};

export function AssignProjectDialog({ visible, deviceName, projects, onCancel, onAssign }: AssignProjectDialogProps) {
  const { isDark } = useAppTheme();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (visible) setSelectedId(null);
  }, [visible]);

  return (
    <Dialog
      visible={visible}
      title="Assign to Project"
      onRequestClose={onCancel}
      footer={
        <>
          <ActionButton label="Cancel" variant="secondary" onPress={onCancel} />
          <ActionButton label="Assign" onPress={() => selectedId && onAssign(selectedId)} disabled={!selectedId} />
        </>
      }
    >
      <Text className={cn('font-body text-sm', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
        Assign "{deviceName}" to:
      </Text>
      {projects.length === 0 ? (
        <Text className={cn('font-body text-sm italic', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
          No projects yet — create one first.
        </Text>
      ) : (
        <View className="gap-1">
          {projects.map((p) => (
            <Pressable
              key={p.id}
              onPress={() => setSelectedId(p.id)}
              className={cn('rounded-lg px-3 py-2', selectedId === p.id && (isDark ? 'bg-surface-dark' : 'bg-surface-light'))}
            >
              <Text
                className={cn(
                  'font-body-medium text-sm',
                  selectedId === p.id ? (isDark ? 'text-ink' : 'text-ink-inverse') : isDark ? 'text-ink-muted' : 'text-ink-inverse-muted',
                )}
              >
                {p.name}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </Dialog>
  );
}
