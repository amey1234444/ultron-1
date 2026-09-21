/**
 * The DOC-02 §15 sensor and data-point master.
 *
 * Sixty signals, D001 through D060, from the document's five tables: drive and
 * mechanical, feeding and material, barrel and thermal, melt and downstream,
 * utility and production. Twenty-five are MANDATORY, fourteen RECOMMENDED,
 * twenty SUPPORTING and one OPTIONAL.
 *
 * This is the *recommended data model* for the reference machine, not a claim
 * about any installed one. DOC-02 says so directly: "Exact availability,
 * calibrated ranges and tags are site-specific." So no entry here asserts that
 * a signal exists on a real machine — `coverageAgainst` answers that by
 * comparing the master against what a machine actually has mapped, and the gap
 * it returns is the deployment's signal-gap list.
 *
 * Four fields are derived rather than transcribed, each in one visible place so
 * the rule can be corrected once instead of in sixty rows: the §17 source rank,
 * the §21 acquisition class, the §16 data class, and the §20 canonical
 * location. The document's original wording is kept alongside the reduction —
 * `preferredSourceText` next to `preferredSource` — so nothing is lost.
 */

import type {
  AcquisitionClass,
  DataClass,
  SignalDefinition,
  SignalGroup,
  SignalPriority,
  SourceKind,
} from './types';

/**
 * Resolve the document's free-text source onto the §17 ladder.
 *
 * Order matters and the most specific wins: "VFD/PLC" names a drive first and
 * ranks as a drive source, while a bare "PLC" is the plant controller. An
 * unrecognised source falls to ULTRON_SENSOR rather than to the plant
 * controller, because assuming the plant already measures something is exactly
 * the assumption §18 warns against.
 */
export function resolveSourceKind(text: string): SourceKind {
  const t = text.toLowerCase();
  if (/mes|qms|lab|erp/.test(t)) return 'MES_QMS_LAB';
  if (/operator|manual entry/.test(t)) return 'OPERATOR_ENTRY';
  if (/vfd|drive|feeder|weigh|power meter|encoder/.test(t)) return 'DRIVE_OR_DEDICATED_CONTROLLER';
  if (/plc|dcs|oem controller|controller|scada/.test(t)) return 'PLANT_CONTROLLER';
  return 'ULTRON_SENSOR';
}

/**
 * Pick the §21 acquisition class from what the signal is.
 *
 * Derived rather than stored per row, because DOC-02 does not assign a class
 * per signal — it defines the classes and leaves the mapping to engineering.
 * Deriving it keeps the rule adjustable in one place instead of frozen into
 * sixty rows, and the NO FAKE UNIVERSAL RATES rule means the class never
 * becomes a rate here anyway.
 */
export function acquisitionClassFor(unit: string, primaryUse: string, parameter: string): AcquisitionClass {
  const text = `${parameter} ${primaryUse}`.toLowerCase();
  if (/waveform|spectrum/.test(text)) return 'WAVEFORM';
  if (unit.toLowerCase() === 'boolean') return 'STATE_EVENT';
  if (/state|mode|status|trip|interlock|event|recipe|batch|alarm/.test(text)) return 'STATE_EVENT';
  if (/pulse|protection/.test(text)) return 'FAST_EVENT';
  if (/temperature|temp/.test(text)) return 'SLOW_PROCESS';
  return 'NORMAL_PROCESS';
}

/** §16 classification. A setpoint or rating is configured; a difference is calculated. */
export function dataClassFor(parameter: string, primaryUse: string): DataClass {
  const text = `${parameter} ${primaryUse}`.toLowerCase();
  if (/setpoint|rated|recipe|target|configured/.test(text)) return 'CONFIGURED';
  if (/specific energy|differential|derived|calculated/.test(text)) return 'CALCULATED';
  return 'MEASURED';
}

/**
 * The §20 canonical location a signal belongs to.
 *
 * Maps the document's free-text location onto the structured paths of §20, so
 * that a diagnosis can ask which side of the screen a pressure came from
 * without parsing prose. This is what §20's rule asks for: "store location as
 * structured metadata, not only in the tag name."
 */
