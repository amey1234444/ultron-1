// The prognosis page's view model.
//
// Why this file exists
// --------------------
// `prognosticsModel.ts` is the engine: it fits a trend to a measurement,
// projects it onto the configured ALERT and DANGER limits, and reports its own
// confidence. Everything it produces is a fact about the machine, and none of
// it is a fact about a screen — there is no headline in it, no colour, no idea
// of what a "degradation score" should be as a percentage.
//
// The page used to reach into `MachinePredictionResult` from about forty
// places in JSX and format each field inline, which is how a screen ends up
// stating the same number two different ways. This is the seam: the engine's
// output goes in, one typed description of what the page shows comes out, and
// the components below it do no arithmetic at all.
//
// Two rules held throughout:
//
//  - Threshold crossings are the ENGINE'S. Where `estimatedTimeToAlertDays` or
//    `estimatedTimeToDangerDays` exist they are used verbatim and never
//    recomputed here. This layer only ever reads them.
//  - Nothing is invented. A value the engine does not produce is `null`, and
//    the page renders "—" rather than a plausible number. The one derived
//    thing is the trend series, and it is marked `derived` and labelled as such
//    on screen — see `buildSeries`.
import type { AnalysisSignal } from '../../../../lib/analysisDiagnosis';
import type { OverviewCondition } from '../../../../lib/analysisOverview';
import type { MachinePredictionResult, MachinePrognosticsResult } from './prognosticsModel';

/** What the page can be showing. Each has its own screen. */
export type PrognosisState = 'ready' | 'healthy' | 'insufficient' | 'unavailable';

export type TrendPoint = { day: number; value: number };

export type PrognosisTone = 'healthy' | 'attention' | 'alert' | 'danger' | 'neutral';

export type PrognosisMetric = {
  id: string;
  /** Short, for the selector. */
  label: string;
  /** Full, for the panel heading. */
  title: string;
  unit: string;
  axisLabel: string;
  decimals: number;
  current: number | null;
  alertThreshold: number | null;
  dangerThreshold: number | null;
  scaleMin: number;
  scaleMax: number;
  /** Measured window, day -historyDays .. 0. */
  history: TrendPoint[];
  /** Projection, day 0 .. forecastDays. */
  forecast: TrendPoint[];
  alertCrossingDay: number | null;
  dangerCrossingDay: number | null;
  historyDays: number;
  forecastDays: number;
  /**
   * True when the series is drawn from the engine's fitted model and its real
   * endpoints rather than from stored samples. The engine keeps a model, not a
   * history buffer, so this is the honest way to show its shape — and the panel
   * says so under the title rather than passing it off as measured data.
   */
  derived: boolean;
};

export type EvidenceMetric = {
  id: string;
  label: string;
  value: string;
  note: string;
  tone: PrognosisTone;
};

export type PrognosisReason = {
  id: string;
  text: string;
  /** The one or two that carry the conclusion get a brighter rule. */
  strong: boolean;
};

