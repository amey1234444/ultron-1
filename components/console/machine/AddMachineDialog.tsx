import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useAppTheme } from '../../../hooks/useAppTheme';
import { cn } from '../../../lib/cn';
import { MACHINE_TEMPLATES, type MachineTemplate } from '../../../lib/machines';
import { templateHasVariants, variantsForTemplate } from '../../../lib/machineVariants';
import { PERMISSIONS } from '../../../lib/permissions';
import { ActionButton } from '../ActionButton';
import { Dialog } from '../Dialog';
import { FormField } from '../FormField';
import { SelectField } from '../SelectField';
import { MachineTemplateIcon } from './machineIcons';

export type NewMachine = {
  name: string;
  template: MachineTemplate;
  /**
   * Which variant of the template. Null for templates that offer no choice.
   *
   * Never defaulted to the template's first variant, even when there is only
   * one. A variant is a machine-specific fact, and the whole discipline the
   * knowledge layer is built on is that such a fact is declared by a person and
   * traceable to them, not filled in by the software because there happened to
   * be a single option. One tap is a small price for a stored value that means
   * somebody looked.
   */
  variantId: string | null;
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
  const [variantId, setVariantId] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setName('');
      setTemplate(null);
      setVariantId(null);
    }
  }, [visible]);

  const variants = variantsForTemplate(template);
  const needsVariant = templateHasVariants(template);

  // Switching template clears the variant rather than keeping a stale one: a
  // variant belongs to exactly one template, so a value carried across would be
  // discarded on save anyway and would meanwhile show as a valid selection.
  const selectTemplate = (next: MachineTemplate) => {
    setTemplate(next);
    setVariantId(null);
  };

  const canCreate = name.trim().length > 0 && template !== null && (!needsVariant || variantId !== null);

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
            onPress={() =>
              template && onCreate({ name: name.trim(), template, variantId: needsVariant ? variantId : null })
            }
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
            <TemplateCard key={t} template={t} selected={template === t} onPress={() => selectTemplate(t)} />
          ))}
        </View>
      </View>

      {/*
        Shown only for templates that declare variants, so every other template
        keeps the dialog it had. Today that is the twin-screw extruder alone.
      */}
      {needsVariant ? (
        <SelectField
          label="Variant"
          required
          placeholder="Select the variant this machine is"
          value={variantId}
          onChange={setVariantId}
          options={variants.map((variant) => ({
            value: variant.variantId,
            label: variant.name,
            description: variant.summary,
            tag: variant.variantId,
          }))}
          hint="The variant decides which process knowledge applies. It is not inferred from the template, so it has to be chosen."
        />
      ) : null}
    </Dialog>
  );
}
