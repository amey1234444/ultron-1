/**
 * Barrel zones: number and function, held apart (DOC-01 §7).
 *
 * This file exists to enforce one rule, which DOC-01 marks as an IMPLEMENTATION
 * RULE rather than as guidance:
 *
 *   "BLACKGATE must store Zone_Function as configuration data. The ML/diagnosis
 *    layer should not infer that 'Zone 4 = mixing' merely from zone number.
 *    Actual zone function comes from the validated screw/barrel layout."
 *
 * The reason is physical. A co-rotating twin screw has modular barrels and
 * modular screw elements, so the OEM and the application decide where the feed
 * ports, the vents, the kneading blocks and the pressure-building elements sit.
 * Two seven-zone machines from the same builder can have different zone-four
 * behaviour. Any code that reads a zone number and concludes a process function
 * is guessing, and it will guess confidently and wrongly.
 *
 * So the reference map below is exported as `REFERENCE_ZONE_MAP` and every
 * accessor that touches it is named `reference…`. The function that answers
 * "what does zone N do on this machine" is `configuredFunctionFor`, and it
 * returns null until a site validates the screw and barrel drawing. There is no
 * fallback from one to the other, because a fallback is how the rule gets
 * broken quietly.
 *
 * A second, machine-specific fact this file records: the installed machine
 * model carries nine heated barrel zones (`TS-TZ1`…`TS-TZ9`), while the DOC-01
 * reference variant is a seven-zone template. That mismatch is not an error —
 * it is exactly the situation §7 is written for — but it does mean the seven
 * reference roles cannot be laid onto the nine installed positions by number
 * even informally.
 */

import { TWIN_SCREW_POINT_REGISTRY, type TwinScrewTag } from '../../twinScrewExtruderPoints';
import type { ReferenceZoneEntry, ZoneDefinition } from './types';

/**
 * The DOC-01 §7 reference process map.
 *
 * "The table below is a reference starting point for a seven-zone compounding
 * TSE. It is not a universal OEM layout." Kept as data so a commissioning UI
 * can *offer* these as candidate functions for an engineer to confirm against
 * the drawing — which is a legitimate use — while nothing may consume them as
 * the machine's actual configuration.
 */
export const REFERENCE_ZONE_MAP: readonly ReferenceZoneEntry[] = [
  {
    position: 1,
    referenceFunction: 'FEED_SOLIDS_INTAKE',
    referenceRole: 'Material entry and solids pickup.',
    keyInfluences: ['Feed rate', 'Feed-throat condition', 'Screw RPM', 'Solids flow'],
    laterAnalyticsExamples: ['Feed starvation', 'Bridging', 'Premature softening at the inlet'],
    conditional: false,
  },
  {
    position: 2,
    referenceFunction: 'CONVEYING_PREHEAT',
    referenceRole: 'Forward transport and temperature rise.',
    keyInfluences: ['Barrel temperature', 'Screw element pitch', 'Fill'],
    laterAnalyticsExamples: ['Poor transport', 'Insufficient or premature melting'],
    conditional: false,
  },
  {
    position: 3,
    referenceFunction: 'MELTING_TRANSITION',
    referenceRole: 'Increasing melt fraction using heat and shear.',
    keyInfluences: ['Temperature profile', 'Screw RPM', 'Torque', 'Material properties'],
    laterAnalyticsExamples: ['Poor melting', 'Excess shear', 'Thermal imbalance'],
    conditional: false,
  },
  {
    position: 4,
    referenceFunction: 'INTENSIVE_MIXING',
    referenceRole: 'Distributive and dispersive mixing in the reference layout.',
    keyInfluences: ['Kneading element geometry', 'Fill', 'Viscosity', 'Screw RPM'],
    laterAnalyticsExamples: ['High load', 'High specific energy', 'Local thermal effect'],
    conditional: false,
  },
  {
    position: 5,
    referenceFunction: 'SIDE_FEED_SECONDARY_MIXING',
    referenceRole: 'Introduce and incorporate fillers, fibres or additives.',
    keyInfluences: ['Side feeder', 'Melt state', 'Local pressure and fill'],
    laterAnalyticsExamples: ['Side-feed instability', 'Intake limitation'],
    conditional: true,
  },
  {
    position: 6,
    referenceFunction: 'VENTING_HOMOGENISATION',
    referenceRole: 'Remove gases, moisture and volatiles, and re-homogenise.',
    keyInfluences: ['Vacuum', 'Melt seal', 'Fill', 'Temperature'],
    laterAnalyticsExamples: ['Low or unstable vacuum', 'Vent flooding'],
    conditional: true,
  },
  {
    position: 7,
    referenceFunction: 'FINAL_CONVEYING_PRESSURE_BUILD',
    referenceRole: 'Stabilise melt and generate discharge pressure.',
    keyInfluences: ['Viscosity', 'Throughput', 'Downstream resistance'],
    laterAnalyticsExamples: ['Pressure instability', 'Restriction evidence'],
    conditional: false,
  },
] as const;

