/**
 * PART VIEW MODEL — the shape the Analysis layer's screens consume.
 *
 * The rule this module exists to enforce: **the UI performs no analysis.** No
 * screen compares a value against a limit, classifies a trend, or decides which
 * part is in trouble. All of that happens here, from results the pipeline has
 * already produced, and the screens render what they are handed.
 *
 * Two derivations live here that are genuinely new, and both are deliberately
 * built from vocabulary the model already uses rather than invented alongside it:
 *
 *  1. `classifyBehaviour` — how a measurement has been *moving*. Slope comes
 *     from the same least-squares fit the temporal features use, and spread is
 *     measured on the detrended residual so a steady ramp reads as a direction
 *     rather than as noise. A trend is never claimed from too few samples:
 *     that case is reported as INSUFFICIENT_HISTORY, never as STABLE.
 *
 *  2. `buildPartViews` — which part each finding belongs to. Every state is
 *     *mapped* from something the pipeline decided (a candidate fault, a crossed
 *     threshold, a violated constraint, a quality verdict). Nothing here decides
 *     that a machine is unwell; it decides only where on the machine an existing
 *     conclusion belongs.
 */
import type { ConstraintCheck } from './constraints';
import {
  PART_DESCRIPTION,
  PART_ORDER,
  partForFault,
  partForTag,
  partsForConstraint,
  relatedParts,
  signalKindForTag,
  worsePartState,
  type MachinePart,
  type PartState,
  type SignalKind,
} from './machineParts';
import type { ExtruderAnalysisResult, FaultAssessmentRecord, TriggeredThreshold } from './pipeline';
import { faultName } from './registers';
import { TAG_LABELS, type ExtruderTag } from './signalMap';

// ---------------------------------------------------------------------------
// Behaviour
// ---------------------------------------------------------------------------

export type SignalBehaviour =
  | 'STABLE'
  | 'INCREASING'
  | 'DECREASING'
  | 'FLUCTUATING'
  /** Fewer samples than the window needs. Deliberately NOT "STABLE". */
  | 'INSUFFICIENT_HISTORY'
  | 'UNAVAILABLE';

export const BEHAVIOUR_LABEL: Record<SignalBehaviour, string> = {
  STABLE: 'Stable',
  INCREASING: 'Increasing',
  DECREASING: 'Decreasing',
  FLUCTUATING: 'Fluctuating',
  INSUFFICIENT_HISTORY: 'Not enough history',
  UNAVAILABLE: 'No reading',
};

export type BehaviourResult = {
  behaviour: SignalBehaviour;
  /** Why, in one line, for the expanded row. */
  detail: string;
  /** Engineering units per sample interval. Null when no trend was computed. */
  slope: number | null;
  sampleCount: number;
};

/** Minimum samples before any direction may be claimed. */
const MIN_SAMPLES = 5;
/** Total change over the window, as a fraction of the yardstick, to call a direction. */
const DIRECTION_FRACTION = 0.15;
/** Detrended spread, as a fraction of the yardstick, to call it fluctuating. */
const FLUCTUATION_FRACTION = 0.2;

function leastSquaresSlope(series: number[]): number {
  const count = series.length;
  const meanIndex = (count - 1) / 2;
  const meanValue = series.reduce((sum, value) => sum + value, 0) / count;
  let denominator = 0;
  for (let index = 0; index < count; index += 1) denominator += (index - meanIndex) ** 2;
  if (denominator <= 0) return 0;
  let numerator = 0;
  for (let index = 0; index < count; index += 1) numerator += (index - meanIndex) * (series[index] - meanValue);
  return numerator / denominator;
}

function standardDeviation(series: number[]): number {
  if (series.length < 2) return 0;
  const mean = series.reduce((sum, value) => sum + value, 0) / series.length;
  const variance = series.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (series.length - 1);
  return Math.sqrt(variance);
}

/**
 * How a measurement has been moving over the samples held for this session.
 *
 * `yardstick` is the scale that decides whether a movement is significant — the
 * channel's own normal band, when the model has one. 0.1 per sample means
 * something quite different on a barrel zone than on a bearing, so without a
 * dimensionless yardstick one rule set could not serve degC, mm/s, MPa and rpm
 * at once. When no band is known the observed spread stands in, which keeps the
 * comparison dimensionless rather than falling back to an invented constant.
 */
