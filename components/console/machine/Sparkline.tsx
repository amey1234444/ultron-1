import { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';

const WIDTH = 200;
const HEIGHT = 56;
const PAD = 6;

// Minimal inline trend chart. `range`, when given, fixes the vertical scale
// (e.g. to the channel kind's plausible band) so cards of the same measurement
// kind are visually comparable; omit it to auto-fit the buffer's own min/max.
export function Sparkline({ values, colour, range }: { values: number[]; colour: string; range?: { min: number; max: number } }) {
  const path = useMemo(() => {
    if (values.length < 2) return null;
    const min = range ? range.min : Math.min(...values);
    const max = range ? range.max : Math.max(...values);
    const span = max - min || 1;
    const stepX = (WIDTH - PAD * 2) / (values.length - 1);

    const points = values.map((v, i) => ({
      x: PAD + i * stepX,
      y: PAD + (1 - (v - min) / span) * (HEIGHT - PAD * 2),
    }));

    const d = points.reduce((acc, p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`), '');
    return { d, last: points[points.length - 1] };
  }, [values]);

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
