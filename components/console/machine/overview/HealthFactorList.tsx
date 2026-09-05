import { Activity, Database, Gauge, Thermometer, Zap, type LucideIcon } from 'lucide-react-native';
import { Text, View } from 'react-native';

import { useAppTheme } from '../../../../hooks/useAppTheme';
import { cn } from '../../../../lib/cn';
import { levelHexes, STATE_LABEL } from '../../../../lib/condition';
import { consolePalette } from '../../../../lib/consoleTheme';
import { Hoverable, radius } from '../../../ui';
import type { HealthFactor } from './rollup';

function iconForFactor(factor: HealthFactor): LucideIcon {
  const value = `${factor.key} ${factor.label}`.toLocaleLowerCase();
  if (value.includes('vibration')) return Activity;
  if (value.includes('temperature')) return Thermometer;
  if (value.includes('power') || value.includes('current')) return Zap;
  if (value.includes('quality') || value.includes('sensor') || value.includes('data')) return Database;
  return Gauge;
}

// What the machine's single health score is made of, one bar per measurement kind
// plus data quality. The score alone says a machine is at 74; this says which
// discipline the 74 came from, which is the difference between a number and
// something to act on.
//
// Bar colour comes from the worst point of that kind, not from the score: a kind
// whose average is comfortable but which contains one point over its limit must
// not read as green.
export function HealthFactorList({ factors }: { factors: HealthFactor[] }) {
  const { isDark } = useAppTheme();
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const inkClass = isDark ? 'text-ink' : 'text-ink-inverse';
  const palette = consolePalette(isDark);
  const track = palette.track;
  const levels = levelHexes(isDark);

  if (factors.length === 0) {
    return <Text className={cn('font-body text-xs italic', mutedClass)}>No measurement kinds mapped yet.</Text>;
  }

  return (
    <View>
      <View className="flex-row items-center border-b pb-2" style={{ borderColor: palette.lineSubtle }}>
        <Text className={cn('flex-1 font-body text-[10.5px]', mutedClass)}>Parameter</Text>
        <Text className={cn('w-14 text-right font-body text-[10.5px]', mutedClass)}>Points</Text>
        <Text className={cn('w-14 text-right font-body text-[10.5px]', mutedClass)}>Value</Text>
        <Text className={cn('w-[66px] text-right font-body text-[10.5px]', mutedClass)}>Status</Text>
      </View>
      {factors.map((factor) => {
        const colour = levels[factor.level];
        const percent = factor.health === null ? 0 : Math.max(0, Math.min(100, factor.health));
        const Icon = iconForFactor(factor);

        return (
          <Hoverable
            key={factor.key}
            className="border-b py-2"
            style={({ hovered }) => ({
              borderColor: palette.lineSubtle,
              borderRadius: radius.sm,
              backgroundColor: hovered ? palette.hoverSurface : undefined,
            })}
          >
            <View className="flex-row items-center gap-2">
              <Icon color={palette.inkMuted} size={17} strokeWidth={1.7} />
              <View className="min-w-0 flex-1 flex-row items-center gap-3">
                <Text numberOfLines={1} style={{ flexBasis: 100 }} className={cn('font-body-medium text-[12px]', inkClass)}>
                  {factor.label}
                </Text>
                <View style={{ height: 6, borderRadius: 3, backgroundColor: track }} className="min-w-[70px] flex-1 overflow-hidden">
                  <View style={{ height: 6, borderRadius: 3, width: `${percent}%`, backgroundColor: colour }} />
                </View>
              </View>
              <Text className={cn('w-14 text-right font-mono text-[10.5px]', mutedClass)}>
                {factor.count} {factor.count === 1 ? 'pt' : 'pts'}
              </Text>
              <Text style={{ color: colour }} className="w-14 text-right font-mono text-[12px] font-bold tabular-nums">
                {factor.health === null ? '--' : `${Math.round(factor.health)}%`}
              </Text>
              <View className="w-[66px] items-end">
                <View className="rounded-md px-2 py-1" style={{ backgroundColor: `${colour}18` }}>
                  <Text style={{ color: colour }} className="font-mono text-[9px] font-bold tracking-wider">{STATE_LABEL[factor.level]}</Text>
                </View>
              </View>
            </View>
          </Hoverable>
        );
      })}
    </View>
  );
}
