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

// Card column, bend and side per pad. The pad's own position comes from
// `RAV_CONNECTOR_POINTS`, which is also what the canvas snaps trail endpoints
// to — so a generated trail and a hand-drawn one land on the same spot.
const RAV_CARD_PLACEMENT: Record<string, { side: 'left' | 'right'; boxEnd: ReferencePoint; bend: ReferencePoint }> = {
  C1: { side: 'left', boxEnd: { x: 255, y: 79 }, bend: { x: 415, y: 79 } },
  S1: { side: 'left', boxEnd: { x: 255, y: 184 }, bend: { x: 355, y: 184 } },
  P1: { side: 'left', boxEnd: { x: 255, y: 289 }, bend: { x: 355, y: 289 } },
  P2: { side: 'left', boxEnd: { x: 255, y: 394 }, bend: { x: 410, y: 394 } },
  T3: { side: 'left', boxEnd: { x: 255, y: 499 }, bend: { x: 410, y: 499 } },
  V1: { side: 'right', boxEnd: { x: 1185, y: 79 }, bend: { x: 1035, y: 79 } },
  V2: { side: 'right', boxEnd: { x: 1185, y: 184 }, bend: { x: 1040, y: 184 } },
  T1: { side: 'right', boxEnd: { x: 1185, y: 289 }, bend: { x: 1045, y: 289 } },
  T2: { side: 'right', boxEnd: { x: 1185, y: 394 }, bend: { x: 1040, y: 394 } },
};

