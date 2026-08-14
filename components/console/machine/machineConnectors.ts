// Instrument pads a machine's artwork physically has.
//
// A trail endpoint dropped anywhere on the machine snaps to the nearest pad, so
// a mapped card can only ever be wired to a place the drawing actually has an
// instrument. Coordinates are fractions of the machine rect, which makes them
// independent of zoom, stage scale and screen size — the same fractions the
// saved trail anchors already use.
//
// `analyzerTag` is the fact that lets the canvas answer a question the canvas
// otherwise could not: whether the point a card just landed on is one the
// machine's analysis model actually consumes. Pads without a tag are real
// instruments the current model does not read, and they say so.

import { EXTRUDER_POINT_REGISTRY } from '../../../lib/extruderPoints';

/** Both machine artworks are drawn on one shared 1200×760 viewBox. */
const ARTWORK_WIDTH = 1200;
const ARTWORK_HEIGHT = 760;

export type MachineConnector = {
  code: string;
  label: string;
  /** What the instrument measures, for the connection confirmation. */
  kind?: string;
  /** Position as a fraction of the machine rect. */
  rx: number;
  ry: number;
  /** Signal tag the machine's analysis model reads this pad as, when it reads it at all. */
  analyzerTag?: string;
  /** Why the model does not consume this pad, when it does not. */
  analyzerNote?: string;
};

function fromArtwork(point: {
  code: string;
  label: string;
  kind?: string;
  x: number;
  y: number;
  analyzerTag?: string;
  analyzerNote?: string;
}): MachineConnector {
  return {
    code: point.code,
    label: point.label,
    kind: point.kind,
    rx: point.x / ARTWORK_WIDTH,
    ry: point.y / ARTWORK_HEIGHT,
    analyzerTag: point.analyzerTag,
    analyzerNote: point.analyzerNote,
  };
}

/**
 * Rotary Airlock Valve pads.
 *
 * The anchors are the ones the default trail layout has always used; they live
 * here now so the layout generator and the canvas snap targets cannot drift
 * apart. Tags are the rotary analyser's own signal codes.
 */
export const RAV_CONNECTOR_POINTS = [
  { code: 'C1', label: 'Motor Current', kind: 'Current', x: 405, y: 218, analyzerTag: 'motor_current' },
  { code: 'S1', label: 'Rotor Speed', kind: 'Speed', x: 126, y: 357, analyzerTag: 'rotor_speed' },
  { code: 'P1', label: 'Inlet Pressure', kind: 'Pressure', x: 126, y: 403, analyzerTag: 'inlet_pressure' },
  { code: 'P2', label: 'Outlet Pressure', kind: 'Pressure', x: 405, y: 542, analyzerTag: 'outlet_pressure' },
  { code: 'T3', label: 'Material Temperature', kind: 'Temperature', x: 635, y: 542, analyzerTag: 'material_temperature' },
  { code: 'V1', label: 'DE Vibration Acceleration RMS', kind: 'Vibration', x: 635, y: 218, analyzerTag: 'de_vibration_acceleration_rms' },
  { code: 'V2', label: 'NDE Vibration Acceleration RMS', kind: 'Vibration', x: 720, y: 328, analyzerTag: 'nde_vibration_acceleration_rms' },
  { code: 'T1', label: 'DE Bearing Temperature', kind: 'Temperature', x: 720, y: 432, analyzerTag: 'de_bearing_temperature' },
  { code: 'T2', label: 'NDE Bearing Temperature', kind: 'Temperature', x: 700, y: 522, analyzerTag: 'nde_bearing_temperature' },
] as const;

const EXTRUDER_CONNECTOR_LIST: MachineConnector[] = EXTRUDER_POINT_REGISTRY.map(fromArtwork);
const RAV_CONNECTOR_LIST: MachineConnector[] = RAV_CONNECTOR_POINTS.map(fromArtwork);

const BY_TEMPLATE: Record<string, MachineConnector[]> = {
  'Single Screw Extruder': EXTRUDER_CONNECTOR_LIST,
  'Rotary Airlock Valve': RAV_CONNECTOR_LIST,
};

export function connectorsForTemplate(machineTemplate: string): MachineConnector[] {
  return BY_TEMPLATE[machineTemplate] ?? [];
}

export function connectorByCode(machineTemplate: string, code: string | undefined): MachineConnector | undefined {
  if (!code) return undefined;
  return connectorsForTemplate(machineTemplate).find((connector) => connector.code === code);
}

/** How a pad is currently wired, for the artwork and the canvas overlay. */
export type ConnectorState = 'idle' | 'linked' | 'live';
