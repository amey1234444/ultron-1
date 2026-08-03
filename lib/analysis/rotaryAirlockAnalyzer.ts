export type AnalysisSignalCode =
  | 'motor_current'
  | 'rotor_speed'
  | 'de_bearing_temperature'
  | 'nde_bearing_temperature'
  | 'de_vibration_acceleration_rms'
  | 'nde_vibration_acceleration_rms'
  | 'inlet_pressure'
  | 'outlet_pressure'
  | 'material_temperature'
  | 'differential_pressure'
  | 'bearing_temperature_difference'
  | 'rpm_stability';

export type AnalysisReading = {
  code: AnalysisSignalCode;
  value: number | null;
  unit: string;
  quality?: string;
  valid?: boolean;
  timestamp: string;
  source?: 'gateway' | 'derived' | 'demo' | 'manual';
};

export type AnalysisHistoryPoint = AnalysisReading & {
  sequence?: number;
};

export type QualityStatus = 'GOOD' | 'DEGRADED' | 'BAD' | 'UNAVAILABLE';
export type OperatingState =
  | 'unknown'
  | 'stopped'
  | 'starting'
  | 'running_no_load'
  | 'running_normal_load'
  | 'running_high_load'
  | 'unstable'
  | 'stopping'
  | 'unexpectedly_stopped'
  | 'motor_running_rotor_stopped';

export type SignalQualityObservation = {
  code: AnalysisSignalCode;
  status: QualityStatus;
  checks: string[];
  limitations: string[];
  latestValue: number | null;
  unit: string;
};

export type BaselineProfile = {
  code: AnalysisSignalCode;
  available: boolean;
  maturity: 'unavailable' | 'immature' | 'learning' | 'mature';
  sampleCount: number;
  median: number | null;
  mad: number | null;
  limitations: string[];
};

export type AnomalyContributor = {
  code: AnalysisSignalCode;
  score: number;
  direction: 'high' | 'low' | 'normal';
  description: string;
};

export type AnomalyEpisode = {
  state: 'none' | 'candidate' | 'active' | 'recovering' | 'resolved';
  severity: 'none' | 'low' | 'medium' | 'high' | 'critical';
  score: number;
  contributors: AnomalyContributor[];
  limitations: string[];
};

export type DiagnosisCandidate = {
  code: 'MATERIAL_BLOCKAGE' | 'ROTOR_RUBBING_OR_CLEARANCE' | 'DE_BEARING_DETERIORATION' | 'MOTOR_OVERLOAD' | 'DRIVE_SLIP_OR_ROTOR_SPEED_LOSS';
  title: string;
  confidence: number;
  urgency: 'monitor' | 'inspect_soon' | 'inspect_promptly' | 'urgent';
  supporting: string[];
  contradicting: string[];
  limitations: string[];
  immediateAction: string;
  inspection: string[];
};

export type MaintenanceCaseSummary = {
  caseRequired: boolean;
  priority: 'none' | 'low' | 'medium' | 'high' | 'critical';
  title: string;
  recommendedActions: string[];
  verificationSteps: string[];
  similarCaseSignals: string[];
};

export type DoctorReport = {
  summary: string;
  safety: string[];
  whatChanged: string[];
  nextChecks: string[];
  caveats: string[];
};

export type PlantAnalysisSummary = {
  status: 'healthy' | 'watch' | 'attention' | 'critical';
  machineCount: number;
  activeIssues: number;
  highestUrgency: MaintenanceCaseSummary['priority'];
};

