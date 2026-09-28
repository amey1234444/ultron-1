import { useEffect, useMemo, useState } from 'react';
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
import { connectorsForTemplate } from './machineConnectors';

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

/**
 * Which part of the plant a template belongs to.
 *
 * Twenty-five templates in one alphabetical-ish grid is a wall: an operator
 * adding a hammer mill has to read every name to find it, and the ones they
 * will never use in an oilseed plant sit between the ones they will. Grouped
 * by where the machine actually stands in the process, the list is scanned by
 * remembering what the machine does rather than what it is called.
 *
 * Exhaustive by construction — `Record<MachineTemplate, ...>` means a new
 * template will not compile until somebody says where it goes, which is the
 * point. `check:add-machine` asserts every group is non-empty as well, so a
 * rename cannot leave an empty heading behind.
 */
const TEMPLATE_FAMILY: Record<MachineTemplate, string> = {
  'Seed Dryer Cooler': 'Preparation',
  'Cracking Mill M-101': 'Preparation',
  'Conditioner E-102': 'Preparation',
  'Flaking Mill M-102': 'Preparation',
  'Expander X-101': 'Preparation',
  'Collet Cooler': 'Preparation',
  'Solvent Extractor': 'Extraction',
  DTDC: 'Extraction',
  'Miscella Distillation': 'Oil & Solvent Recovery',
  'Solvent Recovery': 'Oil & Solvent Recovery',
  'Hammer Mill': 'Meal Handling',
  'Meal Sifter': 'Meal Handling',
  'Meal Conveying & Storage': 'Meal Handling',
  'Auto Bagger & Stitcher': 'Meal Handling',
  'Single Screw Extruder': 'Extrusion & Feeding',
  'Twin Screw Extruder': 'Extrusion & Feeding',
  'Rotary Airlock Valve': 'Extrusion & Feeding',
  'Centrifugal Pump': 'Rotating Equipment',
  Motor: 'Rotating Equipment',
  'Pump and Motor Train': 'Rotating Equipment',
  Gearbox: 'Rotating Equipment',
  Fan: 'Rotating Equipment',
  Compressor: 'Rotating Equipment',
  Turbine: 'Rotating Equipment',
  'Custom Machine': 'Other',
};

/** Reading order down the process, not alphabetical. */
export const TEMPLATE_FAMILY_ORDER = [
  'Preparation',
  'Extraction',
  'Oil & Solvent Recovery',
  'Meal Handling',
  'Extrusion & Feeding',
  'Rotating Equipment',
  'Other',
] as const;

function TemplateCard({
  template,
  selected,
  points,
  onPress,
}: {
  template: MachineTemplate;
  selected: boolean;
  points: number;
  onPress: () => void;
}) {
  const { isDark } = useAppTheme();
  const color = selected ? (isDark ? '#0A0A0A' : '#F5F5F5') : isDark ? '#A1A3A0' : '#5F625F';

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      // The pad count is on the card because it is the difference between the
      // templates. Picking one with no instrument points gives a machine with
      // a drawing and nothing to wire, and finding that out after creating it
      // means deleting it again.
      accessibilityLabel={`${template}, ${points === 0 ? 'no instrument points' : `${points} instrument points`}`}
      style={{ width: '48%' }}
      className={cn(
        'gap-1.5 rounded-xl border px-3 py-3',
        selected ? (isDark ? 'border-ink bg-ink' : 'border-ink-inverse bg-ink-inverse') : isDark ? 'border-line-dark' : 'border-line-light',
      )}
    >
      <View className="flex-row items-center gap-2">
        <MachineTemplateIcon template={template} color={color} size={20} />
        <Text
          numberOfLines={2}
          className={cn(
            'flex-1 font-body-medium text-xs',
            selected ? (isDark ? 'text-ink-inverse' : 'text-ink') : isDark ? 'text-ink-muted' : 'text-ink-inverse-muted',
          )}
        >
          {template}
        </Text>
      </View>
      <Text
        className={cn(
          'font-mono text-[10px] tracking-wide',
          selected
            ? (isDark ? 'text-ink-inverse/70' : 'text-ink/70')
            : points === 0
              ? (isDark ? 'text-ink-faint' : 'text-ink-inverse-muted')
              : 'text-accent',
        )}
      >
        {points === 0 ? 'no instrument points' : `${points} instrument point${points === 1 ? '' : 's'}`}
      </Text>
    </Pressable>
  );
}

