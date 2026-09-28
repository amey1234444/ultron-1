import { EXPANDER_POINT_REGISTRY } from '../../../lib/machinePoints/expanderPoints';
import { CONDITIONER_POINT_REGISTRY } from '../../../lib/machinePoints/conditionerPoints';
import { CRACKING_MILL_POINT_REGISTRY } from '../../../lib/machinePoints/crackingMillPoints';
import { FLAKING_MILL_POINT_REGISTRY } from '../../../lib/machinePoints/flakingMillPoints';
import { COLLET_COOLER_POINT_REGISTRY } from '../../../lib/machinePoints/colletCoolerPoints';
import { AUTO_BAGGER_POINT_REGISTRY } from '../../../lib/machinePoints/autoBaggerPoints';
import { HAMMER_MILL_POINT_REGISTRY } from '../../../lib/machinePoints/hammerMillPoints';
import { MEAL_CONVEYING_STORAGE_POINT_REGISTRY } from '../../../lib/machinePoints/mealConveyingStoragePoints';
import { MEAL_SIFTER_POINT_REGISTRY } from '../../../lib/machinePoints/mealSifterPoints';
import { MISCELLA_DISTILLATION_POINT_REGISTRY } from '../../../lib/machinePoints/miscellaDistillationPoints';
import { SOLVENT_RECOVERY_POINT_REGISTRY } from '../../../lib/machinePoints/solventRecoveryPoints';
import { DTDC_POINT_REGISTRY } from '../../../lib/machinePoints/dtdcPoints';
import { SEED_DRYER_COOLER_POINT_REGISTRY } from '../../../lib/machinePoints/seedDryerCoolerPoints';
import { SOLVENT_EXTRACTOR_POINT_REGISTRY } from '../../../lib/machinePoints/solventExtractorPoints';
import type { ChannelRef } from '../../../lib/rack';
import {
  normalizeTwinScrewPointCode,
  TWIN_SCREW_POINT_REGISTRY,
} from '../../../lib/machinePoints/twinScrewExtruderPoints';
import { artworkSizeForTemplate, RAV_CONNECTOR_POINTS } from './machineConnectors';
import { MAPPABLE_BOX_HEIGHT, UNLINKED_BOX_WIDTH } from './MappableBox';
import { EXTRUDER_CONNECTORS } from './artwork/SingleScrewExtruder';
import { TWIN_SCREW_CONNECTORS } from './artwork/TwinScrewExtruder';
import type { Anchor, Box, SavedLayout, Trail } from './TrailBoard';

const STAGE_W = 1600;
const STAGE_H = 900;

const REFERENCE_MACHINE_RECT = { x: 384, y: 186.53, width: 832, height: 526.93 };
const REFERENCE_CANVAS_W = 1440;
const REFERENCE_CANVAS_H = 820;
const REFERENCE_STAGE_SCALE = Math.min(STAGE_W / REFERENCE_CANVAS_W, STAGE_H / REFERENCE_CANVAS_H);
const REFERENCE_STAGE_X = (STAGE_W - REFERENCE_CANVAS_W * REFERENCE_STAGE_SCALE) / 2;
const REFERENCE_STAGE_Y = (STAGE_H - REFERENCE_CANVAS_H * REFERENCE_STAGE_SCALE) / 2;
// Anchors below are read straight off each SVG drawing and converted to
// fractions of the machine rect, so the viewBox a drawing happens to use is
// local to that drawing — `artworkSizeForTemplate` supplies it per template.
const BOX_CONNECTOR_GAP = 8;
const BOX_CONNECTOR_Y_OFFSET = -2.5;

export type MachineRect = { x: number; y: number; width: number; height: number };
type ReferencePoint = { x: number; y: number };

type TemplatePoint = {
  code: string;
  label: string;
  side: 'left' | 'right';
  anchor: ReferencePoint;
  boxEnd: ReferencePoint;
  bend?: ReferencePoint;
};

// Which side of the machine each pad's card sits on.
//
// The only thing still stated by hand for this template, and deliberately:
// the drawing is not left/right symmetric, and deriving the side from whether
// a pad lies past the artwork's midpoint would put the material temperature
// on the opposite side from the two pressures it is read with. Slot heights
// are not stated here — those come from `columnTemplatePoints`, the same as
// every other template, and that is what keeps these trails from crossing.
const RAV_CARD_SIDE: Record<string, 'left' | 'right'> = {
  C1: 'left', S1: 'left', P1: 'left', P2: 'left', T3: 'left',
  V1: 'right', V2: 'right', T1: 'right', T2: 'right',
};