export function classifyBehaviour(samples: (number | null)[], yardstick: number | null): BehaviourResult {
  const usable = samples.filter((value): value is number => value !== null && Number.isFinite(value));

  if (usable.length === 0) {
    return { behaviour: 'UNAVAILABLE', detail: 'No usable sample has been recorded for this signal.', slope: null, sampleCount: 0 };
  }
  if (usable.length < MIN_SAMPLES) {
    return {
      behaviour: 'INSUFFICIENT_HISTORY',
      detail: `Only ${usable.length} sample${usable.length === 1 ? '' : 's'} so far; ${MIN_SAMPLES} are needed before a trend can be reported.`,
      slope: null,
      sampleCount: usable.length,
    };
  }

  const slope = leastSquaresSlope(usable);
  const observedSpread = Math.max(...usable) - Math.min(...usable);
  const meanValue = usable.reduce((sum, value) => sum + value, 0) / usable.length;
  const scale =
    yardstick !== null && yardstick > 0 ? yardstick : observedSpread > 0 ? observedSpread : Math.max(Math.abs(meanValue), 1);

  const totalChange = slope * (usable.length - 1);
  const changeFraction = Math.abs(totalChange) / scale;

  // Spread is measured on the detrended residual, so a steady ramp is reported
  // as a direction rather than as fluctuation.
  const residual = usable.map((value, index) => value - (meanValue + slope * (index - (usable.length - 1) / 2)));
  const spreadFraction = standardDeviation(residual) / scale;

  if (changeFraction >= DIRECTION_FRACTION) {
    const rising = slope > 0;
    return {
      behaviour: rising ? 'INCREASING' : 'DECREASING',
      detail: `${rising ? 'Rising' : 'Falling'} by ${Math.abs(totalChange).toPrecision(3)} across the last ${usable.length} samples.`,
      slope,
      sampleCount: usable.length,
    };
  }

  if (spreadFraction >= FLUCTUATION_FRACTION) {
    return {
      behaviour: 'FLUCTUATING',
      detail: `Varying by ±${standardDeviation(residual).toPrecision(3)} around its trend across ${usable.length} samples.`,
      slope,
      sampleCount: usable.length,
    };
  }

  return {
    behaviour: 'STABLE',
    detail: `Within its recent band across the last ${usable.length} samples.`,
    slope,
    sampleCount: usable.length,
  };
}

// ---------------------------------------------------------------------------
// Signal view model
// ---------------------------------------------------------------------------

export type SignalStatus = 'NORMAL' | 'WARNING' | 'ALARM' | 'UNAVAILABLE' | 'NOT_MAPPED';

/**
 * One row of the Signal screen, and one signal inside a part deep-dive.
 *
 * `warningLimit` / `criticalLimit` are the limits configured on the rack
 * channel; `processLimit` is the model's own registered hard constraint. They
 * are separate fields because they are separate authorities — a channel alarm
 * is a commissioning decision, a process constraint is an engineering one — and
 * collapsing them would make it impossible to say which was breached.
 */
export type SignalView = {
  tag: ExtruderTag;
  /** What the tag measures, in the model's words. */
  measures: string;
  /** What the operator named the point on the canvas. */
  point: string;
  kind: SignalKind;
  part: MachinePart;
  value: number | null;
  unit: string;
  /** Learned or configured normal value, when the model has one. */
  reference: number | null;
  referenceNote: string;
  behaviour: SignalBehaviour;
  behaviourDetail: string;
  warningLimit: number | null;
  criticalLimit: number | null;
  processLimit: { name: string; operator: string; limit: number; unit: string } | null;
  status: SignalStatus;
  /** The pipeline's data-quality verdict, kept separate from severity. */
  quality: string;
  qualityNotes: string[];
  updated: string;
  source: string;
  /** Acquisition chain, for the expanded row. */
  channel: string;
  history: (number | null)[];
  /** True when the signal informs a part it does not belong to. */
  missing?: { essential: boolean; note: string };
};

/**
 * Severity of one signal against its *configured* limits.
 *
 * Severity only — never data quality. A reading can be comfortably inside every
 * limit and still be untrustworthy, and a screen that folds the two together
 * cannot tell an operator which of the two is true. Quality travels on its own
 * field.
 *
 * Limits are compared as upper bounds because that is how every limit this
 * machine configures is written; a channel with no limit set returns NORMAL
 * rather than being assumed safe, and the Signal screen counts it separately so
 * "no limit configured" can never masquerade as "inside limits".
 */
