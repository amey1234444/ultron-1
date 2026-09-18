/**
 * The cause-effect and topology graph (DOC-01 §13, §13.1, §19).
 *
 * DOC-01 opens §13 with a warning that governs this whole file: "These
 * relationships are not alarm rules. They are engineering priors that help
 * DOC-04 distinguish an expected process response from an abnormal
 * relationship."
 *
 * Three consequences are built into the data rather than left to discipline:
 *
 *  1. `strength` preserves DOC-01's own three grades. The source table writes
 *     "↑", "Usually ↑" and "May ↑", and those are different claims. Feed rate
 *     raising screw fill is EXPECTED. Feed rate raising torque is USUAL. Feed
 *     rate raising pressure is POSSIBLE, because it depends on fill, viscosity
 *     and downstream resistance. Flattening the three would turn a hint into a
 *     rule.
 *
 *  2. `conditions` is mandatory on every process relationship, and
 *     `validateRelationships` fails the build of the graph if one is empty.
 *     DOC-01 marks the Conditions/Cautions column mandatory for a reason: none
 *     of these directions holds unconditionally.
 *
 *  3. The governance predicates are first-class. A recipe change invalidating a
 *     baseline is as much a part of this graph as the motor driving the
 *     gearbox, and it is the relationship that stops a legitimate context
 *     change being diagnosed as a fault.
 */

import type { ChangeDirection, ExpectationStrength, Predicate, RelationshipDefinition } from './types';
import { PREDICATE_KIND } from './types';

const DOC = 'ULTRON-TSE-DOC-01 v1.0';
const TSE = 'TSE_SPECIFIC' as const;
const COMMON = 'COMMON' as const;

let sequence = 0;
const nextId = (prefix: string): string => {
  sequence += 1;
  return `${prefix}-${String(sequence).padStart(3, '0')}`;
};

const topology = (
  subject: string,
  predicate: Predicate,
  object: string,
  purpose: string,
  knowledgeClass: RelationshipDefinition['knowledgeClass'] = TSE,
): RelationshipDefinition => ({
  relationshipId: nextId('REL-TOP'),
  subject,
  predicate,
  object,
  conditions: [],
  purpose,
  source: `${DOC} §13.1, §19`,
  knowledgeClass,
});

const prior = (
  subject: string,
  changeDirection: ChangeDirection,
  predicate: Extract<Predicate, 'INCREASES' | 'DECREASES' | 'AFFECTS'>,
  object: string,
  strength: ExpectationStrength,
  conditions: string[],
  knowledgeClass: RelationshipDefinition['knowledgeClass'] = TSE,
): RelationshipDefinition => ({
  relationshipId: nextId('REL-PRI'),
  subject,
  predicate,
  object,
  changeDirection,
  strength,
  conditions,
  purpose: 'Engineering prior separating an expected process response from an abnormal relationship.',
  source: `${DOC} §13`,
  knowledgeClass,
});

const governance = (
  subject: string,
  predicate: Extract<Predicate, 'CHANGES_CONTEXT_FOR' | 'INVALIDATES_BASELINE' | 'REQUIRES_VERSION_CHANGE'>,
  object: string,
  conditions: string[],
  purpose: string,
): RelationshipDefinition => ({
  relationshipId: nextId('REL-GOV'),
  subject,
  predicate,
  object,
  conditions,
  purpose,
  source: `${DOC} §13, §19`,
  knowledgeClass: TSE,
});

/* Topology — DOC-01 §13.1 and §19 --------------------------------------------- */

