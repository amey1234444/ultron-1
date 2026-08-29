import type { MachineComponent, MeasurementPointKind } from './machines';
import type { ChannelRef } from './rack';
import { consolePalette, statusTone, type ToneName } from './consoleTheme';
import { STATUS_HEX, type Status } from './status';

// Everything a condition-monitoring / predictive-maintenance view needs to say
// about a reading, kept out of the components so the judgement is testable and
// stated once. Nothing here holds state or touches React.
//
// Scope of honesty, up front: the health score, the failure-mode rules, and the
// remaining-life projection are heuristics over the signals this app actually
// carries (a scalar per channel plus upper alarm limits). They are deliberately
// shaped like the outputs a real prognostic model would produce, so a trained
// model can replace `projectToDanger` and `inferFailureModes` without the UI
// changing — but they are not themselves a trained model. Anything that would
// need data the app does not have (spectra, order analysis, oil debris, low-side
// limits) is called out at the rule that would otherwise claim it.

export type ConditionLevel = 'normal' | 'alert' | 'danger';

export const LEVEL_HEX: Record<ConditionLevel, string> = {
  normal: STATUS_HEX.success,
  alert: STATUS_HEX.warning,
  danger: STATUS_HEX.critical,
};

// Bridges to the app's existing Status vocabulary (Panel/StatusDot speak that,
// not ConditionLevel) — 'normal' is the same idea as 'success'.
export function statusForLevel(level: ConditionLevel): Status {
  // The app-wide Status vocabulary (Panel, StatusDot) predates this page and is
  // used by other screens, so it keeps saying success/warning/critical. Only the
  // mapping lives here.
  return level === 'normal' ? 'success' : level === 'alert' ? 'warning' : 'critical';
}

// A sensor can also be unreachable, which is not a measurement condition at all —
// its rack is offline, so the last value is stale and must not be presented as
// live. Kept separate from ConditionLevel so none of the scoring maths has to
// carry a state it cannot compute with.
export type SensorState = ConditionLevel | 'offline';

export const STATE_LABEL: Record<SensorState, string> = {
  normal: 'NORMAL',
  alert: 'ALERT',
  danger: 'DANGER',
  offline: 'OFFLINE',
};

const OFFLINE_HEX = '#737373';

export function stateHex(state: SensorState): string {
  return state === 'offline' ? OFFLINE_HEX : LEVEL_HEX[state];
}

// --- Theme-aware condition colour --------------------------------------------
//
// `LEVEL_HEX` above is a module constant, so it cannot know which theme is on
// screen. It is the dark ramp, and it stays that way: it is what the pure
// derivation modules (which have no React context) hand to callers, and it is
// correct on the console's primary theme.
//
// A component that renders a state DOES know the theme, and light mode needs a
// genuinely different ramp — see the note at the top of `consoleTheme.ts`. So
// anything drawn resolves its colour through these instead, which return the
// dark values unchanged and the deeper light ones on a white ground.
//
// The mapping is one-to-one with `ConditionLevel`, so nothing about which state
// a reading is in changes here — only what that state is painted.

/** The three condition levels as one tone name each. */
const TONE_FOR_LEVEL: Record<SensorState, ToneName> = {
  normal: 'normal',
  alert: 'alert',
  danger: 'danger',
  offline: 'offline',
};

/** The full tone (word / value / dot / soft fill / tinted border) for a state. */
export function stateTone(state: SensorState, isDark: boolean) {
  return statusTone(consolePalette(isDark), TONE_FOR_LEVEL[state]);
}

/** The colour a state's *word* and marks are set in, for the current theme. */
export function stateHexFor(state: SensorState, isDark: boolean): string {
  return stateTone(state, isDark).fg;
}

/** The colour a state's live *number* is set in, for the current theme. */
export function stateValueHexFor(state: SensorState, isDark: boolean): string {
  return stateTone(state, isDark).value;
}

/**
 * `LEVEL_HEX`, resolved for the current theme.
 *
 * Drop-in for the constant: `const levels = levelHexes(isDark)` then
 * `levels.alert` wherever `LEVEL_HEX.alert` used to be.
 */
export function levelHexes(isDark: boolean): Record<ConditionLevel, string> {
  const palette = consolePalette(isDark);
  return { normal: palette.accent, alert: palette.warning, danger: palette.critical };
}

