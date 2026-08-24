import { Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { useAppTheme } from '../../../../hooks/useAppTheme';
import { levelHexes, type ConditionLevel } from '../../../../lib/condition';
import { consolePalette } from '../../../../lib/consoleTheme';

const STROKE = 9;

// The machine's aggregate condition score. Deliberately one number and one ring:
// the point of a condition score is that it moves before an alarm trips, so it
// has to be readable from across a control room without being read carefully.
export function HealthRing({
  score,
  level,
  caption,
  size = 132,
}: {
  score: number | null;
  level: ConditionLevel;
  caption?: string;
  size?: number;
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const colour = levelHexes(isDark)[level];

  const radius = (size - STROKE) / 2;
  const circumference = 2 * Math.PI * radius;
  const fraction = score === null ? 0 : Math.max(0, Math.min(1, score / 100));

  return (
    <View style={{ width: size, height: size }} className="items-center justify-center">
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={palette.track} strokeWidth={STROKE} fill="none" />
        {/* Rotated so the arc starts at twelve o'clock. Written as an SVG
            transform string with its centre baked in rather than via the
            rotation/originX/originY props: on web, react-native-svg 15 turns
            those into a `transform-origin` *prop*, which React DOM rejects as an
            invalid property name and reports as an error — noisy enough to raise
            a dev overlay, even though the attribute does reach the DOM. */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colour}
          strokeWidth={STROKE}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={circumference * (1 - fraction)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>

      <Text style={{ color: colour }} className="font-mono text-3xl font-bold tabular-nums">
        {score === null ? '--' : Math.round(score)}
      </Text>
      {/* The caption stays neutral. Painting the ring, the number AND the word
          under it the same amber is three sayings of one thing, and it is what
          made the light overview read as an orange panel rather than as a
          machine with one amber score on it. */}
      <Text style={{ color: palette.inkMuted }} className="font-body-medium text-[10px] uppercase tracking-wider">
        {caption ?? 'health'}
      </Text>
    </View>
  );
}