/**
 * Look up a reference role by position.
 *
 * Named `reference…` and documented as reference-only so that a call site
 * reading like `referenceZoneEntry(4)` cannot be mistaken for a statement about
 * the machine. Returns undefined outside the seven reference positions rather
 * than extrapolating.
 */
export function referenceZoneEntry(position: number): ReferenceZoneEntry | undefined {
  return REFERENCE_ZONE_MAP.find((entry) => entry.position === position);
}

/** Barrel zone temperature tags installed on this machine, in zone order. */
export function installedZoneTags(): TwinScrewTag[] {
  const tags = TWIN_SCREW_POINT_REGISTRY.filter((point) => /^TS-TZ\d+$/.test(point.analyzerTag)).map(
    (point) => point.analyzerTag,
  );
  return tags.sort((a, b) => Number(a.replace('TS-TZ', '')) - Number(b.replace('TS-TZ', '')));
}

/** How many heated barrel zones the installed machine model actually carries. */
export function installedZoneCount(): number {
  return installedZoneTags().length;
}

/**
 * The zone definitions for the installed machine.
 *
 * `configuredFunction` is null on every one of them. That is the honest state
 * today: nobody has supplied the validated screw and barrel layout, so nothing
 * is known about what any of these positions does beyond its number and the
 * temperature sensor mounted on it.
 */
export function installedZoneDefinitions(): ZoneDefinition[] {
  return installedZoneTags().map((tag) => {
    const zoneNumber = Number(tag.replace('TS-TZ', ''));
    return {
      zoneId: `PROC.Z${zoneNumber}`,
      zoneNumber,
      configuredFunction: null,
      configuredFunctionSource: null,
      barrelModuleRef: null,
      measurementTags: [tag],
      knowledgeClass: 'MACHINE_SPECIFIC' as const,
    };
  });
}

/**
 * What this machine's zone N does.
 *
 * Returns null whenever the function has not been read off a validated drawing.
 * There is deliberately no `?? referenceZoneEntry(n).referenceFunction` here:
 * DOC-01 §7 forbids exactly that substitution, and a default would make the
 * forbidden inference in the one place every caller reaches for.
 */
export function configuredFunctionFor(zones: readonly ZoneDefinition[], zoneNumber: number): string | null {
  return zones.find((zone) => zone.zoneNumber === zoneNumber)?.configuredFunction ?? null;
}

export type ZoneConfigurationInput = {
  zoneNumber: number;
  configuredFunction: string;
  /** The drawing, layout sheet or record this was read from. Required. */
  source: string;
  barrelModuleRef?: string;
};

export class ZoneConfigurationError extends Error {}

/**
 * Apply a validated zone configuration.
 *
 * `source` is mandatory and non-empty. A zone function with no traceable origin
 * is indistinguishable from a guess once it is in the database, and the whole
 * value of separating number from function is that the function can be traced
 * back to a drawing someone signed.
 */
export function applyZoneConfiguration(
  zones: readonly ZoneDefinition[],
  inputs: readonly ZoneConfigurationInput[],
): ZoneDefinition[] {
  const byNumber = new Map(inputs.map((input) => [input.zoneNumber, input]));

  for (const input of inputs) {
    if (!zones.some((zone) => zone.zoneNumber === input.zoneNumber)) {
      throw new ZoneConfigurationError(
        `Zone ${input.zoneNumber} is not a zone on this machine. It carries ${zones.length} barrel zones.`,
      );
    }
    if (!input.source.trim()) {
      throw new ZoneConfigurationError(
        `Zone ${input.zoneNumber} function "${input.configuredFunction}" was supplied without a source. DOC-01 §7 requires the function to come from the validated screw and barrel layout, so the drawing or record it was read from must be named.`,
      );
    }
  }

  return zones.map((zone) => {
    const input = byNumber.get(zone.zoneNumber);
    if (!input) return zone;
    return {
      ...zone,
      configuredFunction: input.configuredFunction,
      configuredFunctionSource: input.source,
      barrelModuleRef: input.barrelModuleRef ?? zone.barrelModuleRef,
    };
  });
}

/** Zones still waiting for a validated function. */
export function unconfiguredZones(zones: readonly ZoneDefinition[]): ZoneDefinition[] {
  return zones.filter((zone) => zone.configuredFunction === null);
}

/**
 * Whether the reference seven-zone map can be offered as candidate functions.
 *
 * False when the installed zone count differs from the reference, because the
 * positions then do not correspond even loosely and offering them would invite
 * an engineer to accept a mapping that is wrong by construction.
 */
export function referenceMapIsPositionallyComparable(zoneCount: number): boolean {
  return zoneCount === REFERENCE_ZONE_MAP.length;
}