// Single place the precedence is decided: unreachable beats every reading, and a
// reading over danger beats one merely over alert.
export function sensorState(level: ConditionLevel, online: boolean): SensorState {
  return online ? level : 'offline';
}

export const LEVEL_RANK: Record<ConditionLevel, number> = { normal: 0, alert: 1, danger: 2 };

export function worstLevel(levels: ConditionLevel[]): ConditionLevel {
  return levels.reduce<ConditionLevel>((worst, l) => (LEVEL_RANK[l] > LEVEL_RANK[worst] ? l : worst), 'normal');
}

// The plausible operating band for a measurement kind. Structurally the same as
// liveValue.ts's LIVE_RANGE_FOR_LETTER entries, declared here so this module
// stays free of component imports — callers pass the band in.
export type MeasurementBand = { min: number; max: number; decimals: number };

export const KIND_FOR_LETTER: Record<ChannelRef['letter'], MeasurementPointKind | 'Unknown'> = {
  V: 'Vibration',
  T: 'Temperature',
  S: 'Speed',
  P: 'Pressure',
  C: 'Current',
  X: 'Unknown',
};

// --- Thresholds -------------------------------------------------------------

export type Thresholds = {
  alert: number;
  danger: number;
  lowAlert?: number;
  lowDanger?: number;
  healthy?: number;
};

export type ResolvedThresholds = Thresholds & {
  // False when the card carried no alarm limits and these were inferred from the
  // measurement band instead. The UI must not present inferred limits as
  // commissioned ones — an uncommissioned channel looking "healthy" against a
  // made-up limit is exactly the false comfort this flag exists to prevent.
  configured: boolean;
};

const INFERRED_ALERT_FRACTION = 0.75;
const INFERRED_DANGER_FRACTION = 0.92;

export function resolveThresholds(
  channel: Pick<ChannelRef, 'alarmLowCritical' | 'alarmLowWarning' | 'alarmWarning' | 'alarmCritical' | 'healthyValue'>,
  band: MeasurementBand,
): ResolvedThresholds {
  const span = band.max - band.min || 1;
  // The card config fields keep their existing names (alarmWarning /
  // alarmCritical) — they are part of lib/rack.ts and used by other screens. Only
  // this page's vocabulary is alert/danger.
  const alert = channel.alarmWarning ?? band.min + span * INFERRED_ALERT_FRACTION;
  // A config with danger below alert is a data-entry error, not something to
  // crash or silently invert on — clamp so every downstream band stays ordered.
  const danger = Math.max(channel.alarmCritical ?? band.min + span * INFERRED_DANGER_FRACTION, alert);
  const lowAlert = channel.alarmLowWarning === undefined ? undefined : Math.min(channel.alarmLowWarning, alert);
  const lowDanger =
    channel.alarmLowCritical === undefined ? undefined : Math.min(channel.alarmLowCritical, lowAlert ?? alert);
  const healthy =
    channel.healthyValue === undefined || !Number.isFinite(channel.healthyValue)
      ? undefined
      : Math.min(Math.max(channel.healthyValue, band.min), band.max);

  return {
    alert,
    danger,
    lowAlert,
    lowDanger,
    healthy,
    configured:
      channel.alarmWarning !== undefined ||
      channel.alarmCritical !== undefined ||
      channel.alarmLowWarning !== undefined ||
      channel.alarmLowCritical !== undefined,
  };
}

// Single-sided, matching the rest of the app (AlarmView and TrendView both test
// `value >= threshold`). Real condition monitoring also needs low-side limits —
// a pump losing suction pressure or a motor losing speed is a fault that reads
// as "comfortably below alert" here. Supporting those means adding low-side
// fields to the card configs in lib/rack.ts; until then this module cannot see
// that class of fault and does not pretend to.
export function levelFor(value: number, t: Thresholds): ConditionLevel {
  if (t.lowDanger !== undefined && value <= t.lowDanger) return 'danger';
  if (t.lowAlert !== undefined && value <= t.lowAlert) return 'alert';
  if (value >= t.danger) return 'danger';
  if (value >= t.alert) return 'alert';
  return 'normal';
}

// --- ISO 10816-3 vibration severity zones -----------------------------------