export function resolveSignalStatus(
  value: number | null,
  warningLimit: number | null,
  criticalLimit: number | null,
): SignalStatus {
  if (value === null || !Number.isFinite(value)) return 'UNAVAILABLE';
  if (criticalLimit !== null && value >= criticalLimit) return 'ALARM';
  if (warningLimit !== null && value >= warningLimit) return 'WARNING';
  return 'NORMAL';
}

// ---------------------------------------------------------------------------
// Part view model
// ---------------------------------------------------------------------------

export type ReasoningStep = {
  key: string;
  label: string;
  value: string;
  /** Longer form, shown under the step. */
  detail: string;
  /** False when the step could not be evaluated from what was measured. */
  evaluated: boolean;
};

export type PartCause = {
  faultId: string;
  name: string;
  matchClass: FaultAssessmentRecord['matchClass'];
  /** Ordinal engineering match score. NOT a probability — never render as a percentage. */
  score: number;
  primaryEvidence: string[];
  contradicting: string[];
  separatingMeasurement: string;
};

export type PartView = {
  part: MachinePart;
  description: string;
  state: PartState;
  /** The most severe current finding on this part, in plain language. */
  headline: string | null;
  signals: SignalView[];
  /** Signals that inform this part without belonging to it. */
  contextSignals: SignalView[];
  causes: PartCause[];
  /**
   * Hypotheses the measurements actively contradict, for this part.
   *
   * Kept and shown rather than filtered away: "the gearbox bearing was
   * considered and ruled out" is a different, more useful statement than the
   * silence of a fault simply never appearing, and it is what stops an operator
   * re-opening the same question on the next shift.
   */
  ruledOut: PartCause[];
  violations: ConstraintCheck[];
  thresholds: TriggeredThreshold[];
  reasoning: ReasoningStep[];
  warningCount: number;
  alarmCount: number;
  faultCount: number;
};

const MATCH_CLASS_LABEL: Record<FaultAssessmentRecord['matchClass'], string> = {
  STRONG_CANDIDATE: 'Most likely',
  CANDIDATE: 'Possible',
  WEAK: 'Less likely',
  INSUFFICIENT: 'Not enough evidence',
  ELIMINATED: 'Ruled out',
};

export function matchClassLabel(matchClass: FaultAssessmentRecord['matchClass']): string {
  return MATCH_CLASS_LABEL[matchClass] ?? matchClass;
}

function humanise(value: string): string {
  return value.replace(/_/g, ' ').toLowerCase();
}

/**
 * The five reasoning steps behind one part's conclusion.
 *
 * Same five stages the pipeline itself runs — integrity, current condition,
 * behaviour over time, signal pattern, fused conclusion — relabelled into the
 * words an operator uses. A stage the measurements could not support says so
 * rather than showing a confident-looking blank.
 */