export function AddMachineDialog({ visible, parentLabel, onCancel, onCreate }: AddMachineDialogProps) {
  const { isDark } = useAppTheme();
  const [name, setName] = useState('');
  const [template, setTemplate] = useState<MachineTemplate | null>(null);
  const [variantId, setVariantId] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (visible) {
      setName('');
      setTemplate(null);
      setVariantId(null);
      setQuery('');
    }
  }, [visible]);

  // How many instrument pads each template draws. Computed once: it is a
  // property of the template and does not change while the dialog is open.
  const pointsFor = useMemo(() => {
    const counts = new Map<string, number>();
    for (const candidate of MACHINE_TEMPLATES) counts.set(candidate, connectorsForTemplate(candidate).length);
    return counts;
  }, []);

  // Matched on the template name and on its family, so "meal" finds the four
  // meal-handling machines and "sifter" finds the one.
  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matches = MACHINE_TEMPLATES.filter(
      (candidate) =>
        needle === ''
        || candidate.toLowerCase().includes(needle)
        || TEMPLATE_FAMILY[candidate].toLowerCase().includes(needle),
    );
    return TEMPLATE_FAMILY_ORDER
      .map((family) => ({ family, templates: matches.filter((candidate) => TEMPLATE_FAMILY[candidate] === family) }))
      .filter((group) => group.templates.length > 0);
  }, [query]);
  const matchCount = groups.reduce((n, group) => n + group.templates.length, 0);

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
      // Choosing a template with variants adds a required field below eleven
      // template cards, well under the fold of a scrolling body. Without this
      // the dialog looks like it simply refuses to enable Create.
      revealBottomOn={needsVariant ? template : null}
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

      <View className="gap-2">
        <View className="flex-row items-baseline justify-between">
          <Text className={cn('font-body-medium text-xs', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>Template *</Text>
          <Text className={cn('font-mono text-[10px] tracking-wide', isDark ? 'text-ink-faint' : 'text-ink-inverse-muted')}>
            {query.trim() ? `${matchCount} of ${MACHINE_TEMPLATES.length}` : `${MACHINE_TEMPLATES.length} templates`}
          </Text>
        </View>

        <FormField
          value={query}
          onChangeText={setQuery}
          placeholder="Search templates — name or part of the plant"
        />

        {groups.length === 0 ? (
          <View className={cn('rounded-xl border px-3 py-6', isDark ? 'border-line-dark' : 'border-line-light')}>
            <Text className={cn('text-center font-body text-xs', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
              No template matches “{query.trim()}”.
            </Text>
          </View>
        ) : (
          groups.map((group) => (
            <View key={group.family} className="gap-1.5">
              <Text
                className={cn(
                  'font-mono text-[10px] uppercase tracking-[0.16em]',
                  isDark ? 'text-ink-faint' : 'text-ink-inverse-muted',
                )}
              >
                {group.family}
              </Text>
              <View className="flex-row flex-wrap justify-between gap-y-2">
                {group.templates.map((t) => (
                  <TemplateCard
                    key={t}
                    template={t}
                    selected={template === t}
                    points={pointsFor.get(t) ?? 0}
                    onPress={() => selectTemplate(t)}
                  />
                ))}
                {/* Keeps a lone card in a two-column row at half width rather
                    than letting `justify-between` stretch it across. */}
                {group.templates.length % 2 === 1 ? <View style={{ width: '48%' }} /> : null}
              </View>
            </View>
          ))
        )}
      </View>

      {/* What was chosen, restated once. The grid scrolls, so by the time the
          variant step or the Create button is in view the selected card may
          not be. */}
      {template ? (
        <View
          className={cn(
            'flex-row items-center gap-2 rounded-xl border px-3 py-2.5',
            isDark ? 'border-accent/40 bg-accent/5' : 'border-accent/50 bg-accent/5',
          )}
        >
          <MachineTemplateIcon template={template} color="#4F9D69" size={18} />
          <View className="flex-1">
            <Text className={cn('font-body-medium text-xs', isDark ? 'text-ink' : 'text-ink-inverse')}>{template}</Text>
            <Text className={cn('font-body text-[10.5px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
              {(pointsFor.get(template) ?? 0) === 0
                ? 'No instrument points — this machine has no canvas to wire.'
                : `${pointsFor.get(template)} instrument points, each wired to a card when you generate hardware.`}
            </Text>
          </View>
        </View>
      ) : null}

      {/*
        Shown only for templates that declare variants, so every other template
        keeps the dialog it had. Today that is the twin-screw extruder alone.

        Boxed and tinted rather than dropped in as a bare field: it appears only
        after a template is chosen, so it has to read as a new step rather than
        as something that was always there and already dealt with.
      */}
      {needsVariant ? (
        <View
          className={cn(
            'gap-1.5 rounded-xl border p-3',
            isDark ? 'border-line-dark bg-surface-dark' : 'border-line-light bg-surface-light',
          )}
        >
          <Text className={cn('font-mono text-[10px] uppercase tracking-[0.16em]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
            Step 2 — {template}
          </Text>
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
        </View>
      ) : null}
    </Dialog>
  );
}