// Zone A = newly commissioned, B = unrestricted long-term operation, C =
// short-term operation only, D = damage likely. Boundaries are velocity RMS in
// mm/s and depend on the machine's power rating and foundation stiffness, so the
// group is a per-machine property rather than a constant.
export const ISO_10816_GROUPS = {
  'group2-rigid': { label: 'Group 2 / rigid', ab: 1.4, bc: 2.8, cd: 4.5 },
  'group2-flexible': { label: 'Group 2 / flexible', ab: 2.3, bc: 4.5, cd: 7.1 },
  'group1-rigid': { label: 'Group 1 / rigid', ab: 2.3, bc: 4.5, cd: 7.1 },
  'group1-flexible': { label: 'Group 1 / flexible', ab: 3.5, bc: 7.1, cd: 11.0 },
} as const;

export type IsoGroup = keyof typeof ISO_10816_GROUPS;
export type IsoZone = 'A' | 'B' | 'C' | 'D';

// Group 2 rigid (15-300 kW on a rigid foundation) covers the motor, pump and fan
// sizes this app is aimed at, so it is the default when a machine has not been
// told which group it belongs to.
export const DEFAULT_ISO_GROUP: IsoGroup = 'group2-rigid';

export function isoZone(velocityRms: number, group: IsoGroup = DEFAULT_ISO_GROUP): IsoZone {
  const g = ISO_10816_GROUPS[group];
  if (velocityRms >= g.cd) return 'D';
  if (velocityRms >= g.bc) return 'C';
  if (velocityRms >= g.ab) return 'B';
  return 'A';
}

export const ISO_ZONE_LEVEL: Record<IsoZone, ConditionLevel> = {
  A: 'normal',
  B: 'normal',
  C: 'alert',
  D: 'danger',
};

// --- Health score -----------------------------------------------------------

// Breakpoints for the 0-100 score. These are a presentation choice, not a
// standard: they exist so the score moves visibly before an alarm trips, which
// is the only reason to show a condition score next to a plain alarm state.
const HEALTH_AT_ALERT = 70;
const HEALTH_AT_DANGER = 30;

export function pointHealth(value: number, t: Thresholds, band: MeasurementBand): number {
  if (t.lowDanger !== undefined && value <= t.lowDanger) {
    const width = Math.max((t.lowAlert ?? t.alert) - t.lowDanger, 1);
    const underrun = Math.min(1, (t.lowDanger - value) / width);
    return Math.max(0, HEALTH_AT_DANGER * (1 - underrun));
  }

  if (t.lowAlert !== undefined && value <= t.lowAlert) {
    const lowDanger = t.lowDanger ?? band.min;
    const f = (value - lowDanger) / (t.lowAlert - lowDanger || 1);
    return HEALTH_AT_DANGER + Math.max(0, f) * (HEALTH_AT_ALERT - HEALTH_AT_DANGER);
  }

  if (value > t.danger) {
    const overrun = Math.min(1, (value - t.danger) / (t.danger - t.alert || 1));
    return Math.max(0, HEALTH_AT_DANGER * (1 - overrun));
  }

  if (value >= t.alert) {
    const f = (value - t.alert) / (t.danger - t.alert || 1);
    return HEALTH_AT_ALERT - f * (HEALTH_AT_ALERT - HEALTH_AT_DANGER);
  }

  const normalLow = t.lowAlert ?? band.min;
  const normalHigh = t.alert;
  const target = Math.min(Math.max(t.healthy ?? (normalLow + normalHigh) / 2, normalLow), normalHigh);
  const sideSpan = value < target ? target - normalLow : normalHigh - target;
  const distance = Math.abs(value - target);
  const f = sideSpan > 0 ? Math.min(1, distance / sideSpan) : 0;
  return 100 - f * 10;
}

// Worst-point-dominant. A machine with one bearing about to fail is not "mostly
// healthy" because its other eleven points are fine, so the minimum carries most
// of the weight and the mean only modulates it.
const WORST_WEIGHT = 0.65;

export function aggregateHealth(scores: number[]): number | null {
  if (scores.length === 0) return null;
  const worst = Math.min(...scores);
  const mean = scores.reduce((sum, s) => sum + s, 0) / scores.length;
  return WORST_WEIGHT * worst + (1 - WORST_WEIGHT) * mean;
}

// --- Trend fit and remaining-life projection --------------------------------

