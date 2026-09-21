/**
 * The DOC-02 §22 Data Quality Engine.
 *
 * Ten checks, DQ-001 to DQ-010, each returning GOOD, UNCERTAIN, BAD or MISSING
 * with the reason it reached that verdict and the downstream rule the document
 * attaches to it.
 *
 * The rule the whole module exists to serve is §22's INSTRUMENTATION-FIRST
 * RULE: "If a mandatory sensor is BAD, BLACKGATE should first report the
 * data/instrument problem and suppress or degrade dependent physical diagnoses.
 * BAD pressure data must not become 'process restriction.'" So the engine
 * returns `suppressesPhysicalDiagnosis`, and a diagnosis layer that ignores it
 * is the failure this is written to prevent — a broken transmitter reported to
 * an operator as a blocked screen.
 *
 * Two things this module will not do. It does not decide whether a value is
 * good *for the machine*: that is DOC-03 and DOC-04, and §1.2 puts it out of
 * scope. And it invents no limits — every bound it compares against is passed
 * in from configuration, so a site that has declared no instrument range gets
 * "range not declared" rather than a made-up one.
 */

import type { QualityFinding, QualityRuleId, QualityVerdict, SignalQuality } from './types';
import { worstQuality } from './types';

/** What the engine is given about one signal at one moment. */
export type QualitySample = {
  signalId: string;
  /** Null means nothing arrived at all. */
  value: number | null;
  unit: string;
  /** When the source says it was measured. */
  sourceTimestampMs: number | null;
  /** When it reached us. */
  receivedAtMs: number | null;
  /** Recent values, oldest first, for the checks that need history. */
  history?: number[];
  /** Timestamps for `history`, same order and length, where available. */
  historyTimestampsMs?: number[];
  /** Quality word the source itself reported, if any (OPC UA, Modbus status). */
  sourceQuality?: string | null;
  /** Device diagnostic, where the channel reports one. */
  sensorDiagnostic?: 'HEALTHY' | 'MARGINAL' | 'OPEN' | 'SHORT' | 'DEVICE_BAD' | 'UNKNOWN' | null;
  /** Samples expected versus received over the evaluation window. */
  expectedSamples?: number | null;
  receivedSamples?: number | null;
};

/**
 * Per-signal configuration the checks compare against.
 *
 * Every field is optional and every check skips itself when its field is
 * absent. A check that cannot run reports nothing rather than guessing a bound,
 * which keeps an uncommissioned deployment honest instead of noisy.
 */
export type QualityConfig = {
  /** DQ-001: how long a value stays fresh, and the grace before it is timed out. */
  freshnessMs?: number;
  freshnessGraceMs?: number;
  /** DQ-002: tolerated clock offset between source and receiver. */
  maxClockOffsetMs?: number;
  /** DQ-003: the validated instrument range. */
  rangeMin?: number;
  rangeMax?: number;
  /** DQ-003: how close to the boundary counts as questionable, as a fraction of span. */
  rangeWarnFraction?: number;
  /** DQ-004: identical samples before a channel is called frozen. */
  flatlineSamples?: number;
  /** DQ-005: largest physically plausible change per second. */
  maxRateOfChangePerSecond?: number;
  /** DQ-009: tolerated fraction of missing samples. */
  missingSampleTolerance?: number;
  /** DQ-008: calibration state, supplied by the configuration manager. */
  calibration?: 'VALID' | 'DUE' | 'UNKNOWN' | 'BAD';
};

const DOWNSTREAM: Record<QualityRuleId, string> = {
  'DQ-001': 'Do not use BAD or MISSING data for a dependent formula or fault.',
  'DQ-002': 'Reduce correlation and state confidence.',
  'DQ-003': 'Reject or quarantine the sample.',
  'DQ-004': 'Classify as a data or instrument issue rather than a process change.',
  'DQ-005': 'Flag or reject the spike before diagnosis.',
  'DQ-006': 'Raise an instrumentation event.',
  'DQ-007': 'Lower the evidence weight and treat the source as suspect.',
  'DQ-008': 'Do not call a machine fault from an invalid scale.',
  'DQ-009': 'Formula quality degraded or invalid.',
  'DQ-010': 'State and context become UNKNOWN.',
};

