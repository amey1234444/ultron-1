/**
 * Twin-screw rule layer.
 *
 * The single-screw analyser can reach a diagnosis because it has a commissioned
 * register behind it: an 8 mm/s vibration bound, a 250 degC barrel maximum, a
 * 112.5 rpm screw ceiling, each signed off by process engineering *against that
 * machine* (`lib/analysis/extruder/registers.ts`). No such register exists for
 * the twin screw, and the two are different equipment — different barrel
 * profile, different element configuration, different drive train. Copying the
 * numbers across would produce confident output with nothing behind it.
 *
 * So this layer splits cleanly in two:
 *
 *   - Rules that need no machine-specific threshold run for real. Whether a
 *     sensor has frozen, dropped out, or arrived in the wrong unit domain is a
 *     property of the data, not of the machine, and those answers are as valid
 *     here as anywhere.
 *
 *   - Rules that need a declared limit report CONFIGURATION_REQUIRED and name
 *     exactly what is missing. That is a useful answer — it tells a
 *     commissioning engineer what to declare next — and it is an honest one.
 *
 * Nothing here invents a threshold, and nothing is marked healthy on the
 * strength of a limit that was never declared.
 */

import type { TwinScrewTag } from '../../twinScrewExtruderPoints';
import { isDeclared } from '../../knowledge/tse/engineeringFacts';
import type { EngineeringFact } from '../../knowledge/tse/types';
import {
  CANONICAL_UNITS,
  deriveScreenDifferential,
  deriveScrewSpeedImbalance,
  deriveZoneGradient,
  normaliseReading,
  UnitError,
  type DerivedValue,
  type VibrationDomain,
} from './signalMap';

export type RuleSeverity = 'ok' | 'info' | 'warning' | 'alarm' | 'fault';

export type RuleStatus =
  | 'PASS'
  | 'WARNING'
  | 'ALARM'
  | 'FAULT'
  /** The rule ran and had too little data to conclude. */
  | 'INSUFFICIENT_EVIDENCE'
  /** The rule cannot run until a limit is declared for this machine. */
  | 'CONFIGURATION_REQUIRED';

export type RuleResult = {
  ruleId: string;
  name: string;
  /** Which component of the machine tree the finding belongs to. */
  part: string;
  status: RuleStatus;
  severity: RuleSeverity;
  /** What the rule concluded, in one sentence a maintainer can act on. */
  detail: string;
  /** The tags the conclusion rests on. */
  evidence: TwinScrewTag[];
  /** For CONFIGURATION_REQUIRED: what has to be declared to enable this rule. */
  requires?: string;
  /** For a maintenance-facing reading of the finding. */
  recommendedAction?: string;
};

/** One channel's worth of input, as the console already has it. */
export type TagSample = {
  tag: TwinScrewTag;
  label: string;
  /** Raw value in the channel's own unit. */
  value: number | null;
  unit: string;
  /** Recent history, oldest first. Used by the integrity rules only. */
  history?: number[];
  /** Whether the channel is currently reporting at all. */
  reporting: boolean;
};

/* Integrity rules — machine-independent, so they run for real ---------------- */

/**
 * How many identical consecutive samples count as frozen.
 *
 * This is a property of a digitising sensor, not of a twin screw: a live
 * analogue channel dithers in its least significant bits, and a run of exactly
 * repeated values means the value stopped being measured. Eight samples is the
 * same window the console's own connectivity check uses.
 */
const FREEZE_SAMPLES = 8;

function isFrozen(history: number[] | undefined): boolean {
  if (!history || history.length < FREEZE_SAMPLES) return false;
  const window = history.slice(-FREEZE_SAMPLES);
  return window.every((value) => value === window[0]);
}

/** A channel that stopped reporting. Nothing machine-specific about it. */
function dropoutRule(sample: TagSample): RuleResult | null {
  if (sample.reporting) return null;
  return {
    ruleId: 'ts-integrity-dropout',
    name: 'Sensor dropout',
    part: 'Electrical and Utilities',
    status: 'FAULT',
    severity: 'fault',
    detail: `${sample.label} (${sample.tag}) has stopped reporting. No conclusion about the machine can be drawn from this signal while it is down.`,
    evidence: [sample.tag],
    recommendedAction: 'Check the channel wiring, the card, and the gateway link for this point before reading any dependent finding.',
  };
}