export type Trend = {
  // Least-squares slope in engineering units per hour of plant time.
  slopePerHour: number;
  // Coefficient of determination of that fit, 0-1: how much of the movement a
  // straight line actually explains.
  r2: number;
  // Student's t for the slope against zero, and the gate that actually does the
  // work. R-squared alone is far too weak here: a driftless random walk
  // accumulates, so over a short window it frequently *looks* linear — the
  // classic spurious-regression result — and clears any reasonable r-squared bar.
  // Measured over synthetic driftless walks, an r-squared floor of 0.35 on its
  // own admitted a quarter to a half of them as confident projections, which is
  // exactly the failure this whole gate exists to prevent.
  //
  // Caveat worth keeping in mind: t assumes independent residuals, and real
  // readings are autocorrelated, which inflates it. So the threshold below is
  // set from measurement against known-trendless and known-degrading signals
  // rather than read off a significance table, and it is not a p-value.
  tStatistic: number;
  samples: number;
};

export function fitTrend(values: number[], sampleIntervalHours: number): Trend | null {
  const n = values.length;
  if (n < 4 || sampleIntervalHours <= 0) return null;

  const meanX = (n - 1) / 2;
  const meanY = values.reduce((sum, v) => sum + v, 0) / n;

  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (i - meanX) * (values[i] - meanY);
    sxx += (i - meanX) * (i - meanX);
  }
  if (sxx === 0) return null;

  const slopePerSample = sxy / sxx;
  const intercept = meanY - slopePerSample * meanX;

  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i++) {
    const fitted = intercept + slopePerSample * i;
    ssRes += (values[i] - fitted) ** 2;
    ssTot += (values[i] - meanY) ** 2;
  }
  // A perfectly flat signal has nothing to explain; call that a clean fit with
  // zero slope rather than dividing by zero.
  const r2 = ssTot === 0 ? 1 : Math.max(0, 1 - ssRes / ssTot);

  // Standard error of the slope, then t. A residual-free fit (a perfect ramp, or
  // a flat line) has zero standard error: report that as infinitely significant
  // when the slope is non-zero, and as no signal at all when it is flat, rather
  // than as a division by zero.
  const slopeStandardError = Math.sqrt(ssRes / Math.max(1, n - 2) / sxx);
  const tStatistic =
    slopeStandardError === 0 ? (slopePerSample === 0 ? 0 : Number.POSITIVE_INFINITY) : slopePerSample / slopeStandardError;

  return { slopePerHour: slopePerSample / sampleIntervalHours, r2, tStatistic, samples: n };
}

// Movement across the whole window smaller than this is noise, not a direction.
// Shared by the point cards' trend arrow and the machine-level "moving up" count
// so the page cannot show four rising arrows above a tile that says two: those
// were originally two different definitions of rising, which reads as a bug in
// whichever number the eye lands on second.
export const TREND_FLAT_BAND = 0.02;

export type Confidence = 'none' | 'low' | 'medium' | 'high';

export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  none: 'no trend',
  low: 'low',
  medium: 'medium',
  high: 'high',
};

// Below this the straight line explains too little of the movement to project
// from — the honest answer is "no measurable trend", not a large number.
const MIN_R2_FOR_PROJECTION = 0.35;
// And the slope has to be distinguishable from zero. See the note on
// Trend.tStatistic for why r-squared cannot carry this on its own.
//
// 12 is measured, not chosen: over the steady and drifting signal populations the
// app actually produces, at a 96-sample window steady points reach |t| ~11 at
// the 99th percentile and genuinely drifting ones start around 13. This sits in
// that gap. It is tied to the window length — see HISTORY_LENGTH in
// overview/useConditionHistory.ts, which explains why 48 samples has no such gap.
const MIN_T_FOR_PROJECTION = 12;
// Past a year the projection says nothing useful and reads as false precision.
const MAX_PROJECTION_DAYS = 365;

function confidenceFor(trend: Trend): Confidence {
  if (trend.r2 < MIN_R2_FOR_PROJECTION || Math.abs(trend.tStatistic) < MIN_T_FOR_PROJECTION) return 'none';
  if (trend.r2 < 0.55) return 'low';
  if (trend.r2 < 0.78) return 'medium';
  return 'high';
}

export type Prognosis = {
  // Days until the trend reaches the critical limit, or null when there is no
  // trend worth projecting (flat, falling, or too noisy to fit).
  daysToDanger: number | null;
  confidence: Confidence;
  slopePerDay: number;
  r2: number;
};

export const NO_PROGNOSIS: Prognosis = { daysToDanger: null, confidence: 'none', slopePerDay: 0, r2: 0 };

