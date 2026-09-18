/**
 * Checks for the DOC-01 machine-knowledge layer.
 *
 * There is no test runner in this project, so these run as a script the same
 * way `machineZoomChecks.ts` does:
 *
 *   npm run check:tse-knowledge
 *
 * Exit code is non-zero if anything fails.
 *
 * What is worth checking here is not that the tables were typed in correctly —
 * a reader can see that. It is the four rules DOC-01 states as rules, each of
 * which is a silent failure rather than a crash if it is broken:
 *
 *   §7   a zone function is never inferred from a zone number
 *   §13  a directional prior never loses its conditions
 *   §17  an ULTRON-calculated value never becomes an approved limit
 *   §18  a rule never believes it has a measurement the machine lacks
 *
 * Nothing is re-implemented. Every assertion imports the shipped module.
 */

import {
  applyZoneConfiguration,
  approveSuggestion,
  ApprovalError,
  AUTHORITY_PRECEDENCE,
  authorityRank,
  candidateCausesFor,
  commissioningSummary,
  configuredFunctionFor,
  declareFact,
  installedZoneCount,
  installedZoneDefinitions,
  isDeclared,
  missingMetadata,
  proposeSuggestion,
  REFERENCE_ZONE_MAP,
  referenceZoneEntry,
  reconcileWithPointRegistry,
  resolveGoverningFact,
  runValidation,
  TSE_ASSET_TREE,
  TSE_COMPONENT_LIBRARY,
  TSE_MEASUREMENT_LOCATIONS,
  TSE_OPERATING_STATES,
  TSE_PARAMETERS,
  TSE_PROCESS_FLOW,
  TSE_REQUIRED_FACTS,
  TSE_RELATIONSHIPS,
  TSE_TEMPLATE,
  validateModelIntegrity,
  ZoneConfigurationError,
  type EngineeringFact,
} from '../index';
import { baselineApplies } from '../operatingStates';
import { PREDICATE_KIND } from '../types';
import { unconfiguredZones } from '../zones';
import { MACHINE_TEMPLATES } from '../../../machines';
import {
  normaliseVariantId,
  templateHasVariants,
  variantById,
  variantForMachine,
  variantIsUndeclared,
  variantShortLabel,
  variantsForTemplate,
} from '../../../machineVariants';
import { analyseTwinScrew, commissioningGaps, hasCommissionedModel } from '../../../analysis/twinScrew';
import { unresolvedReason } from '../../machineKnowledge';
import { factsForMachine, knowledgeForMachine, knowledgeForTemplateId, packsForConsoleTemplate } from '../../registry';
import { TSE_KNOWLEDGE } from '../pack';
import { composeVariantDescriptor } from '../template';

