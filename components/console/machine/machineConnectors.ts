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
import {
  TWIN_SCREW_ARTWORK_HEIGHT,
  TWIN_SCREW_ARTWORK_WIDTH,
  TWIN_SCREW_POINT_REGISTRY,
} from '../../../lib/twinScrewExtruderPoints';

/**
 * The viewBox each artwork is drawn on.
 *
 * The Rotary Airlock Valve and the Single Screw Extruder share a 1200×760
 * frame; the Twin Screw Extruder is a longer machine and is drawn on its own
 * 1648×928 frame. A point is converted to a fraction of *its own* artwork, so
 * the frame a drawing chooses never leaks into another machine's anchors.
 */
export const ARTWORK_SIZE: Record<string, { width: number; height: number }> = {
  'Rotary Airlock Valve': { width: 1200, height: 760 },
  'Single Screw Extruder': { width: 1200, height: 760 },
  'Twin Screw Extruder': { width: TWIN_SCREW_ARTWORK_WIDTH, height: TWIN_SCREW_ARTWORK_HEIGHT },
};

const DEFAULT_ARTWORK = { width: 1200, height: 760 };

export function artworkSizeForTemplate(machineTemplate: string) {
  return ARTWORK_SIZE[machineTemplate] ?? DEFAULT_ARTWORK;
}

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

function fromArtwork(
  point: {
    code: string;
    label: string;
    kind?: string;
    x: number;
    y: number;
    analyzerTag?: string;
    analyzerNote?: string;
  },
  artwork: { width: number; height: number },
): MachineConnector {
  return {
    code: point.code,
    label: point.label,
    kind: point.kind,
    rx: point.x / artwork.width,
    ry: point.y / artwork.height,
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

const EXTRUDER_CONNECTOR_LIST: MachineConnector[] = EXTRUDER_POINT_REGISTRY.map((point) =>
  fromArtwork(point, ARTWORK_SIZE['Single Screw Extruder']),
);
/**
 * Twin-screw pads, derived from the registry rather than restated.
 *
 * Each entry carries the machine's canonical tag as well as its position, so
 * the connection confirmation can say what signal a channel just became — and,
 * where no commissioned rule reads it, why not.
 */
const TWIN_SCREW_CONNECTOR_LIST: MachineConnector[] = TWIN_SCREW_POINT_REGISTRY.map((point) => ({
  ...fromArtwork(point, ARTWORK_SIZE['Twin Screw Extruder']),
  analyzerTag: point.modelStatus === 'modelled' ? point.analyzerTag : undefined,
  analyzerNote: point.analyzerNote,
}));
const RAV_CONNECTOR_LIST: MachineConnector[] = RAV_CONNECTOR_POINTS.map((point) =>
  fromArtwork(point, ARTWORK_SIZE['Rotary Airlock Valve']),
);

const BY_TEMPLATE: Record<string, MachineConnector[]> = {
  'Single Screw Extruder': EXTRUDER_CONNECTOR_LIST,
  'Twin Screw Extruder': TWIN_SCREW_CONNECTOR_LIST,
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

// --------------------------------------------------------------------------------------
// Parameter matching
// --------------------------------------------------------------------------------------

/**
 * The physical quantity a pad expects, and a channel supplies.
 *
 * A pad is a *locking* point: it accepts a channel only when the channel
 * measures the quantity the instrument at that spot measures. Wiring a
 * thermocouple to the melt-pressure transducer is not a connection with a bad
 * value in it — it is not a connection at all, and the canvas refuses it rather
 * than letting the analysis layer discover the contradiction later.
 */
export type ParameterKind = 'Vibration' | 'Temperature' | 'Speed' | 'Pressure' | 'Electrical' | 'Level' | 'Flow';

/**
 * The quantity a unit denotes.
 *
 * The unit is the only trustworthy declaration of what a channel carries: a
 * rack Process Card stores one unit for all of its channels, so the card-level
 * letter can say "temperature" for a channel that is in fact reporting
 * kilowatts. The live measurement's own unit is therefore what this is asked
 * about wherever one exists.
 */
export function parameterKindForUnit(unit: string | undefined | null): ParameterKind | null {
  const value = (unit ?? '').trim().toLowerCase();
  if (!value) return null;
  if (['mm/s', 'mm/s rms', 'mms', 'in/s', 'ips', 'g', 'g rms', 'm/s2', 'm/s^2', 'm/s²'].includes(value)) return 'Vibration';
  if (['degc', '°c', 'c', 'celsius', 'degf', '°f', 'f', 'k', 'kelvin'].includes(value)) return 'Temperature';
  if (['rpm', 'rps', 'hz', 'r/min'].includes(value)) return 'Speed';
  if (['mpa', 'kpa', 'pa', 'bar', 'mbar', 'psi', 'kg/cm2'].includes(value)) return 'Pressure';
  if (['a', 'amp', 'amps', 'ma', 'kw', 'w', 'mw', 'v', 'kv', 'volt', 'volts', 'pf', 'kva', 'kvar'].includes(value)) return 'Electrical';
  if (['%', 'percent', 'pct', 'fraction'].includes(value)) return 'Level';
  // Gravimetric feeder throughput. Tested after '%' so a rate expressed as a
  // percentage of setpoint still reads as a level, which is what it is.
  if (['kg/h', 'kg/hr', 'kgh', 'kg/min', 'g/min', 'lb/h', 'lb/hr', 't/h', 'kg/s'].includes(value)) return 'Flow';
  return null;
}

/** The quantity a pad's instrument measures. */
export function parameterKindForConnector(connector: MachineConnector): ParameterKind | null {
  switch (connector.kind) {
    case 'Vibration':
      return 'Vibration';
    case 'Temperature':
      return 'Temperature';
    case 'Speed':
      return 'Speed';
    case 'Pressure':
      return 'Pressure';
    case 'Current':
    case 'Power':
      // PM1 is one three-phase meter; current, power, voltage and power factor
      // are all quantities the same instrument reports.
      return 'Electrical';
    case 'Level':
      return 'Level';
    case 'Flow':
      return 'Flow';
    default:
      return null;
  }
}

export type ConnectorFit = 'match' | 'mismatch' | 'unknown';

/**
 * Whether a channel may lock onto a pad.
 *
 * `unknown` — no unit has been declared yet, usually because the channel has
 * not reported since it was linked — is deliberately not a refusal. Blocking a
 * connection because a gateway has not sent its first sample would make the
 * canvas unusable during commissioning, which is exactly when it is used most.
 */
export function connectorFitForUnit(connector: MachineConnector, unit: string | undefined | null): ConnectorFit {
  const expected = parameterKindForConnector(connector);
  const supplied = parameterKindForUnit(unit);
  if (!expected || !supplied) return 'unknown';
  return expected === supplied ? 'match' : 'mismatch';
}

/** Human wording for what a pad wants, used in the refusal message. */
export function connectorExpectation(connector: MachineConnector): string {
  const kind = parameterKindForConnector(connector);
  switch (kind) {
    case 'Vibration':
      return 'a vibration channel (mm/s or g)';
    case 'Temperature':
      return 'a temperature channel (°C)';
    case 'Speed':
      return 'a speed channel (rpm)';
    case 'Pressure':
      return 'a pressure channel (MPa or bar)';
    case 'Electrical':
      return 'an electrical channel (A or kW)';
    case 'Level':
      return 'a level channel (%)';
    case 'Flow':
      return 'a feed-rate channel (kg/h)';
    default:
      return 'a matching channel';
  }
}