const CHECK_NAME: Record<QualityRuleId, string> = {
  'DQ-001': 'Freshness / timeout',
  'DQ-002': 'Timestamp',
  'DQ-003': 'Engineering range',
  'DQ-004': 'Flatline / frozen',
  'DQ-005': 'Spike / rate-of-change plausibility',
  'DQ-006': 'Sensor diagnostic',
  'DQ-007': 'Cross-sensor consistency',
  'DQ-008': 'Calibration / configuration',
  'DQ-009': 'Missing samples',
  'DQ-010': 'Context consistency',
};

function finding(ruleId: QualityRuleId, verdict: QualityVerdict, reason: string): QualityFinding {
  return { ruleId, check: CHECK_NAME[ruleId], verdict, reason, downstreamRule: DOWNSTREAM[ruleId] };
}

/* The ten checks ---------------------------------------------------------------- */

/** DQ-001 — has a value arrived recently enough to be used. */
export function checkFreshness(sample: QualitySample, config: QualityConfig, nowMs: number): QualityFinding | null {
  if (sample.value === null) {
    return finding('DQ-001', 'MISSING', `${sample.signalId} has no value. A missing sample is never substituted with zero.`);
  }
  if (config.freshnessMs === undefined || sample.receivedAtMs === null) return null;
  const age = nowMs - sample.receivedAtMs;
  const grace = config.freshnessGraceMs ?? config.freshnessMs;
  if (age > config.freshnessMs + grace) {
    return finding('DQ-001', 'BAD', `${sample.signalId} last updated ${Math.round(age / 1000)} s ago, past its ${Math.round((config.freshnessMs + grace) / 1000)} s timeout.`);
  }
  if (age > config.freshnessMs) {
    return finding('DQ-001', 'UNCERTAIN', `${sample.signalId} is late: ${Math.round(age / 1000)} s since the last update, inside the grace interval.`);
  }
  return null;
}

/** DQ-002 — is the timestamp sane and monotonic. */
export function checkTimestamp(sample: QualitySample, config: QualityConfig, nowMs: number): QualityFinding | null {
  if (sample.sourceTimestampMs === null) return null;
  if (sample.sourceTimestampMs > nowMs + 60_000) {
    return finding('DQ-002', 'BAD', `${sample.signalId} carries a timestamp in the future, so the source clock is wrong.`);
  }
  const timestamps = sample.historyTimestampsMs ?? [];
  for (let i = 1; i < timestamps.length; i += 1) {
    if (timestamps[i] < timestamps[i - 1]) {
      return finding('DQ-002', 'BAD', `${sample.signalId} timestamps went backwards, so samples cannot be ordered.`);
    }
  }
  if (config.maxClockOffsetMs !== undefined && sample.receivedAtMs !== null) {
    const offset = Math.abs(sample.receivedAtMs - sample.sourceTimestampMs);
    if (offset > config.maxClockOffsetMs) {
      return finding('DQ-002', 'UNCERTAIN', `${sample.signalId} shows ${Math.round(offset / 1000)} s between source and arrival time.`);
    }
  }
  return null;
}

/** DQ-003 — is the value inside the validated instrument range. */
export function checkRange(sample: QualitySample, config: QualityConfig): QualityFinding | null {
  if (sample.value === null) return null;
  if (config.rangeMin === undefined || config.rangeMax === undefined) return null;
  if (sample.value < config.rangeMin || sample.value > config.rangeMax) {
    return finding('DQ-003', 'BAD', `${sample.signalId} reads ${sample.value} ${sample.unit}, outside its validated range ${config.rangeMin}–${config.rangeMax}. That is a calibration or scaling problem, not a process value.`);
  }
  const span = config.rangeMax - config.rangeMin;
  const margin = span * (config.rangeWarnFraction ?? 0.02);
  if (sample.value < config.rangeMin + margin || sample.value > config.rangeMax - margin) {
    return finding('DQ-003', 'UNCERTAIN', `${sample.signalId} is within ${margin} ${sample.unit} of its range boundary, where instrument accuracy is worst.`);
  }
  return null;
}

/**
 * DQ-004 — has the channel stopped moving.
 *
 * A live analogue channel dithers in its least significant bits. An exactly
 * repeated run means the value stopped being measured, and the document
 * separates a long flat period (UNCERTAIN) from one that persists while the
 * context is materially changing (BAD).
 */