export type RotaryAirlockAnalysisResult = {
  model: 'rotary_airlock_valve';
  modelVersion: '1.0.0';
  generatedAt: string;
  readiness: {
    ready: boolean;
    score: number;
    missingEssential: AnalysisSignalCode[];
    missingDiagnostic: AnalysisSignalCode[];
    limitations: string[];
  };
  derived: AnalysisReading[];
  quality: SignalQualityObservation[];
  baselines: BaselineProfile[];
  operatingState: {
    state: OperatingState;
    confidence: number;
    supporting: string[];
    contradicting: string[];
    limitations: string[];
  };
  anomaly: AnomalyEpisode;
  diagnoses: DiagnosisCandidate[];
  maintenance: MaintenanceCaseSummary;
  doctorReport: DoctorReport;
  plantSummary: PlantAnalysisSummary;
};

const ESSENTIAL: AnalysisSignalCode[] = ['motor_current', 'rotor_speed', 'differential_pressure'];
const DIAGNOSTIC: AnalysisSignalCode[] = [
  'de_bearing_temperature',
  'nde_bearing_temperature',
  'de_vibration_acceleration_rms',
  'nde_vibration_acceleration_rms',
  'inlet_pressure',
  'outlet_pressure',
  'bearing_temperature_difference',
  'rpm_stability',
];

const QUALITY_STALE_AFTER_MS = 120_000;
const TARGET_RPM = 22.5;
const CURRENT = { stopped: 1, running: 3, noLoadMax: 9, normalMin: 9, normalMax: 20, high: 20 };
const DP = { noLoadMax: 0.2, normalMin: 0.2, normalMax: 0.6, high: 0.6 };

function finite(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function latest(readings: AnalysisReading[], code: AnalysisSignalCode): AnalysisReading | undefined {
  return readings
    .filter((reading) => reading.code === code)
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))[0];
}

