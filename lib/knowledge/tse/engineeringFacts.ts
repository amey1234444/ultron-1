/**
 * Engineering facts, ratings and the authority model (DOC-01 §16, §17, §17.1).
 *
 * This is the file that makes DOC-01's NON-OVERRIDE RULE enforceable instead of
 * aspirational:
 *
 *   "ULTRON may calculate baselines, anomalies and suggested limits, but it
 *    must not silently replace an approved customer, OEM, safety or protection
 *    limit. Suggested values remain separate until explicitly reviewed and
 *    approved."
 *
 * It is enforced structurally rather than by convention. An ULTRON-calculated
 * number cannot enter the fact registry at all: `proposeSuggestion` returns a
 * `SuggestedLimit`, which is a different type, and the only route from a
 * suggestion to a fact is `approveSuggestion`, which demands a human approver,
 * a document reference and an authority that is not ULTRON_ANALYTICS. There is
 * no code path that promotes a suggestion on its own.
 *
 * Every fact in `TSE_REQUIRED_FACTS` ships undeclared. DOC-01 §16 is explicit
 * that it "defines which machine facts must be captured. It does not invent
 * their numerical values", and §20 classes all of them MACHINE_SPECIFIC —
 * validated at deployment from OEM, customer or site information. A shipped
 * default here would be a number with no authority behind it that later looks
 * exactly like one that was approved.
 */

import type { Authority, EngineeringFact, ValueType } from './types';
import { authorityRank } from './types';

const MACHINE = 'MACHINE_SPECIFIC' as const;

/** An undeclared fact slot: identified as required, not yet collected. */
function required(
  factId: string,
  parameter: string,
  valueType: ValueType,
  authoritativeSource: string,
  whyCaptured: string,
): EngineeringFact {
  return {
    factId,
    parameter,
    valueType,
    value: null,
    unit: null,
    authority: null,
    source: null,
    documentRef: null,
    appliesToMachine: null,
    appliesToConfiguration: null,
    appliesToState: null,
    appliesToRecipe: null,
    approvedBy: null,
    approvedOn: null,
    version: null,
    effectiveFrom: null,
    authoritativeSource,
    whyCaptured,
    knowledgeClass: MACHINE,
  };
}

/**
 * The facts DOC-01 §16 says must be captured for this machine.
 *
 * Read as a data-collection register rather than as a limit table. Nothing here
 * has a value, and `validation.ts` turns the undeclared ones into the
 * commissioning checklist of §22 and §23.
 */