const TOPOLOGY: RelationshipDefinition[] = [
  topology('DRV.MOTOR', 'DRIVES', 'DRV.COUPLING', 'Mechanical power path.', COMMON),
  topology('DRV.COUPLING', 'DRIVES', 'DRV.GEARBOX', 'Mechanical power path.', COMMON),
  topology('DRV.GEARBOX', 'DRIVES', 'PROC.SCREW_A', 'Mechanical power path.'),
  topology('DRV.GEARBOX', 'DRIVES', 'PROC.SCREW_B', 'Mechanical power path.'),
  topology('DRV.VFD', 'DRIVES', 'DRV.MOTOR', 'Speed and torque control path.', COMMON),

  topology('FEED.MAIN', 'FEEDS', 'FEED.THROAT', 'Material path.'),
  topology('FEED.THROAT', 'FEEDS', 'PROC.BARREL', 'Material path.'),
  topology('FEED.SIDE', 'FEEDS', 'PROC.BARREL', 'Material path into the configured downstream zone.'),

  topology('THERM.HEAT', 'HEATS', 'PROC.BARREL', 'Thermal path.', COMMON),
  topology('THERM.COOL', 'COOLS', 'PROC.BARREL', 'Thermal path.', COMMON),

  topology('TS-P3', 'MEASURES', 'PAR-MELT-PRESSURE', 'Instrumentation topology.'),
  topology('TS-P4', 'MEASURES', 'PAR-MELT-PRESSURE', 'Instrumentation topology.'),
  topology('TS-P3', 'LOCATED_AT', 'ML-PRE-SCREEN', 'Localisation.'),
  topology('TS-P4', 'LOCATED_AT', 'ML-POST-SCREEN', 'Localisation.'),

  topology('ML-PRE-SCREEN', 'UPSTREAM_OF', 'DOWN.SCREEN', 'Process topology.'),
  topology('ML-POST-SCREEN', 'DOWNSTREAM_OF', 'DOWN.SCREEN', 'Process topology.'),
  topology('DOWN.SCREEN', 'UPSTREAM_OF', 'DOWN.DIE', 'Process topology.'),

  topology(
    'PROC.BARREL',
    'CONFIGURED_BY',
    'ConfigurationVersion.screwConfigurationRef',
    'Zone function comes from the screw and barrel configuration version, never from zone number.',
  ),
];

/* Process priors — DOC-01 §13 -------------------------------------------------- */

