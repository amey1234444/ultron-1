/**
 * The material path, step by step (DOC-01 §6), plus the power and thermal
 * chains of §10 and §11.
 *
 * Topology is what makes a measurement interpretable. DOC-01 §9.13 puts it
 * bluntly: "Pressure = 90 bar is not interpretable without where it is
 * measured." A pressure that rises upstream of a restriction and a pressure
 * that rises downstream of one mean opposite things, and the only way to tell
 * them apart is to know which side of the screen the tap is on.
 *
 * `upstreamOf` and `downstreamOf` are therefore declared on every location and
 * checked for symmetry by `validateTopology`. An asymmetric link — A says it is
 * upstream of B, B does not say it is downstream of A — is a modelling error
 * that would let a localisation walk the graph in one direction and not the
 * other.
 */

import type { ProcessLocation } from './types';

const TSE = 'TSE_SPECIFIC' as const;

/** DOC-01 §6, one entry per step of the material path. */
export const TSE_PROCESS_FLOW: readonly ProcessLocation[] = [
  {
    locationId: 'PL-01-HOPPER-FEEDER',
    order: 1,
    name: 'Hopper / feeder',
    unitOperation: 'Metering',
    whatHappens: 'Meter raw material into the process at a controlled rate.',
    mainInfluences: ['Bulk density', 'Moisture', 'Refill', 'Bridging', 'Feeder calibration'],
    observedLater: ['Feed actual', 'Feed setpoint', 'Feeder load and status'],
    upstreamOf: ['PL-02-FEED-THROAT'],
    downstreamOf: [],
    knowledgeClass: TSE,
  },
  {
    locationId: 'PL-02-FEED-THROAT',
    order: 2,
    name: 'Feed throat / zone 1',
    unitOperation: 'Solids intake',
    whatHappens: 'Accept solids without premature melting or blocking at the inlet.',
    mainInfluences: ['Feed throat temperature', 'Material flowability', 'Screw fill'],
    observedLater: ['Feed stability', 'Throat temperature where available'],
    upstreamOf: ['PL-03-SOLIDS-CONVEYING'],
    downstreamOf: ['PL-01-HOPPER-FEEDER'],
    knowledgeClass: TSE,
  },
  {
    locationId: 'PL-03-SOLIDS-CONVEYING',
    order: 3,
    name: 'Solids conveying',
    unitOperation: 'Transport',
    whatHappens: 'Move material forward and establish initial fill.',
    mainInfluences: ['Screw element pitch', 'Screw RPM', 'Feed rate', 'Bulk density'],
    observedLater: ['Screw RPM', 'Feed rate', 'Torque trend'],
    upstreamOf: ['PL-04-MELTING'],
    downstreamOf: ['PL-02-FEED-THROAT'],
    knowledgeClass: TSE,
  },
  {
    locationId: 'PL-04-MELTING',
    order: 4,
    name: 'Melting transition',
    unitOperation: 'Melting',
    whatHappens: 'Combine barrel heat and mechanical energy to melt the polymer.',
    mainInfluences: ['Temperature profile', 'Screw configuration', 'Shear', 'Residence time'],
    observedLater: ['Zone temperature', 'Torque and power', 'Melt temperature where available'],
    upstreamOf: ['PL-05-MIXING'],
    downstreamOf: ['PL-03-SOLIDS-CONVEYING'],
    knowledgeClass: TSE,
  },
  {
    locationId: 'PL-05-MIXING',
    order: 5,
    name: 'Mixing / kneading',
    unitOperation: 'Mixing',
    whatHappens: 'Distribute ingredients and disperse agglomerates and fillers.',
    mainInfluences: ['Kneading geometry', 'Screw RPM', 'Fill', 'Viscosity', 'Energy input'],
    observedLater: ['Torque', 'Power and specific energy', 'Melt temperature'],
    upstreamOf: ['PL-06-DOWNSTREAM-ADDITION'],
    downstreamOf: ['PL-04-MELTING'],
    knowledgeClass: TSE,
  },
  {
    locationId: 'PL-06-DOWNSTREAM-ADDITION',
    order: 6,
    name: 'Downstream additions',
    unitOperation: 'Secondary dosing',
    whatHappens: 'Introduce fillers, fibres or liquids where the machine is configured for them.',
    mainInfluences: ['Melt seal', 'Side feeder capacity', 'Local pressure and fill'],
    observedLater: ['Side feed rate', 'Local process response'],
    upstreamOf: ['PL-07-VENTING'],
    downstreamOf: ['PL-05-MIXING'],
    knowledgeClass: TSE,
  },
  {
    locationId: 'PL-07-VENTING',
    order: 7,
    name: 'Venting / devolatilisation',
    unitOperation: 'Devolatilisation',
    whatHappens: 'Expose melt surface and remove gas, moisture and volatiles.',
    mainInfluences: ['Vacuum level', 'Fill', 'Melt seal', 'Temperature', 'Vent port condition'],
    observedLater: ['Vacuum pressure', 'Pump status', 'Pressure and temperature context'],
    upstreamOf: ['PL-08-HOMOGENISATION'],
    downstreamOf: ['PL-06-DOWNSTREAM-ADDITION'],
    knowledgeClass: TSE,
  },
  {
    locationId: 'PL-08-HOMOGENISATION',
    order: 8,
    name: 'Homogenisation / final conveying',
    unitOperation: 'Transport',
    whatHappens: 'Stabilise composition and transport toward discharge.',
    mainInfluences: ['Screw elements', 'Viscosity', 'Temperature', 'Throughput'],
    observedLater: ['Torque', 'Temperature', 'Pressure'],
    upstreamOf: ['PL-09-PRESSURE-BUILD'],
    downstreamOf: ['PL-07-VENTING'],
    knowledgeClass: TSE,
  },
  {
    locationId: 'PL-09-PRESSURE-BUILD',
    order: 9,
    name: 'Pressure development',
    unitOperation: 'Pressurisation',
    whatHappens: 'Generate the pressure needed to pass the screen, adapter and die.',
    mainInfluences: ['Downstream resistance', 'Viscosity', 'Throughput', 'Screw fill'],
    observedLater: ['Pre-screen and post-screen pressure', 'Die pressure', 'Torque'],
    upstreamOf: ['PL-10-SCREEN-DIE'],
    downstreamOf: ['PL-08-HOMOGENISATION'],
    knowledgeClass: TSE,
  },
  {
    locationId: 'PL-10-SCREEN-DIE',
    order: 10,
    name: 'Screen / die / product',
    unitOperation: 'Filtration and forming',
    whatHappens: 'Filter, shape or transfer the melt into the downstream process.',
    mainInfluences: ['Screen condition', 'Die geometry', 'Product setup'],
    observedLater: ['Differential pressure where available', 'Die pressure', 'Throughput', 'Quality'],
    upstreamOf: [],
    downstreamOf: ['PL-09-PRESSURE-BUILD'],
    knowledgeClass: TSE,
  },
] as const;