export const TSE_REQUIRED_FACTS: readonly EngineeringFact[] = [
  required(
    'EF-MOTOR-RATED-POWER',
    'Main motor rated power',
    'ENGINEERING_RATING',
    'Nameplate / VFD / OEM',
    'Equipment capability and load normalisation.',
  ),
  required(
    'EF-MOTOR-RATED-CURRENT',
    'Main motor rated current',
    'ENGINEERING_RATING',
    'Nameplate / VFD / OEM',
    'Equipment capability and load normalisation.',
  ),
  required(
    'EF-MOTOR-RATED-SPEED',
    'Main motor rated speed',
    'ENGINEERING_RATING',
    'Nameplate / VFD / OEM',
    'Equipment capability and load normalisation.',
  ),
  required(
    'EF-GEARBOX-ALLOWABLE-TORQUE',
    'Gearbox allowable torque',
    'ENGINEERING_RATING',
    'OEM',
    'Mechanical capability and protection context.',
  ),
  required(
    'EF-GEARBOX-OIL-TEMP-GUIDANCE',
    'Gearbox oil temperature guidance',
    'ENGINEERING_RATING',
    'OEM',
    'Mechanical capability and protection context.',
  ),
  required('EF-MAX-SCREW-RPM', 'Maximum screw RPM', 'ENGINEERING_RATING', 'OEM', 'Equipment operating constraint.'),
  required(
    'EF-SCREW-GEOMETRY',
    'Screw diameter, L:D and centreline geometry',
    'ENGINEERING_RATING',
    'OEM drawing / manual',
    'Machine identity and process configuration.',
  ),
  required(
    'EF-BARREL-ZONE-TEMP-CAPABILITY',
    'Barrel-zone temperature capability',
    'ENGINEERING_RATING',
    'OEM / heater and control design',
    'Equipment capability. Not automatically the process setpoint.',
  ),
  required(
    'EF-MAX-PROCESS-PRESSURE-PRE-SCREEN',
    'Maximum allowable melt pressure - pre-screen',
    'ENGINEERING_RATING',
    'OEM / design / approved plant engineering',
    'Critical engineering and safety boundary.',
  ),
  required(
    'EF-MAX-PROCESS-PRESSURE-POST-SCREEN',
    'Maximum allowable melt pressure - post-screen',
    'ENGINEERING_RATING',
    'OEM / design / approved plant engineering',
    'Critical engineering and safety boundary.',
  ),
  required(
    'EF-FEEDER-CAPACITY-MAIN',
    'Main feeder capacity and range',
    'ENGINEERING_RATING',
    'Feeder OEM',
    'Defines the usable feed operating envelope.',
  ),
  required(
    'EF-FEEDER-CAPACITY-SIDE',
    'Side feeder capacity and range',
    'ENGINEERING_RATING',
    'Feeder OEM',
    'Defines the usable feed operating envelope.',
  ),
  required(
    'EF-VACUUM-CAPABILITY',
    'Vacuum system capability',
    'ENGINEERING_RATING',
    'Vacuum OEM / process design',
    'Defines the realistic devolatilisation operating range.',
  ),
  required(
    'EF-COOLING-UTILITY-DESIGN',
    'Cooling utility design',
    'ENGINEERING_RATING',
    'Plant / OEM',
    'Thermal-control capability.',
  ),
  required(
    'EF-SCREEN-DIE-PRESSURE-RATING',
    'Screen and die pressure rating',
    'ENGINEERING_RATING',
    'OEM / process design',
    'Downstream mechanical and safety constraint.',
  ),
  required(
    'EF-SENSOR-CALIBRATED-RANGES',
    'Sensor calibrated range, accuracy and location',
    'ENGINEERING_RATING',
    'Instrument datasheet + site configuration',
    'Valid interpretation of every measured value.',
  ),
] as const;

/** The §17.1 metadata fields a fact must carry before it may govern anything. */
const REQUIRED_METADATA: readonly (keyof EngineeringFact)[] = [
  'value',
  'unit',
  'authority',
  'source',
  'documentRef',
  'appliesToMachine',
  'approvedBy',
  'approvedOn',
  'version',
] as const;

/** Which §17.1 fields a fact is still missing. Empty means it is declared. */
export function missingMetadata(fact: EngineeringFact): string[] {
  return REQUIRED_METADATA.filter((field) => {
    const value = fact[field];
    return value === null || value === undefined || value === '';
  }).map(String);
}

/** Whether a fact carries the complete §17.1 metadata set. */
export function isDeclared(fact: EngineeringFact): boolean {
  return missingMetadata(fact).length === 0;
}

export function declaredFacts(facts: readonly EngineeringFact[]): EngineeringFact[] {
  return facts.filter(isDeclared);
}

export function undeclaredFacts(facts: readonly EngineeringFact[]): EngineeringFact[] {
  return facts.filter((fact) => !isDeclared(fact));
}

/* Resolution ---------------------------------------------------------------- */

export type FactContext = {
  /** Restrict to facts for this machine, when set. */
  machine?: string;
  /** Restrict to facts for this configuration version, when set. */
  configuration?: string;
  /** Restrict to facts applicable in this operating state, when set. */
  state?: string;
  /** Restrict to facts applicable to this recipe, when set. */
  recipe?: string;
};

export type FactResolution =
  | {
      kind: 'governing';
      fact: EngineeringFact;
      /** Declared facts for the same parameter that this one outranks. */
      outranked: EngineeringFact[];
    }
  | {
      kind: 'undeclared';
      parameter: string;
      /** Which §17.1 fields each candidate is missing. */
      missing: { factId: string; fields: string[] }[];
    }
  | { kind: 'unknown'; parameter: string };

