import { Pressable, ScrollView, Text, View } from 'react-native';

import { useAppTheme } from '../../../hooks/useAppTheme';
import { cn } from '../../../lib/cn';
import type { MachineComponent } from '../../../lib/machines';
import { ComponentTypeIcon } from './machineIcons';

type MachineCanvasProps = {
  components: MachineComponent[];
  selectedId: string | null;
  onSelect: (component: MachineComponent) => void;
};

function ComponentBox({
  component,
  selected,
  onPress,
}: {
  component: MachineComponent;
  selected: boolean;
  onPress: () => void;
}) {
  const { isDark } = useAppTheme();
  const iconColor = selected ? (isDark ? '#0A0A0A' : '#F5F5F5') : isDark ? '#F5F5F5' : '#0A0A0A';

  return (
    <Pressable
      onPress={onPress}
      className={cn(
        'w-32 items-center gap-2 rounded-xl border px-3 py-4',
        selected
          ? isDark
            ? 'border-ink bg-ink'
            : 'border-ink-inverse bg-ink-inverse'
          : isDark
            ? 'border-line-dark bg-surface-darkpanel'
            : 'border-line-light bg-surface-lightpanel',
      )}
    >
      <ComponentTypeIcon type={component.type} color={iconColor} size={24} />
      <Text
        numberOfLines={1}
        className={cn(
          'font-body-medium text-xs',
          selected ? (isDark ? 'text-ink-inverse' : 'text-ink') : isDark ? 'text-ink' : 'text-ink-inverse',
        )}
      >
        {component.label}
      </Text>
      {component.points.length > 0 && (
        <Text
          className={cn(
            'font-body text-[10px]',
            selected ? (isDark ? 'text-ink-inverse' : 'text-ink') : isDark ? 'text-ink-muted' : 'text-ink-inverse-muted',
          )}
        >
          {component.points.length} point{component.points.length === 1 ? '' : 's'}
        </Text>
      )}
    </Pressable>
  );
}

function Connector() {
  const { isDark } = useAppTheme();
  return <View className={cn('h-px w-8', isDark ? 'bg-line-dark' : 'bg-line-light')} />;
}

export function MachineCanvas({ components, selectedId, onSelect }: MachineCanvasProps) {
  const { isDark } = useAppTheme();

  if (components.length === 0) {
    return (
      <View className="flex-1 items-center justify-center p-10">
        <Text className={cn('font-body text-sm', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
          This is a custom machine — component placement is coming in a later step.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView horizontal contentContainerClassName="flex-1 items-center justify-center px-10 py-10">
      <View className="flex-row items-center">
        {components.map((component, index) => (
          <View key={component.id} className="flex-row items-center">
            {index > 0 && <Connector />}
            <ComponentBox component={component} selected={component.id === selectedId} onPress={() => onSelect(component)} />
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