const BY_ID = new Map(TSE_PROCESS_FLOW.map((location) => [location.locationId, location]));

export function processLocationById(locationId: string): ProcessLocation | undefined {
  return BY_ID.get(locationId);
}

/**
 * Whether `a` lies upstream of `b` anywhere along the path.
 *
 * Walks the declared links rather than comparing `order`, so a branch that
 * rejoins the main path is handled correctly and two locations on different
 * branches are reported as neither upstream nor downstream of each other.
 */
export function isUpstreamOf(a: string, b: string): boolean {
  const seen = new Set<string>();
  const queue = [a];
  while (queue.length) {
    const current = queue.shift() as string;
    if (seen.has(current)) continue;
    seen.add(current);
    const location = BY_ID.get(current);
    if (!location) continue;
    if (location.upstreamOf.includes(b)) return true;
    queue.push(...location.upstreamOf);
  }
  return false;
}

/** Every location between two points, exclusive of both ends. */
export function locationsBetween(from: string, to: string): ProcessLocation[] {
  if (!isUpstreamOf(from, to)) return [];
  return TSE_PROCESS_FLOW.filter(
    (location) => location.locationId !== from && location.locationId !== to && isUpstreamOf(from, location.locationId) && isUpstreamOf(location.locationId, to),
  );
}

/** Broken or asymmetric topology links. Empty is the healthy result. */
export function validateTopology(): string[] {
  const problems: string[] = [];
  for (const location of TSE_PROCESS_FLOW) {
    for (const downstreamId of location.upstreamOf) {
      const downstream = BY_ID.get(downstreamId);
      if (!downstream) {
        problems.push(`${location.locationId} is declared upstream of ${downstreamId}, which is not a declared location.`);
        continue;
      }
      if (!downstream.downstreamOf.includes(location.locationId)) {
        problems.push(
          `${location.locationId} declares itself upstream of ${downstreamId}, but ${downstreamId} does not declare ${location.locationId} as upstream. A one-way link lets a localisation walk the path in one direction only.`,
        );
      }
    }
    for (const upstreamId of location.downstreamOf) {
      const upstream = BY_ID.get(upstreamId);
      if (!upstream) {
        problems.push(`${location.locationId} is declared downstream of ${upstreamId}, which is not a declared location.`);
        continue;
      }
      if (!upstream.upstreamOf.includes(location.locationId)) {
        problems.push(
          `${location.locationId} declares itself downstream of ${upstreamId}, but ${upstreamId} does not declare ${location.locationId} as downstream.`,
        );
      }
    }
  }
  return problems;
}

/**
 * The mechanical power chain of DOC-01 §10.
 *
 * Read as a list of links, each stage driving the next. It is what makes
 * "downstream restriction raises motor current" a traceable statement rather
 * than a correlation: the process load reaches the motor through the screws,
 * the gearbox and the coupling, in that order.
 */
export const MECHANICAL_POWER_CHAIN: readonly string[] = [
  'Electrical supply',
  'VFD',
  'Motor',
  'Coupling',
  'Gearbox / twin-shaft drive',
  'Twin screws',
  'Mechanical energy into material',
] as const;

/**
 * The thermal control chain of DOC-01 §11.
 *
 * DOC-01 attaches a diagnostic consequence to this chain that matters more than
 * the chain itself: a high melt temperature does not imply a heater fault. Heat
 * also arrives from mechanical shear, and leaves through cooling, heat loss and
 * the product. Melt temperature is never a copy of the barrel setpoint.
 */
export const THERMAL_CONTROL_CHAIN: readonly string[] = [
  'Temperature setpoint',
  'Controller',
  'Heater / cooling command',
  'Barrel temperature',
  'Heat transfer to or from the process',
  'Material / melt temperature',
] as const;

/** DOC-01 §10: what adds to and subtracts from the material energy state. */
export const MATERIAL_ENERGY_BALANCE = {
  adds: ['External barrel heating', 'Mechanical shear and mixing energy'],
  removes: ['Cooling', 'Heat loss', 'Energy carried out with the product'],
  consequence:
    'Melt temperature is the result of a balance, not a copy of the barrel setpoint. A high melt temperature can come from RPM, mechanical energy, viscosity, restrictive screw elements or insufficient cooling, so thermal and process evidence must be combined rather than read from a single signal.',
} as const;
