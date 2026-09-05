import type { LucideIcon } from 'lucide-react-native';
import type { DimensionValue } from 'react-native';
import { Text, View } from 'react-native';

import { useAppTheme } from '../../../../hooks/useAppTheme';
import { cn } from '../../../../lib/cn';
import { consolePalette } from '../../../../lib/consoleTheme';

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
  badge,
  icon: Icon,
  iconTone,
  width,
}: {
  label: string;
  value: string;
  unit?: string;
  hint?: string;
  tone?: string;
  badge?: string;
  icon: LucideIcon;
  iconTone?: string;
  width?: DimensionValue;
}) {
  const { isDark } = useAppTheme();
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const inkClass = isDark ? 'text-ink' : 'text-ink-inverse';
  const palette = consolePalette(isDark);
  const iconColour = iconTone ?? palette.inkFaint;

  return (
    <View
      style={{
        width,
        flexGrow: width === undefined ? 1 : 0,
        flexBasis: width === undefined ? 176 : undefined,
        minWidth: 164,
        borderColor: palette.line,
        backgroundColor: isDark ? '#0A0B0C' : palette.panel,
      }}
      className="flex-row items-center gap-3 rounded-xl border px-3.5 py-3"
    >
      <View
        className="items-center justify-center rounded-lg border"
        style={{ width: 46, height: 46, borderColor: iconTone ? `${iconColour}32` : palette.lineSubtle, backgroundColor: iconTone ? `${iconColour}0D` : palette.panelRaised }}
      >
        <Icon color={iconColour} size={20} strokeWidth={1.7} />
      </View>

      <View className="min-w-0 flex-1 gap-0.5">
        <Text numberOfLines={1} className={cn('font-body-medium text-[10.5px] uppercase tracking-wider', mutedClass)}>{label}</Text>

        <View className="flex-row flex-wrap items-center gap-x-2 gap-y-1">
          <View className="flex-row items-baseline gap-1">
            <Text style={tone ? { color: tone } : undefined} className={cn('font-mono text-[21px] font-medium leading-[25px] tabular-nums', !tone && inkClass)}>
              {value}
            </Text>
            {unit ? <Text className={cn('font-mono text-[11.5px]', mutedClass)}>{unit}</Text> : null}
          </View>
          {badge ? (
            <View className="rounded-md px-2 py-0.5" style={{ backgroundColor: `${tone ?? palette.accent}1F` }}>
              <Text style={{ color: tone ?? palette.accent }} className="font-mono text-[9.5px] font-bold tracking-wider">{badge}</Text>
            </View>
          ) : null}
        </View>

        {hint ? <Text numberOfLines={1} className={cn('font-body text-[10.5px]', mutedClass)}>{hint}</Text> : null}
      </View>
    </View>
  );
}