function reasoningFor(
  part: MachinePart,
  signals: SignalView[],
  causes: PartCause[],
  thresholds: TriggeredThreshold[],
  violations: ConstraintCheck[],
): ReasoningStep[] {
  const withReading = signals.filter((signal) => signal.value !== null);
  const degraded = signals.filter((signal) => signal.quality !== 'GOOD' && signal.value !== null);
  const moving = signals.filter((signal) => signal.behaviour === 'INCREASING' || signal.behaviour === 'DECREASING');
  const fluctuating = signals.filter((signal) => signal.behaviour === 'FLUCTUATING');
  const enoughHistory = signals.some((signal) => signal.behaviour !== 'INSUFFICIENT_HISTORY' && signal.behaviour !== 'UNAVAILABLE');
  const top = causes[0] ?? null;

  const dataCheck: ReasoningStep = {
    key: 'data',
    label: 'Data check',
    value: withReading.length === 0 ? 'No reading' : degraded.length > 0 ? 'Degraded' : 'Reliable',
    detail:
      withReading.length === 0
        ? `No signal on the ${part} is currently reporting, so nothing downstream of this step was evaluated.`
        : degraded.length > 0
          ? `${degraded.length} of ${signals.length} signals carry a data-quality limitation, which narrows what can be concluded.`
          : `${withReading.length} of ${signals.length} signals are reporting and passed the integrity checks.`,
    evaluated: withReading.length > 0,
  };

  const condition: ReasoningStep = {
    key: 'condition',
    label: 'Current condition',
    value:
      violations.length > 0
        ? 'Limit exceeded'
        : thresholds.length > 0
          ? 'Above normal'
          : withReading.length === 0
            ? 'Not evaluated'
            : 'Within normal',
    detail:
      violations.length > 0
        ? violations.map((check) => `${check.name} is outside its hard process limit.`).join(' ')
        : thresholds.length > 0
          ? `${thresholds.length} registered decision boundary${thresholds.length === 1 ? '' : 'ies'} crossed on this part.`
          : withReading.length === 0
            ? 'No current values to compare against the registered boundaries.'
            : 'No registered decision boundary is crossed by the current values.',
    evaluated: withReading.length > 0,
  };

  const overTime: ReasoningStep = {
    key: 'temporal',
    label: 'Behaviour over time',
    value: !enoughHistory
      ? 'Not enough history'
      : moving.length > 0
        ? (moving[0].behaviour === 'INCREASING' ? 'Increasing' : 'Decreasing')
        : fluctuating.length > 0
          ? 'Fluctuating'
          : 'Steady',
    detail: !enoughHistory
      ? 'Fewer samples than a trend needs have been collected this session. No direction is claimed from them.'
      : moving.length > 0
        ? moving.map((signal) => `${signal.measures} is ${signal.behaviour.toLowerCase()}.`).join(' ')
        : fluctuating.length > 0
          ? fluctuating.map((signal) => `${signal.measures} is varying around its trend.`).join(' ')
          : 'Every signal on this part is holding inside its recent band.',
    evaluated: enoughHistory,
  };

  const pattern: ReasoningStep = {
    key: 'pattern',
    label: 'Signal pattern',
    value: top ? humanise(top.matchClass) : thresholds.length > 0 ? 'No matching pattern' : 'Nothing observed',
    detail: top
      ? top.primaryEvidence[0] ?? `The measurements are consistent with ${top.name.toLowerCase()}.`
      : thresholds.length > 0
        ? 'Boundaries were crossed, but the combination does not match any controlled fault signature for this part.'
        : 'No signature-level pattern is present in this part’s measurements.',
    evaluated: withReading.length > 0,
  };

  const conclusion: ReasoningStep = {
    key: 'conclusion',
    label: 'Conclusion',
    value: top ? top.name : violations.length > 0 ? 'Limit breach' : withReading.length === 0 ? 'Withheld' : 'No fault',
    detail: top
      ? top.separatingMeasurement
        ? `To separate this from the alternatives, measure: ${top.separatingMeasurement}.`
        : 'The installed sensors separate this candidate from the alternatives.'
      : violations.length > 0
        ? 'A hard process limit is exceeded. That is reported on its own terms, not as a machine fault.'
        : withReading.length === 0
          ? 'No conclusion is offered for a part with no trustworthy measurement.'
          : 'No controlled fault signature is met on this part.',
    evaluated: withReading.length > 0,
  };

  return [dataCheck, condition, overTime, pattern, conclusion];
}

export type BuildPartViewsArgs = {
  analysis: ExtruderAnalysisResult;
  /** One `SignalView` per resolved tag, already joined to its acquisition chain. */
  signals: SignalView[];
};

/**
 * Group everything the pipeline concluded onto the seven machine parts.
 *
 * Every part is returned, including the healthy ones and the ones this machine
 * has no sensor for. A part that is absent from the list would read as "nothing
 * to report here", which is a different statement from "nothing is measuring
 * this" — and the second is the one an operator has to know.
 */
