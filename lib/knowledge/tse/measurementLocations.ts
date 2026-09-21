/**
 * Physically meaningful measurement locations (DOC-01 §18).
 *
 * DOC-01 draws a line here that this file keeps: §18 defines *where* a
 * measurement should come from and *why that place matters*, and leaves the
 * exact source, tag, sensor type, data quality and acquisition rate to DOC-02.
 * So there are no sensor part numbers or sample rates below.
 *
 * `preferExistingSource` carries §18's reuse policy: "Existing trustworthy
 * PLC/VFD/controller measurements should be reused where practical; ULTRON
 * sensors are added where data are absent, inadequate or require independent
 * measurement." It is true where the controller is the natural owner of the
 * value, and null where the site has to decide.
 *
 * `installedTags` reconciles the model against the machine as actually drawn.
 * `locationsWithNoInstalledMeasurement` is the gap list, and it is short but
 * consequential: no cooling-utility instrumentation, and no MES or lab feed at
 * all, which is why neither throughput nor recipe context exists anywhere in
 * this model.
 */

import { TWIN_SCREW_POINT_REGISTRY } from '../../twinScrewExtruderPoints';
import type { MeasurementLocation } from './types';

const COMMON = 'COMMON' as const;
const TSE = 'TSE_SPECIFIC' as const;

export const TSE_MEASUREMENT_LOCATIONS: readonly MeasurementLocation[] = [
  {
    locationId: 'ML-MOTOR',
    name: 'Main motor',
    physicalDescription: 'The drive motor: its shaft, its bearing housings and its electrical supply.',
    recommendedParameters: [
      'PAR-MOTOR-CURRENT',
      'PAR-ACTIVE-POWER',
      'PAR-SCREW-RPM',
      'PAR-OVERALL-VIBRATION',
    ],
    whyTheLocationMatters: 'Electrical load and basic rotating condition.',
    installedTags: ['TS-PM1', 'TS-E1', 'TS-V1', 'TS-V2', 'TS-T1'],
    preferExistingSource: true,
    knowledgeClass: COMMON,
  },
  {
    locationId: 'ML-GEARBOX',
    name: 'Gearbox',
    physicalDescription: 'The reduction and twin-shaft drive unit, its oil sump and its bearing housings.',
    recommendedParameters: ['PAR-GEARBOX-OIL-TEMP', 'PAR-OVERALL-VIBRATION', 'PAR-SCREW-RPM'],
    whyTheLocationMatters: 'Mechanical transmission condition.',
    installedTags: ['TS-T2', 'TS-T3', 'TS-V3', 'TS-V4', 'TS-V5'],
    preferExistingSource: false,
    knowledgeClass: COMMON,
  },
  {
    locationId: 'ML-MAIN-FEEDER',
    name: 'Main feeder',
    physicalDescription: 'The gravimetric or volumetric feeder, its hopper and the feed throat below it.',
    recommendedParameters: ['PAR-MAIN-FEED-RATE'],
    whyTheLocationMatters: 'Primary process context and feed stability.',
    installedTags: ['TS-F1', 'TS-N1', 'TS-I1', 'TS-L1', 'TS-TT0'],
    preferExistingSource: true,
    knowledgeClass: TSE,
  },
  {
    locationId: 'ML-SIDE-FEEDER',
    name: 'Side feeder',
    physicalDescription: 'The downstream side-stuffer and its drive.',
    recommendedParameters: ['PAR-SIDE-FEED-RATE'],
    whyTheLocationMatters: 'Secondary material context.',
    installedTags: ['TS-F2', 'TS-N2', 'TS-I2'],
    preferExistingSource: true,
    knowledgeClass: TSE,
  },
  {
    locationId: 'ML-BARREL-ZONES',
    name: 'Barrel zones',
    physicalDescription: 'Each controlled barrel section, at the sensor pocket the zone controller reads.',
    recommendedParameters: ['PAR-ZONE-ACTUAL-TEMP', 'PAR-ZONE-SETPOINT', 'PAR-HEATER-OUTPUT', 'PAR-COOLING-OUTPUT'],
    whyTheLocationMatters: 'Thermal profile and control effort.',
    installedTags: [
      'TS-TZ1',
      'TS-TZ2',
      'TS-TZ3',
      'TS-TZ4',
      'TS-TZ5',
      'TS-TZ6',
      'TS-TZ7',
      'TS-TZ8',
      'TS-P1',
      'TS-P2',
    ],
    preferExistingSource: true,
    knowledgeClass: TSE,
  },
  {
    locationId: 'ML-SCREW-OUTPUT',
    name: 'Screw / drive output',
    physicalDescription: 'The two gearbox output shafts driving the screws.',
    recommendedParameters: ['PAR-SCREW-RPM', 'PAR-TORQUE'],
    whyTheLocationMatters: 'Primary process speed and load.',
    installedTags: ['TS-S1', 'TS-S2'],
    preferExistingSource: true,
    knowledgeClass: TSE,
  },
  {
    locationId: 'ML-PRE-SCREEN',
    name: 'Pre-screen melt path',
    physicalDescription: 'The melt channel between the end of the process section and the screen pack.',
    recommendedParameters: ['PAR-MELT-PRESSURE', 'PAR-MELT-TEMP'],
    whyTheLocationMatters: 'Upstream process resistance.',
    installedTags: ['TS-P3'],
    preferExistingSource: null,
    knowledgeClass: TSE,
  },
  {
    locationId: 'ML-POST-SCREEN',
    name: 'Post-screen / die',
    physicalDescription: 'The melt channel between the screen pack and the die.',
    recommendedParameters: ['PAR-MELT-PRESSURE', 'PAR-PRESSURE-DIFFERENTIAL'],
    whyTheLocationMatters: 'Differential pressure and downstream localisation.',
    installedTags: ['TS-P4'],
    preferExistingSource: null,
    knowledgeClass: TSE,
  },
  {
    locationId: 'ML-MELT-OUTLET',
    name: 'Melt outlet',
    physicalDescription: 'An immersion probe in the die adapter, reading the material rather than the metal.',
    recommendedParameters: ['PAR-MELT-TEMP'],
    whyTheLocationMatters: 'Actual material thermal state, which a barrel metal temperature does not give.',
    installedTags: ['TS-TM'],
    preferExistingSource: null,
    knowledgeClass: TSE,
  },
  {
    locationId: 'ML-VACUUM',
    name: 'Vacuum / vent',
    physicalDescription: 'The vent port and the vacuum line serving it.',
    recommendedParameters: ['PAR-VACUUM-PRESSURE'],
    whyTheLocationMatters: 'Devolatilisation condition.',
    installedTags: ['TS-PV', 'TS-TV'],
    preferExistingSource: null,
    knowledgeClass: TSE,
  },
  {
    locationId: 'ML-COOLING-UTILITY',
    name: 'Cooling utility',
    physicalDescription: 'The cooling supply and return headers serving the barrel jacket.',
    recommendedParameters: ['PAR-COOLING-OUTPUT'],
    whyTheLocationMatters: 'Cooling-system effectiveness and context.',
    installedTags: [],
    preferExistingSource: true,
    knowledgeClass: COMMON,
  },
  {
    locationId: 'ML-MES-QMS',
    name: 'MES / QMS / laboratory',
    physicalDescription: 'The production and quality systems, not a physical point on the machine.',
    recommendedParameters: ['PAR-THROUGHPUT', 'PAR-PRODUCT-BATCH', 'PAR-RECIPE'],
    whyTheLocationMatters: 'Performance and quality context, and the normaliser specific energy needs.',
    installedTags: [],
    preferExistingSource: true,
    knowledgeClass: COMMON,
  },
] as const;