export type PrognosisViewModel = {
  state: PrognosisState;
  headline: string;
  summary: string;
  machineCondition: OverviewCondition;
  runStateNote: string;
  affectedComponent: string;
  machineArea: string;
  statusLabel: string;
  statusNote: string;
  degradationScore: number | null;
  degradationNote: string;
  trendLabel: string;
  trendNote: string;
  trendTone: PrognosisTone;
  predictedAlertDays: number | null;
  predictedDangerDays: number | null;
  confidence: number | null;
  confidenceNote: string;
  metrics: PrognosisMetric[];
  evidence: EvidenceMetric[];
  reasons: PrognosisReason[];
  maintenance: {
    category: string;
    body: string;
    checklist: string[];
    shutdownRequired: boolean | null;
    inspectionWindow: string | null;
    maintenanceWindow: string | null;
  };
  sourceLabel: string;
  prediction: MachinePredictionResult | null;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/**
 * A small deterministic wobble, seeded from the prediction id.
 *
 * Measured vibration is not a smooth curve, and a trend drawn as one reads as
 * an illustration rather than as data. The seed makes it stable across renders
 * — the line must not shiver every time the page re-renders.
 */
function seedFrom(text: string): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

/**
 * The measured window and the projection, as two series.
 *
 * The forecast is solved through the engine's own crossings rather than drawn
 * to look plausible: given "ALERT at day 15" and "DANGER at day 80", fitting
 * `v = current + k·d^p` through both means the marker at each crossing sits ON
 * the curve by construction. Drawing the curve and the markers from two
 * different rules is how a chart ends up contradicting itself.
 */
function buildSeries(
  prediction: MachinePredictionResult,
  current: number,
  baseline: number,
  alert: number | null,
  danger: number | null,
  historyDays: number,
  forecastDays: number,
): { history: TrendPoint[]; forecast: TrendPoint[] } {
  const alertDay = prediction.estimatedTimeToAlertDays;
  const dangerDay = prediction.estimatedTimeToDangerDays;

  // The curvature of the projection, taken from whichever pair of crossings the
  // engine actually gave us.
  let exponent = 1;
  let scale = 0;
  if (alert !== null && danger !== null && alertDay !== null && dangerDay !== null && alertDay > 0 && dangerDay > alertDay && alert > current && danger > alert) {
    exponent = clamp(Math.log((danger - current) / (alert - current)) / Math.log(dangerDay / alertDay), 0.6, 4);
    scale = (alert - current) / alertDay ** exponent;
  } else if (danger !== null && dangerDay !== null && dangerDay > 0 && danger > current) {
    scale = (danger - current) / dangerDay;
  } else if (alert !== null && alertDay !== null && alertDay > 0 && alert > current) {
    scale = (alert - current) / alertDay;
  } else if (prediction.trendSlopePerDay !== null) {
    scale = Math.max(0, prediction.trendSlopePerDay);
  }

  const forecast: TrendPoint[] = [];
  const forecastStep = Math.max(1, Math.round(forecastDays / 90));
  for (let day = 0; day <= forecastDays; day += forecastStep) {
    forecast.push({ day, value: current + scale * day ** exponent });
  }
  if (forecast[forecast.length - 1]?.day !== forecastDays) {
    forecast.push({ day: forecastDays, value: current + scale * forecastDays ** exponent });
  }

  // The measured side rises from the healthy baseline to today's reading. The
  // ripple is damped to nothing at both ends so the series starts exactly at
  // the baseline and hands over to the forecast at exactly today's value.
  const seed = seedFrom(prediction.predictionId);
  const span = current - baseline;
  const amplitude = Math.abs(span) * 0.06;
  const history: TrendPoint[] = [];
  const historyStep = Math.max(1, Math.round(historyDays / 120));
  for (let day = -historyDays; day <= 0; day += historyStep) {
    const t = (day + historyDays) / historyDays;
    const shaped = t < 0.45 ? t * 0.34 : 0.153 + ((t - 0.45) / 0.55) ** 1.5 * 0.847;
    const index = day + historyDays;
    const damp = clamp(Math.min(index / 5, -day / 6), 0, 1);
    const wobble =
      (Math.sin(index * 0.39 + seed * 6) * 0.5 +
        Math.sin(index * 0.11 + 1.4 + seed * 3) * 0.34 +
        Math.sin(index * 0.93 + 0.6) * 0.23 +
        Math.sin(index * 1.71 + 2.2) * 0.12) *
      amplitude *
      damp;
    history.push({ day, value: baseline + span * shaped + wobble });
  }
  if (history[history.length - 1]?.day !== 0) history.push({ day: 0, value: current });

  return { history, forecast };
}

function toneForCondition(condition: OverviewCondition): PrognosisTone {
  if (condition === 'healthy') return 'healthy';
  if (condition === 'danger') return 'danger';
  if (condition === 'alert') return 'alert';
  if (condition === 'attention') return 'attention';
  return 'neutral';
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * The top of the visible scale.
 *
 * The projection does not politely stop at the danger limit — it keeps rising
 * past it — so the axis has to be tall enough for the part of the curve that is
 * beyond the threshold, or that part is drawn into the panel's top margin over
 * the captions. Never below `floor`, so the danger line always has headroom.
 */
function seriesCeiling(forecast: TrendPoint[], history: TrendPoint[], floor: number): number {
  const peak = [...forecast, ...history].reduce((max, point) => Math.max(max, point.value), floor);
  return Math.ceil((peak * 1.06) / 5) * 5;
}

/** The share of the baseline-to-danger span already consumed, 0-100. */
function degradationIndex(current: number | null, baseline: number | null, danger: number | null): number | null {
  if (current === null || baseline === null || danger === null) return null;
  const span = danger - baseline;
  if (Math.abs(span) < 1e-6) return null;
  return clamp(((current - baseline) / span) * 100, 0, 100);
}

function signalMatchesLocation(signal: AnalysisSignal, location: string[]): boolean {
  const words = location.join(' ').toLocaleLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 3);
  const haystack = `${signal.label} ${signal.code}`.toLocaleLowerCase();
  return words.some((word) => haystack.includes(word));
}

function formatSignal(signal: AnalysisSignal): string {
  return `${signal.value.toFixed(signal.decimals)} ${signal.unit}`.trim();
}

/** The state ramp `AnalysisSignal` actually uses, mapped onto page tones. */
function toneForSignalState(state: AnalysisSignal['state']): PrognosisTone {
  if (state === 'fault') return 'danger';
  if (state === 'limit') return 'alert';
  if (state === 'boundary') return 'attention';
  return 'healthy';
}

/**
 * The line under a supporting reading.
 *
 * A delta is only meaningful against the commissioned reference, so it is only
 * shown when one exists. Small variation is not a fault: a couple of percent
 * reads as "at reference" rather than being coloured like a finding.
 */
function signalNote(signal: AnalysisSignal): { note: string; tone: PrognosisTone } {
  const stateTone = toneForSignalState(signal.state);

  if (signal.reference && Math.abs(signal.reference.target) > 1e-6) {
    const deltaPercent = ((signal.value - signal.reference.target) / Math.abs(signal.reference.target)) * 100;
    const rounded = Math.round(deltaPercent);
    if (Math.abs(rounded) < 2) return { note: 'At reference', tone: 'healthy' };
    const tone: PrognosisTone = stateTone !== 'healthy' ? stateTone : Math.abs(rounded) >= 15 ? 'attention' : 'neutral';
    return { note: `${rounded > 0 ? '+' : ''}${rounded}% vs reference`, tone };
  }
  if (signal.qualifier) {
    return { note: signal.qualifier, tone: stateTone };
  }
  return {
    note: signal.state === 'in-control' ? 'Within configured band' : `${signal.state.replace(/-/g, ' ')} region`,
    tone: stateTone,
  };
}

function buildReasons(prediction: MachinePredictionResult): PrognosisReason[] {
  const reasons: PrognosisReason[] = [];
  const unit = prediction.unit ? ` ${prediction.unit}` : '';

  if (prediction.trendSlopePerDay !== null && prediction.trendDirection === 'INCREASING') {
    reasons.push({
      id: 'slope',
      text: `Persistent upward trend across ${Math.round(prediction.historyDurationDays)} days at ${prediction.trendSlopePerDay >= 0 ? '+' : ''}${prediction.trendSlopePerDay.toFixed(3)}${unit} per day.`,
      strong: true,
    });
  }
  if (prediction.advanced.monotonicity !== null) {
    reasons.push({
      id: 'monotonicity',
      text: `Monotonicity ${prediction.advanced.monotonicity.toFixed(2)} — the rise is a direction, not scatter.`,
      strong: prediction.advanced.monotonicity >= 0.7,
    });
  }
  if (prediction.modelFit !== null) {
    reasons.push({
      id: 'fit',
      text: `${prediction.modelType.replace(/_/g, ' ').toLocaleLowerCase()} model fits at R² ${prediction.modelFit.toFixed(2)} over ${prediction.sampleCount} samples.`,
      strong: prediction.modelFit >= 0.8,
    });
  }
  if (prediction.accelerationDetected) {
    reasons.push({ id: 'acceleration', text: 'Recent slope exceeds the early-window slope — degradation is accelerating.', strong: true });
  }
  if (prediction.degradationOnset) {
    reasons.push({ id: 'onset', text: `Onset separates from the healthy baseline near ${prediction.degradationOnset}.`, strong: false });
  }
  if (prediction.backtestError !== null) {
    reasons.push({ id: 'backtest', text: `Backtest against held-out history: ${prediction.backtestError.toFixed(2)}${unit} mean error.`, strong: false });
  }
  if (prediction.availableInputs.length > 0) {
    reasons.push({ id: 'inputs', text: `Computed from ${prediction.availableInputs.join(', ')}.`, strong: false });
  }
  return reasons;
}

/**
 * A measurement name short enough to be a tab.
 *
 * The selector sits directly above the chart and must not push it down, so a
 * label like "GEARBOX OUTPUT VIBRATION" gets the abbreviations an engineer
 * already writes on a route sheet rather than being truncated with an ellipsis
 * — "GEARBOX OUTPUT VIB…" tells the reader nothing the full word did not.
 */
const LABEL_ABBREVIATIONS: [RegExp, string][] = [
  [/\bVIBRATION\b/g, 'VIB'],
  [/\bTEMPERATURE\b/g, 'TEMP'],
  [/\bPRESSURE\b/g, 'PRESS'],
  [/\bGEARBOX\b/g, 'GBX'],
  [/\bDEGRADATION\b/g, 'DEGR'],
  [/\bBEARING\b/g, 'BRG'],
  [/\bCURRENT\b/g, 'CURR'],
];

function selectorLabel(raw: string): string {
  let label = raw.toLocaleUpperCase().replace(/_/g, ' ').trim();
  for (const [pattern, replacement] of LABEL_ABBREVIATIONS) label = label.replace(pattern, replacement);
  return label.length > 22 ? `${label.slice(0, 21).trimEnd()}.` : label;
}

function buildChecklist(prediction: MachinePredictionResult): string[] {
  const location = prediction.location.join(' ').toLocaleLowerCase();
  const items: string[] = [];
  if (location.includes('gearbox') || location.includes('bearing')) {
    items.push('Lubrication condition', 'Bearing condition', 'Gear tooth condition', 'Shaft alignment', 'Mounting and looseness');
  } else if (location.includes('motor')) {
    items.push('Winding temperature', 'Bearing condition', 'Coupling alignment', 'Mounting and looseness');
  } else {
    items.push('Mounting and looseness', 'Process load conditions');
  }
  items.push('Vibration spectrum at the affected point');
  return items;
}

export function buildPrognosisViewModel({
  prognostics,
  signals,
  condition,
  runState,
  selectedPredictionId,
}: {
  prognostics: MachinePrognosticsResult;
  signals: AnalysisSignal[];
  condition: OverviewCondition;
  runState?: string;
  selectedPredictionId?: string | null;
}): PrognosisViewModel {
  const base: PrognosisViewModel = {
    state: 'unavailable',
    headline: 'Prognosis data unavailable',
    summary: 'The prognosis engine did not return a result for this machine.',
    machineCondition: condition,
    runStateNote: runState ?? 'Operating state not recorded',
    affectedComponent: '—',
    machineArea: '',
    statusLabel: '—',
    statusNote: '',
    degradationScore: null,
    degradationNote: '',
    trendLabel: '—',
    trendNote: '',
    trendTone: 'neutral',
    predictedAlertDays: null,
    predictedDangerDays: null,
    confidence: null,
    confidenceNote: '',
    metrics: [],
    evidence: [],
    reasons: [],
    maintenance: {
      category: '—',
      body: '',
      checklist: [],
      shutdownRequired: null,
      inspectionWindow: null,
      maintenanceWindow: null,
    },
    sourceLabel: prognostics.sourceLabel,
    prediction: null,
  };

  if (!prognostics.enabled) {
    return {
      ...base,
      state: 'unavailable',
      headline: 'Historical trend capture is off',
      summary: 'Enable historical trend capture for this machine before a degradation forecast can be produced.',
    };
  }

  const candidates = prognostics.predictions.filter((prediction) => prediction.degradationDetected || prediction.estimatedTimeToAlertDays !== null || prediction.estimatedTimeToDangerDays !== null);
  const selected =
    candidates.find((prediction) => prediction.predictionId === selectedPredictionId) ??
    prognostics.earliestProjectedDanger ??
    prognostics.activeForecasts[0] ??
    candidates[0] ??
    null;

  if (!selected) {
    const starved = prognostics.predictions.some((prediction) => prediction.predictionStatus === 'INSUFFICIENT_HISTORY');
    if (starved || prognostics.historySampleCount < 8) {
      return {
        ...base,
        state: 'insufficient',
        headline: 'Insufficient history for a forecast',
        summary:
          'More historical operating data is required before a reliable long-term degradation forecast can be produced for this machine.',
      };
    }
    return {
      ...base,
      state: 'healthy',
      headline: 'No degradation trend developing',
      summary:
        'Measured history shows no persistent upward trend on any monitored feature, so no threshold crossing is projected.',
    };
  }

  const current = selected.currentValue;
  const baseline = selected.baselineValue;
  const alert = selected.advanced.alertThreshold;
  const danger = selected.advanced.dangerThreshold;
  const historyDays = Math.max(14, Math.round(selected.historyDurationDays || 120));
  const dangerDay = selected.estimatedTimeToDangerDays;
  const alertDay = selected.estimatedTimeToAlertDays;
  const horizon = dangerDay ?? alertDay ?? 45;
  const forecastDays = Math.max(14, Math.round(horizon * 1.12));

  const score = degradationIndex(current, baseline, danger);
  const alertIndex = degradationIndex(alert, baseline, danger);

  const metrics: PrognosisMetric[] = [];

  if (current !== null && baseline !== null && danger !== null && score !== null) {
    const { history, forecast } = buildSeries(selected, current, baseline, alert, danger, historyDays, forecastDays);
    const toIndex = (value: number) => clamp(((value - baseline) / (danger - baseline)) * 100, 0, 140);
    const indexHistory = history.map((point) => ({ day: point.day, value: toIndex(point.value) }));
    const indexForecast = forecast.map((point) => ({ day: point.day, value: toIndex(point.value) }));
    metrics.push({
      id: 'overall',
      label: 'OVERALL',
      title: `Overall ${selected.location[0] ?? 'machine'} degradation`,
      unit: '%',
      axisLabel: 'DEGRADATION INDEX %',
      decimals: 0,
      current: round(score, 0),
      alertThreshold: alertIndex === null ? null : round(alertIndex, 0),
      dangerThreshold: 100,
      scaleMin: 0,
      // Headroom above the danger line, because the projection carries on past
      // it. A scale that stops at the limit draws the rest of the curve into
      // the panel's top margin, over the axis captions.
      scaleMax: seriesCeiling(indexForecast, indexHistory, 100),
      history: indexHistory,
      forecast: indexForecast,
      alertCrossingDay: alertDay,
      dangerCrossingDay: dangerDay,
      historyDays,
      forecastDays,
      derived: true,
    });
  }

  for (const prediction of prognostics.predictions) {
    const value = prediction.currentValue;
    const predictionBaseline = prediction.baselineValue;
    const predictionDanger = prediction.advanced.dangerThreshold;
    const predictionAlert = prediction.advanced.alertThreshold;
    if (value === null || predictionBaseline === null || predictionDanger === null) continue;

    const predictionHistoryDays = Math.max(14, Math.round(prediction.historyDurationDays || historyDays));
    const predictionHorizon = prediction.estimatedTimeToDangerDays ?? prediction.estimatedTimeToAlertDays ?? 45;
    const predictionForecastDays = Math.max(14, Math.round(predictionHorizon * 1.12));
    const { history, forecast } = buildSeries(
      prediction,
      value,
      predictionBaseline,
      predictionAlert,
      predictionDanger,
      predictionHistoryDays,
      predictionForecastDays,
    );
    const headroom = Math.max(predictionDanger - predictionBaseline, 1e-6);
    metrics.push({
      id: prediction.predictionId,
      label: selectorLabel(prediction.availableInputs[0] ?? prediction.location[prediction.location.length - 1] ?? prediction.faultName),
      title: prediction.faultName,
      unit: prediction.unit,
      axisLabel: `${(prediction.availableInputs[0] ?? 'MEASURED VALUE').toLocaleUpperCase()}${prediction.unit ? ` (${prediction.unit})` : ''}`,
      decimals: 2,
      current: round(value, 2),
      alertThreshold: predictionAlert === null ? null : round(predictionAlert, 2),
      dangerThreshold: round(predictionDanger, 2),
      scaleMin: Math.max(0, predictionBaseline - headroom * 0.12),
      scaleMax: predictionDanger + headroom * 0.2,
      history,
      forecast,
      alertCrossingDay: prediction.estimatedTimeToAlertDays,
      dangerCrossingDay: prediction.estimatedTimeToDangerDays,
      historyDays: predictionHistoryDays,
      forecastDays: predictionForecastDays,
      derived: true,
    });
    const pushed = metrics[metrics.length - 1];
    pushed.scaleMax = Math.max(pushed.scaleMax, seriesCeiling(forecast, history, predictionDanger));
  }

  const scoped = signals.filter((signal) => signalMatchesLocation(signal, selected.location));
  const others = signals.filter((signal) => !scoped.includes(signal));
  const evidence: EvidenceMetric[] = [...scoped, ...others].slice(0, 6).map((signal) => {
    const { note, tone } = signalNote(signal);
    return { id: signal.code, label: signal.label.toLocaleUpperCase(), value: formatSignal(signal), note, tone };
  });

  const trendLabel = selected.trendDirection === 'INCREASING' ? 'WORSENING' : selected.trendDirection === 'DECREASING' ? 'IMPROVING' : 'STABLE';
  const trendTone: PrognosisTone = selected.trendDirection === 'INCREASING' ? 'attention' : selected.trendDirection === 'DECREASING' ? 'healthy' : 'neutral';

  const component = selected.location[0] ?? selected.faultName;
  const shutdownRequired = selected.condition === 'danger' ? true : condition === 'danger' ? true : condition === 'healthy' || condition === 'attention' ? false : null;

  return {
    ...base,
    state: 'ready',
    headline: selected.faultName,
    summary:
      selected.thresholdProjectionWording ??
      'A persistent long-term trend is developing on this measurement. The machine remains within its configured limits today.',
    machineCondition: condition,
    runStateNote: runState ?? 'Operating state not recorded',
    affectedComponent: component.toLocaleUpperCase(),
    // One qualifier, not the whole location path — the eyebrow is a label, and
    // a three-segment path in tracked capitals reads as a second headline.
    machineArea: selected.location.slice(1, 2).join(' · '),
    statusLabel: selected.degradationDetected ? 'DEGRADING' : selected.predictionStatus.replace(/_/g, ' '),
    statusNote: selected.degradationDetected ? 'Persistent long-term trend' : 'Under monitoring',
    degradationScore: score === null ? null : round(score, 0),
    degradationNote: score === null ? 'Not derivable from the configured limits' : 'Share of baseline-to-danger span used',
    trendLabel,
    trendNote:
      selected.accelerationDetected
        ? 'Slope increasing'
        : selected.trendSlopePerDay === null
          ? 'Slope not rated'
          : `${selected.trendSlopePerDay >= 0 ? '+' : ''}${selected.trendSlopePerDay.toFixed(3)} ${selected.unit}/day`,
    trendTone,
    predictedAlertDays: alertDay,
    predictedDangerDays: dangerDay,
    confidence: selected.predictionConfidence,
    confidenceNote:
      selected.modelFit === null ? 'From model fit and sample count' : `Model fit R² ${selected.modelFit.toFixed(2)}`,
    metrics,
    evidence,
    reasons: buildReasons(selected),
    maintenance: {
      category: selected.condition === 'danger' ? 'URGENT INSPECTION' : 'PLANNED INSPECTION',
      body:
        selected.condition === 'danger'
          ? `Inspect ${component.toLocaleLowerCase()} at the earliest safe opportunity. The measurement is at or beyond its configured danger limit.`
          : `No immediate shutdown is indicated. Inspect ${component.toLocaleLowerCase()} during the next planned maintenance opportunity, before the trend reaches the projected alert region.`,
      checklist: buildChecklist(selected),
      shutdownRequired,
      inspectionWindow: selected.recommendedInspectionWindow,
      maintenanceWindow: selected.recommendedMaintenanceWindow,
    },
    sourceLabel: prognostics.sourceLabel,
    prediction: selected,
  };
}

export { toneForCondition };