function freezeRule(sample: TagSample): RuleResult | null {
  if (!sample.reporting || !isFrozen(sample.history)) return null;
  return {
    ruleId: 'ts-integrity-freeze',
    name: 'Sensor frozen',
    part: 'Electrical and Utilities',
    status: 'FAULT',
    severity: 'fault',
    detail: `${sample.label} (${sample.tag}) has returned an identical value for ${FREEZE_SAMPLES} consecutive samples. A live analogue channel dithers; an exactly repeated value means the reading is stale.`,
    evidence: [sample.tag],
    recommendedAction: 'Verify the transmitter and the acquisition path. Treat trends built on this channel as suspect until it moves again.',
  };
}

/**
 * A unit the tag cannot carry, or a vibration reading in the wrong domain.
 *
 * This is the rule that stops a broadband acceleration RMS in g from ever being
 * compared against a limit declared in mm/s. It needs no machine-specific
 * number to be correct.
 */
function unitDomainRule(sample: TagSample): RuleResult | null {
  try {
    const normalised = normaliseReading(sample.tag, sample.value, sample.unit);
    if (normalised.domain === 'acceleration') {
      return {
        ruleId: 'ts-integrity-vibration-domain',
        name: 'Vibration reported in the acceleration domain',
        part: 'Drive System',
        status: 'INSUFFICIENT_EVIDENCE',
        severity: 'info',
        detail: `${sample.label} (${sample.tag}) reports a broadband acceleration RMS in ${sample.unit}. That is a different physical quantity from the band-limited velocity RMS in mm/s, and it is kept out of any velocity comparison. Acceleration is the domain rolling-element and gear-mesh damage lives in, so the channel is useful — it just needs a limit declared in its own domain.`,
        evidence: [sample.tag],
        requires: `An acceleration-domain limit (g or m/s² RMS) for ${sample.tag}. The velocity limits used elsewhere in this project are not transferable across domains.`,
      };
    }
    return null;
  } catch (error) {
    if (error instanceof UnitError) {
      return {
        ruleId: 'ts-integrity-unit',
        name: 'Unusable unit',
        part: 'Electrical and Utilities',
        status: 'FAULT',
        severity: 'fault',
        detail: `${sample.label} (${sample.tag}) reports in "${sample.unit}", which ${sample.tag} cannot carry. ${error.message}`,
        evidence: [sample.tag],
        recommendedAction: 'Correct the channel unit, or re-map the card to the pad that matches the quantity it actually measures.',
      };
    }
    throw error;
  }
}

/* Threshold rules — declared, but not runnable without commissioning --------- */

type ThresholdRuleSpec = {
  ruleId: string;
  name: string;
  part: string;
  /** Tags the rule would read. All must be present for it to be relevant. */
  tags: TwinScrewTag[];
  /** What must be declared before it can run, in a sentence. */
  requires: string;
  /**
   * The DOC-01 §16 engineering facts this rule's limit has to come from.
   *
   * Naming the fact ids rather than only describing them in prose is what turns
   * "no twin-screw limit has been commissioned" into a work item: the pending
   * finding can now say *declare EF-MOTOR-RATED-CURRENT*, and the registry in
   * `lib/knowledge/tse/engineeringFacts.ts` says who owns that value and why it
   * is captured. An empty list marks a rule whose input is a signal this
   * machine does not have at all, rather than a limit nobody has supplied.
   */
  requiredFacts: string[];
  /**
   * What is actually in the way, which is not the same question for every rule.
   *
   * Three different gaps were previously reported with the same sentence, and
   * they need three different people to close them:
   *
   *   ENGINEERING_FACT — an OEM or plant value nobody has supplied. Closed by
   *     collecting the DOC-01 §16 facts named in `requiredFacts`.
   *   BASELINE — there is no fixed limit to collect; healthy behaviour has to
   *     be learned under a defined context. That is DOC-03 work, not a form to
   *     fill in.
   *   MISSING_SIGNAL — the machine does not measure something the rule needs at
   *     all. No amount of commissioning paperwork fixes it; an instrument or a
   *     controller tag has to be added.
   */
  blockedBy: 'ENGINEERING_FACT' | 'BASELINE' | 'MISSING_SIGNAL';
  /** What it would conclude, so the gap is legible. */
  intent: string;
};