// Straight-line extrapolation of the fitted trend to the critical limit. Real
// degradation is rarely linear — bearing wear in particular accelerates — so
// this is the conservative-in-shape, optimistic-in-timing baseline that a fitted
// model should replace. It is deliberately the only place remaining life is
// computed, so that swap is one function.
export function projectToDanger(values: number[], t: Thresholds, sampleIntervalHours: number): Prognosis {
  const trend = fitTrend(values, sampleIntervalHours);
  if (!trend) return NO_PROGNOSIS;

  const slopePerDay = trend.slopePerHour * 24;
  const confidence = confidenceFor(trend);
  const base = { confidence, slopePerDay, r2: trend.r2 };

  // Already over the line: remaining life is not a forecast any more.
  const latest = values[values.length - 1];
  if (latest >= t.danger) return { ...base, daysToDanger: 0 };
  if (t.lowDanger !== undefined && latest <= t.lowDanger) return { ...base, daysToDanger: 0 };

  // Nothing to project from. Improving or holding steady is good news, but it is
  // not a date.
  if (confidence === 'none' || slopePerDay === 0) return { ...base, daysToDanger: null, confidence: 'none' };

  const target = slopePerDay < 0 && t.lowDanger !== undefined ? t.lowDanger : t.danger;
  const days = (target - latest) / slopePerDay;
  return { ...base, daysToDanger: days < 0 || days > MAX_PROJECTION_DAYS ? null : days };
}

// Companion to formatRul for backward-looking spans, so a twelve-day history
// window reads as "12 d" rather than "282 h".
export function formatHours(hours: number): string {
  if (hours < 48) return `${Math.round(hours)} h`;
  return `${Math.round(hours / 24)} d`;
}

export function formatRul(days: number | null): string {
  if (days === null) return '--';
  if (days <= 0) return 'now';
  // A reading sitting just under its limit projects to a fraction of an hour,
  // which rounded to the nearest hour renders as "0 h" — a number that reads as
  // broken rather than as urgent.
  if (days * 24 < 1) return '<1 h';
  if (days < 1) return `${Math.round(days * 24)} h`;
  if (days < 60) return `${Math.round(days)} d`;
  return `${Math.round(days / 30)} mo`;
}

// --- Failure-mode inference -------------------------------------------------

export type PointEvidence = {
  id: string;
  code: string;
  label: string;
  kind: MeasurementPointKind | 'Unknown';
  level: ConditionLevel;
  value: number;
  unit: string;
  decimals: number;
  rising: boolean;
};

export type Diagnosis = {
  id: string;
  label: string;
  confidence: Exclude<Confidence, 'none'>;
  recommendation: string;
  // The readings that triggered it, so the UI can show why rather than asserting
  // a fault the operator has to take on trust.
  evidence: PointEvidence[];
};

type Rule = {
  id: string;
  label: string;
  confidence: Exclude<Confidence, 'none'>;
  recommendation: string;
  // Returns the supporting readings, or null when the signature is absent.
  detect: (elevated: PointEvidence[]) => PointEvidence[] | null;
};

const ofKind = (points: PointEvidence[], kind: MeasurementPointKind) => points.filter((p) => p.kind === kind);

