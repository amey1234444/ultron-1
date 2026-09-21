/**
 * BLACKGATE DOC-01 machine-knowledge types.
 *
 * DOC-01 (`BLACKGATE-TSE-DOC-01`, template `TSE-7Z-CR-INT-PAR-COMP`) is explicit
 * that it "should not end as a PDF/Word reference only" — its section 21 names
 * ten software entities the knowledge has to become. This file declares those
 * ten, plus the two cross-cutting classifications every entity carries:
 *
 *   - `KnowledgeClass` — COMMON / TSE_SPECIFIC / MACHINE_SPECIFIC (DOC-01 §20).
 *     It decides what is reusable across machine families, what is reusable
 *     across co-rotating twin screws, and what must be validated per site.
 *
 *   - `Authority` — the source-priority ladder of DOC-01 §17. A value's
 *     authority is what stops a learned baseline from silently replacing an
 *     approved OEM or safety limit.
 *
 * Two deliberate omissions, both from DOC-01 §1.2's scope boundary: this module
 * defines no statistical baselines and no anomaly thresholds. Those are DOC-03
 * and DOC-04 work. What it defines is the *frame* those later engines slot into
 * — which facts must exist, who is allowed to author them, and what happens
 * when two authorities disagree.
 */

/* Classification ------------------------------------------------------------ */

/**
 * How far a piece of knowledge travels (DOC-01 §20).
 *
 * The reuse rule is the whole point of the distinction: COMMON knowledge can be
 * lifted onto a pump or a fan, TSE_SPECIFIC onto another co-rotating twin
 * screw, and MACHINE_SPECIFIC onto nothing at all without site validation.
 */
export type KnowledgeClass = 'COMMON' | 'TSE_SPECIFIC' | 'MACHINE_SPECIFIC';

export const KNOWLEDGE_CLASS_REUSE: Record<KnowledgeClass, string> = {
  COMMON: 'Reusable across machine families — pumps, fans, compressors, extruders.',
  TSE_SPECIFIC: 'Reusable across similar co-rotating twin-screw templates.',
  MACHINE_SPECIFIC: 'Must be validated at deployment from OEM, customer or site configuration.',
};

/**
 * Who authored a value, highest authority first (DOC-01 §17).
 *
 * Order matters and is relied on by `AUTHORITY_PRECEDENCE`: the ladder is
 * SAFETY / TRIP / PROTECTION > APPROVED CUSTOMER > OEM > APPROVED ENGINEERING >
 * BLACKGATE LEARNED. A value lower on the ladder never displaces one above it.
 */
export type Authority =
  | 'SAFETY_PROTECTION'
  | 'APPROVED_CUSTOMER'
  | 'OEM'
  | 'APPROVED_ENGINEERING'
  | 'ULTRON_ANALYTICS';

/** The ladder itself, strongest first. Index is the precedence rank. */
export const AUTHORITY_PRECEDENCE: readonly Authority[] = [
  'SAFETY_PROTECTION',
  'APPROVED_CUSTOMER',
  'OEM',
  'APPROVED_ENGINEERING',
  'ULTRON_ANALYTICS',
] as const;

export const AUTHORITY_LABEL: Record<Authority, string> = {
  SAFETY_PROTECTION: 'Safety / trip / protection design authority',
  APPROVED_CUSTOMER: 'Approved customer limit',
  OEM: 'OEM limit or rating',
  APPROVED_ENGINEERING: 'Approved engineering limit',
  ULTRON_ANALYTICS: 'BLACKGATE learned baseline or anomaly threshold',
};

/** Rank of an authority on the ladder. Lower number wins. */
export function authorityRank(authority: Authority): number {
  return AUTHORITY_PRECEDENCE.indexOf(authority);
}

/**
 * What kind of number a value is (DOC-01 §17 value-type table).
 *
 * Kept separate from `Authority` because the two are independent: a baseline
 * can be commissioning-approved or BLACKGATE-learned, and an Alert can come from
 * the customer or from plant engineering.
 */
export type ValueType =
  | 'ENGINEERING_RATING'
  | 'BASELINE'
  | 'ANOMALY_THRESHOLD'
  | 'ALERT'
  | 'DANGER'
  | 'TRIP_PROTECTION';

export const VALUE_TYPE_MEANING: Record<ValueType, string> = {
  ENGINEERING_RATING: 'Design or capability fact such as motor power or maximum allowable pressure.',
  BASELINE: 'Expected healthy behaviour under a defined operating context.',
  ANOMALY_THRESHOLD: 'Analytical boundary showing deviation from expected behaviour.',
  ALERT: 'Approved plant warning level.',
  DANGER: 'Approved serious-condition limit.',
  TRIP_PROTECTION: 'Control or protection action boundary; may reside in PLC, SIS or OEM protection.',
};

