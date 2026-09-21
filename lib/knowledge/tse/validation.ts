/**
 * Site inputs and the engineering validation checklist (DOC-01 §22, §23).
 *
 * DOC-01 §22 is emphatic about what these are: "These are not 'research tasks'
 * for the deployment engineer. They are structured data-collection/validation
 * items needed to instantiate the machine-specific template." So the register
 * below names an owner for every item, and the checklist runs against the
 * declared model rather than against someone's memory.
 *
 * `runValidation` evaluates the twelve §23 checks on the knowledge actually
 * declared in this module. Most of them fail today, which is the correct
 * result for a template that has not been commissioned against a real machine,
 * and each failure names what would satisfy it. A checklist that passed on an
 * uncommissioned machine would be worse than no checklist.
 */

import { TSE_ASSET_TREE, assetsWithoutConsoleComponent } from './assets';
import { optionalComponents } from './components';
import { isDeclared, TSE_REQUIRED_FACTS, undeclaredFacts } from './engineeringFacts';
import { locationsWithNoInstalledMeasurement, reconcileWithPointRegistry } from './measurementLocations';
import { parametersWithoutTags } from './parameters';
import { validateTopology } from './processFlow';
import { validateRelationships } from './relationships';
import {
  TSE_REFERENCE_CONFIGURATION,
  TSE_TEMPLATE,
  configurationIsDeclared,
  undeclaredConfigurationFields,
} from './template';
import type { ConfigurationVersion, EngineeringFact, ZoneDefinition } from './types';
import { installedZoneCount, installedZoneDefinitions, referenceMapIsPositionallyComparable, unconfiguredZones } from './zones';

/* 22 — Inputs required from OEM / customer / site ----------------------------- */

export type SiteInputItem = {
  group: string;
  whatMustBeCollected: string;
  typicalOwner: string;
};

export const TSE_SITE_INPUTS: readonly SiteInputItem[] = [
  {
    group: 'Machine identity',
    whatMustBeCollected: 'OEM, model, serial, application, commissioning year.',
    typicalOwner: 'Customer / OEM',
  },
  {
    group: 'Mechanical ratings',
    whatMustBeCollected: 'Motor, VFD and gearbox ratings; screw speed and torque limits.',
    typicalOwner: 'Nameplate / OEM',
  },
  {
    group: 'Screw and barrel configuration',
    whatMustBeCollected:
      'Screw element arrangement or configuration ID, zone and module drawing, L/D, feed, vent and side-feed locations.',
    typicalOwner: 'OEM / process engineer',
  },
  {
    group: 'Temperature configuration',
    whatMustBeCollected: 'Zone setpoint ranges and capability, heater and cooling arrangement.',
    typicalOwner: 'OEM / PLC / process engineer',
  },
  {
    group: 'Pressure configuration',
    whatMustBeCollected: 'Measurement tap locations, ranges, design and approved limits.',
    typicalOwner: 'P&ID / OEM / site',
  },
  {
    group: 'Feeding configuration',
    whatMustBeCollected: 'Main and side feeder types, capacity, actual and setpoint availability.',
    typicalOwner: 'Feeder OEM / site',
  },
  {
    group: 'Venting configuration',
    whatMustBeCollected: 'Atmospheric and vacuum vents, pump and system details, operating expectations.',
    typicalOwner: 'OEM / site',
  },
  {
    group: 'Downstream configuration',
    whatMustBeCollected: 'Screen or filter, adapter, die, pelletiser or downstream equipment.',
    typicalOwner: 'OEM / process engineer',
  },
  {
    group: 'Materials and recipes',
    whatMustBeCollected: 'Recipe IDs, and the material, filler and additive context available to BLACKGATE.',
    typicalOwner: 'MES / process engineer',
  },
  {
    group: 'Approved limits',
    whatMustBeCollected: 'Alert, Danger and Trip/Protection limits with source and approval.',
    typicalOwner: 'Customer / OEM / safety engineering',
  },
  {
    group: 'Existing measurements',
    whatMustBeCollected: 'Available PLC, DCS, VFD and controller tags, with quality and status.',
    typicalOwner: 'Automation engineer',
  },
  {
    group: 'Configuration-change history',
    whatMustBeCollected: 'Major rebuilds and screw, die or sensor changes relevant to historical baselines.',
    typicalOwner: 'Maintenance / process engineer',
  },
] as const;

/* 23 — Engineering validation checklist --------------------------------------- */

export type CheckStatus = 'PASS' | 'FAIL' | 'NOT_APPLICABLE';

export type CheckResult = {
  checkId: string;
  check: string;
  acceptanceCriterion: string;
  status: CheckStatus;
  /** What was found, and for a failure what would satisfy it. */
  detail: string;
};

export type ValidationInput = {
  zones?: readonly ZoneDefinition[];
  facts?: readonly EngineeringFact[];
  configuration?: ConfigurationVersion;
};