// Ordered most-specific first: the first rule that matches a signature claims
// its evidence, so "vibration and temperature together" is reported as bearing
// wear rather than also as a bare unbalance.
//
// These are the classic single-value signatures — what you can conclude from
// broadband amplitudes and temperatures alone. The faults that need spectral
// data (bearing defect frequencies, the 2x/1x ratio that properly separates
// misalignment from unbalance, gear mesh sidebands) cannot be distinguished
// here, and the confidence levels are set accordingly: nothing claims 'high'
// unless two independent measurement kinds agree.
const RULES: Rule[] = [
  {
    id: 'bearing-wear',
    label: 'Bearing wear',
    confidence: 'high',
    recommendation: 'Inspect the bearing and check lubrication; collect a spectrum to confirm defect frequencies.',
    detect: (e) => {
      const vib = ofKind(e, 'Vibration');
      const temp = ofKind(e, 'Temperature');
      return vib.length > 0 && temp.length > 0 ? [...vib, ...temp] : null;
    },
  },
  {
    id: 'misalignment',
    label: 'Misalignment or coupling wear',
    confidence: 'medium',
    recommendation: 'Check shaft alignment cold and hot, and inspect the coupling element.',
    // Elevated in more than one measurement plane points at a shaft-line problem
    // rather than a single unbalanced element. Confirming it properly needs the
    // 2x/1x ratio and an axial reading, neither of which is available here.
    detect: (e) => {
      const vib = ofKind(e, 'Vibration');
      return vib.length >= 2 ? vib : null;
    },
  },
  {
    id: 'unbalance',
    label: 'Unbalance or looseness',
    confidence: 'low',
    recommendation: 'Trend the point; if it keeps rising, collect a spectrum and check for 1x dominance before balancing.',
    detect: (e) => {
      const vib = ofKind(e, 'Vibration');
      return vib.length === 1 ? vib : null;
    },
  },
  {
    id: 'lubrication',
    label: 'Lubrication or cooling fault',
    confidence: 'medium',
    recommendation: 'Check lubricant level and condition, and verify cooling airflow is unobstructed.',
    // Heat without vibration: the bearing is running hot but not yet damaged,
    // which is the window where a lubrication fix is still cheap.
    detect: (e) => {
      const temp = ofKind(e, 'Temperature');
      return temp.length > 0 && ofKind(e, 'Vibration').length === 0 ? temp : null;
    },
  },
  {
    id: 'overload',
    label: 'Mechanical overload',
    confidence: 'medium',
    recommendation: 'Compare load against the nameplate rating and check for a downstream restriction or process upset.',
    detect: (e) => {
      const current = ofKind(e, 'Current');
      return current.length > 0 ? current : null;
    },
  },
  {
    id: 'process-deviation',
    label: 'Process deviation',
    confidence: 'low',
    recommendation: 'Confirm against the process setpoint before treating this as a machine fault.',
    // Only the high side is visible: with upper limits alone, cavitation and
    // loss of suction — the pressure faults that actually matter on a pump —
    // read as healthy. See the note on levelFor.
    detect: (e) => {
      const process = [...ofKind(e, 'Pressure'), ...ofKind(e, 'Speed')];
      return process.length > 0 ? process : null;
    },
  },
];

export function inferFailureModes(points: PointEvidence[]): Diagnosis[] {
  const elevated = points.filter((p) => p.level !== 'normal');
  if (elevated.length === 0) return [];

  const claimed = new Set<string>();
  const found: Diagnosis[] = [];

  for (const rule of RULES) {
    const evidence = rule.detect(elevated);
    if (!evidence || evidence.length === 0) continue;
    // Don't report a second mode off readings a more specific rule already
    // explained — one elevated point should not generate three diagnoses.
    if (evidence.every((p) => claimed.has(p.id))) continue;
    evidence.forEach((p) => claimed.add(p.id));
    found.push({ id: rule.id, label: rule.label, confidence: rule.confidence, recommendation: rule.recommendation, evidence });
  }

  return found;
}

// --- Attributing channels to machine components -----------------------------

// The saved mapping (TrailBoard's Box) records which rack channel a label is
// wired to, but not which machine component it belongs to, so per-component
// health has to be recovered rather than read. Tiers, best first:
//
//   1. An explicit component id on the box. This needs `componentId?: string`
//      added to Box in TrailBoard.tsx and set when a box is placed. Nothing
//      writes it today; the parameter exists so this becomes exact the moment
//      something does.
//   2. The box label containing a component's measurement-point label, which is
//      how the shipped templates read ("RAV-01 DE Vibration H" matches the
//      Motor's "DE Vibration H"). Longest match wins, so a more specific point
//      label beats a shorter one contained inside it.
//   3. The box label containing a component's own label ("RAV-01 Rotor Bearing
//      Temp" matches the "Rotor" component).
//
// Returns null when none of those land, which the UI shows as unattributed
// rather than guessing a component and then reporting confident nonsense about
// its health.
export function attributeToComponent(
  boxLabel: string,
  components: MachineComponent[],
  explicitComponentId?: string,
): string | null {
  if (explicitComponentId && components.some((c) => c.id === explicitComponentId)) return explicitComponentId;

  const haystack = boxLabel.toLowerCase();

  let best: { componentId: string; length: number } | null = null;
  for (const component of components) {
    for (const point of component.points) {
      const needle = point.label.toLowerCase();
      if (needle.length > 0 && haystack.includes(needle) && (!best || needle.length > best.length)) {
        best = { componentId: component.id, length: needle.length };
      }
    }
  }
  if (best) return best.componentId;

  for (const component of components) {
    const needle = component.label.toLowerCase();
    if (needle.length > 0 && haystack.includes(needle)) return component.id;
  }

  return null;
}
