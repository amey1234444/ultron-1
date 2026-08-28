import { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';

import { splinePath, useSmoothSeries } from '../../../lib/chartMotion';

const WIDTH = 200;
const HEIGHT = 56;
const PAD = 6;

// Minimal inline trend chart. `range`, when given, fixes the vertical scale
// (e.g. to the channel kind's plausible band) so cards of the same measurement
// kind are visually comparable; omit it to auto-fit the buffer's own min/max.
export function Sparkline({ values, colour, range }: { values: number[]; colour: string; range?: { min: number; max: number } }) {
  const smoothValues = useSmoothSeries(values);
  const path = useMemo(() => {
    if (smoothValues.length < 2) return null;
    const min = range ? range.min : Math.min(...smoothValues);
    const max = range ? range.max : Math.max(...smoothValues);
    const span = max - min || 1;
    const stepX = (WIDTH - PAD * 2) / (smoothValues.length - 1);

    const points = smoothValues.map((v, i) => ({
      x: PAD + i * stepX,
      y: PAD + (1 - (v - min) / span) * (HEIGHT - PAD * 2),
    }));

    return { d: splinePath(points, 0.45), last: points[points.length - 1] };
  }, [range, smoothValues]);

  return (
    <View style={{ width: WIDTH, height: HEIGHT }}>
      <Svg width={WIDTH} height={HEIGHT}>
        <Line x1={PAD} y1={HEIGHT - PAD} x2={WIDTH - PAD} y2={HEIGHT - PAD} stroke={colour} strokeOpacity={0.15} strokeWidth={1} />
        {path && (
          <>
            <Path d={path.d} fill="none" stroke={colour} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
            <Circle cx={path.last.x} cy={path.last.y} r={2.5} fill={colour} />
          </>
        )}
      </Svg>
    </View>
  );
}
