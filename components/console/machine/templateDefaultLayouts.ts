import type { ChannelRef } from '../../../lib/rack';
import { MAPPABLE_BOX_HEIGHT, UNLINKED_BOX_WIDTH } from './MappableBox';
import type { Anchor, Box, SavedLayout, Trail } from './TrailBoard';

const STAGE_W = 1600;
const STAGE_H = 900;

const REFERENCE_MACHINE_RECT = { x: 384, y: 186.53, width: 832, height: 526.93 };
const REFERENCE_CANVAS_W = 1440;
const REFERENCE_CANVAS_H = 820;
const REFERENCE_STAGE_SCALE = Math.min(STAGE_W / REFERENCE_CANVAS_W, STAGE_H / REFERENCE_CANVAS_H);
const REFERENCE_STAGE_X = (STAGE_W - REFERENCE_CANVAS_W * REFERENCE_STAGE_SCALE) / 2;
const REFERENCE_STAGE_Y = (STAGE_H - REFERENCE_CANVAS_H * REFERENCE_STAGE_SCALE) / 2;
// Both machine artworks share one 1200×760 viewBox, so anchors below are read
// straight off the SVG drawing and converted to fractions of the machine rect.
const SVG_W = 1200;
const SVG_H = 760;
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

const RAV_TEMPLATE_POINTS: TemplatePoint[] = [
  { code: 'C1', label: 'Motor Current', side: 'left', anchor: { x: 405, y: 218 }, boxEnd: { x: 255, y: 79 }, bend: { x: 415, y: 79 } },
  { code: 'S1', label: 'Rotor Speed', side: 'left', anchor: { x: 126, y: 357 }, boxEnd: { x: 255, y: 184 }, bend: { x: 355, y: 184 } },
  { code: 'P1', label: 'Inlet Pressure', side: 'left', anchor: { x: 126, y: 403 }, boxEnd: { x: 255, y: 289 }, bend: { x: 355, y: 289 } },
  { code: 'P2', label: 'Outlet Pressure', side: 'left', anchor: { x: 405, y: 542 }, boxEnd: { x: 255, y: 394 }, bend: { x: 410, y: 394 } },
  { code: 'T3', label: 'Material Temperature', side: 'left', anchor: { x: 635, y: 542 }, boxEnd: { x: 255, y: 499 }, bend: { x: 410, y: 499 } },
  { code: 'V1', label: 'DE Vibration Acceleration RMS', side: 'right', anchor: { x: 635, y: 218 }, boxEnd: { x: 1185, y: 79 }, bend: { x: 1035, y: 79 } },
  { code: 'V2', label: 'NDE Vibration Acceleration RMS', side: 'right', anchor: { x: 720, y: 328 }, boxEnd: { x: 1185, y: 184 }, bend: { x: 1040, y: 184 } },
  { code: 'T1', label: 'DE Bearing Temperature', side: 'right', anchor: { x: 720, y: 432 }, boxEnd: { x: 1185, y: 289 }, bend: { x: 1045, y: 289 } },
  { code: 'T2', label: 'NDE Bearing Temperature', side: 'right', anchor: { x: 700, y: 522 }, boxEnd: { x: 1185, y: 394 }, bend: { x: 1040, y: 394 } },
];

/**
 * Single Screw Extruder — anchors follow the drive train left to right:
 * motor → coupling → gear box → thrust end → barrel zones → die.
 * Left column carries the drive-side points, right column the process points.
 */
