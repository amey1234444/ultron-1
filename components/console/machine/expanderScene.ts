/** Expander X-101, detailed engineering-dashboard artwork.
 * Retains the supplied expander schematic's topology; styling follows the
 * detailed extruder template. This is an illustrative cutaway, not CAD.
 * All geometry and point anchors use the public 1200 x 760 drawing plane.
 *
 * The point and part registries are NOT defined here. They live in
 * `lib/expanderPoints.ts`, because `machineConnectors.ts` and `lib/machines.ts`
 * both read them and neither may import from `components/`. This file owns the
 * geometry; that one owns the vocabulary. The aliases below keep the template's
 * original export names working.
 */
import {
  EXPANDER_ARTWORK_HEIGHT,
  EXPANDER_ARTWORK_WIDTH,
  EXPANDER_PARTS,
  EXPANDER_POINT_REGISTRY,
  type ExpanderPartId,
  type ExpanderPointDefinition,
} from '../../../lib/expanderPoints';

export const EXPANDER_VIEWBOX_WIDTH = EXPANDER_ARTWORK_WIDTH;
export const EXPANDER_VIEWBOX_HEIGHT = EXPANDER_ARTWORK_HEIGHT;
export type PadState = 'idle' | 'linked' | 'live';
export type PartId = ExpanderPartId;
export interface SceneNode {
  tag: 'g' | 'rect' | 'line' | 'path' | 'polygon' | 'circle' | 'text'
    | 'defs' | 'clipPath' | 'linearGradient' | 'stop';
  attrs: Record<string, string | number>;
  children?: SceneNode[];
  text?: string;
  part?: PartId;
}
/**
 * A pad, as the geometry sees it.
 *
 * The registry entry carries a `kind` as well, which the drawing has no use
 * for and the canvas cannot work without.
 */
export type ExpanderConnector = ExpanderPointDefinition;
export const EXPANDER_CONNECTORS: readonly ExpanderConnector[] = EXPANDER_POINT_REGISTRY;
export { EXPANDER_PARTS, EXPANDER_POINT_REGISTRY };
export interface SceneOptions {
  idPrefix: string; dark?: boolean; showLabels?: boolean; showGrid?: boolean;
  screwRotation?: number; feederRotation?: number; conePosition?: number;
}
const node = (tag: SceneNode['tag'], attrs: SceneNode['attrs'], children?: SceneNode[]): SceneNode => ({ tag, attrs, children });
const finite = (x: number | undefined) => Number.isFinite(x) ? x! : 0;
const phase = (x: number | undefined, pitch: number) => ((finite(x) % 360 + 360) % 360) / 360 * pitch;
export const clampConePosition = (x?: number) => Math.max(0, Math.min(1, finite(x)));
export function buildPadScene(connector: ExpanderConnector, state: PadState, dark: boolean): SceneNode[] {
  const { x, y } = connector;
  return [
    node('circle', { cx: x, cy: y, r: 12, fill: 'transparent' }),
    ...(state === 'live' ? [node('circle', { cx: x, cy: y, r: 9, fill: 'none', stroke: '#3FBF6A', strokeWidth: 1.5, opacity: 0.65 })] : []),
    node('circle', { cx: x, cy: y, r: 7, fill: '#3FBF6A', opacity: 0.08 }),
    node('circle', { cx: x, cy: y, r: 4.5, fill: state === 'idle' ? (dark ? '#111318' : '#FFFFFF') : '#3FBF6A', stroke: '#3FBF6A', strokeWidth: 1.6 }),
  ];
}