const RAV_ARTWORK_CONNECTORS: ArtworkConnector[] = RAV_CONNECTOR_POINTS.flatMap((connector) => {
  const side = RAV_CARD_SIDE[connector.code];
  return side ? [{ code: connector.code, label: connector.label, side, x: connector.x, y: connector.y }] : [];
});

/**
 * The two extruders — the anchors come from the artwork itself.
 *
 * `EXTRUDER_CONNECTORS` / `TWIN_SCREW_CONNECTORS` are the lists of instrument
 * pads their drawings render, so importing them here means a trail can only ever
 * land on a pad that exists. The old copy of these coordinates drifted out of
 * step with the drawing the first time the machine was redrawn; there is now
 * nothing to keep in step.
 */
const COLUMN_LEFT = 232;
const COLUMN_RIGHT = 1208;
// A card's connector sits 30 above its top edge and the card is 104 tall, so
// these are the first and last connector heights that keep a whole card inside
// the reference canvas.
const SLOT_TOP = 32;
const SLOT_BOTTOM = REFERENCE_CANVAS_H - MAPPABLE_BOX_HEIGHT + 30 - 4;

/**
 * Card heights for one column, spread evenly over the usable height.
 *
 * The number of pads on a side is whatever the artwork declares, so the slots
 * are computed from that count rather than being a fixed list a new instrument
 * would silently wrap around and stack on top of an existing card. Past about
 * eight cards a column packs tighter than the 104-tall card, and the stack
 * reads as an ordered list to be dragged apart rather than a finished layout —
 * which is what "Reset to template" is for.
 */
function columnSlots(count: number): number[] {
  if (count <= 1) return [SLOT_TOP];
  const step = (SLOT_BOTTOM - SLOT_TOP) / (count - 1);
  return Array.from({ length: count }, (_, index) => Math.round(SLOT_TOP + index * step));
}

type ArtworkConnector = { code: string; label: string; side: 'left' | 'right'; x: number; y: number };

// --------------------------------------------------------------------------
// Which card goes in which slot
// --------------------------------------------------------------------------
//
// Slots used to be handed out in registry order, which is the order the
// instruments happen to be listed in and has nothing to do with where they
// are on the drawing. So the top card could be wired to a pad near the
// bottom while the fifth card reached back up to the top, and every such pair
// crossed. On the eighteen-point cracking mill that was sixteen crossings in
// one canvas; across the seventeen instrumented templates, 240.
//
// This is two-layer crossing minimisation — pads on one side, card slots on
// the other — so it is solved the way that problem is solved. Sorting by pad
// height is the median heuristic and takes 240 to 74 on its own. The rest is
// local search on the real geometry: swap neighbours, then try moving a card
// to any other slot, keeping whatever reduces the count. Together they reach
// zero on all seventeen.
//
// Counting real segment intersections rather than the usual abstract
// inversion count is affordable here — a side holds at most twenty cards —
// and is worth it, because what has to be true is that no two drawn lines
// cross, not that an abstraction of them does not.

type Seg = readonly [ReferencePoint, ReferencePoint];

/** Whether two segments properly cross. Shared endpoints do not count. */
function segmentsCross(a: Seg, b: Seg): boolean {
  const near = (p: ReferencePoint, q: ReferencePoint) => Math.abs(p.x - q.x) < 0.5 && Math.abs(p.y - q.y) < 0.5;
  if (near(a[0], b[0]) || near(a[0], b[1]) || near(a[1], b[0]) || near(a[1], b[1])) return false;
  const turn = (o: ReferencePoint, p: ReferencePoint, q: ReferencePoint) =>
    (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x);
  const EPS = 1e-9;
  const d1 = turn(a[0], a[1], b[0]);
  const d2 = turn(a[0], a[1], b[1]);
  const d3 = turn(b[0], b[1], a[0]);
  const d4 = turn(b[0], b[1], a[1]);
  return (
    ((d1 > EPS && d2 < -EPS) || (d1 < -EPS && d2 > EPS)) &&
    ((d3 > EPS && d4 < -EPS) || (d3 < -EPS && d4 > EPS))
  );
}

/**
 * Crossings among one side's trails, for a given card order.
 *
 * Measured on the geometry that is actually drawn, which means putting both
 * ends in the same space first. A pad is in its drawing's own units — 1200
 * wide, or 2048 for the solvent pair — and a card column is in the reference
 * canvas, so comparing them raw compares nothing. Getting that wrong is not
 * visible in the result: the optimiser happily reports zero while the canvas
 * it produced is still crossed, which is what happened on the first attempt.
 */