/** A fact applies in a context when it either says nothing about it or matches. */
function appliesIn(fact: EngineeringFact, context: FactContext): boolean {
  const matches = (declared: string | null, asked: string | undefined): boolean =>
    declared === null || asked === undefined || declared === asked;
  return (
    matches(fact.appliesToMachine, context.machine) &&
    matches(fact.appliesToConfiguration, context.configuration) &&
    matches(fact.appliesToState, context.state) &&
    matches(fact.appliesToRecipe, context.recipe)
  );
}

/**
 * Which fact governs a parameter, and what it outranks.
 *
 * The authority ladder decides, not recency and not specificity: a safety or
 * protection limit outranks an approved customer limit, which outranks an OEM
 * rating, which outranks approved engineering, which outranks anything ULTRON
 * calculated. `outranked` is returned rather than discarded so a UI can show an
 * engineer that a lower-authority value exists and is being deferred — the rule
 * is that a learned value may not *replace* an approved one, not that it must
 * be hidden.
 *
 * `valueType` narrows the question: the Danger limit and the Trip limit for the
 * same parameter are different values and are resolved separately.
 */
export function resolveGoverningFact(
  facts: readonly EngineeringFact[],
  parameter: string,
  options: FactContext & { valueType?: ValueType } = {},
): FactResolution {
  const { valueType, ...context } = options;
  const candidates = facts.filter(
    (fact) => fact.parameter === parameter && (valueType === undefined || fact.valueType === valueType),
  );

  if (candidates.length === 0) return { kind: 'unknown', parameter };

  const applicable = candidates.filter((fact) => appliesIn(fact, context));
  const usable = applicable.filter(isDeclared);

  if (usable.length === 0) {
    return {
      kind: 'undeclared',
      parameter,
      missing: applicable.map((fact) => ({ factId: fact.factId, fields: missingMetadata(fact) })),
    };
  }

  const ranked = [...usable].sort(
    (a, b) => authorityRank(a.authority as Authority) - authorityRank(b.authority as Authority),
  );

  return { kind: 'governing', fact: ranked[0], outranked: ranked.slice(1) };
}

/* The non-override boundary -------------------------------------------------- */

/**
 * A value ULTRON worked out for itself.
 *
 * Deliberately not an `EngineeringFact`. The type difference is the enforcement
 * mechanism: no function accepts a `SuggestedLimit` where a fact is expected,
 * so a calculated number cannot reach `resolveGoverningFact` and cannot become
 * the governing limit for anything, however it was computed and however
 * confident the computation was.
 */
export type SuggestedLimit = {
  suggestionId: string;
  parameter: string;
  valueType: ValueType;
  value: number;
  unit: string;
  /** How it was arrived at. Required — a suggestion with no method is a guess. */
  method: string;
  /** The data window it was learned from. */
  basis: string;
  computedOn: string;
  /** Always ULTRON_ANALYTICS. Present so the ladder reads uniformly. */
  authority: 'ULTRON_ANALYTICS';
  /** Set when the suggestion disagrees with a higher-authority declared value. */
  conflictsWith: string | null;
};

export function proposeSuggestion(input: {
  suggestionId: string;
  parameter: string;
  valueType: ValueType;
  value: number;
  unit: string;
  method: string;
  basis: string;
  computedOn: string;
  facts?: readonly EngineeringFact[];
}): SuggestedLimit {
  const governing = input.facts
    ? resolveGoverningFact(input.facts, input.parameter, { valueType: input.valueType })
    : null;

  return {
    suggestionId: input.suggestionId,
    parameter: input.parameter,
    valueType: input.valueType,
    value: input.value,
    unit: input.unit,
    method: input.method,
    basis: input.basis,
    computedOn: input.computedOn,
    authority: 'ULTRON_ANALYTICS',
    conflictsWith:
      governing?.kind === 'governing' && governing.fact.value !== input.value ? governing.fact.factId : null,
  };
}