export function runValidation(input: ValidationInput = {}): CheckResult[] {
  const zones = input.zones ?? installedZoneDefinitions();
  const facts = input.facts ?? TSE_REQUIRED_FACTS;
  const configuration = input.configuration ?? TSE_REFERENCE_CONFIGURATION;

  const results: CheckResult[] = [];
  const add = (checkId: string, check: string, acceptanceCriterion: string, status: CheckStatus, detail: string) =>
    results.push({ checkId, check, acceptanceCriterion, status, detail });

  // 1. Machine variant.
  add(
    'VC-01',
    'Machine variant confirmed',
    'Co-rotating / intermeshing / parallel / compounding classification is correct.',
    'PASS',
    `Template ${TSE_TEMPLATE.templateId} declares ${TSE_TEMPLATE.rotation}, ${TSE_TEMPLATE.engagement}, ${TSE_TEMPLATE.geometry}, ${TSE_TEMPLATE.application}. This is the reference classification and still needs confirming against the machine nameplate.`,
  );

  // 2. Asset hierarchy.
  const missingConsole = assetsWithoutConsoleComponent();
  add(
    'VC-02',
    'Asset hierarchy validated',
    'Installed components match enabled template nodes.',
    missingConsole.length === 0 ? 'PASS' : 'FAIL',
    missingConsole.length === 0
      ? `All ${TSE_ASSET_TREE.length} declared asset nodes map onto a console component.`
      : `${missingConsole.length} modelled asset nodes have no console component and no mapped data: ${missingConsole
          .map((asset) => asset.assetId)
          .join(', ')}. Confirm whether each is installed, and where it is, supply its data source.`,
  );

  // 3. Zone functions — the DOC-01 §7 rule.
  const unconfigured = unconfiguredZones(zones);
  add(
    'VC-03',
    'Zone functions validated',
    'Actual zone functions are taken from the real screw and barrel configuration.',
    unconfigured.length === 0 ? 'PASS' : 'FAIL',
    unconfigured.length === 0
      ? `All ${zones.length} zones carry a configured function with a named source.`
      : `${unconfigured.length} of ${zones.length} zones have no configured function: ${unconfigured
          .map((zone) => zone.zoneNumber)
          .join(', ')}. Supply the validated screw and barrel layout. The DOC-01 §7 reference map must not be applied by zone number.`,
  );

  // 4. Feed and vent ports.
  add(
    'VC-04',
    'Feed and vent ports validated',
    'Main feed, side feed, liquid injection and vent locations are correct.',
    configuration.feedLocations.length > 0 && configuration.ventLocations.length > 0 ? 'PASS' : 'FAIL',
    configuration.feedLocations.length > 0 && configuration.ventLocations.length > 0
      ? 'Feed and vent locations are declared on the configuration version.'
      : 'No feed, side-feed, liquid-injection or vent locations are declared on the configuration version. Until they are, no analysis can say which zone a composition change or a devolatilisation stage belongs to.',
  );

  // 5. Screw configuration version.
  add(
    'VC-05',
    'Screw configuration versioned',
    'The current screw arrangement has a traceable configuration or version ID.',
    configurationIsDeclared(configuration) ? 'PASS' : 'FAIL',
    configurationIsDeclared(configuration)
      ? `Configuration ${configuration.versionId} carries the full DOC-01 §8.1 metadata set.`
      : `Configuration metadata is incomplete. Missing: ${undeclaredConfigurationFields(configuration).join(', ')}. Baselines cannot be tied to a geometry that has no identifier.`,
  );

  // 6. Pressure locations.
  const pressureFactsDeclared = facts
    .filter((fact) => fact.parameter.toLowerCase().includes('pressure'))
    .every(isDeclared);
  add(
    'VC-06',
    'Pressure locations validated',
    'Every pressure value has a physical location and a calibrated range.',
    pressureFactsDeclared ? 'PASS' : 'FAIL',
    pressureFactsDeclared
      ? 'Every pressure fact carries a declared range and location.'
      : 'Pressure taps are located in the measurement-location model (ML-PRE-SCREEN, ML-POST-SCREEN), but no calibrated range or allowable limit is declared for any of them. A pressure with no range is not interpretable.',
  );

  // 7. Thermal topology.
  const thermalDisabled = TSE_ASSET_TREE.filter((asset) => asset.assetId.startsWith('THERM') && !asset.enabled);
  add(
    'VC-07',
    'Thermal topology validated',
    'Heater and cooling arrangements and zone sensor locations are known.',
    thermalDisabled.length === 0 ? 'PASS' : 'FAIL',
    thermalDisabled.length === 0
      ? 'Heating and cooling systems are declared and enabled.'
      : 'No heater or cooling output signal exists on this machine, so heater demand cannot be compared against zone response. A heater failure and a process heat change are currently indistinguishable.',
  );

  // 8. Downstream configuration.
  add(
    'VC-08',
    'Downstream configuration validated',
    'Screen, adapter and die setup is identified.',
    configuration.screenConfiguration !== null && configuration.dieConfiguration !== null ? 'PASS' : 'FAIL',
    configuration.screenConfiguration !== null && configuration.dieConfiguration !== null
      ? 'Screen and die configuration are declared.'
      : 'Screen and die configuration are undeclared. Downstream geometry sets the normal pressure, so a pressure baseline cannot be attributed without it.',
  );

  // 9. Material and recipe context.
  const recipeAvailable = parametersWithoutTags().every((parameter) => parameter.parameterId !== 'PAR-RECIPE');
  add(
    'VC-09',
    'Material / recipe context available',
    'At least a usable recipe or material identifier can be supplied.',
    recipeAvailable ? 'PASS' : 'FAIL',
    recipeAvailable
      ? 'A recipe identifier is available to BLACKGATE.'
      : 'No recipe or material identifier reaches BLACKGATE. Contextual baselines cannot be selected, and a legitimate formulation change will look like a process deviation.',
  );

  // 10. Engineering limits sourced.
  const outstanding = undeclaredFacts(facts);
  add(
    'VC-10',
    'Engineering limits sourced',
    'Ratings, Alert, Danger and Trip values have source, authority and version.',
    outstanding.length === 0 ? 'PASS' : 'FAIL',
    outstanding.length === 0
      ? `All ${facts.length} engineering facts are declared with the full DOC-01 §17.1 metadata set.`
      : `${outstanding.length} of ${facts.length} required engineering facts are undeclared, including ${outstanding
          .slice(0, 3)
          .map((fact) => fact.factId)
          .join(', ')}. Every threshold rule stays unevaluated until its limit is declared.`,
  );

  // 11. No universal zone assumptions.
  const zoneCount = installedZoneCount();
  const comparable = referenceMapIsPositionallyComparable(zoneCount);
  add(
    'VC-11',
    'No universal zone assumptions remain',
    'The reference zone map has been replaced or confirmed for the real machine.',
    unconfigured.length === 0 ? 'PASS' : 'FAIL',
    unconfigured.length === 0
      ? 'Every zone function comes from a named configuration source.'
      : comparable
        ? `This machine carries ${zoneCount} barrel zones, matching the DOC-01 reference count. The reference roles may be offered as candidates for an engineer to confirm against the drawing, but none has been confirmed, so no zone function is known.`
        : `This machine carries ${zoneCount} heated barrel zones against a ${TSE_TEMPLATE.referenceZones}-zone reference template. The reference roles cannot be laid onto these positions by number even as candidates, so every zone function must come from the screw and barrel drawing.`,
  );

  // 12. DOC-02 readiness.
  const blockers = results.filter((result) => result.status === 'FAIL').length;
  add(
    'VC-12',
    'DOC-02 ready',
    'Enough machine knowledge exists to design signal, state and context requirements.',
    blockers === 0 ? 'PASS' : 'FAIL',
    blockers === 0
      ? 'The machine model is complete enough to design DOC-02 signal and state requirements.'
      : `${blockers} earlier checks are outstanding. DOC-02 can begin on the structure — asset tree, process flow, parameter dictionary and relationships are all declared — but its signal, state and context requirements cannot be finalised until the machine-specific items above are collected.`,
  );

  return results;
}