export function canonicalLocationFor(location: string, parameter: string): string {
  const text = `${location} ${parameter}`.toLowerCase();
  if (/gearbox|gear box/.test(text)) return 'DRIVE.GEARBOX';
  if (/vfd/.test(text)) return 'DRIVE.VFD';
  if (/nde|non-drive/.test(text)) return 'DRIVE.MOTOR.NDE';
  if (/drive end/.test(text)) return 'DRIVE.MOTOR.DE';
  if (/side feed|side stuffer/.test(text)) return 'FEEDER.SIDE';
  if (/feeder|hopper|feed throat|feed rate|refill/.test(text)) return 'FEEDER.MAIN';
  const zone = /z(?:one)?\s*0*([1-9])/.exec(text);
  if (zone) return `BARREL.Z${zone[1]}`;
  if (/barrel|zone|heater|cooling zone/.test(text)) return 'BARREL';
  if (/pre-?screen|upstream/.test(text)) return 'PROCESS.PRE_SCREEN';
  if (/post-?screen|downstream/.test(text)) return 'PROCESS.POST_SCREEN';
  if (/vacuum|vent/.test(text)) return 'PROCESS.VACUUM';
  if (/melt/.test(text)) return 'PROCESS.MELT';
  if (/die|adapter/.test(text)) return 'DOWNSTREAM.DIE';
  if (/cooling|utility|water|chiller/.test(text)) return 'UTILITY.COOLING';
  if (/mes|lab|quality|production|batch|shift|operator/.test(text)) return 'CONTEXT';
  if (/motor|main drive|screw|torque|power|current|speed/.test(text)) return 'DRIVE.MOTOR';
  return 'MACHINE';
}

/** Turn a parameter name into the tag's PARAMETER segment. */
function parameterSegment(parameter: string): string {
  return parameter
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
}

/**
 * Compose the §29 canonical tag.
 *
 *     <MACHINE>.<SYSTEM>.<LOCATION>.<PARAMETER>[.<ATTRIBUTE>]
 *
 * The machine prefix is an argument because one master describes every machine
 * built to this template; TSE01 in the document's examples is an instance, not
 * the namespace. Composing the tag from the canonical location means a tag can
 * never disagree with the location stored beside it.
 */
export function composeCanonicalTag(machineId: string, canonicalLocation: string, parameter: string): string {
  return `${machineId}.${canonicalLocation}.${parameterSegment(parameter)}`;
}

/** The machine id used for the reference master's own tags. */
export const REFERENCE_MACHINE_ID = 'TSE01';

function signal(
  signalId: string,
  parameter: string,
  location: string,
  preferredSourceText: string,
  priority: SignalPriority,
  unit: string,
  primaryUse: string,
  group: SignalGroup,
): SignalDefinition {
  const canonicalLocation = canonicalLocationFor(location, parameter);
  return {
    signalId,
    parameter,
    location,
    preferredSourceText,
    preferredSource: resolveSourceKind(preferredSourceText),
    priority,
    unit,
    primaryUse,
    group,
    canonicalLocation,
    canonicalTag: composeCanonicalTag(REFERENCE_MACHINE_ID, canonicalLocation, parameter),
    acquisitionClass: acquisitionClassFor(unit, primaryUse, parameter),
    dataClass: dataClassFor(parameter, primaryUse),
  };
}