/* 21.1 MachineTemplate ------------------------------------------------------ */

export type ScrewRotation = 'CO_ROTATING' | 'COUNTER_ROTATING';
export type ScrewEngagement = 'FULLY_INTERMESHING' | 'PARTIALLY_INTERMESHING' | 'NON_INTERMESHING';
export type ShaftGeometry = 'PARALLEL' | 'CONICAL';

/**
 * The template identity object of DOC-01 §21.1.
 *
 * `zoneFunctionSource` is not decoration. It records that zone *function* is
 * read from machine configuration rather than inferred from zone number, which
 * is the single rule DOC-01 §7 marks as an IMPLEMENTATION RULE.
 */
export type MachineTemplateDefinition = {
  templateId: string;
  family: string;
  type: string;
  /**
   * The variant, as DOC-01 §21 requires on `MachineTemplate`.
   *
   * The document lists the minimum fields as `template_id, family, type,
   * variant, application`, so variant is a property *of* the template rather
   * than a choice offered under it. `template_id` says the same thing in
   * compressed form — TSE-7Z-CR-INT-PAR-COMP is 7-Zone, Co-Rotating,
   * INTermeshing, PARallel, COMPounding — and §2's classification chain narrows
   * down to exactly this point. One template is one variant; a counter-rotating
   * machine is a different template, not a different option under this one.
   *
   * Always composed by `composeVariantDescriptor` from the four attributes
   * below rather than typed by hand, so the descriptor and the attributes
   * cannot drift apart.
   */
  variant: string;
  rotation: ScrewRotation;
  engagement: ScrewEngagement;
  geometry: ShaftGeometry;
  /** Zone count of the *reference* template, not of any installed machine. */
  referenceZones: number;
  application: string;
  zoneFunctionSource: 'MACHINE_CONFIGURATION';
  /** Which configuration version the installed machine runs, if declared. */
  screwConfigurationVersion: string | null;
  authorityModel: readonly Authority[];
  /** The console template string this knowledge model describes. */
  consoleTemplate: string;
  documentRef: string;
};

/* 21 AssetNode -------------------------------------------------------------- */

export type AssetNodeType = 'Machine' | 'System' | 'Component' | 'Location';

/**
 * One node of the asset tree (DOC-01 §5).
 *
 * `enabled` exists because DOC-01 says site-specific equipment can be switched
 * off "without changing the core template" — a machine with no side feeder is
 * still this template, with that node disabled.
 */
export type AssetNode = {
  assetId: string;
  parentId: string | null;
  type: AssetNodeType;
  name: string;
  primaryRole: string;
  knowledgeClass: KnowledgeClass;
  /** Whether this node is installed on the reference machine. */
  enabled: boolean;
  /** Criticality placeholder per DOC-01 §21; ranked in a later document. */
  criticality: null;
};

/* 21 ProcessLocation -------------------------------------------------------- */

/**
 * A place in the material path, with its neighbours named (DOC-01 §6).
 *
 * `order` is the position along the process length. `upstreamOf` and
 * `downstreamOf` are stored explicitly rather than derived from `order`,
 * because a side feed and a vent can share an order position while sitting on
 * different branches of the path.
 */
export type ProcessLocation = {
  locationId: string;
  order: number;
  name: string;
  unitOperation: string;
  whatHappens: string;
  mainInfluences: string[];
  observedLater: string[];
  upstreamOf: string[];
  downstreamOf: string[];
  knowledgeClass: KnowledgeClass;
};

/* 21 ZoneDefinition --------------------------------------------------------- */

/**
 * The reference process role of a zone position (DOC-01 §7).
 *
 * Every member is prefixed in usage by "reference" so that nothing in the
 * codebase can read one of these values and believe it describes an installed
 * machine.
 */
export type ReferenceZoneFunction =
  | 'FEED_SOLIDS_INTAKE'
  | 'CONVEYING_PREHEAT'
  | 'MELTING_TRANSITION'
  | 'INTENSIVE_MIXING'
  | 'SIDE_FEED_SECONDARY_MIXING'
  | 'VENTING_HOMOGENISATION'
  | 'FINAL_CONVEYING_PRESSURE_BUILD';

