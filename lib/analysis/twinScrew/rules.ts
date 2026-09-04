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
  /** What must be declared before it can run. */
  requires: string;
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
    intent: 'Flags sustained load above the drive rating, which on a twin screw usually means a fill or viscosity change rather than a mechanical fault.',
  },
  {
    ruleId: 'ts-drive-speed-instability',
    name: 'Drive speed instability',
    part: 'Drive System',
    tags: ['TS-E1'],
    requires: 'A speed-setpoint reference and an allowed deviation band.',
    intent: 'Flags hunting or drift in the motor shaft speed against its commanded value.',
  },
  {
    ruleId: 'ts-motor-vibration',
    name: 'Motor bearing condition',
    part: 'Drive System',
    tags: ['TS-V1', 'TS-V2'],
    requires: 'A healthy vibration baseline per housing, declared in the same amplitude domain the channel reports in.',
    intent: 'Flags rising drive-end or non-drive-end bearing vibration against that housing’s own baseline.',
  },
  {
    ruleId: 'ts-gearbox-vibration',
    name: 'Gearbox condition',
    part: 'Gearbox',
    tags: ['TS-V3', 'TS-V4', 'TS-V5'],
    requires: 'A healthy baseline for each of the three gearbox housings, plus the tooth counts needed for gear-mesh order analysis.',
    intent: 'Separates input-side from output-side deterioration, which is why the three accelerometers are kept as three measurements.',
  },
  {
    ruleId: 'ts-gearbox-overheat',
    name: 'Gearbox overheating',
    part: 'Gearbox',
    tags: ['TS-T2', 'TS-T3'],
    requires: 'A normal oil-temperature band and a thrust-bearing limit for this gear unit.',
    intent: 'Flags oil or thrust-bearing temperature above its normal operating band.',
  },
  {
    ruleId: 'ts-screw-speed-imbalance',
    name: 'Screw A/B speed imbalance',
    part: 'Processing Section',
    tags: ['TS-S1', 'TS-S2'],
    requires: 'An allowed imbalance tolerance between the two output shafts.',
    intent: 'The two screws are geared together, so a sustained speed difference indicates coupling or gear-train trouble. The imbalance itself is computed; only the tolerance is missing.',
  },
  {
    ruleId: 'ts-feed-instability',
    name: 'Feeder instability',
    part: 'Feeding System',
    tags: ['TS-F1', 'TS-N1', 'TS-I1', 'TS-F2', 'TS-N2', 'TS-I2'],
    requires: 'A target feed rate per recipe and an allowed variation band.',
    intent: 'Flags a gravimetric feeder losing rate control, which shows up downstream as melt-pressure pulsation.',
  },
  {
    ruleId: 'ts-hopper-low',
    name: 'Hopper low level',
    part: 'Feeding System',
    tags: ['TS-L1'],
    requires: 'A low-level trip point for this hopper.',
    intent: 'Flags approaching starvation of the main feed.',
  },
  {
    ruleId: 'ts-barrel-zone-deviation',
    name: 'Barrel zone temperature deviation',
    part: 'Barrel Zones',
    tags: ['TS-TZ1', 'TS-TZ2', 'TS-TZ3', 'TS-TZ4', 'TS-TZ5', 'TS-TZ6', 'TS-TZ7', 'TS-TZ8', 'TS-TZ9'],
    requires: 'A per-zone setpoint profile and tolerance band for the running recipe.',
    intent: 'Flags a zone running above or below its setpoint, and separates a heater failure from a cooling failure by the direction of the error.',
  },
  {
    ruleId: 'ts-zone-gradient',
    name: 'Excessive zone-to-zone gradient',
    part: 'Barrel Zones',
    tags: ['TS-TZ1', 'TS-TZ9'],
    requires: 'A maximum acceptable step between adjacent zones for this profile.',
    intent: 'The gradient is computed from whatever zones are mapped; only the acceptable step is missing.',
  },
  {
    ruleId: 'ts-heater-response',
    name: 'Heater response failure',
    part: 'Barrel Zones',
    tags: ['TS-TZ1'],
    requires: 'Heater output or duty feedback per zone, which is not currently an installed measurement.',
    intent: 'Flags a zone whose temperature does not respond to heater demand. Needs a demand signal to compare against, not only the temperature.',
  },
  {
    ruleId: 'ts-melt-pressure',
    name: 'Melt pressure envelope',
    part: 'Melt and Discharge',
    tags: ['TS-P1', 'TS-P2', 'TS-P3'],
    requires: 'A maximum working pressure for the barrel and screen assembly.',
    intent: 'Flags pressure outside the safe envelope at any installed transducer.',
  },
  {
    ruleId: 'ts-melt-pressure-pulsation',
    name: 'Melt pressure pulsation',
    part: 'Melt and Discharge',
    tags: ['TS-P3'],
    requires: 'A baseline pulsation amplitude at a known throughput.',
    intent: 'Surging shows as a periodic pressure oscillation; distinguishing it from normal ripple needs a reference amplitude.',
  },
  {
    ruleId: 'ts-screen-restriction',
    name: 'Screen pack restriction',
    part: 'Melt and Discharge',
    tags: ['TS-P3', 'TS-P4'],
    requires: 'A clean-screen differential reference at a known throughput.',
    intent: 'The differential is computed; a rising value at constant throughput indicates blinding, but "rising" needs a clean reference to be measured against.',
  },
  {
    ruleId: 'ts-vent-performance',
    name: 'Vent performance',
    part: 'Vent Section',
    tags: ['TS-PV', 'TS-TV'],
    requires: 'A working vacuum level for the devolatilisation stage.',
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
 */
export function analyseTwinScrew(samples: TagSample[]): TwinScrewAnalysis {
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

  const pending: RuleResult[] = THRESHOLD_RULES.map((spec) => {
    const present = spec.tags.filter((tag) => byTag.has(tag));
    if (present.length === 0) {
      return {
        ruleId: spec.ruleId,
        name: spec.name,
        part: spec.part,
        status: 'INSUFFICIENT_EVIDENCE' as const,
        severity: 'info' as const,
        detail: `${spec.intent} None of the signals it reads (${spec.tags.join(', ')}) is mapped on this machine.`,
        evidence: [],
        requires: spec.requires,
      };
    }
    return {
      ruleId: spec.ruleId,
      name: spec.name,
      part: spec.part,
      status: 'CONFIGURATION_REQUIRED' as const,
      severity: 'info' as const,
      detail: `${spec.intent} The signals are mapped and their units are validated, but no twin-screw limit has been commissioned, so the rule is not being evaluated. Nothing here is being reported as healthy.`,
      evidence: present,
      requires: spec.requires,
    };
  });

  return {
    findings,
    derived,
    pending,
    mappedTags: samples.map((sample) => sample.tag),
    vibrationDomains,
  };
}

/**
 * Whether the analyser can currently reach a condition verdict.
 *
 * False for this machine until a register is commissioned. The console uses
 * this to say so plainly rather than showing an empty healthy dashboard.
 */
export function hasCommissionedModel(): boolean {
  return false;
}