/** DOC-02 §15, all sixty signals in document order. */
export const DOC02_SIGNAL_MASTER: readonly SignalDefinition[] = [
  signal(
    'D001',
    'Motor Run / Drive Enable',
    'Main drive',
    'PLC/VFD',
    'MANDATORY',
    'Boolean',
    'State, event context',
    'DRIVE_MECHANICAL',
  ),
  signal(
    'D002',
    'Motor Current',
    'Motor/VFD',
    'VFD/PLC; current transmitter fallback',
    'MANDATORY',
    'A',
    'Load, electrical/process evidence',
    'DRIVE_MECHANICAL',
  ),
  signal(
    'D003',
    'Active Power',
    'Motor/VFD',
    'VFD/power meter',
    'RECOMMENDED',
    'kW',
    'Energy, specific energy',
    'DRIVE_MECHANICAL',
  ),
  signal(
    'D004',
    'Motor Speed',
    'Motor/VFD',
    'VFD/encoder',
    'RECOMMENDED',
    'rpm',
    'Drive context / speed mismatch',
    'DRIVE_MECHANICAL',
  ),
  signal(
    'D005',
    'Screw RPM',
    'Screw/gearbox output',
    'PLC/VFD or encoder/proximity',
    'MANDATORY',
    'rpm',
    'State, context, baseline, faults',
    'DRIVE_MECHANICAL',
  ),
  signal(
    'D006',
    'Screw RPM Setpoint',
    'Drive control',
    'PLC/VFD',
    'RECOMMENDED',
    'rpm',
    'Command-vs-actual, context change',
    'DRIVE_MECHANICAL',
  ),
  signal(
    'D007',
    'Screw Torque',
    'Drive/gearbox estimate or transducer',
    'VFD/PLC',
    'MANDATORY',
    '% or N·m',
    'Process load, restriction evidence',
    'DRIVE_MECHANICAL',
  ),
  signal(
    'D008',
    'Motor DE Bearing Temperature',
    'Motor DE',
    'RTD/PLC/ULTRON',
    'SUPPORTING',
    '°C',
    'Basic mechanical health',
    'DRIVE_MECHANICAL',
  ),
  signal(
    'D009',
    'Motor NDE Bearing Temperature',
    'Motor NDE',
    'RTD/PLC/ULTRON',
    'SUPPORTING',
    '°C',
    'Basic mechanical health',
    'DRIVE_MECHANICAL',
  ),
  signal(
    'D010',
    'Motor Overall Vibration',
    'Motor bearing housing',
    'ULTRON / vibration transmitter',
    'SUPPORTING',
    'mm/s RMS',
    'Basic vibration only',
    'DRIVE_MECHANICAL',
  ),
  signal(
    'D011',
    'Gearbox Oil Temperature',
    'Gearbox sump/return',
    'RTD/PLC/ULTRON',
    'RECOMMENDED',
    '°C',
    'Thermal/mechanical context',
    'DRIVE_MECHANICAL',
  ),
  signal(
    'D012',
    'Gearbox Bearing Temperature',
    'Gearbox critical bearing',
    'RTD/PLC/ULTRON',
    'SUPPORTING',
    '°C',
    'Basic mechanical health',
    'DRIVE_MECHANICAL',
  ),
  signal(
    'D013',
    'Gearbox Overall Vibration',
    'Gearbox housing',
    'ULTRON / transmitter',
    'SUPPORTING',
    'mm/s RMS',
    'Basic vibration only',
    'DRIVE_MECHANICAL',
  ),
  signal(
    'D014',
    'Main Feeder Actual Rate',
    'Main feeder',
    'Feeder controller/PLC',
    'MANDATORY',
    'kg/h',
    'State, load context, baseline',
    'FEEDING_MATERIAL',
  ),
  signal(
    'D015',
    'Main Feeder Setpoint',
    'Main feeder',
    'PLC/feeder',
    'RECOMMENDED',
    'kg/h',
    'Intentional change vs fault',
    'FEEDING_MATERIAL',
  ),
  signal(
    'D016',
    'Main Feeder Drive Load',
    'Main feeder',
    'Feeder/VFD',
    'SUPPORTING',
    '% or A',
    'Feeder blockage/bridging evidence',
    'FEEDING_MATERIAL',
  ),
  signal(
    'D017',
    'Feeder Refill Status',
    'Gravimetric feeder',
    'Feeder controller',
    'SUPPORTING',
    'Enum/Boolean',
    'Explain temporary feed disturbance',
    'FEEDING_MATERIAL',
  ),
  signal(
    'D018',
    'Side Feeder Actual Rate',
    'Side feeder if installed',
    'Feeder/PLC',
    'RECOMMENDED',
    'kg/h',
    'Context, mixing/load',
    'FEEDING_MATERIAL',
  ),
  signal(
    'D019',
    'Side Feeder Setpoint',
    'Side feeder',
    'PLC/feeder',
    'SUPPORTING',
    'kg/h',
    'Context change',
    'FEEDING_MATERIAL',
  ),
  signal(
    'D020',
    'Side Feeder Load/Status',
    'Side feeder',
    'Feeder/VFD',
    'SUPPORTING',
    '%/Enum',
    'Side-feed health',
    'FEEDING_MATERIAL',
  ),
  signal(
    'D021',
    'Feed-Throat Temperature',
    'Feed throat',
    'PLC/RTD if available',
    'SUPPORTING',
    '°C',
    'Premature softening/intake issues',
    'FEEDING_MATERIAL',
  ),
  signal(
    'D022',
    'Material / Recipe ID',
    'Context',
    'PLC/MES/operator',
    'MANDATORY',
    'ID/Text',
    'Primary context key',
    'FEEDING_MATERIAL',
  ),
  signal(
    'D023',
    'Batch / Product ID',
    'Context',
    'MES/PLC/operator',
    'RECOMMENDED',
    'ID/Text',
    'Traceability / quality correlation',
    'FEEDING_MATERIAL',
  ),
  signal(
    'D024',
    'Zone 1 Actual Temperature',
    'Barrel Z1',
    'PLC RTD/TC or ULTRON',
    'MANDATORY',
    '°C',
    'State, baseline, thermal diagnosis',
    'BARREL_THERMAL',
  ),
  signal(
    'D025',
    'Zone 2 Actual Temperature',
    'Barrel Z2',
    'PLC RTD/TC or ULTRON',
    'MANDATORY',
    '°C',
    'State, baseline, thermal diagnosis',
    'BARREL_THERMAL',
  ),
  signal(
    'D026',
    'Zone 3 Actual Temperature',
    'Barrel Z3',
    'PLC RTD/TC or ULTRON',
    'MANDATORY',
    '°C',
    'State, baseline, thermal diagnosis',
    'BARREL_THERMAL',
  ),
  signal(
    'D027',
    'Zone 4 Actual Temperature',
    'Barrel Z4',
    'PLC RTD/TC or ULTRON',
    'MANDATORY',
    '°C',
    'State, baseline, thermal diagnosis',
    'BARREL_THERMAL',
  ),
  signal(
    'D028',
    'Zone 5 Actual Temperature',
    'Barrel Z5',
    'PLC RTD/TC or ULTRON',
    'MANDATORY',
    '°C',
    'State, baseline, thermal diagnosis',
    'BARREL_THERMAL',
  ),
  signal(
    'D029',
    'Zone 6 Actual Temperature',
    'Barrel Z6',
    'PLC RTD/TC or ULTRON',
    'MANDATORY',
    '°C',
    'State, baseline, thermal diagnosis',
    'BARREL_THERMAL',
  ),
  signal(
    'D030',
    'Zone 7 Actual Temperature',
    'Barrel Z7',
    'PLC RTD/TC or ULTRON',
    'MANDATORY',
    '°C',
    'State, baseline, thermal diagnosis',
    'BARREL_THERMAL',
  ),
  signal(
    'D031',
    'Zone 1 Temperature Setpoint',
    'Barrel Z1',
    'PLC/recipe',
    'MANDATORY',
    '°C',
    'Context, setpoint error',
    'BARREL_THERMAL',
  ),
  signal(
    'D032',
    'Zone 2 Temperature Setpoint',
    'Barrel Z2',
    'PLC/recipe',
    'MANDATORY',
    '°C',
    'Context, setpoint error',
    'BARREL_THERMAL',
  ),
  signal(
    'D033',
    'Zone 3 Temperature Setpoint',
    'Barrel Z3',
    'PLC/recipe',
    'MANDATORY',
    '°C',
    'Context, setpoint error',
    'BARREL_THERMAL',
  ),
  signal(
    'D034',
    'Zone 4 Temperature Setpoint',
    'Barrel Z4',
    'PLC/recipe',
    'MANDATORY',
    '°C',
    'Context, setpoint error',
    'BARREL_THERMAL',
  ),
  signal(
    'D035',
    'Zone 5 Temperature Setpoint',
    'Barrel Z5',
    'PLC/recipe',
    'MANDATORY',
    '°C',
    'Context, setpoint error',
    'BARREL_THERMAL',
  ),
  signal(
    'D036',
    'Zone 6 Temperature Setpoint',
    'Barrel Z6',
    'PLC/recipe',
    'MANDATORY',
    '°C',
    'Context, setpoint error',
    'BARREL_THERMAL',
  ),
  signal(
    'D037',
    'Zone 7 Temperature Setpoint',
    'Barrel Z7',
    'PLC/recipe',
    'MANDATORY',
    '°C',
    'Context, setpoint error',
    'BARREL_THERMAL',
  ),
  signal(
    'D038',
    'Zone Heater Output(s)',
    'Z1–Z7 heating',
    'PLC',
    'RECOMMENDED',
    '%',
    'Control response / thermal diagnosis',
    'BARREL_THERMAL',
  ),
  signal(
    'D039',
    'Zone Cooling Output(s)',
    'Z1–Z7 cooling',
    'PLC',
    'RECOMMENDED',
    '%',
    'Control response / cooling diagnosis',
    'BARREL_THERMAL',
  ),
  signal(
    'D040',
    'Heater Current / Health',
    'Zone heaters if available',
    'PLC/current monitor',
    'SUPPORTING',
    'A / status',
    'Heater command-vs-response',
    'BARREL_THERMAL',
  ),
  signal(
    'D041',
    'Melt Pressure Upstream',
    'Defined upstream pressure tap',
    'PLC transmitter / ULTRON analog',
    'MANDATORY',
    'bar',
    'Primary process load/restriction',
    'MELT_DOWNSTREAM',
  ),
  signal(
    'D042',
    'Melt Pressure Downstream',
    'After screen / before die if installed',
    'PLC transmitter / ULTRON analog',
    'RECOMMENDED',
    'bar',
    'ΔP/localization',
    'MELT_DOWNSTREAM',
  ),
  signal(
    'D043',
    'Die Pressure',
    'Die/head',
    'PLC transmitter / ULTRON analog',
    'RECOMMENDED',
    'bar',
    'Downstream load',
    'MELT_DOWNSTREAM',
  ),
  signal(
    'D044',
    'Melt Temperature',
    'Downstream melt',
    'Melt probe/PLC',
    'RECOMMENDED',
    '°C',
    'Viscosity/process context',
    'MELT_DOWNSTREAM',
  ),
  signal(
    'D045',
    'Vacuum Pressure',
    'Vacuum vent',
    'Vacuum controller/transmitter',
    'RECOMMENDED',
    'mbar abs or kPa abs',
    'Venting performance',
    'MELT_DOWNSTREAM',
  ),
  signal(
    'D046',
    'Vacuum Pump Status',
    'Vacuum system',
    'PLC',
    'SUPPORTING',
    'Boolean/Enum',
    'Equipment vs process distinction',
    'MELT_DOWNSTREAM',
  ),
  signal(
    'D047',
    'Vent Temperature',
    'Vent/nearby process if instrumented',
    'PLC/RTD',
    'SUPPORTING',
    '°C',
    'Venting context',
    'MELT_DOWNSTREAM',
  ),
  signal(
    'D048',
    'Screen Changer Position / Status',
    'Screen system if installed',
    'PLC',
    'SUPPORTING',
    'Enum',
    'Explain pressure step changes',
    'MELT_DOWNSTREAM',
  ),
  signal(
    'D049',
    'Downstream Equipment Status',
    'Pelletizer / pump / die system',
    'PLC',
    'SUPPORTING',
    'Enum',
    'Context/causal chain',
    'MELT_DOWNSTREAM',
  ),
  signal(
    'D050',
    'Cooling Water Supply Temp',
    'Cooling header',
    'PLC/RTD/ULTRON',
    'SUPPORTING',
    '°C',
    'Cooling context',
    'UTILITY_PRODUCTION',
  ),
  signal(
    'D051',
    'Cooling Water Return Temp',
    'Cooling return',
    'PLC/RTD/ULTRON',
    'SUPPORTING',
    '°C',
    'Cooling ΔT',
    'UTILITY_PRODUCTION',
  ),
  signal(
    'D052',
    'Cooling Water Flow',
    'Cooling circuit',
    'Flowmeter/PLC',
    'SUPPORTING',
    'L/min or m³/h',
    'Cooling performance',
    'UTILITY_PRODUCTION',
  ),
  signal(
    'D053',
    'Throughput / Production Rate',
    'Line output',
    'PLC/MES/scale/calculated',
    'MANDATORY',
    'kg/h',
    'Performance, energy normalization',
    'UTILITY_PRODUCTION',
  ),
  signal(
    'D054',
    'Machine Mode',
    'Control system',
    'PLC',
    'MANDATORY',
    'Enum',
    'AUTO/MANUAL/MAINTENANCE',
    'UTILITY_PRODUCTION',
  ),
  signal(
    'D055',
    'Trip / Interlock Status',
    'Control/protection',
    'PLC',
    'MANDATORY',
    'Boolean/Code',
    'Protection/event context',
    'UTILITY_PRODUCTION',
  ),
  signal(
    'D056',
    'Alarm Code(s)',
    'Control system',
    'PLC/VFD/OEM controller',
    'RECOMMENDED',
    'Code/Text',
    'Correlate existing diagnostics',
    'UTILITY_PRODUCTION',
  ),
  signal(
    'D057',
    'Ambient Temperature',
    'Machine area',
    'Plant/ULTRON',
    'SUPPORTING',
    '°C',
    'Thermal normalization',
    'UTILITY_PRODUCTION',
  ),
  signal(
    'D058',
    'Product Quality Result',
    'Lab/QMS/MES',
    'QMS/MES/operator',
    'SUPPORTING',
    'varies',
    'Quality correlation / labels',
    'UTILITY_PRODUCTION',
  ),
  signal(
    'D059',
    'Operator / Shift ID',
    'Operations metadata',
    'MES/operator',
    'OPTIONAL',
    'ID',
    'Traceability only; not a physics feature by default',
    'UTILITY_PRODUCTION',
  ),
  signal(
    'D060',
    'Machine Configuration Version',
    'Engineering configuration',
    'ULTRON config DB',
    'MANDATORY',
    'ID',
    'Baseline/rule/version isolation',
    'UTILITY_PRODUCTION',
  ),
];

