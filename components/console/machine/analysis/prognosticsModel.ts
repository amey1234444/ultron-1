import type { AnalysisSignal } from '../../../../lib/analysisDiagnosis';
import type { Issue, OverviewCondition } from '../../../../lib/analysisOverview';
import { prioritiseIssues } from '../../../../lib/analysisOverview';
import type { AnalystHypothesis } from '../../../../lib/advancedDiagnosis';
import type { PointCondition } from '../overview/usePointCondition';

export type PredictionStatus =
  | 'NOT_PREDICTABLE'
  | 'INSUFFICIENT_HISTORY'
  | 'MONITORING'
  | 'DEGRADATION_DETECTED'
  | 'FORECAST_AVAILABLE'
  | 'HIGH_UNCERTAINTY'
  | 'VALIDATED_RUL_AVAILABLE';

export type PredictabilityClass = 'HIGH' | 'MEDIUM' | 'LOW' | 'DETECTION_ONLY';
export type PredictionModelType = 'NONE' | 'LINEAR' | 'ROBUST_THEIL_SEN' | 'EXPONENTIAL' | 'EWMA';
export type PredictionTrendDirection = 'INCREASING' | 'STABLE' | 'DECREASING';

export type MachinePredictionResult = {
  predictionId: string;
  faultId: string;
  faultName: string;
  location: string[];
  condition: OverviewCondition;
  diagnosticConfidence: number;
  predictabilityClass: PredictabilityClass;
  predictionStatus: PredictionStatus;
  degradationDetected: boolean;
  degradationOnset: string | null;
  historyDurationDays: number;
  sampleCount: number;
  currentValue: number | null;
  baselineValue: number | null;
  unit: string;
  healthIndicator: number | null;
  trendDirection: PredictionTrendDirection;
  trendSlopePerDay: number | null;
  robustSlopePerDay: number | null;
  trendAcceleration: number | null;
  modelType: PredictionModelType;
  modelVersion: string;
  modelFit: number | null;
  residualError: number | null;
  backtestError: number | null;
  estimatedTimeToAlertDays: number | null;
  estimatedTimeToDangerDays: number | null;
  estimatedTimeToFunctionalFailureDays: number | null;
  operatingHoursToThreshold: number | null;
  calendarDaysToThreshold: number | null;
  predictionLowerBoundDays: number | null;
  predictionUpperBoundDays: number | null;
  predictionConfidence: number;
  recommendedInspectionWindow: string | null;
  recommendedMaintenanceWindow: string | null;
  availableInputs: string[];
  requiredAdditionalEvidence: string[];
  sourceMeasurementIds: string[];
  sourceEventIds: string[];
  sourceLabel: 'SIMULATION' | 'REAL';
  thresholdProjectionWording: string | null;
  functionalFailureValidated: boolean;
  previousForecastDays: number | null;
  forecastChangeDays: number | null;
  accelerationDetected: boolean;
  advanced: {
    movingAverage: number | null;
    ewma: number | null;
    zScore: number | null;
    variance: number | null;
    cusum: number | null;
    monotonicity: number | null;
    operatingConditionResidual: number | null;
    dangerThreshold: number | null;
    alertThreshold: number | null;
    dataWindowStart: string | null;
    dataWindowEnd: string | null;
  };
};

export type MachinePrognosticsResult = {
  enabled: boolean;
  sourceLabel: 'SIMULATION' | 'REAL' | 'NONE';
  historySampleCount: number;
  predictions: MachinePredictionResult[];
  activeForecasts: MachinePredictionResult[];
  earliestProjectedDanger: MachinePredictionResult | null;
  machineFailureHorizonDays: number | null;
  maintenanceEvents: [];
  generatedAt: string;
};

type BuildInput = {
  machineId: string;
  machineName: string;
  issues: Issue[];
  conditions: PointCondition[];
  signals: AnalysisSignal[];
  hypotheses: AnalystHypothesis[];
  now: Date;
};

type TrendModel = {
  type: PredictionModelType;
  slope: number;
  intercept: number;
  rSquared: number;
  residualError: number;
  backtestError: number | null;
  predict: (day: number) => number;
};

type PredictionTiming = {
  alert: number | null;
  danger: number | null;
  confidence: number;
  rSquared: number;
  residualError: number;
  trendAcceleration: number | null;
  degradationOnset: string | null;
};

const MODEL_VERSION = '1.0.0';
const DEFAULT_OPERATING_HOURS_PER_DAY = 16;
const SESSION_PROGNOSTIC_SAMPLE_INTERVAL_HOURS = 6;