/**
 * A barrel zone, with its number and its function held strictly apart.
 *
 * This is DOC-01 §7's IMPLEMENTATION RULE expressed as a type. `zoneNumber` is
 * a position. `configuredFunction` is what that position actually does on this
 * machine, and it is `null` until someone reads it off the validated screw and
 * barrel layout. Nothing may infer the second from the first — a seven-zone
 * machine has no universal "zone 4 is mixing" meaning, because co-rotating
 * barrels and screws are modular and the OEM decides where the kneading blocks
 * and the vent ports go.
 */
export type ZoneDefinition = {
  zoneId: string;
  zoneNumber: number;
  /** Set only from the validated screw/barrel drawing. Never inferred. */
  configuredFunction: string | null;
  /** Where `configuredFunction` came from, when it is set. */
  configuredFunctionSource: string | null;
  /** The barrel module this zone sits on, from the OEM drawing. */
  barrelModuleRef: string | null;
  /** The signal tags installed on this zone, if any. */
  measurementTags: string[];
  knowledgeClass: KnowledgeClass;
};

/** One row of the DOC-01 §7 reference map. Reference only — never applied by number. */
export type ReferenceZoneEntry = {
  position: number;
  referenceFunction: ReferenceZoneFunction;
  referenceRole: string;
  keyInfluences: string[];
  laterAnalyticsExamples: string[];
  /** Whether this reference role exists only when the machine is so configured. */
  conditional: boolean;
};

/* 21 ComponentDefinition ---------------------------------------------------- */

/** The DOC-01 §9 knowledge pattern, one component per entry. */
export type ComponentDefinition = {
  componentId: string;
  /** The asset node this knowledge describes. */
  assetId: string;
  name: string;
  purpose: string;
  physicalInputs: string[];
  physicalOutputs: string[];
  usefulObservables: string[];
  mainInfluences: string[];
  whyItMatters: string;
  /** Measurement locations recommended on this component (DOC-01 §18). */
  measurementLocationIds: string[];
  knowledgeClass: KnowledgeClass;
  /** False for equipment DOC-01 marks "if installed". */
  alwaysPresent: boolean;
};

/* 21 ParameterDefinition ---------------------------------------------------- */

/** Physical quantity family, used to stop a value being read as another. */
export type UnitClass =
  | 'rotational_speed'
  | 'electrical_current'
  | 'electrical_power'
  | 'torque'
  | 'mass_flow'
  | 'temperature'
  | 'pressure'
  | 'absolute_pressure'
  | 'pressure_difference'
  | 'control_output'
  | 'vibration_velocity'
  | 'identifier';

/** One row of the DOC-01 §12 process parameter dictionary. */
export type ParameterDefinition = {
  parameterId: string;
  canonicalName: string;
  unitClass: UnitClass;
  /** Units DOC-01 names for this parameter. Canonicalisation lives in the signal map. */
  units: string[];
  meaning: string;
  mainInfluences: string[];
  whyUltronUsesIt: string;
  knowledgeClass: KnowledgeClass;
  /** Twin-screw signal tags that carry this parameter on the reference machine. */
  tags: string[];
};

/* 21 RelationshipDefinition ------------------------------------------------- */

/** The graph predicates of DOC-01 §13.1 and §19. */
export type Predicate =
  // Topology
  | 'DRIVES'
  | 'FEEDS'
  | 'HEATS'
  | 'COOLS'
  | 'MEASURES'
  | 'LOCATED_AT'
  | 'UPSTREAM_OF'
  | 'DOWNSTREAM_OF'
  | 'CONFIGURED_BY'
  // Process priors
  | 'INCREASES'
  | 'DECREASES'
  | 'AFFECTS'
  // Governance
  | 'CHANGES_CONTEXT_FOR'
  | 'INVALIDATES_BASELINE'
  | 'REQUIRES_VERSION_CHANGE';

/** Which of the three groups a predicate belongs to. */
export const PREDICATE_KIND: Record<Predicate, 'topology' | 'process' | 'governance'> = {
  DRIVES: 'topology',
  FEEDS: 'topology',
  HEATS: 'topology',
  COOLS: 'topology',
  MEASURES: 'topology',
  LOCATED_AT: 'topology',
  UPSTREAM_OF: 'topology',
  DOWNSTREAM_OF: 'topology',
  CONFIGURED_BY: 'topology',
  INCREASES: 'process',
  DECREASES: 'process',
  AFFECTS: 'process',
  CHANGES_CONTEXT_FOR: 'governance',
  INVALIDATES_BASELINE: 'governance',
  REQUIRES_VERSION_CHANGE: 'governance',
};

/** How a cause moved, for a process relationship. */
export type ChangeDirection = 'INCREASE' | 'DECREASE' | 'CHANGE' | 'DEGRADE';

