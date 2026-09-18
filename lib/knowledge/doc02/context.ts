/**
 * The DOC-02 §26–§28 Context Engine.
 *
 * Context is what makes a number interpretable. DOC-03 selects a baseline with
 * this object, so an incomplete context is not a cosmetic problem — it is the
 * difference between comparing a reading against the right normal and against
 * somebody else's.
 *
 * §27 is careful about what the engine must *not* do: "DOC-02 should not
 * require a unique baseline bin for every exact numeric combination. It defines
 * context dimensions; DOC-03 decides exact matching, banding or model-based
 * expectation." So this module carries RPM and feed as numbers and does not bin
 * them. Banding is a DOC-03 decision and would be wrong to freeze here.
 *
 * What it does enforce is §27's behaviour table. A missing recipe lowers
 * confidence. A new recipe has no learned baseline. A changed configuration
 * version must not reuse the old one. An UNKNOWN state may not claim a
 * high-confidence contextual baseline. Each of those is a rule about how much
 * to trust the context, and they are returned as confidence plus a named gap
 * rather than as a silent best guess.
 */

import type { ContextFieldDefinition, ContextObject, OperatingStateId } from './types';

/** DOC-02 §26, the context dimensions and why each matters. */
export const CONTEXT_FIELDS: readonly ContextFieldDefinition[] = [
  { field: 'machineId', class: 'MANDATORY', whyItMatters: 'Prevents mixing histories from different assets.' },
  { field: 'machineVariant', class: 'MANDATORY', whyItMatters: 'Selects the TSE template and its rules.' },
  { field: 'configurationVersion', class: 'MANDATORY', whyItMatters: 'Separates screw, die, sensor and layout changes.' },
  { field: 'operatingState', class: 'MANDATORY', whyItMatters: 'Startup, steady production and shutdown are not comparable.' },
  { field: 'recipeId', class: 'MANDATORY', whyItMatters: 'Viscosity, filler and moisture strongly change process relationships.' },
  { field: 'screwRpm', class: 'MANDATORY', whyItMatters: 'Affects shear, residence time, throughput and load.' },
  { field: 'mainFeedRate', class: 'MANDATORY', whyItMatters: 'The primary process loading variable.' },
  { field: 'temperatureSetpointProfile', class: 'RECOMMENDED', whyItMatters: 'Defines the intended thermal context.' },
  { field: 'sideFeed', class: 'IF_INSTALLED', whyItMatters: 'Changes composition and load downstream.' },
  { field: 'vacuumMode', class: 'IF_INSTALLED', whyItMatters: 'Changes the devolatilisation context.' },
  { field: 'coolingMode', class: 'RECOMMENDED', whyItMatters: 'Changes thermal-control behaviour.' },
  { field: 'productBatch', class: 'RECOMMENDED', whyItMatters: 'Traceability and quality linkage.' },
] as const;

export const MANDATORY_CONTEXT_FIELDS: readonly string[] = CONTEXT_FIELDS.filter(
  (entry) => entry.class === 'MANDATORY',
).map((entry) => entry.field);

/** What the engine is given. Everything is nullable; absence is the normal case. */
export type ContextInput = {
  machineId: string | null;
  machineVariant: string | null;
  configurationVersion: string | null;
  operatingState: OperatingStateId | null;
  recipeId: string | null;
  screwRpm: number | null;
  mainFeedRate: number | null;
  temperatureSetpointProfile?: string | null;
  sideFeed?: number | null;
  vacuumMode?: string | null;
  coolingMode?: string | null;
  productBatch?: string | null;
  /** True when this recipe has never been seen before (§27 "New recipe"). */
  recipeIsNew?: boolean;
  /** True when the configuration version changed within the analysis window. */
  configurationChanged?: boolean;
  /** Whether the machine has a side feeder and a vacuum system installed. */
  sideFeedInstalled?: boolean;
  vacuumInstalled?: boolean;
};

/**
 * A stable id for the mandatory keys.
 *
 * Numeric dimensions are included at full precision rather than binned,
 * because §27 leaves banding to DOC-03 — an id that pre-binned RPM would force
 * a bin width on a layer that has not chosen one yet. Null when any mandatory
 * key is absent: a context id that silently omitted a dimension would collide
 * with genuinely different contexts.
 */
export function composeContextId(input: ContextInput): string | null {
  const parts = [
    input.machineId,
    input.machineVariant,
    input.configurationVersion,
    input.operatingState,
    input.recipeId,
    input.screwRpm === null ? null : String(input.screwRpm),
    input.mainFeedRate === null ? null : String(input.mainFeedRate),
  ];
  if (parts.some((part) => part === null || part === '')) return null;
  return parts.join('|');
}

/** Mandatory context fields that are absent. */
export function missingMandatoryContext(input: ContextInput): string[] {
  const present: Record<string, unknown> = {
    machineId: input.machineId,
    machineVariant: input.machineVariant,
    configurationVersion: input.configurationVersion,
    operatingState: input.operatingState,
    recipeId: input.recipeId,
    screwRpm: input.screwRpm,
    mainFeedRate: input.mainFeedRate,
  };
  return MANDATORY_CONTEXT_FIELDS.filter((field) => {
    const value = present[field];
    return value === null || value === undefined || value === '';
  });
}

