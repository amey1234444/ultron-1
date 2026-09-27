/** Conditioner E-102, detailed engineering-dashboard artwork.
 * A vertical six-deck steam conditioner with its steam header, vapour
 * extraction and discharge. Illustrative cutaway, not CAD.
 *
 * Stage is 1200 x 1000; preserve that aspect ratio rather than stretching the
 * machine onto the expander's wider stage.
 *
 * The part vocabulary and the point registry live in
 * `lib/conditionerPoints.ts`, because `machineConnectors.ts` and
 * `lib/machines.ts` both read them and neither may import from `components/`.
 * This file owns the geometry; that one owns the vocabulary.
 */
import {
  CONDITIONER_ARTWORK_HEIGHT,
  CONDITIONER_ARTWORK_WIDTH,
  CONDITIONER_PART_LABELS,
  type ConditionerPartIdentifier,
} from '../../../lib/conditionerPoints';

export const CONDITIONER_VIEWBOX_WIDTH = CONDITIONER_ARTWORK_WIDTH;
export const CONDITIONER_VIEWBOX_HEIGHT = CONDITIONER_ARTWORK_HEIGHT;
export type ConditionerPartId = ConditionerPartIdentifier;
export interface ConditionerNode {
  tag: 'g' | 'rect' | 'line' | 'path' | 'polygon' | 'circle' | 'text'
    | 'defs' | 'clipPath' | 'linearGradient' | 'radialGradient' | 'stop';
  attrs: Record<string, string | number>; children?: ConditionerNode[];
  text?: string; part?: ConditionerPartId;
}
export interface ConditionerSceneOptions {
  idPrefix: string; dark?: boolean; showGrid?: boolean; showLabels?: boolean;
  agitatorRotation?: number; fanRotation?: number;
  /** Illustrative fill fractions for decks 1-6, not measured defaults. */
  deckLevels?: readonly number[];
}
export const CONDITIONER_PARTS = CONDITIONER_PART_LABELS;
const n = (tag: ConditionerNode['tag'], attrs: ConditionerNode['attrs'], children?: ConditionerNode[]): ConditionerNode => ({ tag, attrs, children });
const finite = (v: number | undefined, fallback = 0) => Number.isFinite(v) ? v! : fallback;
const phase = (v?: number) => ((finite(v) % 360) + 360) % 360;
export function buildConditionerScene(options: ConditionerSceneOptions): ConditionerNode[] {
  const { idPrefix, dark = true, showLabels = true, showGrid = true } = options;
  const c = { body: dark ? '#1B222B' : '#DEE5ED', raised: dark ? '#2C3643' : '#FBFCFD',
    deep: dark ? '#0B1016' : '#BFCBD8', edge: dark ? '#85919F' : '#546779',
    fine: dark ? '#3C4856' : '#A3B2C1', text: dark ? '#AAB2BD' : '#4F6275',
    grid: dark ? '#212A35' : '#DBE3EC', steam: dark ? '#BE7468' : '#BD5548',
    water: dark ? '#569AA5' : '#267F8B', material: '#AE8B4D', accent: '#3FBF6A',
    steel: dark ? '#657587' : '#B1C0D0' };
  const ref = (name: string) => `url(#${idPrefix}-${name})`;
  const rect = (x: number, y: number, width: number, height: number, fill = ref('body'), rx = 2, stroke = c.edge, strokeWidth = 1.4) => n('rect', { x, y, width, height, rx, fill, stroke, strokeWidth });
  const line = (x1: number, y1: number, x2: number, y2: number, stroke = c.fine, strokeWidth = 1) => n('line', { x1, y1, x2, y2, stroke, strokeWidth, strokeLinecap: 'round' });
  const path = (d: string, fill = 'none', stroke = c.edge, strokeWidth = 1.4) => n('path', { d, fill, stroke, strokeWidth, strokeLinejoin: 'round' });
  const polygon = (points: string, fill: string, stroke = c.edge, strokeWidth = 1.4) => n('polygon', { points, fill, stroke, strokeWidth });
  const circle = (cx: number, cy: number, r: number, fill = c.deep, stroke = c.fine, strokeWidth = 1) => n('circle', { cx, cy, r, fill, stroke, strokeWidth });
  const bolt = (x: number, y: number, r = 2) => circle(x, y, r);
  const group = (part: ConditionerPartId, children: ConditionerNode[]): ConditionerNode => ({ tag: 'g', attrs: {}, children, part });
  const label = (x: number, y: number, text: string, size = 10, spacing = 1.4, anchor = 'middle'): ConditionerNode => ({ tag: 'text', attrs: { x, y, fill: c.text, fontFamily: 'sans-serif', fontSize: size, fontWeight: 600, letterSpacing: spacing, textAnchor: anchor }, text });
  const gradient = (name: string, stops: [number, string][], horizontal = false): ConditionerNode => n('linearGradient', { id: `${idPrefix}-${name}`, x1: '0%', y1: '0%', x2: horizontal ? '100%' : '0%', y2: horizontal ? '0%' : '100%' }, stops.map(([offset, stopColor]) => n('stop', { offset, stopColor })));
  const defs: ConditionerNode[] = [
    gradient('body', [[0, c.raised], [.6, c.body], [1, dark ? '#151C24' : '#CFD9E4']]),
    gradient('cylinder', [[0, c.body], [.25, c.raised], [.6, c.body], [1, c.deep]]),
    gradient('shaft', [[0, c.deep], [.38, c.steel], [.55, c.steel], [1, c.body]], true),
    gradient('material', [[0, dark ? '#B89D65' : '#DFC180'], [1, dark ? '#705320' : '#AF8037']]),
    gradient('deck', [[0, dark ? '#A36C60' : '#DCAEA2'], [.35, c.body], [1, dark ? '#513B38' : '#C58F82']]),
    n('radialGradient', { id: `${idPrefix}-fan`, cx: '35%', cy: '30%', r: '75%' }, [n('stop', { offset: 0, stopColor: c.steel }), n('stop', { offset: 1, stopColor: c.body })]),
  ];
  const scene: ConditionerNode[] = [n('defs', {}, defs)];
  if (showGrid) scene.push(n('g', { opacity: .4 }, [
    ...Array.from({ length: 21 }, (_, i) => line(i * 60, 0, i * 60, 1000, c.grid, i % 5 ? .6 : 1)),
    ...Array.from({ length: 17 }, (_, i) => line(0, i * 60, 1200, i * 60, c.grid, i % 5 ? .6 : 1)),
  ]));
  const parts: ConditionerNode[] = [];
  const deckYs = [335, 423, 511, 599, 687, 775];
  const valve = (x: number, y: number, colour: string): ConditionerNode[] => [
    polygon(`${x - 9},${y - 7} ${x + 9},${y + 7} ${x + 9},${y - 7} ${x - 9},${y + 7}`, ref('body'), c.edge, 1.2),
    line(x - 13, y, x - 9, y, colour, 1.7), line(x + 9, y, x + 13, y, colour, 1.7),
  ];
  const motor = (x: number, y: number, w: number, h: number): ConditionerNode[] => [
    rect(x, y, w, h, ref('cylinder'), 6), rect(x + w, y + 4, 7, h - 8, ref('body'), 2),
    ...Array.from({ length: 5 }, (_, i) => line(x + 7, y + 6 + i * (h - 12) / 4, x + w - 6, y + 6 + i * (h - 12) / 4, c.fine, .8)),
    rect(x + w * .32, y - 10, w * .36, 10, ref('body'), 2),
    rect(x + 5, y + h, w - 10, 5, ref('body'), 1),
  ];

  // Indirect heating circuit: six steam supply branches on the right.
  parts.push(group('steam-header', [
    path('M 1134 282 H 780 V 782', 'none', c.steam, 2),
    polygon('1115,277 1104,282 1115,287', c.steam, 'none', 0),
    ...deckYs.flatMap(y => [line(705, y + 6, 780, y + 6, c.steam, 1.8), ...valve(739, y + 6, c.steam)]),
  ]));
  parts.push(group('steam-inline-device', [
    rect(978, 259, 44, 47, ref('body'), 7), rect(974, 276, 4, 12, ref('body'), 1), rect(1022, 276, 4, 12, ref('body'), 1),
    // Deliberately no separator/filter internals: the source does not identify this unit.
    rect(986, 266, 28, 33, 'none', 4, c.fine, .8),
  ]));
  parts.push(group('steam-control-valve', [
    ...valve(887, 282, c.steam), line(887, 281, 887, 256, c.edge, 1.3),
    path('M 871 256 A 16 16 0 0 1 903 256 Z', ref('body'), c.edge, 1.4),
    rect(869, 274, 5, 16, ref('body'), 1), rect(900, 274, 5, 16, ref('body'), 1),
  ]));
  parts.push(group('condensate-return', [
    path('M 302 341 V 899 H 178', 'none', c.water, 1.8),
    polygon('180,894 169,899 180,904', c.water, 'none', 0),
    ...deckYs.flatMap(y => [
      line(312, y + 6, 385, y + 6, c.water, 1.6),
      circle(312, y + 6, 9, ref('body'), c.edge, 1.3),
      // Generic drain device preserves the circle; trap type is not invented.
      circle(312, y + 6, 5.5, 'none', c.fine, .7),
    ]),
  ]));

  // Main shell in section. Six alternating openings remain visible at the ends.
  parts.push(group('vessel', [
    rect(385, 235, 320, 586, ref('body'), 14, c.edge, 1.9),
    rect(393, 244, 304, 570, c.deep, 8, c.fine, .8),
    line(388, 253, 388, 801, c.fine, .7), line(702, 253, 702, 801, c.fine, .7),
    ...[320, 408, 496, 584, 672, 760].flatMap(y => [
      rect(382, y, 7, 7, ref('body'), 1, c.fine, .7), rect(701, y, 7, 7, ref('body'), 1, c.fine, .7),
      bolt(385.5, y + 3.5, 1.1), bolt(704.5, y + 3.5, 1.1),
    ]),
    rect(492, 225, 106, 10, ref('body'), 2), bolt(500, 230, 2), bolt(590, 230, 2),
  ]));
  parts.push(group('agitator-drive', [
    rect(491, 168, 105, 57, ref('body'), 6, c.edge, 1.6),
    rect(499, 176, 89, 41, 'none', 3, c.fine, .8),
    rect(510, 183, 33, 12, c.deep, 1, c.fine, .7),
    ...[[499, 175], [588, 175], [499, 217], [588, 217]].map(([x, y]) => bolt(x, y, 2)),
    circle(572, 202, 6, c.deep, c.edge, 1),
    rect(596, 191, 17, 8, ref('shaft'), 1),
    ...motor(613, 175, 60, 41),
    rect(533, 215, 24, 19, ref('body'), 3),
  ]));

  // Vapour extraction is separate from the top injection and heating steam.
  parts.push(group('vapour-duct', [
    path('M 685 235 V 106 H 804', 'none', c.edge, 5),
    path('M 685 235 V 106 H 804', 'none', c.fine, 2),
    rect(678, 228, 14, 7, ref('body'), 1),
    rect(680, 131, 10, 5, ref('body'), 1),
    polygon('789,101 800,106 789,111', c.edge, 'none', 0),
    line(839, 70, 839, 40, c.edge, 3), polygon('833,43 839,30 845,43', c.edge, 'none', 0),
  ]));
  const fanAngle = phase(options.fanRotation);
  parts.push(group('exhaust-fan', [
    circle(839, 106, 35, ref('body'), c.edge, 1.8), circle(839, 106, 29, ref('fan'), c.fine, .8),
    n('g', { transform: `rotate(${fanAngle} 839 106)` }, [
      ...[0, 120, 240].map(a => n('g', { transform: `rotate(${a} 839 106)` }, [
        path('M 841 103 Q 852 83 863 92 Q 867 101 844 109 Z', ref('shaft'), c.edge, .7),
      ])),
    ]), circle(839, 106, 6, c.deep, c.edge, 1),
    ...[45, 135, 225, 315].map(a => bolt(839 + 32 * Math.cos(a * Math.PI / 180), 106 + 32 * Math.sin(a * Math.PI / 180), 1.4)),
  ]));
  parts.push(group('fan-drive', [rect(874, 102, 20, 8, ref('shaft'), 1), ...motor(894, 87, 55, 38)]));

  // Independent top conditioning injection: water or direct steam is unknown.
  parts.push(group('top-injection', [
    path('M 64 279 H 457', 'none', c.water, 1.8), ...valve(188, 279, c.water),
    polygon('445,274 457,279 445,284', c.water, 'none', 0),
    ...[465, 485, 505].map(x => polygon(`${x - 4},291 ${x},283 ${x + 4},291`, c.water, 'none', 0)),
  ]));

  // Hollow steam decks, material layers and individual stirrer arms.
  const rotation = phase(options.agitatorRotation);
  const reach = .40 + .60 * Math.abs(Math.cos(rotation * Math.PI / 180));
  for (let i = 0; i < 6; i++) {
    const y = deckYs[i], opensRight = i % 2 === 0;
    const left = opensRight ? 393 : 434, right = opensRight ? 656 : 697;
    const level = Math.max(0, Math.min(1, finite(options.deckLevels?.[i], .66)));
    const h = level * 29;
    const armLeft = 545 - 101 * reach, armRight = 545 + 101 * reach;
    parts.push(group(`deck-${i + 1}` as ConditionerPartId, [
      rect(left, y - h, right - left, h, ref('material'), 0, 'none', 0),
      rect(left, y, right - left, 13, ref('deck'), 1, c.steam, 1.1),
      rect(left + 5, y + 4, right - left - 10, 5, c.deep, 0, c.fine, .6),
      ...Array.from({ length: 9 }, (_, k) => line(left + 15 + k * 28, y + 4, left + 15 + k * 28, y + 9, c.fine, .6)),
      // Full-width backs of arms remain in the reference plane; projection
      // varies with angle rather than rotating the whole arm vertically.
      path(`M ${armLeft} ${y - 24} L 545 ${y - 20} L ${armRight} ${y - 24} L ${armRight} ${y - 19} L 545 ${y - 15} L ${armLeft} ${y - 19} Z`, ref('shaft'), c.edge, .85),
      rect(536, y - 28, 18, 16, ref('body'), 2, c.edge, 1),
      bolt(540, y - 20, 1.3), bolt(550, y - 20, 1.3),
      // Alternate side drops carry material through all six stages.
      line(opensRight ? 676 : 412, y - 2, opensRight ? 676 : 412, (i === 5 ? y + 28 : y + 51), c.material, 1.8),
      polygon(opensRight ? `671,${y + 47} 681,${y + 47} 676,${y + 58}` : `407,${i === 5 ? y + 25 : y + 47} 417,${i === 5 ? y + 25 : y + 47} 412,${i === 5 ? y + 36 : y + 58}`, c.material, 'none', 0),
    ]));
  }
  parts.push(group('agitator-shaft', [
    rect(541, 224, 8, 588, ref('shaft'), 2, c.edge, .6),
    rect(535, 804, 20, 12, ref('body'), 2), bolt(539, 810, 1), bolt(551, 810, 1),
  ]));
  parts.push(group('discharge-cone', [
    path('M 385 819 H 705 L 587 867 H 503 Z', ref('body'), c.edge, 1.8),
    path('M 402 823 H 688 L 582 859 H 508 Z', c.deep, c.fine, .7),
    path('M 515 824 H 574 L 566 859 H 524 Z', ref('material'), 'none', 0),
    rect(383, 814, 324, 8, ref('body'), 2), bolt(392, 818, 1.8), bolt(698, 818, 1.8),
  ]));
  parts.push(group('discharge-device', [
    rect(503, 867, 84, 42, ref('body'), 3, c.edge, 1.6),
    rect(500, 863, 90, 7, ref('body'), 1), rect(500, 907, 90, 7, ref('body'), 1),
    circle(545, 889, 14, ref('shaft'), c.edge, 1.2), circle(545, 889, 9, c.deep, c.fine, .7),
    ...[[509, 876], [581, 876], [509, 901], [581, 901]].map(([x, y]) => bolt(x, y, 1.5)),
  ]));
  parts.push(group('discharge-drive', [
    rect(465, 885, 38, 7, ref('shaft'), 1), ...motor(403, 872, 62, 34),
  ]));
  parts.push(group('material-flow', [
    path('M 64 208 H 417 V 309', 'none', c.material, 2.3),
    polygon('411,307 423,307 417,319', c.material, 'none', 0),
    path('M 545 914 V 963 H 1071', 'none', c.material, 2.3),
    polygon('1068,957 1080,963 1068,969', c.accent, 'none', 0),
  ]));
  scene.push(n('g', {}, parts));
  if (showLabels) scene.push(n('g', {}, [
    label(66, 194, 'MATERIAL INLET', 11, 1.7, 'start'),
    label(64, 263, 'TOP INJECTION*', 10, 1.4, 'start'),
    label(546, 151, 'AGITATOR DRIVE', 11, 1.8),
    label(752, 86, 'VAPOUR DUCT', 9, 1),
    label(852, 160, 'EXHAUST FAN', 10, 1.3),
    label(928, 148, 'MOTOR', 9, 1.2),
    label(932, 214, 'HEATING STEAM', 12, 2),
    label(887, 326, 'CONTROL VALVE', 9, 1),
    label(1000, 326, 'INLINE DEVICE*', 9, 1),
    label(838, 507, 'STEAM HEADER', 10, 1.4, 'start'),
    label(182, 929, 'CONDENSATE RETURN*', 10, 1.3, 'start'),
    label(81, 477, 'DECK DRAINS*', 10, 1.5, 'start'),
    path('M 206 473 H 278 L 302 430', 'none', c.fine, .8),
    ...deckYs.map((y, i) => label(463, y + 37, `DECK 0${i + 1}`, 9, 1.2)),
    label(570, 796, 'SHAFT', 8, 1, 'start'),
    label(737, 864, 'DISCHARGE CONE', 10, 1.4, 'start'),
    path('M 726 860 H 685 L 653 841', 'none', c.fine, .8),
    label(655, 902, 'DISCHARGE DEVICE*', 10, 1.3, 'start'),
    line(597, 889, 645, 889, c.fine, .8),
    label(433, 936, 'DISCHARGE DRIVE', 9, 1.2),
    label(835, 947, 'CONDITIONED MATERIAL', 12, 2),
    label(65, 987, '* TYPE / SERVICE TO CONFIRM FROM OEM LEGEND', 8, .8, 'start'),
  ]));
  return scene;
}
