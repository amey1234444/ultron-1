import { Text, View } from 'react-native';

import { useAppTheme } from '../../../../hooks/useAppTheme';
import { cn } from '../../../../lib/cn';
import { levelHexes, STATE_LABEL } from '../../../../lib/condition';
import { consolePalette } from '../../../../lib/consoleTheme';
import { Hoverable, radius } from '../../../ui';
import type { HealthFactor } from './rollup';

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
    <View className="gap-2.5">
      {factors.map((factor) => {
        const colour = levels[factor.level];
        const percent = factor.health === null ? 0 : Math.max(0, Math.min(100, factor.health));

        return (
          <Hoverable
            key={factor.key}
            className="gap-1 px-2 py-1.5"
            style={({ hovered }) => ({
              marginHorizontal: -8,
              borderRadius: radius.sm,
              backgroundColor: hovered ? palette.hover : undefined,
            })}
          >
            <View className="flex-row items-baseline gap-2">
              <Text numberOfLines={1} className={cn('flex-1 font-body-medium text-[13.5px]', inkClass)}>
                {factor.label}
              </Text>
              <Text className={cn('font-mono text-[10.5px]', mutedClass)}>
                {factor.count} {factor.count === 1 ? 'pt' : 'pts'}
              </Text>
              <Text style={{ color: colour }} className="w-9 text-right font-mono text-[13.5px] font-bold tabular-nums">
                {factor.health === null ? '--' : `${Math.round(factor.health)}%`}
              </Text>
              {/* Status in words as well as colour. */}
              <Text style={{ color: colour }} className="w-14 text-right font-mono text-[9.5px] font-bold tracking-wider">
                {STATE_LABEL[factor.level]}
              </Text>
            </View>

            <View style={{ height: 6, borderRadius: 3, backgroundColor: track }} className="w-full overflow-hidden">
              <View style={{ height: 6, borderRadius: 3, width: `${percent}%`, backgroundColor: colour }} />
            </View>
          </Hoverable>
        );
      })}
    </View>
  );
}