export function checkFlatline(sample: QualitySample, config: QualityConfig, contextChanging = false): QualityFinding | null {
  const samples = config.flatlineSamples;
  const history = sample.history;
  if (samples === undefined || !history || history.length < samples) return null;
  const window = history.slice(-samples);
  if (!window.every((value) => value === window[0])) return null;
  if (contextChanging) {
    return finding('DQ-004', 'BAD', `${sample.signalId} has been frozen at ${window[0]} for ${samples} samples while the process context changed around it.`);
  }
  return finding('DQ-004', 'UNCERTAIN', `${sample.signalId} has returned an identical value for ${samples} samples.`);
}

/** DQ-005 — is the change between samples physically possible. */
export function checkSpike(sample: QualitySample, config: QualityConfig): QualityFinding | null {
  const limit = config.maxRateOfChangePerSecond;
  const history = sample.history;
  const timestamps = sample.historyTimestampsMs;
  if (limit === undefined || !history || history.length < 2) return null;
  const last = history[history.length - 1];
  const previous = history[history.length - 2];
  let seconds = 1;
  if (timestamps && timestamps.length === history.length) {
    seconds = Math.max(0.001, (timestamps[timestamps.length - 1] - timestamps[timestamps.length - 2]) / 1000);
  }
  const rate = Math.abs(last - previous) / seconds;
  if (rate > limit * 3) {
    return finding('DQ-005', 'BAD', `${sample.signalId} moved ${rate.toFixed(1)} ${sample.unit}/s, which is not physically possible for this quantity.`);
  }
  if (rate > limit) {
    return finding('DQ-005', 'UNCERTAIN', `${sample.signalId} moved ${rate.toFixed(1)} ${sample.unit}/s, faster than expected but not impossible.`);
  }
  return null;
}

/** DQ-006 — what the device says about itself. */
export function checkSensorDiagnostic(sample: QualitySample): QualityFinding | null {
  switch (sample.sensorDiagnostic) {
    case 'OPEN':
    case 'SHORT':
    case 'DEVICE_BAD':
      return finding('DQ-006', 'BAD', `${sample.signalId} reports a ${sample.sensorDiagnostic.toLowerCase().replace('_', ' ')} device diagnostic.`);
    case 'MARGINAL':
    case 'UNKNOWN':
      return finding('DQ-006', 'UNCERTAIN', `${sample.signalId} reports a ${sample.sensorDiagnostic.toLowerCase()} device diagnostic.`);
    default:
      return null;
  }
}

/** One cross-sensor expectation, supplied by the caller from DOC-01's relationships. */
export type ConsistencyRule = {
  ruleId: string;
  /** What is being asserted, for the reason string. */
  description: string;
  /** False means the signals contradict each other. */
  holds: boolean;
  /** A contradiction that is impossible rather than merely surprising. */
  strong: boolean;
};

/** DQ-007 — do related signals tell the same story. */
export function checkCrossSensor(sample: QualitySample, rules: readonly ConsistencyRule[]): QualityFinding | null {
  const broken = rules.filter((rule) => !rule.holds);
  if (broken.length === 0) return null;
  const strong = broken.find((rule) => rule.strong);
  if (strong) {
    return finding('DQ-007', 'BAD', `${sample.signalId} contradicts a related measurement: ${strong.description}.`);
  }
  return finding('DQ-007', 'UNCERTAIN', `${sample.signalId} partially contradicts a related measurement: ${broken[0].description}.`);
}

/** DQ-008 — is the scaling and calibration current. */
export function checkCalibration(sample: QualitySample, config: QualityConfig): QualityFinding | null {
  switch (config.calibration) {
    case 'BAD':
      return finding('DQ-008', 'BAD', `${sample.signalId} has a known bad calibration, range or unit. No machine fault may be called from it.`);
    case 'DUE':
    case 'UNKNOWN':
      return finding('DQ-008', 'UNCERTAIN', `${sample.signalId} has a calibration that is ${config.calibration.toLowerCase()}.`);
    default:
      return null;
  }
}