/**
 * Every rule this machine's architecture supports, and what each one is waiting
 * for.
 *
 * Listing them rather than omitting them is the point: a commissioning engineer
 * can read this and know precisely which declarations turn the analyser on, and
 * an operator can see that the absence of a finding is a known gap rather than
 * a clean bill of health.
 */
export const THRESHOLD_RULES: readonly ThresholdRuleSpec[] = [
  {
    ruleId: 'ts-motor-overload',
    name: 'Motor overload',
    part: 'Drive System',
    tags: ['TS-PM1'],
    requires: 'A rated motor current or power limit for this drive.',
    requiredFacts: ['EF-MOTOR-RATED-CURRENT', 'EF-MOTOR-RATED-POWER'],
    blockedBy: 'ENGINEERING_FACT',
    intent: 'Flags sustained load above the drive rating, which on a twin screw usually means a fill or viscosity change rather than a mechanical fault.',
  },
  {
    ruleId: 'ts-drive-speed-instability',
    name: 'Drive speed instability',
    part: 'Drive System',
    tags: ['TS-E1'],
    requires: 'A speed-setpoint reference and an allowed deviation band.',
    requiredFacts: ['EF-MOTOR-RATED-SPEED'],
    blockedBy: 'MISSING_SIGNAL',
    intent: 'Flags hunting or drift in the motor shaft speed against its commanded value.',
  },
  {
    ruleId: 'ts-motor-vibration',
    name: 'Motor bearing condition',
    part: 'Drive System',
    tags: ['TS-V1', 'TS-V2'],
    requires: 'A healthy vibration baseline per housing, declared in the same amplitude domain the channel reports in.',
    requiredFacts: [],
    blockedBy: 'BASELINE',
    intent: 'Flags rising drive-end or non-drive-end bearing vibration against that housing’s own baseline.',
  },
  {
    ruleId: 'ts-gearbox-vibration',
    name: 'Gearbox condition',
    part: 'Gearbox',
    tags: ['TS-V3', 'TS-V4', 'TS-V5'],
    requires: 'A healthy baseline for each of the three gearbox housings, plus the tooth counts needed for gear-mesh order analysis.',
    requiredFacts: [],
    blockedBy: 'BASELINE',
    intent: 'Separates input-side from output-side deterioration, which is why the three accelerometers are kept as three measurements.',
  },
  {
    ruleId: 'ts-gearbox-overheat',
    name: 'Gearbox overheating',
    part: 'Gearbox',
    tags: ['TS-T2', 'TS-T3'],
    requires: 'A normal oil-temperature band and a thrust-bearing limit for this gear unit.',
    requiredFacts: ['EF-GEARBOX-OIL-TEMP-GUIDANCE'],
    blockedBy: 'ENGINEERING_FACT',
    intent: 'Flags oil or thrust-bearing temperature above its normal operating band.',
  },
  {
    ruleId: 'ts-screw-speed-imbalance',
    name: 'Screw A/B speed imbalance',
    part: 'Processing Section',
    tags: ['TS-S1', 'TS-S2'],
    requires: 'An allowed imbalance tolerance between the two output shafts.',
    requiredFacts: [],
    blockedBy: 'BASELINE',
    intent: 'The two screws are geared together, so a sustained speed difference indicates coupling or gear-train trouble. The imbalance itself is computed; only the tolerance is missing.',
  },
  {
    ruleId: 'ts-feed-instability',
    name: 'Feeder instability',
    part: 'Feeding System',
    tags: ['TS-F1', 'TS-N1', 'TS-I1', 'TS-F2', 'TS-N2', 'TS-I2'],
    requires: 'A target feed rate per recipe and an allowed variation band.',
    requiredFacts: ['EF-FEEDER-CAPACITY-MAIN', 'EF-FEEDER-CAPACITY-SIDE'],
    blockedBy: 'MISSING_SIGNAL',
    intent: 'Flags a gravimetric feeder losing rate control, which shows up downstream as melt-pressure pulsation.',
  },
  {
    ruleId: 'ts-hopper-low',
    name: 'Hopper low level',
    part: 'Feeding System',
    tags: ['TS-L1'],
    requires: 'A low-level trip point for this hopper.',
    requiredFacts: [],
    blockedBy: 'ENGINEERING_FACT',
    intent: 'Flags approaching starvation of the main feed.',
  },
  {
    ruleId: 'ts-barrel-zone-deviation',
    name: 'Barrel zone temperature deviation',
    part: 'Barrel Zones',
    tags: ['TS-TZ1', 'TS-TZ2', 'TS-TZ3', 'TS-TZ4', 'TS-TZ5', 'TS-TZ6', 'TS-TZ7', 'TS-TZ8', 'TS-TZ9'],
    requires: 'A per-zone setpoint profile and tolerance band for the running recipe.',
    requiredFacts: ['EF-BARREL-ZONE-TEMP-CAPABILITY'],
    blockedBy: 'MISSING_SIGNAL',
    intent: 'Flags a zone running above or below its setpoint, and separates a heater failure from a cooling failure by the direction of the error.',
  },
  {
    ruleId: 'ts-zone-gradient',
    name: 'Excessive zone-to-zone gradient',
    part: 'Barrel Zones',
    tags: ['TS-TZ1', 'TS-TZ9'],
    requires: 'A maximum acceptable step between adjacent zones for this profile.',
    requiredFacts: ['EF-BARREL-ZONE-TEMP-CAPABILITY'],
    blockedBy: 'ENGINEERING_FACT',
    intent: 'The gradient is computed from whatever zones are mapped; only the acceptable step is missing.',
  },
  {
    ruleId: 'ts-heater-response',
    name: 'Heater response failure',
    part: 'Barrel Zones',
    tags: ['TS-TZ1'],
    requires: 'Heater output or duty feedback per zone, which is not currently an installed measurement.',
    requiredFacts: [],
    blockedBy: 'MISSING_SIGNAL',
    intent: 'Flags a zone whose temperature does not respond to heater demand. Needs a demand signal to compare against, not only the temperature.',
  },
  {
    ruleId: 'ts-melt-pressure',
    name: 'Melt pressure envelope',
    part: 'Melt and Discharge',
    tags: ['TS-P1', 'TS-P2', 'TS-P3'],
    requires: 'A maximum working pressure for the barrel and screen assembly.',
    requiredFacts: ['EF-MAX-PROCESS-PRESSURE-PRE-SCREEN', 'EF-MAX-PROCESS-PRESSURE-POST-SCREEN', 'EF-SCREEN-DIE-PRESSURE-RATING'],
    blockedBy: 'ENGINEERING_FACT',
    intent: 'Flags pressure outside the safe envelope at any installed transducer.',
  },
  {
    ruleId: 'ts-melt-pressure-pulsation',
    name: 'Melt pressure pulsation',
    part: 'Melt and Discharge',
    tags: ['TS-P3'],
    requires: 'A baseline pulsation amplitude at a known throughput.',
    requiredFacts: [],
    blockedBy: 'MISSING_SIGNAL',
    intent: 'Surging shows as a periodic pressure oscillation; distinguishing it from normal ripple needs a reference amplitude.',
  },
  {
    ruleId: 'ts-screen-restriction',
    name: 'Screen pack restriction',
    part: 'Melt and Discharge',
    tags: ['TS-P3', 'TS-P4'],
    requires: 'A clean-screen differential reference at a known throughput.',
    requiredFacts: [],
    blockedBy: 'MISSING_SIGNAL',
    intent: 'The differential is computed; a rising value at constant throughput indicates blinding, but "rising" needs a clean reference to be measured against.',
  },
  {
    ruleId: 'ts-vent-performance',
    name: 'Vent performance',
    part: 'Vent Section',
    tags: ['TS-PV', 'TS-TV'],
    requires: 'A working vacuum level for the devolatilisation stage.',
    requiredFacts: ['EF-VACUUM-CAPABILITY'],
    blockedBy: 'ENGINEERING_FACT',
    intent: 'Flags loss of vacuum, which leaves volatiles in the melt.',
  },
];

