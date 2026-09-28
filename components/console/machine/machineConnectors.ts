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

import {
  AUTO_BAGGER_ARTWORK_HEIGHT,
  AUTO_BAGGER_ARTWORK_WIDTH,
  AUTO_BAGGER_POINT_REGISTRY,
} from '../../../lib/machinePoints/autoBaggerPoints';
import {
  COLLET_COOLER_ARTWORK_HEIGHT,
  COLLET_COOLER_ARTWORK_WIDTH,
  COLLET_COOLER_POINT_REGISTRY,
} from '../../../lib/machinePoints/colletCoolerPoints';
import {
  CONDITIONER_ARTWORK_HEIGHT,
  CONDITIONER_ARTWORK_WIDTH,
  CONDITIONER_POINT_REGISTRY,
} from '../../../lib/machinePoints/conditionerPoints';
import {
  CRACKING_MILL_ARTWORK_HEIGHT,
  CRACKING_MILL_ARTWORK_WIDTH,
  CRACKING_MILL_POINT_REGISTRY,
} from '../../../lib/machinePoints/crackingMillPoints';
import {
  EXPANDER_ARTWORK_HEIGHT,
  EXPANDER_ARTWORK_WIDTH,
  EXPANDER_POINT_REGISTRY,
} from '../../../lib/machinePoints/expanderPoints';
import {
  DTDC_ARTWORK_HEIGHT,
  DTDC_ARTWORK_WIDTH,
  DTDC_POINT_REGISTRY,
} from '../../../lib/machinePoints/dtdcPoints';
import { EXTRUDER_POINT_REGISTRY } from '../../../lib/machinePoints/extruderPoints';
import {
  HAMMER_MILL_ARTWORK_HEIGHT,
  HAMMER_MILL_ARTWORK_WIDTH,
  HAMMER_MILL_POINT_REGISTRY,
} from '../../../lib/machinePoints/hammerMillPoints';
import {
  MEAL_CONVEYING_STORAGE_ARTWORK_HEIGHT,
  MEAL_CONVEYING_STORAGE_ARTWORK_WIDTH,
  MEAL_CONVEYING_STORAGE_POINT_REGISTRY,
} from '../../../lib/machinePoints/mealConveyingStoragePoints';
import {
  MEAL_SIFTER_ARTWORK_HEIGHT,
  MEAL_SIFTER_ARTWORK_WIDTH,
  MEAL_SIFTER_POINT_REGISTRY,
} from '../../../lib/machinePoints/mealSifterPoints';
import {
  FLAKING_MILL_ARTWORK_HEIGHT,
  FLAKING_MILL_ARTWORK_WIDTH,
  FLAKING_MILL_POINT_REGISTRY,
} from '../../../lib/machinePoints/flakingMillPoints';
import {
  SEED_DRYER_COOLER_ARTWORK_HEIGHT,
  SEED_DRYER_COOLER_ARTWORK_WIDTH,
  SEED_DRYER_COOLER_POINT_REGISTRY,
} from '../../../lib/machinePoints/seedDryerCoolerPoints';
import {
  SOLVENT_EXTRACTOR_ARTWORK_HEIGHT,
  SOLVENT_EXTRACTOR_ARTWORK_WIDTH,
  SOLVENT_EXTRACTOR_POINT_REGISTRY,
} from '../../../lib/machinePoints/solventExtractorPoints';
import {
  TWIN_SCREW_ARTWORK_HEIGHT,
  TWIN_SCREW_ARTWORK_WIDTH,
  TWIN_SCREW_POINT_REGISTRY,
} from '../../../lib/machinePoints/twinScrewExtruderPoints';

/**
 * The viewBox each artwork is drawn on.
 *
 * The Rotary Airlock Valve and the Single Screw Extruder share a 1200×760
 * frame; the Twin Screw Extruder uses its supplied image's native 1700×670
 * frame. A point is converted to a fraction of *its own* artwork, so
 * the frame a drawing chooses never leaks into another machine's anchors.
 */