/**
 * How much the context can be trusted, 0..1.
 *
 * Each rule below is one row of §27's behaviour table, applied as a reduction
 * rather than as a veto, so a partially known context still carries usable
 * information with an honest weight attached.
 */
export function contextConfidence(input: ContextInput): { confidence: number; reasons: string[] } {
  const reasons: string[] = [];
  let confidence = 1;

  const missing = missingMandatoryContext(input);
  if (missing.length > 0) {
    // Each missing mandatory dimension costs proportionally. Seven dimensions,
    // so losing all of them lands at zero rather than at some arbitrary floor.
    confidence -= missing.length / MANDATORY_CONTEXT_FIELDS.length;
    reasons.push(`Mandatory context missing: ${missing.join(', ')}.`);
  }

  if (input.operatingState === 'ST-00') {
    confidence *= 0.3;
    reasons.push('Operating state is UNKNOWN, so no high-confidence contextual baseline may be claimed.');
  }

  if (input.recipeId === null) {
    reasons.push('Recipe is missing; only an approved fallback context may be used.');
  } else if (input.recipeIsNew) {
    confidence *= 0.5;
    reasons.push('This recipe is new, so no contextual learned baseline exists until healthy data accumulates.');
  }

  if (input.configurationChanged) {
    confidence *= 0.4;
    reasons.push('The configuration version changed, so an earlier baseline must not be reused blindly.');
  }

  return { confidence: Math.max(0, Math.min(1, confidence)), reasons };
}

/** Build the §26 context object. */
export function buildContext(input: ContextInput): ContextObject {
  const { confidence } = contextConfidence(input);
  return {
    contextId: composeContextId(input),
    machineId: input.machineId,
    machineVariant: input.machineVariant,
    configurationVersion: input.configurationVersion,
    operatingState: input.operatingState,
    recipeId: input.recipeId,
    screwRpm: input.screwRpm,
    mainFeedRate: input.mainFeedRate,
    temperatureSetpointProfile: input.temperatureSetpointProfile ?? null,
    // "If installed" fields are null when the equipment is absent, which is a
    // different statement from null because nobody wired the signal.
    sideFeed: input.sideFeedInstalled === false ? null : (input.sideFeed ?? null),
    vacuumMode: input.vacuumInstalled === false ? null : (input.vacuumMode ?? null),
    coolingMode: input.coolingMode ?? null,
    productBatch: input.productBatch ?? null,
    confidence,
    missing: missingMandatoryContext(input),
  };
}

/**
 * Whether DOC-03 may select a contextual baseline from this context.
 *
 * Requires a complete mandatory set, a known state, and a state that permits
 * baseline use at all. Returns the reason when it refuses, because "no baseline
 * available" and "baseline withheld because the recipe is unknown" send a
 * commissioning engineer to different places.
 */
export function baselineSelectable(context: ContextObject): { ok: boolean; reason: string | null } {
  if (context.missing.length > 0) {
    return { ok: false, reason: `Context is incomplete: ${context.missing.join(', ')} not available.` };
  }
  if (context.operatingState === 'ST-00') {
    return { ok: false, reason: 'Operating state is UNKNOWN, so no contextual baseline applies.' };
  }
  if (context.operatingState !== 'ST-06') {
    return {
      ok: false,
      reason: `The machine is in ${context.operatingState}, not steady production. Startup, ramp and shutdown are not comparable with a production baseline.`,
    };
  }
  if (context.confidence < 0.5) {
    return { ok: false, reason: `Context confidence is ${context.confidence.toFixed(2)}, too low to select a baseline against.` };
  }
  return { ok: true, reason: null };
}

/* 28 — Recipe and material context ---------------------------------------------- */

export type RecipeContextField = {
  field: string;
  whyCapture: string;
  availability: 'MANDATORY' | 'RECOMMENDED' | 'OPTIONAL';
};

/** DOC-02 §28. What a recipe record should carry, and how badly. */
export const RECIPE_CONTEXT_FIELDS: readonly RecipeContextField[] = [
  { field: 'Material / Recipe ID', whyCapture: 'The primary categorical context key.', availability: 'MANDATORY' },
  { field: 'Polymer family / grade', whyCapture: 'Explains melt behaviour.', availability: 'RECOMMENDED' },
  { field: 'Filler / fibre %', whyCapture: 'Strongly affects torque, viscosity and energy.', availability: 'RECOMMENDED' },
  { field: 'Additive package', whyCapture: 'Changes composition and mixing requirement.', availability: 'RECOMMENDED' },
  { field: 'Moisture / volatile content', whyCapture: 'Changes devolatilisation load and vacuum behaviour.', availability: 'RECOMMENDED' },
  { field: 'Bulk density', whyCapture: 'Affects feeder performance and solids intake.', availability: 'OPTIONAL' },
  { field: 'Target throughput', whyCapture: 'Normalises energy and performance measures.', availability: 'RECOMMENDED' },
] as const;
