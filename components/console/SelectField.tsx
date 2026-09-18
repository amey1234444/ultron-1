import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';
import { cn } from '../../lib/cn';

export type SelectOption = {
  value: string;
  label: string;
  /** Second line under the label, for a summary or a document reference. */
  description?: string;
  /** Short monospace tag shown on the right, e.g. an id. */
  tag?: string;
};

type SelectFieldProps = {
  label: string;
  required?: boolean;
  options: SelectOption[];
  value: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Explanatory line under the control, shown whether open or closed. */
  hint?: string;
};

/**
 * A dropdown that expands in place rather than floating.
 *
 * The console's other selectors are chip rows, which work when the options are
 * short words like "Modbus TCP". They do not work here: a variant name is a
 * full descriptive phrase, and a row of those wraps into an unreadable block.
 *
 * The list opens *inline*, pushing the content below it down, instead of
 * floating over it in an absolutely positioned layer. That is deliberate — this
 * control is used inside `Dialog`, and an overlay inside a scrolling modal has
 * to win a stacking-context fight against the modal's own backdrop on web while
 * also being reachable on a touch screen. An inline list has neither problem
 * and cannot be clipped by the dialog's bounds.
 */
export function SelectField({ label, required, options, value, onChange, placeholder, hint }: SelectFieldProps) {
  const { isDark } = useAppTheme();
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value) ?? null;

  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const borderClass = isDark ? 'border-line-dark' : 'border-line-light';

  return (
    <View className="gap-1.5">
      <Text className={cn('font-body-medium text-xs', mutedClass)}>
        {label}
        {required ? ' *' : ''}
      </Text>

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((previous) => !previous)}
        className={cn(
          'flex-row items-center gap-2 rounded-lg border px-3 py-2',
          borderClass,
          isDark ? 'bg-surface-dark' : 'bg-surface-light',
        )}
      >
        <View className="min-w-0 flex-1">
          <Text
            numberOfLines={1}
            className={cn('font-body text-sm', selected ? (isDark ? 'text-ink' : 'text-ink-inverse') : mutedClass)}
          >
            {selected ? selected.label : (placeholder ?? 'Select an option')}
          </Text>
          {selected?.tag ? (
            <Text numberOfLines={1} className={cn('font-mono text-[10px] uppercase tracking-[0.14em]', mutedClass)}>
              {selected.tag}
            </Text>
          ) : null}
        </View>
        <MaterialCommunityIcons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={isDark ? '#A1A3A0' : '#5F625F'}
        />
      </Pressable>

      {open ? (
        <View className={cn('overflow-hidden rounded-lg border', borderClass)}>
          {options.map((option, index) => {
            const isSelected = option.value === value;
            return (
              <Pressable
                key={option.value}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                onPress={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className={cn(
                  'gap-0.5 px-3 py-2.5',
                  index > 0 && (isDark ? 'border-t border-line-dark' : 'border-t border-line-light'),
                  isSelected && (isDark ? 'bg-surface-dark' : 'bg-surface-light'),
                )}
              >
                <View className="flex-row items-center gap-2">
                  <Text
                    className={cn('min-w-0 flex-1 font-body-medium text-sm', isDark ? 'text-ink' : 'text-ink-inverse')}
                  >
                    {option.label}
                  </Text>
                  {isSelected ? (
                    <MaterialCommunityIcons name="check" size={16} color={isDark ? '#A1A3A0' : '#5F625F'} />
                  ) : null}
                </View>
                {option.description ? (
                  <Text className={cn('font-body text-xs', mutedClass)}>{option.description}</Text>
                ) : null}
                {option.tag ? (
                  <Text className={cn('font-mono text-[10px] uppercase tracking-[0.14em]', mutedClass)}>
                    {option.tag}
                  </Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {hint ? <Text className={cn('font-body text-xs', mutedClass)}>{hint}</Text> : null}
    </View>
  );
}