/* Evaluation ---------------------------------------------------------------- */

export type TwinScrewAnalysis = {
  /** Findings the rules actually reached. */
  findings: RuleResult[];
  /** Values computed from the mapped signals, with their provenance. */
  derived: DerivedValue[];
  /** Rules that cannot run yet, and what each needs. */
  pending: RuleResult[];
  /** Tags that arrived but carry no rule. */
  mappedTags: TwinScrewTag[];
  /** Which vibration domain each vibration channel reported in. */
  vibrationDomains: Partial<Record<TwinScrewTag, VibrationDomain>>;
};

const ZONE_ORDER: TwinScrewTag[] = ['TS-TZ1', 'TS-TZ2', 'TS-TZ3', 'TS-TZ4', 'TS-TZ5', 'TS-TZ6', 'TS-TZ7', 'TS-TZ8', 'TS-TZ9'];

/**
 * Run the twin-screw analysis over whatever is currently mapped.
 *
 * Integrity findings are real conclusions. Everything else is reported as
 * pending with its missing declaration named — never as "healthy".
 *
 * `facts` is the DOC-01 §16 register of the machine's *declared variant*, and
 * it defaults to empty rather than to the co-rotating pack. That default is the
 * point: DOC-01 §21 makes the fact register a property of a machine template,
 * and template identity comes from the variant, so a machine with no variant
 * declared has no register — which is a different answer from a register whose
 * values nobody has filled in yet. Callers get the right register by asking
 * `factsForMachine` in `lib/knowledge/registry.ts`, never by importing a pack
 * directly.
 */