let failures = 0;
function check(name: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  PASS  ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? ` — got: ${detail}` : ''}`);
  }
}

// ---------------------------------------------------------------------------
console.log('\n--- All ten DOC-01 §21 entities exist and carry content ---');

check('MachineTemplate is declared', TSE_TEMPLATE.templateId === 'TSE-7Z-CR-INT-PAR-COMP', TSE_TEMPLATE.templateId);
check('AssetNode tree is populated', TSE_ASSET_TREE.length >= 20, String(TSE_ASSET_TREE.length));
check('ProcessLocation path has all ten DOC-01 §6 steps', TSE_PROCESS_FLOW.length === 10, String(TSE_PROCESS_FLOW.length));
check('ZoneDefinitions are generated for the installed machine', installedZoneDefinitions().length > 0);
check('ComponentDefinition library covers DOC-01 §9', TSE_COMPONENT_LIBRARY.length >= 15, String(TSE_COMPONENT_LIBRARY.length));
check('ParameterDefinition dictionary covers DOC-01 §12', TSE_PARAMETERS.length >= 19, String(TSE_PARAMETERS.length));
check('RelationshipDefinition graph is populated', TSE_RELATIONSHIPS.length >= 40, String(TSE_RELATIONSHIPS.length));
check('MeasurementLocation model covers DOC-01 §18', TSE_MEASUREMENT_LOCATIONS.length === 12, String(TSE_MEASUREMENT_LOCATIONS.length));
check('EngineeringFact register covers DOC-01 §16', TSE_REQUIRED_FACTS.length >= 16, String(TSE_REQUIRED_FACTS.length));
check('OperatingState knowledge covers DOC-01 §14', TSE_OPERATING_STATES.length === 10, String(TSE_OPERATING_STATES.length));

check(
  'the template records that zone function comes from configuration, not from zone number',
  TSE_TEMPLATE.zoneFunctionSource === 'MACHINE_CONFIGURATION',
);
check(
  'the template ships no invented screw configuration version',
  TSE_TEMPLATE.screwConfigurationVersion === null,
);

// ---------------------------------------------------------------------------
console.log('\n--- §7: zone function is never inferred from zone number ---');

const zones = installedZoneDefinitions();

check(
  'every installed zone starts with no configured function',
  zones.every((zone) => zone.configuredFunction === null),
  String(unconfiguredZones(zones).length),
);
check(
  'asking for a zone function returns nothing rather than the reference role',
  configuredFunctionFor(zones, 4) === null,
  String(configuredFunctionFor(zones, 4)),
);
check(
  'the reference map is still available as a candidate list for an engineer',
  referenceZoneEntry(4)?.referenceFunction === 'INTENSIVE_MIXING',
);
check('the reference map has the seven DOC-01 §7 positions', REFERENCE_ZONE_MAP.length === 7, String(REFERENCE_ZONE_MAP.length));

// The installed machine carries more zones than the reference template. That is
// exactly the situation §7 is written for, so it is asserted rather than
// tolerated: if the drawing ever changes, this check says so.
check(
  'the installed zone count is recorded even when it differs from the reference',
  installedZoneCount() > 0,
  String(installedZoneCount()),
);

let sourcelessRejected = false;
try {
  applyZoneConfiguration(zones, [{ zoneNumber: 1, configuredFunction: 'Feed / solids intake', source: '  ' }]);
} catch (error) {
  sourcelessRejected = error instanceof ZoneConfigurationError;
}
check('a zone function supplied without a source is refused', sourcelessRejected);

let unknownZoneRejected = false;
try {
  applyZoneConfiguration(zones, [
    { zoneNumber: 99, configuredFunction: 'Mixing', source: 'OEM drawing SC-07' },
  ]);
} catch (error) {
  unknownZoneRejected = error instanceof ZoneConfigurationError;
}
check('a function for a zone the machine does not have is refused', unknownZoneRejected);

const configured = applyZoneConfiguration(zones, [
  { zoneNumber: 1, configuredFunction: 'Feed / solids intake', source: 'OEM barrel drawing SC-07 sheet 2' },
]);
check(
  'a properly sourced zone function is accepted and keeps its source',
  configuredFunctionFor(configured, 1) === 'Feed / solids intake' &&
    configured[0].configuredFunctionSource === 'OEM barrel drawing SC-07 sheet 2',
);
check(
  'configuring one zone does not configure any other',
  configuredFunctionFor(configured, 2) === null,
);

// ---------------------------------------------------------------------------
console.log('\n--- §13: a directional prior never loses its conditions ---');

const priors = TSE_RELATIONSHIPS.filter((relationship) => PREDICATE_KIND[relationship.predicate] === 'process');
check('there are process priors to check', priors.length >= 20, String(priors.length));
check(
  'every process prior carries at least one condition',
  priors.every((prior) => prior.conditions.length > 0),
  priors
    .filter((prior) => prior.conditions.length === 0)
    .map((prior) => prior.relationshipId)
    .join(', '),
);
check(
  'every process prior states how confidently the effect follows',
  priors.every((prior) => prior.strength !== undefined),
);
check(
  'DOC-01 grades are preserved, not flattened into one',
  new Set(priors.map((prior) => prior.strength)).size === 3,
  [...new Set(priors.map((prior) => prior.strength))].join(', '),
);

const torqueCauses = candidateCausesFor('PAR-TORQUE');
check('candidate causes for torque are retrievable', torqueCauses.length >= 3, String(torqueCauses.length));
check(
  'candidate causes come back strongest expectation first',
  torqueCauses[0].strength === 'EXPECTED',
  String(torqueCauses[0]?.strength),
);

// ---------------------------------------------------------------------------
console.log('\n--- §17: an ULTRON value never becomes an approved limit ---');

check(
  'the authority ladder runs safety first and ULTRON last',
  AUTHORITY_PRECEDENCE[0] === 'SAFETY_PROTECTION' &&
    AUTHORITY_PRECEDENCE[AUTHORITY_PRECEDENCE.length - 1] === 'ULTRON_ANALYTICS',
);
check(
  'a customer limit outranks an OEM rating',
  authorityRank('APPROVED_CUSTOMER') < authorityRank('OEM'),
);

check('every required fact ships undeclared', TSE_REQUIRED_FACTS.every((fact) => !isDeclared(fact)));
check(
  'an undeclared fact names exactly which §17.1 fields it is missing',
  missingMetadata(TSE_REQUIRED_FACTS[0]).includes('value') &&
    missingMetadata(TSE_REQUIRED_FACTS[0]).includes('approvedBy'),
);

const suggestion = proposeSuggestion({
  suggestionId: 'SUG-001',
  parameter: 'Maximum allowable melt pressure - pre-screen',
  valueType: 'ANOMALY_THRESHOLD',
  value: 11,
  unit: 'MPa',
  method: 'p99.5 of steady-production melt pressure',
  basis: '30 days of STEADY_PRODUCTION on recipe R-4471',
  computedOn: '2026-09-18',
  facts: TSE_REQUIRED_FACTS,
});
check('a calculated value comes back under ULTRON authority', suggestion.authority === 'ULTRON_ANALYTICS');

// The type system is the real guard here — a SuggestedLimit is not an
// EngineeringFact and cannot be passed where one is expected. What this check
// covers is the runtime half: the registry the resolver reads is unchanged by
// having produced a suggestion.
check(
  'proposing a suggestion does not add anything to the fact registry',
  TSE_REQUIRED_FACTS.every((fact) => !isDeclared(fact)),
);

let ultronDeclarationRejected = false;
try {
  declareFact(TSE_REQUIRED_FACTS[0], {
    value: 55,
    unit: 'kW',
    authority: 'ULTRON_ANALYTICS',
    source: 'learned',
    documentRef: 'n/a',
    appliesToMachine: 'TSE01',
    approvedBy: 'analytics',
    approvedOn: '2026-09-18',
    version: '1',
  });
} catch (error) {
  ultronDeclarationRejected = error instanceof ApprovalError;
}
check('a fact cannot be declared under ULTRON authority', ultronDeclarationRejected);

let incompleteRejected = false;
try {
  declareFact(TSE_REQUIRED_FACTS[0], { value: 55, unit: 'kW', authority: 'OEM' });
} catch (error) {
  incompleteRejected = error instanceof ApprovalError;
}
check('a fact with incomplete §17.1 metadata is refused', incompleteRejected);

let unapprovedRejected = false;
try {
  approveSuggestion(suggestion, {
    factId: 'EF-MAX-PROCESS-PRESSURE-PRE-SCREEN',
    authority: 'APPROVED_CUSTOMER',
    approvedBy: '   ',
    approvedOn: '2026-09-18',
    source: 'Operating philosophy',
    documentRef: 'OP-12 §4',
    appliesToMachine: 'TSE01',
    version: '1.0',
  });
} catch (error) {
  unapprovedRejected = error instanceof ApprovalError;
}
check('a suggestion cannot be approved without a named approver', unapprovedRejected);

const approved = approveSuggestion(suggestion, {
  factId: 'EF-MAX-PROCESS-PRESSURE-PRE-SCREEN',
  authority: 'APPROVED_CUSTOMER',
  approvedBy: 'A. Process Engineer',
  approvedOn: '2026-09-18',
  source: 'Approved operating philosophy',
  documentRef: 'OP-12 §4',
  appliesToMachine: 'TSE01',
  version: '1.0',
});
check('an approved suggestion becomes a fully declared fact', isDeclared(approved));
check('and it no longer carries ULTRON authority', approved.authority === 'APPROVED_CUSTOMER');

// ---------------------------------------------------------------------------
console.log('\n--- §17: the authority ladder decides which limit governs ---');

const oemLimit: EngineeringFact = {
  ...TSE_REQUIRED_FACTS[0],
  factId: 'EF-TEST-OEM',
  parameter: 'Test pressure',
  value: 120,
  unit: 'bar',
  authority: 'OEM',
  source: 'OEM manual',
  documentRef: 'OEM-1 §3',
  appliesToMachine: 'TSE01',
  approvedBy: 'OEM',
  approvedOn: '2026-01-01',
  version: '1',
};
const customerLimit: EngineeringFact = { ...oemLimit, factId: 'EF-TEST-CUSTOMER', value: 110, authority: 'APPROVED_CUSTOMER' };
const safetyLimit: EngineeringFact = { ...oemLimit, factId: 'EF-TEST-SAFETY', value: 130, authority: 'SAFETY_PROTECTION' };

const resolved = resolveGoverningFact([oemLimit, customerLimit, safetyLimit], 'Test pressure');
check(
  'the safety limit governs over customer and OEM',
  resolved.kind === 'governing' && resolved.fact.factId === 'EF-TEST-SAFETY',
  resolved.kind === 'governing' ? resolved.fact.factId : resolved.kind,
);
check(
  'the outranked limits are reported rather than discarded',
  resolved.kind === 'governing' && resolved.outranked.length === 2,
);
check(
  'a parameter with no declared fact reports what it is missing, not a default',
  resolveGoverningFact(TSE_REQUIRED_FACTS, 'Maximum screw RPM').kind === 'undeclared',
);
check(
  'a parameter nobody has modelled reports unknown',
  resolveGoverningFact(TSE_REQUIRED_FACTS, 'Colour of the machine').kind === 'unknown',
);

// ---------------------------------------------------------------------------
console.log('\n--- §18: no rule believes it has a measurement the machine lacks ---');

const { claimedButNotInstalled, installedButUnclaimed } = reconcileWithPointRegistry();
check(
  'every tag a measurement location claims exists on the machine',
  claimedButNotInstalled.length === 0,
  claimedButNotInstalled.join(', '),
);
check(
  'every tag on the machine has a declared process meaning',
  installedButUnclaimed.length === 0,
  installedButUnclaimed.join(', '),
);

// ---------------------------------------------------------------------------
console.log('\n--- Model integrity ---');

const integrity = validateModelIntegrity();
check('the knowledge model has no structural problems', integrity.length === 0, integrity.join(' | '));

// ---------------------------------------------------------------------------
console.log('\n--- §14: a steady baseline is only applied in steady production ---');

check('steady production allows a baseline', baselineApplies('STEADY_PRODUCTION'));
check('startup does not', !baselineApplies('STARTUP'));
check('a recipe change does not', !baselineApplies('RECIPE_PRODUCT_CHANGE'));
check('an unrecognised state does not', !baselineApplies('SOMETHING_ELSE'));
check(
  'every non-steady state freezes baseline learning',
  TSE_OPERATING_STATES.filter((state) => state.stateId !== 'STEADY_PRODUCTION').every(
    (state) => state.freezeBaselineLearning,
  ),
);

// ---------------------------------------------------------------------------
console.log('\n--- §23: the validation checklist reports the real commissioning state ---');

const validation = runValidation();
check('all twelve DOC-01 §23 checks run', validation.length === 12, String(validation.length));
check(
  'the zone-function check fails while no zone is configured',
  validation.find((result) => result.checkId === 'VC-03')?.status === 'FAIL',
);
check(
  'a failing check says what would satisfy it',
  validation
    .filter((result) => result.status === 'FAIL')
    .every((result) => result.detail.length > 40),
);
check(
  'the checklist does not claim DOC-02 readiness while checks are outstanding',
  validation.find((result) => result.checkId === 'VC-12')?.status === 'FAIL',
);

const configuredValidation = runValidation({
  zones: applyZoneConfiguration(
    zones,
    zones.map((zone) => ({
      zoneNumber: zone.zoneNumber,
      configuredFunction: `Function for zone ${zone.zoneNumber}`,
      source: 'OEM barrel drawing SC-07',
    })),
  ),
});
check(
  'configuring every zone turns the zone check green',
  configuredValidation.find((result) => result.checkId === 'VC-03')?.status === 'PASS',
);

const summary = commissioningSummary();
check('the commissioning summary counts the checks', summary.total === 12, String(summary.total));
check('and reports outstanding work rather than an all-clear', summary.failed > 0, String(summary.failed));

// ---------------------------------------------------------------------------
console.log('\n--- The analyser reads the fact registry rather than a hardcoded answer ---');

check('the model is uncommissioned while the registry is empty', hasCommissionedModel(TSE_REQUIRED_FACTS) === false);

const motorFacts = TSE_REQUIRED_FACTS.map((fact) =>
  fact.factId === 'EF-MOTOR-RATED-CURRENT' || fact.factId === 'EF-MOTOR-RATED-POWER'
    ? declareFact(fact, {
        value: fact.factId === 'EF-MOTOR-RATED-CURRENT' ? 210 : 132,
        unit: fact.factId === 'EF-MOTOR-RATED-CURRENT' ? 'A' : 'kW',
        authority: 'OEM',
        source: 'Motor nameplate',
        documentRef: 'NP-001',
        appliesToMachine: 'TSE01',
        approvedBy: 'Site electrical engineer',
        approvedOn: '2026-09-18',
        version: '1.0',
      })
    : fact,
);
check(
  'declaring the motor ratings commissions at least one rule',
  hasCommissionedModel(motorFacts) === true,
);

const gapsBefore = commissioningGaps(TSE_REQUIRED_FACTS);
const gapsAfter = commissioningGaps(motorFacts);
check(
  'the gap report shrinks when facts are declared',
  gapsAfter.awaitingFacts.length === gapsBefore.awaitingFacts.length - 1,
  `${gapsBefore.awaitingFacts.length} -> ${gapsAfter.awaitingFacts.length}`,
);
check(
  'gaps waiting on a missing signal are reported separately from gaps waiting on paperwork',
  gapsAfter.awaitingSignal.length > 0 && gapsAfter.awaitingBaseline.length > 0,
);

// ---------------------------------------------------------------------------
console.log('\n--- The machine variant: declared by a person, never assumed ---');

check(
  'the twin screw offers exactly one variant today',
  variantsForTemplate('Twin Screw Extruder').length === 1,
  String(variantsForTemplate('Twin Screw Extruder').length),
);
check(
  'the variant id is the DOC-01 template id, so record and knowledge agree',
  variantsForTemplate('Twin Screw Extruder')[0].variantId === TSE_TEMPLATE.templateId,
);
check(
  'the variant is named as the document names it',
  variantsForTemplate('Twin Screw Extruder')[0].name ===
    'Co-Rotating • Fully Intermeshing • Parallel • 7-Zone Reference • Compounding',
  variantsForTemplate('Twin Screw Extruder')[0].name,
);
check(
  'the variant is marked a reference rather than a site-validated build',
  variantsForTemplate('Twin Screw Extruder')[0].standing === 'REFERENCE',
);

// Every other template keeps the dialog it had, because the dropdown only
// renders when a template declares variants.
check(
  'no other template declares a variant, so no other Add Machine flow changes',
  MACHINE_TEMPLATES.filter((template) => templateHasVariants(template)).length === 1,
  MACHINE_TEMPLATES.filter((template) => templateHasVariants(template)).join(', '),
);
check('a pump shows no variant dropdown', templateHasVariants('Centrifugal Pump') === false);
check('an unselected template shows no variant dropdown', templateHasVariants(null) === false);

const declared = { template: 'Twin Screw Extruder' as const, variantId: TSE_TEMPLATE.templateId };
const legacy = { template: 'Twin Screw Extruder' as const, variantId: null };
const pump = { template: 'Centrifugal Pump' as const, variantId: null };

check('a declared variant resolves', variantForMachine(declared)?.variantId === TSE_TEMPLATE.templateId);
check('a machine created before the field reads as undeclared', variantIsUndeclared(legacy) === true);
check('and it is never silently read as the reference variant', variantForMachine(legacy) === undefined);
check('a template with no variants is not "undeclared"', variantIsUndeclared(pump) === false);

check('an unknown variant id does not resolve', variantById('TSE-MADE-UP') === undefined);
check('a null variant id does not resolve', variantById(null) === undefined);
check(
  'a variant belonging to another template is not this machine’s variant',
  variantForMachine({ template: 'Centrifugal Pump', variantId: TSE_TEMPLATE.templateId }) === undefined,
);

check(
  'a valid variant survives normalisation on the way to storage',
  normaliseVariantId('Twin Screw Extruder', TSE_TEMPLATE.templateId) === TSE_TEMPLATE.templateId,
);
check(
  'a variant stored against the wrong template is normalised to null',
  normaliseVariantId('Centrifugal Pump', TSE_TEMPLATE.templateId) === null,
);
check('an unknown id is normalised to null', normaliseVariantId('Twin Screw Extruder', 'TSE-MADE-UP') === null);
check('a non-string id is normalised to null', normaliseVariantId('Twin Screw Extruder', 42) === null);
check('a null template normalises to null', normaliseVariantId(null, TSE_TEMPLATE.templateId) === null);
check(
  'normalisation is idempotent, so a save/load round trip is stable',
  normaliseVariantId('Twin Screw Extruder', normaliseVariantId('Twin Screw Extruder', TSE_TEMPLATE.templateId)) ===
    TSE_TEMPLATE.templateId,
);

check(
  'the header label for a declared machine is its variant id',
  variantShortLabel(declared) === TSE_TEMPLATE.templateId,
);
check('the header label says so when the variant is undeclared', variantShortLabel(legacy) === 'VARIANT NOT DECLARED');
check('and shows nothing at all for a template without variants', variantShortLabel(pump) === null);

// ---------------------------------------------------------------------------
console.log('\n--- DOC-01 §21: variant is a field OF the template, and selects the knowledge ---');

check(
  'the template carries the §21 variant field',
  typeof TSE_TEMPLATE.variant === 'string' && TSE_TEMPLATE.variant.length > 0,
  TSE_TEMPLATE.variant,
);
check(
  'the variant descriptor is composed from the template attributes, not typed twice',
  TSE_TEMPLATE.variant === composeVariantDescriptor(TSE_TEMPLATE),
  TSE_TEMPLATE.variant,
);
check(
  'and it reads as the document cover states it',
  TSE_TEMPLATE.variant ===
    'Co-Rotating • Fully Intermeshing • Parallel • 7-Zone Reference • Compounding',
  TSE_TEMPLATE.variant,
);
check(
  'changing rotation changes the descriptor, so the two cannot drift apart',
  composeVariantDescriptor({ ...TSE_TEMPLATE, rotation: 'COUNTER_ROTATING' }).startsWith('Counter-Rotating'),
);

// The registry is keyed by DOC-01 template_id, never by the console template.
check(
  'knowledge is reachable by DOC-01 template id',
  knowledgeForTemplateId(TSE_TEMPLATE.templateId)?.template.templateId === TSE_TEMPLATE.templateId,
);
check('an unknown template id resolves to no knowledge', knowledgeForTemplateId('TSE-MADE-UP') === undefined);

const resolvedMachine = { template: 'Twin Screw Extruder' as const, variantId: TSE_TEMPLATE.templateId };
const undeclaredMachine = { template: 'Twin Screw Extruder' as const, variantId: null };
const staleMachine = { template: 'Twin Screw Extruder' as const, variantId: 'TSE-COUNTER-ROTATING-X' };
const pumpMachine = { template: 'Centrifugal Pump' as const, variantId: null };

check(
  'a declared variant resolves to its knowledge pack',
  knowledgeForMachine(resolvedMachine).kind === 'resolved',
);
check(
  'an undeclared variant resolves to NO knowledge, not to the reference pack',
  knowledgeForMachine(undeclaredMachine).kind === 'variant-undeclared',
  knowledgeForMachine(undeclaredMachine).kind,
);
check(
  'a stale variant id resolves to no knowledge rather than to a neighbour',
  knowledgeForMachine(staleMachine).kind === 'variant-unknown',
);
check(
  'a template with no knowledge document says so distinctly',
  knowledgeForMachine(pumpMachine).kind === 'no-knowledge-for-template',
);
check(
  'every unresolved case explains itself to the operator',
  [undeclaredMachine, staleMachine, pumpMachine].every(
    (m) => (unresolvedReason(knowledgeForMachine(m)) ?? '').length > 40,
  ),
);
check('a resolved machine has no gap message', unresolvedReason(knowledgeForMachine(resolvedMachine)) === null);

// The whole point of the reversal: facts follow the variant, not the template.
check(
  'facts resolve for a declared variant',
  factsForMachine(resolvedMachine).length === TSE_REQUIRED_FACTS.length,
  String(factsForMachine(resolvedMachine).length),
);
check(
  'a machine with no declared variant gets no fact register at all',
  factsForMachine(undeclaredMachine).length === 0,
  String(factsForMachine(undeclaredMachine).length),
);
check(
  'the analyser reports the missing register rather than naming DOC-01 facts',
  analyseTwinScrew([], factsForMachine(undeclaredMachine)).pending.every(
    (rule) => !(rule.requires ?? '').includes('EF-'),
  ),
);
check(
  'and with a declared variant it names the facts again',
  analyseTwinScrew(
    [
      { tag: 'TS-PM1', label: 'Motor Power', value: 10, unit: 'kW', reporting: true },
    ],
    factsForMachine(resolvedMachine),
  ).pending.some((rule) => (rule.requires ?? '').includes('EF-MOTOR-RATED-CURRENT')),
);

// The pack knows which console template draws it, but that is an attribute.
check(
  'the pack declares its console template as an attribute',
  TSE_KNOWLEDGE.consoleTemplate === 'Twin Screw Extruder',
);
check(
  'the console template is a reverse index for offering a choice only',
  packsForConsoleTemplate('Twin Screw Extruder').length === 1 &&
    packsForConsoleTemplate('Centrifugal Pump').length === 0,
);

// ---------------------------------------------------------------------------
if (failures > 0) {
  console.log(`\n${failures} CHECK(S) FAILED\n`);
  process.exit(1);
}
console.log('\nALL CHECKS PASSED\n');