const BY_ID = new Map(TSE_MEASUREMENT_LOCATIONS.map((location) => [location.locationId, location]));

export function measurementLocation(locationId: string): MeasurementLocation | undefined {
  return BY_ID.get(locationId);
}

export function locationForTag(tag: string): MeasurementLocation | undefined {
  return TSE_MEASUREMENT_LOCATIONS.find((location) => location.installedTags.includes(tag));
}

/** Locations DOC-01 recommends that carry no instrument on this machine. */
export function locationsWithNoInstalledMeasurement(): MeasurementLocation[] {
  return TSE_MEASUREMENT_LOCATIONS.filter((location) => location.installedTags.length === 0);
}

/**
 * Tags declared here that the point registry does not actually carry, and tags
 * the registry carries that no location claims.
 *
 * Both directions are checked. A tag claimed by a location but absent from the
 * drawing would let a rule believe it has a measurement it does not, and a tag
 * on the drawing that no location claims has no process meaning attached to it,
 * which is the failure §18 exists to prevent.
 */
export function reconcileWithPointRegistry(): { claimedButNotInstalled: string[]; installedButUnclaimed: string[] } {
  const registryTags = new Set(TWIN_SCREW_POINT_REGISTRY.map((point) => point.analyzerTag as string));
  const claimed = new Set(TSE_MEASUREMENT_LOCATIONS.flatMap((location) => location.installedTags));

  return {
    claimedButNotInstalled: [...claimed].filter((tag) => !registryTags.has(tag)).sort(),
    installedButUnclaimed: [...registryTags].filter((tag) => !claimed.has(tag)).sort(),
  };
}
