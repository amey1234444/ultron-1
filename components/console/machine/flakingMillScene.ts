/** Flaking Mill M-102, detailed engineering-dashboard artwork.
 * Recreates the supplied Flaking_Mill_M-102 reference as vector geometry in the
 * style of the expander and extruder templates. Illustrative cutaway, not CAD.
 *
 * The stage is 1200 x 1000, deliberately taller than the 1200 x 760 the other
 * flat artworks use, because this machine is a vertical arrangement. Fit it to
 * a container preserving aspect ratio; do not stretch it to the shorter frame.
 *
 * The part vocabulary and the point registry are NOT defined here. They live in
 * `lib/flakingMillPoints.ts`, because `machineConnectors.ts` and
 * `lib/machines.ts` both read them and neither may import from `components/`.
 * This file owns the geometry; that one owns the vocabulary. The aliases below
 * keep the template's original export names working.
 */
import {
  FLAKING_MILL_ARTWORK_HEIGHT,
  FLAKING_MILL_ARTWORK_WIDTH,
  FLAKING_MILL_PART_LABELS,
  type FlakingMillPartId,
} from '../../../lib/flakingMillPoints';

export const FLAKING_MILL_VIEWBOX_WIDTH = FLAKING_MILL_ARTWORK_WIDTH;
export const FLAKING_MILL_VIEWBOX_HEIGHT = FLAKING_MILL_ARTWORK_HEIGHT;
export type MillPartId = FlakingMillPartId;
export interface MillNode {
  tag: 'g' | 'rect' | 'line' | 'path' | 'polygon' | 'circle' | 'text'
    | 'defs' | 'clipPath' | 'linearGradient' | 'radialGradient' | 'stop';
  attrs: Record<string, string | number>;
  children?: MillNode[];
  text?: string;
  part?: MillPartId;
}
export interface MillSceneOptions {
  idPrefix: string;
  dark?: boolean;
  showGrid?: boolean;
  showLabels?: boolean;
  /** Left roll clockwise; right roll counter-clockwise by default. Degrees. */
  rollRotation?: number;
  /** Overrides the right roll's default opposite phase when supplied. */
  rightRollRotation?: number;
  feederRotation?: number;
  /** Decorative material level, from 0 to 1. Not a measured value. */
  hopperLevel?: number;
}
export const FLAKING_MILL_PARTS = FLAKING_MILL_PART_LABELS;
const n = (tag: MillNode['tag'], attrs: MillNode['attrs'], children?: MillNode[]): MillNode => ({ tag, attrs, children });
const finite = (x: number | undefined, fallback = 0) => Number.isFinite(x) ? x! : fallback;
const angle = (x?: number) => ((finite(x) % 360) + 360) % 360;
/** Two external tangent belt spans; endpoints meet both pulley circumferences. */
function beltTangents(ax: number, ay: number, ar: number, bx: number, by: number, br: number): number[][] {
  const dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy);
  const u = dx / d, v = dy / d, cosine = (ar - br) / d;
  const sine = Math.sqrt(Math.max(0, 1 - cosine * cosine));
  return [-1, 1].map(sign => {
    const nx = cosine * u - sign * sine * v;
    const ny = cosine * v + sign * sine * u;
    return [ax + ar * nx, ay + ar * ny, bx + br * nx, by + br * ny];
  });
}
export function buildFlakingMillScene(options: MillSceneOptions): MillNode[] {
  const { idPrefix, dark = true, showGrid = true, showLabels = true } = options;
  const c = {
    body: dark ? '#1B2028' : '#E1E6EC', raised: dark ? '#2B333F' : '#FBFCFD',
    deep: dark ? '#0C1015' : '#C2CCD7', edge: dark ? '#838D9B' : '#536477',
    fine: dark ? '#394451' : '#A7B3C1', text: dark ? '#A9B1BC' : '#4D5E72',
    grid: dark ? '#202731' : '#DAE1E9', material: dark ? '#AD8C4B' : '#C49B51',
    accent: '#3FBF6A', hydraulic: dark ? '#8D7AA8' : '#816098',
    rollLight: dark ? '#677586' : '#DDE5ED', rollDark: dark ? '#303B49' : '#96A6B8',
    belt: dark ? '#66727E' : '#69798B', red: dark ? '#B36960' : '#B54C42',
  };
  const ref = (name: string) => `url(#${idPrefix}-${name})`;
  const rect = (x: number, y: number, width: number, height: number, fill = ref('body'), rx = 2, stroke = c.edge, strokeWidth = 1.5) =>
    n('rect', { x, y, width, height, rx, fill, stroke, strokeWidth });
  const line = (x1: number, y1: number, x2: number, y2: number, stroke = c.fine, strokeWidth = 1) =>
    n('line', { x1, y1, x2, y2, stroke, strokeWidth, strokeLinecap: 'round' });
  const path = (d: string, fill = 'none', stroke = c.edge, strokeWidth = 1.5) =>
    n('path', { d, fill, stroke, strokeWidth, strokeLinejoin: 'round' });
  const circle = (cx: number, cy: number, r: number, fill = c.deep, stroke = c.fine, strokeWidth = 1) =>
    n('circle', { cx, cy, r, fill, stroke, strokeWidth });
  const bolt = (x: number, y: number, r = 2.3) => circle(x, y, r);
  const polygon = (points: string, fill: string, stroke = c.edge, strokeWidth = 1.5) =>
    n('polygon', { points, fill, stroke, strokeWidth });
  const group = (part: MillPartId, children: MillNode[]): MillNode => ({ tag: 'g', attrs: {}, children, part });
  const label = (x: number, y: number, text: string, size = 11, spacing = 1.6, anchor = 'middle'): MillNode => ({
    tag: 'text', attrs: { x, y, fill: c.text, fontFamily: 'sans-serif', fontSize: size,
      fontWeight: 600, letterSpacing: spacing, textAnchor: anchor }, text,
  });
  const gradient = (name: string, stops: [number, string][]): MillNode => n('linearGradient',
    { id: `${idPrefix}-${name}`, x1: '0%', y1: '0%', x2: '0%', y2: '100%' },
    stops.map(([offset, stopColor]) => n('stop', { offset, stopColor })));
  const left = angle(options.rollRotation);
  const right = angle(options.rightRollRotation === undefined ? -finite(options.rollRotation) : options.rightRollRotation);
  const feeder = angle(options.feederRotation);
  const level = Math.max(0, Math.min(1, finite(options.hopperLevel, .62)));
  const definitions = [
    gradient('body', [[0, c.raised], [.55, c.body], [1, dark ? '#161C24' : '#CED8E2']]),
    gradient('cylinder', [[0, c.body], [.25, c.raised], [.6, c.body], [1, c.deep]]),
    gradient('shaft', [[0, c.rollDark], [.35, c.rollLight], [.6, c.rollDark], [1, c.deep]]),
    gradient('material', [[0, dark ? '#BCA169' : '#E0BE7F'], [1, dark ? '#70521F' : '#AF813E']]),
    n('radialGradient', { id: `${idPrefix}-roll`, cx: '35%', cy: '28%', r: '78%' }, [
      n('stop', { offset: 0, stopColor: c.rollLight }),
      n('stop', { offset: .65, stopColor: c.rollDark }),
      n('stop', { offset: 1, stopColor: c.body }),
    ]),
    n('clipPath', { id: `${idPrefix}-hopper` }, [polygon('482,99 664,99 626,180 520,180', 'white', 'none', 0)]),
  ];
  const scene: MillNode[] = [n('defs', {}, definitions)];
  if (showGrid) scene.push(n('g', { opacity: .42 }, [
    ...Array.from({ length: 21 }, (_, i) => line(i * 60, 0, i * 60, 1000, c.grid, i % 5 === 0 ? 1 : .6)),
    ...Array.from({ length: 17 }, (_, i) => line(0, i * 60, 1200, i * 60, c.grid, i % 5 === 0 ? 1 : .6)),
  ]));
  const parts: MillNode[] = [];
  // Transparent cutaway housing retains the reference's rectangular enclosure.
  parts.push(group('frame', [
    rect(282, 182, 586, 676, ref('body'), 14, c.edge, 2),
    rect(294, 194, 562, 652, c.deep, 8, c.fine, 1),
    rect(305, 206, 540, 626, dark ? '#0F141B' : '#F1F5F8', 5, c.fine, .6),
    ...[[295, 197], [855, 197], [295, 842], [855, 842]].map(([x, y]) => bolt(x, y, 3.3)),
    ...[332, 640].flatMap(y => [bolt(290, y, 2), bolt(860, y, 2)]),
    rect(286, 865, 49, 14, ref('body'), 2), rect(815, 865, 49, 14, ref('body'), 2),
    line(300, 858, 300, 865), line(850, 858, 850, 865),
    // Bearing slide/support visible beside the left roll and beneath the right.
    rect(283, 497, 62, 26, ref('shaft'), 1),
    rect(810, 490, 58, 40, ref('body'), 2),
    line(814, 498, 862, 498), line(814, 522, 862, 522),
  ]));
  // Right-hand fluid circuit: cylinder, vessel and auxiliary unit.
  parts.push(group('auxiliary-unit', [
    path('M 950 538 V 714', 'none', c.hydraulic, 1.8),
    rect(923, 714, 181, 75, ref('body'), 6),
    rect(932, 723, 163, 57, 'none', 3, c.fine, .8),
    rect(941, 733, 60, 25, c.deep, 2, c.fine, 1),
    line(949, 741, 991, 741), line(949, 749, 978, 749),
    circle(1024, 746, 11, c.deep, c.edge), line(1024, 746, 1029, 740, c.text, 1),
    ...[1051, 1061, 1071, 1081].map(x => line(x, 738, x, 760)),
    ...[[936, 727], [1090, 727], [936, 776], [1090, 776]].map(([x, y]) => bolt(x, y, 1.8)),
    rect(946, 706, 8, 8, ref('body'), 1),
  ]));
  parts.push(group('accumulator', [
    path('M 991 486 V 445 H 1096', 'none', c.hydraulic, 1.8),
    rect(1096, 405, 46, 80, ref('cylinder'), 21),
    line(1102, 444, 1136, 444, c.fine, .8),
    path('M 1119 449 V 476', 'none', c.fine, 1),
    rect(1091, 441, 5, 8, ref('body'), 1),
    rect(1115, 397, 8, 8, ref('body'), 2),
  ]));
  parts.push(group('actuator', [
    rect(807, 505, 108, 10, ref('shaft'), 1, c.fine, 1),
    rect(909, 484, 127, 53, ref('cylinder'), 4),
    rect(909, 480, 10, 61, ref('body'), 2), rect(1026, 480, 10, 61, ref('body'), 2),
    line(922, 492, 1022, 492), line(922, 529, 1022, 529),
    ...[[914, 487], [914, 533], [1031, 487], [1031, 533]].map(([x, y]) => bolt(x, y, 2)),
    rect(985, 478, 12, 6, ref('body'), 1), rect(944, 537, 12, 6, ref('body'), 1),
  ]));

  // Both belt drives are preserved. Draw belts first so rear spans disappear
  // correctly behind roll faces, matching the supplied sectional schematic.
  const belt = (part: 'belt-1' | 'belt-2', ax: number, ay: number, bx: number, by: number) => {
    const spans = beltTangents(ax, ay, 20, bx, by, 114);
    return group(part, [
      ...spans.map(([x1, y1, x2, y2]) => line(x1, y1, x2, y2, c.belt, 3.6)),
      ...spans.map(([x1, y1, x2, y2]) => line(x1, y1, x2, y2, c.fine, .65)),
    ]);
  };
  parts.push(belt('belt-1', 215, 374, 454, 510));
  parts.push(belt('belt-2', 215, 674, 692, 510));
  const motor = (part: 'drive-1' | 'drive-2', y: number, rotation: number) => group(part, [
    rect(62, y - 33, 14, 70, ref('body'), 4),
    ...[-24, -13, -2, 9, 20, 31].map(dy => line(66, y + dy, 72, y + dy)),
    rect(76, y - 41, 112, 83, ref('cylinder'), 11, c.edge, 1.7),
    ...Array.from({ length: 7 }, (_, i) => line(87, y - 31 + i * 10, 176, y - 31 + i * 10, c.fine, 1.1)),
    rect(112, y - 16, 34, 24, c.deep, 2, c.fine, 1),
    line(118, y - 9, 140, y - 9, c.fine, .6), line(118, y - 3, 135, y - 3, c.fine, .6),
    rect(104, y - 56, 45, 15, ref('body'), 3),
    rect(84, y + 42, 100, 8, ref('body'), 2),
    rect(92, y + 50, 24, 12, ref('body'), 2), rect(153, y + 50, 24, 12, ref('body'), 2),
    bolt(104, y + 56, 1.7), bolt(165, y + 56, 1.7),
    rect(188, y - 4, 26, 8, ref('shaft'), 1, c.fine, .8),
    circle(215, y, 22, ref('shaft'), c.edge, 1.5), circle(215, y, 17, c.body, c.fine),
    n('g', { transform: `rotate(${rotation} 215 ${y})` }, [
      ...[0, 90, 180, 270].map(a => n('g', { transform: `rotate(${a} 215 ${y})` }, [line(222, y, 229, y, c.fine, 1.5)])),
    ]),
    circle(215, y, 6, c.deep, c.edge),
  ]);
  // Pulley witness marks share the corresponding roll phase for a seamless visual loop.
  // This schematic phase is not a calibrated motor-to-roll speed ratio.
  parts.push(motor('drive-1', 374, left));
  parts.push(motor('drive-2', 674, right));

  // Feed hopper and its internal red bar are retained above the metering rotor.
  parts.push(group('hopper', [
    polygon('472,92 674,92 630,184 516,184', ref('body'), c.edge, 1.8),
    n('g', { clipPath: ref('hopper') }, [
      rect(480, 180 - level * 81, 190, level * 81, ref('material'), 0, 'none', 0),
    ]),
    rect(468, 83, 210, 10, ref('body'), 5, c.edge, 1.8),
    line(477, 87, 669, 87, c.fine, .7),
    rect(499, 105, 148, 7, c.red, 1, c.fine, .8),
    path('M 480 96 L 520 179 M 666 96 L 626 179', 'none', c.fine, .7),
    rect(512, 184, 122, 8, ref('body'), 2), bolt(519, 188, 1.8), bolt(627, 188, 1.8),
  ]));
  parts.push(group('feeder-drive', [
    rect(602, 232, 321, 8, ref('shaft'), 1, c.fine, .8),
    rect(855, 222, 15, 28, ref('body'), 2),
    rect(891, 228, 13, 16, ref('body'), 2),
    rect(923, 211, 84, 50, ref('cylinder'), 7),
    rect(1007, 216, 10, 41, ref('body'), 2),
    ...[218, 226, 234, 242, 250].map(y => line(931, y, 998, y, c.fine, 1)),
    rect(946, 198, 36, 13, ref('body'), 2),
    rect(931, 262, 68, 6, ref('body'), 1),
    rect(939, 268, 14, 7, ref('body'), 1), rect(980, 268, 14, 7, ref('body'), 1),
  ]));
  parts.push(group('feed-rotor', [
    circle(573, 236, 35, ref('body'), c.edge, 1.7),
    circle(573, 236, 29, ref('roll'), c.fine, 1),
    n('g', { transform: `rotate(${feeder} 573 236)` }, [
      ...Array.from({ length: 12 }, (_, i) => {
        const a = i * Math.PI / 6;
        return line(573 + Math.cos(a) * 7, 236 + Math.sin(a) * 7, 573 + Math.cos(a) * 28, 236 + Math.sin(a) * 28, c.edge, 1);
      }),
    ]),
    circle(573, 236, 7, c.deep, c.edge, 1),
    ...[45, 135, 225, 315].map(a => bolt(573 + 32 * Math.cos(a * Math.PI / 180), 236 + 32 * Math.sin(a * Math.PI / 180), 1.1)),
  ]));

  // Smooth roll faces, stationary hubs and subtle rotating witness marks.
  // The narrow gap remains visible. Do not let either roll overlap the other.
  function roll(part: 'roll-1' | 'roll-2', x: number, rotation: number): MillNode {
    return group(part, [
      circle(x, 510, 116, c.deep, c.edge, 2),
      circle(x, 510, 112, ref('shaft'), c.edge, .8),
      circle(x, 510, 105, ref('roll'), c.fine, 1),
      circle(x, 510, 96, 'none', c.fine, .65),
      // Machining rings are light surface detail, not grooves in the process surface.
      circle(x, 510, 90, 'none', c.fine, .3),
      n('g', { transform: `rotate(${rotation} ${x} 510)` }, [
        line(x, 405, x, 413, c.edge, 1.2),
        line(x, 607, x, 615, c.edge, 1.2),
        ...[45, 135, 225, 315].map(a => {
          const radians = a * Math.PI / 180;
          return line(x + 101 * Math.cos(radians), 510 + 101 * Math.sin(radians), x + 104 * Math.cos(radians), 510 + 104 * Math.sin(radians), c.fine, .8);
        }),
      ]),
    ]);
  }
  parts.push(roll('roll-1', 454, left), roll('roll-2', 692, right));
  const bearing = (part: 'bearing-1' | 'bearing-2', x: number) => group(part, [
    rect(x - 29, 481, 58, 58, ref('body'), 5, c.edge, 1.7),
    rect(x - 23, 487, 46, 46, 'none', 3, c.fine, .8),
    ...[[-21, -21], [21, -21], [-21, 21], [21, 21]].map(([dx, dy]) => bolt(x + dx, 510 + dy, 1.8)),
    circle(x, 510, 15, ref('shaft'), c.edge, 1), circle(x, 510, 9, c.deep, c.fine, .8),
    rect(x - 3, 500, 6, 4, c.body, .5, c.fine, .5),
  ]);
  parts.push(bearing('bearing-1', 454), bearing('bearing-2', 692));
  parts.push(group('scraper-1', [
    path('M 373 593 L 337 630 L 343 635 L 382 598 Z', ref('body'), c.edge, 1.2),
    bolt(345, 628, 2), line(339, 630, 331, 638, c.fine, 2),
  ]));
  parts.push(group('scraper-2', [
    path('M 773 593 L 809 630 L 803 635 L 764 598 Z', ref('body'), c.edge, 1.2),
    bolt(801, 628, 2), line(807, 630, 815, 638, c.fine, 2),
  ]));
  parts.push(group('discharge', [
    path('M 490 807 H 656 L 605 899 H 541 Z', ref('body'), c.edge, 1.8),
    path('M 502 815 H 644 L 600 891 H 546 Z', c.deep, c.fine, .8),
    path('M 556 819 H 590 L 584 890 H 562 Z', ref('material'), 'none', 0),
    rect(485, 800, 176, 9, ref('body'), 2),
    ...[493, 653].map(x => bolt(x, 804, 1.8)),
    rect(537, 899, 72, 9, ref('body'), 2), bolt(545, 903, 1.8), bolt(601, 903, 1.8),
  ]));
  parts.push(group('process-flow', [
    polygon('564,67 582,67 573,81', c.accent, 'none', 0),
    path('M 573 275 V 368', 'none', c.material, 2),
    polygon('567,365 579,365 573,378', c.accent, 'none', 0),
    path('M 573 632 V 780', 'none', c.material, 2),
    polygon('567,779 579,779 573,792', c.accent, 'none', 0),
    path('M 573 908 V 958 H 95', 'none', c.material, 2),
    polygon('98,951 85,958 98,965', c.accent, 'none', 0),
  ]));
  scene.push(n('g', {}, parts));
  if (showLabels) scene.push(n('g', {}, [
    label(573, 49, 'INLET / FEEDER', 15, 3),
    label(697, 134, 'HOPPER', 11, 1.6, 'start'),
    label(507, 240, 'FEED ROTOR', 10, 1.4, 'end'), line(516, 236, 536, 236),
    label(971, 183, 'FEEDER DRIVE', 11, 1.6),
    label(129, 463, 'ROLL DRIVE 01', 11, 1.5),
    label(129, 764, 'ROLL DRIVE 02', 11, 1.5),
    label(454, 566, 'ROLL 01', 11, 1.8), label(692, 566, 'ROLL 02', 11, 1.8),
    label(573, 394, 'ROLL GAP', 9, 1.2),
    label(360, 665, 'SCRAPER', 10, 1.4), label(790, 665, 'SCRAPER', 10, 1.4),
    label(1045, 570, 'ROLL ACTUATOR', 11, 1.5),
    label(1119, 385, 'ACCUMULATOR', 9, 1),
    label(1014, 813, 'AUXILIARY UNIT', 11, 1.5),
    label(709, 885, 'DISCHARGE', 11, 1.5, 'start'),
    label(233, 940, 'FLAKED MATERIAL', 13, 2.4),
  ]));
  return scene;
}