export const ARTWORK_SIZE: Record<string, { width: number; height: number }> = {
  'Rotary Airlock Valve': { width: 1200, height: 760 },
  'Single Screw Extruder': { width: 1200, height: 760 },
  'Twin Screw Extruder': { width: TWIN_SCREW_ARTWORK_WIDTH, height: TWIN_SCREW_ARTWORK_HEIGHT },
  'Expander X-101': { width: EXPANDER_ARTWORK_WIDTH, height: EXPANDER_ARTWORK_HEIGHT },
  // Taller than every other flat artwork; this machine is a vertical stack.
  'Flaking Mill M-102': { width: FLAKING_MILL_ARTWORK_WIDTH, height: FLAKING_MILL_ARTWORK_HEIGHT },
  'Cracking Mill M-101': { width: CRACKING_MILL_ARTWORK_WIDTH, height: CRACKING_MILL_ARTWORK_HEIGHT },
  'Conditioner E-102': { width: CONDITIONER_ARTWORK_WIDTH, height: CONDITIONER_ARTWORK_HEIGHT },
  DTDC: { width: DTDC_ARTWORK_WIDTH, height: DTDC_ARTWORK_HEIGHT },
  // The one wide machine in the oilseed set — a chain extractor is long and
  // low, and the archive draws it on 1200x850 rather than the 1200x1000 the
  // other three share.
  'Solvent Extractor': { width: SOLVENT_EXTRACTOR_ARTWORK_WIDTH, height: SOLVENT_EXTRACTOR_ARTWORK_HEIGHT },
  'Collet Cooler': { width: COLLET_COOLER_ARTWORK_WIDTH, height: COLLET_COOLER_ARTWORK_HEIGHT },
  'Seed Dryer Cooler': { width: SEED_DRYER_COOLER_ARTWORK_WIDTH, height: SEED_DRYER_COOLER_ARTWORK_HEIGHT },
  'Hammer Mill': { width: HAMMER_MILL_ARTWORK_WIDTH, height: HAMMER_MILL_ARTWORK_HEIGHT },
  'Meal Sifter': { width: MEAL_SIFTER_ARTWORK_WIDTH, height: MEAL_SIFTER_ARTWORK_HEIGHT },
  'Meal Conveying & Storage': { width: MEAL_CONVEYING_STORAGE_ARTWORK_WIDTH, height: MEAL_CONVEYING_STORAGE_ARTWORK_HEIGHT },
  'Auto Bagger & Stitcher': { width: AUTO_BAGGER_ARTWORK_WIDTH, height: AUTO_BAGGER_ARTWORK_HEIGHT },
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
  /**
   * Dynamic 3D target visibility. False keeps an attached trail at its last
   * valid position while excluding an off-screen/occluded point from snapping.
   * Flat artwork connectors leave this undefined and remain available.
   */
  projectionVisible?: boolean;
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
/**
 * Expander pads, derived from the registry.
 *
 * No `analyzerTag` is carried through, and that is the point: every pad on
 * this machine is a real instrument that no commissioned model reads yet, so
 * the connection confirmation says exactly that rather than implying a
 * diagnostic will run.
 */
const EXPANDER_CONNECTOR_LIST: MachineConnector[] = EXPANDER_POINT_REGISTRY.map((point) =>
  fromArtwork(point, ARTWORK_SIZE['Expander X-101']),
);
/**
 * Flaking-mill pads, derived from the registry.
 *
 * Unlike every other list here, these positions were written during
 * integration rather than supplied with the drawing — the template ships no
 * sensor registry at all. `lib/flakingMillPoints.ts` records that, and why.
 */
const FLAKING_MILL_CONNECTOR_LIST: MachineConnector[] = FLAKING_MILL_POINT_REGISTRY.map((point) =>
  fromArtwork(point, ARTWORK_SIZE['Flaking Mill M-102']),
);
// Like the flaking mill, both of these templates ship no sensor registry; the
// positions were written during integration and each lib file records that.
const CRACKING_MILL_CONNECTOR_LIST: MachineConnector[] = CRACKING_MILL_POINT_REGISTRY.map((point) =>
  fromArtwork(point, ARTWORK_SIZE['Cracking Mill M-101']),
);
const CONDITIONER_CONNECTOR_LIST: MachineConnector[] = CONDITIONER_POINT_REGISTRY.map((point) =>
  fromArtwork(point, ARTWORK_SIZE['Conditioner E-102']),
);
/**
 * The oilseed four, derived from their registries.
 *
 * These are the first templates in the set whose pad positions were *supplied*
 * rather than written during integration — each archive ships a
 * `connections.json` and the registries are that file. No `analyzerTag` is
 * carried, for the same reason the expander carries none: every pad is a real
 * instrument, and no commissioned model reads any of them yet.
 */
const DTDC_CONNECTOR_LIST: MachineConnector[] = DTDC_POINT_REGISTRY.map((point) =>
  fromArtwork(point, ARTWORK_SIZE['DTDC']),
);
const SOLVENT_EXTRACTOR_CONNECTOR_LIST: MachineConnector[] = SOLVENT_EXTRACTOR_POINT_REGISTRY.map((point) =>
  fromArtwork(point, ARTWORK_SIZE['Solvent Extractor']),
);
const COLLET_COOLER_CONNECTOR_LIST: MachineConnector[] = COLLET_COOLER_POINT_REGISTRY.map((point) =>
  fromArtwork(point, ARTWORK_SIZE['Collet Cooler']),
);
const SEED_DRYER_COOLER_CONNECTOR_LIST: MachineConnector[] = SEED_DRYER_COOLER_POINT_REGISTRY.map((point) =>
  fromArtwork(point, ARTWORK_SIZE['Seed Dryer Cooler']),
);
// The meal-handling four, derived from their supplied registries. As with the
// oilseed set, no analyzerTag: every pad is a real instrument and no
// commissioned model reads any of them yet.
const HAMMER_MILL_CONNECTOR_LIST: MachineConnector[] = HAMMER_MILL_POINT_REGISTRY.map((point) =>
  fromArtwork(point, ARTWORK_SIZE['Hammer Mill']),
);
const MEAL_SIFTER_CONNECTOR_LIST: MachineConnector[] = MEAL_SIFTER_POINT_REGISTRY.map((point) =>
  fromArtwork(point, ARTWORK_SIZE['Meal Sifter']),
);
const MEAL_CONVEYING_STORAGE_CONNECTOR_LIST: MachineConnector[] = MEAL_CONVEYING_STORAGE_POINT_REGISTRY.map((point) =>
  fromArtwork(point, ARTWORK_SIZE['Meal Conveying & Storage']),
);
const AUTO_BAGGER_CONNECTOR_LIST: MachineConnector[] = AUTO_BAGGER_POINT_REGISTRY.map((point) =>
  fromArtwork(point, ARTWORK_SIZE['Auto Bagger & Stitcher']),
);
const RAV_CONNECTOR_LIST: MachineConnector[] = RAV_CONNECTOR_POINTS.map((point) =>
  fromArtwork(point, ARTWORK_SIZE['Rotary Airlock Valve']),
);

const BY_TEMPLATE: Record<string, MachineConnector[]> = {
  'Single Screw Extruder': EXTRUDER_CONNECTOR_LIST,
  'Twin Screw Extruder': TWIN_SCREW_CONNECTOR_LIST,
  'Rotary Airlock Valve': RAV_CONNECTOR_LIST,
  'Expander X-101': EXPANDER_CONNECTOR_LIST,
  'Flaking Mill M-102': FLAKING_MILL_CONNECTOR_LIST,
  'Cracking Mill M-101': CRACKING_MILL_CONNECTOR_LIST,
  'Conditioner E-102': CONDITIONER_CONNECTOR_LIST,
  DTDC: DTDC_CONNECTOR_LIST,
  'Solvent Extractor': SOLVENT_EXTRACTOR_CONNECTOR_LIST,
  'Collet Cooler': COLLET_COOLER_CONNECTOR_LIST,
  'Seed Dryer Cooler': SEED_DRYER_COOLER_CONNECTOR_LIST,
  'Hammer Mill': HAMMER_MILL_CONNECTOR_LIST,
  'Meal Sifter': MEAL_SIFTER_CONNECTOR_LIST,
  'Meal Conveying & Storage': MEAL_CONVEYING_STORAGE_CONNECTOR_LIST,
  'Auto Bagger & Stitcher': AUTO_BAGGER_CONNECTOR_LIST,
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
export type ParameterKind =
  | 'Vibration' | 'Temperature' | 'Speed' | 'Pressure' | 'Electrical' | 'Level' | 'Flow'
  // Both arrived with the oilseed machines and both have a unit nothing else
  // in the set uses, so neither can be confused with anything above.
  | 'Gas' | 'Position' | 'Weight';

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
  // Gas concentration, for the seed dryer's CO detector. Tested after the
  // electrical list so a bare 'ppm' cannot be read as anything else.
  if (['ppm', 'ppmv', 'vol%', '%lel'].includes(value)) return 'Gas';
  // Linear travel, for the extractor's chain take-up. Not a level: a take-up
  // that has run out of adjustment is measured in millimetres of remaining
  // travel, not in per cent of anything.
  if (['mm', 'cm', 'm', 'in', 'inch', 'thou', 'mil'].includes(value)) return 'Position';
  // Mass on a load cell. Distinct from Flow: a bagger weighs a static charge,
  // it does not measure a rate.
  if (['kg', 'g', 't', 'tonne', 'lb', 'lbs'].includes(value)) return 'Weight';
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
    case 'Gas':
      return 'Gas';
    case 'Position':
      return 'Position';
    case 'Weight':
      return 'Weight';
    // 'Moisture' and 'Leak' fall through deliberately.
    //
    // A moisture probe reports per cent and so does a hopper level, so the
    // unit — which this module's own comment calls the only trustworthy
    // declaration of what a channel carries — cannot tell them apart. A seal
    // leak or a steam trap monitor reports no engineering unit at all.
    //
    // Returning null makes the fit 'unknown', which is permissive by design
    // and is the honest answer: the canvas does not know. Claiming 'match'
    // would let a hopper float bind to a moisture pad with a tick beside it,
    // and claiming 'mismatch' would refuse the correct channel.
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
    case 'Gas':
      return 'a gas-concentration channel (ppm)';
    case 'Position':
      return 'a position channel (mm)';
    case 'Weight':
      return 'a weight channel (kg)';
    default:
      return 'a matching channel';
  }
}
