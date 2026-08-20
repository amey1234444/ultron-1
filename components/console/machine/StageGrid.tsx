import { useMemo } from 'react';
import Svg, { Path, Rect } from 'react-native-svg';

import { useAppTheme } from '../../../hooks/useAppTheme';

// The fixed logical design space. Every machine/trail/box coordinate lives in
// this 1600×900 stage; the whole stage is then uniformly scaled to fit whatever
// screen or panel space is available, so saved layouts render with identical
// geometry on any monitor, window size, or panel state.
export const STAGE_WIDTH = 1600;
export const STAGE_HEIGHT = 900;

/**
 * The usable design area, in stage units.
 *
 * The 1600×900 stage is only the *reference* frame that keeps saved layouts
 * resolution-independent; the canvas it sits in is almost always taller or
 * wider than 16:9, and that surrounding space is drawn as the same work
 * surface. These bounds describe the whole of it, so a card or a trail bend
 * can be dragged right out to the canvas edge instead of stopping at an
 * invisible wall partway across the grid. Coordinates outside 0…STAGE are
 * legal and simply save as negative / over-size stage units.
 */
export type StageBounds = { minX: number; minY: number; maxX: number; maxY: number };

export const DEFAULT_STAGE_BOUNDS: StageBounds = { minX: 0, minY: 0, maxX: STAGE_WIDTH, maxY: STAGE_HEIGHT };

/**
 * Convert a measured canvas (container pixels) plus the current stage scale
 * into those bounds. `transform: scale` scales about the centre, so the extra
 * room is split evenly on both sides of each axis.
 */
export function stageBoundsForCanvas(width: number, height: number, scale: number): StageBounds {
  if (!(width > 0) || !(height > 0) || !(scale > 0)) return DEFAULT_STAGE_BOUNDS;
  const bleedX = Math.max(0, (width / scale - STAGE_WIDTH) / 2);
  const bleedY = Math.max(0, (height / scale - STAGE_HEIGHT) / 2);
  return { minX: -bleedX, minY: -bleedY, maxX: STAGE_WIDTH + bleedX, maxY: STAGE_HEIGHT + bleedY };
}

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

/**
 * The same grid, drawn across the whole canvas instead of only the stage.
 *
 * The stage keeps a fixed 16:9 aspect so saved layouts render identically
 * everywhere, which means a wider window leaves bands to its left and right.
 * Drawing the grid in container coordinates — at the stage's own cadence and
 * phase, so the two are indistinguishable — fills those bands and the canvas
 * reads as one continuous work surface out to every edge.
 *
 * `scale` is the current stage scale, and the origin is where the scaled stage
 * starts inside the container: `transform: scale` scales about the centre, so
 * the visible stage is the container centre minus half the scaled stage.
 */
export function CanvasGrid({ width, height, scale }: { width: number; height: number; scale: number }) {
  const { isDark } = useAppTheme();

  const minorColour = isDark ? 'rgba(255,255,255,0.045)' : 'rgba(10,10,10,0.055)';
  const majorColour = isDark ? 'rgba(255,255,255,0.09)' : 'rgba(10,10,10,0.11)';

  const { minorPath, majorPath } = useMemo(() => {
    const step = MINOR_STEP * scale;
    const major = MAJOR_STEP * scale;
    const originX = (width - STAGE_WIDTH * scale) / 2;
    const originY = (height - STAGE_HEIGHT * scale) / 2;

    // Phase the lines to the stage origin, then walk outwards to both edges so
    // the grid continues past the stage rather than starting at it.
    const firstX = originX - Math.ceil(originX / step) * step;
    const firstY = originY - Math.ceil(originY / step) * step;
    const firstMajorX = originX - Math.ceil(originX / major) * major;
    const firstMajorY = originY - Math.ceil(originY / major) * major;

    let minor = '';
    let majorLines = '';
    if (step > 3) {
      for (let x = firstX; x <= width; x += step) {
        if (Math.abs((x - originX) % major) < 0.5) continue;
        minor += `M ${x.toFixed(1)} 0 L ${x.toFixed(1)} ${height} `;
      }
      for (let y = firstY; y <= height; y += step) {
        if (Math.abs((y - originY) % major) < 0.5) continue;
        minor += `M 0 ${y.toFixed(1)} L ${width} ${y.toFixed(1)} `;
      }
    }
    for (let x = firstMajorX; x <= width; x += major) majorLines += `M ${x.toFixed(1)} 0 L ${x.toFixed(1)} ${height} `;
    for (let y = firstMajorY; y <= height; y += major) majorLines += `M 0 ${y.toFixed(1)} L ${width} ${y.toFixed(1)} `;

    return { minorPath: minor.trim(), majorPath: majorLines.trim() };
  }, [height, scale, width]);

  if (width <= 0 || height <= 0 || scale <= 0) return null;

  return (
    <Svg pointerEvents="none" width={width} height={height} style={{ position: 'absolute', left: 0, top: 0 }}>
      <Path d={minorPath} stroke={minorColour} strokeWidth={1} />
      <Path d={majorPath} stroke={majorColour} strokeWidth={1} />
      {/* The only boundary drawn is the canvas itself. The 16:9 stage used to
          be framed here, which read as a wall cards were not allowed past —
          but the whole canvas is placeable area, so the frame belongs at its
          edges. */}
      <Rect
        x={0.5}
        y={0.5}
        width={Math.max(0, width - 1)}
        height={Math.max(0, height - 1)}
        fill="none"
        stroke={majorColour}
        strokeWidth={1}
      />
    </Svg>
  );
}