/**
 * Whether the authored bend still lies between the pad and its card.
 *
 * Trails turn once rather than cutting diagonally, which reads far better
 * while the machine sits inside its card columns. Drawn large enough, it does
 * not: a pad can end up level with its own column or past it, and then the
 * bend — which is a fixed distance inboard of the column — is on the wrong
 * side of the pad. The trail leaves the pad going one way, doubles back, and
 * crosses whatever is between. No ordering of the cards can undo that,
 * because it is one trail crossing another's approach rather than two cards
 * being in the wrong order.
 *
 * So the bend is kept only while it is genuinely on the way. Where it is not,
 * the trail runs straight to the card: a diagonal is less tidy than a turn,
 * and both are tidier than a line doubling back across its neighbours.
 */
function keepsBend(pad: { x: number }, bend: { x: number }, columnEnd: { x: number }): boolean {
  return columnEnd.x < bend.x ? pad.x >= bend.x : pad.x <= bend.x;
}

function segmentsFor(
  order: readonly ArtworkConnector[],
  column: number,
  bendX: number,
  artwork: { width: number; height: number },
  rect: MachineRect,
): Seg[] {
  const slots = columnSlots(order.length);
  const segments: Seg[] = [];
  order.forEach((connector, index) => {
    // The pad moves with the machine; the card column does not. That is the
    // whole reason this takes a rect: an order that does not cross at one
    // size can cross at another, so it has to be scored against the size the
    // canvas is actually being drawn at.
    const pad = {
      x: rect.x + (connector.x / artwork.width) * rect.width,
      y: rect.y + (connector.y / artwork.height) * rect.height,
    };
    const bend = stageFromReference({ x: bendX, y: slots[index] });
    const columnEnd = stageFromReference({ x: column, y: slots[index] });
    if (keepsBend(pad, bend, columnEnd)) {
      segments.push([pad, bend]);
      segments.push([bend, columnEnd]);
    } else {
      segments.push([pad, columnEnd]);
    }
  });
  return segments;
}

function countCrossings(segments: readonly Seg[]): number {
  let count = 0;
  for (let i = 0; i < segments.length; i += 1) {
    for (let j = i + 1; j < segments.length; j += 1) {
      if (segmentsCross(segments[i], segments[j])) count += 1;
    }
  }
  return count;
}

function crossingsFor(
  order: readonly ArtworkConnector[],
  column: number,
  bendX: number,
  artwork: { width: number; height: number },
  rect: MachineRect,
): number {
  return countCrossings(segmentsFor(order, column, bendX, artwork, rect));
}

/**
 * The card order for one side that draws without crossings.
 *
 * Deterministic: the same pads always produce the same order, because the
 * starting sort is total (height, then horizontal position) and every move is
 * accepted only on a strict improvement, scanned in a fixed order. A layout
 * that reshuffled itself between two runs would make "⟲ Template" a way to
 * lose a canvas rather than restore one.
 *
 * Bounded rather than exhaustive. Twenty cards is more permutations than
 * there are atoms worth counting, so this takes the good start and improves
 * it, and stops the moment a pass finds nothing — which on every template
 * this repository has is at zero.
 */
