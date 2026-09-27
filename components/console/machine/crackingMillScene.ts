/** Cracking Mill M-101, detailed engineering-dashboard artwork.
 * Two stages of paired rolls, drawn in the style of the other machine
 * templates. Illustrative cutaway, not CAD.
 *
 * Stage is 1200 x 1000; keep the taller aspect ratio rather than stretching it
 * onto the wider extruder canvas.
 *
 * The part vocabulary and the point registry live in
 * `lib/crackingMillPoints.ts`, because `machineConnectors.ts` and
 * `lib/machines.ts` both read them and neither may import from `components/`.
 * This file owns the geometry; that one owns the vocabulary.
 */
import {
  CRACKING_MILL_ARTWORK_HEIGHT,
  CRACKING_MILL_ARTWORK_WIDTH,
  CRACKING_MILL_PART_LABELS,
  type CrackingMillPartId,
} from '../../../lib/crackingMillPoints';

export const CRACKING_MILL_VIEWBOX_WIDTH = CRACKING_MILL_ARTWORK_WIDTH;
export const CRACKING_MILL_VIEWBOX_HEIGHT = CRACKING_MILL_ARTWORK_HEIGHT;
export type CrackingPartId = CrackingMillPartId;
export interface CrackingNode {
  tag: 'g' | 'rect' | 'line' | 'path' | 'polygon' | 'circle' | 'text'
    | 'defs' | 'clipPath' | 'linearGradient' | 'radialGradient' | 'stop';
  attrs: Record<string, string | number>; children?: CrackingNode[];
  text?: string; part?: CrackingPartId;
}
export interface CrackingSceneOptions {
  idPrefix: string; dark?: boolean; showGrid?: boolean; showLabels?: boolean;
  topFastRotation?: number; bottomFastRotation?: number; feederRotation?: number;
  /** Fast/slow speed ratio; defaults to 1.25 from the supplied PDF. */
  speedRatio?: number;
  hopperLevel?: number;
  /** Illustrative normalized spring relief, NOT a calibrated physical gap. */
  topRelief?: number; bottomRelief?: number;
}
export const CRACKING_MILL_PARTS = CRACKING_MILL_PART_LABELS;
const n = (tag: CrackingNode['tag'], attrs: CrackingNode['attrs'], children?: CrackingNode[]): CrackingNode => ({ tag, attrs, children });
const finite = (v: number | undefined, fallback = 0) => Number.isFinite(v) ? v! : fallback;
const phase = (v?: number) => ((finite(v) % 360) + 360) % 360;
const unit = (v: number | undefined, fallback = 0) => Math.max(0, Math.min(1, finite(v, fallback)));
export function buildCrackingMillScene(options: CrackingSceneOptions): CrackingNode[] {
  const { idPrefix, dark = true, showGrid = true, showLabels = true } = options;
  const c = { body: dark ? '#1C232C' : '#DFE6EE', raised: dark ? '#2D3743' : '#FCFDFE',
    deep: dark ? '#0C1117' : '#C2CEDB', edge: dark ? '#8792A1' : '#536678',
    fine: dark ? '#3C4958' : '#A4B3C3', text: dark ? '#ACB5C1' : '#4D6175',
    grid: dark ? '#202936' : '#DCE4ED', steel: dark ? '#738396' : '#D3DEE9',
    steelDark: dark ? '#344252' : '#93A5B9', material: '#B29154', accent: '#3FBF6A' };
  const ref = (s: string) => `url(#${idPrefix}-${s})`;
  const rect = (x: number, y: number, width: number, height: number, fill = ref('body'), rx = 2, stroke = c.edge, strokeWidth = 1.4) => n('rect', { x, y, width, height, rx, fill, stroke, strokeWidth });
  const line = (x1: number, y1: number, x2: number, y2: number, stroke = c.fine, strokeWidth = 1) => n('line', { x1, y1, x2, y2, stroke, strokeWidth, strokeLinecap: 'round' });
  const path = (d: string, fill = 'none', stroke = c.edge, strokeWidth = 1.4) => n('path', { d, fill, stroke, strokeWidth, strokeLinejoin: 'round' });
  const circle = (cx: number, cy: number, r: number, fill = c.deep, stroke = c.fine, strokeWidth = 1) => n('circle', { cx, cy, r, fill, stroke, strokeWidth });
  const bolt = (x: number, y: number, r = 2) => circle(x, y, r);
  const polygon = (points: string, fill: string, stroke = c.edge, strokeWidth = 1.4) => n('polygon', { points, fill, stroke, strokeWidth });
  const group = (part: CrackingPartId, children: CrackingNode[]): CrackingNode => ({ tag: 'g', attrs: {}, children, part });
  const label = (x: number, y: number, text: string, size = 10, spacing = 1.5, anchor = 'middle'): CrackingNode => ({ tag: 'text', attrs: { x, y, fill: c.text, fontFamily: 'sans-serif', fontSize: size, letterSpacing: spacing, fontWeight: 600, textAnchor: anchor }, text });
  const gradient = (name: string, stops: [number, string][]): CrackingNode => n('linearGradient', { id: `${idPrefix}-${name}`, x1: '0%', y1: '0%', x2: '0%', y2: '100%' }, stops.map(([offset, stopColor]) => n('stop', { offset, stopColor })));
  const defs: CrackingNode[] = [
    gradient('body', [[0, c.raised], [.6, c.body], [1, dark ? '#151D27' : '#CBD7E3']]),
    gradient('cylinder', [[0, c.body], [.24, c.raised], [.6, c.body], [1, c.deep]]),
    gradient('shaft', [[0, c.steelDark], [.35, c.steel], [.65, c.steelDark], [1, c.deep]]),
    gradient('material', [[0, dark ? '#BBA16C' : '#E0C185'], [1, dark ? '#755725' : '#AD803C']]),
    n('radialGradient', { id: `${idPrefix}-roll`, cx: '32%', cy: '28%', r: '80%' }, [n('stop', { offset: 0, stopColor: c.steel }), n('stop', { offset: .7, stopColor: c.steelDark }), n('stop', { offset: 1, stopColor: c.body })]),
    n('clipPath', { id: `${idPrefix}-hopper` }, [polygon('521,104 731,104 689,185 563,185', 'white', 'none', 0)]),
  ];
  const scene: CrackingNode[] = [n('defs', {}, defs)];
  if (showGrid) scene.push(n('g', { opacity: .4 }, [
    ...Array.from({ length: 21 }, (_, i) => line(i * 60, 0, i * 60, 1000, c.grid, i % 5 ? .6 : 1)),
    ...Array.from({ length: 17 }, (_, i) => line(0, i * 60, 1200, i * 60, c.grid, i % 5 ? .6 : 1)),
  ]));
  const parts: CrackingNode[] = [];
  const ratio = finite(options.speedRatio, 1.25) > 0 ? finite(options.speedRatio, 1.25) : 1.25;
  const topFast = finite(options.topFastRotation), bottomFast = finite(options.bottomFastRotation);
  // Derive BEFORE wrapping: otherwise slow roll would jump each fast revolution.
  const topSlow = phase(-topFast / ratio), bottomSlow = phase(-bottomFast / ratio);
  const topOffset = unit(options.topRelief) * 16, bottomOffset = unit(options.bottomRelief) * 16;
  const level = unit(options.hopperLevel, .62);
  parts.push(group('housing', [
    rect(337, 185, 623, 678, ref('body'), 14, c.edge, 2),
    rect(349, 197, 599, 654, c.deep, 8, c.fine, 1),
    rect(360, 208, 577, 632, dark ? '#10161E' : '#F2F6FA', 5, c.fine, .5),
    ...[[349, 197], [948, 197], [349, 851], [948, 851]].map(([x, y]) => bolt(x, y, 3)),
    ...[318, 523, 754].flatMap(y => [bolt(345, y, 2), bolt(952, y, 2)]),
    rect(341, 867, 51, 13, ref('body'), 2), rect(907, 867, 49, 13, ref('body'), 2),
    line(353, 863, 353, 867), line(944, 863, 944, 867),
  ]));
  parts.push(group('hopper', [
    polygon('510,95 742,95 694,190 558,190', ref('body'), c.edge, 1.8),
    n('g', { clipPath: ref('hopper') }, [rect(520, 185 - level * 81, 213, level * 81, ref('material'), 0, 'none', 0)]),
    rect(506, 87, 240, 10, ref('body'), 5), line(515, 91, 737, 91, c.fine, .7),
    path('M 516 101 L 562 185 M 736 101 L 690 185', 'none', c.fine, .7),
    rect(554, 190, 144, 8, ref('body'), 2), bolt(562, 194, 1.8), bolt(690, 194, 1.8),
  ]));
  parts.push(group('feeder-drive', [
    rect(656, 233, 349, 8, ref('shaft'), 1, c.fine, .8),
    rect(951, 223, 14, 28, ref('body'), 2), rect(984, 229, 12, 16, ref('body'), 2),
    rect(1005, 212, 76, 50, ref('cylinder'), 7), rect(1081, 216, 9, 42, ref('body'), 2),
    ...[219, 227, 235, 243, 251].map(y => line(1012, y, 1073, y, c.fine, .9)),
    rect(1026, 200, 32, 12, ref('body'), 2), rect(1012, 263, 62, 6, ref('body'), 1),
  ]));
  parts.push(group('feed-roll', [
    circle(626, 237, 34, ref('body'), c.edge, 1.6), circle(626, 237, 28, ref('roll'), c.fine, .8),
    n('g', { transform: `rotate(${phase(options.feederRotation)} 626 237)` }, [
      ...Array.from({ length: 12 }, (_, i) => {
        const a = i * Math.PI / 6;
        return line(626 + 7 * Math.cos(a), 237 + 7 * Math.sin(a), 626 + 27 * Math.cos(a), 237 + 27 * Math.sin(a), c.edge, .9);
      }),
    ]), circle(626, 237, 7, c.deep, c.edge, 1),
  ]));
  function belt(part: 'top-belt' | 'bottom-belt', y: number): CrackingNode {
    const d = 519 - 225, cos = (19 - 88) / d, sin = Math.sqrt(1 - cos * cos);
    return group(part, [-1, 1].flatMap(sign => [
      line(225 + 19 * cos, y + sign * 19 * sin, 519 + 88 * cos, y + sign * 88 * sin, c.edge, 3.4),
      line(225 + 19 * cos, y + sign * 19 * sin, 519 + 88 * cos, y + sign * 88 * sin, c.fine, .8),
    ]));
  }
  parts.push(belt('top-belt', 410), belt('bottom-belt', 646));
  function motor(part: 'top-drive' | 'bottom-drive', y: number, rotation: number): CrackingNode {
    return group(part, [
      rect(80, y - 32, 13, 65, ref('body'), 4),
      ...[-24, -13, -2, 9, 20, 29].map(d => line(84, y + d, 89, y + d)),
      rect(93, y - 42, 111, 84, ref('cylinder'), 11, c.edge, 1.7),
      ...Array.from({ length: 7 }, (_, i) => line(104, y - 32 + i * 10, 192, y - 32 + i * 10, c.fine, 1.1)),
      rect(130, y - 16, 34, 25, c.deep, 2, c.fine, .8),
      line(136, y - 9, 158, y - 9, c.fine, .6), line(136, y - 3, 150, y - 3, c.fine, .6),
      rect(124, y - 56, 43, 14, ref('body'), 3),
      rect(102, y + 42, 98, 8, ref('body'), 2),
      rect(112, y + 50, 25, 12, ref('body'), 2), rect(169, y + 50, 25, 12, ref('body'), 2),
      bolt(124, y + 56, 1.7), bolt(181, y + 56, 1.7),
      rect(204, y - 4, 21, 8, ref('shaft'), 1),
      circle(225, y, 21, ref('shaft'), c.edge, 1.5), circle(225, y, 16, c.body, c.fine, .8),
      n('g', { transform: `rotate(${phase(rotation)} 225 ${y})` }, [
        ...[0, 90, 180, 270].map(a => n('g', { transform: `rotate(${a} 225 ${y})` }, [line(232, y, 238, y, c.fine, 1.3)])),
      ]), circle(225, y, 6, c.deep, c.edge, 1),
    ]);
  }
  parts.push(motor('top-drive', 410, topFast), motor('bottom-drive', 646, bottomFast));

  function roll(part: CrackingPartId, x: number, y: number, rotation: number, flutes: number): CrackingNode {
    return group(part, [
      circle(x, y, 89, c.deep, c.edge, 1.8), circle(x, y, 86, ref('shaft'), c.edge, .7),
      circle(x, y, 80, ref('roll'), c.fine, .8), circle(x, y, 73, 'none', c.fine, .5),
      n('g', { transform: `rotate(${phase(rotation)} ${x} ${y})` }, [
        ...Array.from({ length: flutes }, (_, i) => {
          const a = i * Math.PI * 2 / flutes;
          return line(x + 79 * Math.cos(a), y + 79 * Math.sin(a), x + 87 * Math.cos(a), y + 87 * Math.sin(a), c.deep, flutes === 36 ? 2.1 : 1.35);
        }),
      ]),
    ]);
  }
  parts.push(roll('top-fast-roll', 519, 410, topFast, 36), roll('top-slow-roll', 711 + topOffset, 410, topSlow, 36));
  parts.push(roll('bottom-fast-roll', 519, 646, bottomFast, 56), roll('bottom-slow-roll', 708 + bottomOffset, 646, bottomSlow, 56));
  const bearing = (x: number, y: number): CrackingNode[] => [
    rect(x - 26, y - 26, 52, 52, ref('body'), 4, c.edge, 1.5),
    rect(x - 21, y - 21, 42, 42, 'none', 3, c.fine, .7),
    ...[[-19, -19], [19, -19], [-19, 19], [19, 19]].map(([dx, dy]) => bolt(x + dx, y + dy, 1.6)),
    circle(x, y, 13, ref('shaft'), c.edge, .9), circle(x, y, 8, c.deep, c.fine, .7),
  ];
  parts.push(group('top-bearings', [...bearing(519, 410), ...bearing(711 + topOffset, 410)]));
  parts.push(group('bottom-bearings', [...bearing(519, 646), ...bearing(708 + bottomOffset, 646)]));
  function spring(part: 'top-gap-spring' | 'bottom-gap-spring', y: number, offset: number): CrackingNode {
    const start = 751 + offset, end = 934, pitch = (end - start) / 12;
    let d = `M ${start} ${y}`;
    for (let i = 1; i < 12; i++) d += ` L ${start + i * pitch} ${y + (i % 2 ? -11 : 11)}`;
    d += ` L ${end} ${y}`;
    return group(part, [
      rect(737 + offset, y - 6, 16, 12, ref('shaft'), 1),
      line(start, y, 953, y, c.fine, 1),
      path(d, 'none', c.edge, 2.4), path(d, 'none', c.steel, .65),
      rect(934, y - 17, 9, 34, ref('body'), 2),
      rect(943, y - 5, 25, 10, ref('shaft'), 1),
      ...[947, 951, 955, 959, 963].map(x => line(x, y - 4, x, y + 4, c.fine, .7)),
      rect(956, y - 24, 9, 48, ref('body'), 1),
      rect(969, y - 12, 7, 24, ref('body'), 1),
      bolt(960.5, y - 19, 1.4), bolt(960.5, y + 19, 1.4),
    ]);
  }
  parts.push(spring('top-gap-spring', 410, topOffset), spring('bottom-gap-spring', 646, bottomOffset - 3));
  function scrapers(part: 'top-scrapers' | 'bottom-scrapers', y: number, offset: number): CrackingNode {
    return group(part, [
      path(`M 456 ${y + 60} L 420 ${y + 93} L 424 ${y + 97} L 461 ${y + 65} Z`, ref('body'), c.edge, 1.1),
      bolt(428, y + 90, 1.6),
      path(`M ${774 + offset} ${y + 60} L ${810 + offset} ${y + 93} L ${806 + offset} ${y + 97} L ${769 + offset} ${y + 65} Z`, ref('body'), c.edge, 1.1),
      bolt(802 + offset, y + 90, 1.6),
    ]);
  }
  parts.push(scrapers('top-scrapers', 410, topOffset), scrapers('bottom-scrapers', 646, bottomOffset - 3));
  parts.push(group('discharge', [
    path('M 522 837 H 730 L 654 916 H 598 Z', ref('body'), c.edge, 1.8),
    path('M 535 843 H 717 L 649 908 H 603 Z', c.deep, c.fine, .7),
    path('M 608 846 H 644 L 639 908 H 614 Z', ref('material'), 'none', 0),
    rect(517, 829, 218, 9, ref('body'), 2), bolt(525, 833, 1.8), bolt(727, 833, 1.8),
    rect(594, 916, 64, 8, ref('body'), 2), bolt(601, 920, 1.5), bolt(651, 920, 1.5),
  ]));
  parts.push(group('material-flow', [
    polygon('617,69 635,69 626,84', c.accent, 'none', 0),
    line(626, 273, 626, 295, c.material, 2), polygon('620,294 632,294 626,306', c.accent, 'none', 0),
    line(626, 501, 626, 548, c.material, 2), polygon('620,546 632,546 626,557', c.accent, 'none', 0),
    path('M 608 523 Q 615 516 617 527 Z', c.material, 'none', 0),
    path('M 634 536 Q 641 529 644 540 Z', c.material, 'none', 0),
    line(626, 738, 626, 810, c.material, 2), polygon('620,809 632,809 626,821', c.accent, 'none', 0),
    ...[[608, 764], [641, 779], [611, 797]].map(([x, y]) => path(`M ${x} ${y} q 6 -6 8 3 Z`, c.material, 'none', 0)),
    path('M 637 751 q 8 1 5 6 M 607 784 q -5 1 -2 5', 'none', c.material, 1),
    path('M 626 924 V 963 H 95', 'none', c.material, 2), polygon('98,957 86,963 98,969', c.accent, 'none', 0),
  ]));
  scene.push(n('g', {}, parts));
  if (showLabels) scene.push(n('g', {}, [
    label(626, 48, 'DRIED BEANS / FEED', 15, 2.7),
    label(770, 137, 'HOPPER', 11, 1.6, 'start'),
    label(531, 241, 'FEED ROLL', 10, 1.5, 'end'), line(542, 237, 590, 237),
    label(1046, 185, 'FEED DRIVE / VFD', 10, 1.4),
    label(149, 497, 'TOP-PAIR MOTOR', 11, 1.5), label(149, 733, 'BOTTOM-PAIR MOTOR', 11, 1.5),
    label(304, 385, 'V-BELT', 9, 1.2), label(304, 621, 'V-BELT', 9, 1.2),
    label(489, 312, '01 / COARSE', 10, 1.5), label(489, 548, '02 / FINE', 10, 1.5),
    label(519, 455, 'FAST', 9, 1.3), label(711 + topOffset, 455, 'SLOW', 9, 1.3),
    label(519, 691, 'FAST', 9, 1.3), label(708 + bottomOffset, 691, 'SLOW', 9, 1.3),
    label(866, 343, 'GAP / RELIEF SPRING', 9, 1.1), label(866, 579, 'GAP / RELIEF SPRING', 9, 1.1),
    label(861, 505, 'SCRAPER', 9, 1.3), line(827, 501, 811 + topOffset, 501, c.fine, .7),
    label(861, 741, 'SCRAPER', 9, 1.3), line(827, 737, 811 + bottomOffset, 737, c.fine, .7),
    label(783, 890, 'OUTLET HOPPER', 10, 1.5, 'start'),
    label(263, 947, 'CRACKED PIECES + LOOSE HULLS', 11, 1.8),
  ]));
  return scene;
}
