import type { ChannelRef } from '../../../lib/rack';
import { artworkSizeForTemplate, RAV_CONNECTOR_POINTS } from './machineConnectors';
import { MAPPABLE_BOX_HEIGHT, UNLINKED_BOX_WIDTH } from './MappableBox';
import { EXTRUDER_CONNECTORS } from './SingleScrewExtruder';
import { TWIN_SCREW_CONNECTORS } from './TwinScrewExtruder';
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

/**
 * One card column per side, in registry order.
 *
 * The pad decides which side it stacks on, so the drive-side instruments run
 * down the left of the canvas and the process-side ones down the right — a
 * trail never has to cross the machine to reach its card.
 */
function columnTemplatePoints(connectors: readonly ArtworkConnector[]): TemplatePoint[] {
  const leftSlots = columnSlots(connectors.filter((connector) => connector.side === 'left').length);
  const rightSlots = columnSlots(connectors.filter((connector) => connector.side === 'right').length);
  let leftSlot = 0;
  let rightSlot = 0;
  return connectors.map((connector) => {
    const left = connector.side === 'left';
    const slotY = left ? leftSlots[leftSlot++] : rightSlots[rightSlot++];
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

const EXTRUDER_TEMPLATE_POINTS: TemplatePoint[] = columnTemplatePoints(EXTRUDER_CONNECTORS);
const TWIN_SCREW_TEMPLATE_POINTS: TemplatePoint[] = columnTemplatePoints(TWIN_SCREW_CONNECTORS);

const TEMPLATE_POINTS_BY_TEMPLATE: Record<string, TemplatePoint[]> = {
  'Rotary Airlock Valve': RAV_TEMPLATE_POINTS,
  'Single Screw Extruder': EXTRUDER_TEMPLATE_POINTS,
  'Twin Screw Extruder': TWIN_SCREW_TEMPLATE_POINTS,
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
