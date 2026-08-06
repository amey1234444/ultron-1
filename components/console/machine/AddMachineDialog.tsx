import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useAppTheme } from '../../../hooks/useAppTheme';
import { cn } from '../../../lib/cn';
import { MACHINE_TEMPLATES, type MachineTemplate } from '../../../lib/machines';
import { PERMISSIONS } from '../../../lib/permissions';
import { ActionButton } from '../ActionButton';
import { Dialog } from '../Dialog';
import { FormField } from '../FormField';
import { MachineTemplateIcon } from './machineIcons';

export type NewMachine = {
  name: string;
  template: MachineTemplate;
};

type AddMachineDialogProps = {
  visible: boolean;
  parentLabel: string;
  onCancel: () => void;
  onCreate: (machine: NewMachine) => void;
};

function TemplateCard({ template, selected, onPress }: { template: MachineTemplate; selected: boolean; onPress: () => void }) {
  const { isDark } = useAppTheme();
  const color = selected ? (isDark ? '#0A0A0A' : '#F5F5F5') : isDark ? '#A1A3A0' : '#5F625F';

  return (
    <Pressable
      onPress={onPress}
      style={{ width: '48%' }}
      className={cn(
        'items-center gap-2 rounded-xl border py-4',
        selected ? (isDark ? 'border-ink bg-ink' : 'border-ink-inverse bg-ink-inverse') : isDark ? 'border-line-dark' : 'border-line-light',
      )}
    >
      <MachineTemplateIcon template={template} color={color} size={22} />
      <Text
        numberOfLines={1}
        className={cn(
          'font-body-medium text-xs',
          selected ? (isDark ? 'text-ink-inverse' : 'text-ink') : isDark ? 'text-ink-muted' : 'text-ink-inverse-muted',
        )}
      >
        {template}
      </Text>
    </Pressable>
  );
}

export function AddMachineDialog({ visible, parentLabel, onCancel, onCreate }: AddMachineDialogProps) {
  const { isDark } = useAppTheme();
  const [name, setName] = useState('');
  const [template, setTemplate] = useState<MachineTemplate | null>(null);

  useEffect(() => {
    if (visible) {
      setName('');
      setTemplate(null);
    }
  }, [visible]);

  const canCreate = name.trim().length > 0 && template !== null;

  return (
    <Dialog
      visible={visible}
      title="Add Machine"
      onRequestClose={onCancel}
      footer={
        <>
          <ActionButton label="Cancel" variant="secondary" onPress={onCancel} />
          <ActionButton
            label="Create Machine"
            permission={PERMISSIONS.MACHINE_CREATE}
            disabled={!canCreate}
            onPress={() => template && onCreate({ name: name.trim(), template })}
          />
        </>
      }
    >
      <Text className={cn('font-body text-xs', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>{parentLabel}</Text>

      <FormField label="Machine Name" required value={name} onChangeText={setName} placeholder="e.g. Cooling Water Pump 01" />

      <View className="gap-1.5">
        <Text className={cn('font-body-medium text-xs', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>Template *</Text>
        <View className="flex-row flex-wrap justify-between gap-y-2">
          {MACHINE_TEMPLATES.map((t) => (
            <TemplateCard key={t} template={t} selected={template === t} onPress={() => setTemplate(t)} />
          ))}
        </View>
      </View>
    </Dialog>
  );
}