export function analyseTwinScrew(
  samples: TagSample[],
  facts: readonly EngineeringFact[] = [],
): TwinScrewAnalysis {
  const byTag = new Map(samples.map((sample) => [sample.tag, sample]));
  const findings: RuleResult[] = [];
  const vibrationDomains: Partial<Record<TwinScrewTag, VibrationDomain>> = {};

  for (const sample of samples) {
    const dropout = dropoutRule(sample);
    if (dropout) {
      findings.push(dropout);
      continue; // A channel that is down cannot also be frozen or mis-united.
    }
    const frozen = freezeRule(sample);
    if (frozen) findings.push(frozen);
    const unit = unitDomainRule(sample);
    if (unit) {
      findings.push(unit);
      if (unit.ruleId === 'ts-integrity-vibration-domain') vibrationDomains[sample.tag] = 'acceleration';
    } else if (CANONICAL_UNITS[sample.tag] === 'mm/s RMS') {
      vibrationDomains[sample.tag] = 'velocity';
    }
  }

  const numeric = (tag: TwinScrewTag): number | null => {
    const sample = byTag.get(tag);
    if (!sample || !sample.reporting) return null;
    try {
      return normaliseReading(tag, sample.value, sample.unit).value;
    } catch {
      return null; // Already reported by the unit rule.
    }
  };

  const derived: DerivedValue[] = [
    deriveScrewSpeedImbalance(numeric('TS-S1'), numeric('TS-S2')),
    deriveScreenDifferential(numeric('TS-P3'), numeric('TS-P4')),
    deriveZoneGradient(ZONE_ORDER.map((tag) => numeric(tag))),
  ];

  const pending: RuleResult[] = THRESHOLD_RULES.map((spec) => pendingResult(spec, byTag, facts));

  return {
    findings,
    derived,
    pending,
    mappedTags: samples.map((sample) => sample.tag),
    vibrationDomains,
  };
}

/**
 * Why one threshold rule is not running, said as precisely as the model allows.
 *
 * The signal question is asked first because it is the one that cannot be
 * answered with paperwork: if nothing the rule reads is mapped, no declared
 * limit would let it run either. Only then does the fact registry decide
 * whether the remaining gap is a value somebody owes us or a baseline that has
 * to be learned.
 */
