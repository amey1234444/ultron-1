/**
 * The canonical process parameter dictionary (DOC-01 §12).
 *
 * The signal map in `lib/analysis/twinScrew/signalMap.ts` already answers "what
 * unit is this tag in, and what may it be converted from". This dictionary
 * answers the questions that layer deliberately does not: what the quantity
 * *means*, what moves it, why BLACKGATE keeps it, and how far that knowledge
 * travels.
 *
 * The two are linked by `tags`, and `parametersWithoutTags` reports the
 * parameters DOC-01 names that this machine does not measure. That list is
 * worth reading: torque, throughput, zone setpoint, heater and cooling output,
 * and the recipe identifier are all absent, and each absence is why some rule
 * downstream cannot run. Specific energy is absent for a compound reason — it
 * needs power *and* throughput, and throughput is not measured.
 */

import type { ParameterDefinition } from './types';

const COMMON = 'COMMON' as const;
const TSE = 'TSE_SPECIFIC' as const;

export const TSE_PARAMETERS: readonly ParameterDefinition[] = [
  {
    parameterId: 'PAR-SCREW-RPM',
    canonicalName: 'Screw RPM',
    unitClass: 'rotational_speed',
    units: ['rpm'],
    meaning: 'Rotational speed of the screw shafts.',
    mainInfluences: ['VFD and control', 'Gearbox ratio'],
    whyUltronUsesIt: 'Governs shear, residence time, fill, mixing and the throughput relationship.',
    knowledgeClass: TSE,
    tags: ['TS-S1', 'TS-S2'],
  },
  {
    parameterId: 'PAR-MOTOR-CURRENT',
    canonicalName: 'Motor current',
    unitClass: 'electrical_current',
    units: ['A'],
    meaning: 'Electrical current drawn by the main motor.',
    mainInfluences: ['Mechanical load', 'Speed', 'Motor and VFD efficiency'],
    whyUltronUsesIt: 'Electrical load evidence, and supporting evidence for process load.',
    knowledgeClass: COMMON,
    tags: ['TS-PM1'],
  },
  {
    parameterId: 'PAR-ACTIVE-POWER',
    canonicalName: 'Active power',
    unitClass: 'electrical_power',
    units: ['kW'],
    meaning: 'Electrical active power consumed by the drive.',
    mainInfluences: ['Torque', 'Screw RPM', 'Drive efficiency'],
    whyUltronUsesIt: 'Input to specific energy and energy intensity.',
    knowledgeClass: COMMON,
    tags: ['TS-PM1'],
  },
  {
    parameterId: 'PAR-TORQUE',
    canonicalName: 'Torque',
    unitClass: 'torque',
    units: ['%', 'N·m'],
    meaning: 'Rotational load at the drive or on a screw basis.',
    mainInfluences: ['Feed rate', 'Viscosity', 'Restriction', 'Screw elements', 'Mechanical drag'],
    whyUltronUsesIt: 'The primary evidence for both process load and mechanical load.',
    knowledgeClass: TSE,
    tags: [],
  },
  {
    parameterId: 'PAR-MAIN-FEED-RATE',
    canonicalName: 'Main feed rate',
    unitClass: 'mass_flow',
    units: ['kg/h'],
    meaning: 'Primary material mass flow.',
    mainInfluences: ['Feeder command and control', 'Material flowability'],
    whyUltronUsesIt: 'Drives fill, torque, pressure, throughput and residence time.',
    knowledgeClass: TSE,
    tags: ['TS-F1'],
  },
  {
    parameterId: 'PAR-SIDE-FEED-RATE',
    canonicalName: 'Side-feed rate',
    unitClass: 'mass_flow',
    units: ['kg/h'],
    meaning: 'Downstream secondary material flow.',
    mainInfluences: ['Side feeder and control'],
    whyUltronUsesIt: 'Governs local fill, composition, and downstream torque and pressure.',
    knowledgeClass: TSE,
    tags: ['TS-F2'],
  },
  {
    parameterId: 'PAR-ZONE-ACTUAL-TEMP',
    canonicalName: 'Zone actual temperature',
    unitClass: 'temperature',
    units: ['degC'],
    meaning: 'Measured barrel-zone temperature.',
    mainInfluences: ['Setpoint', 'Heater and cooling', 'Process heat'],
    whyUltronUsesIt: 'Thermal state and control behaviour.',
    knowledgeClass: TSE,
    tags: ['TS-TZ1', 'TS-TZ2', 'TS-TZ3', 'TS-TZ4', 'TS-TZ5', 'TS-TZ6', 'TS-TZ7', 'TS-TZ8', 'TS-TZ9'],
  },
  {
    parameterId: 'PAR-ZONE-SETPOINT',
    canonicalName: 'Zone setpoint',
    unitClass: 'temperature',
    units: ['degC'],
    meaning: 'Commanded temperature target.',
    mainInfluences: ['Recipe and process control'],
    whyUltronUsesIt: 'Defines the expected barrel thermal condition, and so the residual a deviation rule reads.',
    knowledgeClass: TSE,
    tags: [],
  },
  {
    parameterId: 'PAR-HEATER-OUTPUT',
    canonicalName: 'Heater output',
    unitClass: 'control_output',
    units: ['%', 'status'],
    meaning: 'Heating command or feedback.',
    mainInfluences: ['Temperature-control loop'],
    whyUltronUsesIt: 'Evidence of control effort, which separates a heater fault from a process heat change.',
    knowledgeClass: COMMON,
    tags: [],
  },
  {
    parameterId: 'PAR-COOLING-OUTPUT',
    canonicalName: 'Cooling output',
    unitClass: 'control_output',
    units: ['%', 'status'],
    meaning: 'Cooling command or feedback.',
    mainInfluences: ['Temperature-control loop'],
    whyUltronUsesIt: 'Evidence of heat-removal effort.',
    knowledgeClass: COMMON,
    tags: [],
  },
  {
    parameterId: 'PAR-MELT-TEMP',
    canonicalName: 'Melt temperature',
    unitClass: 'temperature',
    units: ['degC'],
    meaning: 'Temperature of the actual molten material at a defined location.',
    mainInfluences: ['Barrel profile', 'Shear and energy input', 'Material', 'Residence time'],
    whyUltronUsesIt: 'Governs viscosity and quality, and is required to interpret pressure and load.',
    knowledgeClass: TSE,
    tags: ['TS-TM'],
  },
  {
    parameterId: 'PAR-MELT-PRESSURE',
    canonicalName: 'Melt pressure',
    unitClass: 'pressure',
    units: ['bar', 'MPa'],
    meaning: 'Local melt pressure at a defined tap.',
    mainInfluences: ['Viscosity', 'Throughput', 'Screw elements', 'Downstream resistance'],
    whyUltronUsesIt: 'Evidence of restriction, flow and load — but only when the tap location is known.',
    knowledgeClass: TSE,
    tags: ['TS-P1', 'TS-P2', 'TS-P3', 'TS-P4'],
  },
  {
    parameterId: 'PAR-PRESSURE-DIFFERENTIAL',
    canonicalName: 'Pressure differential',
    unitClass: 'pressure_difference',
    units: ['bar', 'MPa'],
    meaning: 'Pressure difference across a known component or section.',
    mainInfluences: ['Restriction', 'Flow'],
    whyUltronUsesIt: 'Localises a screen or filter restriction rather than merely detecting it.',
    knowledgeClass: TSE,
    tags: ['TS-P3', 'TS-P4'],
  },
  {
    parameterId: 'PAR-VACUUM-PRESSURE',
    canonicalName: 'Vacuum pressure',
    unitClass: 'absolute_pressure',
    units: ['mbar abs', 'kPa abs'],
    meaning: 'Pressure level in the vacuum or vent system.',
    mainInfluences: ['Pump', 'Leaks', 'Vent load', 'Melt seal'],
    whyUltronUsesIt: 'The devolatilisation condition.',
    knowledgeClass: TSE,
    tags: ['TS-PV'],
  },
  {
    parameterId: 'PAR-THROUGHPUT',
    canonicalName: 'Throughput',
    unitClass: 'mass_flow',
    units: ['kg/h'],
    meaning: 'Actual production output.',
    mainInfluences: ['Feed rate', 'Process stability', 'Downstream acceptance'],
    whyUltronUsesIt: 'Performance measurement, and the normaliser that turns power into specific energy.',
    knowledgeClass: TSE,
    tags: [],
  },
  {
    parameterId: 'PAR-RECIPE',
    canonicalName: 'Recipe / material grade',
    unitClass: 'identifier',
    units: ['ID', 'categorical'],
    meaning: 'Defines the material formulation and process context.',
    mainInfluences: ['Production plan'],
    whyUltronUsesIt: 'The strongest single context for viscosity, load and baseline selection.',
    knowledgeClass: TSE,
    tags: [],
  },
  {
    parameterId: 'PAR-PRODUCT-BATCH',
    canonicalName: 'Product / batch',
    unitClass: 'identifier',
    units: ['ID'],
    meaning: 'Traceability context.',
    mainInfluences: ['MES and production'],
    whyUltronUsesIt: 'Correlates quality, maintenance and events.',
    knowledgeClass: COMMON,
    tags: [],
  },
  {
    parameterId: 'PAR-GEARBOX-OIL-TEMP',
    canonicalName: 'Gearbox oil temperature',
    unitClass: 'temperature',
    units: ['degC'],
    meaning: 'Thermal condition of the lubrication system.',
    mainInfluences: ['Load', 'Cooling', 'Ambient', 'Mechanical condition'],
    whyUltronUsesIt: 'Basic rotating-equipment monitoring.',
    knowledgeClass: COMMON,
    tags: ['TS-T2'],
  },
  {
    parameterId: 'PAR-OVERALL-VIBRATION',
    canonicalName: 'Overall vibration',
    unitClass: 'vibration_velocity',
    units: ['mm/s RMS'],
    meaning: 'Basic vibration level at the motor or gearbox.',
    mainInfluences: ['Mechanical condition', 'Mounting', 'Process forces'],
    whyUltronUsesIt: 'General mechanical indicator; spectral analysis belongs to Advanced CM.',
    knowledgeClass: COMMON,
    tags: ['TS-V1', 'TS-V2', 'TS-V3', 'TS-V4', 'TS-V5'],
  },
] as const;

const BY_ID = new Map(TSE_PARAMETERS.map((parameter) => [parameter.parameterId, parameter]));

export function parameterById(parameterId: string): ParameterDefinition | undefined {
  return BY_ID.get(parameterId);
}

export function parameterForTag(tag: string): ParameterDefinition | undefined {
  return TSE_PARAMETERS.find((parameter) => parameter.tags.includes(tag));
}

/**
 * Parameters DOC-01 names that this machine has no signal for.
 *
 * Each one closes off a class of analysis. Torque and throughput between them
 * are why specific energy cannot be computed; zone setpoint is why a deviation
 * rule cannot run; heater output is why a heater failure cannot be separated
 * from a process heat change; recipe is why contextual baselines cannot be
 * selected.
 */
export function parametersWithoutTags(): ParameterDefinition[] {
  return TSE_PARAMETERS.filter((parameter) => parameter.tags.length === 0);
}