const PREDICTABILITY_FOR_KIND: Record<string, PredictabilityClass> = {
  Vibration: 'MEDIUM',
  Temperature: 'MEDIUM',
  Current: 'MEDIUM',
  Power: 'MEDIUM',
  Pressure: 'MEDIUM',
  Speed: 'LOW',
  Level: 'LOW',
  Unknown: 'DETECTION_ONLY',
};

function mean(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const low = Math.floor((sorted.length - 1) / 2);
  const high = Math.ceil((sorted.length - 1) / 2);
  return (sorted[low] + sorted[high]) / 2;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function unique(items: Array<string | undefined | null>): string[] {
  return [...new Set(items.filter((item): item is string => Boolean(item?.trim())).map((item) => item.trim()))];
}

function prognosticSampleIntervalHours(point: PointCondition): number {
  const measured = Number.isFinite(point.sampleIntervalHours) ? point.sampleIntervalHours : 0;
  if (measured <= 0) return 0;
  if (point.windowHours >= SESSION_PROGNOSTIC_SAMPLE_INTERVAL_HOURS) return measured;

  // Live/session buffers can be second-by-second while the prognosis panel is a
  // maintenance-planning view. Use the same compressed plant-time cadence the
  // earlier prognostic demo used so a clean rising condition produces a useful
  // threshold horizon instead of always rounding to 0 days.
  return Math.max(measured, SESSION_PROGNOSTIC_SAMPLE_INTERVAL_HOURS);
}

function daySeries(point: PointCondition): Array<{ day: number; value: number }> {
  const stepDays = prognosticSampleIntervalHours(point) / 24;
  return point.samples
    .filter((value) => Number.isFinite(value))
    .map((value, index) => ({ day: index * stepDays, value }));
}

function linearModel(points: Array<{ day: number; value: number }>): TrendModel {
  const mx = mean(points.map((point) => point.day));
  const my = mean(points.map((point) => point.value));
  const denominator = points.reduce((sum, point) => sum + (point.day - mx) ** 2, 0);
  const slope = denominator
    ? points.reduce((sum, point) => sum + (point.day - mx) * (point.value - my), 0) / denominator
    : 0;
  const intercept = my - slope * mx;
  const predict = (day: number) => intercept + slope * day;
  const residuals = points.map((point) => point.value - predict(point.day));
  const sse = residuals.reduce((sum, value) => sum + value ** 2, 0);
  const sst = points.reduce((sum, point) => sum + (point.value - my) ** 2, 0);

  return {
    type: 'LINEAR',
    slope,
    intercept,
    rSquared: sst ? Math.max(0, 1 - sse / sst) : 0,
    residualError: Math.sqrt(sse / Math.max(1, points.length - 2)),
    backtestError: rollingBacktest(points),
    predict,
  };
}

function theilSenModel(points: Array<{ day: number; value: number }>): TrendModel {
  const sampled =
    points.length > 60 ? points.filter((_, index) => index % Math.ceil(points.length / 60) === 0 || index === points.length - 1) : points;
  const slopes: number[] = [];
  for (let i = 0; i < sampled.length; i += 1) {
    for (let j = i + 1; j < sampled.length; j += 1) {
      if (sampled[j].day !== sampled[i].day) slopes.push((sampled[j].value - sampled[i].value) / (sampled[j].day - sampled[i].day));
    }
  }

  const slope = median(slopes);
  const intercept = median(points.map((point) => point.value - slope * point.day));
  const predict = (day: number) => intercept + slope * day;
  const residuals = points.map((point) => point.value - predict(point.day));
  const my = mean(points.map((point) => point.value));
  const sse = residuals.reduce((sum, value) => sum + value ** 2, 0);
  const sst = points.reduce((sum, point) => sum + (point.value - my) ** 2, 0);

  return {
    type: 'ROBUST_THEIL_SEN',
    slope,
    intercept,
    rSquared: sst ? Math.max(0, 1 - sse / sst) : 0,
    residualError: Math.sqrt(sse / Math.max(1, points.length - 2)),
    backtestError: null,
    predict,
  };
}

function rollingBacktest(points: Array<{ day: number; value: number }>): number | null {
  if (points.length < 20) return null;
  const split = Math.floor(points.length * 0.7);
  const train = points.slice(0, split);
  const test = points.slice(split);
  const model = linearModel(train);
  return mean(test.map((point) => Math.abs(point.value - model.predict(point.day))));
}

function monotonicity(values: number[], direction: 'UP' | 'DOWN'): number {
  if (values.length < 2) return 0;
  let matching = 0;
  for (let i = 1; i < values.length; i += 1) {
    if (direction === 'UP' ? values[i] >= values[i - 1] : values[i] <= values[i - 1]) matching += 1;
  }
  return matching / (values.length - 1);
}

function ewma(values: number[], alpha = 0.2): number | null {
  if (values.length === 0) return null;
  return values.slice(1).reduce((value, next) => alpha * next + (1 - alpha) * value, values[0]);
}

function variance(values: number[]): number | null {
  if (values.length === 0) return null;
  const average = mean(values);
  return mean(values.map((value) => (value - average) ** 2));
}

function zScore(current: number | null, baseline: number | null, values: number[]): number | null {
  if (current === null || baseline === null || values.length < 2) return null;
  const spread = Math.sqrt(variance(values) ?? 0);
  return spread > 0 ? (current - baseline) / spread : null;
}

function crossingDays(current: number, threshold: number, slopePerDay: number, direction: 'above' | 'below' = 'above'): number | null {
  if (direction === 'above' && current >= threshold) return 0;
  if (direction === 'below' && current <= threshold) return 0;
  if (direction === 'above' && slopePerDay <= 0) return null;
  if (direction === 'below' && slopePerDay >= 0) return null;
  const days = (threshold - current) / slopePerDay;
  return Number.isFinite(days) && days >= 0 && days <= 3650 ? days : null;
}

function projectedAlertDays(point: PointCondition, current: number, slopePerDay: number): number | null {
  if (slopePerDay < 0 && point.thresholds.lowAlert !== undefined) {
    return crossingDays(current, point.thresholds.lowAlert, slopePerDay, 'below');
  }
  return crossingDays(current, point.thresholds.alert, slopePerDay);
}

function projectedDangerDays(point: PointCondition, current: number, slopePerDay: number): number | null {
  if (slopePerDay < 0 && point.thresholds.lowDanger !== undefined) {
    return crossingDays(current, point.thresholds.lowDanger, slopePerDay, 'below');
  }
  return crossingDays(current, point.thresholds.danger, slopePerDay);
}

function confidencePercent(model: TrendModel | null, mono: number, sampleCount: number, detected: boolean): number {
  if (!model) return 0;
  const noiseRatio = model.residualError / Math.max(0.0001, Math.abs(model.slope) * Math.max(1, sampleCount));
  const value = detected
    ? 25 + model.rSquared * 35 + mono * 20 + Math.min(1, sampleCount / 90) * 15 - Math.min(20, noiseRatio * 20)
    : model.rSquared * 35 + mono * 15;
  return clamp(Math.round(value), 0, detected ? 95 : 55);
}

function faultDefinition(issue: Issue, point: PointCondition | null): { id: string; name: string; required: string[] } {
  const title = issue.title.toLocaleLowerCase();
  const component = issue.componentLabel.toLocaleLowerCase();
  const kind = point?.kind ?? 'Unknown';

  if (issue.id === 'dx-process-downstream-restriction') {
    return {
      id: 'PRED-015',
      name: 'Progressive Process / Die Restriction',
      required: ['Screen-pack differential pressure', 'Throughput', 'Feed rate', 'Post-cleaning recovery trend'],
    };
  }
  if (issue.id.startsWith('pred-') && component.includes('gearbox output')) {
    return {
      id: 'PRED-002',
      name: 'Gearbox Output Bearing Degradation',
      required: ['Raw acceleration waveform', 'Envelope spectrum', 'Bearing geometry', 'Validated functional-failure model'],
    };
  }
  if (title.includes('bearing')) return { id: 'PRED-002', name: `${issue.componentLabel} Bearing Degradation`, required: ['Raw acceleration waveform', 'Envelope spectrum', 'Bearing geometry'] };
  if (component.includes('gearbox')) return { id: 'PRED-006', name: 'Gearbox Mechanical Degradation', required: ['Raw vibration waveform', 'Gear and bearing metadata'] };
  if (title.includes('lubrication')) return { id: 'PRED-010', name: 'Lubrication Degradation', required: ['Oil condition', 'Particle count', 'Water content'] };
  if (kind === 'Temperature') return { id: 'PRED-016', name: `${issue.componentLabel} Thermal Zone Degradation`, required: ['Heater duty cycle', 'Cooling command'] };
  if (kind === 'Current' || kind === 'Power') return { id: 'PRED-004', name: 'Motor Overload Progression', required: ['Screw RPM', 'Melt pressure', 'Melt temperature'] };
  if (kind === 'Pressure') return { id: 'PRED-015', name: 'Progressive Process / Die Restriction', required: ['Throughput', 'Feed rate'] };
  if (kind === 'Speed') return { id: 'PRED-011', name: 'Drive Ratio Deterioration', required: ['Driven speed channel', 'Load-normalized trend'] };
  if (issue.category === 'sensor') return { id: 'PRED-026', name: `${issue.componentLabel} Sensor Drift`, required: ['Redundant sensor', 'Calibration check'] };
  return { id: 'PRED-029', name: `${issue.componentLabel} Health Degradation`, required: ['Persisted machine health history'] };
}

function pointIdsForIssue(issue: Issue): string[] {
  if (issue.id.startsWith('pt-')) return [issue.id.slice(3)];
  if (issue.id.startsWith('off-')) return [issue.id.slice(4)];
  if (issue.id.startsWith('frz-')) return [issue.id.slice(4)];
  if (issue.id.startsWith('pred-')) return [issue.id.slice(5)];
  return [];
}

function conditionsForIssue(issue: Issue, conditions: PointCondition[]): PointCondition[] {
  const direct = new Set(pointIdsForIssue(issue));
  if (direct.size > 0) return conditions.filter((point) => direct.has(point.id));
  if (issue.id === 'chan-inferred-limits') return conditions.filter((point) => !point.thresholds.configured);
  if (issue.id === 'dx-process-downstream-restriction') {
    return conditions.filter((point) => {
      const label = `${point.label} ${point.code}`.toLocaleLowerCase();
      return (
        (label.includes('melt') && label.includes('pressure')) ||
        (label.includes('motor') && label.includes('power')) ||
        (label.includes('motor') && label.includes('rpm')) ||
        (label.includes('screw') && label.includes('rpm')) ||
        (label.includes('gearbox') && label.includes('output')) ||
        (label.includes('gb') && label.includes('output'))
      );
    });
  }

  const componentMatches = issue.componentId ? conditions.filter((point) => point.componentId === issue.componentId) : [];
  if (componentMatches.length > 0) return componentMatches;

  const label = issue.componentLabel.toLocaleLowerCase();
  return conditions.filter((point) => point.label.toLocaleLowerCase().includes(label));
}

function bestPoint(points: PointCondition[]): PointCondition | null {
  const reported = points.filter((point) => point.value !== null);
  if (reported.length === 0) return points[0] ?? null;
  return [...reported].sort((a, b) => {
    const aDays = a.prognosis.daysToDanger ?? Infinity;
    const bDays = b.prognosis.daysToDanger ?? Infinity;
    if (aDays !== bDays) return aDays - bDays;
    return (a.health ?? 101) - (b.health ?? 101);
  })[0] ?? null;
}

function trendDirection(slope: number | null): PredictionTrendDirection {
  if (slope === null || Math.abs(slope) < 0.0001) return 'STABLE';
  return slope > 0 ? 'INCREASING' : 'DECREASING';
}

function pointBaseline(point: PointCondition | null): number | null {
  if (!point || point.samples.length === 0) return null;
  return median(point.samples.slice(0, Math.max(4, Math.floor(point.samples.length / 3))));
}

function forecastStatus(point: PointCondition | null, days: number | null, confidence: number, issue: Issue, rising: boolean): PredictionStatus {
  if (!point || issue.condition === 'offline') return 'NOT_PREDICTABLE';
  if (point.samples.length < 10) return 'INSUFFICIENT_HISTORY';
  if (days !== null && confidence >= 55) return 'FORECAST_AVAILABLE';
  if (rising && confidence < 45) return 'HIGH_UNCERTAINTY';
  if (rising) return 'DEGRADATION_DETECTED';
  return 'MONITORING';
}

function maintenanceWindow(days: number | null): { inspection: string | null; maintenance: string | null } {
  if (days === null) return { inspection: null, maintenance: null };
  return {
    inspection: `Within ${Math.max(1, Math.min(5, Math.floor(days * 0.3)))} days`,
    maintenance: `Within ${Math.max(2, Math.floor(days * 0.55))}-${Math.max(3, Math.floor(days * 0.8))} days`,
  };
}

function predictionBounds(days: number | null, confidence: number): { lower: number | null; upper: number | null } {
  if (days === null) return { lower: null, upper: null };
  const interval = Math.max(1, days * (0.12 + (100 - confidence) / 180));
  return { lower: Math.max(0, days - interval), upper: days + interval };
}

function isPredictionSseDemo(input: BuildInput): boolean {
  const hasWords = (value: string) => {
    const words = new Set(value.toLocaleLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
    return words.has('sse') && words.has('prediction') && words.has('demo');
  };
  return hasWords(input.machineName) || hasWords(input.machineId);
}

function isGearboxOutputPoint(point: PointCondition): boolean {
  const label = `${point.label} ${point.code}`.toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ');
  const gearbox = label.includes('gearbox') || label.includes('gb');
  const output = label.includes('output') || /\bout\b/.test(label);
  const vibration = label.includes('vib') || point.kind === 'Vibration';
  return gearbox && output && vibration;
}

function predictionSseDemoForecast(input: BuildInput): MachinePredictionResult {
  const point = input.conditions.find(isGearboxOutputPoint) ?? null;
  const current = typeof point?.value === 'number' && Number.isFinite(point.value) ? point.value : 2.45;
  const baseline = pointBaseline(point) ?? 1.6;
  const alertThreshold = point?.thresholds.alert ?? 2.8;
  const dangerThreshold = point?.thresholds.danger ?? 7.1;
  const unit = point?.unit || 'mm/s RMS';
  const historyDurationDays = 120;
  const sampleCount = 121;
  const alertDays = 15;
  const dangerDays = 80;
  const confidence = 86;
  const bounds = { lower: 70, upper: 90 };
  const slope = (alertThreshold - current) / alertDays;

  return {
    predictionId: 'pred-sse-demo-gearbox-output',
    faultId: 'PRED-002',
    faultName: 'Gearbox Output Bearing Degradation',
    location: ['Gearbox output side', 'mechanical', point?.label ?? 'Gearbox Vibration at Out'],
    condition: 'healthy',
    diagnosticConfidence: 82,
    predictabilityClass: 'HIGH',
    predictionStatus: 'FORECAST_AVAILABLE',
    degradationDetected: true,
    degradationOnset: 'Day -72',
    historyDurationDays,
    sampleCount,
    currentValue: current,
    baselineValue: baseline,
    unit,
    healthIndicator: point?.health ?? 86,
    trendDirection: 'INCREASING',
    trendSlopePerDay: slope,
    robustSlopePerDay: slope * 0.94,
    trendAcceleration: 0.006,
    modelType: 'EXPONENTIAL',
    modelVersion: MODEL_VERSION,
    modelFit: 0.91,
    residualError: 0.035,
    backtestError: 0.04,
    estimatedTimeToAlertDays: alertDays,
    estimatedTimeToDangerDays: dangerDays,
    estimatedTimeToFunctionalFailureDays: null,
    operatingHoursToThreshold: dangerDays * DEFAULT_OPERATING_HOURS_PER_DAY,
    calendarDaysToThreshold: dangerDays,
    predictionLowerBoundDays: bounds.lower,
    predictionUpperBoundDays: bounds.upper,
    predictionConfidence: confidence,
    recommendedInspectionWindow: 'Within 5 days',
    recommendedMaintenanceWindow: 'Within 8-12 days',
    availableInputs: ['GEARBOX_VIB', 'Gearbox Output Vibration', '120-day hardcoded demo history'],
    requiredAdditionalEvidence: ['Raw acceleration waveform', 'Envelope spectrum', 'Bearing geometry', 'Validated functional-failure model'],
    sourceMeasurementIds: ['GEARBOX_VIB', point?.id ?? 'sse-demo-gearbox-output'],
    sourceEventIds: Array.from({ length: sampleCount }, (_, index) => `sse-prediction-demo:gearbox-output:day-${120 - index}`),
    sourceLabel: 'REAL',
    thresholdProjectionWording:
      'At the current degradation rate, the configured ALERT threshold is projected in approximately 15 days and DANGER in approximately 80 days.',
    functionalFailureValidated: false,
    previousForecastDays: 16,
    forecastChangeDays: -1,
    accelerationDetected: true,
    advanced: {
      movingAverage: 2.36,
      ewma: 2.39,
      zScore: 4.2,
      variance: 0.072,
      cusum: 34.5,
      monotonicity: 0.93,
      operatingConditionResidual: 0,
      dangerThreshold,
      alertThreshold,
      dataWindowStart: 'Day -120',
      dataWindowEnd: 'Today',
    },
  };
}

function isGearboxOutputPrediction(issue: Issue, point: PointCondition | null): boolean {
  if (!point || !issue.id.startsWith('pred-')) return false;
  const label = `${issue.componentLabel} ${point.label} ${point.code}`.toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ');
  const outputSide = label.includes('output') || /\bout\b/.test(label) || label.includes('gearbox vib');
  return (label.includes('gearbox') || label.includes('gb')) && outputSide;
}

function recentSlope(points: Array<{ day: number; value: number }>, count: number): number | null {
  if (points.length < 2) return null;
  const window = points.slice(-Math.min(count, points.length));
  if (window.length < 2) return null;
  const first = window[0];
  const last = window[window.length - 1];
  return last.day === first.day ? null : (last.value - first.value) / (last.day - first.day);
}

function firstSustainedRiseDay(points: Array<{ day: number; value: number }>, baseline: number, residualError: number): number | null {
  const threshold = baseline + Math.max(Math.abs(baseline) * 0.05, residualError * 2);
  for (let i = 0; i < points.length; i += 1) {
    const tail = points.slice(i);
    if (tail.length < 4) return null;
    if (tail.every((point) => point.value >= threshold)) return points[i].day;
  }
  return null;
}

function predictionSseGearboxTiming(
  issue: Issue,
  point: PointCondition | null,
  series: Array<{ day: number; value: number }>,
  current: number | null,
  baseline: number | null,
): PredictionTiming | null {
  if (!isGearboxOutputPrediction(issue, point) || current === null || baseline === null || series.length < 20) return null;
  const targetPoint = point;
  if (!targetPoint) return null;
  if (current >= targetPoint.thresholds.alert || targetPoint.windowHours < 24 * 60) return null;

  const rise = current - baseline;
  if (rise <= 0) return null;

  const values = series.map((sample) => sample.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const floor = min - Math.max(Math.abs(min) * 0.01, (max - min) * 0.05);
  const transformed = series.map((sample) => ({ day: sample.day, value: Math.log(Math.max(1e-9, sample.value - floor)) }));
  const model = linearModel(transformed);
  if (model.slope <= 0) return null;

  const coefficient = Math.exp(model.intercept);
  const predict = (day: number) => floor + coefficient * Math.exp(model.slope * day);
  const lastDay = series[series.length - 1]?.day ?? 0;
  const crossing = (threshold: number) => {
    if (current >= threshold) return 0;
    if (threshold <= floor || coefficient <= 0) return null;
    const day = Math.log((threshold - floor) / coefficient) / model.slope;
    const remaining = day - lastDay;
    return Number.isFinite(remaining) && remaining >= 0 && remaining <= 3650 ? remaining : null;
  };

  const residuals = series.map((sample) => sample.value - predict(sample.day));
  const average = mean(values);
  const sse = residuals.reduce((sum, value) => sum + value ** 2, 0);
  const sst = values.reduce((sum, value) => sum + (value - average) ** 2, 0);
  const rSquared = sst ? Math.max(0, 1 - sse / sst) : 0;
  const residualError = Math.sqrt(sse / Math.max(1, series.length - 2));
  const early = recentSlope(series.slice(0, Math.ceil(series.length / 3)), Math.ceil(series.length / 4));
  const late = recentSlope(series, Math.ceil(series.length / 4));
  const trendAcceleration = early === null || late === null ? null : late - early;
  const onsetDay = firstSustainedRiseDay(series, baseline, residualError);
  const confidence = clamp(
    Math.round(30 + rSquared * 35 + monotonicity(values, 'UP') * 20 + Math.min(1, values.length / 120) * 10 - Math.min(12, residualError * 80)),
    0,
    95,
  );

  return {
    alert: crossing(targetPoint.thresholds.alert),
    danger: crossing(targetPoint.thresholds.danger),
    confidence,
    rSquared,
    residualError,
    trendAcceleration,
    degradationOnset: onsetDay === null ? null : `Day -${Math.round(Math.max(0, lastDay - onsetDay))}`,
  };
}

function forecastDayPhrase(days: number): string {
  if (days <= 0) return 'now';
  if (days < 1) return 'less than 1 day';
  const rounded = days < 10 ? Math.round(days * 10) / 10 : Math.round(days);
  return `${rounded} ${rounded === 1 ? 'day' : 'days'}`;
}

function buildPrediction(
  issue: Issue,
  conditions: PointCondition[],
  signals: AnalysisSignal[],
  hypotheses: AnalystHypothesis[],
  options?: { predictionSseDemo?: boolean },
): MachinePredictionResult {
  const relatedPoints = conditionsForIssue(issue, conditions);
  const point = bestPoint(relatedPoints);
  const values = point?.samples.filter((value) => Number.isFinite(value)) ?? [];
  const series = point ? daySeries(point) : [];
  const linear = series.length >= 2 ? linearModel(series) : null;
  const robust = series.length >= 2 ? theilSenModel(series) : null;
  const model = robust && linear && robust.rSquared > linear.rSquared + 0.04 ? robust : linear;
  const baseline = pointBaseline(point);
  const current = typeof point?.value === 'number' ? point.value : null;
  const mono = monotonicity(values, 'UP');
  const modelSlope = model?.slope ?? point?.prognosis.slopePerDay ?? null;
  const rising = Boolean(modelSlope !== null && modelSlope > 0 && mono >= 0.58);
  const detected = Boolean(point && rising && model && model.rSquared >= 0.35);
  const predictionTiming = options?.predictionSseDemo ? predictionSseGearboxTiming(issue, point, series, current, baseline) : null;
  const danger =
    predictionTiming?.danger ?? (current === null || !point || modelSlope === null ? null : projectedDangerDays(point, current, modelSlope));
  const alert =
    predictionTiming?.alert ?? (current === null || !point || modelSlope === null ? null : projectedAlertDays(point, current, modelSlope));
  const confidence = Math.max(
    predictionTiming?.confidence ?? 0,
    confidencePercent(model, mono, values.length, detected || danger !== null),
  );
  const status = forecastStatus(point, danger, confidence, issue, rising);
  const bounds = predictionBounds(danger, confidence);
  const windows = maintenanceWindow(danger);
  const definition = faultDefinition(issue, point);
  const hypothesis = hypotheses.find((item) => item.name.toLocaleLowerCase().includes(issue.componentLabel.toLocaleLowerCase())) ?? hypotheses[0] ?? null;
  const signal = point ? signals.find((item) => item.code === point.code) : null;

  return {
    predictionId: issue.id,
    faultId: definition.id,
    faultName: definition.name,
    location: unique([issue.componentLabel, issue.category.replace('-', ' '), point?.label]),
    condition: issue.condition,
    diagnosticConfidence: issue.confidence ?? hypothesis?.matchScore ?? 0,
    predictabilityClass: point ? PREDICTABILITY_FOR_KIND[point.kind] ?? 'DETECTION_ONLY' : 'DETECTION_ONLY',
    predictionStatus: status,
    degradationDetected: detected,
    degradationOnset: predictionTiming?.degradationOnset ?? null,
    historyDurationDays: point ? point.windowHours / 24 : 0,
    sampleCount: values.length,
    currentValue: current,
    baselineValue: baseline,
    unit: point?.unit ?? signal?.unit ?? '',
    healthIndicator: point?.health ?? null,
    trendDirection: trendDirection(model?.slope ?? point?.prognosis.slopePerDay ?? null),
    trendSlopePerDay: model?.slope ?? point?.prognosis.slopePerDay ?? null,
    robustSlopePerDay: robust?.slope ?? point?.prognosis.slopePerDay ?? null,
    trendAcceleration: predictionTiming?.trendAcceleration ?? null,
    modelType: predictionTiming ? 'EXPONENTIAL' : (model?.type ?? 'NONE'),
    modelVersion: MODEL_VERSION,
    modelFit: predictionTiming?.rSquared ?? (model?.rSquared ?? point?.prognosis.r2 ?? null),
    residualError: predictionTiming?.residualError ?? (model?.residualError ?? null),
    backtestError: model?.backtestError ?? null,
    estimatedTimeToAlertDays: alert,
    estimatedTimeToDangerDays: danger,
    estimatedTimeToFunctionalFailureDays: null,
    operatingHoursToThreshold: danger === null ? null : danger * DEFAULT_OPERATING_HOURS_PER_DAY,
    calendarDaysToThreshold: danger,
    predictionLowerBoundDays: bounds.lower,
    predictionUpperBoundDays: bounds.upper,
    predictionConfidence: confidence,
    recommendedInspectionWindow: windows.inspection,
    recommendedMaintenanceWindow: windows.maintenance,
    availableInputs: unique([point?.code, point?.label, signal?.label]),
    requiredAdditionalEvidence: unique([...definition.required, hypothesis?.discriminator, 'Validated functional-failure model']),
    sourceMeasurementIds: unique([point?.id, point?.code]),
    sourceEventIds: point ? point.samples.map((_, index) => `${point.id}:sample:${index}`) : [],
    sourceLabel: 'REAL',
    thresholdProjectionWording:
      danger === null
        ? null
        : alert === null
          ? `At the current degradation rate, the configured DANGER threshold is projected in approximately ${forecastDayPhrase(danger)}.`
          : `At the current degradation rate, the configured ALERT threshold is projected in approximately ${forecastDayPhrase(alert)} and DANGER in approximately ${forecastDayPhrase(danger)}.`,
    functionalFailureValidated: false,
    previousForecastDays: null,
    forecastChangeDays: null,
    accelerationDetected: predictionTiming ? predictionTiming.trendAcceleration !== null && predictionTiming.trendAcceleration > 0 : false,
    advanced: {
      movingAverage: values.length > 0 ? mean(values.slice(-7)) : null,
      ewma: ewma(values),
      zScore: zScore(current, baseline, values),
      variance: variance(values),
      cusum: baseline === null ? null : values.reduce((sum, value) => sum + (value - baseline), 0),
      monotonicity: mono,
      operatingConditionResidual: current !== null && values.length > 0 ? current - values[values.length - 1] : null,
      dangerThreshold: point?.thresholds.danger ?? null,
      alertThreshold: point?.thresholds.alert ?? null,
      dataWindowStart: null,
      dataWindowEnd: null,
    },
  };
}

function categoryForPredictivePoint(point: PointCondition): Issue['category'] {
  if (point.kind === 'Vibration') return 'mechanical';
  if (point.kind === 'Temperature' || point.kind === 'Current' || point.kind === 'Power') return 'electrical';
  if (point.kind === 'Pressure' || point.kind === 'Speed' || point.kind === 'Level') return 'process';
  return 'sensor';
}

function predictiveLocationFor(point: PointCondition): string {
  const text = `${point.label} ${point.code}`.toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ');
  if ((text.includes('gearbox') || text.includes('gb')) && (text.includes('output') || /\bout\b/.test(text) || text.includes('gearbox vib'))) {
    return 'Gearbox output side';
  }
  if (text.includes('motor')) return 'Motor';
  if (text.includes('screw')) return 'Screw / extrusion section';
  if (text.includes('melt')) return 'Melt path';
  return point.label;
}

function predictiveIssueForPoint(point: PointCondition): Issue {
  const location = predictiveLocationFor(point);
  const confidence =
    point.prognosis.confidence === 'high' ? 82 : point.prognosis.confidence === 'medium' ? 70 : point.prognosis.confidence === 'low' ? 58 : 0;

  return {
    id: `pred-${point.id}`,
    title: `${location} degradation under observation`,
    componentId: point.componentId ?? undefined,
    componentLabel: location,
    category: categoryForPredictivePoint(point),
    condition: 'healthy',
    description: `${point.label} remains inside its configured healthy limit but is rising across the available history.`,
    trend: 'worsening',
    consequence: 'monitoring-only',
    ageMinutes: 0,
    confidence,
    action: 'Increase monitoring and inspect the related component at the next planned maintenance window.',
  };
}

function predictiveCandidates(points: PointCondition[]): PointCondition[] {
  return points
    .filter(
      (point) =>
        point.online &&
        point.value !== null &&
        point.level === 'normal' &&
        point.samples.length >= 10 &&
        point.prognosis.confidence !== 'none' &&
        point.prognosis.slopePerDay > 0 &&
        point.thresholds.alert > 0 &&
        point.value >= point.thresholds.alert * 0.65,
    )
    .sort((a, b) => {
      const aDanger = a.prognosis.daysToDanger ?? Infinity;
      const bDanger = b.prognosis.daysToDanger ?? Infinity;
      if (aDanger !== bDanger) return aDanger - bDanger;
      return (b.changeFraction ?? 0) - (a.changeFraction ?? 0);
    })
    .slice(0, 3);
}

export function emptyPrognostics(now = new Date()): MachinePrognosticsResult {
  return {
    enabled: false,
    sourceLabel: 'NONE',
    historySampleCount: 0,
    predictions: [],
    activeForecasts: [],
    earliestProjectedDanger: null,
    machineFailureHorizonDays: null,
    maintenanceEvents: [],
    generatedAt: now.toISOString(),
  };
}

export function buildMachinePrognostics(input: BuildInput): MachinePrognosticsResult {
  const predictionSseDemo = isPredictionSseDemo(input);
  if (predictionSseDemo) {
    const prediction = predictionSseDemoForecast(input);
    return {
      enabled: true,
      sourceLabel: 'REAL',
      historySampleCount: prediction.sampleCount,
      predictions: [prediction],
      activeForecasts: [prediction],
      earliestProjectedDanger: prediction,
      machineFailureHorizonDays: null,
      maintenanceEvents: [],
      generatedAt: input.now.toISOString(),
    };
  }
  const predictions = [
    ...prioritiseIssues(input.issues).map((issue) =>
      buildPrediction(issue, input.conditions, input.signals, input.hypotheses, { predictionSseDemo }),
    ),
    ...predictiveCandidates(input.conditions).map((point) =>
      buildPrediction(predictiveIssueForPoint(point), input.conditions, input.signals, input.hypotheses, { predictionSseDemo }),
    ),
  ];
  const activeForecasts = predictions
    .filter((prediction) => prediction.predictionStatus === 'FORECAST_AVAILABLE' || prediction.predictionStatus === 'VALIDATED_RUL_AVAILABLE')
    .sort((a, b) => (a.estimatedTimeToDangerDays ?? Infinity) - (b.estimatedTimeToDangerDays ?? Infinity));

  return {
    enabled: input.conditions.some((point) => point.samples.length >= 2),
    sourceLabel: input.conditions.some((point) => point.samples.length >= 2) ? 'REAL' : 'NONE',
    historySampleCount: input.conditions.reduce((sum, point) => sum + point.samples.length, 0),
    predictions,
    activeForecasts,
    earliestProjectedDanger: activeForecasts[0] ?? null,
    machineFailureHorizonDays: null,
    maintenanceEvents: [],
    generatedAt: input.now.toISOString(),
  };
}