const PRIORS: RelationshipDefinition[] = [
  prior('PAR-MAIN-FEED-RATE', 'INCREASE', 'INCREASES', 'Screw fill', 'EXPECTED', [
    'Same screw RPM and material.',
    'Holds until intake or process capacity effects dominate.',
  ]),
  prior('PAR-MAIN-FEED-RATE', 'INCREASE', 'INCREASES', 'PAR-TORQUE', 'USUAL', [
    'Same recipe and screw RPM.',
    'Process otherwise stable.',
  ]),
  prior('PAR-MAIN-FEED-RATE', 'INCREASE', 'INCREASES', 'PAR-THROUGHPUT', 'USUAL', [
    'Only if machine and downstream capacity allow.',
  ]),
  prior('PAR-MAIN-FEED-RATE', 'INCREASE', 'INCREASES', 'PAR-MELT-PRESSURE', 'POSSIBLE', [
    'Depends on screw fill, viscosity and downstream resistance.',
  ]),

  prior('PAR-SCREW-RPM', 'INCREASE', 'INCREASES', 'Shear and mixing frequency', 'EXPECTED', [
    'The resulting energy input depends on fill, torque and screw design.',
  ]),
  prior('PAR-SCREW-RPM', 'INCREASE', 'DECREASES', 'Mean residence time', 'USUAL', [
    'For otherwise comparable feeding and context.',
    'Process-specific; a starve-fed machine behaves differently from a flood-fed one.',
  ]),
  prior('PAR-SCREW-RPM', 'INCREASE', 'INCREASES', 'Mechanical heat generation', 'POSSIBLE', [
    'Depends strongly on torque, fill and screw configuration.',
  ]),

  prior('Material viscosity', 'INCREASE', 'INCREASES', 'PAR-TORQUE', 'EXPECTED', [
    'Comparable feed rate, screw RPM and screw configuration.',
  ]),
  prior('Material viscosity', 'INCREASE', 'INCREASES', 'PAR-MELT-PRESSURE', 'EXPECTED', [
    'Comparable throughput and downstream geometry.',
  ]),

  prior('PAR-MELT-TEMP', 'DECREASE', 'INCREASES', 'Material viscosity', 'USUAL', [
    'Polymer and material dependent.',
  ]),
  prior('PAR-MELT-TEMP', 'DECREASE', 'INCREASES', 'PAR-TORQUE', 'POSSIBLE', [
    'Only if viscosity rises and the context is otherwise unchanged.',
  ]),

  prior('Downstream restriction', 'INCREASE', 'INCREASES', 'PAR-MELT-PRESSURE', 'EXPECTED', [
    'The measurement point must be upstream of the restriction.',
  ]),
  prior('Screen restriction', 'INCREASE', 'INCREASES', 'PAR-PRESSURE-DIFFERENTIAL', 'EXPECTED', [
    'Requires valid pre-screen and post-screen pressure taps.',
  ]),
  prior('Downstream restriction', 'INCREASE', 'INCREASES', 'PAR-MOTOR-CURRENT', 'POSSIBLE', [
    'Only if the screws must generate greater pumping pressure and load.',
  ]),

  prior('Cooling effectiveness', 'DEGRADE', 'INCREASES', 'PAR-ZONE-ACTUAL-TEMP', 'POSSIBLE', [
    'Depends on process heat and heater output.',
  ], COMMON),
  prior('Mechanical shear energy', 'INCREASE', 'INCREASES', 'PAR-MELT-TEMP', 'POSSIBLE', [
    'Thermal response depends on the material and on cooling.',
  ]),
  prior('Vacuum performance', 'DEGRADE', 'DECREASES', 'Residual moisture and volatile removal', 'EXPECTED', [
    'Only if venting or devolatilisation is relevant to the recipe and process.',
  ]),

  prior('Feed instability', 'INCREASE', 'INCREASES', 'Torque variability', 'USUAL', [
    'A time lag may exist between the feeder disturbance and the load response.',
  ]),
  prior('Feed instability', 'INCREASE', 'INCREASES', 'Pressure variability', 'USUAL', [
    'Downstream lag depends on residence and transport time.',
  ]),

  prior('Gearbox process load', 'INCREASE', 'INCREASES', 'PAR-GEARBOX-OIL-TEMP', 'POSSIBLE', [
    'Thermal inertia and cooling create a delay, so the response is not immediate.',
  ], COMMON),
  prior('PAR-TORQUE', 'INCREASE', 'INCREASES', 'PAR-MOTOR-CURRENT', 'USUAL', [
    'The relationship depends on the motor and VFD operating point and on speed.',
  ], COMMON),
  prior('PAR-ACTIVE-POWER', 'INCREASE', 'INCREASES', 'Specific energy', 'EXPECTED', [
    'Only if throughput is constant.',
    'Specific energy falls instead if throughput rises proportionally.',
  ]),
];

/* Governance — DOC-01 §13, §19 ------------------------------------------------- */

const GOVERNANCE: RelationshipDefinition[] = [
  governance(
    'PAR-RECIPE',
    'CHANGES_CONTEXT_FOR',
    'Normal torque, pressure and energy',
    ['A change in recipe viscosity or filler level is a context change, not automatically a fault.'],
    'Prevents a legitimate formulation change from being diagnosed as a deviation.',
  ),
  governance(
    'PAR-RECIPE',
    'INVALIDATES_BASELINE',
    'Contextual baseline',
    ['The correct baseline must be selected or learned for the new context before a fault is diagnosed.'],
    'Baseline switching on recipe change.',
  ),
  governance(
    'Die or screen configuration change',
    'INVALIDATES_BASELINE',
    'Normal pressure baseline',
    ['Requires a baseline and configuration version update before pressure findings resume.'],
    'Downstream geometry sets the normal pressure, so changing it changes what normal means.',
  ),
  governance(
    'Screw configuration change',
    'REQUIRES_VERSION_CHANGE',
    'ConfigurationVersion',
    ['Pressure, torque and energy relationships all change; the previous baseline may become invalid.'],
    'Ties analytics lineage to the physical geometry that produced it.',
  ),
  governance(
    'PAR-MAIN-FEED-RATE',
    'CHANGES_CONTEXT_FOR',
    'Torque, pressure and energy baseline',
    ['A commanded feed change is an operating-point move, not a deviation from one.'],
    'Context relationship.',
  ),
];