const BY_ID = new Map(DOC02_SIGNAL_MASTER.map((entry) => [entry.signalId, entry]));

export function signalById(signalId: string): SignalDefinition | undefined {
  return BY_ID.get(signalId);
}

export function signalsByPriority(priority: SignalPriority): SignalDefinition[] {
  return DOC02_SIGNAL_MASTER.filter((entry) => entry.priority === priority);
}

export function signalsByGroup(group: SignalGroup): SignalDefinition[] {
  return DOC02_SIGNAL_MASTER.filter((entry) => entry.group === group);
}

export function signalsAtLocation(canonicalLocation: string): SignalDefinition[] {
  return DOC02_SIGNAL_MASTER.filter((entry) => entry.canonicalLocation === canonicalLocation);
}

/** Every canonical location the master references, in first-seen order. */
export function canonicalLocations(): string[] {
  const seen: string[] = [];
  for (const entry of DOC02_SIGNAL_MASTER) {
    if (!seen.includes(entry.canonicalLocation)) seen.push(entry.canonicalLocation);
  }
  return seen;
}

export type SignalCoverage = {
  /** Master signals the machine has a mapped measurement for. */
  covered: SignalDefinition[];
  /** Master signals with nothing behind them. */
  missing: SignalDefinition[];
  /** Mandatory signals missing — the ones that degrade state and context. */
  missingMandatory: SignalDefinition[];
  /** Fraction of MANDATORY signals covered, 0..1. */
  mandatoryCoverage: number;
};

/**
 * Compare the master against what a machine actually measures.
 *
 * `has` is asked per signal rather than per tag so a caller can answer it
 * however its own mapping works. The result is §37's "All mandatory signals
 * mapped or gap recorded" — and recording the gap is an acceptable outcome
 * there, which is why this returns a list rather than throwing.
 */
export function coverageAgainst(has: (entry: SignalDefinition) => boolean): SignalCoverage {
  const covered: SignalDefinition[] = [];
  const missing: SignalDefinition[] = [];
  for (const entry of DOC02_SIGNAL_MASTER) (has(entry) ? covered : missing).push(entry);
  const mandatory = DOC02_SIGNAL_MASTER.filter((entry) => entry.priority === 'MANDATORY');
  const missingMandatory = missing.filter((entry) => entry.priority === 'MANDATORY');
  return {
    covered,
    missing,
    missingMandatory,
    mandatoryCoverage:
      mandatory.length === 0 ? 1 : (mandatory.length - missingMandatory.length) / mandatory.length,
  };
}