/**
 * Strength of a directional prior.
 *
 * DOC-01 §13 writes its expected directions as "↑", "Usually ↑" and "May ↑",
 * and those are three different claims. Collapsing them into one boolean would
 * turn a conditional tendency into a rule, which is precisely what the section
 * warns against: "These relationships are not alarm rules."
 */
export type ExpectationStrength = 'EXPECTED' | 'USUAL' | 'POSSIBLE';

/**
 * One relationship in the machine knowledge graph.
 *
 * `conditions` is required, not optional, on process relationships. DOC-01 §13
 * makes the Conditions/Cautions column mandatory because every directional
 * effect in it is conditional — feed rate raises torque *at the same recipe and
 * RPM*, and without that qualifier the prior is wrong as often as it is right.
 */
export type RelationshipDefinition = {
  relationshipId: string;
  subject: string;
  predicate: Predicate;
  object: string;
  /** Present on process relationships: how the subject moved. */
  changeDirection?: ChangeDirection;
  /** Present on process relationships: how confidently the effect follows. */
  strength?: ExpectationStrength;
  /** Mandatory qualifiers. Empty is only valid for topology relationships. */
  conditions: string[];
  purpose: string;
  source: string;
  knowledgeClass: KnowledgeClass;
};

/* 21 MeasurementLocation ---------------------------------------------------- */

/** One row of the DOC-01 §18 measurement-location table. */
export type MeasurementLocation = {
  locationId: string;
  name: string;
  physicalDescription: string;
  /** Parameter ids DOC-01 recommends taking here. */
  recommendedParameters: string[];
  whyTheLocationMatters: string;
  /** Twin-screw tags installed here on the reference machine. */
  installedTags: string[];
  /**
   * Whether an existing PLC/DCS/VFD value should be reused rather than a new
   * BLACKGATE sensor added (DOC-01 §18). Null where the site has not decided.
   */
  preferExistingSource: boolean | null;
  knowledgeClass: KnowledgeClass;
};

/* 21 EngineeringFact -------------------------------------------------------- */

/**
 * A rating or limit, with the full §17.1 metadata set.
 *
 * Every field after `value` exists because DOC-01 §17.1 lists it as required.
 * They are all nullable for one reason: a fact that has been *identified as
 * required* but not yet collected is a first-class state in this model. It is
 * the difference between "this machine has no pressure limit" and "nobody has
 * told us the pressure limit yet", and only the second is honest about a
 * freshly deployed machine.
 */
export type EngineeringFact = {
  factId: string;
  /** What the value bounds, e.g. "Melt pressure - pre-screen". */
  parameter: string;
  valueType: ValueType;
  value: number | null;
  unit: string | null;
  authority: Authority | null;
  /** Free text naming the document or record the value came from. */
  source: string | null;
  /** Document id plus section or page. */
  documentRef: string | null;
  /** Machine and configuration the value applies to. */
  appliesToMachine: string | null;
  appliesToConfiguration: string | null;
  /** Operating state the value applies in, where it is state-dependent. */
  appliesToState: string | null;
  /** Recipe or material context, where the value is context-dependent. */
  appliesToRecipe: string | null;
  approvedBy: string | null;
  approvedOn: string | null;
  version: string | null;
  effectiveFrom: string | null;
  /** Who DOC-01 §16 expects to supply this. */
  authoritativeSource: string;
  /** Why DOC-01 §16 says to capture it. */
  whyCaptured: string;
  knowledgeClass: KnowledgeClass;
};

/* 21 ConfigurationVersion --------------------------------------------------- */

/**
 * A traceable physical configuration (DOC-01 §8.1, §21, §26).
 *
 * Changing the screw arrangement, the screen or the die can invalidate every
 * baseline learned before it, so baselines are tied to a version rather than to
 * the machine. `invalidatesBaselinesBefore` states that consequence explicitly
 * instead of leaving it to be remembered.
 */
export type ConfigurationVersion = {
  versionId: string;
  effectiveDate: string | null;
  changeReason: string;
  approvedBy: string | null;
  /** Screw element sequence, or the OEM drawing identifier standing in for it. */
  screwConfigurationRef: string | null;
  screwDiameterMm: number | null;
  lengthToDiameterRatio: number | null;
  feedLocations: string[];
  sideFeedLocations: string[];
  liquidInjectionLocations: string[];
  ventLocations: string[];
  screenConfiguration: string | null;
  dieConfiguration: string | null;
  /** True when a baseline learned before this version may no longer be used. */
  invalidatesBaselinesBefore: boolean;
  knowledgeClass: KnowledgeClass;
};