function pendingResult(
  spec: ThresholdRuleSpec,
  byTag: Map<TwinScrewTag, TagSample>,
  facts: readonly EngineeringFact[],
): RuleResult {
  const present = spec.tags.filter((tag) => byTag.has(tag));

  if (present.length === 0) {
    return {
      ruleId: spec.ruleId,
      name: spec.name,
      part: spec.part,
      status: 'INSUFFICIENT_EVIDENCE',
      severity: 'info',
      detail: `${spec.intent} None of the signals it reads (${spec.tags.join(', ')}) is mapped on this machine.`,
      evidence: [],
      requires: spec.requires,
    };
  }

  const outstanding = outstandingFactsFor(spec, facts);

  // Everything this rule's limit depends on has been declared and approved.
  // The limit is available; turning it into a verdict is DOC-04's evaluation
  // layer, which this file does not implement and does not fake.
  if (spec.blockedBy === 'ENGINEERING_FACT' && spec.requiredFacts.length > 0 && outstanding.length === 0) {
    const governing = spec.requiredFacts
      .map((factId) => facts.find((fact) => fact.factId === factId))
      .filter((fact): fact is EngineeringFact => Boolean(fact));
    return {
      ruleId: spec.ruleId,
      name: spec.name,
      part: spec.part,
      status: 'CONFIGURATION_REQUIRED',
      severity: 'info',
      detail: `${spec.intent} Its limits are now declared (${governing
        .map((fact) => `${fact.factId} = ${fact.value} ${fact.unit} under ${fact.authority} authority`)
        .join('; ')}), so the commissioning gap is closed. Evaluation against them is the DOC-04 detection layer, which is not implemented here.`,
      evidence: present,
      requires: 'Nothing further from site. Awaiting the DOC-04 detection layer.',
    };
  }

  // No register at all is a different answer from a register nobody has filled
  // in, and it needs a different action: declare the machine's variant, which is
  // what selects the fact register in the first place.
  const noRegister = facts.length === 0;

  const blocker = noRegister
    ? `No variant is declared for this machine, so it has no engineering-fact register to draw a limit from. Declare the variant first; the register comes with it.`
    : spec.blockedBy === 'MISSING_SIGNAL'
      ? `The rule also needs a signal this machine does not carry, so no declared limit alone would enable it. ${spec.requires}`
      : spec.blockedBy === 'BASELINE'
        ? `There is no fixed limit to collect here: healthy behaviour has to be learned under a defined operating context, which is DOC-03 work. ${spec.requires}`
        : outstanding.length > 0
          ? `Declare the engineering facts it reads: ${outstanding.join(', ')}. See lib/knowledge/tse/engineeringFacts.ts for who owns each value.`
          : spec.requires;

  return {
    ruleId: spec.ruleId,
    name: spec.name,
    part: spec.part,
    status: 'CONFIGURATION_REQUIRED',
    severity: 'info',
    detail: `${spec.intent} The signals are mapped and their units are validated, but no twin-screw limit has been commissioned, so the rule is not being evaluated. Nothing here is being reported as healthy.`,
    evidence: present,
    requires: blocker,
  };
}

/** Which of a rule's required facts are still undeclared. */
function outstandingFactsFor(spec: ThresholdRuleSpec, facts: readonly EngineeringFact[]): string[] {
  return spec.requiredFacts.filter((factId) => {
    const fact = facts.find((candidate) => candidate.factId === factId);
    return !fact || !isDeclared(fact);
  });
}

/**
 * Whether the analyser can currently reach a condition verdict.
 *
 * Reads the fact register it is handed rather than returning a hardcoded
 * false, so that declaring a machine's limits actually changes the answer. It
 * stays false for the reference machine because every fact in the DOC-01 §16
 * register ships undeclared — but it is now false *because the register is
 * empty*, which is a fact about this deployment rather than about the code.
 *
 * With no register passed it is false for a second reason: a machine with no
 * declared variant has no template identity, and so nothing that could be
 * commissioned.
 *
 * The console uses this to say so plainly rather than showing an empty healthy
 * dashboard.
 */
export function hasCommissionedModel(facts: readonly EngineeringFact[] = []): boolean {
  return THRESHOLD_RULES.some(
    (spec) =>
      spec.blockedBy === 'ENGINEERING_FACT' &&
      spec.requiredFacts.length > 0 &&
      outstandingFactsFor(spec, facts).length === 0,
  );
}

/**
 * What commissioning this machine would take, grouped by the kind of gap.
 *
 * Exists so a commissioning view can show the three lists separately. They go
 * to different people: the fact list to whoever owns the OEM and plant
 * documents, the signal list to automation, and the baseline list to nobody at
 * all until there is enough steady-production data to learn from.
 */
export function commissioningGaps(facts: readonly EngineeringFact[] = []): {
  awaitingFacts: { ruleId: string; factIds: string[] }[];
  awaitingBaseline: string[];
  awaitingSignal: string[];
} {
  return {
    awaitingFacts: THRESHOLD_RULES.filter(
      (spec) => spec.blockedBy === 'ENGINEERING_FACT' && outstandingFactsFor(spec, facts).length > 0,
    ).map((spec) => ({ ruleId: spec.ruleId, factIds: outstandingFactsFor(spec, facts) })),
    awaitingBaseline: THRESHOLD_RULES.filter((spec) => spec.blockedBy === 'BASELINE').map((spec) => spec.ruleId),
    awaitingSignal: THRESHOLD_RULES.filter((spec) => spec.blockedBy === 'MISSING_SIGNAL').map((spec) => spec.ruleId),
  };
}

