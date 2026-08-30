import { Text, View } from 'react-native';

import { useAppTheme } from '../../../../hooks/useAppTheme';
import { cn } from '../../../../lib/cn';

// One headline number with its label and a qualifier underneath. `tone` colours
// the value when it is carrying a condition (an alarm count, a severity zone);
// tiles that are only reporting a fact leave it unset so the page does not end
// up with five competing colours in a row.
export function KpiTile({
  label,
  value,
  unit,
  hint,
  tone,
  width = 148,
}: {
  label: string;
  value: string;
  unit?: string;
  hint?: string;
  tone?: string;
  width?: number;
}) {
  const { isDark } = useAppTheme();
  const lineClass = isDark ? 'border-line-dark' : 'border-line-light';
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const inkClass = isDark ? 'text-ink' : 'text-ink-inverse';

  return (
    <View
      style={{ width }}
      className={cn('gap-1 rounded-xl border px-3 py-2.5', lineClass, isDark ? 'bg-surface-darkpanel' : 'bg-surface-lightpanel')}
    >
      <Text className={cn('font-body-medium text-[11.5px] uppercase tracking-wider', mutedClass)}>{label}</Text>

      <View className="flex-row items-baseline gap-1">
        <Text style={tone ? { color: tone } : undefined} className={cn('font-mono text-xl font-bold tabular-nums', !tone && inkClass)}>
          {value}
        </Text>
        {unit ? <Text className={cn('font-mono text-[12.5px]', mutedClass)}>{unit}</Text> : null}
      </View>

      {hint ? (
        <Text numberOfLines={1} className={cn('font-body text-[11.5px]', mutedClass)}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}