function orderWithoutCrossings(
  connectors: readonly ArtworkConnector[],
  column: number,
  bendX: number,
  artwork: { width: number; height: number },
  rect: MachineRect,
): ArtworkConnector[] {
  const score = (order: readonly ArtworkConnector[]) => crossingsFor(order, column, bendX, artwork, rect);

  /**
   * Hill climbing from one starting order, until a pass finds nothing.
   *
   * Three move classes, because each stalls where the next one does not: a
   * neighbour swap fixes two cards in the wrong order; a free exchange moves
   * two cards that are nowhere near each other, which no sequence of
   * neighbour swaps reaches without passing through worse orders; and an
   * insertion slides one card several slots, which no exchange does.
   */
  const climb = (from: readonly ArtworkConnector[]): { order: ArtworkConnector[]; count: number } => {
    let order = [...from];
    let best = score(order);

    for (let pass = 0; pass < 80 && best > 0; pass += 1) {
      let improved = false;

      for (let i = 0; i < order.length - 1; i += 1) {
        const trial = [...order];
        [trial[i], trial[i + 1]] = [trial[i + 1], trial[i]];
        const count = score(trial);
        if (count < best) { order = trial; best = count; improved = true; }
      }

      for (let i = 0; i < order.length && best > 0; i += 1) {
        for (let j = i + 2; j < order.length; j += 1) {
          const trial = [...order];
          [trial[i], trial[j]] = [trial[j], trial[i]];
          const count = score(trial);
          if (count < best) { order = trial; best = count; improved = true; }
        }
      }

      for (let fromIndex = 0; fromIndex < order.length && best > 0; fromIndex += 1) {
        for (let to = 0; to < order.length; to += 1) {
          if (to === fromIndex) continue;
          const trial = [...order];
          const [moved] = trial.splice(fromIndex, 1);
          trial.splice(to, 0, moved);
          const count = score(trial);
          if (count < best) { order = trial; best = count; improved = true; }
        }
      }

      if (!improved) break;
    }
    return { order, count: best };
  };

  // Three considered starts. Height then horizontal position is the natural
  // reading order; the horizontal tie-break reversed is the other sensible
  // one, and on the extractor — five hoppers at one height, five pumps at
  // another — it is the one that reaches zero. Distance from the column
  // separates instruments at one height but different depths into the
  // machine, where sorting by height alone has nothing to go on.
  const starts = [
    [...connectors].sort((a, b) => a.y - b.y || a.x - b.x),
    [...connectors].sort((a, b) => a.y - b.y || b.x - a.x),
    [...connectors].sort((a, b) => (column === COLUMN_LEFT ? a.x - b.x : b.x - a.x) || a.y - b.y),
  ];

  let order = [...starts[0]];
  let best = Infinity;
  for (const from of starts) {
    const climbed = climb(from);
    // Strictly better only, so ties keep the earlier start and the result
    // does not depend on the order they happen to be listed in.
    if (climbed.count < best) { order = climbed.order; best = climbed.count; }
  }

  /**
   * Shuffled restarts, when the considered starts all stall above zero.
   *
   * Hill climbing cannot leave the valley it lands in, and on a machine drawn
   * wide enough to cover its own card column the good-looking starts land in
   * a valley with a crossing in it while a zero-crossing order exists
   * elsewhere. Brute force over every assignment showed five such cases among
   * the templates here, so this is a real gap and not a theoretical one.
   *
   * The shuffle is a fixed-seed LCG, never `Math.random`: the same pads at
   * the same size must always produce the same canvas, or "⟲ Template" would
   * be a way to lose a layout rather than restore one.
   */
  if (best > 0) {
    let seed = 0x9e3779b9;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    // Enough to clear every case measured, scaled down for the big columns
    // where a single climb already costs the most and the memoised result is
    // reused for every render at that size.
    const restarts = connectors.length > 12 ? 12 : 40;
    for (let attempt = 0; attempt < restarts && best > 0; attempt += 1) {
      const shuffled = [...starts[0]];
      for (let i = shuffled.length - 1; i > 0; i -= 1) {
        const j = Math.floor(random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      const climbed = climb(shuffled);
      if (climbed.count < best) { order = climbed.order; best = climbed.count; }
    }
  }

  return order;
}

/**
 * One card column per side, ordered so the trails do not cross.
 *
 * The pad decides which side it stacks on, so the drive-side instruments run
 * down the left of the canvas and the process-side ones down the right — a
 * trail never has to cross the machine to reach its card. Which slot it takes
 * within that side is decided above.
 */
const LEFT_BEND = COLUMN_LEFT + 96;
const RIGHT_BEND = COLUMN_RIGHT - 96;

/**
 * Uncross the two sides against each other.
 *
 * Each column's own search only ever sees its own trails, which is enough
 * while the left-hand pads are all left of the right-hand ones. On the twin
 * screw they are not: it has thirty-five instruments packed across the middle
 * of the drawing, so a pad just left of centre can be carded on the right and
 * its neighbour carded on the left, and the two set off in opposite
 * directions across the same stretch of canvas. Neither side's search can
 * see that crossing, because neither side can see the other's trails.
 *
 * Starts from the per-side results, which are already optimal within each
 * column and usually leave nothing to do here, and stops the instant the
 * combined count reaches zero — so on sixteen of the seventeen templates
 * this returns without trying a single move.
 */
function jointlyUncross(
  left: ArtworkConnector[],
  right: ArtworkConnector[],
  artwork: { width: number; height: number },
  rect: MachineRect,
): { left: ArtworkConnector[]; right: ArtworkConnector[] } {
  const score = (l: readonly ArtworkConnector[], r: readonly ArtworkConnector[]) =>
    countCrossings([
      ...segmentsFor(l, COLUMN_LEFT, LEFT_BEND, artwork, rect),
      ...segmentsFor(r, COLUMN_RIGHT, RIGHT_BEND, artwork, rect),
    ]);

  /** Hill climb both columns at once, from one pair of starting orders. */
  const climb = (fromLeft: ArtworkConnector[], fromRight: ArtworkConnector[], maxPasses: number) => {
    let bestLeft = fromLeft;
    let bestRight = fromRight;
    let best = score(bestLeft, bestRight);

    for (let pass = 0; pass < maxPasses && best > 0; pass += 1) {
      let improved = false;
      for (const side of ['left', 'right'] as const) {
        const current = side === 'left' ? bestLeft : bestRight;
        // Insertion moves only. A swap is two insertions, and the combined
        // score is the expensive part — it runs over both columns' segments
        // at once, so the move set is kept to the one that travels.
        for (let from = 0; from < current.length && best > 0; from += 1) {
          for (let to = 0; to < current.length; to += 1) {
            if (to === from) continue;
            const trial = [...current];
            const [moved] = trial.splice(from, 1);
            trial.splice(to, 0, moved);
            const count = side === 'left' ? score(trial, bestRight) : score(bestLeft, trial);
            if (count < best) {
              best = count;
              if (side === 'left') bestLeft = trial;
              else bestRight = trial;
              improved = true;
            }
          }
        }
      }
      if (!improved) break;
    }
    return { left: bestLeft, right: bestRight, count: best };
  };

  // Thorough from the per-side optima: this is the answer on every template
  // but one, and it is worth polishing.
  let result = climb(left, right, 40);

  /**
   * Shuffled restarts, when climbing from the per-side optima stalls.
   *
   * It does stall: on the twin screw, drawn at some positions, the pair that
   * crosses can only be separated by moving cards in both columns at once,
   * and every single move on the way there is worse than staying put. A
   * strict climb cannot pass through that, and no amount of extra passes
   * helps — only a different starting point does.
   *
   * Fixed seed, never `Math.random`. The same pads at the same size must
   * always produce the same canvas, or "⟲ Template" becomes a way to lose a
   * layout rather than restore one.
   */
  if (result.count > 0) {
    let seed = 0x6d2b79f5;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    /**
     * A few random re-insertions, not a full shuffle.
     *
     * A shuffled column throws away everything the per-side search worked
     * out and asks a short climb to rediscover it, which it cannot — so the
     * restarts each needed a long climb, and the twin screw took most of a
     * second to lay out. A handful of cards moved out of an otherwise good
     * order is enough to leave the valley, and close enough to a good answer
     * that a short climb gets back to one.
     */
    const jostled = (order: readonly ArtworkConnector[], moves: number) => {
      const copy = [...order];
      if (copy.length < 2) return copy;
      for (let move = 0; move < moves; move += 1) {
        const from = Math.floor(random() * copy.length);
        const to = Math.floor(random() * copy.length);
        const [taken] = copy.splice(from, 1);
        copy.splice(to, 0, taken);
      }
      return copy;
    };
    for (let attempt = 0; attempt < 32 && result.count > 0; attempt += 1) {
      const moves = 2 + (attempt % 3);
      const candidate = climb(jostled(result.left, moves), jostled(result.right, moves), 6);
      if (candidate.count < result.count) result = candidate;
    }
  }

  const bestLeft = result.left;
  const bestRight = result.right;
  return { left: bestLeft, right: bestRight };
}

/**
 * One card column per side, ordered so the trails do not cross.
 *
 * The pad decides which side it stacks on, so the drive-side instruments run
 * down the left of the canvas and the process-side ones down the right — a
 * trail never has to cross the machine to reach its card. Which slot it takes
 * within that side is decided above: first within its own column, then
 * against the other column.
 */
function columnTemplatePoints(
  connectors: readonly ArtworkConnector[],
  artwork: { width: number; height: number },
  rect: MachineRect,
): TemplatePoint[] {
  const ordered = jointlyUncross(
    orderWithoutCrossings(connectors.filter((c) => c.side === 'left'), COLUMN_LEFT, LEFT_BEND, artwork, rect),
    orderWithoutCrossings(connectors.filter((c) => c.side === 'right'), COLUMN_RIGHT, RIGHT_BEND, artwork, rect),
    artwork,
    rect,
  );

  const slotFor = new Map<string, number>();
  for (const side of ['left', 'right'] as const) {
    const group = side === 'left' ? ordered.left : ordered.right;
    const slots = columnSlots(group.length);
    group.forEach((connector, index) => slotFor.set(connector.code, slots[index]));
  }

  // Emitted in registry order, so the cards a machine is built with stay in
  // the order the instruments are declared in; only the heights change.
  return connectors.map((connector) => {
    const left = connector.side === 'left';
    const slotY = slotFor.get(connector.code) ?? SLOT_TOP;
    const column = left ? COLUMN_LEFT : COLUMN_RIGHT;
    // Bend just inboard of the card column, so trails leave horizontally and
    // turn once instead of cutting diagonally across the machine — but only
    // while that bend is on the way to the card. See `keepsBend`.
    const bendX = left ? LEFT_BEND : RIGHT_BEND;
    const pad = {
      x: rect.x + (connector.x / artwork.width) * rect.width,
      y: rect.y + (connector.y / artwork.height) * rect.height,
    };
    const keep = keepsBend(pad, stageFromReference({ x: bendX, y: slotY }), stageFromReference({ x: column, y: slotY }));
    return {
      code: connector.code,
      label: connector.label,
      side: connector.side,
      anchor: { x: connector.x, y: connector.y },
      boxEnd: { x: column, y: slotY },
      ...(keep ? { bend: { x: bendX, y: slotY } } : {}),
    };
  });
}

const CONNECTORS_BY_TEMPLATE: Record<string, readonly ArtworkConnector[]> = {
  'Rotary Airlock Valve': RAV_ARTWORK_CONNECTORS,
  'Single Screw Extruder': EXTRUDER_CONNECTORS,
  'Twin Screw Extruder': TWIN_SCREW_CONNECTORS,
  'Expander X-101': EXPANDER_POINT_REGISTRY,
  'Flaking Mill M-102': FLAKING_MILL_POINT_REGISTRY,
  'Cracking Mill M-101': CRACKING_MILL_POINT_REGISTRY,
  'Conditioner E-102': CONDITIONER_POINT_REGISTRY,
  DTDC: DTDC_POINT_REGISTRY,
  'Solvent Extractor': SOLVENT_EXTRACTOR_POINT_REGISTRY,
  'Collet Cooler': COLLET_COOLER_POINT_REGISTRY,
  'Seed Dryer Cooler': SEED_DRYER_COOLER_POINT_REGISTRY,
  'Hammer Mill': HAMMER_MILL_POINT_REGISTRY,
  'Meal Sifter': MEAL_SIFTER_POINT_REGISTRY,
  'Meal Conveying & Storage': MEAL_CONVEYING_STORAGE_POINT_REGISTRY,
  'Auto Bagger & Stitcher': AUTO_BAGGER_POINT_REGISTRY,
  'Miscella Distillation': MISCELLA_DISTILLATION_POINT_REGISTRY,
  'Solvent Recovery': SOLVENT_RECOVERY_POINT_REGISTRY,
};

/**
 * Placed cards for one template at one machine size.
 *
 * Memoised, because the ordering is a search and the canvas asks for the same
 * size repeatedly — on every render of a machine that has not been resized.
 * Bounded, because the machine rect follows the window: a canvas that is
 * dragged wider produces a new size on every frame, and an unbounded cache
 * would hold every width the window has ever been.
 */
const POINTS_CACHE_LIMIT = 96;
const pointsCache = new Map<string, TemplatePoint[]>();

function templatePointsFor(machineTemplate: string, rect: MachineRect): TemplatePoint[] | undefined {
  const connectors = CONNECTORS_BY_TEMPLATE[machineTemplate];
  if (!connectors) return undefined;
  // Rounded: sub-pixel differences in the rect cannot change which order
  // crosses least, and rounding is what stops a resize from filling the cache
  // with a hundred indistinguishable entries.
  const key = [
    machineTemplate,
    Math.round(rect.x), Math.round(rect.y),
    Math.round(rect.width), Math.round(rect.height),
  ].join('|');
  const hit = pointsCache.get(key);
  if (hit) return hit;
  const points = columnTemplatePoints(connectors, artworkSizeForTemplate(machineTemplate), rect);
  if (pointsCache.size >= POINTS_CACHE_LIMIT) {
    const oldest = pointsCache.keys().next();
    if (!oldest.done) pointsCache.delete(oldest.value);
  }
  pointsCache.set(key, points);
  return points;
}

function makeId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function machineAnchor(sx: number, sy: number, artwork: { width: number; height: number }): Anchor {
  return { rx: sx / artwork.width, ry: sy / artwork.height };
}

function stageFromReference(point: ReferencePoint) {
  return {
    x: REFERENCE_STAGE_X + point.x * REFERENCE_STAGE_SCALE,
    y: REFERENCE_STAGE_Y + point.y * REFERENCE_STAGE_SCALE,
  };
}

function boxFromEndpoint(point: ReferencePoint, side: TemplatePoint['side'], label: string, templatePointCode?: string): Box {
  const cardLeft = side === 'left' ? point.x - UNLINKED_BOX_WIDTH - BOX_CONNECTOR_GAP : point.x + BOX_CONNECTOR_GAP;
  return {
    id: makeId('box'),
    x: cardLeft - 12,
    y: point.y - BOX_CONNECTOR_Y_OFFSET,
    label,
    templatePointCode,
  };
}

function boxEndpoint(box: Box, side: TemplatePoint['side']) {
  return {
    x: side === 'left' ? box.x + 12 + UNLINKED_BOX_WIDTH + BOX_CONNECTOR_GAP : box.x + 12 - BOX_CONNECTOR_GAP,
    y: box.y + BOX_CONNECTOR_Y_OFFSET,
  };
}

function templateBoxHitRect(box: Box) {
  const cardLeft = box.x + 12;
  const cardTop = box.y - 30;
  const left = Math.min(box.x - 10, cardLeft - 10);
  const top = Math.min(box.y - 10, cardTop - 10);
  const right = Math.max(box.x + 10, cardLeft + UNLINKED_BOX_WIDTH + 10);
  const bottom = cardTop + MAPPABLE_BOX_HEIGHT + 10;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function boxAnchorFor(box: Box, point: ReferencePoint): Anchor {
  const rect = templateBoxHitRect(box);
  return {
    rx: (point.x - rect.x) / rect.width,
    ry: (point.y - rect.y) / rect.height,
  };
}

export function hasDefaultLayout(machineTemplate: string) {
  return machineTemplate in CONNECTORS_BY_TEMPLATE;
}

/**
 * One card, wired to one instrument pad, placed where the template says that
 * pad's card belongs.
 *
 * This is `createTemplateDefaultLayout` for a single connector, and it exists
 * so that tapping a pad on the machine produces exactly the card the template
 * would have produced for it — same side, same column slot, same bend. A pad
 * mapped by hand and a pad mapped by "⟲ Template" then look identical,
 * because they are.
 *
 * Returns null for a pad the template has no placement for. That is not an
 * error: a machine can have instrument pads the default layout does not lay a
 * card out for, and the caller falls back to placing one beside the pad.
 */
export function createCardForConnector(
  machineTemplate: string,
  connectorCode: string,
  machineRect?: MachineRect | null,
): { box: Box; trail: Trail } | null {
  // Resolved at the same size the canvas is drawn at, so a card placed by
  // tapping a pad lands exactly where "⟲ Template" would have put it.
  const rect = machineRect ?? REFERENCE_MACHINE_RECT;
  const templatePoints = templatePointsFor(machineTemplate, rect);
  const templatePoint = templatePoints?.find((candidate) => candidate.code === connectorCode);
  if (!templatePoint) return null;

  const artwork = artworkSizeForTemplate(machineTemplate);

  const referenceBoxEnd = stageFromReference(templatePoint.boxEnd);
  const box = boxFromEndpoint(referenceBoxEnd, templatePoint.side, templatePoint.label, templatePoint.code);
  const boxEnd = boxEndpoint(box, templatePoint.side);
  const machineEnd = {
    x: rect.x + (templatePoint.anchor.x / artwork.width) * rect.width,
    y: rect.y + (templatePoint.anchor.y / artwork.height) * rect.height,
  };
  const bends = templatePoint.bend ? [stageFromReference(templatePoint.bend)] : [];

  return {
    box,
    trail: {
      id: makeId('trail'),
      points: [machineEnd, ...bends, boxEnd],
      startMachineAnchor: machineAnchor(templatePoint.anchor.x, templatePoint.anchor.y, artwork),
      startMachinePointCode: templatePoint.code,
      endBoxId: box.id,
      endBoxAnchor: boxAnchorFor(box, boxEnd),
    },
  };
}

export function createTemplateDefaultLayout(
  machineTemplate: string,
  _channels: ChannelRef[],
  machineRect?: MachineRect | null,
): SavedLayout {
  const rect = machineRect ?? REFERENCE_MACHINE_RECT;
  const templatePoints = templatePointsFor(machineTemplate, rect);
  if (!templatePoints) return { trails: [], boxes: [] };

  const artwork = artworkSizeForTemplate(machineTemplate);
  const svgToStage = (sx: number, sy: number) => ({
    x: rect.x + (sx / artwork.width) * rect.width,
    y: rect.y + (sy / artwork.height) * rect.height,
  });

  const trails: Trail[] = [];
  const boxes: Box[] = [];

  for (const templatePoint of templatePoints) {
    const referenceBoxEnd = stageFromReference(templatePoint.boxEnd);
    const box = boxFromEndpoint(referenceBoxEnd, templatePoint.side, templatePoint.label, templatePoint.code);
    const boxEnd = boxEndpoint(box, templatePoint.side);

    const { x: sx, y: sy } = templatePoint.anchor;
    const machineEnd = svgToStage(sx, sy);
    const bends = templatePoint.bend ? [stageFromReference(templatePoint.bend)] : [];

    boxes.push(box);
    trails.push({
      id: makeId('trail'),
      points: [machineEnd, ...bends, boxEnd],
      autoRoute: machineTemplate === 'Twin Screw Extruder' && bends.length === 1 ? true : undefined,
      startMachineAnchor: machineAnchor(sx, sy, artwork),
      // The generated trail lands on a real instrument pad, so it says which
      // one — a template connection and a hand-drawn one are then the same
      // kind of thing to everything downstream.
      startMachinePointCode: templatePoint.code,
      endBoxId: box.id,
      endBoxAnchor: boxAnchorFor(box, boxEnd),
    });
  }

  return { trails, boxes };
}

/**
 * Upgrade saved twin-screw layouts without replacing operator positioning.
 *
 * Legacy uppercase identities are exact aliases. The exact supplied template
 * has 35 visible instruments and ends at barrel zone 8. Layouts saved against
 * the superseded generated drawing may still contain a `tz-09` card: its data
 * card is preserved but detached, and the obsolete machine trail is removed so
 * no connection lands on a sensor that is absent from the reference image.
 * Complete template-shaped layouts also recover dynamic routing for their
 * single authored bend.
 */
export function migrateTemplateLayout(
  machineTemplate: string,
  layout: SavedLayout,
  machineRect?: MachineRect | null,
): SavedLayout {
  if (machineTemplate !== 'Twin Screw Extruder') return layout;

  const knownCodes = new Set(TWIN_SCREW_POINT_REGISTRY.map((point) => point.code));
  const retiredBoxIds = new Set(
    layout.boxes
      .filter((box) => normalizeTwinScrewPointCode(box.templatePointCode) === 'tz-09')
      .map((box) => box.id),
  );
  let changed = false;
  const boxes = layout.boxes.map((box) => {
    const code = normalizeTwinScrewPointCode(box.templatePointCode);
    if (code === 'tz-09') {
      changed = true;
      return { ...box, templatePointCode: undefined };
    }
    if (code === box.templatePointCode) return box;
    changed = true;
    return { ...box, templatePointCode: code };
  });

  const boxCodes = new Set(
    boxes
      .map((box) => box.templatePointCode)
      .filter((code): code is string => Boolean(code && knownCodes.has(code))),
  );
  const completeCurrent =
    boxes.length === TWIN_SCREW_POINT_REGISTRY.length &&
    boxCodes.size === TWIN_SCREW_POINT_REGISTRY.length;
  const boxCodeById = new Map(boxes.map((box) => [box.id, box.templatePointCode]));
  const authoredRoutes = new Map(
    createTemplateDefaultLayout(machineTemplate, [], machineRect).trails
      .filter((trail) => trail.startMachinePointCode && trail.points.length === 3)
      .map((trail) => [trail.startMachinePointCode as string, trail.points[1]]),
  );

  const trails = layout.trails.flatMap((trail) => {
    const startCode = normalizeTwinScrewPointCode(trail.startMachinePointCode);
    const endCode = normalizeTwinScrewPointCode(trail.endMachinePointCode);
    const retiredMachineConnection =
      startCode === 'tz-09' ||
      endCode === 'tz-09' ||
      ((trail.startMachineAnchor || trail.endMachineAnchor) &&
        Boolean(
          (trail.startBoxId && retiredBoxIds.has(trail.startBoxId)) ||
            (trail.endBoxId && retiredBoxIds.has(trail.endBoxId)),
        ));
    if (retiredMachineConnection) {
      changed = true;
      return [];
    }
    const routeCode =
      startCode ??
      endCode ??
      (trail.endBoxId ? boxCodeById.get(trail.endBoxId) : undefined) ??
      (trail.startBoxId ? boxCodeById.get(trail.startBoxId) : undefined);
    const authoredBend = routeCode ? authoredRoutes.get(routeCode) : undefined;
    const templateRouted =
      completeCurrent &&
      trail.autoRoute === undefined &&
      trail.points.length === 3 &&
      Boolean(trail.startMachineAnchor) !== Boolean(trail.endMachineAnchor) &&
      Boolean(trail.startBoxId) !== Boolean(trail.endBoxId) &&
      Boolean(authoredBend) &&
      Math.hypot(
        trail.points[1].x - (authoredBend?.x ?? trail.points[1].x),
        trail.points[1].y - (authoredBend?.y ?? trail.points[1].y),
      ) <= 0.75;
    if (
      startCode === trail.startMachinePointCode &&
      endCode === trail.endMachinePointCode &&
      !templateRouted
    ) {
      return [trail];
    }
    changed = true;
    return [{
      ...trail,
      startMachinePointCode: startCode,
      endMachinePointCode: endCode,
      autoRoute: templateRouted ? true : trail.autoRoute,
    }];
  });

  return changed ? { ...layout, trails, boxes } : layout;
}