/** Curved front/back half turns; a full turn advances one pitch seamlessly. */
function flight(x: number, top: number, bottom: number, pitch: number, width: number, front: boolean): string {
  const a = front ? top : bottom, b = front ? bottom : top;
  return `M ${x} ${a} C ${x + pitch * .19} ${a} ${x + pitch * .31} ${b} ${x + pitch * .5} ${b}`
    + ` L ${x + pitch * .5 + width} ${b} C ${x + pitch * .31 + width} ${b} ${x + pitch * .19 + width} ${a} ${x + width} ${a} Z`;
}
export function buildExpanderScene(options: SceneOptions): SceneNode[] {
  const { idPrefix, dark = true, showLabels = true, showGrid = true } = options;
  const c = {
    panel: dark ? '#090B0D' : '#F8FAFC',
    body: dark ? '#1B1F26' : '#E0E5EB', raised: dark ? '#292F39' : '#FAFBFC',
    deep: dark ? '#0C0F13' : '#BFC7D1', edge: dark ? '#828995' : '#525D6C',
    fine: dark ? '#3A404B' : '#9CA7B4', muted: dark ? '#A3A8B1' : '#515F71',
    grid: dark ? '#1A1E23' : '#DDE3EB', screw: dark ? '#535B68' : '#8996A7',
    screwLit: dark ? '#808B9B' : '#DCE2E9', screwDark: dark ? '#272D37' : '#657283',
    accent: '#3FBF6A', injection: dark ? '#AD665E' : '#B55045',
    auxiliary: dark ? '#776991' : '#80639B', material: dark ? '#AC8846' : '#CDA357',
  };
  const ref = (name: string) => `url(#${idPrefix}-${name})`;
  const rect = (x: number, y: number, width: number, height: number, fill = ref('body'), rx = 2, stroke = c.edge, strokeWidth = 1.5) =>
    node('rect', { x, y, width, height, rx, fill, stroke, strokeWidth });
  const line = (x1: number, y1: number, x2: number, y2: number, stroke = c.fine, strokeWidth = 1) =>
    node('line', { x1, y1, x2, y2, stroke, strokeWidth, strokeLinecap: 'round' });
  const path = (d: string, fill = 'none', stroke = c.edge, strokeWidth = 1.5) =>
    node('path', { d, fill, stroke, strokeWidth, strokeLinejoin: 'round' });
  const circle = (cx: number, cy: number, r: number, fill = c.deep, stroke = c.fine, strokeWidth = 1) =>
    node('circle', { cx, cy, r, fill, stroke, strokeWidth });
  const bolt = (x: number, y: number, r = 2.4) => circle(x, y, r);
  const polygon = (points: string, fill = ref('body'), stroke = c.edge, strokeWidth = 1.5) =>
    node('polygon', { points, fill, stroke, strokeWidth });
  const group = (part: PartId, children: SceneNode[], attrs: SceneNode['attrs'] = {}): SceneNode => ({ tag: 'g', attrs, children, part });
  const label = (x: number, y: number, text: string, size = 11, spacing = 1.8, anchor = 'middle'): SceneNode => ({
    tag: 'text', attrs: { x, y, fill: c.muted, fontFamily: 'sans-serif', fontSize: size,
      fontWeight: 600, letterSpacing: spacing, textAnchor: anchor }, text,
  });
  const gradient = (name: string, stops: [number, string][], horizontal = false): SceneNode =>
    node('linearGradient', { id: `${idPrefix}-${name}`, x1: '0%', y1: '0%', x2: horizontal ? '100%' : '0%', y2: horizontal ? '0%' : '100%' },
      stops.map(([offset, stopColor]) => node('stop', { offset, stopColor })));
  const definitions: SceneNode[] = [
    gradient('body', [[0, c.raised], [.48, c.body], [1, dark ? '#171B22' : '#D3DAE3']]),
    gradient('cylinder', [[0, c.body], [.22, c.raised], [.55, c.body], [1, c.deep]]),
    gradient('shaft', [[0, c.screwDark], [.24, c.screw], [.39, c.screwLit], [.56, c.screw], [1, c.screwDark]]),
    gradient('flight', [[0, c.screwLit], [.18, c.screw], [.52, c.screw], [.84, c.screwDark], [1, c.screw]]),
    gradient('material', [[0, dark ? '#B3965A' : '#DDB970'], [1, dark ? '#6A4D16' : '#AD7928']]),
    node('clipPath', { id: `${idPrefix}-main-bore` }, [rect(391, 417, 562, 59, 'white', 5, 'none', 0)]),
    node('clipPath', { id: `${idPrefix}-feeder-bore` }, [rect(403, 251, 238, 30, 'white', 3, 'none', 0)]),
    node('clipPath', { id: `${idPrefix}-walls` }, [rect(378, 400, 580, 15, 'white', 0, 'none', 0), rect(378, 478, 580, 14, 'white', 0, 'none', 0)]),
  ];
  const scene: SceneNode[] = [node('defs', {}, definitions)];
  if (showGrid) scene.push(node('g', { opacity: .42 }, [
    ...Array.from({ length: 21 }, (_, i) => line(i * 60, 0, i * 60, 760, c.grid, i % 5 === 0 ? 1.1 : .65)),
    ...Array.from({ length: 13 }, (_, i) => line(0, i * 60, 1200, i * 60, c.grid, i % 5 === 0 ? 1.1 : .65)),
  ]));
  const cone = clampConePosition(options.conePosition) * 14;
  const parts: SceneNode[] = [];

  // Auxiliary circuits remain distinct, underneath the mechanical assemblies.
  parts.push(group('auxiliary-unit', [
    path('M 250 522 V 609 M 300 522 V 609', 'none', c.auxiliary, 1.6),
    ...[250, 300].flatMap(x => [rect(x - 4, 531, 8, 8, ref('body'), 1), rect(x - 4, 601, 8, 8, ref('body'), 1)]),
    rect(228, 609, 94, 64, ref('body'), 6), rect(236, 617, 78, 48, 'none', 3, c.fine, .8),
    rect(243, 627, 28, 17, c.deep, 2, c.fine, 1),
    circle(292, 635, 9, c.deep, c.edge, 1.2), line(292, 635, 296, 630, c.muted, 1.2),
    ...[249, 260, 271, 282, 293, 304].map(x => line(x, 654, x + 4, 654)),
    bolt(242, 619, 1.5), bolt(308, 660, 1.5),
  ]));
  parts.push(group('actuator-unit', [
    path(`M ${1060 + cone} 463 V 563 H 1115 V 609`, 'none', c.auxiliary, 1.6),
    rect(1071, 609, 88, 63, ref('body'), 6), rect(1078, 616, 74, 49, 'none', 3, c.fine, .8),
    rect(1086, 625, 35, 19, c.deep, 2, c.fine, 1),
    circle(1136, 635, 6, c.deep, c.edge), line(1087, 654, 1141, 654),
    ...[[1080, 619], [1149, 660]].map(([x, y]) => bolt(x, y, 1.5)),
    rect(1111, 601, 8, 8, ref('body'), 1),
  ]));

  // Continuous, aligned main drive: motor -> flexible coupling -> gearbox -> screw.
  parts.push(group('coupling', [
    rect(177, 439, 37, 12, ref('shaft'), 1, c.fine, 1),
    rect(185, 423, 22, 44, ref('body'), 4),
    rect(189, 430, 5, 30, c.deep, 1, c.fine, .8), rect(198, 430, 5, 30, c.deep, 1, c.fine, .8),
    rect(340, 437, 42, 16, ref('shaft'), 1),
  ]));
  parts.push(group('main-motor', [
    rect(34, 408, 17, 79, ref('body'), 5),
    ...[418, 430, 442, 454, 466, 478].map(y => line(38, y, 46, y)),
    rect(50, 396, 127, 103, ref('cylinder'), 14, c.edge, 1.8),
    path('M 62 400 H 160 Q 173 400 173 413 V 482', 'none', c.fine, .8),
    line(57, 412, 57, 483, c.fine, .8),
    rect(172, 419, 6, 52, ref('body'), 2, c.fine, .9),
    ...Array.from({ length: 9 }, (_, i) => line(63, 406 + i * 10, 163, 406 + i * 10, c.fine, 1.3)),
    rect(88, 425, 35, 26, c.deep, 2, c.fine, 1),
    line(94, 433, 116, 433, c.fine, .65), line(94, 439, 111, 439, c.fine, .65),
    bolt(92, 447, 1), bolt(119, 429, 1),
    rect(84, 377, 54, 19, ref('body'), 3), line(111, 377, 111, 396),
    rect(55, 499, 118, 11, ref('body'), 2),
    rect(65, 510, 30, 17, ref('body'), 2), rect(135, 510, 30, 17, ref('body'), 2),
    bolt(80, 519), bolt(150, 519),
  ]));
  parts.push(group('gearbox', [
    rect(214, 363, 126, 160, ref('body'), 10, c.edge, 1.8),
    rect(226, 375, 102, 136, 'none', 5, c.fine, 1),
    rect(244, 350, 30, 13, ref('body'), 3),
    rect(238, 389, 57, 17, c.deep, 1, c.fine, .8),
    line(227, 445, 327, 445),
    path('M 230 431 V 412 H 323 V 431 M 230 456 V 480 H 322 V 456', 'none', c.fine, .8),
    ...[248, 254, 260, 266].map(x => line(x, 354, x, 359, c.fine, .7)),
    line(244, 395, 288, 395, c.fine, .6), line(244, 400, 271, 400, c.fine, .6),
    circle(277, 445, 12, c.deep, c.edge, 1.6), circle(277, 445, 4.5, c.body),
    ...[[227, 376], [327, 376], [227, 510], [327, 510]].map(([x, y]) => bolt(x, y, 3.8)),
    circle(278, 493, 10, c.deep, c.edge, 1.5),
    circle(278, 493, 6.4, c.body, c.fine, .65),
    path('M 272 494 H 284', 'none', c.material, 1.2),
    rect(223, 523, 108, 9, ref('body'), 2),
    // Bearing / thrust housing bridges the gearbox directly to the barrel.
    rect(340, 408, 38, 76, ref('body'), 4),
    rect(374, 403, 6, 86, ref('body'), 1, c.edge, 1),
    line(344, 434, 344, 458, c.fine, .8),
    ...[[348, 416], [370, 416], [348, 476], [370, 476]].map(([x, y]) => bolt(x, y, 2)),
  ]));

  // Hopper retains the red internal bar. Rounded rim and visible material use
  // the richer visual language of the supplied extruder without changing flow.
  parts.push(group('hopper', [
    rect(452, 77, 136, 17, ref('body'), 9, c.edge, 1.8),
    rect(458, 94, 124, 77, ref('body'), 3, c.edge, 1.8),
    line(463, 83, 577, 83, c.fine, .8),
    line(463, 99, 463, 167, c.fine, .7), line(577, 99, 577, 167, c.fine, .7),
    path('M 458 171 H 582 L 540 226 H 500 Z', ref('body'), c.edge, 1.8),
    path('M 464 174 L 503 222 M 576 174 L 537 222', 'none', c.fine, .7),
    path('M 467 144 Q 520 129 573 144 V 170 L 535 224 H 505 L 467 170 Z', ref('material'), 'none', 0),
    rect(476, 105, 88, 6, c.injection, 1, c.fine, .8),
    rect(500, 226, 40, 16, ref('body'), 2),
    rect(505, 227, 30, 15, ref('material'), 0, 'none', 0),
    rect(493, 238, 54, 7, ref('body'), 1), bolt(497, 241, 1.5), bolt(543, 241, 1.5),
  ]));
  parts.push(group('feed-chute', [
    rect(396, 289, 51, 111, ref('body'), 2),
    rect(403, 291, 37, 106, c.deep, 0, c.fine, .8),
    rect(411, 291, 21, 108, ref('material'), 0, 'none', 0),
    rect(389, 389, 65, 11, ref('body'), 2), bolt(395, 394, 2), bolt(448, 394, 2),
  ]));
  const feederPitch = 24, feederPhase = phase(options.feederRotation, feederPitch);
  parts.push(group('feeder', [
    rect(394, 244, 255, 45, ref('cylinder'), 5, c.edge, 1.7),
    rect(402, 251, 239, 30, c.deep, 3, c.accent, .6),
    node('g', { clipPath: ref('feeder-bore') }, [
      ...Array.from({ length: 14 }, (_, i) => path(flight(379 + i * feederPitch + feederPhase + 12, 252, 280, feederPitch, 3, false), c.screwDark, c.fine, .5)),
      rect(393, 261, 258, 10, ref('shaft'), 0, c.fine, .5),
      ...Array.from({ length: 14 }, (_, i) => path(flight(379 + i * feederPitch + feederPhase, 252, 280, feederPitch, 3, true), ref('flight'), c.edge, .6)),
    ]),
    rect(389, 240, 6, 53, ref('body'), 1), rect(649, 240, 6, 53, ref('body'), 1),
    ...[394, 650].flatMap(x => [bolt(x, 245, 1.5), bolt(x, 288, 1.5)]),
  ]));
  parts.push(group('feeder-motor', [
    rect(655, 263, 14, 7, ref('shaft'), 1, c.fine, .8),
    rect(661, 255, 7, 23, ref('body'), 2),
    rect(669, 247, 57, 39, ref('cylinder'), 6), rect(726, 251, 8, 31, ref('body'), 2),
    ...[254, 260, 266, 272, 278].map(y => line(675, y, 719, y, c.fine, .8)),
    rect(685, 237, 23, 10, ref('body'), 2),
    rect(676, 287, 42, 5, ref('body'), 1),
  ]));

  // Sectioned barrel with curved helix. Four clamp pairs are clamps, not
  // imported extruder heating zones. The root radius is constant here.
  parts.push(group('barrel', [
    rect(378, 400, 580, 92, ref('cylinder'), 9, c.edge, 1.8),
    node('g', { clipPath: ref('walls'), opacity: .6 },
      Array.from({ length: 76 }, (_, i) => line(370 + i * 8, 498, 403 + i * 8, 394, c.fine, .7))),
    rect(390, 415, 564, 63, c.deep, 5, c.accent, .8),
    node('g', { clipPath: ref('main-bore') }, [
      path('M 421 473 L 953 422 V 476 H 421 Z', ref('material'), 'none', 0),
    ]),
    // Outer longitudinal joint rails remain separate from the cutaway wall.
    line(388, 403, 950, 403, c.edge, .65),
    line(388, 489, 950, 489, c.fine, .8),
    ...[493, 611, 729, 847].flatMap(x => [line(x, 400, x, 415), line(x, 478, x, 492)]),
  ]));
  const mainPitch = 37, mainPhase = phase(options.screwRotation, mainPitch);
  parts.push(group('main-screw', [
    node('g', { clipPath: ref('main-bore') }, [
      ...Array.from({ length: 19 }, (_, i) => path(flight(353 + i * mainPitch + mainPhase + mainPitch / 2, 417, 476, mainPitch, 6, false), c.screwDark, c.fine, .6)),
      rect(376, 434, 590, 25, ref('shaft'), 0, c.fine, .7),
      ...Array.from({ length: 19 }, (_, i) => {
        const x = 353 + i * mainPitch + mainPhase;
        return node('g', {}, [
          path(flight(x, 417, 476, mainPitch, 6, true), ref('flight'), c.edge, .65),
          path(`M ${x + 1} 418 C ${x + mainPitch * .19 + 1} 418 ${x + mainPitch * .31 + 1} 475 ${x + mainPitch * .5 + 1} 475`,
            'none', c.screwLit, .5),
        ]);
      }),
    ]),
  ]));
  parts.push(group('barrel-clamps', [
    ...[502, 620, 738, 856].flatMap(x => [
      rect(x - 9, 389, 18, 27, ref('body'), 2),
      rect(x - 9, 478, 18, 27, ref('body'), 2),
      line(x - 4, 401, x + 4, 401, c.fine, .8),
      bolt(x, 395, 2), bolt(x, 498, 2),
    ]),
  ]));

  // Supply manifold: same three top entry points and right-to-left flow.
  parts.push(group('injection-manifold', [
    path('M 824 333 H 560 V 386 M 678 333 V 386 M 796 333 V 386', 'none', c.injection, 2),
    line(1134, 333, 894, 333, c.injection, 2),
    polygon('908,328 896,333 908,338', c.injection, c.injection, .5),
    ...[560, 678, 796].flatMap(x => [
      rect(x - 4, 379, 8, 8, ref('body'), 1, c.edge, 1),
      rect(x - 7, 386, 14, 14, ref('body'), 2),
      line(x - 4, 392, x + 4, 392, c.injection, 2),
      bolt(x - 4, 397, 1), bolt(x + 4, 397, 1),
    ]),
  ]));
  parts.push(group('control-valve', [
    line(824, 333, 844, 333, c.injection, 2), line(878, 333, 894, 333, c.injection, 2),
    polygon('844,321 878,345 878,321 844,345', ref('body'), c.edge, 1.5),
    line(861, 332, 861, 306, c.edge, 1.5),
    path('M 845 306 A 16 16 0 0 1 877 306 Z', ref('body'), c.edge, 1.5),
    rect(840, 324, 4, 18, ref('body'), 1), rect(878, 324, 4, 18, ref('body'), 1),
  ]));

  // The discharge remains beneath the cone; it is not an extruder die.
  parts.push(group('discharge-chute', [
    path('M 958 515 H 1033 L 1017 648 H 974 Z', ref('body'), c.edge, 1.8),
    path('M 970 523 H 1022 L 1009 640 H 982 Z', c.deep, c.fine, .7),
    path('M 990 520 H 1004 L 1003 640 H 991 Z', ref('material'), 'none', 0),
    rect(971, 648, 49, 8, ref('body'), 2), bolt(977, 652, 1.5), bolt(1014, 652, 1.5),
  ]));
  parts.push(group('outlet-flange', [
    rect(958, 380, 21, 136, ref('body'), 4, c.edge, 1.8),
    ...[389, 416, 478, 506].map(y => bolt(968.5, y, 3.2)),
    line(963, 384, 963, 511, c.fine, .7),
  ]));
  parts.push(group('outlet-cone', [
    path('M 982 446 L 1020 413 V 479 Z', ref('shaft'), c.edge, 1.7),
    line(987, 446, 1020, 446, c.fine, .8),
    line(1016, 418, 1016, 474, c.fine, .8),
  ], { transform: `translate(${cone} 0)` }));
  parts.push(group('cone-actuator', [
    rect(1020, 429, 72, 34, ref('cylinder'), 3),
    rect(1020, 426, 7, 40, ref('body'), 2), rect(1085, 426, 7, 40, ref('body'), 2),
    rect(1092, 443, 24, 6, ref('shaft'), 1, c.fine, .7),
    line(1030, 435, 1082, 435, c.fine, .8), line(1030, 457, 1082, 457, c.fine, .8),
    ...[[1023, 431], [1023, 461], [1088, 431], [1088, 461]].map(([x, y]) => bolt(x, y, 1.3)),
  ], { transform: `translate(${cone} 0)` }));
  parts.push(group('process-flow', [
    polygon('511,65 529,65 520,76', c.accent, 'none', 0),
    // Down-flow marker below feeder, and discharge arrow below the chute.
    polygon('416,352 426,352 421,361', c.accent, 'none', 0),
    path('M 997 656 V 706 H 1122', 'none', c.material, 2),
    polygon('1121,699 1134,706 1121,713', c.accent, 'none', 0),
  ]));
  scene.push(node('g', {}, parts));
  if (showLabels) scene.push(node('g', {}, [
    label(520, 48, 'INLET / FEEDER', 15, 3),
    label(615, 154, 'HOPPER', 11, 1.8, 'start'),
    label(535, 309, 'FEEDER SCREW', 11, 1.5),
    label(709, 222, 'FEEDER DRIVE', 11, 1.5),
    label(377, 333, 'FEED', 10, 1.5, 'end'), line(382, 329, 396, 329),
    label(699, 321, 'INJECTION MANIFOLD', 11, 1.4),
    label(858, 278, 'CONTROL VALVE', 10, 1.3),
    label(1067, 316, 'PROCESS SUPPLY', 10, 1.7),
    label(112, 556, 'MOTOR', 12, 2), label(276, 336, 'GEAR BOX', 12, 2),
    label(464, 552, 'BARREL', 11, 2), label(758, 552, 'SCREW', 11, 2),
    label(1007, 385, 'CONE', 11, 1.5), path('M 1007 392 V 421', 'none', c.fine, .8),
    label(1065, 404, 'ACTUATOR', 11, 1.4),
    label(275, 696, 'AUXILIARY UNIT', 10, 1.4),
    label(1115, 695, 'ACTUATOR UNIT', 10, 1.2),
    label(968, 737, 'DISCHARGE', 15, 3),
  ]));
  return scene;
}