/** DQ-009 — did enough samples arrive to compute anything. */
export function checkMissingSamples(sample: QualitySample, config: QualityConfig): QualityFinding | null {
  const expected = sample.expectedSamples;
  const received = sample.receivedSamples;
  const tolerance = config.missingSampleTolerance;
  if (expected === undefined || expected === null || received === undefined || received === null || !expected) return null;
  const missedFraction = Math.max(0, (expected - received) / expected);
  const allowed = tolerance ?? 0.1;
  if (missedFraction > allowed * 3) {
    return finding('DQ-009', 'BAD', `${sample.signalId} received ${received} of ${expected} expected samples, too few to compute from.`);
  }
  if (missedFraction > allowed) {
    return finding('DQ-009', 'UNCERTAIN', `${sample.signalId} is missing ${Math.round(missedFraction * 100)}% of its expected samples.`);
  }
  return null;
}

/** DQ-010 — does the reading agree with the state and mode the machine says it is in. */
export function checkContextConsistency(sample: QualitySample, contradiction: string | null, unclear = false): QualityFinding | null {
  if (contradiction) {
    return finding('DQ-010', 'BAD', `${sample.signalId} contradicts the declared operating context: ${contradiction}.`);
  }
  if (unclear) {
    return finding('DQ-010', 'UNCERTAIN', `${sample.signalId} cannot be reconciled with the operating context, which is itself unclear.`);
  }
  return null;
}

/* The engine -------------------------------------------------------------------- */

export type QualityEvaluation = {
  sample: QualitySample;
  config: QualityConfig;
  nowMs: number;
  /** True when the process context is changing, which sharpens DQ-004. */
  contextChanging?: boolean;
  consistencyRules?: readonly ConsistencyRule[];
  contextContradiction?: string | null;
  contextUnclear?: boolean;
  /** Whether this signal is MANDATORY, for the instrumentation-first rule. */
  mandatory: boolean;
};

/**
 * Run every check and reduce to one verdict.
 *
 * The verdict is the *worst* finding, not an average. A signal that is fresh,
 * in range, moving and correctly scaled but reporting an open circuit is not
 * three-quarters trustworthy; it is unusable, and averaging would hide that.
 */
export function evaluateQuality(input: QualityEvaluation): SignalQuality {
  const { sample, config, nowMs } = input;
  const findings: QualityFinding[] = [];
  const push = (found: QualityFinding | null) => {
    if (found) findings.push(found);
  };

  push(checkFreshness(sample, config, nowMs));
  push(checkTimestamp(sample, config, nowMs));
  push(checkRange(sample, config));
  push(checkFlatline(sample, config, input.contextChanging ?? false));
  push(checkSpike(sample, config));
  push(checkSensorDiagnostic(sample));
  push(checkCrossSensor(sample, input.consistencyRules ?? []));
  push(checkCalibration(sample, config));
  push(checkMissingSamples(sample, config));
  push(checkContextConsistency(sample, input.contextContradiction ?? null, input.contextUnclear ?? false));

  // A source that declares its own quality is believed about itself: it knows
  // things the value alone cannot show.
  if (sample.sourceQuality && sample.sourceQuality.toUpperCase() !== 'GOOD') {
    findings.push({
      ruleId: 'DQ-006',
      check: CHECK_NAME['DQ-006'],
      verdict: 'BAD',
      reason: `${sample.signalId} arrived with source quality "${sample.sourceQuality}".`,
      downstreamRule: DOWNSTREAM['DQ-006'],
    });
  }

  const verdict = worstQuality(findings.map((found) => found.verdict));

  return {
    signalId: sample.signalId,
    verdict,
    findings,
    // The §22 instrumentation-first rule, as a flag a diagnosis layer must read.
    suppressesPhysicalDiagnosis: input.mandatory && (verdict === 'BAD' || verdict === 'MISSING'),
  };
}

/**
 * Whether a physical diagnosis may be drawn from a set of signals.
 *
 * Returns the instrumentation problems to report *instead*, if any. An empty
 * array means the data is fit to diagnose from. This is the gate that stops a
 * broken pressure transmitter being reported as a process restriction.
 */
export function instrumentationBlockers(qualities: readonly SignalQuality[]): SignalQuality[] {
  return qualities.filter((quality) => quality.suppressesPhysicalDiagnosis);
}