function valueOf(readings: AnalysisReading[], code: AnalysisSignalCode): number | undefined {
  const reading = latest(readings, code);
  if (!reading || reading.valid === false || (reading.quality && reading.quality !== 'GOOD' && reading.quality !== 'DEGRADED')) return undefined;
  return finite(reading.value) ? reading.value : undefined;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function mad(values: number[], med: number | null): number | null {
  if (med === null || values.length === 0) return null;
  return median(values.map((value) => Math.abs(value - med)));
}

function robustDistance(value: number | undefined, baseline: BaselineProfile): number {
  if (!finite(value) || baseline.median === null || baseline.mad === null || baseline.mad === 0) return 0;
  return Math.abs(value - baseline.median) / (baseline.mad * 1.4826);
}

function direction(value: number | undefined, baseline: BaselineProfile): AnomalyContributor['direction'] {
  if (!finite(value) || baseline.median === null) return 'normal';
  return value > baseline.median ? 'high' : value < baseline.median ? 'low' : 'normal';
}

function makeDerived(readings: AnalysisReading[], now: string): AnalysisReading[] {
  const inlet = valueOf(readings, 'inlet_pressure');
  const outlet = valueOf(readings, 'outlet_pressure');
  const deTemp = valueOf(readings, 'de_bearing_temperature');
  const ndeTemp = valueOf(readings, 'nde_bearing_temperature');
  const rpm = valueOf(readings, 'rotor_speed');
  const derived: AnalysisReading[] = [];
  if (finite(inlet) && finite(outlet)) {
    derived.push({ code: 'differential_pressure', value: Math.abs(inlet - outlet), unit: latest(readings, 'inlet_pressure')?.unit || 'bar', quality: 'GOOD', valid: true, timestamp: now, source: 'derived' });
  }
  if (finite(deTemp) && finite(ndeTemp)) {
    derived.push({ code: 'bearing_temperature_difference', value: Math.abs(deTemp - ndeTemp), unit: latest(readings, 'de_bearing_temperature')?.unit || 'C', quality: 'GOOD', valid: true, timestamp: now, source: 'derived' });
  }
  if (finite(rpm)) {
    derived.push({ code: 'rpm_stability', value: Math.abs(rpm - TARGET_RPM) / TARGET_RPM, unit: 'ratio', quality: 'GOOD', valid: true, timestamp: now, source: 'derived' });
  }
  return derived;
}

function qualityFor(readings: AnalysisReading[], history: AnalysisHistoryPoint[], code: AnalysisSignalCode, nowMs: number): SignalQualityObservation {
  const reading = latest(readings, code);
  const checks: string[] = [];
  const limitations: string[] = [];
  if (!reading) {
    return { code, status: 'UNAVAILABLE', checks: ['MISSING_SAMPLES'], limitations: ['No current sample is available for this parameter.'], latestValue: null, unit: '' };
  }
  if (reading.valid === false) checks.push('SOURCE_QUALITY');
  if (reading.quality && reading.quality !== 'GOOD') checks.push('SOURCE_QUALITY');
  if (!finite(reading.value)) checks.push('FINITE_VALUE');
  if (nowMs - Date.parse(reading.timestamp) > QUALITY_STALE_AFTER_MS) checks.push('DATA_AGE');
  const values = history.filter((point) => point.code === code && finite(point.value)).slice(-8).map((point) => point.value as number);
  if (values.length >= 5 && new Set(values.map((value) => value.toFixed(6))).size === 1) checks.push('FLATLINE');
  if (values.length >= 2 && Math.abs(values[values.length - 1] - values[values.length - 2]) > Math.max(10, Math.abs(values[values.length - 2]) * 0.75)) checks.push('IMPOSSIBLE_JUMP');
  if (values.length < 3) limitations.push('Too few recent samples to assess noise, flatline, or continuity confidently.');
  const status: QualityStatus = checks.length >= 2 ? 'BAD' : checks.length === 1 ? 'DEGRADED' : 'GOOD';
  return { code, status, checks: checks.length > 0 ? checks : ['OK'], limitations, latestValue: reading.value, unit: reading.unit };
}

function baselinesFor(readings: AnalysisReading[], history: AnalysisHistoryPoint[]): BaselineProfile[] {
  const codes = Array.from(new Set([...readings.map((reading) => reading.code), ...ESSENTIAL, ...DIAGNOSTIC]));
  return codes.map((code) => {
    const values = history.filter((point) => point.code === code && finite(point.value) && point.valid !== false).map((point) => point.value as number);
    const med = median(values);
    const spread = mad(values, med);
    const maturity = values.length >= 60 ? 'mature' : values.length >= 20 ? 'learning' : values.length > 0 ? 'immature' : 'unavailable';
    return {
      code,
      available: med !== null && spread !== null && spread > 0,
      maturity,
      sampleCount: values.length,
      median: med,
      mad: spread,
      limitations: maturity === 'mature' ? [] : ['Baseline is not mature; anomaly scores are advisory.'],
    };
  });
}

function operatingStateFor(readings: AnalysisReading[]): RotaryAirlockAnalysisResult['operatingState'] {
  const current = valueOf(readings, 'motor_current');
  const rpm = valueOf(readings, 'rotor_speed');
  const dp = valueOf(readings, 'differential_pressure');
  const limitations = ['No authoritative motor run-command signal is available; state is inferred from speed/load evidence.'];
  if (!finite(current) || !finite(rpm)) {
    return { state: 'unknown', confidence: 0.35, supporting: [], contradicting: [], limitations: ['Rotor speed and motor current are required before classifying operating state.'] };
  }
  if (rpm <= 0.5 && current <= CURRENT.stopped) return { state: 'stopped', confidence: 0.82, supporting: ['Rotor speed and motor current are both near zero.'], contradicting: [], limitations };
  if (rpm <= 0.5 && current > CURRENT.running) return { state: 'motor_running_rotor_stopped', confidence: 0.82, supporting: ['Motor load is present while rotor speed is zero.'], contradicting: [], limitations: [...limitations, 'This can indicate jam, coupling failure, or speed-sensor fault; diagnosis is handled separately.'] };
  if (rpm < 5 && current > CURRENT.running) return { state: 'starting', confidence: 0.6, supporting: ['Rotor speed is below running threshold while current is present.'], contradicting: [], limitations };
  if (current <= CURRENT.noLoadMax && (!finite(dp) || dp <= DP.noLoadMax)) return { state: 'running_no_load', confidence: 0.74, supporting: ['Rotor is running with low motor current/process differential.'], contradicting: [], limitations };
  if (current >= CURRENT.high || (finite(dp) && dp >= DP.high)) return { state: 'running_high_load', confidence: 0.78, supporting: ['Motor current or differential pressure is in the high-load band.'], contradicting: [], limitations };
  return { state: 'running_normal_load', confidence: 0.76, supporting: ['Speed, current, and process load are within normal running bands.'], contradicting: [], limitations };
}

function anomalyFor(readings: AnalysisReading[], baselines: BaselineProfile[]): AnomalyEpisode {
  const contributors = baselines
    .map((baseline) => {
      const value = valueOf(readings, baseline.code);
      const score = robustDistance(value, baseline);
      return { code: baseline.code, score, direction: direction(value, baseline), description: `${baseline.code} moved ${score.toFixed(1)} robust deviations from baseline.` };
    })
    .filter((contributor) => contributor.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
  const score = contributors.reduce((sum, contributor) => sum + contributor.score, 0);
  const severity = score >= 18 ? 'critical' : score >= 12 ? 'high' : score >= 7 ? 'medium' : score >= 3 ? 'low' : 'none';
  const state = severity === 'none' ? 'none' : contributors.length >= 2 ? 'active' : 'candidate';
  return { state, severity, score: Math.round(score * 10) / 10, contributors, limitations: contributors.length === 0 ? ['No mature baseline departure is available.'] : [] };
}

function diagnosisFor(readings: AnalysisReading[], anomaly: AnomalyEpisode, operatingState: OperatingState): DiagnosisCandidate[] {
  const current = valueOf(readings, 'motor_current');
  const rpm = valueOf(readings, 'rotor_speed');
  const dp = valueOf(readings, 'differential_pressure');
  const deVib = valueOf(readings, 'de_vibration_acceleration_rms');
  const ndeVib = valueOf(readings, 'nde_vibration_acceleration_rms');
  const tempDelta = valueOf(readings, 'bearing_temperature_difference');
  const rpmStability = valueOf(readings, 'rpm_stability');
  const steady = operatingState === 'running_no_load' || operatingState === 'running_normal_load' || operatingState === 'running_high_load';
  const safety = ['Follow site lockout/tagout before any physical inspection.', 'Verify signal quality before replacing any component.', 'This ranking is not a confirmed fault.'];
  const candidates: DiagnosisCandidate[] = [];
  const add = (candidate: DiagnosisCandidate) => {
    if (steady) candidates.push(candidate);
  };
  if (finite(dp) && dp >= DP.high && finite(current) && current >= CURRENT.normalMin) {
    add({ code: 'MATERIAL_BLOCKAGE', title: 'Material blockage or restriction', confidence: rpm && rpm < TARGET_RPM * 0.92 ? 0.82 : 0.68, urgency: 'inspect_soon', supporting: ['Differential pressure is above normal.', 'Motor current is elevated.', ...(rpm && rpm < TARGET_RPM * 0.92 ? ['Rotor speed is below expected.'] : [])], contradicting: rpm && rpm >= TARGET_RPM * 0.92 ? ['Rotor speed is holding near expected, so restriction is not confirmed.'] : [], limitations: ['No material-flow sensor exists, so throughput is inferred.'], immediateAction: 'Reduce or divert feed if process allows; do not clear a restriction on a running machine.', inspection: ['Inspect inlet/outlet path for accumulation.', 'Check rotor pockets for packed material.', ...safety] });
  }
  if (finite(deVib) && finite(ndeVib) && deVib > 4 && ndeVib > 4) {
    add({ code: 'ROTOR_RUBBING_OR_CLEARANCE', title: 'Rotor rubbing or clearance issue', confidence: rpmStability && rpmStability > 0.08 ? 0.8 : 0.66, urgency: 'inspect_promptly', supporting: ['Both vibration channels are elevated.', ...(rpmStability && rpmStability > 0.08 ? ['RPM instability supports mechanical contact.'] : [])], contradicting: current && current < CURRENT.normalMin ? ['Motor current is not elevated.'] : [], limitations: ['Requires physical inspection to separate rubbing from structural looseness.'], immediateAction: 'Watch vibration and current closely; schedule prompt inspection.', inspection: ['Inspect rotor-to-housing clearance.', 'Check for scoring/witness marks.', ...safety] });
  }
  if (finite(deVib) && finite(ndeVib) && deVib - ndeVib >= 2 && finite(tempDelta) && tempDelta > 8) {
    add({ code: 'DE_BEARING_DETERIORATION', title: 'Drive-end bearing deterioration', confidence: 0.74, urgency: 'inspect_soon', supporting: ['Drive-end vibration exceeds non-drive-end vibration.', 'Bearing temperature difference is elevated.'], contradicting: deVib <= ndeVib ? ['NDE evidence is equally strong.'] : [], limitations: ['Bearing diagnosis needs local inspection and lubrication/history context.'], immediateAction: 'Schedule bearing inspection and review lubrication history.', inspection: ['Inspect DE bearing condition.', 'Check lubrication and housing temperature.', ...safety] });
  }
  if (finite(current) && current >= CURRENT.high) {
    add({ code: 'MOTOR_OVERLOAD', title: 'Motor overload', confidence: dp && dp < DP.high ? 0.7 : 0.62, urgency: current > 30 ? 'urgent' : 'inspect_soon', supporting: ['Motor current is in high-load band.'], contradicting: rpm && rpm < TARGET_RPM * 0.85 ? ['Rotor speed loss may indicate blockage/slip instead of pure overload.'] : [], limitations: ['Rated-current metadata is not available; measured current is used directly.'], immediateAction: 'Reduce load if process allows and monitor current trend.', inspection: ['Check feed rate/process load.', 'Verify drive electrical condition.', ...safety] });
  }
  if (finite(rpm) && rpm < TARGET_RPM * 0.85 && finite(current) && current > CURRENT.running && finite(dp) && dp < DP.high) {
    add({ code: 'DRIVE_SLIP_OR_ROTOR_SPEED_LOSS', title: 'Drive slip or rotor speed loss', confidence: 0.74, urgency: 'inspect_promptly', supporting: ['Rotor speed is below expected.', 'Motor current confirms the motor is not simply off.', 'Differential pressure does not lead a blockage pattern.'], contradicting: anomaly.severity === 'high' ? ['Broader anomaly may indicate another machine behavior.'] : [], limitations: ['Cannot separate belt/coupling slip from speed sensor fault without inspection.'], immediateAction: 'Prepare controlled shutdown inspection if speed loss persists.', inspection: ['Check coupling/belt/drive train.', 'Verify speed sensor pickup.', ...safety] });
  }
  return candidates.sort((a, b) => b.confidence - a.confidence).slice(0, 3);
}

function maintenanceFor(diagnoses: DiagnosisCandidate[], anomaly: AnomalyEpisode): MaintenanceCaseSummary {
  const top = diagnoses[0];
  if (!top && anomaly.severity === 'none') return { caseRequired: false, priority: 'none', title: 'No maintenance case required', recommendedActions: [], verificationSteps: [], similarCaseSignals: [] };
  const priority = top?.urgency === 'urgent' || anomaly.severity === 'critical' ? 'critical' : top?.urgency === 'inspect_promptly' || anomaly.severity === 'high' ? 'high' : top ? 'medium' : 'low';
  return {
    caseRequired: true,
    priority,
    title: top?.title ?? 'Investigate anomaly',
    recommendedActions: top?.inspection ?? ['Review signal quality and inspect the affected subsystem.'],
    verificationSteps: ['Confirm affected signals return to baseline after action.', 'Record technician finding and close only after evidence is normal.', 'Do not mark resolved only because an action was completed.'],
    similarCaseSignals: diagnoses.map((diagnosis) => diagnosis.code),
  };
}

function doctorFor(result: Omit<RotaryAirlockAnalysisResult, 'doctorReport' | 'plantSummary'>): DoctorReport {
  const top = result.diagnoses[0];
  return {
    summary: top ? `${top.title} is the leading probable condition at ${Math.round(top.confidence * 100)}% confidence.` : 'No dominant fault pattern is confirmed from current evidence.',
    safety: ['Follow site lockout/tagout procedures before physical inspection.', 'Confirm zero energy before opening guards or access panels.'],
    whatChanged: result.anomaly.contributors.map((contributor) => contributor.description),
    nextChecks: top?.inspection ?? ['Map all essential signals.', 'Verify signal quality.', 'Collect enough history for mature baselines.'],
    caveats: [...result.readiness.limitations, ...result.anomaly.limitations],
  };
}

export function analyzeRotaryAirlock(input: {
  readings: AnalysisReading[];
  history?: AnalysisHistoryPoint[];
  machineCount?: number;
  now?: string;
}): RotaryAirlockAnalysisResult {
  const now = input.now ?? new Date().toISOString();
  const derived = makeDerived(input.readings, now);
  const readings = [...input.readings, ...derived];
  const history = [...(input.history ?? []), ...derived.map((reading) => ({ ...reading } as AnalysisHistoryPoint))];
  const nowMs = Date.parse(now);
  const missingEssential = ESSENTIAL.filter((code) => valueOf(readings, code) === undefined);
  const missingDiagnostic = DIAGNOSTIC.filter((code) => valueOf(readings, code) === undefined);
  const quality = Array.from(new Set([...ESSENTIAL, ...DIAGNOSTIC, ...derived.map((reading) => reading.code)])).map((code) => qualityFor(readings, history, code, nowMs));
  const baselines = baselinesFor(readings, history);
  const operatingState = operatingStateFor(readings);
  const anomaly = anomalyFor(readings, baselines);
  const diagnoses = diagnosisFor(readings, anomaly, operatingState.state);
  const readinessScore = Math.max(0, Math.round(100 - missingEssential.length * 22 - missingDiagnostic.length * 6 - quality.filter((q) => q.status === 'BAD').length * 8));
  const readiness = {
    ready: missingEssential.length === 0,
    score: readinessScore,
    missingEssential,
    missingDiagnostic,
    limitations: [
      ...(missingEssential.length > 0 ? [`Missing essential evidence: ${missingEssential.join(', ')}.`] : []),
      ...(missingDiagnostic.length > 0 ? [`Missing diagnostic evidence: ${missingDiagnostic.join(', ')}.`] : []),
      ...quality.flatMap((q) => q.limitations),
    ],
  };
  const maintenance = maintenanceFor(diagnoses, anomaly);
  const partial = { model: 'rotary_airlock_valve' as const, modelVersion: '1.0.0' as const, generatedAt: now, readiness, derived, quality, baselines, operatingState, anomaly, diagnoses, maintenance };
  const plantSummary: PlantAnalysisSummary = {
    status: maintenance.priority === 'critical' ? 'critical' : maintenance.priority === 'high' || maintenance.priority === 'medium' ? 'attention' : readiness.score < 80 ? 'watch' : 'healthy',
    machineCount: input.machineCount ?? 1,
    activeIssues: maintenance.caseRequired ? 1 : 0,
    highestUrgency: maintenance.priority,
  };
  return { ...partial, doctorReport: doctorFor(partial), plantSummary };
}