const RAV_TEMPLATE_POINTS: TemplatePoint[] = RAV_CONNECTOR_POINTS.flatMap((connector) => {
  const placement = RAV_CARD_PLACEMENT[connector.code];
  if (!placement) return [];
  return [
    {
      code: connector.code,
      label: connector.label,
      side: placement.side,
      anchor: { x: connector.x, y: connector.y },
      boxEnd: placement.boxEnd,
      bend: placement.bend,
    },
  ];
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
function crossingsFor(
  order: readonly ArtworkConnector[],
  column: number,
  bendX: number,
  artwork: { width: number; height: number },
): number {
  const slots = columnSlots(order.length);
  const segments: Seg[] = [];
  order.forEach((connector, index) => {
    const pad = {
      x: REFERENCE_MACHINE_RECT.x + (connector.x / artwork.width) * REFERENCE_MACHINE_RECT.width,
      y: REFERENCE_MACHINE_RECT.y + (connector.y / artwork.height) * REFERENCE_MACHINE_RECT.height,
    };
    const bend = stageFromReference({ x: bendX, y: slots[index] });
    segments.push([pad, bend]);
    segments.push([bend, stageFromReference({ x: column, y: slots[index] })]);
  });
  let count = 0;
  for (let i = 0; i < segments.length; i += 1) {
    for (let j = i + 1; j < segments.length; j += 1) {
      if (segmentsCross(segments[i], segments[j])) count += 1;
    }
  }
  return count;
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
): ArtworkConnector[] {
  // Two starts, because the local search cannot leave a valley it begins in.
  // Height then horizontal position is the natural reading order; the
  // horizontal tie-break reversed is the other sensible one, and on the
  // extractor — five hoppers at one height, five pumps at another — it is the
  // one that reaches zero. Whichever ends better wins, and ties keep the
  // first, so the result does not depend on the order they are tried in.
  const starts = [
    [...connectors].sort((a, b) => a.y - b.y || a.x - b.x),
    [...connectors].sort((a, b) => a.y - b.y || b.x - a.x),
    // Distance from the column, which separates instruments that sit at one
    // height but different depths into the machine — five hoppers in a row,
    // five pumps under them — where sorting by height alone has nothing to
    // go on and leaves the tie to chance.
    [...connectors].sort((a, b) => (column === COLUMN_LEFT ? a.x - b.x : b.x - a.x) || a.y - b.y),
  ];
  let order = starts[0];
  let best = crossingsFor(order, column, bendX, artwork);
  for (const start of starts.slice(1)) {
    const count = crossingsFor(start, column, bendX, artwork);
    if (count < best) {
      order = start;
      best = count;
    }
  }

  for (let pass = 0; pass < 80 && best > 0; pass += 1) {
    let improved = false;

    // Neighbour swaps: cheap, and fixes the common case of two cards in the
    // wrong order relative to their pads.
    for (let i = 0; i < order.length - 1; i += 1) {
      const trial = [...order];
      [trial[i], trial[i + 1]] = [trial[i + 1], trial[i]];
      const count = crossingsFor(trial, column, bendX, artwork);
      if (count < best) {
        order = trial;
        best = count;
        improved = true;
      }
    }

    // Exchanging any two cards, not only neighbours. Not covered by the
    // moves above: an insertion is a slide, and the intermediate positions of
    // a slide can each be worse than staying put even when the exchange is
    // better.
    for (let i = 0; i < order.length && best > 0; i += 1) {
      for (let j = i + 2; j < order.length; j += 1) {
        const trial = [...order];
        [trial[i], trial[j]] = [trial[j], trial[i]];
        const count = crossingsFor(trial, column, bendX, artwork);
        if (count < best) {
          order = trial;
          best = count;
          improved = true;
        }
      }
    }

    // Moving one card to another slot. Swaps alone stall on the twin screw,
    // the flaking mill and the extractor, where a card has to travel several
    // slots and every single step of the journey is worse than staying put.
    for (let from = 0; from < order.length && best > 0; from += 1) {
      for (let to = 0; to < order.length; to += 1) {
        if (to === from) continue;
        const trial = [...order];
        const [moved] = trial.splice(from, 1);
        trial.splice(to, 0, moved);
        const count = crossingsFor(trial, column, bendX, artwork);
        if (count < best) {
          order = trial;
          best = count;
          improved = true;
        }
      }
    }

    if (!improved) break;
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
function columnTemplatePoints(
  connectors: readonly ArtworkConnector[],
  artwork: { width: number; height: number },
): TemplatePoint[] {
  const slotFor = new Map<string, number>();
  for (const side of ['left', 'right'] as const) {
    const column = side === 'left' ? COLUMN_LEFT : COLUMN_RIGHT;
    const bendX = side === 'left' ? column + 96 : column - 96;
    const group = connectors.filter((connector) => connector.side === side);
    const ordered = orderWithoutCrossings(group, column, bendX, artwork);
    const slots = columnSlots(ordered.length);
    ordered.forEach((connector, index) => slotFor.set(connector.code, slots[index]));
  }

  // Emitted in registry order, so the cards a machine is built with stay in
  // the order the instruments are declared in; only the heights change.
  return connectors.map((connector) => {
    const left = connector.side === 'left';
    const slotY = slotFor.get(connector.code) ?? SLOT_TOP;
    const column = left ? COLUMN_LEFT : COLUMN_RIGHT;
    return {
      code: connector.code,
      label: connector.label,
      side: connector.side,
      anchor: { x: connector.x, y: connector.y },
      boxEnd: { x: column, y: slotY },
      // Bend just outside the card column so trails leave horizontally and
      // turn once, instead of cutting diagonally across the machine.
      bend: { x: left ? column + 96 : column - 96, y: slotY },
    };
  });
}

const EXTRUDER_TEMPLATE_POINTS: TemplatePoint[] = columnTemplatePoints(EXTRUDER_CONNECTORS, artworkSizeForTemplate('Single Screw Extruder'));
const TWIN_SCREW_TEMPLATE_POINTS: TemplatePoint[] = columnTemplatePoints(TWIN_SCREW_CONNECTORS, artworkSizeForTemplate('Twin Screw Extruder'));
// Taken from the registry rather than from the drawing, so the default layout
// does not pull the SVG scene into a module that only needs coordinates.
const EXPANDER_TEMPLATE_POINTS: TemplatePoint[] = columnTemplatePoints(EXPANDER_POINT_REGISTRY, artworkSizeForTemplate('Expander X-101'));
const FLAKING_MILL_TEMPLATE_POINTS: TemplatePoint[] = columnTemplatePoints(FLAKING_MILL_POINT_REGISTRY, artworkSizeForTemplate('Flaking Mill M-102'));
const CRACKING_MILL_TEMPLATE_POINTS: TemplatePoint[] = columnTemplatePoints(CRACKING_MILL_POINT_REGISTRY, artworkSizeForTemplate('Cracking Mill M-101'));
const CONDITIONER_TEMPLATE_POINTS: TemplatePoint[] = columnTemplatePoints(CONDITIONER_POINT_REGISTRY, artworkSizeForTemplate('Conditioner E-102'));
// The oilseed four. `side` comes from the supplied x against the drawing's
// midline, so drive-side pads stack left and process-side pads stack right
// without a trail crossing the machine to reach its card.
const DTDC_TEMPLATE_POINTS: TemplatePoint[] = columnTemplatePoints(DTDC_POINT_REGISTRY, artworkSizeForTemplate('DTDC'));
const SOLVENT_EXTRACTOR_TEMPLATE_POINTS: TemplatePoint[] = columnTemplatePoints(SOLVENT_EXTRACTOR_POINT_REGISTRY, artworkSizeForTemplate('Solvent Extractor'));
const COLLET_COOLER_TEMPLATE_POINTS: TemplatePoint[] = columnTemplatePoints(COLLET_COOLER_POINT_REGISTRY, artworkSizeForTemplate('Collet Cooler'));
const SEED_DRYER_COOLER_TEMPLATE_POINTS: TemplatePoint[] = columnTemplatePoints(SEED_DRYER_COOLER_POINT_REGISTRY, artworkSizeForTemplate('Seed Dryer Cooler'));
const HAMMER_MILL_TEMPLATE_POINTS: TemplatePoint[] = columnTemplatePoints(HAMMER_MILL_POINT_REGISTRY, artworkSizeForTemplate('Hammer Mill'));
const MEAL_SIFTER_TEMPLATE_POINTS: TemplatePoint[] = columnTemplatePoints(MEAL_SIFTER_POINT_REGISTRY, artworkSizeForTemplate('Meal Sifter'));
const MEAL_CONVEYING_STORAGE_TEMPLATE_POINTS: TemplatePoint[] = columnTemplatePoints(MEAL_CONVEYING_STORAGE_POINT_REGISTRY, artworkSizeForTemplate('Meal Conveying & Storage'));
const AUTO_BAGGER_TEMPLATE_POINTS: TemplatePoint[] = columnTemplatePoints(AUTO_BAGGER_POINT_REGISTRY, artworkSizeForTemplate('Auto Bagger & Stitcher'));
const MISCELLA_DISTILLATION_TEMPLATE_POINTS: TemplatePoint[] = columnTemplatePoints(MISCELLA_DISTILLATION_POINT_REGISTRY, artworkSizeForTemplate('Miscella Distillation'));
const SOLVENT_RECOVERY_TEMPLATE_POINTS: TemplatePoint[] = columnTemplatePoints(SOLVENT_RECOVERY_POINT_REGISTRY, artworkSizeForTemplate('Solvent Recovery'));

const TEMPLATE_POINTS_BY_TEMPLATE: Record<string, TemplatePoint[]> = {
  'Rotary Airlock Valve': RAV_TEMPLATE_POINTS,
  'Single Screw Extruder': EXTRUDER_TEMPLATE_POINTS,
  'Twin Screw Extruder': TWIN_SCREW_TEMPLATE_POINTS,
  'Expander X-101': EXPANDER_TEMPLATE_POINTS,
  'Flaking Mill M-102': FLAKING_MILL_TEMPLATE_POINTS,
  'Cracking Mill M-101': CRACKING_MILL_TEMPLATE_POINTS,
  'Conditioner E-102': CONDITIONER_TEMPLATE_POINTS,
  DTDC: DTDC_TEMPLATE_POINTS,
  'Solvent Extractor': SOLVENT_EXTRACTOR_TEMPLATE_POINTS,
  'Collet Cooler': COLLET_COOLER_TEMPLATE_POINTS,
  'Seed Dryer Cooler': SEED_DRYER_COOLER_TEMPLATE_POINTS,
  'Hammer Mill': HAMMER_MILL_TEMPLATE_POINTS,
  'Meal Sifter': MEAL_SIFTER_TEMPLATE_POINTS,
  'Meal Conveying & Storage': MEAL_CONVEYING_STORAGE_TEMPLATE_POINTS,
  'Auto Bagger & Stitcher': AUTO_BAGGER_TEMPLATE_POINTS,
  'Miscella Distillation': MISCELLA_DISTILLATION_TEMPLATE_POINTS,
  'Solvent Recovery': SOLVENT_RECOVERY_TEMPLATE_POINTS,
};

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
  return machineTemplate in TEMPLATE_POINTS_BY_TEMPLATE;
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
  const templatePoints = TEMPLATE_POINTS_BY_TEMPLATE[machineTemplate];
  const templatePoint = templatePoints?.find((candidate) => candidate.code === connectorCode);
  if (!templatePoint) return null;

  const rect = machineRect ?? REFERENCE_MACHINE_RECT;
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
  const templatePoints = TEMPLATE_POINTS_BY_TEMPLATE[machineTemplate];
  if (!templatePoints) return { trails: [], boxes: [] };

  const rect = machineRect ?? REFERENCE_MACHINE_RECT;
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