export class ApprovalError extends Error {}

/**
 * Turn a reviewed suggestion into a declared fact.
 *
 * The only bridge across the non-override boundary, and it is a manual one by
 * construction. It demands a named approver, a document reference and an
 * authority other than ULTRON_ANALYTICS, because "explicitly reviewed and
 * approved" in DOC-01 §17 means a person took responsibility for the number.
 * Approving a suggestion back into ULTRON's own authority would be a no-op
 * dressed as governance, so it is refused.
 */
export function approveSuggestion(
  suggestion: SuggestedLimit,
  approval: {
    factId: string;
    authority: Exclude<Authority, 'ULTRON_ANALYTICS'>;
    approvedBy: string;
    approvedOn: string;
    source: string;
    documentRef: string;
    appliesToMachine: string;
    version: string;
    appliesToConfiguration?: string;
    appliesToState?: string;
    appliesToRecipe?: string;
    effectiveFrom?: string;
  },
): EngineeringFact {
  if (!approval.approvedBy.trim()) {
    throw new ApprovalError(
      'A suggested limit cannot be approved without a named approver. DOC-01 §17 requires suggested values to stay separate until explicitly reviewed and approved.',
    );
  }
  if (!approval.documentRef.trim()) {
    throw new ApprovalError(
      'A suggested limit cannot be approved without a document reference. DOC-01 §17.1 requires the document id and section for every limit.',
    );
  }

  return {
    factId: approval.factId,
    parameter: suggestion.parameter,
    valueType: suggestion.valueType,
    value: suggestion.value,
    unit: suggestion.unit,
    authority: approval.authority,
    source: approval.source,
    documentRef: approval.documentRef,
    appliesToMachine: approval.appliesToMachine,
    appliesToConfiguration: approval.appliesToConfiguration ?? null,
    appliesToState: approval.appliesToState ?? null,
    appliesToRecipe: approval.appliesToRecipe ?? null,
    approvedBy: approval.approvedBy,
    approvedOn: approval.approvedOn,
    version: approval.version,
    effectiveFrom: approval.effectiveFrom ?? approval.approvedOn,
    authoritativeSource: approval.source,
    whyCaptured: `Approved from ULTRON suggestion ${suggestion.suggestionId}: ${suggestion.method}`,
    knowledgeClass: MACHINE,
  };
}

/**
 * Declare a fact directly from site or OEM information.
 *
 * Rejects an incomplete metadata set rather than storing a partially-sourced
 * limit. A value with no approver or no document reference is unauditable, and
 * DOC-01 §17.1 lists both as required fields — the point of the register is
 * that any number in it can be traced back to who stood behind it.
 */
export function declareFact(base: EngineeringFact, declaration: Partial<EngineeringFact>): EngineeringFact {
  const fact: EngineeringFact = { ...base, ...declaration };
  const missing = missingMetadata(fact);
  if (missing.length > 0) {
    throw new ApprovalError(
      `${fact.factId} cannot be declared: missing ${missing.join(', ')}. DOC-01 §17.1 requires the complete metadata set so every limit can be audited back to its source and approver.`,
    );
  }
  if (fact.authority === 'ULTRON_ANALYTICS') {
    throw new ApprovalError(
      `${fact.factId} cannot be declared under ULTRON_ANALYTICS authority. A calculated value is a SuggestedLimit until a person approves it; see proposeSuggestion and approveSuggestion.`,
    );
  }
  return fact;
}

/** Facts still to be collected, grouped by who DOC-01 §16 expects them from. */
export function outstandingFactsByOwner(
  facts: readonly EngineeringFact[] = TSE_REQUIRED_FACTS,
): Record<string, EngineeringFact[]> {
  const grouped: Record<string, EngineeringFact[]> = {};
  for (const fact of undeclaredFacts(facts)) {
    (grouped[fact.authoritativeSource] ??= []).push(fact);
  }
  return grouped;
}
