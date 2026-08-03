import { useMemo } from 'react';
import Svg, { Path, Rect } from 'react-native-svg';

import { useAppTheme } from '../../../hooks/useAppTheme';

// The fixed logical design space. Every machine/trail/box coordinate lives in
// this 1600×900 stage; the whole stage is then uniformly scaled to fit whatever
// screen or panel space is available, so saved layouts render with identical
// geometry on any monitor, window size, or panel state.
export const STAGE_WIDTH = 1600;
export const STAGE_HEIGHT = 900;

const MINOR_STEP = 50;
const MAJOR_STEP = 250;

function buildGridPath(step: number, skipStep?: number) {
  let d = '';
  for (let x = step; x < STAGE_WIDTH; x += step) {
    if (skipStep && x % skipStep === 0) continue;
    d += `M ${x} 0 L ${x} ${STAGE_HEIGHT} `;
  }
  for (let y = step; y < STAGE_HEIGHT; y += step) {
    if (skipStep && y % skipStep === 0) continue;
    d += `M 0 ${y} L ${STAGE_WIDTH} ${y} `;
  }
  return d.trim();
}

// Blueprint-style grid drawn in stage coordinates, under the machine and trail
// layers. Design-mode only — Actual View renders the clean stage without it.
export function StageGrid() {
  const { isDark } = useAppTheme();

  const minorPath = useMemo(() => buildGridPath(MINOR_STEP, MAJOR_STEP), []);
  const majorPath = useMemo(() => buildGridPath(MAJOR_STEP), []);

  const minorColour = isDark ? 'rgba(255,255,255,0.045)' : 'rgba(10,10,10,0.055)';
  const majorColour = isDark ? 'rgba(255,255,255,0.09)' : 'rgba(10,10,10,0.11)';

  return (
    <Svg
      pointerEvents="none"
      width={STAGE_WIDTH}
      height={STAGE_HEIGHT}
      style={{ position: 'absolute', left: 0, top: 0 }}
    >
      <Path d={minorPath} stroke={minorColour} strokeWidth={1} />
      <Path d={majorPath} stroke={majorColour} strokeWidth={1} />
      <Rect x={0.5} y={0.5} width={STAGE_WIDTH - 1} height={STAGE_HEIGHT - 1} fill="none" stroke={majorColour} strokeWidth={1} />
    </Svg>
  );
}