export function buildPartViews({ analysis, signals }: BuildPartViewsArgs): PartView[] {
  const detail = analysis.extruder;
  const candidates = detail.assessments.filter((assessment) => detail.candidateFaults.includes(assessment.faultId));
  const anomalyTags = new Set(
    analysis.anomaly.contributors.filter((item) => item.direction !== 'normal').map((item) => item.code),
  );

  return PART_ORDER.map((part) => {
    const owned = signals.filter((signal) => signal.part === part && !signal.missing);
    const context = signals.filter((signal) => signal.part !== part && relatedParts(signal.tag).includes(part));
    const unmapped = signals.filter((signal) => signal.part === part && signal.missing);

    const partCandidates = candidates.filter((assessment) => partForFault(assessment.faultId) === part);
    const partEliminated = detail.assessments.filter(
      (assessment) => assessment.matchClass === 'ELIMINATED' && partForFault(assessment.faultId) === part,
    );
    const violations = detail.constraints.filter(
      (check) => check.status === 'VIOLATION' && partsForConstraint(check.constraintId).includes(part),
    );
    const thresholds = detail.triggeredThresholds.filter(
      (threshold) => threshold.sensor in TAG_LABELS && partForTag(threshold.sensor as ExtruderTag) === part,
    );
    const watched = owned.filter((signal) => anomalyTags.has(signal.tag));

    // Mapped from what the pipeline decided — never a second opinion on it.
    let state: PartState = 'NORMAL';
    if (owned.length === 0 || owned.every((signal) => signal.value === null)) state = 'UNAVAILABLE';
    if (watched.length > 0) state = worsePartState(state, 'WATCH');
    if (thresholds.length > 0) state = worsePartState(state, 'ATTENTION');
    if (violations.length > 0) state = worsePartState(state, 'ALARM');
    if (partCandidates.length > 0) state = worsePartState(state, 'FAULT');

    const toCause = (assessment: FaultAssessmentRecord): PartCause => ({
      faultId: assessment.faultId,
      name: assessment.faultName || faultName(assessment.faultId),
      matchClass: assessment.matchClass,
      score: assessment.engineeringMatchScore,
      primaryEvidence: assessment.primary.map((item) => item.description),
      contradicting: assessment.contradicting.map((item) => item.description),
      separatingMeasurement: assessment.separatingMeasurement,
    });

    const causes: PartCause[] = partCandidates
      .slice()
      .sort((a, b) => b.engineeringMatchScore - a.engineeringMatchScore)
      .map(toCause);

    const headline =
      causes[0]?.name ??
      (violations[0] ? `${violations[0].name} is outside its hard process limit` : null) ??
      (thresholds[0] ? `${TAG_LABELS[thresholds[0].sensor as ExtruderTag] ?? thresholds[0].sensor} crossed a registered boundary` : null) ??
      (watched[0] ? `${watched[0].measures} is away from its learned normal` : null) ??
      (state === 'UNAVAILABLE'
        ? owned.length === 0
          ? unmapped.length > 0
            ? 'No point on this machine is mapped to this part'
            : 'This machine carries no sensor for this part'
          : 'No signal on this part is currently reporting'
        : null);

    return {
      part,
      description: PART_DESCRIPTION[part],
      state,
      headline,
      signals: owned,
      contextSignals: context,
      causes,
      ruledOut: partEliminated.map(toCause),
      violations,
      thresholds,
      reasoning: reasoningFor(part, owned, causes, thresholds, violations),
      warningCount: thresholds.length,
      alarmCount: violations.length,
      faultCount: partCandidates.length,
    } satisfies PartView;
  });
}

// ---------------------------------------------------------------------------
// Key changes
// ---------------------------------------------------------------------------

export type KeyChange = {
  tag: ExtruderTag;
  label: string;
  from: string;
  to: string;
  direction: 'UP' | 'DOWN' | 'FLAT';
  note: string;
};

/**
 * The measurements that have actually moved this session, most-moved first.
 *
 * Reported as from → to over the retained window rather than as a rate, because
 * "1.67 → 5.20 mm/s" is a sentence an operator can act on and "0.03 mm/s per
 * sample" is not. Signals without enough history are omitted entirely rather
 * than listed as unchanged, which would be a claim the data cannot support.
 */
export function buildKeyChanges(signals: SignalView[], limit = 5): KeyChange[] {
  const rows = signals
    .filter((signal) => !signal.missing)
    .map((signal) => {
      const usable = signal.history.filter((value): value is number => value !== null && Number.isFinite(value));
      if (usable.length < MIN_SAMPLES) return null;
      const first = usable[0];
      const last = usable[usable.length - 1];
      const spread = Math.max(...usable) - Math.min(...usable);
      const scale = signal.reference !== null && signal.reference !== 0 ? Math.abs(signal.reference) : spread || Math.abs(last) || 1;
      const share = Math.abs(last - first) / scale;
      const decimals = Math.abs(last) >= 100 ? 0 : 2;
      return {
        tag: signal.tag,
        label: signal.measures,
        from: `${first.toFixed(decimals)}`,
        to: `${last.toFixed(decimals)} ${signal.unit}`.trim(),
        direction: (signal.behaviour === 'INCREASING' ? 'UP' : signal.behaviour === 'DECREASING' ? 'DOWN' : 'FLAT') as KeyChange['direction'],
        note: BEHAVIOUR_LABEL[signal.behaviour],
        share,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  return rows
    .sort((a, b) => b.share - a.share)
    .slice(0, limit)
    .map(({ share: _share, ...row }) => row);
}

export { signalKindForTag };