const EXTRUDER_TEMPLATE_POINTS: TemplatePoint[] = [
  { code: 'T2', label: 'Thrust Bearing Temperature', side: 'left', anchor: { x: 392, y: 340 }, boxEnd: { x: 255, y: 79 }, bend: { x: 420, y: 79 } },
  { code: 'C1', label: 'Motor Current', side: 'left', anchor: { x: 110, y: 468 }, boxEnd: { x: 255, y: 184 }, bend: { x: 330, y: 184 } },
  { code: 'S1', label: 'Screw Speed', side: 'left', anchor: { x: 241, y: 494 }, boxEnd: { x: 255, y: 289 }, bend: { x: 430, y: 289 } },
  { code: 'V2', label: 'Motor NDE Vibration Acceleration RMS', side: 'left', anchor: { x: 62, y: 520 }, boxEnd: { x: 255, y: 394 }, bend: { x: 300, y: 394 } },
  { code: 'V1', label: 'Motor DE Vibration Acceleration RMS', side: 'left', anchor: { x: 198, y: 520 }, boxEnd: { x: 255, y: 499 }, bend: { x: 370, y: 499 } },
  { code: 'T1', label: 'Gearbox Oil Temperature', side: 'left', anchor: { x: 262, y: 560 }, boxEnd: { x: 255, y: 604 }, bend: { x: 400, y: 604 } },
  { code: 'T3', label: 'Feed Throat Temperature', side: 'right', anchor: { x: 540, y: 300 }, boxEnd: { x: 1185, y: 79 }, bend: { x: 1060, y: 79 } },
  { code: 'T4', label: 'Barrel Zone Temperature', side: 'right', anchor: { x: 705, y: 330 }, boxEnd: { x: 1185, y: 184 }, bend: { x: 1105, y: 184 } },
  { code: 'T5', label: 'Melt Temperature', side: 'right', anchor: { x: 1006, y: 340 }, boxEnd: { x: 1185, y: 289 }, bend: { x: 1160, y: 289 } },
  { code: 'P2', label: 'Die Head Pressure', side: 'right', anchor: { x: 1084, y: 364 }, boxEnd: { x: 1185, y: 394 }, bend: { x: 1178, y: 394 } },
  { code: 'P1', label: 'Melt Pressure', side: 'right', anchor: { x: 1006, y: 420 }, boxEnd: { x: 1185, y: 499 }, bend: { x: 1105, y: 499 } },
];

const TEMPLATE_POINTS_BY_TEMPLATE: Record<string, TemplatePoint[]> = {
  'Rotary Airlock Valve': RAV_TEMPLATE_POINTS,
  'Single Screw Extruder': EXTRUDER_TEMPLATE_POINTS,
};

function makeId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function machineAnchor(sx: number, sy: number): Anchor {
  return { rx: sx / SVG_W, ry: sy / SVG_H };
}

function stageFromReference(point: ReferencePoint) {
  return {
    x: REFERENCE_STAGE_X + point.x * REFERENCE_STAGE_SCALE,
    y: REFERENCE_STAGE_Y + point.y * REFERENCE_STAGE_SCALE,
  };
}

function boxFromEndpoint(point: ReferencePoint, side: TemplatePoint['side'], label: string): Box {
  const cardLeft = side === 'left' ? point.x - UNLINKED_BOX_WIDTH - BOX_CONNECTOR_GAP : point.x + BOX_CONNECTOR_GAP;
  return {
    id: makeId('box'),
    x: cardLeft - 12,
    y: point.y - BOX_CONNECTOR_Y_OFFSET,
    label,
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
  const svgToStage = (sx: number, sy: number) => ({
    x: rect.x + (sx / SVG_W) * rect.width,
    y: rect.y + (sy / SVG_H) * rect.height,
  });

  const trails: Trail[] = [];
  const boxes: Box[] = [];

  for (const templatePoint of templatePoints) {
    const referenceBoxEnd = stageFromReference(templatePoint.boxEnd);
    const box = boxFromEndpoint(referenceBoxEnd, templatePoint.side, templatePoint.label);
    const boxEnd = boxEndpoint(box, templatePoint.side);

    const { x: sx, y: sy } = templatePoint.anchor;
    const machineEnd = svgToStage(sx, sy);
    const bends = templatePoint.bend ? [stageFromReference(templatePoint.bend)] : [];

    boxes.push(box);
    trails.push({
      id: makeId('trail'),
      points: [machineEnd, ...bends, boxEnd],
      startMachineAnchor: machineAnchor(sx, sy),
      endBoxId: box.id,
      endBoxAnchor: boxAnchorFor(box, boxEnd),
    });
  }

  return { trails, boxes };
}