/** Structural problems in the knowledge model itself, independent of any site. */
export function validateModelIntegrity(): string[] {
  const problems = [...validateTopology(), ...validateRelationships()];

  const { claimedButNotInstalled, installedButUnclaimed } = reconcileWithPointRegistry();
  for (const tag of claimedButNotInstalled) {
    problems.push(
      `Measurement location claims tag ${tag}, which the twin-screw point registry does not carry. A rule reading it would believe it has a measurement that does not exist.`,
    );
  }
  for (const tag of installedButUnclaimed) {
    problems.push(
      `Tag ${tag} is on the machine but belongs to no measurement location, so it has no declared process meaning.`,
    );
  }

  const assetIds = new Set(TSE_ASSET_TREE.map((asset) => asset.assetId));
  for (const asset of TSE_ASSET_TREE) {
    if (asset.parentId !== null && !assetIds.has(asset.parentId)) {
      problems.push(`Asset ${asset.assetId} names parent ${asset.parentId}, which is not a declared asset.`);
    }
  }

  return problems;
}

/** A one-line summary of where commissioning stands. */
export function commissioningSummary(input: ValidationInput = {}): {
  passed: number;
  failed: number;
  total: number;
  optionalEquipmentToConfirm: string[];
  locationsWithoutMeasurement: string[];
} {
  const results = runValidation(input);
  return {
    passed: results.filter((result) => result.status === 'PASS').length,
    failed: results.filter((result) => result.status === 'FAIL').length,
    total: results.length,
    optionalEquipmentToConfirm: optionalComponents().map((component) => component.name),
    locationsWithoutMeasurement: locationsWithNoInstalledMeasurement().map((location) => location.name),
  };
}