export const TSE_RELATIONSHIPS: readonly RelationshipDefinition[] = [...TOPOLOGY, ...PRIORS, ...GOVERNANCE];

export function relationshipsFrom(subject: string): RelationshipDefinition[] {
  return TSE_RELATIONSHIPS.filter((relationship) => relationship.subject === subject);
}

export function relationshipsTo(object: string): RelationshipDefinition[] {
  return TSE_RELATIONSHIPS.filter((relationship) => relationship.object === object);
}

export function relationshipsByPredicate(predicate: Predicate): RelationshipDefinition[] {
  return TSE_RELATIONSHIPS.filter((relationship) => relationship.predicate === predicate);
}

/**
 * What could explain an observed change in `object`.
 *
 * Returns the priors pointing at it, strongest expectation first, so a
 * diagnosis layer can enumerate candidate causes with their qualifiers attached
 * rather than reasoning from a bare correlation. This is a retrieval helper,
 * not a diagnosis: it says what DOC-01 considers possible, and says under what
 * conditions, and stops there.
 */
export function candidateCausesFor(object: string): RelationshipDefinition[] {
  const order: Record<ExpectationStrength, number> = { EXPECTED: 0, USUAL: 1, POSSIBLE: 2 };
  return TSE_RELATIONSHIPS.filter(
    (relationship) => relationship.object === object && PREDICATE_KIND[relationship.predicate] === 'process',
  ).sort((a, b) => order[a.strength ?? 'POSSIBLE'] - order[b.strength ?? 'POSSIBLE']);
}

/**
 * Graph integrity problems. Empty is the healthy result.
 *
 * The condition check is the one that matters: DOC-01 makes the
 * Conditions/Cautions column mandatory, and a prior that lost its qualifier on
 * the way into code is a rule masquerading as a prior.
 */
export function validateRelationships(): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();

  for (const relationship of TSE_RELATIONSHIPS) {
    if (ids.has(relationship.relationshipId)) {
      problems.push(`Duplicate relationship id ${relationship.relationshipId}.`);
    }
    ids.add(relationship.relationshipId);

    const kind = PREDICATE_KIND[relationship.predicate];

    if (kind === 'process') {
      if (relationship.conditions.length === 0) {
        problems.push(
          `${relationship.relationshipId} (${relationship.subject} ${relationship.predicate} ${relationship.object}) has no conditions. DOC-01 §13 makes the Conditions/Cautions column mandatory, because every directional effect in it is conditional.`,
        );
      }
      if (!relationship.strength) {
        problems.push(
          `${relationship.relationshipId} has no expectation strength. DOC-01 distinguishes an expected effect from a usual one and from a possible one, and the three are different claims.`,
        );
      }
      if (!relationship.changeDirection) {
        problems.push(`${relationship.relationshipId} has no change direction, so it does not say how the cause moved.`);
      }
    }

    if (kind === 'governance' && relationship.conditions.length === 0) {
      problems.push(`${relationship.relationshipId} is a governance relationship with no stated consequence conditions.`);
    }
  }

  return problems;
}

/** DOC-01 §19 triples, flattened for a graph store or an LLM context. */
export function asTriples(): { subject: string; predicate: string; object: string; conditions: string[] }[] {
  return TSE_RELATIONSHIPS.map((relationship) => ({
    subject: relationship.subject,
    predicate: relationship.predicate,
    object: relationship.object,
    conditions: relationship.conditions,
  }));
}
